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

export interface Mat { fg: Rgb; bg: Rgb; wall: string; floors: string[]; style?: 'double' | 'single'; }

/**
 * Colours from the real thing (docs/PALETTE.md, section 4: oak, weathered boards, teak, straw, turf, limestone,
 * granite, slate, red brick), then two small steps, both applied once when the table is built:
 *  - `lean`: a few per cent toward the dye the book is painted in (weld, madder, woad, verdigris, oak-gall,
 *    vellum), so the village and the book feel related, with the lightness of the material kept as it was;
 *  - `LIFT`: a shade brighter all round.
 * Light, flicker and the day/night maths are untouched: this is only what colour a thing is before lighting.
 */
const DYE = {
	weld: [216, 177, 58] as Rgb, madder: [181, 72, 58] as Rgb, woad: [47, 79, 127] as Rgb, verdigris: [62, 143, 122] as Rgb,
	gall: [90, 65, 48] as Rgb, vellum: [232, 221, 196] as Rgb, green: [143, 156, 108] as Rgb
};
const LIFT = 1.07;
const lean = (c: Rgb, dye: Rgb, k: number): Rgb => {
	const lum = (v: Rgb) => 0.3 * v[0] + 0.59 * v[1] + 0.11 * v[2];
	const m = c.map((v, i) => v + (dye[i] - v) * k) as Rgb, s = lum(c) / lum(m);
	return m.map((v) => v * s) as Rgb;
};
const finish = (c: Rgb, dye?: Rgb, k = 0.08): Rgb => (dye ? lean(c, dye, k) : c).map((v) => Math.min(255, Math.round(v * LIFT))) as Rgb;
/** A material: fg and bg as they are in nature, leaned toward a dye, lifted. */
const mat = (fg: Rgb, bg: Rgb, wall: string, floors: string[], dye?: Rgb, style?: 'double' | 'single', k?: number): Mat =>
	({ fg: finish(fg, dye, k), bg: finish(bg, dye, k), wall, floors, ...(style ? { style } : {}) });

export const MATS: Record<string, Mat> = {
	// Sunlit turf has yellow in it; the sod beneath is dark and rich.
	grass: mat([104, 152, 56], [34, 54, 20], '"', [',', '.', "'", '"', '`', ',', '.'], DYE.green),
	// Bare soil, a little redder where it is brown earth (#5A4430 in the shade).
	soil: mat([136, 100, 64], [66, 48, 32], '▒', ['.', ',', '·', '.'], DYE.gall, undefined, 0.06),
	sand: mat([200, 182, 132], [88, 76, 48], '▒', ['.', '·', ',', '.']),
	gravel: mat([152, 148, 140], [62, 60, 56], '▒', [':', '·', '.', ':']),
	mud: mat([112, 86, 58], [50, 36, 24], '▒', ['~', ',', '.', ','], DYE.gall, undefined, 0.06),
	clay: mat([176, 104, 72], [80, 46, 32], '▒', ['.', ',', '·'], DYE.madder),
	// Weathered oak and warm-grey boards (#8A8579 over aged oak), not dull brown-grey.
	wood: mat([172, 144, 108], [64, 50, 36], 'O', ['+'], DYE.gall, 'single'),
	leaves: mat([66, 124, 50], [20, 46, 18], '♣', ['♣'], DYE.green),
	// Stone block: warm grey masonry; limestone paler and cream, granite cooler and bluer.
	'stone block': mat([190, 184, 172], [66, 62, 58], '#', ['+'], DYE.vellum, 'double', 0.06),
	// Slate is blue-grey (#4F5961), wet slate bluer.
	slate: mat([104, 118, 132], [38, 45, 54], '▓', ['≡'], DYE.woad),
	granite: mat([124, 128, 136], [46, 49, 56], '▓', ['.', '·', '.', ','], DYE.woad, undefined, 0.06),
	water: mat([100, 156, 196], [20, 50, 76], '≈', ['~', '≈', '~', '-'], DYE.woad, undefined, 0.1),
	glass: mat([170, 214, 232], [44, 70, 84], '░', ['.']),
	// Saltgrave's: sooty brick terraces (red clay, #9A4B35), wet cobbles, iron railings.
	brick: mat([182, 96, 68], [68, 34, 28], '#', ['+'], DYE.madder, 'double'),
	cobble: mat([128, 126, 122], [42, 42, 44], '▒', ['∙', '·', ':', '∙', '.']),
	iron: mat([98, 104, 114], [24, 26, 30], '╫', ['.']),
	ice: mat([200, 230, 244], [70, 96, 112], '░', ['.', '-', '.']),
	// Wolfsgrund's: snow lying everywhere, and the pine wood (blue-green, nearly black in its shade).
	snow: mat([214, 222, 232], [128, 136, 150], '▒', ['.', '·', ',', '.', "'", ' ']),
	pine: mat([44, 94, 74], [10, 28, 24], '♠', ['♠'], DYE.verdigris),
	// Ashcombe's: thatched cottages (new straw), wattle fences, standing wheat that the wind runs through, pasture, tilled plots.
	thatch: mat([198, 162, 90], [86, 66, 36], '▒', ['.'], DYE.weld),
	paling: mat([150, 124, 88], [36, 52, 24], '┼', ['.'], DYE.gall, 'single'),
	wheat: mat([204, 172, 94], [90, 74, 36], '"', ['"', "'", ',', '"'], DYE.weld),
	pasture: mat([120, 154, 64], [40, 56, 24], '"', [',', '.', "'", ',', '.', ' '], DYE.green),
	tilled: mat([110, 138, 62], [64, 44, 30], '▒', ['=', '≡', '='], DYE.green),
	// The abbey's: pale limestone, the garth's turf.
	limestone: mat([208, 200, 176], [70, 67, 56], '#', ['+'], DYE.vellum, 'double'),
	// The liner's: teak decks (golden-brown), white-painted steel, black hull plates, the funnels.
	teak: mat([176, 134, 84], [68, 48, 28], 'O', ['='], DYE.gall, 'single', 0.06),
	steel: mat([208, 208, 200], [70, 72, 74], '#', ['+'], undefined, 'double'),
	hull: mat([74, 79, 86], [16, 18, 22], '▓', ['.']),
	funnel: mat([180, 94, 54], [42, 23, 16], '█', ['.'], DYE.madder, undefined, 0.06),
	carpet: mat([154, 62, 64], [54, 23, 27], '▒', ['░', '.'], DYE.madder)
};
const FALLBACK = MATS.soil;

export interface Kind { ch: string; fg: Rgb; light?: Rgb; flicker?: boolean; }
/** Oak for doors and furniture: a richer honey than the weathered boards it stands on, so it reads against wood. */
const BROWN: Rgb = [204, 144, 80], STONE: Rgb = [202, 198, 188];
export const KINDS: Record<string, Kind> = {
	door: { ch: '◘', fg: BROWN }, table: { ch: 'π', fg: BROWN }, chair: { ch: '╥', fg: BROWN }, bed: { ch: 'Θ', fg: [226, 92, 112] },
	chest: { ch: '■', fg: [198, 152, 64] }, bookshelf: { ch: '≡', fg: BROWN }, barrel: { ch: 'ö', fg: [166, 112, 58] },
	torch: { ch: '¡', fg: [255, 210, 110], light: [255, 176, 92], flicker: true },
	brazier: { ch: 'Ω', fg: [230, 130, 50], light: [255, 150, 60], flicker: true },
	candle: { ch: 'i', fg: [250, 240, 200], light: [170, 130, 70], flicker: true },
	altar: { ch: '╤', fg: STONE }, pew: { ch: '═', fg: BROWN }, coffin: { ch: '▬', fg: [166, 114, 76] }, statue: { ch: '†', fg: STONE },
	well: { ch: 'O', fg: STONE }, anvil: { ch: '¬', fg: [128, 130, 140] }, 'hay bale': { ch: '"', fg: [226, 200, 104] },
	sign: { ch: '¶', fg: BROWN }, bell: { ch: ' ', fg: [220, 178, 94] }, oak: { ch: '♣', fg: [78, 128, 48] }, loom: { ch: '╫', fg: BROWN }, oven: { ch: '◙', fg: [204, 122, 70], light: [150, 80, 30] }, cart: { ch: '⌐', fg: BROWN }, clock: { ch: ' ', fg: [220, 178, 94] }, flowers: { ch: '*', fg: [220, 120, 160] }, waterfall: { ch: '¦', fg: [204, 230, 242] }, rug: { ch: '░', fg: [158, 54, 54] },
	'gas lamp': { ch: '‡', fg: [214, 236, 196], light: [150, 186, 150] }, fern: { ch: '♠', fg: [78, 152, 98] },
	sigil: { ch: '✶', fg: [120, 230, 180], light: [50, 130, 100], flicker: true },
	beacon: { ch: '☼', fg: [255, 244, 200], light: [255, 236, 180] }, 'plank bridge': { ch: '=', fg: [164, 124, 80] },
	reeds: { ch: '⌠', fg: [158, 164, 88] }, 'bare tree': { ch: '¥', fg: [126, 110, 94] }, crops: { ch: '♣', fg: [104, 154, 72] },
	rail: { ch: '■', fg: [124, 128, 136] }, lifeboat: { ch: '▬', fg: [226, 224, 214] }, wheel: { ch: '¤', fg: [220, 178, 94] }, piano: { ch: '╤', fg: [20, 18, 22] }, lamp: { ch: '♦', fg: [250, 226, 170], light: [190, 150, 90] }
};
const DOUBLE = ['■', '║', '═', '╚', '║', '║', '╔', '╠', '═', '╝', '═', '╩', '╗', '╣', '╦', '╬'];
const SINGLE = ['o', '│', '─', '└', '│', '│', '┌', '├', '─', '┘', '─', '┴', '┐', '┤', '┬', '┼'];

const SKY_MAX = 15, FALLOFF = 10, FALLOFF_DIAG = 14, AMBIENT = 0.12;
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

/** The village's weather: a fair, bright day, a warm dusk, a moonlit night in which the torches still tell. */
const MOOD: Record<Phase, Rgb> = { day: [0.98, 0.97, 0.96], dusk: [0.86, 0.74, 0.72], circle: [0.86, 0.74, 0.72], night: [0.9, 1, 1.35] };

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
	// Flames tell in the dark; by day a torch is a small thing beside the sky.
	const flame = 1.3 * (1 - Math.min(0.7, (day[0] + day[1] + day[2]) / 3));
	// Every room has windows: no floor is ever darker than this share of the daylight, and upstairs
	// (lofts and chambers reached only by a stair, which no daylight flood reaches) more.
	const least = t.z > 0 ? 0.75 : 0.4;
	const sample = (i: number): Rgb => {
		// Daylight carries well through doorways: rooms are dim, not black.
		const s = Math.max(least, (sk[i] / SKY_MAX) ** 1.2);
		return [0, 1, 2].map((c) => s * day[c] + (dyn[i * 3 + c] / 255) * flame) as Rgb;
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
	const fl = luma(fg) * 0.42 + 26, bl = luma(bg) * 0.24;
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
		const bg = lerp(tone(l.bg, 1 + patch * 0.36 + fine * 0.12), [l.bg[0] * 1.35 + 14, l.bg[1] * 1.12 + 6, l.bg[2] * 0.7], Math.min(0.6, dry));
		return { ...l, bg, fg: lerp(tone(l.fg, 1 + patch * 0.3 + fine * 0.2), [l.fg[0] * 1.3 + 20, l.fg[1] * 1.1, l.fg[2] * 0.7], Math.min(0.5, dry)) };
	}
	if (EARTH.has(mat)) {
		const wet = Math.max(0, noise(x * 0.1, y * 0.1 + 70, 27) - 0.55) * 1.8;
		const bg = lerp(tone(l.bg, 1 + patch * 0.3 + fine * 0.14), tone(l.bg, 0.72), Math.min(0.6, wet));
		return { ...l, bg, fg: tone(l.fg, 1 + fine * 0.25) };
	}
	// Built things: weathering, and now and then a little moss on stone outdoors.
	const k = 1 + patch * (wall ? 0.14 : 0.18) + fine * 0.1;
	const moss = !wall && (hash(x, y, 29) & 63) < 3 && /stone|cobble|slate|granite|limestone/.test(mat);
	return { ...l, bg: moss ? lerp(tone(l.bg, k), [76, 98, 54], 0.35) : tone(l.bg, k), fg: tone(l.fg, 1 + fine * 0.12) };
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
			return { ch: ['▒', '▓', '▒', '░', '▲', '▒'][h % 6], fg: lerp(m.fg, [156, 156, 160], (h >> 4 & 7) / 10), bg: lerp(m.bg, [30, 30, 34], (h >> 8 & 3) / 4), emissive: false };
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
