/**
 * grade.ts - how the town's light becomes colour, one set of rules for every map and every hour.
 *
 *  - Surfaces have colours (their albedo, written in sRGB in look.ts). Light is worked in linear
 *    light, as it adds and falls off in the world: the sky, the sun or moon, a torch, a lantern.
 *  - Every light has a colour temperature in kelvin (a candle 1850 K, noon 5800 K), taken a little
 *    toward white, as an eye that has adjusted sees it; so flames are amber rather than red.
 *  - The eye adapts: night is exposed up so the moonlit town still reads, and in the dark colour
 *    drains to a blue grey (rods, not cones), while a torch keeps its warmth.
 *  - Bright light rolls off softly (a filmic shoulder) instead of clipping: a flame goes to a
 *    warm white at its heart, never to a flat block.
 *  - The map's palette is fitted to the town (fitPalette): the colours it can show under that
 *    phase's light, cut down to as many as a 256-colour terminal has room for, in OKLab, so
 *    lights fade smoothly and grass stays grass.
 */
import type { Phase } from './map.ts';

export type Rgb = [number, number, number];

// ---- sRGB <-> linear ------------------------------------------------------------------------------

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const v = i / 255; LIN[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
/** An sRGB channel (0-255, any number) to linear light (0-1). */
export const toLin = (v: number) => (v <= 0 ? 0 : v >= 255 ? 1 + (v - 255) / 255 : LIN[v | 0] + (LIN[Math.min(255, (v | 0) + 1)] - LIN[v | 0]) * (v - (v | 0)));
/** Linear light (0-1) to an sRGB channel (0-255). */
export const toSrgb = (l: number) => (l <= 0 ? 0 : l >= 1 ? 255 : 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055));
export const linOf = (c: Rgb): Rgb => [toLin(c[0]), toLin(c[1]), toLin(c[2])];
export const srgbOf = (c: Rgb): Rgb => [toSrgb(c[0]), toSrgb(c[1]), toSrgb(c[2])];
/** Luminance of a linear colour. */
export const lum = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/**
 * The colour of a light of `k` kelvin, linear, its brightest channel 1, then taken `adapt` of the
 * way toward white (the eye's white balance: by firelight a white cloth still looks whitish).
 */
export function kelvin(k: number, adapt = 0.3): Rgb {
	const t = k / 100;
	const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
	const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
	const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
	const c = linOf([r, g, b].map((v) => Math.max(0, Math.min(255, v))) as Rgb);
	const m = Math.max(...c);
	return c.map((v) => v / m + (1 - v / m) * adapt) as Rgb;
}

// ---- the light of each phase ----------------------------------------------------------------------

/**
 * How a phase is lit and seen. All colours linear.
 *  sun       light under the open sky (sun by day, low sun at dusk, the moon at night)
 *  fill      light that reaches everywhere, the sky's and walls' bounce: no corner is black
 *  window    how much of the sky reaches a room's floor through its windows (ground, upstairs)
 *  flame     how strongly torches and candles tell beside the sky (small at noon)
 *  exposure  the eye's adaptation: night is turned up so the moonlit town reads
 *  night     how far dim colours fall to the eye's blue grey (0 none, 1 all)
 *  memory    the light a place seen before is remembered in
 */
export interface Grade { sun: Rgb; fill: Rgb; window: [number, number]; flame: number; exposure: number; night: number; memory: number; }

const scale = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
const NOON = kelvin(5800, 0.6), LOW_SUN = kelvin(3400, 0.5), SKY = kelvin(9000, 0.5), MOON = kelvin(4100, 0.2);
/** The moonlight's own tint: the eye in the dark reads it bluer than it is. */
const MOONLIT: Rgb = [MOON[0] * 0.62, MOON[1] * 0.78, MOON[2] * 1.15];

export const GRADES: Record<Phase, Grade> = {
	day: { sun: scale(NOON, 1), fill: scale(SKY, 0.05), window: [0.16, 0.3], flame: 0.35, exposure: 1, night: 0, memory: 0.5 },
	// Dusk: a low gold sun, the shadows filled with the sky's blue (warm and cool, not all red).
	dusk: { sun: [LOW_SUN[0] * 0.46, LOW_SUN[1] * 0.44, LOW_SUN[2] * 0.44], fill: [SKY[0] * 0.06, SKY[1] * 0.07, SKY[2] * 0.11], window: [0.14, 0.26], flame: 0.8, exposure: 1.6, night: 0.15, memory: 0.42 },
	circle: { sun: [LOW_SUN[0] * 0.46, LOW_SUN[1] * 0.44, LOW_SUN[2] * 0.44], fill: [SKY[0] * 0.06, SKY[1] * 0.07, SKY[2] * 0.11], window: [0.14, 0.26], flame: 0.8, exposure: 1.6, night: 0.15, memory: 0.42 },
	// Night: the eye opened wide (exposure), so the moon reads; flames are pools, not floodlights.
	night: { sun: scale(MOONLIT, 0.032), fill: [0.0035, 0.0045, 0.008], window: [0.1, 0.15], flame: 0.42, exposure: 6.5, night: 0.85, memory: 0.4 }
};

// ---- surface under light ------------------------------------------------------------------------

/** The filmic shoulder: straight up to KNEE, then easing toward 1 (never clipping hard). */
const KNEE = 0.72;
const shoulder = (v: number) => (v <= KNEE ? v : KNEE + (1 - KNEE) * (1 - Math.exp(-(v - KNEE) / (1 - KNEE))));

/**
 * A colour as the eye sees it: linear light `c` (already lit and exposed) through the shoulder
 * and, in the dark, the drift to blue grey. Returns sRGB.
 */
export function see(c: Rgb, g: Grade): Rgb {
	let o: Rgb = [shoulder(c[0]), shoulder(c[1]), shoulder(c[2])];
	if (g.night > 0) {
		const y = lum(o);
		// Dim colour drains (below about a fifth of white); a lit thing keeps its own.
		const k = g.night * Math.min(1, Math.max(0, (0.22 - y) / 0.2));
		if (k > 0) {
			const s: Rgb = [y * 0.72, y * 0.9, y * 1.32];
			o = [o[0] + (s[0] - o[0]) * k, o[1] + (s[1] - o[1]) * k, o[2] + (s[2] - o[2]) * k];
		}
	}
	return srgbOf(o);
}

/** A surface of colour `albedo` (sRGB) in linear light `light` (unexposed), seen under grade `g`; sRGB out. */
export function lit(albedo: Rgb, light: Rgb, g: Grade): Rgb {
	const e = g.exposure;
	return see([toLin(albedo[0]) * light[0] * e, toLin(albedo[1]) * light[1] * e, toLin(albedo[2]) * light[2] * e], g);
}

/**
 * The same surface with mist in front of it: the mist has its own colour (`fog`, sRGB) and is lit by
 * the same light, so it glows round a lamp and is dark blue under the moon; `f` is how thick (0-1).
 */
export function litInFog(albedo: Rgb, fog: Rgb, f: number, light: Rgb, g: Grade): Rgb {
	const e = g.exposure;
	const m = (k: number) => (toLin(albedo[k]) + (toLin(fog[k]) - toLin(albedo[k])) * f) * light[k] * e;
	return see([m(0), m(1), m(2)], g);
}

/** Seen before but not now: the place under its remembered light, its colour faded and cooled. */
export function memoryOf(albedo: Rgb, g: Grade): Rgb {
	const l: Rgb = [g.sun[0] * g.memory + g.fill[0], g.sun[1] * g.memory + g.fill[1], g.sun[2] * g.memory + g.fill[2]];
	const c = lit(albedo, l, g);
	const y = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
	return [(c[0] + (y - c[0]) * 0.7) * 0.6, (c[1] + (y - c[1]) * 0.7) * 0.6, (c[2] + (y * 1.12 - c[2]) * 0.7) * 0.62];
}

// ---- the fitted palette -------------------------------------------------------------------------

/** OKLab of an sRGB colour (Björn Ottosson's), for measuring how far apart two colours look. */
export function oklab(c: Rgb): Rgb {
	const [r, g, b] = linOf(c);
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab([L, A, B]: Rgb): Rgb {
	const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
	const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
	const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
	return srgbOf([4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((v) => Math.max(0, v)) as Rgb);
}

/**
 * Cut a cloud of colours down to `n`: median cut in OKLab (always splitting the box that holds the most
 * error, at its weighted middle, along its widest axis), then a few rounds of k-means to settle them.
 * Lightness counts a little more than hue, as banding in a fading light shows first.
 */
export function fitPalette(colours: Rgb[], n: number, weights?: number[]): Rgb[] {
	const N = colours.length;
	if (!N) return [];
	const W = [1.4, 1, 1];
	const pts = new Float32Array(N * 3), wt = new Float32Array(N);
	colours.forEach((c, i) => { const o = oklab(c); for (let k = 0; k < 3; k++) pts[i * 3 + k] = o[k] * W[k]; wt[i] = weights?.[i] ?? 1; });
	interface Box { idx: Uint32Array; err: number; axis: number; }
	const measure = (idx: Uint32Array): Box => {
		const mean = [0, 0, 0], sq = [0, 0, 0];
		let tw = 0;
		for (const i of idx) { const w = wt[i]; tw += w; for (let k = 0; k < 3; k++) { const v = pts[i * 3 + k]; mean[k] += v * w; sq[k] += v * v * w; } }
		const vr = [0, 1, 2].map((k) => sq[k] - (mean[k] * mean[k]) / tw);
		const axis = vr[0] >= vr[1] && vr[0] >= vr[2] ? 0 : vr[1] >= vr[2] ? 1 : 2;
		return { idx, err: idx.length > 1 ? vr[0] + vr[1] + vr[2] : 0, axis };
	};
	const boxes: Box[] = [measure(Uint32Array.from({ length: N }, (_, i) => i))];
	while (boxes.length < n) {
		let bi = 0;
		for (let i = 1; i < boxes.length; i++) if (boxes[i].err > boxes[bi].err) bi = i;
		const b = boxes[bi];
		if (b.err <= 1e-9) break;
		const sorted = Array.from(b.idx).sort((p, q) => pts[p * 3 + b.axis] - pts[q * 3 + b.axis]);
		// Split at the weighted middle (never leaving a side empty).
		let half = 0, tw = 0, mid = 1;
		for (const i of sorted) tw += wt[i];
		for (let k = 0; k < sorted.length - 1; k++) { half += wt[sorted[k]]; if (half >= tw / 2) { mid = k + 1; break; } mid = k + 1; }
		boxes.splice(bi, 1, measure(Uint32Array.from(sorted.slice(0, mid))), measure(Uint32Array.from(sorted.slice(mid))));
	}
	let cents = boxes.map((b) => {
		const m = [0, 0, 0];
		let tw = 0;
		for (const i of b.idx) { tw += wt[i]; for (let k = 0; k < 3; k++) m[k] += pts[i * 3 + k] * wt[i]; }
		return m.map((v) => v / tw);
	});
	// k-means on a sample, so a big town settles quickly.
	const step = Math.max(1, Math.floor(N / 24000));
	for (let round = 0; round < 3; round++) {
		const sum = cents.map(() => [0, 0, 0, 0]);
		for (let i = 0; i < N; i += step) {
			let best = 0, bd = Infinity;
			for (let c = 0; c < cents.length; c++) {
				const d0 = pts[i * 3] - cents[c][0], d1 = pts[i * 3 + 1] - cents[c][1], d2 = pts[i * 3 + 2] - cents[c][2];
				const d = d0 * d0 + d1 * d1 + d2 * d2;
				if (d < bd) { bd = d; best = c; }
			}
			const s = sum[best], w = wt[i];
			s[0] += pts[i * 3] * w; s[1] += pts[i * 3 + 1] * w; s[2] += pts[i * 3 + 2] * w; s[3] += w;
		}
		cents = cents.map((c, k) => (sum[k][3] ? [sum[k][0] / sum[k][3], sum[k][1] / sum[k][3], sum[k][2] / sum[k][3]] : c));
	}
	return cents.map((c) => fromOklab([c[0] / W[0], c[1] / W[1], c[2] / W[2]]).map(Math.round) as Rgb);
}

/**
 * A cloud of colours, thinned: colours that look the same (to 6 bits a channel) kept once, weighted by
 * the square root of how often they came, so the town's broad grounds get their shades without the
 * small bright things (a flame's heart, a lit window) being lost.
 */
export function thin(colours: Rgb[]): { colours: Rgb[]; weights: number[] } {
	const seen = new Map<number, number>();
	const out: Rgb[] = [], n: number[] = [];
	for (const c of colours) {
		const r = Math.max(0, Math.min(255, c[0])) >> 2, g = Math.max(0, Math.min(255, c[1])) >> 2, b = Math.max(0, Math.min(255, c[2])) >> 2;
		const key = (r << 12) | (g << 6) | b;
		const at = seen.get(key);
		if (at === undefined) { seen.set(key, out.length); out.push(c); n.push(1); } else n[at]++;
	}
	return { colours: out, weights: n.map(Math.sqrt) };
}

/**
 * Nearest-colour lookup into a fitted palette, in OKLab, remembered at 6 bits a channel. `base` is the
 * index of the palette's first entry in the terminal's palette (after the book's inks).
 */
export class Inks {
	private lab: Rgb[];
	private memo = new Int16Array(1 << 18).fill(-1);
	readonly colours: Rgb[];
	readonly base: number;
	constructor(colours: Rgb[], base: number) { this.colours = colours; this.base = base; this.lab = colours.map(oklab); }
	of(c: Rgb): number {
		const r = Math.max(0, Math.min(255, c[0])) >> 2, g = Math.max(0, Math.min(255, c[1])) >> 2, b = Math.max(0, Math.min(255, c[2])) >> 2;
		const key = (r << 12) | (g << 6) | b;
		const hit = this.memo[key];
		if (hit >= 0) return hit;
		const o = oklab([r * 4 + 2, g * 4 + 2, b * 4 + 2]);
		let best = 0, bd = Infinity;
		for (let i = 0; i < this.lab.length; i++) {
			const p = this.lab[i];
			const d = 1.96 * (p[0] - o[0]) ** 2 + (p[1] - o[1]) ** 2 + (p[2] - o[2]) ** 2;
			if (d < bd) { bd = d; best = i; }
		}
		return (this.memo[key] = best + this.base);
	}
}

export const hex = (c: Rgb) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
