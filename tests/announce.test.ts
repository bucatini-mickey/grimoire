/**
 * announce.test.ts - what the room is told (src/net/announce.ts). The
 * simulator checks the same banners in every random game; these name the
 * cases that were wrong.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perform } from '../src/core/index.ts';
import type { GameState, SeatId } from '../src/core/index.ts';
import { announce } from '../src/net/announce.ts';
import { publicView } from '../src/net/views.ts';
import { gameOn, autoNight, ok } from './helpers.ts';

const BMR = 'bad-moon-rising';
const text = (s: GameState, cmd: Parameters<typeof perform>[1]) => {
	const r = perform(s, cmd);
	if (!r.ok) assert.fail(r.error);
	return (announce(s, r.events, r.state) ?? []).map((b) => [b.title, ...b.lines].join(' / ')).join('\n');
};
/** Day one: open nominations, `nominator` nominates `nominee`, everyone votes. */
const onTheBlock = (s: GameState, nominee: SeatId, nominator: SeatId) => {
	let t = ok(ok(s, { type: 'end-night' }), { type: 'open-nominations' });
	t = ok(t, { type: 'nominate', nominator, nominee });
	return ok(t, { type: 'vote', voters: t.seats.filter((x) => x.alive).map((x) => x.id) });
};

test('an execution the Zombuul seems to die in is announced as a death', () => {
	// 0 zombuul, 1 assassin, 2 sailor, 3 chambermaid, 4 grandmother, 5 tinker, 6 exorcist
	const s = onTheBlock(autoNight(gameOn(BMR, ['zombuul', 'assassin', 'sailor', 'chambermaid', 'grandmother', 'tinker', 'exorcist'])), 0, 3);
	const said = text(s, { type: 'end-day' });
	assert.match(said, /Ada is executed\. \/ Ada dies\./);
	assert.ok(!/already dead/.test(said));
});

test('an execution that fails is announced as no death, and never says why', () => {
	// 0 po, 1 godfather, 2 sailor ... the Sailor cannot die while sober
	const s = onTheBlock(autoNight(gameOn(BMR, ['po', 'godfather', 'sailor', 'chambermaid', 'grandmother', 'tinker', 'exorcist']), { sailor: { type: 'choose', target: 3, drunk: 3 } }), 2, 3);
	const said = text(s, { type: 'end-day' });
	assert.match(said, /Cael is executed\. \/ Cael does not die\./);
	assert.ok(!/Sailor|drunk|protect/i.test(said));
});

test('dawn names those who were alive at dusk and are dead now, not someone killed and brought back', () => {
	// 0 shabaloth, 1 godfather, 2 professor, 3 chambermaid, 4 grandmother, 5 tinker, 6 sailor
	const chars = ['shabaloth', 'godfather', 'professor', 'chambermaid', 'grandmother', 'tinker', 'sailor'];
	let s = ok(autoNight(gameOn(BMR, chars)), [{ type: 'end-night' }, { type: 'end-day', executionSurvives: false }]);
	// The Shabaloth kills the Chambermaid and the Grandmother; the Professor brings the Chambermaid back.
	s = autoNight(s, { shabaloth: { type: 'choose', targets: [3, 4] }, professor: { type: 'choose', target: 3 } });
	assert.equal(s.seats[3].alive, true, 'brought back');
	assert.equal(s.seats[4].alive, false);
	// Until dawn the room sees the circle as it was at dusk: no death, no coming back.
	assert.ok(publicView(s).seats.every((x) => x.alive), 'no one shows dead in the night');
	const said = text(s, { type: 'end-night' });
	assert.match(said, /Esme died in the night/);
	assert.ok(!/Dorn/.test(said), 'the Chambermaid is alive');
});

test('someone dead at dusk and brought back in the night still shows dead until dawn', () => {
	const chars = ['shabaloth', 'godfather', 'professor', 'chambermaid', 'grandmother', 'tinker', 'sailor'];
	let s = ok(autoNight(gameOn(BMR, chars)), { type: 'end-night' });
	s.seats[3].alive = false; // died earlier (set directly)
	s = ok(s, { type: 'end-day', executionSurvives: false });
	s = autoNight(s, { shabaloth: { type: 'choose', targets: [4, 5] }, professor: { type: 'choose', target: 3 } });
	assert.equal(s.seats[3].alive, true, 'brought back');
	assert.equal(publicView(s).seats[3].alive, false, 'the room is not told yet');
	const said = text(s, { type: 'end-night' });
	assert.ok(!/Dorn/.test(said), 'not a death');
	assert.equal(publicView(ok(s, { type: 'end-night' })).seats[3].alive, true, 'and plain at dawn');
});

test("a Zombuul who seems dead, saved from execution, looks like a dead player executed: it does not say she does not die", () => {
	// 0 zombuul, 1 devils-advocate, 2 sailor ...; the Zombuul has used her first death
	let s = autoNight(gameOn(BMR, ["zombuul", "devils-advocate", "sailor", "chambermaid", "grandmother", "tinker", "exorcist"]));
	s = { ...s, seats: s.seats.map((x) => (x.id === 0 ? { ...x, alive: false, undead: true } : x)) };
	s = ok(ok(s, { type: "end-night" }), { type: "open-nominations" });
	s = ok(s, { type: "nominate", nominator: 3, nominee: 0 });
	s = ok(s, { type: "vote", voters: [1, 2, 3, 4, 5, 6] });
	s = { ...s, effects: [...s.effects, { kind: "survives-execution", target: 0, by: 1, role: "devils-advocate", until: "dusk", whileSourceWorks: true } as never] };
	const said = text(s, { type: "end-day" });
	assert.match(said, /Ada is executed\. \/ Ada was already dead\./);
	assert.ok(!/does not die/.test(said));
});
