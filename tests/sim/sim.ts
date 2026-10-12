/**
 * sim.ts - a robot Storyteller and robot players, playing whole games at
 * random (Trouble Brewing and Bad Moon Rising), with the rules checked after
 * every event.
 *
 * The robots mostly play sensibly (wake in order, nominate, vote) but now and
 * then try something illegal, to make sure the engine refuses it. When the
 * engine asks the Storyteller a question (does the Mayor's death bounce?
 * which Minion catches the starpass? who is the Sailor's drunk?), the robot
 * answers at random.
 *
 * Everything is seeded: the same seed plays the same game. When a check
 * fails, `shrink` cuts the game down to the fewest commands that still fail.
 *
 * The checks (see Checker) are the rules written a second way, independent
 * of how engine.ts implements them, so a slip in either shows up. The
 * robots may use the engine's helpers (they only propose); the checker may not.
 */
import { readFileSync } from 'node:fs';
import {
	emptyState, perform, reduce, replay, nextStep, nightSteps, stepAction, getScript, randomDeal, rng, pickSpec,
	living, infoCandidates, teamAlignment, charDef, canRegisterAsTeam, NEW_DEMON
} from '../../src/core/index.ts';
import type { Command, GameEvent, GameState, Info, SeatId, Script } from '../../src/core/index.ts';
import { publicView, cardFor } from '../../src/net/views.ts';

const NAMES = 'Ada Bram Cael Dorn Esme Fenn Gwen Hal Isolde Jory Kit Lior Maud Ned Orla'.split(' ');
/** A game that has not ended after this many commands is called a draw (and counted). */
const MAX_COMMANDS = 1500;
/** The scripts the robots play, by name. */
export const SIM_SCRIPTS = ['trouble-brewing', 'bad-moon-rising', 'sects-and-violets'];

export interface Violation {
	rule: string;
	detail: string;
	/** How many commands had been accepted when it happened. */
	at: number;
}

export interface Played {
	seed: number;
	scriptId: string;
	/** The accepted commands, in order: replaying them rebuilds the game. */
	commands: Command[];
	state: GameState;
	violations: Violation[];
	refusals: number;
	/** What happened, for coverage: event types and notable interactions. */
	stats: Record<string, number>;
}

// ---- the robots -----------------------------------------------------------------

type Rand = () => number;
const pick = <T>(xs: T[], r: Rand): T => xs[Math.floor(r() * xs.length)];
const chance = (p: number, r: Rand) => r() < p;
const seats = (s: GameState) => s.seats.map((x) => x.id);
const alive = (s: GameState) => living(s).map((x) => x.id);
const scriptOf = (s: GameState) => getScript(s.scriptId);

function openNomination(s: GameState) {
	if (!s.day || s.day.executed !== null) return null;
	const last = s.day.nominations[s.day.nominations.length - 1];
	return last && last.votes === null ? last : null;
}

/** Players whose characters make for the trickiest rulings: the robots aim at them more often. */
const TRICKY = new Set([
	'saint', 'slayer', 'virgin', 'soldier', 'mayor', 'monk', 'recluse', 'spy', 'scarlet-woman', 'ravenkeeper', 'butler', 'poisoner',
	'goon', 'fool', 'tea-lady', 'sailor', 'grandmother', 'moonchild', 'tinker', 'pacifist', 'minstrel', 'zombuul', 'lunatic', 'innkeeper', 'professor', 'gossip',
	'gunslinger', 'judge', 'voudon', 'bureaucrat', 'thief', 'deviant', 'klutz', 'mutant', 'sweetheart', 'barber', 'sage', 'evil-twin', 'witch', 'vortox', 'fang-gu', 'vigormortis', 'no-dashii', 'philosopher', 'snake-charmer'
]);
const interesting = (s: GameState) => s.seats.filter((x) => TRICKY.has(x.character)).map((x) => x.id);

/** The robot Storyteller's next command. */
export function propose(s: GameState, r: Rand): Command {
	if (s.phase.kind === 'night') return proposeNight(s, r);
	if (s.phase.kind === 'day') return proposeDay(s, r);
	return { type: 'note', text: 'idle' };
}

function proposeNight(s: GameState, r: Rand): Command {
	const step = nextStep(s);
	if (!step) return { type: 'end-night' };
	if (chance(0.02, r)) return { type: 'skip', reason: 'the robot skips' };
	if (chance(0.02, r)) return { type: 'end-night' }; // too early: must be refused
	if (chance(0.01, r) && s.seats.some((x) => x.character === 'tinker' && x.alive)) return { type: 'tinker', seat: s.seats.find((x) => x.character === 'tinker')!.id };
	if (s.night?.arbitrary && chance(0.3, r)) return { type: 'storyteller-kill', seat: pick(seats(s), r) };
	if (chance(0.005, r)) return { type: 'storyteller-kill', seat: pick(seats(s), r) }; // mostly refused
	const action = stepAction(step.kind);
	if (action === 'acknowledge') return chance(0.97, r) ? { type: 'acknowledge' } : { type: 'choose', target: 0 };
	if (action === 'choose') return proposeChoice(s, step.kind, step.seat!, r);
	// Information: the robot picks from the Storyteller's suggestions (true ones, and false ones when drunk or poisoned).
	const chosen = step.kind === 'fortune-teller'
		? twoDifferent(seats(s), r)
		: step.kind === 'ravenkeeper' ? [pick(seats(s), r)]
		: step.kind === 'chambermaid' ? twoDifferent(alive(s).filter((x) => x !== step.seat).concat(alive(s).length > 2 ? [] : seats(s)), r)
		: step.kind === 'dreamer' ? [pick(seats(s).filter((x) => x !== step.seat), r)]
		: step.kind === 'seamstress' ? twoDifferent(seats(s).filter((x) => x !== step.seat), r) : [];
	// A number, any number, for the counting roles.
	if (['clockmaker', 'oracle', 'juggler', 'mathematician'].includes(step.kind) && chance(0.3, r)) return { type: 'tell', info: { kind: 'number', value: Math.floor(r() * 5) } };
	if (chance(0.06, r)) return { type: 'tell', info: garbage(s, r), override: chance(0.5, r) };
	// Any number at all for a counting role, to test that every true number is accepted.
	if ((step.kind === 'chef' || step.kind === 'empath') && chance(0.25, r)) return { type: 'tell', info: { kind: 'number', value: Math.floor(r() * 4) } };
	if (step.kind === 'chambermaid' && chance(0.3, r)) return { type: 'tell', info: { kind: 'woke', players: chosen as [SeatId, SeatId], value: Math.floor(r() * 3) } };
	const cands = infoCandidates(s, step.kind, step.seat!, chosen);
	if (!cands.length) return { type: 'skip', reason: 'no information to give' };
	return { type: 'tell', info: pick(cands, r).info };
}

/** A choice of the shape the ability asks for, mostly sensible, sometimes not. */
function proposeChoice(s: GameState, kind: string, by: SeatId, r: Rand): Command {
	const spec = pickSpec(s, kind, by);
	if (spec.noneAllowed && chance(0.4, r)) return { type: 'choose', none: true };
	const chars = scriptOf(s).characters.map((c) => c.id);
	if (spec.character === 'instead') return { type: 'choose', character: chance(0.6, r) ? pick(s.seats, r).character : pick(chars, r) };
	const pool = () => {
		if (chance(0.35, r) && interesting(s).length) return pick(interesting(s), r);
		if (spec.dead) return chance(0.85, r) && s.seats.some((x) => !x.alive) ? pick(s.seats.filter((x) => !x.alive), r).id : pick(seats(s), r);
		return chance(0.9, r) ? pick(alive(s), r) : pick(seats(s), r);
	};
	let targets: SeatId[] = [];
	if (kind === 'imp' && chance(0.12, r)) targets = [by]; // the starpass
	else for (let k = 0; k < spec.count; k++) {
		let t = pool();
		for (let tries = 0; tries < 6 && targets.includes(t); tries++) t = pool();
		targets.push(t);
	}
	if (chance(0.03, r)) targets = targets.slice(1); // the wrong number: must be refused
	const cmd: Command = { type: 'choose', targets };
	if (spec.character === 'required') {
		// The Gambler: often a right guess, sometimes not.
		cmd.character = chance(0.5, r) && targets.length ? s.seats[targets[0]].character : pick(chars, r);
	}
	return cmd;
}

function twoDifferent(xs: SeatId[], r: Rand): [SeatId, SeatId] {
	const ys = xs.length >= 2 ? xs : [0, 1];
	const a = pick(ys, r);
	let b = pick(ys, r);
	for (let k = 0; b === a && k < 20; k++) b = pick(ys, r);
	return [a, b];
}

/** Information of any shape, true or not: the engine must judge it right. */
function garbage(s: GameState, r: Rand): Info {
	const k = Math.floor(r() * 11);
	const ids = seats(s);
	const chars = scriptOf(s).characters;
	if (k === 0) return { kind: 'number', value: Math.floor(r() * 4) };
	if (k === 1) return { kind: 'pair', players: twoDifferent(ids, r), character: pick(chars, r).id };
	if (k === 2) return { kind: 'fortune', players: twoDifferent(ids, r), yes: chance(0.5, r) };
	if (k === 3) return { kind: 'reveal', player: pick(ids, r), character: pick(chars, r).id };
	if (k === 4) return { kind: 'woke', players: twoDifferent(ids, r), value: Math.floor(r() * 3) };
	if (k === 5) return { kind: 'characters', characters: chars.filter(() => chance(0.2, r)).map((c) => c.id) };
	if (k === 7) return { kind: 'yesno', yes: chance(0.5, r) };
	if (k === 8) return { kind: 'dream', player: pick(ids, r), characters: [pick(chars, r).id, pick(chars, r).id] };
	if (k === 9) return { kind: 'players', players: twoDifferent(ids, r) };
	if (k === 10) return { kind: 'same', players: twoDifferent(ids, r), yes: chance(0.5, r) };
	return { kind: 'character', character: pick(chars, r).id };
}

function proposeDay(s: GameState, r: Rand): Command {
	const day = s.day!;
	const nom = openNomination(s);
	if (nom) {
		// Hands: everyone who might, at random; now and then someone who may not.
		const voters = seats(s).filter((id) => chance(s.seats[id].alive ? 0.5 : 0.35, r));
		return { type: 'vote', voters };
	}
	if (chance(0.03, r)) return { type: 'swap-seats', ...pairOf(seats(s), r) };
	// A dead Moonchild (or a bluffer) chooses; the Gossip speaks; the Storyteller kills the Tinker.
	const mc = s.seats.find((x) => !x.alive && x.believes === 'moonchild' && !s.effects.some((e) => e.kind === 'moonchild' && e.by === x.id));
	if (mc && chance(0.5, r)) return { type: 'moonchild', by: mc.id, target: chance(0.9, r) ? pick(alive(s), r) : pick(seats(s), r) };
	const gossip = s.seats.find((x) => x.alive && x.believes === 'gossip');
	if (gossip && chance(0.15, r) && !(s.day?.gossip.some((g) => g.by === gossip.id))) return { type: 'gossip', by: gossip.id, true: chance(0.5, r) };
	if (chance(0.02, r) && s.seats.some((x) => x.character === 'tinker' && x.alive)) return { type: 'tinker', seat: s.seats.find((x) => x.character === 'tinker')!.id };
	// The Fabled: the Doomsayer called; the Ferryman's final day.
	if (s.fabled?.some((f) => f.id === 'doomsayer') && chance(0.03, r)) return { type: 'doomsayer', by: pick(seats(s), r), victim: pick(seats(s), r) };
	if (s.fabled?.some((f) => f.id === 'ferryman') && chance(0.03, r)) return { type: 'ferryman' };
	// Travellers: one joins now and then; the group calls for an exile; the Gunslinger shoots; the Judge rules.
	const unused = (scriptOf(s).travellers ?? []).filter((t) => !s.seats.some((x) => x.character === t.id));
	if (chance(0.03, r) && unused.length && s.seats.length < 20) {
		return { type: 'traveller-joins', name: `T${s.seats.length}`, character: pick(unused, r).id, alignment: chance(0.5, r) ? 'good' : 'evil', after: pick(seats(s), r) };
	}
	const trav = s.seats.filter((x) => x.traveller && x.alive);
	if (trav.length && chance(0.05, r)) return { type: 'exile', traveller: pick(trav, r).id, supporters: seats(s).filter(() => chance(0.5, r)) };
	if (chance(0.05, r) && s.seats.some((x) => x.character === 'gunslinger')) return { type: 'gunslinger', by: s.seats.find((x) => x.character === 'gunslinger')!.id, target: pick(seats(s), r) };
	if (chance(0.05, r) && s.seats.some((x) => x.character === 'judge')) return { type: 'judge', by: s.seats.find((x) => x.character === 'judge')!.id, verdict: chance(0.5, r) ? 'pardon' : 'condemn' };
	if (chance(0.01, r) && trav.length) return { type: 'traveller-leaves', seat: pick(trav, r).id };
	// Sects & Violets by day: the Juggler's guesses, a dead Klutz's choice, an execution for madness.
	const juggler = s.seats.find((x) => x.alive && x.believes === 'juggler' && !s.spent.includes(`${x.id}:juggle`));
	if (juggler && chance(0.4, r)) {
		const players = seats(s).filter(() => chance(0.4, r)).slice(0, 5);
		const chars = scriptOf(s).characters.map((c) => c.id);
		return { type: 'juggle', by: juggler.id, guesses: players.map((p) => ({ player: p, character: chance(0.5, r) ? s.seats[p].character : pick(chars, r) })) };
	}
	const klutz = s.seats.find((x) => !x.alive && x.believes === 'klutz' && !s.spent.includes(`${x.id}:klutz`));
	if (klutz && chance(0.5, r)) return { type: 'klutz', by: klutz.id, target: pick(alive(s), r) };
	if (chance(0.02, r) && s.seats.some((x) => x.character === 'mutant' || x.character === 'cerenovus')) return { type: 'madness', seat: pick(alive(s), r) };
	if (chance(0.04, r)) {
		const slayer = s.seats.find((x) => x.character === 'slayer' || x.believes === 'slayer');
		const suspects = s.seats.filter((x) => canRegisterAsTeam(s, x.id, 'demon')).map((x) => x.id);
		if (slayer && chance(0.6, r)) return { type: 'slay', by: slayer.id, target: chance(0.5, r) && suspects.length ? pick(suspects, r) : pick(seats(s), r) };
		return { type: 'slay', by: pick(seats(s), r), target: pick(seats(s), r) };
	}
	if (day.stage === 'discussion') return chance(0.92, r) ? { type: 'open-nominations' } : { type: 'end-day' };
	if (day.executed !== null || day.nominations.length >= 1 + Math.floor(r() * 4)) return { type: 'end-day' };
	const nominator = chance(0.92, r) ? pick(alive(s), r) : pick(seats(s), r);
	const nominee = chance(0.25, r) && interesting(s).length ? pick(interesting(s), r) : pick(seats(s), r);
	return { type: 'nominate', nominator, nominee };
}

function pairOf(xs: SeatId[], r: Rand) {
	const [a, b] = twoDifferent(xs, r);
	return { a, b };
}

/** The Storyteller answers a question the engine asked. */
function answer(cmd: Command, decision: string, s: GameState, r: Rand): Command {
	switch (decision) {
		case 'mayorRedirect':
			return { ...cmd, mayorRedirect: chance(0.4, r) ? null : pick(seats(s), r) } as Command;
		case 'newDemon': {
			const minions = living(s).filter((x) => charDef(scriptOf(s), x.character).team === 'minion').map((x) => x.id);
			return { ...cmd, newDemon: chance(0.9, r) && minions.length ? pick(minions, r) : pick(seats(s), r) } as Command;
		}
		case 'nominatorIsTownsfolk':
			return { ...cmd, nominatorIsTownsfolk: chance(0.5, r) } as Command;
		case 'targetIsDemon':
			return { ...cmd, targetIsDemon: chance(0.5, r) } as Command;
		case 'drunk': {
			// The Sailor or their choice; one of the Innkeeper's guests. Sometimes someone else (refused).
			const step = nextStep(s);
			const c = cmd as Extract<Command, { type: 'choose' }>;
			const options = [...(c.targets ?? []), ...(step?.kind === 'sailor' && step.seat !== null ? [step.seat] : [])];
			return { ...cmd, drunk: chance(0.95, r) && options.length ? pick(options, r) : pick(seats(s), r) } as Command;
		}
		case 'regurgitate': {
			const dead = s.seats.filter((x) => !x.alive).map((x) => x.id);
			return { ...cmd, regurgitate: chance(0.5, r) || !dead.length ? null : pick(dead, r) } as Command;
		}
		case 'executionSurvives':
			return { ...cmd, executionSurvives: chance(0.4, r) } as Command;
		case 'poisonNeighbour':
			return { ...cmd, poisonNeighbour: pick(seats(s), r) } as Command;
		case 'barista':
			return { ...cmd, barista: chance(0.5, r) ? 'sober' : 'twice' } as Command;
		case 'harlot':
			return { ...cmd, harlot: pick(['refused', 'shown', 'both-die'] as const, r) } as Command;
		case 'deviantFunny':
			return { ...cmd, deviantFunny: chance(0.5, r) } as Command;
	}
	return cmd;
}

// ---- the rules, written a second time ---------------------------------------------------
// The checker does not use rules.ts: if both used the same helper, one bug
// would fool both. Only the character lists (names, teams) and the official
// night sheet (data) are shared.

const teamIn = (s: GameState, c: string) => charDef(getScript(s.scriptId), c).team;
const isAlive = (s: GameState, id: SeatId) => s.seats[id].alive;
/** Alive, or the Zombuul living on after its first death. */
const reallyAlive = (s: GameState, id: SeatId) => s.seats[id].alive || !!s.seats[id].undead;
const livingIds = (s: GameState) => s.seats.filter((x) => x.alive).map((x) => x.id);
/** Living players who count for "two left" and the Mayor: not Travellers. */
const reallyLiving = (s: GameState) => s.seats.filter((x) => (x.alive || x.undead) && !x.traveller).length;
const demonsAlive = (s: GameState) => s.seats.filter((x) => (x.alive || x.undead) && teamIn(s, x.character) === 'demon').length;

/**
 * Drunk or poisoned. The Drunk always; anyone with a drunk or poisoned effect
 * on them, as long as an effect that depends on its source still has it
 * (the source alive, sober and healthy: the Courtier, the Pukka). A short
 * depth limit stops two players disabling each other going round for ever.
 */
function dp(s: GameState, id: SeatId, depth = 0): boolean {
	// The Barista's choice: sober and healthy, whatever else (while the Barista has the ability).
	if (s.effects.some((e) => e.kind === 'sober' && e.target === id && e.by !== null && reallyAlive(s, e.by) && (depth > 3 || !dp(s, e.by, depth + 1)))) return false;
	if (s.seats[id].character === 'drunk') return true;
	if (depth <= 3 && noDashiiNext(s, id, depth)) return true;
	return s.effects.some((e) => (e.kind === 'poisoned' || e.kind === 'drunk') && e.target === id && (
		!e.whileSourceWorks || e.by === null || ((reallyAlive(s, e.by) || s.effects.some((k) => k.kind === 'keeps-ability' && k.target === e.by)) && (depth > 3 || !dp(s, e.by, depth + 1)))
	));
}

/** A healthy No Dashii's nearest Townsfolk each way (dead or alive) are poisoned. */
function noDashiiNext(s: GameState, id: SeatId, depth: number): boolean {
	if (teamIn(s, s.seats[id].character) !== 'townsfolk') return false;
	return s.seats.some((nd) => {
		if (nd.character !== 'no-dashii' || !(nd.alive || nd.undead) || dp(s, nd.id, depth + 1)) return false;
		const o = s.order, n = o.length, at = o.indexOf(nd.id);
		for (const dir of [1, -1]) {
			for (let k = 1; k < n; k++) {
				const x = o[(at + dir * k + 2 * n) % n];
				if (teamIn(s, s.seats[x].character) === 'townsfolk') { if (x === id) return true; break; }
			}
		}
		return false;
	});
}
/** Read from the effects list as plain data. */
const protectedTonight = (s: GameState, id: SeatId) => s.effects.some((e) => e.kind === 'safe-from-demon' && e.target === id);
const masterOf = (s: GameState) => s.effects.find((e) => e.kind === 'master')?.target ?? null;
/** Alive (or the undead Zombuul), really this character, and neither drunk nor poisoned. */
/** A Minion the Vigormortis killed keeps their ability while dead. */
const keeps = (s: GameState, id: SeatId) => s.effects.some((e) => e.kind === 'keeps-ability' && e.target === id);
const working = (s: GameState, id: SeatId, c: string) => (reallyAlive(s, id) || keeps(s, id)) && s.seats[id].character === c && !dp(s, id);

/**
 * What a seat may register as. The Spy may register as good and as any
 * Townsfolk or Outsider; the Recluse as evil and as any Minion or Demon; not
 * while drunk or poisoned (dead or alive, they still register).
 */
function mayRegister(s: GameState, id: SeatId): { chars: Set<string>; aligns: Set<string> } {
	const x = s.seats[id];
	const chars = new Set([x.character]);
	const aligns = new Set<string>([x.alignment]);
	const all = getScript(s.scriptId).characters;
	if (!dp(s, id) && x.character === 'spy') {
		aligns.add('good');
		for (const c of all) if (c.team === 'townsfolk' || c.team === 'outsider') chars.add(c.id);
	}
	if (!dp(s, id) && x.character === 'recluse') {
		aligns.add('evil');
		for (const c of all) if (c.team === 'minion' || c.team === 'demon') chars.add(c.id);
	}
	return { chars, aligns };
}
const mayBeTeam = (s: GameState, id: SeatId, team: string) => [...mayRegister(s, id).chars].some((c) => teamIn(s, c) === team);
const mustBeTeam = (s: GameState, id: SeatId, team: string) => [...mayRegister(s, id).chars].every((c) => teamIn(s, c) === team);

/** Every value `f` can take as each listed seat registers as evil or good in every allowed way. */
function overAlignments(s: GameState, ids: SeatId[], f: (evil: (id: SeatId) => boolean) => number): Set<number> {
	const out = new Set<number>();
	const choice = new Map<SeatId, boolean>();
	const go = (i: number) => {
		if (i === ids.length) { out.add(f((id) => choice.get(id)!)); return; }
		for (const a of mayRegister(s, ids[i]).aligns) { choice.set(ids[i], a === 'evil'); go(i + 1); }
	};
	go(0);
	return out;
}

/** The nearest living player each way round the circle (fewer if the circle is small). */
function nearestLiving(s: GameState, id: SeatId): SeatId[] {
	const o = s.order, n = o.length, at = o.indexOf(id);
	const found: SeatId[] = [];
	for (const dir of [1, -1]) {
		for (let k = 1; k < n; k++) {
			const other = o[(at + dir * k + n * 2) % n];
			if (isAlive(s, other)) { if (other !== id && !found.includes(other)) found.push(other); break; }
		}
	}
	return found;
}

/** The Tea Lady's living neighbours, both good: they are safe. */
function teaLadyGuards(s: GameState, id: SeatId): boolean {
	return s.seats.some((x) => {
		if (!working(s, x.id, 'tea-lady') || !x.alive) return false;
		const nb = nearestLiving(s, x.id);
		return nb.length === 2 && nb.includes(id) && nb.every((n) => s.seats[n].alignment === 'good');
	});
}

/** Woke tonight to use their own ability (drunk or not): not the evil team's first-night info, a reveal, or being told something. */
const NOT_OWN = new Set(['reveal', 'minion-info', 'demon-info', 'new-demon', 'exorcised', 'gossip', 'moonchild', 'lunatic-info', 'sweetheart', 'traveller-info']);
const wokeForAbility = (s: GameState, id: SeatId) => (s.night?.done ?? []).some((d) => {
	const [kind, at] = d.split(':');
	return Number(at) === id && !NOT_OWN.has(kind);
});

/** Is this information true for this role? (null: it is not information that role gets.) */
function trueInfo(s: GameState, to: SeatId, role: string, info: Info): boolean | null {
	const pairTeam: Record<string, string> = { washerwoman: 'townsfolk', librarian: 'outsider', investigator: 'minion' };
	if (role in pairTeam) {
		if (role === 'librarian' && info.kind === 'none') {
			// "No Outsiders" is true if everyone can register as something other than an Outsider.
			return s.seats.every((x) => [...mayRegister(s, x.id).chars].some((c) => teamIn(s, c) !== 'outsider'));
		}
		if (info.kind !== 'pair' || info.players.includes(to) || info.players[0] === info.players[1] || teamIn(s, info.character) !== pairTeam[role]) return null;
		return info.players.some((p) => mayRegister(s, p).chars.has(info.character));
	}
	if (role === 'chef' && info.kind === 'number') {
		// Each neighbouring pair on its own: a Spy or Recluse may read differently for each pair.
		const o = s.order;
		let lo = 0, hi = 0;
		for (let i = 0; i < o.length; i++) {
			const pair = [o[i], o[(i + 1) % o.length]].map((id) => mayRegister(s, id).aligns);
			if (pair.every((a) => a.has('evil') && a.size === 1)) lo++;
			if (pair.every((a) => a.has('evil'))) hi++;
		}
		return info.value >= lo && info.value <= hi;
	}
	if (role === 'empath' && info.kind === 'number') {
		if (info.value < 0 || info.value > 2) return null; // an Empath only ever hears 0, 1 or 2
		const nb = nearestLiving(s, to);
		return overAlignments(s, nb, (evil) => nb.filter(evil).length).has(info.value);
	}
	if (role === 'fortune-teller' && info.kind === 'fortune') {
		const ps = info.players;
		const yesMay = ps.some((p) => mayBeTeam(s, p, 'demon') || s.redHerring === p);
		const yesMust = ps.some((p) => mustBeTeam(s, p, 'demon') || s.redHerring === p);
		return info.yes ? yesMay : !yesMust;
	}
	if (role === 'undertaker' && info.kind === 'character') return !!s.lastExecution && mayRegister(s, s.lastExecution.seat).chars.has(info.character);
	if (role === 'ravenkeeper' && info.kind === 'reveal') return mayRegister(s, info.player).chars.has(info.character);
	if (role === 'grandmother' && info.kind === 'reveal') {
		const t = teamIn(s, info.character);
		if (info.player === to || (t !== 'townsfolk' && t !== 'outsider')) return null;
		const reg = mayRegister(s, info.player);
		return reg.chars.has(info.character) && reg.aligns.has('good');
	}
	if (role === 'chambermaid' && info.kind === 'woke') {
		const [a, b] = info.players;
		if (a === b || a === to || b === to || !isAlive(s, a) || !isAlive(s, b) || info.value < 0 || info.value > 2) return null;
		return [a, b].filter((p) => wokeForAbility(s, p)).length === info.value;
	}
	if ((role === 'godfather-info' || role === 'godfather') && info.kind === 'characters') {
		if (info.characters.some((c) => teamIn(s, c) !== 'outsider')) return null;
		const must = s.seats.filter((x) => mustBeTeam(s, x.id, 'outsider')).map((x) => x.character);
		return must.every((c) => info.characters.includes(c)) && info.characters.every((c) => s.seats.some((x) => mayRegister(s, x.id).chars.has(c)));
	}
	if (role === 'clockmaker' && info.kind === 'number') {
		const n = s.order.length;
		const dist = (a: SeatId, b: SeatId) => { const d = Math.abs(s.order.indexOf(a) - s.order.indexOf(b)); return Math.min(d, n - d); };
		return s.seats.some((d) => {
			if (!mayBeTeam(s, d.id, 'demon')) return false;
			const may = s.seats.filter((m) => m.id !== d.id && mayBeTeam(s, m.id, 'minion')).map((m) => dist(d.id, m.id));
			const must = s.seats.filter((m) => m.id !== d.id && mustBeTeam(s, m.id, 'minion')).map((m) => dist(d.id, m.id));
			return may.length > 0 && info.value >= Math.min(...may) && info.value <= (must.length ? Math.min(...must) : Math.max(...may));
		});
	}
	if (role === 'dreamer' && info.kind === 'dream') {
		const al = info.characters.map((c) => teamAlignment(teamIn(s, c)));
		if (info.player === to || al[0] === al[1]) return null;
		return info.characters.some((c) => mayRegister(s, info.player).chars.has(c));
	}
	if (role === 'mathematician' && info.kind === 'number') return info.value >= 0 && info.value <= s.seats.length ? true : null;
	if ((role === 'flowergirl' || role === 'town-crier') && info.kind === 'yesno') {
		const n = s.night!;
		const who = role === 'flowergirl' ? n.dayVoters ?? [] : n.dayNominators ?? [];
		const team = role === 'flowergirl' ? 'demon' : 'minion';
		return info.yes ? who.some((x) => mayBeTeam(s, x, team)) : !who.some((x) => mustBeTeam(s, x, team));
	}
	if (role === 'oracle' && info.kind === 'number') {
		const dead = s.seats.filter((x) => !x.alive);
		const lo = dead.filter((x) => !mayRegister(s, x.id).aligns.has('good')).length;
		const hi = dead.filter((x) => mayRegister(s, x.id).aligns.has('evil')).length;
		return info.value >= lo && info.value <= hi;
	}
	if (role === 'seamstress' && info.kind === 'same') {
		const [a, b] = info.players;
		if (a === b || a === to || b === to) return null;
		const A = [...mayRegister(s, a).aligns], B = [...mayRegister(s, b).aligns];
		return info.yes ? A.some((x) => B.includes(x)) : A.some((x) => B.some((y) => y !== x));
	}
	if (role === 'juggler' && info.kind === 'number') {
		const gs = s.effects.filter((e) => e.kind === 'juggled' && e.by === to);
		const may = gs.filter((g) => mayRegister(s, g.target).chars.has(g.note ?? '')).length;
		const must = gs.filter((g) => [...mayRegister(s, g.target).chars].every((c) => c === g.note)).length;
		return info.value >= must && info.value <= may;
	}
	if (role === 'sage' && info.kind === 'players') {
		if (info.players[0] === info.players[1]) return null;
		return info.players.some((x) => mayBeTeam(s, x, 'demon'));
	}
	return null;
}

const townsfolkRole = (s: GameState, kind: string) => getScript(s.scriptId).characters.some((c) => c.id === kind && c.team === 'townsfolk');
/** Both twins alive and a working Evil Twin: good cannot win. */
const twinsHold = (s: GameState) => s.effects.some((e) => e.kind === 'twin' && e.by !== null && s.seats[e.target].alive && working(s, e.by, 'evil-twin'));
/** A working Vortox: Townsfolk information must be false. */
const vortoxOn = (s: GameState) => s.seats.some((x) => working(s, x.id, 'vortox'));

/**
 * The official night sheet (The Pandemonium Institute's data, read here from
 * docs/rules/characters.json, not from the engine): each wake's place.
 */
const SHEET = JSON.parse(readFileSync(new URL('../../docs/rules/characters.json', import.meta.url), 'utf8')) as {
	nightSheet: { firstNight: string[]; otherNight: string[] };
	characters: { id: string; name: string }[];
};
const ourId = (official: string) => {
	if (official === 'minioninfo') return 'minion-info';
	if (official === 'demoninfo') return 'demon-info';
	const c = SHEET.characters.find((x) => x.id === official);
	return c ? c.name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : official;
};
const FIRST_SHEET = SHEET.nightSheet.firstNight.map(ourId);
const OTHER_SHEET = SHEET.nightSheet.otherNight.map(ourId);
/** Where a step falls on the sheet tonight, or -1 if that kind never wakes tonight. */
function sheetPlace(kind: string, firstNight: boolean, madeTonight: boolean): number {
	const sheet = firstNight ? FIRST_SHEET : OTHER_SHEET;
	if (kind === 'reveal') return firstNight ? 10_000 : -1;
	if (kind === NEW_DEMON) return madeTonight ? sheet.indexOf('kazali') + 0.5 : sheet.indexOf('scarlet-woman');
	if (kind === 'godfather-info') return firstNight ? sheet.indexOf('godfather') : -1;
	if (kind === 'lunatic-info' || kind === 'lunatic') return sheet.indexOf('lunatic');
	if (kind === 'exorcised') return firstNight ? -1 : sheet.indexOf('exorcist') + 0.5;
	return sheet.indexOf(kind);
}

// ---- the checks -------------------------------------------------------------------------

/**
 * The rules, checked event by event. `before` is the state just before each
 * event, so a check sees exactly what the engine saw.
 */
export class Checker {
	violations: Violation[] = [];
	accepted = 0;
	private dead = new Set<SeatId>();
	/** The wake order of steps resolved tonight, to check they never go backwards. */
	private lastOrder = -Infinity;
	/** Living players just before the most recent death in this command. */
	private aliveBeforeDeath = 0;
	/** The last death in this command, if any. */
	private lastDeath: { seat: SeatId; character: string; cause: string; working: boolean; alignment: string } | null = null;
	/** The step due when the command began (a command resolves the step it began on). */
	private due: ReturnType<typeof nextStep> = null;
	/** Whom a working Monk protects tonight, as the checker saw it chosen. */
	private monkTonight: SeatId | null = null;
	/** The state when the current command began. */
	private start: GameState | null = null;
	/** All the events of the current command. */
	private events: GameEvent[] = [];
	/** How far through the official night sheet tonight has got. */
	private sheetAt = -Infinity;
	/** Dead players who have used their vote, counted here, not read from the game. */
	private ghostsUsed = new Set<SeatId>();
	/** Players whose alignment an ability changed (the Goon): no longer tied to their character's colour. */
	private turned = new Set<SeatId>();
	/** Deaths so far in this command, by seat and cause. */
	private deathsNow: { seat: SeatId; cause: string }[] = [];
	/** Working Grandmothers whose grandchild the Demon killed in this command. */
	private grandmothersDue: SeatId[] = [];
	/** Dead Minions the Vigormortis kept, at dusk: they wake tonight (if their ability wakes them). */
	private keptAtDusk: { seat: SeatId; character: string }[] = [];
	/** The Fang Gu has jumped (once a game). */
	private fangJumped = false;
	/** Seamstresses who have used their once-per-game ability (since they last came back). */
	private seamstressUsed = new Set<SeatId>();
	/** Sages the Demon killed tonight: they must wake. */
	private sagesTonight: SeatId[] = [];
	/** The Pit-Hag has made a Demon: more than one may live. */
	private pitHagDemon = false;
	/** Moonchilds who have chosen since they last died. */
	private moonchildChose = new Set<SeatId>();

	private fail(rule: string, detail: string) {
		this.violations.push({ rule, detail, at: this.accepted });
	}

	/** A refused "tell": the engine must never turn down information that is true, nor anything well-formed for a drunk or poisoned player. */
	refusedTell(s: GameState, cmd: Command) {
		if (cmd.type !== 'tell' || s.phase.kind !== 'night' || cmd.override) return;
		const due = nextStep(s);
		if (!due || due.seat === null || stepAction(due.kind) !== 'tell') return;
		const truth = trueInfo(s, due.seat, due.kind, cmd.info);
		if (vortoxOn(s) && townsfolkRole(s, due.kind) && due.kind !== 'mathematician') return; // the truth is not allowed
		if (truth === true) this.fail('true-info-refused', `${s.seats[due.seat].name} (${due.kind}) could not be told the truth: ${JSON.stringify(cmd.info)}`);
		else if (truth === false && dp(s, due.seat)) this.fail('droisoned-info-refused', `${s.seats[due.seat].name} (${due.kind}, drunk or poisoned) could not be told ${JSON.stringify(cmd.info)}`);
	}

	/** An accepted command: check each event it caused, then the state it left. */
	accept(prev: GameState, cmd: Command, events: GameEvent[], result: GameState) {
		this.accepted++;
		this.lastDeath = null;
		this.start = prev;
		this.events = events;
		this.deathsNow = [];
		this.grandmothersDue = [];
		this.due = prev.phase.kind === 'night' ? nextStep(prev) : null;
		const d = this.due;
		const nightCommand = ['acknowledge', 'choose', 'tell', 'skip'].includes(cmd.type);
		if (d && d.seat !== null && nightCommand && !prev.seats[d.seat].alive && !prev.seats[d.seat].undead && !['ravenkeeper', 'moonchild', 'reveal', 'sage', 'sweetheart', 'barber'].includes(d.kind) && !keeps(prev, d.seat)) {
			this.fail('dead-do-not-wake', `${prev.seats[d.seat].name} (dead) woke as ${d.kind}`);
		}
		let cur = prev;
		for (const e of events) {
			const next = reduce(cur, e);
			this.event(cur, e, next, cmd);
			cur = next;
		}
		this.state(result, prev);
		this.afterCommand(prev, cmd, events, result);
	}

	/** What a command leaves behind, once it has played out. */
	private afterCommand(prev: GameState, cmd: Command, events: GameEvent[], result: GameState) {
		const goonCaught = (by: SeatId) => result.effects.some((x) => x.kind === 'drunk' && x.role === 'goon' && x.target === by)
			&& !prev.effects.some((x) => x.kind === 'drunk' && x.role === 'goon' && x.target === by);
		for (const e of events) {
			if (e.type !== 'chose') continue;
			if (e.role === 'poisoner' && result.seats[e.by].character === 'poisoner' && !goonCaught(e.by)) {
				const poisoned = result.effects.some((x) => x.kind === 'poisoned' && x.target === e.targets[0] && x.by === e.by);
				if (e.effective !== poisoned) this.fail('poisoner', `${result.seats[e.by].name}'s poison ${e.effective ? 'did not land' : 'landed though they are drunk or poisoned'}`);
			}
			// The Po: three after choosing no one, else one (or no one). The Shabaloth: two.
			const charged = prev.effects.some((x) => x.kind === 'po-charged' && x.by === e.by);
			const toymaker = !!prev.fabled?.some((f) => f.id === 'toymaker');
			if (e.role === 'po' && e.targets.length !== (charged ? (toymaker && !e.targets.length ? 0 : 3) : e.targets.length ? 1 : 0)) this.fail('po', `the Po chose ${e.targets.length}${charged ? ' after choosing no one' : ''}`);
			if (e.role === 'shabaloth' && e.targets.length !== 2 && !(toymaker && e.targets.length === 0)) this.fail('shabaloth', `the Shabaloth chose ${e.targets.length}`);
			// A working Exorcist choosing the Demon: it does not act tonight.
			if (e.role === 'exorcist' && e.effective && !goonCaught(e.by) && teamIn(prev, prev.seats[e.targets[0]].character) === 'demon' && reallyAlive(prev, e.targets[0])
				&& !result.effects.some((x) => x.kind === 'exorcised' && x.target === e.targets[0])) this.fail('exorcist', 'the Exorcist chose the Demon and nothing happened');
			if (teamIn(prev, e.role) === 'demon' && prev.effects.some((x) => x.kind === 'exorcised' && x.target === e.by)) this.fail('exorcist', `${prev.seats[e.by].name} acted as the Demon the night the Exorcist chose them`);
			// A working Gambler who guesses wrong dies (unless something saves them).
			if (e.role === 'gambler' && e.effective && !goonCaught(e.by) && e.character !== prev.seats[e.targets[0]].character && result.seats[e.by].alive
				&& !events.some((x) => x.type === 'kill-prevented' && x.target === e.by) && result.phase.kind !== 'over') this.fail('gambler', 'the Gambler guessed wrong and lived');
			if (e.role === 'butler' && masterOf(result) !== e.targets[0]) this.fail('butler', 'the Butler did not get the master they chose');
			// The Goon: the first player tonight to choose them with their ability is caught.
			const woken = e.role !== 'gossip' && e.role !== 'lunatic';
			const goon = e.targets.find((t) => t !== e.by && working(prev, t, 'goon'));
			const already = prev.effects.some((x) => x.kind === 'drunk' && x.role === 'goon');
			if (woken && goon !== undefined && !already && !goonCaught(e.by) && result.phase.kind !== 'over') this.fail('goon', `${prev.seats[e.by].name} chose the Goon first tonight and was not made drunk`);
		}
		if (cmd.type === 'end-day' && prev.day && prev.day.executed === null && prev.day.block === null && reallyLiving(prev) === 3
			&& prev.seats.some((x) => working(prev, x.id, 'mayor')) && result.phase.kind !== 'over' && !prev.mastermind) {
			this.fail('mayor-wins', 'three alive, no execution, a working Mayor, and the game went on');
		}
		for (const e of events) {
			if (e.type !== 'chose') continue;
			// The Assassin's target dies, whatever protects them.
			const t = e.targets[0];
			if (e.role === 'assassin' && e.effective && t !== undefined && prev.seats[t].alive && result.phase.kind !== 'over'
				&& !this.deathsNow.some((x) => x.seat === t)) this.fail('assassin', `the Assassin chose ${prev.seats[t].name} and they lived`);
		}
		// The Evil Twin: the good twin executed (with a working Evil Twin), and evil wins.
		for (const x of events) {
			if (x.type !== 'executed' || prev.mastermind) continue;
			const twin = prev.effects.some((t) => t.kind === 'twin' && t.target === x.seat && t.by !== null && working(prev, t.by, 'evil-twin'));
			if (twin && !(result.phase.kind === 'over' && result.phase.winner === 'evil')) this.fail('evil-twin', `the good twin ${prev.seats[x.seat].name} was executed and evil did not win`);
		}
		// The Klutz: a working Klutz choosing an evil player loses the game for good.
		if (cmd.type === 'klutz' && events.length && prev.seats[cmd.by].character === 'klutz' && !dp(prev, cmd.by) && prev.seats[cmd.target].alignment === 'evil'
			&& !(result.phase.kind === 'over' && result.phase.winner === 'evil')) this.fail('klutz', 'the Klutz chose an evil player and evil did not win');
		// The Fang Gu: its first choice of a living Outsider (if not the Goon's catch) makes them the Fang Gu.
		for (const x of events) {
			if (x.type !== 'chose' || x.role !== 'fang-gu' || !x.effective || this.fangJumped && !events.some((y) => y.type === 'became-demon' && y.via === 'fang-gu')) continue;
			const t = x.targets[0];
			if (t === undefined || t === x.by || !prev.seats[t].alive || teamIn(prev, prev.seats[t].character) !== 'outsider' || goonCaught(x.by) || result.phase.kind === 'over') continue;
			if (!events.some((y) => y.type === 'became-demon' && y.via === 'fang-gu' && y.seat === t)) this.fail('fang-gu', `the Fang Gu chose ${prev.seats[t].name}, an Outsider, and did not jump`);
		}
		// An exile that passes kills the Traveller: no ability stops it (but a funny Deviant's own).
		for (const x of events) {
			if (x.type !== 'exile-decided' || !x.passed) continue;
			const funny = cmd.type === 'exile' && cmd.deviantFunny && prev.seats[x.seat].character === 'deviant';
			if (!funny && result.seats[x.seat].alive) this.fail('exile', `${prev.seats[x.seat].name} was exiled and lived`);
		}
		// The Snake Charmer: a sober, living Snake Charmer choosing a Demon swaps with it.
		for (const x of events) {
			if (x.type !== 'chose' || x.role !== 'snake-charmer' || !x.effective || goonCaught(x.by) || result.phase.kind === 'over') continue;
			const t = x.targets[0];
			if (t === undefined || !prev.seats[x.by].alive || teamIn(prev, prev.seats[t].character) !== 'demon') continue;
			if (!events.some((y) => y.type === 'became-demon' && y.via === 'snake-charmer' && y.seat === x.by)) this.fail('snake-charmer', `${prev.seats[x.by].name} chose the Demon and did not swap`);
		}
		// The Vortox: a day that ends without an execution, and evil wins.
		if (cmd.type === 'end-day' && prev.day && prev.day.executed === null && prev.day.block === null && vortoxOn(prev) && !prev.mastermind
			&& !(result.phase.kind === 'over' && result.phase.winner === 'evil')) this.fail('vortox', 'no execution today with a working Vortox, and evil did not win');
		// A nominator the Witch cursed (a working Witch, more than three alive) dies, unless something saves them.
		if (cmd.type === 'nominate' && events.some((x) => x.type === 'nominated') && prev.seats[cmd.nominator].alive && livingIds(prev).length > 3
			&& prev.effects.some((x) => x.kind === 'cursed' && x.target === cmd.nominator && x.by !== null && working(prev, x.by, 'witch'))
			&& !this.deathsNow.some((x) => x.seat === cmd.nominator) && !events.some((x) => x.type === 'kill-prevented' && x.target === cmd.nominator)
			&& result.phase.kind !== 'over') this.fail('witch', `${prev.seats[cmd.nominator].name} nominated while cursed and lived`);
		// The Grandmother dies when the Demon kills her grandchild (unless something saves her).
		for (const by of this.grandmothersDue) {
			if (result.phase.kind === 'over') continue;
			{
				if (!this.deathsNow.some((x) => x.seat === by) && !events.some((x) => x.type === 'kill-prevented' && x.target === by)) this.fail('grandmother', `${prev.seats[by].name}'s grandchild was killed by the Demon and the Grandmother lived`);
			}
		}
		// The Minstrel: only a Minion's death by execution, with a working Minstrel, makes everyone drunk.
		const minstrel = events.some((e) => e.type === 'effect-added' && e.effect.role === 'minstrel');
		const minionExecuted = this.deathsNow.some((x) => x.cause === 'execution' && teamIn(prev, prev.seats[x.seat].character) === 'minion');
		if (minstrel && !(minionExecuted && prev.seats.some((x) => working(prev, x.id, 'minstrel')))) this.fail('minstrel', 'everyone made drunk without a Minion dying by execution');
		if (!minstrel && minionExecuted && prev.seats.some((x) => working(prev, x.id, 'minstrel') && x.alive)) this.fail('minstrel', 'a Minion died by execution and the Minstrel did nothing');
	}

	private event(b: GameState, e: GameEvent, a: GameState, cmd: Command) {
		const name = (id: SeatId) => `${b.seats[id]?.name}(${b.seats[id]?.character})`;
		const night = b.phase.kind === 'night';
		switch (e.type) {
			case 'died': {
				const v = b.seats[e.seat];
				if (!v.alive && !v.undead) this.fail('die-once', `${name(e.seat)} died twice`);
				this.aliveBeforeDeath = livingIds(b).length;
				this.lastDeath = { seat: e.seat, character: v.character, cause: e.cause, working: !dp(b, e.seat), alignment: v.alignment };
				this.deathsNow.push({ seat: e.seat, cause: e.cause });
				if (e.cause === 'demon' && night && v.character === 'sage') this.sagesTonight.push(e.seat);
				if (e.cause === 'demon') for (const g of b.effects) if (g.kind === 'grandchild' && g.target === e.seat && g.by !== null && working(b, g.by, 'grandmother')) this.grandmothersDue.push(g.by);
				// Nothing kills the protected but the Assassin (and an Imp passing on, and the Saint's own execution).
				// No ability touches an exile (or a Traveller leaving).
				if (e.cause !== 'assassin' && e.cause !== 'starpass' && e.cause !== 'exile' && e.cause !== 'left') {
					if (night && b.effects.some((x) => x.kind === 'safe-tonight' && x.target === e.seat)) this.fail('innkeeper', `${name(e.seat)} died though the Innkeeper kept them safe`);
					if (teaLadyGuards(b, e.seat)) this.fail('tea-lady', `${name(e.seat)} died though the Tea Lady protects them`);
					if (working(b, e.seat, 'sailor')) this.fail('sailor', `${name(e.seat)}, a sober Sailor, died`);
					if (e.cause !== 'execution' && e.cause !== 'doomsayer' && v.alignment === 'good' && b.fabled?.some((f) => f.id === 'storm-catcher' && f.character === v.character)) this.fail('storm-catcher', `${name(e.seat)}, the Storm Catcher's character, died by ${e.cause}`);
					if (working(b, e.seat, 'fool') && !b.spent.includes(`${e.seat}:fool`)) this.fail('fool', `${name(e.seat)} died on the Fool's first death`);
				}
				if (working(b, e.seat, 'zombuul') && !v.undead) this.fail('zombuul', `${name(e.seat)} died for real at the Zombuul's first death`);
				// Nothing kills on the first night but the Tinker's own fate (and the Moonchild's curse that may follow).
				if (night && b.night?.n === 1 && e.cause !== 'tinker' && e.cause !== 'moonchild') this.fail('no-kill-night-one', `${name(e.seat)} died by ${e.cause} on the first night`);
				if (e.cause === 'demon') {
					if (!night) this.fail('demon-kills-at-night', `${name(e.seat)} killed by the Demon by day`);
					if (b.night?.n === 1) this.fail('no-kill-night-one', `${name(e.seat)} killed on the first night`);
					if (protectedTonight(b, e.seat)) this.fail('monk-protects', `${name(e.seat)} died though the Monk protected them`);
					if (working(b, e.seat, 'soldier')) this.fail('soldier-is-safe', `${name(e.seat)}, a working Soldier, was killed by the Demon`);
				}
				if (night && working(b, e.seat, 'mayor') && e.cause !== 'assassin' && e.cause !== 'starpass' && !(('mayorRedirect' in cmd) && cmd.mayorRedirect === null)) {
					// A working Mayor dies at night only if the Storyteller chose no one to die instead.
					this.fail('mayor-bounce', `${name(e.seat)}, a working Mayor, died though the Storyteller redirected the kill`);
				}
				if (e.cause === 'starpass' && protectedTonight(b, e.seat)) this.fail('monk-protects', `${name(e.seat)}, the Monk-protected Imp, died choosing themself`);
				if (e.cause === 'starpass' && !(cmd.type === 'choose' && (cmd.target === e.seat || cmd.targets?.[0] === e.seat) && v.character === 'imp')) {
					this.fail('starpass', `${name(e.seat)} died by starpass without choosing themselves as the Imp`);
				}
				if ((e.cause === 'execution' || e.cause === 'slayer') && b.phase.kind !== 'day') this.fail('day-deaths', `${name(e.seat)} died by ${e.cause} at night`);
				if (e.cause === 'gambler') {
					const c = cmd as Extract<Command, { type: 'choose' }>;
					const t = c.targets?.[0] ?? c.target;
					if (cmd.type !== 'choose' || t === undefined || !working(b, e.seat, 'gambler') || b.seats[t].character === c.character) this.fail('gambler', `${name(e.seat)} died as a Gambler without a wrong guess`);
				}
				if (e.cause === 'godfather' && !(this.start!.night?.dayDeaths ?? []).some((x) => teamIn(b, this.start!.seats[x].character) === 'outsider')) this.fail('godfather', `the Godfather killed ${name(e.seat)} with no Outsider dead today`);
				if (e.cause === 'grandmother' && !(v.character === 'grandmother' && this.deathsNow.some((x) => x.cause === 'demon' && b.effects.some((g) => g.kind === 'grandchild' && g.by === e.seat && g.target === x.seat)))) {
					this.fail('grandmother', `${name(e.seat)} died with a grandchild the Demon did not kill`);
				}
				if (e.cause === 'gossip' && !(this.start!.night?.gossip ?? []).length) this.fail('gossip', `${name(e.seat)} died to the Gossip with no true statement`);
				if (e.cause === 'moonchild' && !this.start!.effects.some((x) => x.kind === 'moonchild' && x.target === e.seat && x.note === 'good')) this.fail('moonchild', `${name(e.seat)} died to the Moonchild, unchosen or not good`);
				if (e.cause === 'witch' && !(cmd.type === 'nominate' && cmd.nominator === e.seat && livingIds(this.start!).length > 3
					&& this.start!.effects.some((x) => x.kind === 'cursed' && x.target === e.seat && x.by !== null && working(this.start!, x.by, 'witch')))) this.fail('witch', `${name(e.seat)} died to a curse they could not have`);
				if (e.cause === 'fang-gu' && !(v.character === 'fang-gu' && this.events.some((x) => x.type === 'became-demon' && x.via === 'fang-gu'))) this.fail('fang-gu', `${name(e.seat)} died as the old Fang Gu without a jump`);
				if (e.cause === 'storyteller' && !b.night?.arbitrary) this.fail('arbitrary-deaths', `${name(e.seat)} killed by the Storyteller on an ordinary night`);
				if (e.cause === 'doomsayer' && !(cmd.type === 'doomsayer' && b.fabled?.some((f) => f.id === 'doomsayer') && b.seats[cmd.by].alive
					&& livingIds(b).length >= 4 && b.seats[cmd.by].alignment === v.alignment && !this.start!.spent.includes(`${cmd.by}:doomsayer`))) this.fail('doomsayer', `${name(e.seat)} died to the Doomsayer wrongly`);
				if (e.cause === 'exile' && !(cmd.type === 'exile' && this.events.some((x) => x.type === 'exile-decided' && x.seat === e.seat && x.passed))) this.fail('exile', `${name(e.seat)} died by exile without one passing`);
				if (e.cause === 'left' && !(cmd.type === 'traveller-leaves' && v.traveller)) this.fail('traveller', `${name(e.seat)} left without being a Traveller`);
				if (e.cause === 'gunslinger') {
					const first = this.start!.day?.nominations.find((n) => n.votes !== null);
					if (cmd.type !== 'gunslinger' || !working(b, cmd.by, 'gunslinger') || !(first?.voters ?? []).includes(e.seat)) this.fail('gunslinger', `${name(e.seat)} shot without having voted in the first vote`);
				}
				if (e.cause === 'assassin') {
					const by = this.due?.seat;
					if (by === undefined || by === null || this.start!.spent.includes(`${by}:assassin`) || b.seats[by].character !== 'assassin') this.fail('assassin', `${name(e.seat)} died to an Assassin that could not`);
				}
				break;
			}
			case 'seems-dead': {
				const v = b.seats[e.seat];
				if (v.character !== 'zombuul' || v.undead || dp(b, e.seat)) this.fail('zombuul', `${name(e.seat)} seemed to die without being a working Zombuul's first death`);
				this.deathsNow.push({ seat: e.seat, cause: e.cause });
				break;
			}
			case 'revived': {
				const v = b.seats[e.seat];
				if (v.alive) this.fail('revive-the-dead', `${name(e.seat)} revived while alive`);
				if (e.by === 'professor' && teamIn(b, v.character) !== 'townsfolk') this.fail('professor', `the Professor revived ${name(e.seat)}, not a Townsfolk`);
				if (e.by === 'shabaloth' && !b.effects.some((x) => x.kind === 'chose-last' && x.role === 'shabaloth' && x.target === e.seat)) this.fail('shabaloth', `the Shabaloth brought back ${name(e.seat)}, not chosen last night`);
				this.dead.delete(e.seat);
				this.moonchildChose.delete(e.seat);
				this.seamstressUsed.delete(e.seat);
				this.ghostsUsed.delete(e.seat); // back to life: a fresh ghost vote when they next die
				break;
			}
			case 'effect-added':
				if (e.effect.kind === 'moonchild' && e.effect.by !== null) {
					if (this.moonchildChose.has(e.effect.by)) this.fail('moonchild', `${name(e.effect.by)} chose a second time as the Moonchild`);
					this.moonchildChose.add(e.effect.by);
				}
				break;
			case 'character-changed': {
				// Their alignment no longer follows their character (the Barber, the Pit-Hag).
				this.turned.add(e.seat);
				if (e.by === 'pit-hag' && this.start!.seats.some((x) => x.character === e.character)) this.fail('pit-hag', `the Pit-Hag made ${name(e.seat)} the ${e.character}, already in play`);
				const ok = e.by === 'pit-hag' || e.by === 'barber' || (e.by === 'apprentice' && b.seats[e.seat].traveller && b.seats[e.seat].character === 'apprentice') || (e.by === 'philosopher' && b.seats[e.seat].character === 'philosopher') || (e.by === 'snake-charmer' && teamIn(b, b.seats[e.seat].character) === 'demon');
				if (!ok) this.fail('character-change', `${name(e.seat)} became the ${e.character} by ${e.by}`);
				break;
			}
			case 'votes-restored':
				if (!b.fabled?.some((f) => f.id === 'ferryman')) this.fail('ferryman', 'votes restored without the Ferryman');
				this.ghostsUsed.clear();
				break;
			case 'traveller-joined':
				this.turned.add(e.seat); // the Storyteller chose their alignment
				if (teamIn(b, e.character) !== 'traveller') this.fail('traveller', `${e.name} joined as the ${e.character}, not a Traveller`);
				break;
			case 'exile-decided': {
				if (!b.seats[e.seat].traveller) this.fail('exile', `${name(e.seat)} put up for exile, not a Traveller`);
				const needed = Math.ceil(livingIds(b).length / 2);
				if (e.needed !== needed || e.passed !== (e.supporters.length >= needed)) this.fail('exile', `exile: ${e.supporters.length} of ${needed} needed, passed ${e.passed}`);
				break;
			}
			case 'alignment-changed':
				// The Goon takes their chooser's; the Snake Charmer's swap (the old Demon is now the Snake Charmer).
				if (b.seats[e.seat].character !== 'goon' && b.seats[e.seat].character !== 'snake-charmer') this.fail('alignment', `${name(e.seat)} changed alignment`);
				this.turned.add(e.seat);
				break;
			case 'survived-execution': {
				const ok = (e.reason === 'the Devil’s Advocate' && b.effects.some((x) => x.kind === 'survives-execution' && x.target === e.seat))
					|| (e.reason === 'the Tea Lady' && teaLadyGuards(b, e.seat))
					|| (e.reason === 'the Sailor' && working(b, e.seat, 'sailor'))
					|| (e.reason === 'the Fool' && b.seats[e.seat].character === 'fool')
					|| (e.reason === 'the Pacifist' && b.seats[e.seat].alignment === 'good' && b.seats.some((x) => working(b, x.id, 'pacifist')));
				if (!ok) this.fail('survive-execution', `${name(e.seat)} survived execution by ${e.reason} without cause`);
				break;
			}
			case 'became-demon': {
				const v = b.seats[e.seat];
				if (!v.alive) this.fail('dead-stay-dead', `${name(e.seat)} became the Demon while dead`);
				// A Minion catches it (starpass, Scarlet Woman); the Snake Charmer swaps; the Fang Gu jumps to an Outsider; the Pit-Hag makes anyone one.
				const from = e.via === 'snake-charmer' ? 'snake-charmer' : e.via === 'fang-gu' ? 'outsider' : e.via === 'pit-hag' ? 'any' : 'minion';
				if (from === 'minion' && teamIn(b, v.character) !== 'minion') this.fail('only-minions-become-demon', `${name(e.seat)} became the Demon`);
				if (from === 'outsider' && teamIn(b, v.character) !== 'outsider') this.fail('fang-gu', `${name(e.seat)} caught the Fang Gu without being an Outsider`);
				if (from === 'snake-charmer' && v.character !== 'snake-charmer') this.fail('snake-charmer', `${name(e.seat)} swapped with the Demon without being the Snake Charmer`);
				if (e.via === 'pit-hag') this.pitHagDemon = true;
				if (e.via === 'fang-gu') {
					if (this.fangJumped) this.fail('fang-gu', 'the Fang Gu jumped a second time');
					this.fangJumped = true;
				}
				if (e.via === 'scarlet-woman') {
					if (v.character !== 'scarlet-woman' || dp(b, e.seat)) this.fail('scarlet-woman', `${name(e.seat)} caught the Demon without being a working Scarlet Woman`);
					if (this.aliveBeforeDeath < 5) this.fail('scarlet-woman-needs-five', `the Scarlet Woman caught the Demon with ${this.aliveBeforeDeath} alive`);
					if (!this.lastDeath || teamIn(b, this.lastDeath.character) !== 'demon') this.fail('scarlet-woman', 'the Scarlet Woman became the Demon though no Demon died');
				}
				break;
			}
			case 'chose': {
				const v = b.seats[e.by];
				const effective = !dp(b, e.by) && v.character === e.role;
				if (e.effective !== effective) this.fail('droisoned-abilities-fail', `${name(e.by)} as ${e.role}: effective ${e.effective}, should be ${effective}`);
				if ((e.role === 'monk' || e.role === 'butler') && e.targets[0] === e.by) this.fail('choose-another', `the ${e.role} chose themselves`);
				const asWho = e.role === 'lunatic' ? 'lunatic' : v.believes;
				if (e.role !== asWho && !(e.role === 'lunatic' && v.character === 'lunatic')) this.fail('wake-as-yourself', `${name(e.by)} chose as ${e.role} but believes ${v.believes}`);
				if (e.role === 'monk' && e.effective) this.monkTonight = e.targets[0];
				if (e.role === 'monk' && !e.effective && a.effects.some((x) => x.kind === 'safe-from-demon' && x.by === e.by)) this.fail('monk', 'a drunk or poisoned Monk protected someone');
				break;
			}
			case 'kill-prevented': {
				if (e.reason === 'protected by the Monk' && this.monkTonight !== e.target) this.fail('monk', `${name(e.target)} saved by a Monk who did not protect them`);
				if (e.reason === 'the Soldier' && !working(b, e.target, 'soldier')) this.fail('soldier-is-safe', `${name(e.target)} saved as a Soldier without being a working one`);
				if (e.reason === 'the Fool' && !(b.seats[e.target].character === 'fool')) this.fail('fool', `${name(e.target)} saved as the Fool without being one`);
				if (e.reason === 'the Fool' && this.start!.spent.includes(`${e.target}:fool`) && !this.events.some((x) => x.type === 'revived' && x.seat === e.target)) this.fail('fool', `${name(e.target)} saved by the Fool a second time`);
				break;
			}
			case 'info-given': {
				const believes = b.seats[e.to].believes;
				if (e.role !== believes && !(e.role === 'godfather-info' && believes === 'godfather')) this.fail('wake-as-yourself', `${name(e.to)} told ${e.role} info but believes ${believes}`);
				if (e.role === 'seamstress') {
					if (this.seamstressUsed.has(e.to)) this.fail('seamstress', `${name(e.to)} used the Seamstress twice`);
					this.seamstressUsed.add(e.to);
				}
				if (e.role === 'ravenkeeper' && !b.night?.deaths.includes(e.to)) this.fail('ravenkeeper', `${name(e.to)} learned as the Ravenkeeper without dying tonight`);
				if (e.role === 'undertaker' && b.lastExecution?.day !== (b.night?.n ?? 0) - 1) this.fail('undertaker', `${name(e.to)} learned as the Undertaker with no execution yesterday`);
				const truth = trueInfo(b, e.to, e.role, e.info);
				if (truth === null) this.fail('info-well-formed', `${name(e.to)} given ${e.role} info of the wrong shape: ${JSON.stringify(e.info)}`);
				else if (truth !== e.truthful) this.fail('info-marked-right', `${name(e.to)} (${e.role}): ${JSON.stringify(e.info)} marked truthful=${e.truthful}, really ${truth}`);
				const droisoned = dp(b, e.to);
				// With a working Vortox, a sober Townsfolk must be told something false.
				const mustLie = vortoxOn(b) && townsfolkRole(b, e.role) && e.role !== 'mathematician';
				const fits = mustLie ? !e.truthful : e.truthful;
				if (!fits && !droisoned && !e.override) this.fail(mustLie ? 'vortox' : 'sober-told-truth', `${name(e.to)} (sober) told something ${mustLie ? 'true under the Vortox' : 'false'} without "I insist"`);
				if (e.override && (fits || droisoned)) this.fail('override-only-when-needed', `override recorded for ${name(e.to)} when not needed`);
				break;
			}
			case 'nominated': {
				const d = b.day;
				if (!d || b.phase.kind !== 'day') { this.fail('nominate-by-day', 'a nomination outside the day'); break; }
				if (d.stage !== 'nominations') this.fail('nominations-open-first', 'a nomination before nominations opened');
				if (d.executed !== null) this.fail('no-nominations-after-execution', 'a nomination after an execution');
				if (openNomination(b)) this.fail('one-nomination-at-a-time', 'a nomination while another was being voted on');
				if (!b.seats[e.nominator].alive) this.fail('dead-cannot-nominate', `${name(e.nominator)} nominated while dead`);
				if (d.nominations.some((n) => n.nominator === e.nominator)) this.fail('nominate-once', `${name(e.nominator)} nominated twice in a day`);
				if (d.nominations.some((n) => n.nominee === e.nominee)) this.fail('nominated-once', `${name(e.nominee)} nominated twice in a day`);
				if (b.seats[e.nominee].traveller) this.fail('travellers-are-exiled', `${name(e.nominee)}, a Traveller, nominated for execution`);
				break;
			}
			case 'vote-tallied': {
				const d = b.day!;
				const voters = e.voters;
				if (new Set(voters).size !== voters.length) this.fail('vote-once', 'someone counted twice');
				const srcOk = (x: { by: SeatId | null; whileSourceWorks?: boolean }) => x.by === null || (reallyAlive(b, x.by) && !dp(b, x.by));
				const w = (v: SeatId) => (b.effects.some((x) => x.kind === 'vote-x3' && x.target === v && srcOk(x)) ? 3 : 1) * (b.effects.some((x) => x.kind === 'vote-minus' && x.target === v && srcOk(x)) ? -1 : 1);
				const voudon = b.seats.some((x) => working(b, x.id, 'voudon'));
				if (e.votes !== voters.reduce((n, v) => n + w(v), 0)) this.fail('votes-are-hands', `${e.votes} votes from ${voters.length} hands`);
				if (voudon && voters.some((v) => b.seats[v].alive && b.seats[v].character !== 'voudon')) this.fail('voudon', 'a living player voted with the Voudon in play');
				for (const v of voters) {
					const p = b.seats[v];
					const voudonNow = b.seats.some((x) => working(b, x.id, 'voudon'));
					if (!p.alive && !p.ghostVote && !voudonNow) this.fail('ghost-vote-once', `${name(v)} voted dead with no ghost vote`);
					if (!p.alive && !voudonNow) {
						if (this.ghostsUsed.has(v)) this.fail('ghost-vote-once', `${name(v)} used a ghost vote twice`);
						this.ghostsUsed.add(v);
					}
					// A Butler who votes without their master is counted anyway, but always noted.
					if (working(b, v, 'butler') && masterOf(b) !== null && !voters.includes(masterOf(b)!) && !this.events.some((x) => x.type === 'note' && x.text.includes(b.seats[v].name))) {
						this.fail('butler', `${name(v)} (Butler) voted without their master, unnoted`);
					}
				}
				const ghosts = b.seats.some((x) => working(b, x.id, 'voudon')) ? [] : voters.filter((v) => !b.seats[v].alive).sort();
				if (JSON.stringify(ghosts) !== JSON.stringify([...e.ghostsSpent].sort())) this.fail('ghost-votes-spent', 'the ghost votes spent do not match the dead who voted');
				const needed = b.seats.some((x) => working(b, x.id, 'voudon')) ? 1 : Math.ceil(livingIds(b).length / 2);
				if (e.needed !== needed) this.fail('half-the-living', `needed ${e.needed}, should be ${needed}`);
				const outcome = e.votes >= needed && e.votes > d.highest ? 'on-the-block' : e.votes >= needed && e.votes === d.highest ? 'tied' : 'not-enough';
				if (e.outcome !== outcome) this.fail('vote-outcome', `${e.votes} votes (needed ${needed}, highest ${d.highest}): ${e.outcome}, should be ${outcome}`);
				break;
			}
			case 'executed':
				if (b.phase.kind !== 'day') this.fail('execute-by-day', 'an execution outside the day');
				if (b.day?.executed !== null) this.fail('execute-once', 'two executions in one day');
				if (cmd.type === 'end-day' && e.seat !== b.day?.block) this.fail('execute-the-block', `${name(e.seat)} executed at dusk though ${b.day?.block === null ? 'nobody' : name(b.day!.block!)} was on the block`);
				if (cmd.type === 'nominate') {
					const virgin = b.seats[cmd.nominee];
					if (e.seat !== cmd.nominator || virgin.character !== 'virgin' || !virgin.alive || dp(b, cmd.nominee) || !mayBeTeam(b, cmd.nominator, 'townsfolk')) {
						this.fail('virgin', `${name(e.seat)} executed on nominating ${name(cmd.nominee)}`);
					}
				}
				if (cmd.type !== 'end-day' && cmd.type !== 'nominate' && cmd.type !== 'madness' && cmd.type !== 'judge') this.fail('execute-the-block', `an execution from ${cmd.type}`);
				break;
			case 'slayer-shot':
				if (this.start!.spent.includes(`${e.by}:slayer`)) this.fail('slayer-once', `${name(e.by)} shot a second time`);
				if (e.hit) {
					if (!working(b, e.by, 'slayer')) this.fail('slayer', `${name(e.by)} hit without being a working Slayer`);
					if (!mayBeTeam(b, e.target, 'demon')) this.fail('slayer', `${name(e.target)} was hit but cannot register as the Demon`);
				} else if (working(b, e.by, 'slayer') && b.seats[e.target].alive && mustBeTeam(b, e.target, 'demon')) {
					this.fail('slayer', `${name(e.by)} missed the Demon ${name(e.target)}`);
				}
				break;
			case 'step-done':
			case 'step-skipped': {
				const want = this.due;
				if (want && want.id === e.step) {
					const n = this.start!.night!;
					const madeNow = (n.made ?? []).some((m) => m.seat === want.seat);
					// A Demon made tonight is told straight after whatever made them: no fixed place.
					let place = want.kind === NEW_DEMON && madeNow ? this.sheetAt : sheetPlace(want.kind, n.n === 1, madeNow);
					// Back from the dead with a first-night ability: it acts just after the Professor.
					const revivedAt = OTHER_SHEET.indexOf('professor') + 0.25;
					if (want.seat !== null && n.revived.includes(want.seat) && place < revivedAt) place = revivedAt;
					// Back with a first-night ability (the Grandmother): it acts at once, just after the Professor.
					const firstOnly = getScript(b.scriptId).characters.find((c) => c.id === want.kind)?.otherNight === null;
					if (want.seat !== null && n.revived.includes(want.seat) && firstOnly) place = revivedAt;
					// The Exorcist's Demon learns it just after the Exorcist chose, wherever that was.
					const exorcist = this.start!.effects.find((x) => x.kind === 'exorcised' && x.target === want.seat)?.by;
					// The Zombuul wakes only if no one died today.
					if (want.kind === 'zombuul' && (n.dayDeaths ?? []).length) this.fail('zombuul', 'the Zombuul woke though someone died today');
					if (want.kind === 'exorcised' && exorcist != null && n.revived.includes(exorcist) && place < revivedAt) place = revivedAt + 0.1;
					// The Moonchild's curse is resolved whenever the Moonchild has chosen, not at a wake.
					if (want.kind === 'moonchild') { /* no place on the sheet to keep */ }
					// Woken by a death that came after their place: straight away.
					else if (['sage', 'sweetheart', 'barber', 'apprentice'].includes(want.kind) && place < this.sheetAt) { /* late, allowed */ }
					// An evil Traveller learns the Demon first thing; a Traveller's first night (the Apprentice) comes early.
					else if (want.kind === 'traveller-info' || (want.seat !== null && this.start!.seats[want.seat].traveller && place < 0)) { /* allowed */ }
					else if (place < 0) this.fail('official-night-order', `${want.kind} woke on night ${n.n}, which it never does`);
					else if (place < this.sheetAt) this.fail('official-night-order', `${want.kind} woke out of the sheet's order on night ${n.n}`);
					else this.sheetAt = place;
				}
				if (!want || want.id !== e.step) this.fail('wake-in-order', `resolved ${e.step}, but next was ${want?.id}`);
				else {
					if (want.order < this.lastOrder) this.fail('wake-in-order', `${e.step} (order ${want.order}) after a step of order ${this.lastOrder}`);
					this.lastOrder = want.order;
				}
				break;
			}
			case 'night-began': {
				this.monkTonight = null;
				this.keptAtDusk = a.seats.filter((x) => !x.alive && a.effects.some((k) => k.kind === 'keeps-ability' && k.role === 'vigormortis' && k.target === x.id))
					.map((x) => ({ seat: x.id, character: x.character }));
				this.sheetAt = -Infinity;
				const want = b.phase.kind === 'setup' ? 1 : b.phase.kind === 'day' ? b.phase.n + 1 : -1;
				if (e.n !== want) this.fail('phase-sequence', `night ${e.n} after ${JSON.stringify(b.phase)}`);
				if (a.effects.some((x) => x.kind === 'poisoned' && (x.role === 'poisoner' || x.role === 'storyteller'))) this.fail('poison-wears-off', 'poison still set at dusk');
				this.lastOrder = -Infinity;
				break;
			}
			case 'day-began': {
				if (b.phase.kind !== 'night' || b.phase.n !== e.n) this.fail('phase-sequence', `day ${e.n} after ${JSON.stringify(b.phase)}`);
				const nt = b.night!;
				// Every step tonight resolved; each player woke at most once (a new Demon is told separately).
				if (nightSteps(b).some((st) => !st.done)) this.fail('everyone-wakes', 'day began with someone still to wake');
				const wakes = new Map<number, number>();
				for (const id of nt.done) {
					if (id.startsWith(NEW_DEMON + ':') || id.startsWith('exorcised:') || id.startsWith('traveller-info:')) continue;
					const seat = Number(id.split(':')[1]);
					if (Number.isInteger(seat)) wakes.set(seat, (wakes.get(seat) ?? 0) + 1);
				}
				// Brought back, or given a new character tonight (the Philosopher): they may wake again as it.
				for (const [seat, n] of wakes) if (n > 1 && !nt.revived.includes(seat) && !(nt.changed ?? []).some((c) => c.seat === seat)) this.fail('wake-once', `${name(seat)} woke ${n} times on night ${e.n}`);
				// A kept Minion wakes each night its ability wakes it (not the Godfather's, which depends on the day; nor the Witch with three alive).
				for (const k of this.keptAtDusk) {
					if (!OTHER_SHEET.includes(k.character) || k.character === 'godfather' || (k.character === 'witch' && livingIds(b).length <= 3)) continue;
					if (b.seats[k.seat].character !== k.character || !b.effects.some((x) => x.kind === 'keeps-ability' && x.target === k.seat)) continue;
					if (!nt.done.includes(`${k.character}:${k.seat}`)) this.fail('vigormortis', `${name(k.seat)}, a dead ${k.character} the Vigormortis kept, never woke`);
				}
				for (const sage of this.sagesTonight) if (b.seats[sage].character === 'sage' && !nt.done.includes(`sage:${sage}`)) this.fail('sage', `${name(sage)}, a Sage killed by the Demon, never woke`);
				this.sagesTonight = [];
				if (e.n === 1) for (const s of b.seats) if (!wakes.has(s.id)) this.fail('first-night-everyone', `${name(s.id)} never woke on the first night`);
				break;
			}
			case 'game-over': {
				const mastermindDay = !!b.mastermind && b.day?.n === b.mastermind.day;
				if (e.winner === 'good') {
					const executedDemon = this.deathsNow.some((x) => x.cause === 'execution' && teamIn(b, this.start!.seats[x.seat].character) === 'demon');
					const mastermindStops = executedDemon && this.start!.seats.some((x) => working(this.start!, x.id, 'mastermind'));
					const demonDead = demonsAlive(b) === 0 && !b.mastermind && !mastermindStops;
					const mayorWin = b.phase.kind === 'day' && reallyLiving(b) === 3 && b.day?.executed === null
						&& b.seats.some((x) => working(b, x.id, 'mayor'));
					const mastermindLoss = mastermindDay && ['end-day', 'nominate', 'judge', 'madness'].includes(cmd.type);
					if (twinsHold(b) && !mastermindLoss) this.fail('evil-twin', 'good won while both twins live');
					if (!demonDead && !mayorWin && !mastermindLoss) this.fail('good-wins-fairly', `good won: ${e.reason}`);
				} else {
					const two = reallyLiving(b) <= 2 && !b.mastermind;
					const saint = this.lastDeath?.cause === 'execution' && this.lastDeath.character === 'saint' && this.lastDeath.working;
					const mastermindWin = mastermindDay && ['end-day', 'nominate', 'judge', 'madness'].includes(cmd.type);
					const vortoxDay = cmd.type === 'end-day' && b.day?.executed === null && vortoxOn(b);
					const klutzWin = cmd.type === 'klutz' && b.seats[cmd.by].character === 'klutz' && !dp(b, cmd.by) && b.seats[cmd.target].alignment === 'evil';
					const twin = (cmd.type === 'end-day' || cmd.type === 'nominate' || cmd.type === 'madness') && this.events.some((x) => x.type === 'executed'
						&& b.effects.some((t) => t.kind === 'twin' && t.target === x.seat && t.by !== null && working(b, t.by, 'evil-twin')));
					if (!two && !saint && !mastermindWin && !vortoxDay && !klutzWin && !twin) this.fail('evil-wins-fairly', `evil won: ${e.reason}`);
				}
				break;
			}
		}
	}

	/** Things that are always true between commands. */
	private state(s: GameState, prev: GameState) {
		for (const x of s.seats) {
			if (!x.character) continue;
			if (!this.turned.has(x.id) && x.alignment !== teamAlignment(charDef(getScript(s.scriptId), x.character).team)) this.fail('alignment-follows-character', `${x.name} is ${x.alignment} as ${x.character}`);
			if (x.alive && !x.ghostVote) this.fail('ghost-vote-only-dead', `${x.name} is alive with their ghost vote spent`);
			if (this.dead.has(x.id) && x.alive) this.fail('dead-stay-dead', `${x.name} came back to life`);
			if (!x.alive) this.dead.add(x.id);
			const misled = x.character === 'drunk' || x.character === 'lunatic';
			if (x.believes !== x.character && !misled) this.fail('only-the-drunk-is-misled', `${x.name} is ${x.character} but believes ${x.believes}`);
			if (x.character === 'drunk' && teamIn(s, x.believes) !== 'townsfolk') this.fail('drunk-believes-townsfolk', `${x.name} the Drunk believes ${x.believes}`);
			if (x.character === 'lunatic' && teamIn(s, x.believes) !== 'demon') this.fail('lunatic-believes-demon', `${x.name} the Lunatic believes ${x.believes}`);
		}
		if ((s.phase.kind === 'night' || s.phase.kind === 'day') && !s.mastermind) {
			if (demonsAlive(s) < 1 && !twinsHold(s)) this.fail('one-demon', 'no living Demon and the game goes on');
			if (demonsAlive(s) > 1 && !this.pitHagDemon) this.fail('one-demon', `${demonsAlive(s)} living Demons`);
			if (reallyLiving(s) < 3) this.fail('two-left-evil-wins', `${reallyLiving(s)} alive and the game goes on`);
		}
		for (const x of s.effects) {
			if (x.kind !== 'poisoned' || x.by === null) continue;
			const p = s.seats[x.by];
			if (!(p.alive || p.undead) || p.character !== x.role) this.fail('poison-needs-poisoner', `poison held by ${p.name} (${p.character}, ${p.alive ? 'alive' : 'dead'})`);
		}
		for (const g of this.ghostsUsed) if (s.seats[g].ghostVote && !s.seats[g].alive) this.fail('ghost-votes-spent', `${s.seats[g].name} still has the ghost vote they used`);
		for (const g of [...this.ghostsUsed]) if (s.seats[g].alive) this.ghostsUsed.delete(g); // brought back to life: a fresh ghost vote later
		if (s.redHerring !== null && s.seats[s.redHerring].alignment !== 'good' && !this.turned.has(s.redHerring)) this.fail('red-herring-good', 'the red herring is evil');
		if (s.day) {
			const by = s.day.nominations.map((n) => n.nominator), of = s.day.nominations.map((n) => n.nominee);
			if (new Set(by).size !== by.length || new Set(of).size !== of.length) this.fail('nominate-once', 'a repeated nominator or nominee today');
		}
		// What the phones see.
		const view = JSON.stringify(publicView(s));
		for (const x of s.seats) {
			if (x.character && view.includes(`"${x.character}"`)) this.fail('public-view-hides-characters', `the public view mentions ${x.character}`);
			const card = cardFor(s, x.id);
			if (x.believes && card?.id !== x.believes) this.fail('card-shows-belief', `${x.name}'s card shows ${card?.id}, they believe ${x.believes}`);
		}
		if (s.phase.kind === 'night' && s.night) {
			const pv = publicView(s);
			for (const d of s.night.deaths) if (!pv.seats.find((x) => x.id === d)?.alive) this.fail('night-deaths-hidden', `${s.seats[d].name}'s death shows before dawn`);
		}
		if (prev.phase.kind === 'over' && JSON.stringify(prev) !== JSON.stringify(s)) this.fail('over-is-over', 'the game changed after it ended');
	}
}

// ---- playing ------------------------------------------------------------------------------

/** Freeze a state all the way down, so changing it in place throws. */
function deepFreeze<T>(o: T): T {
	if (o && typeof o === 'object' && !Object.isFrozen(o)) {
		Object.freeze(o);
		for (const v of Object.values(o as object)) deepFreeze(v);
	}
	return o;
}

/** Play one whole game from a seed (the script alternates with the seed unless given). */
export function play(seed: number, scriptId = SIM_SCRIPTS[seed % SIM_SCRIPTS.length]): Played {
	const r = rng(seed * 7919 + 13);
	const script: Script = getScript(scriptId);
	const checker = new Checker();
	const stats: Record<string, number> = {};
	const commands: Command[] = [];
	let state = deepFreeze(emptyState());
	let refusals = 0;
	const allEvents: GameEvent[] = [];
	const count = (k: string) => (stats[k] = (stats[k] ?? 0) + 1);

	const apply = (first: Command) => {
		let cmd = first;
		for (let tries = 0; tries < 4; tries++) {
			// The state is frozen: if the engine tried to change it in place, this throws.
			let res: ReturnType<typeof perform>;
			try {
				res = perform(state, cmd);
			} catch (err) {
				checker.violations.push({ rule: 'engine-is-pure', detail: `${cmd.type}: ${(err as Error).stack?.split(String.fromCharCode(10)).slice(0, 3).join(' ')}`, at: checker.accepted });
				commands.push(cmd);
				return;
			}
			if (res.ok) {
				checker.accept(state, cmd, res.events, res.state);
				for (const e of res.events) {
					count(e.type);
					if (e.type === 'became-demon') count(`via ${e.via}`);
					if (e.type === 'kill-prevented') count(`saved: ${e.reason}`);
					if (e.type === 'died') count(`died: ${e.cause}`);
					if (e.type === 'survived-execution') count(`survived execution: ${e.reason}`);
					if (e.type === 'revived') count(`revived by the ${e.by}`);
					if (e.type === 'game-over') count(`won: ${e.winner}: ${e.reason.startsWith('The Mastermind') ? 'the Mastermind' : e.reason.startsWith('The Klutz') ? 'the Klutz' : e.reason.startsWith('The good twin') ? 'the Evil Twin' : e.reason}`);
					if (e.type === 'executed' && cmd.type === 'nominate') count('virgin executes nominator');
					if (e.type === 'effect-added' && e.effect.role === 'goon') count('the Goon catches someone');
					if (e.type === 'effect-added' && e.effect.role === 'minstrel') count('the Minstrel plays');
				}
				allEvents.push(...res.events);
				commands.push(cmd);
				state = deepFreeze(res.state);
				return;
			}
			refusals++;
			checker.refusedTell(state, cmd);
			if (!res.decision) return;
			count(`asked: ${res.decision}`);
			cmd = answer(cmd, res.decision, state, r);
		}
	};

	const players = 5 + Math.floor(r() * 11);
	apply({ type: 'create', names: NAMES.slice(0, players), scriptId });
	// Now and then the Storyteller announces Fabled that change the rules.
	const deal = randomDeal(script, players, seed);
	const fabled = ['doomsayer', 'toymaker', 'ferryman', 'storm-catcher'].filter(() => chance(0.12, r)).map((id) => (id === 'storm-catcher'
		? { id, character: pick(script.characters.filter((c) => c.team === 'townsfolk'), r).id } : { id }));
	const bluffs = fabled.some((f) => f.id === 'toymaker') && !deal.bluffs.length
		? script.characters.filter((c) => (c.team === 'townsfolk' || c.team === 'outsider') && !deal.characters.includes(c.id) && c.id !== deal.drunkBelieves).slice(0, 3).map((c) => c.id) : deal.bluffs;
	apply({ ...deal, bluffs, ...(fabled.length ? { fabled } : {}) });
	for (const f of fabled) count(`fabled: ${f.id}`);
	apply({ type: 'begin' });
	for (let i = 0; i < MAX_COMMANDS && state.phase.kind !== 'over' && state.phase.kind !== 'setup'; i++) {
		apply(propose(state, r));
	}
	if (state.phase.kind !== 'over') count('unfinished');
	else {
		// Once it is over, nothing but notes is allowed.
		const late = perform(state, { type: 'end-day' });
		if (late.ok) checker.violations.push({ rule: 'over-is-over', detail: 'a command was accepted after the game ended', at: checker.accepted });
	}
	if (JSON.stringify(replay(allEvents)) !== JSON.stringify(state)) checker.violations.push({ rule: 'replay', detail: 'replaying the events does not rebuild the game', at: checker.accepted });
	count(`players: ${players}`);
	count(`script: ${scriptId}`);
	return { seed, scriptId, commands, state, violations: checker.violations, refusals, stats };
}

/** Replay a list of commands (skipping any now refused) and report the first violations. */
export function check(commands: Command[]): Violation[] {
	const checker = new Checker();
	let state = emptyState();
	for (const cmd of commands) {
		let res: ReturnType<typeof perform>;
		try {
			res = perform(state, cmd);
		} catch (err) {
			checker.violations.push({ rule: 'engine-is-pure', detail: `${cmd.type}: ${(err as Error).message}`, at: checker.accepted });
			break;
		}
		if (res.ok) {
			checker.accept(state, cmd, res.events, res.state);
			state = res.state;
		}
		if (checker.violations.length) break;
	}
	return checker.violations;
}

/**
 * Cut a failing game down: drop commands while the same rule still breaks.
 * Commands that become illegal on the way are skipped by `check`.
 */
export function shrink(commands: Command[], rule: string): Command[] {
	let cur = [...commands];
	const fails = (cmds: Command[]) => check(cmds).some((v) => v.rule === rule);
	if (!fails(cur)) return cur;
	// Everything after the failure is noise.
	for (let n = 1; n <= cur.length; n++) if (fails(cur.slice(0, n))) { cur = cur.slice(0, n); break; }
	for (let size = Math.ceil(cur.length / 2); size >= 1; size = size === 1 ? 0 : Math.ceil(size / 2)) {
		for (let i = 0; i + size <= cur.length;) {
			// Keep the game's creation, dealing and first night start.
			if (i < 3) { i = 3; continue; }
			const tryCmds = [...cur.slice(0, i), ...cur.slice(i + size)];
			if (fails(tryCmds)) cur = tryCmds;
			else i += size;
		}
	}
	return cur;
}
