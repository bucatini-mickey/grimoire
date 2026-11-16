import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../src/ui/timer.ts';

test('Start does nothing on a clock at 0:00, so it is not offered; adding time brings it back', () => {
	const t0 = T.newTimer(1000);
	assert.ok(T.canStart(t0, 0));
	const run = T.start(t0, 0);
	assert.ok(!T.canStart(run, 500), 'a running clock offers Pause, not Start');
	const spent = T.pause(run, 1000);
	assert.equal(T.remaining(spent, 1000), 0);
	assert.ok(!T.canStart(spent, 1000));
	assert.equal(T.toggle(spent, 1000), spent, 'the tap really is a no-op');
	assert.ok(T.canStart(T.extend(spent, 30_000, 1000), 1000));
});

test('rapid +30s / -30s taps each count', () => {
	let t = T.start(T.newTimer(60_000), 0);
	for (let i = 0; i < 5; i++) t = T.extend(t, 30_000, 100 * i);
	assert.equal(t.durationMs, 210_000);
	for (let i = 0; i < 3; i++) t = T.extend(t, -30_000, 600);
	assert.equal(T.remaining(t, 600), 120_000 - 600);
});

test('the screen is redrawn when a clock face changes, not on every 250ms tick', () => {
	const w = T.faceWatch();
	const t = T.start(T.newTimer(60_000), 0);
	let redraws = 0;
	for (let now = 0; now <= 3000; now += 250) if (w.changed('day', T.clock(T.remaining(t, now)))) redraws++;
	// ticks at 0..3000 ms: faces 1:00, 0:59 (from 1 ms on), 0:58, 0:57
	assert.equal(redraws, 4);
	assert.ok(!w.changed('day', T.clock(T.remaining(t, 3000))));
	assert.ok(w.changed('nom', '5:00'), 'each clock is watched separately');
	w.forget();
	assert.ok(w.changed('day', '0:57'));
});
