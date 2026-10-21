/**
 * art.mjs - reads the pictures in art/ (PNG files you draw yourself) for the
 * build. Each picture becomes rows of characters, one per pixel, like the
 * built-in sprites in src/ui/pixel.ts; its colours are kept exactly, in one
 * palette shared by every picture (characters from U+0100 up, so they never
 * clash with the built-in inks). Transparent pixels are empty.
 *
 * Only what a pixel editor saves is read: 8-bit (or paletted) PNGs, not
 * interlaced. That covers Piskel, Aseprite, Paint, GIMP and Photoshop's
 * defaults.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, extname, basename } from 'node:path';

/** A PNG as { w, h, rgba }. */
export function decodePng(buf) {
	if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
	let p = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0, plte = null, trns = null;
	const idat = [];
	while (p < buf.length) {
		const len = buf.readUInt32BE(p), kind = buf.toString('latin1', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
		if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
		else if (kind === 'PLTE') plte = data;
		else if (kind === 'tRNS') trns = data;
		else if (kind === 'IDAT') idat.push(data);
		else if (kind === 'IEND') break;
		p += 12 + len;
	}
	if (interlace) throw new Error('interlaced PNGs are not read: save it without interlacing');
	const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
	if (!channels) throw new Error(`PNG colour type ${type} is not read`);
	if (type !== 3 && depth !== 8) throw new Error(`${depth}-bit PNGs are not read: save as 8-bit`);
	const bpp = Math.max(1, (channels * depth) / 8), stride = Math.ceil((w * channels * depth) / 8);
	const raw = inflateSync(Buffer.concat(idat)), out = Buffer.alloc(stride * h);
	for (let y = 0; y < h; y++) {
		const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
		for (let x = 0; x < stride; x++) {
			const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
			let v = line[x];
			if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
			else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
			out[y * stride + x] = v & 255;
		}
	}
	const rgba = Buffer.alloc(w * h * 4);
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		const o = (y * w + x) * 4, row = y * stride;
		let r, g, b, al = 255;
		if (type === 3) {
			const per = 8 / depth, byte = out[row + Math.floor(x / per)], i = (byte >> ((per - 1 - (x % per)) * depth)) & ((1 << depth) - 1);
			r = plte[i * 3]; g = plte[i * 3 + 1]; b = plte[i * 3 + 2]; if (trns && i < trns.length) al = trns[i];
		} else {
			const s = row + x * channels;
			if (type === 0 || type === 4) { r = g = b = out[s]; if (type === 4) al = out[s + 1]; }
			else { r = out[s]; g = out[s + 1]; b = out[s + 2]; if (type === 6) al = out[s + 3]; }
		}
		rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = al;
	}
	return { w, h, rgba };
}

/** Every art/*.png as { palette: { char: '#rrggbb' }, images: { id: rows } }; problems are reported, not fatal. */
export function readArt(dir = 'art') {
	const palette = {}, byColour = new Map(), images = {};
	if (!existsSync(dir)) return { palette, images };
	for (const file of readdirSync(dir).filter((f) => extname(f).toLowerCase() === '.png').sort()) {
		try {
			const { w, h, rgba } = decodePng(readFileSync(join(dir, file)));
			const rows = [];
			for (let y = 0; y < h; y++) {
				let line = '';
				for (let x = 0; x < w; x++) {
					const o = (y * w + x) * 4;
					if (rgba[o + 3] < 128) { line += '.'; continue; }
					const hex = '#' + [rgba[o], rgba[o + 1], rgba[o + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
					let ch = byColour.get(hex);
					if (!ch) { ch = String.fromCodePoint(0x100 + byColour.size); byColour.set(hex, ch); palette[ch] = hex; }
					line += ch;
				}
				rows.push(line);
			}
			// Trim empty rows and columns round the picture, so it sits where it should.
			while (rows.length && /^\.*$/.test(rows[0])) rows.shift();
			while (rows.length && /^\.*$/.test(rows[rows.length - 1])) rows.pop();
			const lead = Math.min(...rows.map((r) => r.match(/^\.*/)[0].length)), tail = Math.min(...rows.map((r) => r.match(/\.*$/)[0].length));
			images[basename(file, extname(file)).toLowerCase()] = rows.map((r) => [...r].slice(lead, [...r].length - tail).join(''));
		} catch (e) {
			console.warn(`art/${file}: ${e.message}`);
		}
	}
	return { palette, images };
}
