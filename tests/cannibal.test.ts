/**
 * cannibal.test.ts - the Cannibal (EXP-CANNIBAL): has the ability of the last
 * player executed who died, and wakes when it would; an evil one leaves them
 * poisoned until a good player dies by execution; the Storyteller may show them a good ability meanwhile (cannibal-tell).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightSteps, customScriptId } from '../src/core/index.ts';
import { isPoisoned } from '../src/core/rules.ts';
import type { GameState, SeatId } from '../src/core/types.ts';
import { autoNight, gameOn, ok } from './helpers.ts';

// Seats: 0 Imp, 1 Poisoner, 2 Cannibal, 3 Monk, 4 Slayer, 5 Chef, 6 Empath.
const CHARS = ['imp', 'poisoner', 'cannibal', 'monk', 'slayer', 'chef', 'empath'];
const SCRIPT = customScriptId([...CHARS, 'virgin', 'soldier', 'mayor', 'butler', 'recluse']);
const C = 2;

function start(): GameState {
	return ok(night(gameOn(SCRIPT, CHARS)), [{ type: 'end-night' }, { type: 'open-nominations' }]);
}
/** Execute a player today (everyone votes), then dusk into the night. */
function execute(s: GameState, who: SeatId, nominator: SeatId): GameState {
	const voters = s.seats.filter((x) => x.alive).map((x) => x.id);
	return ok(s, [{ type: 'nominate', nominator, nominee: who }, { type: 'vote', voters }, { type: 'end-day' }]);
}
/** Tonight's defaults, with the Poisoner kept off the Cannibal (on the Chef). */
const night = (s: GameState, by: Record<string, object> = {}) => autoNight(s, { poisoner: { type: 'choose', target: 5 }, ...by } as never);
const wakesAs = (s: GameState, kind: string) => nightSteps(s).some((x) => x.id === `${kind}:${C}`);

test('CANNIBAL: never wakes before anyone is executed', () => {
	const s = ok(start(), { type: 'end-day' });
	assert.ok(!nightSteps(s).some((x) => x.seat === C), 'nothing eaten, nothing to wake for');
});

test('CANNIBAL-EAT: a good player executed: the Cannibal has their ability and wakes when it would', () => {
	const s = execute(start(), 3, 6);
	assert.equal(s.seats[3].alive, false);
	assert.deepEqual(s.seats[C].eaten, { character: 'monk', evil: false, day: 1 });
	assert.ok(wakesAs(s, 'monk'), 'the Cannibal wakes as the Monk would');
	assert.equal(isPoisoned(s, C), false);
	const after = night(s, { [`monk:${C}`]: { type: 'choose', target: 6 } });
	assert.ok(after.effects.some((e) => e.kind === 'safe-from-demon' && e.target === 6 && e.by === C), 'the Monk’s protection works from the Cannibal');
});

test('CANNIBAL-FIRST-NIGHT: an eaten first-night ability acts the night after, once', () => {
	let s = execute(start(), 5, 6); // the Chef
	assert.ok(wakesAs(s, 'chef'), 'the Chef’s ability acts the night after the execution');
	s = ok(night(s), [{ type: 'end-night' }, { type: 'end-day' }]);
	assert.ok(!wakesAs(s, 'chef'), 'not again');
});

test('CANNIBAL-EVIL: an evil player executed: poisoned, no ability, until a good one is executed', () => {
	let s = execute(start(), 1, 6); // the Poisoner
	assert.equal(s.seats[C].eaten?.evil, true);
	assert.equal(isPoisoned(s, C), true, 'poisoned');
	assert.ok(!nightSteps(s).some((x) => x.seat === C && x.kind === 'poisoner'), 'no evil ability');
	s = ok(night(s), [{ type: 'end-night' }, { type: 'open-nominations' }]);
	s = execute(s, 3, 6); // the Monk: good, and healthy again
	assert.equal(isPoisoned(s, C), false, 'a good player executed: no longer poisoned');
	assert.ok(wakesAs(s, 'monk'));
});

test('CANNIBAL-DAY: an eaten Slayer can shoot the Demon', () => {
	let s = execute(start(), 4, 6); // the Slayer
	s = ok(night(s), [{ type: 'end-night' }, { type: 'slay', by: C, target: 0 }]);
	assert.equal(s.seats[0].alive, false, 'the Cannibal’s shot hits');
});

test('CANNIBAL-NONE: a day with no execution: nothing eaten', () => {
	let s = start();
	s = ok(s, { type: 'end-day' });
	assert.equal(s.seats[C].eaten, undefined);
});

test('CANNIBAL-TELL: a poisoned Cannibal may be shown a good ability (it wakes, poisoned) or none', () => {
	let s = execute(start(), 1, 6); // the Poisoner: evil
	assert.ok(!nightSteps(s).some((x) => x.seat === C), 'shown nothing yet: no step');
	s = ok(s, { type: 'cannibal-tell', seat: C, character: 'monk' });
	assert.equal(s.seats[C].eaten?.told, 'monk');
	assert.ok(wakesAs(s, 'monk'), 'woken as the Monk the Storyteller showed');
	assert.equal(isPoisoned(s, C), true, 'still poisoned: nothing it does works');
	const after = night(s, { [`monk:${C}`]: { type: 'choose', target: 6 } });
	assert.ok(!after.effects.some((e) => e.kind === 'safe-from-demon' && e.by === C), 'no protection from a poisoned Cannibal');
	// Or nothing at all.
	s = ok(s, { type: 'cannibal-tell', seat: C, character: null });
	assert.ok(!nightSteps(s).some((x) => x.seat === C), 'shown nothing: no step');
});

test('CANNIBAL-TELL: only after an evil meal, only a good character; a good meal later ends it', () => {
	const fresh = start();
	assert.throws(() => ok(fresh, { type: 'cannibal-tell', seat: C, character: 'monk' }), /evil/, 'nothing eaten');
	let s = execute(fresh, 1, 6);
	assert.throws(() => ok(s, { type: 'cannibal-tell', seat: C, character: 'imp' }), /good/, 'not an evil character');
	assert.throws(() => ok(s, { type: 'cannibal-tell', seat: 3, character: 'monk' }), /Cannibal/, 'not a Cannibal');
	s = ok(s, { type: 'cannibal-tell', seat: C, character: 'monk' });
	s = ok(night(s), [{ type: 'end-night' }, { type: 'open-nominations' }]);
	s = execute(s, 5, 6); // the Chef: good
	assert.equal(s.seats[C].eaten?.told, undefined, 'a new meal clears what was shown');
	assert.equal(isPoisoned(s, C), false);
	assert.ok(wakesAs(s, 'chef'));
});
