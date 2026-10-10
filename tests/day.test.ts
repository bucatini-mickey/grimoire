import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perform, performAll, emptyState, replay, interactions } from '../src/core/index.ts';
import type { GameState } from '../src/core/index.ts';
import { game, ok, refused, playNight, NAMES } from './helpers.ts';

// 0 Ada imp, 1 Bram poisoner, 2 Cael virgin, 3 Dorn slayer, 4 Esme saint, 5 Fenn mayor, 6 Gwen butler, 7 Hal chef
const chars = ['imp', 'poisoner', 'virgin', 'slayer', 'saint', 'mayor', 'butler', 'chef'];
const day1 = () => playNight(game(chars), { 'butler': { type: 'choose', target: 7 }, poisoner: { type: 'choose', target: 1 } });

test('each player nominates once and is nominated once a day', () => {
	let s = day1();
	s = ok(s, { type: 'nominate', nominator: 7, nominee: 1 });
	refused(s, { type: 'nominate', nominator: 5, nominee: 0 }, /Count the votes/);
	s = ok(s, { type: 'vote', voters: [] });
	refused(s, { type: 'nominate', nominator: 7, nominee: 0 }, /already nominated/);
	refused(s, { type: 'nominate', nominator: 5, nominee: 1 }, /already been nominated/);
	ok(s, { type: 'nominate', nominator: 5, nominee: 0 });
});

test('votes need half the living, must beat the leader, and ties clear the block', () => {
	let s = day1();
	// 8 alive: need 4
	s = ok(s, [{ type: 'nominate', nominator: 7, nominee: 1 }, { type: 'vote', voters: [0, 1, 7] }]);
	assert.equal(s.day!.block, null);
	s = ok(s, [{ type: 'nominate', nominator: 5, nominee: 0 }, { type: 'vote', voters: [1, 2, 3, 5] }]);
	assert.equal(s.day!.block, 0);
	s = ok(s, [{ type: 'nominate', nominator: 3, nominee: 7 }, { type: 'vote', voters: [1, 2, 3, 5] }]);
	assert.equal(s.day!.block, null, 'tie');
	s = ok(s, [{ type: 'nominate', nominator: 2, nominee: 5 }, { type: 'vote', voters: [1, 2, 3, 4] }]);
	assert.equal(s.day!.block, null, 'four only ties the high mark of four');
	s = ok(s, { type: 'end-day' });
	assert.equal(s.seats.every((x) => x.alive), true);
});

test('the dead vote once, then never again', () => {
	let s = day1();
	s = ok(s, [{ type: 'nominate', nominator: 7, nominee: 4 }, { type: 'vote', voters: [0, 1, 2, 3] }, { type: 'end-day' }]);
	assert.equal(s.phase.kind, 'over', 'the Saint was executed');
	let t = day1();
	t = ok(t, [{ type: 'nominate', nominator: 7, nominee: 3 }, { type: 'vote', voters: [0, 1, 2, 4] }, { type: 'end-day' }]);
	assert.equal(t.seats[3].alive, false);
	t = playNight(t, { imp: { type: 'choose', target: 2 } });
	t = ok(t, [{ type: 'nominate', nominator: 7, nominee: 1 }, { type: 'vote', voters: [3] }]);
	assert.equal(t.seats[3].ghostVote, false);
	t = ok(t, { type: 'nominate', nominator: 5, nominee: 0 });
	refused(t, { type: 'vote', voters: [3] }, /used their vote/);
	refused(t, { type: 'vote', voters: [1, 1] }, /twice/);
});

test('the Butler votes only with their master', () => {
	let s = ok(day1(), { type: 'nominate', nominator: 7, nominee: 1 });
	refused(s, { type: 'vote', voters: [6, 0] }, /Butler/);
	ok(s, { type: 'vote', voters: [6, 7] });
});

test('the Virgin executes a Townsfolk nominator, once', () => {
	let s = ok(day1(), { type: 'nominate', nominator: 7, nominee: 2 });
	assert.equal(s.seats[7].alive, false);
	assert.equal(s.day!.executed, 7);
	refused(s, { type: 'nominate', nominator: 5, nominee: 0 }, /no more nominations/);
	s = ok(s, { type: 'end-day' });
	assert.equal(s.phase.kind, 'night');
});

test('the Virgin does nothing to an evil or Outsider nominator, but is spent', () => {
	let s = ok(day1(), { type: 'nominate', nominator: 6, nominee: 2 });
	assert.equal(s.seats[6].alive, true);
	assert.ok(s.spent.includes('2:virgin'));
	s = ok(s, [{ type: 'vote', voters: [] }, { type: 'end-day' }]);
	s = playNight(s, { imp: { type: 'choose', target: 4 } });
	s = ok(s, { type: 'nominate', nominator: 7, nominee: 2 });
	assert.equal(s.seats[7].alive, true, 'already spent');
});

test('a Spy nominating the Virgin needs the Storyteller to decide', () => {
	// 0 imp, 1 spy, 2 virgin, ...
	const s = playNight(game(['imp', 'spy', 'virgin', 'chef', 'empath', 'monk', 'soldier']));
	const r = perform(s, { type: 'nominate', nominator: 1, nominee: 2 });
	assert.equal(!r.ok && r.decision, 'nominatorIsTownsfolk');
	const yes = ok(s, { type: 'nominate', nominator: 1, nominee: 2, nominatorIsTownsfolk: true });
	assert.equal(yes.seats[1].alive, false);
	const no = ok(s, { type: 'nominate', nominator: 1, nominee: 2, nominatorIsTownsfolk: false });
	assert.equal(no.seats[1].alive, true);
});

test('the Slayer hits only the Demon, once; anyone may claim to shoot', () => {
	let s = day1();
	s = ok(s, { type: 'slay', by: 3, target: 1 });
	assert.equal(s.seats[1].alive, true);
	refused(s, { type: 'slay', by: 3, target: 0 }, /already taken/);
	s = ok(s, { type: 'slay', by: 7, target: 0 });
	assert.equal(s.seats[0].alive, true, 'the Chef has no shot');
	const t = ok(day1(), { type: 'slay', by: 3, target: 0 });
	assert.deepEqual(t.phase, { kind: 'over', winner: 'good', reason: 'The Demon is dead.' });
});

test('a Slayer shooting the Recluse needs a decision', () => {
	const s = playNight(game(['imp', 'baron', 'recluse', 'slayer', 'saint', 'monk', 'soldier']));
	const r = perform(s, { type: 'slay', by: 3, target: 2 });
	assert.equal(!r.ok && r.decision, 'targetIsDemon');
	const hit = ok(s, { type: 'slay', by: 3, target: 2, targetIsDemon: true });
	assert.equal(hit.seats[2].alive, false);
	assert.equal(hit.phase.kind, 'day', 'the real Demon lives');
});

test('the Scarlet Woman needs five alive when the Demon dies', () => {
	// 5 players: imp, scarlet-woman, slayer, chef, monk
	let s = playNight(game(['imp', 'scarlet-woman', 'slayer', 'chef', 'monk']));
	s = ok(s, { type: 'slay', by: 2, target: 0 });
	assert.equal(s.seats[1].character, 'imp', 'five alive before the death');
	let t = playNight(game(['imp', 'scarlet-woman', 'slayer', 'chef', 'monk']));
	t = ok(t, [{ type: 'nominate', nominator: 3, nominee: 4 }, { type: 'vote', voters: [0, 1, 2] }, { type: 'end-day' }]);
	t = playNight(t, { imp: { type: 'choose', target: 3 } });
	assert.equal(t.seats.filter((x) => x.alive).length, 3);
	t = ok(t, { type: 'slay', by: 2, target: 0 });
	assert.deepEqual(t.phase, { kind: 'over', winner: 'good', reason: 'The Demon is dead.' });
});

test('Mayor: three alive and no execution means good wins', () => {
	let s: GameState = playNight(game(['imp', 'poisoner', 'mayor', 'chef', 'monk']));
	s = ok(s, [{ type: 'nominate', nominator: 3, nominee: 4 }, { type: 'vote', voters: [2, 3, 0] }, { type: 'end-day' }]);
	assert.equal(s.seats[4].alive, false);
	s = playNight(s, { poisoner: { type: 'choose', target: 3 }, imp: { type: 'choose', target: 3 } });
	assert.equal(s.seats.filter((x) => x.alive).length, 3);
	const won = ok(s, { type: 'end-day' });
	assert.equal(won.phase.kind === 'over' && won.phase.winner, 'good');
});

test('evil wins when only two are left', () => {
	let s: GameState = playNight(game(['imp', 'poisoner', 'chef', 'empath', 'monk']));
	s = ok(s, [{ type: 'nominate', nominator: 3, nominee: 4 }, { type: 'vote', voters: [2, 3, 0] }, { type: 'end-day' }]);
	s = playNight(s, { imp: { type: 'choose', target: 3 } });
	s = ok(s, [{ type: 'nominate', nominator: 2, nominee: 2 }, { type: 'vote', voters: [0, 1] }, { type: 'end-day' }]);
	assert.deepEqual(s.phase, { kind: 'over', winner: 'evil', reason: 'Only two players are left alive.' });
});

test('replaying the log rebuilds the game exactly, and the graph reads it', () => {
	const r = performAll(emptyState(), [
		{ type: 'create', names: NAMES.slice(0, 8) },
		{ type: 'assign', characters: chars, bluffs: ['washerwoman', 'librarian', 'investigator'], allowNonstandard: true },
		{ type: 'begin' },
		{ type: 'acknowledge' }, // the Demon learns its Minion and bluffs (the Poisoner learns its Demon in its own wake)
		{ type: 'choose', target: 5 }, // Poisoner -> Mayor
		{ type: 'tell', info: { kind: 'number', value: 1 } }, // Chef: the Imp and Poisoner sit together
		{ type: 'choose', target: 7 }, // Butler's master: the Chef
		{ type: 'acknowledge' }, { type: 'acknowledge' }, { type: 'acknowledge' }, { type: 'acknowledge' }, // last: Virgin, Slayer, Saint, Mayor see their characters
		{ type: 'end-night' },
		{ type: 'open-nominations' },
		{ type: 'nominate', nominator: 7, nominee: 1 },
		{ type: 'vote', voters: [0, 1, 2, 3] },
		{ type: 'end-day' }
	]);
	assert.ok(r.ok, !r.ok ? r.error : '');
	if (!r.ok) return;
	assert.deepEqual(replay(r.events), r.state);
	assert.equal(r.state.seats[1].alive, false);
	const edges = interactions(r.events).map((e) => `${e.when} ${e.from}>${e.to} ${e.kind}`);
	assert.deepEqual(edges, [
		'N1 1>5 poisoned', 'N1 6>7 chose-master', 'D1 7>1 nominated',
		'D1 0>1 voted', 'D1 1>1 voted', 'D1 2>1 voted', 'D1 3>1 voted'
	]);
});
