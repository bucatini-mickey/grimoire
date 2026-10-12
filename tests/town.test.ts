import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBlueprint } from '../src/town/blueprint.ts';
import { makeTown, walkable, path, canSee, loudness, roomsAt, sameRoom, visibleCells, inMeeting } from '../src/town/map.ts';
import type { P, Town } from '../src/town/map.ts';

const town = makeTown(parseBlueprint(readFileSync(new URL('../town/village.tbp', import.meta.url), 'utf8')));
const find = (t: Town, thing: string): P[] => {
	const out: P[] = [];
	t.cells.forEach((c, i) => { if (c.things.includes(thing)) out.push({ x: i % t.w, y: Math.floor(i / t.w) }); });
	return out;
};

// Landmarks in the demo village (town/make-village.mjs; the town lies 16 rows below the valley's cliff): the first cottage on the west track,
// its door and the grass outside; the tavern's hall and private back room; the church's double doors.
const INSIDE = { x: 12, y: 35 }, BY_DOOR = { x: 15, y: 35 }, DOOR = { x: 16, y: 35 }, STREET = { x: 18, y: 35 };
const HALL = { x: 60, y: 43 }, BACK = { x: 70, y: 40 };
const CHURCH_DOORS = [41 + 31 * town.w, 42 + 31 * town.w];

test('the blueprint format: keys, things, and errors that say what is wrong', () => {
	const bp = parseBlueprint('tachyon-blueprint 1\nname hut\nsize 3 2 1\nkey # wall wood\nkey d floor wood | door, rug\nlevel 0\n#d#\n# #\nend\n');
	assert.equal(bp.name, 'hut');
	assert.deepEqual(bp.cells[1], { tile: 'floor', mat: 'wood', things: ['door', 'rug'] });
	assert.equal(bp.cells[4], null);
	assert.throws(() => parseBlueprint('tachyon-blueprint 1\nsize 1 1 1\nlevel 0\nq\nend'), /'q' has no key/);
	assert.throws(() => parseBlueprint('hello'), /not a blueprint/);
});

test('the village is one level, ringed by forest, with a church, a tavern and homes for the night', () => {
	assert.ok(!town.cells.some((c) => c.tile.startsWith('stair')), 'no stairs');
	for (let x = 0; x < town.w; x++) for (const y of [0, town.h - 1]) assert.equal(town.cells[x + y * town.w].mat, 'leaves', `forest at ${x},${y}`);
	for (let y = 0; y < town.h; y++) for (const x of [0, town.w - 1]) assert.equal(town.cells[x + y * town.w].mat, 'leaves', `forest at ${x},${y}`);
	assert.ok(find(town, 'altar').length && find(town, 'pew').length, 'a church');
	assert.ok(find(town, 'barrel').length >= 6, 'a tavern bar');
	assert.ok(find(town, 'anvil').length && find(town, 'hay bale').length, 'a smithy and stables');
	assert.ok(town.homes.length >= 12, `${town.homes.length} homes`);
});

test('the village: every door can be reached from the seats round the market cross', () => {
	assert.equal(town.seats.length, 15);
	const start = town.seats[0];
	for (const d of find(town, 'door')) {
		assert.ok(walkable(town, d.x, d.y), `door at ${d.x},${d.y}`);
		assert.ok(path(town, start, d).length > 0, `no way to the door at ${d.x},${d.y}`);
	}
	for (const s of town.seats) assert.ok(path(town, start, s).length > 0 || s === start);
});

test('paths go round walls, never through them or across their corners', () => {
	const p = path(town, INSIDE, town.seats[0]);
	assert.ok(p.length > 0);
	let prev = INSIDE;
	for (const q of p) {
		assert.ok(walkable(town, q.x, q.y));
		assert.ok(Math.abs(q.x - prev.x) <= 1 && Math.abs(q.y - prev.y) <= 1);
		if (q.x !== prev.x && q.y !== prev.y) assert.ok(walkable(town, q.x, prev.y) && walkable(town, prev.x, q.y));
		prev = q;
	}
});

test('rooms: a house is its own room; its doorway joins it to the street', () => {
	assert.notDeepEqual(roomsAt(town, INSIDE), roomsAt(town, STREET));
	assert.equal(roomsAt(town, STREET)[0], town.outdoors);
	assert.ok(sameRoom(town, DOOR, INSIDE) && sameRoom(town, DOOR, STREET));
});

test('voices do not go through walls, carry from a doorway, and fade with distance', () => {
	assert.equal(loudness(town, BY_DOOR, { x: 17, y: 38 }, 'day'), 0);
	assert.ok(loudness(town, DOOR, STREET, 'day') > 0.5);
	assert.equal(loudness(town, { x: 25, y: 42 }, { x: 26, y: 42 }, 'day'), 1);
	assert.ok(loudness(town, { x: 19, y: 42 }, { x: 26, y: 42 }, 'day') < 0.5);
	assert.equal(loudness(town, { x: 19, y: 42 }, { x: 32, y: 42 }, 'day'), 0);
	assert.equal(loudness(town, { x: 25, y: 42 }, { x: 26, y: 42 }, 'night'), 0);
});

test('the tavern back room is private from the hall', () => {
	assert.ok(walkable(town, HALL.x, HALL.y) && walkable(town, BACK.x, BACK.y));
	assert.equal(loudness(town, HALL, BACK, 'day'), 0);
	assert.ok(!canSee(town, HALL, BACK));
});

test('in the circle everyone hears everyone, however far across; outside it, distance counts', () => {
	const a = town.seats[0], b = town.seats[7];
	assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 8);
	for (const phase of ['day', 'dusk'] as const) {
		assert.ok(inMeeting(town, a, phase));
		assert.equal(loudness(town, a, b, phase), 1);
	}
	assert.equal(loudness(town, a, b, 'night'), 0);
	// Well outside the ring, the far side is out of earshot again.
	const out = { x: 27, y: 40 };
	assert.ok(!inMeeting(town, out, 'day'));
	assert.equal(loudness(town, out, town.seats[0], 'day'), 0);
});

test('sight: walls hide what is behind them; night shows only your lantern and lit places', () => {
	assert.ok(!canSee(town, { x: 18, y: 39 }, INSIDE));
	const day = visibleCells(town, { x: 26, y: 33 }, 'day');
	const night = visibleCells(town, { x: 26, y: 33 }, 'night');
	assert.ok(night.size < day.size / 2);
	assert.ok(!day.has(INSIDE.x + INSIDE.y * town.w));
});

test('light: rooms are dimmer than the street by day; at night only torches and lanterns light the way', async () => {
	const { sky, sources, lightMap, level, daylight, HOUR, luma } = await import('../src/town/look.ts');
	const sk = sky(town);
	const none = lightMap(town, []);
	const day = daylight(HOUR.day), night = daylight(HOUR.night);
	const bright = (l: number[]) => luma(l.map((v) => v * 255) as [number, number, number]);
	const street = bright(level(town, sk, none, day, 25, 26));
	const room = bright(level(town, sk, none, day, INSIDE.x, INSIDE.y));
	assert.ok(room < street * 0.8, `room ${room} vs street ${street}`);
	// Beside an outdoor torch, and in the open far from every light.
	const torches = lightMap(town, sources(town, 0));
	const torch = find(town, 'torch').find((q) => town.room[q.x + q.y * town.w] === town.outdoors && walkable(town, q.x + 1, q.y))!;
	const far = { x: 22, y: 24 }; // the graveyard
	assert.ok(town.lights.every((q) => Math.hypot(q.x - far.x, q.y - far.y) > 12));
	const byTorch = bright(level(town, sk, torches, night, torch.x + 1, torch.y));
	const dark = bright(level(town, sk, torches, night, far.x, far.y));
	assert.ok(byTorch > dark * 3, `torch ${byTorch} vs dark ${dark}`);
});

test('a locked door stops walkers and the eye; the Storyteller walks through', async () => {
	const { doorsOf } = await import('../src/town/map.ts');
	const home = town.room[INSIDE.x + INSIDE.y * town.w];
	const [door] = doorsOf(town, home);
	const dx = door % town.w, dy = Math.floor(door / town.w);
	assert.ok(town.homes.includes(home));
	assert.ok(path(town, STREET, INSIDE).length > 0);
	assert.ok(canSee(town, STREET, BY_DOOR));
	town.locked.add(door);
	try {
		assert.ok(!walkable(town, dx, dy));
		assert.deepEqual(path(town, STREET, INSIDE), []);
		assert.ok(!canSee(town, STREET, BY_DOOR));
		assert.ok(path(town, STREET, INSIDE, true).length > 0);
	} finally {
		town.locked.delete(door);
	}
});

test('a private word: the two hear each other anywhere, and nobody else hears them', () => {
	const a = { id: 'a', ...INSIDE, with: 'b' }, b = { id: 'b', ...HALL, with: 'a' }, c = { id: 'c', x: INSIDE.x + 1, y: INSIDE.y };
	assert.equal(loudness(town, a, b, 'day'), 1);
	assert.equal(loudness(town, a, c, 'day'), 0);
	assert.equal(loudness(town, c, a, 'day'), 0);
});

test('the circle: everyone hears everyone; night: only the Storyteller, in the room they visit', () => {
	const a = { id: 'a', ...INSIDE }, b = { id: 'b', ...BACK };
	assert.equal(loudness(town, a, b, 'circle'), 1);
	assert.equal(loudness(town, a, { id: 'n', x: 13, y: 35 }, 'night'), 0);
	assert.equal(loudness(town, a, { id: 'st', x: 13, y: 36, st: true }, 'night'), 1);
	assert.equal(loudness(town, b, { id: 'st', x: 13, y: 36, st: true }, 'night'), 0);
});

test('double doors are one door; the Storyteller walks through walls like a ghost', async () => {
	const { doorLeaves } = await import('../src/town/map.ts');
	// The church's double doors, side by side.
	const [left, right] = CHURCH_DOORS;
	assert.deepEqual(doorLeaves(town, left).sort((p, q) => p - q), [left, right]);
	assert.deepEqual(doorLeaves(town, DOOR.x + DOOR.y * town.w), [DOOR.x + DOOR.y * town.w]);
	// Straight through the church wall, and through a cottage wall.
	assert.ok(!walkable(town, 34, 24));
	assert.ok(walkable(town, 34, 24, true));
	const p = path(town, STREET, INSIDE, true);
	assert.equal(p.length, STREET.x - INSIDE.x);
});

test('the valley: a cave in the cliff to walk into, water to look across but not wade, a bridge over the stream', () => {
	const square = town.seats[0];
	// The cave's two chambers are reachable on foot, and the deeper one is dark even at noon.
	const chamber = { x: 20, y: 5 }, deep = { x: 10, y: 5 };
	assert.equal(town.cells[chamber.x + chamber.y * town.w].mat, 'granite');
	assert.ok(path(town, square, chamber).length > 0, 'into the cave');
	assert.ok(path(town, chamber, deep).length > 0, 'on to the deeper chamber');
	// Water: you cannot walk on it, but you see across it; the plank bridge crosses the stream.
	const water = find(town, 'waterfall')[0];
	assert.ok(water && !walkable(town, water.x, water.y), 'the waterfall');
	const pool = town.cells.findIndex((c, i) => c.mat === 'water' && !c.things.length && i % town.w > 50);
	assert.ok(pool >= 0 && !walkable(town, pool % town.w, Math.floor(pool / town.w)), 'the pool');
	const bridge = find(town, 'plank bridge');
	assert.ok(bridge.length > 0 && bridge.every((b) => walkable(town, b.x, b.y)), 'the bridge');
	assert.ok(path(town, square, bridge[0]).length > 0, 'the bridge is on a way');
	const px = pool % town.w, py = Math.floor(pool / town.w);
	// From shore to shore across the widest row of the pool.
	const row = py + 2;
	let w0 = px, w1 = px;
	while (town.cells[w0 - 1 + row * town.w].mat === 'water') w0--;
	while (town.cells[w1 + 1 + row * town.w].mat === 'water') w1++;
	assert.ok(w1 - w0 >= 4 && canSee(town, { x: w0 - 1, y: row }, { x: w1 + 1, y: row }), 'you see across the water');
	assert.ok(find(town, 'flowers').length > 100, 'flowers');
});

test('names of places sit at the top left of their buildings', () => {
	const at = (text: string) => town.labels.find((l) => l.text.includes(text))!;
	const church = at('Church');
	assert.deepEqual([church.x, church.y], [34, 20]);
	assert.equal(town.cells[church.x + church.y * town.w].tile, 'wall');
	assert.ok(at('Crow & Candle') && at('Smithy') && at('Old Cave') && at('Falls'));
	assert.ok(town.labels.length >= 20);
	// The format: a label line, and one without a name is an error.
	const bp = parseBlueprint('tachyon-blueprint 1\nsize 1 1 1\nkey # wall wood\nlevel 0\n#\nlabel 0 0 The Hut\nend\n');
	assert.deepEqual(bp.labels, [{ x: 0, y: 0, text: 'The Hut' }]);
	assert.throws(() => parseBlueprint('tachyon-blueprint 1\nsize 1 1 1\nlevel 0\n \nlabel 0 0\nend\n'), /label needs/);
});

test('windows (on some buildings): glass walls you see out of but cannot climb through; a plain wall hides the street', () => {
	const win = { x: 10, y: 35 }; // the first cottage's window, opposite its door
	assert.equal(town.cells[win.x + win.y * town.w].mat, 'glass');
	assert.equal(walkable(town, win.x, win.y), false);
	assert.ok(canSee(town, INSIDE, { x: 9, y: 35 }), 'out of the window');
	assert.ok(!canSee(town, INSIDE, { x: 12, y: 31 }), 'not through the north wall');
	assert.deepEqual(roomsAt(town, INSIDE).length, 1);
	assert.ok(!sameRoom(town, INSIDE, { x: 9, y: 35 }), 'a window is still a wall: nobody outside hears you');
	// Not every building is glazed: the next cottage down the track has none.
	assert.equal(town.cells[10 + 43 * town.w].mat, 'wood');
	const glass = town.cells.filter((c) => c.mat === 'glass').length;
	assert.ok(glass >= 10 && glass <= 16, `${glass} windows`);
});

test('doors: worked from inside within two steps, or from the doorway (stepping in first); never from the street', async () => {
	const { canWorkDoor, doorStepIn } = await import('../src/town/map.ts');
	const d = DOOR.x + DOOR.y * town.w;
	assert.ok(canWorkDoor(town, BY_DOOR, d), 'beside it, inside');
	assert.ok(canWorkDoor(town, { x: 14, y: 35 }, d), 'two steps in');
	assert.ok(!canWorkDoor(town, INSIDE, d), 'four steps in is too far');
	assert.ok(canWorkDoor(town, DOOR, d), 'standing in the doorway');
	assert.deepEqual(doorStepIn(town, DOOR, d, STREET), BY_DOOR, 'from the doorway, the step is inward');
	assert.ok(!canWorkDoor(town, { x: 17, y: 35 }, d), 'not from the street');
	assert.ok(!canWorkDoor(town, STREET, d));
});

test('the cave is out of the sky: daylight fades going in', async () => {
	const { sky } = await import('../src/town/look.ts');
	const sk = sky(town);
	assert.ok(sk[10 + 5 * town.w] < sk[20 + 5 * town.w], 'the deep chamber is darker than the mouth');
	assert.ok(sk[10 + 5 * town.w] <= 4, 'the deep chamber is dark');
	assert.equal(sk[STREET.x + STREET.y * town.w], 15, 'the street has the open sky');
});
