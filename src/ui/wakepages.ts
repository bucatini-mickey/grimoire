/**
 * wakepages.ts - a night wake (views.ts) drawn as the player's pages.
 *
 * The same pages whether the Storyteller hands over their own phone or the
 * wake arrives on the player's phone: who you are, then whom you choose,
 * then what you learn, then (for the Spy) the grimoire, then a last page.
 */
import { COLS, blank, btn, buttonRows, center, endPanel, illuminatedName, letteredRow, pad, row, rubric, txt, wrap } from './ascii.ts';
import { ALL_CHARACTERS } from '../core/index.ts';
import type { Button, Row } from './ascii.ts';
import type { SeatId } from '../core/index.ts';
import type { Section, Wake } from '../net/views.ts';

/** Cards are as wide as the page, so what a player is told is large and plain. */
export const CARD_COLS = COLS;
export const CARD_INNER = CARD_COLS - 4;

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

// Set at the left under their headings, as a book is written; the answer in gold.
export const big = (...lines: string[]): Row[] => lines.map((l) => row(txt('  ' + l, 'gold', 'heading')));
export const note = (text: string): Row[] => wrap(text, CARD_INNER - 2).map((l) => row(txt('  ' + l, 'dim')));
export const cardButtons = (buttons: Button[]): Row[] => buttonRows(buttons, CARD_COLS);
// What a player is told at night, set in the middle of the page so it is read at a glance.
const midBig = (...lines: string[]): Row[] => lines.flatMap((l) => wrap(l, CARD_INNER - 2)).map((l) => row(txt(center(l, CARD_INNER), 'gold', 'heading')));
const midNote = (text: string): Row[] => wrap(text, CARD_INNER - 2).map((l) => row(txt(center(l, CARD_INNER), 'dim')));
const midText = (text: string): Row[] => wrap(text, CARD_INNER - 2).map((l) => row(txt(center(l, CARD_INNER))));
/** The side a character is on, for the colour of its arch. */
const sideOf = (role?: string): 'good' | 'evil' | 'other' => {
	const t = ALL_CHARACTERS.find((c) => c.id === role)?.team;
	return t === 'minion' || t === 'demon' ? 'evil' : t === 'townsfolk' || t === 'outsider' ? 'good' : 'other';
};

/** Room above the first panel for the character's picture, if one has been drawn. */
export function pictureRows(_character?: string): Row[] {
	return [blank()];
}

export function sectionRows(sections: Section[], role?: string): Row[] {
	const rows: Row[] = [];
	for (const s of sections) {
		// Who you are, as an illuminated page shows it: "You are the" small, then the name under its arch.
		if (s.title === 'You are' && s.style === 'big' && s.lines.length === 1) {
			const l = s.lines[0], name = l.replace(/^(now )?the /i, '');
			const arch = illuminatedName(name, sideOf(role), CARD_COLS);
			if (arch) { rows.push(blank(), ...midNote('You are ' + l.slice(0, l.length - name.length).trim()), arch, blank()); continue; }
		}
		// (each heading in the middle too, in red, over what it heads)
		if (s.title) rows.push(blank(), row(txt(center(s.title, CARD_INNER), 'rubric')));
		for (const l of s.lines) {
			// Who you are, lettered large when the name is short enough: "the" small above it.
			const name = l.replace(/^the /i, '');
			const lettered = s.style === 'big' && s.title === 'You are' ? letteredRow(name, CARD_INNER) : null;
			if (lettered) rows.push(...(name !== l ? note(l.slice(0, l.length - name.length).trim()) : []), lettered);
			else if (s.style === 'big') rows.push(...midBig(l));
			else if (s.style === 'note') rows.push(...midNote(l));
			else rows.push(...midText(l));
		}
	}
	return rows;
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
	const rows: Row[] = [];
	const next = (from: Page) => btn('Next', () => h.go(nextPage(w, from)), { style: 'primary' });
	switch (page) {
		case 'who':
			rows.push(...pictureRows(w.role), ...sectionRows(w.sections, w.role), endPanel(), blank(), ...cardButtons([next('who')]));
			break;
		case 'pick': {
			const p = w.pick!;
			rows.push(rubric(p.count === 2 ? 'Choose two' : 'Choose one'), ...note(p.prompt), blank());
			const seats = p.allowed.map((id) => btn(h.deadAtDusk(id) ? `${h.name(id)} †` : h.name(id), () => h.toggle(id), {
				style: picks.includes(id) ? 'on' : undefined, width: 10
			}));
			rows.push(...buttonRows(seats, CARD_INNER, 2));
			rows.push(endPanel(), blank(), ...cardButtons([
				btn('Back', () => h.go('who'), { style: 'quiet' }),
				btn('Confirm', h.confirm, { style: 'primary', disabled: picks.length !== p.count })
			]));
			break;
		}
		case 'wait':
			rows.push(...pictureRows(w.role), rubric('Chosen'), ...big(...picks.map(h.name)), ...note('The Storyteller will answer in a moment. Keep the phone to yourself.'), endPanel());
			break;
		case 'info':
			rows.push(...pictureRows(w.role), ...sectionRows(w.info ?? [], w.role), endPanel(), blank(), ...cardButtons([next('info')]));
			break;
		case 'grimoire': {
			const g = w.grimoire!;
			rows.push(rubric('The Grimoire'), row(txt(pad('Player', 8), 'dim'), txt(pad('Character', 11), 'dim'), txt('Flag', 'dim')));
			for (const l of g.lines) {
				rows.push(row(txt(pad(l.name, 8)), txt(pad(l.character, 11), l.evil ? 'evil' : 'good'), txt(l.flags.join('').slice(0, 3), 'gold')));
				for (const n of l.notes) rows.push(row(txt('  ' + n, 'dim')));
			}
			rows.push(rubric('Not in play'), ...note('The Demon’s bluffs'), ...big(...g.bluffs), endPanel(), blank(), ...cardButtons([next('grimoire')]));
			break;
		}
		case 'done':
			rows.push(...pictureRows(), rubric('Done'),
				...note(h.ending === 'hand-back' ? 'Hand the phone back to the Storyteller, and close your eyes.' : 'That is all for now. Put your phone down and close your eyes.'),
				endPanel(), blank(), blank(),
				...cardButtons([btn(h.ending === 'hand-back' ? 'Storyteller: continue' : 'Done', h.finish, { style: h.ending === 'hand-back' ? 'quiet' : 'primary' })]));
			break;
	}
	return rows;
}
