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

/**
 * The towns, each in its theme's look (town/<key>.tbp). A game is played in its theme's first town
 * unless the Storyteller picks another of that theme's.
 */
export interface TownInfo { key: string; name: string; theme: Theme; }
export const TOWN_LIST: TownInfo[] = [
	{ key: 'castle', name: 'Ravensburg', theme: 'medieval' },
	{ key: 'hamlet', name: 'Ashcombe', theme: 'medieval' },
	{ key: 'abbey', name: 'The Abbey', theme: 'medieval' },
	{ key: 'grimm', name: 'Wolfsgrund', theme: 'grimm' },
	{ key: 'whitechapel', name: 'Whitechapel', theme: 'clockwork' },
	{ key: 'victorian', name: 'Saltgrave', theme: 'lovecraft' },
	{ key: 'liner', name: 'The Carcosa', theme: 'lovecraft' }
];
