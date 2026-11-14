# Webcam avatar: what Tachyon needs

Written 2026-11-14, from the Grimoire version (branch `queue/grimoire-avatar`, `src/avatar/`).

## 1. The shared parameter set (the rig)

Nine hex digits, nine bytes a frame, in this order (`src/avatar/rig.ts`, `RIG_KEYS`):

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

Signed digits are read as `v - 8`, clamped to -7..7. Anything that is not exactly nine lowercase hex digits is
refused (`decodeRig`). The neutral rig is `bb0888888`.

In Rust: `pub struct Rig([u8; 9])` with `decode(&str) -> Option<Rig>` and `encode`. It belongs beside the
palette, in the shared drawing code.

## 2. The drawing function

`drawRig(rig, w, h) -> rows of {ch, ink}` is a pure function, written so it ports exactly:
- **Whole numbers only.** No floats, no trigonometry. One rounding helper, `rdiv(a, b)` (rounds halves away
  from zero, b > 0): `let m = (2 * a.abs() + b) / (2 * b); if a < 0 { -m } else { m }` with i32.
  Divisions elsewhere are `Math.floor` on non-negative numbers (Rust `/` on non-negatives), or exact.
- Glyphs are printable ASCII only: `( ) o O - = _ / \ | . ' < > ^`, so any font or terminal draws them.
- Inks: 0 ground, 1 outline and nose, 2 eyes and mouth. Each game maps them to its palette. Grimoire uses dim
  grey for 1 and the player's colour for 2.
- Under 8x4 it is a two-row emoticon `(o o)` over the mouth. From 8x4 up it is an oval head. From 14x7 up the
  eyes are five cells wide (with pupils, lids and gaze) and there is a nose.
- Sizes by distance (`DETAIL_SIZE`): near 16x8, middle 10x5, far 5x2, farthest none (the letter).

**The test:** `tests/fixtures/rig-golden.json` holds `drawRig`'s text and inks for 95 rigs at 8 sizes (760
cases). The Rust version should load that file and match it cell for cell, as `pterm.ts` is kept identical.
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
