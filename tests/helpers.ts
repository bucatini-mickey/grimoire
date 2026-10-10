import assert from 'node:assert/strict';
import {
	emptyState, perform, performAll, nextStep, stepAction, getScript, teamAlignment, charDef, evilLearnEachOther
} from '../src/core/index.ts';
import type { Command, GameState, SeatId } from '../src/core/index.ts';
import { suggestInfo } from '../src/core/index.ts';

const TB = getScript('trouble-brewing');
export const NAMES = 'Ada Bram Cael Dorn Esme Fenn Gwen Hal Isolde Jory Kit Lior Maud Ned Orla'.split(' ');

/**
 * A game at the start of night 1 with exactly these characters in seat order.
 * Bluffs are filled in automatically; team counts are not checked unless `strict`.
 */
export function game(characters: string[], opts: { drunkBelieves?: string; redHerring?: SeatId; strict?: boolean } = {}): GameState {
	const inPlay = new Set(characters);
	const bluffs = evilLearnEachOther(characters.length)
		? TB.characters.filter((c) => teamAlignment(c.team) === 'good' && !inPlay.has(c.id) && c.id !== opts.drunkBelieves).slice(0, 3).map((c) => c.id)
		: [];
	const firstGood = characters.findIndex((c) => teamAlignment(charDef(TB, c).team) === 'good');
	const needsHerring = characters.includes('fortune-teller') || opts.drunkBelieves === 'fortune-teller';
	return ok(emptyState(), [
		{ type: 'create', names: NAMES.slice(0, characters.length) },
		{
			type: 'assign', characters, bluffs,
			drunkBelieves: opts.drunkBelieves,
			redHerring: opts.redHerring ?? (needsHerring ? firstGood : null),
			allowNonstandard: !opts.strict
		},
		{ type: 'begin' }
	]);
}

export function ok(state: GameState, cmds: Command | Command[]): GameState {
	const r = performAll(state, Array.isArray(cmds) ? cmds : [cmds]);
	if (!r.ok) assert.fail(`refused: ${r.error}`);
	return r.state;
}

export function refused(state: GameState, cmd: Command, pattern?: RegExp): string {
	const r = perform(state, cmd);
	if (r.ok) assert.fail(`expected "${cmd.type}" to be refused`);
	if (pattern) assert.match(r.error, pattern);
	return r.error;
}

/** The next step's kind and seat, as "kind:seat" (or just "kind"). */
export function next(state: GameState): string | null {
	return nextStep(state)?.id ?? null;
}

/**
 * Resolve wake steps until the night is over, using the given command for a
 * step kind if there is one, else a harmless default: acknowledge, a true
 * suggestion, or a choice of the first other living player.
 */
export function playNight(state: GameState, by: Record<string, Command> = {}): GameState {
	let s = state;
	for (let guard = 0; guard < 50; guard++) {
		const step = nextStep(s);
		// Straight through dawn to the nominations, which is where most tests want to be.
		if (!step) return ok(s, [{ type: 'end-night' }, { type: 'open-nominations' }]);
		const given = by[step.id] ?? by[step.kind];
		let cmd: Command;
		if (given) cmd = given;
		else if (stepAction(step.kind) === 'acknowledge') cmd = { type: 'acknowledge' };
		else if (stepAction(step.kind) === 'choose') {
			const other = s.seats.find((x) => x.alive && x.id !== step.seat && s.seats[x.id].character !== 'imp')!;
			cmd = { type: 'choose', target: other.id, mayorRedirect: null };
		} else {
			const chosen = step.kind === 'fortune-teller' ? [0, 1] : step.kind === 'ravenkeeper' ? [0] : [];
			const info = suggestInfo(s, step.kind, step.seat!, chosen);
			if (!info) assert.fail(`no truthful suggestion for ${step.id}`);
			cmd = { type: 'tell', info };
		}
		s = ok(s, cmd);
		if (s.phase.kind === 'over') return s;
	}
	assert.fail('night did not finish');
}
