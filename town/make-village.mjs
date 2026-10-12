/**
 * make-village.mjs - draws town/village.tbp, the demo village: a 15th-century
 * hamlet in a wooded valley: the town in the south, meadows, a cliff with a
 * cave, a waterfall and a stream in the north. One level, no stairs.
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

// ================= the valley above the town =================
// The town above sits in the south of a valley. To the north the meadows rise to a
// cliff with a cave in it, and a waterfall drops into a pool whose stream runs east.
const TOP = 16, H2 = H + TOP;
const v = Array.from({ length: H2 }, (_, y) => (y >= TOP ? g[y - TOP] : Array(W).fill(',')));
const vput = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H2) v[y][x] = c; };
const vget = (x, y) => (x >= 0 && y >= 0 && x < W && y < H2 ? v[y][x] : 'T');
// The old northern forest thins into meadow at the valley floor; the ends stay wooded.
for (let y = TOP; y < TOP + 8; y++) for (let x = 7; x < W - 7; x++) if (vget(x, y) === 'T' && rnd() < 0.72) vput(x, y, ',');
// The cliff: a ragged face across the top; woods above it and at both ends.
const foot = [];
for (let x = 0; x < W; x++) {
	foot[x] = Math.max(6, Math.min(11, 8 + Math.round(1.8 * Math.sin(x * 0.21) + 1.2 * Math.cos(x * 0.13) + rnd())));
	for (let y = 0; y < TOP; y++) {
		if (y < 2 || x < 5 || x > W - 6) vput(x, y, 'T');
		else if (y <= foot[x]) vput(x, y, 'R');
		else if ((x < 8 || x > W - 9) && rnd() < 0.6) vput(x, y, 'T');
		else if (rnd() < 0.03) vput(x, y, 'T');
	}
}
// The cave: a mouth at the foot of the cliff, a first chamber, a narrow way to a deeper one.
const cave = { x: 20, y: foot[20] };
const carve = (cx, cy, rx, ry) => { for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) if (Math.hypot((x - cx) / (rx + 0.4), (y - cy) / (ry + 0.4)) <= 1 && y > 2) vput(x, y, 'G'); };
for (let y = 4; y <= cave.y; y++) { vput(cave.x, y, 'G'); vput(cave.x + 1, y, 'G'); }
carve(cave.x, 5, 4, 2);
for (let x = 12; x <= cave.x - 3; x++) vput(x, 4, 'G');
carve(11, 5, 2, 1);
vput(11, 5, 'q'); vput(10, 4, 'u'); vput(12, 6, 'z'); vput(17, 4, 'j'); vput(23, 6, 'u');
// The waterfall pours off the cliff into the pool; the stream runs east into the woods.
const fall = 60;
for (let y = 2; y <= foot[fall] + 1; y++) for (const x of [fall, fall + 1]) vput(x, y, 'F');
const pool = { x: fall + 0.5, y: foot[fall] + 3.5 };
for (let y = Math.floor(pool.y - 3); y <= pool.y + 3; y++) for (let x = Math.floor(pool.x - 6); x <= pool.x + 6; x++) {
	const d = Math.hypot((x - pool.x) / 5.5, (y - pool.y) / 2.6);
	if (d <= 1 && vget(x, y) !== 'R' && vget(x, y) !== 'F') vput(x, y, '~');
}
let sx = fall + 5, sy = Math.round(pool.y);
while (sx < W - 1) {
	vput(sx, sy, '~'); vput(sx, sy + 1, '~');
	sx++;
	if (rnd() < 0.35 && sy < TOP + 4) sy++;
	else if (rnd() < 0.12 && sy > foot[sx] + 2) sy--;
}
// A footpath up from the square, past the church to the meadow, west to the cave, east to the pool.
for (let y = TOP + 13; y >= foot[52] + 3; y--) vput(52, y, vget(52, y) === '~' ? 'B' : 'g');
const meadowY = (x) => Math.min(TOP - 1, Math.max(foot[x] + 2, 13));
for (let x = cave.x; x <= 52; x++) { vput(x, meadowY(x), 'g'); }
for (let y = foot[cave.x] + 1; y <= meadowY(cave.x); y++) { vput(cave.x, y, 'g'); vput(cave.x + 1, y, 'g'); }
for (let x = 52; x <= fall - 6; x++) vput(x, meadowY(x), 'g');
// Over the stream by a plank bridge, on to the north-east cottages.
const bx = 70;
for (let y = 0; y < H2; y++) if (vget(bx, y) === '~') vput(bx, y, 'B');
for (let y = meadowY(bx) - 1; y <= TOP + 8; y++) if (vget(bx, y) === ',' || vget(bx, y) === 'T') vput(bx, y, 'g');
for (let x = fall + 7; x <= bx; x++) if (vget(x, meadowY(x) - 1) !== '~' && vget(x, meadowY(x) - 1) !== 'B') vput(x, meadowY(x) - 1, 'g');
// Flowers: the meadows are full of them; a few anywhere on the grass; beds by the cottages.
for (let y = 0; y < H2; y++) for (let x = 0; x < W; x++) {
	if (vget(x, y) !== ',') continue;
	const meadow = y > 6 && y < TOP + 8;
	if (rnd() < (meadow ? 0.14 : 0.035)) vput(x, y, 'f');
}
for (const c of cottages) for (let x = c.x0; x <= c.x1; x++) if (vget(x, c.y1 + TOP + 1) === ',' && rnd() < 0.6) vput(x, c.y1 + TOP + 1, 'f');
// Torches by the pool and at the cave mouth.
for (const [x, y] of [[fall - 6, Math.round(pool.y)], [cave.x + 3, foot[cave.x] + 1]]) if (vget(x, y) === ',' || vget(x, y) === 'f') vput(x, y, '!');

// ---- names: small, at the top left of each building and landmark ----
const labels = [
	[34, 4 + TOP, 'St. Aldric’s Church'], [19, 5 + TOP, 'Graveyard'], [54, 21 + TOP, 'The Crow & Candle'],
	[24, 36 + TOP, 'Smithy'], [62, 44 + TOP, 'Stables'], [cave.x - 6, 3, 'The Old Cave'], [fall - 4, foot[fall] + 1, 'The Falls'],
	[33, 22 + TOP, 'Market Cross'],
	...cottages.map((c, k) => [c.x0, c.y0 + TOP, ['Cooper', 'Fletcher', 'Miller', 'Thatcher', 'Weaver', 'Tanner', 'Carter', 'Baker', 'Mason', 'Shepherd', 'Potter', 'Chandler'][k] + '’s'])
];
for (const c of cottages) { c.door = [c.door[0], c.door[1] + TOP]; c.inside = [c.inside[0], c.inside[1] + TOP]; }

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
key ! floor grass | torch
key R wall granite
key G floor granite
key j floor granite | candle
key q floor granite | statue
key u floor granite | coffin
key z floor granite | chest
key ~ floor water
key F floor water | waterfall
key B floor wood | plank bridge
key f floor grass | flowers`;
const out = `tachyon-blueprint 1
# The demo village for Grimoire's mode 2: a 15th-century hamlet in a wooded
# valley (church and graveyard, tavern, smithy, stables, cottages, the market
# cross where the town gathers at dusk; north, meadows, a cliff with a cave, a
# waterfall and its pool and stream). One level. 'label x y text' names places
# (a Grimoire addition to Tachyon's format). Made by town/make-village.mjs;
# edit that and run it again, or edit this by hand, or build one in Tachyon.
name village
size ${W} ${H2} 1
${keys}
level 0
${v.map((r) => r.join('')).join('\n')}
${labels.map(([x, y, t]) => `label ${x} ${y} ${t}`).join('\n')}
end
`;
writeFileSync(new URL('./village.tbp', import.meta.url), out);
console.log(JSON.stringify({ cottages: cottages.map((c) => ({ door: c.door, inside: c.inside })) }));
