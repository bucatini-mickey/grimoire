import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
	avatarShows, decodeRig, DETAIL_SIZE, detailFor, detailThatFits, drawRig, encodeRig, NEUTRAL, planRigs, rdiv, RIG_KEYS, rigInks, rigText
} from '../src/avatar/rig.ts';
import type { Detail, Rig, RigSent } from '../src/avatar/rig.ts';
import { eyeMeasure, mouthMeasure, poseFromMatrix, poseFromPoints, Range, rawFromBlendshapes, RAW_ZERO, RigSmoother, rigOf } from '../src/avatar/trackers.ts';

const rig = (p: Partial<Rig> = {}): Rig => ({ ...NEUTRAL, ...p });

test('a rig is nine hex digits, both ways; anything else is refused', () => {
	const r = rig({ eyeL: 0, mouth: 15, yaw: 3 });
	const s = encodeRig(r);
	assert.equal(s.length, 9);
	assert.deepEqual(decodeRig(s), r);
	for (const bad of ['', 'bb08888888', 'bb088888g', 'BB0888888', 42, null]) assert.equal(decodeRig(bad), null);
	assert.equal(encodeRig(rig({ eyeL: 20, mouth: -3 })).slice(0, 3), 'fb0');
});

test('rdiv rounds halves away from zero, as the Rust twin will', () => {
	assert.deepEqual([rdiv(5, 2), rdiv(-5, 2), rdiv(4, 3), rdiv(-4, 3), rdiv(0, 7), rdiv(7, 14)], [3, -3, 1, -1, 0, 1]);
});

test('the avatar fills its box at every detail, and each change of a digit shows', () => {
	for (const d of [1, 2, 3] as Detail[]) {
		const { w, h } = DETAIL_SIZE[d];
		const base = drawRig(NEUTRAL, w, h);
		assert.equal(base.length, h);
		for (const row of base) assert.equal(row.length, w);
		// Blinking, opening the mouth and smiling each change the drawing.
		for (const p of [{ eyeL: 0, eyeR: 0 }, { mouth: 15 }, { smile: 15 }, { smile: 0 }, { yaw: 15 }, { yaw: 0 }])
			assert.notEqual(rigText(drawRig(rig(p), w, h)), rigText(base), `detail ${d}: ${JSON.stringify(p)}`);
	}
	const big = DETAIL_SIZE[3];
	for (const p of [{ roll: 15 }, { pitch: 15 }, { gazeX: 15 }, { gazeY: 15 }, { eyeR: 0 }])
		assert.notEqual(rigText(drawRig(rig(p), big.w, big.h)), rigText(drawRig(NEUTRAL, big.w, big.h)), JSON.stringify(p));
});

test('the near avatar at rest: an oval head, two eyes, a nose, a mouth', () => {
	assert.equal(rigText(drawRig(NEUTRAL, 16, 8)), [
		'    ________    ',
		'  /          \\  ',
		' /            \\ ',
		'| ( o )  ( o ) |',
		'|      |       |',
		' \\   ------   / ',
		'  \\          /  ',
		'    \\------/    '
	].join('\n'));
	assert.equal(rigText(drawRig(rig({ smile: 15 }), 5, 2)), '(o o)\n \\_/ ');
});

test('a wink shuts one eye only, on the side it is drawn', () => {
	const t = rigText(drawRig(rig({ eyeR: 0 }), 16, 8)).split('\n')[3];
	assert.ok(t.slice(0, 8).includes('o') && !t.slice(8).includes('o'), t);
});

test('out-of-range digits are clamped, never thrown at', () => {
	const r = rig({ eyeL: 99, yaw: -40, roll: 1e9, gazeX: NaN });
	for (const d of [1, 2, 3] as Detail[]) assert.doesNotThrow(() => drawRig(r, DETAIL_SIZE[d].w, DETAIL_SIZE[d].h));
	assert.equal(rigText(drawRig(NEUTRAL, 4, 1)), '    ');
});

// The fixture the Rust drawing is tested against, cell for cell (docs/avatar-tachyon.md).
const FIXTURE = new URL('./fixtures/rig-golden.json', import.meta.url);
function golden() {
	const rigs: string[] = [encodeRig(NEUTRAL)];
	// Each digit at its ends and a step either side of the middle, alone; then some mixtures.
	for (const k of RIG_KEYS) for (const v of [0, 3, 6, 10, 13, 15]) rigs.push(encodeRig(rig({ [k]: v })));
	let seed = 7;
	const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 16);
	for (let i = 0; i < 40; i++) rigs.push(RIG_KEYS.map(() => rnd().toString(16)).join(''));
	const sizes = [[16, 8], [10, 5], [5, 2], [12, 6], [8, 4], [7, 3], [20, 10], [15, 7]];
	return { note: 'drawRig (src/avatar/rig.ts) for each rig at each size: text rows, and inks (0 ground, 1 outline, 2 features). Regenerate: UPDATE_RIG_GOLDEN=1 npm test', sizes,
		cases: rigs.flatMap((r) => sizes.map(([w, h]) => { const c = drawRig(decodeRig(r)!, w, h); return { rig: r, w, h, text: rigText(c), inks: rigInks(c) }; })) };
}
test('drawRig matches its golden fixture (what the Rust twin must draw too)', () => {
	const g = golden();
	if (process.env.UPDATE_RIG_GOLDEN || !existsSync(FIXTURE)) writeFileSync(FIXTURE, JSON.stringify(g, null, 1) + '\n');
	assert.deepEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')), g);
});

test('detail falls with distance; the place rule keeps avatars to the circle and shared rooms', () => {
	assert.deepEqual([1, 0.7, 0.5, 0.2, 0.05, 0].map(detailFor), [3, 3, 2, 1, 0, 0]);
	assert.equal(detailThatFits(16, 8), 3);
	assert.equal(detailThatFits(12, 6), 2);
	assert.equal(detailThatFits(8, 4), 1);
	assert.equal(detailThatFits(4, 4), 0);
	const out = { loud: 0.8, circle: false, together: false };
	assert.equal(avatarShows('earshot', out), true);
	assert.equal(avatarShows('talk', out), false);
	assert.equal(avatarShows('talk', { ...out, together: true }), true);
	assert.equal(avatarShows('talk', { ...out, circle: true }), true);
	assert.equal(avatarShows('earshot', { ...out, loud: 0 }), false);
});

test('the host passes rigs on: the nearest often, the far seldom, nothing unchanged, a drop when out of sight', () => {
	const sent = new Map<string, RigSent>();
	const near = { id: 'a', rig: 'bb0888888', loud: 1, circle: true, together: false };
	const far = { id: 'b', rig: 'bb0888888', loud: 0.2, circle: true, together: false };
	assert.deepEqual(planRigs(0, [near, far], 'talk', sent), [['a', 'bb0888888', 3], ['b', 'bb0888888', 1]]);
	// Nothing changed: nothing sent.
	assert.deepEqual(planRigs(10, [near, far], 'talk', sent), []);
	// Both change at 100 ms: the near one is due (every 66 ms), the far one is not (every 500 ms).
	const n2 = { ...near, rig: '000888888' }, f2 = { ...far, rig: '000888888' };
	assert.deepEqual(planRigs(100, [n2, f2], 'talk', sent), [['a', '000888888', 3]]);
	assert.deepEqual(planRigs(600, [n2, f2], 'talk', sent), [['b', '000888888', 1]]);
	// Out in the street under the talk rule: dropped once, then quiet.
	const street = { ...n2, circle: false };
	assert.deepEqual(planRigs(700, [street], 'talk', sent), [['a', '', 0], ['b', '', 0]]);
	assert.deepEqual(planRigs(800, [street], 'talk', sent), []);
	// The same street under the earshot rule: shown.
	assert.deepEqual(planRigs(900, [street], 'earshot', sent), [['a', '000888888', 3]]);
});

test('raw measures to digits: the middle at rest, the ends at the gains, flips and a neutral', () => {
	const r = rigOf(RAW_ZERO);
	assert.equal(Math.round(r.yaw), 8);
	assert.equal(Math.round(r.eyeL), 11);
	assert.equal(Math.round(rigOf({ ...RAW_ZERO, yaw: 35 }).yaw), 15);
	assert.equal(Math.round(rigOf({ ...RAW_ZERO, yaw: -90 }).yaw), 1);
	assert.equal(Math.round(rigOf({ ...RAW_ZERO, yaw: 35 }, undefined, undefined, { eyes: false, yaw: true, pitch: false, roll: false, gazeX: false, gazeY: false }).yaw), 1);
	assert.equal(Math.round(rigOf({ ...RAW_ZERO, yaw: 10 }, undefined, { yaw: 10, pitch: 0, roll: 0, gazeX: 0, gazeY: 0, smile: 0 }).yaw), 8);
	const sw = rigOf({ ...RAW_ZERO, eyeL: 0 }, undefined, undefined, { eyes: true, yaw: false, pitch: false, roll: false, gazeX: false, gazeY: false });
	assert.equal(Math.round(sw.eyeR), 0);
});

test('the smoother holds a still face still and still shows a blink at once', () => {
	const s = new RigSmoother();
	const out: Rig[] = [];
	for (let i = 0; i < 20; i++) out.push(s.push(rigOf({ ...RAW_ZERO, yaw: i % 2 ? 2.5 : -2.5 })));
	assert.ok(out.slice(5).every((r) => r.yaw === out[5].yaw), 'a little noise does not flicker the digit');
	const shut = s.push(rigOf({ ...RAW_ZERO, eyeL: 0, eyeR: 0 }));
	assert.ok(shut.eyeL <= 3, `a blink shows in one frame (eyeL ${shut.eyeL})`);
	s.amount = 0;
	assert.equal(s.push(rigOf({ ...RAW_ZERO, mouth: 0.8 })).mouth, 15);
});

test('pose from a transform: none at rest, a turn about the upright, a lean in the picture', () => {
	const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
	const p0 = poseFromMatrix(I);
	assert.ok(Math.abs(p0.yaw) < 1e-9 && Math.abs(p0.pitch) < 1e-9 && Math.abs(p0.roll) < 1e-9);
	const a = (20 * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
	// Column-major rotation about y by 20 degrees.
	const Ry = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
	assert.ok(Math.abs(Math.abs(poseFromMatrix(Ry).yaw) - 20) < 1e-6);
	const Rz = [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
	assert.ok(Math.abs(Math.abs(poseFromMatrix(Rz).roll) - 20) < 1e-6);
});

test('pose from BlazeFace points: square to the camera reads as rest; a nose off centre turns; a slope leans', () => {
	const eyeA = { x: 0.4, y: 0.4 }, eyeB = { x: 0.6, y: 0.4 }, mouth = { x: 0.5, y: 0.6 };
	const rest = poseFromPoints({ eyeA, eyeB, nose: { x: 0.5, y: 0.5 }, mouth }, 1);
	assert.ok(Math.abs(rest.yaw) < 1e-9 && Math.abs(rest.roll) < 1e-9 && Math.abs(rest.pitch) < 1e-9);
	// The nose toward the picture's left is toward the mirror's right: a turn to the drawing's right.
	assert.ok(poseFromPoints({ eyeA, eyeB, nose: { x: 0.45, y: 0.5 }, mouth }, 1).yaw > 10);
	// The picture's left eye lower: in the mirror the right side drops, a clockwise lean.
	assert.ok(poseFromPoints({ eyeA: { x: 0.4, y: 0.45 }, eyeB, nose: { x: 0.5, y: 0.5 }, mouth }, 1).roll > 5);
	// The nose higher between eyes and mouth: tipped up.
	assert.ok(poseFromPoints({ eyeA, eyeB, nose: { x: 0.5, y: 0.47 }, mouth }, 1).pitch > 0);
});

test('blendshapes to raw measures: blinks, jaw, smile, gaze by MediaPipe\'s names', () => {
	const r = rawFromBlendshapes([
		{ categoryName: 'eyeBlinkLeft', score: 0.9 }, { categoryName: 'eyeBlinkRight', score: 0.05 },
		{ categoryName: 'jawOpen', score: 0.5 }, { categoryName: 'mouthSmileLeft', score: 0.6 }, { categoryName: 'mouthSmileRight', score: 0.4 },
		{ categoryName: 'eyeLookOutRight', score: 0.6 }, { categoryName: 'eyeLookInLeft', score: 0.6 }
	]);
	assert.equal(r.eyeL, 0);
	assert.equal(r.eyeR, 1);
	assert.equal(r.mouth, 0.5);
	assert.ok(Math.abs(r.smile - 0.5) < 1e-9);
	assert.ok(r.gazeX > 0.5, 'looking to the player\'s right is to the drawing\'s right');
});

/** A grey patch w x h: skin, with a dark blob of the given height (rows) centred at (cx, cy). */
function patch(w: number, h: number, blobH: number, blobW: number, cx = (w - 1) / 2, cy = (h - 1) / 2) {
	const out: number[] = [];
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push(Math.abs(y - cy) < blobH / 2 && Math.abs(x - cx) < blobW / 2 ? 30 : 180);
	return out;
}
test('eye heuristic: an open eye is taller dark than a shut one, and the pupil\'s place is the look', () => {
	const open = eyeMeasure(patch(20, 12, 6, 6), 20, 12), shut = eyeMeasure(patch(20, 12, 2, 12), 20, 12);
	assert.ok(open.open > shut.open * 2, `${open.open} vs ${shut.open}`);
	assert.ok(eyeMeasure(patch(20, 12, 6, 4, 15), 20, 12).look > 0.3);
	assert.ok(eyeMeasure(patch(20, 12, 6, 4, 4), 20, 12).look < -0.3);
});
test('mouth heuristic: open is a tall dark hole, a smile a wider line', () => {
	const shut = mouthMeasure(patch(24, 14, 2, 10), 24, 14), open = mouthMeasure(patch(24, 14, 7, 10), 24, 14), wide = mouthMeasure(patch(24, 14, 2, 18), 24, 14);
	assert.ok(open.open > shut.open);
	assert.ok(wide.wide > shut.wide);
});
test('a learnt range turns any measure into 0..1 for this face', () => {
	const r = new Range();
	r.push(0.2); r.push(0.6);
	assert.equal(r.push(0.6), 1);
	assert.ok(r.push(0.2) < 0.05);
	assert.ok(Math.abs(r.push(0.4) - 0.5) < 0.05);
});

test('tools/avatar-test.html carries the current compiled test page', () => {
	execFileSync(process.execPath, ['tools/avatar-test-inline.mjs', '--check'], { cwd: new URL('..', import.meta.url), stdio: 'pipe' });
	const html = readFileSync(new URL('../tools/avatar-test.html', import.meta.url), 'utf8');
	// The only things fetched are MediaPipe's runtime and models, and a report sent back on request.
	const urls = [...html.matchAll(/https?:\/\/[a-z0-9.-]+/g)].map((m) => m[0]);
	for (const u of urls) assert.ok(['https://cdn.jsdelivr.net', 'https://storage.googleapis.com', 'http://x'].includes(u) || u.startsWith('http://www.w3.org'), u);
});
