import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
	bestPatch, blend, boxDown, cellGlyph, DEFAULTS, DENSE, embedHtml, exposure, fixedCrop, follow, hexFrame, isSkin, luma,
	outside, playerHtml, quantize, RAMP, rowsFor, SKIN_START, squareAround, toFrame, toHtml, toLevels
} from '../src/avatar/asciiavatar.ts';
import { calmGlyph, cellOf, faceCell, faceOver, hideFace, inFigure, inOval, nearFace, overAt, quietCell, resample } from '../src/town/faces.ts';

const root = new URL('..', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');
/** A small seeded random, so the noise tests are the same every run. */
const rand = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);

test('the glyph of a cell is the village face\'s glyph (shape 5), dark cells blank, shape by halves', () => {
	for (let t = 0; t < 16; t++) for (let b = 0; b < 16; b++) {
		const [ch, level] = cellGlyph(t, b, 5, true);
		assert.deepEqual({ ch, level }, faceCell(t, b), `${t},${b}`);
	}
	assert.equal(cellGlyph(1, 0)[0], ' ');
	assert.equal(cellGlyph(15, 0)[0], '"');
	assert.equal(cellGlyph(8, 0)[0], "'");
	assert.equal(cellGlyph(0, 15)[0], 'o');
	assert.equal(cellGlyph(0, 8)[0], ',');
	// A lower shape threshold turns more cells into high or low glyphs.
	assert.equal(cellGlyph(9, 6, 5)[0], DENSE[Math.round((15 / 30) * (DENSE.length - 1))]);
	assert.equal(cellGlyph(9, 6, 3)[0], "'");
});

test('drawing by weight only: brighter cells never get a fainter glyph', () => {
	let last = -1;
	for (let k = 0; k < 16; k++) {
		const [ch, level] = cellGlyph(k, k, 5, false);
		assert.equal(level, k);
		const i = RAMP.indexOf(ch);
		assert.ok(i >= last, `level ${k}`);
		last = i;
	}
	assert.equal(cellGlyph(0, 0, 5, false)[0], ' ');
	assert.equal(cellGlyph(15, 15, 5, false)[0], '@');
});

test('quantize rounds, and holds a level until the value is clearly past the next', () => {
	assert.equal(quantize(0, -1, 0.25), 0);
	assert.equal(quantize(1, -1, 0.25), 15);
	assert.equal(quantize(7.4 / 15, -1, 0.25), 7);
	assert.equal(quantize(7.6 / 15, -1, 0.25), 8);
	// Held at 7 while within 0.75 of it...
	assert.equal(quantize(7.7 / 15, 7, 0.25), 7);
	assert.equal(quantize(6.3 / 15, 7, 0.25), 7);
	// ...and moved once past that.
	assert.equal(quantize(7.8 / 15, 7, 0.25), 8);
	assert.equal(quantize(6.1 / 15, 7, 0.25), 6);
	// With no steadiness it is plain rounding.
	assert.equal(quantize(7.6 / 15, 7, 0), 8);
	assert.equal(quantize(2, -1, 0), 15);
	assert.equal(quantize(-1, -1, 0), 0);
});

test('blend keeps part of the last frame, but a jump shows at once', () => {
	const prev = Float32Array.from([100, 100, 100]);
	blend(prev, [110, 200, 90], 0.5, 40);
	assert.deepEqual(Array.from(prev), [105, 200, 95]);
	const p2 = Float32Array.from([0]);
	blend(p2, [10], 0, 40);
	assert.equal(p2[0], 10);
	const p3 = Float32Array.from([0]);
	blend(p3, [10], 5, 40); // keep is capped below 1: it still moves
	assert.ok(p3[0] > 0);
});

test('boxDown averages blocks of pixels to brightness', () => {
	// 4 x 2 pixels: a white 2 x 2 block, then a red 2 x 2 block; k = 2 gives two samples.
	const W = 4, H = 2, px: number[] = [];
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px.push(...(x < 2 ? [255, 255, 255, 255] : [200, 0, 0, 255]));
	const v = boxDown(px, W, H, 2);
	assert.equal(v.length, 2);
	assert.ok(Math.abs(v[0] - luma(255, 255, 255)) < 1e-3);
	assert.ok(Math.abs(v[1] - luma(200, 0, 0)) < 1e-3);
	// A checkerboard averages to grey: no shimmer from the pattern itself.
	const cb: number[] = [];
	for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) cb.push(...((x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
	for (const s of boxDown(cb, 4, 4, 2)) assert.ok(Math.abs(s - 127.5) < 1);
});

const flat = { gamma: 1, sharpen: 0, invert: false, fade: 0, oval: 1, steady: 0 };

test('levels follow brightness: brighter samples never darker, invert flips, the background fades', () => {
	const w = 16, h = 16;
	const v = Array.from({ length: w * h }, (_, i) => (i % w) * 16);
	const L = toLevels(v, w, h, flat, 0, 240);
	for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) assert.ok(L[x + y * w] >= L[x - 1 + y * w]);
	assert.equal(L[0], 0);
	assert.equal(L[w - 1], 15);
	const I = toLevels(v, w, h, { ...flat, invert: true }, 0, 240);
	assert.equal(I[0], 15);
	assert.equal(I[w - 1], 0);
	// Fading: an all-white crop keeps its middle and loses its corners.
	const white = new Array(w * h).fill(255);
	const F = toLevels(white, w, h, { ...flat, fade: 1 }, 0, 255);
	assert.equal(F[w / 2 + (h / 2) * w], 15);
	assert.equal(F[0], 0);
	assert.ok(outside(0, 0, w, h) === 1 && outside(w / 2, h / 2, w, h) === 0);
});

test('exposing for the face ignores a bright window behind it', () => {
	const w = 20, h = 20;
	// A mid-grey face in the middle, a blown-out background.
	const v = Array.from({ length: w * h }, (_, i) => (outside(i % w, Math.floor(i / w), w, h) < 0.5 ? 80 + (i % 7) * 5 : 255));
	const face = exposure(v, w, h, { faceExpose: true, oval: 1, black: 2, white: 98 });
	const all = exposure(v, w, h, { faceExpose: false, oval: 1, black: 2, white: 98 });
	assert.ok(face.hi <= 110, `face white point ${face.hi}`);
	assert.equal(all.hi, 255);
});

test('smoothing and steadiness calm a still, noisy face', () => {
	const w = 24, h = 24, r = rand(7);
	const base = Array.from({ length: w * h }, (_, i) => 40 + ((i * 37) % 180));
	const run = (smooth: number, steady: number) => {
		let mem: Float32Array | null = null, levels = new Int8Array(w * h).fill(-1), changes = 0, prev: Uint8Array | null = null;
		for (let f = 0; f < 60; f++) {
			const noisy = base.map((b) => b + (r() - 0.5) * 16);
			mem = mem ? blend(mem, noisy, smooth, 40) : Float32Array.from(noisy);
			const L = toLevels(mem, w, h, { ...flat, steady }, 0, 255, levels);
			if (prev) for (let i = 0; i < L.length; i++) if (L[i] !== prev[i]) changes++;
			prev = L;
		}
		return changes;
	};
	const raw = run(0, 0), calm = run(DEFAULTS.smooth, DEFAULTS.steady);
	assert.ok(calm * 4 < raw, `changes: raw ${raw}, smoothed ${calm}`);
	// A real movement still shows in the very next frame.
	const mem = Float32Array.from(base);
	const moved = base.map((b, i) => (i < w * 4 ? 255 - b : b));
	blend(mem, moved, DEFAULTS.smooth, DEFAULTS.snap);
	assert.equal(mem[0], moved[0]);
});

test('a frame is square, reads back as the village\'s hex frame, and draws as text and HTML', () => {
	const cols = 12, rows = rowsFor(cols);
	assert.equal(rows, 6);
	const levels = Uint8Array.from({ length: cols * rows * 2 }, (_, i) => (i * 5) % 16);
	const f = toFrame(levels, cols, rows, { shape: 5, shaped: true, colour: true });
	assert.equal(f.lines.length, rows);
	assert.ok(f.lines.every((l) => l.length === cols));
	assert.equal(f.text, f.lines.join('\n'));
	const hex = hexFrame(levels);
	for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
		assert.equal(cellOf(hex, x, y, cols).ch, f.lines[y][x]);
		assert.equal(cellOf(hex, x, y, cols).level, f.inks[x + y * cols]);
	}
	// The HTML, its tags stripped, is the text.
	assert.equal(f.html.replace(/<[^>]+>/g, ''), f.text);
	assert.equal(toFrame(levels, cols, rows, { shape: 5, shaped: true, colour: false }).html, f.text);
});

test('HTML runs: one span a run of one ink, and nothing unescaped', () => {
	const html = toHtml(['<&>a', 'bbbb'], [1, 1, 2, 2, 3, 3, 3, 3], true);
	assert.equal((html.match(/<span/g) ?? []).length, 3);
	assert.ok(html.includes('&lt;&amp;') && html.includes('&gt;a'));
	assert.equal(toHtml(['<a>'], [0, 0, 0], false), '&lt;a&gt;');
});

test('finding the face: the biggest skin patch, near where it was; crops stay inside the picture', () => {
	assert.ok(isSkin(220, 170, 140, SKIN_START, 1));
	assert.ok(!isSkin(40, 90, 200, SKIN_START, 1));
	assert.ok(!isSkin(0, 0, 0, SKIN_START, 1));
	const w = 30, h = 20, m = new Uint8Array(w * h);
	const fill = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[x + y * w] = 1; };
	fill(2, 2, 7, 9);      // a face, 48 px, on the left
	fill(18, 2, 26, 12);   // a bigger patch, 99 px, on the right
	m[29 + 19 * w] = 1;    // a speck
	const right = bestPatch(m, w, h, { x: 22, y: 7 }, 3)!;
	assert.equal(right.x0, 18);
	assert.equal(right.n, 99);
	// Near the small one, it wins over the far bigger one.
	assert.equal(bestPatch(m, w, h, { x: 4, y: 5 }, 3)!.x0, 2);
	assert.equal(bestPatch(new Uint8Array(w * h), w, h, { x: 0, y: 0 }, 1), null);
	const sq = squareAround(5, 5, 100, 640, 480);
	assert.deepEqual(sq, { x: 0, y: 0, s: 100 });
	assert.equal(squareAround(320, 240, 2000, 640, 480).s, 480);
	const fc = fixedCrop(640, 480, 0.5, 0.1);
	assert.equal(fc.s, 240);
	assert.ok(fc.y < 240 - 120);
	assert.deepEqual(fixedCrop(640, 480, 0.5, 0, { x: 630, y: 470 }), { x: 400, y: 240, s: 240 });
});

test('the crop follows smoothly and holds still for tiny moves', () => {
	const b = { x: 100, y: 100, s: 200 };
	assert.deepEqual(follow(b, { x: 102, y: 99, s: 201 }, 0.5), b);
	const f = follow(b, { x: 140, y: 100, s: 200 }, 0.25);
	assert.equal(f.x, 110);
	assert.equal(f.y, 100);
});

test('a recorded clip is a page that plays itself, with nothing to fetch', () => {
	const frames = [{ text: 'ab\n</script>', inks: '0f0f0f0f0' }, { text: 'cd\nef', inks: '1234' }];
	const page = playerHtml(frames, 12, { title: 'Me <b>' });
	assert.ok(page.startsWith('<!doctype html>'));
	assert.equal((page.match(/<\/script>/g) ?? []).length, 1, 'only the closing tag itself');
	assert.ok(!/https?:\/\//.test(page));
	assert.ok(!/\bsrc=/.test(page));
	assert.ok(page.includes('<title>Me b</title>'));
	// The frames come back out of the page as they went in.
	const json = page.slice(page.indexOf('var D = ') + 8, page.indexOf(';\n', page.indexOf('var D = ')));
	const D = JSON.parse(json);
	assert.deepEqual(D.frames, frames);
	assert.equal(D.fps, 12);
});

test('the embed snippet carries the module and mounts it with the settings, safely', () => {
	const snip = embedHtml('var asciiAvatar = {}; "</script>";', { cols: 30 });
	assert.ok(snip.includes('<\\/script>";'));
	assert.ok(snip.includes('asciiAvatar.mount(document.getElementById("ascii-avatar"), {"cols":30})'));
	assert.equal((snip.match(/<\/script>/g) ?? []).length, 2);
});

test('the tool is one self-contained file carrying a current copy of the module', () => {
	execFileSync(process.execPath, [fileURLToPath(new URL('tools/avatar-inline.mjs', root)), '--check']);
	const html = read('tools/ascii-face.html');
	assert.ok(!/<(script|link|img|iframe)[^>]+(src|href)=["']?https?:/i.test(html), 'no outside scripts, styles or pictures');
	assert.ok(!/@import|url\(\s*["']?https?:/i.test(html));
	for (const net of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'RTCPeerConnection', 'sendBeacon', 'EventSource']) assert.ok(!html.includes(net), net);
	// Phones: the viewport, the front camera, video only.
	assert.ok(html.includes('name="viewport"'));
	const mod = read('src/avatar/asciiavatar.ts');
	assert.ok(mod.includes("facingMode: facing") && mod.includes('audio: false'));
	assert.equal(DEFAULTS.facing, 'user');
});

test('Letters: the drawn face goes over yours, mirrored, and an oval hides your own', () => {
	const cells = [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5]];
	// A face in the middle of a 640x480 picture: the middle of a 12 x 6 tile.
	const mid = faceOver({ x: 0.4, y: 0.3, w: 0.2, h: 0.3 }, 640, 480, 12, 6, cells);
	assert.ok(Math.abs(mid.cx - 6) < 1.5, JSON.stringify(mid));
	assert.ok(mid.rx >= 1.9 && mid.rx < 2.5 && mid.ry >= 1.3 && mid.ry < 1.5, 'the blank hugs the small face');
	assert.ok(mid.y >= 0 && mid.y + 2 <= 6, JSON.stringify(mid));
	// The face on the picture's left is on the tile's right (the tile is a mirror).
	const left = faceOver({ x: 0.15, y: 0.3, w: 0.2, h: 0.3 }, 640, 480, 12, 6, cells);
	assert.ok(left.cx > mid.cx + 1, JSON.stringify(left));
});

test('Letters sent to others: the face is blanked before it leaves, and lands where the sender put it', () => {
	const W = 12, H = 6, full = 'f'.repeat(W * H * 2);
	const o = faceOver({ x: 0.4, y: 0.3, w: 0.2, h: 0.3 }, 640, 480, W, H, [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5]]);
	const hid = hideFace(full, W, H, o);
	let blanked = 0;
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
		const both = hid[x + 2 * y * W] + hid[x + (2 * y + 1) * W];
		if (inOval(o, x, y)) { assert.equal(both, '00'); blanked++; } else assert.equal(both, 'ff');
	}
	assert.ok(blanked >= 4, 'the face cells are blank');
	// Any tile size: a 12 x 6 picture drawn at 10 x 5 keeps its blank where the face is.
	const small = resample(hid, W, H, 10, 5);
	assert.equal(small.length, 10 * 5 * 2);
	const at = overAt([o.x, o.y], W, H, 10, 5, [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5]]);
	assert.equal(small[Math.floor(at.cx) + 2 * Math.floor(at.cy) * 10], '0', JSON.stringify(at));
	// The same size: the face goes exactly where it was.
	const same = overAt([o.x, o.y], W, H, W, H, [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5]]);
	assert.deepEqual([same.x, same.y], [o.x, o.y]);
});

test('letters: the person round their face is picked out, the room behind them quietened', () => {
	const o = { cx: 5, cy: 2, rx: 1.9, ry: 1.3 };
	assert.ok(inFigure(o, 4, 1) && inFigure(o, 5, 2), 'the head');
	assert.ok(inFigure(o, 2, 4) && inFigure(o, 7, 4), 'the shoulders, wider than the head');
	assert.ok(!inFigure(o, 0, 0) && !inFigure(o, 9, 0), 'the corners above the shoulders are the room');
	assert.ok(!inFigure(o, 1, 2), 'beside the head is the room');
	assert.equal(quietCell(3), ' ');
	for (let l = 0; l < 16; l++) assert.ok(' .:+'.includes(quietCell(l)), 'only faint marks behind them');
});

test('letters: a quiet ring round the drawn face, and no dense glyph in the person', () => {
	const o = { cx: 5, cy: 2, rx: 1.9, ry: 1.3 };
	assert.ok(nearFace(o, 2, 2) && nearFace(o, 7, 2), 'either side of the face');
	assert.ok(!nearFace(o, 5, 2), 'not the face itself (its blank)');
	assert.ok(!nearFace(o, 0, 4), 'not far off');
	for (const ch of ' .:-=+*#%@"\'`,o') {
		assert.ok(" .:',".includes(calmGlyph(ch, true)), `${ch} by the face`);
		assert.ok(!'@%#'.includes(calmGlyph(ch, false)), `${ch} in the person`);
	}
	assert.equal(calmGlyph('"', true), "'", 'high stays high');
	assert.equal(calmGlyph('o', true), ',', 'low stays low');
});
