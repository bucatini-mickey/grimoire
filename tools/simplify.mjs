/**
 * simplify.mjs - makes a smaller, plainer picture from one you drew: each
 * block of pixels becomes its commonest colour, and colours closer than
 * `merge` are folded together, so it reads cleanly as ASCII blocks.
 *
 *   node tools/simplify.mjs art/originals/logo-32.png art/logo.png [scale=2] [merge=48]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { decodePng } from './art.mjs';

const [src, out, scaleArg = '2', mergeArg = '48'] = process.argv.slice(2);
const scale = Number(scaleArg), merge = Number(mergeArg);
const { w, h, rgba } = decodePng(readFileSync(src));
const W = Math.floor(w / scale), H = Math.floor(h / scale);
const key = (o) => (rgba[o + 3] < 128 ? null : [rgba[o], rgba[o + 1], rgba[o + 2]]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// The palette: every colour in the picture, by how much of it there is; each folded into a commoner one near it.
const count = new Map();
for (let i = 0; i < w * h; i++) { const c = key(i * 4); if (c) count.set(c.join(), (count.get(c.join()) ?? 0) + 1); }
const palette = [];
for (const [s] of [...count].sort((a, b) => b[1] - a[1])) { const c = s.split(',').map(Number); if (!palette.some((p) => dist(p, c) < merge)) palette.push(c); }
const nearest = (c) => palette.reduce((best, p) => (dist(p, c) < dist(best, c) ? p : best));

const outPx = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
	const votes = new Map();
	for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
		const c = key(((y * scale + dy) * w + x * scale + dx) * 4);
		const k = c ? nearest(c).join() : 'none';
		votes.set(k, (votes.get(k) ?? 0) + 1);
	}
	const win = [...votes].sort((a, b) => b[1] - a[1])[0][0], o = (y * W + x) * 4;
	if (win !== 'none') { const [r, g, b] = win.split(',').map(Number); outPx.set([r, g, b, 255], o); }
}

const chunk = (kind, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(kind, 'latin1'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0); return Buffer.concat([len, body, crc]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) outPx.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`${src} ${w}x${h} -> ${out} ${W}x${H}, ${new Set([...Array(W * H).keys()].map((i) => outPx.subarray(i * 4, i * 4 + 4).join())).size} colours (from ${count.size})`);
