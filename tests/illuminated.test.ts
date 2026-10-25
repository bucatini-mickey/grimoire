import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CHARACTERS } from '../src/core/index.ts';
import { illuminatedName } from '../src/ui/ascii.ts';
import { CARD_COLS } from '../src/ui/wakepages.ts';

// A player woken at night is shown their character's name lettered under an arch (wakepages.ts): every
// character a player can be must letter there on a phone, condensed or a word a line if need be.
test('every character a player can be has its name lettered under the arch', () => {
	const missing = ALL_CHARACTERS.filter((c) => c.team !== 'fabled' && c.team !== 'loric' && !illuminatedName(c.name, 'good', CARD_COLS)).map((c) => c.name);
	assert.deepEqual(missing, []);
});
