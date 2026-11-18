/**
 * recallflow.ts - the screens of "Remind me" (single phone), apart from the page, so they can be tested.
 *
 * The phone goes round in four turns, and no turn shows a page before the one before it was answered:
 *   0  the Storyteller is asked "Hand to <name>?" (the seat is named, nothing of theirs is shown)
 *   1  the page naming who takes the phone: "I am holding the phone" (or "Not now")
 *   2  the player's pages: the index, and any page as it was shown, with one way back to the same index
 *   3  the plain page that hands the phone back, which shows nothing of any seat
 * It reads only the kept history of the one seat it was started for, and it has no way to touch the game
 * (it is given no commands), the saved log, the undo marks or a phone: it draws, and it says when it is done.
 */
import type { SeatId } from '../core/index.ts';
import { recallIndex, wakeOf } from '../net/history.ts';
import type { History } from '../net/history.ts';
import type { Row } from './ascii.ts';
import { handBackRows, handConfirmRows, handOverRows, recallIndexRows, wakeRows } from './wakepages.ts';

export interface Recall {
	/** Whom the phone goes to. Fixed when it is started: nothing on any page changes it. */
	readonly seat: SeatId;
	turn: 0 | 1 | 2 | 3;
	/** The page open (its key), or null for the index. */
	open: string | null;
}

export const startRecall = (seat: SeatId): Recall => ({ seat, turn: 0, open: null });

export interface RecallDeps {
	history: History;
	name(id: SeatId): string;
	render(): void;
	/** All done, or not wanted: take the screen away. */
	close(): void;
}

export function recallRows(r: Recall, d: RecallDeps): Row[] {
	const to = (turn: Recall['turn']) => () => { r.turn = turn; r.open = null; d.render(); };
	if (r.turn === 0) return handConfirmRows(d.name(r.seat), to(1), d.close);
	if (r.turn === 1) return handOverRows(d.name(r.seat), to(2), { line: 'Everyone else, look away.', cancel: d.close });
	if (r.turn === 3) return handBackRows(d.close);
	const items = recallIndex(d.history, r.seat);
	const item = r.open === null ? undefined : items.find((i) => i.key === r.open);
	if (!item) {
		return recallIndexRows(d.name(r.seat), items[0]?.entry.role, items.map((i) => ({ label: i.label, night: i.night, open: () => { r.open = i.key; d.render(); } })), to(3));
	}
	const e = item.entry;
	const options = new Map((e.choice?.options ?? []).map((o) => [o.id, o]));
	// Every way off a recalled page goes to this seat's index and nowhere else.
	const index = () => { r.open = null; d.render(); };
	return wakeRows(wakeOf(e, r.seat), e.page, e.choice?.chosen ?? [], {
		go: index, toggle() {}, confirm: index, finish: index, ending: 'hand-back', recall: index,
		name: (id) => options.get(id)?.name ?? d.name(id),
		deadAtDusk: (id) => options.get(id)?.dead ?? false
	});
}
