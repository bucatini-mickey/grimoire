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

/**
 * Drolleries for the margins of the book: little devils as a scribe would doodle them at the
 * head and foot of a page. Plain ASCII, about 50 columns. `R` marks are drawn in red, `G` in
 * brass (the eyes); everything else in ink.
 */
export const HEADPIECE: string[] = [
	String.raw`   ,/\,                                      ,/\,  `,
	String.raw`  ( GG )  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~  ( GG ) `,
	String.raw`  /)vv(\   Blood on the Clocktower  *  a      /)vv(\ `,
	String.raw` //|  |\\  Storyteller's book of the dead   //|  |\\ `,
	String.raw`   ^  ^   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    ^  ^  `
];

export const TAILPIECE: string[] = [
	String.raw`                      /\___/\                      `,
	String.raw`  ~~~~~~~~~~~~~~~~~~~( G   G )~~~~~~~~~~~~~~~~~~~>  `,
	String.raw`                      \ RRR /                       `,
	String.raw`                     _/'---'\_                      `,
	String.raw`                    (__/   \__)                     `
];
