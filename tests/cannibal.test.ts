/**
 * cannibal.test.ts - the Cannibal (experimental): the ability of the last player executed who died;
 * an evil one leaves the Cannibal poisoned until a good player dies by execution, and the Storyteller
 * says which good ability the Cannibal thinks they have (or none).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customScriptId, isPoisoned, reminders } from '../src/core/index.ts';
import type { GameState } from '../src/core/index.ts';
import { gameOn, autoNight, ok, refused } from './helpers.ts';

// 0 Ada imp, 1 Bram cannibal, 2 Cael poisoner, 3 Dorn empath, 4 Esme monk, 5 Fenn chef, 6 Gwen soldier
const chars = ['imp', 'cannibal', 'poisoner', 'empath', 'monk', 'chef', 'soldier'];
const script = customScriptId([...chars, 'washerwoman', 'librarian', 'investigator']);
const poisoned = (s: GameState) => isPoisoned(s, 1);
const loan = (s: GameState) => s.effects.find((e) => e.kind === 'cannibal-ability' && e.target === 1)?.note;

/** Day 1 is open, and the poisoner's night-1 poison is not in the way. */
function day1() {
	let s = autoNight(gameOn(script, chars), { poisoner: { type: 'choose', targets: [6] } });
	s = ok(s, [{ type: 'end-night' }, { type: 'open-nominations' }]);
	return s;
}
const execute = (s: GameState, nominee: number, voters: number[]) =>
	ok(s, [{ type: 'nominate', nominator: nominee === 3 ? 4 : 3, nominee }, { type: 'vote', voters }, { type: 'end-day' }]);
const nextDay = (s: GameState) => ok(autoNight(s, { imp: { type: 'choose', targets: [6] } }), [{ type: 'end-night' }, { type: 'open-nominations' }]);

test('CANNIBAL-EVIL: eating an evil player poisons the Cannibal, and the Storyteller says what they think they have', () => {
	let s = execute(day1(), 2, [0, 1, 4, 5]);
	assert.equal(s.seats[2].alive, false);
	assert.equal(loan(s), 'evil:poisoner');
	assert.equal(poisoned(s), true);
	assert.ok(reminders(s, 1).includes('poisoned'));
	refused(s, { type: 'cannibal-tell', seat: 1, character: 'imp' }, /good character/);
	refused(s, { type: 'cannibal-tell', seat: 3, character: 'chef' }, /Only a Cannibal/);
	s = ok(s, { type: 'cannibal-tell', seat: 1, character: 'washerwoman' });
	assert.equal(s.effects.find((e) => e.kind === 'cannibal-shown')?.note, 'washerwoman');
	// The Storyteller may change their mind, or give nothing.
	s = ok(s, { type: 'cannibal-tell', seat: 1, character: null });
	assert.deepEqual(s.effects.filter((e) => e.kind === 'cannibal-shown').map((e) => e.note), ['nothing']);
});

test('CANNIBAL-GOOD: a good player executed gives the Cannibal their ability and ends the poison', () => {
	let s = execute(day1(), 2, [0, 1, 4, 5]);
	s = nextDay(s);
	s = execute(s, 3, [1, 4, 5, 0]);
	assert.equal(s.seats[3].alive, false);
	assert.equal(loan(s), 'empath', 'the loan is replaced by the last death');
	assert.equal(poisoned(s), false, 'a good player died by execution');
	assert.equal(s.effects.some((e) => e.kind === 'cannibal-shown'), false, 'the false ability goes with it');
	refused(s, { type: 'cannibal-tell', seat: 1, character: 'chef' }, /Only a Cannibal/);
});

test('CANNIBAL-NONE: a day with no execution gives the Cannibal nothing', () => {
	let s = day1();
	s = ok(s, { type: 'end-day' });
	assert.equal(loan(s), undefined);
	assert.equal(poisoned(s), false);
});

test('CANNIBAL-DEAD: a dead Cannibal gains nothing', () => {
	let s = day1();
	s = ok(s, [{ type: 'nominate', nominator: 3, nominee: 1 }, { type: 'vote', voters: [0, 3, 4, 5] }, { type: 'end-day' }]);
	assert.equal(s.seats[1].alive, false);
	s = nextDay(s);
	s = execute(s, 2, [0, 4, 5, 3]);
	assert.equal(loan(s), undefined);
	assert.equal(poisoned(s), false);
});
