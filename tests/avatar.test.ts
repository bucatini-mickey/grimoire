import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACES, HATS, cleanLook, defaultLook, lookBust, lookGlyph } from '../src/town/avatar.ts';

test('a figure from a phone is always one that can be drawn', () => {
	assert.deepEqual(cleanLook({ f: 2, h: 3 }), { f: 2, h: 3 });
	assert.deepEqual(cleanLook({ f: 99, h: -1 }), { f: 0, h: 0 });
	assert.deepEqual(cleanLook({ f: '1', h: 1.5 }), { f: 0, h: 0 });
	assert.deepEqual(cleanLook(null), { f: 0, h: 0 });
});

test('every face and headgear makes its own glyph on the map, and a bust nine wide', () => {
	const seen = new Set<string>();
	for (let f = 0; f < FACES.length; f++) for (let h = 0; h < HATS.length; h++) {
		seen.add(lookGlyph({ f, h }));
		const bust = lookBust({ f, h });
		assert.equal(bust.length, 6);
		for (const l of bust) assert.equal(l.length, 9, FACES[f].name + ' ' + HATS[h].name + ': ' + l);
	}
	assert.equal(seen.size, FACES.length * HATS.length);
});

test('someone who has not chosen still has headgear, however many play', () => {
	for (const k of [0, 1, 14, 100, -1]) assert.ok(defaultLook(k).h > 0 && defaultLook(k).h < HATS.length);
});
