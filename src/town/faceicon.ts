/**
 * Players on the village map are small faces, not bare letters: one CP437 face in the left column
 * of the cell and the person's initial in the right (the fallback, and what the colour plate
 * carries). Your own face is the hollow one. A faint name banner appears over anyone close to you
 * and fades out with distance. Pure helpers, so they can be tested.
 */

/** How far (in cells) a name banner reaches, and where it starts to fade. */
export const NEAR_MAX = 5, NEAR_FULL = 2;

export const FACE_ME = '\u263A', FACE_OTHER = '\u263B', FACE_TALK = '\u263B', FACE_DEAD = '\u2020', FACE_ST = '\u263C';

/** The two columns of a person's cell: [face, initial]. */
export function iconOf(q: { name: string; st?: boolean; dead?: boolean }, mine: boolean): [string, string] {
	const initial = q.st ? '\u2726' : q.name[0]?.toUpperCase() ?? '?';
	if (q.st) return [FACE_ST, initial];
	if (q.dead) return [FACE_DEAD, initial];
	return [mine ? FACE_ME : FACE_OTHER, initial];
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
