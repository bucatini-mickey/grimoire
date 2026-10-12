/**
 * custom.test.ts - custom scripts: any mix of the characters the app knows.
 * Modelled characters keep their rules; experimental ones wake when the
 * official night sheet says and the Storyteller resolves them by hand.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, nightSteps, getScript, customScriptId, CATALOG, ALL_CHARACTERS } from '../src/core/index.ts';
import { NAMES, autoNight, ok, refused } from './helpers.ts';

test('CUSTOM-CATALOG: every official non-Fabled, non-Loric character is in the catalogue, with our own id', () => {
	const ours = new Set([...CATALOG.map((c) => c.id), ...Object.values(getScript(customScriptId(['imp'])).travellers ?? []).map((c) => c.id)]);
	const missing = ALL_CHARACTERS.filter((c) => c.team !== 'fabled' && c.team !== 'loric' && !ours.has(c.id)).map((c) => c.id);
	assert.deepEqual(missing, []);
});

test('CUSTOM-MIX: a script mixing editions plays by each character’s rules', () => {
	// The Imp (TB), the Witch (S&V), the Tea Lady (BMR), the Steward (experimental), and friends.
	const chars = ['imp', 'witch', 'tea-lady', 'steward', 'empath', 'monk', 'clockmaker'];
	const id = customScriptId([...chars, 'chef', 'sage', 'goon', 'poisoner']);
	let s = ok(emptyState(), [
		{ type: 'create', names: NAMES.slice(0, 7), scriptId: id },
		{ type: 'assign', characters: chars, bluffs: ['chef', 'sage', 'goon'] },
		{ type: 'begin' }
	]);
	assert.ok(nightSteps(s).some((x) => x.id === 'steward:3'), 'the Steward wakes on the first night (the sheet says so)');
	s = autoNight(s, { witch: { type: 'choose', target: 4 } }, 'steward');
	s = ok(s, { type: 'acknowledge' }); // resolved by the Storyteller by hand
	s = ok(autoNight(s), [{ type: 'end-night' }, { type: 'open-nominations' }, { type: 'nominate', nominator: 4, nominee: 6 }]);
	assert.equal(s.seats[4].alive, false, 'the Witch’s curse works on a custom script');
	refused(emptyState(), { type: 'create', names: NAMES.slice(0, 5), scriptId: customScriptId(['imp', 'nobody']) }, /Unknown character/);
	ok(s, { type: 'traveller-joins', name: 'Tess', character: 'gangster', alignment: 'evil', after: 0 });
});
