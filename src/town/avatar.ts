/**
 * avatar.ts - a player's two glyphs, chosen while they wait: the figure who walks round the village,
 * and the face at the voting table. Picked by hand from many alphabets (tools/figure-picker.html). A
 * phone without one draws something plainer (ui/glyphs.ts). The colour is not chosen: it comes with
 * the seat, and is how the others know you. Pure, so it can be tested.
 */
import { FACES, FIGURES } from './figures.ts';
export { FACES, FIGURES };

export interface Look {
	figure: number;
	face: number;
}

/** What a phone that cannot draw someone's figure or face draws instead. */
export const PLAIN_FIGURE = 'o\u0307', PLAIN_FACE = '\u00F6';
/** A glyph as it is put in its square: this marks it to fill the square, whatever its alphabet (pterm). */
export const filling = (glyph: string) => glyph + '\uFE0E';

const inRange = (n: unknown, len: number) => (Number.isInteger(n) && (n as number) >= 0 && (n as number) < len ? (n as number) : 0);
/** A look from anywhere (a phone, storage): always one that can be drawn. */
export const cleanLook = (raw: unknown): Look => {
	const r = (raw ?? {}) as Partial<Look>;
	return { figure: inRange(r.figure, FIGURES.length), face: inRange(r.face, FACES.length) };
};

const mod = (k: number, n: number) => ((k % n) + n) % n;
/** Someone who has not chosen: a figure and a face of their own, by their number. */
export const defaultLook = (k: number): Look => ({ figure: mod(k, FIGURES.length), face: mod(k, FACES.length) });

const KEY = 'grimoire.figure';
/** This phone's choice, kept between games; null if never chosen. */
export function loadLook(): Look | null {
	try {
		const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
		return s && typeof s.figure === 'number' ? cleanLook(s) : null;
	} catch { return null; }
}
export function saveLook(l: Look) {
	try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* private mode */ }
}
