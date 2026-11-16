/**
 * look.ts - the village drawn the way Tachyon draws a world
 * (tachyon/src/draw/view/mod.rs, src/sim/light.rs), so a town looks the
 * same in both:
 *
 *  - every cell is filled with its material's colours (grass is green
 *    through and through), two characters wide, so the map is square;
 *  - light is sky light (full outdoors, leaking in through doorways and
 *    fading into rooms) of the phase's sun or moon, plus the light of
 *    torches, braziers, candles and lamps, each its own colour temperature,
 *    walking round corners and falling off with the square of the distance;
 *    flames breathe. How light becomes colour is grade.ts (linear light,
 *    the eye's adaptation, a palette fitted to the town);
 *  - walls join up into lines (double for stone, single for timber);
 *  - places seen before but not now are faded and dim.
 *
 * Shapes and glyphs are Tachyon's; the light went its own way on 2026-11-16
 * (realistic falloff and colour temperatures), so Tachyon's torchlight no
 * longer matches until it takes grade.ts too.
 */
import { at, isWindow } from './map.ts';
import type { Phase, Town } from './map.ts';
import { kelvin, lit, litInFog, memoryOf } from './grade.ts';
import type { Grade, Rgb } from './grade.ts';

export type { Rgb };

interface Mat { fg: Rgb; bg: Rgb; wall: string; floors: string[]; style?: 'double' | 'single'; }
const MATS: Record<string, Mat> = {
	grass: { fg: [84, 150, 58], bg: [26, 46, 18], wall: '"', floors: [',', '.', "'", '"', '`', ',', '.'] },
	soil: { fg: [128, 92, 58], bg: [54, 38, 24], wall: '▒', floors: ['.', ',', '·', '.'] },
	sand: { fg: [196, 180, 128], bg: [84, 74, 46], wall: '▒', floors: ['.', '·', ',', '.'] },
	gravel: { fg: [150, 146, 140], bg: [60, 58, 56], wall: '▒', floors: [':', '·', '.', ':'] },
	mud: { fg: [110, 84, 56], bg: [48, 34, 22], wall: '▒', floors: ['~', ',', '.', ','] },
	clay: { fg: [170, 100, 70], bg: [78, 44, 30], wall: '▒', floors: ['.', ',', '·'] },
	wood: { fg: [150, 116, 80], bg: [60, 44, 30], wall: 'O', floors: ['+'], style: 'single' },
	leaves: { fg: [60, 134, 48], bg: [18, 44, 16], wall: '♣', floors: ['♣'] },
	'stone block': { fg: [178, 176, 168], bg: [62, 60, 58], wall: '#', floors: ['+'], style: 'double' },
	slate: { fg: [96, 104, 124], bg: [36, 40, 50], wall: '▓', floors: ['≡'] },
	granite: { fg: [118, 116, 124], bg: [46, 44, 52], wall: '▓', floors: ['.', '·', '.', ','] },
	water: { fg: [96, 150, 196], bg: [18, 44, 72], wall: '≈', floors: ['~', '≈', '~', '-'] },
	glass: { fg: [170, 214, 232], bg: [44, 70, 84], wall: '░', floors: ['.'] },
	// Saltgrave's: sooty brick terraces, wet cobbles, iron railings.
	brick: { fg: [150, 96, 76], bg: [56, 36, 30], wall: '#', floors: ['+'], style: 'double' },
	cobble: { fg: [124, 122, 120], bg: [40, 40, 42], wall: '▒', floors: ['∙', '·', ':', '∙', '.'] },
	iron: { fg: [96, 102, 110], bg: [24, 26, 30], wall: '╫', floors: ['.'] },
	ice: { fg: [200, 230, 244], bg: [70, 96, 112], wall: '░', floors: ['.', '-', '.'] },
	// Wolfsgrund's: snow lying everywhere, and the pine wood.
	snow: { fg: [226, 232, 240], bg: [150, 160, 176], wall: '▒', floors: ['.', '·', ',', '.', "'", ' '] },
	pine: { fg: [46, 96, 62], bg: [10, 26, 18], wall: '♠', floors: ['♠'] },
	// Ashcombe's: thatched cottages, wattle fences, standing wheat that the wind runs through, pasture, tilled plots.
	thatch: { fg: [176, 146, 86], bg: [74, 58, 32], wall: '▒', floors: ['.'] },
	paling: { fg: [130, 100, 66], bg: [34, 44, 22], wall: '┼', floors: ['.'], style: 'single' },
	wheat: { fg: [196, 168, 92], bg: [86, 72, 36], wall: '"', floors: ['"', "'", ',', '"'] },
	pasture: { fg: [96, 148, 66], bg: [30, 50, 22], wall: '"', floors: [',', '.', "'", ',', '.', ' '] },
	tilled: { fg: [104, 136, 60], bg: [58, 40, 26], wall: '▒', floors: ['=', '≡', '='] },
	// The abbey's: pale limestone, the garth's turf.
	limestone: { fg: [196, 190, 172], bg: [72, 70, 62], wall: '#', floors: ['+'], style: 'double' },
	// The liner's: teak decks, white-painted steel, black hull plates, the funnels.
	teak: { fg: [168, 128, 84], bg: [62, 44, 28], wall: 'O', floors: ['='], style: 'single' },
	steel: { fg: [206, 206, 198], bg: [70, 72, 74], wall: '#', floors: ['+'], style: 'double' },
	hull: { fg: [74, 78, 84], bg: [16, 18, 22], wall: '▓', floors: ['.'] },
	funnel: { fg: [176, 92, 54], bg: [40, 22, 16], wall: '█', floors: ['.'] },
	carpet: { fg: [150, 60, 64], bg: [52, 22, 26], wall: '▒', floors: ['░', '.'] }
};
const FALLBACK = MATS.soil;

/**
 * A light: its colour temperature in kelvin (or, for the unnatural ones, a linear colour of its own),
 * how strong it is beside full daylight (1), how far it carries in cells, and whether it is a flame.
 */
interface Glow { k?: number; tint?: Rgb; i: number; reach: number; flicker?: boolean; }
interface Kind { ch: string; fg: Rgb; light?: Glow; }
const BROWN: Rgb = [176, 124, 72], STONE: Rgb = [190, 186, 178];
const KINDS: Record<string, Kind> = {
	door: { ch: '◘', fg: BROWN }, table: { ch: 'π', fg: BROWN }, chair: { ch: '╥', fg: BROWN }, bed: { ch: 'Θ', fg: [190, 70, 64] },
	chest: { ch: '■', fg: [150, 100, 52] }, bookshelf: { ch: '≡', fg: BROWN }, barrel: { ch: 'ö', fg: [150, 104, 56] },
	torch: { ch: '¡', fg: [255, 210, 110], light: { k: 2000, i: 0.9, reach: 14, flicker: true } },
	brazier: { ch: 'Ω', fg: [240, 150, 60], light: { k: 1800, i: 1.1, reach: 15, flicker: true } },
	candle: { ch: 'i', fg: [250, 236, 190], light: { k: 1850, i: 0.32, reach: 7, flicker: true } },
	altar: { ch: '╤', fg: STONE }, pew: { ch: '═', fg: BROWN }, coffin: { ch: '▬', fg: [90, 60, 40] }, statue: { ch: '†', fg: STONE },
	well: { ch: 'O', fg: STONE }, anvil: { ch: '¬', fg: [120, 120, 130] }, 'hay bale': { ch: '"', fg: [220, 200, 100] },
	sign: { ch: '¶', fg: BROWN }, bell: { ch: ' ', fg: [214, 172, 92] }, oak: { ch: '♣', fg: [70, 120, 46] }, loom: { ch: '╫', fg: BROWN }, oven: { ch: '◙', fg: [220, 120, 60], light: { k: 1500, i: 0.45, reach: 6, flicker: true } }, cart: { ch: '⌐', fg: BROWN }, clock: { ch: ' ', fg: [214, 172, 92] }, flowers: { ch: '*', fg: [220, 120, 160] }, waterfall: { ch: '¦', fg: [200, 228, 240] }, rug: { ch: '░', fg: [150, 50, 50] },
	'gas lamp': { ch: '‡', fg: [224, 240, 200], light: { k: 3000, tint: [0.9, 1, 0.8], i: 0.8, reach: 13 } }, fern: { ch: '♠', fg: [72, 150, 96] },
	sigil: { ch: '✶', fg: [120, 230, 180], light: { tint: [0.12, 0.55, 0.36], i: 0.6, reach: 9, flicker: true } },
	beacon: { ch: '☼', fg: [255, 244, 200], light: { k: 3400, i: 1.4, reach: 16 } }, 'plank bridge': { ch: '=', fg: [150, 110, 70] },
	reeds: { ch: '⌠', fg: [150, 160, 84] }, 'bare tree': { ch: '¥', fg: [112, 96, 82] }, crops: { ch: '♣', fg: [96, 150, 70] },
	rail: { ch: '■', fg: [120, 124, 130] }, lifeboat: { ch: '▬', fg: [222, 220, 210] }, wheel: { ch: '¤', fg: [214, 172, 92] }, piano: { ch: '╤', fg: [60, 44, 36] }, lamp: { ch: '♦', fg: [250, 226, 170], light: { k: 2400, i: 0.6, reach: 11 } }
};
const DOUBLE = ['■', '║', '═', '╚', '║', '║', '╔', '╠', '═', '╝', '═', '╩', '╗', '╣', '╦', '╬'];
const SINGLE = ['o', '│', '─', '└', '│', '│', '┌', '├', '─', '┘', '─', '┴', '┐', '┤', '┬', '┼'];

const SKY_MAX = 15;
/** A walker's lantern after dark: a small oil flame, carried. */
export const LANTERN: Glow = { k: 2100, i: 0.4, reach: 8, flicker: true };

const hash = (x: number, y: number, k: number) => {
	let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(k, 1274126177);
	h = Math.imul(h ^ (h >>> 13), 1103515245);
	return (h ^ (h >>> 16)) >>> 0;
};
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/**
 * The mist's own colour (it is lit by whatever lights the place it hangs in: grey-white by day, rose at
 * dusk, dark blue under the moon, gold round a lamp). A town's weather may give its own (weather.ts).
 */
export const MIST: Rgb = [168, 174, 178];

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
	const near = phase === 'night' ? 3 : phase === 'day' ? 8 : 5;
	const far = phase === 'night' ? 14 : phase === 'day' ? 28 : 19;
	const d = Math.hypot(x - from.x, y - from.y);
	const drift = noise(x * 0.18 + ms * 0.00011, y * 0.24 - ms * 0.00004) * 0.6 + noise(x * 0.07 - ms * 0.00005, y * 0.09, 5) * 0.4;
	const edge = Math.min(x, y, t.w - 1 - x, t.h - 1 - y);
	const woods = smooth(9, 1, edge); // the forest round the town is always deep in mist
	// Clear round you; the drifting banks only roll in further out.
	const f = smooth(near, far, d) * 0.9 + (drift - 0.45) * 0.45 * smooth(near * 0.5, near + 3, d) + woods * 0.6;
	return Math.min(0.97, Math.max(0, f));
}

/**
 * Clouds passing over on a fair day: how much of the sun a cell has lost to a cloud's shadow now (0 none).
 * Big soft shapes drifting with the wind, a cell every second or so.
 */
export function cloudShade(x: number, y: number, ms: number): number {
	const n = noise(x * 0.045 - ms * 0.0007, y * 0.06 - ms * 0.00025, 41) * 0.75 + noise(x * 0.11 - ms * 0.0011, y * 0.13, 43) * 0.25;
	return smooth(0.5, 0.72, n);
}

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

/** A light in the town now: where, its colour (linear, strength and flicker in), how far it carries. */
export interface Source { x: number; y: number; c: Rgb; reach: number; }

const glowColour = (g: Glow): Rgb => g.tint ?? kelvin(g.k ?? 3000);
/** A light at (x, y) as it burns at `ms`: a flame breathes (smoothly, not at random from frame to frame). */
export function source(g: Glow, x: number, y: number, ms: number, k = 1): Source {
	const f = g.flicker ? 0.84 + 0.16 * noise(ms / 160 + x * 7.3, y * 3.1, 61) : 1;
	const c = glowColour(g), s = g.i * f * k;
	return { x, y, c: [c[0] * s, c[1] * s, c[2] * s], reach: g.reach * (0.94 + 0.06 * f) };
}

/** The light sources in the town; `ms` makes the flames breathe. */
export function sources(t: Town, ms: number): Source[] {
	const out: Source[] = [];
	for (const l of t.lights) {
		const k = t.cells[l.x + l.y * t.w].things.map((n) => KINDS[n]).find((k) => k?.light);
		if (k?.light) out.push(source(k.light, l.x, l.y, ms));
	}
	return out;
}
/** The lights of a town's fires (torches, braziers, ovens): where sparks rise from. */
export function fires(t: Town): { x: number; y: number; big: boolean }[] {
	return t.lights.flatMap((l) => {
		const n = t.cells[l.x + l.y * t.w].things;
		return n.includes('brazier') || n.includes('torch') || n.includes('oven') ? [{ x: l.x, y: l.y, big: n.includes('brazier') }] : [];
	});
}

/**
 * How far light walks from a cell, round corners and through doorways (diagonal steps 1.41, never
 * cutting a wall's corner), out to `reach`. Kept per town: walls never move.
 */
interface Field { idx: Int32Array; d: Float32Array; }
const fieldCache = new WeakMap<Town, Map<number, Field>>();
function field(t: Town, x0: number, y0: number, reach: number): Field {
	let m = fieldCache.get(t);
	if (!m) fieldCache.set(t, (m = new Map()));
	const key = (x0 + y0 * t.w) * 32 + Math.min(31, Math.ceil(reach));
	const hit = m.get(key);
	if (hit) return hit;
	if (m.size > 3000) m.clear();
	const R = Math.ceil(reach), side = 2 * R + 1;
	const dist = new Float32Array(side * side).fill(Infinity);
	const local = (x: number, y: number) => x - x0 + R + (y - y0 + R) * side;
	const heap: number[] = [];
	const push = (d: number, x: number, y: number) => {
		heap.push(d, x, y);
		let i = heap.length / 3 - 1;
		while (i > 0) {
			const p = (i - 1) >> 1;
			if (heap[p * 3] <= heap[i * 3]) break;
			for (let k = 0; k < 3; k++) [heap[p * 3 + k], heap[i * 3 + k]] = [heap[i * 3 + k], heap[p * 3 + k]];
			i = p;
		}
	};
	const pop = (): [number, number, number] => {
		const top: [number, number, number] = [heap[0], heap[1], heap[2]];
		const last = heap.splice(heap.length - 3, 3);
		if (heap.length) {
			heap[0] = last[0]; heap[1] = last[1]; heap[2] = last[2];
			let i = 0;
			const n = heap.length / 3;
			for (;;) {
				const l = 2 * i + 1, r = l + 1;
				let s = i;
				if (l < n && heap[l * 3] < heap[s * 3]) s = l;
				if (r < n && heap[r * 3] < heap[s * 3]) s = r;
				if (s === i) break;
				for (let k = 0; k < 3; k++) [heap[s * 3 + k], heap[i * 3 + k]] = [heap[i * 3 + k], heap[s * 3 + k]];
				i = s;
			}
		}
		return top;
	};
	dist[local(x0, y0)] = 0;
	push(0, x0, y0);
	const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]];
	const idx: number[] = [], ds: number[] = [];
	while (heap.length) {
		const [d, x, y] = pop();
		if (d > dist[local(x, y)]) continue;
		idx.push(x + y * t.w); ds.push(d);
		for (const [dx, dy, c] of dirs) {
			const nx = x + dx, ny = y + dy, nd = d + c;
			if (nd > reach || Math.abs(nx - x0) > R || Math.abs(ny - y0) > R) continue;
			if (blocksLight(t, nx, ny)) continue;
			if (dx && dy && (blocksLight(t, x + dx, y) || blocksLight(t, x, y + dy))) continue;
			const li = local(nx, ny);
			if (nd < dist[li]) { dist[li] = nd; push(nd, nx, ny); }
		}
	}
	const f = { idx: Int32Array.from(idx), d: Float32Array.from(ds) };
	m.set(key, f);
	return f;
}

/**
 * Coloured light, linear, summed from every source: bright at the flame, falling off with the square of
 * the way it walked (round corners, through doorways), softly to nothing at its reach.
 */
export function lightMap(t: Town, srcs: Source[]): Float32Array {
	const rgb = new Float32Array(t.w * t.h * 3);
	for (const s of srcs) {
		const f = field(t, s.x, s.y, s.reach);
		const core = 2.2, fade0 = s.reach * 0.55;
		for (let k = 0; k < f.idx.length; k++) {
			const d = f.d[k];
			const a = (1 / (1 + (d / core) ** 2)) * (1 - smooth(fade0, s.reach, d));
			const i = f.idx[k] * 3;
			rgb[i] += s.c[0] * a; rgb[i + 1] += s.c[1] * a; rgb[i + 2] += s.c[2] * a;
		}
	}
	return rgb;
}

/**
 * The light falling on a cell, linear (1 = full daylight): the sky (sun, low sun or moon) through
 * doorways and windows, the light everywhere, and the lamps. A wall takes its brightest open neighbour.
 * `sun` is the grade's, perhaps dimmed by a cloud or lit by lightning.
 */
export function lightAt(t: Town, sk: Uint8Array, dyn: Float32Array, g: Grade, x: number, y: number, sun: Rgb = g.sun): Rgb {
	const win = g.window[t.z > 0 ? 1 : 0];
	const sample = (i: number): Rgb => {
		// Daylight carries through doorways and fades into a room; every room has windows.
		const s = Math.max(sk[i] === SKY_MAX ? 1 : win, (sk[i] / SKY_MAX) ** 2.4);
		return [s * sun[0] + g.fill[0] + dyn[i * 3] * g.flame, s * sun[1] + g.fill[1] + dyn[i * 3 + 1] * g.flame, s * sun[2] + g.fill[2] + dyn[i * 3 + 2] * g.flame];
	};
	if (!isWallAt(t, x, y)) return sample(x + y * t.w);
	// Bare rock (the cliff) lies under the open sky: daylight falls on it, a little dimmer than the ground.
	const l: Rgb = at(t, x, y)!.mat === 'granite' ? [sun[0] * 0.55 + g.fill[0], sun[1] * 0.55 + g.fill[1], sun[2] * 0.55 + g.fill[2]] : [g.fill[0], g.fill[1], g.fill[2]];
	for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
		if ((!dx && !dy) || !at(t, x + dx, y + dy) || blocksLight(t, x + dx, y + dy)) continue;
		const s = sample(x + dx + (y + dy) * t.w);
		for (let c = 0; c < 3; c++) l[c] = Math.max(l[c], s[c]);
	}
	return l;
}

export const mul = (c: Rgb, l: Rgb): Rgb => [c[0] * l[0], c[1] * l[1], c[2] * l[2]];
export const lerp = (a: Rgb, b: Rgb, k: number): Rgb => [0, 1, 2].map((c) => a[c] + (b[c] - a[c]) * k) as Rgb;
export const css = (c: Rgb, a = 1) => `rgba(${Math.round(Math.min(255, c[0]))},${Math.round(Math.min(255, c[1]))},${Math.round(Math.min(255, c[2]))},${a})`;
export const luma = (c: Rgb) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

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
/** Grass, leaves, fields: living ground, which goes in patches of lush and sun-dried. */
const LIVING = new Set(['grass', 'leaves', 'pasture', 'wheat', 'pine', 'tilled', 'reeds']);
/** Earth: wetter and drier patches. */
const EARTH = new Set(['soil', 'mud', 'gravel', 'snow', 'sand']);

/**
 * A cell's colour, varied: broad patches (slow noise) and a little from cell to cell (a hash), so the ground
 * has texture and nothing is one flat colour. Living ground shifts between lush and sun-dried, earth between
 * wet and dry, stone and timber take a little weathering and the odd stain of moss. Water and lights keep theirs.
 */
function vary(l: Look, mat: string, wall: boolean, x: number, y: number): Look {
	if (mat === 'water' || l.emissive) return l;
	const patch = noise(x * 0.13, y * 0.13, 21) - 0.5, fine = ((hash(x, y, 23) & 255) / 255 - 0.5);
	const tone = (c: Rgb, k: number): Rgb => c.map((v) => v * k) as Rgb;
	if (LIVING.has(mat)) {
		const dry = Math.max(0, noise(x * 0.07 + 40, y * 0.07, 25) - 0.45) * 1.6;
		const bg = lerp(tone(l.bg, 1 + patch * 0.36 + fine * 0.06), [l.bg[0] * 1.35 + 14, l.bg[1] * 1.12 + 6, l.bg[2] * 0.7], Math.min(0.6, dry));
		return { ...l, bg, fg: lerp(tone(l.fg, 1 + patch * 0.3 + fine * 0.2), [l.fg[0] * 1.3 + 20, l.fg[1] * 1.1, l.fg[2] * 0.7], Math.min(0.5, dry)) };
	}
	// Snow lies smooth: only a faint drift, a little bluer in the hollows.
	if (mat === 'snow') return { ...l, bg: lerp(l.bg, [l.bg[0] * 0.9, l.bg[1] * 0.94, l.bg[2]], Math.max(0, -patch) * 1.2), fg: tone(l.fg, 1 + fine * 0.06) };
	if (EARTH.has(mat)) {
		const wet =Math.max(0, noise(x * 0.1, y * 0.1 + 70, 27) - 0.55) * 1.8;
		const bg = lerp(tone(l.bg, 1 + patch * 0.3 + fine * 0.07), tone(l.bg, 0.72), Math.min(0.6, wet));
		return { ...l, bg, fg: tone(l.fg, 1 + fine * 0.25) };
	}
	// Built things: weathering, and now and then a little moss on stone outdoors.
	const k = 1 + patch * (wall ? 0.14 : 0.18) + fine * 0.05;
	const moss = !wall && (hash(x, y, 29) & 63) < 3 && /stone|cobble|slate|granite|limestone/.test(mat);
	return { ...l, bg: moss ? lerp(tone(l.bg, k), [70, 92, 52], 0.35) : tone(l.bg, k), fg: tone(l.fg, 1 + fine * 0.12) };
}

export function lookAt(t: Town, x: number, y: number, ms = 0): Look {
	const c = at(t, x, y)!;
	return vary(lookAtPlain(t, x, y, ms), c.mat, c.tile === 'wall', x, y);
}

function lookAtPlain(t: Town, x: number, y: number, ms: number): Look {
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
		// A door stands open (an arch, ∩) or is shut and locked, plain for everyone to see; shut, it carries the wall's line.
		if (name === 'door') {
			const shut = t.locked.has(x + y * t.w);
			const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => at(t, x + dx, y + dy)).find((n) => n?.tile === 'wall');
			const style = (MATS[side?.mat ?? ''] ?? FALLBACK).style ?? 'single';
			return shut
				? { ch: '◘', fg: [235, 170, 90], bg: lerp(m.bg, [120, 50, 30], 0.6), emissive: false, wall: { mask: maskHere() & ((joins(1, 0) || joins(-1, 0)) ? 10 : 5), style } }
				: { ch: '∩', fg: k.fg, bg: m.bg, emissive: false };
		}
		if (name === 'bell' || name === 'clock') return { ch: ' ', fg: k.fg, bg: m.bg, emissive: false, icon: name };
		if (name === 'flowers') return { ch: hash(x, y, 3) % 3 ? '*' : '\u2740', fg: FLOWERS[hash(x, y, 5) % FLOWERS.length], bg: m.bg, emissive: false };
		if (name === 'waterfall') {
			const f = Math.floor(ms / 140) - y;
			return { ch: ['¦', '|', ':', '¦'][((f % 4) + 4) % 4], fg: lerp(k.fg, [255, 255, 255], (hash(x, f, 2) & 3) / 6), bg: lerp(m.bg, [70, 110, 140], 0.5), emissive: false };
		}
		return { ch: k.ch, fg: k.fg, bg: m.bg, emissive: !!k.light };
	}
	if (c.mat === 'wheat') {
		const wv = Math.sin((x * 0.32 + y * 0.18) - ms / 520) + Math.sin(x * 0.07 - ms / 1700) * 0.6;
		const bent = wv > 0.9;
		return { ch: bent ? (hash(x, y, 4) & 1 ? '/' : ',') : m.floors[hash(x, y, 7) % m.floors.length], fg: lerp(m.fg, [236, 214, 140], bent ? 0.45 : 0), bg: m.bg, emissive: false };
	}
	if (c.mat === 'water') {
		const r = Math.floor(ms / 700 + hash(x, y, 9) % 7);
		return { ch: m.floors[(hash(x, y, 7) + r) % m.floors.length], fg: lerp(m.fg, m.bg, (r % 3) * 0.2), bg: m.bg, emissive: false };
	}
	// Stairs as Tachyon draws them: < goes up, > goes down.
	if (c.tile === 'stair-up') return { ch: '<', fg: lerp(m.fg, [255, 255, 255], 0.5), bg: m.bg, emissive: false };
	if (c.tile === 'stair-down') return { ch: '>', fg: lerp(m.fg, [255, 255, 255], 0.5), bg: m.bg, emissive: false };
	// Laid floors (paving, boards) are a faint texture, so what stands on them reads first.
	const laid = !!m.style;
	return { ch: m.floors[hash(x, y, 7) % m.floors.length], fg: laid ? lerp(m.fg, m.bg, 0.72) : m.fg, bg: m.bg, emissive: false };
}

/**
 * Every colour this town can show under grade `g` (and its eyes adjusted indoors, `inside`): each cell's
 * glyph and ground lit as it stands, in mist, half shadowed, remembered, and by a carried lantern after
 * dark; plus the weather's things (`things`, lit) and glowing things (`glows`, as they are). What the
 * map's palette is fitted to (grade.ts fitPalette).
 */
export function townColours(t: Town, g: Grade, inside: number, mist: Rgb, things: Rgb[], glows: Rgb[]): Rgb[] {
	const sk = sky(t), dyn = lightMap(t, sources(t, 0));
	const out: Rgb[] = [...glows];
	const lantern = source(LANTERN, 0, 0, 0).c;
	const gIn: Grade = { ...g, exposure: g.exposure * inside };
	const dark = g.night > 0 || g.flame >= 0.8;
	// A big town is sampled one cell in three (in a slanting pattern): its colours repeat, and it fits three times as fast.
	const thinOut = t.w * t.h > 3000;
	for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
		if (thinOut && (x + 2 * y) % 3) continue;
		const i = x + y * t.w, c = t.cells[i];
		if (c.tile === 'open' && !c.mat) continue;
		const look = lookAt(t, x, y, 0);
		const indoor = t.room[i] >= 0 && t.room[i] !== t.outdoors;
		for (const gr of indoor ? [gIn, g] : [g, gIn]) {
			const L = lightAt(t, sk, dyn, gr, x, y);
			for (const f of [0, 0.3, 0.6, 0.9]) {
				out.push(look.emissive ? look.fg : litInFog(look.fg, mist, f, L, gr), litInFog(look.bg, mist, f * 0.06, L, gr));
			}
			const half: Rgb = [L[0] * 0.55, L[1] * 0.55, L[2] * 0.55];
			out.push(lit(look.fg, half, gr), lit(look.bg, half, gr));
			if (gr === g) {
				// Remembered: the glyph faded (and misted), the ground low and dark (as village.ts draws it).
				const m0 = memoryOf(look.fg, gr), mb = memoryOf(look.bg, gr), m = memoryOf(mist, gr);
				const mf: Rgb = [m0[0] * 0.86, m0[1] * 0.86, m0[2] * 0.88];
				out.push(mf, [mb[0] * 0.38, mb[1] * 0.38, mb[2] * 0.41]);
				for (const k of [0.25, 0.5]) out.push([mf[0] + (m[0] - mf[0]) * k, mf[1] + (m[1] - mf[1]) * k, mf[2] + (m[2] - mf[2]) * k]);
			}
			// A walker's lantern on this ground, near and further off.
			if (dark && (x * 3 + y) % 4 === 0) for (const d of [0, 1.5, 3, 5, 7]) {
				const a = 1 / (1 + (d / 2.2) ** 2);
				const Ll: Rgb = [L[0] + lantern[0] * a, L[1] + lantern[1] * a, L[2] + lantern[2] * a];
				out.push(lit(look.fg, Ll, gr), lit(look.bg, Ll, gr));
			}
		}
		if ((x + y * 5) % 9 === 0) for (const th of things) out.push(lit(th, [g.sun[0] + g.fill[0] + 0.05, g.sun[1] + g.fill[1] + 0.05, g.sun[2] + g.fill[2] + 0.06], g), lit(th, lightAt(t, sk, dyn, g, x, y), g));
	}
	return out;
}
