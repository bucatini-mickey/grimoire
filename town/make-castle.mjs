/**
 * make-castle.mjs - draws town/castle.tbp: Ravensburg, the castle and its market town, for Trouble
 * Brewing and the medieval games. Laid out after real castle plans (a moated castle of two courts with
 * a barbican, and a castle of round towers with outer and inner wards).
 *
 * The castle stands at the north. A curtain wall with a round tower at each corner; inside, the north
 * court and the south court, between them the great hall (whose long table is where the town sits in
 * judgement) and the great chambers; in the west range the bakehouse, the kitchens and the stores; in
 * the south wall the gatehouse. The moat runs along the south, the dam's pond along the west; the
 * barbican carries the way over the moat. Below lies the outer court in its own wall of towers: the
 * stables, the chapel and the priest's house, the smithy; and the outer gatehouse, from which the road
 * goes down to the town: the market cross (speak there and the whole town hears you; fifteen benches
 * round it), the inn, the houses, the mill on the river, fields and the wood all round.
 *
 * Two levels: the wall-walk round the curtain and its towers, the great chambers' bedrooms, the
 * houses' lofts.
 *
 *   node town/make-castle.mjs
 */
import { plan } from './gen.mjs';

const P = plan(120, 128, 'floor grass', 1215);
const { W, H, put, get, fill, thing, room, house, stair, upRoom, up, label, rnd } = P;
const wave = (x, y) => Math.sin(x * 0.17) * 0.5 + Math.cos(y * 0.21 + x * 0.06) * 0.5 + Math.sin((x + y) * 0.09) * 0.4;
const disc = (cx, cy, r, f) => { for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (Math.hypot(x - cx, y - cy) <= r) f(x, y, Math.hypot(x - cx, y - cy)); };
/** A wall two cells thick from (ax, ay) to (bx, by). */
const wallLine = (ax, ay, bx, by, spec = 'wall stone block', thick = 2) => {
	const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
	for (let t = 0; t <= n; t++) {
		const x = Math.round(ax + ((bx - ax) * t) / n), y = Math.round(ay + ((by - ay) * t) / n);
		for (let dy = 0; dy < thick; dy++) for (let dx = 0; dx < thick; dx++) put(x + dx, y + dy, spec);
	}
};
/** A round tower: solid below, its top a platform on the wall-walk (`walk`: reached from the walls). */
const tower = (cx, cy, r = 4.5, walk = true) => {
	disc(cx, cy, r, (x, y) => put(x, y, 'wall stone block'));
	if (walk) disc(cx, cy, r, (x, y) => up(x, y, 'floor stone block'));
};

// ---- the land: grass, the wood thick round the edge, a river along the south ----
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
	const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
	const p = edge < 2 ? 1 : edge < 7 ? 0.7 : edge < 11 ? 0.25 : 0;
	if (rnd() < p + wave(x, y) * 0.05) put(x, y, 'wall leaves');
}
const riverAt = (x) => Math.round(119 + Math.sin(x * 0.09) * 2.5);
for (let x = 0; x < W; x++) for (let dy = -2; dy <= 2; dy++) put(x, riverAt(x) + dy, 'floor water');
label(6, 116, 'The Wend');

// ---- the castle: a curtain wall, round towers at the corners ----
const C = { x0: 30, x1: 78, y0: 6, y1: 40 };
fill(C.x0, C.y0, C.x1, C.y1, 'floor gravel');
wallLine(C.x0, C.y0, C.x1, C.y0); wallLine(C.x0, C.y1 - 1, C.x1, C.y1 - 1);
wallLine(C.x0, C.y0, C.x0, C.y1); wallLine(C.x1 - 1, C.y0, C.x1 - 1, C.y1);
// The wall-walk on top, all round.
for (let x = C.x0; x <= C.x1; x++) for (const y of [C.y0, C.y0 + 1, C.y1 - 1, C.y1]) up(x, y, 'floor stone block');
for (let y = C.y0; y <= C.y1; y++) for (const x of [C.x0, C.x0 + 1, C.x1 - 1, C.x1]) up(x, y, 'floor stone block');
for (const [x, y] of [[C.x0, C.y0], [C.x1, C.y0], [C.x0, C.y1], [C.x1, C.y1]]) tower(x, y);
label(C.x1 - 2, C.y0 - 5, 'Towers');
// Stairs up to the wall-walk from each court.
stair(46, 8, 'stone block');
stair(46, 38, 'stone block');

// The north court, and the south court.
fill(44, 8, 76, 16, 'floor grass');
fill(44, 27, 76, 38, 'floor gravel');
label(54, 8, 'Courtyard');
label(46, 27, 'Courtyard');
thing(66, 33, 'well', 'floor gravel');
for (const [x, y] of [[45, 9], [75, 9], [45, 37], [75, 37]]) thing(x, y, 'torch', P.floorOf(x, y));

// The west range: the bakehouse, the kitchens, the stores.
house(32, 8, 43, 16, { wall: 'stone block', floor: 'stone block', door: 'e', light: 'oven', extra: [[34, 10, 'oven'], [36, 10, 'table'], [34, 14, 'barrel']] });
label(32, 7, 'Bakehouse');
room(32, 17, 43, 27, 'stone block', 'stone block');
thing(43, 22, 'door', 'floor stone block');
for (const [x, y, k] of [[34, 19, 'oven'], [35, 19, 'oven'], [37, 22, 'table'], [38, 22, 'table'], [34, 25, 'barrel'], [35, 25, 'barrel'], [41, 19, 'brazier']]) thing(x, y, k, 'floor stone block');
label(33, 18, 'Kitchens');
house(32, 28, 43, 38, { wall: 'stone block', floor: 'stone block', door: 'e', light: 'candle', extra: [[34, 30, 'chest'], [35, 30, 'chest'], [34, 36, 'barrel']] });
label(33, 29, 'Stores');

// The great hall: a long table down it, a dais and its hearth; the great chambers beside it, beds above.
room(45, 17, 64, 26, 'stone block', 'wood');
fill(44, 17, 44, 26, 'floor gravel'); // the passage between the courts, past the kitchens' door
for (const x of [53, 54, 55]) thing(x, 26, 'door', 'floor wood');
thing(54, 17, 'door', 'floor wood');
for (let x = 47; x <= 61; x++) { thing(x, 21, 'table', 'floor wood'); thing(x, 22, 'table', 'floor wood'); }
for (let x = 47; x <= 61; x += 2) { thing(x, 20, 'chair', 'floor wood'); thing(x, 23, 'chair', 'floor wood'); }
thing(46, 21, 'chair', 'floor wood'); thing(62, 22, 'chair', 'floor wood');
for (const x of [46, 63]) { thing(x, 18, 'brazier', 'floor wood'); thing(x, 25, 'candle', 'floor wood'); }
thing(54, 18, 'rug', 'floor wood');
label(45, 16, 'Great Hall');
room(64, 17, 76, 26, 'stone block', 'wood');
thing(70, 26, 'door', 'floor wood');
for (const [x, y, k] of [[66, 19, 'bookshelf'], [67, 19, 'bookshelf'], [74, 19, 'chest'], [70, 22, 'table'], [66, 24, 'candle']]) thing(x, y, k, 'floor wood');
upRoom(64, 17, 76, 26, 'stone block', 'wood');
for (let y = 17; y <= 26; y++) up(70, y, 'wall stone block');
up(70, 22, 'floor wood | door');
for (const [x, y] of [[66, 19], [74, 19]]) up(x, y, 'floor wood | bed');
up(72, 24, 'floor wood | bed');
for (const y of [19, 21, 23]) up(71 + (y === 21 ? 3 : 0), y, 'floor wood | candle');
stair(65, 25, 'wood');
label(65, 16, 'Great Chambers');

// The gatehouse in the south wall: the gate passage between two guard rooms.
for (let y = C.y1 - 1; y <= C.y1 + 1; y++) for (const x of [56, 57, 58]) put(x, y, 'floor stone block');
thing(57, C.y1, 'door', 'floor stone block');
house(49, 32, 55, 38, { wall: 'stone block', floor: 'stone block', door: 'e', light: 'brazier' });
house(59, 32, 65, 38, { wall: 'stone block', floor: 'stone block', door: 'w', light: 'brazier' });
label(66, C.y1 + 1, 'Gatehouse');

// ---- the moat along the south and the dam's pond along the west; the barbican over it ----
for (let y = C.y1 + 2; y <= C.y1 + 7; y++) for (let x = C.x0 - 6; x <= C.x1 + 6; x++) put(x, y, 'floor water');
for (let y = C.y0 + 4; y <= C.y1 + 7; y++) for (let x = C.x0 - 10; x <= C.x0 - 4; x++) if (Math.hypot((x - (C.x0 - 7)) / 4, (y - 26) / 20) < 1.1) put(x, y, 'floor water');
label(C.x0 - 10, 18, 'Dam');
label(C.x0 + 2, C.y1 + 3, 'Moat');
for (let y = C.y1 + 2; y <= C.y1 + 8; y++) { put(55, y, 'wall stone block'); put(59, y, 'wall stone block'); for (const x of [56, 57, 58]) put(x, y, 'floor water | plank bridge'); }
thing(57, C.y1 + 8, 'door', 'floor stone block');
label(60, C.y1 + 5, 'Barbican');

// ---- the outer court in its wall of towers ----
const O = [[22, 50], [92, 50], [96, 68], [88, 84], [62, 92], [34, 88], [20, 70]];
for (let y = 50; y <= 92; y++) for (let x = 20; x <= 96; x++) {
	// Inside the polygon: grass.
	let inside = false;
	for (let i = 0, j = O.length - 1; i < O.length; j = i++) {
		const [xi, yi] = O[i], [xj, yj] = O[j];
		if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	if (inside) put(x, y, 'floor grass');
}
for (let i = 0; i < O.length; i++) { const [ax, ay] = O[i], [bx, by] = O[(i + 1) % O.length]; wallLine(ax, ay, bx, by); }
for (const [x, y] of [O[2], O[4], O[5], O[6]]) tower(x, y, 3.5, false);
// The barbican's gate opens into the court.
for (let y = 49; y <= 52; y++) for (const x of [56, 57, 58]) put(x, y, 'floor gravel');
label(46, 62, 'Outer Court');

// Stables along the west wall: stalls, hay, a cart.
room(26, 56, 38, 76, 'wood', 'soil');
for (const y of [62, 70]) thing(38, y, 'door', 'floor soil');
for (let y = 58; y <= 74; y += 4) { put(27, y, 'wall wood'); put(28, y, 'wall wood'); put(29, y, 'wall wood'); thing(28, y + 1, 'hay bale', 'floor soil'); thing(27, y + 2, 'barrel', 'floor soil'); }
thing(35, 74, 'cart', 'floor soil'); thing(36, 58, 'torch', 'floor soil');
label(27, 55, 'Stables');

// The chapel and the priest's house, east.
room(64, 54, 80, 64, 'stone block', 'stone block');
thing(72, 64, 'door', 'floor stone block');
thing(72, 55, 'altar', 'floor stone block');
for (let y = 57; y <= 62; y++) for (const x of [68, 69, 70, 74, 75, 76]) thing(x, y, 'pew', 'floor stone block');
for (const x of [66, 78]) thing(x, 55, 'candle', 'floor stone block');
house(80, 55, 88, 63, { door: 's', light: 'candle', extra: [[86, 57, 'bookshelf']] });
label(64, 53, 'Chapel & Priest\'s House');

// The smithy, by the way to the outer gate.
room(46, 74, 56, 82, 'stone block', 'gravel');
thing(56, 78, 'door', 'floor gravel');
thing(49, 77, 'anvil', 'floor gravel'); thing(51, 77, 'brazier', 'floor gravel'); thing(49, 80, 'barrel', 'floor gravel');
label(46, 73, 'Smithy');

// The orchard in the court's south-west, the herb garden by the chapel, hay by the stables.
for (let y = 78; y <= 86; y += 3) for (let x = 38; x <= 58; x += 3) if (get(x, y) === 'floor grass' && rnd() < 0.85) put(x, y, 'wall leaves');
label(38, 77, 'Orchard');
for (let y = 66; y <= 70; y++) for (let x = 66; x <= 78; x++) if (get(x, y) === 'floor grass') put(x, y, (x + y) % 3 ? 'floor soil' : 'floor soil | flowers');
for (const [x, y] of [[40, 60], [41, 60], [40, 61]]) thing(x, y, 'hay bale', 'floor grass');
// The raised ground: a bank of earth round the outside of the court's wall.
for (let y = 46; y <= 97; y++) for (let x = 15; x <= 101; x++) {
	if (get(x, y) !== 'floor grass' && get(x, y) !== 'wall leaves') continue;
	let near = false;
	for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) if (get(x + dx, y + dy) === 'wall stone block' && (y + dy) > 48) { near = true; break; }
	if (near && !(x > 22 && x < 94 && y > 51 && y < 88)) put(x, y, 'floor mud');
}
label(16, 96, 'Raised Ground');

// The outer gatehouse, at the turn of the wall, and the road down to the town.
for (let y = 82; y <= 86; y++) for (let x = 86; x <= 90; x++) put(x, y, 'floor stone block');
thing(88, 84, 'door', 'floor stone block');
thing(86, 82, 'torch', 'floor stone block');
label(90, 86, 'Outer Gatehouse');
const road = (pts, spec = 'floor gravel', wdt = 2) => {
	for (let k = 0; k + 1 < pts.length; k++) {
		const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
		const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
		for (let t = 0; t <= n; t++) {
			const x = Math.round(ax + ((bx - ax) * t) / n), y = Math.round(ay + ((by - ay) * t) / n);
			for (let dy = 0; dy < wdt; dy++) for (let dx = 0; dx < wdt; dx++) {
				const c = get(x + dx, y + dy);
				if (c === 'floor water') put(x + dx, y + dy, 'floor water | plank bridge');
				else if (c === 'floor grass' || c === 'wall leaves' || c.startsWith('floor grass |')) put(x + dx, y + dy, spec);
			}
		}
	}
};
road([[57, 52], [70, 70], [87, 84]]); // the barbican to the outer gate
road([[90, 87], [92, 96], [64, 104]]); // down to the market
road([[64, 104], [20, 106], [6, 104]]); // west, to the mill
road([[64, 104], [110, 104]]); // east, to the wood
road([[64, 104], [64, 124]]); // south, over the river

// ---- the town: the market cross, fifteen benches round it ----
const mk = { x: 64, y: 106 };
for (let y = mk.y - 7; y <= mk.y + 7; y++) for (let x = mk.x - 13; x <= mk.x + 13; x++) if (Math.hypot((x - mk.x) / 13, (y - mk.y) / 7) <= 1) put(x, y, 'floor gravel');
thing(mk.x, mk.y, 'statue', 'floor stone block');
for (let k = 0; k < 15; k++) {
	const a = (k / 15) * Math.PI * 2;
	thing(Math.round(mk.x + Math.cos(a) * 8), Math.round(mk.y + Math.sin(a) * 4.2), 'chair', 'floor gravel');
}
for (const [x, y] of [[mk.x - 13, mk.y], [mk.x + 13, mk.y], [mk.x, mk.y - 7], [mk.x, mk.y + 7]]) thing(x, y, 'torch', 'floor gravel');
label(mk.x - 5, mk.y - 8, 'Market Cross');

// The houses round the market and along the roads: timber, a loft and its bed in each.
const homes = [
	[36, 96, 43, 102, 's'], [45, 95, 52, 101, 's'], [76, 95, 83, 101, 's'], [85, 96, 92, 102, 's'],
	[36, 110, 43, 116, 'n'], [45, 112, 52, 117, 'n'], [76, 112, 83, 117, 'n'], [85, 110, 92, 116, 'n'],
	[24, 108, 31, 114, 'n'], [96, 108, 103, 114, 'n'], [24, 96, 31, 102, 's'], [96, 96, 103, 102, 's'],
	[14, 95, 21, 101, 's'], [106, 95, 113, 101, 's'], [104, 109, 111, 114, 'n'], [14, 109, 21, 114, 'n']
];
for (const [x0, y0, x1, y1, door] of homes) house(x0, y0, x1, y1, { door, loft: true, light: 'candle' });

// The inn on the market's north side, a hearth and its tables.
house(54, 92, 62, 98, { door: 's', light: 'brazier', loft: true, extra: [[56, 94, 'barrel'], [57, 94, 'barrel']] });
label(54, 91, 'The Black Hart');

// The mill on the river, west, its wheel in the water.
house(6, 110, 13, 116, { wall: 'stone block', door: 'n', light: 'oven', loft: true, extra: [[8, 112, 'hay bale']] });
for (let y = 117; y <= 120; y++) thing(9, y, 'barrel', 'floor water');
label(6, 109, 'Mill');

// Fields and flowers on the open ground; torches along the roads.
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (get(x, y) === 'floor grass' && y > 90 && rnd() < 0.05) thing(x, y, 'flowers', 'floor grass');
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (get(x, y) === 'floor grass' && y < 50 && (x < 24 || x > 84) && rnd() < 0.04) thing(x, y, 'flowers', 'floor grass');
for (const [x, y] of [[70, 70], [80, 78], [91, 92], [40, 105], [88, 105]]) thing(x, y, 'torch', P.floorOf(x, y) ?? 'floor gravel');

// The map's edge is the wood; every door has its way to the market.
for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (!get(x, y).startsWith('wall')) put(x, y, 'wall leaves');
for (let y = 0; y < H; y++) for (const x of [0, W - 1]) if (!get(x, y).startsWith('wall') && get(x, y) !== 'floor water') put(x, y, 'wall leaves');
for (let y = 0; y < H; y++) for (const x of [0, W - 1]) if (get(x, y) === 'floor water') put(x, y, 'wall leaves');
P.clearDoorsteps((c) => c === 'wall leaves' || c.startsWith('floor grass |'), 'floor grass');
P.connect(mk.x + 8, mk.y, { track: 'floor soil' });

P.write(new URL('./castle.tbp', import.meta.url), 'castle', [
	'Ravensburg, a moated castle of two courts above its market town, for Grimoire\'s medieval games.',
	'Made by town/make-castle.mjs; edit that and run it again. `label x y Name` names a place.'
], { 'floor grass': ',', 'wall leaves': 'T', 'floor gravel': ':', 'floor soil': '.', 'wall wood': 'W', 'floor wood': '+', 'floor water': '~', 'wall stone block': '#', 'floor stone block': 's', 'stair-up wood': '<', 'stair-down wood': '>', 'stair-up stone block': '{', 'stair-down stone block': '}' });
