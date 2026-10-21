import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync, crc32 } from 'node:zlib';
// @ts-expect-error: a plain .mjs build tool, no types
import { readArt } from '../tools/art.mjs';
import { registerArt, sprite, svg, hasOwn } from '../src/ui/pixel.ts';

/** A minimal PNG: colour type 6 (RGBA) or 3 (palette + tRNS), with a Sub filter on every row. */
function png(w: number, h: number, type: 3 | 6, px: (x: number, y: number) => number[]): Buffer {
	const chunk = (kind: string, data: Buffer) => {
		const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(kind, 'latin1'), data]);
		const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
		return Buffer.concat([len, body, crc]);
	};
	const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = type;
	const bpp = type === 6 ? 4 : 1, rows: number[] = [];
	for (let y = 0; y < h; y++) {
		const line: number[] = [];
		for (let x = 0; x < w; x++) line.push(...px(x, y));
		rows.push(1, ...line.map((v, i) => (v - (i >= bpp ? line[i - bpp] : 0)) & 255)); // filter 1: Sub
	}
	const extra = type === 3 ? [chunk('PLTE', Buffer.from([0, 0, 0, 200, 40, 30])), chunk('tRNS', Buffer.from([0, 255]))] : [];
	return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), ...extra, chunk('IDAT', deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0))]);
}

test('your own pictures: PNGs read exactly, trimmed, and drawn in their own colours', () => {
	const dir = mkdtempSync(join(tmpdir(), 'grimoire-art-'));
	// A 6x5 logo: transparent border, a red bar over a gold bar.
	writeFileSync(join(dir, 'logo.png'), png(6, 5, 6, (x, y) => (x === 0 || x === 5 || y === 0 ? [0, 0, 0, 0] : y < 3 ? [200, 40, 30, 255] : [220, 170, 40, 255])));
	// A paletted 3x2 picture: index 0 is transparent, index 1 red.
	writeFileSync(join(dir, 'imp.png'), png(3, 2, 3, (x) => [x === 1 ? 1 : 0]));
	const art = readArt(dir);
	assert.deepEqual(Object.keys(art.images).sort(), ['imp', 'logo']);
	assert.equal(art.images.logo.length, 4);
	assert.equal([...art.images.logo[0]].length, 4);
	const red = Object.entries(art.palette).find(([, hex]) => hex === '#c8281e')![0];
	assert.equal(art.images.logo[0], red.repeat(4));
	assert.deepEqual(art.images.imp, [red, red], 'paletted, trimmed to the red column, the same red shared');
	registerArt(art);
	assert.ok(hasOwn('tower') && hasOwn('imp'));
	assert.deepEqual(sprite('tower'), art.images.logo, 'the logo replaces the clocktower');
	assert.match(svg(sprite('imp')!), /fill="#c8281e"/);
});
