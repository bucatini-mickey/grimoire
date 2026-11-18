import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rawFromMesh } from '../src/avatar/trackers.ts';

// The face mesh of MediaPipe's portrait.jpg (a woman facing the camera, eyes open, lips a little apart), as the
// WebGL-free tracker found it (TensorFlow.js on WebAssembly, 18 Nov): 478 points in pixels.
const pts = (JSON.parse(readFileSync(new URL('./fixtures/mesh-portrait.json', import.meta.url), 'utf8')) as [number, number][]).map(([x, y]) => ({ x, y }));

test('face mesh: open eyes read open, gaze ahead', () => {
	const r = rawFromMesh(pts);
	assert.ok(r.eyeL > 0.6 && r.eyeR > 0.6, `eyes ${r.eyeL.toFixed(2)} ${r.eyeR.toFixed(2)}`);
	assert.ok(Math.abs(r.gazeX) < 0.5 && Math.abs(r.gazeY) < 0.5, `gaze ${r.gazeX.toFixed(2)} ${r.gazeY.toFixed(2)}`);
});

test('face mesh: lids closed read shut, lips together read closed and wide apart open, brows raised read higher', () => {
	const shut = pts.map((p) => ({ ...p }));
	// Lower each upper lid onto its lower lid.
	for (const [up, low] of [[159, 145], [386, 374]]) shut[up] = { ...shut[low] };
	const open = pts.map((p) => ({ ...p }));
	open[14] = { x: open[14].x, y: open[14].y + 25 };
	const closed = pts.map((p) => ({ ...p }));
	closed[14] = { ...closed[13] };
	const up = pts.map((p) => ({ ...p }));
	for (const b of [105, 334]) up[b] = { x: up[b].x, y: up[b].y - 6 };
	const r0 = rawFromMesh(pts), r1 = rawFromMesh(shut), r2 = rawFromMesh(open), r3 = rawFromMesh(up);
	assert.ok(r1.eyeL < 0.1 && r1.eyeR < 0.1, 'shut');
	assert.equal(rawFromMesh(closed).mouth, 0, 'lips together');
	assert.ok(r2.mouth > r0.mouth + 0.3, 'open mouth');
	assert.ok(r3.browL > r0.browL + 0.5 && r3.browR > r0.browR + 0.5, 'raised brows');
});
