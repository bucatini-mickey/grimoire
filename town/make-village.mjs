/**
 * make-village.mjs - draws town/village.tbp, the demo village: a 15th-century
 * hamlet in a clearing, ringed by dark forest. One level, no stairs.
 *
 *   node town/make-village.mjs
 *
 * Edit the layout below and run it again (or edit village.tbp by hand, or
 * build your own town in Tachyon's editor). Prints the landmarks the tests use.
 */
import { writeFileSync } from 'node:fs';

const W = 84, H = 60;
const g = Array.from({ length: H }, () => Array(W).fill(','));
const put = (x, y, ch) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = ch; };
const get = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? g[y][x] : 'T');
const fill = (x0, y0, x1, y1, ch) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, ch); };
/** A building: walls of `wall`, floor of `floor`. */
const house = (x0, y0, x1, y1, wall, floor) => { fill(x0, y0, x1, y1, wall); fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, floor); };
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// ---- the forest: thick round the edge, ragged on the inside, a few strays ----
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
	const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
	const depth = 5 + Math.round(3 * Math.sin(x * 0.35) + 2 * Math.cos(y * 0.4) + rnd() * 2);
	if (edge < depth) put(x, y, 'T');
	else if (edge < depth + 3 && rnd() < 0.35) put(x, y, 'T');
	else if (rnd() < 0.015) put(x, y, 'T');
}

// ---- roads: soil tracks, the high street gravel ----
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
road([[6, 34], [20, 33], [30, 31], [34, 30]], 'g', 2); // west track into the woods
road([[50, 30], [62, 32], [77, 34]], 'g', 2); // east track
road([[42, 22], [42, 16], [41, 14]], '.', 2); // up to the church
road([[42, 38], [41, 46], [36, 52]], 'g', 2); // south lane
road([[20, 33], [17, 22], [15, 16]], 'g'); // to the north-west cottages
road([[30, 31], [26, 42], [20, 48]], 'g'); // to the south-west cottages
road([[62, 32], [66, 22], [70, 16]], 'g'); // to the north-east cottages
road([[62, 32], [64, 44], [68, 50]], 'g'); // to the stables

// ---- the market square: paving, the market cross, the well, fifteen seats round the cross ----
const sq = { x: 42, y: 30 };
for (let y = sq.y - 8; y <= sq.y + 8; y++) for (let x = sq.x - 10; x <= sq.x + 10; x++) {
	const d = Math.hypot((x - sq.x) / 10.5, (y - sq.y) / 8.5);
	if (d <= 1) put(x, y, d > 0.92 && rnd() < 0.5 ? '.' : '_');
}
put(sq.x, sq.y, 'M');
put(sq.x + 7, sq.y + 4, 'o');
for (let k = 0; k < 15; k++) {
	const a = (k / 15) * Math.PI * 2;
	put(Math.round(sq.x + Math.cos(a) * 6), Math.round(sq.y + Math.sin(a) * 4.5), 'h');
}
put(sq.x - 9, sq.y - 3, 'k');
put(sq.x + 9, sq.y - 3, 'k');
put(sq.x - 9, sq.y + 4, 'k');

// ---- the church at the north, its bell tower at the back; the graveyard beside it ----
const ch = { x0: 34, y0: 4, x1: 50, y1: 15 };
house(ch.x0, ch.y0, ch.x1, ch.y1, '#', '_');
house(39, 1, 45, 5, '#', '_'); // the tower, behind the altar
put(42, 5, 'D'); // the tower's arch
put(42, 3, 'M'); // the bell (a weight hung in the tower)
put(41, ch.y1, 'D'); put(42, ch.y1, 'D'); // the great double doors
put(42, 7, 'a'); put(41, 7, 'a'); put(40, 7, 'i'); put(43, 7, 'i');
for (const y of [10, 12]) { fill(36, y, 39, y, 'p'); fill(44, y, 48, y, 'p'); }
put(35, 5, 'i'); put(49, 5, 'i'); put(35, 14, 'i'); put(49, 14, 'i');
fill(20, 6, 31, 13, 'g'); // the graveyard
for (let y = 7; y <= 12; y += 2) for (let x = 21; x <= 30; x += 3) put(x + (y % 4 === 1 ? 1 : 0), y, 'm');
put(30, 12, 'x');
fill(20, 5, 31, 5, 'W'); fill(20, 14, 31, 14, 'W'); fill(19, 5, 19, 14, 'W');
put(31, 9, ','); // the gate towards the church
for (let y = 6; y <= 13; y++) if (y !== 9) put(32, y, 'W');

// ---- the tavern, east of the square: the hall, the bar and hearth, a private back room, two rooms to let ----
const tv = { x0: 54, y0: 21, x1: 74, y1: 31 };
house(tv.x0, tv.y0, tv.x1, tv.y1, 'W', '+');
put(tv.x0, 26, 'd'); put(tv.x0, 27, 'd'); // the front doors, on the square side
fill(64, tv.y0 + 1, 64, tv.y1 - 1, 'W'); put(64, 24, 'd'); // the back room, off the hall
fill(65, 26, 73, 26, 'W'); fill(69, 27, 69, 30, 'W'); // two rooms to let behind it
put(67, 26, 'd'); put(71, 26, 'd');
put(65, 30, 'b'); put(68, 27, 'e'); put(73, 30, 'b'); put(70, 27, 'e');
put(68, 23, 't'); put(67, 23, 'c'); put(69, 23, 'c'); put(68, 22, 'c'); put(72, 22, 'r'); put(73, 22, 'r'); put(73, 25, 'K');
fill(56, 22, 61, 22, 'r'); // the bar: barrels
put(62, 22, 'K'); // the hearth
for (const [x, y] of [[57, 25], [61, 25], [57, 28], [61, 28]]) { put(x, y, 't'); put(x - 1, y, 'c'); put(x + 1, y, 'c'); put(x, y + 1, 'c'); }
put(63, 30, 'K');
put(53, 25, '!'); put(53, 28, '!');

// ---- the smithy, south-west of the square: open-fronted, a forge and an anvil ----
house(24, 36, 31, 41, '#', 'g');
fill(25, 36, 30, 36, 'g'); // open to the lane
put(26, 39, 'n'); put(28, 40, 'k'); put(30, 39, 'r');

// ---- the stables and hay barn, south-east ----
house(62, 44, 76, 51, 'W', 'g');
put(62, 47, 'd'); put(62, 48, 'd');
for (let x = 64; x <= 74; x += 3) put(x, 45, 'y');
fill(64, 50, 74, 50, 'y');
put(70, 47, 'r');

// ---- cottages: one room, a bed, a table, a chair, a chest; homes for the night ----
const cottages = [];
const cottage = (x0, y0, doorSide) => {
	const x1 = x0 + 6, y1 = y0 + 4;
	house(x0, y0, x1, y1, 'W', '+');
	put(x0 + 1, y0 + 1, 'b'); put(x1 - 1, y0 + 1, 'e'); put(x1 - 2, y1 - 1, 't'); put(x1 - 1, y1 - 1, 'c');
	const door = doorSide === 's' ? [x0 + 3, y1] : doorSide === 'n' ? [x0 + 3, y0] : doorSide === 'e' ? [x1, y0 + 2] : [x0, y0 + 2];
	put(door[0], door[1], 'd');
	cottages.push({ x0, y0, x1, y1, door, inside: [x0 + 2, y0 + 2] });
};
cottage(10, 17, 'e');
cottage(19, 18, 's');
cottage(10, 25, 'e');
cottage(13, 40, 'n');
cottage(20, 46, 'e');
cottage(30, 47, 'n');
cottage(44, 47, 'w');
cottage(55, 12, 's');
cottage(65, 13, 's');
cottage(74, 12, 'w');
cottage(75, 36, 'w');
cottage(52, 37, 'n');

// ---- torches along the ways, few and far between ----
for (const [x, y] of [[22, 32], [16, 24], [34, 31], [42, 17], [40, 39], [56, 33], [66, 35], [25, 43], [38, 50], [62, 41], [68, 18], [48, 45], [14, 31]]) {
	if (get(x, y) === ',' || get(x, y) === 'g' || get(x, y) === '.') put(x, y, '!');
}

// Every door opens onto a way out: from each outside door, clear the fewest trees to reach a track.
const ROAD = new Set(['g', '.', '_']);
const isWall = (ch) => ch === 'W' || ch === '#';
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
	if (g[y][x] !== 'd' && g[y][x] !== 'D') continue;
	for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
		const sx = x + ax, sy = y + ay, start = get(sx, sy);
		if (isWall(start) || start === '+' || start === '_' && g[y][x] === 'D') continue;
		if (start !== 'T' && start !== ',') continue;
		// Cheapest path to a road cell: trees cost 5, grass 1; walls and buildings are out.
		const cost = new Map([[sx + ',' + sy, 0]]), from = new Map(), q = [[0, sx, sy]];
		let goal = null;
		while (q.length) {
			q.sort((p, r) => p[0] - r[0]);
			const [c, cx, cy] = q.shift();
			if (ROAD.has(get(cx, cy))) { goal = [cx, cy]; break; }
			for (const [bx, by] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const nx = cx + bx, ny = cy + by, ch = get(nx, ny);
				if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1 || isWall(ch) || ch === '+' || ch === 'd' || ch === 'D') continue;
				const nc = c + (ch === 'T' ? 5 : 1), k = nx + ',' + ny;
				if (nc < (cost.get(k) ?? Infinity)) { cost.set(k, nc); from.set(k, [cx, cy]); q.push([nc, nx, ny]); }
			}
		}
		for (let at = goal; at; at = from.get(at[0] + ',' + at[1])) if (get(at[0], at[1]) === 'T') put(at[0], at[1], ',');
	}
}

const keys = `key , floor grass
key T wall leaves
key . floor gravel
key _ floor stone block
key # wall stone block
key D floor stone block | door
key h floor stone block | chair
key o floor stone block | well
key k floor stone block | brazier
key a floor stone block | altar
key p floor stone block | pew
key i floor stone block | candle
key g floor soil
key m floor soil | statue
key M floor stone block | statue
key x floor soil | coffin
key W wall wood
key + floor wood
key d floor wood | door
key b floor wood | bed
key t floor wood | table
key c floor wood | chair
key e floor wood | chest
key r floor wood | barrel
key K floor wood | brazier
key n floor soil | anvil
key y floor soil | hay bale
key ! floor grass | torch`;
const out = `tachyon-blueprint 1
# The demo village for Grimoire's mode 2: a 15th-century hamlet in a forest
# clearing (church and graveyard, tavern, smithy, stables, cottages, the market
# cross where the town gathers at dusk). One level. Made by town/make-village.mjs;
# edit that and run it again, or edit this by hand, or build one in Tachyon.
name village
size ${W} ${H} 1
${keys}
level 0
${g.map((r) => r.join('')).join('\n')}
end
`;
writeFileSync(new URL('./village.tbp', import.meta.url), out);
console.log(JSON.stringify({ cottages: cottages.map((c) => ({ door: c.door, inside: c.inside })) }));
