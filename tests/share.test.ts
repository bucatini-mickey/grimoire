/**
 * share.test.ts - the shareable setup summary: official script JSON, team counts,
 * setup modifiers, and nothing secret.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getScript, customScriptId, setupSummary, scriptJson, setupModifiers, officialId, baseComposition, emptyState } from '../src/core/index.ts';
import { NAMES, ok } from './helpers.ts';

test('SHARE-JSON: the script is a _meta entry then official ids, and parses back', () => {
	const sc = getScript('trouble-brewing');
	const j = JSON.parse(scriptJson(sc, 'Jo'));
	assert.deepEqual(j[0], { id: '_meta', name: sc.name, author: 'Jo' });
	assert.equal(j.length, sc.characters.length + 1);
	assert.ok(j.slice(1).every((x: unknown) => typeof x === 'string' && /^[a-z0-9]+$/.test(x as string)));
	assert.ok(j.includes('scarletwoman') && j.includes('fortuneteller'));
	assert.equal(officialId('Pit-Hag'), 'pithag');
});

test('SHARE-COUNTS: player count gives the table counts; the modifiers list Baron and Godfather-style options', () => {
	const tb = getScript('trouble-brewing');
	const t = setupSummary(tb, 9);
	assert.match(t, /Players: 9/);
	const c = baseComposition(9);
	assert.match(t, new RegExp(`${c.townsfolk} Townsfolk, ${c.outsider} Outsiders, ${c.minion} Minions, ${c.demon} Demon`));
	assert.deepEqual(setupModifiers(tb).find((m) => m.name === 'Baron'), { name: 'Baron', change: '\u22122 Townsfolk, +2 Outsiders' });
	assert.match(setupSummary(getScript('bad-moon-rising'), 9), /Godfather: .* or /);
	// No (or silly) player count: the whole table instead.
	assert.match(setupSummary(tb, null), /\n {2}5: 3 Townsfolk/);
	assert.match(setupSummary(tb, 40), /\n {2}15: /);
});

test('SHARE-CUSTOM: a custom script exports exactly its characters, in order', () => {
	const sc = getScript(customScriptId(['imp', 'baron', 'empath', 'drunk']));
	assert.deepEqual(JSON.parse(scriptJson(sc)).slice(1), ['imp', 'baron', 'empath', 'drunk']);
});

test('SHARE-SECRET: the summary is the same whoever sits where, and names no player', () => {
	const sc = getScript('trouble-brewing');
	const names = NAMES.slice(0, 7);
	const chars = ['imp', 'baron', 'empath', 'recluse', 'monk', 'chef', 'saint'];
	const s = ok(emptyState(), [{ type: 'create', names, scriptId: 'trouble-brewing' }, { type: 'assign', characters: chars, bluffs: ['librarian', 'slayer', 'soldier'] }]);
	const before = setupSummary(sc, 7);
	const after = setupSummary(getScript(s.scriptId), s.seats.length);
	assert.equal(after, before);
	for (const n of names) assert.ok(!after.includes(n), `${n} must not appear`);
	assert.ok(!/bluff|red herring|seat/i.test(after));
});
