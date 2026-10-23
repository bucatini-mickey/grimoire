import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBlueprint } from '../src/town/blueprint.ts';
import { makeTown, makeWorld, path, walkable, atSpeakingPlace, stairGoes } from '../src/town/map.ts';
import { sky } from '../src/town/look.ts';

const bp = parseBlueprint(readFileSync(new URL('../town/victorian.tbp', import.meta.url), 'utf8'));
const town = makeTown(bp);
const things = (name: string) => town.cells.map((c, i) => (c.things.includes(name) ? i : -1)).filter((i) => i >= 0);
const xy = (i: number) => ({ x: i % town.w, y: Math.floor(i / town.w) });

test('Saltgrave: an island of two levels, sealed by the sea, homes for fifteen and more, fifteen benches', () => {
	assert.equal(bp.d, 2);
	for (let x = 0; x < town.w; x++) for (const y of [0, town.h - 1]) assert.ok(!walkable(town, x, y), `edge ${x},${y}`);
	for (let y = 0; y < town.h; y++) for (const x of [0, town.w - 1]) assert.ok(!walkable(town, x, y), `edge ${x},${y}`);
	assert.ok(town.homes.length >= 15, `${town.homes.length} homes`);
	assert.equal(town.seats.length, 15);
});

test('the public clock is the speaking place', () => {
	const clock = xy(things('clock')[0]);
	assert.ok(Math.hypot(clock.x - town.meeting!.at.x, clock.y - town.meeting!.at.y) < 1.5);
	assert.ok(atSpeakingPlace(town, { x: clock.x + 1, y: clock.y }));
});

test('every door and every bed can be reached from the square; the Undercroft is indoors and out of the sky', () => {
	const from = town.seats[0];
	for (const d of things('door')) assert.ok(path(town, from, xy(d)).length > 0, `door at ${xy(d).x},${xy(d).y}`);
	for (const b of things('bed')) {
		const p = xy(b);
		const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy })).find((q) => walkable(town, q.x, q.y));
		assert.ok(next && path(town, from, next).length > 0, `bed at ${p.x},${p.y}`);
	}
	const sigils = things('sigil').map(xy);
	assert.ok(sigils.length >= 10);
	const s = sky(town);
	for (const p of sigils) {
		const i = p.x + p.y * town.w;
		assert.notEqual(town.room[i], town.outdoors, 'the sigil chamber is not outdoors');
		assert.equal(s[i], 0, 'no daylight reaches the sigil chamber');
	}
	assert.ok(things('gas lamp').length >= 20 && things('fern').length >= 12);
});

test('Saltgrave: the Assembly Rooms seat the council; stairs lead up to the inn, the terraces, the lofts and the lamp room', () => {
	const [ground, upper] = makeWorld(bp).levels;
	assert.ok(ground.council && ground.council.seats.length >= 15, `${ground.council?.seats.length} at the round table`);
	assert.ok(path(ground, ground.seats[0], ground.council!.seats[0]).length > 0, 'the square to the round table');
	let stairs = 0;
	for (let i = 0; i < ground.w * ground.h; i++) {
		if (stairGoes(ground.cells[i]) !== 1) continue;
		const p = { x: i % ground.w, y: Math.floor(i / ground.w) };
		assert.equal(stairGoes(upper.cells[i]), -1, `the stair at ${p.x},${p.y} lands on a stair down`);
		assert.ok(path(ground, ground.seats[0], p).length > 0, `the stair at ${p.x},${p.y} can be reached`);
		stairs++;
	}
	assert.ok(stairs >= 8, `${stairs} stairs`);
	assert.ok(upper.cells.some((c) => c.things.includes('gas lamp')), 'the lighthouse lamp burns up the stair');
	assert.ok(upper.cells.filter((c) => c.things.includes('bed')).length >= 5, 'bedrooms upstairs');
});
