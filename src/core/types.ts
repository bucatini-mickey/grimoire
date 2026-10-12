/**
 * types.ts - the shared vocabulary of the rules engine.
 *
 * The engine is event-sourced: a game is nothing but an ordered list of
 * GameEvents. GameState is what you get by folding those events through
 * `reduce` (state.ts). Commands (engine.ts) are requests from the Storyteller;
 * the engine checks them against the rules and either refuses with a reason
 * or answers with the events they cause.
 *
 * Everything here is plain data: no DOM, no network, no clocks, no randomness.
 * That keeps the rules testable and lets any front end (the ASCII grimoire,
 * a later networked mode, a terminal) drive the same game.
 */

/**
 * A player, numbered in the order they were first seated. Where they sit is
 * GameState.order, which the Storyteller can change mid-game; everything that
 * cares about neighbours reads the order, never the number.
 */
export type SeatId = number;
export type CharacterId = string;
/** A character's team. Travellers are apart: they join late, are exiled not executed, and their alignment is the Storyteller's choice. */
export type Team = 'townsfolk' | 'outsider' | 'minion' | 'demon' | 'traveller';
export type Alignment = 'good' | 'evil';

export interface Composition {
	townsfolk: number;
	outsider: number;
	minion: number;
	demon: number;
}

export interface CharacterDef {
	id: CharacterId;
	name: string;
	team: Team;
	/** Our own paraphrase of what the character does. Never the official card text. */
	ability: string;
	/** Position in the first-night wake order; null = does not wake on the first night. */
	firstNight: number | null;
	/** Position in the wake order on every other night; null = does not wake then. */
	otherNight: number | null;
	/** Change to the team counts when this character is in play (Baron). */
	setup?: Partial<Composition>;
	/** Changes the Storyteller chooses between at setup (the Godfather: one more or one fewer Outsider). */
	setupOptions?: Partial<Composition>[];
}

export interface Script {
	id: string;
	name: string;
	characters: CharacterDef[];
	/** The Travellers that may join this script's games (not dealt at setup). */
	travellers?: CharacterDef[];
}

export interface Seat {
	id: SeatId;
	name: string;
	/** The true character: what the grimoire says. */
	character: CharacterId;
	/** What the player was told they are. Differs only for the Drunk. */
	believes: CharacterId;
	alignment: Alignment;
	alive: boolean;
	/** Dead players get one vote for the rest of the game. */
	ghostVote: boolean;
	/** The Zombuul after its first death: counts as dead in every way, but lives on. */
	undead?: boolean;
	/** Joined as a Traveller: exiled, never executed, and not counted for "two players left" (even after gaining another ability). */
	traveller?: boolean;
}

export type Phase =
	| { kind: 'setup' }
	| { kind: 'night'; n: number }
	| { kind: 'day'; n: number }
	| { kind: 'over'; winner: Alignment; reason: string };

export interface Nomination {
	nominator: SeatId;
	nominee: SeatId;
	/** null until the vote has been counted. */
	votes: number | null;
	voters: SeatId[];
}

export interface DayState {
	n: number;
	/** Talk first; nominations only once the Storyteller opens them. */
	stage: 'discussion' | 'nominations';
	nominations: Nomination[];
	/** Who is "about to die" if the day ended now. */
	block: SeatId | null;
	/** The vote count a nomination must beat to take the block (ties clear it). */
	highest: number;
	/** Set once anyone has been executed today: there are no more nominations. */
	executed: SeatId | null;
	/** Who died today, in order (the Zombuul, the Godfather and the Undertaker look). */
	deaths: SeatId[];
	/** The Gossip's statements today, and whether each was true. */
	gossip: { by: SeatId; true: boolean }[];
}

export interface NightState {
	n: number;
	/** Wake steps already resolved, by step id. */
	done: string[];
	/** Who died tonight, in order. */
	deaths: SeatId[];
	/** A Minion who caught the Demon tonight (starpass) does not also kill tonight. */
	demonMadeTonight: SeatId | null;
	/** Who died the day before this night (the Zombuul wakes only if no one did; the Godfather if an Outsider did). */
	dayDeaths: SeatId[];
	/** True statements the Gossip made the day before. */
	gossip: { by: SeatId }[];
	/** Players who came back to life tonight (the Professor, the Shabaloth). */
	revived: SeatId[];
	/** Who voted and who nominated the day before (the Flowergirl, the Town Crier). */
	dayVoters?: SeatId[];
	dayNominators?: SeatId[];
	/** Players the Demon killed tonight (the Sage). */
	demonKills?: SeatId[];
	/** Players whose character changed tonight, and the place in the night it happened: their new character acts tonight only if its place is still to come. */
	changed?: { seat: SeatId; at: number }[];
	/** How far through the night order tonight has got (the place of the latest step resolved). */
	reached?: number;
	/** Everyone who became a Demon tonight, and the place in the night it happened: each is told just after, and does not act tonight. */
	made?: { seat: SeatId; at: number }[];
	/** The Pit-Hag made a Demon tonight: tonight's deaths are the Storyteller's choice. */
	arbitrary?: boolean;
}

export type DeathCause = 'demon' | 'execution' | 'slayer' | 'starpass'
	| 'assassin' | 'godfather' | 'gambler' | 'gossip' | 'moonchild' | 'grandmother' | 'tinker' | 'storyteller'
	| 'witch' | 'fang-gu' | 'exile' | 'left' | 'gunslinger' | 'harlot' | 'doomsayer';

/**
 * A lasting effect of an ability: poisoned, drunk, safe, a Butler's master...
 * Effects are added and ended by events, so the log says exactly when each
 * began and ended. Whether one is in force right now may also depend on its
 * source (see rules.ts, `inForce`).
 */
export type EffectKind =
	| 'poisoned' | 'drunk'
	/** The Monk's charge: the Demon cannot kill them tonight. */
	| 'safe-from-demon'
	/** The Innkeeper's guests: nothing can kill them tonight (but the Assassin). */
	| 'safe-tonight'
	/** The Devil's Advocate's client: survives an execution tomorrow. */
	| 'survives-execution'
	/** The Butler's master. */
	| 'master'
	/** The Grandmother's grandchild. */
	| 'grandchild'
	/** A Demon the Exorcist chose: does not wake to act tonight. */
	| 'exorcised'
	/** A choice remembered for "not the same as last night" (Exorcist, Devil's Advocate) or "last night's" (Shabaloth). */
	| 'chose-last'
	/** The Po chose no one: three attacks next time. */
	| 'po-charged'
	/** The Moonchild's choice, waiting for tonight; `good` is the target's alignment when chosen. */
	| 'moonchild'
	/** The Witch's curse: dies if they nominate today. */
	| 'cursed'
	/** The Cerenovus: must be "mad" today that they are the character in `note`. */
	| 'mad'
	/** The Evil Twin (by) and the good twin (target). */
	| 'twin'
	/** One of the Juggler's guesses: the target is the character in `note`. */
	| 'juggled'
	/** A Minion the Vigormortis killed: their ability keeps working while dead. (The Bone Collector's choice too, until dusk.) */
	| 'keeps-ability'
	/** The Bureaucrat's choice: their votes count three times today. */
	| 'vote-x3'
	/** The Thief's choice: their votes count minus one today. */
	| 'vote-minus'
	/** The Barista's choice: sober and healthy, with true information, until dusk. */
	| 'sober';
export interface Effect {
	kind: EffectKind;
	target: SeatId;
	/** Whose ability; null for the Storyteller's hand. */
	by: SeatId | null;
	/** The ability that made it (for the Storyteller's reminders and the Mathematician). */
	role: CharacterId | 'storyteller';
	/** When it wears off by itself: at the next dusk, the next dawn, never, or at the dusk that starts night n. */
	until: 'dusk' | 'dawn' | 'game' | { dusk: number };
	/** It ends for good when its source dies or stops being this character (the Poisoner's poison). */
	endsWithSource?: boolean;
	/** In force only while its source is alive, sober and healthy; resumes when they are (the Courtier). */
	whileSourceWorks?: boolean;
	/** Anything else the ability needs to remember (the Moonchild: was the target good when chosen). */
	note?: string;
}

export interface GameState {
	scriptId: string;
	seats: Seat[];
	/** Who sits where, clockwise from the top. */
	order: SeatId[];
	phase: Phase;
	/** The good player the Fortune Teller reads as the Demon. */
	redHerring: SeatId | null;
	/** The three not-in-play good characters shown to the Demon. */
	bluffs: CharacterId[];
	/** Lasting effects in play: poison, protection, a Butler's master (see Effect). */
	effects: Effect[];
	/** Once-per-game abilities that are gone, as `${seat}:${ability}`. */
	spent: string[];
	night: NightState | null;
	day: DayState | null;
	/** The last player to die by execution, for the Undertaker. */
	lastExecution: { day: number; seat: SeatId } | null;
	/** The Mastermind's extra day, once the Demon has died by execution. */
	mastermind: { day: number } | null;
	/** The Fabled the Storyteller announced for this game (the Storm Catcher names a character). */
	fabled?: { id: string; character?: CharacterId }[];
	/** A player who has just become the Demon and has not been told yet. */
	newDemon: { seat: SeatId; during: 'day' | 'night' } | null;
}

// ---- information a player is given at night -------------------------------

export type Info =
	/** Washerwoman, Librarian, Investigator: one of these two is this character. */
	| { kind: 'pair'; players: [SeatId, SeatId]; character: CharacterId }
	/** Librarian: there are no Outsiders in play. */
	| { kind: 'none' }
	/** Chef, Empath. */
	| { kind: 'number'; value: number }
	/** Fortune Teller: the two players they chose, and the answer. */
	| { kind: 'fortune'; players: [SeatId, SeatId]; yes: boolean }
	/** Undertaker: the character executed today. */
	| { kind: 'character'; character: CharacterId }
	/** Ravenkeeper: the player they chose and that player's character. Grandmother: the grandchild and their character. */
	| { kind: 'reveal'; player: SeatId; character: CharacterId }
	/** Chambermaid: the two players chosen, and how many woke tonight to use their own ability. */
	| { kind: 'woke'; players: [SeatId, SeatId]; value: number }
	/** Godfather: the Outsiders in play. */
	| { kind: 'characters'; characters: CharacterId[] }
	/** Flowergirl, Town Crier: yes or no. */
	| { kind: 'yesno'; yes: boolean }
	/** Dreamer: the player chosen, and two characters (one good, one evil), one of them theirs. */
	| { kind: 'dream'; player: SeatId; characters: [CharacterId, CharacterId] }
	/** Sage: two players, one of them the Demon that killed them. */
	| { kind: 'players'; players: [SeatId, SeatId] }
	/** Seamstress: the two players chosen, and whether they are on the same team. */
	| { kind: 'same'; players: [SeatId, SeatId]; yes: boolean };

// ---- the event log ----------------------------------------------------------

export type GameEvent =
	| { type: 'game-created'; scriptId: string; names: string[] }
	| {
			type: 'characters-assigned';
			seats: { character: CharacterId; believes: CharacterId }[];
			redHerring: SeatId | null;
			bluffs: CharacterId[];
			fabled?: { id: string; character?: CharacterId }[];
	  }
	| { type: 'night-began'; n: number }
	| { type: 'role-shown'; to: SeatId }
	| { type: 'evil-info-shown'; to: SeatId; as: 'minion' | 'demon' }
	/** A player chose someone at night. `effective` is false when drunk, poisoned or the Drunk. */
	| { type: 'chose'; by: SeatId; role: CharacterId; targets: SeatId[]; effective: boolean; character?: CharacterId }
	| { type: 'info-given'; to: SeatId; role: CharacterId; info: Info; truthful: boolean; override: boolean }
	| { type: 'grimoire-shown'; to: SeatId }
	| { type: 'demon-told'; to: SeatId }
	| { type: 'kill-prevented'; target: SeatId; reason: string }
	| { type: 'kill-redirected'; from: SeatId; to: SeatId }
	| { type: 'died'; seat: SeatId; cause: DeathCause }
	| { type: 'became-demon'; seat: SeatId; character: CharacterId; via: 'starpass' | 'scarlet-woman' | 'snake-charmer' | 'fang-gu' | 'pit-hag'; at?: number }
	| { type: 'step-done'; step: string; order?: number }
	| { type: 'step-skipped'; step: string; reason: string; order?: number }
	| { type: 'day-began'; n: number }
	| { type: 'nominated'; nominator: SeatId; nominee: SeatId }
	| { type: 'ability-spent'; seat: SeatId; ability: CharacterId }
	| {
			type: 'vote-tallied';
			nominee: SeatId;
			voters: SeatId[];
			ghostsSpent: SeatId[];
			votes: number;
			needed: number;
			outcome: 'on-the-block' | 'tied' | 'not-enough';
	  }
	| { type: 'executed'; seat: SeatId }
	| { type: 'slayer-shot'; by: SeatId; target: SeatId; hit: boolean }
	| { type: 'nominations-opened' }
	| { type: 'seats-swapped'; a: SeatId; b: SeatId }
	/** The Storyteller moving tokens by hand, outside the rules. */
	| { type: 'adjusted'; seat: SeatId; alive?: boolean; character?: CharacterId; believes?: CharacterId; ghostVote?: boolean }
	| { type: 'poison-set'; target: SeatId | null }
	/** A player's alignment changes (the Goon, ...). Their character stays. */
	| { type: 'alignment-changed'; seat: SeatId; alignment: Alignment }
	/** A player's character changes (the Pit-Hag, the Snake Charmer, the Barber, the Philosopher). Alignment changes separately. */
	| { type: 'character-changed'; seat: SeatId; character: CharacterId; believes: CharacterId; by: CharacterId; at?: number }
	/** A Traveller joins the game, sitting just after `after`. */
	| { type: 'traveller-joined'; seat: SeatId; name: string; character: CharacterId; alignment: Alignment; after: SeatId }
	/** The group decides on an exile: who supported it, how many were needed, and whether it passed. */
	| { type: 'exile-decided'; seat: SeatId; supporters: SeatId[]; needed: number; passed: boolean }
	/** The Ferryman: on the final day every dead player gets their vote back. */
	| { type: 'votes-restored' }
	/** The Judge's ruling on the current nomination. */
	| { type: 'judged'; by: SeatId; nominee: SeatId; verdict: 'pardon' | 'condemn' }
	/** A dead player comes back to life (the Professor, the Shabaloth). */
	| { type: 'revived'; seat: SeatId; by: CharacterId }
	/** The Zombuul's first death: they count as dead but live on. */
	| { type: 'seems-dead'; seat: SeatId; cause: DeathCause }
	/** An executed player who does not die (Pacifist, Devil's Advocate, Tea Lady, Sailor, Fool...). */
	| { type: 'survived-execution'; seat: SeatId; reason: string }
	/** The Gossip's public statement, and whether the Storyteller judged it true. */
	| { type: 'gossiped'; by: SeatId; true: boolean }
	/** The Mastermind keeps the game going one more day. */
	| { type: 'mastermind-day'; day: number }
	/** A lasting effect begins. */
	| { type: 'effect-added'; effect: Effect }
	/** Lasting effects end: every one matching all the given fields. */
	| { type: 'effects-ended'; match: Partial<Pick<Effect, 'kind' | 'target' | 'by' | 'role'>> }
	| { type: 'red-herring-set'; seat: SeatId | null }
	| { type: 'game-over'; winner: Alignment; reason: string }
	| { type: 'note'; text: string };
