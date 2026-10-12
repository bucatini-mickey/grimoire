/**
 * snv.test.ts - Sects & Violets, character by character, from the official
 * rulings and examples (docs/rules/INTERACTIONS.md, "Sects & Violets").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perform, nextStep, nightSteps, isDrunk, isPoisoned, abilityWorks } from '../src/core/index.ts';
import type { Command, GameState, SeatId } from '../src/core/index.ts';
import { gameOn, autoNight, ok, refused } from './helpers.ts';

const SNV = 'sects-and-violets';
const dawn = (s: GameState) => ok(s, { type: 'end-night' });
const dusk = (s: GameState) => ok(s, { type: 'end-day', executionSurvives: false });
const alive = (s: GameState, id: SeatId) => s.seats[id].alive;
const night2 = (chars: string[], n1: Parameters<typeof autoNight>[1] = {}, opts: Parameters<typeof gameOn>[2] = {}) =>
	ok(dawn(autoNight(gameOn(SNV, chars, opts), n1)), [{ type: 'open-nominations' }, { type: 'nominate', nominator: chars.length - 1, nominee: chars.length - 2 }, { type: 'vote', voters: [] }, { type: 'end-day' }]);
/** Execute a player today: open nominations, nominate, everyone votes, dusk. */
function execute(s: GameState, nominee: SeatId, nominator: SeatId): GameState {
	let t = s.day!.stage === 'nominations' ? s : ok(s, { type: 'open-nominations' });
	t = ok(t, { type: 'nominate', nominator, nominee });
	t = ok(t, { type: 'vote', voters: t.seats.filter((x) => x.alive).map((x) => x.id) });
	return ok(t, { type: 'end-day' });
}
/** The Evil Twin's twin, and the Cerenovus's and Pit-Hag's choices, so default nights stay quiet. */
const QUIET = {
	cerenovus: { type: 'choose', target: 1, character: 'dreamer' },
	'pit-hag': { type: 'choose', target: 1, character: 'savant' }
} as const;

// 0 fang-gu, 1 dreamer, 2 clockmaker, 3 witch, 4 oracle, 5 sage, 6 mutant
const CLOCK = ['fang-gu', 'dreamer', 'clockmaker', 'witch', 'oracle', 'sage', 'mutant'];

test('SNV-CLOCKMAKER: steps from the Demon to its nearest Minion, the shorter way round', () => {
	const s = autoNight(gameOn(SNV, CLOCK), { dreamer: { type: 'tell', info: { kind: 'dream', player: 3, characters: ['witch', 'oracle'] } } }, 'clockmaker');
	refused(s, { type: 'tell', info: { kind: 'number', value: 4 } }, /false/);
	ok(s, { type: 'tell', info: { kind: 'number', value: 3 } });
});

test('SNV-DREAMER: one good and one evil character, one of them right', () => {
	const s = autoNight(gameOn(SNV, CLOCK), {}, 'dreamer');
	ok(s, { type: 'tell', info: { kind: 'dream', player: 3, characters: ['witch', 'oracle'] } });
	refused(s, { type: 'tell', info: { kind: 'dream', player: 3, characters: ['witch', 'cerenovus'] } }, /one good/);
	refused(s, { type: 'tell', info: { kind: 'dream', player: 3, characters: ['oracle', 'fang-gu'] } }, /false/);
	refused(s, { type: 'tell', info: { kind: 'dream', player: 1, characters: ['dreamer', 'witch'] } }, /another/);
});

test('SNV-SNAKE-CHARMER: choosing the Demon swaps characters and alignments; the old Demon is poisoned', () => {
	// 0 vortox, 1 snake charmer, 2 dreamer, 3 witch, 4 oracle, 5 sage, 6 mutant
	const chars = ['vortox', 'snake-charmer', 'dreamer', 'witch', 'oracle', 'sage', 'mutant'];
	let s = autoNight(gameOn(SNV, chars), {}, 'snake-charmer');
	s = ok(s, { type: 'choose', target: 0 });
	assert.equal(s.seats[1].character, 'vortox');
	assert.equal(s.seats[1].alignment, 'evil');
	assert.equal(s.seats[0].character, 'snake-charmer');
	assert.equal(s.seats[0].alignment, 'good');
	assert.ok(isPoisoned(s, 0), 'the old Demon is poisoned for good');
	assert.ok(nightSteps(s).some((x) => x.id === 'new-demon:1'), 'the new Demon is told');
	assert.equal(s.phase.kind, 'night', 'the game goes on');
});

test('SNV-WITCH: the cursed player dies if they nominate; the nomination stands', () => {
	let s = autoNight(gameOn(SNV, CLOCK), { witch: { type: 'choose', target: 4 } });
	s = ok(dawn(s), { type: 'open-nominations' });
	s = ok(s, { type: 'nominate', nominator: 4, nominee: 6 });
	assert.equal(alive(s, 4), false);
	assert.equal(s.day!.nominations.length, 1, 'the nomination stands');
	const other = ok(ok(dawn(autoNight(gameOn(SNV, CLOCK), { witch: { type: 'choose', target: 4 } })), { type: 'open-nominations' }), { type: 'nominate', nominator: 5, nominee: 6 });
	assert.equal(alive(other, 5), true, 'only the cursed player');
});

test('SNV-FLOWERGIRL / TOWN-CRIER: did a Demon vote, did a Minion nominate, today', () => {
	// 0 no-dashii, 1 flowergirl, 2 town crier, 3 witch, 4 mutant, 5 oracle, 6 sage
	const chars = ['no-dashii', 'mutant', 'flowergirl', 'witch', 'town-crier', 'oracle', 'sage'];
	let s = ok(dawn(autoNight(gameOn(SNV, chars))), { type: 'open-nominations' });
	s = ok(s, { type: 'nominate', nominator: 3, nominee: 6 });
	s = ok(s, { type: 'vote', voters: [0, 3] });
	s = ok(s, { type: 'end-day' });
	const f = autoNight(s, { 'no-dashii': { type: 'choose', target: 6 } }, 'flowergirl');
	// The No Dashii poisons the Flowergirl? Its nearest Townsfolk are the Flowergirl (seat 2) and the Sage (6).
	assert.ok(isPoisoned(f, 2), 'the No Dashii poisons its nearest Townsfolk');
	const t = autoNight(f, { flowergirl: { type: 'tell', info: { kind: 'yesno', yes: false } } }, 'town-crier');
	refused(t, { type: 'tell', info: { kind: 'yesno', yes: false } }, /false/);
	ok(t, { type: 'tell', info: { kind: 'yesno', yes: true } });
});

test('SNV-ORACLE: how many dead players are evil', () => {
	let s = execute(dawn(autoNight(gameOn(SNV, CLOCK))), 3, 6);
	assert.equal(alive(s, 3), false);
	s = autoNight(s, { 'fang-gu': { type: 'choose', target: 5 } }, 'oracle');
	refused(s, { type: 'tell', info: { kind: 'number', value: 0 } }, /false/);
	ok(s, { type: 'tell', info: { kind: 'number', value: 1 } });
});

test('SNV-SAGE: killed by the Demon, learns two players, one of them the Demon', () => {
	const s = autoNight(night2(CLOCK), { 'fang-gu': { type: 'choose', target: 5 } }, 'sage');
	assert.equal(nextStep(s)?.id, 'sage:5');
	refused(s, { type: 'tell', info: { kind: 'players', players: [1, 2] } }, /Neither/);
	ok(s, { type: 'tell', info: { kind: 'players', players: [0, 2] } });
});

test('SNV-SEAMSTRESS: once per game, same team or not', () => {
	// 0 vigormortis, 1 seamstress, 2 dreamer, 3 witch, 4 oracle, 5 sage, 6 clockmaker
	const chars = ['vigormortis', 'seamstress', 'dreamer', 'witch', 'oracle', 'sage', 'clockmaker'];
	let s = autoNight(gameOn(SNV, chars), {}, 'seamstress');
	refused(s, { type: 'tell', info: { kind: 'same', players: [0, 3], yes: false } }, /false/);
	s = ok(s, { type: 'tell', info: { kind: 'same', players: [0, 3], yes: true } });
	s = ok(dawn(autoNight(s)), { type: 'end-day' });
	assert.ok(!nightSteps(s).some((x) => x.kind === 'seamstress'), 'once per game');
});

test('SNV-JUGGLER: guesses by day; that night, how many were right', () => {
	// 0 fang-gu, 1 juggler, 2 dreamer, 3 witch, 4 oracle, 5 sage, 6 mutant
	const chars = ['fang-gu', 'juggler', 'dreamer', 'witch', 'oracle', 'sage', 'mutant'];
	let s = dawn(autoNight(gameOn(SNV, chars)));
	s = ok(s, { type: 'juggle', by: 1, guesses: [{ player: 3, character: 'witch' }, { player: 4, character: 'sage' }] });
	refused(s, { type: 'juggle', by: 1, guesses: [{ player: 5, character: 'sage' }] }, /once/);
	s = autoNight(ok(s, { type: 'end-day' }), { 'fang-gu': { type: 'choose', target: 2 } }, 'juggler');
	refused(s, { type: 'tell', info: { kind: 'number', value: 2 } }, /false/);
	s = ok(s, { type: 'tell', info: { kind: 'number', value: 1 } });
	s = ok(dawn(autoNight(s)), { type: 'end-day' });
	assert.ok(!nightSteps(s).some((x) => x.kind === 'juggler'), 'only the night after');
});

test('SNV-PHILOSOPHER: gains a good character’s ability; its holder is drunk', () => {
	// 0 fang-gu, 1 philosopher, 2 dreamer, 3 witch, 4 oracle, 5 sage, 6 mutant
	const chars = ['fang-gu', 'philosopher', 'dreamer', 'witch', 'oracle', 'sage', 'mutant'];
	let s = autoNight(gameOn(SNV, chars), {}, 'philosopher');
	refused(s, { type: 'choose', character: 'witch' }, /good character/);
	s = ok(s, { type: 'choose', character: 'dreamer' });
	assert.equal(s.seats[1].character, 'dreamer');
	assert.ok(isDrunk(s, 2), 'the real Dreamer is drunk');
	assert.ok(nightSteps(s).some((x) => x.id === 'dreamer:1'), 'and wakes tonight as the Dreamer');
});

test('SNV-PIT-HAG: a character not in play; a new Demon makes tonight’s deaths the Storyteller’s', () => {
	// 0 no-dashii, 1 pit-hag, 2 dreamer, 3 clockmaker, 4 oracle, 5 sage, 6 mutant
	const chars = ['no-dashii', 'pit-hag', 'dreamer', 'clockmaker', 'oracle', 'sage', 'mutant'];
	const s = autoNight(night2(chars), {}, 'pit-hag');
	refused(s, { type: 'choose', target: 4, character: 'dreamer' }, /not in play/);
	const t = ok(s, { type: 'choose', target: 4, character: 'savant' });
	assert.equal(t.seats[4].character, 'savant');
	const d = ok(s, { type: 'choose', target: 4, character: 'vortox' });
	assert.equal(d.seats[4].character, 'vortox');
	assert.ok(d.night!.arbitrary);
	ok(d, { type: 'storyteller-kill', seat: 2 });
	refused(t, { type: 'storyteller-kill', seat: 2 }, /Pit-Hag made a Demon/);
});

test('SNV-FANG-GU: the first Outsider chosen becomes the Fang Gu; the old one dies instead', () => {
	let s = autoNight(night2(CLOCK), { 'fang-gu': { type: 'choose', target: 6 } });
	assert.equal(s.seats[6].character, 'fang-gu');
	assert.equal(s.seats[6].alignment, 'evil');
	assert.equal(alive(s, 0), false);
	assert.equal(alive(s, 6), true);
	assert.notEqual(s.phase.kind, 'over');
});

test('SNV-VIGORMORTIS: a Minion it kills keeps their ability; a Townsfolk neighbour is poisoned', () => {
	// 0 vigormortis, 1 dreamer, 2 witch, 3 oracle, 4 sage, 5 clockmaker, 6 seamstress
	const chars = ['vigormortis', 'dreamer', 'witch', 'oracle', 'sage', 'clockmaker', 'seamstress'];
	const s = autoNight(night2(chars), {}, 'vigormortis');
	const r = perform(s, { type: 'choose', target: 2 });
	assert.equal(!r.ok && r.decision, 'poisonNeighbour');
	const t = ok(s, { type: 'choose', target: 2, poisonNeighbour: 3 });
	assert.equal(alive(t, 2), false);
	assert.ok(abilityWorks(t, 2, 'witch'), 'the dead Witch keeps the ability');
	assert.ok(isPoisoned(t, 3) && !isPoisoned(t, 1));
});

test('SNV-VORTOX: Townsfolk must be told false things; a day with no execution, evil wins', () => {
	// 0 vortox, 1 dreamer, 2 clockmaker, 3 witch, 4 oracle, 5 sage, 6 mutant
	const chars = ['vortox', 'dreamer', 'clockmaker', 'witch', 'oracle', 'sage', 'mutant'];
	const dream: Command = { type: 'tell', info: { kind: 'dream', player: 3, characters: ['oracle', 'cerenovus'] } };
	const s = autoNight(gameOn(SNV, chars), {}, 'clockmaker');
	refused(s, { type: 'tell', info: { kind: 'number', value: 3 } }, /Vortox/);
	const t = autoNight(s, { clockmaker: { type: 'tell', info: { kind: 'number', value: 1 } } }, 'dreamer');
	refused(t, { type: 'tell', info: { kind: 'dream', player: 3, characters: ['witch', 'oracle'] } }, /Vortox/);
	const d = ok(dawn(autoNight(t, { dreamer: dream })), { type: 'end-day' });
	assert.equal(d.phase.kind, 'over');
	assert.equal(d.phase.kind === 'over' && d.phase.winner, 'evil');
});

test('SNV-EVIL-TWIN: the good twin executed, evil wins; good cannot win while both twins live', () => {
	// 0 no-dashii, 1 evil twin, 2 dreamer (the twin), 3 clockmaker, 4 oracle, 5 sage, 6 mutant
	const chars = ['no-dashii', 'evil-twin', 'dreamer', 'clockmaker', 'oracle', 'sage', 'mutant'];
	let s = dawn(autoNight(gameOn(SNV, chars, { evilTwin: 2 })));
	const lost = execute(s, 2, 3);
	assert.equal(lost.phase.kind === 'over' && lost.phase.winner, 'evil');
	s = execute(s, 0, 3);
	assert.notEqual(s.phase.kind, 'over', 'the Demon is dead but both twins live');
	s = execute(dawn(autoNight(s)), 1, 3);
	assert.equal(s.phase.kind === 'over' && s.phase.winner, 'good', 'the Evil Twin dies: good wins');
});

test('SNV-KLUTZ: a dead Klutz choosing an evil player loses the game for good', () => {
	// 0 fang-gu, 1 klutz, 2 dreamer, 3 witch, 4 oracle, 5 sage, 6 mutant
	const chars = ['fang-gu', 'klutz', 'dreamer', 'witch', 'oracle', 'sage', 'mutant'];
	const s = execute(dawn(autoNight(gameOn(SNV, chars))), 1, 2);
	assert.equal(alive(s, 1), false);
	const good = ok(s, { type: 'klutz', by: 1, target: 4 });
	assert.equal(good.phase.kind, 'night');
	refused(good, { type: 'klutz', by: 1, target: 3 }, /already/);
	const bad = ok(s, { type: 'klutz', by: 1, target: 3 });
	assert.equal(bad.phase.kind === 'over' && bad.phase.winner, 'evil');
});

test('SNV-SWEETHEART: on dying, one player is drunk for the rest of the game', () => {
	// 0 fang-gu, 1 sweetheart, 2 dreamer, 3 witch, 4 oracle, 5 sage, 6 clockmaker
	const chars = ['fang-gu', 'sweetheart', 'dreamer', 'witch', 'oracle', 'sage', 'clockmaker'];
	let s = execute(dawn(autoNight(gameOn(SNV, chars))), 1, 2);
	s = autoNight(s, { 'fang-gu': { type: 'choose', target: 5 } }, 'sweetheart');
	s = ok(s, { type: 'choose', target: 4 });
	assert.ok(isDrunk(s, 4));
	s = dawn(autoNight(s));
	assert.ok(isDrunk(ok(s, { type: 'end-day' }), 4), 'for good');
});

test('SNV-BARBER: the Barber died today: the Demon may swap two players’ characters', () => {
	// 0 no-dashii, 1 barber, 2 dreamer, 3 witch, 4 oracle, 5 sage, 6 clockmaker
	const chars = ['no-dashii', 'barber', 'dreamer', 'witch', 'oracle', 'sage', 'clockmaker'];
	let s = execute(dawn(autoNight(gameOn(SNV, chars))), 1, 2);
	s = autoNight(s, { 'no-dashii': { type: 'choose', target: 5 } }, 'barber');
	refused(s, { type: 'choose', targets: [0, 4] }, /Demon/);
	s = ok(s, { type: 'choose', targets: [3, 4] });
	assert.equal(s.seats[3].character, 'oracle');
	assert.equal(s.seats[3].alignment, 'evil', 'alignments stay');
	assert.equal(s.seats[4].character, 'witch');
	assert.equal(s.seats[4].alignment, 'good');
});

test('SNV-MUTANT / CERENOVUS: madness; the Storyteller may execute for it (the day’s execution)', () => {
	// 0 fang-gu, 1 cerenovus, 2 dreamer, 3 mutant, 4 oracle, 5 sage, 6 clockmaker
	const chars = ['fang-gu', 'cerenovus', 'dreamer', 'mutant', 'oracle', 'sage', 'clockmaker'];
	let s = dawn(autoNight(gameOn(SNV, chars), { cerenovus: { type: 'choose', target: 4, character: 'sage' } }));
	assert.ok(s.effects.some((e) => e.kind === 'mad' && e.target === 4 && e.note === 'sage'));
	refused(autoNight(gameOn(SNV, chars), {}, 'cerenovus'), { type: 'choose', target: 4, character: 'fang-gu' }, /good character/);
	s = ok(s, { type: 'madness', seat: 3 });
	assert.equal(alive(s, 3), false);
	refused(s, { type: 'madness', seat: 4 }, /already been executed/);
	refused(ok(s, { type: 'open-nominations' }), { type: 'nominate', nominator: 2, nominee: 4 }, /no more nominations/);
});

test('SNV-EVIL-TWIN-SETUP: the Storyteller names the good twin, a good player', () => {
	const chars = ['no-dashii', 'evil-twin', 'dreamer', 'clockmaker', 'oracle', 'sage', 'mutant'];
	assert.throws(() => gameOn(SNV, chars), /good player/);
	assert.throws(() => gameOn(SNV, chars, { evilTwin: 0 }), /good player/);
	const s = gameOn(SNV, chars, { evilTwin: 4 });
	assert.ok(s.effects.some((e) => e.kind === 'twin' && e.target === 4 && e.by === 1));
});

test('SNV-VIGORMORTIS-WITCH: a dead Witch kept by the Vigormortis still curses', () => {
	// 0 vigormortis, 1 dreamer, 2 witch, 3 oracle, 4 sage, 5 clockmaker, 6 seamstress
	const chars = ['vigormortis', 'dreamer', 'witch', 'oracle', 'sage', 'clockmaker', 'seamstress'];
	let s = autoNight(night2(chars), { vigormortis: { type: 'choose', target: 2, poisonNeighbour: 3 }, witch: { type: 'choose', target: 6 } });
	assert.equal(alive(s, 2), false);
	s = ok(dawn(s), [{ type: 'open-nominations' }, { type: 'nominate', nominator: 5, nominee: 1 }, { type: 'vote', voters: [] }, { type: 'end-day' }]);
	s = autoNight(s, { vigormortis: { type: 'choose', target: 4 }, witch: { type: 'choose', target: 6 } });
	assert.ok(nightSteps(s).some((x) => x.id === 'witch:2' && x.done), 'the dead Witch woke');
	s = ok(dawn(s), [{ type: 'open-nominations' }, { type: 'nominate', nominator: 6, nominee: 1 }]);
	assert.equal(alive(s, 6), false, 'the curse works');
});
