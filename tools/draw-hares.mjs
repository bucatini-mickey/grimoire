/**
 * draw-hares.mjs - writes the hares at the foot of the book's pages (art/margin-<name>.png) from
 * art/hares.json: an ink for each letter, and each figure as rows of letters ('.' for none).
 *   node tools/draw-hares.mjs
 * The easier way is tools/hare-editor.html, which edits art/hares.json and writes the pictures itself.
 * Then restart `npm run dev` to see them.
 */
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const { ink, figures } = JSON.parse(readFileSync('art/hares.json', 'utf8'));

const chunk = (k, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const b = Buffer.concat([Buffer.from(k, 'latin1'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(b) >>> 0); return Buffer.concat([l, b, c]); };
function png(name, grid) {
	const h = grid.length, w = Math.max(...grid.map((r) => r.length));
	const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
	const raw = Buffer.alloc((w * 4 + 1) * h);
	grid.forEach((row, y) => [...row].forEach((ch, x) => {
		const hex = ink[ch];
		if (!hex) return;
		const o = y * (w * 4 + 1) + 1 + x * 4;
		[1, 3, 5].forEach((k, i) => { raw[o + i] = parseInt(hex.slice(k, k + 2), 16); });
		raw[o + 3] = 255;
	}));
	writeFileSync(`art/margin-${name}.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
	console.log(`art/margin-${name}.png ${w}x${h}`);
}
for (const [name, grid] of Object.entries(figures)) png(name, grid);
// A figure no longer in the file leaves the page too.
for (const f of readdirSync('art')) {
	const m = f.match(/^margin-(.+)\.png$/);
	if (m && !(m[1] in figures)) { unlinkSync(`art/${f}`); console.log(`removed art/${f}`); }
}
