/**
 * theme.ts - each script's look: the book's inks by day and by candlelight, the inks the village is
 * drawn in, and the town it is played in.
 *
 *   Trouble Brewing     medieval    the illuminated book; the castle town
 *   Bad Moon Rising     grimm       a grim German fairy tale: birch-white leaves, pine and blood; a village in the snow
 *   Sects & Violets     clockwork   gaslit London, soot and brass (clockwork, not steampunk); Whitechapel's lanes
 *   Laissez un Faire    lovecraft   sea-damp pages, verdigris and the deep; Saltgrave, the lighthouse island in a storm
 *
 * A custom script, or none, is medieval.
 */
export type Theme = 'medieval' | 'grimm' | 'clockwork' | 'lovecraft';

export const THEMES: Theme[] = ['medieval', 'grimm', 'clockwork', 'lovecraft'];

export function themeOf(scriptId: string | undefined): Theme {
	if (scriptId === 'bad-moon-rising') return 'grimm';
	if (scriptId === 'sects-and-violets') return 'clockwork';
	if (scriptId === 'laissez-un-faire') return 'lovecraft';
	return 'medieval';
}

/** The palette key of the book's pages for a theme, by day or by night. */
export const bookKey = (t: Theme, night: boolean) => (t === 'medieval' ? 'folio' : `folio-${t}`) + (night ? '-night' : '');

/** The theme of a book palette key (the inverse of bookKey). */
export function themeOfKey(key: string): Theme {
	for (const t of THEMES) if (t !== 'medieval' && key.startsWith(`folio-${t}`)) return t;
	return 'medieval';
}

/** What each theme is called, for choosing a town to walk. */
export const THEME_TOWN: Record<Theme, string> = {
	medieval: 'the castle town',
	grimm: 'the village in the snow',
	clockwork: 'Whitechapel',
	lovecraft: 'Saltgrave'
};
