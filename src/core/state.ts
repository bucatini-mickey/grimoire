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
		effects: [],
		spent: [],
		night: null,
		day: null,
		lastExecution: null,
		mastermind: null,
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
			if (e.fabled?.length) s.fabled = e.fabled.map((f) => ({ ...f }));
			break;
		}

		case 'night-began':
			s.phase = { kind: 'night', n: e.n };
			s.night = {
				n: e.n, done: [], deaths: [], demonMadeTonight: null, revived: [],
				dayDeaths: [...(s.day?.deaths ?? [])],
				dayVoters: [...new Set((s.day?.nominations ?? []).flatMap((x) => x.voters ?? []))],
				dayNominators: (s.day?.nominations ?? []).map((x) => x.nominator),
				demonKills: [],
				changed: [],
				gossip: (s.day?.gossip ?? []).filter((g) => g.true).map((g) => ({ by: g.by }))
			};
			s.day = null;
			// Dusk: whatever lasts "until dusk" wears off (the Poisoner's poison), and what lasts until this dusk.
			s.effects = s.effects.filter((x) => x.until !== 'dusk' && !(typeof x.until === 'object' && x.until.dusk <= e.n));
			break;

		case 'effect-added':
			s.effects.push({ ...e.effect });
			break;

		case 'effects-ended': {
			const m = e.match as Record<string, unknown>;
			s.effects = s.effects.filter((x) => !Object.entries(m).every(([k, v]) => (x as unknown as Record<string, unknown>)[k] === v));
			break;
		}

		case 'step-done':
		case 'step-skipped':
			s.night?.done.push(e.step);
			if (s.night && e.order !== undefined) s.night.reached = Math.max(s.night.reached ?? -Infinity, e.order);
			if (e.step.startsWith('new-demon:') && s.newDemon && e.step === `new-demon:${s.newDemon.seat}`) s.newDemon = null;
			break;

		case 'died': {
			const seat = s.seats[e.seat];
			seat.alive = false;
			seat.undead = false;
			if (s.night) s.night.deaths.push(e.seat);
			if (s.night && s.phase.kind === 'night' && e.cause === 'demon') (s.night.demonKills ??= []).push(e.seat);
			if (s.day && s.phase.kind === 'day') s.day.deaths.push(e.seat);
			if (e.cause === 'execution' && s.day) s.lastExecution = { day: s.day.n, seat: e.seat };
			// The dead have no ability: effects that live on their source end (the Poisoner's poison).
			s.effects = s.effects.filter((x) => !(x.endsWithSource && x.by === e.seat));
			break;
		}

		case 'votes-restored':
			for (const x of s.seats) if (!x.alive) x.ghostVote = true;
			break;

		case 'traveller-joined': {
			s.seats.push({ id: e.seat, name: e.name, character: e.character, believes: e.character, alignment: e.alignment, alive: true, ghostVote: true, traveller: true });
			s.order.splice(s.order.indexOf(e.after) + 1, 0, e.seat);
			// Joining at night: their ability acts tonight only if its place is still to come.
			if (s.night && s.phase.kind === 'night') (s.night.changed ??= []).push({ seat: e.seat, at: s.night.reached ?? -Infinity });
			break;
		}

		case 'judged': {
			// Pardoned: not executed today, and the votes for them do not count.
			if (e.verdict === 'pardon' && s.day) {
				const nom = [...s.day.nominations].reverse().find((n) => n.nominee === e.nominee);
				if (nom) nom.votes = 0;
				if (s.day.block === e.nominee) s.day.block = null;
				s.day.highest = Math.max(0, ...s.day.nominations.filter((n) => n.nominee !== e.nominee).map((n) => n.votes ?? 0));
			}
			break;
		}

		case 'character-changed': {
			const seat = s.seats[e.seat];
			seat.character = e.character;
			seat.believes = e.believes;
			if (s.night && s.phase.kind === 'night') (s.night.changed ??= []).push({ seat: e.seat, at: e.at ?? 0 });
			// What they did as their old character, and that ends with them, ends (a Poisoner turned into something else).
			s.effects = s.effects.filter((x) => !(x.endsWithSource && x.by === e.seat && x.role !== e.character));
			// A dead Minion's kept ability (the Vigormortis) was that Minion's: it ends.
			s.effects = s.effects.filter((x) => !(x.kind === 'keeps-ability' && x.target === e.seat));
			break;
		}

		case 'became-demon': {
			const seat = s.seats[e.seat];
			seat.character = e.character;
			seat.believes = e.character;
			seat.alignment = 'evil';
			s.newDemon = { seat: e.seat, during: s.phase.kind === 'night' ? 'night' : 'day' };
			if (s.night && s.phase.kind === 'night') {
				s.night.demonMadeTonight = e.seat;
				(s.night.made ??= []).push({ seat: e.seat, at: e.at ?? 0 });
			}
			if (s.night && s.phase.kind === 'night' && e.via === 'pit-hag') s.night.arbitrary = true;
			// A Poisoner who becomes the Demon is no longer the Poisoner.
			s.effects = s.effects.filter((x) => !(x.endsWithSource && x.by === e.seat && x.role !== e.character));
			break;
		}

		case 'day-began':
			s.phase = { kind: 'day', n: e.n };
			s.night = null;
			s.day = { n: e.n, stage: 'discussion', nominations: [], block: null, highest: 0, executed: null, deaths: [], gossip: [] };
			// Dawn: whatever lasts "tonight" wears off (the Monk's protection).
			s.effects = s.effects.filter((x) => x.until !== 'dawn');
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
			if (e.alive === false) s.effects = s.effects.filter((x) => !(x.endsWithSource && x.by === e.seat));
			break;
		}

		case 'poison-set':
			// The Storyteller's hand: poison someone until dusk, or (null) cure all poison.
			s.effects = s.effects.filter((x) => x.kind !== 'poisoned');
			if (e.target !== null) s.effects.push({ kind: 'poisoned', target: e.target, by: null, role: 'storyteller', until: 'dusk' });
			break;

		case 'red-herring-set':
			s.redHerring = e.seat;
			break;

		case 'alignment-changed':
			s.seats[e.seat].alignment = e.alignment;
			break;

		case 'revived': {
			const seat = s.seats[e.seat];
			seat.alive = true;
			seat.undead = false;
			seat.ghostVote = true;
			// Back to life with every ability, even a once-per-game one already used.
			s.spent = s.spent.filter((x) => !x.startsWith(`${e.seat}:`));
			s.night?.revived.push(e.seat);
			break;
		}

		case 'seems-dead': {
			const seat = s.seats[e.seat];
			seat.alive = false;
			seat.undead = true;
			if (s.night) s.night.deaths.push(e.seat);
			if (s.day && s.phase.kind === 'day') s.day.deaths.push(e.seat);
			break;
		}

		case 'gossiped':
			s.day?.gossip.push({ by: e.by, true: e.true });
			break;

		case 'mastermind-day':
			s.mastermind = { day: e.day };
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
		case 'survived-execution':
		case 'note':
			break;
	}
	return s;
}

export function replay(events: GameEvent[]): GameState {
	return upgradeLog(events).reduce(reduce, emptyState());
}

/**
 * Games saved before effects were events (2026-10) recorded only the choices;
 * this adds the effects those choices made, so an old game loads as it was.
 */
export function upgradeLog(events: GameEvent[]): GameEvent[] {
	if (events.some((e) => e.type === 'effect-added' || e.type === 'effects-ended')) return events;
	const out: GameEvent[] = [];
	for (const e of events) {
		out.push(e);
		if (e.type !== 'chose') continue;
		const t = e.targets[0];
		if (e.role === 'poisoner' && e.effective) out.push({ type: 'effect-added', effect: { kind: 'poisoned', target: t, by: e.by, role: 'poisoner', until: 'dusk', endsWithSource: true } });
		if (e.role === 'monk' && e.effective) out.push({ type: 'effect-added', effect: { kind: 'safe-from-demon', target: t, by: e.by, role: 'monk', until: 'dawn' } });
		if (e.role === 'butler') {
			out.push({ type: 'effects-ended', match: { kind: 'master', by: e.by } });
			out.push({ type: 'effect-added', effect: { kind: 'master', target: t, by: e.by, role: 'butler', until: 'game' } });
		}
	}
	return out;
}
