import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRADES, Inks, fitPalette, kelvin, lit, lum, thin } from '../src/town/grade.ts';
import { firefly, sparks } from '../src/town/weather.ts';

test('colour temperature: a candle is warmer than a gas lamp, which is warmer than noon', () => {
	const warmth = (k: number) => { const c = kelvin(k); return c[0] / c[2]; };
	assert.ok(warmth(1850) > warmth(3000));
	assert.ok(warmth(3000) > warmth(5800));
	// Taken toward white: a flame is amber, never pure red.
	assert.ok(kelvin(1850)[2] > 0.2);
});

test('day shows a surface as it is; night is darker and bluer, but still there', () => {
	const grass: [number, number, number] = [84, 150, 58];
	const day = lit(grass, GRADES.day.sun, GRADES.day);
	assert.ok(Math.abs(day[1] - grass[1]) < 12, `day ${day}`);
	const night = lit(grass, GRADES.night.sun, GRADES.night);
	assert.ok(night[1] < day[1] / 2, `night ${night}`);
	assert.ok(night[2] > night[0], 'moonlight drains to blue');
	assert.ok(night[0] + night[1] + night[2] > 30, 'the moonlit grass can still be seen');
	// A torch beside it at night is warm.
	const torch = kelvin(2000).map((v, k) => v * 0.9 * GRADES.night.flame + GRADES.night.sun[k]) as [number, number, number];
	const byTorch = lit(grass, torch, GRADES.night);
	assert.ok(lum(byTorch) > lum(night) && byTorch[0] > byTorch[2], `by the torch ${byTorch}`);
});

test('the fitted palette keeps what the town is made of, and the lookup finds the nearest', () => {
	const ramp = (c: number[]) => Array.from({ length: 40 }, (_, i) => c.map((v) => (v * (i + 1)) / 40) as [number, number, number]);
	const cloud = [...ramp([84, 150, 58]), ...ramp([128, 92, 58]), ...ramp([150, 160, 176])];
	const { colours, weights } = thin(cloud);
	const pal = fitPalette(colours, 24, weights);
	assert.equal(pal.length, 24);
	const inks = new Inks(pal, 80);
	const green = pal[inks.of([60, 110, 42]) - 80];
	assert.ok(green[1] > green[0] && green[1] > green[2], `green stays green: ${green}`);
	const brown = pal[inks.of([110, 80, 50]) - 80];
	assert.ok(brown[0] > brown[1] && brown[1] > brown[2], `brown stays brown: ${brown}`);
});

test('sparks rise from fires and fireflies wink, the same on every phone', () => {
	const f = [{ x: 10, y: 20, big: true }];
	assert.deepEqual(sparks(f, 12345), sparks(f, 12345));
	for (let ms = 0; ms < 6000; ms += 97) for (const s of sparks(f, ms)) assert.ok(s.y < 20 && s.y >= 15 && Math.abs(s.x - 10) <= 2);
	let lit = 0, dark = 0;
	for (let ms = 0; ms < 20000; ms += 50) for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) (firefly(x, y, ms) ? lit++ : dark++);
	assert.ok(lit > 0 && lit < dark / 50, `${lit} glowing of ${lit + dark}`);
});
