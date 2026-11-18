/**
 * make-abbey-sazava.mjs - draws town/abbey-sazava.tbp: an alternative St. Cuthwin's, after Sázava (kept on
 * 18 Nov in case the abbey switches to it; not in the game: to use it, write it to abbey.tbp instead).
 *
 * 72 x 58 m, a square a metre. Sázava's Gothic church was never finished: here only the presbytery and the
 * tower stand roofed; the nave is grass with its piers and broken walls, where the town meets round a
 * statue of St Procopius. The convent round its cloister south of the presbytery: the chapter hall (sixteen
 * at the table) on the east wing with the dorter of ten cells above, the refectory and kitchen on the south.
 * The prelature to the west, the foundations of the old Holy Cross church, guest houses, the infirmary,
 * the mill, garden terraces down to the river, the graves.
 *
 *   node town/make-abbey-sazava.mjs
 */
import { plan } from './gen.mjs';
function dorter(P, x0, y0, x1, y1, along, wall, floor, pitch = 3) {
	P.upRoom(x0, y0, x1, y1, wall, floor);
	const W = (x, y) => P.up(x, y, `wall ${wall}`), F = (x, y, k) => P.up(x, y, `floor ${floor} | ${k}`);
	let n = 0;
	if (along === 'y') {
		const c = (x0 + x1) >> 1;
		for (let y = y0 + 1; y < y1; y++) { W(c - 1, y); W(c + 1, y); }
		for (let y = y0 + pitch; y < y1; y += pitch) for (let x = x0; x <= x1; x++) if (x !== c) W(x, y);
		for (let a = y0; a + pitch <= y1; a += pitch, n++) {
			F(c - 1, a + 1, 'door'); F(c + 1, a + 1, 'door'); F(x0 + 1, a + 1, 'bed'); F(x1 - 1, a + 1, 'bed');
			if (n % 2 === 0) F(c, a + 1, 'candle');
		}
		return { c, cells: n * 2 };
	}
	const c = (y0 + y1) >> 1;
	for (let x = x0 + 1; x < x1; x++) { W(x, c - 1); W(x, c + 1); }
	for (let x = x0 + pitch; x < x1; x += pitch) for (let y = y0; y <= y1; y++) if (y !== c) W(x, y);
	for (let a = x0; a + pitch <= x1; a += pitch, n++) {
		F(a + 1, c - 1, 'door'); F(a + 1, c + 1, 'door'); F(a + 1, y0 + 1, 'bed'); F(a + 1, y1 - 1, 'bed');
		if (n % 2 === 0) F(a + 1, c, 'candle');
	}
	return { c, cells: n * 2 };
}
/** Fifteen chairs in a ring (distinct cells, on the ground given). */
function ring(P, cx, cy, rx, ry, ground, n = 15) {
	const seen = new Set();
	for (let k = 0; k < n; k++) {
		const a = (k / n) * Math.PI * 2 - Math.PI / 2;
		const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
		if (seen.has(x + ',' + y)) throw new Error(`ring: two chairs at ${x},${y}`);
		seen.add(x + ',' + y);
		P.thing(x, y, 'chair', ground);
	}
}
/** An arcade round x0..x1, y0..y1: a pier every third cell, open between. */
function arcade(P, x0, y0, x1, y1, spec) {
	for (let x = x0; x <= x1; x++) for (const y of [y0, y1]) if ((x - x0) % 3 === 0) P.put(x, y, spec);
	for (let y = y0; y <= y1; y++) for (const x of [x0, x1]) if ((y - y0) % 3 === 0) P.put(x, y, spec);
	P.put(x1, y1, spec); P.put(x1, y0, spec); P.put(x0, y1, spec);
}

const P = plan(72, 58, 'floor grass', 1035);
const { W, H, put, get, fill, thing, room, house, stair, upRoom, up, label, rnd } = P;
const L = 'limestone', l = `floor ${L}`, S = 'stone block';
// woods round the edge
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
	const e = Math.min(x, y, W - 1 - x, H - 1 - y);
	if (e < 2 || (e < 4 && rnd() < 0.45)) put(x, y, 'wall leaves');
}
// the river along the south, woods beyond
const rv = (x) => Math.round(50 + Math.sin(x * 0.11) * 1.2);
for (let x = 0; x < W; x++) for (let y = rv(x) - 1; y < H; y++) put(x, y, y <= rv(x) + 2 ? 'floor water' : 'wall leaves');
for (let x = 4; x < W - 4; x += 3) if (get(x, rv(x) - 2) === 'floor grass') thing(x, rv(x) - 2, 'reeds', 'floor grass');
label(30, 52, 'the Sázava');

// the unfinished nave: piers and broken walls in the grass, the town's speaking place round the saint
for (let x = 10; x <= 38; x++) for (const y of [4, 17]) if ((x * 7 + y) % 5 > 1 && !(y === 17 && x >= 22 && x <= 30)) put(x, y, `wall ${S}`);
for (let y = 4; y <= 17; y++) if ((y * 3) % 4 && (y < 9 || y > 12)) put(10, y, `wall ${S}`);
for (let x = 14; x <= 34; x += 4) for (const y of [6, 15]) put(x, y, `wall ${S}`);
thing(24, 10, 'statue', 'floor grass');
ring(P, 24, 10.5, 7, 3.2, 'floor grass');
label(11, 3, 'the Unfinished Nave');

// the tower, joined to the nave's arcade
room(38, 2, 44, 9, S, S);
stair(40, 4, S); up(42, 6, `floor ${S} | bell`);
for (let y = 2; y <= 9; y++) for (let x = 38; x <= 44; x++) if (y === 2 || y === 9 || x === 38 || x === 44) up(x, y, `wall ${S}`); else if (!P.u[y][x]) up(x, y, `floor ${S}`);
thing(38, 6, 'door', `floor ${S}`); thing(44, 7, 'door', `floor ${S}`);
label(38, 1, 'Tower');

// the presbytery: the church as far as it was built
room(44, 4, 60, 16, L, L);
thing(58, 10, 'altar', l); thing(58, 11, 'altar', l);
for (let x = 48; x <= 54; x++) for (const y of [7, 14]) thing(x, y, 'pew', l);
for (let x = 47; x <= 53; x += 2) for (const y of [9, 10, 11, 12]) thing(x, y, 'pew', l);
for (const [x, y] of [[57, 6], [57, 14], [45, 5], [45, 15]]) thing(x, y, 'candle', l);
thing(44, 12, 'door', l); thing(44, 13, 'door', l); thing(48, 16, 'door', l);
label(46, 3, 'St Procopius');

// the cloister, open to the west
for (let x = 44; x <= 60; x++) put(x, 32, `wall ${L}`);
for (let y = 16; y <= 32; y++) { put(44, y, `wall ${L}`); put(60, y, `wall ${L}`); }
fill(45, 17, 59, 31, l);
arcade(P, 47, 19, 56, 28, `wall ${L}`);
fill(48, 20, 55, 27, 'floor grass');
thing(51, 23, 'well', 'floor grass');
for (let k = 0; k < 9; k++) { const x = 48 + Math.floor(rnd() * 8), y = 20 + Math.floor(rnd() * 8); if (get(x, y) === 'floor grass') thing(x, y, 'flowers', 'floor grass'); }
put(44, 18, l); put(44, 19, l);
for (const [x, y] of [[45, 17], [59, 17], [45, 31], [59, 31]]) thing(x, y, 'torch', l);
label(47, 18, 'Cloister');

// east wing: the chapter hall (sixteen at the table), the warming room; the dorter above
room(60, 16, 68, 32, L, L);
for (let x = 61; x <= 67; x++) put(x, 25, `wall ${L}`);
for (let y = 19; y <= 23; y++) { for (const x of [63, 64, 65]) thing(x, y, 'table', l); thing(62, y, 'chair', l); thing(66, y, 'chair', l); }
for (const x of [63, 64, 65]) { thing(x, 18, 'chair', l); thing(x, 24, 'chair', l); }
for (const [x, y] of [[61, 17], [67, 17], [61, 24], [67, 24]]) thing(x, y, 'candle', l);
thing(60, 21, 'door', l); thing(60, 28, 'door', l);
label(61, 15, 'Chapter Hall');
thing(66, 27, 'brazier', l);
const d = dorter(P, 60, 16, 68, 31, 'y', L, 'wood');
stair(d.c, 30, 'wood');
label(61, 33, 'Dorter (above)');

// south wing: refectory, kitchen
room(44, 32, 56, 40, L, L); room(56, 32, 68, 40, L, L);
for (let x = 47; x <= 53; x++) { thing(x, 36, 'table', l); thing(x, 35, 'pew', l); thing(x, 37, 'pew', l); }
thing(45, 33, 'candle', l); thing(55, 33, 'candle', l);
thing(50, 32, 'door', l); thing(50, 40, 'door', l); thing(56, 36, 'door', l); thing(62, 40, 'door', l);
label(45, 41, 'Refectory');
thing(57, 33, 'oven', l); thing(67, 33, 'oven', l); thing(62, 36, 'table', l); thing(66, 39, 'barrel', l); thing(67, 39, 'barrel', l);
label(58, 41, 'Kitchen');

// the prelature, the abbot's house
house(28, 20, 42, 30, { door: 'n', wall: L, floor: 'wood', loft: true, light: 'candle', extra: [[29, 29, 'bookshelf'], [30, 29, 'bookshelf'], [31, 29, 'bookshelf']] });
label(29, 31, 'Prelature');

// the Holy Cross: foundations of the old church, a cross in the grass
for (let y = 20; y <= 31; y++) for (let x = 14; x <= 25; x++) {
	const dx = Math.abs(x - 19.5), dy = Math.abs(y - 25.5);
	if ((dx <= 1.5 && dy <= 5.5) || (dy <= 1.5 && dx <= 5.5)) put(x, y, (dx > 0.5 && dx <= 1.5 && dy > 4.5) || (dy > 0.5 && dy <= 1.5 && dx > 4.5) ? `wall ${S}` : `floor ${S}`);
}
label(14, 19, 'Holy Cross');

// guest houses, the infirmary, the mill
house(5, 21, 11, 27, { door: 'e', wall: L, floor: 'wood', light: 'candle' });
house(5, 27, 11, 33, { door: 'e', wall: L, floor: 'wood', light: 'candle' });
house(5, 33, 11, 39, { door: 'e', wall: L, floor: 'wood', light: 'candle' });
label(4, 20, 'Guests');
house(15, 34, 26, 41, { door: 'n', wall: L, floor: 'wood', light: 'brazier', extra: [[17, 40, 'bed'], [20, 40, 'bed']] });
label(15, 42, 'Infirmary');
room(30, 43, 37, 47, 'wood', 'wood'); thing(33, 43, 'door', 'floor wood'); thing(34, 45, 'chest', 'floor wood'); thing(31, 44, 'candle', 'floor wood');
put(33, rv(33) - 1, 'floor water | wheel'); put(34, rv(34) - 1, 'floor water | wheel');
label(29, 42, 'Mill');

// the terraces down to the river; the graves east of the presbytery
for (let x = 40; x <= 67; x++) {
	put(x, 42, x % 3 ? 'floor grass | flowers' : 'floor grass');
	put(x, 43, 'floor gravel');
	for (const y of [44, 45]) put(x, y, y % 2 ? 'floor tilled' : 'floor tilled | crops');
	put(x, 46, 'floor gravel');
}
label(40, 47, 'Terraces');
for (let k = 0; k < 10; k++) thing(62 + (k % 5) * 1, 5 + Math.floor(k / 5) * 3, k % 4 ? 'statue' : 'coffin', 'floor grass');
label(61, 3, 'Graves');
for (const [x, y] of [[24, 18], [36, 18], [43, 12], [27, 33], [12, 30], [42, 41], [61, 13]]) if (get(x, y).startsWith('floor')) thing(x, y, 'torch', P.floorOf(x, y));

P.clearDoorsteps((c) => c.includes('| statue') || c.includes('| crops'), 'floor grass');
P.connect(24, 7);
P.write(new URL('./abbey-sazava.tbp', import.meta.url), 'abbey', [
	'St. Cuthwin\'s Abbey after Sázava, an alternative not yet in the game.',
	'Made by town/make-abbey-sazava.mjs; edit that and run it again. `label x y Name` names a place.'
], { 'floor grass': ',', 'floor gravel': ':', 'wall limestone': 'L', 'floor limestone': 'l', 'floor wood': '+', 'floor water': '~', 'wall leaves': 'T' });
