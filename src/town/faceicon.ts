/**
 * Players on the village map are faces: one face fills the person's whole square, in their colour.
 * Your own face is the hollow one. A faint name banner appears over anyone close to you and fades out
 * with distance. (Off the screen they are still marked at its edge by their letter.) Pure helpers,
 * so they can be tested.
 */

/** How far (in cells) a name banner reaches, and where it starts to fade. */
export const NEAR_MAX = 5, NEAR_FULL = 2;

export const FACE_ME = '\u263A', FACE_OTHER = '\u263B', FACE_TALK = '\u263B', FACE_DEAD = '\u2020', FACE_ST = '\u263C';

/** The face that fills a person's square. */
export function faceOf(q: { st?: boolean; dead?: boolean }, mine: boolean): string {
	if (q.st) return FACE_ST;
	if (q.dead) return FACE_DEAD;
	return mine ? FACE_ME : FACE_OTHER;
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
