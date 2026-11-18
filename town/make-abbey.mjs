/**
 * make-abbey.mjs - draws town/abbey.tbp: St. Cuthwin's Abbey, the whole map inside its precinct wall.
 *
 * A square is a metre (18 Nov: the old abbey, 96 x 82 m with a 57 m church, was far too big), so this is a
 * small house of the usual Benedictine plan, 62 x 52 m. The church along the north (31 x 10 m: aisled nave,
 * crossing tower with the bell, choir). South of it the cloister: a 2-3 m walk round an 11 m garth, open
 * to it through the arcade; in the garth the well and fifteen benches, the speaking place. The east range:
 * the chapter house (9 x 9 m), where the brothers sit in judgement, sixteen round its table, and the
 * warming room; above it the dorter, twelve cells of 3 x 2 m off a corridor. The south range: the
 * refectory and the kitchen, the open slype between them out to the court. The west range: the cellarium.
 * Beyond: the abbot's house, the infirmary, the herb garden, the graves and the fishpond to the east; the
 * orchard, the guest house, the bakehouse and the gatehouse, shut, to the south.
 *
 * Two levels: the dorter, the bell loft, the abbot's chamber.
 *
 *   node town/make-abbey.mjs
 */
import { plan } from './gen.mjs';

/** The dorter on the upper level: a corridor down the middle (north-south), a cell each side every `pitch` m. */
function dorter(P, x0, y0, x1, y1, wall, floor, pitch = 3) {
	P.upRoom(x0, y0, x1, y1, wall, floor);
	const W = (x, y) => P.up(x, y, `wall ${wall}`), F = (x, y, k) => P.up(x, y, `floor ${floor} | ${k}`);
	const c = (x0 + x1) >> 1;
	for (let y = y0 + 1; y < y1; y++) { W(c - 1, y); W(c + 1, y); }
	for (let y = y0 + pitch; y < y1; y += pitch) for (let x = x0; x <= x1; x++) if (x !== c) W(x, y);
	for (let a = y0, n = 0; a + pitch <= y1; a += pitch, n++) {
		F(c - 1, a + 1, 'door'); F(c + 1, a + 1, 'door'); F(x0 + 1, a + 1, 'bed'); F(x1 - 1, a + 1, 'bed');
		if (n % 2 === 0) F(c, a + 1, 'candle');
	}
	return c;
}
/** Fifteen chairs in a ring, each on its own cell. */
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

const P = plan(62, 52, 'floor grass', 77);
const { W, H, put, get, fill, thing, room, house, stair, upRoom, up, label, rnd } = P;
const L = 'limestone', l = `floor ${L}`;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!x || !y || x === W - 1 || y === H - 1) put(x, y, `wall ${L}`);
// forecourt and walks
fill(2, 2, 12, 9, 'floor gravel'); fill(29, 39, 30, 43, 'floor gravel'); fill(2, 39, 45, 39, 'floor gravel'); fill(45, 2, 45, 49, 'floor gravel');

// the church: nave with aisles, crossing tower, choir. 31 x 10 m.
room(14, 2, 44, 11, L, L);
for (let x = 18; x <= 30; x += 4) for (const y of [5, 8]) put(x, y, `wall ${L}`);
for (let x = 17; x <= 29; x += 2) for (const y of [6, 7]) thing(x, y, 'pew', l);
for (let x = 38; x <= 41; x++) for (const y of [4, 9]) thing(x, y, 'pew', l);
thing(43, 6, 'altar', l); thing(43, 7, 'altar', l);
for (const [x, y] of [[42, 4], [42, 9], [24, 3], [24, 10]]) thing(x, y, 'candle', l);
thing(14, 6, 'door', l); thing(14, 7, 'door', l); thing(16, 11, 'door', l); thing(31, 11, 'door', l);
upRoom(32, 2, 37, 8, L, L); stair(33, 3, L); up(35, 5, `${l} | bell`); up(36, 7, `${l} | candle`);
label(15, 1, 'the Abbey Church');

// the cloister: a 2 m walk round a 12 m garth; the speaking place round the well.
fill(15, 12, 32, 29, l); fill(18, 15, 28, 25, 'floor grass');
for (let y = 11; y <= 30; y++) { put(14, y, `wall ${L}`); put(33, y, `wall ${L}`); }
for (let x = 14; x <= 33; x++) put(x, 30, `wall ${L}`);
arcade(P, 17, 14, 29, 26, `wall ${L}`);
thing(23, 20, 'well', 'floor grass');
ring(P, 23, 20, 4.4, 4.4, 'floor grass');
for (const [x, y] of [[15, 12], [32, 12], [15, 29], [32, 29]]) thing(x, y, 'torch', l);
label(20, 13, 'the Cloister');

// east range: chapter house (9 x 9 m, sixteen at the table), warming room; the dorter above.
room(33, 11, 43, 30, L, L);
for (let x = 34; x <= 42; x++) put(x, 21, `wall ${L}`);
for (let x = 36; x <= 41; x++) { thing(x, 15, 'table', l); thing(x, 16, 'table', l); thing(x, 14, 'chair', l); thing(x, 17, 'chair', l); }
for (const x of [35, 42]) for (const y of [15, 16]) thing(x, y, 'chair', l);
for (const [x, y] of [[34, 12], [42, 12], [34, 20], [42, 20]]) thing(x, y, 'candle', l);
thing(33, 16, 'door', l); thing(33, 25, 'door', l);
label(35, 10, 'Chapter House');
thing(41, 24, 'brazier', l); thing(35, 28, 'chest', l);
const dc = dorter(P, 33, 11, 43, 29, L, 'wood');
stair(dc, 28, 'wood');
label(34, 21, 'Warming Room');
label(34, 30, 'the Dorter (above)');

// south range: refectory, the slype (open, 2 m) to the court, kitchen
room(14, 30, 28, 38, L, L); room(31, 30, 43, 38, L, L);
fill(29, 30, 30, 38, l);
for (let x = 17; x <= 25; x++) { thing(x, 34, 'table', l); thing(x, 33, 'pew', l); thing(x, 35, 'pew', l); }
thing(16, 31, 'candle', l); thing(26, 31, 'candle', l); thing(21, 30, 'door', l);
label(15, 40, 'Refectory');
thing(32, 31, 'oven', l); thing(42, 31, 'oven', l); thing(37, 34, 'table', l); thing(41, 37, 'barrel', l); thing(42, 37, 'barrel', l);
thing(37, 38, 'door', l); thing(31, 34, 'door', l);
label(33, 40, 'Kitchen');

// west range: the cellarium
room(7, 11, 14, 30, L, 'stone block');
thing(14, 20, 'door', 'floor stone block'); thing(7, 20, 'door', 'floor stone block');
for (let y = 13; y <= 28; y += 2) if (y !== 19 && y !== 21) for (const x of [8, 13]) thing(x, y, 'barrel', 'floor stone block');
thing(10, 25, 'candle', 'floor stone block');
label(1, 10, 'Cellarium');

// guest house (two rooms), gatehouse
house(2, 41, 9, 48, { door: 'n', wall: L, floor: 'wood', light: 'candle' });
house(9, 41, 16, 48, { door: 'n', wall: L, floor: 'wood', light: 'candle' });
label(2, 49, 'Guest House');
house(25, 45, 34, 51, { door: 'n', wall: L, floor: L, light: 'brazier' });
label(17, 50, 'Gatehouse');
// bakehouse
room(36, 42, 44, 48, L, 'stone block'); thing(40, 42, 'door', 'floor stone block'); thing(38, 44, 'oven', 'floor stone block'); thing(42, 46, 'table', 'floor stone block');
label(36, 41, 'Bakehouse');

// east: abbot's house, infirmary, herb garden, graves, fishpond
house(47, 2, 59, 10, { door: 'w', wall: L, floor: 'wood', loft: true, light: 'candle', extra: [[48, 3, 'bookshelf'], [49, 3, 'bookshelf']] });
label(47, 11, "Abbot's House");
house(47, 13, 59, 21, { door: 'w', wall: L, floor: 'wood', light: 'brazier', extra: [[50, 14, 'bed'], [53, 14, 'bed'], [50, 20, 'bed']] });
label(47, 22, 'Infirmary');
for (let y = 25; y <= 33; y++) for (let x = 47; x <= 58; x++) put(x, y, y % 2 ? 'floor tilled | crops' : 'floor tilled');
for (let x = 46; x <= 59; x++) for (const y of [24, 34]) put(x, y, 'wall paling');
for (let y = 24; y <= 34; y++) for (const x of [46, 59]) put(x, y, 'wall paling');
put(46, 29, 'floor gravel'); label(48, 23, 'Herb Garden');
for (let k = 0; k < 12; k++) thing(48 + (k % 6) * 2, 36 + Math.floor(k / 6) * 2, k % 5 ? 'statue' : 'coffin', 'floor grass');
label(48, 35, 'the Graves');
for (let y = 41; y <= 50; y++) for (let x = 47; x <= 60; x++) { const r = Math.hypot((x - 53.5) / 5.5, (y - 45.5) / 3.4); if (r < 0.85) put(x, y, 'floor water'); else if (r < 1.05) put(x, y, 'floor mud | reeds'); }
label(48, 40, 'Fishpond');
for (let y = 32; y <= 37; y += 3) for (let x = 2; x <= 12; x += 4) thing(x + (y % 2), y, 'oak', 'floor grass');
label(2, 31, 'Orchard');
for (const [x, y] of [[13, 5], [31, 40], [45, 12], [20, 39], [6, 39], [45, 36]]) thing(x, y, 'torch', P.floorOf(x, y) ?? 'floor grass');

P.clearDoorsteps((c) => c.includes('| oak') || c.includes('| statue') || c.includes('| barrel'), 'floor grass');
P.connect(23, 16);
P.write(new URL('./abbey.tbp', import.meta.url), 'abbey', [
	'St. Cuthwin\'s Abbey, the whole map within its precinct wall, for Grimoire\'s medieval games.',
	'Made by town/make-abbey.mjs; edit that and run it again. `label x y Name` names a place.'
], { 'floor grass': ',', 'floor gravel': ':', 'wall limestone': 'L', 'floor limestone': 'l', 'floor wood': '+', 'wall wood': 'W', 'floor water': '~', 'floor mud': 'm', 'wall stone block': 'S', 'floor stone block': 's', 'wall paling': '|', 'stair-up wood': '<', 'stair-down wood': '>' });
