/**
 * overview.ts - a whole town from above, by daylight, as a PNG: each cell a square of its ground, its
 * glyph's colour in the middle. For checking a generator's layout at a glance.
 *   node tools/dev/overview.ts castle out.png [level]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { parseBlueprint } from '../../src/town/blueprint.ts';
import { makeWorld } from '../../src/town/map.ts';
import { lookAt } from '../../src/town/look.ts';

const [file, out, lv = '0'] = process.argv.slice(2);
const world = makeWorld(parseBlueprint(readFileSync(new URL(`../../town/${file}.tbp`, import.meta.url), 'utf8')));
const t = world.levels[+lv];
const K = 6, w = t.w * K, h = t.h * K;
const raw = Buffer.alloc((w * 3 + 1) * h);
const set = (px: number, py: number, c: number[]) => { const o = py * (w * 3 + 1) + 1 + px * 3; for (let k = 0; k < 3; k++) raw[o + k] = Math.max(0, Math.min(255, Math.round(c[k]))); };
for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
	const c = t.cells[x + y * t.w];
	const open = c.tile === 'open' && !c.mat;
	const look = open ? { fg: [20, 20, 24], bg: [12, 12, 14], ch: ' ', wall: undefined } : lookAt(t, x, y, 0);
	const wall = !!look.wall || c.tile === 'wall';
	for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) {
		const mid = i >= 2 && i < 4 && j >= 2 && j < 4;
		set(x * K + i, y * K + j, wall ? look.fg : mid && look.ch.trim() ? look.fg : look.bg);
	}
}
const chunk = (k: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const b = Buffer.concat([Buffer.from(k, 'latin1'), d]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc32(b) >>> 0); return Buffer.concat([l, b, cc]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
