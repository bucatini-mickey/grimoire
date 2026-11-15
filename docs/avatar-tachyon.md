# Webcam avatar: what Tachyon needs

Written 2026-11-14, from the Grimoire version (branch `queue/grimoire-avatar`, `src/avatar/`).

## 1. The shared parameter set (the rig)

Eleven hex digits, eleven bytes a frame, in this order (`src/avatar/rig.ts`, `RIG_KEYS`):

| # | name | meaning |
|---|---|---|
| 0 | eyeL | eye drawn on the left (the player's right: the avatar is a mirror), 0 shut .. 15 wide; 11 at rest |
| 1 | eyeR | eye drawn on the right |
| 2 | mouth | 0 shut .. 15 wide open |
| 3 | smile | signed, 8 = none, below a frown, above a smile |
| 4 | yaw | signed, above 8 turns to the drawing's right |
| 5 | pitch | signed, above 8 tips up |
| 6 | roll | signed, above 8 leans clockwise on screen |
| 7 | gazeX | signed, above 8 looks to the drawing's right |
| 8 | gazeY | signed, above 8 looks up |
| 9 | browL | signed, above 8 raised (an arch), below lowered (a frown) |
| 10 | browR | the right brow |

Signed digits are read as `v - 8`, clamped to -7..7. Anything that is not exactly nine lowercase hex digits is
refused (`decodeRig`). The neutral rig is `bb088888888`.

Beside it, now and then, the **look** (`src/avatar/righead.ts`): the player's own head and hair, 132 hex digits.
Four header digits (hair tone, skin tone, mouth row, version 1), then a 16 x 16 grid, two squares a digit
(`a*4+b`, each 0 background, 1 face, 2 hair). The grid is laid on the face by the eyes (a square is a quarter
of the eyes' distance apart; the eyes on the line above row 9), so it holds still while the head moves.
Headphones and hats are neither face nor hair, so they never show. Captured from Face Landmarker's face
outline and MediaPipe's hair segmenter (0.78 MB) over six frames every five seconds; sent only when it changes.

In Rust: `pub struct Rig([u8; 11])` and `pub struct Look`, with `decode(&str) -> Option<Rig>` and `encode`. It belongs beside the
palette, in the shared drawing code.

## 2. The drawing function

`drawRig(rig, w, h, look?) -> rows of {ch, ink}` (`righead.ts` drawHead) is a pure function, written so it ports
exactly. It samples the look through the head's pose: each cell's four quarter points are un-posed (lean
undone by rotation, turn undone by unsqueezing and unsliding, the face sliding further than the outline)
and looked up in the grid; the outline glyph comes from which quarters are inside; hair is drawn as
strands; brows, eyes, nose and mouth are placed at their posed points. Whole numbers throughout:
- **Whole numbers only.** No floats; the turn and lean use the fixed tables `SIN_YAW/COS_YAW` (6 degrees a
  step) and `SIN_ROLL/COS_ROLL` (4.5 degrees a step), x 1024. `fdiv` is floor division (Rust `div_euclid`). One rounding helper, `rdiv(a, b)` (rounds halves away
  from zero, b > 0): `let m = (2 * a.abs() + b) / (2 * b); if a < 0 { -m } else { m }` with i32.
  Divisions elsewhere are `Math.floor` on non-negative numbers (Rust `/` on non-negatives), or exact.
- Glyphs are printable ASCII only: `( ) o O - = _ / \ | . ' < > ^`, so any font or terminal draws them.
- Inks: 0 ground, 1 outline and nose, 2 eyes, brows and mouth, 3 hair (its colour from the look's hair tone). Each game maps them to its palette. Grimoire uses dim
  grey for 1 and the player's colour for 2.
- Under 8x4 it is a two-row emoticon `(o o)` over the mouth. From 8x4 up it is an oval head. From 14x7 up the
  eyes are five cells wide (with pupils, lids and gaze) and there is a nose.
- Sizes by distance (`DETAIL_SIZE`): near 16x8, middle 10x5, far 5x2, farthest none (the letter).

**The test:** `tests/fixtures/rig-golden.json` holds `drawRig`'s text and inks for 107 rigs, 2 looks and 8 sizes
(1712 cases). The Rust version should load that file and match it cell for cell, as `pterm.ts` is kept identical.
Regenerate it only on purpose, with `UPDATE_RIG_GOLDEN=1 npm test` in Grimoire, and copy it to Tachyon in the
same change.

## 3. Who sees whom (game rules, not drawing)

`rig.ts` also has the rules Grimoire's host uses. They are pure and tested, and worth porting as they are:
- `detailFor(loud)`: 3 at loudness >= 0.66, 2 at >= 0.33, 1 at >= 0.12, else 0 (the letter only).
- `DETAIL_EVERY`: how often a rig is passed on at each detail: 66 ms near, 150 ms middle, 500 ms far.
- `avatarShows(rule, ...)`: `earshot` (whenever heard) or `talk` (only in the circle, or both indoors in the
  same room). The experiment's setting; Grimoire defaults to `talk`.
- `planRigs`: per viewer, what to send now (only changes, at the detail's pace; a single "drop" when someone
  goes out of sight).

## 4. Native camera input

The browser's trackers (MediaPipe in WebAssembly) do not come with a native build. Options, best first:
1. **MediaPipe Tasks in C++** (`face_landmarker.task` is the same model file) through a small FFI crate. It
   gives the same blendshapes, so `rawFromBlendshapes` and `poseFromMatrix` port directly (they are a few
   lines of float maths; the floats stop at the rig, so the drawing stays identical). It is the heaviest to
   build (Bazel, per platform).
2. **ONNX Runtime** (`ort` crate) with an ONNX export of a face-mesh and blendshape model, plus `nokhwa` for
   the camera. It is pure Rust above the runtime, with no Bazel.
3. **BlazeFace in `tract`** (pure Rust, small model) plus the pixel heuristics (`eyeMeasure`, `mouthMeasure`,
   `Range`, `poseFromPoints`, all pure functions in `trackers.ts`). It is the lightest native option, and is
   the right one if the comparison shows BlazeFace good enough.

Camera capture: `nokhwa` (Windows Media Foundation, V4L2, AVFoundation). Only the rig leaves the process, as
in the browser. The smoothing (`RigSmoother`: eyes and mouth fast, pose slow, a blink shuts at once, digits
held until clearly past the next) should be ported too, so avatars feel the same in both.

A Tachyon web build can reuse `trackers.ts` as it is.

## 5. The mouth and the voice

Talking hardly moves the jaw, so the camera alone misses it (Lavender, 14 Nov). Two fixes, both to port:
the tracker also reads the gap between the lips (landmarks 13 and 14 against the face's height), and every
phone opens each avatar's mouth by the voice it actually hears from that player (`withVoice(rig, level)`), so
the mouth moves in step with the sound and nothing more is sent.
