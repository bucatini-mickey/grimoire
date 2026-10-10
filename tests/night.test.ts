import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightSteps, perform, reduce, empathNumbers } from '../src/core/index.ts';
import type { GameState } from '../src/core/index.ts';
import { game, ok, refused, next, playNight } from './helpers.ts';

/** Play night 1 quietly and go straight through a day with no execution. */
const toNight2 = (s: GameState, n1: Parameters<typeof playNight>[1] = {}) => ok(playNight(s, n1), { type: 'end-day' });

// 0 Ada imp, 1 Bram poisoner, 2 Cael monk, 3 Dorn soldier, 4 Esme mayor, 5 Fenn ravenkeeper, 6 Gwen empath
const base = () => game(['imp', 'poisoner', 'monk', 'soldier', 'mayor', 'ravenkeeper', 'empath']);

test('night 2 wake order: Poisoner, Monk, Imp, then the rest', () => {
	const s = toNight2(base());
	assert.equal(s.phase.kind, 'night');
	assert.deepEqual(nightSteps(s).map((x) => x.id), ['poisoner:1', 'monk:2', 'imp:0', 'empath:6']);
});

test('the Imp kills, and the Empath killed tonight does not wake', () => {
	let s = toNight2(base());
	s = ok(s, [{ type: 'choose', target: 3 }, { type: 'choose', target: 4 }, { type: 'choose', target: 6 }]);
	assert.equal(s.seats[6].alive, false);
	assert.equal(next(s), null);
	s = ok(s, { type: 'end-night' });
	assert.equal(s.phase.kind, 'day');
});

test('the Monk protects', () => {
	let s = toNight2(base());
	s = ok(s, [{ type: 'choose', target: 3 }, { type: 'choose', target: 6 }, { type: 'choose', target: 6 }]);
	assert.equal(s.seats[6].alive, true);
});

test('the Monk cannot choose themselves', () => {
	const s = ok(toNight2(base()), { type: 'choose', target: 3 });
	refused(s, { type: 'choose', target: 2 }, /another player/);
});

test('a poisoned Monk protects no one', () => {
	let s = toNight2(base());
	s = ok(s, [{ type: 'choose', target: 2 }, { type: 'choose', target: 6 }, { type: 'choose', target: 6 }]);
	assert.equal(s.seats[6].alive, false);
});

test('the Soldier survives the Demon unless poisoned', () => {
	let s = toNight2(base());
	s = ok(s, [{ type: 'choose', target: 4 }, { type: 'choose', target: 6 }, { type: 'choose', target: 3 }]);
	assert.equal(s.seats[3].alive, true);
	let p = toNight2(base());
	p = ok(p, [{ type: 'choose', target: 3 }, { type: 'choose', target: 6 }, { type: 'choose', target: 3 }]);
	assert.equal(p.seats[3].alive, false);
});

test('an attack on the Mayor needs a decision, and may bounce', () => {
	const s = ok(toNight2(base()), [{ type: 'choose', target: 3 }, { type: 'choose', target: 6 }]);
	const r = perform(s, { type: 'choose', target: 4 });
	assert.equal(!r.ok && r.decision, 'mayorRedirect');
	const stays = ok(s, { type: 'choose', target: 4, mayorRedirect: null });
	assert.equal(stays.seats[4].alive, false);
	const bounced = ok(s, { type: 'choose', target: 4, mayorRedirect: 5 });
	assert.equal(bounced.seats[4].alive, true);
	assert.equal(bounced.seats[5].alive, false);
	// A bounce onto the Monk's charge is still stopped by the Monk.
	const shielded = ok(s, { type: 'choose', target: 4, mayorRedirect: 6 });
	assert.equal(shielded.seats[6].alive, true);
	refused(s, { type: 'choose', target: 5, mayorRedirect: 6 }, /Only an attack on a working Mayor/);
});

test('the Ravenkeeper killed at night wakes and learns a character', () => {
	let s = toNight2(base());
	s = ok(s, [{ type: 'choose', target: 3 }, { type: 'choose', target: 6 }, { type: 'choose', target: 5 }]);
	assert.equal(next(s), 'ravenkeeper:5');
	refused(s, { type: 'tell', info: { kind: 'reveal', player: 0, character: 'chef' } }, /cannot register/);
	s = ok(s, { type: 'tell', info: { kind: 'reveal', player: 0, character: 'imp' } });
	assert.equal(next(s), 'empath:6');
});

test('starpass to the only Minion', () => {
	let s = toNight2(base());
	s = ok(s, [{ type: 'choose', target: 3 }, { type: 'choose', target: 6 }, { type: 'choose', target: 0 }]);
	assert.equal(s.seats[0].alive, false);
	assert.equal(s.seats[1].character, 'imp');
	assert.equal(s.poison, null, 'the Poisoner became the Imp, so the poison ends');
	assert.equal(next(s), 'new-demon:1');
	s = ok(s, { type: 'acknowledge' });
	assert.ok(!nightSteps(s).some((x) => x.id === 'imp:1'), 'the new Imp does not also kill tonight');
	assert.equal(s.phase.kind, 'night');
});

test('starpass with several Minions needs a choice; the Scarlet Woman takes it', () => {
	// 0 imp, 1 poisoner, 2 baron, 3 monk, ... 10 players
	const chars = ['imp', 'poisoner', 'baron', 'monk', 'soldier', 'mayor', 'empath', 'saint', 'recluse', 'chef'];
	let s = toNight2(game(chars), {});
	s = ok(s, [{ type: 'choose', target: 9 }, { type: 'choose', target: 4 }]);
	const r = perform(s, { type: 'choose', target: 0 });
	assert.equal(!r.ok && r.decision, 'newDemon');
	refused(s, { type: 'choose', target: 0, newDemon: 3 }, /living Minion/);
	const t = ok(s, { type: 'choose', target: 0, newDemon: 2 });
	assert.equal(t.seats[2].character, 'imp');

	const sw = toNight2(game(['imp', 'poisoner', 'scarlet-woman', 'monk', 'soldier', 'mayor', 'empath', 'saint', 'recluse', 'chef']));
	const u = ok(sw, [{ type: 'choose', target: 9 }, { type: 'choose', target: 4 }]);
	refused(u, { type: 'choose', target: 0, newDemon: 1 }, /Scarlet Woman/);
	const v = ok(u, { type: 'choose', target: 0 });
	assert.equal(v.seats[2].character, 'imp');
});

test('starpass with no living Minion: good wins', () => {
	let s = toNight2(base());
	s = ok(s, { type: 'choose', target: 3 });
	s.seats[1].alive = false; // the Poisoner died earlier (set directly for brevity)
	s = ok(s, [{ type: 'choose', target: 6 }, { type: 'choose', target: 0 }]);
	assert.deepEqual(s.phase, { kind: 'over', winner: 'good', reason: 'The Demon is dead.' });
});

test('a poisoned Imp kills no one', () => {
	let s = toNight2(base());
	s = ok(s, [{ type: 'choose', target: 0 }, { type: 'choose', target: 3 }, { type: 'choose', target: 6 }]);
	assert.equal(s.seats[6].alive, true);
});

test('the Undertaker wakes only after an execution death', () => {
	// 0 imp, 1 poisoner, 2 undertaker, 3 chef, 4 empath, 5 monk, 6 soldier
	let s = playNight(game(['imp', 'poisoner', 'undertaker', 'chef', 'empath', 'monk', 'soldier']));
	s = ok(s, [{ type: 'nominate', nominator: 3, nominee: 1 }, { type: 'vote', voters: [2, 3, 4, 5] }, { type: 'end-day' }]);
	assert.equal(s.seats[1].alive, false);
	assert.ok(nightSteps(s).some((x) => x.id === 'undertaker:2'));
	assert.ok(!nightSteps(s).some((x) => x.kind === 'poisoner'));
	s = ok(s, [{ type: 'choose', target: 6 }, { type: 'choose', target: 3 }]);
	s = ok(s, { type: 'tell', info: { kind: 'number', value: empathNumbers(s, 4)[0] } });
	assert.equal(next(s), 'undertaker:2');
	refused(s, { type: 'tell', info: { kind: 'character', character: 'chef' } }, /cannot register/);
	s = ok(s, [{ type: 'tell', info: { kind: 'character', character: 'poisoner' } }, { type: 'end-night' }, { type: 'end-day' }]);
	assert.ok(!nightSteps(s).some((x) => x.kind === 'undertaker'), 'no execution yesterday');
});

test('poison lasts through the day and wears off at dusk', () => {
	let s = playNight(base(), { poisoner: { type: 'choose', target: 4 } });
	assert.equal(s.poison?.target, 4);
	s = ok(s, { type: 'end-day' });
	assert.equal(s.poison, null);
});

test('poison ends at once if the Poisoner dies', () => {
	const s = playNight(base(), { poisoner: { type: 'choose', target: 4 } });
	assert.equal(s.poison?.target, 4);
	assert.equal(reduce(s, { type: 'died', seat: 1, cause: 'execution' }).poison, null);
});

test('a Scarlet Woman made the Demon by day is told, then kills that night', () => {
	// 0 imp, 1 scarlet-woman, 2 slayer, 3..6 good
	let s = playNight(game(['imp', 'scarlet-woman', 'slayer', 'chef', 'empath', 'monk', 'soldier']));
	s = ok(s, [{ type: 'slay', by: 2, target: 0 }]);
	assert.equal(s.seats[0].alive, false);
	assert.equal(s.seats[1].character, 'imp');
	assert.equal(s.phase.kind, 'day');
	s = ok(s, { type: 'end-day' });
	assert.deepEqual(nightSteps(s).map((x) => x.id), ['monk:5', 'new-demon:1', 'imp:1', 'empath:4']);
});
