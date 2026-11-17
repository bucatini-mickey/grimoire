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
 * Whole numbers only, and printable ASCII but for the far face's few letters from other alphabets
 * (FAR_GLYPHS, with an ASCII fallback), so the Rust twin draws the very same cells
 * (tests/fixtures/rig-golden.json).
 */
import type { Rig, RigCell } from './rig.ts';

/**
 * A face's style, chosen by its player ("My figure and face", in the lobby or the village): six digits, one a
 * part, each a choice from that part's list (STYLE_NAMES). The plain face is all zeros.
 *   brow     line, thick, wavy, bushy, thin, none (with none, only a raise or a frown shows)
 *   eye      dot, square [ ], pointed < >, curly { }, round ( )
 *   nose     the player's letter (where a game draws it), v, L, ^, J
 *   tache    none, pencil, bushy, handlebar, walrus (beside the nose in the middle face, over the mouth in
 *            the near one)
 *   beard    none, goatee, chinstrap, full, stubble (under the mouth, and down the cheeks for the full one)
 *   glasses  none, round, square, shades (no pupils to see), wire
 */
export interface FaceStyle { brow: number; eye: number; nose: number; tache: number; beard: number; glasses: number; }
export const PLAIN_STYLE: FaceStyle = { brow: 0, eye: 0, nose: 0, tache: 0, beard: 0, glasses: 0 };
export const STYLE_PARTS: (keyof FaceStyle)[] = ['brow', 'eye', 'nose', 'tache', 'beard', 'glasses'];
/**
 * The parts a player chooses and the face draws (17 Nov: moustache and beard dropped, hair maybe later). The
 * six digits stay as they are on the wire; a saved moustache or beard is simply not drawn.
 */
export const SHOWN_PARTS: (keyof FaceStyle)[] = ['brow', 'eye', 'nose', 'glasses'];
/** Each part's choices, by name, for the page that picks them (the order is the digit). */
export const STYLE_NAMES: Record<keyof FaceStyle, string[]> = {
	brow: ['Line', 'Thick', 'Wavy', 'Bushy', 'Thin', 'None'],
	eye: ['Dot', 'Square', 'Pointed', 'Curly', 'Round'],
	nose: ['Letter', 'v', 'L', '^', 'J'],
	tache: ['None', 'Pencil', 'Bushy', 'Handlebar', 'Walrus'],
	beard: ['None', 'Goatee', 'Chinstrap', 'Full', 'Stubble'],
	glasses: ['None', 'Round', 'Square', 'Shades', 'Wire']
};
/** The part names as the page shows them. */
export const PART_LABEL: Record<keyof FaceStyle, string> = { brow: 'Brows', eye: 'Eyes', nose: 'Nose', tache: 'Moustache', beard: 'Beard', glasses: 'Glasses' };
const pick = (k: keyof FaceStyle, v: number) => Math.max(0, Math.min(STYLE_NAMES[k].length - 1, Math.trunc(v) || 0));
export const encodeStyle = (st: FaceStyle) => STYLE_PARTS.map((k) => pick(k, st[k]).toString(16)).join('');
/**
 * A style from its digits; anything else is the plain one. The first version's four digits (brow, eye, nose,
 * then 1 moustache, 2 beard, 3 both) still read.
 */
export function decodeStyle(v: unknown): FaceStyle {
	if (typeof v === 'string' && /^[0-9a-f]{6}$/.test(v)) {
		const st = {} as FaceStyle;
		STYLE_PARTS.forEach((k, i) => { st[k] = pick(k, parseInt(v[i], 16)); });
		return st;
	}
	if (typeof v === 'string' && /^[0-3]{4}$/.test(v)) {
		const m = +v[3];
		return { brow: [0, 1, 2, 5][+v[0]], eye: [4, 1, 2, 0][+v[1]], nose: +v[2], tache: m & 1 ? 2 : 0, beard: m & 2 ? 3 : 0, glasses: 0 };
	}
	return { ...PLAIN_STYLE };
}
const BROW_FILL = ['-', '=', '~', '#', '.', ' '];
const EYE_SIDES: [string, string][] = [['(', ')'], ['[', ']'], ['<', '>'], ['{', '}'], ['(', ')']];
/** The middle face's eye frames by style: a bare glyph, then [o] <o> {o} (o). */
const SOFT_SIDES: ([string, string] | null)[] = [null, ['[', ']'], ['<', '>'], ['{', '}'], ['(', ')']];
const NOSE = ['v', 'v', 'L', '^', 'J'];
/** Glasses' frames (left and right of each eye) and the bridge between the eyes. */
const GLASSES: ([string, string] | null)[] = [null, ['(', ')'], ['[', ']'], ['[', ']'], ['|', '|']];

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
 * comes back as `lid`. Glasses (1..4) put their frames in place of the eye's own sides; shades hide the
 * pupil (a blink still shows).
 */
export function eyeCells(open: number, gx: number, gy: number, wide: 3 | 5, style = 0, glasses = 0): { row: string; lid: string | null } {
	const inner = wide - 2;
	const frame = GLASSES[glasses] ?? null;
	if (open <= 3) return { row: frame ? frame[0] + '-'.repeat(inner) + frame[1] : wide === 5 ? ' --- ' : '---', lid: null };
	const [l, r] = frame ?? EYE_SIDES[style] ?? EYE_SIDES[0];
	const at = inner === 1 ? 0 : gx >= 3 ? 2 : gx <= -3 ? 0 : 1;
	const shades = glasses === 3;
	const pupil = shades ? '#' : open <= 7 ? '-' : open >= 13 ? 'O' : gy >= 4 ? "'" : gy <= -4 ? '.' : 'o';
	let mid = '';
	for (let i = 0; i < inner; i++) mid += shades ? '#' : i === at ? pupil : open <= 7 ? '-' : ' ';
	return { row: l + mid + r, lid: open >= 13 && !frame ? (wide === 5 ? ' .-. ' : '.-.') : null };
}

/** A brow `wide` cells across, from its outer end to its inner: raised an arch, lowered sloping to the nose. */
export function browCells(b: number, wide: 3 | 5, style = 0): string {
	const f = BROW_FILL[style] ?? '-';
	// No brows: only a raise (a lifted point) or a frown (a slope at the nose) shows.
	if (f === ' ') return b >= 3 ? (wide === 5 ? '  ^  ' : ' ^ ') : b <= -3 ? (wide === 5 ? '   \\ ' : '  \\') : ' '.repeat(wide);
	if (b >= 3) return wide === 5 ? '/' + f + f + f + '\\' : '/' + f + '\\';
	if (b <= -3) return wide === 5 ? '`' + f + '._ ' : '`' + f + '.';
	return f.repeat(wide);
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

/** The far face's letters from other alphabets (◠ ò ó ɷ ◡ ㅁ ㅇ ᗜ), or plain ASCII where a device lacks them. */
let farAscii = false;
/** Draw far faces in ASCII only (a game sets this once, from what the device can draw). */
export function setFarAscii(on: boolean) { farAscii = on; }
/** The far face's letters outside ASCII, for a game to test the device's font with. */
export const FAR_GLYPHS = ['◠', 'ò', 'ó', 'ɷ', '◡', 'ㅁ', 'ㅇ', 'ᗜ'];

/** The avatar for a rig in w x h cells (w >= 5, h >= 2): near (from 14 x 7), middle (from 8 x 4), else far. */
export function drawFace(r: Rig, w: number, h: number, style: FaceStyle = PLAIN_STYLE): RigCell[][] {
	const st: FaceStyle = { ...style, tache: 0, beard: 0 };
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
		// Far (chosen 17 Nov, "all mouth, 3x2", then M4 from other alphabets): a near-square face three cells
		// wide, centred in the box, eyes at its corners and the bottom row its mouth; no letter (a game puts
		// the player's letter in their name instead):
		//   o o    ◠ ◠    o o    ◠ ◠    ò ó    ɷ ɷ    - ◠
		//   ---     ◡      ㅁ     ᗜ      ◠      ◠      ◡
		//  at rest smiling talking laughing cross  sad  wink
		// Eyes: - shut, = half, o open, O wide or brows up, ◠ happy (Kannada's smile), ò ó cross (Cyrillic),
		// ɷ sad (IPA), # shades. Mouths: --- at rest, ◡ smiling and ◠ frowning (round), ㅁ talking and ㅇ loud
		// (Korean jamo), ᗜ laughing or talking happily. The jamo and ᗜ are wider than a cell: a game draws
		// them spilling into the blank cells beside them. Where a device lacks these letters, FAR_ASCII says
		// so and the face is drawn in ASCII instead (o o over ---, ^ ^ over \_/, > < over /-\, talking o O).
		// A strong turn slides the face a cell.
		const happy = sm >= 4, cross = bL + bR <= -6, sad = sm <= -5 && !cross;
		const u = !farAscii;
		const eye = (open: number, side: -1 | 1) => open <= 3 ? '-' : st.glasses === 3 ? '#'
			: happy ? (u ? '◠' : '^') : cross ? (side < 0 ? (u ? 'ò' : '>') : (u ? 'ó' : '<'))
			: sad ? (u ? 'ɷ' : 'T') : open >= 13 || bL + bR >= 6 ? 'O' : open <= 7 ? '=' : 'o';
		const m = u
			? (happy ? (mo >= 6 ? ' ᗜ ' : ' ◡ ') : mo >= 8 ? ' ㅇ ' : mo >= 3 ? ' ㅁ ' : cross || sad ? ' ◠ ' : '---')
			: (happy ? (mo >= 11 ? '\\O/' : mo >= 6 ? '\\o/' : '\\_/') : mo >= 8 ? ' O ' : mo >= 3 ? ' o ' : cross ? '/-\\' : sad ? '.-.' : '---');
		const x0 = Math.floor((w - 3) / 2) + (yw >= 4 ? 1 : yw <= -4 ? -1 : 0);
		const top = Math.floor((h - 2) / 2);
		put(x0, top, eye(eL, -1), 2);
		put(x0 + 2, top, eye(eR, 1), 2);
		text(x0, top + 1, m, 2);
		return out;
	}

	if (!(w >= 14 && h >= 7)) {
		// Middle (Soft, chosen 17 Nov): old usenet ASCII art, dots and curves and no frames:
		//    __    __       .-    -.       `.    .'
		//     o    o         O    O         o    o
		//       J              J              J
		//      ----          .--.           .--.
		//                    `--'
		// Brows two cells over each eye (raised .- -., frowning `. .'), the eyes one glyph each that glance
		// a cell aside, their letter (ink 3) under and between them, the mouth shut a Soft line
		// (---- `-..-' .--.), talking and laughing the original's (==) and .--. over \__/ (17 Nov).
		// A chosen eye style puts its frame round the glyph; glasses do the same and add a bridge.
		const ty = pt >= 4 ? -1 : pt <= -4 ? 1 : 0;
		const tx = rdiv(yw, 7);
		const half = Math.floor((w - 1) / 2), off = Math.floor((3 * w) / 10);
		const cx = [half - off + 1 + tx, (w % 2 === 0 ? w - 1 - (half - off + 1) : w - 1 - half + off - 1) + tx];
		const lean = (side: -1 | 1) => (Math.abs(rl) >= 3 && (side > 0) === (rl > 0) ? 1 : 0);
		const frameOf = st.glasses ? GLASSES[st.glasses] : SOFT_SIDES[st.eye] ?? null;
		const s1 = sm >= 3 ? 1 : sm <= -3 ? -1 : 0;
		for (const side of [-1, 1] as const) {
			const i = side < 0 ? 0 : 1, open = side < 0 ? eL : eR, b = side < 0 ? bL : bR;
			const c = cx[i], ey = clamp(1 + ty + lean(side), 0, h - 1);
			// Brow: two cells, the outer one and the one over the eye.
			const f = st.brow === 0 ? '_' : BROW_FILL[st.brow] ?? '_';
			let brow = f === ' ' ? (b >= 3 ? " '" : b <= -3 ? ' \\' : '  ') : b >= 3 ? '.-' : b <= -3 ? '`.' : f + f;
			if (side > 0) brow = mirror(brow);
			text(side < 0 ? c - 1 : c, clamp(ty, 0, h - 1), brow, 2);
			// The eye: shut a line, half shut =, smiling ^, wide O, else o (or ' . for a glance up or down).
			const g = open <= 3 ? '-' : st.glasses === 3 ? '#' : open <= 7 ? '=' : s1 > 0 && sm >= 4 ? '◠' : open >= 13 ? 'O' : gy >= 4 ? "'" : gy <= -4 ? '.' : 'o';
			const gx1 = frameOf ? 0 : gx >= 4 ? 1 : gx <= -4 ? -1 : 0;
			put(c + gx1, ey, g, 2);
			if (frameOf) { put(c - 1, ey, frameOf[0], 2); put(c + 1, ey, frameOf[1], 2); }
		}
		if (st.glasses) for (let x = cx[0] + 2; x <= cx[1] - 2; x++) put(x, clamp(1 + ty, 0, h - 1), '-', 2);
		const mid = Math.floor((cx[0] + cx[1]) / 2);
		const ny = clamp(2 + ty, 0, h - 1);
		const nx = mid + (yw >= 3 ? 1 : yw <= -3 ? -1 : 0);
		if (st.nose) put(nx, ny, yw >= 3 ? '>' : yw <= -3 ? '<' : NOSE[st.nose], 1);
		else put(nx, ny, yw >= 3 ? '>' : yw <= -3 ? '<' : 'v', 3);
		// The mouth.
		const my = clamp(3 + ty, 0, h - 1), rows = h - my;
		const broad = w >= 10;
		const m: string[] = mo >= 8 && rows < 2 ? ['(  )'] : mo >= 3 ? mouthRows(mo, sm, 4, Math.max(1, rows))
			: s1 > 0 ? [sm >= 6 && broad ? "`-..-'" : "`--'"]
			: s1 < 0 ? [sm <= -6 && broad ? ".-''-." : '.--.']
			: ['----'];
		const mw = m[0].length, m0 = mid - Math.floor((mw - 2) / 2);
		m.forEach((row, k) => text(m0, clamp(my + k, 0, h - 1), row, 2));
		// A moustache beside the letter; a beard on the row under the mouth.
		if (st.tache) {
			const reach = [0, 1, 2, 1, 2][st.tache], ch = ['', '-', '~', '~', '"'][st.tache];
			for (let d = 1; d <= reach; d++) for (const x of [nx - d, nx + d]) if (out[ny][x]?.ch === ' ') put(x, ny, ch, 2);
			if (st.tache === 3) { put(nx - reach - 1, ny, '(', 2); put(nx + reach + 1, ny, ')', 2); }
		}
		const beardRow = my + m.length;
		if (st.beard && beardRow <= h - 1) {
			if (st.beard === 1) text(mid, beardRow, 'vv', 2);
			if (st.beard === 2) text(m0 - 1, beardRow, '\\' + '_'.repeat(mw) + '/', 2);
			if (st.beard === 3) { text(m0 - 1, beardRow, '\\' + 'w'.repeat(mw) + '/', 2); for (let y = my; y < beardRow; y++) { put(m0 - 2, y, '(', 2); put(m0 + mw + 1, y, ')', 2); } }
			if (st.beard === 4) for (let i = 0; i < mw; i += 2) put(m0 + i, beardRow, '.', 2);
		}
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
		const brow = browCells(b, wide, st.brow);
		const by = clamp(browY + (big ? dy : ty) + (b >= 3 && big ? -1 : 0) + (b <= -3 && big ? 1 : 0), 0, h - 1);
		text(x0, by, side < 0 ? brow : mirror(brow), 2);
		const e = eyeCells(open, gx, gy, wide, st.eye, st.glasses);
		const ey = clamp(eyeY + dy, 0, h - 1);
		if (e.lid && big && !(b <= -3)) text(x0, ey - 1, e.lid, 2);
		text(x0, ey, e.row, 2);
	}

	const mid = Math.floor((cx[0] + cx[1]) / 2);
	// The nose; its middle cell is ink 3, the place a game may put the player's own mark instead (Grimoire's
	// camera tiles put their letter there, on its plate: the letter tile with a face round it).
	const ny = clamp(noseY + ty, 0, h - 1);
	// A chosen nose (style 1..3) is the player's own glyph: no letter goes there.
	const nx = mid + (yw >= 3 ? 1 : yw <= -3 ? -1 : 0);
	if (st.nose) put(nx, ny, yw >= 3 ? '>' : yw <= -3 ? '<' : NOSE[st.nose], 1);
	else if (big) { const n = noseCells(yw); text(mid - 1, ny, n, 1); put(mid, ny, n[1] === ' ' ? '_' : n[1], 3); }
	else put(nx, ny, yw >= 3 ? '>' : yw <= -3 ? '<' : 'v', 3);

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
	// Glasses: a bridge between the frames, on the eyes' row.
	if (st.glasses) {
		const bx0 = cx[0] + (ew === 5 ? 3 : 2), bx1 = cx[1] - (ew === 5 ? 3 : 2), by = clamp(eyeY + ty + lean(-1), 0, h - 1);
		for (let x = bx0; x <= bx1; x++) put(x, by, '-', 2);
	}
	// A moustache on the row over the mouth: beside the nose in the middle face (it shares the row), across
	// the lip in the near one. Each style its own glyph and reach; a handlebar curls at its ends.
	const tacheRow = my - 1;
	if (st.tache && tacheRow >= 0) {
		const reach = [0, big ? 1 : 1, big ? 2 : 2, big ? 1 : 1, big ? 3 : 2][st.tache];
		const ch = ['', '-', '~', '~', '"'][st.tache];
		const c = big ? mid : nx;
		for (let d = big ? 0 : 1; d <= reach; d++) {
			for (const x of big ? [c - d, c + 1 + d] : [c - d, c + d]) if (out[tacheRow][x]?.ch === ' ') put(x, tacheRow, ch, 2);
		}
		if (st.tache === 3) { put(c - reach - 1, tacheRow, '(', 2); put(c + reach + (big ? 2 : 1), tacheRow, ')', 2); }
	}
	// A beard on the row under the mouth (when the mouth leaves it free): a goatee at the middle, a chinstrap
	// along the jaw, a full beard with its sides up the cheeks, or stubble.
	const beardRow = my + m.length;
	if (st.beard && beardRow <= h - 1) {
		const centre = m0 + Math.floor(mw / 2) - 1;
		if (st.beard === 1) { put(centre, beardRow, 'v', 2); put(centre + 1, beardRow, 'v', 2); }
		if (st.beard === 2) for (let i = -1; i <= mw; i++) put(m0 + i, beardRow, i === -1 ? '\\' : i === mw ? '/' : '_', 2);
		if (st.beard === 3) {
			for (let i = -1; i <= mw; i++) put(m0 + i, beardRow, i === -1 ? '\\' : i === mw ? '/' : 'w', 2);
			for (let y = my; y < beardRow; y++) { put(m0 - 2, y, '(', 2); put(m0 + mw + 1, y, ')', 2); }
		}
		if (st.beard === 4) for (let i = 0; i < mw; i++) put(m0 + i, beardRow, i % 2 ? '.' : ':', 2);
	}
	return out;
}
