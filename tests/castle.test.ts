import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBlueprint } from '../src/town/blueprint.ts';
import { makeTown, makeWorld, path, walkable, atSpeakingPlace, stairGoes } from '../src/town/map.ts';

const bp = parseBlueprint(readFileSync(new URL('../town/castle.tbp', import.meta.url), 'utf8'));
const town = makeTown(bp);
const things = (name: string) => town.cells.map((c, i) => (c.things.includes(name) ? i : -1)).filter((i) => i >= 0);
const xy = (i: number) => ({ x: i % town.w, y: Math.floor(i / town.w) });

test('the castle town: two levels, ringed by forest, homes for fifteen and more', () => {
	assert.equal(bp.d, 2);
	for (let x = 0; x < town.w; x++) for (const y of [0, town.h - 1]) assert.ok(!walkable(town, x, y), `edge ${x},${y}`);
	assert.ok(town.homes.length >= 15, `${town.homes.length} homes`);
	assert.equal(town.seats.length, 15);
	assert.ok(town.labels.length >= 25);
});

test('the old oak is the speaking place, in the middle of the benches', () => {
	const oak = xy(things('oak')[0]);
	assert.ok(Math.hypot(oak.x + 0.5 - town.meeting!.at.x, oak.y + 0.5 - town.meeting!.at.y) < 1.5);
	assert.ok(atSpeakingPlace(town, { x: oak.x - 1, y: oak.y }));
});

test('every door can be reached from the square; so can the mine and the great hall', () => {
	const from = town.seats[0];
	for (const d of things('door')) {
		const p = xy(d);
		assert.ok(path(town, from, p).length > 0, `door at ${p.x},${p.y}`);
	}
	assert.ok(path(town, from, { x: 103, y: 57 }).length > 0, 'the mine gallery');
	assert.ok(things('oven').length >= 2 && things('loom').length >= 1 && things('anvil').length >= 1 && things('altar').length >= 1);
	// The round table sits in the great hall, chairs round it.
	const tables = things('table').map(xy).filter((p) => p.y < 22 && p.x < 61);
	assert.ok(tables.length >= 10);
	// The council: the town sits round it for nominations, a chair for each of fifteen players and more.
	assert.ok(town.council && town.council.seats.length >= 15, `${town.council?.seats.length} council seats`);
	assert.ok(town.council!.seats.every((p) => p.y < 22 && p.x < 61), 'all in the great hall');
	assert.ok(path(town, from, town.council!.seats[0]).length > 0, 'the square to the round table');
});

test('stairs join the levels: every way up has a way down at the same spot, and rooms to reach above', () => {
	const [ground, upper] = makeWorld(bp).levels;
	let pairs = 0;
	for (let i = 0; i < ground.w * ground.h; i++) {
		const x = i % ground.w, y = Math.floor(i / ground.w);
		if (stairGoes(ground.cells[i]) !== 1) continue;
		assert.equal(stairGoes(upper.cells[i]), -1, `the stair up at ${x},${y} lands on a stair down`);
		assert.ok(path(ground, { x: 55, y: 59 }, { x, y }).length > 0, `the stair at ${x},${y} can be reached from the square`);
		pairs++;
	}
	assert.ok(pairs >= 5, `${pairs} stairs`);
	// Upstairs there are beds to be had, and open air between the buildings.
	assert.ok(upper.cells.some((c) => c.things.includes('bed')));
	assert.ok(!walkable(upper, 55, 59), 'the square has no upper floor');
});
