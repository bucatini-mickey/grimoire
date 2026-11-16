# Webcam avatar: tracker comparison

Written 2026-11-14. The page that measures them is `tools/avatar-test.html` ("Run the comparison"); its report
goes to Rosemary (`tools/reports/`) when served by `npm run tools`, or can be copied. **Rosemary has no
camera, so the speed and robustness columns wait for Lavender's run.** Sizes and loading were measured here.

## The three options

| | Face Landmarker | BlazeFace + pixels | Pixels only |
|---|---|---|---|
| What it gives | 478 points, 52 blendshapes (blink, jaw, smile, frown, gaze, wide eyes), head transform | a box and 6 points (eyes, nose, mouth, ears) | a box from skin tone (or Chrome's FaceDetector) |
| Eyes, mouth, smile, gaze | from blendshapes (trained for exactly this) | heuristics on small patches round the points | the same heuristics, at guessed places in the box |
| Head turn, tip, lean | from the transform | from the points (nose against eyes; eye-line slope) | none (always the middle) |
| Download, as sent | **6.15 MB** (runtime 2.39 MB + model 3.76 MB) | **2.62 MB** (the same 2.39 MB runtime + 0.23 MB model) | **0** |
| Unpacked in memory | ~15 MB (wasm 11.2 MB + model) | ~11.4 MB | 0 |
| Load, Rosemary, cold | 4.4 s (first; 1.5 s from cache) | 0.3-0.4 s once the runtime is in | instant |
| Runs on | GPU (WebGL), falls back to CPU | GPU, falls back to CPU | CPU, ~1-3 ms |
| ms a frame, Lavender | *to measure* | *to measure* | *to measure* |
| Bad webcam / dark / noise | *to measure* | *to measure* | *to measure* |

Notes on the sizes:
- MediaPipe 0.10.35 from jsDelivr (brotli): `vision_bundle.mjs` 34 KB, `vision_wasm_internal.js` 65 KB,
  `vision_wasm_internal.wasm` 2.30 MB (11.2 MB unpacked). Models from Google's bucket, uncompressed.
- The brief's "BlazeFace about 200 KB" holds only for the model. Through MediaPipe it needs the same 2.3 MB
  runtime. Getting near 200 KB would mean running BlazeFace without MediaPipe (TF.js costs about as much
  again, or a small hand-written WebGL network). That is only worth doing if BlazeFace wins on everything else.
- Everything is loaded only when a player turns their camera on with Tiles: avatar. The game file is unchanged (700 KB).
- If loading fails (offline, blocked), the village falls back to Pixels only and says so. The test page also
  shows the picture avatar (asciiavatar.ts).

## What I expect, before measuring

- **Face Landmarker** should win clearly on blinks, the mouth, smiles and gaze, because its blendshapes are
  trained for them. It is the only option whose turn, tip and lean are solid. Its cost is the 6 MB, once,
  cached afterwards.
- **BlazeFace** gives a good head pose cheaply. Its eye and mouth heuristics learn this face's range as they
  go (rig `Range`), so they need a few seconds and blink-like motion before they read well. Smile is the
  weakest (only the dark line of the lips getting wider). It is likely to lose eyes in a dark room, since eye
  darkness is what it measures.
- **Pixels only** is a fallback: blinks and an open mouth at best, no pose.

## Lavender, 14 November

Jason tried all three on Lavender (Intel Arc, 22 cores, Edge, 640x480 camera). The Face Landmarker loaded in
0.7 s (6.86 MB). Notes: BlazeFace is "terrible"; talking was not picked up; the face too plain and not the
player's shape; a turned head should turn as a whole; pitch and roll read the wrong way round. So: BlazeFace
is gone from the village's choices (still on the test page); the lip gap and the voice now open the mouth;
brows added; pitch and roll flipped. A captured head and hair (with MediaPipe's hair segmenter, +0.78 MB) was
tried next and dropped on 15 Nov: "the hair and face create complications". The avatar is now features only
(eyes, brows, nose, mouth), and brows and smile read against a learnt resting level, so glasses near the brows
do not read as a frown. The timed comparison was not run yet.

## Recommendation

Use the **Face Landmarker** (6.15 MB), loaded when the camera is turned on, with
**Pixels only** as the fallback. Confirmed by Lavender's try: BlazeFace's eyes and mouth are not good enough. The village's Cameras page can switch
trackers (Tracker: ...) so each can be tried in a real game.

## How to fill in the table

On Lavender: open `avatar-test.html`, turn the camera on, press **Load trackers**, then **Run the comparison**
(about two minutes; sit still and blink three times slowly in each run). Then press **Send to Rosemary** if
the page came from Rosemary, or **Copy report** and paste it to Claude. The report holds fps, median and 90th
percentile ms a frame, how often a face was found, jitter (how much the head's digits wobble while still) and
blinks caught out of three, for each tracker and each picture (as it is, low-res, dark, noisy). It also holds
the device's cores, memory and GPU.
