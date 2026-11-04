/**
 * Players on the village map are townsfolk in their headgear: one glyph fills the person's whole
 * square, a bright ink on a dark plate of its own hue (never a dark figure), and each keeps theirs.
 * A faint name banner appears over anyone close to you and fades out with distance. (Off the screen
 * they are still marked at its edge by their letter.) Pure helpers, so they can be tested.
 */

import { defaultLook, lookGlyph } from './avatar.ts';
import type { Look } from './avatar.ts';

/** How far (in cells) a name banner reaches, and where it starts to fade. */
export const NEAR_MAX = 5, NEAR_FULL = 2;

export const FACE_DEAD = '\u2020', FACE_ST = '\u263C';

/** What fills a person's square: the figure they made (avatar.ts), or one of their own by `k`, their colour's number. */
export function faceOf(q: { st?: boolean; dead?: boolean; look?: Look }, k: number): string {
	if (q.st) return FACE_ST;
	if (q.dead) return FACE_DEAD;
	return lookGlyph(q.look ?? defaultLook(k));
}

/** Banner strength 0..1 at a distance in cells: full up close, fading to nothing at NEAR_MAX. 0 for yourself. */
export function bannerStrength(dist: number): number {
	if (!(dist > 0) || dist >= NEAR_MAX) return 0;
	if (dist <= NEAR_FULL) return 1;
	return (NEAR_MAX - dist) / (NEAR_MAX - NEAR_FULL);
}

/** The ink step for a strength: 2 = readable, 1 = faint, 0 = barely there, -1 = hidden. */
export function bannerStep(strength: number): number {
	return strength <= 0.05 ? -1 : strength > 0.66 ? 2 : strength > 0.33 ? 1 : 0;
}
