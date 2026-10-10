/**
 * rules.ts - questions the rules ask about the current state.
 *
 * Nothing here changes state. These are the building blocks engine.ts uses to
 * judge commands, and the UI uses to show the Storyteller what is legal.
 *
 * ---- "droisoned" ----
 * Drunk or poisoned. A droisoned player's ability does nothing, and any
 * information they get may be false. The Drunk is always droisoned: they have
 * no ability at all, only the one they believe they have.
 *
 * ---- registration ----
 * The Spy and the Recluse "might register" as something they are not. Rather
 * than asking the Storyteller to pre-decide, every check asks: what COULD
 * this seat register as? A piece of information is truthful if some
 * combination of allowed registrations makes it true. That leaves every
 * legitimate Storyteller choice open, and rules out everything else.
 */
import type { Alignment, CharacterId, GameState, Info, Seat, SeatId } from './types.ts';
import { charDef, charactersOfTeam, getScript } from './script.ts';

export function seat(state: GameState, id: SeatId): Seat {
	const s = state.seats[id];
	if (!s) throw new Error(`There is no seat ${id}`);
	return s;
}

export function isPoisoned(state: GameState, id: SeatId): boolean {
	return state.poison?.target === id;
}

export function isDroisoned(state: GameState, id: SeatId): boolean {
	return seat(state, id).character === 'drunk' || isPoisoned(state, id);
}

/** The seat really is `character`, and that ability is working right now. */
export function hasWorkingAbility(state: GameState, id: SeatId, character: CharacterId): boolean {
	const s = seat(state, id);
	return s.alive && s.character === character && !isDroisoned(state, id);
}

export function teamOf(state: GameState, character: CharacterId) {
	return charDef(getScript(state.scriptId), character).team;
}

export function living(state: GameState): Seat[] {
	return state.seats.filter((s) => s.alive);
}

export function livingDemons(state: GameState): Seat[] {
	return state.seats.filter((s) => s.alive && teamOf(state, s.character) === 'demon');
}

export interface Registration {
	characters: CharacterId[];
	alignments: Alignment[];
}

/**
 * Everything this seat may register as to someone else's ability.
 * Assumption (see docs): Spy and Recluse keep registering while dead, but not
 * while droisoned.
 */
export function registrations(state: GameState, id: SeatId): Registration {
	const s = seat(state, id);
	const script = getScript(state.scriptId);
	const characters = [s.character];
	const alignments: Alignment[] = [s.alignment];
	const working = !isDroisoned(state, id);
	if (working && s.character === 'spy') {
		alignments.push('good');
		for (const c of [...charactersOfTeam(script, 'townsfolk'), ...charactersOfTeam(script, 'outsider')]) {
			characters.push(c.id);
		}
	}
	if (working && s.character === 'recluse') {
		alignments.push('evil');
		for (const c of [...charactersOfTeam(script, 'minion'), ...charactersOfTeam(script, 'demon')]) {
			characters.push(c.id);
		}
	}
	return { characters, alignments };
}

export function canRegisterAs(state: GameState, id: SeatId, character: CharacterId): boolean {
	return registrations(state, id).characters.includes(character);
}

export function canRegisterAsTeam(state: GameState, id: SeatId, team: string): boolean {
	return registrations(state, id).characters.some((c) => teamOf(state, c) === team);
}

export function mustRegisterAsTeam(state: GameState, id: SeatId, team: string): boolean {
	return registrations(state, id).characters.every((c) => teamOf(state, c) === team);
}

/** The players in circle order, starting just clockwise of `id` (excluding them). */
export function clockwiseFrom(state: GameState, id: SeatId): SeatId[] {
	const o = state.order;
	const at = o.indexOf(id);
	return Array.from({ length: o.length - 1 }, (_, k) => o[(at + 1 + k) % o.length]);
}

/** Nearest living player each way round the circle, skipping the dead. */
export function livingNeighbours(state: GameState, id: SeatId): SeatId[] {
	const o = state.order;
	const n = o.length;
	const at = o.indexOf(id);
	const found: SeatId[] = [];
	for (const dir of [-1, 1]) {
		for (let k = 1; k < n; k++) {
			const other = o[(((at + dir * k) % n) + n) % n];
			if (state.seats[other].alive) {
				if (!found.includes(other)) found.push(other);
				break;
			}
		}
	}
	return found.filter((x) => x !== id);
}

/**
 * Every value `count` can take over all allowed alignment registrations of
 * the given seats. Only Spy and Recluse are ambiguous, so this stays tiny.
 */
function possibleCounts(
	state: GameState,
	seats: SeatId[],
	count: (align: (id: SeatId) => Alignment) => number
): number[] {
	const options = seats.map((id) => registrations(state, id).alignments);
	const results = new Set<number>();
	const pick: Alignment[] = [];
	const walk = (i: number) => {
		if (i === seats.length) {
			results.add(count((id) => pick[seats.indexOf(id)]));
			return;
		}
		for (const a of new Set(options[i])) {
			pick[i] = a;
			walk(i + 1);
		}
	};
	walk(0);
	return [...results].sort((a, b) => a - b);
}

export function chefNumbers(state: GameState): number[] {
	const o = state.order;
	const n = o.length;
	return possibleCounts(state, [...o], (align) => {
		let pairs = 0;
		for (let i = 0; i < n; i++) if (align(o[i]) === 'evil' && align(o[(i + 1) % n]) === 'evil') pairs++;
		return pairs;
	});
}

export function empathNumbers(state: GameState, empath: SeatId): number[] {
	const nbrs = livingNeighbours(state, empath);
	return possibleCounts(state, nbrs, (align) => nbrs.filter((x) => align(x) === 'evil').length);
}

/** The Fortune Teller's possible truthful answers for two chosen players. */
export function fortuneAnswers(state: GameState, players: SeatId[]): boolean[] {
	const yesPossible = players.some((p) => canRegisterAsTeam(state, p, 'demon') || state.redHerring === p);
	const yesForced = players.some((p) => mustRegisterAsTeam(state, p, 'demon') || state.redHerring === p);
	const out: boolean[] = [];
	if (yesPossible) out.push(true);
	if (!yesForced) out.push(false);
	return out;
}

/** Can "no Outsiders are in play" be true, with everyone registering some way? */
export function librarianNoneIsTrue(state: GameState): boolean {
	return state.seats.every((s) => !mustRegisterAsTeam(state, s.id, 'outsider'));
}

/** Which team a pair-showing role is about. */
export const PAIR_ROLE_TEAM: Record<string, 'townsfolk' | 'outsider' | 'minion'> = {
	washerwoman: 'townsfolk',
	librarian: 'outsider',
	investigator: 'minion'
};

export interface InfoVerdict {
	/** Shaped correctly for this role (right kind, real seats, right team). Always enforced. */
	wellFormed: boolean;
	/** Would be true information for a sober, healthy player. */
	truthful: boolean;
	reason: string;
}

/**
 * Judge a piece of information for `role`, given to seat `to`.
 * `role` is the ability being used (for the Drunk, the one they believe in).
 */
export function judgeInfo(state: GameState, to: SeatId, role: CharacterId, info: Info): InfoVerdict {
	const bad = (reason: string): InfoVerdict => ({ wellFormed: false, truthful: false, reason });
	const verdict = (truthful: boolean, why: string): InfoVerdict => ({
		wellFormed: true,
		truthful,
		reason: truthful ? 'true' : why
	});
	const validSeat = (id: SeatId) => Number.isInteger(id) && id >= 0 && id < state.seats.length;
	const script = getScript(state.scriptId);
	const name = (id: SeatId) => state.seats[id].name;

	switch (role) {
		case 'washerwoman':
		case 'librarian':
		case 'investigator': {
			const team = PAIR_ROLE_TEAM[role];
			if (info.kind === 'none') {
				if (role !== 'librarian') return bad('Only the Librarian can be told there are none in play.');
				return verdict(librarianNoneIsTrue(state), 'There is an Outsider in play.');
			}
			if (info.kind !== 'pair') return bad(`The ${role} is shown two players and a character.`);
			const [a, b] = info.players;
			if (!validSeat(a) || !validSeat(b) || a === b) return bad('Choose two different players.');
			if (a === to || b === to) return bad('Do not show the player themselves.');
			const def = script.characters.find((c) => c.id === info.character);
			if (!def || def.team !== team) return bad(`The character shown must be a ${team}.`);
			const ok = canRegisterAs(state, a, info.character) || canRegisterAs(state, b, info.character);
			return verdict(ok, `Neither ${name(a)} nor ${name(b)} can register as the ${def.name}.`);
		}
		case 'chef': {
			if (info.kind !== 'number') return bad('The Chef learns a number.');
			const ok = chefNumbers(state).includes(info.value);
			return verdict(ok, `The true count is ${chefNumbers(state).join(' or ')}.`);
		}
		case 'empath': {
			if (info.kind !== 'number' || info.value < 0 || info.value > 2) return bad('The Empath learns 0, 1 or 2.');
			const nums = empathNumbers(state, to);
			return verdict(nums.includes(info.value), `The true count is ${nums.join(' or ')}.`);
		}
		case 'fortune-teller': {
			if (info.kind !== 'fortune') return bad('The Fortune Teller chooses two players and learns yes or no.');
			const [a, b] = info.players;
			if (!validSeat(a) || !validSeat(b) || a === b) return bad('The Fortune Teller chooses two different players.');
			const answers = fortuneAnswers(state, info.players);
			return verdict(answers.includes(info.yes), `The true answer is ${answers.map((x) => (x ? 'yes' : 'no')).join(' or ')}.`);
		}
		case 'undertaker': {
			if (info.kind !== 'character') return bad('The Undertaker learns a character.');
			const ex = state.lastExecution;
			if (!ex) return bad('Nobody has died by execution.');
			const ok = canRegisterAs(state, ex.seat, info.character);
			return verdict(ok, `${name(ex.seat)} cannot register as that character.`);
		}
		case 'ravenkeeper': {
			if (info.kind !== 'reveal' || !validSeat(info.player)) return bad('The Ravenkeeper chooses a player and learns their character.');
			const ok = canRegisterAs(state, info.player, info.character);
			return verdict(ok, `${name(info.player)} cannot register as that character.`);
		}
		default:
			return bad(`The ${role} is not given information.`);
	}
}

/**
 * The order hands are counted in: clockwise from the player after the
 * nominee, the nominee last. Every seat is listed, dead or alive; whether
 * each may vote is for the caller (see canVote).
 */
export function voteOrder(state: GameState, nominee: SeatId): SeatId[] {
	return [...clockwiseFrom(state, nominee), nominee];
}

export function canVote(state: GameState, id: SeatId): boolean {
	const s = seat(state, id);
	return s.alive || s.ghostVote;
}

/** Characters this seat can truthfully be shown as (Undertaker, Ravenkeeper). */
export function truthfulCharacters(state: GameState, id: SeatId): CharacterId[] {
	return [...new Set(registrations(state, id).characters)];
}
