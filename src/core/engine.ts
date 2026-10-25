/**
 * engine.ts - the Storyteller's commands, judged against the rules.
 *
 * `perform(state, command)` either refuses with a plain-English reason, or
 * returns the events the command causes. It never half-applies: a command
 * that fails part-way leaves the game untouched.
 *
 * Where the rules leave a choice to the Storyteller (does the Spy register as
 * a Townsfolk? does the Mayor's death bounce? which of the Sailor's pair is
 * drunk?), the command must say. If it does not and the choice really is
 * open, the engine refuses with a `decision` naming what it needs, so the UI
 * can ask and resubmit.
 *
 * Every death goes through one door (`attemptDeath`) and every execution
 * through another (`execute`), so protections, the Mayor, the Fool, the
 * Zombuul and the Scarlet Woman are handled once, in the order the rules give.
 */
import type { Alignment, CharacterId, Composition, DeathCause, Effect, GameEvent, GameState, Info, SeatId } from './types.ts';
import { reduce } from './state.ts';
import { allowedCompositions, charDef, getScript, teamAlignment, evilLearnEachOther, MIN_PLAYERS, MAX_PLAYERS } from './script.ts';
import {
	hasWorkingAbility, isDroisoned, judgeInfo, living, livingDemons, registrations, seat, teamOf,
	canRegisterAsTeam, mustRegisterAsTeam, safeFromDemon, butlerMaster, abilityWorks, teaLadyProtects, inForce, reallyAlive,
	livingNeighbours, vortoxWorks
} from './rules.ts';
import { FABLED } from './scripts/fabled.ts';
import { REVEAL, MINION_INFO, DEMON_INFO, NEW_DEMON, GODFATHER_INFO, EXORCISED, LUNATIC_INFO, LUNATIC, TRAVELLER_INFO, nextStep, stepAction } from './night.ts';

export type Command =
	| { type: 'create'; names: string[]; scriptId?: string }
	| {
			type: 'assign';
			characters: CharacterId[];
			/** Only for the Drunk: the Townsfolk they are told they are. */
			drunkBelieves?: CharacterId;
			/** Only for the Marionette: the good character they are told they are (they sit next to the Demon). */
			marionetteBelieves?: CharacterId;
			/** Only for the Lunatic: the Demon they are told they are (default: the Demon in play). */
			lunaticBelieves?: CharacterId;
			/** Only for the Evil Twin: the good player who is their twin. */
			evilTwin?: SeatId;
			redHerring?: SeatId | null;
			bluffs: CharacterId[];
			/** Allow team counts that differ from the standard table. */
			allowNonstandard?: boolean;
			/** The Fabled the Storyteller announces (the Storm Catcher names a good character). */
			fabled?: { id: string; character?: CharacterId }[];
	  }
	| { type: 'begin' }
	/** Resolve a step with nothing to choose (evil team info, Spy, a new Demon being told, the Moonchild's curse). */
	| { type: 'acknowledge'; mayorRedirect?: SeatId | null }
	/**
	 * Resolve a choosing step. One player (`target`) or several (`targets`), a
	 * character (`character`), or no one (`none`), as the ability asks. The rest
	 * answer the Storyteller's questions: whom the Mayor's death bounces to, which
	 * Minion catches a starpass, which of a pair is drunk (Sailor, Innkeeper), whom
	 * the Shabaloth regurgitates.
	 */
	| {
			type: 'choose';
			target?: SeatId;
			targets?: SeatId[];
			character?: CharacterId;
			none?: boolean;
			mayorRedirect?: SeatId | null;
			newDemon?: SeatId;
			drunk?: SeatId;
			regurgitate?: SeatId | null;
			/** The Vigormortis killed a Minion between two Townsfolk: which one is poisoned. */
			poisonNeighbour?: SeatId;
			/** The Barista: sober and healthy, or acting twice. */
			barista?: 'sober' | 'twice';
			/** The Harlot's choice: did they agree to show their character, and do both die? */
			harlot?: 'refused' | 'shown' | 'both-die';
	  }
	/** Resolve an information step. `override` allows false info to a sober, healthy player. */
	| { type: 'tell'; info: Info; override?: boolean }
	| { type: 'skip'; reason: string }
	| { type: 'end-night' }
	| { type: 'open-nominations' }
	/** Two players change places in the circle (the Storyteller moving people mid-game). */
	| { type: 'swap-seats'; a: SeatId; b: SeatId }
	| { type: 'nominate'; nominator: SeatId; nominee: SeatId; nominatorIsTownsfolk?: boolean; executionSurvives?: boolean }
	| { type: 'vote'; voters: SeatId[] }
	| { type: 'slay'; by: SeatId; target: SeatId; targetIsDemon?: boolean }
	/** Dusk: the player on the block is executed. `executionSurvives` answers the Pacifist. */
	| { type: 'end-day'; executionSurvives?: boolean }
	/** The Gossip's public statement, judged true or false by the Storyteller. */
	| { type: 'gossip'; by: SeatId; true: boolean }
	/** A dead Moonchild publicly chooses a living player. */
	| { type: 'moonchild'; by: SeatId; target: SeatId }
	/** The Storyteller decides the Tinker dies. */
	| { type: 'tinker'; seat: SeatId }
	/** The Juggler's first day: up to five public guesses of players' characters. */
	| { type: 'juggle'; by: SeatId; guesses: { player: SeatId; character: CharacterId }[] }
	/** A dead Klutz publicly chooses a living player: if evil, good loses. */
	| { type: 'klutz'; by: SeatId; target: SeatId }
	/** The Storyteller executes a player for breaking madness (the Mutant, the Cerenovus): the day's execution. */
	| { type: 'madness'; seat: SeatId }
	/** The Pit-Hag made a Demon tonight: the Storyteller kills whom they choose. */
	| { type: 'storyteller-kill'; seat: SeatId }
	/** A Traveller joins, sitting just after `after`: the player picks the character, the Storyteller the alignment. */
	| { type: 'traveller-joins'; name: string; character: CharacterId; alignment: Alignment; after: SeatId }
	/** A Traveller leaves the game. */
	| { type: 'traveller-leaves'; seat: SeatId }
	/** The group decides whether to exile a Traveller: anyone may support it, the dead too. `deviantFunny` answers for the Deviant. */
	| { type: 'exile'; traveller: SeatId; supporters: SeatId[]; deviantFunny?: boolean }
	/** The Gunslinger shoots a player who voted in the day's first vote. */
	| { type: 'gunslinger'; by: SeatId; target: SeatId }
	/** The Doomsayer: a living player calls it, and the Storyteller kills a living player of the caller's team. */
	| { type: 'doomsayer'; by: SeatId; victim: SeatId }
	/** The Ferryman: the final day; every dead player gets their vote back. */
	| { type: 'ferryman' }
	/** The Judge pardons or condemns the latest nomination's nominee. */
	| { type: 'judge'; by: SeatId; verdict: 'pardon' | 'condemn' }
	| { type: 'note'; text: string }
	/**
	 * The Storyteller moving tokens by hand: fixing a mistake, or ruling on
	 * something the engine does not model. Logged, never checked against
	 * the rules beyond "is this a real seat and character".
	 */
	| { type: 'adjust'; seat: SeatId; alive?: boolean; character?: CharacterId; believes?: CharacterId; ghostVote?: boolean }
	| { type: 'set-poison'; target: SeatId | null }
	| { type: 'set-red-herring'; seat: SeatId | null };

export type Result =
	| { ok: true; events: GameEvent[]; state: GameState }
	| { ok: false; error: string; decision?: string };

class RuleError extends Error {
	decision?: string;
	constructor(message: string, decision?: string) {
		super(message);
		this.decision = decision;
	}
}

const refuse = (msg: string, decision?: string): never => {
	throw new RuleError(msg, decision);
};

/** A command in progress: events emitted so far, and the state they produce. */
interface Tx {
	state: GameState;
	events: GameEvent[];
	/** The Storyteller's answers carried by the command (see Command). */
	answers: { mayorRedirect?: SeatId | null; executionSurvives?: boolean };
	/** The Mayor's bounce was used (a redirect given but never used is refused). */
	redirected: boolean;
	/** At night, the place of the step this command resolves: a character or Demon made now acts or is told just after it. */
	place: number;
}

function emit(tx: Tx, e: GameEvent) {
	tx.events.push(e);
	tx.state = reduce(tx.state, e);
}

export function perform(state: GameState, cmd: Command): Result {
	const answers: Tx['answers'] = {};
	if ('mayorRedirect' in cmd) answers.mayorRedirect = cmd.mayorRedirect;
	if ('executionSurvives' in cmd) answers.executionSurvives = cmd.executionSurvives;
	const tx: Tx = { state, events: [], answers, redirected: false, place: state.phase.kind === 'night' ? nextStep(state)?.order ?? 0 : 0 };
	try {
		if (state.phase.kind === 'over' && cmd.type !== 'note') refuse('The game is over.');
		handle(tx, cmd);
		// Some wins wait on something else changing (the Evil Twin made drunk with the Demon already dead): look again.
		if (tx.state.phase.kind === 'day' || tx.state.phase.kind === 'night') checkWin(tx);
		if (answers.mayorRedirect !== undefined && answers.mayorRedirect !== null && !tx.redirected) refuse('Only an attack on a working Mayor can be redirected.');
		return { ok: true, events: tx.events, state: tx.state };
	} catch (err) {
		if (err instanceof RuleError) return { ok: false, error: err.message, decision: err.decision };
		throw err;
	}
}

function handle(tx: Tx, cmd: Command) {
	const s = tx.state;
	switch (cmd.type) {
		case 'create': return create(tx, cmd);
		case 'assign': return assign(tx, cmd);
		case 'begin':
			if (s.phase.kind !== 'setup' || !s.seats.length || !s.seats[0].character) refuse('Assign characters first.');
			return emit(tx, { type: 'night-began', n: 1 });
		case 'acknowledge':
		case 'choose':
		case 'tell':
		case 'skip':
			return nightCommand(tx, cmd);
		case 'end-night': {
			if (s.phase.kind !== 'night') refuse('It is not night.');
			const pending = nextStep(s);
			if (pending) refuse(`Someone still has to wake: ${describeStep(s, pending.kind, pending.seat)}.`);
			return emit(tx, { type: 'day-began', n: s.night!.n });
		}
		case 'swap-seats': {
			if (!s.seats.length) refuse('Create the game first.');
			validTarget(s, cmd.a);
			validTarget(s, cmd.b);
			if (cmd.a === cmd.b) refuse('Choose two different players.');
			return emit(tx, { type: 'seats-swapped', a: cmd.a, b: cmd.b });
		}
		case 'open-nominations': {
			const day = requireDay(s);
			if (day.stage === 'nominations') refuse('Nominations are already open.');
			return emit(tx, { type: 'nominations-opened' });
		}
		case 'nominate': return nominate(tx, cmd);
		case 'vote': return vote(tx, cmd);
		case 'slay': return slay(tx, cmd);
		case 'end-day': return endDay(tx);
		case 'gossip': return gossip(tx, cmd);
		case 'moonchild': return moonchild(tx, cmd);
		case 'tinker': {
			if (s.phase.kind !== 'day' && s.phase.kind !== 'night') refuse('The game has not begun.');
			validTarget(s, cmd.seat);
			if (!abilityWorks(s, cmd.seat, 'tinker') || !s.seats[cmd.seat].alive) refuse(`${s.seats[cmd.seat].name} is not a living Tinker with their ability.`);
			attemptDeath(tx, cmd.seat, { cause: 'tinker' });
			return;
		}
		case 'juggle': return juggle(tx, cmd);
		case 'traveller-joins': return travellerJoins(tx, cmd);
		case 'traveller-leaves': {
			if (s.phase.kind !== 'day' && s.phase.kind !== 'night') refuse('The game has not begun.');
			validTarget(s, cmd.seat);
			if (!s.seats[cmd.seat].traveller) refuse('Only a Traveller can leave the game.');
			if (!s.seats[cmd.seat].alive) refuse('They are already dead.');
			emit(tx, { type: 'died', seat: cmd.seat, cause: 'left' });
			return checkWin(tx);
		}
		case 'exile': return exile(tx, cmd);
		case 'gunslinger': return gunslinger(tx, cmd);
		case 'judge': return judge(tx, cmd);
		case 'doomsayer': {
			requireDay(s);
			if (!s.fabled?.some((f) => f.id === 'doomsayer')) refuse('The Doomsayer is not in play.');
			validTarget(s, cmd.by);
			validTarget(s, cmd.victim);
			if (!s.seats[cmd.by].alive) refuse('Only living players call on the Doomsayer.');
			if (living(s).length < 4) refuse('With three or fewer alive, the Doomsayer cannot be used.');
			if (s.spent.includes(`${cmd.by}:doomsayer`)) refuse('Each player calls on the Doomsayer once.');
			if (!s.seats[cmd.victim].alive || s.seats[cmd.victim].alignment !== s.seats[cmd.by].alignment) refuse('The Doomsayer kills a living player of the caller\u2019s team.');
			emit(tx, { type: 'ability-spent', seat: cmd.by, ability: 'doomsayer' });
			attemptDeath(tx, cmd.victim, { cause: 'doomsayer' });
			return checkWin(tx);
		}
		case 'ferryman':
			requireDay(s);
			if (!s.fabled?.some((f) => f.id === 'ferryman')) refuse('The Ferryman is not in play.');
			if (s.spent.includes('-1:ferryman')) refuse('The Ferryman comes once, on the final day.');
			emit(tx, { type: 'ability-spent', seat: -1, ability: 'ferryman' });
			return emit(tx, { type: 'votes-restored' });
		case 'klutz': return klutz(tx, cmd);
		case 'madness': {
			const day = requireDay(s);
			validTarget(s, cmd.seat);
			if (day.executed !== null) refuse('Someone has already been executed today.');
			if (openNomination(s)) refuse('Count the votes on the current nomination first.');
			if (!s.seats[cmd.seat].alive) refuse('Only a living player can be executed for madness.');
			return execute(tx, cmd.seat);
		}
		case 'storyteller-kill':
			if (s.phase.kind !== 'night' || !s.night?.arbitrary) refuse('Only on a night the Pit-Hag made a Demon are deaths the Storyteller\u2019s choice.');
			validTarget(s, cmd.seat);
			attemptDeath(tx, cmd.seat, { cause: 'storyteller' });
			return;
		case 'note': return emit(tx, { type: 'note', text: cmd.text });
		case 'adjust': return adjust(tx, cmd);
		case 'set-poison':
			if (!s.seats.length || !s.seats[0].character) refuse('Deal the characters first.');
			if (cmd.target !== null) validTarget(s, cmd.target);
			return emit(tx, { type: 'poison-set', target: cmd.target });
		case 'set-red-herring':
			if (!s.seats.length || !s.seats[0].character) refuse('Deal the characters first.');
			if (cmd.seat !== null) {
				validTarget(s, cmd.seat);
				// The red herring is a good player who reads as the Demon: never the Demon, nor any evil player.
				if (seat(s, cmd.seat).alignment !== 'good') refuse('The red herring must be a good player.');
			}
			return emit(tx, { type: 'red-herring-set', seat: cmd.seat });
	}
}

export function describeStep(state: GameState, kind: string, seatId: SeatId | null): string {
	const who = seatId === null ? '' : ` (${state.seats[seatId].name})`;
	const nm = seatId === null ? '' : state.seats[seatId].name;
	if (kind === REVEAL) return `${nm}, to learn their character`;
	if (kind === MINION_INFO) return `${nm}, to learn their Demon`;
	if (kind === DEMON_INFO) return `${nm}, to learn their Minions and bluffs`;
	if (kind === NEW_DEMON) return `the new Demon${who}`;
	if (kind === GODFATHER_INFO) return `the Godfather${who}, to learn the Outsiders in play`;
	if (kind === EXORCISED) return `the Demon${who}, to learn who the Exorcist is`;
	if (kind === TRAVELLER_INFO) return `an evil Traveller${who}, to learn the Demon`;
	if (kind === LUNATIC_INFO) return `the Lunatic${who}, as if they were the Demon`;
	if (kind === LUNATIC) return `the Lunatic${who}, choosing as the Demon`;
	return charDef(getScript(state.scriptId), kind).name + who;
}

// ---- setup ------------------------------------------------------------------

function create(tx: Tx, cmd: Extract<Command, { type: 'create' }>) {
	if (tx.state.phase.kind !== 'setup' || tx.state.seats.length) refuse('A game has already been created.');
	const names = cmd.names.map((n) => n.trim());
	if (names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) refuse(`Seat ${MIN_PLAYERS} to ${MAX_PLAYERS} players.`);
	if (names.some((n) => !n)) refuse('Every seat needs a name.');
	if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) refuse('Two players share a name.');
	const scriptId = cmd.scriptId ?? 'trouble-brewing';
	try {
		getScript(scriptId);
	} catch (err) {
		refuse((err as Error).message);
	}
	emit(tx, { type: 'game-created', scriptId, names });
}

function assign(tx: Tx, cmd: Extract<Command, { type: 'assign' }>) {
	const s = tx.state;
	if (s.phase.kind !== 'setup' || !s.seats.length) refuse('Create the game first.');
	const script = getScript(s.scriptId);
	const chars = cmd.characters;
	if (chars.length !== s.seats.length) refuse(`Give each of the ${s.seats.length} seats a character.`);
	for (const c of chars) if (!script.characters.some((d) => d.id === c)) refuse(`"${c}" is not on ${script.name}.`);
	if (new Set(chars).size !== chars.length) refuse('A character is dealt twice.');

	const counts: Composition = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
	for (const c of chars) counts[charDef(script, c).team as keyof Composition]++;
	if (counts.demon !== 1) refuse('There must be exactly one Demon.');
	const fabled = cmd.fabled ?? [];
	for (const f of fabled) {
		const def = FABLED.find((x) => x.id === f.id);
		if (!def) refuse(`"${f.id}" is not a Fabled.`);
		if (def!.needsCharacter) {
			if (!f.character || teamAlignment(charDef(script, f.character).team) !== 'good') refuse(`The ${def!.name} names a good character.`);
		}
	}
	if (new Set(fabled.map((f) => f.id)).size !== fabled.length) refuse('A Fabled is announced twice.');
	const options = allowedCompositions(script, chars.length, chars, fabled.map((f) => f.id));
	const same = options.some((want) => (Object.keys(want) as (keyof Composition)[]).every((k) => want[k] === counts[k]));
	if (!same && !cmd.allowNonstandard) {
		const want = options[0];
		refuse(`For ${chars.length} players this script expects ${want.townsfolk} Townsfolk, ${want.outsider} Outsiders, ` +
			`${want.minion} Minions, ${want.demon} Demon${options.length > 1 ? ' (or another allowed count)' : ''}. Got ${counts.townsfolk}/${counts.outsider}/${counts.minion}/${counts.demon}.`);
	}

	const inPlay = new Set(chars);
	const notInPlay = (c: CharacterId) => !inPlay.has(c);
	const believes = chars.map((c) => c);
	const drunkSeat = chars.indexOf('drunk');
	if (drunkSeat >= 0) {
		const b = cmd.drunkBelieves;
		if (!b) refuse('Choose the Townsfolk the Drunk thinks they are.', 'drunkBelieves');
		if (charDef(script, b!).team !== 'townsfolk') refuse('The Drunk must think they are a Townsfolk.');
		if (!notInPlay(b!)) refuse('The Drunk must think they are a Townsfolk that is not in play.');
		believes[drunkSeat] = b!;
	} else if (cmd.drunkBelieves) {
		refuse('There is no Drunk in play.');
	}
	// The Marionette thinks they are a good character not in play, and sits beside the Demon.
	const marionetteSeat = chars.indexOf('marionette');
	if (marionetteSeat >= 0) {
		const b = cmd.marionetteBelieves;
		if (!b) refuse('Choose the good character the Marionette thinks they are.', 'marionetteBelieves');
		if (teamAlignment(charDef(script, b!).team) !== 'good' || charDef(script, b!).team === 'traveller') refuse('The Marionette must think they are a Townsfolk or an Outsider.');
		if (!notInPlay(b!) || b === cmd.drunkBelieves) refuse('The Marionette must think they are a character that is not in play.');
		const order = s.order.length === chars.length ? s.order : chars.map((_, i) => i);
		const at = order.indexOf(marionetteSeat), n = order.length;
		const beside = [order[(at + 1) % n], order[(at + n - 1) % n]];
		if (!beside.some((id) => charDef(script, chars[id]).team === 'demon')) refuse('The Marionette must sit next to the Demon.');
		believes[marionetteSeat] = b!;
	} else if (cmd.marionetteBelieves) {
		refuse('There is no Marionette in play.');
	}
	const lunaticSeat = chars.indexOf('lunatic');
	if (lunaticSeat >= 0) {
		const b = cmd.lunaticBelieves ?? chars.find((c) => charDef(script, c).team === 'demon')!;
		if (charDef(script, b).team !== 'demon') refuse('The Lunatic must think they are a Demon.');
		believes[lunaticSeat] = b;
	} else if (cmd.lunaticBelieves) {
		refuse('There is no Lunatic in play.');
	}

	const twinSeat = chars.indexOf('evil-twin');
	if (twinSeat >= 0) {
		const t = cmd.evilTwin;
		if (t === undefined) refuse('Choose the Evil Twin\u2019s twin: a good player.', 'evilTwin');
		if (!s.seats[t!] || teamAlignment(charDef(script, chars[t!]).team) !== 'good') refuse('The Evil Twin\u2019s twin must be a good player.');
	} else if (cmd.evilTwin !== undefined) {
		refuse('There is no Evil Twin in play.');
	}

	const needsHerring = believes.includes('fortune-teller');
	const rh = cmd.redHerring ?? null;
	if (rh !== null) {
		if (!s.seats[rh]) refuse('The red herring must be a seat.');
		if (teamAlignment(charDef(script, chars[rh]).team) !== 'good') refuse('The red herring must be a good player.');
	} else if (needsHerring) {
		refuse('Choose the Fortune Teller’s red herring: a good player.', 'redHerring');
	}

	const bluffs = cmd.bluffs;
	// Three, or as many good characters as are left out of play when a small script has fewer.
	const goodOut = script.characters.filter((d) => teamAlignment(d.team) === 'good' && notInPlay(d.id)).length;
	const wantBluffs = evilLearnEachOther(chars.length) || fabled.some((f) => f.id === 'toymaker') ? Math.min(3, goodOut) : 0;
	if (bluffs.length !== wantBluffs && !(wantBluffs === 0 && bluffs.length === 3)) {
		refuse(`Choose ${wantBluffs || 'no'} Demon bluffs.`, 'bluffs');
	}
	if (new Set(bluffs).size !== bluffs.length) refuse('The bluffs must be different characters.');
	for (const b of bluffs) {
		const def = script.characters.find((d) => d.id === b);
		if (!def) refuse(`"${b}" is not on ${script.name}.`);
		if (teamAlignment(def!.team) !== 'good') refuse('Bluffs must be good characters.');
		if (!notInPlay(b)) refuse(`The ${def!.name} is in play, so it cannot be a bluff.`);
	}

	emit(tx, {
		type: 'characters-assigned',
		seats: chars.map((character, i) => ({ character, believes: believes[i] })),
		redHerring: rh,
		bluffs: [...bluffs],
		...(fabled.length ? { fabled: fabled.map((f) => ({ ...f })) } : {})
	});
	if (twinSeat >= 0) emit(tx, { type: 'effect-added', effect: { kind: 'twin', target: cmd.evilTwin!, by: twinSeat, role: 'evil-twin', until: 'game' } });
}

// ---- night --------------------------------------------------------------------

function nightCommand(tx: Tx, cmd: Extract<Command, { type: 'acknowledge' | 'choose' | 'tell' | 'skip' }>) {
	const s = tx.state;
	if (s.phase.kind !== 'night') refuse('It is not night.');
	const step = nextStep(s);
	if (!step) refuse('Everyone has woken. End the night.');
	const { kind, seat: who, id } = step!;

	if (cmd.type === 'skip') {
		if (!cmd.reason.trim()) refuse('Say why the step is skipped.');
		return emit(tx, { type: 'step-skipped', step: id, reason: cmd.reason.trim(), order: step!.order });
	}
	const action = stepAction(kind);
	if (cmd.type !== action) refuse(`Next to wake is ${describeStep(s, kind, who)}, who needs "${action}", not "${cmd.type}".`);

	if (cmd.type === 'acknowledge') {
		if (kind === REVEAL) emit(tx, { type: 'role-shown', to: who! });
		else if (kind === MINION_INFO) emit(tx, { type: 'evil-info-shown', to: who!, as: 'minion' });
		else if (kind === DEMON_INFO || kind === LUNATIC_INFO) emit(tx, { type: 'evil-info-shown', to: who!, as: 'demon' });
		else if (kind === NEW_DEMON) emit(tx, { type: 'demon-told', to: who! });
		else if (kind === 'spy') emit(tx, { type: 'grimoire-shown', to: who! });
		else if (kind === 'moonchild') moonchildCurse(tx, who!);
		else if (kind === TRAVELLER_INFO) emit(tx, { type: 'ability-spent', seat: who!, ability: 'traveller-info' });
	} else if (cmd.type === 'choose') {
		choose(tx, kind, who!, cmd);
	} else {
		tell(tx, kind, who!, cmd);
	}
	if (tx.state.phase.kind !== 'over') emit(tx, { type: 'step-done', step: id, order: step!.order });
}

function validTarget(s: GameState, t: SeatId) {
	if (!Number.isInteger(t) || !s.seats[t]) refuse('Choose a player in the circle.');
}

/** What a choosing ability asks for: how many players, a character, may it choose no one, and limits. */
export interface PickSpec {
	/** Players to choose (the Po: 1, or 3 after a night of choosing no one). */
	count: number;
	character?: 'required' | 'instead';
	noneAllowed?: boolean;
	alive?: boolean;
	dead?: boolean;
	notSelf?: boolean;
	/** Not the player chosen last night (Exorcist, Devil's Advocate). */
	notLast?: boolean;
}

/** The pick a step asks of its player. */
export function pickSpec(state: GameState, kind: string, by: SeatId | null): PickSpec {
	// The Toymaker: the Demon may choose to attack no one.
	const spec = basePickSpec(state, kind, by);
	const demon = getScript(state.scriptId).characters.some((c) => c.id === kind && c.team === 'demon');
	if (demon && state.fabled?.some((f) => f.id === 'toymaker') && spec.count > 0) return { ...spec, noneAllowed: true };
	return spec;
}

function basePickSpec(state: GameState, kind: string, by: SeatId | null): PickSpec {
	const effectOn = (k: Effect['kind']) => by !== null && state.effects.some((e) => e.kind === k && e.by === by);
	switch (kind) {
		case 'monk':
		case 'butler': return { count: 1, notSelf: true };
		case 'sailor': return { count: 1, alive: true };
		case 'exorcist': return { count: 1, notLast: true };
		case 'innkeeper': return { count: 2 };
		case 'gambler': return { count: 1, character: 'required' };
		case 'courtier': return { count: 0, character: 'instead', noneAllowed: true };
		case 'professor': return { count: 1, dead: true, noneAllowed: true };
		case 'devils-advocate': return { count: 1, alive: true, notLast: true };
		case 'assassin': return { count: 1, noneAllowed: true };
		case 'shabaloth': return { count: 2 };
		case 'po': return effectOn('po-charged') ? { count: 3 } : { count: 1, noneAllowed: true };
		case 'snake-charmer': return { count: 1, alive: true };
		case 'cerenovus':
		case 'pit-hag': return { count: 1, character: 'required' };
		case 'philosopher': return { count: 0, character: 'instead', noneAllowed: true };
		case 'barber': return { count: 2, noneAllowed: true };
		case 'bureaucrat':
		case 'thief': return { count: 1, notSelf: true };
		case 'harlot': return { count: 1, alive: true, notSelf: true };
		case 'bone-collector': return { count: 1, dead: true, noneAllowed: true };
		case 'apprentice': return { count: 0, character: 'instead' };
		case LUNATIC: {
			const believed = by === null ? 'imp' : state.seats[by].believes;
			return believed === LUNATIC ? { count: 1 } : pickSpec(state, believed, by);
		}
		default: return { count: 1 };
	}
}

/** The players chosen last night by this ability (Exorcist, Devil's Advocate, Shabaloth). */
const lastChoices = (s: GameState, by: SeatId, role: string) => s.effects.filter((e) => e.kind === 'chose-last' && e.by === by && e.role === role).map((e) => e.target);

function remember(tx: Tx, by: SeatId, role: string, targets: SeatId[]) {
	emit(tx, { type: 'effects-ended', match: { kind: 'chose-last', by, role } });
	for (const t of targets) emit(tx, { type: 'effect-added', effect: { kind: 'chose-last', target: t, by, role, until: 'game' } });
}

/** Does this ability, used now, work? (Drunk or poisoned, or not really this character: no.) */
const works = (tx: Tx, by: SeatId, kind: string) => !isDroisoned(tx.state, by) && seat(tx.state, by).character === kind;

/**
 * The Goon: the first player each night to choose them with their ability is
 * drunk until dusk, and the Goon takes their alignment, even if the chooser
 * was already drunk or poisoned. Returns true if it happened now.
 */
function goonCatches(tx: Tx, by: SeatId, target: SeatId): boolean {
	const s = tx.state;
	if (!abilityWorks(s, target, 'goon') || target === by) return false;
	if (s.effects.some((e) => e.kind === 'drunk' && e.role === 'goon')) return false; // already caught someone tonight
	emit(tx, { type: 'effect-added', effect: { kind: 'drunk', target: by, by: target, role: 'goon', until: 'dusk' } });
	const al = s.seats[by].alignment;
	if (s.seats[target].alignment !== al) emit(tx, { type: 'alignment-changed', seat: target, alignment: al });
	return true;
}

function choose(tx: Tx, kind: string, by: SeatId, cmd: Extract<Command, { type: 'choose' }>) {
	const s = tx.state;
	const spec = pickSpec(s, kind, by);
	const targets = cmd.none ? [] : cmd.targets ?? (cmd.target !== undefined ? [cmd.target] : []);
	const name = charDef(getScript(s.scriptId), kind === LUNATIC ? s.seats[by].believes : kind).name;
	if (cmd.none) {
		if (!spec.noneAllowed) refuse(`The ${name} must choose.`);
	} else if (spec.character === 'instead') {
		if (!cmd.character) refuse(`The ${name} chooses a character, or no one.`);
	} else if (targets.length !== spec.count) {
		refuse(spec.count === 1 ? `Choose one player for the ${name}.` : `The ${name} chooses ${spec.count} players.`);
	}
	for (const t of targets) validTarget(s, t);
	if (new Set(targets).size !== targets.length) refuse('Choose different players.');
	if (spec.notSelf && targets.includes(by)) refuse(`The ${name} must choose another player.`);
	if (spec.alive && targets.some((t) => !s.seats[t].alive)) refuse(`The ${name} chooses a living player.`);
	if (spec.dead && targets.some((t) => s.seats[t].alive)) refuse(`The ${name} chooses a dead player.`);
	if (spec.notLast && targets.some((t) => lastChoices(s, by, kind).includes(t))) refuse(`The ${name} cannot choose the same player as last night.`);
	if (spec.character === 'required' && !cmd.character) refuse(`The ${name} also chooses a character.`);
	if (cmd.character && !getScript(s.scriptId).characters.some((c) => c.id === cmd.character)) refuse(`"${cmd.character}" is not on this script.`);

	const effective = works(tx, by, kind);
	emit(tx, { type: 'chose', by, role: kind, targets, effective, ...(cmd.character ? { character: cmd.character } : {}) });

	// The Toymaker's Demon attacking no one (the Po's no one is its own ability).
	if (cmd.none && kind !== 'po' && getScript(s.scriptId).characters.some((c) => c.id === kind && c.team === 'demon')) return;
	// The Lunatic chooses as a Demon, to no effect (the real Demon is told). A Lunatic Po keeps up the pretence of three after no one.
	if (kind === LUNATIC) {
		if (s.seats[by].believes === 'po') {
			const charged = s.effects.some((e) => e.kind === 'po-charged' && e.by === by);
			if (cmd.none) emit(tx, { type: 'effect-added', effect: { kind: 'po-charged', target: by, by, role: 'lunatic', until: 'game' } });
			else if (charged) emit(tx, { type: 'effects-ended', match: { kind: 'po-charged', by } });
		}
		return;
	}
	// The Gossip's kill is the Storyteller's choice; the Gossip does not wake, so no Goon.
	if (kind === 'gossip') {
		if (abilityWorks(s, by, 'gossip')) attemptDeath(tx, targets[0], { cause: 'gossip' });
		return;
	}

	switch (kind) {
		case 'poisoner':
		case 'monk':
		case 'butler':
		case 'sailor':
		case 'exorcist':
		case 'gambler':
		case 'professor':
		case 'devils-advocate':
		case 'godfather': {
			// One player, chosen with an ability: the Goon may catch them first.
			if (targets.length) goonCatches(tx, by, targets[0]);
			if (kind === 'exorcist') remember(tx, by, kind, targets);
			if (kind === 'devils-advocate') remember(tx, by, kind, targets);
			return single(tx, kind, by, targets[0], cmd);
		}
		case 'innkeeper': {
			for (const t of targets) goonCatches(tx, by, t);
			if (!works(tx, by, kind)) return;
			for (const t of targets) emit(tx, { type: 'effect-added', effect: { kind: 'safe-tonight', target: t, by, role: 'innkeeper', until: 'dawn' } });
			if (cmd.drunk === undefined || !targets.includes(cmd.drunk)) refuse('Which of the two is drunk until dusk?', 'drunk');
			emit(tx, { type: 'effect-added', effect: { kind: 'drunk', target: cmd.drunk!, by, role: 'innkeeper', until: 'dusk' } });
			return;
		}
		case 'courtier': {
			if (cmd.none) return;
			emit(tx, { type: 'ability-spent', seat: by, ability: 'courtier' });
			if (!works(tx, by, kind)) return;
			const victim = s.seats.find((x) => x.character === cmd.character);
			if (victim) emit(tx, { type: 'effect-added', effect: { kind: 'drunk', target: victim.id, by, role: 'courtier', until: { dusk: s.night!.n + 3 }, whileSourceWorks: true } });
			return;
		}
		case 'assassin': {
			if (cmd.none) return;
			emit(tx, { type: 'ability-spent', seat: by, ability: 'assassin' });
			const t = targets[0];
			// Chosen by the Assassin, the Goon still dies (and turns evil).
			const caught = goonCatches(tx, by, t);
			if (works(tx, by, kind) || (caught && effective)) attemptDeath(tx, t, { cause: 'assassin', ignoreProtection: true });
			return;
		}
		case 'snake-charmer': {
			const t = targets[0];
			goonCatches(tx, by, t);
			if (works(tx, by, kind) && s.seats[by].alive && teamOf(s, s.seats[t].character) === 'demon') snakeCharm(tx, by, t);
			return;
		}
		case 'witch': {
			const t = targets[0];
			goonCatches(tx, by, t);
			// With three players alive the Witch has lost the ability.
			if (works(tx, by, kind) && living(tx.state).length > 3) emit(tx, { type: 'effect-added', effect: { kind: 'cursed', target: t, by, role: 'witch', until: 'dusk', whileSourceWorks: true, endsWithSource: true } });
			return;
		}
		case 'cerenovus': {
			const t = targets[0];
			if (teamAlignment(charDef(getScript(s.scriptId), cmd.character!).team) !== 'good') refuse('The Cerenovus chooses a good character.');
			goonCatches(tx, by, t);
			if (works(tx, by, kind)) emit(tx, { type: 'effect-added', effect: { kind: 'mad', target: t, by, role: 'cerenovus', until: 'dusk', note: cmd.character } });
			return;
		}
		case 'pit-hag': {
			const t = targets[0];
			if (s.seats.some((x) => x.character === cmd.character)) refuse('The Pit-Hag chooses a character not in play.');
			goonCatches(tx, by, t);
			if (works(tx, by, kind)) changeCharacter(tx, t, cmd.character!, 'pit-hag');
			return;
		}
		case 'philosopher': {
			if (cmd.none) return;
			if (teamAlignment(charDef(getScript(s.scriptId), cmd.character!).team) !== 'good') refuse('The Philosopher chooses a good character.');
			emit(tx, { type: 'ability-spent', seat: by, ability: 'philosopher' });
			if (!works(tx, by, kind)) return;
			// They gain the ability (we model it as becoming the character); whoever has it is drunk while the Philosopher keeps it.
			const holder = s.seats.find((x) => x.character === cmd.character && x.id !== by);
			changeCharacter(tx, by, cmd.character!, 'philosopher');
			if (holder) emit(tx, { type: 'effect-added', effect: { kind: 'drunk', target: holder.id, by, role: 'philosopher', until: 'game', whileSourceWorks: true } });
			return;
		}
		case 'barber': {
			// The Demon chooses, for the dead Barber: two players (no Demon) swap characters; alignments stay.
			emit(tx, { type: 'ability-spent', seat: by, ability: 'barber' });
			if (cmd.none || !works(tx, by, kind)) return;
			if (targets.some((t) => teamOf(s, s.seats[t].character) === 'demon')) refuse('The Barber\u2019s swap cannot include a Demon.');
			const [a, b] = targets;
			const ca = s.seats[a].character, cb = s.seats[b].character;
			changeCharacter(tx, a, cb, 'barber');
			changeCharacter(tx, b, ca, 'barber');
			return;
		}
		case 'sweetheart': {
			// The Storyteller chooses who is drunk for the rest of the game.
			emit(tx, { type: 'ability-spent', seat: by, ability: 'sweetheart' });
			if (s.seats[by].character === 'sweetheart') emit(tx, { type: 'effect-added', effect: { kind: 'drunk', target: targets[0], by, role: 'sweetheart', until: 'game' } });
			return;
		}
		case 'bureaucrat':
		case 'thief': {
			const t = targets[0];
			goonCatches(tx, by, t);
			if (works(tx, by, kind)) emit(tx, { type: 'effect-added', effect: { kind: kind === 'bureaucrat' ? 'vote-x3' : 'vote-minus', target: t, by, role: kind, until: 'dusk', whileSourceWorks: true } });
			return;
		}
		case 'barista': {
			// The Storyteller picks the player and the mode; the player learns it.
			const t = targets[0];
			if (cmd.barista === undefined) refuse('The Barista: is the player sober and healthy, or does their ability act twice?', 'barista');
			if (!works(tx, by, kind)) return;
			if (cmd.barista === 'sober') emit(tx, { type: 'effect-added', effect: { kind: 'sober', target: t, by, role: 'barista', until: 'dusk', whileSourceWorks: true } });
			else emit(tx, { type: 'note', text: `The Barista: ${s.seats[t].name}'s ability acts twice until dusk.` });
			return;
		}
		case 'harlot': {
			const t = targets[0];
			goonCatches(tx, by, t);
			if (cmd.harlot === undefined) refuse('Does the player agree to show their character to the Harlot, and do both die?', 'harlot');
			if (!works(tx, by, kind) || cmd.harlot !== 'both-die') return;
			attemptDeath(tx, t, { cause: 'harlot' });
			attemptDeath(tx, by, { cause: 'harlot' });
			return;
		}
		case 'bone-collector': {
			if (cmd.none) return;
			emit(tx, { type: 'ability-spent', seat: by, ability: 'bone-collector' });
			const t = targets[0];
			goonCatches(tx, by, t);
			if (works(tx, by, kind)) emit(tx, { type: 'effect-added', effect: { kind: 'keeps-ability', target: t, by, role: 'bone-collector', until: 'dusk', whileSourceWorks: true } });
			return;
		}
		case 'apprentice': {
			// Good: a Townsfolk ability; evil: a Minion ability (we model it as becoming that character; still a Traveller).
			const want = s.seats[by].alignment === 'good' ? 'townsfolk' : 'minion';
			if (teamOf(s, cmd.character!) !== want) refuse(`The ${s.seats[by].alignment} Apprentice gains a ${want === 'townsfolk' ? 'Townsfolk' : 'Minion'} ability.`);
			// The Marionette has no ability of its own to gain: it is a seat's hidden part, set up at the start.
			if (cmd.character === 'marionette') refuse('The Marionette has no ability for the Apprentice to gain.');
			emit(tx, { type: 'ability-spent', seat: by, ability: 'first-night' });
			changeCharacter(tx, by, cmd.character!, 'apprentice');
			return;
		}
		case 'no-dashii':
		case 'vortox': {
			goonCatches(tx, by, targets[0]);
			if (works(tx, by, kind)) attemptDeath(tx, targets[0], { cause: 'demon' });
			return;
		}
		case 'fang-gu': {
			const t = targets[0];
			goonCatches(tx, by, t);
			if (!works(tx, by, kind)) return;
			// The first Outsider it chooses (once a game): they become an evil Fang Gu, and the old one dies instead.
			if (t !== by && s.seats[t].alive && teamOf(s, s.seats[t].character) === 'outsider' && !s.spent.some((x) => x.endsWith(':fang-gu'))) {
				emit(tx, { type: 'ability-spent', seat: by, ability: 'fang-gu' });
				emit(tx, { type: 'became-demon', seat: t, character: 'fang-gu', via: 'fang-gu', at: tx.place });
				emit(tx, { type: 'died', seat: by, cause: 'fang-gu' });
				checkWin(tx);
				return;
			}
			attemptDeath(tx, t, { cause: 'demon' });
			return;
		}
		case 'vigormortis': {
			const t = targets[0];
			goonCatches(tx, by, t);
			if (!works(tx, by, kind)) return;
			const minion = teamOf(s, s.seats[t].character) === 'minion';
			const died = attemptDeath(tx, t, { cause: 'demon' });
			// Only a Minion it kills now (not one already dead) keeps their ability.
			if (!died || !minion || tx.state.seats[t].alive || tx.state.phase.kind === 'over') return;
			// A Minion it kills keeps their ability, and a Townsfolk neighbour of theirs is poisoned.
			emit(tx, { type: 'effect-added', effect: { kind: 'keeps-ability', target: t, by, role: 'vigormortis', until: 'game', endsWithSource: true } });
			const nb = livingNeighbours(tx.state, t).filter((x) => teamOf(tx.state, tx.state.seats[x].character) === 'townsfolk');
			if (!nb.length) return;
			let p = nb[0];
			if (nb.length > 1) {
				if (cmd.poisonNeighbour === undefined || !nb.includes(cmd.poisonNeighbour)) refuse('Which of their Townsfolk neighbours is poisoned?', 'poisonNeighbour');
				p = cmd.poisonNeighbour!;
			}
			emit(tx, { type: 'effect-added', effect: { kind: 'poisoned', target: p, by, role: 'vigormortis', until: 'game', endsWithSource: true } });
			return;
		}
		// ---- Demons ----
		case 'imp': {
			const t = targets[0];
			goonCatches(tx, by, t);
			if (!works(tx, by, kind)) return;
			if (t === by) {
				// A Monk-protected Imp who chooses themself: nothing happens, and no new Imp is made.
				if (safeFromDemon(tx.state, by)) return emit(tx, { type: 'kill-prevented', target: by, reason: 'protected by the Monk' });
				return starpass(tx, by, cmd.newDemon);
			}
			attemptDeath(tx, t, { cause: 'demon' });
			return;
		}
		case 'zombuul': {
			goonCatches(tx, by, targets[0]);
			if (works(tx, by, kind)) attemptDeath(tx, targets[0], { cause: 'demon' });
			return;
		}
		case 'pukka': {
			const t = targets[0];
			goonCatches(tx, by, t);
			const now = works(tx, by, kind);
			const n = tx.state.night!.n;
			// The one poisoned on an earlier night dies now (if the Pukka has its ability), then is healthy.
			const before = tx.state.effects.filter((e) => e.kind === 'poisoned' && e.role === 'pukka' && e.by === by && e.note !== String(n));
			if (now) emit(tx, { type: 'effect-added', effect: { kind: 'poisoned', target: t, by, role: 'pukka', until: 'game', endsWithSource: true, whileSourceWorks: true, note: String(n) } });
			if (now) {
				for (const e of before) {
					attemptDeath(tx, e.target, { cause: 'demon' });
					emit(tx, { type: 'effects-ended', match: { kind: 'poisoned', role: 'pukka', target: e.target, by } });
				}
			}
			return;
		}
		case 'shabaloth': {
			const last = lastChoices(tx.state, by, 'shabaloth').filter((t) => !tx.state.seats[t].alive);
			if (last.length && works(tx, by, kind)) {
				if (cmd.regurgitate === undefined) refuse('Does a player the Shabaloth chose last night come back? Choose them, or no one.', 'regurgitate');
				if (cmd.regurgitate !== null) {
					if (!last.includes(cmd.regurgitate!)) refuse('Only a dead player the Shabaloth chose last night can come back.');
					emit(tx, { type: 'revived', seat: cmd.regurgitate!, by: 'shabaloth' });
				}
			}
			remember(tx, by, 'shabaloth', targets);
			// One at a time: choosing the Goon makes the rest fail.
			for (const t of targets) {
				if (tx.state.phase.kind === 'over') return; // the Demon killed itself: nothing more happens
				goonCatches(tx, by, t);
				if (works(tx, by, kind)) attemptDeath(tx, t, { cause: 'demon' });
			}
			return;
		}
		case 'po': {
			const charged = tx.state.effects.some((e) => e.kind === 'po-charged' && e.by === by);
			if (cmd.none) {
				// Even a drunk Po that chose no one gets three next time.
				emit(tx, { type: 'effect-added', effect: { kind: 'po-charged', target: by, by, role: 'po', until: 'game' } });
				return;
			}
			if (charged) emit(tx, { type: 'effects-ended', match: { kind: 'po-charged', by } });
			for (const t of targets) {
				if (tx.state.phase.kind === 'over') return;
				goonCatches(tx, by, t);
				if (works(tx, by, kind)) attemptDeath(tx, t, { cause: 'demon' });
			}
			return;
		}
	}
}

/** The single-player abilities, once the Goon has had their say. */
function single(tx: Tx, kind: string, by: SeatId, t: SeatId, cmd: Extract<Command, { type: 'choose' }>) {
	const s = tx.state;
	const ok = works(tx, by, kind);
	switch (kind) {
		case 'poisoner':
			if (ok) emit(tx, { type: 'effect-added', effect: { kind: 'poisoned', target: t, by, role: 'poisoner', until: 'dusk', endsWithSource: true } });
			return;
		case 'monk':
			if (ok) emit(tx, { type: 'effect-added', effect: { kind: 'safe-from-demon', target: t, by, role: 'monk', until: 'dawn' } });
			return;
		case 'butler':
			// Any Butler choosing is a real Butler (the Drunk thinks they are a Townsfolk); poisoned or not, they pick a master.
			emit(tx, { type: 'effects-ended', match: { kind: 'master', by } });
			emit(tx, { type: 'effect-added', effect: { kind: 'master', target: t, by, role: 'butler', until: 'game' } });
			return;
		case 'sailor':
			if (!ok) return;
			if (cmd.drunk === undefined || (cmd.drunk !== by && cmd.drunk !== t)) refuse('Who is drunk until dusk: the Sailor or the player they chose?', 'drunk');
			emit(tx, { type: 'effect-added', effect: { kind: 'drunk', target: cmd.drunk!, by, role: 'sailor', until: 'dusk' } });
			return;
		case 'exorcist':
			if (ok && teamOf(s, s.seats[t].character) === 'demon' && reallyAlive(s, t)) {
				emit(tx, { type: 'effect-added', effect: { kind: 'exorcised', target: t, by, role: 'exorcist', until: 'dawn' } });
			}
			return;
		case 'gambler':
			if (ok && s.seats[t].character !== cmd.character) attemptDeath(tx, by, { cause: 'gambler' });
			return;
		case 'professor':
			// Choosing no one keeps the once-per-game ability for another night.
			if (t === undefined) return;
			emit(tx, { type: 'ability-spent', seat: by, ability: 'professor' });
			if (ok && teamOf(s, s.seats[t].character) === 'townsfolk') emit(tx, { type: 'revived', seat: t, by: 'professor' });
			return;
		case 'devils-advocate':
			if (ok) emit(tx, { type: 'effect-added', effect: { kind: 'survives-execution', target: t, by, role: 'devils-advocate', until: 'dusk', whileSourceWorks: true } });
			return;
		case 'godfather':
			if (ok) attemptDeath(tx, t, { cause: 'godfather' });
			return;
	}
}

// ---- death and what follows -----------------------------------------------------

interface Death {
	cause: DeathCause;
	/** The Assassin: nothing stops it. */
	ignoreProtection?: boolean;
	/** Already bounced from the Mayor once. */
	bounced?: boolean;
}

/**
 * The one door every death goes through. Protections first (the Monk, the
 * Soldier, the Innkeeper, the Tea Lady, the Sailor), then the Mayor's bounce,
 * then the Fool; the Zombuul's first death only seems real. Returns true if
 * the player died (or seemed to).
 */
function attemptDeath(tx: Tx, t: SeatId, d: Death): boolean {
	const s = tx.state;
	const v = seat(s, t);
	if (!v.alive && !v.undead) return false; // the dead cannot die again
	const night = s.phase.kind === 'night';
	if (!d.ignoreProtection) {
		const prevent = (reason: string) => { emit(tx, { type: 'kill-prevented', target: t, reason }); return false; };
		if (d.cause === 'demon' && safeFromDemon(s, t)) return prevent('protected by the Monk');
		if (d.cause === 'demon' && hasWorkingAbility(s, t, 'soldier')) return prevent('the Soldier');
		if (night && s.effects.some((e) => e.kind === 'safe-tonight' && e.target === t)) return prevent('the Innkeeper');
		if (teaLadyProtects(s, t)) return prevent('the Tea Lady');
		if (d.cause !== 'execution' && s.fabled?.some((f) => f.id === 'storm-catcher' && f.character === v.character) && v.alignment === 'good') return prevent('the Storm Catcher');
		if (abilityWorks(s, t, 'sailor')) return prevent('the Sailor');
		if (night && !d.bounced && hasWorkingAbility(s, t, 'mayor')) {
			const to = tx.answers.mayorRedirect;
			if (to === undefined) refuse('The Mayor would die tonight. Does someone else die instead? Choose them, or no one.', 'mayorRedirect');
			if (to !== null) {
				validTarget(s, to!);
				if (to === t) refuse('Choose someone other than the Mayor, or no one.');
				tx.redirected = true;
				emit(tx, { type: 'kill-redirected', from: t, to: to! });
				return attemptDeath(tx, to!, { ...d, bounced: true });
			}
		}
		if (abilityWorks(s, t, 'fool') && !s.spent.includes(`${t}:fool`)) {
			emit(tx, { type: 'ability-spent', seat: t, ability: 'fool' });
			return prevent('the Fool');
		}
	}
	// The Zombuul's first death: they seem to die, and live on.
	if (abilityWorks(s, t, 'zombuul') && !v.undead) {
		emit(tx, { type: 'seems-dead', seat: t, cause: d.cause });
		checkWin(tx);
		return true;
	}
	die(tx, t, d.cause);
	return true;
}

/** A player dies, and everything that follows from it. */
function die(tx: Tx, t: SeatId, cause: DeathCause) {
	const s = tx.state;
	const aliveBefore = living(s).length + s.seats.filter((x) => x.undead).length;
	const v = seat(s, t);
	const wasDemon = teamOf(s, v.character) === 'demon';
	const demonCharacter = v.character;
	const wasMinion = teamOf(s, v.character) === 'minion';
	emit(tx, { type: 'died', seat: t, cause });
	// The Grandmother dies with her grandchild, if the Demon killed them.
	if (cause === 'demon') {
		for (const g of tx.state.effects.filter((e) => e.kind === 'grandchild' && e.target === t)) {
			if (g.by !== null && abilityWorks(tx.state, g.by, 'grandmother')) attemptDeath(tx, g.by, { cause: 'grandmother' });
		}
	}
	// The Minstrel: a Minion dying by execution makes everyone else drunk until dusk tomorrow.
	if (cause === 'execution' && wasMinion && tx.state.day) {
		for (const m of tx.state.seats.filter((x) => abilityWorks(tx.state, x.id, 'minstrel'))) {
			for (const x of tx.state.seats) {
				if (x.id === m.id || (charDef(getScript(s.scriptId), x.character).team as string) === 'traveller') continue;
				emit(tx, { type: 'effect-added', effect: { kind: 'drunk', target: x.id, by: m.id, role: 'minstrel', until: { dusk: tx.state.day.n + 2 } } });
			}
		}
	}
	if (wasDemon) {
		const sw = scarletWomanCatches(tx.state, aliveBefore);
		if (sw !== null) emit(tx, { type: 'became-demon', seat: sw, character: demonCharacter, via: 'scarlet-woman', at: tx.place });
	}
	checkWin(tx, { demonExecuted: wasDemon && cause === 'execution' });
}

function scarletWomanCatches(s: GameState, aliveBefore: number): SeatId | null {
	if (aliveBefore < 5) return null;
	const sw = s.seats.find((x) => hasWorkingAbility(s, x.id, 'scarlet-woman'));
	return sw ? sw.id : null;
}

function starpass(tx: Tx, imp: SeatId, chosen: SeatId | undefined) {
	const s = tx.state;
	const aliveBefore = living(s).length;
	const sw = scarletWomanCatches(s, aliveBefore);
	if (sw !== null) {
		if (chosen !== undefined && chosen !== sw) refuse('The Scarlet Woman catches the starpass; she must become the Imp.');
		return die(tx, imp, 'starpass');
	}
	const minions = living(s).filter((x) => teamOf(s, x.character) === 'minion').map((x) => x.id);
	let heir: SeatId | null = null;
	if (minions.length === 1) heir = minions[0];
	if (minions.length > 1) {
		if (chosen === undefined) refuse('The Imp chose itself. Which living Minion becomes the Imp?', 'newDemon');
		if (!minions.includes(chosen!)) refuse('The new Imp must be a living Minion.');
		heir = chosen!;
	}
	if (chosen !== undefined && heir !== chosen) refuse('That player cannot become the Imp.');
	emit(tx, { type: 'died', seat: imp, cause: 'starpass' });
	if (heir !== null) emit(tx, { type: 'became-demon', seat: heir, character: 'imp', via: 'starpass', at: tx.place });
	checkWin(tx);
}

/** A player becomes another character (the Pit-Hag, the Barber, the Philosopher). A new Demon is told, and evil. */
function changeCharacter(tx: Tx, t: SeatId, character: CharacterId, by: CharacterId) {
	const s = tx.state;
	if (teamOf(s, character) === 'demon' && teamOf(s, s.seats[t].character) !== 'demon' && s.seats[t].alive) {
		emit(tx, { type: 'became-demon', seat: t, character, via: 'pit-hag', at: tx.place });
		return;
	}
	emit(tx, { type: 'character-changed', seat: t, character, believes: character, by, at: tx.place });
	// The last Demon made into something else: no Demon is left, and good wins.
	checkWin(tx);
}

/** The Snake Charmer chose the Demon: they swap characters and alignments, and the old Demon is poisoned for good. */
function snakeCharm(tx: Tx, charmer: SeatId, demon: SeatId) {
	const s = tx.state;
	const demonCharacter = s.seats[demon].character;
	emit(tx, { type: 'character-changed', seat: demon, character: 'snake-charmer', believes: 'snake-charmer', by: 'snake-charmer', at: tx.place });
	emit(tx, { type: 'alignment-changed', seat: demon, alignment: 'good' });
	emit(tx, { type: 'became-demon', seat: charmer, character: demonCharacter, via: 'snake-charmer', at: tx.place });
	emit(tx, { type: 'effect-added', effect: { kind: 'poisoned', target: demon, by: null, role: 'snake-charmer', until: 'game' } });
}

/** Both twins alive with a working Evil Twin: good cannot win. */
function twinsHold(s: GameState): boolean {
	return s.effects.some((e) => e.kind === 'twin' && e.by !== null && s.seats[e.target].alive && abilityWorks(s, e.by, 'evil-twin'));
}

/** Has anyone won? (Not during the Mastermind's extra day: that is settled by its execution.) */
function checkWin(tx: Tx, ctx: { demonExecuted?: boolean } = {}) {
	const s = tx.state;
	if (s.phase.kind === 'over' || s.mastermind) return;
	if (livingDemons(s).length === 0) {
		// The Mastermind: a Demon dead by execution means one more day, not good's win.
		if (ctx.demonExecuted && s.day && s.seats.some((x) => abilityWorks(s, x.id, 'mastermind'))) {
			return emit(tx, { type: 'mastermind-day', day: s.day.n + 1 });
		}
		// The Demon is dead, but good cannot win while both twins live (two left, and evil wins).
		if (!twinsHold(s)) return emit(tx, { type: 'game-over', winner: 'good', reason: 'The Demon is dead.' });
	}
	// Travellers do not count: a Traveller and two others alive, and evil has won.
	const alive = s.seats.filter((x) => (x.alive || x.undead) && !x.traveller).length;
	if (alive <= 2) {
		return emit(tx, { type: 'game-over', winner: 'evil', reason: 'Only two players are left alive.' });
	}
}

function tell(tx: Tx, kind: string, to: SeatId, cmd: Extract<Command, { type: 'tell' }>) {
	const s = tx.state;
	const v = judgeInfo(s, to, kind, cmd.info);
	if (!v.wellFormed) refuse(v.reason);
	const droisoned = isDroisoned(s, to);
	// With a working Vortox, every Townsfolk's information is false (the Mathematician's count is the Storyteller's to judge).
	const vortox = vortoxWorks(s) && kind !== 'mathematician' && getScript(s.scriptId).characters.find((c) => c.id === kind)?.team === 'townsfolk';
	const fits = vortox ? !v.truthful : v.truthful;
	if (!fits && !droisoned && !cmd.override) {
		if (vortox) refuse(`The Vortox is in play: ${s.seats[to].name} must be told something false.`);
		refuse(`That would be false, and ${s.seats[to].name} is neither drunk nor poisoned. ${v.reason}`);
	}
	emit(tx, { type: 'info-given', to, role: kind, info: cmd.info, truthful: v.truthful, override: !fits && !droisoned });
	if (kind === 'seamstress') emit(tx, { type: 'ability-spent', seat: to, ability: 'seamstress' });
	if (kind === 'juggler') emit(tx, { type: 'ability-spent', seat: to, ability: 'juggler' });
	// The Grandmother's grandchild is whoever she was shown.
	if (kind === 'grandmother' && cmd.info.kind === 'reveal') {
		emit(tx, { type: 'effect-added', effect: { kind: 'grandchild', target: cmd.info.player, by: to, role: 'grandmother', until: 'game' } });
	}
}

/** The Moonchild's curse, at their place in the night: a good player chosen dies. */
function moonchildCurse(tx: Tx, by: SeatId) {
	const s = tx.state;
	const curse = s.effects.find((e) => e.kind === 'moonchild' && e.by === by);
	if (!curse) return;
	emit(tx, { type: 'effects-ended', match: { kind: 'moonchild', by } });
	// What counts is the Moonchild's state tonight, and the target's alignment when chosen.
	if (s.seats[by].character === 'moonchild' && !isDroisoned(s, by) && curse.note === 'good') attemptDeath(tx, curse.target, { cause: 'moonchild' });
}

// ---- day ------------------------------------------------------------------------

function requireDay(s: GameState) {
	if (s.phase.kind !== 'day' || !s.day) refuse('It is not day.');
	return s.day!;
}

function openNomination(s: GameState) {
	// A Virgin's execution closes the day's nominations without a vote.
	if (!s.day || s.day.executed !== null) return null;
	const noms = s.day.nominations;
	const last = noms[noms.length - 1];
	return last && last.votes === null ? last : null;
}

function nominate(tx: Tx, cmd: Extract<Command, { type: 'nominate' }>) {
	const s = tx.state;
	const day = requireDay(s);
	const { nominator, nominee } = cmd;
	validTarget(s, nominator);
	validTarget(s, nominee);
	if (day.executed !== null) refuse('Someone has been executed today; there are no more nominations.');
	if (day.stage !== 'nominations') refuse('Open nominations first.');
	if (openNomination(s)) refuse('Count the votes on the current nomination first.');
	if (!seat(s, nominator).alive) refuse('Dead players cannot nominate.');
	if (day.nominations.some((n) => n.nominator === nominator)) refuse(`${seat(s, nominator).name} has already nominated today.`);
	if (day.nominations.some((n) => n.nominee === nominee)) refuse(`${seat(s, nominee).name} has already been nominated today.`);
	if (seat(s, nominee).traveller) refuse('Travellers are exiled, not executed: call for an exile instead.');

	emit(tx, { type: 'nominated', nominator, nominee });
	// The Witch's curse: nominating kills them (the nomination stands). Not with three or fewer alive.
	if (s.effects.some((e) => e.kind === 'cursed' && e.target === nominator && inForce(s, e)) && living(s).length > 3) attemptDeath(tx, nominator, { cause: 'witch' });

	// The Virgin: only her first nomination counts, working or not.
	const v = seat(s, nominee);
	if (v.character === 'virgin' && v.alive && !s.spent.includes(`${nominee}:virgin`)) {
		emit(tx, { type: 'ability-spent', seat: nominee, ability: 'virgin' });
		if (!isDroisoned(s, nominee)) {
			let townsfolk = mustRegisterAsTeam(s, nominator, 'townsfolk');
			if (!townsfolk && canRegisterAsTeam(s, nominator, 'townsfolk')) {
				if (cmd.nominatorIsTownsfolk === undefined) {
					refuse(`${seat(s, nominator).name} might register as a Townsfolk to the Virgin. Do they?`, 'nominatorIsTownsfolk');
				}
				townsfolk = cmd.nominatorIsTownsfolk!;
			}
			if (townsfolk) execute(tx, nominator);
		}
	}
}

function vote(tx: Tx, cmd: Extract<Command, { type: 'vote' }>) {
	const s = tx.state;
	const day = requireDay(s);
	const nom = openNomination(s);
	if (!nom) refuse('There is no nomination to vote on.');
	const voters = [...cmd.voters];
	if (new Set(voters).size !== voters.length) refuse('Someone is counted twice.');
	for (const v of voters) {
		validTarget(s, v);
		const p = seat(s, v);
		if (!p.alive && !p.ghostVote) refuse(`${p.name} is dead and has used their vote.`);
	}
	// The Butler may only raise their hand if their master does. If they vote anyway, the
	// rules say to count it (not doing so would reveal the Butler) and have a word later.
	const master = butlerMaster(s);
	const butlerSlips = voters.filter((v) => hasWorkingAbility(s, v, 'butler') && master !== null && !voters.includes(master));
	// The Voudon: only the dead and the Voudon vote, freely, and the most votes wins.
	const voudon = s.seats.some((x) => abilityWorks(s, x.id, 'voudon'));
	if (voudon) for (const v of voters) if (seat(s, v).alive && seat(s, v).character !== 'voudon') refuse('With the Voudon in play, only the dead and the Voudon vote.');
	// The Bureaucrat's choice counts three times; the Thief's counts minus one.
	const weight = (v: SeatId) => (s.effects.some((e) => e.kind === 'vote-x3' && e.target === v && inForce(s, e)) ? 3 : 1)
		* (s.effects.some((e) => e.kind === 'vote-minus' && e.target === v && inForce(s, e)) ? -1 : 1);
	const votes = voters.reduce((n, v) => n + weight(v), 0);
	const needed = voudon ? 1 : Math.ceil(living(s).length / 2);
	let outcome: 'on-the-block' | 'tied' | 'not-enough' = 'not-enough';
	if (votes >= needed && votes > day.highest) outcome = 'on-the-block';
	else if (votes >= needed && votes === day.highest) outcome = 'tied';
	emit(tx, {
		type: 'vote-tallied',
		nominee: nom!.nominee,
		voters,
		ghostsSpent: voudon ? [] : voters.filter((v) => !seat(s, v).alive),
		votes,
		needed,
		outcome
	});
	for (const v of butlerSlips) {
		emit(tx, { type: 'note', text: `${seat(s, v).name}, the Butler, voted without their master (${seat(s, master!).name}). Counted anyway; a quiet word later.` });
	}
}

function slay(tx: Tx, cmd: Extract<Command, { type: 'slay' }>) {
	const s = tx.state;
	requireDay(s);
	const { by, target } = cmd;
	validTarget(s, by);
	validTarget(s, target);
	const slayer = seat(s, by);
	if (!slayer.alive) refuse('Dead players cannot use day abilities.');
	if (s.spent.includes(`${by}:slayer`)) refuse(`${slayer.name} has already taken their shot.`);
	// Anyone may claim to be the Slayer and "shoot"; only a working Slayer can hit.
	let hit = false;
	if (hasWorkingAbility(s, by, 'slayer') && seat(s, target).alive) {
		hit = mustRegisterAsTeam(s, target, 'demon');
		if (!hit && canRegisterAsTeam(s, target, 'demon')) {
			if (cmd.targetIsDemon === undefined) refuse(`${seat(s, target).name} might register as the Demon. Do they?`, 'targetIsDemon');
			hit = cmd.targetIsDemon!;
		}
	}
	if (slayer.character === 'slayer' || slayer.believes === 'slayer') emit(tx, { type: 'ability-spent', seat: by, ability: 'slayer' });
	emit(tx, { type: 'slayer-shot', by, target, hit });
	if (hit) attemptDeath(tx, target, { cause: 'slayer' });
}

/**
 * The one door for executions. The execution itself always happens (and is
 * the day's one execution); whether the player dies is another matter.
 */
function execute(tx: Tx, id: SeatId) {
	const s = tx.state;
	emit(tx, { type: 'executed', seat: id });
	// The Mastermind's extra day: whoever is executed, their team loses, die or not.
	if (s.mastermind && s.day && s.day.n === s.mastermind.day) {
		const evil = s.seats[id].alignment === 'evil';
		return emit(tx, { type: 'game-over', winner: evil ? 'good' : 'evil', reason: `The Mastermind's day: ${s.seats[id].name} was executed.` });
	}
	const twin = s.effects.find((e) => e.kind === 'twin' && e.target === id);
	if (twin && twin.by !== null && abilityWorks(s, twin.by, 'evil-twin')) {
		return emit(tx, { type: 'game-over', winner: 'evil', reason: `The good twin, ${s.seats[id].name}, was executed.` });
	}
	const v = seat(tx.state, id);
	if (!v.alive && !v.undead) return; // executing the dead kills no one
	const survive = (reason: string) => emit(tx, { type: 'survived-execution', seat: id, reason });
	const st = tx.state;
	if (st.effects.some((e) => e.kind === 'survives-execution' && e.target === id && inForce(st, e))) return survive('the Devil’s Advocate');
	if (teaLadyProtects(st, id)) return survive('the Tea Lady');
	if (abilityWorks(st, id, 'sailor')) return survive('the Sailor');
	if (abilityWorks(st, id, 'fool') && !st.spent.includes(`${id}:fool`)) {
		emit(tx, { type: 'ability-spent', seat: id, ability: 'fool' });
		return survive('the Fool');
	}
	if (v.alignment === 'good' && st.seats.some((x) => abilityWorks(st, x.id, 'pacifist'))) {
		const saved = tx.answers.executionSurvives;
		if (saved === undefined) refuse(`${v.name} is good and the Pacifist is in play. Do they survive the execution?`, 'executionSurvives');
		if (saved) return survive('the Pacifist');
	}
	if (abilityWorks(st, id, 'zombuul') && !v.undead) {
		emit(tx, { type: 'seems-dead', seat: id, cause: 'execution' });
		return checkWin(tx);
	}
	if (hasWorkingAbility(st, id, 'saint')) {
		emit(tx, { type: 'died', seat: id, cause: 'execution' });
		return emit(tx, { type: 'game-over', winner: 'evil', reason: 'The Saint was executed.' });
	}
	die(tx, id, 'execution');
}

function endDay(tx: Tx) {
	const s = tx.state;
	const day = requireDay(s);
	if (openNomination(s)) refuse('Count the votes on the current nomination first.');
	if (day.executed === null) {
		if (day.block !== null) {
			execute(tx, day.block);
		} else if (s.mastermind && s.mastermind.day === day.n) {
			emit(tx, { type: 'game-over', winner: 'good', reason: 'The Mastermind’s day ended with no execution.' });
		} else {
			const mayor = s.seats.find((x) => hasWorkingAbility(s, x.id, 'mayor'));
			if (mayor && living(s).filter((x) => !x.traveller).length === 3) {
				emit(tx, { type: 'game-over', winner: 'good', reason: 'Three players live, no one was executed, and the Mayor stands.' });
			}
		}
	}
	if (tx.state.phase.kind !== 'over' && tx.state.day?.executed === null && vortoxWorks(tx.state)) {
		emit(tx, { type: 'game-over', winner: 'evil', reason: 'No one was executed while the Vortox lives.' });
	}
	if (tx.state.phase.kind !== 'over') emit(tx, { type: 'night-began', n: day.n + 1 });
}

function juggle(tx: Tx, cmd: Extract<Command, { type: 'juggle' }>) {
	const s = tx.state;
	requireDay(s);
	validTarget(s, cmd.by);
	if (!s.seats[cmd.by].alive) refuse('Dead players cannot juggle.');
	if (s.spent.includes(`${cmd.by}:juggle`)) refuse('The Juggler juggles once, on their first day.');
	if (!cmd.guesses.length || cmd.guesses.length > 5) refuse('The Juggler makes one to five guesses.');
	const script = getScript(s.scriptId);
	for (const g of cmd.guesses) {
		validTarget(s, g.player);
		if (!script.characters.some((c) => c.id === g.character)) refuse(`"${g.character}" is not on ${script.name}.`);
	}
	if (new Set(cmd.guesses.map((g) => g.player)).size !== cmd.guesses.length) refuse('One guess per player.');
	emit(tx, { type: 'note', text: `${s.seats[cmd.by].name} juggles: ${cmd.guesses.map((g) => `${s.seats[g.player].name} is the ${charDef(script, g.character).name}`).join('; ')}.` });
	emit(tx, { type: 'ability-spent', seat: cmd.by, ability: 'juggle' });
	if (s.seats[cmd.by].character !== 'juggler') return;
	for (const g of cmd.guesses) emit(tx, { type: 'effect-added', effect: { kind: 'juggled', target: g.player, by: cmd.by, role: 'juggler', until: 'game', note: g.character } });
}

function travellerJoins(tx: Tx, cmd: Extract<Command, { type: 'traveller-joins' }>) {
	const s = tx.state;
	if (s.phase.kind !== 'day' && s.phase.kind !== 'night') refuse('Travellers join once the game has begun.');
	const name = cmd.name.trim();
	if (!name) refuse('The Traveller needs a name.');
	if (s.seats.some((x) => x.name.toLowerCase() === name.toLowerCase())) refuse('Two players share a name.');
	if (s.seats.length >= MAX_PLAYERS + 5) refuse('The circle is full.');
	validTarget(s, cmd.after);
	const script = getScript(s.scriptId);
	const def = (script.travellers ?? []).find((c) => c.id === cmd.character);
	if (!def) refuse(`"${cmd.character}" is not a Traveller for ${script.name}.`);
	if (s.seats.some((x) => x.character === cmd.character)) refuse('That Traveller is already in play.');
	if (cmd.alignment !== 'good' && cmd.alignment !== 'evil') refuse('Choose the Traveller\u2019s alignment.');
	emit(tx, { type: 'traveller-joined', seat: s.seats.length, name, character: cmd.character, alignment: cmd.alignment, after: cmd.after });
}

/** An exile: a group decision, not a vote; no ability touches it (but the Deviant's). */
function exile(tx: Tx, cmd: Extract<Command, { type: 'exile' }>) {
	const s = tx.state;
	requireDay(s);
	validTarget(s, cmd.traveller);
	const t = s.seats[cmd.traveller];
	if (!t.traveller) refuse('Only Travellers are exiled; others are executed.');
	if (!t.alive) refuse(`${t.name} is already dead.`);
	if (openNomination(s)) refuse('Count the votes on the current nomination first.');
	for (const v of cmd.supporters) validTarget(s, v);
	if (new Set(cmd.supporters).size !== cmd.supporters.length) refuse('Someone is counted twice.');
	const needed = Math.ceil(living(s).length / 2);
	const passed = cmd.supporters.length >= needed;
	emit(tx, { type: 'exile-decided', seat: cmd.traveller, supporters: [...cmd.supporters], needed, passed });
	if (!passed) return;
	if (abilityWorks(s, cmd.traveller, 'deviant')) {
		if (cmd.deviantFunny === undefined) refuse('Was the Deviant funny today?', 'deviantFunny');
		if (cmd.deviantFunny) return emit(tx, { type: 'kill-prevented', target: cmd.traveller, reason: 'the Deviant' });
	}
	emit(tx, { type: 'died', seat: cmd.traveller, cause: 'exile' });
	checkWin(tx);
}

function gunslinger(tx: Tx, cmd: Extract<Command, { type: 'gunslinger' }>) {
	const s = tx.state;
	const day = requireDay(s);
	validTarget(s, cmd.by);
	validTarget(s, cmd.target);
	if (!s.seats[cmd.by].alive) refuse('The dead have no ability.');
	const first = day.nominations.find((n) => n.votes !== null);
	if (!first) refuse('The Gunslinger shoots after the first vote of the day is counted.');
	if (!(first!.voters ?? []).includes(cmd.target)) refuse('The Gunslinger shoots a player who voted in the first vote today.');
	if (s.spent.includes(`${cmd.by}:gunslinger@${day.n}`)) refuse('One shot a day.');
	emit(tx, { type: 'ability-spent', seat: cmd.by, ability: `gunslinger@${day.n}` });
	if (works(tx, cmd.by, 'gunslinger')) attemptDeath(tx, cmd.target, { cause: 'gunslinger' });
}

function judge(tx: Tx, cmd: Extract<Command, { type: 'judge' }>) {
	const s = tx.state;
	const day = requireDay(s);
	validTarget(s, cmd.by);
	if (!s.seats[cmd.by].alive) refuse('The dead have no ability.');
	if (s.spent.includes(`${cmd.by}:judge`)) refuse('The Judge rules once a game.');
	if (day.executed !== null) refuse('Someone has already been executed today.');
	const nom = day.nominations[day.nominations.length - 1];
	if (!nom) refuse('The Judge rules on a nomination.');
	if (nom!.nominator === cmd.by) refuse('The Judge rules on another player\u2019s nomination.');
	emit(tx, { type: 'ability-spent', seat: cmd.by, ability: 'judge' });
	if (!works(tx, cmd.by, 'judge')) return;
	emit(tx, { type: 'judged', by: cmd.by, nominee: nom!.nominee, verdict: cmd.verdict });
	if (cmd.verdict === 'condemn') execute(tx, nom!.nominee);
}

function klutz(tx: Tx, cmd: Extract<Command, { type: 'klutz' }>) {
	const s = tx.state;
	if (s.phase.kind !== 'day' && s.phase.kind !== 'night') refuse('The game has not begun.');
	validTarget(s, cmd.by);
	validTarget(s, cmd.target);
	if (s.seats[cmd.by].alive) refuse('The Klutz chooses when they learn they have died.');
	if (!s.seats[cmd.target].alive) refuse('The Klutz chooses a living player.');
	if (s.spent.includes(`${cmd.by}:klutz`)) refuse('The Klutz has already chosen.');
	emit(tx, { type: 'note', text: `${s.seats[cmd.by].name} (as the Klutz) chooses ${s.seats[cmd.target].name}.` });
	if (s.seats[cmd.by].character !== 'klutz') return;
	emit(tx, { type: 'ability-spent', seat: cmd.by, ability: 'klutz' });
	if (!isDroisoned(s, cmd.by) && s.seats[cmd.target].alignment === 'evil') {
		emit(tx, { type: 'game-over', winner: 'evil', reason: `The Klutz chose ${s.seats[cmd.target].name}, who is evil.` });
	}
}

function gossip(tx: Tx, cmd: Extract<Command, { type: 'gossip' }>) {
	const s = tx.state;
	requireDay(s);
	validTarget(s, cmd.by);
	if (!s.seats[cmd.by].alive) refuse('The dead have no ability: the statement does nothing.');
	emit(tx, { type: 'gossiped', by: cmd.by, true: cmd.true });
}

function moonchild(tx: Tx, cmd: Extract<Command, { type: 'moonchild' }>) {
	const s = tx.state;
	if (s.phase.kind !== 'day' && s.phase.kind !== 'night') refuse('The game has not begun.');
	validTarget(s, cmd.by);
	validTarget(s, cmd.target);
	if (s.seats[cmd.by].alive) refuse('The Moonchild chooses when they learn they have died.');
	if (!s.seats[cmd.target].alive) refuse('The Moonchild chooses a living player.');
	if (s.effects.some((e) => e.kind === 'moonchild' && e.by === cmd.by) || s.spent.includes(`${cmd.by}:moonchild`)) refuse('The Moonchild has already chosen.');
	emit(tx, { type: 'note', text: `${s.seats[cmd.by].name} (as the Moonchild) chooses ${s.seats[cmd.target].name}.` });
	// Only a real Moonchild curses; a bluffer's choice is played along with and does nothing.
	if (s.seats[cmd.by].character !== 'moonchild') return;
	// Once for each death (coming back to life clears it).
	emit(tx, { type: 'ability-spent', seat: cmd.by, ability: 'moonchild' });
	const good = s.seats[cmd.target].alignment === 'good';
	emit(tx, { type: 'effect-added', effect: { kind: 'moonchild', target: cmd.target, by: cmd.by, role: 'moonchild', until: 'game', note: good ? 'good' : 'evil' } });
}

// ---- the Storyteller's hand -----------------------------------------------------

function adjust(tx: Tx, cmd: Extract<Command, { type: 'adjust' }>) {
	const s = tx.state;
	if (!s.seats.length || !s.seats[0].character) refuse('Deal the characters first.');
	validTarget(s, cmd.seat);
	const script = getScript(s.scriptId);
	const known = (c: CharacterId) => script.characters.some((d) => d.id === c) || refuse(`"${c}" is not on ${script.name}.`);
	let { character, believes } = cmd;
	if (character !== undefined) {
		known(character);
		// A new token: the player is told it, unless they are now the Drunk.
		if (believes === undefined && character !== 'drunk') believes = character;
		if (character === 'drunk' && believes === undefined) refuse('Choose the Townsfolk the Drunk thinks they are.', 'drunkBelieves');
	}
	if (believes !== undefined) known(believes);
	const e: GameEvent = { type: 'adjusted', seat: cmd.seat };
	if (cmd.alive !== undefined) e.alive = cmd.alive;
	if (cmd.ghostVote !== undefined) e.ghostVote = cmd.ghostVote;
	if (character !== undefined) e.character = character;
	if (believes !== undefined) e.believes = believes;
	emit(tx, e);
	if (s.phase.kind === 'night' || s.phase.kind === 'day') checkWin(tx);
}

// ---- convenience --------------------------------------------------------------

/** Apply a list of commands, stopping at the first refusal. Handy for tests and scripted setups. */
export function performAll(state: GameState, cmds: Command[]): Result {
	let cur = state;
	const events: GameEvent[] = [];
	for (const c of cmds) {
		const r = perform(cur, c);
		if (!r.ok) return r;
		events.push(...r.events);
		cur = r.state;
	}
	return { ok: true, events, state: cur };
}

export { registrations };
