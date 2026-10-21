/**
 * protocol.ts - the messages between the Storyteller's phone (the host) and
 * the players' phones. The host runs the game; a player's phone only shows
 * what it is sent (see views.ts) and sends back what the player chose.
 */
import type { SeatId } from '../core/index.ts';
import type { CharacterCard, PublicView, Wake } from './views.ts';
import type { VillageDown, VillageUp } from '../town/village.ts';

export interface Announcement {
	title: string;
	lines: string[];
}

/** A running clock, so phones can count down without a message every second. */
export interface ClockView {
	label: string;
	remainingMs: number;
	running: boolean;
	/** Host's wall clock when this was sent; phones count from when they receive it. */
	sentAt: number;
	/** How long the clock was set for. */
	totalMs?: number;
}

/** A nomination under way, as the players' phones need it: whose hands are up, where the count is. */
export interface VoteView {
	nominator: SeatId;
	nominee: SeatId;
	/** The count has begun (after the accusation and defence). */
	voting: boolean;
	/** The nominee first, then clockwise. */
	order: SeatId[];
	/** Whose hand the count is at now (null: done). */
	at: SeatId | null;
	/** Hands the count has taken. */
	counted: SeatId[];
	/** Hands raised on phones. */
	raised: SeatId[];
}

export type HostMsg =
	/** On joining: the room, the seats to choose from, and the seat already held, if any. */
	| { t: 'welcome'; room: string; seats: { id: SeatId; name: string; taken: boolean }[]; you: SeatId | null }
	| { t: 'public'; view: PublicView; clock: ClockView | null }
	/** Your own character (null until the characters are dealt). */
	| { t: 'card'; card: CharacterCard | null }
	/** Wake up: these are your pages. */
	| { t: 'wake'; wake: Wake }
	/** The Storyteller has withdrawn the wake (skipped, or done in person). */
	| { t: 'sleep' }
	| { t: 'announce'; items: Announcement[] }
	| { t: 'denied'; reason: string }
	/** A nomination or vote under way, or none. */
	| { t: 'vote'; vote: VoteView | null }
	/** A word for the player (their nomination was sent, or why it could not be). */
	| { t: 'note'; text: string }
	/** Mode 2 inside the game: the village (see src/town/village.ts). */
	| { t: 'village'; m: VillageDown }
	/** Who is in the room so far, in seating order; `you` is this phone's place in it. */
	| { t: 'lobby'; names: string[]; you: number | null };

export type PlayerMsg =
	/** First words, with an id kept on the phone so a reconnect finds its seat again. */
	| { t: 'hello'; clientId: string; name?: string }
	| { t: 'claim'; seat: SeatId }
	| { t: 'leave-seat' }
	/** The players chosen on a wake's pick page. */
	| { t: 'answer'; wakeId: string; picks: SeatId[] }
	/** Finished reading a wake. */
	| { t: 'done'; wakeId: string }
	/** I nominate this player (the Storyteller accepts it). */
	| { t: 'nominate'; nominee: SeatId }
	/** My hand is up (or down) for the vote. */
	| { t: 'hand'; up: boolean }
	| { t: 'village'; m: VillageUp };
