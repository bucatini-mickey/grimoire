/**
 * wakepages.ts - a night wake (views.ts) drawn as the player's pages.
 *
 * The same pages whether the Storyteller hands over their own phone or the
 * wake arrives on the player's phone: who you are, then whom you choose,
 * then what you learn, then (for the Spy) the grimoire, then a last page.
 *
 * Each is an illuminated page: what it says set in a block in the middle of the leaf, written from the
 * left as a book is, each heading and each paragraph opening on an initial (red on blue); the
 * character's portrait in an arch at its head and their name lettered large; the way on in the middle
 * at the foot. The leaf round the block is the book's to decorate (folio: the vines, the roundel).
 */
import { COLS, INITIAL, blank, blockRow, btn, centredButtons, endPanel, initial, miniature, namePlate, pad, row, txt, wrap } from './ascii.ts';
import type { Button, Row, Tone } from './ascii.ts';
import { ALL_CHARACTERS } from '../core/index.ts';
import type { SeatId } from '../core/index.ts';
import type { Section, Wake } from '../net/views.ts';

/** Cards are as wide as the page, so what a player is told is large and plain. */
export const CARD_COLS = COLS;
export const CARD_INNER = CARD_COLS - 4;
/** The block the writing stands in: inset from the page's writing so the book can decorate round it. */
const IND = 4, BLOCK = CARD_COLS - 2 * IND;

export type Page = 'who' | 'pick' | 'wait' | 'info' | 'grimoire' | 'done';

export interface PageHandlers {
	go(page: Page): void;
	toggle(id: SeatId): void;
	/** The player confirmed their choice. */
	confirm(): void;
	/** The last page's button. */
	finish(): void;
	/** Wording for the last page: hand back, or close your eyes. */
	ending: 'hand-back' | 'own-phone';
	name(id: SeatId): string;
	/** Already dead when the night began (marked on the pick list). */
	deadAtDusk(id: SeatId): boolean;
}

/** A line in the block. */
const line = (t: string, tone?: Tone, cls?: 'heading'): Row => row(txt(' '.repeat(IND) + t, tone, cls));
// What a player is told, from the left; the answer in gold.
export const big = (...lines: string[]): Row[] => lines.flatMap((l) => wrap(l, BLOCK - 2)).map((l) => line(l, 'gold', 'heading'));
export const note = (text: string): Row[] => wrap(text, BLOCK - 2).map((l) => line(l, 'dim'));
/** The way on, in the middle at the foot. */
export const cardButtons = (buttons: Button[]): Row[] => centredButtons(buttons, CARD_COLS);

/** A heading: its first letter an initial, the rest in red. */
const heading = (title: string): Row => blockRow(1, (c) => {
	const [first, ...rest] = [...title];
	initial(c.g, c.x + IND, c.y, first);
	c.g.text(c.x + IND + 1, c.y, rest.join(''), c.ink('rubric'));
});
/** A paragraph: its first letter an initial. */
function para(text: string, tone?: Tone): Row[] {
	const lines = wrap(text, BLOCK - 2);
	return lines.map((l, k) => (k ? line(l, tone) : blockRow(1, (c) => {
		const [first, ...rest] = [...l];
		if (/\p{L}/u.test(first)) { c.g.set(c.x + IND, c.y, first, INITIAL.fg, INITIAL.bg); c.g.text(c.x + IND + 1, c.y, rest.join(''), c.ink(tone)); }
		else c.g.text(c.x + IND, c.y, l, c.ink(tone));
	})));
}

/** The side a character is on, for the colour of its arch and the roundel. */
const sideOf = (role?: string): 'good' | 'evil' | 'other' => {
	const t = ALL_CHARACTERS.find((c) => c.id === role)?.team;
	return t === 'minion' || t === 'demon' ? 'evil' : t === 'townsfolk' || t === 'outsider' ? 'good' : 'other';
};
/** Marks a page as illuminated without a miniature (folio: the vine borders and the roundel). */
const illumined = (role?: string): Row => ({ segs: [], cls: 'illum-' + sideOf(role) });

/** Room above the first panel for the character's picture: the miniature, on the page that says who they are. */
export function pictureRows(_character?: string): Row[] {
	return [blank()];
}

export function sectionRows(sections: Section[], role?: string): Row[] {
	const rows: Row[] = [];
	for (const s of sections) {
		// Who you are: the portrait in its arch, "You are the" small, the name large on one line.
		if (s.title === 'You are' && s.style === 'big' && s.lines.length === 1) {
			const l = s.lines[0], name = l.replace(/^(now )?the /i, '');
			const plate = namePlate(name, IND);
			if (plate) { rows.push(miniature(role, sideOf(role), CARD_COLS), blank(), line('You are ' + l.slice(0, l.length - name.length).trim(), 'dim'), plate, blank()); continue; }
		}
		if (s.title) rows.push(heading(s.title));
		for (const l of s.lines) {
			if (s.style === 'big') rows.push(...big(l));
			else if (s.style === 'note') rows.push(...note(l));
			else rows.push(...para(l));
		}
		rows.push(blank());
	}
	return rows;
}

/** A player's own card, as they look it up by day: who they are and what they can do, as at night. */
export function characterRows(card: { id: string; name: string; ability: string; team: 'good' | 'evil' } | null, hide: Button): Row[] {
	if (!card) return [illumined(), blank(), heading('Your character'), ...para('It will appear here once the Storyteller deals.', 'dim'), endPanel(), blank(), ...cardButtons([hide])];
	return [
		...sectionRows([{ title: 'You are', lines: ['the ' + card.name], style: 'big' }, { title: 'Your ability', lines: [card.ability], style: 'text' }, { title: 'Your team', lines: [card.team === 'evil' ? 'Evil' : 'Good'], style: 'big' }], card.id),
		endPanel(), ...cardButtons([hide])
	];
}

/** The page after this one. */
export function nextPage(w: Wake, from: Page): Page {
	const order: Page[] = ['who', 'pick', 'info', 'grimoire', 'done'];
	for (let i = order.indexOf(from) + 1; i < order.length; i++) {
		const p = order[i];
		if (p === 'pick' && !w.pick) continue;
		if (p === 'info' && !w.info) continue;
		if (p === 'grimoire' && !w.grimoire) continue;
		return p;
	}
	return 'done';
}

export function wakeRows(w: Wake, page: Page, picks: SeatId[], h: PageHandlers): Row[] {
	const rows: Row[] = [illumined(w.role)];
	const next = (from: Page) => btn('Next', () => h.go(nextPage(w, from)), { style: 'primary' });
	switch (page) {
		case 'who':
			rows.push(...sectionRows(w.sections, w.role), endPanel(), ...cardButtons([next('who')]));
			break;
		case 'pick': {
			const p = w.pick!;
			rows.push(blank(), heading(p.count === 2 ? 'Choose two' : 'Choose one'), ...para(p.prompt, 'dim'), blank());
			const seats = p.allowed.map((id) => btn(h.deadAtDusk(id) ? `${h.name(id)} †` : h.name(id), () => h.toggle(id), {
				style: picks.includes(id) ? 'on' : undefined, width: 16
			}));
			rows.push(...centredButtons(seats, CARD_COLS, 2));
			rows.push(endPanel(), blank(), ...cardButtons([
				btn('Back', () => h.go('who'), { style: 'quiet' }),
				btn('Confirm', h.confirm, { style: 'primary', disabled: picks.length !== p.count })
			]));
			break;
		}
		case 'wait':
			rows.push(blank(), heading('Chosen'), ...big(...picks.map(h.name)), blank(), ...para('The Storyteller will answer in a moment. Keep the phone to yourself.', 'dim'), endPanel());
			break;
		case 'info':
			rows.push(blank(), ...sectionRows(w.info ?? [], w.role), endPanel(), ...cardButtons([next('info')]));
			break;
		case 'grimoire': {
			const g = w.grimoire!;
			rows.push(blank(), heading('The Grimoire'), line(pad('Player', 9) + pad('Character', 13) + 'Flag', 'dim'));
			for (const l of g.lines) {
				rows.push(row(txt(' '.repeat(IND) + pad(l.name, 9)), txt(pad(l.character, 13), l.evil ? 'evil' : 'good'), txt(l.flags.join('').slice(0, 3), 'gold')));
				for (const n of l.notes) rows.push(line('  ' + n, 'dim'));
			}
			rows.push(blank(), heading('Not in play'), ...note('The Demon’s bluffs'), ...big(...g.bluffs), endPanel(), blank(), ...cardButtons([next('grimoire')]));
			break;
		}
		case 'done':
			rows.push(blank(), heading('Done'),
				...para(h.ending === 'hand-back' ? 'Hand the phone back to the Storyteller, and close your eyes.' : 'That is all for now. Put your phone down and close your eyes.', 'dim'),
				endPanel(), blank(), blank(),
				...cardButtons([btn(h.ending === 'hand-back' ? 'Storyteller: continue' : 'Done', h.finish, { style: h.ending === 'hand-back' ? 'quiet' : 'primary' })]));
			break;
	}
	return rows;
}
