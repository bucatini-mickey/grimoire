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
import type { Alignment, CharacterId, Effect, GameState, Info, Seat, SeatId } from './types.ts';
import { charDef, charactersOfTeam, getScript, teamAlignment } from './script.ts';

export function seat(state: GameState, id: SeatId): Seat {
	const s = state.seats[id];
	if (!s) throw new Error(`There is no seat ${id}`);
	return s;
}

/**
 * Is a lasting effect in force? Some last only while their source keeps their
 * ability (the Courtier's drunkenness, the Pukka's poison): the source must be
 * alive, sober and healthy. Two players can disable each other, so the check
 * stops after a few steps rather than going round for ever.
 */
export function inForce(state: GameState, e: Effect, depth = 0): boolean {
	if (!e.whileSourceWorks || e.by === null) return true;
	const src = state.seats[e.by];
	// The source keeps their ability while alive (the undead Zombuul too), or dead with the Vigormortis's gift.
	if (!src || !(src.alive || src.undead || state.effects.some((x) => x.kind === 'keeps-ability' && x.target === e.by))) return false;
	if (depth >= 4) return true;
	return !droisonedAt(state, e.by, depth + 1);
}

function poisonedAt(state: GameState, id: SeatId, depth: number): boolean {
	return state.effects.some((e) => e.kind === 'poisoned' && e.target === id && inForce(state, e, depth)) || noDashiiPoisons(state, id, depth);
}

const isTownsfolk = (state: GameState, id: SeatId) => getScript(state.scriptId).characters.find((c) => c.id === state.seats[id].character)?.team === 'townsfolk';

/** The nearest Townsfolk each way round the circle from a seat, dead or alive. */
export function nearestTownsfolk(state: GameState, from: SeatId): SeatId[] {
	const o = state.order, n = o.length, at = o.indexOf(from);
	const out: SeatId[] = [];
	for (const dir of [1, -1]) {
		for (let k = 1; k < n; k++) {
			const id = o[(at + dir * k + n * 2) % n];
			if (isTownsfolk(state, id)) { if (!out.includes(id)) out.push(id); break; }
		}
	}
	return out;
}

/** The No Dashii poisons its nearest Townsfolk each way, worked out afresh as things change. */
function noDashiiPoisons(state: GameState, id: SeatId, depth: number): boolean {
	if (depth >= 4 || !isTownsfolk(state, id)) return false;
	return state.seats.some((x) => x.character === 'no-dashii' && (x.alive || x.undead) && !droisonedAt(state, x.id, depth + 1) && nearestTownsfolk(state, x.id).includes(id));
}

/** A Minion the Vigormortis killed keeps their ability while dead. */
export function keepsAbility(state: GameState, id: SeatId): boolean {
	return state.effects.some((e) => e.kind === 'keeps-ability' && e.target === id);
}

function drunkAt(state: GameState, id: SeatId, depth: number): boolean {
	return seat(state, id).character === 'drunk' || state.effects.some((e) => e.kind === 'drunk' && e.target === id && inForce(state, e, depth));
}

function droisonedAt(state: GameState, id: SeatId, depth: number): boolean {
	// The Barista's choice is sober and healthy until dusk, whatever else.
	if (state.effects.some((e) => e.kind === 'sober' && e.target === id && inForce(state, e, depth))) return false;
	return drunkAt(state, id, depth) || poisonedAt(state, id, depth);
}

export function isPoisoned(state: GameState, id: SeatId): boolean {
	return !isSober(state, id) && poisonedAt(state, id, 0);
}

/** Made sober and healthy by the Barista. */
export function isSober(state: GameState, id: SeatId): boolean {
	return state.effects.some((e) => e.kind === 'sober' && e.target === id && inForce(state, e));
}

/** Living players who count for the evil win and the Mayor: not Travellers. */
export function livingResidents(state: GameState): Seat[] {
	return state.seats.filter((x) => (x.alive || x.undead) && !x.traveller);
}

/** Drunk: the Drunk always; anyone else while an effect makes them so. */
export function isDrunk(state: GameState, id: SeatId): boolean {
	return !isSober(state, id) && drunkAt(state, id, 0);
}

/** Alive, or the Zombuul living on after its first death (it counts as dead, but the game knows better). */
export function reallyAlive(state: GameState, id: SeatId): boolean {
	const s = seat(state, id);
	return s.alive || !!s.undead;
}

/** The character's ability works: really alive (or undead), this character, sober and healthy. */
export function abilityWorks(state: GameState, id: SeatId, character: CharacterId): boolean {
	return (reallyAlive(state, id) || keepsAbility(state, id)) && seat(state, id).character === character && !isDroisoned(state, id);
}

/** A working Vortox: Townsfolk must be told false things, and a day without an execution loses the game for good. */
export function vortoxWorks(state: GameState): boolean {
	return state.seats.some((x) => abilityWorks(state, x.id, 'vortox'));
}

/** Ability kinds a player wakes for that are not their own ability (the Chambermaid does not count these). */
export const NOT_ABILITY_WAKES = new Set(['reveal', 'minion-info', 'demon-info', 'new-demon', 'exorcised', 'gossip', 'moonchild', 'lunatic-info', 'traveller-info', 'sweetheart']);

/** Did this player wake tonight to use their own ability (drunk or not)? */
export function wokeTonight(state: GameState, id: SeatId): boolean {
	return (state.night?.done ?? []).some((step) => {
		const [kind, at] = step.split(':');
		return Number(at) === id && !NOT_ABILITY_WAKES.has(kind);
	});
}

/** The Tea Lady protects both her living neighbours while both are good. */
export function teaLadyProtects(state: GameState, id: SeatId): boolean {
	return state.seats.some((x) => {
		if (!abilityWorks(state, x.id, 'tea-lady')) return false;
		const nb = livingNeighbours(state, x.id);
		return nb.includes(id) && nb.length === 2 && nb.every((n) => state.seats[n].alignment === 'good');
	});
}

/** Whom the Butler must follow, if anyone. */
export function butlerMaster(state: GameState): SeatId | null {
	return state.effects.find((e) => e.kind === 'master' && e.role === 'butler')?.target ?? null;
}

/** Protected from the Demon tonight (the Monk). */
export function safeFromDemon(state: GameState, id: SeatId): boolean {
	return state.effects.some((e) => e.kind === 'safe-from-demon' && e.target === id);
}

/** The poisoned player and who poisoned them (the Storyteller's hand: by null), if any. */
export function poisonOn(state: GameState, id: SeatId): Effect | null {
	return state.effects.find((e) => e.kind === 'poisoned' && e.target === id) ?? null;
}

/** Short reminders for a seat, as the Storyteller's Grimoire shows them. */
export function reminders(state: GameState, id: SeatId): string[] {
	const out: string[] = [];
	for (const e of state.effects) {
		if (e.target !== id) continue;
		if (e.kind === 'safe-from-demon') out.push('safe');
		if (e.kind === 'master') out.push('master');
		if (e.kind === 'drunk' && inForce(state, e)) out.push('drunk');
		if (e.kind === 'poisoned' && e.role !== 'poisoner' && inForce(state, e)) out.push('poisoned');
		if (e.kind === 'safe-tonight') out.push('safe');
		if (e.kind === 'survives-execution') out.push('survives');
		if (e.kind === 'grandchild') out.push('grandchild');
		if (e.kind === 'exorcised') out.push('exorcised');
		if (e.kind === 'cursed') out.push('cursed');
		if (e.kind === 'mad') out.push(`mad: ${e.note}`);
		if (e.kind === 'twin') out.push('good twin');
		if (e.kind === 'keeps-ability') out.push('keeps ability');
		if (e.kind === 'vote-x3') out.push('votes x3');
		if (e.kind === 'vote-minus') out.push('votes -1');
		if (e.kind === 'sober') out.push('sober');
	}
	if (state.redHerring === id) out.push('red herring');
	if (state.spent.includes(`${id}:slayer`)) out.push('shot used');
	if (state.spent.includes(`${id}:virgin`)) out.push('Virgin spent');
	return [...new Set(out)];
}

export function isDroisoned(state: GameState, id: SeatId): boolean {
	return isDrunk(state, id) || isPoisoned(state, id);
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

/** Demons still in the game (a Zombuul that seems dead is one). */
export function livingDemons(state: GameState): Seat[] {
	return state.seats.filter((s) => (s.alive || s.undead) && teamOf(state, s.character) === 'demon');
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

/**
 * The Chef's possible numbers. A Spy or Recluse may register differently for
 * each pair they are part of (the rules' own example: a Recluse between the
 * Imp and the Poisoner can make the Chef learn 1), so each pair is counted on
 * its own: every number from the pairs that must be evil to those that might.
 */
export function chefNumbers(state: GameState): number[] {
	const o = state.order;
	const n = o.length;
	const may = (id: SeatId) => registrations(state, id).alignments.includes('evil');
	const must = (id: SeatId) => registrations(state, id).alignments.every((a) => a === 'evil');
	let lo = 0;
	let hi = 0;
	for (let i = 0; i < n; i++) {
		const a = o[i], b = o[(i + 1) % n];
		if (must(a) && must(b)) lo++;
		if (may(a) && may(b)) hi++;
	}
	return Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
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
		case 'grandmother': {
			if (info.kind !== 'reveal' || !validSeat(info.player)) return bad('The Grandmother learns a good player and their character.');
			if (info.player === to) return bad('The grandchild is someone else.');
			const def = script.characters.find((c) => c.id === info.character);
			if (!def || (def.team !== 'townsfolk' && def.team !== 'outsider')) return bad('The grandchild is a Townsfolk or Outsider.');
			const ok = canRegisterAs(state, info.player, info.character) && registrations(state, info.player).alignments.includes('good');
			return verdict(ok, `${name(info.player)} is not a good ${def.name}.`);
		}
		case 'clockmaker': {
			if (info.kind !== 'number') return bad('The Clockmaker learns a number.');
			const n = state.order.length;
			const dist = (a: SeatId, b: SeatId) => { const d = Math.abs(state.order.indexOf(a) - state.order.indexOf(b)); return Math.min(d, n - d); };
			const ok = new Set<number>();
			for (const d of state.seats.filter((x) => canRegisterAsTeam(state, x.id, 'demon'))) {
				const may = state.seats.filter((m) => m.id !== d.id && canRegisterAsTeam(state, m.id, 'minion')).map((m) => dist(d.id, m.id));
				const must = state.seats.filter((m) => m.id !== d.id && mustRegisterAsTeam(state, m.id, 'minion')).map((m) => dist(d.id, m.id));
				if (!may.length) continue;
				const hi = must.length ? Math.min(...must) : Math.max(...may);
				for (let v = Math.min(...may); v <= hi; v++) ok.add(v);
			}
			return verdict(ok.has(info.value), `The true count is ${[...ok].join(' or ')}.`);
		}
		case 'dreamer': {
			if (info.kind !== 'dream' || !validSeat(info.player)) return bad('The Dreamer chooses a player and learns two characters.');
			if (info.player === to) return bad('The Dreamer chooses another player.');
			const [a, b] = info.characters.map((c) => script.characters.find((d) => d.id === c));
			if (!a || !b || teamAlignment(a.team) === teamAlignment(b.team)) return bad('Show one good character and one evil character.');
			const ok = canRegisterAs(state, info.player, a.id) || canRegisterAs(state, info.player, b.id);
			return verdict(ok, `${name(info.player)} is neither.`);
		}
		case 'mathematician':
			if (info.kind !== 'number' || info.value < 0 || info.value > state.seats.length) return bad('The Mathematician learns a number.');
			// How many abilities went wrong is the Storyteller's to judge.
			return verdict(true, '');
		case 'flowergirl':
		case 'town-crier': {
			if (info.kind !== 'yesno') return bad('Yes or no.');
			const who = role === 'flowergirl' ? state.night?.dayVoters ?? [] : state.night?.dayNominators ?? [];
			const team = role === 'flowergirl' ? 'demon' : 'minion';
			const may = who.some((x) => canRegisterAsTeam(state, x, team));
			const must = who.some((x) => mustRegisterAsTeam(state, x, team));
			return verdict(info.yes ? may : !must, `The true answer is ${may && !must ? 'yes or no' : may ? 'yes' : 'no'}.`);
		}
		case 'oracle': {
			if (info.kind !== 'number') return bad('The Oracle learns a number.');
			const dead = state.seats.filter((x) => !x.alive);
			const lo = dead.filter((x) => registrations(state, x.id).alignments.every((a) => a === 'evil')).length;
			const hi = dead.filter((x) => registrations(state, x.id).alignments.includes('evil')).length;
			return verdict(info.value >= lo && info.value <= hi, `The true count is ${lo === hi ? lo : `${lo} to ${hi}`}.`);
		}
		case 'seamstress': {
			if (info.kind !== 'same') return bad('The Seamstress chooses two players and learns if they are on the same team.');
			const [a, b] = info.players;
			if (!validSeat(a) || !validSeat(b) || a === b) return bad('Choose two different players.');
			if (a === to || b === to) return bad('The Seamstress chooses two other players.');
			const A = registrations(state, a).alignments, B = registrations(state, b).alignments;
			const same = A.some((x) => B.includes(x)), differ = A.some((x) => B.some((y) => y !== x));
			return verdict(info.yes ? same : differ, `They are ${info.yes ? 'not' : ''} on the same team.`);
		}
		case 'juggler': {
			if (info.kind !== 'number') return bad('The Juggler learns a number.');
			const guesses = state.effects.filter((e) => e.kind === 'juggled' && e.by === to);
			const may = guesses.filter((g) => canRegisterAs(state, g.target, g.note ?? '')).length;
			const must = guesses.filter((g) => registrations(state, g.target).characters.every((c) => c === g.note)).length;
			return verdict(info.value >= must && info.value <= may, `The true count is ${must === may ? must : `${must} to ${may}`}.`);
		}
		case 'sage': {
			if (info.kind !== 'players') return bad('The Sage learns two players.');
			const [a, b] = info.players;
			if (!validSeat(a) || !validSeat(b) || a === b) return bad('Show two different players.');
			return verdict(canRegisterAsTeam(state, a, 'demon') || canRegisterAsTeam(state, b, 'demon'), 'Neither is the Demon.');
		}
		case 'chambermaid': {
			if (info.kind !== 'woke') return bad('The Chambermaid chooses two players and learns how many woke.');
			const [a, b] = info.players;
			if (!validSeat(a) || !validSeat(b) || a === b) return bad('Choose two different players.');
			if (a === to || b === to) return bad('The Chambermaid cannot choose themself.');
			if (!state.seats[a].alive || !state.seats[b].alive) return bad('The Chambermaid chooses living players.');
			if (info.value < 0 || info.value > 2) return bad('The Chambermaid learns 0, 1 or 2.');
			const n = [a, b].filter((p) => wokeTonight(state, p)).length;
			return verdict(n === info.value, `${n} of them woke tonight to use their ability.`);
		}
		case 'godfather-info':
		case 'godfather': {
			if (info.kind !== 'characters') return bad('The Godfather learns which Outsiders are in play.');
			const outsiders = script.characters.filter((c) => c.team === 'outsider').map((c) => c.id);
			if (info.characters.some((c) => !outsiders.includes(c))) return bad('Only Outsiders are shown.');
			// Every Outsider that must be one is shown; every one shown is something a player might register as.
			const must = state.seats.filter((x) => mustRegisterAsTeam(state, x.id, 'outsider')).map((x) => x.character);
			const may = (c: CharacterId) => state.seats.some((x) => canRegisterAs(state, x.id, c));
			const ok = must.every((c) => info.characters.includes(c)) && info.characters.every(may);
			return verdict(ok, 'Those are not the Outsiders in play.');
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
