import { test } from 'node:test';
import assert from 'node:assert/strict';
import { play, shrink } from './sim/sim.ts';

/**
 * Random whole games, with every rule checked after every event (see
 * tests/sim/sim.ts). A few hundred here so `npm test` stays quick; run
 * `npm run sim` for tens of thousands.
 */
const GAMES = Number(process.env.SIM_GAMES ?? 600);

test(`${GAMES} random games keep every rule, and cover the interesting parts`, () => {
	const seen: Record<string, number> = {};
	for (let seed = 1; seed <= GAMES; seed++) {
		const g = play(seed);
		for (const [k, v] of Object.entries(g.stats)) seen[k] = (seen[k] ?? 0) + v;
		if (!g.violations.length) continue;
		const v = g.violations[0];
		const small = shrink(g.commands, v.rule);
		assert.fail(`seed ${seed} broke "${v.rule}": ${v.detail}\nIn ${small.length} commands:\n${small.map((c) => JSON.stringify(c)).join('\n')}`);
	}
	// The robots must actually reach the tricky interactions, or a clean run means little.
	for (const k of ['won: good: The Demon is dead.', 'won: evil: Only two players are left alive.', 'won: evil: The Saint was executed.',
		'via starpass', 'via scarlet-woman', 'saved: protected by the Monk', 'saved: the Soldier', 'kill-redirected',
		'died: slayer', 'died: execution', 'virgin executes nominator', 'asked: newDemon', 'asked: mayorRedirect',
		// Bad Moon Rising (every other seed)
		'script: bad-moon-rising', 'won: evil: the Mastermind', 'saved: the Tea Lady', 'saved: the Fool', 'saved: the Innkeeper', 'saved: the Sailor',
		'died: assassin', 'died: gambler', 'died: moonchild', 'died: gossip', 'died: godfather', 'died: grandmother', 'died: tinker',
		'revived by the professor', 'revived by the shabaloth', 'seems-dead', 'the Goon catches someone', 'the Minstrel plays',
		'asked: drunk', 'asked: regurgitate', 'asked: executionSurvives',
		// Sects & Violets
		'script: sects-and-violets', 'won: evil: the Klutz', 'won: evil: the Evil Twin', 'won: evil: No one was executed while the Vortox lives.',
		'via snake-charmer', 'via fang-gu', 'via pit-hag', 'died: witch', 'died: fang-gu', 'died: storyteller']) {
		assert.ok((seen[k] ?? 0) > 0, `never happened in ${GAMES} games: ${k}`);
	}
});
