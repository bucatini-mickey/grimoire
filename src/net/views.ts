/**
 * views.ts - exactly what a player is allowed to see. Nothing else.
 *
 * Everything a player's eyes meet goes through here, whether the Storyteller
 * hands them the phone or it arrives on their own phone over the network:
 *
 *   publicView  the circle as the whole room knows it (names, who is dead
 *               as of dawn, the block, the clock); never a character
 *   cardFor     one player's own character, as THEY were told it (the Drunk
 *               sees the Townsfolk they think they are)
 *   wakeFor     the pages for one night wake: who they are, what they know
 *               about the evil team, whom they may choose, what they learn
 *
 * All pure and tested (tests/views.test.ts), so a leak is a failing test.
 */
import * as G from '../core/index.ts';
import type { CharacterId, GameState, Info, SeatId } from '../core/index.ts';

// ---- shapes -------------------------------------------------------------------------

/** A titled block of lines on a player's page. 'big' lines are names and answers. */
export interface Section {
	title: string;
	lines: string[];
	style: 'big' | 'text' | 'note';
}

export interface Pick {
	count: number;
	prompt: string;
	/** Seats they may choose (the Monk and Butler cannot choose themselves). */
	allowed: SeatId[];
}

export interface GrimoireLine {
	name: string;
	character: string;
	evil: boolean;
	flags: string[];
	notes: string[];
}

/** One night wake, as pages: who (sections), then pick, then info, then grimoire. */
export interface Wake {
	/** Unique per night and step, so a late answer cannot land on the wrong wake. */
	id: string;
	seat: SeatId | null;
	/** The character they are shown as, for the picture. */
	role: CharacterId;
	sections: Section[];
	pick?: Pick;
	/** After choosing, the player waits for the Storyteller's answer (Fortune Teller, Ravenkeeper). */
	followUp?: boolean;
	info?: Section[];
	grimoire?: { lines: GrimoireLine[]; bluffs: string[] };
}

export interface PublicSeat {
	id: SeatId;
	name: string;
	/** As the room knows it: deaths in the night are not known until dawn. */
	alive: boolean;
	ghostVote: boolean;
}

export interface PublicView {
	phase: 'setup' | 'night' | 'day' | 'over';
	/** The script being played (its look follows it: Laissez un Faire is occult). */
	script?: string;
	n: number;
	order: SeatId[];
	seats: PublicSeat[];
	block: { seat: SeatId; votes: number } | null;
	executed: SeatId | null;
	nominations: { nominator: SeatId; nominee: SeatId; votes: number | null }[];
	winner: 'good' | 'evil' | null;
	reason: string;
}

export interface CharacterCard {
	id: CharacterId;
	name: string;
	ability: string;
	team: 'good' | 'evil';
}

// ---- helpers ----------------------------------------------------------------------------

const script = (s: GameState) => G.getScript(s.scriptId || 'trouble-brewing');
const charName = (s: GameState, id: CharacterId) => G.charDef(script(s), id).name;
const nameOf = (s: GameState, id: SeatId) => s.seats[id]?.name ?? '?';

/** How many players the woken player chooses (with the game, exactly: the Po after a night of choosing no one picks three). */
export function playerPicks(kind: string, state?: GameState, seat?: SeatId | null): number {
	if (G.stepAction(kind) === 'choose') return state ? G.pickSpec(state, kind, seat ?? null).count : 1;
	if (kind === 'fortune-teller' || kind === 'chambermaid' || kind === 'seamstress') return 2;
	if (kind === 'ravenkeeper' || kind === 'dreamer') return 1;
	return 0;
}

export const PICK_PROMPT: Record<string, string> = {
	poisoner: 'Choose a player to poison',
	monk: 'Choose a player to protect',
	butler: 'Choose your master',
	imp: 'Choose a player to kill',
	'fortune-teller': 'Choose two players',
	ravenkeeper: 'Choose a player to learn their character',
	chambermaid: 'Choose two other living players',
	dreamer: 'Choose another player',
	seamstress: 'Choose two other players',
	sailor: 'Choose a living player',
	innkeeper: 'Choose two players to keep safe',
	exorcist: 'Choose a player',
	gambler: 'Choose a player, then guess their character',
	courtier: 'Choose a character',
	professor: 'Choose a dead player',
	'devils-advocate': 'Choose a living player',
	assassin: 'Choose a player, or no one',
	godfather: 'Choose a player to kill',
	zombuul: 'Choose a player to kill',
	pukka: 'Choose a player',
	shabaloth: 'Choose two players to kill',
	po: 'Choose a player, or no one'
};

/** Who the woken player may choose: the rules of their ability (another player, the living, the dead, not last night's choice). */
export function pickAllowed(state: GameState, kind: string, by: SeatId | null, target: SeatId): boolean {
	if (kind === 'chambermaid') return target !== by && state.seats[target].alive;
	if (kind === 'dreamer' || kind === 'seamstress') return target !== by;
	if (G.stepAction(kind) !== 'choose') return true;
	const spec = G.pickSpec(state, kind, by);
	const t = state.seats[target];
	if (spec.notSelf && target === by) return false;
	if (spec.alive && !t.alive) return false;
	if (spec.dead && t.alive) return false;
	if (spec.notLast && state.effects.some((e) => e.kind === 'chose-last' && e.by === by && e.target === target)) return false;
	return true;
}

/** The prompt for a pick (the Lunatic sees their believed Demon's). */
export function pickPrompt(state: GameState, kind: string, seat: SeatId | null): string {
	const k = kind === G.LUNATIC && seat !== null ? state.seats[seat].believes : kind;
	const n = playerPicks(kind, state, seat);
	if (k === 'po' && n === 3) return 'Choose three players to kill';
	return PICK_PROMPT[k] ?? (n === 1 ? 'Choose a player' : `Choose ${n} players`);
}

/** The character a step is about: the evil-team and reveal steps are about the player's own. */
export function stepRole(state: GameState, kind: string, seat: SeatId | null): CharacterId {
	if (kind === G.NEW_DEMON) return seat !== null ? state.seats[seat].character : 'imp';
	if (kind === G.GODFATHER_INFO) return 'godfather';
	if (seat !== null && (kind === G.REVEAL || kind === G.MINION_INFO || kind === G.DEMON_INFO || kind === G.EXORCISED || kind === G.LUNATIC_INFO || kind === G.LUNATIC)) return state.seats[seat].believes;
	return kind;
}

/** Dead as the room knows it: dead, and not merely killed tonight. */
export function deadAtDusk(state: GameState, id: SeatId): boolean {
	return !state.seats[id].alive && !(state.night?.deaths.includes(id) ?? false);
}

// ---- the public circle -------------------------------------------------------------------

export function publicView(state: GameState): PublicView {
	const p = state.phase;
	return {
		phase: p.kind,
		script: state.scriptId,
		n: p.kind === 'night' || p.kind === 'day' ? p.n : 0,
		order: [...state.order],
		seats: state.seats.map((s) => ({ id: s.id, name: s.name, alive: !deadAtDusk(state, s.id) && (s.alive || state.phase.kind === 'night'), ghostVote: s.ghostVote })),
		block: state.day && state.day.block !== null ? { seat: state.day.block, votes: state.day.highest } : null,
		executed: state.day?.executed ?? null,
		nominations: (state.day?.nominations ?? []).map((n) => ({ nominator: n.nominator, nominee: n.nominee, votes: n.votes })),
		winner: p.kind === 'over' ? p.winner : null,
		reason: p.kind === 'over' ? p.reason : ''
	};
}

// ---- one player's own character -------------------------------------------------------------

export function cardFor(state: GameState, seat: SeatId): CharacterCard | null {
	const s = state.seats[seat];
	if (!s?.believes) return null;
	const def = G.charDef(script(state), s.believes);
	// The Drunk is told a Townsfolk, so their card says good, like any Townsfolk.
	return { id: def.id, name: def.name, ability: def.ability, team: G.teamAlignment(def.team) };
}

// ---- one night wake -----------------------------------------------------------------------

/** What the evil team learns of each other on the first night (7+ players). */
function evilKnowledge(state: GameState, kind: string, seat: SeatId | null): Section[] {
	const demon = state.seats.filter((x) => G.teamOf(state, x.character) === 'demon');
	const minions = state.seats.filter((x) => G.teamOf(state, x.character) === 'minion');
	if (kind === G.DEMON_INFO) {
		return [
			{ title: 'Your Minions', lines: minions.map((m) => m.name), style: 'big' },
			{ title: 'Not in play', lines: state.bluffs.map((b) => charName(state, b)), style: 'big' }
		];
	}
	const learn = state.night?.n === 1 && G.evilLearnEachOther(state.seats.length);
	if (!learn || seat === null || G.teamOf(state, state.seats[seat].character) !== 'minion') return [];
	const others = minions.filter((m) => m.id !== seat);
	return [
		{ title: 'Your Demon', lines: demon.map((d) => d.name), style: 'big' },
		...(others.length ? [{ title: 'Fellow Minions', lines: others.map((m) => m.name), style: 'big' as const }] : [])
	];
}

const YESNO_QUESTION: Record<string, string> = { flowergirl: 'Did a Demon vote today?', 'town-crier': 'Did a Minion nominate today?' };

/** The information pages for an answer the Storyteller has chosen. */
export function infoSections(state: GameState, kind: string, info: Info): Section[] {
	const nm = (id: SeatId) => nameOf(state, id);
	const cn = (id: CharacterId) => charName(state, id);
	switch (info.kind) {
		case 'pair': return [{ title: 'You learn', lines: ['One of these is the'], style: 'note' }, { title: '', lines: [cn(info.character)], style: 'big' }, { title: 'They are', lines: info.players.map(nm), style: 'big' }];
		case 'none': return [{ title: 'You learn', lines: ['No Outsiders'], style: 'big' }, { title: '', lines: ['are in play'], style: 'note' }];
		case 'number': return [{ title: 'You learn', lines: [kind === 'chef' ? 'Pairs of evil players sitting together' : 'Of your living neighbours, evil'], style: 'note' }, { title: '', lines: [String(info.value)], style: 'big' }];
		case 'fortune': return [{ title: 'You learn', lines: [`Is ${nm(info.players[0])} or ${nm(info.players[1])} the Demon?`], style: 'note' }, { title: '', lines: [info.yes ? 'Yes' : 'No'], style: 'big' }];
		case 'character': return [{ title: 'You learn', lines: ['Executed today'], style: 'note' }, { title: '', lines: [cn(info.character)], style: 'big' }];
		case 'reveal': return [{ title: 'You learn', lines: [nm(info.player)], style: 'big' }, { title: '', lines: ['is the'], style: 'note' }, { title: '', lines: [cn(info.character)], style: 'big' }];
		case 'woke': return [{ title: 'You learn', lines: [`Of ${nm(info.players[0])} and ${nm(info.players[1])}, woke tonight`], style: 'note' }, { title: '', lines: [String(info.value)], style: 'big' }];
		case 'characters': return [{ title: 'Outsiders in play', lines: info.characters.length ? info.characters.map(cn) : ['None'], style: 'big' }];
		case 'yesno': return [{ title: 'You learn', lines: [YESNO_QUESTION[kind] ?? ''], style: 'note' }, { title: '', lines: [info.yes ? 'Yes' : 'No'], style: 'big' }];
		case 'dream': return [{ title: 'You learn', lines: [nm(info.player)], style: 'big' }, { title: '', lines: ['is one of'], style: 'note' }, { title: '', lines: info.characters.map(cn), style: 'big' }];
		case 'players': return [{ title: 'One of these is the Demon', lines: info.players.map(nm), style: 'big' }];
		case 'same': return [{ title: 'You learn', lines: [`Are ${nm(info.players[0])} and ${nm(info.players[1])} on the same team?`], style: 'note' }, { title: '', lines: [info.yes ? 'Yes' : 'No'], style: 'big' }];
	}
}

/** The Spy's view: every seat as the grimoire holds it, and the bluffs. */
function grimoire(state: GameState): Wake['grimoire'] {
	const lines = state.order.map((id) => {
		const s = state.seats[id];
		const flags: string[] = [];
		if (!s.alive) flags.push(s.ghostVote ? '†' : '×');
		if (G.isPoisoned(state, id)) flags.push('P');
		if (s.character === 'drunk') flags.push('D');
		if (state.redHerring === id) flags.push('R');
		const notes: string[] = [];
		if (s.character !== s.believes) notes.push(`thinks: ${charName(state, s.believes)}`);
		if (G.butlerMaster(state) === id) notes.push("Butler's master");
		if (G.safeFromDemon(state, id)) notes.push('Monk protects');
		return { name: s.name, character: charName(state, s.character), evil: s.alignment === 'evil', flags, notes };
	});
	return { lines, bluffs: state.bluffs.map((b) => charName(state, b)) };
}

/**
 * The pages for the next wake. `answer` is the information the Storyteller
 * has settled on, if any (for roles that learn something).
 */
export function wakeFor(state: GameState, step: G.NightStep, answer: Info | null = null): Wake {
	const kind = step.kind;
	const role = stepRole(state, kind, step.seat);
	const def = G.charDef(script(state), role);
	const sections: Section[] = [{ title: 'You are', lines: [kind === G.NEW_DEMON ? `now the ${def.name}` : `the ${def.name}`], style: 'big' }];
	if (kind === G.EXORCISED && step.seat !== null) {
		const ex = state.effects.find((e) => e.kind === 'exorcised' && e.target === step.seat);
		if (ex?.by != null) sections.push({ title: 'The Exorcist chose you', lines: [nameOf(state, ex.by)], style: 'big' }, { title: '', lines: ['You do not act tonight.'], style: 'note' });
	}
	if (state.night?.n === 1) {
		sections.push({ title: 'Your ability', lines: [def.ability], style: 'text' });
		sections.push({ title: 'Your team', lines: [G.teamAlignment(def.team) === 'evil' ? 'Evil' : 'Good'], style: 'big' });
	}
	sections.push(...evilKnowledge(state, kind, step.seat));
	const wake: Wake = { id: `${state.night?.n ?? 0}:${step.id}`, seat: step.seat, role, sections };
	const need = playerPicks(kind, state, step.seat);
	if (need && !answer) {
		wake.pick = {
			count: need,
			prompt: pickPrompt(state, kind, step.seat),
			allowed: state.order.filter((id) => pickAllowed(state, kind, step.seat, id))
		};
		if (G.stepAction(kind) === 'tell') wake.followUp = true;
	}
	if (answer) wake.info = infoSections(state, kind, answer);
	if (kind === 'spy') wake.grimoire = grimoire(state);
	return wake;
}
