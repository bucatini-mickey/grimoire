/**
 * engine.ts - the Storyteller's commands, judged against the rules.
 *
 * `perform(state, command)` either refuses with a plain-English reason, or
 * returns the events the command causes. It never half-applies: a command
 * that fails part-way leaves the game untouched.
 *
 * Where the rules leave a choice to the Storyteller (does the Spy register as
 * a Townsfolk? does the Mayor's death bounce?), the command must say. If it
 * does not and the choice really is open, the engine refuses with a
 * `decision` naming what it needs, so the UI can ask and resubmit.
 */
import type { CharacterId, DeathCause, GameEvent, GameState, Info, SeatId } from './types.ts';
import { reduce } from './state.ts';
import { charDef, expectedComposition, getScript, teamAlignment, evilLearnEachOther, MIN_PLAYERS, MAX_PLAYERS } from './script.ts';
import {
	hasWorkingAbility, isDroisoned, judgeInfo, living, livingDemons, registrations, seat, teamOf,
	canRegisterAsTeam, mustRegisterAsTeam
} from './rules.ts';
import { REVEAL, MINION_INFO, DEMON_INFO, NEW_DEMON, nextStep, stepAction } from './night.ts';

export type Command =
	| { type: 'create'; names: string[]; scriptId?: string }
	| {
			type: 'assign';
			characters: CharacterId[];
			/** Only for the Drunk: the Townsfolk they are told they are. */
			drunkBelieves?: CharacterId;
			redHerring?: SeatId | null;
			bluffs: CharacterId[];
			/** Allow team counts that differ from the standard table. */
			allowNonstandard?: boolean;
	  }
	| { type: 'begin' }
	/** Resolve a step with nothing to choose (evil team info, Spy, a new Demon being told). */
	| { type: 'acknowledge' }
	/** Resolve a choosing step (Poisoner, Monk, Butler, Imp). */
	| { type: 'choose'; target: SeatId; mayorRedirect?: SeatId | null; newDemon?: SeatId }
	/** Resolve an information step. `override` allows false info to a sober, healthy player. */
	| { type: 'tell'; info: Info; override?: boolean }
	| { type: 'skip'; reason: string }
	| { type: 'end-night' }
	| { type: 'open-nominations' }
	/** Two players change places in the circle (the Storyteller moving people mid-game). */
	| { type: 'swap-seats'; a: SeatId; b: SeatId }
	| { type: 'nominate'; nominator: SeatId; nominee: SeatId; nominatorIsTownsfolk?: boolean }
	| { type: 'vote'; voters: SeatId[] }
	| { type: 'slay'; by: SeatId; target: SeatId; targetIsDemon?: boolean }
	| { type: 'end-day' }
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
}

function emit(tx: Tx, e: GameEvent) {
	tx.events.push(e);
	tx.state = reduce(tx.state, e);
}

export function perform(state: GameState, cmd: Command): Result {
	const tx: Tx = { state, events: [] };
	try {
		if (state.phase.kind === 'over' && cmd.type !== 'note') refuse('The game is over.');
		handle(tx, cmd);
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
	if (kind === REVEAL) return `${state.seats[seatId!].name}, to learn their character`;
	if (kind === MINION_INFO) return `${state.seats[seatId!].name}, to learn their Demon`;
	if (kind === DEMON_INFO) return `${state.seats[seatId!].name}, to learn their Minions and bluffs`;
	if (kind === NEW_DEMON) return `the new Imp${who}`;
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
	getScript(scriptId);
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

	const counts = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
	for (const c of chars) counts[charDef(script, c).team]++;
	if (counts.demon !== 1) refuse('There must be exactly one Demon.');
	const want = expectedComposition(script, chars.length, chars);
	const same = (Object.keys(want) as (keyof typeof want)[]).every((k) => want[k] === counts[k]);
	if (!same && !cmd.allowNonstandard) {
		refuse(`For ${chars.length} players this script expects ${want.townsfolk} Townsfolk, ${want.outsider} Outsiders, ` +
			`${want.minion} Minions, ${want.demon} Demon. Got ${counts.townsfolk}/${counts.outsider}/${counts.minion}/${counts.demon}.`);
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

	const needsHerring = believes.includes('fortune-teller');
	const rh = cmd.redHerring ?? null;
	if (rh !== null) {
		if (!s.seats[rh]) refuse('The red herring must be a seat.');
		if (teamAlignment(charDef(script, chars[rh]).team) !== 'good') refuse('The red herring must be a good player.');
	} else if (needsHerring) {
		refuse('Choose the Fortune Teller’s red herring: a good player.', 'redHerring');
	}

	const bluffs = cmd.bluffs;
	const wantBluffs = evilLearnEachOther(chars.length) ? 3 : 0;
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
		bluffs: [...bluffs]
	});
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
		return emit(tx, { type: 'step-skipped', step: id, reason: cmd.reason.trim() });
	}
	const action = stepAction(kind);
	if (cmd.type !== action) refuse(`Next to wake is ${describeStep(s, kind, who)}, who needs "${action}", not "${cmd.type}".`);

	if (cmd.type === 'acknowledge') {
		if (kind === REVEAL) emit(tx, { type: 'role-shown', to: who! });
		else if (kind === MINION_INFO) emit(tx, { type: 'evil-info-shown', to: who!, as: 'minion' });
		else if (kind === DEMON_INFO) emit(tx, { type: 'evil-info-shown', to: who!, as: 'demon' });
		else if (kind === NEW_DEMON) emit(tx, { type: 'demon-told', to: who! });
		else if (kind === 'spy') emit(tx, { type: 'grimoire-shown', to: who! });
	} else if (cmd.type === 'choose') {
		choose(tx, kind, who!, cmd);
	} else {
		tell(tx, kind, who!, cmd);
	}
	if (tx.state.phase.kind !== 'over') emit(tx, { type: 'step-done', step: id });
}

function validTarget(s: GameState, t: SeatId) {
	if (!Number.isInteger(t) || !s.seats[t]) refuse('Choose a player in the circle.');
}

function choose(tx: Tx, kind: string, by: SeatId, cmd: Extract<Command, { type: 'choose' }>) {
	const s = tx.state;
	const t = cmd.target;
	validTarget(s, t);
	const effective = !isDroisoned(s, by) && seat(s, by).character === kind;

	if ((kind === 'monk' || kind === 'butler') && t === by) refuse(`The ${charDef(getScript(s.scriptId), kind).name} must choose another player.`);
	if (kind !== 'imp') return emit(tx, { type: 'chose', by, role: kind, targets: [t], effective });

	emit(tx, { type: 'chose', by, role: 'imp', targets: [t], effective });
	if (!effective) return;
	if (t === by) return starpass(tx, by, cmd.newDemon);
	demonAttack(tx, t, cmd.mayorRedirect);
}

/** Why a Demon attack on `t` fails, or null if it lands. */
function attackStopped(s: GameState, t: SeatId): string | null {
	if (!seat(s, t).alive) return 'already dead';
	if (s.night?.protectedSeat === t) return 'protected by the Monk';
	if (hasWorkingAbility(s, t, 'soldier')) return 'the Soldier';
	return null;
}

function demonAttack(tx: Tx, target: SeatId, mayorRedirect: SeatId | null | undefined) {
	let t = target;
	const stopped = attackStopped(tx.state, t);
	if (stopped) {
		if (stopped !== 'already dead') emit(tx, { type: 'kill-prevented', target: t, reason: stopped });
		return;
	}
	if (hasWorkingAbility(tx.state, t, 'mayor')) {
		if (mayorRedirect === undefined) {
			refuse('The Demon attacked the Mayor. Does someone else die instead? Choose them, or no one.', 'mayorRedirect');
		}
		if (mayorRedirect !== null) {
			validTarget(tx.state, mayorRedirect!);
			if (mayorRedirect === t) refuse('Choose someone other than the Mayor, or no one.');
			emit(tx, { type: 'kill-redirected', from: t, to: mayorRedirect! });
			t = mayorRedirect!;
			const again = attackStopped(tx.state, t);
			if (again) {
				if (again !== 'already dead') emit(tx, { type: 'kill-prevented', target: t, reason: again });
				return;
			}
		}
	} else if (mayorRedirect !== undefined && mayorRedirect !== null) {
		refuse('Only an attack on a working Mayor can be redirected.');
	}
	kill(tx, t, 'demon');
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
		return kill(tx, imp, 'starpass');
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
	if (heir !== null) emit(tx, { type: 'became-demon', seat: heir, character: 'imp', via: 'starpass' });
	checkWin(tx);
}

/** A player dies. Handles the Scarlet Woman and checks for a winner. */
function kill(tx: Tx, id: SeatId, cause: DeathCause) {
	const s = tx.state;
	if (!seat(s, id).alive) return;
	const aliveBefore = living(s).length;
	const wasDemon = teamOf(s, seat(s, id).character) === 'demon';
	const demonCharacter = seat(s, id).character;
	emit(tx, { type: 'died', seat: id, cause });
	if (wasDemon) {
		const sw = scarletWomanCatches(tx.state, aliveBefore);
		if (sw !== null) emit(tx, { type: 'became-demon', seat: sw, character: demonCharacter, via: 'scarlet-woman' });
	}
	checkWin(tx);
}

function checkWin(tx: Tx) {
	const s = tx.state;
	if (s.phase.kind === 'over') return;
	if (livingDemons(s).length === 0) {
		return emit(tx, { type: 'game-over', winner: 'good', reason: 'The Demon is dead.' });
	}
	if (living(s).length <= 2) {
		return emit(tx, { type: 'game-over', winner: 'evil', reason: 'Only two players are left alive.' });
	}
}

function tell(tx: Tx, kind: string, to: SeatId, cmd: Extract<Command, { type: 'tell' }>) {
	const s = tx.state;
	const v = judgeInfo(s, to, kind, cmd.info);
	if (!v.wellFormed) refuse(v.reason);
	const droisoned = isDroisoned(s, to);
	if (!v.truthful && !droisoned && !cmd.override) {
		refuse(`That would be false, and ${s.seats[to].name} is neither drunk nor poisoned. ${v.reason}`);
	}
	emit(tx, { type: 'info-given', to, role: kind, info: cmd.info, truthful: v.truthful, override: !v.truthful && !droisoned });
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

	emit(tx, { type: 'nominated', nominator, nominee });

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
	// The Butler may only raise their hand if their master does.
	for (const v of voters) {
		if (hasWorkingAbility(s, v, 'butler') && s.butlerMaster !== null && !voters.includes(s.butlerMaster)) {
			refuse(`${seat(s, v).name} is the Butler and may only vote if ${seat(s, s.butlerMaster).name} votes.`);
		}
	}
	const votes = voters.length;
	const needed = Math.ceil(living(s).length / 2);
	let outcome: 'on-the-block' | 'tied' | 'not-enough' = 'not-enough';
	if (votes >= needed && votes > day.highest) outcome = 'on-the-block';
	else if (votes >= needed && votes === day.highest) outcome = 'tied';
	emit(tx, {
		type: 'vote-tallied',
		nominee: nom!.nominee,
		voters,
		ghostsSpent: voters.filter((v) => !seat(s, v).alive),
		votes,
		needed,
		outcome
	});
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
	if (hit) kill(tx, target, 'slayer');
}

/** Execute a player. Executing the dead is allowed; it just kills no one. */
function execute(tx: Tx, id: SeatId) {
	const s = tx.state;
	emit(tx, { type: 'executed', seat: id });
	if (!seat(s, id).alive) return;
	if (hasWorkingAbility(s, id, 'saint')) {
		emit(tx, { type: 'died', seat: id, cause: 'execution' });
		return emit(tx, { type: 'game-over', winner: 'evil', reason: 'The Saint was executed.' });
	}
	kill(tx, id, 'execution');
}

function endDay(tx: Tx) {
	const s = tx.state;
	const day = requireDay(s);
	if (openNomination(s)) refuse('Count the votes on the current nomination first.');
	if (day.executed === null) {
		if (day.block !== null) {
			execute(tx, day.block);
		} else {
			const mayor = s.seats.find((x) => hasWorkingAbility(s, x.id, 'mayor'));
			if (mayor && living(s).length === 3) {
				emit(tx, { type: 'game-over', winner: 'good', reason: 'Three players live, no one was executed, and the Mayor stands.' });
			}
		}
	}
	if (tx.state.phase.kind !== 'over') emit(tx, { type: 'night-began', n: day.n + 1 });
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
