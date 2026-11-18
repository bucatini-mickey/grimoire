/**
 * grade-timing.ts - how long the town's light takes: fitting a map's palette (once per town, level and
 * phase) and lighting a screenful of cells (every frame).
 *   node tools/dev/grade-timing.ts [town]
 */
import { readFileSync } from 'node:fs';
import { parseBlueprint } from '../../src/town/blueprint.ts';
import { makeWorld } from '../../src/town/map.ts';
import { lightAt, lightMap, MIST, sky, sources, townColours } from '../../src/town/look.ts';
import { GRADES, Inks, fitPalette, litInFog, thin } from '../../src/town/grade.ts';

const name = process.argv[2] ?? 'talmberg';
const t = makeWorld(parseBlueprint(readFileSync(new URL(`../../town/${name}.tbp`, import.meta.url), 'utf8'))).levels[0];
for (const phase of ['day', 'night'] as const) {
	const g = GRADES[phase];
	let t0 = performance.now();
	const raw = townColours(t, g, 2, MIST, [], []);
	const t1 = performance.now();
	const { colours, weights } = thin(raw);
	const inks = new Inks(fitPalette(colours, 172, weights), 80);
	const t2 = performance.now();
	console.log(`${name} ${phase}: ${raw.length} samples (${colours.length} distinct) in ${(t1 - t0).toFixed(0)} ms, fitted in ${(t2 - t1).toFixed(0)} ms`);
	// A frame: relight with flickering flames, then light and ink 48 x 32 cells.
	const sk = sky(t);
	t0 = performance.now();
	for (let f = 0; f < 20; f++) {
		const dyn = lightMap(t, sources(t, f * 160));
		for (let y = 0; y < 32; y++) for (let x = 0; x < 48; x++) inks.of(litInFog([120, 100, 80], MIST, 0.2, lightAt(t, sk, dyn, g, x + 10, y + 10), g));
	}
	console.log(`  a frame: ${((performance.now() - t0) / 20).toFixed(2)} ms`);
}
