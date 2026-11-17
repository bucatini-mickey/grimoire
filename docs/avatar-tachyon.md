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

Signed digits are read as `v - 8`, clamped to -7..7. Anything that is not exactly eleven lowercase hex digits is
refused (`decodeRig`). The neutral rig is `bb088888888`.

In Rust: `pub struct Rig([u8; 11])` with `decode(&str) -> Option<Rig>` and `encode`. It belongs beside the palette,
in the shared drawing code.

(A "look" of the player's own head and hair was tried on 14-15 Nov and dropped: Jason found the hair and face
outline more trouble than help. The avatar is features only.)

## 2. The drawing function

`drawRig(rig, w, h) -> rows of {ch, ink}` (`src/avatar/rigface.ts`, `drawFace`) is a pure function, written so it
ports exactly. Features only, using the whole box: brows (three rows of travel: raised, at rest, lowered onto the
lid's row), eyes (`( o )` with the pupil moved by the glance, lids when wide, a line when shut), a nose, and a
mouth of one to three rows (shut, smiling or frowning, talking, open, wide open). A turn slides the face and
narrows the far eye; a tip moves it a row; a lean drops the lower side's brow and eye.
- **Whole numbers only.** One rounding helper, `rdiv(a, b)` (rounds halves away from zero, b > 0):
  `let m = (2 * a.abs() + b) / (2 * b); if a < 0 { -m } else { m }` with i32. Other divisions are `Math.floor`
  on non-negative numbers (Rust `/` on non-negatives).
- Glyphs are printable ASCII only, so any font or terminal draws them.
- Inks: 0 ground, 1 nose, 2 eyes, brows and mouth. Each game maps them to its
  palette; Grimoire uses dim grey for 1 and the player's colour for 2.
- Under 8x4 it is a two-row emoticon `(o o)` over the mouth (brows tilt the brackets). From 8x4 up, three-cell
  eyes; from 14x7 up, five-cell eyes with pupils, lids and gaze, brows that rise and fall, and a nose.
- Sizes by distance (`DETAIL_SIZE`): near 16x8, middle 10x5, far 5x2, farthest none (the letter).

**The design (Jason, 16 Nov):** the letter tile with a face, in the middle style. Each avatar is a 10x5 tile
(`AVATAR_TILE` in Grimoire's camwin.ts) on the letter tile's faint dotted ground, the middle face drawn on
it, and the nose's middle (ink 3) replaced by the player's letter on its plate: brows, eyes and mouth round
their letter. Since 17 Nov the middle face is drawn "Soft" (old usenet ASCII art: __ brows, bare o eyes,
a ---- or `-..-' mouth, no frames), keeping the original (==) talking and .--. over __/ laughing mouths,
with ^ eyes when smiling or laughing. Near and middle players both get this tile; far ones the far face (17 Nov): 3x2 in its 5x2 box, eyes at the corners and the bottom row all mouth (o o over ---; smiling a curve; talking a single o, O when loud), no letter (Grimoire puts it before the name at the table); the farthest their
letter. The 16x8 face is kept for the test page and the fixture only. Tried and dropped on the way: a head
outline and hair from the camera (too fussy), and the camera's own picture in letters with the features laid
on it (the "blend"; not wanted).

**The test:** `tests/fixtures/rig-golden.json` holds `drawRig`'s text and inks for 107 rigs at 8 sizes (856
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

## 5. The mouth and the voice

Talking hardly moves the jaw, so the camera alone misses it (Lavender, 14 Nov). Two fixes, both to port:
the tracker also reads the gap between the lips (landmarks 13 and 14 against the face's height), and every
phone opens each avatar's mouth by the voice it actually hears from that player (`withVoice(rig, level)`), so
the mouth moves in step with the sound and nothing more is sent.

## 6. Resting levels (glasses)

Brows and smile are read against their own resting level, learnt as the tracker runs (`Recentre` in
`trackers.ts`: quickly for the first second, then slowly and only from values near rest, so a held frown is not
learnt away). Glasses' frames near the brows, or a face that rests a little sour, then read as neutral. Port it
with the smoother.

## 7. The camera bar

Grimoire's camera window can sit in a corner over the map or as a bar across the whole page, top or bottom,
whose rows the map gives up (a sub-terminal). Tachyon's terminal can do the same: a strip of rows with one
row of avatar tiles, names under them.
