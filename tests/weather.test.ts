import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beamAngle, beamAt, fall, flash, grazer, weatherOf } from '../src/town/weather.ts';

test('each town its weather: storm and beam at Saltgrave, snow at Wolfsgrund, fog in Whitechapel', () => {
	assert.ok(weatherOf('victorian').rain && weatherOf('victorian').beam && weatherOf('victorian').storm);
	assert.ok(weatherOf('grimm').snow && !weatherOf('grimm').rain);
	assert.ok(weatherOf('whitechapel').fog > 1.5);
	assert.ok(!weatherOf('castle').rain && !weatherOf('castle').snow);
});

test('the beam lights a narrow cone that turns, fading with distance', () => {
	const lamp = { x: 50, y: 50 };
	const ms = 0; // the beam points east (angle 0)
	assert.equal(beamAngle(ms), 0);
	assert.ok(beamAt(lamp, 60, 50, ms) > 0.5, 'lit ahead');
	assert.equal(beamAt(lamp, 40, 50, ms), 0, 'dark behind');
	assert.equal(beamAt(lamp, 60, 60, ms), 0, 'dark to the side');
	assert.ok(beamAt(lamp, 60, 50, ms) > beamAt(lamp, 85, 50, ms), 'fainter further out');
	// A quarter turn later it points south.
	const q = 9000 / 4;
	assert.ok(beamAt(lamp, 50, 62, q) > 0.4 && beamAt(lamp, 62, 50, q) === 0);
});

test('lightning strikes now and then, never for long', () => {
	let lit = 0;
	for (let ms = 0; ms < 600000; ms += 10) if (flash(ms) > 0) lit++;
	assert.ok(lit > 0, 'it strikes in ten minutes');
	assert.ok(lit < 600000 / 10 * 0.02, 'but the sky is dark nearly all the time');
});

test('rain and snow fall: a few cells at a time, moving with the clock, the same on every phone', () => {
	const rain = weatherOf('victorian'), snow = weatherOf('grimm');
	let drops = 0;
	for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (fall(rain, x, y, 1000)) drops++;
	assert.ok(drops > 20 && drops < 400, `${drops} drops`);
	assert.deepEqual(fall(rain, 3, 4, 1000), fall(rain, 3, 4, 1000));
	let moved = 0;
	for (let x = 0; x < 40; x++) if (!!fall(snow, x, 5, 0) !== !!fall(snow, x, 5, 2000)) moved++;
	assert.ok(moved > 0, 'the snow moves');
	assert.equal(fall(weatherOf('castle'), 3, 4, 1000), null);
});

test('sheep and cattle graze at Ashcombe: a few in a field, wandering slowly, never two in a square', () => {
	assert.ok(weatherOf('hamlet').graze && !weatherOf('castle').graze);
	const at = (ms: number) => { const out: string[] = []; for (let y = 0; y < 42; y++) for (let x = 0; x < 42; x++) if (grazer(x, y, ms)) out.push(`${x},${y}`); return out; };
	const now = at(0);
	assert.ok(now.length >= 12 && now.length <= 36, `${now.length} beasts`);
	for (const p of now) { const [x, y] = p.split(',').map(Number); assert.equal(now.filter((q) => { const [a, b] = q.split(',').map(Number); return Math.floor(a / 7) === Math.floor(x / 7) && Math.floor(b / 7) === Math.floor(y / 7); }).length, 1); }
	assert.notDeepEqual(at(0), at(20000), 'they move');
});
