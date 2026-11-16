/**
 * rigface.ts - the drawing of rig.ts: a rig as cells. Features only (Lavender, 15 Nov: "focus completely on
 * having eyes, eyebrows, and a nose and mouth... the best of all of them in the space we have"): no head
 * outline and no hair, so the whole box goes to brows that rise and frown, eyes that open, shut and look
 * about, a nose, and a mouth that talks, smiles, frowns and opens wide.
 *
 * The near avatar (16 x 8) by rows:
 *   0  brows, raised          /---\      /---\
 *   1  brows, at rest         -----      -----
 *   2  brows, lowered / lids  .---.      .---.   (wide-open eyes show their lids)
 *   3  eyes                  ( o   )    (   o )
 *   4  nose                          /_\
 *   5  mouth (open: its top)        .----.
 *   6  mouth                        |    |
 *   7  mouth (wide: its bottom)     '----'
 * The head's turn slides the face across the box and narrows the far eye; a tip moves it up or down a row;
 * a lean drops the lower side's brow and eye a row.
 *
 * Whole numbers only and printable ASCII, so the Rust twin draws the very same cells
 * (tests/fixtures/rig-golden.json).
 */
import type { Rig, RigCell } from './rig.ts';

/** a / b rounded to the nearest, halves away from zero (b > 0). */
export function rdiv(a: number, b: number): number {
	const m = Math.floor((2 * Math.abs(a) + b) / (2 * b));
	return a < 0 ? -m : m;
}
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
/** A signed digit as -7..7 (8 is the middle). */
export const signed = (v: number) => clamp(clamp(Math.trunc(Number.isFinite(v) ? v : 8), 0, 15) - 8, -7, 7);
const level = (v: number) => clamp(Math.trunc(Number.isFinite(v) ? v : 0), 0, 15);

/** An eye one cell wide, by how open it is. */
export function eyeGlyph(open: number): string {
	return open <= 3 ? '-' : open <= 7 ? '=' : open <= 12 ? 'o' : 'O';
}

/**
 * An eye `wide` cells across (3 or 5): ( o ) with the pupil moved by the glance across (gx, -7..7) and shown
 * by its glyph up or down (gy); half shut, a lid over it; shut, a line. Its row of lid above (wide open only)
 * comes back as `lid`.
 */
export function eyeCells(open: number, gx: number, gy: number, wide: 3 | 5): { row: string; lid: string | null } {
	const inner = wide - 2;
	if (open <= 3) return { row: wide === 5 ? ' --- ' : '---', lid: null };
	const at = inner === 1 ? 0 : gx >= 3 ? 2 : gx <= -3 ? 0 : 1;
	const pupil = open <= 7 ? '-' : open >= 13 ? 'O' : gy >= 4 ? "'" : gy <= -4 ? '.' : 'o';
	let mid = '';
	for (let i = 0; i < inner; i++) mid += i === at ? pupil : open <= 7 ? '-' : ' ';
	return { row: '(' + mid + ')', lid: open >= 13 ? (wide === 5 ? ' .-. ' : '.-.') : null };
}

/** A brow `wide` cells across, from its outer end to its inner: raised an arch, lowered sloping to the nose. */
export function browCells(b: number, wide: 3 | 5): string {
	if (b >= 3) return wide === 5 ? '/---\\' : '/-\\';
	if (b <= -3) return wide === 5 ? '`-._ ' : '`-.';
	return wide === 5 ? '-----' : '---';
}
/** A brow drawn on the right: the left one mirrored. */
const mirror = (s: string) => [...s].reverse().map((c) => ({ '/': '\\', '\\': '/', '`': "'", "'": '`', '(': ')', ')': '(' } as Record<string, string>)[c] ?? c).join('');

/**
 * The mouth, `wide` cells across, as one to three rows (top first): shut a line, a smile or a frown;
 * talking a short gap; open a hole, as tall as there is room for (`rows`), its bottom smiling or not.
 */
export function mouthRows(open: number, smile: number, wide: number, rows: number): string[] {
	const s = smile >= 3 ? 1 : smile <= -3 ? -1 : 0;
	const mid = (c: string) => c.repeat(Math.max(0, wide - 2));
	if (open <= 2 || rows < 1) {
		// A broad smile or frown takes two rows, where the mouth is wide enough to curve.
		if (s > 0) return smile >= 6 && rows >= 2 && wide >= 6 ? ['\\' + mid(' ') + '/', ' ' + '\\' + mid('_').slice(2) + '/' + ' '] : ['\\' + mid('_') + '/'];
		if (s < 0) return smile <= -6 && rows >= 2 && wide >= 6 ? [' ' + '.' + mid('-').slice(2) + '.' + ' ', '/' + mid(' ') + '\\'] : ['/' + mid('-') + '\\'];
		return [mid('-') + '--'];
	}
	if (open <= 7 || rows < 2) {
		const m = open <= 7 ? '=' : 'O';
		return [s > 0 ? '\\' + mid(m) + '/' : s < 0 ? '/' + mid(m) + '\\' : '(' + mid(m) + ')'];
	}
	const top = s < 0 ? '/' + mid('-') + '\\' : '.' + mid('-') + '.';
	const bottom = s > 0 ? '\\' + mid('_') + '/' : "'" + mid('-') + "'";
	if (open <= 11 || rows < 3) return [top, bottom];
	return [top, '|' + mid(' ') + '|', bottom];
}

/** The nose: three cells, pointing the way the head turns. */
export function noseCells(yw: number): string {
	return yw >= 3 ? ' \\>' : yw <= -3 ? '</ ' : '/_\\';
}

/** The avatar for a rig in w x h cells (w >= 5, h >= 2): near (from 14 x 7), middle (from 8 x 4), else far. */
export function drawFace(r: Rig, w: number, h: number): RigCell[][] {
	const out: RigCell[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => ({ ch: ' ', ink: 0 as const })));
	if (w < 5 || h < 2) return out;
	const put = (x: number, y: number, ch: string, ink: RigCell['ink']) => {
		if (x >= 0 && y >= 0 && x < w && y < h && ch !== ' ') out[y][x] = { ch, ink };
	};
	const text = (x: number, y: number, s: string, ink: RigCell['ink']) => { for (let i = 0; i < s.length; i++) put(x + i, y, s[i], ink); };
	const eL = level(r.eyeL), eR = level(r.eyeR), mo = level(r.mouth);
	const sm = signed(r.smile), yw = signed(r.yaw), pt = signed(r.pitch), rl = signed(r.roll), gx = signed(r.gazeX), gy = signed(r.gazeY);
	const bL = signed(r.browL ?? 8), bR = signed(r.browR ?? 8);

	if (w < 8 || h < 4) {
		// Far: (o o) over the mouth; a frown tilts the brackets in, raised brows out.
		const sx = yw >= 4 ? 1 : yw <= -4 ? -1 : 0, gs = gx >= 5 ? 1 : gx <= -5 ? -1 : 0;
		const mid = Math.floor((w - 1) / 2), ex = Math.max(1, Math.floor((w - 1) / 4));
		const bb = bL + bR;
		put(0, 0, bb <= -6 ? '>' : bb >= 6 ? '<' : '(', 1);
		put(w - 1, 0, bb <= -6 ? '<' : bb >= 6 ? '>' : ')', 1);
		put(clamp(mid - ex + sx + gs, 1, w - 2), 0, eyeGlyph(eL), 2);
		put(clamp(mid + ex + sx + gs, 1, w - 2), 0, eyeGlyph(eR), 2);
		text(clamp(mid - 1 + sx, 0, w - 3), 1, mouthRows(mo, sm, 3, 1)[0], 2);
		return out;
	}

	const big = w >= 14 && h >= 7;
	// Rows for each feature at rest (big: brows 1, eyes 3, nose 4, mouth 5..7; middle: brows 0, eyes 1, nose 2, mouth 3..).
	const browY = big ? 1 : 0, eyeY = big ? 3 : 1, noseY = big ? 4 : 2, mouthY = big ? 5 : 3;
	// Tip: a row up or down (when strong), the whole face.
	const ty = pt >= 4 ? -1 : pt <= -4 ? 1 : 0;
	// Turn: the face slides across; on a strong turn the far eye narrows.
	const tx = big ? rdiv(yw * 2, 7) : rdiv(yw, 7);
	// Lean: the lower side's brow and eye drop a row (leaning far, the higher side's rise one too); in the
	// middle size only the lower eye drops, the brows having no row to spare.
	const lean = (side: -1 | 1) => {
		if (Math.abs(rl) < 3) return 0;
		const low = (side > 0) === (rl > 0);
		return big ? (low ? 1 : Math.abs(rl) >= 6 ? -1 : 0) : low ? 1 : 0;
	};
	const ew: 3 | 5 = big ? 5 : 3;
	// The eyes' middles: big at a fifth of the way in from each edge, the middle size a quarter.
	const half = Math.floor((w - 1) / 2);
	const off = big ? Math.floor(w / 4) : Math.floor((3 * w) / 10);
	const cx = [half - off + 1 + tx, w - 1 - half + off - 1 + tx];
	if (w % 2 === 0) cx[1] = w - 1 - (half - off + 1) + tx;

	for (const side of [-1, 1] as const) {
		const i = side < 0 ? 0 : 1;
		const open = side < 0 ? eL : eR;
		const b = side < 0 ? bL : bR;
		const far = (side > 0) === (yw > 0) && Math.abs(yw) >= 5;
		const wide: 3 | 5 = far ? 3 : ew;
		const x0 = cx[i] - (wide === 5 ? 2 : 1);
		const dy = lean(side) + ty;
		// Brow: raised a row up, lowered a row down (onto the lid's row), mirrored on the right.
		const brow = browCells(b, wide);
		const by = clamp(browY + (big ? dy : ty) + (b >= 3 && big ? -1 : 0) + (b <= -3 && big ? 1 : 0), 0, h - 1);
		text(x0, by, side < 0 ? brow : mirror(brow), 2);
		const e = eyeCells(open, gx, gy, wide);
		const ey = clamp(eyeY + dy, 0, h - 1);
		if (e.lid && big && !(b <= -3)) text(x0, ey - 1, e.lid, 2);
		text(x0, ey, e.row, 2);
	}

	const mid = Math.floor((cx[0] + cx[1]) / 2);
	if (big) text(mid - 1 + (w % 2 === 0 ? 0 : 0), clamp(noseY + ty, 0, h - 1), noseCells(yw), 1);
	else put(mid + (yw >= 3 ? 1 : yw <= -3 ? -1 : 0), clamp(noseY + ty, 0, h - 1), yw >= 3 ? '>' : yw <= -3 ? '<' : 'v', 1);

	// The mouth: as wide as the eyes' inner edges, as tall as the rows left; a lean slants its ends.
	const mw = big ? 8 : 4;
	const rows = h - mouthY - Math.max(0, ty);
	const m = mouthRows(mo, sm, mw, Math.max(1, rows));
	// A single shut line sits a row down in the big face (nearer the chin), unless the mouth needs the rows.
	const my = clamp(mouthY + ty + (big && m.length === 1 ? 1 : 0), 0, h - 1);
	const m0 = mid - Math.floor(mw / 2) + 1;
	m.forEach((row, k) => {
		for (let i = 0; i < row.length; i++) {
			put(m0 + i, clamp(my + k, 0, h - 1), row[i], 2);
		}
	});
	return out;
}
