import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBlueprint } from '../src/town/blueprint.ts';
import { makeTown, loudness, perceives, sameRoom, visitedBy, walkable } from '../src/town/map.ts';
import type { Phase, Town, Walker } from '../src/town/map.ts';

const town = makeTown(parseBlueprint(readFileSync(new URL('../town/village.tbp', import.meta.url), 'utf8')));

/** Free, walkable cells in a home room, in reading order. */
function cellsOf(t: Town, room: number): { x: number; y: number }[] {
	const out: { x: number; y: number }[] = [];
	for (let i = 0; i < t.w * t.h; i++) if (t.room[i] === room && walkable(t, i % t.w, Math.floor(i / t.w))) out.push({ x: i % t.w, y: Math.floor(i / t.w) });
	return out;
}

/** The same rules village.ts uses to tell a phone who is about (perceives) and to work out its ears (loudness). */
const sees = (t: Town, viewer: Walker, all: Walker[], phase: Phase) => all.filter((q) => q.id !== viewer.id && perceives(t, viewer, q, phase)).map((q) => q.id);
const hears = (t: Town, viewer: Walker, all: Walker[], phase: Phase) => all.filter((q) => q.id !== viewer.id && loudness(t, viewer, q, phase) > 0).map((q) => q.id);

/** A home with `n` players in it, and a Storyteller who has stepped in beside the first of them (as visit() does). */
function household(n: number) {
	const room = town.homes[0], cells = cellsOf(town, room);
	assert.ok(cells.length >= n + 1, 'room for everyone');
	const players: Walker[] = Array.from({ length: n }, (_, k) => ({ id: 'p' + k, ...cells[k] }));
	const st: Walker = { id: 'st', st: true, ...cells[n], visiting: 'p0' };
	return { players, st, all: [...players, st] };
}

for (const n of [2, 3]) {
	test(`${n} players share a home: the Storyteller visits one, the others hear and see nothing`, () => {
		const { players, st, all } = household(n);
		assert.ok(players.every((p) => sameRoom(town, p, st)), 'all in the one room');
		const [visited, ...housemates] = players;
		// The visited player hears and sees the Storyteller, exactly as if alone.
		assert.equal(loudness(town, visited, st, 'night'), 1);
		assert.equal(loudness(town, st, visited, 'night'), 1);
		// Housemates: nothing, both ways, even though the Storyteller stands in their room.
		for (const h of housemates) {
			assert.equal(loudness(town, h, st, 'night'), 0, 'does not hear the Storyteller');
			assert.equal(loudness(town, st, h, 'night'), 0, 'no line to them either way');
			assert.deepEqual(sees(town, h, all, 'night'), [], 'sees no one: no Storyteller, no visited player, no other housemate');
			assert.deepEqual(hears(town, h, all, 'night'), []);
			assert.ok(!perceives(town, h, st, 'night'));
			assert.ok(!perceives(town, h, visited, 'night'));
		}
		// The visited player's view is what a lone player would have: the Storyteller and nobody else.
		assert.deepEqual(sees(town, visited, all, 'night'), ['st']);
		assert.deepEqual(hears(town, visited, all, 'night'), ['st']);
		const alone = [visited, st];
		assert.deepEqual(sees(town, visited, all, 'night'), sees(town, visited, alone, 'night'));
		assert.deepEqual(hears(town, visited, all, 'night'), hears(town, visited, alone, 'night'));
		// The Storyteller sees everyone, and hears the one they visit.
		assert.deepEqual(sees(town, st, all, 'night').sort(), players.map((p) => p.id).sort());
		assert.deepEqual(hears(town, st, all, 'night'), ['p0']);
	});

	test(`${n} in a home: visiting another housemate swaps who hears, and wandering off visits no one`, () => {
		const { players, st, all } = household(n);
		st.visiting = 'p1';
		assert.equal(loudness(town, players[1], st, 'night'), 1);
		assert.equal(loudness(town, players[0], st, 'night'), 0);
		assert.deepEqual(sees(town, players[0], all, 'night'), []);
		// Out in the street the Storyteller is in nobody's room.
		const out = { ...st, x: 12, y: 30, visiting: null };
		assert.equal(visitedBy(town, out, players), null);
		for (const p of players) assert.equal(loudness(town, p, out, 'night'), 0);
	});
}

test('visitedBy: the player chosen if they are there, else the only player in the room, else nobody', () => {
	const { players, st } = household(3);
	assert.equal(visitedBy(town, { ...st, visiting: 'p2' }, players), 'p2');
	assert.equal(visitedBy(town, { ...st, visiting: 'gone' }, players), null, 'three in the room and no one chosen');
	assert.equal(visitedBy(town, { ...st, visiting: null }, players.slice(0, 1)), 'p0', 'a lone player is visited by walking in');
});

test('a lone player is visited as before', () => {
	const cells = cellsOf(town, town.homes[1]);
	const lone: Walker = { id: 'lone', ...cells[0] }, st: Walker = { id: 'st', st: true, ...cells[1], visiting: 'lone' };
	assert.equal(loudness(town, lone, st, 'night'), 1);
	assert.equal(loudness(town, st, lone, 'night'), 1);
	assert.ok(perceives(town, lone, st, 'night'));
	// Even if the Storyteller only walked in (no visit named), the room's one player is the one visited.
	const walkedIn: Walker = { ...st, visiting: null };
	walkedIn.visiting = visitedBy(town, walkedIn, [lone]);
	assert.equal(walkedIn.visiting, 'lone');
	assert.equal(loudness(town, lone, walkedIn, 'night'), 1);
	// A lone player in another room hears and sees nothing.
	const other: Walker = { id: 'other', ...cellsOf(town, town.homes[2])[0] };
	assert.equal(loudness(town, other, st, 'night'), 0);
	assert.ok(!perceives(town, other, st, 'night'));
	// Another level is another room.
	assert.equal(loudness(town, { ...lone, z: 1 }, st, 'night'), 0);
});

test('the Storyteller with All ears is unaffected: day and circle as ever, night no wider than without', () => {
	const { players, st } = household(3);
	const far = { id: 'far', x: 70, y: 70 };
	const ears = { ...st, ears: true, visiting: 'p0' };
	for (const phase of ['day', 'dusk', 'circle'] as const) {
		assert.equal(loudness(town, ears, far, phase), 1, phase);
		assert.equal(loudness(town, far, ears, phase), 1, phase);
		assert.equal(loudness(town, players[2], ears, phase), 1, phase);
	}
	// At night it has always been the room only: All ears opens no wider ears and no line to a housemate.
	for (const p of players) assert.equal(loudness(town, ears, p, 'night'), loudness(town, st, p, 'night'));
	assert.equal(loudness(town, ears, far, 'night'), 0);
	assert.equal(loudness(town, players[2], ears, 'night'), 0);
	assert.equal(loudness(town, ears, players[0], 'night'), 1);
});

test('a private word at night reaches only the pair; a housemate sees and hears none of it', () => {
	const { players, st } = household(2);
	const a = { ...players[0], with: 'st' }, s = { ...st, with: 'p0' };
	assert.equal(loudness(town, a, s, 'night'), 1);
	assert.equal(loudness(town, players[1], s, 'night'), 0);
	assert.deepEqual(sees(town, players[1], [a, players[1], s], 'night'), []);
});

test('day, dusk and circle: everyone is seen, and housemates still hear each other by day', () => {
	const { players, st } = household(3);
	for (const phase of ['day', 'dusk', 'circle'] as const) {
		for (const p of players) for (const q of [...players, st]) assert.ok(perceives(town, p, q, phase), phase);
	}
	assert.equal(loudness(town, players[0], players[1], 'day'), 1);
	assert.equal(loudness(town, players[1], st, 'day'), 1);
});
