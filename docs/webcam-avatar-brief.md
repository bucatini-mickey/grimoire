# Webcam avatar: brief for an Opus session

Written 2026-11-14 from a chat with Jason. Paste this into a new Opus session in `E:\Claude\Personal\Game Dev\Grimoire`.

## Goal
A webcam-driven ASCII avatar for Grimoire (later Tachyon). A tiny face tracker reads the webcam, however poor, and gives a few numbers. Every client draws the avatar from those numbers. The avatar follows eyes (blink, gaze), mouth (open, smile), and head turn and tilt. Video never leaves the machine; only the numbers are sent.

## Decisions already made
- Pure ASCII on a character grid, as for all games. No real video in the game.
- As lightweight as possible, but the site is already fast, so test options and measure rather than guess.
- Test at least: (a) MediaPipe Face Landmarker (blendshapes, about 10-15 MB, loaded only when the camera is turned on); (b) BlazeFace (about 200 KB, box plus a few points) with simple eye and mouth heuristics. Report download size, frames a second on a weak laptop, and how each copes with a bad webcam and bad light. Fall back to the existing pixel tool if loading fails.
- The parameter set is small: left and right eye open, mouth open, smile, head yaw, pitch, roll, gaze. A few bytes a frame, in the same hex-digit style the game already uses for faces.
- The avatar drawing is a pure function from numbers to cells. The same function will later be written in Rust for Tachyon, with a test that both draw identical cells (as `pterm` is kept identical).

## Who sees whom
- Other players see your avatar when they come within earshot. The nearest is clearest: detail and update rate fall with distance, and the farthest show little more than a letter.
- Experiment: the avatar shows only (1) in the circle during discussions, and (2) when players are inside a building area discussing. Running outside shows no avatar. Make this a setting so it can be compared with "always when in earshot".
- Camera is off until the player turns it on. Only the numbers leave the browser.

## Start from
- `tools/ascii-face.html` (current pixel-to-ASCII tuner). The newer version may be on the unmerged branch `queue/grimoire-c`; check it first.
- The camera window from grim-017 (`More`, then `Cameras`), which already has tiles, earshot logic and test villagers.
- `src/town/faces.ts` (how faces are drawn and sent), `src/term/pterm.ts` (kept identical to Tachyon's).
- Queue notes: `E:\Claude\Queue\tasks\grimoire.md` (grim-017, grim-018) and `E:\Claude\Queue\INBOX.md`.

## Done looks like
1. A test page that shows the raw numbers beside the avatar, so Jason can say "blinks lag" or "gaze is flipped" from Lavender (the machine with the camera).
2. A short comparison of the tracker options, with measurements, and a recommendation.
3. The avatar in the village, visible by the distance and place rules above, with tests passing.
4. A written note of what Tachyon needs (shared parameter set, drawing function, native camera input).

Do not push. Jason pushes.
