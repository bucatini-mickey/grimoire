import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faceOf, bannerStrength, bannerStep, NEAR_MAX, HEADS, FACE_DEAD } from '../src/town/faceicon.ts';

test('a player wears headgear of their own, the same all game; the dead are a dagger', () => {
	assert.equal(faceOf({}, 0), HEADS[0]);
	assert.equal(faceOf({}, HEADS.length + 1), HEADS[1], 'each keeps their own, however many play');
	assert.equal(faceOf({ dead: true }, 3), FACE_DEAD);
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
