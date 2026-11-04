/**
 * avatar.ts - a player's figure: a body and a head.
 *
 * On the map it is one glyph, a letter for the body with a combining mark above it for the head, so
 * any body can take any head; in the maker it is also drawn large, a whole figure in cells. The colour
 * is not chosen: it comes with the seat, and is how the others know you. Pure, so it can be tested.
 */

export interface Look {
	b: number;
	h: number;
}

/** The bodies: the letter on the map, and three lines of the figure (nine wide). */
export const BODIES: { name: string; ch: string; art: [string, string, string] }[] = [
	{ name: 'Stout', ch: 'o', art: ['   /|\\   ', '   (_)   ', '   / \\   '] },
	{ name: 'Skirted', ch: 'a', art: ['   /|\\   ', '  /   \\  ', ' /_____\\ '] },
	{ name: 'Cloaked', ch: 'e', art: ['   /|\\   ', '  / | \\  ', '  /_|_\\  '] },
	{ name: 'Thin', ch: '\u0131', art: ['    |    ', '    |    ', '    |    '] },
	{ name: 'Arms up', ch: 'y', art: ['  \\ | /  ', '   \\|/   ', '    |    '] },
	// (only letters without ascenders: a tall one's head would be cut off by the top of the square)
	{ name: 'Arms out', ch: 'τ', art: [' ---+--- ', '    |    ', '   / \\   '] },
	{ name: 'Star', ch: 'x', art: ['  \\ | /  ', '    |    ', '  /   \\  '] },
	{ name: 'Striding', ch: 'n', art: ['   /|\\   ', '    |    ', '   / \\_  '] },
	{ name: 'Broad', ch: 'm', art: [' /=====\\ ', ' |     | ', ' |_____| '] },
	{ name: 'Hunched', ch: 'r', art: ['   /|    ', '  / |    ', '   / \\   '] },
	{ name: 'Waving', ch: 'w', art: ['   /|  / ', '  / |/   ', '   / \\   '] }
];

/** The heads: the mark on the map, and three lines of the figure. */
export const HEADS: { name: string; mark: string; art: [string, string, string] }[] = [
	{ name: 'Plain', mark: '\u0307', art: ['         ', '         ', '    @    '] },
	{ name: 'Bald', mark: '\u030A', art: ['         ', '         ', '    O    '] },
	{ name: 'Hood', mark: '\u0302', art: ['         ', '    ^    ', '   (@)   '] },
	{ name: 'Soft cap', mark: '\u0303', art: ['         ', '   ~~~   ', '    @    '] },
	{ name: 'Feather', mark: '\u0301', art: ['     /   ', '   _/    ', '    @    '] },
	{ name: 'Slouch', mark: '\u0300', art: ['   \\     ', '    \\_   ', '    @    '] },
	{ name: 'Flat cap', mark: '\u0304', art: ['         ', '   ===   ', '    @    '] },
	{ name: 'Horned', mark: '\u030C', art: ['         ', '   \\ /   ', '    @    '] }
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
/** The figure drawn large, six lines nine wide. */
export const lookBust = (l: Look): string[] => [...HEADS[l.h].art, ...BODIES[l.b].art];

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
