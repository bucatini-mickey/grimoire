/**
 * trialface.ts - a trial for Lavender: a smaller main face in the far face's M4 letters, keeping the main
 * face's expression (eyes that glance and look up or down, brows, glasses, moustache). Round 2 (17 Nov):
 * 7x4 is the face; hair and beard get rows of their own only in the taller trials.
 *
 *   7x4   brows, eyes, the letter (and moustache), mouth; a beard only at the mouth's sides
 *   7x5   7x4 with a beard row under the mouth
 *   7x6   a hair row over 7x5
 *   7x7   7x6 with a last row, so long hair can fall past the chin (and down the sides)
 *
 * Not in the game: the test page draws these beside the current face so they can be judged live.
 */
import type { Rig, RigCell } from './rig.ts';
import { signed } from './rigface.ts';

export type TrialKind = '4' | '5' | '6' | '7';
export interface TrialStyle { hair: number; brow: number; glasses: number; tache: number; beard: number; }
export const TRIAL_PLAIN: TrialStyle = { hair: 0, brow: 0, glasses: 0, tache: 0, beard: 0 };

/** Beards with no row of their own (7x4): at the mouth's sides, and up the cheeks. */
const BEARD4 = ['None', 'Stubble', 'Chinstrap', 'Mutton chops', 'Full', 'Long sides'];
/** Beards with a row under the mouth (7x5 and up). */
const BEARD = ['None', 'Stubble', 'Goatee', 'Soul patch', 'Chinstrap', 'Short full', 'Full', 'Long', 'Mutton chops'];
/** Hair over the brows (7x6). */
const HAIR6 = ['None', 'Crop', 'Side part', 'Quiff', 'Curly', 'Spiky', 'Mohawk', 'Receding', 'Bald'];
/** Hair over the brows and down past the chin (7x7). */
const HAIR7 = [...HAIR6, 'Bob', 'Long', 'Long waves', 'Plaits', 'Bun'];

export const TRIALS: { kind: TrialKind; label: string; w: number; h: number; names: Record<keyof TrialStyle, string[]> }[] = [
	{ kind: '4', label: '7x4', w: 7, h: 4, names: { hair: ['None'], brow: BROW_NAMES(), glasses: GLASSES_NAMES(), tache: TACHE_NAMES(), beard: BEARD4 } },
	{ kind: '5', label: '7x5, beard row', w: 7, h: 5, names: { hair: ['None'], brow: BROW_NAMES(), glasses: GLASSES_NAMES(), tache: TACHE_NAMES(), beard: BEARD } },
	{ kind: '6', label: '7x6, hair and beard rows', w: 7, h: 6, names: { hair: HAIR6, brow: BROW_NAMES(), glasses: GLASSES_NAMES(), tache: TACHE_NAMES(), beard: BEARD } },
	{ kind: '7', label: '7x7, long hair', w: 7, h: 7, names: { hair: HAIR7, brow: BROW_NAMES(), glasses: GLASSES_NAMES(), tache: TACHE_NAMES(), beard: BEARD } }
];
function BROW_NAMES() { return ['Line', 'Thick', 'Wavy', 'Bushy', 'Thin', 'None']; }
function GLASSES_NAMES() { return ['None', 'Round', 'Square', 'Shades', 'Wire']; }
function TACHE_NAMES() { return ['None', 'Pencil', 'Bushy', 'Handlebar', 'Walrus']; }

const FILL = ['_', '=', '~', '#', '.', ' '];
const FRAMES: ([string, string] | null)[] = [null, ['(', ')'], ['[', ']'], ['[', ']'], ['|', '|']];
const level = (v: number) => Math.max(0, Math.min(15, Math.trunc(Number.isFinite(v) ? v : 0)));

/** The hair's top row (seven cells), by style. */
const HAIR_TOP: Record<string, string> = {
	'Crop': ' ▄▄▄▄▄ ', 'Side part': ' ▄ ▄▄▄▄', 'Quiff': '  ▄██▄ ', 'Curly': ' ∾∾∾∾∾ ', 'Spiky': ' ʌʌʌʌʌ ',
	'Mohawk': '   █   ', 'Receding': ' ▖   ▗ ', 'Bald': '  .-.  ',
	'Bob': '▗▄▄▄▄▄▖', 'Long': '▗▄▄▄▄▄▖', 'Long waves': '∾∾∾∾∾∾∾', 'Plaits': '▗▄▄▄▄▄▖', 'Bun': ' ▄▄●▄▄ '
};
/** Long hair's sides: the glyphs down the left and right edge, from the eyes' row to the last, and its ends. */
const HAIR_SIDES: Record<string, { rows: number; l: string; r: string; endL?: string; endR?: string }> = {
	'Bob': { rows: 3, l: '▌', r: '▐', endL: '▘', endR: '▝' },
	'Long': { rows: 6, l: '▌', r: '▐', endL: '▌', endR: '▐' },
	'Long waves': { rows: 6, l: '(', r: ')', endL: '∾', endR: '∾' },
	'Plaits': { rows: 6, l: '§', r: '§', endL: '¥', endR: '¥' }
};

export function drawTrial(r: Rig, kind: TrialKind, st: TrialStyle = TRIAL_PLAIN): RigCell[][] {
	const t = TRIALS.find((x) => x.kind === kind)!;
	const { w, h } = t;
	const out: RigCell[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => ({ ch: ' ', ink: 0 as const })));
	const put = (x: number, y: number, ch: string, ink: RigCell['ink']) => { if (x >= 0 && y >= 0 && x < w && y < h && ch !== ' ') out[y][x] = { ch, ink }; };
	const text = (x: number, y: number, s: string, ink: RigCell['ink']) => [...s].forEach((c, i) => put(x + i, y, c, ink));
	const free = (x: number, y: number) => out[y]?.[x]?.ch === ' ';
	const eL = level(r.eyeL), eR = level(r.eyeR), mo = level(r.mouth);
	const sm = signed(r.smile), yw = signed(r.yaw), gx = signed(r.gazeX), gy = signed(r.gazeY);
	const bL = signed(r.browL ?? 8), bR = signed(r.browR ?? 8);
	const happy = sm >= 4, cross = bL + bR <= -6, sad = sm <= -5 && !cross;
	const name = (k: keyof TrialStyle) => t.names[k][Math.min(st[k], t.names[k].length - 1)] ?? 'None';

	const top = kind === '6' || kind === '7' ? 1 : 0;
	const browY = top, eyeY = top + 1, noseY = top + 2, mouthY = top + 3, beardY = kind === '4' ? -1 : top + 4;

	// The face itself: brows, eyes, the letter, the mouth (as the far face's M4 letters).
	const frame = FRAMES[st.glasses] ?? null;
	const tx = yw >= 4 ? 1 : yw <= -4 ? -1 : 0;
	for (const side of [-1, 1] as const) {
		const c = side < 0 ? 1 : 5, open = side < 0 ? eL : eR, b = side < 0 ? bL : bR;
		const f = FILL[st.brow] ?? '_';
		let brow = f === ' ' ? (b >= 3 ? " '" : b <= -3 ? ' \\' : '  ') : b >= 3 ? '.-' : b <= -3 ? '`.' : f + f;
		if (side > 0) brow = [...brow].reverse().map((ch) => ({ '`': "'", "'": '`', '/': '\\', '\\': '/' } as Record<string, string>)[ch] ?? ch).join('');
		text(side < 0 ? c - 1 : c, browY, brow, 2);
		const g = open <= 3 ? '-' : st.glasses === 3 ? '#' : happy ? '◠' : cross ? (side < 0 ? 'ò' : 'ó') : sad ? 'ɷ'
			: open >= 13 ? 'O' : open <= 7 ? '=' : gy >= 4 ? 'ᵒ' : gy <= -4 ? 'ₒ' : 'o';
		const dx = frame ? 0 : gx >= 4 ? 1 : gx <= -4 ? -1 : 0;
		put(c + dx, eyeY, g, 2);
		if (frame) { put(c - 1, eyeY, frame[0], 2); put(c + 1, eyeY, frame[1], 2); }
	}
	if (frame) put(3, eyeY, '-', 2);
	const mid = 3 + tx;
	put(mid, noseY, yw >= 3 ? '>' : yw <= -3 ? '<' : 'v', 3);
	{
		const ch = ['', '-', '~', '~', '"'][st.tache], reach = [0, 1, 2, 1, 2][st.tache];
		for (let d = 1; d <= reach; d++) { put(mid - d, noseY, ch, 2); put(mid + d, noseY, ch, 2); }
		if (st.tache === 3) { put(mid - reach - 1, noseY, '(', 2); put(mid + reach + 1, noseY, ')', 2); }
	}
	const m = happy ? (mo >= 6 ? 'ᗜ' : '◡') : mo >= 8 ? 'ㅇ' : mo >= 3 ? 'ㅁ' : cross || sad ? '◠' : null;
	if (m) put(mid, mouthY, m, 2); else text(mid - 1, mouthY, '---', 2);

	// The beard.
	const beard = name('beard');
	if (kind === '4') {
		// No row of its own: the mouth's sides, and the cheeks beside the letter.
		if (beard === 'Stubble') { put(mid - 2, mouthY, '⁚', 1); put(mid + 2, mouthY, '⁚', 1); }
		if (beard === 'Chinstrap') { put(mid - 2, mouthY, '\\', 2); put(mid + 2, mouthY, '/', 2); }
		if (beard === 'Mutton chops') { for (const y of [noseY, mouthY]) { put(0, y, '▌', 2); put(6, y, '▐', 2); } }
		if (beard === 'Full') { put(0, noseY, '▌', 2); put(6, noseY, '▐', 2); text(0, mouthY, '▙▄', 2); text(5, mouthY, '▄▟', 2); }
		if (beard === 'Long sides') { put(0, noseY, '(', 2); put(6, noseY, ')', 2); text(0, mouthY, '\\▄', 2); text(5, mouthY, '▄/', 2); }
	} else {
		// A row under the mouth, and the cheeks.
		const by = beardY;
		if (beard === 'Stubble') { text(1, by, '⁚⁘⁘⁘⁚', 1); put(mid - 2, mouthY, '⁚', 1); put(mid + 2, mouthY, '⁚', 1); }
		if (beard === 'Goatee') { text(mid - 1, by, '\\▼/', 2); }
		if (beard === 'Soul patch') { put(mid, by, '▾', 2); }
		if (beard === 'Chinstrap') { put(0, mouthY, '\\', 2); put(6, mouthY, '/', 2); text(1, by, '\\___/', 2); }
		if (beard === 'Short full') { put(mid - 2, mouthY, '▐', 2); put(mid + 2, mouthY, '▌', 2); text(1, by, '▝▀▀▀▘', 2); }
		if (beard === 'Full') { for (const y of [noseY, mouthY]) { put(0, y, '▐', 2); put(6, y, '▌', 2); } text(0, by, '▝▙▄▄▄▟▘', 2); }
		if (beard === 'Long') { for (const y of [noseY, mouthY]) { put(0, y, '▐', 2); put(6, y, '▌', 2); } text(0, by, ' ▜███▛ ', 2); if (by + 1 < h) text(2, by + 1, '▜█▛', 2); }
		if (beard === 'Mutton chops') { for (const y of [noseY, mouthY]) { put(0, y, '▐', 2); put(6, y, '▌', 2); } text(0, by, '▝▘   ▝▘', 2); }
	}

	// The hair: its top row, and long hair down the sides (where the face leaves them free) and past the chin.
	const hair = name('hair');
	if (top && hair !== 'None') {
		text(0, 0, HAIR_TOP[hair] ?? '', 1);
		const sides = HAIR_SIDES[hair];
		if (sides) {
			const last = Math.min(h - 1, eyeY + sides.rows - 1);
			for (let y = eyeY; y <= last; y++) {
				const end = y === last;
				if (free(0, y)) put(0, y, end && sides.endL ? sides.endL : sides.l, 1);
				if (free(6, y)) put(6, y, end && sides.endR ? sides.endR : sides.r, 1);
			}
		}
	}
	return out;
}
