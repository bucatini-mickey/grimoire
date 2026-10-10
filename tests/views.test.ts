import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextStep } from '../src/core/index.ts';
import { publicView, cardFor, wakeFor } from '../src/net/views.ts';
import { game, ok, playNight } from './helpers.ts';

// 0 Ada imp, 1 Bram poisoner, 2 Cael drunk (thinks washerwoman), 3 Dorn empath, 4 Esme monk, 5 Fenn soldier, 6 Gwen fortune-teller
const base = () => game(['imp', 'poisoner', 'drunk', 'empath', 'monk', 'soldier', 'fortune-teller'], { drunkBelieves: 'washerwoman', redHerring: 4 });

test('the public view never names a character', () => {
	const json = JSON.stringify(publicView(base()));
	for (const c of ['imp', 'Imp', 'poisoner', 'Poisoner', 'drunk', 'Drunk', 'empath', 'Empath', 'Monk']) {
		assert.ok(!json.includes(c), `public view mentions ${c}`);
	}
});

test('a player’s card is what they were told: the Drunk sees their pretend Townsfolk', () => {
	const s = base();
	assert.deepEqual(cardFor(s, 2)?.name, 'Washerwoman');
	assert.equal(cardFor(s, 2)?.team, 'good');
	assert.equal(cardFor(s, 0)?.name, 'Imp');
	assert.equal(cardFor(s, 0)?.team, 'evil');
});

test('a death in the night is not public until dawn', () => {
	let s = ok(playNight(base()), { type: 'end-day' });
	// Night 2: Poisoner, Monk, then the Imp kills Dorn.
	s = ok(s, [{ type: 'choose', target: 5 }, { type: 'choose', target: 6 }, { type: 'choose', target: 3 }]);
	assert.equal(s.seats[3].alive, false);
	assert.equal(publicView(s).seats[3].alive, true, 'still alive as far as the room knows');
	const ft = nextStep(s)!;
	assert.equal(ft.kind, 'fortune-teller');
	const w = wakeFor(s, ft);
	assert.ok(!JSON.stringify(w).includes('†'), 'the Fortune Teller sees no death marks');
	s = ok(s, [{ type: 'tell', info: { kind: 'fortune', players: [0, 1], yes: true } }, { type: 'end-night' }]);
	assert.equal(publicView(s).seats[3].alive, false, 'and known at dawn');
});

test('a wake shows only that player’s own role and what they are owed', () => {
	const s = base();
	// Seven players: the Demon wakes to learn its Minion and bluffs.
	const demon = nextStep(s)!;
	assert.equal(demon.id, 'demon-info:0');
	const w = wakeFor(s, demon);
	assert.equal(w.role, 'imp');
	const titles = w.sections.map((x) => x.title);
	assert.ok(titles.includes('Your Minions') && titles.includes('Not in play'));
	assert.ok(!JSON.stringify(w).includes('Monk'), 'no other character named except bluffs');
	// The Poisoner learns its Demon in its own wake and may choose anyone.
	const p = ok(s, { type: 'acknowledge' });
	const pw = wakeFor(p, nextStep(p)!);
	assert.equal(pw.role, 'poisoner');
	assert.deepEqual(pw.sections.find((x) => x.title === 'Your Demon')?.lines, ['Ada']);
	assert.equal(pw.pick?.count, 1);
	assert.equal(pw.pick?.allowed.length, 7);
});

test('the Drunk wakes as who they think they are', () => {
	let s = ok(base(), [{ type: 'acknowledge' }, { type: 'choose', target: 4 }]);
	const step = nextStep(s)!;
	assert.equal(step.kind, 'washerwoman');
	const w = wakeFor(s, step, { kind: 'pair', players: [3, 4], character: 'empath' });
	assert.equal(w.role, 'washerwoman');
	assert.ok(!JSON.stringify(w).toLowerCase().includes('drunk'));
	assert.ok(w.info?.some((x) => x.lines.includes('Empath')));
	s = s; // the Storyteller records it as usual
});
