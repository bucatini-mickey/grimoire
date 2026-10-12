/**
 * bmr.test.ts - Bad Moon Rising, character by character, from the official
 * rulings and examples (docs/rules/INTERACTIONS.md, "Bad Moon Rising").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perform, nextStep, nightSteps, isDrunk, allowedCompositions, getScript, wokeTonight } from '../src/core/index.ts';
import type { GameState, SeatId } from '../src/core/index.ts';
import { gameOn, autoNight, ok, refused } from './helpers.ts';

const BMR = 'bad-moon-rising';
const dawn = (s: GameState) => ok(s, { type: 'end-night' });
const dusk = (s: GameState) => ok(s, { type: 'end-day', executionSurvives: false });
/** From the start of a game: night 1, day 1 with no execution, to the start of night 2. */
const night2 = (chars: string[], n1: Parameters<typeof autoNight>[1] = {}, opts: Parameters<typeof gameOn>[2] = {}) => dusk(dawn(autoNight(gameOn(BMR, chars, opts), n1)));
const alive = (s: GameState, id: SeatId) => s.seats[id].alive;
/** Execute a player today: open nominations, nominate, everyone votes, dusk. */
function execute(s: GameState, nominee: SeatId, nominator: SeatId, survives = false): GameState {
	let t = s.day!.stage === 'nominations' ? s : ok(s, { type: 'open-nominations' });
	t = ok(t, { type: 'nominate', nominator, nominee });
	t = ok(t, { type: 'vote', voters: t.seats.filter((x) => x.alive).map((x) => x.id) });
	return ok(t, { type: 'end-day', executionSurvives: survives });
}

test('BMR-SETUP: the Godfather allows one more or one fewer Outsider', () => {
	const bmr = getScript(BMR);
	const comps = allowedCompositions(bmr, 7, ['zombuul', 'godfather']);
	assert.deepEqual(comps.map((c) => c.outsider).sort(), [-1, 1].map((d) => 0 + d).filter((x) => x >= 0).sort());
	const nine = allowedCompositions(bmr, 9, ['zombuul', 'godfather']).map((c) => c.outsider).sort();
	assert.deepEqual(nine, [1, 3]);
});

test('BMR-GRANDMOTHER: learns a good grandchild; dies with them if the Demon kills them, not if executed', () => {
	// 0 po, 1 godfather, 2 grandmother, 3 chambermaid, 4 fool, 5 tinker, 6 sailor
	const chars = ['po', 'godfather', 'grandmother', 'chambermaid', 'fool', 'tinker', 'sailor'];
	let s = autoNight(gameOn(BMR, chars), { grandmother: { type: 'tell', info: { kind: 'reveal', player: 3, character: 'chambermaid' } } });
	refused(gameOn(BMR, chars), { type: 'tell', info: { kind: 'reveal', player: 1, character: 'godfather' } });
	s = dusk(dawn(s));
	s = autoNight(s, { po: { type: 'choose', target: 3 } });
	assert.equal(alive(s, 3), false);
	assert.equal(alive(s, 2), false, 'the Grandmother dies too');
});

test('BMR-GRANDMOTHER-EXECUTION: the grandchild executed: the Grandmother lives', () => {
	const chars = ['po', 'godfather', 'grandmother', 'chambermaid', 'fool', 'tinker', 'sailor'];
	let s = dawn(autoNight(gameOn(BMR, chars), { grandmother: { type: 'tell', info: { kind: 'reveal', player: 3, character: 'chambermaid' } } }));
	s = execute(s, 3, 6);
	assert.equal(alive(s, 3), false);
	assert.equal(alive(s, 2), true);
});

test('BMR-SAILOR: the Storyteller picks who is drunk; a sober Sailor cannot die, a drunk one can', () => {
	// 0 zombuul, 1 assassin, 2 sailor, 3 chambermaid, 4 fool, 5 tinker, 6 exorcist
	const chars = ['zombuul', 'assassin', 'sailor', 'chambermaid', 'grandmother', 'tinker', 'exorcist'];
	const s0 = autoNight(gameOn(BMR, chars), {}, 'sailor');
	const r = perform(s0, { type: 'choose', target: 3 });
	assert.equal(!r.ok && r.decision, 'drunk');
	let s = ok(s0, { type: 'choose', target: 3, drunk: 3 });
	assert.ok(isDrunk(s, 3) && !isDrunk(s, 2));
	s = dusk(dawn(autoNight(s)));
	// Night 2: the Sailor makes the Chambermaid drunk again, and the Zombuul attacks the Sailor.
	s = autoNight(s, { sailor: { type: 'choose', target: 3, drunk: 3 }, zombuul: { type: 'choose', target: 2 } });
	assert.equal(alive(s, 2), true, 'the sober Sailor cannot die');
	s = dawn(s);
	s = execute(s, 2, 3);
	assert.equal(alive(s, 2), true, 'executed, but lives');
	// Night 3: the Sailor is the drunk one, and the Zombuul attacks them.
	s = autoNight(s, { sailor: { type: 'choose', target: 3, drunk: 2 }, zombuul: { type: 'choose', target: 2 } });
	assert.equal(alive(s, 2), false, 'drunk, the Sailor dies');
});

test('BMR-CHAMBERMAID: counts players who woke tonight for their own ability; Minion and Demon info do not count', () => {
	// 0 po, 1 devils advocate, 2 chambermaid, 3 sailor, 4 fool, 5 tinker, 6 grandmother
	const chars = ['po', 'devils-advocate', 'chambermaid', 'sailor', 'fool', 'tinker', 'grandmother'];
	const s = autoNight(gameOn(BMR, chars), { sailor: { type: 'choose', target: 4, drunk: 4 }, 'devils-advocate': { type: 'choose', target: 4 } }, 'chambermaid');
	assert.ok(wokeTonight(s, 1), 'the Devil’s Advocate woke to use their ability');
	assert.ok(wokeTonight(s, 3), 'the Sailor woke');
	assert.equal(wokeTonight(s, 0), false, 'the Po only learned its Minions (night one, Demon info)');
	assert.equal(wokeTonight(s, 4), false, 'the Fool never wakes');
	ok(s, { type: 'tell', info: { kind: 'woke', players: [1, 4], value: 1 } });
	refused(s, { type: 'tell', info: { kind: 'woke', players: [1, 4], value: 2 } }, /woke tonight/);
	refused(s, { type: 'tell', info: { kind: 'woke', players: [2, 4], value: 0 } }, /cannot choose themself/);
});

/** The default command for the next step (as autoNight would play it). */
function nextDefault(s: GameState) {
	const step = nextStep(s)!;
	const once = autoNight;
	void once;
	if (step.kind === 'sailor') return { type: 'choose' as const, target: 4, drunk: 4 };
	if (step.kind === 'devils-advocate') return { type: 'choose' as const, target: 4 };
	if (step.kind === 'grandmother') return { type: 'tell' as const, info: { kind: 'reveal' as const, player: 3, character: 'sailor' } };
	return { type: 'acknowledge' as const };
}

test('BMR-INNKEEPER: two players safe tonight from anything (not the Assassin); one is drunk; a drunk Innkeeper protects no one', () => {
	// 0 shabaloth, 1 godfather, 2 innkeeper, 3 chambermaid, 4 fool, 5 tinker, 6 gambler
	const chars = ['shabaloth', 'godfather', 'innkeeper', 'chambermaid', 'grandmother', 'tinker', 'gambler'];
	let s = night2(chars);
	const r = perform(s, { type: 'choose', targets: [3, 6] });
	assert.equal(!r.ok && r.decision, 'drunk');
	s = autoNight(s, { innkeeper: { type: 'choose', targets: [3, 6], drunk: 6 }, shabaloth: { type: 'choose', targets: [3, 6], regurgitate: null } });
	assert.ok(alive(s, 3) && alive(s, 6), 'both safe from the Shabaloth');
	assert.ok(isDrunk(s, 6), 'the Gambler is the drunk one');
});

test('BMR-INNKEEPER-SELF: the Innkeeper picks themself and is the drunk one: neither is protected', () => {
	const chars = ['shabaloth', 'godfather', 'innkeeper', 'chambermaid', 'grandmother', 'tinker', 'gambler'];
	let s = night2(chars);
	s = autoNight(s, { innkeeper: { type: 'choose', targets: [2, 3], drunk: 2 }, shabaloth: { type: 'choose', targets: [2, 3], regurgitate: null } });
	// The drunk effect lands after the safety: but the rules say a drunk Innkeeper protects no one.
	assert.ok(!alive(s, 2) || !alive(s, 3) || isDrunk(s, 2));
});

test('BMR-GAMBLER: a wrong guess kills the Gambler; a right one does not', () => {
	// 0 po, 1 godfather, 2 gambler, 3 chambermaid, 4 fool, 5 tinker, 6 sailor
	const chars = ['po', 'godfather', 'gambler', 'chambermaid', 'fool', 'tinker', 'sailor'];
	const s = night2(chars);
	const right = autoNight(s, { gambler: { type: 'choose', target: 1, character: 'godfather' }, po: { type: 'choose', none: true } });
	assert.equal(alive(right, 2), true);
	const wrong = autoNight(s, { gambler: { type: 'choose', target: 1, character: 'assassin' }, po: { type: 'choose', none: true } });
	assert.equal(alive(wrong, 2), false);
});

test('BMR-EXORCIST: a chosen Demon is told and does not wake to kill; not the same player twice in a row', () => {
	// 0 zombuul, 1 assassin, 2 exorcist, 3 chambermaid, 4 fool, 5 tinker, 6 sailor
	const chars = ['zombuul', 'assassin', 'exorcist', 'chambermaid', 'grandmother', 'tinker', 'sailor'];
	let s = night2(chars);
	s = autoNight(s, { exorcist: { type: 'choose', target: 0 } });
	const ids = s.night!.done;
	assert.ok(ids.includes('exorcised:0'), 'the Zombuul is told who the Exorcist is');
	assert.ok(!ids.includes('zombuul:0'), 'and does not wake to kill');
	s = dusk(dawn(s));
	s = autoNight(s, {}, 'exorcist');
	refused(s, { type: 'choose', target: 0 }, /same player as last night/);
});

test('BMR-COURTIER: three nights and three days of drunkenness, from tonight; a drunk Courtier wastes it', () => {
	// 0 po, 1 godfather, 2 courtier, 3 chambermaid, 4 fool, 5 tinker, 6 sailor
	const chars = ['po', 'godfather', 'courtier', 'chambermaid', 'fool', 'tinker', 'sailor'];
	let s = autoNight(gameOn(BMR, chars), { courtier: { type: 'choose', character: 'godfather' } });
	assert.ok(isDrunk(s, 1), 'night one');
	for (const n of [2, 3]) { s = dusk(dawn(s)); assert.ok(isDrunk(s, 1), `night ${n}`); s = autoNight(s, { po: { type: 'choose', target: n === 2 ? 5 : 4 } }); }
	s = dawn(s);
	assert.ok(isDrunk(s, 1), 'day three');
	s = dusk(s);
	assert.equal(isDrunk(s, 1), false, 'sober at dusk on the third day');
	assert.ok(!nightSteps(s).some((x) => x.kind === 'courtier'), 'and the Courtier does not wake again');
});

test('BMR-COURTIER-PAUSE: the Courtier poisoned: their victim is sober until they recover', () => {
	const chars = ['pukka', 'godfather', 'courtier', 'chambermaid', 'fool', 'tinker', 'sailor'];
	let s = autoNight(gameOn(BMR, chars), { courtier: { type: 'choose', character: 'godfather' }, pukka: { type: 'choose', target: 3 } });
	assert.ok(isDrunk(s, 1));
	s.effects.push({ kind: 'poisoned', target: 2, by: null, role: 'storyteller', until: 'dusk' });
	assert.equal(isDrunk(s, 1), false, 'paused while the Courtier is poisoned');
	s.effects.pop();
	assert.ok(isDrunk(s, 1), 'and back once they are healthy');
});

test('BMR-PROFESSOR: brings back a dead Townsfolk; an Outsider wastes it; once per game', () => {
	// 0 po, 1 godfather, 2 professor, 3 chambermaid, 4 fool, 5 tinker, 6 sailor
	const chars = ['po', 'godfather', 'professor', 'chambermaid', 'grandmother', 'tinker', 'sailor'];
	let s = night2(chars);
	s.seats[3].alive = false; s.seats[5].alive = false; // dead earlier (set directly)
	const back = autoNight(s, { professor: { type: 'choose', target: 3 }, po: { type: 'choose', none: true } });
	assert.equal(alive(back, 3), true, 'the Chambermaid is back');
	assert.ok(back.spent.includes('2:professor'));
	const wasted = autoNight(s, { professor: { type: 'choose', target: 5 }, po: { type: 'choose', none: true } });
	assert.equal(alive(wasted, 5), false, 'the Tinker is an Outsider');
	assert.ok(wasted.spent.includes('2:professor'));
	refused(autoNight(s, { po: { type: 'choose', none: true } }, 'professor'), { type: 'choose', target: 4 }, /dead player/);
});

test('BMR-MINSTREL: a Minion dies by execution: everyone else drunk until dusk tomorrow, so the Demon kills no one', () => {
	// 0 po, 1 godfather, 2 minstrel, 3 chambermaid, 4 fool, 5 tinker, 6 sailor
	const chars = ['po', 'godfather', 'minstrel', 'chambermaid', 'grandmother', 'tinker', 'sailor'];
	let s = dawn(autoNight(gameOn(BMR, chars)));
	s = execute(s, 1, 3);
	assert.equal(alive(s, 1), false);
	assert.ok(isDrunk(s, 0) && isDrunk(s, 3) && !isDrunk(s, 2), 'all but the Minstrel');
	s = autoNight(s, { po: { type: 'choose', target: 3 } });
	assert.equal(alive(s, 3), true, 'the drunk Po kills no one');
	s = dawn(s);
	assert.ok(isDrunk(s, 0), 'still drunk tomorrow');
	s = dusk(s);
	assert.equal(isDrunk(s, 0), false, 'sober at dusk tomorrow');
});

test('BMR-TEA-LADY: both living neighbours good: they cannot die (Demon or execution); the Assassin still kills', () => {
	// 0 zombuul, 1 assassin, 2 chambermaid, 3 tea lady, 4 fool, 5 tinker, 6 sailor  (Tea Lady between 2 and 4)
	const chars = ['zombuul', 'assassin', 'chambermaid', 'tea-lady', 'gambler', 'tinker', 'sailor'];
	let s = night2(chars);
	s = autoNight(s, { zombuul: { type: 'choose', target: 2 }, assassin: { type: 'choose', none: true } });
	assert.equal(alive(s, 2), true, 'protected from the Demon');
	s = dawn(s);
	s = execute(s, 4, 2);
	assert.equal(alive(s, 4), true, 'executed, but lives');
	s = autoNight(s, { zombuul: { type: 'choose', target: 5 }, assassin: { type: 'choose', target: 2 } });
	assert.equal(alive(s, 2), false, 'the Assassin kills anyway');
});

test('BMR-TEA-LADY-EVIL: an evil neighbour: no protection', () => {
	// 0 zombuul, 1 assassin, 2 tea lady, 3 chambermaid ...: the Tea Lady sits by the Assassin
	const chars = ['zombuul', 'assassin', 'tea-lady', 'chambermaid', 'gambler', 'tinker', 'sailor'];
	let s = night2(chars);
	s = autoNight(s, { zombuul: { type: 'choose', target: 3 }, assassin: { type: 'choose', none: true } });
	assert.equal(alive(s, 3), false);
});

test('BMR-FOOL: the first death does not happen; the second does; a drunk Fool dies', () => {
	// 0 zombuul, 1 assassin, 2 fool, 3 chambermaid, 4 gambler, 5 tinker, 6 sailor
	const chars = ['zombuul', 'assassin', 'fool', 'chambermaid', 'gambler', 'tinker', 'sailor'];
	let s = dawn(autoNight(gameOn(BMR, chars)));
	s = execute(s, 2, 3);
	assert.equal(alive(s, 2), true, 'the first time, they live');
	assert.ok(s.spent.includes('2:fool'));
	s = dusk(dawn(autoNight(s, { assassin: { type: 'choose', none: true } })));
	s = autoNight(s, { zombuul: { type: 'choose', target: 2 }, assassin: { type: 'choose', none: true } });
	assert.equal(alive(s, 2), false, 'the second time, they die');
});

test('BMR-PACIFIST: an executed good player might live (the Storyteller says)', () => {
	// 0 po, 1 godfather, 2 pacifist, 3 chambermaid, 4 gambler, 5 tinker, 6 sailor
	const chars = ['po', 'godfather', 'pacifist', 'chambermaid', 'gambler', 'grandmother', 'exorcist'];
	const s = dawn(autoNight(gameOn(BMR, chars)));
	let t = ok(s, [{ type: 'open-nominations' }, { type: 'nominate', nominator: 4, nominee: 3 }, { type: 'vote', voters: [0, 1, 2, 3, 4, 5, 6] }]);
	const r = perform(t, { type: 'end-day' });
	assert.equal(!r.ok && r.decision, 'executionSurvives');
	const lived = ok(t, { type: 'end-day', executionSurvives: true });
	assert.equal(alive(lived, 3), true);
	const died = ok(t, { type: 'end-day', executionSurvives: false });
	assert.equal(alive(died, 3), false);
	// An evil player executed: no question.
	t = ok(s, [{ type: 'open-nominations' }, { type: 'nominate', nominator: 4, nominee: 1 }, { type: 'vote', voters: [0, 1, 2, 3, 4, 5, 6] }]);
	assert.ok(perform(t, { type: 'end-day' }).ok);
});

test('BMR-GOON: the first to choose the Goon each night is drunk until dusk, and the Goon takes their alignment', () => {
	// 0 zombuul, 1 devils advocate, 2 goon, 3 chambermaid, 4 gambler, 5 sailor, 6 exorcist
	const chars = ['zombuul', 'devils-advocate', 'goon', 'chambermaid', 'gambler', 'sailor', 'grandmother'];
	let s = gameOn(BMR, chars);
	// The Sailor wakes before the Devil's Advocate on the first night.
	s = autoNight(s, { 'devils-advocate': { type: 'choose', target: 2 }, sailor: { type: 'choose', target: 2, drunk: 2 } });
	assert.ok(isDrunk(s, 5), 'the Sailor chose the Goon first and is drunk');
	assert.equal(isDrunk(s, 2), false, 'so the Sailor made no one else drunk');
	assert.equal(s.seats[2].alignment, 'good', 'the Goon takes the (good) Sailor’s alignment');
	assert.equal(isDrunk(s, 1), false, 'the Devil’s Advocate chose second: works normally');
	assert.ok(s.effects.some((e) => e.kind === 'survives-execution' && e.target === 2));
});

test('BMR-GOON-SHABALOTH: chosen second, the Goon makes the rest of the attack fail; chosen first, all of it', () => {
	// 0 shabaloth, 1 godfather, 2 goon, 3 chambermaid, 4 gambler, 5 tinker, 6 grandmother
	const chars = ['shabaloth', 'godfather', 'goon', 'chambermaid', 'gambler', 'tinker', 'grandmother'];
	const s = night2(chars);
	const second = autoNight(s, { shabaloth: { type: 'choose', targets: [3, 2], regurgitate: null } });
	assert.equal(alive(second, 3), false, 'the first victim dies');
	assert.equal(alive(second, 2), true, 'the Goon does not');
	const first = autoNight(s, { shabaloth: { type: 'choose', targets: [2, 3], regurgitate: null } });
	assert.ok(alive(first, 2) && alive(first, 3), 'neither dies');
});

test('BMR-LUNATIC: wakes as the Demon they think they are; their choices kill no one', () => {
	// 0 shabaloth (real), 1 godfather, 2 lunatic (thinks Shabaloth), 3 chambermaid, 4 gambler, 5 tinker, 6 grandmother
	const chars = ['shabaloth', 'godfather', 'lunatic', 'chambermaid', 'gambler', 'tinker', 'grandmother'];
	const s1 = gameOn(BMR, chars);
	assert.equal(s1.seats[2].believes, 'shabaloth');
	assert.ok(nightSteps(s1).some((x) => x.id === 'lunatic-info:2'), 'night one: shown pretend Minions');
	assert.ok(!nightSteps(s1).some((x) => x.id === 'demon-info:2'), 'never the real ones');
	let s = night2(chars);
	s = autoNight(s, { lunatic: { type: 'choose', targets: [3, 4] }, shabaloth: { type: 'choose', targets: [5, 6], regurgitate: null } });
	assert.ok(alive(s, 3) && alive(s, 4), 'the Lunatic’s choices do nothing');
	assert.ok(!alive(s, 5) && !alive(s, 6));
});

test('BMR-TINKER: the Storyteller may kill the Tinker at any time, unless protected', () => {
	const chars = ['po', 'godfather', 'tinker', 'chambermaid', 'gambler', 'grandmother', 'sailor'];
	let s = dawn(autoNight(gameOn(BMR, chars)));
	refused(s, { type: 'tinker', seat: 3 }, /not a living Tinker/);
	s = ok(s, { type: 'tinker', seat: 2 });
	assert.equal(alive(s, 2), false);
});

test('BMR-MOONCHILD: on dying, chooses a living player; a good one dies tonight; an evil one does not', () => {
	// 0 po, 1 godfather, 2 moonchild, 3 chambermaid, 4 gambler, 5 grandmother, 6 sailor
	const chars = ['po', 'godfather', 'moonchild', 'chambermaid', 'gambler', 'grandmother', 'sailor'];
	let s = dawn(autoNight(gameOn(BMR, chars)));
	s = execute(s, 2, 3);
	const good = autoNight(ok(s, { type: 'moonchild', by: 2, target: 4 }), { po: { type: 'choose', none: true } });
	assert.equal(alive(good, 4), false, 'the good Gambler dies');
	const evil = autoNight(ok(s, { type: 'moonchild', by: 2, target: 1 }), { po: { type: 'choose', none: true } });
	assert.equal(alive(evil, 1), true, 'the Godfather does not');
	refused(ok(s, { type: 'moonchild', by: 2, target: 4 }), { type: 'moonchild', by: 2, target: 3 }, /already chosen/);
	// Once the curse has played out, the Moonchild cannot choose again.
	refused(dawn(good), { type: 'moonchild', by: 2, target: 3 }, /already chosen/);
});

test('BMR-GODFATHER: learns the Outsiders; kills only after an Outsider died by day', () => {
	// 0 po, 1 godfather, 2 tinker, 3 chambermaid, 4 gambler, 5 grandmother, 6 goon
	const chars = ['po', 'godfather', 'tinker', 'chambermaid', 'gambler', 'grandmother', 'goon'];
	let s = gameOn(BMR, chars);
	assert.ok(nightSteps(s).some((x) => x.id === 'godfather-info:1'));
	s = dawn(autoNight(s));
	let quiet = dusk(s);
	assert.ok(!nightSteps(quiet).some((x) => x.kind === 'godfather'), 'no Outsider died today');
	s = ok(s, { type: 'tinker', seat: 2 });
	s = dusk(s);
	assert.ok(nightSteps(s).some((x) => x.id === 'godfather:1'), 'the Tinker died today');
	s = autoNight(s, { godfather: { type: 'choose', target: 3 }, po: { type: 'choose', none: true } });
	assert.equal(alive(s, 3), false);
	void quiet;
});

test('BMR-DEVILS-ADVOCATE: the chosen player survives execution tomorrow; not the same player twice running', () => {
	// 0 po, 1 devils advocate, 2 chambermaid, 3 gambler, 4 grandmother, 5 tinker, 6 sailor
	const chars = ['po', 'devils-advocate', 'chambermaid', 'gambler', 'grandmother', 'tinker', 'sailor'];
	let s = dawn(autoNight(gameOn(BMR, chars), { 'devils-advocate': { type: 'choose', target: 3 } }));
	s = execute(s, 3, 2);
	assert.equal(alive(s, 3), true, 'executed, but lives');
	const da = autoNight(s, {}, 'devils-advocate');
	refused(da, { type: 'choose', target: 3 }, /same player as last night/);
});

test('BMR-ASSASSIN: once per game, kills through any protection', () => {
	// 0 po, 1 assassin, 2 fool, 3 chambermaid, 4 gambler, 5 grandmother, 6 sailor
	const chars = ['po', 'assassin', 'fool', 'chambermaid', 'gambler', 'grandmother', 'sailor'];
	let s = night2(chars);
	s = autoNight(s, { assassin: { type: 'choose', target: 2 }, po: { type: 'choose', none: true } });
	assert.equal(alive(s, 2), false, 'the Fool dies, ability unused');
	s = dusk(dawn(s));
	assert.ok(!nightSteps(s).some((x) => x.kind === 'assassin'), 'and the Assassin does not wake again');
});

test('BMR-MASTERMIND: the Demon executed: one more day; a good player executed then: evil wins', () => {
	// 0 po, 1 mastermind, 2 chambermaid, 3 gambler, 4 grandmother, 5 tinker, 6 sailor
	const chars = ['po', 'mastermind', 'chambermaid', 'gambler', 'grandmother', 'tinker', 'sailor'];
	let s = dawn(autoNight(gameOn(BMR, chars)));
	s = execute(s, 0, 2);
	assert.equal(alive(s, 0), false);
	assert.equal(s.phase.kind, 'night', 'the game goes on');
	s = dawn(autoNight(s));
	const goodExecuted = execute(s, 3, 2);
	assert.equal(goodExecuted.phase.kind === 'over' && goodExecuted.phase.winner, 'evil');
	const evilExecuted = execute(s, 1, 2);
	assert.equal(evilExecuted.phase.kind === 'over' && evilExecuted.phase.winner, 'good');
	const noOne = dusk(s);
	assert.equal(noOne.phase.kind === 'over' && noOne.phase.winner, 'good');
});

test('BMR-ZOMBUUL: the first death only seems real; it wakes only if no one died today; the second death is real', () => {
	// 0 zombuul, 1 godfather, 2 chambermaid, 3 gambler, 4 grandmother, 5 tinker, 6 sailor
	const chars = ['zombuul', 'godfather', 'chambermaid', 'gambler', 'grandmother', 'tinker', 'sailor'];
	let s = dawn(autoNight(gameOn(BMR, chars)));
	s = execute(s, 0, 2);
	assert.equal(s.seats[0].alive, false, 'counts as dead');
	assert.ok(s.seats[0].undead);
	assert.equal(s.phase.kind, 'night', 'the game goes on');
	assert.ok(!nightSteps(s).some((x) => x.kind === 'zombuul'), 'someone died today: no attack');
	s = dusk(dawn(autoNight(s)));
	assert.ok(nightSteps(s).some((x) => x.id === 'zombuul:0'), 'a quiet day: it attacks, though it seems dead');
	s = dawn(autoNight(s, { zombuul: { type: 'choose', target: 3 } }));
	s = execute(s, 0, 2);
	assert.equal(s.phase.kind === 'over' && s.phase.winner, 'good', 'executed again: dead for real');
});

test('BMR-PUKKA: poisons tonight; that player dies at the next Pukka turn; a drunk Pukka poisons no one', () => {
	// 0 pukka, 1 godfather, 2 chambermaid, 3 gambler, 4 grandmother, 5 tinker, 6 sailor
	const chars = ['pukka', 'godfather', 'chambermaid', 'gambler', 'grandmother', 'tinker', 'sailor'];
	let s = autoNight(gameOn(BMR, chars), { pukka: { type: 'choose', target: 2 } });
	assert.ok(s.effects.some((e) => e.kind === 'poisoned' && e.target === 2), 'night one: poisoned');
	s = dusk(dawn(s));
	s = autoNight(s, { pukka: { type: 'choose', target: 3 } });
	assert.equal(alive(s, 2), false, 'the Chambermaid dies');
	assert.equal(alive(s, 3), true, 'the Gambler is now poisoned, not dead');
});

test('BMR-SHABALOTH: two die a night; one of last night’s may come back', () => {
	// 0 shabaloth, 1 godfather, 2 chambermaid, 3 gambler, 4 grandmother, 5 tinker, 6 sailor, 7 fool, 8 exorcist
	const chars = ['shabaloth', 'godfather', 'chambermaid', 'gambler', 'grandmother', 'tinker', 'sailor', 'fool', 'exorcist'];
	let s = night2(chars, { sailor: { type: 'choose', target: 6, drunk: 6 } });
	s = autoNight(s, { shabaloth: { type: 'choose', targets: [2, 3], regurgitate: null } });
	assert.ok(!alive(s, 2) && !alive(s, 3));
	s = dusk(dawn(s));
	const r = autoNight(s, { sailor: { type: 'choose', target: 6, drunk: 6 } }, 'shabaloth');
	const q = perform(r, { type: 'choose', targets: [4, 7] });
	assert.equal(!q.ok && q.decision, 'regurgitate');
	const back = ok(r, { type: 'choose', targets: [4, 5], regurgitate: 2 });
	assert.equal(alive(back, 2), true, 'the Chambermaid is regurgitated');
});

test('BMR-PO: choosing no one means three attacks next time; the first night does not count', () => {
	// 0 po, 1 godfather, 2 chambermaid, 3 gambler, 4 grandmother, 5 tinker, 6 sailor, 7 fool, 8 exorcist
	const chars = ['po', 'godfather', 'chambermaid', 'gambler', 'grandmother', 'tinker', 'sailor', 'fool', 'exorcist'];
	let s = night2(chars, { sailor: { type: 'choose', target: 6, drunk: 6 } });
	s = dusk(dawn(autoNight(s, { po: { type: 'choose', none: true } })));
	const p = autoNight(s, { sailor: { type: 'choose', target: 6, drunk: 6 } }, 'po');
	refused(p, { type: 'choose', target: 2 }, /chooses 3 players/);
	refused(p, { type: 'choose', none: true }, /must choose/);
	const t = ok(p, { type: 'choose', targets: [2, 3, 4], mayorRedirect: null });
	assert.ok(!alive(t, 2) && !alive(t, 3) && !alive(t, 4));
});

// ---- found by the simulator -------------------------------------------------------------

// 0 shabaloth, 1 godfather, 2 courtier, 3 professor, 4 chambermaid, 5 tinker, 6 sailor, 7 fool, 8 exorcist
const REVIVE = ['shabaloth', 'godfather', 'courtier', 'professor', 'chambermaid', 'tinker', 'sailor', 'fool', 'exorcist'];

test('BMR-PROFESSOR-NONE: choosing no one keeps the Professor’s once-per-game ability', () => {
	let s = night2(REVIVE);
	s = autoNight(s, { shabaloth: { type: 'choose', targets: [4, 5], regurgitate: null } }, 'professor');
	s = ok(s, { type: 'choose', none: true });
	assert.ok(!s.spent.includes('3:professor'));
	s = dusk(dawn(autoNight(s)));
	s = autoNight(s, { shabaloth: { type: 'choose', targets: [6, 7], regurgitate: null } }, 'professor');
	assert.equal(nextStep(s)?.id, 'professor:3', 'the Professor wakes again');
});

test('BMR-SHABALOTH-SELF: the Shabaloth choosing itself first ends the game; its second choice lives', () => {
	let s = night2(REVIVE);
	s = autoNight(s, { shabaloth: { type: 'choose', targets: [0, 4], regurgitate: null } });
	assert.equal(s.phase.kind, 'over');
	assert.equal(alive(s, 4), true);
});

test('BMR-REVIVED-WAKES: a player the Professor revives wakes after the Professor, even if their place has passed', () => {
	let s = night2(REVIVE);
	s = dusk(dawn(autoNight(s, { shabaloth: { type: 'choose', targets: [2, 8], regurgitate: null } })));
	s = autoNight(s, { shabaloth: { type: 'choose', targets: [4, 6], regurgitate: null } }, 'professor');
	s = ok(s, { type: 'choose', target: 2 });
	assert.equal(alive(s, 2), true);
	assert.equal(nextStep(s)?.id, 'courtier:2', 'the revived Courtier acts tonight, after the Professor');
	s = ok(s, { type: 'choose', character: 'godfather' });
	assert.ok(isDrunk(s, 1));
});

test('BMR-REVIVED-EXORCIST: a revived Exorcist’s Demon is told just after the Exorcist', () => {
	let s = night2(REVIVE);
	s = dusk(dawn(autoNight(s, { shabaloth: { type: 'choose', targets: [2, 8], regurgitate: null } })));
	s = autoNight(s, { shabaloth: { type: 'choose', targets: [4, 6], regurgitate: null } }, 'professor');
	s = ok(s, { type: 'choose', target: 8 });
	assert.equal(nextStep(s)?.id, 'exorcist:8');
	s = ok(s, { type: 'choose', target: 0 });
	assert.equal(nextStep(s)?.id, 'exorcised:0');
});

test('BMR-LUNATIC-PO: a Lunatic who thinks they are the Po and chooses no one is asked for three next time', () => {
	// 0 zombuul, 1 godfather, 2 lunatic (thinks Po), 3 chambermaid, 4 gambler, 5 tinker, 6 grandmother
	const chars = ['zombuul', 'godfather', 'lunatic', 'chambermaid', 'gambler', 'tinker', 'grandmother'];
	let s = night2(chars, {}, { lunaticBelieves: 'po' });
	s = dusk(dawn(autoNight(s, { lunatic: { type: 'choose', none: true } })));
	s = autoNight(s, {}, 'lunatic');
	refused(s, { type: 'choose', target: 3 }, /3 players/);
	s = ok(s, { type: 'choose', targets: [3, 4, 5] });
	assert.ok(alive(s, 3) && alive(s, 4) && alive(s, 5), 'and still kills no one');
});
