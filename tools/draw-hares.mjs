/**
 * draw-hares.mjs - the hares at the foot of the book's pages, drawn by hand after the marginalia of the
 * old books (a hare blowing a trumpet, one with sword and shield, one with a spear and pennant): one
 * letter a colour, '.' for none, written to art/margin-<name>.png. Edit a grid and run it again, then
 * restart `npm run dev`.
 *   node tools/draw-hares.mjs
 * Each is drawn in several browns and a brown ink line rather than black, so it looks painted on the
 * vellum rather than stuck to it.
 */
import { writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const INK = {
	O: '#4a3422', // the ink line, brown
	B: '#9a7b55', b: '#785f42', F: '#cdb592', // the fur: brown, its shadow, its light (the book's own inks)
	W: '#dcb38c', E: '#241c17', P: '#c98d78', // belly and tail, eye, the inside of an ear
	Y: '#c09a48', y: '#8a6a2a', // brass, and wood
	R: '#c2522e', r: '#8c2a22', // vermilion
	S: '#c4c2ba', s: '#7c7a72' // steel
};

/** A hare on his hind legs, blowing a long trumpet. */
const TRUMPETER = [
	'..............O..O....',
	'.............OPO.OBO..',
	'.............OPO.OFO..',
	'.............OPOOBO...',
	'............OFFBBBO...',
	'...........OFEBFBBO...',
	'OO........OFBBBBBO....',
	'YYO......OFBBbBFO.....',
	'YYyyyyyyyYYBFbBBO.....',
	'YYO......OWBBBFBBO....',
	'OO.......OWWBFBBBbO...',
	'.........OWWBBBBbbO.OO',
	'..........OWBFBbbbOOWO',
	'..........OBBObbBBOO..',
	'.........OBbO.OBbO....',
	'........OOOO.OOOO.....'
];

/** A hare with a red shield, a cross on it, and a sword held up. */
const KNIGHT = [
	'..............s...',
	'.....O..O.....S...',
	'....OPO.OBO...S...',
	'....OPO.OFO...S...',
	'.....OPOOBO...S...',
	'....OFFBBBO..YS...',
	'...OFEBFBBO.YYY...',
	'..OFBBBBBO...OO...',
	'..ORRRRBFBBOOBO...',
	'.ORRYRRBBBFBBO....',
	'.ORYYYRBFBBBO.....',
	'.ORRYRRBBBBbO.....',
	'.OrRRRRBFBbbO.OO..',
	'..OrRRBBBbbbOOWO..',
	'...OrBBObbBBOO....',
	'....OBbO.OBbO.....',
	'...OOOO.OOOO......'
];

/** A hare marching with a spear, a red pennant at its head. */
const SPEARMAN = [
	'....S...........',
	'...SSS..........',
	'....s...........',
	'.RRRy...........',
	'RRRRy...O..O....',
	'.RRry..OPO.OBO..',
	'....y..OPO.OFO..',
	'....y...OPOOBO..',
	'....y..OFFBBBO..',
	'....y.OFEBFBBO..',
	'....yOFBBBBBO...',
	'...OFFBBbBFO....',
	'....yOWBBFBBO...',
	'....yOWWBBBBbO..',
	'....yOWWBFBbbO.O',
	'....y.OWBBbbbOWO',
	'....y.OBBObbBOO.',
	'....yOBbO..OBbO.',
	'....OOOO....OOO.'
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
png('trumpeter', TRUMPETER);
png('knight', KNIGHT);
png('spearman', SPEARMAN);
