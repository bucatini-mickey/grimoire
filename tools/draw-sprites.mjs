/**
 * draw-sprites.mjs - the devils in the margins of the book's first leaf, drawn by hand as pixel
 * grids (one letter a colour, '.' for none), written to art/margin-<name>.png. Edit a grid here
 * and run it again, or paint the PNGs themselves.
 *   node tools/draw-sprites.mjs
 */
import { writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const INK = {
	K: '#1e1410', // the ink line round everything
	F: '#e6cfae', f: '#c4a582', // flesh, its shade
	W: '#f2ede2', w: '#a9a296', // white hair and beard, its strokes
	R: '#d0502a', r: '#9c3519', // vermilion, its shade
	B: '#7aa3c8', b: '#4a6e93', N: '#2c4b7a', // azure, its shade, lapis
	Y: '#c39a45', // gold
	G: '#8a8580', g: '#5e5955', // the grey beast's hide, its wing
	V: '#7f5a86', v: '#5a3d62' // violet, its shade
};

/** After the drollery in the margin of a Book of Hours: a bearded man with a beast's ears, a lion's
 * face for a belly and blue legs, one arm thrown up, one reaching out, dancing on a knot. */
const DROLLERY = [
	'..........K........K..........',
	'.........KfK......KfK.........',
	'.........KffK....KffK.........',
	'.........KfFK....KfFK.........',
	'.........KFfFKKKKFfFK.........',
	'..........KFWWwWWwWFK.........',
	'..........KWWwWWwWFFFK........',
	'..........KWwWWwFKKKFFK.......',
	'..........KWWWwFFFWWKFK.......',
	'.....KFK..KWWwWFFFFFFFFFK.....',
	'....KFFFK.KWwWFFFFFFFFFFFK....',
	'....KFFK..KWWwFFFFFFFFFFKK....',
	'...KRRK...KWWwWFFFFFKrrK......',
	'..KRRK.....KWwWWWwWWKKKK......',
	'..KRRRK..KKKKWwWWWwWKKK.......',
	'...KRRRKKRRRRKWWwWwKRRRKK.....',
	'....KRRRRRRRRRKWwWKRRRRRRRKKK.',
	'.....KRRRRRrRRRKKRRRRRRRRRRRKK',
	'......KRRRRRrRRRRRRRRRKKKKKFFK',
	'......KRRRRRRrRRRRRRRK...KFFK.',
	'......KRRRRRRRRRRRRRRK....KK..',
	'.......KRRRRRRRRRRRK..........',
	'......KWKWKRRRRRRRRK..........',
	'...KK.KWKWWKWKKKKKK...........',
	'..KfKWWwWWwWWWKfK.............',
	'..KKWWWWWWWWWWWKKBK...........',
	'...KWKKWWWWWKKWKKBBK..........',
	'...KWWKWWWWWKWWWKBBBK.........',
	'...KwWWWWKKWWWWwKBBBBK........',
	'...KWwWWKRRKWWwWKBBBBBK.......',
	'....KwWWKRWRKWWwKbBBBBBK......',
	'....KWwWWKKKWWwKbbBBKBBBK.....',
	'......KKWwWwKKbbBBK..KBBK.....',
	'........KKKKbbbBBK..KBBK......',
	'.........KbbbKBBK...KBBK......',
	'........KbbK.KBBK..KBBK.......',
	'.......KbbK..KBBK..KBBBK......',
	'......KbbK...KBBK...KBBK......',
	'......KbK....KBBK....KKK......',
	'.....KbbK...KBBBK.............',
	'....KbbbK..KBBBBK.............',
	'...KKKKKK..KKKKKK.............',
	'..KKKKKKKKKKKKKKKKKK..........',
	'.KYRNRYRNRYRNRYRNRYK..........',
	'..KKKKKKKKKKKKKKKKKK..........'
];

/** The blue devil of the Avarice page: horned and grinning, a bat's wing, claws out, on a ledge. */
const BLUE = [
	'..........K....K....',
	'.........KbK..KbK...',
	'........KbK..KbK....',
	'.......KbK..KbK.....',
	'....KKKbKKKKbK......',
	'...KBBBBBBBBBBK.....',
	'..KBBWWKBBBBBBBK....',
	'..KBBWKKBBBBBBBKK...',
	'.KBBBBBBBBBBBBKbK...',
	'KBBBBBBBBBBBBBKbK...',
	'KBBKKBBBBBBBBK.K....',
	'.KK.KBBBBBBBBK......',
	'...KWKWKWKBBBK......',
	'...KKKKKKKBBK.......',
	'.....KbKBBBK........',
	'......K.KBBK........',
	'......KKBBBBKK...KK.',
	'....KKBBBBBBBBKKNNK.',
	'...KBBBKBBBBBBBKNNNK',
	'..KBBK.KBBBbBBBKNKNK',
	'.KBK...KBBBbBBBKK.K.',
	'KWKWK..KBBBBbBBK....',
	'.......KBBBBbBBK....',
	'.......KBBBBBBK.....',
	'.......KbBBBBBK..KK.',
	'......KbbBKBBBK.KBK.',
	'......KbBK.KBBKKBK..',
	'.....KbBK..KBBBBK...',
	'.....KbBK...KBBK....',
	'....KbBK....KBBK....',
	'....KbBK....KBBK....',
	'...KbBK......KBBK...',
	'..KbBBK......KBBBK..',
	'.KWKWK......KWKWK...',
	'KRRRRRRRRRRRRRRRRRK.',
	'KrrrrrrrrrrrrrrrrrK.',
	'.KKKKKKKKKKKKKKKKK..'
];

/** The grey beast of the Avarice page, crouched, grinning wide, a bat's wing raised behind it. */
const GREY = [
	'KK.................K.....K....',
	'KgK...............KgK...KgK...',
	'KggK...............KgK.KgK....',
	'KgggK...........KKKKgKKgKKK...',
	'KgKggK.........KGGGGGGGGGGGK..',
	'KgKgggK.......KGGGYKGGGYKGGGK.',
	'KgKKgggK.....KGGGGGGGGGGGGGGGK',
	'.KgKKgggK....KGGKKKKKKKKKKKGGK',
	'..KgKKgggK...KGKWKWKWKWKWKWKGK',
	'...KgKKggKKKKKGKKKKKKKKKKKKKGK',
	'.K..KKKKKGGGGGKGGGGGGGGGGGGGK.',
	'KgK.KGGGgGGGGGGGKKGGGGGGGKK...',
	'KgK.KGGGGgGGGGGGGGKKKKKKK.....',
	'.KgKKGGGGGgGGGGGGGGGGK........',
	'..KKGGGGGGGGgGGGGGGGGGK.......',
	'...KGGGGGGGGGGGGGGGGGGGK......',
	'...KGGKKGGGGGGGGKKKGGGGK......',
	'...KGGK.KGGK..KGGK.KGGK.......',
	'..KGGK..KGGK..KGGK..KGGK......',
	'..KGGK..KGGK...KGGK.KGGK......',
	'.KWKWK.KWKWK..KWKWK.KWKWK.....',
	'KYYYYYYYYYYYYYYYYYYYYYYYYYK...'
];

/** A grotesque from the foot of a page: a red bird-headed thing, crested, its body violet, its wing and tail blue leaves. */
const GROTESQUE = [
	'...K.K.K....................',
	'...KRKRK....................',
	'..KRRRRRK...................',
	'.KRRWKRRRK..................',
	'KYYKRRRRRK..................',
	'KYRRKRRRRK.......KK.........',
	'KYYYKRRRRK......KBBK........',
	'.KKK.KRRRK.....KBbBK..KK....',
	'.....KRRRRK...KBbBBK.KBBK...',
	'......KRRRRK.KBbBBKKBbBK....',
	'.......KRRRRKKBBBBBBbBK.....',
	'.......KVVVVVVKBBBBBBK......',
	'......KVVVvVVVVKKKKKK..KK...',
	'......KVVVVvVVVVVVK...KBBK..',
	'.......KVVVVVvVVVVVK.KBbBK..',
	'........KVVVVVVVVVVVKBbBK...',
	'.........KKVVVVVVVKKBbBK....',
	'..........KYK..KYK.KBBK.....',
	'.........KYYK.KYYK..KK......',
	'........KKKKKKKKKKK.........'
];

const chunk = (k, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const b = Buffer.concat([Buffer.from(k, 'latin1'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(b) >>> 0); return Buffer.concat([l, b, c]); };
function png(name, grid, k = 1, path = `art/margin-${name}.png`) {
	const h = grid.length * k, w = Math.max(...grid.map((r) => r.length)) * k;
	const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
	const raw = Buffer.alloc((w * 4 + 1) * h);
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		const hex = INK[grid[Math.floor(y / k)][Math.floor(x / k)]] ?? (k > 1 ? '#e4dccb' : null);
		if (!hex) continue;
		const o = y * (w * 4 + 1) + 1 + x * 4;
		[1, 3, 5].forEach((j, i) => { raw[o + i] = parseInt(hex.slice(j, j + 2), 16); });
		raw[o + 3] = 255;
	}
	writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
	console.log(`${path} ${w}x${h}`);
}
png('drollery', DROLLERY);
png('blue', BLUE);
png('grey', GREY);
png('grotesque', GROTESQUE);
