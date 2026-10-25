/**
 * map.ts - the village as rules: where you can walk, what you can see, which
 * room you are in, and how loudly you hear someone. Pure, so it is tested
 * (tests/town.test.ts) and every phone works it out the same way.
 *
 * Rooms are what walls and doors cut the town into. A doorway belongs to the
 * rooms on both sides of it, so a word at the door carries both ways. Voices
 * do not go through walls: to talk in private, go inside and stand away from
 * the door, or lock it. A locked door stops walkers and the eye (everyone can
 * see it is shut). Double doors lock together. The Storyteller is a ghost:
 * they walk through walls, doors and everything else.
 *
 * Phases: day (wander), dusk (the bell: gather at the seats), circle (the
 * town meets on one circle, everyone hears everyone), night (everyone at
 * home, doors locked; only the Storyteller visits).
 */
import type { Blueprint, BpCell } from './blueprint.ts';

export interface P { x: number; y: number; }

/** Someone or something on a level: z is the level (0 the ground; missing means 0). */
export interface PZ extends P { z?: number; }

export type Phase = 'day' | 'dusk' | 'circle' | 'night';

/** Someone in the town, as far as hearing goes. */
export interface Walker extends PZ {
	id?: string;
	/** The Storyteller: hears and is heard at night, in the room they visit. */
	st?: boolean;
	/** In a private conversation with this person: they hear only each other. */
	with?: string | null;
	/** The Storyteller's All ears: they hear, and are heard by, everyone. */
	ears?: boolean;
}

export interface Town {
	name: string;
	w: number;
	h: number;
	/** Which level this is (0 the ground), and every level of the town, ground first. */
	z: number;
	levels: Town[];
	cells: BpCell[];
	/** Room number of each cell; -1 for walls, -2 for doorways. */
	room: Int32Array;
	/** The rooms each doorway joins, by cell index. */
	doorRooms: Map<number, number[]>;
	/** The room number of outdoors (the biggest room). */
	outdoors: number;
	/** The seats in the open where the town gathers, in order round the circle. */
	seats: P[];
	/** The middle of the seats and how far the ring reaches. */
	meeting: { at: P; reach: number } | null;
	/**
	 * The council: the chairs round a table indoors (the castle's great hall), where the
	 * town sits for nominations and votes, in order clockwise from the top. Null if none.
	 */
	council: { seats: P[]; at: P; room: number } | null;
	lights: P[];
	/** Rooms with a bed: homes for the night. */
	homes: number[];
	/** Doors that are locked now (cell indices). Changes during play. */
	locked: Set<number>;
	/** Names of places (buildings, the cave, the falls), drawn small at their cell. */
	labels: { x: number; y: number; text: string }[];
}

const GRASS: BpCell = { tile: 'floor', mat: 'grass', things: [] };
/** Above the ground, a cell the blueprint leaves empty is open air: you see the level below through it. */
export const AIR: BpCell = { tile: 'open', mat: '', things: [] };
export const isAir = (c: BpCell | null | undefined) => !!c && c.tile === 'open' && !c.mat;
/** Stairs: step onto one and you are on the level above (or below). */
export const stairGoes = (c: BpCell | null | undefined): -1 | 0 | 1 => (c?.tile === 'stair-up' ? 1 : c?.tile === 'stair-down' ? -1 : 0);
const BLOCKING = new Set(['beacon', 'well', 'brazier', 'altar', 'statue', 'anvil', 'barrel', 'bookshelf', 'coffin', 'table', 'waterfall', 'bell', 'clock', 'oak', 'loom', 'oven', 'cart', 'gas lamp']);
/** Deep water: you cannot walk it, but you see and hear across it. A plank bridge crosses. */
const isWater = (c: BpCell) => c.mat === 'water' && !c.things.includes('plank bridge');
const LIGHTS = new Set(['torch', 'brazier', 'candle', 'gas lamp', 'sigil', 'oven', 'beacon']);

export const at = (t: Town, x: number, y: number): BpCell | null => (x < 0 || y < 0 || x >= t.w || y >= t.h ? null : t.cells[x + y * t.w]);
const isDoor = (c: BpCell) => c.things.includes('door');
/** Walls you can see (and daylight falls) through, as in Tachyon (material.rs): windows of glass, ice. */
export const SEE_THROUGH = new Set(['glass', 'ice']);
export const isWindow = (c: BpCell | null | undefined) => !!c && c.tile === 'wall' && SEE_THROUGH.has(c.mat);

/** `ghost`: the Storyteller, who goes anywhere in the town, walls and all. */
export function walkable(t: Town, x: number, y: number, ghost = false): boolean {
	const c = at(t, x, y);
	if (!c || isAir(c)) return false;
	if (ghost) return true;
	if (c.tile === 'wall' || isWater(c) || c.things.some((k) => BLOCKING.has(k))) return false;
	return !t.locked.has(x + y * t.w);
}

/** A door and any door beside it (double doors), which open and lock together. */
export function doorLeaves(t: Town, cell: number): number[] {
	const out = [cell];
	for (let k = 0; k < out.length; k++) {
		const x = out[k] % t.w, y = Math.floor(out[k] / t.w);
		for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const n = x + dx + (y + dy) * t.w;
			if (!out.includes(n) && at(t, x + dx, y + dy)?.things.includes('door')) out.push(n);
		}
	}
	return out;
}

/** Walls, trees and locked doors stop the eye (you see the door, not through it). */
export function blocksSight(t: Town, x: number, y: number): boolean {
	const c = at(t, x, y);
	return !c || (c.tile === 'wall' && !SEE_THROUGH.has(c.mat)) || t.locked.has(x + y * t.w);
}

/** How near you must be to lock or unlock a door: two steps, or standing in it. */
export const DOOR_REACH = 2;

/**
 * Could this person lock or unlock this door from where they stand? From inside a
 * room it opens onto (never from the street), within two steps and in sight of it;
 * or from the doorway itself (they step in first: see doorStepIn).
 */
export function canWorkDoor(t: Town, p: P, cell: number): boolean {
	const x = cell % t.w, y = Math.floor(cell / t.w);
	if (!at(t, x, y)?.things.includes('door')) return false;
	const rooms = (t.doorRooms.get(cell) ?? []).filter((r) => r !== t.outdoors);
	if (!rooms.length) return false;
	if (doorLeaves(t, cell).includes(p.x + p.y * t.w)) return true;
	if (Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) > DOOR_REACH) return false;
	return roomsAt(t, p).some((r) => rooms.includes(r)) && canSee(t, p, { x, y });
}

/**
 * Standing in a doorway to lock it: the cell to step into first. Inside, not the
 * street; between two rooms, onward (away from `from`, where you came from).
 */
export function doorStepIn(t: Town, p: P, cell: number, from?: P | null): P | null {
	const rooms = (t.doorRooms.get(cell) ?? []).filter((r) => r !== t.outdoors);
	const back = from ? t.room[from.x + from.y * t.w] : -1;
	const options = [[0, 1], [0, -1], [1, 0], [-1, 0]]
		.map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }))
		.filter((q) => walkable(t, q.x, q.y) && rooms.includes(t.room[q.x + q.y * t.w]));
	return options.find((q) => t.room[q.x + q.y * t.w] !== back) ?? options[0] ?? null;
}

/** The doors of a room. */
export function doorsOf(t: Town, room: number): number[] {
	return [...t.doorRooms].filter(([, rooms]) => rooms.includes(room)).map(([i]) => i);
}

/** Every level of a blueprint as a town of its own, linked: returns the ground, whose `levels` holds them all. */
export function makeWorld(bp: Blueprint): Town {
	const levels: Town[] = [];
	for (let z = 0; z < Math.max(1, bp.d); z++) levels.push(makeTown(bp, z));
	for (const t of levels) t.levels = levels;
	return levels[0];
}

export function makeTown(bp: Blueprint, z = 0): Town {
	const { w, h } = bp;
	const cells = Array.from({ length: w * h }, (_, i) => bp.cells[i + z * w * h] ?? (z ? AIR : GRASS));
	const t: Town = { name: bp.name, w, h, z, levels: [], cells, room: new Int32Array(w * h).fill(-1), doorRooms: new Map(), outdoors: 0, seats: [], meeting: null, council: null, lights: [], homes: [], locked: new Set(), labels: z ? [] : [...(bp.labels ?? [])] };
	t.levels = [t];
	// Rooms: flood fill everything that is not wall or doorway.
	let next = 0;
	const sizes: number[] = [];
	for (let i = 0; i < w * h; i++) {
		const c = cells[i];
		if (c.tile === 'wall') continue;
		if (isDoor(c)) { t.room[i] = -2; continue; }
		if (t.room[i] !== -1) continue;
		const id = next++;
		let size = 0;
		const stack = [i];
		t.room[i] = id;
		while (stack.length) {
			const j = stack.pop()!;
			size++;
			const x = j % w, y = (j - x) / w;
			for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const nx = x + dx, ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
				const k = nx + ny * w;
				const nc = cells[k];
				if (t.room[k] !== -1 || nc.tile === 'wall' || isDoor(nc)) continue;
				t.room[k] = id;
				stack.push(k);
			}
		}
		sizes[id] = size;
	}
	t.outdoors = sizes.indexOf(Math.max(...sizes));
	for (let i = 0; i < w * h; i++) {
		if (t.room[i] !== -2) continue;
		const x = i % w, y = (i - x) / w;
		const rooms = new Set<number>();
		for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const r = x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h ? t.room[x + dx + (y + dy) * w] : -1;
			if (r >= 0) rooms.add(r);
		}
		t.doorRooms.set(i, [...rooms]);
	}
	// Lights, and the seats in the open round a stair-up (the clocktower).
	const chairs: P[] = [];
	const homes = new Set<number>();
	for (let i = 0; i < w * h; i++) {
		const x = i % w, y = (i - x) / w;
		if (cells[i].things.some((k) => LIGHTS.has(k))) t.lights.push({ x, y });
		if (cells[i].things.includes('bed') && t.room[i] >= 0 && t.room[i] !== t.outdoors) homes.add(t.room[i]);
		if (cells[i].things.includes('chair') && t.room[i] === t.outdoors) chairs.push({ x, y });
	}
	t.homes = [...homes];
	// The council: the room with the most chairs drawn up to a table.
	const byRoom = new Map<number, P[]>();
	for (let i = 0; i < w * h; i++) {
		const x = i % w, y = (i - x) / w, r = t.room[i];
		if (r < 0 || r === t.outdoors || !cells[i].things.includes('chair')) continue;
		let byTable = false;
		for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (cells[x + dx + (y + dy) * w]?.things.includes('table')) byTable = true;
		if (byTable) byRoom.set(r, [...(byRoom.get(r) ?? []), { x, y }]);
	}
	const [room, round] = [...byRoom].sort((a, b) => b[1].length - a[1].length)[0] ?? [-1, []];
	if (round.length >= 5) {
		const at = { x: round.reduce((s, p) => s + p.x, 0) / round.length, y: round.reduce((s, p) => s + p.y, 0) / round.length };
		const turn = (p: P) => (Math.atan2(p.x - at.x, -(p.y - at.y)) + 2 * Math.PI) % (2 * Math.PI);
		t.council = { seats: round.sort((a, b) => turn(a) - turn(b)), at, room };
	}
	// The seats: the chairs in the open, round their middle (the demo puts a market cross there).
	if (chairs.length) {
		let cx = chairs.reduce((s, p) => s + p.x, 0) / chairs.length;
		let cy = chairs.reduce((s, p) => s + p.y, 0) / chairs.length;
		const ring = chairs.filter((p) => Math.hypot(p.x - cx, p.y - cy) < 12);
		cx = ring.reduce((s, p) => s + p.x, 0) / ring.length;
		cy = ring.reduce((s, p) => s + p.y, 0) / ring.length;
		ring.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
		t.seats = ring;
		const reach = Math.max(0, ...ring.map((p) => Math.hypot(p.x - cx, p.y - cy))) + 1.5;
		t.meeting = { at: { x: cx, y: cy }, reach };
	}
	return t;
}

/** The rooms a cell is in: its own, or for a doorway, the rooms either side. */
export function roomsAt(t: Town, p: P): number[] {
	const i = p.x + p.y * t.w;
	const r = t.room[i];
	if (r >= 0) return [r];
	return t.doorRooms.get(i) ?? [];
}

export function sameRoom(t: Town, a: P, b: P): boolean {
	const ra = roomsAt(t, a);
	return roomsAt(t, b).some((r) => ra.includes(r));
}

/** Can a see b? Straight line, not through walls or doors (b itself may be one). */
export function canSee(t: Town, a: P, b: P): boolean {
	let x = a.x, y = a.y;
	const dx = Math.abs(b.x - x), dy = -Math.abs(b.y - y);
	const sx = x < b.x ? 1 : -1, sy = y < b.y ? 1 : -1;
	let err = dx + dy;
	while (!(x === b.x && y === b.y)) {
		if (!(x === a.x && y === a.y) && blocksSight(t, x, y)) return false;
		const e2 = 2 * err;
		if (e2 >= dy) { err += dy; x += sx; }
		if (e2 <= dx) { err += dx; y += sy; }
	}
	return true;
}

/** How far you see: far by day, less at dusk, only your lantern at night. */
export const SIGHT: Record<Phase, number> = { day: 18, dusk: 10, circle: 18, night: 3 };
const LIGHT_REACH = 4;

/** The cells you can see now. Night: your lantern, and whatever the torches light. */
export function visibleCells(t: Town, me: P, phase: Phase): Set<number> {
	const seen = new Set<number>();
	const lit = phase === 'night' ? litCells(t) : null;
	const r = phase === 'night' ? SIGHT.day : SIGHT[phase];
	for (let y = me.y - r; y <= me.y + r; y++) {
		for (let x = me.x - r; x <= me.x + r; x++) {
			if (x < 0 || y < 0 || x >= t.w || y >= t.h) continue;
			const d = Math.hypot(x - me.x, y - me.y);
			if (d > r + 0.5) continue;
			const i = x + y * t.w;
			if (lit && d > SIGHT.night + 0.5 && !lit.has(i)) continue;
			if (canSee(t, me, { x, y })) seen.add(i);
		}
	}
	// The face of a wall beside somewhere you can see, so buildings show their outline.
	for (const i of [...seen]) {
		const x = i % t.w, y = (i - x) / t.w;
		if (t.cells[i].tile === 'wall') continue;
		for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
			const c = at(t, x + dx, y + dy);
			if (c && (c.tile === 'wall' || isDoor(c))) seen.add(x + dx + (y + dy) * t.w);
		}
	}
	return seen;
}

const litCache = new WeakMap<Town, Set<number>>();
export function litCells(t: Town): Set<number> {
	let lit = litCache.get(t);
	if (lit) return lit;
	lit = new Set();
	for (const l of t.lights) {
		for (let y = l.y - LIGHT_REACH; y <= l.y + LIGHT_REACH; y++) {
			for (let x = l.x - LIGHT_REACH; x <= l.x + LIGHT_REACH; x++) {
				if (!at(t, x, y) || Math.hypot(x - l.x, y - l.y) > LIGHT_REACH + 0.5) continue;
				if (canSee(t, l, { x, y })) lit.add(x + y * t.w);
			}
		}
	}
	litCache.set(t, lit);
	return lit;
}

/** Shortest walk from a to b (8 ways, no cutting wall corners); [] if none. */
export function path(t: Town, a: P, b: P, ghost = false): P[] {
	if (!walkable(t, b.x, b.y, ghost) || (a.x === b.x && a.y === b.y)) return [];
	const from = new Int32Array(t.w * t.h).fill(-1);
	const start = a.x + a.y * t.w, goal = b.x + b.y * t.w;
	from[start] = start;
	const queue = [start];
	for (let qi = 0; qi < queue.length; qi++) {
		const i = queue[qi];
		if (i === goal) break;
		const x = i % t.w, y = (i - x) / t.w;
		for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
			const nx = x + dx, ny = y + dy;
			if (!walkable(t, nx, ny, ghost)) continue;
			if (dx && dy && (!walkable(t, x + dx, y, ghost) || !walkable(t, x, y + dy, ghost))) continue;
			const k = nx + ny * t.w;
			if (from[k] !== -1) continue;
			from[k] = i;
			queue.push(k);
		}
	}
	if (from[goal] === -1) return [];
	const out: P[] = [];
	for (let i = goal; i !== start; i = from[i]) out.push({ x: i % t.w, y: Math.floor(i / t.w) });
	return out.reverse();
}

/** Voices carry this far in the open, fading from full at 2 m to nothing. */
/** How far a voice carries, in steps (round corners, through open doors). */
export const HEARING = 14;

/**
 * How many steps sound takes from a cell to every other within earshot: round
 * corners and through open doorways, never through walls, windows or a locked
 * door. Cached: a few listeners, while nobody moves and no lock changes.
 */
const soundCache = new Map<string, Int16Array>();
function soundSteps(t: Town, from: P): Int16Array {
	const key = `${from.x},${from.y}|${[...t.locked].join(',')}`;
	let d = soundCache.get(key);
	if (d) return d;
	d = new Int16Array(t.w * t.h).fill(-1);
	const start = from.x + from.y * t.w;
	d[start] = 0;
	const q = [start];
	for (let i = 0; i < q.length; i++) {
		const c = q[i], x = c % t.w, y = (c - x) / t.w;
		if (d[c] >= HEARING) continue;
		for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nx = x + dx, ny = y + dy;
			if (nx < 0 || ny < 0 || nx >= t.w || ny >= t.h) continue;
			const n = nx + ny * t.w;
			if (d[n] >= 0 || t.cells[n].tile === 'wall' || t.locked.has(n)) continue;
			d[n] = d[c] + 1;
			q.push(n);
		}
	}
	if (soundCache.size > 48) soundCache.clear();
	soundCache.set(key, d);
	return d;
}

/** Beside the market cross: whoever speaks there, the whole town hears (by day and at dusk). */
export function atSpeakingPlace(t: Town, p: P): boolean {
	return !!t.meeting && Math.hypot(p.x - t.meeting.at.x, p.y - t.meeting.at.y) <= 2.3;
}

/** The ring of seats in the square, by day or at dusk: everyone inside hears everyone inside. */
export function inMeeting(t: Town, p: P, phase: Phase): boolean {
	return (phase === 'day' || phase === 'dusk') && !!t.meeting && Math.hypot(p.x - t.meeting.at.x, p.y - t.meeting.at.y) <= t.meeting.reach;
}

/** How loud b sounds to a, 0 to 1. Nobody talks at night: the town sleeps. */
/**
 * How loud `b` sounds to `a` (0 to 1). Sound carries: round corners and
 * through open doors, fading with the steps it takes; walls, windows and a
 * locked door stop it, so a house you lock is private. Whoever stands at the
 * market cross is heard by the whole town. The Storyteller with All ears on
 * hears and is heard by everyone; a private word is the Storyteller and one
 * player, nobody else.
 */
export function loudness(t: Town, a: Walker, b: Walker, phase: Phase): number {
	// A private word: the two hear each other wherever they are, and nobody else hears them.
	if (a.with || b.with) return a.with === b.id && b.with === a.id ? 1 : 0;
	if (phase === 'circle') return 1;
	// Night: the town sleeps; only the Storyteller talks, to whoever is in the room they visit.
	if (phase === 'night') return (a.st || b.st) && (a.z ?? 0) === (b.z ?? 0) && sameRoom(t, a, b) ? 1 : 0;
	if ((a.st && a.ears) || (b.st && b.ears)) return 1;
	// Floors and ceilings stop voices: only those on the same level hear each other.
	if ((a.z ?? 0) !== (b.z ?? 0)) return 0;
	if (atSpeakingPlace(t, b)) return 1;
	if (inMeeting(t, a, phase) && inMeeting(t, b, phase)) return 1;
	const d = soundSteps(t, a)[b.x + b.y * t.w];
	if (d < 0) return 0;
	if (d <= 2) return 1;
	return Math.max(0, 1 - (d - 2) / (HEARING - 2));
}
