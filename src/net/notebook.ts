/**
 * notebook.ts - a player's notebook, and how the Storyteller keeps it.
 *
 * A player writes down what they suspect of every other player: a guess at
 * their character, a mark (alive, dead, suspected, cleared) and a line of
 * words. NOTHING here is filled in from the game: not a death, not a
 * character, not what the player was told. The player writes all of it.
 *
 * The notebook lives on the player's phone. Each time it changes the phone
 * sends it to the Storyteller's phone, which cleans it (it came over a
 * network), and keeps what changed, stamped with when, beside the Chronicle.
 * It travels only that way, player -> Storyteller: no message to any phone
 * carries a notebook, so one player's guesses never reach another (tests
 * check this). To be told anything true, the player asks the Storyteller for
 * a chat (a `chat` message), and the Storyteller decides what to say.
 *
 * All of it pure, so tests can pin it.
 */
import type { SeatId } from '../core/index.ts';

export const STATUSES = ['alive', 'dead', 'suspected', 'cleared'] as const;
export type Status = (typeof STATUSES)[number];

/** What a player's notebook holds for one other player. */
export interface SeatNote {
	/** The character they guess (a name on the script). */
	guess?: string;
	status?: Status;
	text?: string;
}

/** A player's notebook: a note per other player they have written on, by seat. */
export type Notebook = Record<number, SeatNote>;

export const MAX_TEXT = 60;
export const MAX_GUESS = 30;

/** The glyph and wording for each mark, as the player's page and the Storyteller's log both show them. */
export const STATUS_LABEL: Record<Status, string> = { alive: 'Alive', dead: 'Dead', suspected: 'Suspected', cleared: 'Cleared' };
export const STATUS_GLYPH: Record<Status, string> = { alive: '☺', dead: '†', suspected: '?', cleared: '■' };

const isStatus = (x: unknown): x is Status => typeof x === 'string' && (STATUSES as readonly string[]).includes(x);

/** One line of plain words: no control characters, runs of space made one, cut to length. */
export function cleanText(x: unknown, max = MAX_TEXT): string {
	if (typeof x !== 'string') return '';
	// eslint-disable-next-line no-control-regex
	return [...x.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, max).join('');
}

/**
 * Make a notebook safe to keep: only other players' seats that exist, a guess
 * only if it names a character on the script, a mark only from the four, words
 * cut short (`seats` or `characters` null: not known yet, so not checked). Anything else is dropped; a note with nothing left is dropped.
 * Notes from an earlier version (marks like "Evil?", "Trusted") are read as the
 * nearest mark if no mark was set.
 */
export function cleanNotebook(raw: unknown, seats: readonly SeatId[] | null, own: SeatId | null, characters: readonly string[] | null): Notebook {
	const out: Notebook = {};
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
	for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
		const seat = Number(k);
		if (!Number.isInteger(seat) || (seats && !seats.includes(seat)) || seat < 0 || seat === own || !v || typeof v !== 'object') continue;
		const r = v as Record<string, unknown>;
		const note: SeatNote = {};
		if (typeof r.guess === 'string' && r.guess.length <= MAX_GUESS && (!characters || characters.includes(r.guess))) note.guess = r.guess;
		if (isStatus(r.status)) note.status = r.status;
		else if (Array.isArray(r.tags)) {
			if (r.tags.some((t) => t === 'Evil?' || t === 'Lying')) note.status = 'suspected';
			else if (r.tags.includes('Trusted')) note.status = 'cleared';
		}
		const text = cleanText(r.text);
		if (text) note.text = text;
		if (note.guess || note.status || note.text) out[seat] = note;
	}
	return out;
}

/** Is there anything written in this note? */
export const hasNote = (n: SeatNote | undefined): n is SeatNote => !!n && !!(n.guess || n.status || n.text);

/** A note as one line: "suspected · Poisoner · "words"". */
export function describeNote(n: SeatNote): string {
	return [n.status ? STATUS_LABEL[n.status].toLowerCase() : '', n.guess ?? '', n.text ? `"${n.text}"` : ''].filter(Boolean).join(' · ');
}

/** What changed between two notebooks, one line per player written on: "Bram: suspected · Poisoner" (or "Bram: note rubbed out"). */
export function diffNotebook(prev: Notebook, next: Notebook, nameOf: (seat: SeatId) => string): string[] {
	const out: string[] = [];
	const seats = [...new Set([...Object.keys(prev), ...Object.keys(next)].map(Number))].sort((a, b) => a - b);
	for (const seat of seats) {
		const a = hasNote(prev[seat]) ? describeNote(prev[seat]) : '';
		const b = hasNote(next[seat]) ? describeNote(next[seat]) : '';
		if (a === b) continue;
		out.push(`${nameOf(seat)}: ${b || 'note rubbed out'}`);
	}
	return out;
}

// ---- what the Storyteller's phone keeps ------------------------------------------------------

/** One thing worth reading in the Chronicle: a change to a notebook, or a request for a chat. */
export interface NotebookEntry {
	/** The game's event count when it happened, so it sits in the Chronicle where it was written. */
	at: number;
	/** "Night 2", "Day 1": when, in the game's own words. */
	when: string;
	/** Order within this player's own entries. */
	seq: number;
	kind: 'notes' | 'chat';
	line: string;
}

/** One player's notebook as the Storyteller's phone holds it. */
export interface StoredNotebook {
	/** As it stands now. */
	now: Notebook;
	history: NotebookEntry[];
}

export const MAX_HISTORY = 300;

const sameBook = (a: Notebook, b: Notebook) => JSON.stringify(a) === JSON.stringify(b);

/** A player's notebook arrived: keep it as it now stands, and add a line per change to the history (nothing if nothing changed). */
export function recordNotebook(stored: StoredNotebook | undefined, next: Notebook, ctx: { at: number; when: string; nameOf: (seat: SeatId) => string }): StoredNotebook {
	const prev = stored ?? { now: {}, history: [] };
	if (sameBook(prev.now, next)) return prev;
	let seq = prev.history.reduce((m, e) => Math.max(m, e.seq), 0);
	const added = diffNotebook(prev.now, next, ctx.nameOf).map((line): NotebookEntry => ({ at: ctx.at, when: ctx.when, seq: ++seq, kind: 'notes', line }));
	return { now: next, history: [...prev.history, ...added].slice(-MAX_HISTORY) };
}

/** A player asked the Storyteller for a chat (about someone, perhaps): noted in the history. */
export function recordChat(stored: StoredNotebook | undefined, about: SeatId | null, ctx: { at: number; when: string; nameOf: (seat: SeatId) => string; valid: boolean }): StoredNotebook {
	const prev = stored ?? { now: {}, history: [] };
	const seq = prev.history.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
	const line = about !== null && ctx.valid ? `asks for a chat, about ${ctx.nameOf(about)}` : 'asks for a chat';
	return { now: prev.now, history: [...prev.history, { at: ctx.at, when: ctx.when, seq, kind: 'chat' as const, line }].slice(-MAX_HISTORY) };
}

/**
 * The entries from every player's notebook, grouped by the event they follow
 * (an entry whose time has gone, because of Undo, joins the end), each as the
 * Chronicle prints it: "Ada's notebook, Night 2. Bram: suspected".
 */
export function chronicleLines(books: Record<number, StoredNotebook> | undefined, eventCount: number, nameOf: (seat: SeatId) => string): Map<number, string[]> {
	const all: { at: number; who: number; seq: number; text: string }[] = [];
	for (const [k, b] of Object.entries(books ?? {})) {
		const who = Number(k);
		for (const e of b.history) {
			const text = e.kind === 'chat' ? `${nameOf(who)} ${e.line} (${e.when})` : `${nameOf(who)}'s notebook (${e.when}). ${e.line}`;
			all.push({ at: Math.min(e.at, eventCount), who, seq: e.seq, text });
		}
	}
	all.sort((a, b) => a.at - b.at || a.who - b.who || a.seq - b.seq);
	const out = new Map<number, string[]>();
	for (const e of all) out.set(e.at, [...(out.get(e.at) ?? []), e.text]);
	return out;
}

/** Every player's notebook as it stands now, for the Storyteller to read: player, then a line per player they wrote on. */
export function notebooksNow(books: Record<number, StoredNotebook> | undefined, nameOf: (seat: SeatId) => string): { who: string; lines: string[] }[] {
	const out: { who: string; lines: string[] }[] = [];
	for (const [k, b] of Object.entries(books ?? {})) {
		const lines = Object.entries(b.now).filter(([, n]) => hasNote(n)).map(([seat, n]) => `${nameOf(Number(seat))}: ${describeNote(n)}`);
		if (lines.length) out.push({ who: nameOf(Number(k)), lines });
	}
	return out;
}
