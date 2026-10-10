/**
 * night.ts - the wake order.
 *
 * The queue is never stored. It is worked out from the state each time it
 * is asked for, so it always reflects what has happened so far tonight: an
 * Empath the Imp killed drops out, a Ravenkeeper the Imp killed drops in.
 * Steps already resolved stay listed as done.
 *
 * Players wake as the character they BELIEVE they are, so the Drunk wakes as
 * their pretend Townsfolk and the Storyteller plays along.
 */
import type { GameState, SeatId } from './types.ts';
import { charDef, evilLearnEachOther, getScript } from './script.ts';

export type StepKind = string; // a character id, or one of the specials below

/**
 * First night: a player who would not otherwise wake is woken just to see
 * their character. Everyone who does wake sees it as part of their own turn.
 * These extra wakes come at the END of the night, after the Spy, so the real
 * night order is untouched: the Poisoner is still the first to act.
 */
export const REVEAL = 'reveal';
/** After every first-night ability (the Spy is 27). */
const REVEAL_ORDER = 90;
export const MINION_INFO = 'minion-info';
export const DEMON_INFO = 'demon-info';
export const NEW_DEMON = 'new-demon';

export interface NightStep {
	id: string;
	kind: StepKind;
	seat: SeatId | null;
	order: number;
	done: boolean;
}

/** What sort of command resolves a step. */
export type StepAction = 'acknowledge' | 'choose' | 'tell';

export function stepAction(kind: StepKind): StepAction {
	switch (kind) {
		case 'poisoner':
		case 'monk':
		case 'butler':
		case 'imp':
			return 'choose';
		case 'washerwoman':
		case 'librarian':
		case 'investigator':
		case 'chef':
		case 'empath':
		case 'fortune-teller':
		case 'undertaker':
		case 'ravenkeeper':
			return 'tell';
		default:
			return 'acknowledge';
	}
}

export function nightSteps(state: GameState): NightStep[] {
	const night = state.night;
	if (!night) return [];
	const script = getScript(state.scriptId);
	const n = night.n;
	const steps: NightStep[] = [];
	const add = (kind: StepKind, seat: SeatId | null, order: number, applies: boolean) => {
		const id = seat === null ? kind : `${kind}:${seat}`;
		const done = night.done.includes(id);
		if (done || applies) steps.push({ id, kind, seat, order, done });
	};

	// Night one: every player is woken exactly once.
	//  - Someone with a first-night ability learns everything in that one wake
	//    (a Poisoner or Spy also learns their Demon and fellow Minions there).
	//  - A Minion with no first-night ability wakes at the Minion-info point,
	//    and the Demon at the Demon-info point, to learn the evil team.
	//  - Anyone else is woken at the end, just to see their character.
	const evilInfo = n === 1 && evilLearnEachOther(state.seats.length);
	if (n === 1) {
		for (const s of state.seats) {
			if (!s.believes) continue;
			const team = charDef(script, s.believes).team;
			const wakes = charDef(script, s.believes).firstNight !== null;
			if (wakes) continue;
			if (evilInfo && team === 'minion') add(MINION_INFO, s.id, 1, true);
			else if (evilInfo && team === 'demon') add(DEMON_INFO, s.id, 2, true);
			else add(REVEAL, s.id, REVEAL_ORDER, true);
		}
	}

	if (state.newDemon) {
		// Made by day (Scarlet Woman): told before the Demon wakes, so they can kill.
		// Made tonight (starpass): told just after the old Demon's turn.
		add(NEW_DEMON, state.newDemon.seat, state.newDemon.during === 'day' ? 15 : 21, true);
	} else {
		for (const id of night.done.filter((d) => d.startsWith(NEW_DEMON + ':'))) {
			const seat = Number(id.split(':')[1]);
			add(NEW_DEMON, seat, night.demonMadeTonight === seat ? 21 : 15, false);
		}
	}

	for (const s of state.seats) {
		if (!s.believes) continue;
		const def = charDef(script, s.believes);
		const order = n === 1 ? def.firstNight : def.otherNight;
		if (order === null) continue;
		let applies = s.alive;
		if (def.id === 'ravenkeeper') applies = night.deaths.includes(s.id);
		if (def.id === 'undertaker') applies = s.alive && state.lastExecution?.day === n - 1;
		if (def.id === 'imp') applies = s.alive && night.demonMadeTonight !== s.id;
		add(def.id, s.id, order, applies);
	}

	return steps.sort((a, b) => a.order - b.order || (a.seat ?? -1) - (b.seat ?? -1));
}

export function nextStep(state: GameState): NightStep | null {
	return nightSteps(state).find((s) => !s.done) ?? null;
}
