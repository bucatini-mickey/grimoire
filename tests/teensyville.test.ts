/**
 * Small games (fewer than 7 players): the Minions and the Demon do not learn
 * each other on the first night, and the Demon is shown no bluffs. From 7
 * players they do. (The Demon not killing on the first night is a base rule
 * of every game, not something special to small ones.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, perform, randomDeal, getScript, nightSteps, evilLearnEachOther, baseComposition } from '../src/core/index.ts';
import { wakeFor } from '../src/net/views.ts';
import { NAMES, ok, game, gameOn, refused, playNight } from './helpers.ts';

const TB = getScript('trouble-brewing');
const FIVE = ['imp', 'poisoner', 'chef', 'empath', 'monk'];
const SIX = ['imp', 'poisoner', 'chef', 'empath', 'monk', 'saint'];
const SEVEN = ['imp', 'poisoner', 'chef', 'empath', 'monk', 'mayor', 'soldier'];
const evilKinds = ['minion-info', 'demon-info', 'lunatic-info'];

test('the rule itself: evil learn each other from 7 players', () => {
	assert.deepEqual([5, 6, 7, 8].map(evilLearnEachOther), [false, false, true, true]);
});

test('setup at 5 and 6 players: 3/0/1/1 and 3/1/1/1', () => {
	assert.deepEqual(baseComposition(5), { townsfolk: 3, outsider: 0, minion: 1, demon: 1 });
	assert.deepEqual(baseComposition(6), { townsfolk: 3, outsider: 1, minion: 1, demon: 1 });
	ok(emptyState(), [{ type: 'create', names: NAMES.slice(0, 5) }, { type: 'assign', characters: FIVE, bluffs: [] }]);
	ok(emptyState(), [{ type: 'create', names: NAMES.slice(0, 6) }, { type: 'assign', characters: SIX, bluffs: [] }]);
});

for (const [label, chars] of [['5', FIVE], ['6', SIX]] as const) {
	test(`${label} players: no evil-info steps on night one, and nobody is told who the evil are`, () => {
		const s = game([...chars], { strict: true });
		const steps = nightSteps(s);
		assert.ok(!steps.some((x) => evilKinds.includes(x.kind)));
		assert.equal(new Set(steps.map((x) => x.seat)).size, chars.length, 'everyone wakes once');
		assert.deepEqual(s.bluffs, []);
		for (const step of steps) {
			const text = JSON.stringify(wakeFor(s, step));
			assert.ok(!/Your Demon|Your Minions|Fellow Minions|Not in play/.test(text), `${step.id} shows evil info`);
		}
	});

	test(`${label} players: the Demon has no bluffs, even if some are sent`, () => {
		const s = ok(emptyState(), [
			{ type: 'create', names: NAMES.slice(0, chars.length) },
			{ type: 'assign', characters: [...chars], bluffs: ['virgin', 'slayer', 'undertaker'] },
			{ type: 'begin' }
		]);
		assert.deepEqual(s.bluffs, [], 'sent bluffs are dropped');
		// The Spy's grimoire shows none either.
		const spy = [...chars]; spy[1] = 'spy';
		const g = ok(emptyState(), [
			{ type: 'create', names: NAMES.slice(0, chars.length) },
			{ type: 'assign', characters: spy, bluffs: ['virgin', 'slayer', 'undertaker'] },
			{ type: 'begin' }
		]);
		const step = nightSteps(g).find((x) => x.kind === 'spy')!;
		assert.deepEqual(wakeFor(g, step).grimoire?.bluffs ?? [], []);
	});

	test(`${label} players: a random deal has no bluffs`, () => {
		for (let seed = 1; seed <= 20; seed++) assert.deepEqual(randomDeal(TB, chars.length, seed).bluffs, []);
	});

	test(`${label} players: the Demon does not kill on night one, and the game plays on`, () => {
		const s = playNight(game([...chars], { strict: true }));
		assert.equal(s.seats.every((x) => x.alive), true);
	});
}

test('6 players: a Lunatic is only shown their character, with no pretend Minions or bluffs', () => {
	const s = gameOn('bad-moon-rising', ['zombuul', 'godfather', 'lunatic', 'chambermaid', 'gambler', 'tinker']);
	assert.ok(!nightSteps(s).some((x) => x.kind === 'lunatic-info'));
	assert.ok(nightSteps(s).some((x) => x.id === 'reveal:2'));
});

test('7 players: the boundary - the evil team learns each other and the Demon gets three bluffs', () => {
	const s = game([...SEVEN]);
	const ids = nightSteps(s).map((x) => x.id);
	assert.ok(ids.includes('demon-info:0'));
	assert.equal(s.bluffs.length, 3);
	const demon = wakeFor(s, nightSteps(s).find((x) => x.kind === 'demon-info')!);
	assert.match(JSON.stringify(demon), /Your Minions/);
	assert.match(JSON.stringify(demon), /Not in play/);
	// Three bluffs are required at 7.
	const c = emptyState();
	const made = ok(c, { type: 'create', names: NAMES.slice(0, 7) });
	refused(made, { type: 'assign', characters: SEVEN, bluffs: [] }, /3 Demon bluffs/);
	assert.ok(perform(made, { type: 'assign', characters: SEVEN, bluffs: ['virgin', 'slayer', 'undertaker'] }).ok);
});

test('the Toymaker makes a small game learn each other and get bluffs', () => {
	const s = ok(emptyState(), [
		{ type: 'create', names: NAMES.slice(0, 5) },
		{ type: 'assign', characters: [...FIVE], bluffs: ['virgin', 'slayer', 'undertaker'], fabled: [{ id: 'toymaker' }] },
		{ type: 'begin' }
	]);
	assert.ok(nightSteps(s).some((x) => x.kind === 'demon-info'));
	assert.equal(s.bluffs.length, 3);
});
