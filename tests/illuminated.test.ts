import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CHARACTERS } from '../src/core/index.ts';
import { texturaPixels } from '../src/ui/ascii.ts';

// A player woken at night is shown their character's name lettered large on one line (wakepages.ts,
// namePlate): every character a player can be must fit across a phone's 64 columns, condensed if need be.
test('every character a player can be has its name lettered on one line on a phone', () => {
	const wide = ALL_CHARACTERS.filter((c) => c.team !== 'fabled' && c.team !== 'loric').filter((c) => !texturaPixels(c.name, 3) || texturaPixels(c.name, 3)!.w > 62).map((c) => c.name);
	assert.deepEqual(wide, []);
});
