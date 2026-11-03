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

test('a player\u2019s letter has a faint backing of its own ink, whichever of the fifteen colours it is', async () => {
	const { personInk, letterPlate } = await import('../src/ui/ascii.ts');
	const { shade } = await import('../src/term/pterm.ts');
	for (let k = 0; k < 15; k++) {
		const [fg, bg] = personInk(k);
		const plate = letterPlate(fg, bg);
		assert.notEqual(plate, fg, `seat ${k}: the backing is not the letter\u2019s own ink`);
		assert.equal(plate, bg || shade(fg, 0), `seat ${k}`);
	}
});
