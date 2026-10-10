/**
 * state.ts - folding events into state.
 *
 * `reduce` records facts; it never decides anything. Every rule (who dies,
 * whether a vote passes, who wins) is decided in engine.ts, and its outcome
 * is written down as events. So replaying a log always rebuilds exactly the
 * same game, and undo is just "drop the last events and replay".
 */
import type { GameEvent, GameState } from './types.ts';
import { getScript, charDef, teamAlignment } from './script.ts';

export function emptyState(): GameState {
	return {
		scriptId: '',
		seats: [],
		order: [],
		phase: { kind: 'setup' },
		redHerring: null,
		bluffs: [],
		poison: null,
		butlerMaster: null,
		spent: [],
		night: null,
		day: null,
		lastExecution: null,
		newDemon: null
	};
}

export function reduce(prev: GameState, e: GameEvent): GameState {
	const s = structuredClone(prev);
	switch (e.type) {
		case 'game-created':
			s.scriptId = e.scriptId;
			s.seats = e.names.map((name, id) => ({
				id, name, character: '', believes: '', alignment: 'good', alive: true, ghostVote: true
			}));
			s.order = s.seats.map((x) => x.id);
			break;

		case 'characters-assigned': {
			const script = getScript(s.scriptId);
			e.seats.forEach((a, i) => {
				const seat = s.seats[i];
				seat.character = a.character;
				seat.believes = a.believes;
				seat.alignment = teamAlignment(charDef(script, a.character).team);
			});
			s.redHerring = e.redHerring;
			s.bluffs = [...e.bluffs];
			break;
		}

		case 'night-began':
			s.phase = { kind: 'night', n: e.n };
			s.night = { n: e.n, done: [], deaths: [], protectedSeat: null, demonMadeTonight: null };
			s.day = null;
			// Dusk: the Poisoner's last choice wears off.
			s.poison = null;
			break;

		case 'chose': {
			const t = e.targets[0];
			if (e.role === 'poisoner' && e.effective) s.poison = { by: e.by, target: t };
			if (e.role === 'monk' && e.effective && s.night) s.night.protectedSeat = t;
			// A Drunk "Butler" does not exist (the Drunk thinks they are a Townsfolk),
			// so any Butler choosing is a real Butler; poisoned or not, they pick a master.
			if (e.role === 'butler') s.butlerMaster = t;
			break;
		}

		case 'step-done':
		case 'step-skipped':
			s.night?.done.push(e.step);
			if (e.step.startsWith('new-demon:')) s.newDemon = null;
			break;

		case 'died': {
			const seat = s.seats[e.seat];
			seat.alive = false;
			if (s.night) s.night.deaths.push(e.seat);
			if (e.cause === 'execution' && s.day) s.lastExecution = { day: s.day.n, seat: e.seat };
			// A dead Poisoner has no ability, so the poison ends.
			if (s.poison?.by === e.seat) s.poison = null;
			break;
		}

		case 'became-demon': {
			const seat = s.seats[e.seat];
			seat.character = e.character;
			seat.believes = e.character;
			seat.alignment = 'evil';
			s.newDemon = { seat: e.seat, during: s.phase.kind === 'night' ? 'night' : 'day' };
			if (s.night && s.phase.kind === 'night') s.night.demonMadeTonight = e.seat;
			// A Poisoner who becomes the Demon is no longer the Poisoner.
			if (s.poison?.by === e.seat) s.poison = null;
			break;
		}

		case 'day-began':
			s.phase = { kind: 'day', n: e.n };
			s.night = null;
			s.day = { n: e.n, stage: 'discussion', nominations: [], block: null, highest: 0, executed: null };
			break;

		case 'nominated':
			s.day?.nominations.push({ nominator: e.nominator, nominee: e.nominee, votes: null, voters: [] });
			break;

		case 'ability-spent':
			s.spent.push(`${e.seat}:${e.ability}`);
			break;

		case 'vote-tallied': {
			const day = s.day!;
			const nom = day.nominations[day.nominations.length - 1];
			nom.votes = e.votes;
			nom.voters = [...e.voters];
			for (const g of e.ghostsSpent) s.seats[g].ghostVote = false;
			if (e.outcome === 'on-the-block') {
				day.block = e.nominee;
				day.highest = e.votes;
			} else if (e.outcome === 'tied') {
				day.block = null;
			}
			break;
		}

		case 'executed':
			if (s.day) s.day.executed = e.seat;
			break;

		case 'seats-swapped': {
			const i = s.order.indexOf(e.a);
			const j = s.order.indexOf(e.b);
			s.order[i] = e.b;
			s.order[j] = e.a;
			break;
		}

		case 'nominations-opened':
			if (s.day) s.day.stage = 'nominations';
			break;

		case 'adjusted': {
			const seat = s.seats[e.seat];
			if (e.alive !== undefined) seat.alive = e.alive;
			if (e.ghostVote !== undefined) seat.ghostVote = e.ghostVote;
			if (e.character !== undefined) {
				seat.character = e.character;
				seat.alignment = teamAlignment(charDef(getScript(s.scriptId), e.character).team);
			}
			if (e.believes !== undefined) seat.believes = e.believes;
			if (e.alive === false && s.poison?.by === e.seat) s.poison = null;
			break;
		}

		case 'poison-set':
			s.poison = e.target === null ? null : { by: null, target: e.target };
			break;

		case 'red-herring-set':
			s.redHerring = e.seat;
			break;

		case 'game-over':
			s.phase = { kind: 'over', winner: e.winner, reason: e.reason };
			break;

		// Pure record-keeping: these change nothing the rules read.
		case 'role-shown':
		case 'evil-info-shown':
		case 'info-given':
		case 'grimoire-shown':
		case 'demon-told':
		case 'kill-prevented':
		case 'kill-redirected':
		case 'slayer-shot':
		case 'note':
			break;
	}
	return s;
}

export function replay(events: GameEvent[]): GameState {
	return events.reduce(reduce, emptyState());
}
