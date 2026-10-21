/**
 * logo-pop.mjs - the logo with a bigger clock and the blood brighter: the
 * wooden frame of art/logo.png kept, the middle redrawn. One-off; edit and run again.
 *   node tools/logo-pop.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { decodePng } from './art.mjs';

const { w, h, rgba } = decodePng(readFileSync('art/logo.png'));
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const set = (x, y, c) => { const o = (y * w + x) * 4; rgba.set([...hex(c), 255], o); };
const WOOD = ['#80592d', '#53320d'];
const GOLD = '#f2c23a', RIM = '#120d08', FACE = '#fbf3cf', HAND = '#c2861a', RED = '#e3261c', DARK = '#7d0f0a';
// Clear the old clock and drips back to wood (the planks alternate by row).
for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
	const o = (y * w + x) * 4, c = '#' + [rgba[o], rgba[o + 1], rgba[o + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
	if (!WOOD.includes(c) && c !== '#aa976e') set(x, y, WOOD[(y + (x > 7 ? 1 : 0)) % 2]);
}
// The clock: a gold ring, a black rim, a bright face.
const cx = 7.5, cy = 6.5;
for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
	const d = Math.hypot(x - cx, y - cy);
	if (d <= 3.4) set(x, y, FACE);
	else if (d <= 4.5) set(x, y, RIM);
	else if (d <= 5.4) set(x, y, GOLD);
}
// The hands: to twelve and to three, the boss in the middle.
for (const [x, y] of [[7, 4], [7, 5], [7, 6], [8, 7], [9, 7], [7, 7]]) set(x, y, HAND);
// The blood: welling at the foot of the rim and running down in three drips.
for (const [x, y] of [[5, 10], [6, 11], [7, 11], [8, 11], [9, 11], [10, 10]]) set(x, y, RED);
for (const [x, top, bot] of [[5, 11, 12], [7, 12, 14], [9, 12, 13]]) { for (let y = top; y < bot; y++) set(x, y, RED); set(x, bot, DARK); }
set(8, 12, RED);

const chunk = (k, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const b = Buffer.concat([Buffer.from(k, 'latin1'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(b) >>> 0); return Buffer.concat([l, b, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
const raw = Buffer.alloc((w * 4 + 1) * h);
for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
writeFileSync('art/logo.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('art/logo.png redrawn');
