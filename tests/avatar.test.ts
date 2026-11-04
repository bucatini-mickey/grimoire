import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BODIES, HEADS, cleanLook, defaultLook, lookBust, lookGlyph } from '../src/town/avatar.ts';

test('a figure from a phone is always one that can be drawn', () => {
	assert.deepEqual(cleanLook({ b: 2, h: 3 }), { b: 2, h: 3 });
	assert.deepEqual(cleanLook({ b: 99, h: -1 }), { b: 0, h: 0 });
	assert.deepEqual(cleanLook({ b: '1', h: 1.5 }), { b: 0, h: 0 });
	assert.deepEqual(cleanLook(null), { b: 0, h: 0 });
});

test('every body and head makes its own glyph on the map, and a figure nine wide', () => {
	const seen = new Set<string>();
	for (let b = 0; b < BODIES.length; b++) for (let h = 0; h < HEADS.length; h++) {
		seen.add(lookGlyph({ b, h }));
		const bust = lookBust({ b, h });
		assert.equal(bust.length, 6);
		for (const l of bust) assert.equal(l.length, 9, BODIES[b].name + ' ' + HEADS[h].name + ': ' + l);
	}
	assert.equal(seen.size, BODIES.length * HEADS.length);
});

test('someone who has not chosen has a plain head on a body of their own, however many play', () => {
	for (const k of [0, 1, 14, 100, -1]) {
		const l = defaultLook(k);
		assert.equal(l.h, 0);
		assert.ok(l.b >= 0 && l.b < BODIES.length);
	}
	assert.notEqual(lookGlyph(defaultLook(0)), lookGlyph(defaultLook(1)));
});
