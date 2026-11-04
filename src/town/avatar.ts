/**
 * avatar.ts - a player's figure: a body and a head.
 *
 * It is one glyph, a letter for the body with a combining mark above it for the head, so any body can
 * take any head. The letters come from several alphabets, for their shapes: only short ones (a tall
 * one's head would be cut off by the top of the square), and only from alphabets phones can draw
 * (Georgian, Coptic and the like come out as empty boxes on some). The colour is not chosen: it comes
 * with the seat, and is how the others know you. Pure, so it can be tested.
 */

export interface Look {
	b: number;
	h: number;
}

/** The bodies, each a letter on the map. */
export const BODIES: { name: string; ch: string }[] = [
	{ name: 'Stout', ch: 'o' },
	{ name: 'Thin', ch: '\u0131' },
	{ name: 'Cloaked', ch: '\u028C' },
	{ name: 'Robed', ch: '\u0467' },
	{ name: 'Skirted', ch: '\u0434' },
	{ name: 'Arms up', ch: '\u03C8' },
	{ name: 'Waving', ch: '\u03B3' },
	{ name: 'Arms out', ch: '\u03C4' },
	{ name: 'Sprawling', ch: '\u0436' },
	{ name: 'Leaping', ch: '\u03C7' },
	{ name: 'Striding', ch: '\u044F' },
	{ name: 'Seated', ch: '\u0447' },
	{ name: 'Broad', ch: '\u03C0' },
	{ name: 'Bent', ch: '\u0572' },
	{ name: 'Wide', ch: '\u0448' },
	{ name: 'Round-backed', ch: '\u03C9' }
];

/** The heads, each a mark above the body. */
export const HEADS: { name: string; mark: string }[] = [
	{ name: 'Plain', mark: '\u0307' },
	{ name: 'Bald', mark: '\u030A' },
	{ name: 'Hood', mark: '\u0302' },
	{ name: 'Soft cap', mark: '\u0303' },
	{ name: 'Feather', mark: '\u0301' },
	{ name: 'Slouch', mark: '\u0300' },
	{ name: 'Flat cap', mark: '\u0304' },
	{ name: 'Horned', mark: '\u030C' }
];

const inRange = (n: unknown, len: number) => (Number.isInteger(n) && (n as number) >= 0 && (n as number) < len ? (n as number) : 0);
/** A look from anywhere (a phone, storage): always one that can be drawn. */
export const cleanLook = (raw: unknown): Look => {
	const r = (raw ?? {}) as Partial<Look>;
	return { b: inRange(r.b, BODIES.length), h: inRange(r.h, HEADS.length) };
};

/** The figure on the map: one glyph. */
export const lookGlyph = (l: Look): string => BODIES[l.b].ch + HEADS[l.h].mark;
/** Someone who has not chosen: a plain head on a body of their own, by their number. */
export const defaultLook = (k: number): Look => ({ b: ((k % BODIES.length) + BODIES.length) % BODIES.length, h: 0 });
/** Any figure at random. */
export const randomLook = (rnd: () => number = Math.random): Look => ({ b: Math.floor(rnd() * BODIES.length), h: Math.floor(rnd() * HEADS.length) });

const KEY = 'grimoire.figure';
/** This phone's figure, kept between games; null if never chosen. */
export function loadLook(): Look | null {
	try {
		const s = localStorage.getItem(KEY);
		return s ? cleanLook(JSON.parse(s)) : null;
	} catch { return null; }
}
export function saveLook(l: Look) {
	try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* private mode */ }
}
