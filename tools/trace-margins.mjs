/**
 * trace-margins.mjs - turns a painted manuscript picture into a margin picture (art/margin-<name>.png),
 * keeping the paint: each pixel is the average of the paint under it, the ink line laid over that
 * paint as strongly as it was there, and the vellum round the figure taken away.
 *
 *   npm i --no-save sharp        (reads jpg, png and webp; not a dependency of the app)
 *   node tools/trace-margins.mjs <picture> <name> <x0> <y0> <x1> <y1> <height> [eye=x,y ...]
 *
 * x0..y1 is the crop round the figure, in the picture's pixels; height is the margin picture's height
 * in pixels. The page draws two pixels to a row and one to a column, so 38 high is 19 rows; the
 * book's text is 52 wide. An eye (in the picture's pixels) is painted back in as a pupil in a pale
 * ring: at this size the averaging loses it, and a face without one is a smudge.
 * Give a figure smaller copies too (name-small, name-tiny) so a fuller page still has one.
 */
import { writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const args = process.argv.slice(2);
const eyes = args.filter((a) => a.startsWith('eye=')).map((a) => a.slice(4).split(',').map(Number));
const [src, name, ...nums] = args.filter((a) => !a.startsWith('eye='));
const [x0, y0, x1, y1, H] = nums.map(Number);
if (!src || !name || [x0, y0, x1, y1, H].some((n) => !Number.isFinite(n))) {
	console.log('usage: node tools/trace-margins.mjs <picture> <name> <x0> <y0> <x1> <y1> <height>');
	process.exit(1);
}
const sharp = (await import('sharp')).default;
const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const px = (x, y) => { const i = (y * info.width + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
const luma = ([a, b, e]) => 0.3 * a + 0.59 * b + 0.11 * e;

// The vellum: the middle colour of the crop's edge.
const edge = [];
for (let x = x0; x < x1; x += 3) edge.push(px(x, y0), px(x, y1 - 1));
for (let y = y0; y < y1; y += 3) edge.push(px(x0, y), px(x1 - 1, y));
const vellum = [0, 1, 2].map((k) => edge.map((p) => p[k]).sort((a, b) => a - b)[edge.length >> 1]);
const lv = luma(vellum);

const s = (y1 - y0) / H, W = Math.round((x1 - x0) / s);
const keep = [], col = [];
for (let r = 0; r < H; r++) for (let q = 0; q < W; q++) {
	let n = 0, fg = 0, dk = 0;
	const paint = [0, 0, 0], ink = [0, 0, 0], all = [0, 0, 0];
	for (let y = Math.floor(y0 + r * s); y < Math.floor(y0 + (r + 1) * s); y++) for (let x = Math.floor(x0 + q * s); x < Math.floor(x0 + (q + 1) * s); x++) {
		const p = px(x, y);
		n++;
		p.forEach((v, k) => { all[k] += v; });
		const sat = Math.max(...p) - Math.min(...p);
		// Vellum, or paper paler than it: not the figure.
		if (Math.hypot(p[0] - vellum[0], p[1] - vellum[1], p[2] - vellum[2]) < 40 || (luma(p) > lv - 14 && sat < 40)) continue;
		fg++;
		if (luma(p) < 80) { dk++; p.forEach((v, k) => { ink[k] += v; }); } else p.forEach((v, k) => { paint[k] += v; });
	}
	const m = fg - dk;
	let cc;
	if (fg) {
		cc = m ? paint.map((v) => v / m) : ink.map((v) => v / dk);
		// The ink line over the paint, as strong as it was under this pixel.
		if (dk && m) { const k = Math.min(1, (dk / fg) * 1.4); cc = cc.map((v, i) => v * (1 - k) + (ink[i] / dk) * k); }
	} else cc = all.map((v) => (v / n) * 0.93); // pale fur keeps a touch of shade, so it still reads
	col.push(cc.map(Math.round));
	keep.push(fg / n >= 0.4);
}

// The vellum is what the edge reaches through empty pixels; pale paint inside the outline stays.
const reach = new Uint8Array(W * H), todo = [];
for (let q = 0; q < W; q++) todo.push(q, (H - 1) * W + q);
for (let r = 0; r < H; r++) todo.push(r * W, r * W + W - 1);
const near = (i) => { const r = (i / W) | 0, q = i % W; return [q > 0 ? i - 1 : -1, q < W - 1 ? i + 1 : -1, r > 0 ? i - W : -1, r < H - 1 ? i + W : -1].filter((k) => k >= 0); };
while (todo.length) {
	const i = todo.pop();
	if (reach[i] || keep[i]) continue;
	reach[i] = 1;
	todo.push(...near(i));
}
const on = keep.map((k, i) => k || !reach[i]);
// Stains and stray marks: pieces under thirty pixels go.
const seen = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) {
	if (!on[i] || seen[i]) continue;
	const piece = [], stack = [i];
	seen[i] = 1;
	while (stack.length) {
		const j = stack.pop();
		piece.push(j);
		for (const k of near(j)) if (on[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
	}
	if (piece.length < 30) for (const j of piece) on[j] = false;
}

// The eyes: a pupil, pale on the side it looks from.
for (const [ex, ey] of eyes) {
	const q = Math.round((ex - x0) / s - 0.5), r = Math.round((ey - y0) / s - 0.5);
	if (q < 1 || r < 0 || q >= W || r >= H) continue;
	col[r * W + q] = [30, 22, 16]; on[r * W + q] = true;
	col[r * W + q - 1] = [236, 228, 208]; on[r * W + q - 1] = true;
}

const chunk = (k, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const b = Buffer.concat([Buffer.from(k, 'latin1'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(b) >>> 0); return Buffer.concat([l, b, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
const raw = Buffer.alloc((W * 4 + 1) * H);
on.forEach((o, i) => {
	if (!o) return;
	const y = (i / W) | 0, x = i % W, at = y * (W * 4 + 1) + 1 + x * 4;
	raw.set([...col[i], 255], at);
});
writeFileSync(`art/margin-${name}.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`art/margin-${name}.png ${W}x${H}`);
