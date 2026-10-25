import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBlueprint } from '../src/town/blueprint.ts';
import { makeWorld, path, walkable, atSpeakingPlace } from '../src/town/map.ts';

const bp = parseBlueprint(readFileSync(new URL('../town/castle.tbp', import.meta.url), 'utf8'));
const [town, upper] = makeWorld(bp).levels;
const things = (name: string) => town.cells.map((c, i) => (c.things.includes(name) ? i : -1)).filter((i) => i >= 0);
const xy = (i: number) => ({ x: i % town.w, y: Math.floor(i / town.w) });
const named = (text: string) => town.labels.find((l) => l.text === text);

test('Ravensburg: a castle of two courts above its market town, after the plans', () => {
	assert.equal(bp.d, 2);
	for (const name of ['Great Hall', 'Great Chambers', 'Kitchens', 'Bakehouse', 'Gatehouse', 'Barbican', 'Moat', 'Dam', 'Outer Court', 'Stables', 'Outer Gatehouse', 'Market Cross'])
		assert.ok(named(name), `the ${name} is named`);
	// The market cross is the speaking place, in the middle of its benches.
	const cross = xy(things('statue').map(xy).map((p) => p.x + p.y * town.w).find((i) => xy(i).y > 95)!);
	assert.ok(atSpeakingPlace(town, { x: cross.x - 1, y: cross.y }));
});

test('the council sits at the long table in the great hall, inside the castle', () => {
	const hall = named('Great Hall')!;
	assert.ok(town.council && town.council.seats.length >= 15);
	assert.ok(town.council!.seats.every((p) => p.y > hall.y && p.y < hall.y + 10), 'every seat in the hall');
});

test('the way in: over the moat by the barbican, through the gatehouse; the walls are walked above', () => {
	const moat = named('Moat')!;
	// The moat cannot be waded; the barbican's bridge crosses it.
	assert.ok(!walkable(town, moat.x + 4, moat.y + 1));
	const from = town.seats[0];
	assert.ok(path(town, from, town.council!.seats[0]).length > 0, 'from the market to the great hall');
	// The wall-walk runs round the curtain on the upper level.
	assert.ok(walkable(upper, 50, 6) && walkable(upper, 30, 25));
});
