/**
 * make-castle.mjs - draws town/castle.tbp: a 15th-century castle town on a
 * wooded hill. The castle crowns the north: curtain wall and corner towers,
 * a gatehouse, the bailey with its well, and the keep, whose great hall has
 * the round table. Below the gate the town falls away to the south: an old
 * oak in the square (stand under it and the whole town hears you; fifteen
 * benches round it), the church and graveyard, the inn, and the homes and
 * workshops of the town's trades. In the eastern hillside, the old mine.
 * One level, no stairs.
 *
 *   node town/make-castle.mjs
 */
import { writeFileSync } from 'node:fs';

const W = 112, H = 94;
const g = Array.from({ length: H }, () => Array(W).fill(','));
const put = (x, y, ch) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = ch; };
const get = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? g[y][x] : 'T');
const fill = (x0, y0, x1, y1, ch) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, ch); };
const house = (x0, y0, x1, y1, wall, floor) => { fill(x0, y0, x1, y1, wall); fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, floor); };
let seed = 11;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const labels = [];
const label = (x, y, name) => labels.push([x, y, name]);

// ---- the wooded hill: thick forest round the edge, ragged inside, a few strays ----
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
	const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
	const depth = Math.max(3, 5 + Math.round(2.5 * Math.sin(x * 0.31) + 2 * Math.cos(y * 0.37) + rnd() * 2));
	if (edge < depth) put(x, y, 'T');
	else if (edge < depth + 3 && rnd() < 0.3) put(x, y, 'T');
	else if (rnd() < 0.012) put(x, y, 'T');
}

// ---- ways: the castle road (gravel), lanes (soil) ----
const road = (pts, ch, wide = 1) => {
	for (let k = 0; k < pts.length - 1; k++) {
		let [x, y] = pts[k];
		const [tx, ty] = pts[k + 1];
		while (x !== tx || y !== ty) {
			for (let d = 0; d < wide; d++) { put(x, y + d, ch); put(x + d, y, ch); }
			if (x !== tx && (y === ty || rnd() < 0.6)) x += Math.sign(tx - x); else y += Math.sign(ty - y);
		}
		for (let d = 0; d < wide; d++) { put(x, y + d, ch); put(x + d, y, ch); }
	}
};
road([[55, 36], [55, 52]], '.', 2); // the castle road, down to the square
road([[12, 44], [100, 44]], 'g', 2); // Castle Lane, under the walls
road([[12, 73], [100, 73]], 'g', 2); // High Street
road([[42, 44], [42, 73]], 'g', 2);
road([[64, 44], [64, 52]], 'g', 2);
road([[88, 44], [88, 73]], 'g', 2); // and on to the mine
road([[89, 56], [96, 56]], 'g', 2);

// ================= the castle =================
const C = { x0: 32, y0: 6, x1: 78, y1: 35 };
fill(C.x0 + 1, C.y0 + 1, C.x1 - 1, C.y1 - 1, '.'); // the bailey, gravelled
for (let x = C.x0; x <= C.x1; x++) { put(x, C.y0, '#'); put(x, C.y1, '#'); }
for (let y = C.y0; y <= C.y1; y++) { put(C.x0, y, '#'); put(C.x1, y, '#'); }
// Corner towers: the guard captain's, the steward's, the armoury, the chaplain's lodging.
const tower = (x0, y0, door, name, inside) => {
	house(x0, y0, x0 + 6, y0 + 6, '#', '_');
	put(door[0], door[1], 'D');
	for (const [x, y, ch] of inside) put(x, y, ch);
	label(x0, y0, name);
};
tower(C.x0, C.y0, [C.x0 + 6, C.y0 + 3], 'Captain’s Tower', [[C.x0 + 1, C.y0 + 1, 'B'], [C.x0 + 1, C.y0 + 5, 'E'], [C.x0 + 4, C.y0 + 1, 'k']]);
tower(C.x1 - 6, C.y0, [C.x1 - 6, C.y0 + 3], 'Steward’s Tower', [[C.x1 - 1, C.y0 + 1, 'B'], [C.x1 - 1, C.y0 + 5, 'S'], [C.x1 - 3, C.y0 + 5, 'U2']]);
tower(C.x0, C.y1 - 6, [C.x0 + 6, C.y1 - 3], 'Armoury', [[C.x0 + 1, C.y1 - 5, 'E'], [C.x0 + 1, C.y1 - 1, 'E'], [C.x0 + 3, C.y1 - 1, 'r2']]);
tower(C.x1 - 6, C.y1 - 6, [C.x1 - 6, C.y1 - 3], 'Chaplain’s Lodging', [[C.x1 - 1, C.y1 - 5, 'B'], [C.x1 - 1, C.y1 - 1, 'S'], [C.x1 - 3, C.y1 - 5, 'i']]);
// The gatehouse: a vaulted passage through the south wall.
house(51, C.y1 - 3, 59, C.y1 + 1, '#', '_');
fill(54, C.y1 - 3, 56, C.y1 + 1, '_');
// An open arch, not doors: the bailey is open to the sky (and the town).
label(51, C.y1 - 3, 'Gatehouse');
// The keep: the great hall with its round table, and the lord's chamber behind.
const K = { x0: 41, y0: 8, x1: 69, y1: 21 };
house(K.x0, K.y0, K.x1, K.y1, '#', '_');
for (const x of [54, 55, 56]) put(x, K.y1, 'D');
fill(62, K.y0 + 1, 62, K.y1 - 1, '#'); put(62, 14, 'D');
put(66, 10, 'B'); put(68, 10, 'E'); put(66, 19, 'S'); put(68, 19, 'k'); // the lord's chamber
label(62, K.y0, 'Lord’s Chamber');
const rt = { x: 51.5, y: 14.5 };
for (let y = K.y0 + 2; y <= K.y1 - 2; y++) for (let x = K.x0 + 2; x <= 60; x++) {
	const d = Math.hypot(x - rt.x, (y - rt.y) * 1.25);
	if (d <= 2.6) put(x, y, 'U'); // the round table
	else if (d <= 3.9 && d > 3.0 && (x + y) % 1 === 0) put(x, y, 'h');
}
put(43, 10, 'k'); put(43, 19, 'k'); put(60, 10, 'i'); put(60, 19, 'i'); // hearths and candles
for (const x of [44, 48, 52, 56]) { put(x, K.y0, 'w'); }
label(K.x0, K.y0, 'The Great Hall');
// Round the bailey: the barracks, the kitchen and bakehouse, the castle stables, the well.
house(39, 24, 49, 30, '#', '_');
put(49, 27, 'D');
for (const y of [25, 27, 29]) put(40, y, 'B');
put(47, 25, 'E'); put(47, 29, 'r');
label(39, 24, 'Barracks');
house(61, 24, 70, 30, '#', '_');
put(61, 27, 'D');
put(69, 25, 'V'); put(69, 29, 'V'); put(65, 25, 'U2'); put(66, 25, 'U2'); put(63, 29, 'r'); put(64, 29, 'r');
label(61, 24, 'Kitchen');
put(55, 27, 'o'); // the bailey well
put(52, 24, 'k'); put(58, 24, 'k');

// ================= the town =================
// The square: an old oak in the middle, fifteen benches round it, braziers at the edge.
const sq = { x: 55, y: 59 };
for (let y = sq.y - 7; y <= sq.y + 7; y++) for (let x = sq.x - 10; x <= sq.x + 10; x++) {
	const d = Math.hypot((x - sq.x) / 10, (y - sq.y) / 7);
	if (d <= 1) put(x, y, d > 0.9 && rnd() < 0.5 ? '.' : '_');
}
put(sq.x, sq.y, 'Q'); put(sq.x + 1, sq.y, 'Q'); put(sq.x, sq.y + 1, 'Q'); put(sq.x + 1, sq.y + 1, 'Q');
for (let k = 0; k < 15; k++) {
	const a = (k / 15) * Math.PI * 2;
	put(Math.round(sq.x + 0.5 + Math.cos(a) * 6), Math.round(sq.y + 0.5 + Math.sin(a) * 4.5), 'h');
}
put(sq.x - 9, sq.y - 2, 'k'); put(sq.x + 9, sq.y + 3, 'k');
label(sq.x - 3, sq.y - 3, 'The Old Oak');

// The church of St. Aldric, west of the square, and its graveyard.
const ch = { x0: 20, y0: 48, x1: 38, y1: 58 };
house(ch.x0, ch.y0, ch.x1, ch.y1, '#', '_');
put(ch.x1, 52, 'D'); put(ch.x1, 53, 'D');
put(22, 52, 'a'); put(22, 53, 'a'); put(21, 50, 'i'); put(21, 56, 'i');
for (const x of [26, 29, 32, 35]) { put(x, 50, 'p'); put(x, 51, 'p'); put(x, 54, 'p'); put(x, 55, 'p'); }
for (const x of [24, 30, 34]) { put(x, ch.y0, 'w'); put(x, ch.y1, 'w'); }
house(15, 50, 19, 54, '#', '_'); put(19, 52, '_'); put(20, 52, '_'); put(17, 52, 'L'); // the bell tower, through the church
label(ch.x0, ch.y0, 'St. Aldric’s Church');
fill(20, 61, 37, 69, 'g');
for (let y = 62; y <= 68; y += 2) for (let x = 21; x <= 36; x += 3) put(x + (y % 4 ? 1 : 0), y, 'm');
put(36, 68, 'x');
for (let x = 19; x <= 38; x++) { put(x, 60, 'W'); put(x, 70, 'W'); }
for (let y = 60; y <= 70; y++) { put(19, y, 'W'); put(38, y, 'W'); }
put(38, 64, 'g');
label(19, 60, 'Graveyard');

// The inn, east of the square: the common room, the bar and hearth, the innkeeper's room, two rooms to let.
const inn = { x0: 68, y0: 50, x1: 86, y1: 62 };
house(inn.x0, inn.y0, inn.x1, inn.y1, 'W', '+');
put(inn.x0, 55, 'd'); put(inn.x0, 56, 'd');
fill(69, 51, 75, 51, 'r'); put(76, 51, 'K');
for (const [x, y] of [[71, 54], [75, 54], [71, 58], [75, 58]]) { put(x, y, 't'); put(x - 1, y, 'c'); put(x + 1, y, 'c'); put(x, y + 1, 'c'); }
fill(79, 51, 79, 61, 'W'); put(79, 55, 'd');
fill(80, 56, 85, 56, 'W'); fill(83, 57, 83, 61, 'W'); put(82, 56, 'd'); put(84, 56, 'd');
put(85, 51, 'b'); put(81, 51, 'e'); put(84, 54, 'K'); // the innkeeper's room
put(80, 61, 'b'); put(84, 61, 'b'); put(81, 58, 'e'); put(85, 58, 'e'); // rooms to let
for (const x of [72, 76]) put(x, inn.y1, 'w');
label(inn.x0, inn.y0, 'The Crow & Candle');

// The homes and workshops of the town's trades: one room each, a bed, a chest, the tools of the trade.
const TRADES = [
	['Smithy', [['n', 2, 1], ['k', 3, 3]], 'g'], ['Baker’s', [['V', 5, 1], ['t', 4, 3]]],
	['Miller’s', [['y', 5, 1], ['y', 5, 3]]], ['Weaver’s', [['J', 5, 1], ['J', 4, 3]]],
	['Tanner’s', [['r', 5, 1], ['r', 5, 3]]], ['Chandler’s', [['K', 5, 1], ['t', 4, 3]]],
	['Cooper’s', [['r', 5, 1], ['r', 4, 3]]], ['Apothecary', [['S', 5, 1], ['t', 4, 3]]],
	['Butcher’s', [['t', 5, 1], ['t', 4, 3]]], ['Cobbler’s', [['t', 5, 1], ['c', 4, 3]]],
	['Carpenter’s', [['Y', 5, 1], ['t', 4, 3]]], ['Potter’s', [['K', 5, 1], ['r', 4, 3]]],
	['Fletcher’s', [['t', 5, 1], ['r', 4, 3]]], ['Shepherd’s', [['y', 5, 1], ['y', 4, 3]]],
	['Mason’s', [['m', 5, 1], ['t', 4, 3]], 'g'], ['Midwife’s', [['K', 5, 1], ['S', 4, 3]]],
	['Herbalist’s', [['S', 5, 1], ['t', 4, 3]]]
];
const homes = [];
let ti = 0;
const home = (x0, y0, side) => {
	const [name, props, floor] = TRADES[ti++ % TRADES.length];
	const x1 = x0 + 6, y1 = y0 + 4, fl = floor ?? '+';
	house(x0, y0, x1, y1, 'W', fl);
	put(x0 + 1, y0 + 1, fl === 'g' ? 'y' : 'b'); // a pallet of straw on a dirt floor
	if (fl === 'g') put(x0 + 1, y0 + 1, 'b');
	put(x0 + 1, y1 - 1, 'e');
	for (const [p, dx, dy] of props) put(x0 + dx, y0 + dy, p);
	const door = side === 's' ? [x0 + 3, y1] : side === 'n' ? [x0 + 3, y0] : side === 'e' ? [x1, y0 + 2] : [x0, y0 + 2];
	put(door[0], door[1], 'd');
	if (rnd() < 0.5) put(side === 'n' ? x0 + 5 : x0 + 1, side === 'n' ? y1 : y0, 'w');
	homes.push({ name, x0, y0, x1, y1, door });
	label(x0, y0, name);
};
// North of Castle Lane, under the walls.
for (const x of [14, 23, 82, 91]) home(x, 37, 's');
// Between Castle Lane and High Street.
home(44, 47, 'w'); home(44, 64, 'w');
home(89, 48, 'w'); home(89, 62, 'w');
// South of High Street.
for (const x of [14, 23, 32, 41, 50, 59, 68, 77]) home(x, 76, 'n');
// North of High Street, east of the square.
home(68, 66, 's');

// ---- the old mine, in the eastern hillside: a rock face, a timbered mouth, galleries ----
for (let y = 30; y <= 82; y++) {
	const face = 97 + Math.round(1.6 * Math.sin(y * 0.3) + rnd());
	for (let x = face; x < W - 2; x++) if (get(x, y) !== 'T' || x < W - 6) put(x, y, 'R');
}
const carve = (cx, cy, rx, ry) => { for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) if (Math.hypot((x - cx) / (rx + 0.4), (y - cy) / (ry + 0.4)) <= 1) put(x, y, 'G'); };
for (let x = 96; x <= 101; x++) { put(x, 56, 'G'); put(x, 57, 'G'); }
carve(103, 56, 3, 3); // the first gallery: where folk meet out of the town's hearing
for (let y = 48; y <= 53; y++) put(103, y, 'G');
carve(103, 46, 2, 2); // the old seam
for (let y = 60; y <= 66; y++) put(102, y, 'G');
carve(103, 68, 3, 2); // the flooded end
put(103, 56, 'Y'); put(105, 55, 'j'); put(101, 58, 'j'); put(104, 46, 'z'); put(102, 45, 'u'); put(104, 68, 'Y'); put(102, 69, 'j');
put(95, 55, '!'); put(95, 58, '!');
label(98, 54, 'The Old Mine');

// ---- a stream down the west of the hill, and the mill pond ----
let sx = 9, sy = 6;
while (sy < H - 2) {
	put(sx, sy, '~'); put(sx + 1, sy, '~');
	sy++;
	if (rnd() < 0.3) sx += rnd() < 0.5 ? 1 : -1;
	sx = Math.max(6, Math.min(11, sx));
}
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === '~' && (y === 44 || y === 45 || y === 73 || y === 74)) put(x, y, 'B');

// ---- torches along the ways; flowers on the grass ----
for (const [x, y] of [[53, 38], [58, 38], [30, 43], [78, 43], [42, 60], [64, 47], [30, 72], [80, 72], [88, 60], [20, 46]]) if (',g.'.includes(get(x, y))) put(x, y, '!');
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === ',' && rnd() < 0.05) put(x, y, 'f');

// ---- every door opens onto a way out: clear the fewest trees from each door to a road ----
const ROAD = new Set(['g', '.', '_']);
const isWall = (c) => 'W#wR'.includes(c);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
	if (g[y][x] !== 'd' && g[y][x] !== 'D') continue;
	for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
		const sx2 = x + ax, sy2 = y + ay, start = get(sx2, sy2);
		if (start !== 'T' && start !== ',' && start !== 'f') continue;
		const cost = new Map([[sx2 + ',' + sy2, 0]]), from = new Map(), q = [[0, sx2, sy2]];
		let goal = null;
		while (q.length) {
			q.sort((p, r) => p[0] - r[0]);
			const [c, cx, cy] = q.shift();
			if (ROAD.has(get(cx, cy))) { goal = [cx, cy]; break; }
			for (const [bx, by] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const nx = cx + bx, ny = cy + by, c2 = get(nx, ny);
				if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1 || isWall(c2) || '+dD~'.includes(c2)) continue;
				const nc = c + (c2 === 'T' ? 5 : 1), k = nx + ',' + ny;
				if (nc < (cost.get(k) ?? Infinity)) { cost.set(k, nc); from.set(k, [cx, cy]); q.push([nc, nx, ny]); }
			}
		}
		for (let at = goal; at; at = from.get(at[0] + ',' + at[1])) if ('Tf'.includes(get(at[0], at[1]))) put(at[0], at[1], 'g');
	}
}

// Props written as two characters ('U2' a table on stone, 'r2' a barrel on stone) become their keys.
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
	const c = g[y][x];
	if (c === 'U2') g[y][x] = 'U';
	else if (c === 'r2') g[y][x] = 'X';
}

const keys = `key , floor grass
key T wall leaves
key . floor gravel
key _ floor stone block
key # wall stone block
key w wall glass
key D floor stone block | door
key h floor stone block | chair
key o floor stone block | well
key k floor stone block | brazier
key a floor stone block | altar
key p floor stone block | pew
key i floor stone block | candle
key U floor stone block | table
key E floor stone block | chest
key B floor stone block | bed
key S floor stone block | bookshelf
key X floor stone block | barrel
key V floor stone block | oven
key L floor stone block | bell
key Q floor grass | oak
key g floor soil
key m floor soil | statue
key x floor soil | coffin
key n floor soil | anvil
key y floor soil | hay bale
key W wall wood
key + floor wood
key d floor wood | door
key b floor wood | bed
key t floor wood | table
key c floor wood | chair
key e floor wood | chest
key r floor wood | barrel
key K floor wood | brazier
key J floor wood | loom
key Y floor granite | cart
key R wall granite
key G floor granite
key j floor granite | candle
key u floor granite | coffin
key z floor granite | chest
key ~ floor water
key ! floor grass | torch
key f floor grass | flowers`;

// The bench round the oak sits on paving; the kitchen ovens and the steward's ledgers on stone.
const out = [
	'tachyon-blueprint 1',
	'# The castle town for Grimoire\'s village games: a castle on a wooded hill above its town.',
	'# Made by town/make-castle.mjs; edit that and run it again. `label x y Name` names a place.',
	'name castle',
	`size ${W} ${H} 1`,
	keys,
	'level 0',
	...g.map((r) => r.join('')),
	...labels.map(([x, y, n]) => `label ${x} ${y} ${n}`),
	'end',
	''
].join('\n');
writeFileSync(new URL('./castle.tbp', import.meta.url), out);
console.log(JSON.stringify({ homes: homes.length, oak: sq, mine: [103, 56], gate: [55, C.y1 + 1], hall: rt }));
