/**
 * rig.ts - the webcam avatar's shared part: a few numbers in, cells out.
 *
 * A face tracker (trackers.ts, in the browser only) reads the camera and gives a Rig: eleven numbers, each
 * one hex digit (0..15), eleven bytes a frame on the wire, in the same hex style as faces.ts. Only those leave
 * the phone; never a picture. Every phone draws the avatar from them with drawRig, a pure
 * function from numbers to cells.
 *
 * drawRig is written for a second home: Tachyon will draw the same avatar in Rust (docs/avatar-tachyon.md).
 * So it uses whole numbers only (no floats, no trigonometry beyond fixed tables, no rounding left to a
 * language), and tests/fixtures/rig-golden.json holds the cells it draws for a set of rigs at
 * every size, for the Rust version to be tested against cell for cell, as pterm.ts is kept identical.
 *
 * The digits, in order (signed ones read 8 as the middle, so -8..7, drawn as -7..7):
 *   0 eyeL    the left eye as drawn (the player's left: the avatar is a mirror), 0 shut .. 15 wide
 *   1 eyeR    the right eye as drawn
 *   2 mouth   0 shut .. 15 wide open
 *   3 smile   signed: below 8 a frown, above it a smile
 *   4 yaw     signed: above 8 the head turns to the drawing's right
 *   5 pitch   signed: above 8 the head tips up (the face moves up)
 *   6 roll    signed: above 8 the head leans so its right side goes down (clockwise on the screen)
 *   7 gazeX   signed: above 8 the eyes look to the drawing's right
 *   8 gazeY   signed: above 8 the eyes look up
 *   9 browL   signed: above 8 the left brow is raised, below it lowered (a frown)
 *  10 browR   the right brow
 */
import { drawFace, PLAIN_STYLE } from './rigface.ts';
import type { FaceStyle } from './rigface.ts';
export { decodeStyle, encodeStyle, FAR_GLYPHS, PLAIN_STYLE, rdiv, setFarAscii, STYLE_NAMES, STYLE_PARTS } from './rigface.ts';
export type { FaceStyle } from './rigface.ts';

export interface Rig {
	eyeL: number; eyeR: number; mouth: number; smile: number;
	yaw: number; pitch: number; roll: number; gazeX: number; gazeY: number;
	browL: number; browR: number;
}
export const RIG_KEYS: (keyof Rig)[] = ['eyeL', 'eyeR', 'mouth', 'smile', 'yaw', 'pitch', 'roll', 'gazeX', 'gazeY', 'browL', 'browR'];
/** Digits in a rig on the wire. */
export const RIG_LEN = RIG_KEYS.length;
/** Eyes open, mouth shut, everything else in the middle. */
export const NEUTRAL: Rig = { eyeL: 11, eyeR: 11, mouth: 0, smile: 8, yaw: 8, pitch: 8, roll: 8, gazeX: 8, gazeY: 8, browL: 8, browR: 8 };

const digit = (v: number) => Math.max(0, Math.min(15, Math.round(Number.isFinite(v) ? v : 8)));
/** A rig as eleven hex digits. */
export const encodeRig = (r: Rig) => RIG_KEYS.map((k) => digit(r[k]).toString(16)).join('');
/** Eleven hex digits as a rig; null for anything else (what came over the wire is checked here). */
export function decodeRig(s: unknown): Rig | null {
	if (typeof s !== 'string' || s.length !== RIG_LEN || !/^[0-9a-f]+$/.test(s)) return null;
	const r = {} as Rig;
	RIG_KEYS.forEach((k, i) => { r[k] = parseInt(s[i], 16); });
	return r;
}

/**
 * The mouth opened by the voice heard (0..1, voice.ts's level): talking opens it with the sound, in step
 * with it, whatever the camera saw. Each phone does this with the voice it hears, so nothing more is sent.
 */
export function withVoice(r: Rig, level: number): Rig {
	const m = Math.round(Math.max(0, Math.min(1, (level - 0.06) / 0.45)) * 13);
	return m > r.mouth ? { ...r, mouth: m } : r;
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

/**
 * One cell: its glyph and its ink: 0 ground, 1 the nose's sides and the far face's brackets, 2 eyes, brows
 * and mouth, 3 the nose's middle (where a game may draw the player's own mark instead).
 */
export interface RigCell { ch: string; ink: 0 | 1 | 2 | 3; }

/** The avatar for a rig in w x h cells, in its player's style (rigface.ts FaceStyle). */
export const drawRig = (r: Rig, w: number, h: number, style: FaceStyle = PLAIN_STYLE): RigCell[][] => drawFace(r, w, h, style);

/** The avatar as lines of text (for tests, the test page and the fixture). */
export const rigText = (cells: RigCell[][]) => cells.map((row) => row.map((c) => c.ch).join('')).join('\n');
/** The avatar's inks as lines of digits 0..3 (for the fixture). */
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
		eyeL: blink ? 0 : 11, eyeR: blink ? 0 : 11, browL: 8 + r(Math.sin(s * 0.31 + k) * 4), browR: 8 + r(Math.sin(s * 0.31 + k) * 4),
		mouth: talk ? r(Math.max(0, Math.sin(s * 9) * 11)) : 0,
		smile: 8 + r(Math.sin(s * 0.21 + k) * 4),
		yaw: 8 + r(Math.sin(s * 0.37 + k) * 3), pitch: 8 + r(Math.sin(s * 0.29) * 2), roll: 8 + r(Math.sin(s * 0.23 + k * 2) * 2),
		gazeX: 8 + r(Math.sin(s * 0.9 + k) * 6), gazeY: 8 + r(Math.sin(s * 0.6) * 3)
	};
}
