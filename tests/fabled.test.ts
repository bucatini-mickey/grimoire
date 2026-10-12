/**
 * fabled.test.ts - the Fabled that change the rules (docs/rules/INTERACTIONS.md, "Fabled").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, perform, performAll, nightSteps, allowedCompositions, getScript } from '../src/core/index.ts';
import type { Command, GameState } from '../src/core/index.ts';
import { NAMES, autoNight, ok, refused } from './helpers.ts';

const dawn = (s: GameState) => ok(s, { type: 'end-night' });
/** A Trouble Brewing game with these characters and Fabled. */
function withFabled(characters: string[], fabled: { id: string; character?: string }[], bluffs: string[] = []): GameState {
	return ok(emptyState(), [
		{ type: 'create', names: NAMES.slice(0, characters.length) },
		{ type: 'assign', characters, bluffs, fabled, allowNonstandard: true },
		{ type: 'begin' }
	]);
}
// 0 imp, 1 poisoner, 2 washerwoman, 3 empath, 4 monk, 5 soldier, 6 chef
const TB = ['imp', 'poisoner', 'washerwoman', 'empath', 'monk', 'soldier', 'chef'];
const BLUFFS = ['mayor', 'virgin', 'slayer'];

test('FAB-SENTINEL: one more or one fewer Outsider is a legal setup', () => {
	const tb = getScript('trouble-brewing');
	assert.deepEqual(allowedCompositions(tb, 7, ['imp', 'poisoner'], ['sentinel']).map((c) => c.outsider).sort(), [0, 1], 'none to remove at 7: the normal count or one more');
	const start = ok(emptyState(), { type: 'create', names: NAMES.slice(0, 7) });
	const two = ['imp', 'poisoner', 'washerwoman', 'empath', 'monk', 'soldier', 'butler'];
	assert.ok(!perform(start, { type: 'assign', characters: two, bluffs: BLUFFS }).ok, 'an Outsider at 7: not normally');
	assert.ok(perform(start, { type: 'assign', characters: two, bluffs: BLUFFS, fabled: [{ id: 'sentinel' }] }).ok, 'with the Sentinel');
});

test('FAB-TOYMAKER: the evil team learns each other even at five; the Demon may attack no one', () => {
	const five = ['imp', 'poisoner', 'washerwoman', 'empath', 'monk'];
	const s = withFabled(five, [{ id: 'toymaker' }], BLUFFS);
	assert.ok(nightSteps(s).some((x) => x.id === 'demon-info:0'), 'the Demon learns Minions and bluffs');
	refused(ok(emptyState(), { type: 'create', names: NAMES.slice(0, 5) }), { type: 'assign', characters: five, bluffs: [], fabled: [{ id: 'toymaker' }] }, /3 Demon bluffs/);
	let n2 = ok(dawn(autoNight(s)), [{ type: 'open-nominations' }, { type: 'end-day' }]);
	n2 = autoNight(n2, {}, 'imp');
	const quiet = ok(n2, { type: 'choose', none: true });
	assert.equal(quiet.seats.filter((x) => x.alive).length, 5, 'nobody dies');
});

test('FAB-DOOMSAYER: with four or more alive, a living player calls it once; one of their team dies', () => {
	let s = ok(dawn(autoNight(withFabled(TB, [{ id: 'doomsayer' }], BLUFFS))), { type: 'open-nominations' });
	refused(s, { type: 'doomsayer', by: 2, victim: 0 }, /caller.s team/);
	s = ok(s, { type: 'doomsayer', by: 2, victim: 3 });
	assert.equal(s.seats[3].alive, false);
	refused(s, { type: 'doomsayer', by: 2, victim: 4 }, /once/);
	refused(ok(dawn(autoNight(withFabled(TB, [], BLUFFS))), { type: 'open-nominations' }), { type: 'doomsayer', by: 2, victim: 3 }, /not in play/);
});

test('FAB-FERRYMAN: on the final day the dead get their votes back', () => {
	let s = ok(dawn(autoNight(withFabled(TB, [{ id: 'ferryman' }], BLUFFS))), { type: 'open-nominations' });
	s = ok(s, [{ type: 'nominate', nominator: 2, nominee: 3 }, { type: 'vote', voters: [0, 1, 2, 4, 5, 6] }, { type: 'end-day' }]);
	assert.equal(s.seats[3].alive, false);
	s = ok(dawn(autoNight(s, { imp: { type: 'choose', target: 4 } })), { type: 'open-nominations' });
	s = ok(s, [{ type: 'nominate', nominator: 2, nominee: 5 }, { type: 'vote', voters: [3] }]);
	assert.equal(s.seats[3].ghostVote, false);
	s = ok(s, { type: 'ferryman' });
	assert.equal(s.seats[3].ghostVote, true);
	refused(s, { type: 'ferryman' }, /once/);
});

test('FAB-STORM-CATCHER: the named good character dies only by execution', () => {
	let s = ok(dawn(autoNight(withFabled(TB, [{ id: 'storm-catcher', character: 'empath' }], BLUFFS))), [{ type: 'open-nominations' }, { type: 'end-day' }]);
	s = autoNight(s, { imp: { type: 'choose', target: 3 } });
	assert.equal(s.seats[3].alive, true, 'the Imp cannot kill the Empath');
	refused(ok(emptyState(), { type: 'create', names: NAMES.slice(0, 7) }), { type: 'assign', characters: TB, bluffs: BLUFFS, fabled: [{ id: 'storm-catcher', character: 'imp' }] }, /good character/);
	const r = performAll(s, [{ type: 'end-night' }, { type: 'open-nominations' }, { type: 'nominate', nominator: 2, nominee: 3 }, { type: 'vote', voters: [0, 1, 2, 4, 5, 6] }, { type: 'end-day' }] as Command[]);
	assert.ok(r.ok && !r.state.seats[3].alive, 'but can be executed');
});
