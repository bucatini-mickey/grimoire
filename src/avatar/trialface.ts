/**
 * trialface.ts - a trial (17 Nov, for Lavender): a smaller main face in the far face's M4 letters, keeping
 * the main face's expression: eyes that glance and look up or down, brows, glasses, hair, moustache, beard.
 * Not in the game: the test page draws these beside the current face so they can be judged live.
 *
 * Candidates (the current main face is 10 x 5):
 *   A  7 x 4   brows, eyes, the letter (and moustache), mouth
 *   B  7 x 5   A with a row of hair over it
 *   C  7 x 3   brows, eyes, mouth; the letter goes in the name
 *     __   __        ~~~~~        __   __
 *      o   o        __   __        o   o
 *        J           o   o          ◡
 *        ◡             J
 *                      ◡
 */
import type { Rig, RigCell } from './rig.ts';
import { signed } from './rigface.ts';

export interface TrialStyle { hair: number; brow: number; glasses: number; tache: number; beard: number; }
export const TRIAL_PLAIN: TrialStyle = { hair: 0, brow: 0, glasses: 0, tache: 0, beard: 0 };
export const TRIAL_NAMES: Record<keyof TrialStyle, string[]> = {
	hair: ['None', 'Fringe', 'Parted', 'Spiky', 'Curly', 'Bob', 'Bald'],
	brow: ['Line', 'Thick', 'Wavy', 'Bushy', 'Thin', 'None'],
	glasses: ['None', 'Round', 'Square', 'Shades', 'Wire'],
	tache: ['None', 'Pencil', 'Bushy', 'Handlebar', 'Walrus'],
	beard: ['None', 'Goatee', 'Chinstrap', 'Full', 'Stubble']
};
const HAIR = ['', ' ~~~~~ ', '///.\\\\\\', 'ʌʌʌʌʌʌʌ', '◠◡◠◡◠◡◠', '(‾‾‾‾‾)', '  .-.  '];
const FILL = ['_', '=', '~', '#', '.', ' '];
const FRAMES: ([string, string] | null)[] = [null, ['(', ')'], ['[', ']'], ['[', ']'], ['|', '|']];
const level = (v: number) => Math.max(0, Math.min(15, Math.trunc(Number.isFinite(v) ? v : 0)));

export type TrialKind = 'A' | 'B' | 'C';
export const TRIALS: { kind: TrialKind; label: string; w: number; h: number }[] = [
	{ kind: 'A', label: 'A. 7x4, letter as nose', w: 7, h: 4 },
	{ kind: 'B', label: 'B. 7x5, A with hair', w: 7, h: 5 },
	{ kind: 'C', label: 'C. 7x3, letter in the name', w: 7, h: 3 }
];

export function drawTrial(r: Rig, kind: TrialKind, st: TrialStyle = TRIAL_PLAIN): RigCell[][] {
	const t = TRIALS.find((x) => x.kind === kind)!;
	const { w, h } = t;
	const out: RigCell[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => ({ ch: ' ', ink: 0 as const })));
	const put = (x: number, y: number, ch: string, ink: RigCell['ink']) => { if (x >= 0 && y >= 0 && x < w && y < h && ch !== ' ') out[y][x] = { ch, ink }; };
	const text = (x: number, y: number, s: string, ink: RigCell['ink']) => [...s].forEach((c, i) => put(x + i, y, c, ink));
	const eL = level(r.eyeL), eR = level(r.eyeR), mo = level(r.mouth);
	const sm = signed(r.smile), yw = signed(r.yaw), gx = signed(r.gazeX), gy = signed(r.gazeY);
	const bL = signed(r.browL ?? 8), bR = signed(r.browR ?? 8);
	const happy = sm >= 4, cross = bL + bR <= -6, sad = sm <= -5 && !cross;

	const hairY = kind === 'B' ? 0 : -1;
	const browY = hairY + 1, eyeY = browY + 1, noseY = kind === 'C' ? -1 : eyeY + 1, mouthY = kind === 'C' ? eyeY + 1 : noseY + 1;
	if (hairY >= 0 && st.hair) text(0, hairY, HAIR[st.hair], 1);

	const frame = FRAMES[st.glasses] ?? null;
	const tx = yw >= 4 ? 1 : yw <= -4 ? -1 : 0;
	const cx = [1, 5];
	for (const side of [-1, 1] as const) {
		const i = side < 0 ? 0 : 1, c = cx[i], open = side < 0 ? eL : eR, b = side < 0 ? bL : bR;
		// Brows: two cells, outward from over the eye; raised .- -., frowning `. .'
		const f = FILL[st.brow] ?? '_';
		let brow = f === ' ' ? (b >= 3 ? " '" : b <= -3 ? ' \\' : '  ') : b >= 3 ? '.-' : b <= -3 ? '`.' : f + f;
		if (side > 0) brow = [...brow].reverse().map((ch) => ({ '`': "'", "'": '`', '/': '\\', '\\': '/' } as Record<string, string>)[ch] ?? ch).join('');
		text(side < 0 ? c - 1 : c, browY, brow, 2);
		// Eyes, in M4's letters, and looking about: a cell aside, ᵒ up, ₒ down.
		const g = open <= 3 ? '-' : st.glasses === 3 ? '#' : happy ? '◠' : cross ? (side < 0 ? 'ò' : 'ó') : sad ? 'ɷ'
			: open >= 13 ? 'O' : open <= 7 ? '=' : gy >= 4 ? 'ᵒ' : gy <= -4 ? 'ₒ' : 'o';
		const dx = frame ? 0 : gx >= 4 ? 1 : gx <= -4 ? -1 : 0;
		put(c + dx, eyeY, g, 2);
		if (frame) { put(c - 1, eyeY, frame[0], 2); put(c + 1, eyeY, frame[1], 2); }
	}
	if (frame) put(3, eyeY, '-', 2);
	const mid = 3 + tx;
	// The letter (ink 3) as the nose, pointing the way the head turns; a moustache beside it.
	if (noseY >= 0) {
		put(mid, noseY, yw >= 3 ? '>' : yw <= -3 ? '<' : 'v', 3);
		const ch = ['', '-', '~', '~', '"'][st.tache], reach = [0, 1, 2, 1, 2][st.tache];
		for (let d = 1; d <= reach; d++) { put(mid - d, noseY, ch, 2); put(mid + d, noseY, ch, 2); }
		if (st.tache === 3) { put(mid - reach - 1, noseY, '(', 2); put(mid + reach + 1, noseY, ')', 2); }
	}
	// The mouth, M4's: --- at rest, ◡ smiling, ◠ frowning, ㅁ talking, ㅇ loud, ᗜ laughing.
	const m = happy ? (mo >= 6 ? 'ᗜ' : '◡') : mo >= 8 ? 'ㅇ' : mo >= 3 ? 'ㅁ' : cross || sad ? '◠' : null;
	if (m) put(mid, mouthY, m, 2); else text(mid - 1, mouthY, '---', 2);
	// With no letter row, the moustache sits either side of the mouth.
	if (noseY < 0 && st.tache) { const ch = ['', '-', '~', '~', '"'][st.tache]; put(mid - 2, mouthY, ch, 2); put(mid + 2, mouthY, ch, 2); }
	// A beard round the mouth: goatee commas, a chinstrap \ /, a full one up the cheeks, stubble.
	if (st.beard === 1) { put(mid - 2, mouthY, ',', 2); put(mid + 2, mouthY, ',', 2); }
	if (st.beard === 2) { put(mid - 3, mouthY, '\\', 2); put(mid + 3, mouthY, '/', 2); }
	if (st.beard === 3) { for (let y = noseY < 0 ? mouthY : noseY; y <= mouthY; y++) { put(0, y, '(', 2); put(w - 1, y, ')', 2); } put(mid - 2, mouthY, 'w', 2); put(mid + 2, mouthY, 'w', 2); }
	if (st.beard === 4) { put(mid - 2, mouthY, ':', 2); put(mid + 2, mouthY, ':', 2); }
	return out;
}
