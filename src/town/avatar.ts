/**
 * avatar.ts - a player's figure: a face or a body, and a head or something on it.
 *
 * On the map it is one glyph, a letter with a combining mark above it, so any letter can wear any
 * mark. The letter reads as a face under a hat, or, with a plain dot for a head, as a whole body:
 * arms up, arms out, striding; in the maker it is also drawn large, as a bust in cells. The colour is not
 * chosen: it comes with the seat, and is how the others know you. Pure, so it can be tested.
 */

export interface Look {
	f: number;
	h: number;
}

/** The faces and bodies: the letter on the map, and two lines of the bust (nine wide). */
export const FACES: { name: string; ch: string; art: [string, string] }[] = [
	{ name: 'Round', ch: 'o', art: [' ( o o ) ', '  ( - )  '] },
	{ name: 'Squint', ch: 'e', art: [' ( - o ) ', '  ( ~ )  '] },
	{ name: 'Jowly', ch: 'a', art: [' ( o o ) ', ' (( = )) '] },
	{ name: 'Grin', ch: 'u', art: [' ( ^ ^ ) ', '  ( u )  '] },
	{ name: 'Sly', ch: 'c', art: [' ( o o > ', '  ( c )  '] },
	{ name: 'Scarred', ch: '\u00F8', art: [' ( x o ) ', '  ( - )  '] },
	{ name: 'Stern', ch: '\u0275', art: [' ( > < ) ', '  ( n )  '] },
	{ name: 'Proud', ch: '\u03C3', art: [' ( " " ) ', '  ( v )  '] },
	{ name: 'Thin', ch: '\u0131', art: ['  (o o)  ', '   | |   '] },
	{ name: 'Arms up', ch: 'y', art: [' \\(o o)/ ', '   (-)   '] },
	{ name: 'Arms out', ch: 't', art: ['--(o o)--', '   (-)   '] },
	{ name: 'Star', ch: 'x', art: [' \\(o o)/ ', ' /(   )\\ '] },
	{ name: 'Striding', ch: 'n', art: [' ( o o ) ', '  /  \\_  '] },
	{ name: 'Broad', ch: 'm', art: ['(( o o ))', '(( === ))'] },
	{ name: 'Hunched', ch: 'r', art: ['  (o o)  ', ' /( - )  '] }
];

/** The headgear: the mark on the map, and three lines of the bust. */
export const HATS: { name: string; mark: string; art: [string, string, string] }[] = [
	{ name: 'Bare', mark: '', art: ['         ', '         ', '  .---.  '] },
	{ name: 'Hood', mark: '\u0302', art: ['    _    ', '   / \\   ', '  /___\\  '] },
	{ name: 'Soft cap', mark: '\u0303', art: ['         ', '  ~~~~~  ', ' (_____) '] },
	{ name: 'Feather', mark: '\u0301', art: ['      /  ', '   ___/  ', '  (___)  '] },
	{ name: 'Slouch', mark: '\u0300', art: ['  \\      ', '  \\___   ', '  (___)  '] },
	{ name: 'Flat cap', mark: '\u0304', art: ['         ', '  _____  ', ' ======= '] },
	{ name: 'Bowl cut', mark: '\u0306', art: ['         ', '  .---.  ', ' (|||||) '] },
	{ name: 'Horned', mark: '\u030C', art: ['  \\   /  ', '   \\_/   ', '  (___)  '] },
	{ name: 'Tonsure', mark: '\u030A', art: ['         ', '   (o)   ', '  /   \\  '] },
	{ name: 'Plaits', mark: '\u0308', art: ['         ', '  .---.  ', ' S     S '] },
	{ name: 'Dot head', mark: '\u0307', art: ['         ', '         ', '         '] }
];

const SHOULDERS = ' /|   |\\ ';

const inRange = (n: unknown, len: number) => (Number.isInteger(n) && (n as number) >= 0 && (n as number) < len ? (n as number) : 0);
/** A look from anywhere (a phone, storage): always one that can be drawn. */
export const cleanLook = (raw: unknown): Look => {
	const r = (raw ?? {}) as Partial<Look>;
	return { f: inRange(r.f, FACES.length), h: inRange(r.h, HATS.length) };
};

/** The figure on the map: one glyph. */
export const lookGlyph = (l: Look): string => FACES[l.f].ch + HATS[l.h].mark;
/** Someone who has not chosen: a round face and headgear of their own, by their number. */
export const defaultLook = (k: number): Look => ({ f: 0, h: 1 + (((k % (HATS.length - 1)) + (HATS.length - 1)) % (HATS.length - 1)) });
/** Any figure at random. */
export const randomLook = (rnd: () => number = Math.random): Look => ({ f: Math.floor(rnd() * FACES.length), h: Math.floor(rnd() * HATS.length) });
/** The whole figures, for a letter with a dot for its head: three lines under the head. */
const BODIES: Record<string, [string, string, string]> = {
	a: ['   /|\\   ', '  /   \\  ', ' /_____\\ '],
	'\u0131': ['    |    ', '    |    ', '    |    '],
	y: ['  \\ | /  ', '   \\|/   ', '    |    '],
	t: [' ---+--- ', '    |    ', '   / \\   '],
	x: ['  \\ | /  ', '    |    ', '  /   \\  '],
	n: ['   /|\\   ', '    |    ', '   / \\_  '],
	m: [' /=====\\ ', ' |     | ', ' |_____| '],
	r: ['   /|    ', '  / |    ', '   / \\   ']
};
const DOT_HEAD = '\u0307';
/** Drawn large, six lines nine wide: a bust, or with a dot head the whole figure. */
export const lookBust = (l: Look): string[] => (HATS[l.h].mark === DOT_HEAD
	? ['         ', '    @    ', ...(BODIES[FACES[l.f].ch] ?? ['   /|\\   ', '   (_)   ', '   / \\   ']), '         ']
	: [...HATS[l.h].art, ...FACES[l.f].art, SHOULDERS]);

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
