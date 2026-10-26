import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CHARACTERS } from '../src/core/index.ts';
import { texturaPixels } from '../src/ui/ascii.ts';
import { readFileSync } from 'node:fs';

// A player woken at night is shown their character's name lettered large on one line (wakepages.ts,
// namePlate): every character a player can be must fit across a phone's 64 columns, condensed if need be.
test('every character a player can be has its name lettered on one line on a phone', () => {
	const wide = ALL_CHARACTERS.filter((c) => c.team !== 'fabled' && c.team !== 'loric').filter((c) => !texturaPixels(c.name, 3) || texturaPixels(c.name, 3)!.w > 62).map((c) => c.name);
	assert.deepEqual(wide, []);
});

test('every character has a portrait, sixteen pixels square, in inks the file names', () => {
	const { ink, figures } = JSON.parse(readFileSync(new URL('../art/portraits.json', import.meta.url), 'utf8'));
	for (const c of ALL_CHARACTERS) {
		const f: string[] = figures[c.id];
		assert.ok(f, `${c.id} has a portrait`);
		assert.equal(f.length, 16, c.id);
		for (const r of f) { assert.equal(r.length, 16, c.id); for (const ch of r) assert.ok(ch === '.' || ink[ch], `${c.id}: ink ${ch}`); }
	}
});
