/**
 * sprite-png.mjs - writes margin pictures (art/margin-<name>.png) from a JSON file of sprites
 * captured in a browser canvas: { name: { w, h, rows: hex colours six digits a pixel, '------'
 * for none } }. Pixels as pale as the vellum are dropped, so the page shows through.
 *   node tools/sprite-png.mjs sprites.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const sprites = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const chunk = (k, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const b = Buffer.concat([Buffer.from(k, 'latin1'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(b) >>> 0); return Buffer.concat([l, b, c]); };
for (const [name, { w, h, rows }] of Object.entries(sprites)) {
	const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
	const raw = Buffer.alloc((w * 4 + 1) * h);
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		const hex = rows[y].slice(x * 6, x * 6 + 6);
		const o = y * (w * 4 + 1) + 1 + x * 4;
		if (hex === '------') continue;
		const [r, g, b] = [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16));
		if (0.3 * r + 0.59 * g + 0.11 * b > 188) continue;
		raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
	}
	writeFileSync(`art/margin-${name}.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
	console.log(`art/margin-${name}.png ${w}x${h}`);
}
