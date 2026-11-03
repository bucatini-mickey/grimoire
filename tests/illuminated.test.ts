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

// The town's cells: a desktop a little less zoomed in than before (34 px), a phone held upright fitted to the occlusion zone.
test('the town\u2019s cell size: desktop smaller than before, phone fits the occlusion zone', async () => {
	const { townScale, ZONE_RADIUS, COLS } = await import('../src/ui/ascii.ts');
	const { SIGHT } = await import('../src/town/map.ts');
	assert.equal(ZONE_RADIUS, SIGHT.day + 3);
	const ratio = 0.6;
	const desk = townScale(1920, 1080, ratio, true);
	assert.ok(desk.maxFont < 34 && desk.maxFont >= 24, 'a little less than the old 34 px');
	// A phone 390 x 844: its map (the rows less the village\u2019s bars) is about the zone, not more, and cells no smaller than the width fit.
	for (const [w, h] of [[390, 844], [360, 800], [412, 915], [430, 932]]) {
		const f = townScale(w, h, ratio, false);
		const lh = Math.round(f.maxFont * 1.2), totalRows = Math.floor(h / lh);
		assert.ok(f.maxFont >= Math.floor(w / (COLS * ratio)), `${w}x${h}: never smaller than the width fit`);
		assert.ok(totalRows - 9 <= 2 * ZONE_RADIUS + 1 + 2, `${w}x${h}: ${totalRows - 9} map rows against a zone of ${2 * ZONE_RADIUS + 1}`);
		assert.ok(f.cols >= 36 && f.cols * f.maxFont * ratio <= w + f.maxFont * ratio, `${w}x${h}: ${f.cols} columns`);
	}
	// A phone on its side keeps the desktop\u2019s rule.
	assert.deepEqual(townScale(844, 390, ratio, false), desk);
});
