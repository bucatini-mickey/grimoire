/**
 * travellers.test.ts - Travellers on the three base scripts, from the official
 * rules (docs/rules/INTERACTIONS.md, "Travellers").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perform, nightSteps, nextStep, isDrunk, isPoisoned } from '../src/core/index.ts';
import type { GameState, SeatId } from '../src/core/index.ts';
import { game, gameOn, autoNight, ok, refused } from './helpers.ts';

const dawn = (s: GameState) => ok(s, { type: 'end-night' });
const alive = (s: GameState, id: SeatId) => s.seats[id].alive;
// 0 imp, 1 poisoner, 2 washerwoman, 3 empath, 4 monk, 5 soldier, 6 mayor
const TB = ['imp', 'poisoner', 'washerwoman', 'empath', 'monk', 'soldier', 'mayor'];
const day1 = (chars = TB) => dawn(autoNight(game(chars)));
// 0 po, 1 godfather, 2 grandmother, 3 chambermaid, 4 fool, 5 tinker, 6 sailor
const BMR = ['po', 'godfather', 'grandmother', 'chambermaid', 'fool', 'tinker', 'sailor'];
const bmrDay1 = () => dawn(autoNight(gameOn('bad-moon-rising', BMR), { grandmother: { type: 'tell', info: { kind: 'reveal', player: 3, character: 'chambermaid' } } }));
const join = (s: GameState, character: string, alignment: 'good' | 'evil', name = 'Tess') =>
	ok(s, { type: 'traveller-joins', name, character, alignment, after: 0 });

test('TRAV-JOIN: a Traveller joins next to a player; an evil one learns the Demon that night', () => {
	let s = join(day1(), 'gunslinger', 'evil');
	assert.equal(s.seats[7].traveller, true);
	assert.equal(s.seats[7].alignment, 'evil');
	assert.deepEqual(s.order.slice(0, 2), [0, 7], 'sits just after the chosen player');
	refused(s, { type: 'traveller-joins', name: 'Tess', character: 'thief', alignment: 'good', after: 0 }, /share a name/);
	refused(s, { type: 'traveller-joins', name: 'Uma', character: 'gunslinger', alignment: 'good', after: 0 }, /already in play/);
	refused(s, { type: 'traveller-joins', name: 'Uma', character: 'harlot', alignment: 'good', after: 0 }, /not a Traveller for/);
	s = ok(s, [{ type: 'open-nominations' }, { type: 'end-day' }]);
	assert.equal(nextStep(s)?.id, 'traveller-info:7');
	s = ok(s, { type: 'acknowledge' });
	assert.ok(!nightSteps(ok(dawn(autoNight(s)), [{ type: 'open-nominations' }, { type: 'end-day' }])).some((x) => x.kind === 'traveller-info'), 'once');
});

test('TRAV-EXILE: anyone may support, the dead too; half the living; not an execution; Travellers are never nominated', () => {
	let s = ok(join(day1(), 'scapegoat', 'good'), { type: 'open-nominations' });
	refused(s, { type: 'nominate', nominator: 2, nominee: 7 }, /exiled, not executed/);
	refused(s, { type: 'exile', traveller: 2, supporters: [0, 1, 3, 4] }, /Only Travellers/);
	const failed = ok(s, { type: 'exile', traveller: 7, supporters: [0, 1, 2] });
	assert.equal(alive(failed, 7), true, '3 of 8 living is not enough');
	s = ok(s, { type: 'exile', traveller: 7, supporters: [0, 1, 2, 3] });
	assert.equal(alive(s, 7), false);
	assert.equal(s.day!.executed, null, 'an exile is not an execution');
	ok(s, { type: 'nominate', nominator: 2, nominee: 3 });
});

test('TRAV-COUNT: Travellers do not count for the evil win: a Traveller and two others alive, and evil wins', () => {
	// 0 imp, 1 poisoner, 2 washerwoman, 3 empath, 4 monk: five players, then a Traveller.
	let s = join(dawn(autoNight(game(['imp', 'poisoner', 'washerwoman', 'empath', 'monk']))), 'thief', 'good');
	s = ok(s, [{ type: 'open-nominations' }, { type: 'nominate', nominator: 2, nominee: 4 }, { type: 'vote', voters: [0, 1, 2, 3, 5] }, { type: 'end-day' }]);
	assert.equal(alive(s, 4), false);
s = dawn(autoNight(s, { imp: { type: 'choose', target: 3 }, thief: { type: 'choose', target: 2 } }));
	assert.equal(alive(s, 3), false);
	assert.equal(s.phase.kind, 'day', 'three who count (and the Thief): the game goes on');
	s = ok(s, [{ type: 'open-nominations' }, { type: 'nominate', nominator: 2, nominee: 2 }, { type: 'vote', voters: [0, 1, 5] }, { type: 'end-day' }]);
	assert.equal(s.phase.kind === 'over' && s.phase.winner, 'evil', 'the Imp, the Poisoner and the Thief alive: two who count');
});

test('TRAV-BUREAUCRAT / TRAV-THIEF: tomorrow their votes count three times / minus one; not for exiles', () => {
	let s = join(join(day1(), 'bureaucrat', 'good'), 'thief', 'evil', 'Uma');
	s = ok(s, [{ type: 'open-nominations' }, { type: 'end-day' }]);
	s = dawn(autoNight(s, { bureaucrat: { type: 'choose', target: 2 }, thief: { type: 'choose', target: 3 }, imp: { type: 'choose', target: 4 } }));
	s = ok(s, [{ type: 'open-nominations' }, { type: 'nominate', nominator: 2, nominee: 6 }, { type: 'vote', voters: [2, 3, 5] }]);
	const last = s.day!.nominations[0];
	assert.equal(last.votes, 3 - 1 + 1, 'Washerwoman 3, Empath -1, Soldier 1');
});

test('TRAV-GUNSLINGER: after the first vote, shoots a player who voted in it', () => {
	let s = ok(join(day1(), 'gunslinger', 'good'), { type: 'open-nominations' });
	refused(s, { type: 'gunslinger', by: 7, target: 2 }, /first vote/);
	s = ok(s, [{ type: 'nominate', nominator: 2, nominee: 6 }, { type: 'vote', voters: [2, 3] }]);
	refused(s, { type: 'gunslinger', by: 7, target: 4 }, /voted in the first vote/);
	s = ok(s, { type: 'gunslinger', by: 7, target: 3 });
	assert.equal(alive(s, 3), false);
	refused(s, { type: 'gunslinger', by: 7, target: 2 }, /One shot a day/);
});

test('TRAV-JUDGE: once per game, pardons or condemns another player’s nominee', () => {
	let s = ok(join(bmrDay1(), 'judge', 'good'), { type: 'open-nominations' });
	s = ok(s, [{ type: 'nominate', nominator: 2, nominee: 6 }, { type: 'vote', voters: [0, 1, 2, 3, 4] }]);
	assert.equal(s.day!.block, 6);
	const pardoned = ok(s, { type: 'judge', by: 7, verdict: 'pardon' });
	assert.equal(pardoned.day!.block, null, 'not executed today');
	refused(pardoned, { type: 'judge', by: 7, verdict: 'condemn' }, /once/);
	const t = ok(ok(join(bmrDay1(), 'judge', 'good'), { type: 'open-nominations' }), [{ type: 'nominate', nominator: 2, nominee: 3 }, { type: 'vote', voters: [] }]);
	const condemned = ok(t, { type: 'judge', by: 7, verdict: 'condemn' });
	assert.equal(alive(condemned, 3), false, 'executed whatever the votes');
	assert.equal(condemned.day!.executed, 3);
});

test('TRAV-VOUDON: only the dead and the Voudon vote, freely; the most votes is enough', () => {
	let s = ok(join(bmrDay1(), 'voudon', 'evil'), { type: 'open-nominations' });
	s = ok(s, [{ type: 'nominate', nominator: 2, nominee: 6 }]);
	refused(s, { type: 'vote', voters: [2] }, /only the dead and the Voudon/);
	s = ok(s, { type: 'vote', voters: [7] });
	assert.equal(s.day!.block, 6, 'one vote is enough');
});

test('TRAV-BARISTA: the chosen player is sober and healthy until dusk', () => {
	const bmr = gameOn('sects-and-violets', ['fang-gu', 'dreamer', 'clockmaker', 'witch', 'oracle', 'sage', 'mutant']);
	let s = join(dawn(autoNight(bmr)), 'barista', 'good');
	s = ok(s, [{ type: 'open-nominations' }, { type: 'end-day' }]);
	const q = autoNight(s, {}, 'barista');
	assert.equal((perform(q, { type: 'choose', target: 2 }) as { decision?: string }).decision, 'barista');
	s = ok(q, { type: 'choose', target: 2, barista: 'sober' });
	assert.ok(s.effects.some((e) => e.kind === 'sober' && e.target === 2));
	assert.ok(!isDrunk(s, 2) && !isPoisoned(s, 2));
});

test('TRAV-APPRENTICE: on their first night gains a Townsfolk ability (good) or a Minion one (evil); still a Traveller', () => {
	let s = join(bmrDay1(), 'apprentice', 'good');
	s = ok(s, [{ type: 'open-nominations' }, { type: 'end-day' }]);
	s = autoNight(s, {}, 'apprentice');
	refused(s, { type: 'choose', character: 'assassin' }, /Townsfolk/);
	s = ok(s, { type: 'choose', character: 'exorcist' });
	assert.equal(s.seats[7].character, 'exorcist');
	assert.equal(s.seats[7].traveller, true);
});

// 0 fang-gu, 1 dreamer, 2 clockmaker, 3 witch, 4 oracle, 5 sage, 6 mutant
const SNV = ['fang-gu', 'dreamer', 'clockmaker', 'witch', 'oracle', 'sage', 'mutant'];
const snvDay1 = () => dawn(autoNight(gameOn('sects-and-violets', SNV), { witch: { type: 'choose', target: 6 } }));
const toNight = (s: GameState) => ok(s, [{ type: 'open-nominations' }, { type: 'end-day' }]);

test('TRAV-HARLOT: the chosen player may show their character; the Storyteller may kill both', () => {
	const s = autoNight(toNight(join(snvDay1(), 'harlot', 'good')), {}, 'harlot');
	assert.equal((perform(s, { type: 'choose', target: 2 }) as { decision?: string }).decision, 'harlot');
	const shown = ok(s, { type: 'choose', target: 2, harlot: 'shown' });
	assert.ok(alive(shown, 2) && alive(shown, 7));
	const both = ok(s, { type: 'choose', target: 2, harlot: 'both-die' });
	assert.ok(!alive(both, 2) && !alive(both, 7));
});

test('TRAV-BONE-COLLECTOR: once per game, a dead player regains their ability until dusk', () => {
	let s = snvDay1();
	s = ok(s, [{ type: 'open-nominations' }, { type: 'nominate', nominator: 1, nominee: 3 }, { type: 'vote', voters: [0, 1, 2, 3, 4, 5, 6] }, { type: 'end-day' }]);
	assert.equal(alive(s, 3), false, 'the Witch is executed');
	s = join(dawn(autoNight(s, { 'fang-gu': { type: 'choose', target: 4 } })), 'bone-collector', 'evil');
	s = autoNight(toNight(s), {}, 'bone-collector');
	s = ok(s, { type: 'choose', target: 3 });
	assert.ok(nightSteps(s).some((x) => x.id === 'witch:3'), 'the dead Witch wakes tonight');
	s = toNight(dawn(autoNight(s, { witch: { type: 'choose', target: 1 }, 'fang-gu': { type: 'choose', target: 5 } })));
	assert.ok(!nightSteps(s).some((x) => x.kind === 'bone-collector'), 'once per game');
	assert.ok(!nightSteps(s).some((x) => x.id === 'witch:3'), 'only until dusk');
});

test('TRAV-DEVIANT: if they were funny today, they cannot die by exile', () => {
	const s = ok(join(snvDay1(), 'deviant', 'good'), { type: 'open-nominations' });
	const sup = { type: 'exile' as const, traveller: 7, supporters: [0, 1, 2, 3, 4] };
	assert.equal((perform(s, sup) as { decision?: string }).decision, 'deviantFunny');
	assert.equal(alive(ok(s, { ...sup, deviantFunny: true }), 7), true);
	assert.equal(alive(ok(s, { ...sup, deviantFunny: false }), 7), false);
});

test('TRAV-BONE-COLLECTOR-LATE: a dead player whose place has passed tonight does not act until next time', () => {
	let s = join(join(snvDay1(), 'harlot', 'good'), 'bone-collector', 'good', 'Uma');
	s = ok(s, [{ type: 'open-nominations' }, { type: 'exile', traveller: 7, supporters: [0, 1, 2, 3, 4] }, { type: 'end-day' }]);
	assert.equal(alive(s, 7), false, 'the Harlot is exiled');
	s = autoNight(s, {}, 'bone-collector');
	s = ok(s, { type: 'choose', target: 7 });
	assert.ok(!nightSteps(s).some((x) => x.id === 'harlot:7' && !x.done), 'the Harlot (earlier in the night) does not wake now');
});
