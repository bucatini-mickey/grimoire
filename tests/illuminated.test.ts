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

// The town's cells: a desktop a little less zoomed in than before (34 px); a phone held upright gets cells PHONE_CELL_PX wide.
test('the town’s cell size: desktop smaller than before, a phone’s cells about PHONE_CELL_PX wide', async () => {
	const { townScale, PHONE_CELL_PX } = await import('../src/ui/ascii.ts');
	const ratio = 0.6;
	const desk = townScale(1920, 1080, ratio, true);
	assert.ok(desk.maxFont < 34 && desk.maxFont >= 24, 'a little less than the old 34 px');
	for (const [w, h] of [[390, 844], [360, 800], [412, 915], [430, 932], [320, 640]]) {
		const f = townScale(w, h, ratio, false);
		const cell = f.maxFont * ratio;
		assert.ok(cell <= PHONE_CELL_PX + 1, `${w}x${h}: a cell is ${cell.toFixed(1)} px, about ${PHONE_CELL_PX}`);
		assert.ok(f.cols >= 26 && f.cols * cell <= w, `${w}x${h}: ${f.cols} columns fit`);
		if (w >= 360) assert.ok(Math.abs(cell - PHONE_CELL_PX) <= 0.7, `${w}x${h}: same cell size on every ordinary phone`);
	}
	// A phone on its side keeps the desktop’s rule.
	assert.deepEqual(townScale(844, 390, ratio, false), desk);
});

test('the village bar keeps the Menu on it at phone width, not behind More', async () => {
	const { pickBar, btn, segWidth } = await import('../src/ui/ascii.ts');
	const noop = () => {};
	const all = ['Talk', 'End', 'People', 'Lower hand', 'Menu', 'Faces'].map((l) => btn(l, noop));
	const more = btn('More', noop);
	for (const cols of [30, 36, 44]) {
		const { bar, more: rest } = pickBar(all, cols, (b) => b.label === 'Menu', more);
		assert.ok(bar.some((b) => b.label === 'Menu'), `Menu on the bar at ${cols} columns`);
		assert.ok(!rest.some((b) => b.label === 'Menu'));
		assert.ok(bar.reduce((k, b) => k + segWidth(b), 0) <= cols, 'the bar fits');
	}
	assert.equal(pickBar(all, 200, (b) => b.label === 'Menu', more).more.length, 0);
});
