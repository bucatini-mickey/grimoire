import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iconOf, bannerStrength, bannerStep, NEAR_MAX, FACE_ME, FACE_OTHER, FACE_DEAD } from '../src/town/faceicon.ts';

test('a player is a face with their initial beside it; yours is the hollow one', () => {
	assert.deepEqual(iconOf({ name: 'ada' }, false), [FACE_OTHER, 'A']);
	assert.deepEqual(iconOf({ name: 'ada' }, true), [FACE_ME, 'A']);
	assert.equal(iconOf({ name: 'ada', dead: true }, false)[0], FACE_DEAD);
	assert.equal(iconOf({ name: '', }, false)[1], '?');
	assert.notEqual(FACE_ME, FACE_OTHER);
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
