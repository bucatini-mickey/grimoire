/**
 * audit-high.test.ts - the rules audit's A6, A7 and A2 (docs/RULES_AUDIT.md):
 * a madness execution at night, the Bone Collector restoring spent
 * once-per-game abilities, and the Exorcist choosing a Pukka or Shabaloth.
 * Each also has a saved game in tests/regressions (audit-*.json).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perform, nightSteps, nextStep, isPoisoned, customScriptId } from '../src/core/index.ts';
import type { GameState, SeatId } from '../src/core/index.ts';
import { announce } from '../src/net/announce.ts';
import { gameOn, autoNight, ok, refused } from './helpers.ts';

const BMR = 'bad-moon-rising';
const SNV = 'sects-and-violets';
const dawn = (s: GameState) => ok(s, { type: 'end-night' });
const dusk = (s: GameState) => ok(s, { type: 'end-day', executionSurvives: false });
const alive = (s: GameState, id: SeatId) => s.seats[id].alive;
/** Nominate and execute `nominee` today. */
const executeToday = (s: GameState, nominee: SeatId, nominator: SeatId) => {
	let t = s.day!.stage === 'nominations' ? s : ok(s, { type: 'open-nominations' });
	t = ok(t, { type: 'nominate', nominator, nominee });
	return ok(t, { type: 'vote', voters: t.seats.filter((x) => x.alive).map((x) => x.id) });
};

// ---- A6: madness at night ---------------------------------------------------------------------

// 0 fang-gu, 1 cerenovus, 2 dreamer, 3 mutant, 4 oracle, 5 sage, 6 clockmaker
const MAD = ['fang-gu', 'cerenovus', 'dreamer', 'mutant', 'oracle', 'sage', 'clockmaker'];
const CEREN = { cerenovus: { type: 'choose', target: 4, character: 'sage' } } as const;

test('A6: a madness execution may happen at night, and is the execution of the day just ended', () => {
	let s = autoNight(gameOn(SNV, MAD), CEREN);
	refused(s, { type: 'madness', seat: 3 }, /No day has passed/);
	// Day 1: no one is executed. Night 2: the Storyteller executes the Mutant for breaking madness.
	s = dusk(ok(dawn(s), { type: 'open-nominations' }));
	assert.equal(s.phase.kind, 'night');
	assert.equal(s.night!.dayExecuted, null);
	const r = perform(s, { type: 'madness', seat: 3 });
	assert.ok(r.ok, 'allowed at night');
	if (!r.ok) return;
	assert.equal(alive(r.state, 3), false);
	assert.deepEqual(r.state.lastExecution, { day: 1, seat: 3 }, 'counts as day 1’s execution (the Undertaker would learn it tonight)');
	assert.equal(r.state.night!.dayExecuted, 3);
	// One execution a day: no second one, by day 1 or its night.
	refused(r.state, { type: 'madness', seat: 4 }, /already executed on the day/);
	// The room is told nothing until dawn, where it is a death in the night.
	assert.equal(announce(s, r.events, r.state), null, 'nothing announced at night');
	const morning = perform(autoNight(r.state), { type: 'end-night' });
	assert.ok(morning.ok);
	if (!morning.ok) return;
	const said = announce(autoNight(r.state), morning.events, morning.state)!;
	assert.ok(said[0].lines.includes('Dorn died in the night.'), 'told at dawn');
	// Day 2 has its own execution.
	assert.equal(morning.state.day!.executed, null);
	ok(executeToday(ok(morning.state, { type: 'open-nominations' }), 4, 2), { type: 'end-day' });
});

test('A6: not at night after the day already had its execution; by day the old guards stay', () => {
	let s = dawn(autoNight(gameOn(SNV, MAD), CEREN));
	s = executeToday(s, 6, 2);
	// Day 1 had an execution, however it ended: its night cannot have another.
	const night = dusk(s);
	assert.equal(night.night!.dayExecuted, 6);
	refused(night, { type: 'madness', seat: 3 }, /already executed on the day/);
	// By day: still one execution, no open nomination, only the living.
	let d = dawn(autoNight(gameOn(SNV, MAD), CEREN));
	d = ok(ok(d, { type: 'open-nominations' }), { type: 'nominate', nominator: 2, nominee: 4 });
	refused(d, { type: 'madness', seat: 3 }, /Count the votes/);
	d = ok(ok(d, { type: 'vote', voters: [] }), { type: 'madness', seat: 3 });
	refused(d, { type: 'madness', seat: 5 }, /already been executed/);
	// Not on night 1, when no day has passed.
	refused(gameOn(SNV, MAD), { type: 'madness', seat: 3 }, /No day has passed/);
});

test('A6: a madness execution at night is an execution like any other (the Demon’s death ends the game)', () => {
	// 0 fang-gu, 1 cerenovus, 2 dreamer, 3 mutant, 4 oracle, 5 sage, 6 clockmaker
	const s = dusk(ok(dawn(autoNight(gameOn(SNV, MAD), CEREN)), { type: 'open-nominations' }));
	// If the Storyteller executes the Demon for madness at night, the game ends as it does by day.
	const won = ok(s, { type: 'madness', seat: 0 });
	assert.equal(won.phase.kind, 'over');
});

// ---- A7: the Bone Collector restores used abilities -------------------------------------------------

test('A7: a Bone Collector’s dead target regains a once-per-game ability they had used', () => {
	// 0 fang-gu, 1 seamstress, 2 dreamer, 3 witch, 4 oracle, 5 sage, 6 clockmaker
	const chars = ['fang-gu', 'seamstress', 'dreamer', 'witch', 'oracle', 'sage', 'clockmaker'];
	// Night 1: the Seamstress uses her one chance. Day 1: she is executed, and a good Bone Collector joins.
	let s = autoNight(gameOn(SNV, chars), { seamstress: { type: 'tell', info: { kind: 'same', players: [0, 3], yes: true } } });
	assert.ok(s.spent.includes('1:seamstress'), 'the Seamstress has used it');
	s = ok(executeToday(dawn(s), 1, 4), { type: 'traveller-joins', name: 'Tess', character: 'bone-collector', alignment: 'good', after: 0 });
	s = ok(s, { type: 'end-day', executionSurvives: false });
	assert.equal(alive(s, 1), false, 'the Seamstress is executed');
	// Night 2: the Bone Collector chooses her, and what she used is unused again.
	s = autoNight(s, {}, 'bone-collector');
	assert.equal(nextStep(s)?.kind, 'bone-collector');
	const t = ok(s, { type: 'choose', target: 1 });
	assert.ok(!t.spent.includes('1:seamstress'), 'no longer spent');
	assert.ok(t.spent.includes('7:bone-collector'), 'the Bone Collector’s own use is spent');
	// She wakes again tonight, as her place in the night is still to come.
	assert.ok(nightSteps(t).some((x) => x.id === 'seamstress:1' && !x.done), 'the dead Seamstress wakes again');
	// A poisoned Bone Collector restores nothing.
	const poisoned = ok(s, [{ type: 'set-poison', target: 7 }, { type: 'choose', target: 1 }]);
	assert.ok(poisoned.spent.includes('1:seamstress'), 'still spent');
	assert.ok(!nightSteps(poisoned).some((x) => x.id === 'seamstress:1'));
});

// ---- A2: the Exorcist chooses a Pukka or a Shabaloth ---------------------------------------------------

// 0 pukka, 1 godfather, 2 chambermaid, 3 gambler, 4 grandmother, 5 tinker, 6 sailor, 7 fool, 8 exorcist
const PUKKA = ['pukka', 'godfather', 'chambermaid', 'gambler', 'grandmother', 'tinker', 'sailor', 'fool', 'exorcist'];
const SAIL = { sailor: { type: 'choose', target: 6, drunk: 6 } } as const;

/** Night 2: the Exorcist chooses the Demon; stops where the Demon is told who the Exorcist is. */
function exorcisedNight2(chars: string[], night1: Parameters<typeof autoNight>[1], demonId: SeatId = 0) {
	let s = dusk(dawn(autoNight(gameOn(BMR, chars), night1)));
	s = autoNight(s, { ...SAIL, exorcist: { type: 'choose', target: demonId } }, 'exorcised');
	assert.equal(nextStep(s)?.id, `exorcised:${demonId}`);
	return s;
}

test('A2: an exorcised Pukka does not wake; the Storyteller rules whether its earlier victim still dies', () => {
	const s = exorcisedNight2(PUKKA, { pukka: { type: 'choose', target: 2 }, ...SAIL });
	assert.ok(isPoisoned(s, 2));
	// The engine does not guess: the acknowledgement is refused until the Storyteller rules.
	const q = perform(s, { type: 'acknowledge', mayorRedirect: null });
	assert.ok(!q.ok);
	assert.equal(!q.ok && q.decision, 'exorcised');
	assert.match(!q.ok ? q.error : '', /Cael/);

	// Idle: the Pukka does not wake, the victim stays poisoned and lives; the Pukka does not choose.
	const idle = autoNight(ok(s, { type: 'acknowledge', exorcised: 'idle' }), SAIL);
	assert.equal(alive(idle, 2), true);
	assert.ok(isPoisoned(idle, 2));
	assert.ok(!idle.night!.done.includes('pukka:0'), 'the Pukka did not wake');
	// ...and it dies on the Pukka's next turn, as normal.
	const night3 = autoNight(dusk(dawn(idle)), { ...SAIL, pukka: { type: 'choose', target: 3 } });
	assert.equal(alive(night3, 2), false);

	// Acts: the earlier victim dies tonight, even though the Pukka did not wake; no new poison.
	const acts = autoNight(ok(s, { type: 'acknowledge', exorcised: 'acts' }), SAIL);
	assert.equal(alive(acts, 2), false);
	assert.ok(!isPoisoned(acts, 2));
	assert.ok(!acts.night!.done.includes('pukka:0'), 'the Pukka did not wake');
	assert.equal(acts.effects.filter((e) => e.kind === 'poisoned' && e.role === 'pukka').length, 0, 'nothing new is poisoned');
});

test('A2: an exorcised Pukka with no earlier victim, or a drunk one, raises no question', () => {
	// Night 1 the Pukka poisons no one useful: a Pukka that has never chosen has no victim.
	let s = dusk(dawn(autoNight(gameOn(BMR, PUKKA), { pukka: { type: 'choose', target: 2 }, ...SAIL })));
	s = ok(s, { type: 'set-poison', target: 0 });
	s = autoNight(s, { ...SAIL, exorcist: { type: 'choose', target: 0 } }, 'exorcised');
	ok(s, { type: 'acknowledge' });
});

// 0 shabaloth, 1 godfather, 2 chambermaid, 3 gambler, 4 grandmother, 5 tinker, 6 sailor, 7 fool, 8 exorcist
const SHAB = ['shabaloth', 'godfather', 'chambermaid', 'gambler', 'grandmother', 'tinker', 'sailor', 'fool', 'exorcist'];

/** The Shabaloth killed 2 and 3 on night 2; night 3 the Exorcist chooses it. */
function exorcisedShabaloth() {
	let s = dusk(dawn(autoNight(gameOn(BMR, SHAB), SAIL)));
	s = dusk(dawn(autoNight(s, { ...SAIL, shabaloth: { type: 'choose', targets: [2, 3], regurgitate: null } })));
	assert.ok(!alive(s, 2) && !alive(s, 3));
	s = autoNight(s, { ...SAIL, exorcist: { type: 'choose', target: 0 } }, 'exorcised');
	assert.equal(nextStep(s)?.id, 'exorcised:0');
	return s;
}

test('A2: an exorcised Shabaloth: the Storyteller rules whether a player it chose last night may still come back', () => {
	const s = exorcisedShabaloth();
	const q = perform(s, { type: 'acknowledge', mayorRedirect: null });
	assert.equal(!q.ok && q.decision, 'exorcised');

	// Idle: no one comes back, and nothing it chose last night is remembered for tomorrow.
	const idle = ok(s, { type: 'acknowledge', exorcised: 'idle' });
	assert.ok(!alive(idle, 2) && !alive(idle, 3));
	assert.ok(!idle.effects.some((e) => e.kind === 'chose-last' && e.role === 'shabaloth'));

	// Acts: then the Storyteller also says who (the existing regurgitation question), or no one.
	const acts = perform(s, { type: 'acknowledge', exorcised: 'acts' });
	assert.equal(!acts.ok && acts.decision, 'regurgitate');
	refused(s, { type: 'acknowledge', exorcised: 'acts', regurgitate: 4 }, /Only a dead player the Shabaloth chose last night/);
	const back = ok(s, { type: 'acknowledge', exorcised: 'acts', regurgitate: 2 });
	assert.equal(alive(back, 2), true, 'the Chambermaid is regurgitated');
	assert.equal(alive(back, 3), false);
	assert.ok(!back.night!.done.includes('shabaloth:0'), 'the Shabaloth did not wake');
	const nobody = ok(s, { type: 'acknowledge', exorcised: 'acts', regurgitate: null });
	assert.ok(!alive(nobody, 2));
});

test('A2: an exorcised Zombuul or Imp raises no question (nothing of theirs happens without choosing)', () => {
	const chars = ['zombuul', 'assassin', 'exorcist', 'chambermaid', 'grandmother', 'tinker', 'sailor'];
	let s = dusk(dawn(autoNight(gameOn(BMR, chars))));
	s = autoNight(s, { exorcist: { type: 'choose', target: 0 } }, 'exorcised');
	ok(s, { type: 'acknowledge' });
});

test('A6: the Innkeeper’s guests do not die to a madness execution at night (they cannot die tonight)', () => {
	// 0 fang-gu, 1 innkeeper, 2 mutant, 3 witch, 4 sage, 5 dreamer, 6 clockmaker
	const chars = ['fang-gu', 'innkeeper', 'mutant', 'witch', 'sage', 'dreamer', 'clockmaker'];
	const s = dusk(ok(dawn(autoNight(gameOn(customScriptId(chars), chars))), { type: 'open-nominations' }));
	let t = autoNight(s, { innkeeper: { type: 'choose', targets: [2, 4], drunk: 4 } }, 'witch');
	t = ok(t, { type: 'madness', seat: 2 });
	assert.equal(alive(t, 2), true, 'kept safe by the Innkeeper');
	assert.equal(t.night!.dayExecuted, 2, 'but it was the day’s execution');
	refused(t, { type: 'madness', seat: 3 }, /already executed on the day/);
});

test('A6: the Undertaker is woken straight away by a madness execution after their place has passed; a working Mayor is not executed at night', () => {
	// 0 fang-gu, 1 undertaker, 2 mutant, 3 mayor, 4 sage, 5 dreamer, 6 cerenovus
	const chars = ['fang-gu', 'undertaker', 'mutant', 'mayor', 'sage', 'dreamer', 'cerenovus'];
	const script = customScriptId(chars);
	let s = autoNight(gameOn(script, chars), { cerenovus: { type: 'choose', target: 4, character: 'sage' } });
	s = dusk(ok(dawn(s), { type: 'open-nominations' }));
	s = autoNight(s, { cerenovus: { type: 'choose', target: 4, character: 'sage' }, 'fang-gu': { type: 'choose', target: 5 } });
	assert.equal(nextStep(s), null, 'everyone has woken');
	refused(s, { type: 'madness', seat: 3 }, /Mayor/);
	s = ok(s, { type: 'madness', seat: 2 });
	assert.equal(nextStep(s)?.id, 'undertaker:1', 'the Undertaker wakes now to learn the execution');
	refused(s, { type: 'tell', info: { kind: 'character', character: 'sage' } }, /false/);
	s = ok(s, { type: 'tell', info: { kind: 'character', character: 'mutant' } });
	assert.equal(nextStep(s), null);
});

// ---- A6 with the Mastermind and the Minstrel ----------------------------------------------------------

test('A6: executing the Demon for madness at night with the Mastermind alive gives the day about to dawn as the extra day', () => {
	// 0 no-dashii, 1 cerenovus, 2 mutant, 3 mastermind, 4 sage, 5 dreamer, 6 clockmaker
	const chars = ['no-dashii', 'cerenovus', 'mutant', 'mastermind', 'sage', 'dreamer', 'clockmaker'];
	const script = customScriptId(chars);
	let s = autoNight(gameOn(script, chars), { cerenovus: { type: 'choose', target: 4, character: 'sage' } });
	s = dusk(ok(dawn(s), { type: 'open-nominations' }));
	s = ok(s, { type: 'madness', seat: 0 });
	assert.equal(s.phase.kind, 'night', 'the game goes on');
	assert.deepEqual(s.mastermind, { day: 2 }, 'one more day: the day after the day just ended');
	s = dawn(autoNight(s));
	// An execution that day ends the game against the team executed.
	const won = ok(ok(s, { type: 'open-nominations' }), [{ type: 'madness', seat: 5 }]);
	assert.equal(won.phase.kind === 'over' && won.phase.winner, 'evil', 'a good player was executed on the Mastermind\u2019s day');
});

test('A6: a Minion executed for madness at night makes the Minstrel\u2019s drunkenness last until the dusk after the next day', () => {
	// 0 fang-gu, 1 minstrel, 2 mutant, 3 witch, 4 sage, 5 dreamer, 6 clockmaker
	const chars = ['fang-gu', 'minstrel', 'mutant', 'witch', 'sage', 'dreamer', 'clockmaker'];
	const script = customScriptId(chars);
	let s = dusk(ok(dawn(autoNight(gameOn(script, chars))), { type: 'open-nominations' }));
	s = ok(s, { type: 'madness', seat: 3 });
	const drunk = s.effects.filter((e) => e.kind === 'drunk' && e.role === 'minstrel');
	assert.ok(drunk.length >= 4, 'everyone else is drunk');
	// Executed by day 1 (a night-2 execution is day 1's), they are drunk through day 2, as a daytime execution on day 1 would do.
	assert.ok(drunk.every((e) => typeof e.until === 'object' && e.until.dusk === 3));
});
