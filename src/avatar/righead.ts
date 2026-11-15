/**
 * The head of rig.ts: a rig and a look, as cells. Split out so rig.ts stays the wire format and the rules.
 *
 * The look is the player's own head and hair, captured now and then by the tracker (trackers.ts
 * LookBuilder) and sent rarely: a 16 x 16 grid in "model space", where the eyes always sit at the same
 * place, each square background, face or hair. Headphones, a hat's brim, glasses' arms are none of those,
 * so they never show. A rig poses it each frame: the head turns (the face slides over the head, the hair
 * at the side comes into view, the outline narrows), tips, and leans (everything turns together).
 *
 * Whole numbers only, as in rig.ts: the turn and lean use the fixed sine tables below, divisions round
 * with rdiv or floor with fdiv, so a Rust twin draws the very same cells (tests/fixtures/rig-golden.json).
 */
import type { Rig, RigCell } from './rig.ts';

// ---- the look ------------------------------------------------------------------------------------------

/** Squares across and down the look's grid. One square is a quarter of the eyes' distance apart. */
export const LOOK_N = 16;
/** Where the eyes sit in the look's grid: x 6 and 10 (square edges 6 and 10), on the edge above row 9. */
export const LOOK_EYE_Y = 9;
/** Background, face, hair. */
export type Region = 0 | 1 | 2;

export interface Look {
	/** How dark or light the hair and skin are, 0..15 (each game maps them to its own inks). */
	hairTone: number;
	skinTone: number;
	/** The row of the look's grid the mouth sits on. */
	mouthRow: number;
	/** LOOK_N * LOOK_N regions, row by row. */
	mask: Region[];
}
/** Hex digits in a look on the wire: four, then two squares a digit. */
export const LOOK_LEN = 4 + (LOOK_N * LOOK_N) / 2;

export function encodeLook(l: Look): string {
	const d = (v: number) => Math.max(0, Math.min(15, Math.round(v))).toString(16);
	let s = d(l.hairTone) + d(l.skinTone) + d(l.mouthRow) + '1';
	for (let i = 0; i < l.mask.length; i += 2) s += (l.mask[i] * 4 + l.mask[i + 1]).toString(16);
	return s;
}
export function decodeLook(s: unknown): Look | null {
	if (typeof s !== 'string' || s.length !== LOOK_LEN || !/^[0-9a-f]+$/.test(s) || s[3] !== '1') return null;
	const mask: Region[] = [];
	for (let i = 4; i < s.length; i++) {
		const v = parseInt(s[i], 16);
		const a = v >> 2, b = v & 3;
		if (a > 2 || b > 2) return null;
		mask.push(a as Region, b as Region);
	}
	return { hairTone: parseInt(s[0], 16), skinTone: parseInt(s[1], 16), mouthRow: parseInt(s[2], 16), mask };
}

/** Anyone without a captured look: an oval face under a cap of short hair. */
export function defaultLook(): Look {
	const mask: Region[] = [];
	for (let y = 0; y < LOOK_N; y++) for (let x = 0; x < LOOK_N; x++) {
		// Square middles in half squares: 2x+1, 2y+1. Face: centre (16, 19), half-axes (9, 11).
		const fx = 2 * x + 1 - 16, fy = 2 * y + 1 - 19;
		const face = fx * fx * 121 + fy * fy * 81 <= 81 * 121;
		// Hair: centre (16, 15), half-axes (10.5, 11), down to the ears.
		const hx = 2 * x + 1 - 16, hy = 2 * y + 1 - 15;
		const hair = hx * hx * 121 + hy * hy * 110 <= 110 * 121 && y <= 9;
		mask.push(face && y >= 5 ? 1 : hair || face ? 2 : 0);
	}
	return { hairTone: 4, skinTone: 11, mouthRow: 13, mask };
}
export const DEFAULT_LOOK = defaultLook();

// ---- whole-number helpers --------------------------------------------------------------------------------

/** a / b rounded to the nearest, halves away from zero (b > 0). */
export function rdiv(a: number, b: number): number {
	const m = Math.floor((2 * Math.abs(a) + b) / (2 * b));
	return a < 0 ? -m : m;
}
/** a / b rounded down (b > 0): Rust's div_euclid. */
export const fdiv = (a: number, b: number) => Math.floor(a / b);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
/** A signed digit as -7..7 (8 is the middle). */
export const signed = (v: number) => clamp(clamp(Math.trunc(v), 0, 15) - 8, -7, 7);
const level = (v: number) => clamp(Math.trunc(v), 0, 15);

/** sin and cos x 1024 of the lean, 4.5 degrees a step, and of the turn, 6 degrees a step. */
export const SIN_ROLL = [0, 80, 160, 239, 316, 392, 465, 535];
export const COS_ROLL = [1024, 1021, 1011, 996, 974, 946, 912, 873];
export const SIN_YAW = [0, 107, 213, 316, 416, 512, 602, 685];
export const COS_YAW = [1024, 1018, 1002, 974, 935, 887, 828, 761];

/** Fixed point: a look square is F units. */
const F = 64;
/** The part of the look the box shows: 13 squares each way from (1.5, 2), the head filling it. */
const VX = 3 * F / 2, VY = 2 * F, VS = 13 * F;

// ---- glyphs ------------------------------------------------------------------------------------------------

/** An eye one cell wide, by how open it is. */
export function eyeGlyph(open: number): string {
	return open <= 3 ? '-' : open <= 7 ? '=' : open <= 12 ? 'o' : 'O';
}

/** The mouth's glyphs: left end, middle, right end; and a second row when wide open and there is room. */
export function mouthGlyphs(open: number, smile: number, twoRows: boolean): { top: [string, string, string]; under: [string, string, string] | null } {
	const s = smile >= 3 ? 1 : smile <= -3 ? -1 : 0;
	if (open <= 2) return { top: s > 0 ? ['\\', '_', '/'] : s < 0 ? ['/', '-', '\\'] : ['-', '-', '-'], under: null };
	if (open <= 8 || !twoRows) {
		const mid = open <= 8 ? '=' : 'O';
		return { top: s > 0 ? ['\\', mid, '/'] : s < 0 ? ['/', mid, '\\'] : ['(', mid, ')'], under: null };
	}
	if (s < 0) return { top: ['/', '-', '\\'], under: ["'", '-', "'"] };
	return { top: ['.', '-', '.'], under: s > 0 ? ['\\', '_', '/'] : ["'", '-', "'"] };
}

/**
 * A brow, three cells from its outer end to its inner end: raised an arch, lowered sloping down to the
 * nose (a frown), else a line. `left`: the brow drawn on the left.
 */
export function browGlyphs(b: number, left: boolean): [string, string, string] {
	if (b >= 3) return ['/', '-', '\\'];
	if (b <= -3) return left ? ['-', '-', '\\'] : ['-', '-', '/'];
	return ['-', '-', '-'];
}

/**
 * The outline's glyph from which corners of a cell are inside (top left, top right, bottom left, bottom
 * right): the edge runs across the cell, so it is drawn by its slope.
 */
export function edgeGlyph(tl: boolean, tr: boolean, bl: boolean, br: boolean): string {
	const k = (tl ? 8 : 0) | (tr ? 4 : 0) | (bl ? 2 : 0) | (br ? 1 : 0);
	return [' ', '/', '\\', '_', '\\', '|', '/', '/', '/', '\\', '|', '\\', '-', '\\', '/', ' '][k];
}

// ---- the head ------------------------------------------------------------------------------------------------

/**
 * The avatar for a rig and a look in w x h cells (w >= 5, h >= 2). From 8 x 4 up, the posed head; smaller,
 * an emoticon on two rows: (o o) over its mouth.
 */
export function drawHead(r: Rig, w: number, h: number, look: Look = DEFAULT_LOOK): RigCell[][] {
	const out: RigCell[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => ({ ch: ' ', ink: 0 as const })));
	if (w < 5 || h < 2) return out;
	const put = (x: number, y: number, ch: string, ink: RigCell['ink']) => {
		if (x >= 0 && y >= 0 && x < w && y < h) out[y][x] = { ch, ink };
	};
	const eL = level(r.eyeL), eR = level(r.eyeR), mo = level(r.mouth);
	const sm = signed(r.smile), yw = signed(r.yaw), pt = signed(r.pitch), rl = signed(r.roll), gx = signed(r.gazeX), gy = signed(r.gazeY);
	const bL = signed(r.browL ?? 8), bR = signed(r.browR ?? 8);

	if (w < 8 || h < 4) {
		const sx = yw >= 4 ? 1 : yw <= -4 ? -1 : 0, gs = gx >= 5 ? 1 : gx <= -5 ? -1 : 0;
		const mid = Math.floor((w - 1) / 2), ex = Math.max(1, Math.floor((w - 1) / 4));
		// A frown on both brows tilts the brackets in; raised, out.
		const bb = bL + bR;
		put(0, 0, bb <= -6 ? '>' : bb >= 6 ? '<' : '(', 1);
		put(w - 1, 0, bb <= -6 ? '<' : bb >= 6 ? '>' : ')', 1);
		put(clamp(mid - ex + sx + gs, 1, w - 2), 0, eyeGlyph(eL), 2);
		put(clamp(mid + ex + sx + gs, 1, w - 2), 0, eyeGlyph(eR), 2);
		const m = mouthGlyphs(mo, sm, false).top;
		const m0 = clamp(mid - 1 + sx, 0, w - 3);
		for (let i = 0; i < 3; i++) put(m0 + i, 1, m[i === 0 ? 0 : i === 2 ? 2 : 1], 2);
		return out;
	}

	// The pose. Forward: a point d (from the pivot, in look units) is turned (x squeezed, slid by the
	// turn: the face more than the outline, as it is nearer the front), tipped (slid up or down), then
	// leant (rotated about the pivot, clockwise for roll above 8).
	const ay = Math.abs(yw), sy = yw < 0 ? -1 : 1, ar = Math.abs(rl), sr = rl < 0 ? -1 : 1;
	const cosY = COS_YAW[ay], sinY = SIN_YAW[ay] * sy, cosR = COS_ROLL[ar], sinR = SIN_ROLL[ar] * sr;
	const PX = 8 * F, PY = LOOK_EYE_Y * F;
	const slideFace = rdiv(sinY * 5 * F, 2048), slideOut = rdiv(sinY * F, 2048);
	const tipFace = -rdiv(pt * 2 * F, 7), tipOut = 0;
	/** The posed point (look units) of an unposed one, for a feature (front) or the outline. */
	const pose = (mx: number, my: number, front: boolean) => {
		const dx = rdiv((mx - PX) * cosY, 1024) + (front ? slideFace : slideOut);
		const dy = my - PY + (front ? tipFace : tipOut);
		return { x: PX + rdiv(dx * cosR - dy * sinR, 1024), y: PY + rdiv(dx * sinR + dy * cosR, 1024) };
	};
	/** The unposed point of a posed one (the inverse of pose). */
	const unpose = (sx: number, sy2: number, front: boolean) => {
		const ex = sx - PX, ey = sy2 - PY;
		const dx = rdiv(ex * cosR + ey * sinR, 1024), dy = rdiv(-ex * sinR + ey * cosR, 1024);
		return { x: PX + rdiv((dx - (front ? slideFace : slideOut)) * 1024, cosY), y: PY + dy - (front ? tipFace : tipOut) };
	};
	const region = (p: { x: number; y: number }): Region => {
		const cx = fdiv(p.x, F), cy = fdiv(p.y, F);
		return cx < 0 || cy < 0 || cx >= LOOK_N || cy >= LOOK_N ? 0 : look.mask[cx + cy * LOOK_N];
	};
	// A cell's quarter point (qx, qy in quarters of a cell) in look units: the look's 16 squares fill the box.
	const at = (qx: number, qy: number) => ({ x: VX + rdiv(qx * VS, 4 * w), y: VY + rdiv(qy * VS, 4 * h) });

	const edge = out.map((row) => row.map(() => false));
	const full = out.map((row) => row.map(() => 0));
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		let inside = 0, hair = 0;
		const ins: boolean[] = [];
		for (const [qx, qy] of [[1, 1], [3, 1], [1, 3], [3, 3]]) {
			const s = at(4 * x + qx, 4 * y + qy);
			const back = region(unpose(s.x, s.y, false));
			const sil = back !== 0;
			ins.push(sil);
			if (!sil) continue;
			inside++;
			// Inside the head: hair where the hair is, and wherever the face has slid away from (a turn shows
			// the side of the head); face only where both agree.
			if (back === 2 || region(unpose(s.x, s.y, true)) !== 1) hair++;
		}
		full[y][x] = inside;
		if (inside === 0) continue;
		if (inside === 4 && hair < 2) continue;
		if (inside === 4) {
			// Hair, combed from the crown: strands down and out above the brow, hanging at the sides.
			const c = unpose(VX + rdiv((4 * x + 2) * VS, 4 * w), VY + rdiv((4 * y + 2) * VS, 4 * h), false);
			const dx = c.x - PX;
			const ch = c.y < 6 * F ? (dx < -F ? '/' : dx > F ? '\\' : '~') : '|';
			put(x, y, ch, 3);
			continue;
		}
		put(x, y, edgeGlyph(ins[0], ins[1], ins[2], ins[3]), hair * 2 >= inside ? 3 : 1);
		edge[y][x] = true;
	}
	// Where the edge falls between two cells, the face's cell beside the empty one takes it.
	const empty = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || full[y][x] === 0;
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		if (full[y][x] !== 4 || out[y][x].ch !== ' ') continue;
		const ch = empty(x - 1, y) || empty(x + 1, y) ? '|' : empty(x, y - 1) ? '-' : empty(x, y + 1) ? '-' : '';
		if (ch) { put(x, y, ch, 1); edge[y][x] = true; }
	}
	// Features never draw over the head's edge: a turned face stays inside its head.
	const putF = (x: number, y: number, ch: string, ink: RigCell['ink']) => { if (x >= 0 && y >= 0 && x < w && y < h && !edge[y][x]) put(x, y, ch, ink); };

	// Features, at their posed places.
	const big = w >= 14 && h >= 7;
	const cell = (p: { x: number; y: number }) => ({ x: clamp(fdiv((p.x - VX) * w, VS), 0, w - 1), y: clamp(fdiv((p.y - VY) * h, VS), 0, h - 1) });
	// Brows a square and a half above the eyes, a raise lifting them half a square more.
	const brow = (side: -1 | 1, b: number) => {
		const lift = b >= 3 ? F / 2 : b <= -3 ? -F / 4 : 0;
		const c = cell(pose(PX + side * 2 * F, PY - 3 * F / 2 - lift, true));
		const g = browGlyphs(b, side < 0);
		if (big) for (let i = -1; i <= 1; i++) putF(c.x + i, c.y, g[side < 0 ? i + 1 : 1 - i], 2);
		else if (b >= 3 || b <= -3) putF(c.x, c.y, b >= 3 ? '^' : side < 0 ? '\\' : '/', 2);
	};
	brow(-1, bL);
	brow(1, bR);

	const eye = (side: -1 | 1, open: number) => {
		const c = cell(pose(PX + side * 2 * F, PY, true));
		// Turned hard, the far eye is narrower: one cell.
		const far = (side > 0) === (yw > 0) && Math.abs(yw) >= 5;
		if (!big || far) { putF(clamp(c.x + (gx >= 4 ? 1 : gx <= -4 ? -1 : 0), 0, w - 1), c.y, eyeGlyph(open), 2); return; }
		// Three cells: ( o ), moved a cell by a strong glance; the pupil shows a look up or down.
		const x = c.x + (gx >= 4 ? 1 : gx <= -4 ? -1 : 0);
		const pupil = open <= 7 ? '-' : open >= 13 ? 'O' : gy >= 4 ? "'" : gy <= -4 ? '.' : 'o';
		const g = open <= 3 ? ['-', '-', '-'] : ['(', pupil, ')'];
		for (let i = -1; i <= 1; i++) putF(x + i, c.y, g[i + 1], 2);
	};
	eye(-1, eL);
	eye(1, eR);

	if (big) {
		const n = cell(pose(PX, PY + 2 * F, true));
		putF(n.x, n.y, yw >= 3 ? '>' : yw <= -3 ? '<' : '|', 1);
	}

	// The mouth: each of its cells at its own posed place, so it leans with the head.
	const mw = w >= 14 ? 5 : w >= 8 ? 4 : 3;
	// A square nearer the eyes than in life: cartoon proportions, so brows, eyes, nose and mouth all fit.
	const my = clamp(look.mouthRow, LOOK_EYE_Y + 3, LOOK_N - 1) * F - F / 2;
	const m = mouthGlyphs(mo, sm, h >= 7);
	const row = (dy: number, g: [string, string, string]) => {
		for (let i = 0; i < mw; i++) {
			// One cell apart on the screen, whatever the box: the look is drawn at VS / w a cell.
			const c = cell(pose(PX + rdiv((2 * i + 1 - mw) * VS, 2 * w), my + dy, true));
			// The mouth may sit on the chin's edge (small heads have no row between).
			put(c.x, c.y, i === 0 ? g[0] : i === mw - 1 ? g[2] : g[1], 2);
		}
	};
	row(0, m.top);
	if (m.under) row(rdiv(VS, h), m.under);
	return out;
}
