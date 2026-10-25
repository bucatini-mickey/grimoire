/**
 * make-abbey.mjs - draws town/abbey.tbp: St. Cuthwin's Abbey, the whole map inside its precinct wall.
 *
 * The abbey church along the north, its bell in the crossing tower. South of it the cloister: the
 * covered walk round the garth, open to it through the arcade; in the garth the well and fifteen
 * benches, the speaking place. Round the cloister the three ranges: the chapter house in the east,
 * where the brothers sit in judgement round its table, and above the whole east range the dorter, a
 * cell for each brother; the refectory and the kitchen in the south, the slype between them out to the
 * outer court; the cellarium in the west. Beyond: the abbot's house, the guest house, the library, the
 * infirmary and its herb garden, the brothers' graves, the fishpond, the orchard, the bakehouse and
 * brewhouse, the stables, and the gatehouse, shut.
 *
 * Two levels: the dorter, the bell loft, the abbot's chamber.
 *
 *   node town/make-abbey.mjs
 */
import { plan } from './gen.mjs';

const P = plan(96, 82, 'floor grass', 1132);
const { W, H, put, get, fill, thing, room, house, stair, upRoom, up, label, rnd } = P;
const L = 'limestone';

// ---- the precinct wall, round everything ----
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) put(x, y, `wall ${L}`);

// ---- gravel walks across the outer court ----
const walk = (x0, y0, x1, y1) => fill(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), 'floor gravel');
walk(45, 58, 46, 71); // the slype to the gate
walk(15, 60, 90, 60); // across the court
walk(15, 20, 15, 60); walk(18, 3, 18, 17); // west, up past the church's west door
walk(78, 20, 90, 20); walk(78, 3, 78, 60); // east, by the library and infirmary

// ---- the church: nave, crossing, choir; the bell in the crossing tower ----
room(20, 3, 76, 18, L, L);
for (let x = 26; x <= 52; x += 4) for (const y of [7, 14]) put(x, y, `wall ${L}`); // the nave's columns
for (let x = 25; x <= 51; x += 2) for (const y of [9, 10, 12]) thing(x, y, 'pew', `floor ${L}`);
for (let x = 62; x <= 69; x++) for (const y of [8, 13]) thing(x, y, 'pew', `floor ${L}`); // the choir stalls
thing(73, 10, 'altar', `floor ${L}`); thing(73, 11, 'altar', `floor ${L}`);
for (const [x, y] of [[72, 8], [72, 13], [60, 5], [60, 16], [30, 5], [30, 16], [44, 5], [44, 16]]) thing(x, y, 'candle', `floor ${L}`);
thing(20, 10, 'door', `floor ${L}`); thing(20, 11, 'door', `floor ${L}`); // the west door
thing(33, 18, 'door', `floor ${L}`); thing(59, 18, 'door', `floor ${L}`); // the processional doors to the cloister
upRoom(54, 3, 60, 9, L, L);
stair(55, 5, L);
up(57, 6, `floor ${L} | bell`); up(58, 8, `floor ${L} | candle`);
label(21, 2, 'the Abbey Church');

// ---- the cloister: the walk round the garth, the arcade between ----
fill(31, 19, 61, 48, `floor ${L}`);
fill(35, 23, 57, 44, 'floor grass');
for (let x = 34; x <= 58; x++) for (const y of [22, 45]) if (x % 3 === 1 && x > 34 && x < 58) put(x, y, `wall ${L}`);
for (let y = 22; y <= 45; y++) for (const x of [34, 58]) if (y % 3 === 1 && y > 22 && y < 45) put(x, y, `wall ${L}`);
const gx = 46, gy = 34;
thing(gx, gy, 'well', `floor ${L}`);
for (let k = 0; k < 15; k++) {
	const a = (k / 15) * Math.PI * 2;
	thing(Math.round(gx + Math.cos(a) * 8), Math.round(gy + Math.sin(a) * 5.2), 'chair', 'floor grass');
}
for (const [x, y] of [[32, 20], [60, 20], [32, 47], [60, 47]]) thing(x, y, 'torch', `floor ${L}`);
for (let k = 0; k < 10; k++) { const x = 36 + Math.floor(rnd() * 21), y = 24 + Math.floor(rnd() * 20); if (get(x, y) === 'floor grass' && Math.hypot((x - gx) / 8, (y - gy) / 5.2) > 1.25) thing(x, y, 'flowers', 'floor grass'); }
label(gx - 3, 21, 'the Cloister');

// ---- the east range: the chapter house, the warming room; the dorter above ----
room(62, 18, 76, 51, L, L);
fill(63, 31, 75, 31, `wall ${L}`);
thing(62, 25, 'door', `floor ${L}`); thing(62, 40, 'door', `floor ${L}`);
for (let x = 65; x <= 73; x++) { thing(x, 24, 'table', `floor ${L}`); thing(x, 25, 'table', `floor ${L}`); thing(x, 23, 'chair', `floor ${L}`); thing(x, 26, 'chair', `floor ${L}`); }
thing(64, 24, 'chair', `floor ${L}`);
for (const [x, y] of [[63, 19], [75, 19], [63, 30], [75, 30]]) thing(x, y, 'candle', `floor ${L}`);
label(63, 17, 'Chapter House');
thing(69, 41, 'brazier', `floor ${L}`); thing(64, 33, 'chest', `floor ${L}`);
label(77, 40, 'Warming Room');
// The dorter: a corridor down the middle, a cell each side every four paces.
upRoom(62, 18, 76, 51, L, 'wood');
for (let y = 19; y <= 50; y++) { up(68, y, `wall ${L}`); up(70, y, `wall ${L}`); }
for (let y0 = 18; y0 < 50; y0 += 4) {
	for (let x = 62; x <= 76; x++) if (x !== 69) up(x, y0, `wall ${L}`);
	up(68, y0 + 2, 'floor wood | door'); up(70, y0 + 2, 'floor wood | door');
	up(63, y0 + 1, 'floor wood | bed'); up(75, y0 + 1, 'floor wood | bed');
	if (y0 % 8 === 2) up(69, y0 + 2, 'floor wood | candle');
}
up(69, 50, 'floor wood');
stair(69, 50, 'wood');
label(78, 30, 'the Dorter (above)');

// ---- the south range: the refectory, the slype, the kitchen ----
room(30, 49, 62, 58, L, L);
for (let y = 50; y <= 57; y++) { put(44, y, `wall ${L}`); put(47, y, `wall ${L}`); put(45, y, `floor ${L}`); put(46, y, `floor ${L}`); }
put(45, 49, 'floor gravel'); put(46, 49, 'floor gravel'); put(45, 58, 'floor gravel'); put(46, 58, 'floor gravel');
thing(38, 49, 'door', `floor ${L}`); thing(55, 49, 'door', `floor ${L}`); thing(55, 58, 'door', `floor ${L}`);
for (let x = 33; x <= 41; x++) { thing(x, 53, 'table', 'floor ' + L); thing(x, 52, 'pew', 'floor ' + L); thing(x, 54, 'pew', 'floor ' + L); }
thing(37, 56, 'table', 'floor ' + L); thing(31, 50, 'candle', 'floor ' + L); thing(43, 50, 'candle', 'floor ' + L);
label(31, 59, 'Refectory');
thing(50, 51, 'oven', `floor ${L}`); thing(60, 51, 'oven', `floor ${L}`); thing(53, 54, 'table', `floor ${L}`); thing(57, 56, 'barrel', `floor ${L}`); thing(58, 56, 'barrel', `floor ${L}`);
label(49, 59, 'Kitchen');

// ---- the west range: the cellarium ----
room(16, 18, 30, 51, L, 'stone block');
thing(30, 35, 'door', 'floor stone block'); thing(16, 35, 'door', 'floor stone block');
for (let y = 20; y <= 49; y += 2) for (const x of [18, 19, 27, 28]) if (y !== 34 && y !== 36) thing(x, y, 'barrel', 'floor stone block');
thing(23, 26, 'chest', 'floor stone block'); thing(23, 44, 'candle', 'floor stone block');
label(17, 52, 'Cellarium');

// ---- the abbot's house and the guest house, west ----
house(3, 22, 13, 31, { door: 'e', wall: L, floor: 'wood', loft: true, light: 'candle', extra: [[4, 23, 'bookshelf'], [5, 23, 'bookshelf']] });
label(3, 21, "Abbot's House");
house(3, 38, 13, 46, { door: 'e', wall: L, floor: 'wood', light: 'candle' });
house(3, 47, 13, 55, { door: 'e', wall: L, floor: 'wood', light: 'candle' });
label(3, 37, 'Guest House');

// ---- the library, the infirmary, the herb garden, east ----
room(80, 3, 93, 16, L, 'wood');
thing(86, 16, 'door', 'floor wood');
for (let x = 81; x <= 92; x++) if (x !== 86) thing(x, 4, 'bookshelf', 'floor wood');
for (let y = 6; y <= 12; y += 3) for (let x = 82; x <= 91; x += 3) thing(x, y, 'bookshelf', 'floor wood');
thing(85, 14, 'table', 'floor wood'); thing(88, 14, 'candle', 'floor wood'); thing(84, 14, 'chair', 'floor wood');
label(80, 17, 'Library');
house(80, 22, 93, 33, { door: 'w', wall: L, floor: 'wood', light: 'brazier', extra: [[82, 24, 'bed'], [85, 24, 'bed'], [88, 24, 'bed'], [82, 31, 'bed'], [85, 31, 'bed']] });
label(80, 21, 'Infirmary');
for (let y = 37; y <= 49; y++) for (let x = 81; x <= 92; x++) put(x, y, y % 2 ? 'floor tilled | crops' : (x % 4 === 0 ? 'floor grass | flowers' : 'floor tilled'));
for (let x = 80; x <= 93; x++) for (const y of [36, 50]) put(x, y, 'wall paling');
for (let y = 36; y <= 50; y++) for (const x of [80, 93]) put(x, y, 'wall paling');
put(80, 43, 'floor gravel'); thing(86, 43, 'well', 'floor grass');
label(81, 35, 'Herb Garden');

// ---- the brothers' graves, the fishpond, the orchard ----
for (let k = 0; k < 18; k++) thing(80 + (k % 6) * 2, 54 + Math.floor(k / 6) * 3, k % 7 ? 'statue' : 'coffin', 'floor grass');
label(80, 53, 'the Graves');
for (let y = 64; y <= 74; y++) for (let x = 64; x <= 80; x++) {
	const d = Math.hypot((x - 72) / 7, (y - 69) / 4.2);
	if (d < 0.85) put(x, y, 'floor water'); else if (d < 1.05) put(x, y, 'floor mud | reeds');
}
label(66, 63, 'the Fishpond');
for (let y = 64; y <= 78; y += 3) for (let x = 4; x <= 20; x += 4) thing(x + (y % 2), y, rnd() < 0.6 ? 'oak' : 'bare tree', 'floor grass');
label(4, 62, 'the Orchard');

// ---- the bakehouse and brewhouse, the stables, the gatehouse ----
room(24, 63, 36, 69, L, 'stone block');
thing(30, 63, 'door', 'floor stone block'); thing(26, 65, 'oven', 'floor stone block'); thing(34, 65, 'oven', 'floor stone block'); thing(30, 67, 'table', 'floor stone block');
label(24, 62, 'Bakehouse');
room(24, 71, 36, 78, L, 'stone block');
thing(30, 71, 'door', 'floor stone block');
for (let x = 26; x <= 34; x += 2) thing(x, 75, 'barrel', 'floor stone block');
thing(30, 73, 'brazier', 'floor stone block');
label(24, 79, 'Brewhouse');
room(54, 72, 66, 79, 'wood', 'soil');
thing(60, 72, 'door', 'floor soil'); for (let x = 56; x <= 64; x += 2) thing(x, 77, 'hay bale', 'floor soil'); thing(57, 74, 'cart', 'floor soil');
label(54, 71, 'Stables');
house(40, 72, 50, 79, { door: 'n', wall: L, floor: L, light: 'brazier' });
label(40, 80, 'the Gatehouse');

// ---- torches about the court ----
for (const [x, y] of [[18, 20], [18, 40], [8, 60], [30, 60], [60, 60], [78, 60], [78, 20], [44, 66]]) thing(x, y, 'torch', P.floorOf(x, y) ?? 'floor gravel');

P.clearDoorsteps((c) => c.includes('| oak') || c.includes('| bare tree') || c.includes('| statue') || c.includes('| barrel'), 'floor grass');
P.connect(gx + 8, gy);

P.write(new URL('./abbey.tbp', import.meta.url), 'abbey', [
	'St. Cuthwin\'s Abbey, the whole map within its precinct wall, for Grimoire\'s medieval games.',
	'Made by town/make-abbey.mjs; edit that and run it again. `label x y Name` names a place.'
], { 'floor grass': ',', 'floor gravel': ':', 'wall limestone': 'L', 'floor limestone': 'l', 'floor wood': '+', 'wall wood': 'W', 'floor water': '~', 'floor mud': 'm', 'wall stone block': 'S', 'floor stone block': 's', 'wall paling': '|', 'stair-up wood': '<', 'stair-down wood': '>' });
