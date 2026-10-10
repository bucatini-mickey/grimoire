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
export type Team = 'townsfolk' | 'outsider' | 'minion' | 'demon';
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
}

export interface Script {
	id: string;
	name: string;
	characters: CharacterDef[];
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
}

export interface NightState {
	n: number;
	/** Wake steps already resolved, by step id. */
	done: string[];
	/** Who died tonight, in order. */
	deaths: SeatId[];
	/** Seat the Monk is protecting tonight, if the Monk's ability worked. */
	protectedSeat: SeatId | null;
	/** A Minion who caught the Demon tonight (starpass) does not also kill tonight. */
	demonMadeTonight: SeatId | null;
}

export type DeathCause = 'demon' | 'execution' | 'slayer' | 'starpass';

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
	/**
	 * Who is poisoned, until dusk or until the Poisoner loses their ability.
	 * `by` is null when the Storyteller set it by hand.
	 */
	poison: { by: SeatId | null; target: SeatId } | null;
	butlerMaster: SeatId | null;
	/** Once-per-game abilities that are gone, as `${seat}:${ability}`. */
	spent: string[];
	night: NightState | null;
	day: DayState | null;
	/** The last player to die by execution, for the Undertaker. */
	lastExecution: { day: number; seat: SeatId } | null;
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
	/** Ravenkeeper: the player they chose and that player's character. */
	| { kind: 'reveal'; player: SeatId; character: CharacterId };

// ---- the event log ----------------------------------------------------------

export type GameEvent =
	| { type: 'game-created'; scriptId: string; names: string[] }
	| {
			type: 'characters-assigned';
			seats: { character: CharacterId; believes: CharacterId }[];
			redHerring: SeatId | null;
			bluffs: CharacterId[];
	  }
	| { type: 'night-began'; n: number }
	| { type: 'role-shown'; to: SeatId }
	| { type: 'evil-info-shown'; to: SeatId; as: 'minion' | 'demon' }
	/** A player chose someone at night. `effective` is false when drunk, poisoned or the Drunk. */
	| { type: 'chose'; by: SeatId; role: CharacterId; targets: SeatId[]; effective: boolean }
	| { type: 'info-given'; to: SeatId; role: CharacterId; info: Info; truthful: boolean; override: boolean }
	| { type: 'grimoire-shown'; to: SeatId }
	| { type: 'demon-told'; to: SeatId }
	| { type: 'kill-prevented'; target: SeatId; reason: string }
	| { type: 'kill-redirected'; from: SeatId; to: SeatId }
	| { type: 'died'; seat: SeatId; cause: DeathCause }
	| { type: 'became-demon'; seat: SeatId; character: CharacterId; via: 'starpass' | 'scarlet-woman' }
	| { type: 'step-done'; step: string }
	| { type: 'step-skipped'; step: string; reason: string }
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
	| { type: 'red-herring-set'; seat: SeatId | null }
	| { type: 'game-over'; winner: Alignment; reason: string }
	| { type: 'note'; text: string };
