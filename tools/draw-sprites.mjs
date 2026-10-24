/**
 * draw-sprites.mjs - the devils in the margins of the book's first leaf, drawn by hand as pixel
 * grids (one letter a colour, '.' for none), written to art/margin-<name>.png. Edit a grid here
 * and run it again, or paint the PNGs themselves.
 *   node tools/draw-sprites.mjs
 */
import { writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const INK = {
	K: '#2a1810', // outline
	R: '#8c2a22', r: '#5e1a14', // red body, its shade (the page's own rubric)
	B: '#3a5576', b: '#26344a', // blue body, its shade (the page's lapis)
	W: '#efe6cf', // eyes, teeth
	Y: '#c69a45', y: '#8a6a2a', // gold: the trident, horns
	G: '#5a8040' // a leaf of the vine he stands on
};

/** A red imp, grinning, wings spread, a gold trident in his hand. */
const IMP = [
	'..............Y.Y.Y',
	'..y.......y...Y.Y.Y',
	'..yK.....Ky...YYYYY',
	'...KKKKKKK......Y..',
	'..KRRRRRRRK.....Y..',
	'..KRWKRKWRK.....Y..',
	'..KRRRRRRRK.....Y..',
	'..KRKWWWKRK.....Y..',
	'...KRRRRRK......Y..',
	'.K..KRRRK..K....Y..',
	'KrK.KRRRK.KrK..KY..',
	'KrrKRRRRRKKrrKKRY..',
	'KrrRRRRRRRRrrRRRY..',
	'.KrKRRRRRRKrK..KY..',
	'..K.KRRRRK.K....Y..',
	'....KRRRRK......Y..',
	'....KRKKRK......Y..',
	'....KRK.KRK.....Y..',
	'...KRK...KRK....Y..',
	'...KK.....KK.K..Y..',
	'.............KR.Y..',
	'.GG.GG..GG.GG.KRK..',
	'GG.GG.GG.GG.GG.KK..'
];

/** A blue imp crouched, claws out, a long tail curling behind. */
const BLUE = [
	'.y.......y.......',
	'.yK.....Ky.......',
	'..KKKKKKK........',
	'.KBBBBBBBK.......',
	'.KBWKBWKBK.......',
	'.KBBBBBBBK.......',
	'.KBKYYYKBK.......',
	'..KBBBBBK........',
	'.KBBBBBBBK.......',
	'KBBKBBBKBBK......',
	'KWK.KBBK.KWK.....',
	'....KBBBK........',
	'...KBBKBBK.....K.',
	'..KbBK.KBbK...KB.',
	'..KBK...KBK..KBK.',
	'.KBK.....KBKKBK..',
	'.KK.......KKKK...',
	'GG.GG.GG.GG.GG.GG'
];

const chunk = (k, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const b = Buffer.concat([Buffer.from(k, 'latin1'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(b) >>> 0); return Buffer.concat([l, b, c]); };
function png(name, grid) {
	const h = grid.length, w = Math.max(...grid.map((r) => r.length));
	const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
	const raw = Buffer.alloc((w * 4 + 1) * h);
	grid.forEach((row, y) => [...row].forEach((ch, x) => {
		const hex = INK[ch];
		if (!hex) return;
		const o = y * (w * 4 + 1) + 1 + x * 4;
		[1, 3, 5].forEach((k, i) => { raw[o + i] = parseInt(hex.slice(k, k + 2), 16); });
		raw[o + 3] = 255;
	}));
	writeFileSync(`art/margin-${name}.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
	console.log(`art/margin-${name}.png ${w}x${h}`);
}
png('imp', IMP);
png('blue', BLUE);
