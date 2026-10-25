/** dbg.ts - prints what can be walked round a cell of a town (# wall, T tree, d door, ~ water, x blocked): node tools/dev/dbg.ts grimm 32 30 7 */
import { readFileSync } from 'node:fs';
import { parseBlueprint } from '../../src/town/blueprint.ts';
import { makeWorld, walkable } from '../../src/town/map.ts';
const file = process.argv[2], x0 = +process.argv[3], y0 = +process.argv[4], r = +(process.argv[5] ?? 6);
const t = makeWorld(parseBlueprint(readFileSync(new URL(`../../town/${file}.tbp`, import.meta.url), 'utf8'))).levels[0];
for (let y = y0 - r; y <= y0 + r; y++) {
	let s = '';
	for (let x = x0 - r * 2; x <= x0 + r * 2; x++) {
		const c = t.cells[x + y * t.w];
		if (!c) { s += ' '; continue; }
		s += x === x0 && y === y0 ? '@' : c.tile === 'wall' ? (c.mat === 'pine' ? 'T' : '#') : c.things.includes('door') ? 'd' : c.mat === 'water' && !c.things.includes('plank bridge') ? '~' : walkable(t, x, y) ? '.' : 'x';
	}
	console.log(s);
}
