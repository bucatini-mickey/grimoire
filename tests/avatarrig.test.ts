import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
	avatarShows, decodeLook, decodeRig, DEFAULT_LOOK, DETAIL_SIZE, detailFor, detailThatFits, drawRig, encodeLook, encodeRig, LOOK_LEN, NEUTRAL, planRigs, rdiv,
	RIG_KEYS, rigInks, rigText, withVoice
} from '../src/avatar/rig.ts';
import { edgeGlyph, LOOK_N } from '../src/avatar/righead.ts';
import type { Look } from '../src/avatar/righead.ts';
import type { Detail, Rig, RigSent } from '../src/avatar/rig.ts';
import { eyeMeasure, LookBuilder, mouthMeasure, poseFromMatrix, poseFromPoints, Range, rawFromBlendshapes, RAW_ZERO, RigSmoother, rigOf } from '../src/avatar/trackers.ts';

const rig = (p: Partial<Rig> = {}): Rig => ({ ...NEUTRAL, ...p });

test('a rig is eleven hex digits, both ways; anything else is refused', () => {
	const r = rig({ eyeL: 0, mouth: 15, yaw: 3, browR: 2 });
	const s = encodeRig(r);
	assert.equal(s.length, 11);
	assert.equal(encodeRig(NEUTRAL), 'bb088888888');
	assert.deepEqual(decodeRig(s), r);
	for (const bad of ['', 'bb0888888', 'bb0888888888', 'bb08888888g', 'BB088888888', 42, null]) assert.equal(decodeRig(bad), null);
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
		for (const p of [{ eyeL: 0, eyeR: 0 }, { mouth: 15 }, { smile: 15 }, { smile: 0 }, { yaw: 15 }, { yaw: 0 }, { browL: 15, browR: 15 }])
			assert.notEqual(rigText(drawRig(rig(p), w, h)), rigText(base), `detail ${d}: ${JSON.stringify(p)}`);
	}
	const big = DETAIL_SIZE[3];
	for (const p of [{ roll: 15 }, { roll: 1 }, { pitch: 15 }, { gazeX: 15 }, { gazeY: 15 }, { eyeR: 0 }, { browL: 0 }, { browR: 15 }])
		assert.notEqual(rigText(drawRig(rig(p), big.w, big.h)), rigText(drawRig(NEUTRAL, big.w, big.h)), JSON.stringify(p));
});

test('the near avatar at rest: a head under its hair, brows, eyes, a nose, a mouth', () => {
	const t = rigText(drawRig(NEUTRAL, 16, 8));
	assert.equal(t, [
		'   __//~~\\\\__    ',
		'   ////~~\\\\\\\\    ',
		'  ||        ||   ',
		'  | ---  --- |   ',
		'  | (o)  (o) |   ',
		'   |    |   |    ',
		'   |  ----- |    ',
		'    \\\\----//     '
	].map((r) => r.slice(0, 16)).join('\n'));
	assert.equal(rigText(drawRig(rig({ smile: 15 }), 5, 2)), '(o o)\n \\_/ ');
	// Brows: raised an arch, lowered a frown sloping to the nose.
	assert.match(rigText(drawRig(rig({ browL: 15, browR: 15 }), 16, 8)).split('\n')[3], /\/-\\.*\\-\//);
	assert.match(rigText(drawRig(rig({ browL: 0, browR: 0 }), 16, 8)).split('\n')[3], /--\\ +\/--/);
});

test('a wink shuts one eye only, on the side it is drawn', () => {
	const t = rigText(drawRig(rig({ eyeR: 0 }), 16, 8)).split('\n')[4];
	assert.ok(t.slice(0, 8).includes('o') && !t.slice(8).includes('o'), t);
});

test('the whole head turns and leans: the outline and hair move, not just the features', () => {
	const rows = (r: Rig) => rigText(drawRig(r, 16, 8)).split('\n');
	const n = rows(NEUTRAL), right = rows(rig({ yaw: 15 })), lean = rows(rig({ roll: 15 }));
	// The crown and the jaw both change with a turn and with a lean.
	for (const r of [right, lean]) { assert.notEqual(r[0], n[0]); assert.notEqual(r[7], n[7]); }
	// Turned to the drawing's right, the face slides right: the eyes' middle moves right.
	const mid = (row: string) => { const i = [...row].map((c, k) => (c === 'o' ? k : -1)).filter((k) => k >= 0); return i.reduce((a, b) => a + b, 0) / i.length; };
	assert.ok(mid(right[4]) > mid(n[4]), right.join('\n'));
	// Leaning clockwise, the right eye sits lower than the left.
	const eyeRow = (side: 'l' | 'r') => lean.findIndex((row) => { const k = row.indexOf('o'), j = row.lastIndexOf('o'); return side === 'l' ? k >= 0 && k < 8 : j >= 8; });
	assert.ok(eyeRow('r') > eyeRow('l'), lean.join('\n'));
});

test('a look: 132 hex digits both ways; its hair and face shape the head', () => {
	const s = encodeLook(DEFAULT_LOOK);
	assert.equal(s.length, LOOK_LEN);
	assert.deepEqual(decodeLook(s), DEFAULT_LOOK);
	for (const bad of ['', s.slice(1), s.slice(0, 3) + '2' + s.slice(4), s.slice(0, -1) + 'f', null]) assert.equal(decodeLook(bad), null);
	// Long hair: hair down both sides past the chin draws as hanging strands where the default has none.
	const long: Look = { ...DEFAULT_LOOK, mask: DEFAULT_LOOK.mask.map((g, i) => { const x = i % LOOK_N, y = Math.floor(i / LOOK_N); return g === 0 && y >= 6 && (x === 2 || x === 3 || x === 12 || x === 13) ? 2 : g; }) };
	const a = rigText(drawRig(NEUTRAL, 16, 8, long)), b = rigText(drawRig(NEUTRAL, 16, 8));
	assert.notEqual(a, b);
	assert.ok(rigInks(drawRig(NEUTRAL, 16, 8, long)).split('\n').slice(5).some((r) => r.includes('3')), 'hair below the eyes');
	// An empty look (no head captured) draws nothing but the features.
	const none: Look = { ...DEFAULT_LOOK, mask: DEFAULT_LOOK.mask.map(() => 0) };
	assert.ok(!rigInks(drawRig(NEUTRAL, 16, 8, none)).includes('3'));
});

test('the outline glyph follows the edge across the cell', () => {
	assert.equal(edgeGlyph(false, false, true, true), '_');
	assert.equal(edgeGlyph(true, true, false, false), '-');
	assert.equal(edgeGlyph(false, true, false, true), '|');
	assert.equal(edgeGlyph(false, false, false, true), '/');
	assert.equal(edgeGlyph(false, false, true, false), '\\');
});

test('the voice opens the mouth: loud enough, in step with it; never shuts one the camera opened', () => {
	assert.equal(withVoice(NEUTRAL, 0).mouth, 0);
	assert.equal(withVoice(NEUTRAL, 0.05).mouth, 0);
	assert.ok(withVoice(NEUTRAL, 0.3).mouth >= 6);
	assert.equal(withVoice(NEUTRAL, 1).mouth, 13);
	assert.equal(withVoice(rig({ mouth: 15 }), 0.3).mouth, 15);
});

test('a look built from frames keeps what most frames saw', () => {
	const b = new LookBuilder();
	const face = DEFAULT_LOOK.mask.slice();
	for (let i = 0; i < 6; i++) b.add({ mask: i === 0 ? face.map(() => 0) : face, hairLum: [40], skinLum: [200], mouthRow: 13 });
	const l = decodeLook(b.build())!;
	assert.deepEqual(l.mask, face);
	assert.equal(l.hairTone, 2);
	assert.equal(l.mouthRow, 13);
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
	// Two looks: the default, and a made-up one with long hair down one side and a short chin.
	const odd = encodeLook({ ...DEFAULT_LOOK, hairTone: 12, mouthRow: 12, mask: DEFAULT_LOOK.mask.map((g, i) => { const x = i % LOOK_N, y = Math.floor(i / LOOK_N); return y >= 15 ? 0 : g === 0 && x <= 3 && y >= 4 ? 2 : g; }) });
	const looks = ['', odd];
	return { note: 'drawRig (src/avatar/rig.ts) for each rig and look ("" the default) at each size: text rows, and inks (0 ground, 1 outline, 2 features, 3 hair). Regenerate: UPDATE_RIG_GOLDEN=1 npm test', sizes,
		cases: looks.flatMap((look) => rigs.flatMap((r) => sizes.map(([w, h]) => { const c = drawRig(decodeRig(r)!, w, h, look ? decodeLook(look) : null); return { rig: r, look, w, h, text: rigText(c), inks: rigInks(c) }; }))) };
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
	assert.equal(Math.round(rigOf({ ...RAW_ZERO, browL: 0.45 }).browL), 15);
	assert.equal(Math.round(rigOf({ ...RAW_ZERO, browR: -0.45 }).browR), 1);
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
		{ categoryName: 'eyeLookOutRight', score: 0.6 }, { categoryName: 'eyeLookInLeft', score: 0.6 },
		{ categoryName: 'browDownLeft', score: 0.5 }, { categoryName: 'browOuterUpRight', score: 0.6 }, { categoryName: 'browInnerUp', score: 0.2 }
	]);
	assert.ok(r.browL < -0.3, 'a lowered brow frowns');
	assert.ok(r.browR > 0.4, 'a raised brow lifts');
	assert.equal(r.eyeL, 0);
	assert.equal(r.eyeR, 1);
	assert.ok(Math.abs(r.mouth - 0.7) < 1e-9, 'the jaw counts for more than it scores');
	assert.ok(Math.abs(r.smile - 0.5) < 1e-9);
	const sad = rawFromBlendshapes([{ categoryName: 'mouthFrownLeft', score: 0.2 }, { categoryName: 'mouthFrownRight', score: 0.2 }]);
	assert.ok(sad.smile <= -0.5, 'a small frown score still frowns');
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
