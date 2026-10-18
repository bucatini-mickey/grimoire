import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/core/index.ts';
import { AMNESIAC_IDEAS, savantPair, savantStatements } from '../src/ui/helpers.ts';

function game() {
	const r = G.performAll(G.replay([]), [
		{ type: 'create', names: ['Ada', 'Bram', 'Cora', 'Dev', 'Ella'], scriptId: 'laissez-un-faire' },
		{ type: 'assign', characters: ['savant', 'balloonist', 'widow', 'leviathan', 'mutant'], bluffs: ['fisherman', 'artist', 'cult-leader'], allowNonstandard: true }
	] as G.Command[]);
	assert.ok(r.ok, r.ok ? '' : r.error);
	return r.state;
}

test('Laissez un Faire is a script: five Townsfolk, two Outsiders, two Minions, the Leviathan', () => {
	const s = G.getScript('laissez-un-faire');
	const n = (t: string) => s.characters.filter((c) => c.team === t).length;
	assert.deepEqual([n('townsfolk'), n('outsider'), n('minion'), n('demon')], [5, 2, 2, 1]);
});

test('the Savant: a true and a false statement; or two truths, or two lies; and the truths are true', () => {
	const st = game();
	for (let seed = 1; seed < 20; seed++) {
		const all = savantStatements(st, 0, seed);
		const pair = savantPair(all, seed, 'normal');
		assert.equal(pair.length, 2);
		assert.deepEqual(pair.map((x) => x.true).sort(), [false, true]);
		assert.ok(savantPair(all, seed, 'truths').every((x) => x.true));
		assert.ok(savantPair(all, seed, 'lies').every((x) => !x.true));
		const outs = all.find((x) => x.true && x.text.includes('Outsider'));
		assert.equal(outs?.text, 'There is 1 Outsider in play.');
		assert.ok(all.some((x) => x.true && x.text === 'The Demon sits 2 seats from you.'));
	}
	assert.ok(AMNESIAC_IDEAS.length >= 10);
});
