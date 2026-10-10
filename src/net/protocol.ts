/**
 * protocol.ts - the messages between the Storyteller's phone (the host) and
 * the players' phones. The host runs the game; a player's phone only shows
 * what it is sent (see views.ts) and sends back what the player chose.
 */
import type { SeatId } from '../core/index.ts';
import type { CharacterCard, PublicView, Wake } from './views.ts';

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
	| { t: 'denied'; reason: string };

export type PlayerMsg =
	/** First words, with an id kept on the phone so a reconnect finds its seat again. */
	| { t: 'hello'; clientId: string }
	| { t: 'claim'; seat: SeatId }
	| { t: 'leave-seat' }
	/** The players chosen on a wake's pick page. */
	| { t: 'answer'; wakeId: string; picks: SeatId[] }
	/** Finished reading a wake. */
	| { t: 'done'; wakeId: string };
