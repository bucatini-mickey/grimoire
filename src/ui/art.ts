/**
 * art.ts - the pictures.
 *
 * PORTRAITS is where hand-drawn character close-ups go: one entry per
 * character id, each an array of lines, at most 30 columns wide and about
 * 16 lines tall (it is shown on the card the Storyteller holds up, and in
 * the night profile). Use ASCII and Latin-1 only (no emoji, no box symbols
 * outside ─│┌┐└┘├┤┬┴┼), so every column lines up on every phone.
 *
 * Until a character has a portrait, it gets a plain two-light gothic window
 * with its initials in the rose.
 */

export const PORTRAITS: Record<string, string[]> = {
	// 'empath': [
	//   '   your stained glass    ',
	//   '   goes here, line by    ',
	//   '   line                  ',
	// ],
};

const SIGIL: Record<string, string> = {
	washerwoman: 'Ww', librarian: 'Lb', investigator: 'In', chef: 'Ch', empath: 'Em',
	'fortune-teller': 'Ft', undertaker: 'Ud', monk: 'Mk', ravenkeeper: 'Rk', virgin: 'Vg',
	slayer: 'Sl', soldier: 'So', mayor: 'My', butler: 'Bt', drunk: 'Dr', recluse: 'Rc',
	saint: 'St', poisoner: 'Po', spy: 'Sp', 'scarlet-woman': 'Sw', baron: 'Bn', imp: 'Im'
};

export function portrait(character: string): string[] {
	if (PORTRAITS[character]) return PORTRAITS[character];
	const s = (SIGIL[character] ?? '??').padEnd(2).slice(0, 2);
	return [
		'      ______      ',
		'   .-\'      \'-.   ',
		'  /    .--.    \\  ',
		` /    ( ${s} )    \\ `,
		'|      \'--\'      |',
		'|  /\\        /\\  |',
		'| |  |  /\\  |  | |',
		'| |  | |  | |  | |',
		'| |  | |  | |  | |',
		'|_|__|_|__|_|__|_|'
	];
}

/** The picture in the middle of the table, cut to fit the space. */
export function centrepiece(phase: 'night' | 'day' | 'other', height: number): string[] {
	const sky = phase === 'night' ? ['   (  .  *', '    `-     '] : phase === 'day' ? ['   \\ | /', '  -- O --'] : [];
	const tower = [
		'     /\\',
		'    /__\\',
		'   |(12)|',
		'   | || |',
		'  _|_||_|_'
	];
	const all = [...sky, ...tower];
	if (height >= all.length) return all;
	if (height >= tower.length) return tower;
	return tower.slice(tower.length - height);
}

