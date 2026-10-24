/**
 * title-png.mjs - writes art/title.png from a JSON bitmap of alpha values ({w, h, rows: hex
 * strings, two digits a pixel}), as captured from the UnifrakturMaguntia face in a browser
 * canvas. The title is white on transparent: the page colours it (gilt, blood, the carving).
 *   node tools/title-png.mjs bitmap.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const { w, h, rows } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const chunk = (k, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const b = Buffer.concat([Buffer.from(k, 'latin1'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(b) >>> 0); return Buffer.concat([l, b, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
const raw = Buffer.alloc((w * 4 + 1) * h);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
	const o = y * (w * 4 + 1) + 1 + x * 4;
	raw[o] = raw[o + 1] = raw[o + 2] = 255;
	raw[o + 3] = parseInt(rows[y].slice(x * 2, x * 2 + 2), 16);
}
writeFileSync('art/title.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`art/title.png ${w}x${h}`);
