import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACES, FIGURES, cleanLook, defaultLook } from '../src/town/avatar.ts';

test('a choice from a phone is always one that can be drawn', () => {
	assert.deepEqual(cleanLook({ figure: 2, face: 3 }), { figure: 2, face: 3 });
	assert.deepEqual(cleanLook({ figure: 9999, face: -1 }), { figure: 0, face: 0 });
	assert.deepEqual(cleanLook({ figure: '1', face: 1.5 }), { figure: 0, face: 0 });
	assert.deepEqual(cleanLook(null), { figure: 0, face: 0 });
});

test('every figure and every face is one glyph, none listed twice', () => {
	for (const list of [FIGURES, FACES]) {
		assert.ok(list.length > 0);
		assert.equal(new Set(list).size, list.length);
		for (const g of list) assert.ok(g.trim().length > 0 && !/\s/.test(g), 'no gaps: ' + g);
	}
});

test('someone who has not chosen has a figure and a face of their own, however many play', () => {
	for (const k of [0, 1, 14, 100, -1]) {
		const l = defaultLook(k);
		assert.ok(l.figure >= 0 && l.figure < FIGURES.length);
		assert.ok(l.face >= 0 && l.face < FACES.length);
	}
	assert.notEqual(FIGURES[defaultLook(0).figure], FIGURES[defaultLook(1).figure]);
});
