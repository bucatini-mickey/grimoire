/**
 * look.ts - the village drawn the way Tachyon draws a world
 * (tachyon/src/draw/view/mod.rs, src/sim/light.rs), so a town looks the
 * same in both:
 *
 *  - every cell is filled with its material's colours (grass is green
 *    through and through), two characters wide, so the map is square;
 *  - light is sky light (full outdoors, leaking in through doorways and
 *    fading into rooms), scaled by the time of day, plus coloured light
 *    from torches, braziers and candles, flood-filled through open cells
 *    with a falloff per step and a little flicker;
 *  - walls join up into lines (double for stone, single for timber);
 *  - places seen before but not now are grey and dim.
 *
 * The numbers are Tachyon's, so the torchlight matches.
 */
import { at, isWindow } from './map.ts';
import type { Phase, Town } from './map.ts';

export type Rgb = [number, number, number];

interface Mat { fg: Rgb; bg: Rgb; wall: string; floors: string[]; style?: 'double' | 'single'; }
const MATS: Record<string, Mat> = {
	grass: { fg: [84, 150, 58], bg: [26, 46, 18], wall: '"', floors: [',', '.', "'", '"', '`', ',', '.'] },
	soil: { fg: [128, 92, 58], bg: [54, 38, 24], wall: '▒', floors: ['.', ',', '·', '.'] },
	sand: { fg: [196, 180, 128], bg: [84, 74, 46], wall: '▒', floors: ['.', '·', ',', '.'] },
	gravel: { fg: [150, 146, 140], bg: [60, 58, 56], wall: '▒', floors: [':', '·', '.', ':'] },
	mud: { fg: [110, 84, 56], bg: [48, 34, 22], wall: '▒', floors: ['~', ',', '.', ','] },
	clay: { fg: [170, 100, 70], bg: [78, 44, 30], wall: '▒', floors: ['.', ',', '·'] },
	wood: { fg: [116, 104, 92], bg: [44, 38, 32], wall: 'O', floors: ['+'], style: 'single' },
	leaves: { fg: [60, 134, 48], bg: [18, 44, 16], wall: '♣', floors: ['♣'] },
	'stone block': { fg: [178, 176, 168], bg: [62, 60, 58], wall: '#', floors: ['+'], style: 'double' },
	slate: { fg: [96, 104, 124], bg: [36, 40, 50], wall: '▓', floors: ['≡'] },
	granite: { fg: [118, 116, 124], bg: [46, 44, 52], wall: '▓', floors: ['.', '·', '.', ','] },
	water: { fg: [96, 150, 196], bg: [18, 44, 72], wall: '≈', floors: ['~', '≈', '~', '-'] },
	glass: { fg: [170, 214, 232], bg: [44, 70, 84], wall: '░', floors: ['.'] },
	// Saltgrave's: sooty brick terraces, wet cobbles, iron railings.
	brick: { fg: [168, 92, 70], bg: [60, 30, 26], wall: '#', floors: ['+'], style: 'double' },
	cobble: { fg: [124, 122, 120], bg: [40, 40, 42], wall: '▒', floors: ['∙', '·', ':', '∙', '.'] },
	iron: { fg: [96, 102, 110], bg: [24, 26, 30], wall: '╫', floors: ['.'] },
	ice: { fg: [200, 230, 244], bg: [70, 96, 112], wall: '░', floors: ['.'] }
};
const FALLBACK = MATS.soil;

interface Kind { ch: string; fg: Rgb; light?: Rgb; flicker?: boolean; }
const BROWN: Rgb = [176, 124, 72], STONE: Rgb = [190, 186, 178];
const KINDS: Record<string, Kind> = {
	door: { ch: '◘', fg: BROWN }, table: { ch: 'π', fg: BROWN }, chair: { ch: '╥', fg: BROWN }, bed: { ch: 'Θ', fg: [190, 70, 64] },
	chest: { ch: '■', fg: [150, 100, 52] }, bookshelf: { ch: '≡', fg: BROWN }, barrel: { ch: 'ö', fg: [150, 104, 56] },
	torch: { ch: '¡', fg: [255, 210, 110], light: [255, 176, 92], flicker: true },
	brazier: { ch: 'Ω', fg: [230, 130, 50], light: [255, 150, 60], flicker: true },
	candle: { ch: 'i', fg: [250, 240, 200], light: [170, 130, 70], flicker: true },
	altar: { ch: '╤', fg: STONE }, pew: { ch: '═', fg: BROWN }, coffin: { ch: '▬', fg: [90, 60, 40] }, statue: { ch: '†', fg: STONE },
	well: { ch: 'O', fg: STONE }, anvil: { ch: '¬', fg: [120, 120, 130] }, 'hay bale': { ch: '"', fg: [220, 200, 100] },
	sign: { ch: '¶', fg: BROWN }, bell: { ch: ' ', fg: [214, 172, 92] }, oak: { ch: '♣', fg: [70, 120, 46] }, loom: { ch: '╫', fg: BROWN }, oven: { ch: '◙', fg: [200, 120, 70], light: [150, 80, 30] }, cart: { ch: '⌐', fg: BROWN }, clock: { ch: ' ', fg: [214, 172, 92] }, flowers: { ch: '*', fg: [220, 120, 160] }, waterfall: { ch: '¦', fg: [200, 228, 240] }, rug: { ch: '░', fg: [150, 50, 50] },
	'gas lamp': { ch: '‡', fg: [214, 236, 196], light: [150, 186, 150] }, fern: { ch: '♠', fg: [72, 150, 96] },
	sigil: { ch: '✶', fg: [120, 230, 180], light: [50, 130, 100], flicker: true }, 'plank bridge': { ch: '=', fg: [150, 110, 70] }
};
const DOUBLE = ['■', '║', '═', '╚', '║', '║', '╔', '╠', '═', '╝', '═', '╩', '╗', '╣', '╦', '╬'];
const SINGLE = ['o', '│', '─', '└', '│', '│', '┌', '├', '─', '┘', '─', '┴', '┐', '┤', '┬', '┼'];

const SKY_MAX = 15, FALLOFF = 14, FALLOFF_DIAG = 20, AMBIENT = 0.05;
/** A walker's lantern after dark. */
export const LANTERN: Rgb = [230, 190, 120];

const hash = (x: number, y: number, k: number) => {
	let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(k, 1274126177);
	h = Math.imul(h ^ (h >>> 13), 1103515245);
	return (h ^ (h >>> 16)) >>> 0;
};
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Tachyon's daylight for an hour of the day (clock.rs). */
export function daylight(hour: number): Rgb {
	const elev = Math.sin(((hour - 6) / 12) * Math.PI);
	const sun = smooth(-0.12, 0.35, elev);
	const warm = smooth(0.45, 0, Math.abs(elev)) * sun;
	const day = [1, 0.97, 0.92], dusk = [1, 0.62, 0.4], night = [0.1, 0.12, 0.2];
	return [0, 1, 2].map((c) => night[c] + (day[c] + (dusk[c] - day[c]) * warm - night[c]) * sun) as Rgb;
}
export const HOUR: Record<Phase, number> = { day: 12, dusk: 17.7, circle: 17.7, night: 0 };

/** The village's weather: a grey, low-clouded day, a deep dusk, a dark night, so the torches tell. */
const MOOD: Record<Phase, Rgb> = { day: [0.58, 0.6, 0.68], dusk: [0.5, 0.42, 0.46], circle: [0.5, 0.42, 0.46], night: [0.4, 0.45, 0.65] };

/** The fog's own colour by phase: grey-green by day, bruised at dusk, near black at night. */
export const FOG: Record<Phase, Rgb> = { day: [64, 70, 74], dusk: [46, 38, 46], circle: [46, 38, 46], night: [10, 12, 18] };

/** Smooth value noise in [0, 1], for fog that drifts. */
export function noise(x: number, y: number, k = 0): number {
	const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
	const v = (a: number, b: number) => (hash(a, b, 31 + k) & 1023) / 1023;
	const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
	const top = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * sx;
	const bot = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * sx;
	return top + (bot - top) * sy;
}

/**
 * How thick the fog is at a cell (0 clear, 1 nothing to be seen): thin close
 * to you, thick at the edge of sight, thicker still in the forest round the
 * town, rolling slowly with time.
 */
export function fogAt(t: Town, x: number, y: number, from: { x: number; y: number }, phase: Phase, ms: number): number {
	const near = phase === 'night' ? 1.5 : phase === 'day' ? 4 : 3;
	const far = phase === 'night' ? 9 : phase === 'day' ? 17 : 12;
	const d = Math.hypot(x - from.x, y - from.y);
	const drift = noise(x * 0.18 + ms * 0.00011, y * 0.24 - ms * 0.00004) * 0.6 + noise(x * 0.07 - ms * 0.00005, y * 0.09, 5) * 0.4;
	const edge = Math.min(x, y, t.w - 1 - x, t.h - 1 - y);
	const woods = smooth(9, 1, edge); // the forest round the town is always deep in mist
	// Clear round you; the drifting banks only roll in further out.
	const f = smooth(near, far, d) * 0.9 + (drift - 0.45) * 0.45 * smooth(near * 0.5, near + 3, d) + woods * 0.6;
	return Math.min(0.97, Math.max(0, f));
}
export const sunlight = (phase: Phase): Rgb => mul(daylight(HOUR[phase]), MOOD[phase]);

const isWallAt = (t: Town, x: number, y: number) => at(t, x, y)?.tile === 'wall';
const isDoorAt = (t: Town, x: number, y: number) => !!at(t, x, y)?.things.includes('door');
/** Light passes open cells, doorways and windows; walls and trees stop it. */
const blocksLight = (t: Town, x: number, y: number) => { const c = at(t, x, y); return !c || (c.tile === 'wall' && !isWindow(c)); };

/** Sky exposure: full outdoors, then one less per step through doorways into rooms. */
const skyCache = new WeakMap<Town, Uint8Array>();
export function sky(t: Town): Uint8Array {
	let s = skyCache.get(t);
	if (s) return s;
	s = new Uint8Array(t.w * t.h);
	const q: number[] = [];
	// Under rock (a cave's floor) is out of the sky, and daylight fades twice as fast going in.
	const underRock = (i: number) => t.cells[i].tile !== 'wall' && t.cells[i].mat === 'granite';
	for (let i = 0; i < s.length; i++) if (t.room[i] === t.outdoors && !underRock(i)) { s[i] = SKY_MAX; q.push(i); }
	for (let qi = 0; qi < q.length; qi++) {
		const i = q[qi], x = i % t.w, y = (i - x) / t.w;
		for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nx = x + dx, ny = y + dy;
			if (blocksLight(t, nx, ny)) continue;
			const k = nx + ny * t.w;
			const ns = s[i] - (underRock(k) ? 2 : 1);
			if (ns > 0 && s[k] < ns) { s[k] = ns; q.push(k); }
		}
	}
	skyCache.set(t, s);
	return s;
}

export interface Source { x: number; y: number; c: Rgb; }

/** The light sources in the town; `tick` makes the flames flicker. */
export function sources(t: Town, tick: number): Source[] {
	const out: Source[] = [];
	for (const l of t.lights) {
		const k = t.cells[l.x + l.y * t.w].things.map((n) => KINDS[n]).find((k) => k?.light);
		if (!k?.light) continue;
		const f = k.flicker ? 0.85 + 0.15 * ((hash(l.x, l.y, tick) & 255) / 255) : 1;
		out.push({ x: l.x, y: l.y, c: k.light.map((v) => v * f) as Rgb });
	}
	return out;
}

/** Coloured light, flood-filled from each source with Tachyon's falloff (0-255 per channel). */
export function lightMap(t: Town, srcs: Source[]): Uint8ClampedArray {
	const rgb = new Uint8ClampedArray(t.w * t.h * 3);
	const q: number[] = [];
	for (const s of srcs) {
		const i = s.x + s.y * t.w;
		for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.max(rgb[i * 3 + c], s.c[c]);
		q.push(i);
	}
	const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
	for (let qi = 0; qi < q.length; qi++) {
		const i = q[qi], x = i % t.w, y = (i - x) / t.w;
		for (let k = 0; k < 8; k++) {
			const [dx, dy] = dirs[k];
			const f = k < 4 ? FALLOFF : FALLOFF_DIAG;
			const nx = x + dx, ny = y + dy;
			if (blocksLight(t, nx, ny)) continue;
			if (k >= 4 && (blocksLight(t, x + dx, y) || blocksLight(t, x, y + dy))) continue;
			const n = nx + ny * t.w;
			let up = false;
			for (let c = 0; c < 3; c++) {
				const v = rgb[i * 3 + c] - f;
				if (v > rgb[n * 3 + c]) { rgb[n * 3 + c] = v; up = true; }
			}
			if (up) q.push(n);
		}
	}
	return rgb;
}

/** Light level at a cell, per channel (Tachyon's light_level); walls take their brightest open neighbour. */
export function level(t: Town, sk: Uint8Array, dyn: Uint8ClampedArray, day: Rgb, x: number, y: number): Rgb {
	const sample = (i: number): Rgb => {
		const s = (sk[i] / SKY_MAX) ** 2;
		return [0, 1, 2].map((c) => s * day[c] + (dyn[i * 3 + c] / 255) * 1.3) as Rgb;
	};
	let l: Rgb;
	if (isWallAt(t, x, y)) {
		// Bare rock (the cliff) lies under the open sky: daylight falls on it, a little dimmer than the ground.
		l = at(t, x, y)!.mat === 'granite' ? (day.map((v) => v * 0.55) as Rgb) : [0, 0, 0];
		for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
			if ((!dx && !dy) || !at(t, x + dx, y + dy) || blocksLight(t, x + dx, y + dy)) continue;
			const s = sample(x + dx + (y + dy) * t.w);
			for (let c = 0; c < 3; c++) l[c] = Math.max(l[c], s[c]);
		}
	} else l = sample(x + y * t.w);
	return l.map((v) => Math.min(1.35, v + AMBIENT)) as Rgb;
}

export const mul = (c: Rgb, l: Rgb): Rgb => [c[0] * l[0], c[1] * l[1], c[2] * l[2]];
export const lerp = (a: Rgb, b: Rgb, k: number): Rgb => [0, 1, 2].map((c) => a[c] + (b[c] - a[c]) * k) as Rgb;
export const css = (c: Rgb, a = 1) => `rgba(${Math.round(Math.min(255, c[0]))},${Math.round(Math.min(255, c[1]))},${Math.round(Math.min(255, c[2]))},${a})`;
export const luma = (c: Rgb) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

/** Seen before but not now: grey and dim (Tachyon's remembered()). */
export function remembered(fg: Rgb, bg: Rgb): [Rgb, Rgb] {
	const fl = luma(fg) * 0.32 + 18, bl = luma(bg) * 0.18;
	return [[fl, fl, fl * 1.15], [bl, bl, bl * 1.2]];
}

/**
 * One cell before lighting: a symbol (centred in the square cell), a colour, a
 * background. A wall is drawn as lines rather than a glyph: `wall` says which
 * neighbours it joins (1 up, 2 right, 4 down, 8 left) and whether the line is
 * double (stone) or single (timber). A shut door carries its wall's line too.
 */
export interface Look { ch: string; fg: Rgb; bg: Rgb; emissive: boolean; wall?: { mask: number; style: 'double' | 'single' }; glass?: boolean; icon?: 'bell' | 'clock'; }

/** Wildflowers: one colour per patch, from the hedgerow. */
const FLOWERS: Rgb[] = [[214, 74, 82], [232, 196, 72], [168, 120, 214], [236, 230, 214], [96, 150, 226], [230, 140, 70]];

/** `ms` moves the water: ripples on the pool, the waterfall pouring. */
export function lookAt(t: Town, x: number, y: number, ms = 0): Look {
	const c = at(t, x, y)!;
	const m = MATS[c.mat] ?? FALLBACK;
	const joins = (dx: number, dy: number) => {
		const n = at(t, x + dx, y + dy);
		return (n?.tile === 'wall' && (!!(MATS[n.mat] ?? FALLBACK).style || isWindow(n))) || isDoorAt(t, x + dx, y + dy);
	};
	const maskHere = () => (joins(0, -1) ? 1 : 0) | (joins(1, 0) ? 2 : 0) | (joins(0, 1) ? 4 : 0) | (joins(-1, 0) ? 8 : 0);
	if (c.tile === 'wall') {
		// Rock: broken, uneven texture; other unjoined walls (hedges, trees) their own mark.
		if (c.mat === 'granite') {
			const h = hash(x, y, 11);
			return { ch: ['▒', '▓', '▒', '░', '▲', '▒'][h % 6], fg: lerp(m.fg, [150, 146, 136], (h >> 4 & 7) / 10), bg: lerp(m.bg, [30, 30, 34], (h >> 8 & 3) / 4), emissive: false };
		}
		// A window: the wall's line carried through it, in pale glass.
		if (isWindow(c)) {
			const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => at(t, x + dx, y + dy)).find((n) => n?.tile === 'wall' && !isWindow(n));
			const style = (MATS[side?.mat ?? ''] ?? FALLBACK).style ?? 'single';
			return { ch: ' ', fg: m.fg, bg: m.bg, emissive: false, wall: { mask: maskHere() & ((joins(1, 0) || joins(-1, 0)) ? 10 : 5), style }, glass: true };
		}
		if (!m.style) return { ch: m.wall, fg: m.fg, bg: m.bg, emissive: false };
		return { ch: ' ', fg: m.fg, bg: m.bg, emissive: false, wall: { mask: maskHere(), style: m.style } };
	}
	const thing = c.things.map((n) => [n, KINDS[n]] as const).filter(([, k]) => k).pop();
	if (thing) {
		const [name, k] = thing;
		// A door stands open (') or is shut and locked, plain for everyone to see; shut, it carries the wall's line.
		if (name === 'door') {
			const shut = t.locked.has(x + y * t.w);
			const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => at(t, x + dx, y + dy)).find((n) => n?.tile === 'wall');
			const style = (MATS[side?.mat ?? ''] ?? FALLBACK).style ?? 'single';
			return shut
				? { ch: '◘', fg: [235, 170, 90], bg: lerp(m.bg, [120, 50, 30], 0.6), emissive: false, wall: { mask: maskHere() & ((joins(1, 0) || joins(-1, 0)) ? 10 : 5), style } }
				: { ch: "'", fg: k.fg, bg: m.bg, emissive: false };
		}
		if (name === 'bell' || name === 'clock') return { ch: ' ', fg: k.fg, bg: m.bg, emissive: false, icon: name };
		if (name === 'flowers') return { ch: hash(x, y, 3) % 3 ? '*' : '\u2740', fg: FLOWERS[hash(x, y, 5) % FLOWERS.length], bg: m.bg, emissive: false };
		if (name === 'waterfall') {
			const f = Math.floor(ms / 140) - y;
			return { ch: ['¦', '|', ':', '¦'][((f % 4) + 4) % 4], fg: lerp(k.fg, [255, 255, 255], (hash(x, f, 2) & 3) / 6), bg: lerp(m.bg, [70, 110, 140], 0.5), emissive: false };
		}
		return { ch: k.ch, fg: k.fg, bg: m.bg, emissive: !!k.light };
	}
	if (c.mat === 'water') {
		const r = Math.floor(ms / 700 + hash(x, y, 9) % 7);
		return { ch: m.floors[(hash(x, y, 7) + r) % m.floors.length], fg: lerp(m.fg, m.bg, (r % 3) * 0.2), bg: m.bg, emissive: false };
	}
	if (c.tile === 'stair-up') return { ch: '<', fg: lerp(m.fg, [255, 255, 255], 0.4), bg: m.bg, emissive: false };
	// Laid floors (paving, boards) are a faint texture, so what stands on them reads first.
	const laid = !!m.style;
	return { ch: m.floors[hash(x, y, 7) % m.floors.length], fg: laid ? lerp(m.fg, m.bg, 0.72) : m.fg, bg: m.bg, emissive: false };
}
