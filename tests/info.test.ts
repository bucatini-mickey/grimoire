import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perform, chefNumbers, empathNumbers, fortuneAnswers, judgeInfo, librarianNoneIsTrue, livingNeighbours } from '../src/core/index.ts';
import { game, ok, refused, next } from './helpers.ts';

// Seats: 0 Ada imp, 1 Bram washerwoman, 2 Cael poisoner, 3 Dorn empath, 4 Esme monk, 5 Fenn soldier, 6 Gwen chef
const base = () => game(['imp', 'washerwoman', 'poisoner', 'empath', 'monk', 'soldier', 'chef']);
const toWasherwoman = (poisonTarget = 4) => ok(base(), [
	{ type: 'acknowledge' }, { type: 'choose', target: poisonTarget }
]);

test('true information is accepted, false is refused for a healthy player', () => {
	const s = toWasherwoman();
	assert.equal(next(s), 'washerwoman:1');
	refused(s, { type: 'tell', info: { kind: 'pair', players: [5, 6], character: 'monk' } }, /neither drunk nor poisoned/);
	refused(s, { type: 'tell', info: { kind: 'pair', players: [5, 6], character: 'imp' } }, /must be a townsfolk/);
	refused(s, { type: 'tell', info: { kind: 'pair', players: [1, 4], character: 'monk' } }, /themselves/);
	ok(s, { type: 'tell', info: { kind: 'pair', players: [4, 6], character: 'monk' } });
});

test('a poisoned player may be told anything well-formed, and it is logged as false', () => {
	const s = toWasherwoman(1);
	const r = ok(s, { type: 'tell', info: { kind: 'pair', players: [5, 6], character: 'monk' } });
	assert.equal(r.poison?.target, 1);
	refused(s, { type: 'tell', info: { kind: 'number', value: 2 } }, /two players/);
});

test('the Storyteller can override, and the override is recorded', () => {
	const s = toWasherwoman();
	const r = perform(s, { type: 'tell', info: { kind: 'pair', players: [5, 6], character: 'monk' }, override: true });
	const given = r.ok ? r.events.find((e) => e.type === 'info-given') : undefined;
	assert.ok(given && given.type === 'info-given');
	assert.deepEqual([given.truthful, given.override], [false, true]);
});

test('Empath counts the nearest living neighbours, skipping the dead', () => {
	const s = base();
	assert.deepEqual(livingNeighbours(s, 3), [2, 4]);
	assert.deepEqual(empathNumbers(s, 3), [1]); // poisoner on one side
	assert.deepEqual(empathNumbers(s, 1), [2]); // imp and poisoner
	s.seats[2].alive = false;
	assert.deepEqual(livingNeighbours(s, 3), [1, 4]);
	assert.deepEqual(empathNumbers(s, 3), [0]);
});

test('Chef counts evil pairs, wrapping around the circle', () => {
	const s = base();
	assert.deepEqual(chefNumbers(s), [0]);
	const t = game(['imp', 'poisoner', 'chef', 'empath', 'monk', 'soldier', 'washerwoman']);
	assert.deepEqual(chefNumbers(t), [1]);
	const w = game(['poisoner', 'chef', 'empath', 'monk', 'soldier', 'washerwoman', 'imp']);
	assert.deepEqual(chefNumbers(w), [1], 'seat 6 and seat 0 are neighbours');
});

test('the Spy may register as good and as a Townsfolk or Outsider', () => {
	// 0 imp, 1 spy, 2 chef, 3 empath, 4 washerwoman, 5 monk, 6 soldier
	const s = game(['imp', 'spy', 'chef', 'empath', 'monk', 'soldier', 'washerwoman']);
	assert.deepEqual(chefNumbers(s), [0, 1]);
	assert.deepEqual(empathNumbers(s, 2), [0, 1]);
	assert.ok(judgeInfo(s, 6, 'washerwoman', { kind: 'pair', players: [1, 3], character: 'mayor' }).truthful,
		'Spy can register as a not-in-play Townsfolk');
	assert.ok(judgeInfo(s, 6, 'librarian', { kind: 'pair', players: [1, 3], character: 'butler' }).truthful);
	assert.ok(librarianNoneIsTrue(s));
	assert.ok(judgeInfo(s, 6, 'investigator', { kind: 'pair', players: [1, 3], character: 'spy' }).truthful);
});

test('the Recluse may register as evil and as a Minion or Demon', () => {
	// 0 imp, 1 recluse, 2 chef, ... baron makes outsiders legal but counts are not checked here
	const s = game(['imp', 'recluse', 'empath', 'chef', 'monk', 'soldier', 'poisoner']);
	assert.deepEqual(empathNumbers(s, 2), [0, 1]);
	assert.ok(judgeInfo(s, 3, 'investigator', { kind: 'pair', players: [1, 4], character: 'baron' }).truthful);
	assert.ok(librarianNoneIsTrue(s), 'the Recluse can avoid registering as an Outsider');
	assert.deepEqual(fortuneAnswers(s, [1, 4]), [true, false]);
	assert.deepEqual(fortuneAnswers(s, [0, 4]), [true]);
	assert.deepEqual(fortuneAnswers(s, [2, 4]), [false]);
});

test('the Drunk is always an Outsider: "no Outsiders" is false with a Drunk in play', () => {
	const s = game(['imp', 'drunk', 'chef', 'empath', 'monk', 'soldier', 'poisoner'], { drunkBelieves: 'washerwoman' });
	assert.equal(librarianNoneIsTrue(s), false);
});

test('a poisoned Spy or Recluse registers as what they are', () => {
	const s = game(['imp', 'recluse', 'empath', 'chef', 'monk', 'soldier', 'poisoner']);
	s.poison = { by: 6, target: 1 };
	assert.deepEqual(empathNumbers(s, 2), [0]);
	assert.deepEqual(fortuneAnswers(s, [1, 4]), [false]);
});

test('the red herring always reads as the Demon', () => {
	const s = game(['imp', 'washerwoman', 'poisoner', 'fortune-teller', 'monk', 'soldier', 'chef'], { redHerring: 5 });
	assert.deepEqual(fortuneAnswers(s, [5, 6]), [true]);
	assert.deepEqual(fortuneAnswers(s, [4, 6]), [false]);
});

test('the Drunk wakes as who they think they are, and may be told anything', () => {
	const s = game(['imp', 'drunk', 'poisoner', 'chef', 'monk', 'soldier', 'empath'], { drunkBelieves: 'washerwoman' });
	const at = ok(s, [{ type: 'acknowledge' }, { type: 'choose', target: 4 }]);
	assert.equal(next(at), 'washerwoman:1');
	const after = ok(at, { type: 'tell', info: { kind: 'pair', players: [5, 6], character: 'chef' } });
	assert.equal(next(after), 'chef:3');
});
