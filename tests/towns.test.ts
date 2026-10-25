import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBlueprint } from '../src/town/blueprint.ts';
import { makeWorld, path, walkable, stairGoes } from '../src/town/map.ts';

// Every town a game can be played in keeps the same promises: a home for each of fifteen players, the ring
// of fifteen seats round a speaking place, a council table for fifteen, every door reachable, every stair
// leading somewhere, and nothing walkable off the edge of the map.
for (const file of ['castle', 'victorian', 'grimm', 'whitechapel', 'hamlet', 'abbey', 'liner']) {
	let text: string;
	try { text = readFileSync(new URL(`../town/${file}.tbp`, import.meta.url), 'utf8'); } catch { continue; }
	const bp = parseBlueprint(text);
	const world = makeWorld(bp);
	const town = world.levels[0];
	const xy = (i: number) => ({ x: i % town.w, y: Math.floor(i / town.w) });

	test(`${file}: homes, seats and a council for fifteen`, () => {
		const homes = world.levels.reduce((k, l) => k + l.homes.length, 0);
		assert.ok(homes >= 15, `${homes} homes`);
		assert.equal(town.seats.length, 15, `${town.seats.length} seats in the open`);
		assert.ok(town.council && town.council.seats.length >= 15, `${town.council?.seats.length} council seats`);
		for (let x = 0; x < town.w; x++) for (const y of [0, town.h - 1]) assert.ok(!walkable(town, x, y), `edge ${x},${y}`);
		for (let y = 0; y < town.h; y++) for (const x of [0, town.w - 1]) assert.ok(!walkable(town, x, y), `edge ${x},${y}`);
	});

	test(`${file}: every door, the council and every stair can be reached from the seats`, () => {
		const from = town.seats[0];
		for (let i = 0; i < town.w * town.h; i++) {
			const c = town.cells[i];
			if (!c.things.includes('door') && stairGoes(c) !== 1) continue;
			const p = xy(i);
			assert.ok(path(town, from, p).length > 0, `${c.things.includes('door') ? 'door' : 'stair'} at ${p.x},${p.y}`);
			if (stairGoes(c) === 1) assert.equal(stairGoes(world.levels[1]?.cells[i]), -1, `the stair at ${p.x},${p.y} lands on a stair down`);
		}
		assert.ok(path(town, from, town.council!.seats[0]).length > 0, 'the seats to the council table');
	});
}
