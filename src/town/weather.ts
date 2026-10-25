/**
 * weather.ts - what the sky does over each town, drawn over the open ground:
 *
 *   Saltgrave (victorian)    rain driving in off the sea, lightning now and then, and the lighthouse's
 *                            beam turning round over the town and the water
 *   Wolfsgrund (grimm)       snow falling, drifting with the wind
 *   Whitechapel              a yellow fog, thick: the gas lamps are islands in it
 *   Ravensburg (castle)      fair weather, the river mist
 *
 * Everything follows the clock (ms), not chance, so a still frame stays still and every phone sees the
 * same storm.
 */
import type { Rgb } from './look.ts';

export interface Weather {
	rain: boolean;
	storm: boolean;
	snow: boolean;
	/** How much thicker than usual the fog is (1 as usual), and its colour by day if not the usual. */
	fog: number;
	fogTint: Rgb | null;
	/** Turning light: the cell of the lamp, if the town has one. */
	beam: boolean;
}

const CALM: Weather = { rain: false, storm: false, snow: false, fog: 1, fogTint: null, beam: false };
const BY_TOWN: Record<string, Weather> = {
	victorian: { ...CALM, rain: true, storm: true, beam: true, fog: 1.15 },
	grimm: { ...CALM, snow: true, fog: 1.1, fogTint: [150, 160, 172] },
	whitechapel: { ...CALM, fog: 1.7, fogTint: [86, 82, 58] },
	castle: CALM
};
export const weatherOf = (town: string): Weather => BY_TOWN[town] ?? CALM;
export const animated = (w: Weather) => w.rain || w.snow || w.beam || w.storm;

const hash = (x: number, y: number, k: number) => {
	let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(k, 1274126177);
	h = Math.imul(h ^ (h >>> 13), 1103515245);
	return (h ^ (h >>> 16)) >>> 0;
};

/**
 * Lightning: how bright the sky is from a flash at this moment (0 none, 1 full). A strike comes every
 * eight to twenty seconds: a flash, dark for a breath, a second flash weaker.
 */
export function flash(ms: number): number {
	const slot = Math.floor(ms / 14000), at = slot * 14000 + (hash(slot, 7, 3) % 9000);
	const t = ms - at;
	if (hash(slot, 1, 9) % 4 === 0) return 0; // some storms pass a while without a strike
	if (t >= 0 && t < 110) return 1;
	if (t >= 220 && t < 300) return 0.55;
	return 0;
}

/** The beam's angle now: once round in nine seconds. */
export const beamAngle = (ms: number) => ((ms / 9000) * Math.PI * 2) % (Math.PI * 2);

/** How strongly the turning beam lights a cell (0 to 1): a narrow cone, fading with distance. */
export function beamAt(lamp: { x: number; y: number }, x: number, y: number, ms: number): number {
	// Map cells are square on screen (two columns a cell), so the plain angle is the one seen.
	const dx = x - lamp.x, dy = y - lamp.y;
	const d = Math.hypot(dx, dy);
	if (d < 1.5 || d > 46) return 0;
	let diff = Math.atan2(dy, dx) - beamAngle(ms);
	diff = Math.atan2(Math.sin(diff), Math.cos(diff));
	const width = 0.07 + 1.2 / d;
	if (Math.abs(diff) > width) return 0;
	return (1 - Math.abs(diff) / width) * (1 - d / 46) * 1.1;
}

/** Rain or snow over an open cell at this moment: a glyph and its colour, or null for none. */
export function fall(w: Weather, x: number, y: number, ms: number): { ch: string; c: Rgb } | null {
	if (w.rain) {
		// Rain drives in slanting: each drop steps down and along a cell every 70 ms.
		const step = Math.floor(ms / 70);
		const h = hash(x + step, y - step, 17) & 63;
		if (h < 5) return { ch: h < 2 ? '/' : '\'', c: [150, 170, 196] };
		return null;
	}
	if (w.snow) {
		// Snow falls slowly and drifts: down a cell every 260 ms, along one every 700.
		const down = Math.floor(ms / 260), along = Math.floor(ms / 700);
		const h = hash(x - along, y - down, 23) & 127;
		if (h < 4) return { ch: h < 1 ? '*' : '·', c: [236, 240, 246] };
		return null;
	}
	return null;
}
