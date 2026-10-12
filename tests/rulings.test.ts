/**
 * rulings.test.ts - the official rulings and worked examples (the
 * Pandemonium Institute wiki, each character's "How to Run" and examples),
 * one test each, in our own words. docs/rules/INTERACTIONS.md lists them all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chefNumbers, judgeInfo, perform } from '../src/core/index.ts';
import { game, ok, playNight } from './helpers.ts';

test('TB-MONK-IMP: the Monk protects the Imp, who chooses themself: nothing happens, no new Imp', () => {
	// 0 imp, 1 poisoner, 2 monk, 3 chef, 4 empath, 5 soldier, 6 washerwoman
	let s = playNight(game(['imp', 'poisoner', 'monk', 'chef', 'empath', 'soldier', 'washerwoman']));
	s = ok(s, { type: 'end-day' });
	s = playNight(s, { poisoner: { type: 'choose', target: 3 }, monk: { type: 'choose', target: 0 }, imp: { type: 'choose', target: 0 } });
	assert.equal(s.seats[0].alive, true, 'the Imp lives');
	assert.equal(s.seats[0].character, 'imp');
	assert.equal(s.seats[1].character, 'poisoner', 'no new Imp');
	assert.notEqual(s.phase.kind, 'over');
});

test('TB-CHEF-RECLUSE: a Recluse between the Imp and the Poisoner can make the Chef learn 1', () => {
	// 0 imp, 1 recluse, 2 poisoner, ... (the rules' own example)
	const s = game(['imp', 'recluse', 'poisoner', 'chef', 'empath', 'monk', 'soldier']);
	assert.deepEqual(chefNumbers(s), [0, 1, 2]);
	assert.ok(judgeInfo(s, 3, 'chef', { kind: 'number', value: 1 }).truthful);
});

test('TB-CHEF-SPY: the Spy may read evil for one pair and good for another on the same night', () => {
	// The Spy between the Imp and the Empath: the Chef may learn 1 while the Empath learns 0.
	const s = game(['imp', 'spy', 'empath', 'chef', 'monk', 'soldier', 'washerwoman']);
	assert.ok(chefNumbers(s).includes(1));
	assert.ok(judgeInfo(s, 2, 'empath', { kind: 'number', value: 0 }).truthful);
});

test('TB-BUTLER-SLIP: a Butler voting without their master is counted, not refused', () => {
	// 0 imp, 1 poisoner, 2 butler, 3 chef, 4 empath, 5 monk, 6 soldier
	let s = playNight(game(['imp', 'poisoner', 'butler', 'chef', 'empath', 'monk', 'soldier']), { butler: { type: 'choose', target: 3 }, poisoner: { type: 'choose', target: 4 } });
	s = ok(s, { type: 'nominate', nominator: 4, nominee: 0 });
	const r = perform(s, { type: 'vote', voters: [2, 4] });
	assert.ok(r.ok, 'counted');
});

// ---- the rest of the Trouble Brewing examples -------------------------------------------------

/** Night 1 quietly, then a day with no execution, to the start of night 2. */
const toNight2 = (chars: string[], opts: Parameters<typeof game>[1] = {}, n1: Parameters<typeof playNight>[1] = {}) => ok(playNight(game(chars, opts), n1), { type: 'end-day' });

test('TB-MONK-MAYOR: the Monk protects the Mayor; the Imp attacks: no bounce, no death', () => {
	// 0 imp, 1 poisoner, 2 monk, 3 mayor, 4 chef, 5 empath, 6 soldier
	let s = toNight2(['imp', 'poisoner', 'monk', 'mayor', 'chef', 'empath', 'soldier']);
	s = ok(s, [{ type: 'choose', target: 4 }, { type: 'choose', target: 3 }]);
	const r = perform(s, { type: 'choose', target: 3 });
	assert.ok(r.ok, 'no question about a bounce: the Mayor is safe');
	assert.ok(r.ok && r.state.seats.every((x) => x.alive));
});

test('TB-SOLDIER-DRUNK: a Drunk who thinks they are the Soldier dies to the Imp', () => {
	// 0 imp, 1 poisoner, 2 drunk(soldier), 3 chef, 4 empath, 5 monk, 6 mayor
	let s = toNight2(['imp', 'poisoner', 'drunk', 'chef', 'empath', 'monk', 'mayor'], { drunkBelieves: 'soldier' });
	s = ok(s, [{ type: 'choose', target: 3 }, { type: 'choose', target: 4 }, { type: 'choose', target: 2 }]);
	assert.equal(s.seats[2].alive, false);
});

test('TB-UNDERTAKER-DRUNK: an executed Drunk shows as the Drunk', () => {
	// 0 imp, 1 poisoner, 2 drunk(virgin), 3 undertaker, 4 empath, 5 monk, 6 soldier
	let s = playNight(game(['imp', 'poisoner', 'drunk', 'undertaker', 'empath', 'monk', 'soldier'], { drunkBelieves: 'virgin' }));
	s = ok(s, [{ type: 'nominate', nominator: 4, nominee: 2 }, { type: 'vote', voters: [3, 4, 5, 6] }, { type: 'end-day' }]);
	assert.ok(judgeInfo(s, 3, 'undertaker', { kind: 'character', character: 'drunk' }).truthful);
	assert.equal(judgeInfo(s, 3, 'undertaker', { kind: 'character', character: 'virgin' }).truthful, false);
});

test('TB-UNDERTAKER-SPY: an executed Spy may show as a good character', () => {
	// 0 imp, 1 spy, 2 undertaker, 3 chef, 4 empath, 5 monk, 6 soldier
	let s = playNight(game(['imp', 'spy', 'undertaker', 'chef', 'empath', 'monk', 'soldier']));
	s = ok(s, [{ type: 'nominate', nominator: 4, nominee: 1 }, { type: 'vote', voters: [2, 3, 4, 5] }, { type: 'end-day' }]);
	assert.ok(judgeInfo(s, 2, 'undertaker', { kind: 'character', character: 'butler' }).truthful);
	assert.ok(judgeInfo(s, 2, 'undertaker', { kind: 'character', character: 'spy' }).truthful);
});

test('TB-FT-HERRING-SELF: the Fortune Teller may be their own red herring', () => {
	// 0 imp, 1 poisoner, 2 fortune teller (red herring), 3 chef, 4 empath, 5 monk, 6 saint
	const s = game(['imp', 'poisoner', 'fortune-teller', 'chef', 'empath', 'monk', 'saint'], { redHerring: 2 });
	assert.ok(judgeInfo(s, 2, 'fortune-teller', { kind: 'fortune', players: [2, 6], yes: true }).truthful);
	assert.equal(judgeInfo(s, 2, 'fortune-teller', { kind: 'fortune', players: [3, 6], yes: true }).truthful, false);
});

test('TB-FT-DEAD-DEMON: a dead Imp still reads yes', () => {
	const s = game(['imp', 'poisoner', 'fortune-teller', 'chef', 'empath', 'monk', 'saint'], { redHerring: 6 });
	s.seats[0].alive = false;
	assert.ok(judgeInfo(s, 2, 'fortune-teller', { kind: 'fortune', players: [0, 3], yes: true }).truthful);
});

test('TB-SLAYER-SPENT: a poisoned Slayer shoots the Imp, nothing happens, and the shot is gone', () => {
	// 0 imp, 1 poisoner, 2 slayer, 3 chef, 4 empath, 5 monk, 6 soldier
	let s = playNight(game(['imp', 'poisoner', 'slayer', 'chef', 'empath', 'monk', 'soldier']), { poisoner: { type: 'choose', target: 2 } });
	s = ok(s, { type: 'slay', by: 2, target: 0 });
	assert.equal(s.seats[0].alive, true, 'poisoned: nothing happens');
	assert.ok(s.spent.includes('2:slayer'));
	assert.equal(perform(s, { type: 'slay', by: 2, target: 0 }).ok, false, 'and the shot is gone');
});

test('TB-RECLUSE-SLAYER: the Recluse may register as the Demon and die; the game goes on', () => {
	// 0 imp, 1 poisoner, 2 slayer, 3 recluse, 4 empath, 5 monk, 6 soldier
	const s = playNight(game(['imp', 'poisoner', 'slayer', 'recluse', 'empath', 'monk', 'soldier']), { poisoner: { type: 'choose', target: 4 } });
	const r = perform(s, { type: 'slay', by: 2, target: 3 });
	assert.equal(!r.ok && r.decision, 'targetIsDemon');
	const hit = ok(s, { type: 'slay', by: 2, target: 3, targetIsDemon: true });
	assert.equal(hit.seats[3].alive, false);
	assert.notEqual(hit.phase.kind, 'over');
});

test('TB-VIRGIN-DRUNK: a Drunk who thinks they are a Townsfolk nominates the Virgin and lives', () => {
	// 0 imp, 1 poisoner, 2 virgin, 3 drunk(chef), 4 empath, 5 monk, 6 soldier
	let s = playNight(game(['imp', 'poisoner', 'virgin', 'drunk', 'empath', 'monk', 'soldier'], { drunkBelieves: 'chef' }), { poisoner: { type: 'choose', target: 4 } });
	s = ok(s, { type: 'nominate', nominator: 3, nominee: 2 });
	assert.equal(s.seats[3].alive, true);
	assert.ok(s.spent.includes('2:virgin'));
	assert.equal(s.day!.executed, null, 'the vote on the Virgin goes ahead');
});

test('TB-VIRGIN-SPY: the Spy may register as a Townsfolk to the Virgin', () => {
	// 0 imp, 1 spy, 2 virgin, 3 chef, 4 empath, 5 monk, 6 soldier
	const s = playNight(game(['imp', 'spy', 'virgin', 'chef', 'empath', 'monk', 'soldier']));
	const r = perform(s, { type: 'nominate', nominator: 1, nominee: 2 });
	assert.equal(!r.ok && r.decision, 'nominatorIsTownsfolk');
	const executed = ok(s, { type: 'nominate', nominator: 1, nominee: 2, nominatorIsTownsfolk: true });
	assert.equal(executed.seats[1].alive, false);
});

test('TB-SAINT-POISONED: a poisoned Saint is executed and the game goes on', () => {
	// 0 imp, 1 poisoner, 2 saint, 3 chef, 4 empath, 5 monk, 6 soldier
	let s = playNight(game(['imp', 'poisoner', 'saint', 'chef', 'empath', 'monk', 'soldier']), { poisoner: { type: 'choose', target: 2 } });
	s = ok(s, [{ type: 'nominate', nominator: 3, nominee: 2 }, { type: 'vote', voters: [3, 4, 5, 6] }, { type: 'end-day' }]);
	assert.equal(s.seats[2].alive, false);
	assert.equal(s.phase.kind, 'night');
});

test('TB-SW-FIVE: the Scarlet Woman takes over at five alive, not at four', () => {
	// 0 imp, 1 scarlet woman, 2 chef, 3 empath, 4 monk, 5 soldier, 6 saint
	const at = (alive: number) => {
		let s = playNight(game(['imp', 'scarlet-woman', 'chef', 'empath', 'monk', 'soldier', 'saint']));
		for (let k = 2; k < 2 + (7 - alive); k++) s.seats[k].alive = false; // already dead (set directly)
		const voters = [0, 1, 2, 3, 4, 5, 6].filter((k) => s.seats[k].alive && k !== 0);
		return ok(s, [{ type: 'nominate', nominator: 1, nominee: 0 }, { type: 'vote', voters }, { type: 'end-day' }]);
	};
	const five = at(5);
	assert.equal(five.seats[1].character, 'imp');
	assert.notEqual(five.phase.kind, 'over');
	const four = at(4);
	assert.equal(four.phase.kind, 'over');
});

test('TB-MAYOR-WIN-TIE: three alive and a tied vote, so no execution: good wins', () => {
	// 0 imp, 1 poisoner, 2 mayor, 3 chef, ...: three alive (0, 2, 3)
	let s = playNight(game(['imp', 'poisoner', 'mayor', 'chef', 'empath', 'monk', 'soldier']), { poisoner: { type: 'choose', target: 4 } });
	for (const k of [1, 4, 5, 6]) s.seats[k].alive = false;
	s = ok(s, [{ type: 'nominate', nominator: 3, nominee: 0 }, { type: 'vote', voters: [2, 3] }, { type: 'nominate', nominator: 0, nominee: 3 }, { type: 'vote', voters: [0, 1] }]);
	assert.equal(s.day!.block, null, 'tied');
	s = ok(s, { type: 'end-day' });
	assert.equal(s.phase.kind === 'over' && s.phase.winner, 'good');
});

test('TB-IMP-ATTACK-DEAD: the Imp may attack a dead player; no one dies', () => {
	let s = toNight2(['imp', 'poisoner', 'monk', 'chef', 'empath', 'soldier', 'washerwoman']);
	s.seats[3].alive = false;
	const before = s.seats.filter((x) => x.alive).length;
	s = ok(s, [{ type: 'choose', target: 4 }, { type: 'choose', target: 5 }, { type: 'choose', target: 3 }]);
	assert.equal(s.seats.filter((x) => x.alive).length, before);
});

test('TB-EMPATH-THREE: with three alive, the Empath between the Imp and a Minion learns 2', () => {
	const s = game(['imp', 'poisoner', 'empath', 'chef', 'monk', 'soldier', 'washerwoman']);
	for (const k of [3, 4, 5, 6]) s.seats[k].alive = false;
	assert.ok(judgeInfo(s, 2, 'empath', { kind: 'number', value: 2 }).truthful);
	assert.equal(judgeInfo(s, 2, 'empath', { kind: 'number', value: 1 }).truthful, false);
});
