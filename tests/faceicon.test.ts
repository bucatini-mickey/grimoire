import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACES, FIGURES } from '../src/town/avatar.ts';
import { faceOf, figureOf, bannerStrength, bannerStep, NEAR_MAX, FACE_DEAD } from '../src/town/faceicon.ts';

test('a player walks as a figure of their own, and sits at the table as a face; the dead are a dagger', () => {
	assert.equal(figureOf({}, 3), figureOf({}, 3), 'each keeps their own');
	assert.notEqual(figureOf({}, 0), figureOf({}, 1));
	const look = { figure: 3, face: 2 };
	assert.equal(figureOf({ look }, 1), FIGURES[3], 'the figure they chose comes first');
	assert.equal(faceOf({ look }, 1), FACES[2], 'and the face');
	assert.equal(figureOf({ dead: true, look }, 1), FACE_DEAD);
	assert.equal(faceOf({ look }, 1, true), FACE_DEAD);
	assert.equal(typeof faceOf(undefined, 4), 'string', 'someone not in the village still has a face');
});

test('the name banner is full close by, fades with distance and is gone beyond reach', () => {
	assert.equal(bannerStrength(0), 0);
	assert.equal(bannerStrength(1), 1);
	assert.equal(bannerStrength(NEAR_MAX), 0);
	assert.equal(bannerStrength(40), 0);
	let last = 1;
	for (let d = 2; d < NEAR_MAX; d += 0.25) { const s = bannerStrength(d); assert.ok(s <= last); last = s; }
	assert.equal(bannerStep(1), 2);
	assert.equal(bannerStep(0.5), 1);
	assert.equal(bannerStep(0.2), 0);
	assert.equal(bannerStep(0), -1);
});
