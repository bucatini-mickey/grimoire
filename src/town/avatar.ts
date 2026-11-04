/**
 * avatar.ts - a player's figure: a body and a head.
 *
 * It is one glyph: a letter for the body with a combining mark above it for the head, so any body can
 * take any head; or a whole figure, which stands alone. The letters were chosen by hand from many
 * alphabets (tools/figure-picker.html). A phone without one draws something else (ui/glyphs.ts). The
 * colour is not chosen: it comes with the seat, and is how the others know you. Pure, so it can be tested.
 */

export interface Look {
	b: number;
	h: number;
}

/** The bodies, each a letter that takes a head. */
const TAKES_A_HEAD = "a c e æ g j n o p q r s t v w x y z ç ø ą ņ ĸ ƽ ư ƴ ƶ ƨ ơ ƣ ƿ ǌ ǝ ȼ ɀ ɉ ꝛ ꝿ ꝍ ꝋ ꞩ ꞹ ꭎ ꭅ ꭓ ꭥ ꭤ ꬻ ꞇ ꞅ ꬳ ꞓ ꞔ ɑ ɒ ɔ ɕ ɚ ɛ ɜ ɟ ɤ ᴉ ᴊ ᴇ ᴆ ᴅ ᴄ ᴃ ᴂ ᴁ ᴀ ᴕ ᴔ ᴖ ᴗ ᴘ ᴙ ᴛ ᴝ ᴠ ᴡ ᴥ ᴦ ᴧ ᴨ ᴩ ᴪ ᴫ ᴑ ᴐ ᴏ ᴌ ᴋ ᴒ ᴓ ʉ ᵼ ᵻ ᵾ ᵿ ᵴ ᵶ ᵳ ᵲ ᵱ ᵰ α ϗ γ ε ι κ μ ν π ρ ς σ τ υ χ ω ᛙ ¡ ≁ ⊧ ⊦ ⋏".split(' ');
/** The whole figures, which take no head: some already wear a mark, and a second would be cut off. */
const WHOLE = "ċ ė ǡ ȯ ḋ ḃ ẘ ớ ở ờ ợ ቾ ኖ ቶ ♟".split(' ');
/** Every figure's letter. */
export const BODIES: { ch: string; whole?: boolean }[] = [...TAKES_A_HEAD.map((ch) => ({ ch })), ...WHOLE.map((ch) => ({ ch, whole: true }))];

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
export const lookGlyph = (l: Look): string => BODIES[l.b].ch + (BODIES[l.b].whole ? '' : HEADS[l.h].mark);
/** What a phone that cannot draw someone's figure draws instead. */
export const PLAIN_FIGURE = 'o\u0307';
/** Someone who has not chosen: a plain head on a body of their own, by their number, from the plainest letters. */
export const defaultLook = (k: number): Look => ({ b: ((k % 18) + 18) % 18, h: 0 });

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
