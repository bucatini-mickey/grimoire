/**
 * make-victorian.mjs - draws town/victorian.tbp: Saltgrave, a gas-lit
 * Victorian harbour town on a small island, for Laissez un Faire.
 *
 * Cold sea all round. Cliffs of black rock to the north, and offshore the
 * Reef, which the fishermen do not name. The harbour bites into the south
 * shore: quays, two piers on piles, the fish market, the Customs House and
 * the bonded warehouses, and the Drowned Man, an inn with rooms above. The
 * town climbs north from the water in cobbled streets and brick terraces to
 * Lamp Square, where the public clock stands (speak there and the whole town
 * hears you; fifteen benches round it). North of the square the Assembly
 * Rooms keep the round table the town sits at for its reckonings. West: the
 * Chapel of St. Ebba and the old burying ground. East: the Lodge of the Deep,
 * whose cellars run into the Undercroft and the chamber of the sigil; and on
 * the eastern point, the lighthouse, its lamp room up a stair.
 *
 * Two levels. Stairs (up on the ground, down above, at the same spot) lead to
 * the upper rooms: the inn's chambers, the terraces' bedrooms, the Assembly
 * Rooms' gallery, the warehouse lofts and the lamp room.
 *
 *   node town/make-victorian.mjs
 */
import { writeFileSync } from 'node:fs';

const W = 112, H = 92;
let seed = 1847;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
// Each cell is its key spec ('floor cobble', 'floor wood | bed', 'wall brick'); keys are given out at the end.
const SEA = 'floor water';
const g = Array.from({ length: H }, () => Array(W).fill(SEA));
/** The upper level: null keeps it (open air). */
const u = Array.from({ length: H }, () => Array(W).fill(null));
const put = (x, y, spec) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = spec; };
const get = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? g[y][x] : SEA);
const up = (x, y, spec) => { if (x >= 0 && y >= 0 && x < W && y < H) u[y][x] = spec; };
const fill = (x0, y0, x1, y1, spec) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, spec); };
const floorOf = (x, y) => { const s = get(x, y); return s.startsWith('floor') ? s.split('|')[0].trim() : null; };
/** A thing on whatever floor is there. */
const thing = (x, y, name, floor) => put(x, y, `${floor ?? floorOf(x, y) ?? 'floor cobble'} | ${name}`);
const room = (x0, y0, x1, y1, wall, floor) => { fill(x0, y0, x1, y1, `wall ${wall}`); fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, `floor ${floor}`); };
const upRoom = (x0, y0, x1, y1, wall, floor) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) up(x, y, y === y0 || y === y1 || x === x0 || x === x1 ? `wall ${wall}` : `floor ${floor}`); };
/** A stair between the levels, at the same spot on both. */
const stair = (x, y, mat) => { put(x, y, `stair-up ${mat}`); up(x, y, `stair-down ${mat}`); };
const labels = [];
const label = (x, y, name) => labels.push([x, y, name]);
const isWater = (x, y) => get(x, y) === SEA;

// ---- the island: a ragged oval in the sea, the shore shingle, black cliffs to the north ----
const noise = (x, y) => Math.sin(x * 0.21) * 0.5 + Math.cos(y * 0.27 + x * 0.05) * 0.5 + Math.sin((x + y) * 0.13) * 0.4;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
	const d = Math.hypot((x - 56) / 49, (y - 43) / 37) + noise(x, y) * 0.04;
	if (d < 0.94) put(x, y, 'floor grass');
	else if (d < 1) put(x, y, y < 30 ? 'wall granite' : 'floor gravel');
}
// The harbour: a bay in the south shore, its quays of stone.
for (let y = 66; y < H; y++) for (let x = 20; x < 92; x++) {
	const d = Math.hypot((x - 56) / 24, (y - 88) / 16);
	if (d < 1) put(x, y, SEA);
	else if (d < 1.22 && get(x, y) !== SEA) put(x, y, 'floor stone block');
}
// Two piers on piles out into the bay, and the breakwater's arm.
for (const px of [46, 66]) for (let y = 74; y <= 84; y++) { put(px, y, 'floor water | plank bridge'); put(px + 1, y, 'floor water | plank bridge'); }
// Offshore, the Reef: black rock awash, a long way out.
for (let y = 4; y < 14; y++) for (let x = 8; x < 26; x++) if (Math.hypot((x - 16) / 7, (y - 8) / 3) + noise(x, y) * 0.1 < 1) put(x, y, rnd() < 0.7 ? 'wall granite' : 'floor granite');
label(9, 3, 'The Reef');

// ---- streets: cobbles climbing north from the quays; lanes of gravel ----
const street = (x0, y0, x1, y1, spec = 'floor cobble') => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!isWater(x, y) && !get(x, y).startsWith('wall granite')) put(x, y, spec); };
street(14, 22, 98, 23); // Cliff Road
street(10, 40, 102, 41); // Market Street
street(16, 58, 96, 59); // Harbour Street
for (const x of [20, 37, 75, 92]) street(x, 22, x + 1, 66); // the cross streets down to the water
street(55, 22, 57, 66); // High Street, through Lamp Square to the quays
label(16, 21, 'Cliff Road'); label(80, 39, 'Market Street'); label(24, 57, 'Harbour Street');

// ---- Lamp Square: the public clock, fifteen benches round it ----
const sq = { x: 56, y: 48 };
for (let y = sq.y - 6; y <= sq.y + 6; y++) for (let x = sq.x - 11; x <= sq.x + 11; x++) if (Math.hypot((x - sq.x) / 11, (y - sq.y) / 6) <= 1) put(x, y, 'floor cobble');
thing(sq.x, sq.y, 'clock', 'floor stone block');
for (let k = 0; k < 15; k++) {
	const a = (k / 15) * Math.PI * 2;
	thing(Math.round(sq.x + Math.cos(a) * 7), Math.round(sq.y + Math.sin(a) * 3.6), 'chair', 'floor cobble');
}
label(sq.x - 5, sq.y - 7, 'Lamp Square');

// ---- the Assembly Rooms, north of the square: the round table, a gallery above ----
const AR = { x0: 47, y0: 26, x1: 67, y1: 37 };
room(AR.x0, AR.y0, AR.x1, AR.y1, 'stone block', 'wood');
for (const x of [55, 56, 57]) thing(x, AR.y1, 'door', 'floor wood');
const rt = { x: 57, y: 31.5 };
for (let y = AR.y0 + 1; y < AR.y1; y++) for (let x = AR.x0 + 1; x < AR.x1; x++) if (Math.hypot((x - rt.x) / 2, y - rt.y) <= 1.9) thing(x, y, 'table', 'floor wood');
for (let y = AR.y0 + 1; y < AR.y1; y++) for (let x = AR.x0 + 1; x < AR.x1; x++) {
	if (get(x, y).includes('table')) continue;
	let beside = false;
	for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (get(x + dx, y + dy).includes('table')) beside = true;
	if (beside) thing(x, y, 'chair', 'floor wood');
}
for (const [x, y] of [[AR.x0 + 2, AR.y0 + 2], [AR.x1 - 2, AR.y0 + 2], [AR.x0 + 2, AR.y1 - 2], [AR.x1 - 2, AR.y1 - 2]]) thing(x, y, 'candle', 'floor wood');
for (const x of [51, 55, 59, 63]) put(x, AR.y0, 'wall glass');
upRoom(AR.x0, AR.y0, AR.x1, AR.y1, 'stone block', 'wood');
for (let y = AR.y0 + 4; y <= AR.y1 - 3; y++) for (let x = AR.x0 + 6; x <= AR.x1 - 6; x++) u[y][x] = null; // the well of the gallery, open to the hall below
stair(AR.x0 + 2, AR.y1 - 3, 'wood');
up(AR.x0 + 2, AR.y0 + 2, 'floor wood | bookshelf'); up(AR.x1 - 2, AR.y0 + 2, 'floor wood | bookshelf');
label(AR.x0, AR.y0 - 1, 'Assembly Rooms');

// ---- terraces: brick houses on the streets, a bed and a hearth below, a bedroom up the stair ----
const homes = [];
const house = (x0, y0, faceDown, loft) => {
	const x1 = x0 + 6, y1 = y0 + 4;
	room(x0, y0, x1, y1, 'brick', 'wood');
	const dx = x0 + 3, dy = faceDown ? y1 : y0;
	thing(dx, dy, 'door', 'floor wood');
	const back = faceDown ? y0 + 1 : y1 - 1, front = faceDown ? y1 - 1 : y0 + 1;
	thing(x0 + 1, back, 'bed', 'floor wood');
	thing(x1 - 1, back, 'brazier', 'floor wood');
	thing(x0 + 1, front, 'chest', 'floor wood');
	if (rnd() < 0.5) put(x0 + 5, faceDown ? y0 : y1, 'wall glass');
	if (loft) {
		upRoom(x0, y0, x1, y1, 'brick', 'wood');
		stair(x1 - 1, front, 'wood');
		up(x0 + 1, back, 'floor wood | bed');
		up(x0 + 3, back, 'floor wood | rug');
	}
	homes.push({ x0, y0, x1, y1 });
};
// Along Cliff Road (south side), Market Street (both sides), Harbour Street (north side).
let n = 0;
for (const x of [23, 29, 40, 77, 84]) house(x, 25, false, n++ % 2 === 0);
for (const x of [23, 29, 40, 77, 84]) house(x, 34, true, n++ % 2 === 0);
for (const x of [23, 29, 40, 77, 84]) house(x, 43, false, n++ % 2 === 0);
for (const x of [23, 29, 77, 84]) house(x, 52, true, n++ % 2 === 0);
label(23, 33, 'Netmakers’ Row'); label(77, 42, 'Widows’ Terrace');

// ---- the Chapel of St. Ebba and the old burying ground, west ----
const CH = { x0: 6, y0: 28, x1: 18, y1: 38 };
room(CH.x0, CH.y0, CH.x1, CH.y1, 'stone block', 'stone block');
thing(CH.x1, 33, 'door', 'floor stone block'); thing(CH.x1, 34, 'door', 'floor stone block');
thing(CH.x0 + 1, 33, 'altar'); thing(CH.x0 + 1, 34, 'altar');
for (const x of [9, 11, 13, 15]) { thing(x, 31, 'pew'); thing(x, 32, 'pew'); thing(x, 35, 'pew'); thing(x, 36, 'pew'); }
thing(CH.x0 + 1, CH.y0 + 1, 'candle'); thing(CH.x0 + 1, CH.y1 - 1, 'candle');
for (const x of [9, 13]) { put(x, CH.y0, 'wall glass'); put(x, CH.y1, 'wall glass'); }
street(CH.x1 + 1, 33, 19, 34);
label(CH.x0, CH.y0 - 1, 'St. Ebba’s');
for (let y = 44; y <= 54; y++) for (let x = 7; x <= 17; x++) {
	if (y === 44 || y === 54 || x === 7 || x === 17) put(x, y, 'wall iron');
	else if ((x + y) % 3 === 0 && y % 2 === 0) thing(x, y, 'coffin', 'floor grass');
	else if (rnd() < 0.12) thing(x, y, 'fern', 'floor grass');
	else put(x, y, 'floor grass');
}
put(17, 49, 'floor gravel'); street(18, 49, 19, 49, 'floor gravel');
for (const [x, y] of [[9, 46], [15, 52], [12, 49]]) thing(x, y, 'statue', 'floor grass');
label(7, 55, 'The Old Burying Ground');

// ---- the Lodge of the Deep, east, and the Undercroft beneath its rear ----
room(94, 26, 104, 36, 'slate', 'slate'); // the Lodge's hall
const L = { x0: 94, y0: 26, x1: 104, y1: 36 };
thing(L.x0, 30, 'door', 'floor slate'); street(93, 30, 93, 31, 'floor cobble');
for (let y = 28; y <= 34; y += 2) thing(L.x1 - 1, y, 'bookshelf');
thing(99, 28, 'altar'); thing(97, 28, 'candle'); thing(101, 28, 'candle');
for (const [x, y] of [[97, 31], [101, 31], [97, 33], [101, 33]]) thing(x, y, 'fern');
label(L.x0, L.y0 - 1, 'Lodge of the Deep');
// The Undercroft: down a passage of rock, cells and an ossuary, and the chamber of the sigil.
room(84, 4, 108, 22, 'granite', 'granite');
for (let y = 22; y <= 26; y++) { put(96, y, y === 26 ? 'floor slate | door' : 'floor granite'); put(95, y, 'wall granite'); put(97, y, 'wall granite'); }
put(96, 22, 'floor granite | door');
fill(85, 5, 107, 21, 'floor granite');
for (const x of [90, 96, 102]) for (let y = 5; y <= 21; y++) if (y !== 13 && y !== 14) put(x, y, 'wall granite');
for (const [x, y] of [[86, 6], [88, 20], [93, 6], [99, 6]]) thing(x, y, 'coffin', 'floor granite');
thing(94, 20, 'candle', 'floor granite'); thing(87, 13, 'candle', 'floor granite');
const sig = { x: 104, y: 13 };
for (let k = 0; k < 12; k++) {
	const a = (k / 12) * Math.PI * 2;
	thing(Math.round(sig.x + Math.cos(a) * 2.6), Math.round(sig.y + Math.sin(a) * 2.6), 'sigil', 'floor granite');
}
thing(sig.x, sig.y, 'altar', 'floor granite');
label(85, 3, 'The Undercroft');

// ---- the harbour: the fish market, the Customs House, warehouses with lofts, the Drowned Man ----
for (let y = 61; y <= 65; y++) for (let x = 48; x <= 64; x++) if (!isWater(x, y)) put(x, y, 'floor stone block');
for (const [x, y] of [[50, 62], [53, 62], [59, 62], [62, 62]]) { thing(x, y, 'table'); thing(x, y + 2, 'barrel'); }
label(49, 60, 'Fish Market');
// The Drowned Man: a common room below, chambers above.
const INN = { x0: 24, y0: 61, x1: 40, y1: 69 };
room(INN.x0, INN.y0, INN.x1, INN.y1, 'brick', 'wood');
thing(32, INN.y0, 'door', 'floor wood'); thing(33, INN.y0, 'door', 'floor wood');
for (const [x, y] of [[27, 64], [31, 66], [36, 64]]) { thing(x, y, 'table'); thing(x - 1, y, 'chair'); thing(x + 1, y, 'chair'); }
fill(25, 68, 30, 68, 'floor wood | barrel'); thing(38, 68, 'brazier');
upRoom(INN.x0, INN.y0, INN.x1, INN.y1, 'brick', 'wood');
stair(39, 62, 'wood');
for (const x0 of [24, 30, 35]) { upRoom(x0, 64, x0 + 5, 69, 'brick', 'wood'); up(x0 + 1, 68, 'floor wood | bed'); up(x0 + 3, 64, 'floor wood | door'); }
up(26, 62, 'floor wood | candle');
label(INN.x0, INN.y0 - 1, 'The Drowned Man');
// The Customs House.
room(70, 61, 80, 67, 'stone block', 'slate');
thing(72, 61, 'door', 'floor slate');
for (const x of [74, 76, 78]) thing(x, 66, 'bookshelf');
thing(72, 65, 'table'); thing(73, 65, 'chair');
label(70, 60, 'Customs House');
// Bonded warehouses on the east quay, a loft over each.
for (const x0 of [82, 90]) {
	room(x0, 61, x0 + 7, 68, 'brick', 'wood');
	thing(x0 + 3, 61, 'door', 'floor wood');
	for (let y = 64; y <= 67; y++) { thing(x0 + 1, y, 'barrel'); thing(x0 + 6, y, 'chest'); }
	upRoom(x0, 61, x0 + 7, 68, 'brick', 'wood');
	stair(x0 + 2, 62, 'wood');
	up(x0 + 5, 64, 'floor wood | hay bale'); up(x0 + 5, 66, 'floor wood | chest');
}
label(82, 60, 'Bonded Warehouses');
street(70, 59, 97, 60);

// ---- the lighthouse on the eastern point: the lamp room up the stair ----
const LH = { x: 104, y: 44 };
for (let y = LH.y - 3; y <= LH.y + 3; y++) for (let x = LH.x - 4; x <= LH.x + 4; x++) {
	const d = Math.hypot((x - LH.x) / 1.9, y - LH.y);
	if (d <= 3.4) put(x, y, d > 2.4 ? 'wall stone block' : 'floor stone block');
}
put(LH.x - 4, LH.y, 'floor stone block | door');
street(LH.x - 12, LH.y, LH.x - 5, LH.y, 'floor gravel');
stair(LH.x + 1, LH.y, 'stone block');
for (let y = LH.y - 3; y <= LH.y + 3; y++) for (let x = LH.x - 4; x <= LH.x + 4; x++) {
	const d = Math.hypot((x - LH.x) / 1.9, y - LH.y);
	if (d <= 3.4 && !u[y][x]) up(x, y, d > 2.4 ? 'wall glass' : 'floor stone block');
}
up(LH.x - 1, LH.y, 'floor stone block | gas lamp'); up(LH.x, LH.y - 1, 'floor stone block | candle');
label(LH.x - 5, LH.y - 5, 'Lighthouse');

// ---- boats at their moorings in the bay: clinker hulls, a deck, a coil of rope or a barrel aboard ----
for (const [bx, by, len] of [[50, 79, 6], [58, 84, 7], [70, 77, 5], [37, 80, 5]]) {
	for (let x = bx; x < bx + len; x++) for (let y = by; y <= by + 2; y++) {
		if (!isWater(x, y)) continue;
		const edge = y === by || y === by + 2 || x === bx || x === bx + len - 1;
		put(x, y, edge ? 'wall wood' : 'floor wood');
	}
	put(bx + len - 1, by + 1, 'wall wood'); // the bow
	if (get(bx + 2, by + 1) === 'floor wood') thing(bx + 2, by + 1, 'barrel', 'floor wood');
}
// Crates and barrels stacked along the quays, nets drying.
for (let y = 66; y < H; y++) for (let x = 20; x < 92; x++) if (get(x, y) === 'floor stone block' && rnd() < 0.05) thing(x, y, rnd() < 0.6 ? 'barrel' : 'chest', 'floor stone block');
// ---- shopfronts on Market Street: a hanging sign beside each door ----
for (let x = 18; x < 96; x++) for (const y of [39, 42]) if (get(x, y) === 'floor grass' && (get(x - 1, y + (y === 42 ? 1 : -1)).includes('door') || get(x - 1, y + (y === 42 ? 1 : -1)).includes('door'))) thing(x, y, 'sign', 'floor cobble');
// ---- upstairs: the Customs House's long room of ledgers, the Lodge's library ----
upRoom(70, 61, 80, 67, 'stone block', 'slate');
stair(79, 62, 'stone block');
for (const x of [72, 74, 76]) up(x, 62, 'floor slate | bookshelf');
up(72, 66, 'floor slate | table'); up(73, 66, 'floor slate | chair');
upRoom(L.x0, L.y0, L.x1, L.y1, 'slate', 'slate');
stair(L.x0 + 2, L.y1 - 1, 'stone block');
for (let y = L.y0 + 2; y <= L.y1 - 2; y += 2) up(L.x1 - 1, y, 'floor slate | bookshelf');
up(L.x0 + 5, L.y0 + 3, 'floor slate | candle'); up(L.x0 + 5, L.y0 + 4, 'floor slate | sigil');
// ---- up on the moor: a ring of standing stones round a flat altar stone, and a roofless croft ----
const ring = { x: 60, y: 13 };
for (let k = 0; k < 9; k++) {
	const a = (k / 9) * Math.PI * 2;
	const x = Math.round(ring.x + Math.cos(a) * 6), y = Math.round(ring.y + Math.sin(a) * 3);
	if (!isWater(x, y)) put(x, y, 'wall granite');
}
thing(ring.x, ring.y, 'altar', 'floor granite');
label(ring.x - 6, ring.y - 5, 'The Nine Stones');
for (let y = 14; y <= 19; y++) for (let x = 36; x <= 44; x++) {
	if (isWater(x, y)) continue;
	const edge = y === 14 || y === 19 || x === 36 || x === 44;
	if (edge) put(x, y, rnd() < 0.65 ? 'wall stone block' : 'floor gravel'); // fallen in
	else put(x, y, rnd() < 0.3 ? 'floor grass' : 'floor mud');
}
thing(38, 16, 'coffin', 'floor mud');
label(36, 13, 'Abandoned Croft');

// ---- gas lamps, few and far apart; ferns in the damp; a few gnarled trees ----
for (const [x0, y0, x1, y1] of [[14, 22, 98, 23], [10, 40, 102, 41], [16, 58, 96, 59]]) for (let x = x0 + 4; x <= x1; x += 11) if (floorOf(x, y0) === 'floor cobble') thing(x, y0, 'gas lamp');
for (const x of [20, 37, 75, 92]) for (let y = 28; y <= 64; y += 12) if (floorOf(x, y) === 'floor cobble') thing(x, y, 'gas lamp');
for (const [x, y] of [[sq.x - 11, sq.y], [sq.x + 11, sq.y], [sq.x, sq.y - 6]]) thing(x, y, 'gas lamp', 'floor cobble');
// The island's open ground is sodden moor: dark mud between the tussocks, more of it the higher you go.
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (get(x, y) === 'floor grass' && noise(x * 1.7, y * 1.9) + (40 - y) * 0.012 > 0.35) put(x, y, 'floor mud');
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
	if (get(x, y) !== 'floor grass') continue;
	const r = rnd();
	if (r < 0.025) put(x, y, 'wall leaves');
	else if (r < 0.06) thing(x, y, 'fern', 'floor grass');
}

// ---- every door opens onto a way: clear what blocks the step outside ----
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
	if (!g[y][x].includes('door')) continue;
	for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
		const c = get(x + dx, y + dy);
		if (c === 'wall leaves' || (c.startsWith('floor grass |') && !c.includes('coffin'))) put(x + dx, y + dy, 'floor grass');
	}
}

// ---- keys: one printable character per distinct cell, the same keys for both levels ----
const POOL = [...'.,:;_=+#%&*~-^"\'`!?$@ABCDEFGHIJKLMNOPQRSUVWXYZabcdefghijklmnopqrstuvwxyz0123456789()[]/|\\'];
const preferred = {
	'floor grass': ',', 'wall leaves': 'T', 'floor cobble': '.', 'wall brick': '#', 'floor wood': '+', 'floor water': '~', 'wall granite': 'R',
	'floor granite': 'G', 'wall glass': 'w', 'floor slate': '_', 'wall stone block': 'S', 'floor stone block': 's', 'wall iron': 'I', 'floor gravel': ':',
	'stair-up wood': '<', 'stair-down wood': '>', 'stair-up stone block': '{', 'stair-down stone block': '}'
};
const keyOf = new Map(Object.entries(preferred));
const used = new Set(keyOf.values());
const specs = new Set([...g.flat(), ...u.flat().filter(Boolean)]);
for (const s of specs) {
	if (keyOf.has(s)) continue;
	const ch = POOL.find((c) => !used.has(c));
	if (!ch) throw new Error('out of key characters');
	keyOf.set(s, ch); used.add(ch);
}
const out = [
	'tachyon-blueprint 1',
	'# Saltgrave, a gas-lit Victorian harbour town on an island, for Grimoire\'s Laissez un Faire games.',
	'# Made by town/make-victorian.mjs; edit that and run it again. `label x y Name` names a place.',
	'name victorian',
	`size ${W} ${H} 2`,
	...[...keyOf].filter(([s]) => specs.has(s)).map(([s, ch]) => `key ${ch} ${s}`),
	'level 0',
	...g.map((r) => r.map((s) => keyOf.get(s)).join('')),
	'level 1',
	...u.map((r) => r.map((s) => (s ? keyOf.get(s) : ' ')).join('')),
	...labels.map(([x, y, nm]) => `label ${x} ${y} ${nm}`),
	'end',
	''
].join('\n');
writeFileSync(new URL('./victorian.tbp', import.meta.url), out);
console.log(JSON.stringify({ homes: homes.length, keys: keyOf.size }));
