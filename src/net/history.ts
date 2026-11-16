/**
 * history.ts - what each seat was shown on the Storyteller's own phone, kept so it can be shown again.
 *
 * On a single phone the Storyteller hands the phone to one player after another and every page is gone
 * once it is turned. This keeps each page as it was drawn, per seat, so a later "Remind me" can replay
 * exactly those pages and nothing else (docs/DESIGN.md, "Single-phone recall").
 *
 * - Recorded when a page is shown, not when the game decides: the false answer a Drunk or poisoned player
 *   was given is what is kept, never the truth. Nothing here reads the grimoire.
 * - Storyteller-side only. It lives beside the saved game, not in GameState, so views.ts cannot send it
 *   to anyone, and nothing in net/ imports this file (a test checks).
 * - Pure and plain data (JSON), so it saves, loads and tests without the page.
 */
import type { CharacterId, SeatId } from '../core/index.ts';
import type { Section, Wake } from './views.ts';
import { bluffsOf } from './views.ts';

/** The pages of a wake that show something worth keeping (wakepages.ts Page, without the waiting and last pages). */
export type ShownPageName = 'who' | 'pick' | 'info' | 'bluffs' | 'grimoire';

/**
 * What the page is:
 *  role          who they are, their ability and team (every first-night wake, and a later wake's "You are")
 *  evil-team     the same page when it also shows the evil team (a Minion's Demon and fellow Minions, a Demon's Minions)
 *  bluffs        the Demon's "Your bluffs" page
 *  choice        the page where they chose (what they were asked, whom they could pick, and whom they chose)
 *  night-result  what they learned
 *  grimoire      the Spy's (or Widow's) look at the grimoire
 */
export type ShownKind = 'role' | 'evil-team' | 'bluffs' | 'choice' | 'night-result' | 'grimoire';

export interface ShownChoice {
	count: number;
	prompt: string;
	/** Whom they could pick, as the page listed them (a name, and whether it was marked dead at dusk). */
	options: { id: SeatId; name: string; dead: boolean }[];
	/** Whom they confirmed; empty until they do. */
	chosen: SeatId[];
}

export interface ShownPage {
	/** The wake (`night:step`) and page, so a page can be found again. */
	id: string;
	/** 1 the first time this page was shown; more if the Storyteller backed out and showed it again, differently. */
	showing: number;
	night: number;
	kind: ShownKind;
	page: ShownPageName;
	/** The character they were shown as (the Drunk's pretend Townsfolk), for the portrait and the side. */
	role: CharacterId;
	/** The words on the page: who/bluffs/info pages. */
	sections: Section[];
	choice?: ShownChoice;
	grimoire?: Wake['grimoire'];
}

/** Per seat, in the order shown. Seats are players (GameState.order moves them, the ids stay). */
export type History = Record<number, ShownPage[]>;

const EVIL_TEAM_TITLES = new Set(['Your Demon', 'Fellow Minions', 'Your Minions']);

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** How a page names and marks seats, as it was drawn. */
export interface Seating { name(id: SeatId): string; dead(id: SeatId): boolean; }

/** The page as shown, ready to keep; null for a page that tells them nothing (waiting, the last page). */
export function shownPage(wake: Wake, page: string, night: number, seating: Seating): ShownPage | null {
	const base = { id: `${wake.id}#${page}`, showing: 1, night, role: wake.role };
	const bluffs = bluffsOf(wake);
	switch (page) {
		case 'who': {
			const sections = wake.sections.filter((s) => s !== bluffs);
			return copy({ ...base, kind: sections.some((s) => EVIL_TEAM_TITLES.has(s.title)) ? 'evil-team' : 'role', page, sections } as ShownPage);
		}
		case 'bluffs':
			return bluffs ? copy({ ...base, kind: 'bluffs', page, sections: [bluffs] } as ShownPage) : null;
		case 'pick':
			return wake.pick ? copy({
				...base, kind: 'choice', page, sections: [],
				choice: { count: wake.pick.count, prompt: wake.pick.prompt, options: wake.pick.allowed.map((id) => ({ id, name: seating.name(id), dead: seating.dead(id) })), chosen: [] }
			} as ShownPage) : null;
		case 'info':
			return wake.info ? copy({ ...base, kind: 'night-result', page, sections: wake.info } as ShownPage) : null;
		case 'grimoire':
			return wake.grimoire ? copy({ ...base, kind: 'grimoire', page, sections: [], grimoire: wake.grimoire } as ShownPage) : null;
		default:
			return null;
	}
}

/** What identifies a page's content (not whom they went on to choose). */
const content = (p: ShownPage) => JSON.stringify({ ...p, showing: 0, choice: p.choice && { ...p.choice, chosen: [] } });

/**
 * Keep a page shown to a seat. The same page shown again unchanged is kept once; shown again with other
 * words (the Storyteller backed out and gave another answer) it is kept as well, as a later showing,
 * because the player saw both. Returns the entry that now stands for it.
 */
export function record(history: History, seat: SeatId, page: ShownPage): ShownPage {
	const list = (history[seat] ??= []);
	const same = list.filter((p) => p.id === page.id);
	const twin = same.find((p) => content(p) === content(page));
	if (twin) return twin;
	const entry = { ...page, showing: same.length + 1 };
	list.push(entry);
	return entry;
}

/** The player confirmed their choice on the page for this wake. */
export function recordChoice(history: History, seat: SeatId, wakeId: string, chosen: SeatId[]): void {
	const mine = (history[seat] ?? []).filter((p) => p.id === `${wakeId}#pick`);
	const last = mine[mine.length - 1];
	if (last?.choice) last.choice.chosen = [...chosen];
}

/**
 * The Storyteller undid back to night `lastNight` (0: before any night began, so the characters may be dealt
 * again). Pages shown on a later night never happened in the game as it now stands, and pages from a deal
 * that is being redone would name the wrong character, so they are dropped. Pages from this night and
 * earlier stay: the player did see them, even if the step is then undone and shown again.
 */
export function forgetAfter(history: History, lastNight: number): void {
	for (const seat of Object.keys(history)) {
		const kept = history[Number(seat)].filter((p) => p.night <= lastNight);
		if (kept.length) history[Number(seat)] = kept;
		else delete history[Number(seat)];
	}
}

/** A seat's pages, in the order shown (a copy). */
export function pagesFor(history: History, seat: SeatId): ShownPage[] {
	return copy(history[seat] ?? []);
}

/**
 * A wake that draws this page exactly as it was drawn (wakepages.ts wakeRows(wake, entry.page, ...)).
 * For a choice page, name seats with `entry.choice.options` and mark the dead the same way.
 */
export function wakeOf(entry: ShownPage, seat: SeatId): Wake {
	const wake: Wake = { id: entry.id.replace(/#[^#]*$/, ''), seat, role: entry.role, sections: entry.page === 'who' || entry.page === 'bluffs' ? copy(entry.sections) : [] };
	if (entry.page === 'info') wake.info = copy(entry.sections);
	if (entry.choice) wake.pick = { count: entry.choice.count, prompt: entry.choice.prompt, allowed: entry.choice.options.map((o) => o.id) };
	if (entry.grimoire) wake.grimoire = copy(entry.grimoire);
	return wake;
}

/** One line of a seat's "Remind me" index: what it is called, which night it belongs to (null: about the player), and the page it opens. */
export interface RecallItem {
	/** Identifies this showing of the page (the same on every call, so a screen can say which is open). */
	key: string;
	label: string;
	night: number | null;
	entry: ShownPage;
}

export const recallKey = (e: ShownPage): string => `${e.id}@${e.showing}`;

/** What a page of the evil team is called: who the player was shown. */
function teamLabel(e: ShownPage): string {
	const titles = new Set(e.sections.map((s) => s.title));
	if (titles.has('Your Demon')) return titles.has('Fellow Minions') ? 'My Demon and fellow Minions' : 'My Demon';
	return 'My Minions';
}

/** A later night's "You are" page that says nothing new (the same character, no extra words). */
const plainRepeat = (e: ShownPage, firstRole: CharacterId): boolean =>
	e.sections.length === 1 && e.sections[0].title === 'You are' && !/^now /i.test(e.sections[0].lines[0] ?? '') && e.role === firstRole;

/**
 * The index of a seat's "Remind me": each page the seat was shown, named so the player can find it. First
 * what is about them (who they are; their Demon or Minions; the Demon's bluffs), then each night in the
 * order shown. It lists only what is kept, so a seat shown nothing has an empty index, and it never reads
 * the game: what a Drunk or poisoned player was told is what comes back. A page the player saw more than
 * once (the Storyteller backed out and showed it again, differently) is listed once per showing, since
 * they saw each.
 */
export function recallIndex(history: History, seat: SeatId): RecallItem[] {
	const pages = history[seat] ?? [];
	const firstWho = pages.find((p) => p.kind === 'role' || p.kind === 'evil-team');
	const firstTeam = pages.find((p) => p.kind === 'evil-team');
	const showings = (e: ShownPage) => pages.filter((p) => p.id === e.id).length;
	const named = (e: ShownPage, label: string, night: number | null): RecallItem => ({
		key: recallKey(e), night, entry: copy(e),
		label: showings(e) > 1 ? `${label} (showing ${e.showing})` : label
	});
	const about: RecallItem[] = [];
	const nights: RecallItem[] = [];
	for (const p of pages) if (firstWho && p.id === firstWho.id) about.push(named(p, 'Who I am', null));
	for (const p of pages) if (firstTeam && p.id === firstTeam.id) about.push(named(p, teamLabel(p), null));
	// The Demon's bluffs stay here for the rest of the game, whatever night they were shown.
	for (const p of pages) if (p.kind === 'bluffs') about.push(named(p, 'My bluffs', null));
	for (const p of pages) {
		if ((firstWho && p.id === firstWho.id) || (firstTeam && p.id === firstTeam.id) || p.kind === 'bluffs') continue;
		if (p.kind === 'role') {
			if (firstWho && plainRepeat(p, firstWho.role)) continue;
			nights.push(named(p, /^now /i.test(p.sections[0]?.lines[0] ?? '') ? 'Who I am now' : 'Who I am tonight', p.night));
		} else if (p.kind === 'evil-team') nights.push(named(p, teamLabel(p), p.night));
		else if (p.kind === 'choice') nights.push(named(p, p.choice?.chosen.length ? 'Whom I chose' : 'My choice', p.night));
		else if (p.kind === 'night-result') nights.push(named(p, 'What I learned', p.night));
		else if (p.kind === 'grimoire') nights.push(named(p, 'The grimoire I saw', p.night));
	}
	nights.sort((a, b) => a.night! - b.night!);
	return [...about, ...nights];
}

const KINDS = new Set<string>(['role', 'evil-team', 'bluffs', 'choice', 'night-result', 'grimoire']);
const isPage = (p: unknown): p is ShownPage => {
	const x = p as ShownPage;
	return !!x && typeof x.id === 'string' && typeof x.night === 'number' && KINDS.has(x.kind) && typeof x.page === 'string' && typeof x.role === 'string' && Array.isArray(x.sections);
};

/** A saved game's history: an older save (none) or a damaged one loads as empty, and bad entries are dropped. */
export function reviveHistory(raw: unknown): History {
	const out: History = {};
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
	for (const [seat, list] of Object.entries(raw as Record<string, unknown>)) {
		if (!Array.isArray(list) || !Number.isInteger(Number(seat))) continue;
		const ok = list.filter(isPage).map((p) => ({ ...copy(p), showing: typeof p.showing === 'number' ? p.showing : 1 }));
		if (ok.length) out[Number(seat)] = ok;
	}
	return out;
}
