import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, perform, performAll, randomDeal, getScript, nightSteps, MIN_PLAYERS, MAX_PLAYERS } from '../src/core/index.ts';
import { NAMES, ok, refused, game, playNight } from './helpers.ts';

const TB = getScript('trouble-brewing');
const created = (n: number) => ok(emptyState(), { type: 'create', names: NAMES.slice(0, n) });

test('player count and names are checked', () => {
	refused(emptyState(), { type: 'create', names: NAMES.slice(0, 4) }, /5 to 15/);
	refused(emptyState(), { type: 'create', names: ['A', 'B', 'C', 'D', 'a'] }, /share a name/);
	refused(emptyState(), { type: 'create', names: ['A', 'B', 'C', 'D', ' '] }, /needs a name/);
});

test('team counts must match the table, including the Baron', () => {
	const s = created(7);
	// 7 players: 5 townsfolk, 0 outsiders, 1 minion, 1 demon
	refused(s, { type: 'assign', characters: ['imp', 'poisoner', 'saint', 'chef', 'monk', 'mayor', 'soldier'], bluffs: ['virgin', 'slayer', 'empath'] }, /expects 5 Townsfolk/);
	ok(s, { type: 'assign', characters: ['imp', 'poisoner', 'chef', 'empath', 'monk', 'mayor', 'soldier'], bluffs: ['virgin', 'slayer', 'undertaker'] });
	// With the Baron: 3 townsfolk, 2 outsiders
	ok(s, { type: 'assign', characters: ['imp', 'baron', 'saint', 'recluse', 'monk', 'mayor', 'soldier'], bluffs: ['virgin', 'slayer', 'chef'] });
	refused(s, { type: 'assign', characters: ['imp', 'imp', 'chef', 'empath', 'monk', 'mayor', 'soldier'], bluffs: [] }, /dealt twice/);
});

test('the Drunk must believe in a Townsfolk that is not in play', () => {
	const s = created(8);
	const chars = ['imp', 'spy', 'drunk', 'chef', 'empath', 'monk', 'mayor', 'soldier'];
	const bluffs = ['virgin', 'slayer', 'undertaker'];
	refused(s, { type: 'assign', characters: chars, bluffs }, /Drunk thinks/);
	refused(s, { type: 'assign', characters: chars, bluffs, drunkBelieves: 'chef' }, /not in play/);
	refused(s, { type: 'assign', characters: chars, bluffs, drunkBelieves: 'saint' }, /Townsfolk/);
	const g = ok(s, { type: 'assign', characters: chars, bluffs, drunkBelieves: 'washerwoman' });
	assert.equal(g.seats[2].character, 'drunk');
	assert.equal(g.seats[2].believes, 'washerwoman');
	assert.equal(g.seats[2].alignment, 'good');
});

test('a Fortune Teller needs a good red herring', () => {
	const s = created(7);
	const chars = ['imp', 'poisoner', 'fortune-teller', 'empath', 'monk', 'mayor', 'soldier'];
	const bluffs = ['virgin', 'slayer', 'chef'];
	const r = perform(s, { type: 'assign', characters: chars, bluffs });
	assert.equal(r.ok, false);
	assert.equal(!r.ok && r.decision, 'redHerring');
	refused(s, { type: 'assign', characters: chars, bluffs, redHerring: 1 }, /good player/);
	ok(s, { type: 'assign', characters: chars, bluffs, redHerring: 2 });
});

test('bluffs are three good characters not in play, and only from 7 players', () => {
	const s = created(7);
	const chars = ['imp', 'poisoner', 'chef', 'empath', 'monk', 'mayor', 'soldier'];
	refused(s, { type: 'assign', characters: chars, bluffs: ['virgin', 'slayer'] }, /3 Demon bluffs/);
	refused(s, { type: 'assign', characters: chars, bluffs: ['virgin', 'slayer', 'chef'] }, /in play/);
	refused(s, { type: 'assign', characters: chars, bluffs: ['virgin', 'slayer', 'spy'] }, /good/);
	ok(created(5), { type: 'assign', characters: ['imp', 'poisoner', 'chef', 'empath', 'monk'], bluffs: [] });
});

test('random deals are always legal, for every script and player count', () => {
	// Bad Moon Rising: the Godfather's one fewer Outsider is impossible with none to remove.
	for (const id of ['trouble-brewing', 'bad-moon-rising']) {
		const sc = getScript(id);
		for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
			for (let seed = 1; seed <= 60; seed++) {
				const start = ok(emptyState(), { type: 'create', names: NAMES.slice(0, n), scriptId: id });
				const r = performAll(start, [randomDeal(sc, n, seed * 7919 + n), { type: 'begin' }]);
				assert.ok(r.ok, `${id} n=${n} seed=${seed}: ${!r.ok && r.error}`);
			}
		}
	}
});

test('the same seed deals the same game', () => {
	assert.deepEqual(randomDeal(TB, 10, 42), randomDeal(TB, 10, 42));
	assert.notDeepEqual(randomDeal(TB, 10, 42), randomDeal(TB, 10, 43));
});

test('first night wake order', () => {
	const s = game(['imp', 'washerwoman', 'poisoner', 'empath', 'monk', 'butler', 'spy', 'chef', 'fortune-teller', 'librarian', 'investigator'],
		{ strict: false });
	assert.deepEqual(nightSteps(s).map((x) => x.id), [
		'demon-info:0', 'poisoner:2', 'washerwoman:1', 'librarian:9', 'investigator:10', 'chef:7',
		'empath:3', 'fortune-teller:8', 'butler:5', 'spy:6', 'reveal:4'
	]);
});

test('with fewer than 7 players the evil team does not learn each other', () => {
	const s = game(['imp', 'poisoner', 'chef', 'empath', 'monk']);
	assert.deepEqual(nightSteps(s).map((x) => x.id), ['poisoner:1', 'chef:2', 'empath:3', 'reveal:0', 'reveal:4']);
});

test('steps must be resolved in order and with the right kind of command', () => {
	const s = game(['imp', 'washerwoman', 'poisoner', 'empath', 'monk', 'mayor', 'soldier']);
	refused(s, { type: 'choose', target: 3 }, /needs "acknowledge"/);
	refused(s, { type: 'end-night' }, /still has to wake/);
	refused(s, { type: 'skip', reason: '  ' }, /why/);
	const s2 = ok(s, { type: 'skip', reason: 'demo' });
	assert.equal(nightSteps(s2)[0].done, true);
});

test('on the first night everyone sees their character, without disturbing the night order', () => {
	// 0 imp, 1 poisoner, 2 soldier, 3 chef, 4 mayor: five players, so no evil-team steps.
	// The Poisoner wakes first; those with nothing to do are woken at the end, just to see their character.
	const s = game(['imp', 'poisoner', 'soldier', 'chef', 'mayor']);
	assert.deepEqual(nightSteps(s).map((x) => x.id), ['poisoner:1', 'chef:3', 'reveal:0', 'reveal:2', 'reveal:4']);
	// Seven or more: the Demon and Minions learn who they are in their own steps.
	const t = game(['imp', 'baron', 'saint', 'recluse', 'monk', 'mayor', 'soldier']);
	assert.deepEqual(nightSteps(t).map((x) => x.id), ['minion-info:1', 'demon-info:0', 'reveal:2', 'reveal:3', 'reveal:4', 'reveal:5', 'reveal:6']);
	// Nobody is revealed again on later nights.
	const later = ok(playNight(s), { type: 'end-day' });
	assert.ok(!nightSteps(later).some((x) => x.kind === 'reveal'));
});

test('on night one nobody wakes twice: a Minion with an ability learns the Demon in that wake', () => {
	// 0 imp, 1 poisoner, 2 spy, 3 baron, ... ten players, so the evil team learns each other.
	const s = game(['imp', 'poisoner', 'spy', 'baron', 'chef', 'empath', 'monk', 'saint', 'recluse', 'soldier']);
	const ids = nightSteps(s).map((x) => x.id);
	assert.deepEqual(ids, ['minion-info:3', 'demon-info:0', 'poisoner:1', 'chef:4', 'empath:5', 'spy:2', 'reveal:6', 'reveal:7', 'reveal:8', 'reveal:9']);
	const woken = nightSteps(s).map((x) => x.seat);
	assert.equal(new Set(woken).size, woken.length, 'each seat appears once');
	assert.equal(woken.length, 10, 'and every seat appears');
});

test('the Drunk may be one of the Demon’s bluffs when not in play', () => {
	const s = ok(created(7), { type: 'assign', characters: ['imp', 'poisoner', 'chef', 'empath', 'monk', 'mayor', 'soldier'], bluffs: ['drunk', 'slayer', 'virgin'] });
	assert.deepEqual(s.bluffs, ['drunk', 'slayer', 'virgin']);
});
