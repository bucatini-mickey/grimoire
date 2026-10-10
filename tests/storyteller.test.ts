import { test } from 'node:test';
import assert from 'node:assert/strict';
import { infoCandidates, voteOrder, canVote, nightSteps, livingNeighbours, chefNumbers, empathNumbers } from '../src/core/index.ts';
import { game, ok, refused, next, playNight } from './helpers.ts';

// 0 Ada imp, 1 Bram washerwoman, 2 Cael poisoner, 3 Dorn empath, 4 Esme monk, 5 Fenn soldier, 6 Gwen investigator
const base = () => game(['imp', 'washerwoman', 'poisoner', 'empath', 'monk', 'soldier', 'investigator']);
const atWasherwoman = (poison: number) => ok(base(), [{ type: 'acknowledge' }, { type: 'choose', target: poison }]);

test('a fresh day starts in discussion', () => {
	let s = base();
	for (let i = 0; i < 20 && s.phase.kind === 'night'; i++) {
		const step = nightSteps(s).find((x) => !x.done);
		if (!step) { s = ok(s, { type: 'end-night' }); break; }
		s = ok(s, step.kind.includes('info') ? { type: 'acknowledge' } : step.kind === 'poisoner' ? { type: 'choose', target: 4 } : { type: 'skip', reason: 'test' });
	}
	assert.equal(s.day!.stage, 'discussion');
	refused(s, { type: 'nominate', nominator: 1, nominee: 2 }, /Open nominations/);
	s = ok(s, { type: 'open-nominations' });
	refused(s, { type: 'open-nominations' }, /already open/);
	ok(s, { type: 'nominate', nominator: 1, nominee: 2 });
});

test('votes go clockwise from the player after the nominee, the nominee last', () => {
	const s = base();
	assert.deepEqual(voteOrder(s, 2), [3, 4, 5, 6, 0, 1, 2]);
	assert.deepEqual(voteOrder(s, 6), [0, 1, 2, 3, 4, 5, 6]);
	s.seats[4].alive = false;
	s.seats[4].ghostVote = false;
	assert.equal(canVote(s, 4), false);
});

test('the Storyteller can move tokens by hand, and it is logged', () => {
	let s = playNight(base());
	s = ok(s, { type: 'adjust', seat: 3, character: 'chef' });
	assert.equal(s.seats[3].character, 'chef');
	assert.equal(s.seats[3].believes, 'chef');
	refused(s, { type: 'adjust', seat: 3, character: 'drunk' }, /Drunk thinks/);
	s = ok(s, { type: 'adjust', seat: 3, character: 'drunk', believes: 'chef' });
	assert.equal(s.seats[3].believes, 'chef');
	s = ok(s, [{ type: 'set-poison', target: 5 }, { type: 'set-red-herring', seat: 4 }]);
	assert.deepEqual(s.poison, { by: null, target: 5 });
	assert.equal(s.redHerring, 4);
	s = ok(s, { type: 'adjust', seat: 4, alive: false });
	assert.equal(s.seats[4].alive, false);
	const over = ok(s, { type: 'adjust', seat: 0, alive: false });
	assert.equal(over.phase.kind, 'over', 'killing the Demon by hand still ends the game');
});

test('candidates for a healthy player are all true, with every lean on offer', () => {
	const s = atWasherwoman(4);
	assert.equal(next(s), 'washerwoman:1');
	const cs = infoCandidates(s, 'washerwoman', 1);
	assert.ok(cs.length >= 3);
	assert.ok(cs.every((c) => c.truthful));
	assert.deepEqual(new Set(cs.map((c) => c.lean)), new Set(['neutral', 'good', 'evil']));
	const evil = cs.find((c) => c.lean === 'evil')!;
	assert.ok(evil.info.kind === 'pair' && evil.info.players.includes(0) || evil.info.kind === 'pair' && evil.info.players.includes(2));
});

test('a poisoned player is offered true and false answers', () => {
	const s = atWasherwoman(1);
	const cs = infoCandidates(s, 'washerwoman', 1);
	assert.ok(cs.some((c) => c.truthful));
	assert.ok(cs.some((c) => !c.truthful));
	// Every false one is still accepted by the engine for this poisoned player.
	for (const c of cs) ok(s, { type: 'tell', info: c.info });
});

test('Investigator leans: helping good pairs the Minion with another evil player', () => {
	const s = ok(atWasherwoman(4), { type: 'tell', info: { kind: 'pair', players: [4, 5], character: 'monk' } });
	// Order: ... empath (24) before investigator? Investigator is 22: it comes first.
	const step = nightSteps(s).find((x) => !x.done)!;
	const cs = infoCandidates(s, 'investigator', 6);
	const good = cs.find((c) => c.lean === 'good')!;
	assert.ok(good.info.kind === 'pair' && good.info.players.includes(0) && good.info.players.includes(2));
	assert.ok(step);
});

test('Empath and Fortune Teller candidates', () => {
	const s = game(['imp', 'washerwoman', 'poisoner', 'empath', 'monk', 'soldier', 'fortune-teller'], { redHerring: 5 });
	assert.deepEqual(infoCandidates(s, 'empath', 3).map((c) => [c.info, c.truthful]), [[{ kind: 'number', value: 1 }, true]]);
	s.poison = { by: 2, target: 3 };
	const lies = infoCandidates(s, 'empath', 3);
	assert.ok(lies.some((c) => !c.truthful && c.info.kind === 'number' && c.info.value === 0));
	const ft = infoCandidates(s, 'fortune-teller', 6, [4, 5]);
	assert.deepEqual(ft.map((c) => c.info.kind === 'fortune' && c.info.yes), [true]);
	assert.match(ft[0].why, /red herring/);
});

test('players can be moved round the circle mid-game, and every neighbour rule follows', () => {
	// 0 Ada imp, 1 Bram washerwoman, 2 Cael poisoner, 3 Dorn empath, 4 Esme monk, 5 Fenn soldier, 6 Gwen investigator
	let s = playNight(base());
	assert.deepEqual(livingNeighbours(s, 3), [2, 4]);
	assert.deepEqual(chefNumbers(s), [0]);
	// Ada (the Imp) and Esme (the Monk) swap places: the Imp now sits between Dorn (Empath) and Fenn.
	s = ok(s, { type: 'swap-seats', a: 0, b: 4 });
	assert.deepEqual(s.order, [4, 1, 2, 3, 0, 5, 6]);
	assert.deepEqual(livingNeighbours(s, 3), [2, 0]);
	assert.deepEqual(empathNumbers(s, 3), [2]);
	assert.deepEqual(voteOrder(s, 3), [0, 5, 6, 4, 1, 2, 3]);
	// Move Cael (Poisoner) next to Ada (Imp): one evil pair.
	s = ok(s, { type: 'swap-seats', a: 2, b: 5 });
	assert.deepEqual(chefNumbers(s), [1]);
	refused(s, { type: 'swap-seats', a: 1, b: 1 }, /two different/);
});

test('the red herring is always a good player, even when set by hand', () => {
	const s = playNight(base());
	refused(s, { type: 'set-red-herring', seat: 0 }, /good player/); // the Imp
	refused(s, { type: 'set-red-herring', seat: 2 }, /good player/); // the Poisoner
	ok(s, { type: 'set-red-herring', seat: 4 });
});
