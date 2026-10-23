/**
 * marionette.test.ts - the Marionette: a Minion who thinks they are a good
 * character. Like the Drunk, it is an overlay on a seat: the seat holds the
 * Marionette, the player is told a good character not in play, and that
 * ability never works. It sits next to the Demon, and only the Demon knows.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, nightSteps, nextStep, stepAction, getScript, customScriptId, isDroisoned, randomDeal, seatMarionette } from '../src/core/index.ts';
import { wakeFor, cardFor } from '../src/net/views.ts';
import { NAMES, ok, refused } from './helpers.ts';

const SCRIPT = customScriptId(['imp', 'marionette', 'poisoner', 'empath', 'chef', 'monk', 'soldier', 'mayor', 'washerwoman', 'librarian', 'saint']);
const create = (n: number) => ({ type: 'create' as const, names: NAMES.slice(0, n), scriptId: SCRIPT });
// Seven seats: the Imp at 0, the Marionette beside it at 1.
const CHARS = ['imp', 'marionette', 'poisoner', 'chef', 'monk', 'soldier', 'mayor'];
const BLUFFS = ['washerwoman', 'librarian', 'saint'];

function dealt() {
	return ok(emptyState(), [create(7), { type: 'assign', characters: CHARS, marionetteBelieves: 'empath', bluffs: BLUFFS, allowNonstandard: true }, { type: 'begin' }]);
}

test('MARIONETTE-SEAT: the Marionette must sit next to the Demon', () => {
	const s = ok(emptyState(), create(7));
	refused(s, { type: 'assign', characters: ['imp', 'chef', 'marionette', 'poisoner', 'monk', 'soldier', 'mayor'], marionetteBelieves: 'empath', bluffs: BLUFFS, allowNonstandard: true }, /next to the Demon/);
	// Either side will do, round the end of the circle too.
	ok(s, { type: 'assign', characters: ['imp', 'chef', 'poisoner', 'monk', 'soldier', 'mayor', 'marionette'], marionetteBelieves: 'empath', bluffs: BLUFFS, allowNonstandard: true });
});

test('MARIONETTE-BELIEVES: they are told a good character that is not in play', () => {
	const s = ok(emptyState(), create(7));
	const assign = (b?: string) => ({ type: 'assign' as const, characters: CHARS, marionetteBelieves: b, bluffs: BLUFFS, allowNonstandard: true });
	refused(s, assign(), /Marionette thinks/);
	refused(s, assign('poisoner'), /Townsfolk or an Outsider/);
	refused(s, assign('chef'), /not in play/);
	refused(ok(emptyState(), create(7)), { type: 'assign', characters: ['imp', 'chef', 'poisoner', 'monk', 'soldier', 'mayor', 'empath'], marionetteBelieves: 'saint', bluffs: BLUFFS, allowNonstandard: true }, /no Marionette/);
	const g = dealt();
	assert.equal(g.seats[1].character, 'marionette');
	assert.equal(g.seats[1].believes, 'empath');
	assert.equal(g.seats[1].alignment, 'evil');
});

test('MARIONETTE-DRUNK: the good ability they think they have never works', () => {
	const g = dealt();
	assert.ok(isDroisoned(g, 1), 'the Marionette counts as drunk');
	assert.ok(nightSteps(g).some((x) => x.id === 'empath:1'), 'they wake as the Empath they think they are');
	// Their own card says they are the Empath, on the good team.
	assert.equal(cardFor(g, 1)?.name, 'Empath');
	assert.equal(cardFor(g, 1)?.team, 'good');
});

test('MARIONETTE-KNOWLEDGE: the Demon learns the Marionette; the other Minions and the Marionette do not', () => {
	let g = dealt();
	const seen: Record<string, string[]> = {};
	for (let guard = 0; guard < 30; guard++) {
		const step = nextStep(g);
		if (!step) break;
		const w = wakeFor(g, step);
		seen[step.id] = w.sections.flatMap((x) => [x.title, ...x.lines]);
		const act = stepAction(step.kind);
		g = ok(g, act === 'tell' ? { type: 'tell', info: { kind: 'number', value: 0 }, override: true } : act === 'choose' ? { type: 'choose', targets: [3] } : { type: 'acknowledge' });
	}
	const demon = Object.entries(seen).find(([k]) => k.startsWith('demon-info'))?.[1] ?? [];
	assert.ok(demon.includes('Bram (the Marionette)'), `the Demon is told: ${demon.join(' / ')}`);
	// The Poisoner learns the evil team when it wakes to poison.
	const minion = Object.entries(seen).filter(([k]) => k.endsWith(':2')).flatMap(([, v]) => v);
	assert.ok(minion.includes('Your Demon'), `the Poisoner learns its Demon: ${minion.join(' / ')}`);
	assert.ok(minion.length && !minion.some((l) => l.includes('Bram')), `the Poisoner is not told: ${minion.join(' / ')}`);
	const own = Object.entries(seen).filter(([k]) => k.endsWith(':1')).flatMap(([, v]) => v);
	assert.ok(!own.includes('Your Demon') && !own.includes('Evil'), `the Marionette is told nothing evil: ${own.join(' / ')}`);
});

test('MARIONETTE-DEAL: a random deal seats the Marionette beside the Demon and gives it a good character', () => {
	const id = customScriptId(['imp', 'marionette', 'poisoner', 'empath', 'chef', 'monk', 'soldier', 'mayor', 'washerwoman', 'librarian', 'saint', 'investigator', 'undertaker', 'ravenkeeper', 'virgin', 'slayer', 'recluse', 'butler']);
	const script = getScript(id);
	for (let seed = 1; seed < 40; seed++) {
		const d = randomDeal(script, 10, seed);
		const m = d.characters.indexOf('marionette');
		if (m < 0) continue;
		const dm = d.characters.indexOf('imp');
		assert.ok([(dm + 1) % 10, (dm + 9) % 10].includes(m), `seed ${seed}: Marionette at ${m}, Imp at ${dm}`);
		assert.ok(d.marionetteBelieves && !d.characters.includes(d.marionetteBelieves), `seed ${seed}: believes ${d.marionetteBelieves}`);
		ok(emptyState(), [{ type: 'create', names: NAMES.slice(0, 10), scriptId: id }, { ...d, allowNonstandard: true }]);
	}
	// Moving the Marionette away from the Demon in setup brings it back beside them.
	assert.deepEqual(seatMarionette(['imp', 'chef', 'marionette', 'monk'], [0, 1, 2, 3], (c) => c === 'imp'), ['imp', 'marionette', 'chef', 'monk']);
	assert.deepEqual(seatMarionette(['imp', 'marionette', 'chef'], [0, 1, 2], (c) => c === 'imp'), ['imp', 'marionette', 'chef']);
});
