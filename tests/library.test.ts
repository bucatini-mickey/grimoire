/**
 * library.test.ts - the scripts the script page offers (src/core/scripts/library.ts): every one
 * loads, has a demon and something said about it, and a game can be set up on it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, getScript, customScriptId, parseCustomId, LIBRARY, libraryChars, libraryEntry, SCRIPTS, FABLED, LORIC, randomDeal } from '../src/core/index.ts';
import { NAMES, ok } from './helpers.ts';

test('LIBRARY: every script loads, has a Demon and words about it, and no id twice', () => {
	assert.ok(LIBRARY.length >= 100, `${LIBRARY.length} scripts`);
	assert.equal(new Set(LIBRARY.map((e) => e.id)).size, LIBRARY.length, 'ids are unique');
	for (const e of LIBRARY) {
		const sc = getScript(e.id);
		assert.ok(sc.characters.some((c) => c.team === 'demon'), `${e.name} has a Demon`);
		assert.ok(e.about.length > 30, `${e.name} says what it is`);
		assert.ok(!sc.characters.some((c) => c.team === 'traveller'), `${e.name}: Travellers are kept apart`);
		for (const f of (e.fabled ?? '').split(' ').filter(Boolean)) assert.ok(FABLED.some((x) => x.id === f), `${e.name}: Fabled ${f}`);
		for (const l of (e.loric ?? '').split(' ').filter(Boolean)) assert.ok(LORIC.some((x) => x.id === l), `${e.name}: Loric ${l}`);
		if (!SCRIPTS[e.id]) assert.deepEqual(sc.characters.map((c) => c.id), libraryChars(e), `${e.name} plays its own list`);
	}
	for (const id of ['trouble-brewing', 'bad-moon-rising', 'sects-and-violets', 'laissez-un-faire']) assert.equal(libraryEntry(id)?.kind === 'popular', false, `${id} is official`);
});

test('LIBRARY-DEAL: a game can be created and dealt on every library script', () => {
	// High Stakes Betting has no Minions (every evil player is a Riot): the Storyteller deals it by hand.
	for (const e of LIBRARY.filter((x) => x.id !== 'lib:high-stakes-betting')) {
		const players = e.size === 'teensy' ? 6 : 9;
		const s = ok(emptyState(), { type: 'create', names: NAMES.slice(0, players), scriptId: e.id });
		assert.equal(s.scriptId, e.id);
		for (let seed = 1; seed <= 20; seed++) assert.equal(randomDeal(getScript(e.id), players, seed).characters.length, players, `${e.name}: dealt ${players} (seed ${seed})`);
	}
});

test('CUSTOM-NAME: a custom script keeps its name in its id; old ids without one still read', () => {
	const id = customScriptId(['chef', 'imp'], 'Wolves | and sheep');
	assert.deepEqual(parseCustomId(id), { ids: ['chef', 'imp'], name: 'Wolves | and sheep' });
	assert.equal(getScript(id).name, 'Wolves | and sheep');
	assert.equal(getScript('custom:chef,imp').name, 'Custom script');
	assert.equal(customScriptId(['chef'], '  '), 'custom:chef');
});
