import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BODIES, HEADS, cleanLook, defaultLook, lookGlyph } from '../src/town/avatar.ts';

test('a figure from a phone is always one that can be drawn', () => {
	assert.deepEqual(cleanLook({ b: 2, h: 3 }), { b: 2, h: 3 });
	assert.deepEqual(cleanLook({ b: 9999, h: -1 }), { b: 0, h: 0 });
	assert.deepEqual(cleanLook({ b: '1', h: 1.5 }), { b: 0, h: 0 });
	assert.deepEqual(cleanLook(null), { b: 0, h: 0 });
});

test('every figure is its own glyph: bodies take each head, whole figures stand alone', () => {
	const seen = new Set<string>();
	let n = 0;
	for (let b = 0; b < BODIES.length; b++) for (let h = 0; h < HEADS.length; h++) {
		if (BODIES[b].whole && h) { assert.equal(lookGlyph({ b, h }), BODIES[b].ch, 'a whole figure takes no head'); continue; }
		seen.add(lookGlyph({ b, h }));
		n++;
	}
	assert.equal(seen.size, n);
});

test('someone who has not chosen has a plain head on a body of their own, however many play', () => {
	for (const k of [0, 1, 14, 100, -1]) {
		const l = defaultLook(k);
		assert.equal(l.h, 0);
		assert.ok(l.b >= 0 && l.b < BODIES.length && !BODIES[l.b].whole);
	}
	assert.notEqual(lookGlyph(defaultLook(0)), lookGlyph(defaultLook(1)));
});
