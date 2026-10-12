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
import type { Effect, GameState, SeatId } from './types.ts';
import { charDef, evilLearnEachOther, getScript } from './script.ts';
import { firstNightOrder, otherNightOrder } from './scripts/night-order.ts';

export type StepKind = string; // a character id, or one of the specials below

/**
 * First night: a player who would not otherwise wake is woken just to see
 * their character. Everyone who does wake sees it as part of their own turn.
 * These extra wakes come at the END of the night, after the Spy, so the real
 * night order is untouched: the Poisoner is still the first to act.
 */
export const REVEAL = 'reveal';
/** After every first-night ability (the Spy is 27). */
const REVEAL_ORDER = 999;
/** The official sheet's places for the evil team's first-night info, and for a new Demon being told. */
const MINION_INFO_ORDER = firstNightOrder('minion-info')!;
const DEMON_INFO_ORDER = firstNightOrder('demon-info')!;
/** Made by day (the Scarlet Woman's place on the sheet): told before the Demon wakes. Made tonight: just after the last Demon on the sheet (the Imp's starpass, the Fang Gu's jump, the Snake Charmer). */
const NEW_DEMON_BY_DAY = otherNightOrder('scarlet-woman')!;
const NEW_DEMON_TONIGHT = otherNightOrder('kazali')! + 0.5;
export const MINION_INFO = 'minion-info';
export const DEMON_INFO = 'demon-info';
export const NEW_DEMON = 'new-demon';
/** The Godfather's first night: learning the Outsiders in play. */
export const GODFATHER_INFO = 'godfather-info';
/** A Demon the Exorcist chose, told who the Exorcist is (they then do not act tonight). */
export const EXORCISED = 'exorcised';
/** The Lunatic's first night: shown pretend Minions and bluffs, as if they were the Demon. */
export const LUNATIC_INFO = 'lunatic-info';
/** The Lunatic each other night: chooses as the Demon they think they are (to no effect). */
export const LUNATIC = 'lunatic';
/** An evil Traveller, woken to learn the Demon. */
export const TRAVELLER_INFO = 'traveller-info';

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
		case 'sailor':
		case 'exorcist':
		case 'innkeeper':
		case 'gambler':
		case 'courtier':
		case 'professor':
		case 'devils-advocate':
		case 'assassin':
		case 'godfather':
		case 'zombuul':
		case 'pukka':
		case 'shabaloth':
		case 'po':
		case 'gossip':
		case LUNATIC:
		case 'snake-charmer':
		case 'witch':
		case 'cerenovus':
		case 'pit-hag':
		case 'philosopher':
		case 'barber':
		case 'sweetheart':
		case 'fang-gu':
		case 'vigormortis':
		case 'no-dashii':
		case 'vortox':
		case 'bureaucrat':
		case 'thief':
		case 'barista':
		case 'harlot':
		case 'bone-collector':
		case 'apprentice':
			return 'choose';
		case 'clockmaker':
		case 'dreamer':
		case 'mathematician':
		case 'flowergirl':
		case 'town-crier':
		case 'oracle':
		case 'seamstress':
		case 'juggler':
		case 'sage':
			return 'tell';
		case 'grandmother':
		case 'chambermaid':
		case GODFATHER_INFO:
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
		if (steps.some((x) => x.id === id)) return;
		const done = night.done.includes(id);
		if (done || applies) steps.push({ id, kind, seat, order, done });
	};

	// Night one: every player is woken exactly once.
	//  - Someone with a first-night ability learns everything in that one wake
	//    (a Poisoner or Spy also learns their Demon and fellow Minions there).
	//  - A Minion with no first-night ability wakes at the Minion-info point,
	//    and the Demon at the Demon-info point, to learn the evil team.
	//  - Anyone else is woken at the end, just to see their character.
	// The Toymaker: the evil team always learns each other.
	const evilInfo = n === 1 && (evilLearnEachOther(state.seats.length) || !!state.fabled?.some((f) => f.id === 'toymaker'));
	const has = (kind: Effect['kind'], seat: SeatId) => state.effects.some((e) => e.kind === kind && e.target === seat);
	const spent = (seat: SeatId, ability: string) => state.spent.includes(`${seat}:${ability}`);
	if (n === 1) {
		for (const s of state.seats) {
			if (!s.believes) continue;
			// Changed tonight (the Philosopher, the Snake Charmer's swap): if they have not woken yet, they see their new character at the end.
			if ((night.changed ?? []).some((c) => c.seat === s.id) || (night.made ?? []).some((m) => m.seat === s.id)) {
				const woke = night.done.some((d) => d.endsWith(`:${s.id}`) && !d.startsWith(REVEAL));
				if (!woke) add(REVEAL, s.id, REVEAL_ORDER, true);
				continue;
			}
			// The Lunatic is woken as a Demon would be, with pretend Minions and bluffs (never the real ones).
			if (s.character === 'lunatic') { add(LUNATIC_INFO, s.id, firstNightOrder('lunatic')!, true); continue; }
			const team = charDef(script, s.believes).team;
			const wakes = charDef(script, s.believes).firstNight !== null;
			if (wakes) continue;
			if (evilInfo && team === 'minion') add(MINION_INFO, s.id, MINION_INFO_ORDER, true);
			else if (evilInfo && team === 'demon') add(DEMON_INFO, s.id, DEMON_INFO_ORDER, true);
			else add(REVEAL, s.id, REVEAL_ORDER, true);
		}
	}

	// Made by day (Scarlet Woman): told before the Demon wakes, so they can kill.
	// Made tonight (a starpass, the Snake Charmer, the Fang Gu, the Pit-Hag): told just after the step that made them.
	const made = night.made ?? [];
	const madeAt = (seat: SeatId) => made.filter((m) => m.seat === seat).map((m) => m.at + 0.01)[0];
	if (state.newDemon && state.newDemon.during === 'day') add(NEW_DEMON, state.newDemon.seat, NEW_DEMON_BY_DAY, state.seats[state.newDemon.seat].alive);
	for (const m of made) add(NEW_DEMON, m.seat, m.at + 0.01, state.seats[m.seat].alive);
	for (const id of night.done.filter((d) => d.startsWith(NEW_DEMON + ':'))) {
		const seat = Number(id.split(':')[1]);
		if (madeAt(seat) === undefined && state.newDemon?.seat !== seat) add(NEW_DEMON, seat, NEW_DEMON_BY_DAY, false);
	}

	for (const s of state.seats) {
		if (!s.believes) continue;
		const def = charDef(script, s.believes);
		// The Lunatic wakes at the Lunatic's place, as the Demon they think they are (each night it would act).
		if (s.character === 'lunatic') {
			const at = otherNightOrder('lunatic')!, revivedAt = (otherNightOrder('professor') ?? 0) + 0.25;
			if (n > 1 && def.otherNight !== null) add(LUNATIC, s.id, night.revived.includes(s.id) && at < revivedAt ? revivedAt : at, s.alive);
			continue;
		}
		// A Traveller's "first night" is the first night after they joined (the Apprentice).
		const firstForThem = n === 1 || (s.traveller && !state.spent.includes(`${s.id}:first-night`) && def.otherNight === null && def.firstNight !== null);
		let order = firstForThem ? def.firstNight : def.otherNight;
		if (firstForThem && n > 1 && order !== null) order = otherNightOrder('philosopher') ?? order;
		if (order === null) continue;
		// Back from the dead tonight after their place has passed: they act just after the Professor.
		const revivedAt = (otherNightOrder('professor') ?? 0) + 0.25;
		if (night.revived.includes(s.id) && order < revivedAt) order = revivedAt;
		const alive = s.alive || !!s.undead;
		// A character the Pit-Hag, Snake Charmer, Barber or Philosopher gave them tonight acts only if its place is still to come.
		const changedAt = (night.changed ?? []).filter((c) => c.seat === s.id).map((c) => c.at);
		if (changedAt.length && order <= Math.max(...changedAt) && !night.done.includes(`${def.id}:${s.id}`)) continue;
		// A Minion the Vigormortis killed keeps their ability, and wakes (from the next night).
		let applies = s.alive || (state.effects.some((e) => e.kind === 'keeps-ability' && e.target === s.id) && !night.deaths.includes(s.id));
		// A dead player's regained ability (the Bone Collector) acts tonight only if its place is still to come.
		if (!s.alive && applies && order < (night.reached ?? -Infinity) && !night.done.includes(`${def.id}:${s.id}`)) continue;
		switch (def.id) {
			case 'ravenkeeper': applies = night.deaths.includes(s.id); break;
			case 'undertaker': applies = applies && state.lastExecution?.day === n - 1; break;
			case 'imp': applies = s.alive && !made.some((m) => m.seat === s.id) && !has('exorcised', s.id); break;
			// Demons: not tonight if the Exorcist chose them. The Zombuul wakes only if no one died today, even while it seems dead.
			case 'zombuul': applies = alive && night.dayDeaths.length === 0 && !has('exorcised', s.id); break;
			case 'pukka':
			case 'shabaloth':
			case 'po':
			case 'fang-gu':
			case 'vigormortis':
			case 'no-dashii':
			// A dead Demon does not wake to kill, even with an ability regained (the Bone Collector).
			case 'vortox': applies = s.alive && !made.some((m) => m.seat === s.id) && !has('exorcised', s.id); break;
			case 'courtier':
			case 'professor':
			case 'assassin':
			case 'seamstress':
			case 'philosopher': applies = applies && !spent(s.id, def.id); break;
			case 'juggler': applies = applies && !spent(s.id, 'juggler') && state.effects.some((e) => e.kind === 'juggled' && e.by === s.id); break;
			// Killed by the Demon tonight: the Sage wakes, though dead.
			case 'sage': applies = (night.demonKills ?? []).includes(s.id); break;
			// The Storyteller acts for a dead Sweetheart; the Demon wakes for a dead Barber.
			case 'sweetheart': applies = !s.alive && !spent(s.id, 'sweetheart'); break;
			case 'barber': applies = !s.alive && !spent(s.id, 'barber') && (night.dayDeaths.includes(s.id) || night.deaths.includes(s.id)); break;
			case 'witch': applies = applies && state.seats.filter((x) => x.alive).length > 3; break;
			case 'bone-collector': applies = applies && !spent(s.id, def.id); break;
			case 'godfather':
				if (n === 1) { add(GODFATHER_INFO, s.id, order, s.alive); continue; }
				applies = applies && night.dayDeaths.some((d) => charDef(script, state.seats[d].character).team === 'outsider');
				break;
			// Not woken: the Storyteller acts on their behalf at their place in the night.
			case 'gossip': applies = applies && night.gossip.some((g) => g.by === s.id); break;
			case 'moonchild': applies = state.effects.some((e) => e.kind === 'moonchild' && e.by === s.id); break;
		}
		add(def.id, s.id, order, applies);
	}

	// An evil Traveller learns who the Demon is, at the start of their first night.
	for (const s of state.seats) {
		if (s.traveller && s.alignment === 'evil' && s.alive) add(TRAVELLER_INFO, s.id, 0.5, !state.spent.includes(`${s.id}:traveller-info`));
	}
	// A Demon the Exorcist chose is told so, just after the Exorcist.
	for (const e of state.effects) {
		if (e.kind !== 'exorcised' || e.by === null) continue;
		// Just after the Exorcist, wherever they woke (a revived Exorcist wakes after the Professor).
		const revivedAt = (otherNightOrder('professor') ?? 0) + 0.25;
		const at = otherNightOrder('exorcist')!;
		add(EXORCISED, e.target, (night.revived.includes(e.by) && at < revivedAt ? revivedAt : at) + 0.1, true);
	}
	// Back from the dead tonight with a first-night ability: it acts again, at once.
	for (const id of night.revived) {
		const def = charDef(script, state.seats[id].believes);
		if (def.firstNight !== null && def.otherNight === null && state.seats[id].alive) add(def.id, id, (otherNightOrder('professor') ?? 0) + 0.25, true);
	}

	// Woken by a death (the Sage, the Sweetheart, the Barber): a death after their place is dealt with straight away.
	const progress = Math.max(night.reached ?? -Infinity, ...steps.filter((x) => x.done).map((x) => x.order));
	for (const st of steps) if (!st.done && DEATH_TRIGGERED.has(st.kind) && st.order < progress) st.order = progress + 0.001;
	return steps.sort((a, b) => a.order - b.order || (a.seat ?? -1) - (b.seat ?? -1));
}

/** Steps dealt with as soon as they arise (a death; a Traveller joining at night). */
const DEATH_TRIGGERED = new Set(['sage', 'sweetheart', 'barber', TRAVELLER_INFO, 'apprentice']);

export function nextStep(state: GameState): NightStep | null {
	return nightSteps(state).find((s) => !s.done) ?? null;
}
