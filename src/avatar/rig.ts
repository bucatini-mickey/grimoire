/**
 * rig.ts - the webcam avatar's shared part: a few numbers in, cells out.
 *
 * A face tracker (trackers.ts, in the browser only) reads the camera and gives a Rig: nine numbers, each
 * one hex digit (0..15), nine bytes a frame on the wire, in the same hex style as faces.ts. Only those
 * numbers leave the phone; never a picture. Every phone draws the avatar from them with drawRig, a pure
 * function from numbers to cells.
 *
 * drawRig is written for a second home: Tachyon will draw the same avatar in Rust (docs/avatar-tachyon.md).
 * So it uses whole numbers only (no floats, no trigonometry, no rounding left to a language), and
 * tests/fixtures/rig-golden.json holds the cells it draws for a set of rigs at every size, for the Rust
 * version to be tested against cell for cell, as pterm.ts is kept identical.
 *
 * The digits, in order (signed ones read 8 as the middle, so -8..7, drawn as -7..7):
 *   0 eyeL    the left eye as drawn (the player's right eye: the avatar is a mirror), 0 shut .. 15 wide
 *   1 eyeR    the right eye as drawn
 *   2 mouth   0 shut .. 15 wide open
 *   3 smile   signed: below 8 a frown, above it a smile
 *   4 yaw     signed: above 8 the head turns to the drawing's right
 *   5 pitch   signed: above 8 the head tips up (the face moves up)
 *   6 roll    signed: above 8 the head leans so its right side goes down (clockwise on the screen)
 *   7 gazeX   signed: above 8 the eyes look to the drawing's right
 *   8 gazeY   signed: above 8 the eyes look up
 */

export interface Rig {
	eyeL: number; eyeR: number; mouth: number; smile: number;
	yaw: number; pitch: number; roll: number; gazeX: number; gazeY: number;
}
export const RIG_KEYS: (keyof Rig)[] = ['eyeL', 'eyeR', 'mouth', 'smile', 'yaw', 'pitch', 'roll', 'gazeX', 'gazeY'];
/** Digits in a rig on the wire. */
export const RIG_LEN = RIG_KEYS.length;
/** Eyes open, mouth shut, everything else in the middle. */
export const NEUTRAL: Rig = { eyeL: 11, eyeR: 11, mouth: 0, smile: 8, yaw: 8, pitch: 8, roll: 8, gazeX: 8, gazeY: 8 };

const digit = (v: number) => Math.max(0, Math.min(15, Math.round(v)));
/** A rig as nine hex digits. */
export const encodeRig = (r: Rig) => RIG_KEYS.map((k) => digit(r[k]).toString(16)).join('');
/** Nine hex digits as a rig; null for anything else (what came over the wire is checked here). */
export function decodeRig(s: unknown): Rig | null {
	if (typeof s !== 'string' || s.length !== RIG_LEN || !/^[0-9a-f]+$/.test(s)) return null;
	const r = {} as Rig;
	RIG_KEYS.forEach((k, i) => { r[k] = parseInt(s[i], 16); });
	return r;
}

// ---- sizes by distance ----------------------------------------------------------------------------

/** How much of the avatar someone sees: 3 near (most detail) .. 0 far (their letter only). */
export type Detail = 0 | 1 | 2 | 3;
/** The avatar's size in cells at each detail (0: none, the letter stands for it). */
export const DETAIL_SIZE: Record<Detail, { w: number; h: number }> = { 0: { w: 0, h: 0 }, 1: { w: 5, h: 2 }, 2: { w: 10, h: 5 }, 3: { w: 16, h: 8 } };
/** How often a rig at each detail is passed on, in milliseconds (0: never). */
export const DETAIL_EVERY: Record<Detail, number> = { 0: 0, 1: 500, 2: 150, 3: 66 };

/** The detail someone at a loudness (map.ts loudness, 0..1) gets: the nearest clearest, the farthest a letter. */
export function detailFor(loud: number): Detail {
	return loud >= 0.66 ? 3 : loud >= 0.33 ? 2 : loud >= 0.12 ? 1 : 0;
}

/** The largest detail whose avatar fits in w x h cells. */
export function detailThatFits(w: number, h: number, most: Detail = 3): Detail {
	for (let d = most; d > 0; d--) if (DETAIL_SIZE[d as Detail].w <= w && DETAIL_SIZE[d as Detail].h <= h) return d as Detail;
	return 0;
}

// ---- the drawing -----------------------------------------------------------------------------------

/** One cell: its glyph and its ink: 0 ground, 1 the head's outline and the nose, 2 eyes and mouth. */
export interface RigCell { ch: string; ink: 0 | 1 | 2; }

/** a / b rounded to the nearest whole number, halves away from zero (b > 0). The same in any language. */
export function rdiv(a: number, b: number): number {
	const m = Math.floor((2 * Math.abs(a) + b) / (2 * b));
	return a < 0 ? -m : m;
}
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
/** A signed digit as -7..7. */
const signed = (v: number) => clamp(clamp(Math.trunc(v), 0, 15) - 8, -7, 7);
const level = (v: number) => clamp(Math.trunc(v), 0, 15);

/** An eye one cell wide, by how open it is. */
export function eyeGlyph(open: number): string {
	return open <= 3 ? '-' : open <= 7 ? '=' : open <= 12 ? 'o' : 'O';
}

/**
 * The mouth's glyphs: its left end, its middle, its right end, on one row; and a second row under it
 * when there is room and it is wide open (null otherwise).
 */
export function mouthGlyphs(open: number, smile: number, twoRows: boolean): { top: [string, string, string]; under: [string, string, string] | null } {
	const s = smile >= 3 ? 1 : smile <= -3 ? -1 : 0;
	if (open <= 3) return { top: s > 0 ? ['\\', '_', '/'] : s < 0 ? ['/', '-', '\\'] : ['-', '-', '-'], under: null };
	if (open <= 9 || !twoRows) {
		const mid = open <= 9 ? '=' : 'O';
		return { top: s > 0 ? ['\\', mid, '/'] : s < 0 ? ['/', mid, '\\'] : ['(', mid, ')'], under: null };
	}
	if (s < 0) return { top: ['/', '-', '\\'], under: ["'", '-', "'"] };
	return { top: ['.', '-', '.'], under: s > 0 ? ['\\', '_', '/'] : ["'", '-', "'"] };
}

/**
 * The avatar for a rig in w x h cells (w >= 5, h >= 2), row by row. Whole numbers only (see the top).
 * From 8 x 4 up it is a head: an oval outline with eyes, a nose when there is room and a mouth, moved by
 * the head's turn, tip and lean. Smaller, it is an emoticon on two rows: (o o) over its mouth.
 */
export function drawRig(r: Rig, w: number, h: number): RigCell[][] {
	const out: RigCell[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => ({ ch: ' ', ink: 0 as const })));
	if (w < 5 || h < 2) return out;
	const put = (x: number, y: number, ch: string, ink: 0 | 1 | 2) => {
		if (x >= 0 && y >= 0 && x < w && y < h) out[y][x] = { ch, ink };
	};
	const eL = level(r.eyeL), eR = level(r.eyeR), mo = level(r.mouth);
	const sm = signed(r.smile), yw = signed(r.yaw), pt = signed(r.pitch), rl = signed(r.roll), gx = signed(r.gazeX), gy = signed(r.gazeY);
	const tiny = w < 8 || h < 4;

	if (tiny) {
		// (o o) over the mouth: a turn moves the eyes and mouth a cell, a glance moves the eyes.
		const sx = yw >= 4 ? 1 : yw <= -4 ? -1 : 0;
		const gs = gx >= 5 ? 1 : gx <= -5 ? -1 : 0;
		const mid = Math.floor((w - 1) / 2);
		const ex = Math.max(1, Math.floor((w - 1) / 4));
		put(0, 0, '(', 1);
		put(w - 1, 0, ')', 1);
		put(clamp(mid - ex + sx + gs, 1, w - 2), 0, eyeGlyph(eL), 2);
		put(clamp(mid + ex + sx + gs, 1, w - 2), 0, eyeGlyph(eR), 2);
		const m = mouthGlyphs(mo, sm, false).top;
		const mw = w >= 5 ? 3 : 1;
		const m0 = clamp(mid - Math.floor(mw / 2) + sx, 0, w - mw);
		for (let i = 0; i < mw; i++) put(m0 + i, 1, i === 0 ? m[0] : i === mw - 1 ? m[2] : m[1], 2);
		return out;
	}

	// The head: an oval filling the box. In half cells, a cell's middle is X = 2x+1-w, Y = 2y+1-h
	// (X in -w..w, Y in -h..h); inside when (X/w)^2 + (Y/h)^2 <= 1, in whole numbers.
	const inside = (x: number, y: number) => {
		if (x < 0 || y < 0 || x >= w || y >= h) return false;
		const X = 2 * x + 1 - w, Y = 2 * y + 1 - h;
		return X * X * h * h + Y * Y * w * w <= w * w * h * h;
	};
	// The outline: the top row's run of cells as the crown (_), the bottom row's as the chin (\--/), and
	// on the rows between only the first and last cell inside, as | where the side is steep, else / or \.
	const span = (y: number): [number, number] | null => {
		let a = -1, b = -1;
		for (let x = 0; x < w; x++) if (inside(x, y)) { if (a < 0) a = x; b = x; }
		return a < 0 ? null : [a, b];
	};
	let top = -1, bottom = -1;
	for (let y = 0; y < h; y++) if (span(y)) { if (top < 0) top = y; bottom = y; }
	for (let y = top; y <= bottom; y++) {
		const s = span(y)!;
		if (y === top) { for (let x = s[0]; x <= s[1]; x++) put(x, y, '_', 1); continue; }
		if (y === bottom) { for (let x = s[0]; x <= s[1]; x++) put(x, y, x === s[0] ? '\\' : x === s[1] ? '/' : '-', 1); continue; }
		// Narrower above and wider below: the brow's slope; the other way round, the jaw's; else straight.
		const a = span(y - 1)![0], b = span(y + 1)![0];
		const brow = a > s[0] && b < s[0], jaw = a < s[0] && b > s[0];
		put(s[0], y, brow ? '/' : jaw ? '\\' : '|', 1);
		put(s[1], y, brow ? '\\' : jaw ? '/' : '|', 1);
	}

	const big = w >= 14 && h >= 7;
	// The middle, in half cells (C = 2 * the middle's x); eyes E half cells either side of it, E of the
	// parity that puts them on whole cells.
	const C = w;
	const E = 2 * rdiv(w, 5) + (w % 2 === 0 ? 1 : 0);
	// Turn: features move across (at most a quarter of the head's width); tip: up or down.
	const sx = rdiv(yw * w, 7 * 8);
	const sy = -rdiv(pt * h, 7 * 8);
	// Lean: the eyes step apart by a row, the lower side's dropping (big) or the higher side's rising
	// (smaller, where the row under the eyes is the mouth's); leaning far on a big head, both.
	const lean = (dx2: number) => {
		if (dx2 === 0 || Math.abs(rl) < 3) return 0;
		const low = (dx2 > 0) === (rl > 0);
		if (!big) return low ? 0 : -1;
		return low ? 1 : Math.abs(rl) >= 6 ? -1 : 0;
	};
	const ey = rdiv(3 * h, 8) + sy;
	const my = Math.floor((5 * h) / 7) + sy;
	const lo = 1, hi = w - 2;

	// Eyes. Big: five cells, ( o ), the pupil moved by the glance (across and up or down), a lid when half
	// shut, a line when shut. Otherwise one cell, moved a cell by a strong glance.
	const eye = (dx2: number, open: number) => {
		const x = clamp((C + dx2 - 1) / 2 + sx, big ? lo + 2 : lo, big ? hi - 2 : hi);
		const y = clamp(ey + lean(dx2), 1, h - 2);
		if (!big) {
			put(clamp(x + (gx >= 4 ? 1 : gx <= -4 ? -1 : 0), lo, hi), y, eyeGlyph(open), 2);
			return;
		}
		const g = gx >= 3 ? 1 : gx <= -3 ? -1 : 0;
		const pupil = open >= 13 ? 'O' : gy >= 4 ? "'" : gy <= -4 ? '.' : 'o';
		for (let i = -2; i <= 2; i++) {
			let ch: string;
			if (open <= 3) ch = i === -2 || i === 2 ? ' ' : '-';
			else if (i === -2) ch = '(';
			else if (i === 2) ch = ')';
			else if (i === g) ch = pupil;
			else ch = open <= 7 ? '-' : ' ';
			put(clamp(x + i, lo, hi), y, ch, 2);
		}
	};
	eye(-E, eL);
	eye(E, eR);

	// The nose, under the lower eye and over the mouth, when there is a row for it: pointing the way the
	// head turns.
	const ny = ey + 1 + Math.max(lean(-E), lean(E));
	if (big && ny < my && ny <= h - 2) {
		const nx = clamp(Math.floor((C - 1) / 2) + sx + (yw >= 3 ? 1 : 0), lo, hi);
		put(nx, ny, yw >= 3 ? '>' : yw <= -3 ? '<' : '|', 1);
	}

	// The mouth: centred under the eyes, as wide as the head allows, leaning with the head.
	const mw = w >= 14 ? 6 : w >= 8 ? 4 : 3;
	const two = h >= 7 && my + 1 <= h - 2;
	const m = mouthGlyphs(mo, sm, two);
	const m0 = (C - mw) / 2 + sx;
	const row = (y0: number, g: [string, string, string]) => {
		for (let i = 0; i < mw; i++) {
			const x = m0 + i;
			const dx2 = 2 * x + 1 - C - 2 * sx;
			put(clamp(x, lo, hi), clamp(y0, 1, h - 1), i === 0 ? g[0] : i === mw - 1 ? g[2] : g[1], 2);
		}
	};
	row(clamp(my, 1, h - 2), m.top);
	if (m.under) row(clamp(my + 1, 1, h - 2), m.under);
	return out;
}

/** The avatar as lines of text (for tests, the test page and the fixture). */
export const rigText = (cells: RigCell[][]) => cells.map((row) => row.map((c) => c.ch).join('')).join('\n');
/** The avatar's inks as lines of digits 0..2 (for the fixture). */
export const rigInks = (cells: RigCell[][]) => cells.map((row) => row.map((c) => c.ink).join('')).join('\n');

// ---- who sees whose avatar ----------------------------------------------------------------------------

/**
 * Where avatars show (a setting, to compare the two):
 *   'earshot'  whenever you can hear them
 *   'talk'     only where people sit and talk: in the circle, or both inside the same building
 *              (running about outside shows no avatar)
 */
export type AvatarPlaces = 'earshot' | 'talk';

/** Whether an avatar shows, by the place rule: `loud` from map.ts, `together` both in the same room indoors. */
export function avatarShows(rule: AvatarPlaces, s: { loud: number; circle: boolean; together: boolean }): boolean {
	if (s.loud <= 0) return false;
	if (rule === 'earshot') return true;
	return s.circle || s.together;
}

/** Whether a rig at this detail is due to be passed on again, `since` ms after the last (and not the same). */
export const rigDue = (d: Detail, since: number) => d > 0 && since >= DETAIL_EVERY[d];

// ---- passing rigs on (the host) -----------------------------------------------------------------------

/** Someone whose rig one viewer might get: how they stand to that viewer. */
export interface RigFrom { id: string; rig: string; loud: number; circle: boolean; together: boolean; }
/** What a viewer was last sent of someone's rig. */
export interface RigSent { rig: string; detail: Detail; at: number; }

/**
 * Which rigs to pass on to one viewer now, with the detail each is to be drawn at: those the place rule
 * lets them see, each no more often than its detail allows (the nearest every frame, the farthest twice a
 * second), and only when the rig or its detail changed. Someone who goes out of sight is sent once at
 * detail 0, so the viewer drops them. `sent` is the viewer's memory, updated here.
 */
export function planRigs(now: number, from: RigFrom[], rule: AvatarPlaces, sent: Map<string, RigSent>): [string, string, Detail][] {
	const out: [string, string, Detail][] = [];
	const here = new Set<string>();
	for (const f of from) {
		const d: Detail = avatarShows(rule, f) ? detailFor(f.loud) : 0;
		const last = sent.get(f.id);
		if (d === 0) {
			if (last && last.detail !== 0) { out.push([f.id, '', 0]); sent.set(f.id, { rig: '', detail: 0, at: now }); }
			if (last) here.add(f.id);
			continue;
		}
		here.add(f.id);
		if (last && last.detail === d && last.rig === f.rig) continue;
		// A change of detail goes at once; a new rig waits its turn.
		if (last && last.detail === d && !rigDue(d, now - last.at)) continue;
		out.push([f.id, f.rig, d]);
		sent.set(f.id, { rig: f.rig, detail: d, at: now });
	}
	// Anyone no longer in the list at all (left, camera off): drop them.
	for (const [id, s] of sent) if (!here.has(id) && !from.some((f) => f.id === id)) {
		if (s.detail !== 0) out.push([id, '', 0]);
		sent.delete(id);
	}
	return out;
}

/**
 * A made-up rig for a test villager (no camera), so the avatar can be tried alone: blinks every few
 * seconds, glances about, turns its head slowly, and moves its mouth while `talk`. `k` varies the timing.
 * (Floats are fine here: test villagers are drawn from this rig like anyone else, but it is never shared.)
 */
export function idleRig(k: number, ms: number, talk: boolean): Rig {
	const s = ms / 1000 + k * 1.7;
	const blink = (s % (3.1 + (k % 3) * 0.6)) < 0.16;
	const r = (v: number) => Math.round(v);
	return {
		eyeL: blink ? 0 : 11, eyeR: blink ? 0 : 11,
		mouth: talk ? r(Math.max(0, Math.sin(s * 9) * 11)) : 0,
		smile: 8 + r(Math.sin(s * 0.21 + k) * 5),
		yaw: 8 + r(Math.sin(s * 0.37 + k) * 6), pitch: 8 + r(Math.sin(s * 0.29) * 3), roll: 8 + r(Math.sin(s * 0.23 + k * 2) * 4),
		gazeX: 8 + r(Math.sin(s * 0.9 + k) * 6), gazeY: 8 + r(Math.sin(s * 0.6) * 3)
	};
}
