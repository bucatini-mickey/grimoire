/**
 * goon-juggler.test.ts - two rulings the audit (docs/RULES_AUDIT.md) found the engine breaking:
 *   A4  a Drunk who believes they are the Juggler wakes the night after, like a real Juggler (staying asleep gives them away);
 *   A5  the Goon catches the first player each night to choose them, also through an information step
 *       (Fortune Teller, Chambermaid, Dreamer, Seamstress, Ravenkeeper).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterGoon, customScriptId, infoCandidates, isDrunk, judgeInfo, nextStep, nightSteps, tellChoices } from '../src/core/index.ts';
import type { Command, GameState, Info, SeatId } from '../src/core/index.ts';
import { autoNight, gameOn, ok, refused } from './helpers.ts';

const dawn = (s: GameState) => ok(s, { type: 'end-night' });
const dusk = (s: GameState) => ok(s, { type: 'end-day', executionSurvives: false });
const ALL = ['imp', 'poisoner', 'goon', 'fortune-teller', 'chambermaid', 'dreamer', 'seamstress', 'ravenkeeper', 'butler', 'monk', 'empath', 'chef', 'juggler', 'drunk', 'washerwoman'];
const SCRIPT = customScriptId(ALL);
const goonDrunks = (s: GameState) => s.effects.filter((e) => e.kind === 'drunk' && e.role === 'goon');

// ---- A4: the Drunk who thinks they are the Juggler ------------------------------------------------------------

test('A4 DRUNK-JUGGLER: a Drunk who thinks they are the Juggler wakes the night after, as a real one does, and may be told anything', () => {
	// 0 imp, 1 poisoner, 2 drunk (thinks juggler), 3 washerwoman, 4 chef, 5 empath, 6 monk
	const chars = ['imp', 'poisoner', 'drunk', 'washerwoman', 'chef', 'empath', 'monk'];
	let s = dawn(autoNight(gameOn(SCRIPT, chars, { drunkBelieves: 'juggler' })));
	assert.equal(s.seats[2].believes, 'juggler');
	const guesses = [{ player: 0, character: 'imp' }, { player: 4, character: 'chef' }];
	s = ok(s, { type: 'juggle', by: 2, guesses });
	assert.equal(s.effects.filter((e) => e.kind === 'juggled' && e.by === 2).length, 2, 'the guesses are kept');
	s = autoNight(dusk(s), {}, 'juggler');
	assert.deepEqual(nightSteps(s).filter((x) => x.kind === 'juggler').map((x) => x.seat), [2]);
	assert.equal(nextStep(s)?.id, 'juggler:2');
	// The Drunk may be told anything, with no insistence, and the Storyteller is offered false answers.
	const wrong: Info = { kind: 'number', value: 5 };
	assert.ok(isDrunk(s, 2));
	assert.ok(infoCandidates(s, 'juggler', 2).some((c) => !c.truthful), 'false answers are offered for the Drunk');
	s = ok(s, { type: 'tell', info: wrong });
	// Each is asked once only.
	s = dusk(dawn(autoNight(s)));
	assert.ok(!nightSteps(s).some((x) => x.kind === 'juggler'), 'only the night after');
});

test('A4 DRUNK-JUGGLER: a Drunk who juggles on a later day wakes the night after that, not before', () => {
	const chars = ['imp', 'poisoner', 'drunk', 'chef', 'empath', 'monk', 'washerwoman'];
	let s = dusk(dawn(autoNight(gameOn(SCRIPT, chars, { drunkBelieves: 'juggler' }))));
	s = autoNight(s);
	assert.ok(!nightSteps(s).some((x) => x.kind === 'juggler'), 'no guesses yet: nothing to answer');
	s = ok(dawn(s), { type: 'juggle', by: 2, guesses: [{ player: 5, character: 'empath' }] });
	s = autoNight(dusk(s), {}, 'juggler');
	assert.equal(nextStep(s)?.id, 'juggler:2');
});

// ---- A5: the Goon and the information roles ---------------------------------------------------------------------

/**
 * Night 2 of: 0 imp, 1 poisoner, 2 goon, 3 the role under test, 4 butler, 5 empath, 6 monk. The Poisoner chose the
 * Goon on night 1, so the Goon is evil (and the Poisoner was drunk, which wore off at dusk).
 */
function nightTwo(role: string): GameState {
	const chars = ['imp', 'poisoner', 'goon', role, 'butler', 'empath', 'monk'];
	const s = autoNight(gameOn(SCRIPT, chars, { redHerring: 6 }), { poisoner: { type: 'choose', target: 2 }, seamstress: { type: 'skip', reason: 'keeps the ability for night two' } });
	assert.equal(s.seats[2].alignment, 'evil', 'caught by the Poisoner on night one: the Goon turned evil');
	return dusk(dawn(s));
}
/** Up to this role's step, the Poisoner and Imp choosing quietly (the Monk is killed, so no one the tests look at is touched). */
const upTo = (s: GameState, role: string, by: Record<string, Command> = {}) => autoNight(s, { poisoner: { type: 'choose', target: 4 }, imp: { type: 'choose', target: 6, mayorRedirect: null }, ...by }, role);

interface Spec {
	/** Whom the role chooses (the Goon among them). */
	picks: SeatId[];
	/** A false answer for those picks, as the game stands. */
	info: (s: GameState) => Info;
	/** The same shape of answer about two players who are not the Goon, and false. */
	elsewhere: (s: GameState) => Info;
}
const ROLES: Record<string, Spec> = {
	'fortune-teller': { picks: [2, 5], info: () => ({ kind: 'fortune', players: [2, 5], yes: true }), elsewhere: () => ({ kind: 'fortune', players: [4, 5], yes: true }) },
	chambermaid: {
		picks: [2, 5],
		info: (s) => [0, 1, 2].map((value): Info => ({ kind: 'woke', players: [2, 5], value })).find((i) => !judgeInfo(s, 3, 'chambermaid', i).truthful)!,
		elsewhere: (s) => [0, 1, 2].map((value): Info => ({ kind: 'woke', players: [4, 5], value })).find((i) => !judgeInfo(s, 3, 'chambermaid', i).truthful)!
	},
	dreamer: { picks: [2], info: () => ({ kind: 'dream', player: 2, characters: ['empath', 'imp'] }), elsewhere: () => ({ kind: 'dream', player: 4, characters: ['empath', 'imp'] }) },
	seamstress: {
		picks: [2, 5],
		info: (s) => [true, false].map((yes): Info => ({ kind: 'same', players: [2, 5], yes })).find((i) => !judgeInfo(s, 3, 'seamstress', i).truthful)!,
		elsewhere: (s) => [true, false].map((yes): Info => ({ kind: 'same', players: [4, 5], yes })).find((i) => !judgeInfo(s, 3, 'seamstress', i).truthful)!
	}
};

for (const [role, spec] of Object.entries(ROLES)) {
	test(`A5 GOON-${role.toUpperCase()}: choosing the Goon first tonight makes them drunk until dusk, and the Goon takes their alignment`, () => {
		const s = upTo(nightTwo(role), role);
		assert.equal(nextStep(s)?.id, `${role}:3`);
		assert.equal(isDrunk(s, 3), false);
		const answer = spec.info(s);
		assert.deepEqual(tellChoices(role, answer), spec.picks, 'the picks are read from the answer');
		// Without the Goon among those chosen, a false answer to a sober player is refused.
		refused(s, { type: 'tell', info: spec.elsewhere(s) }, /false/);
		// The Storyteller sees it coming: the picks alone make them drunk, and false answers are offered.
		const preview = afterGoon(s, role, 3, spec.picks);
		assert.ok(isDrunk(preview, 3), 'the preview shows them drunk');
		assert.equal(preview.seats[2].alignment, 'good');
		assert.equal(s.seats[2].alignment, 'evil', 'and the real game is untouched');
		assert.ok(infoCandidates(s, role, 3, spec.picks).some((c) => !c.truthful), 'false answers are offered');
		// Choosing the Goon: no insistence needed.
		const t = ok(s, { type: 'tell', info: answer });
		assert.ok(isDrunk(t, 3), 'drunk until dusk');
		assert.equal(goonDrunks(t).length, 1);
		assert.equal(goonDrunks(t)[0].target, 3);
		assert.equal(t.seats[2].alignment, 'good', 'the Goon takes the chooser’s alignment (the chooser is good)');
		assert.equal(t.seats[3].alignment, 'good');
		// It wears off at dusk.
		const end = dusk(dawn(autoNight(t)));
		assert.equal(isDrunk(end, 3), false);
		assert.equal(goonDrunks(end).length, 0);
	});
}

test('A5 GOON-SEAMSTRESS: the answer is judged once the Goon has turned', () => {
	// The Goon is evil and the Empath good, so "different teams" was true; the moment the Goon is chosen they turn good.
	const s = upTo(nightTwo('seamstress'), 'seamstress');
	// "Different teams" is true as things stand (the Goon evil, the Empath good).
	const answer: Info = { kind: 'same', players: [2, 5], yes: [true, false].find((yes) => judgeInfo(s, 3, 'seamstress', { kind: 'same', players: [2, 5], yes }).truthful)! };
	const t = ok(s, { type: 'tell', info: answer });
	assert.equal(t.seats[2].alignment, 'good');
	assert.equal(judgeInfo(t, 3, 'seamstress', answer).truthful, false, 'now false: both are good');
});

test('A5 GOON-FIRST: only the first to choose the Goon each night is caught, whichever step it is', () => {
	for (const [role, spec] of Object.entries(ROLES)) {
		// The Monk chose the Goon first (a choosing step): the information role choosing them after is not caught.
		let s = upTo(nightTwo(role), role, { monk: { type: 'choose', target: 2 } });
		assert.equal(isDrunk(s, 6), true, 'the Monk was first');
		assert.equal(s.seats[2].alignment, 'good', 'the Goon took the Monk’s alignment');
		refused(s, { type: 'tell', info: spec.info(s) }, /false/);
		const truth = infoCandidates(s, role, 3, spec.picks).find((c) => c.truthful)!;
		s = ok(s, { type: 'tell', info: truth.info });
		assert.equal(isDrunk(s, 3), false, `${role} was not caught`);
		assert.equal(goonDrunks(s).length, 1);
		assert.equal(goonDrunks(s)[0].target, 6);
	}
});

test('A5 GOON-ONCE: caught through an information step, the Goon does not catch a later chooser the same night', () => {
	for (const role of ['fortune-teller', 'dreamer']) {
		let s = upTo(nightTwo(role), role);
		s = ok(s, { type: 'tell', info: ROLES[role].info(s) });
		assert.equal(goonDrunks(s).length, 1);
		// The Butler (after them in the night) chooses the Goon too: no one else is caught, and the Goon stays as they are.
		const before = s.seats[2].alignment;
		s = autoNight(s, { butler: { type: 'choose', target: 2 } });
		assert.deepEqual(goonDrunks(s).map((e) => e.target), [3]);
		assert.equal(isDrunk(s, 4), false, 'the Butler is not drunk');
		assert.equal(s.seats[2].alignment, before);
	}
});

test('A5 GOON-RAVENKEEPER: a Ravenkeeper killed in the night who chooses the Goon is caught like any other', () => {
	let s = upTo(nightTwo('ravenkeeper'), 'ravenkeeper', { imp: { type: 'choose', target: 3, mayorRedirect: null } });
	assert.equal(nextStep(s)?.id, 'ravenkeeper:3');
	assert.equal(s.seats[3].alive, false);
	// A false answer about someone who is not the Goon is refused; about the Goon it is not.
	refused(s, { type: 'tell', info: { kind: 'reveal', player: 4, character: 'chef' } }, /cannot register/);
	s = ok(s, { type: 'tell', info: { kind: 'reveal', player: 2, character: 'chef' } });
	assert.equal(isDrunk(s, 3), true);
	assert.equal(s.seats[2].alignment, 'good');
	assert.deepEqual(goonDrunks(s).map((e) => e.target), [3]);
});

test('A5 GOON-NO-CHOICE: information that is not a choice (the Washerwoman showing the Goon) catches no one', () => {
	const chars = ['imp', 'poisoner', 'goon', 'washerwoman', 'butler', 'empath', 'monk'];
	const s = autoNight(gameOn(SCRIPT, chars), { washerwoman: { type: 'tell', info: { kind: 'pair', players: [2, 5], character: 'empath' } } });
	assert.equal(goonDrunks(s).length, 0);
});
