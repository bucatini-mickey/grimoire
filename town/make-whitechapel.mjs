/**
 * make-whitechapel.mjs - draws town/whitechapel.tbp: Whitechapel in the fog, for Sects & Violets,
 * clockwork London (gaslight, soot and brass). A square is a metre (21 Nov: the grid of 104 x 88 m was
 * redrawn as the Rookery, 72 x 69 m, with a straight river through it).
 *
 * The railway crosses the north on its brick viaduct; the arches are let as a smithy, a stable, a cooper's,
 * a rag shop and lodgings, and the station stair climbs to the line. Commercial Square in the middle: the
 * public clock (speak there and the whole parish hears you; fifteen benches round it), Christ Church and its
 * yard on the west, the Ten Bells on the north-east corner (its long table seats the parish's reckonings,
 * sixteen), Abel Quill's, the clockmaker's, facing it. The doss-house; Petticoat Lane's barrows down
 * Wentworth Street; Flower and Dean Street and Wentworth Court with its pump. Then the Cut, a straight
 * river of black water between stone wharves, cranes and barges, crossed by Commercial Street's stone
 * bridge and an iron footbridge; south of it the back-to-backs on Thrawl Street and the Back Alley, a
 * tunnel through.
 *
 * Two levels: the line on the viaduct, the Ten Bells' rooms, the back bedrooms, Quill's rooms, the tower.
 *
 *   node town/make-whitechapel.mjs
 */
import { plan } from './gen.mjs';

// ---- the pieces ----

/** The public clock and fifteen benches round it, on cobbles (rx, ry: the ring's half-widths). */
export function clockSquare(P, cx, cy, rx, ry, ground = 'floor cobble') {
	P.thing(cx, cy, 'clock', 'floor stone block');
	const seen = new Set();
	for (let k = 0; k < 15; k++) {
		const a = (k / 15) * Math.PI * 2 - Math.PI / 2;
		const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
		if (seen.has(x + ',' + y)) throw new Error(`two benches at ${x},${y}`);
		seen.add(x + ',' + y);
		P.thing(x, y, 'chair', ground);
	}
}

/**
 * A row of terraced houses sharing their party walls, from x0 eastward until x1, fronts on `front` (the y of
 * the front wall), `depth` deep, doors on that side ('n': the front is the top wall, 's': the bottom).
 * Widths cycle through `widths`; every other house has a back bedroom up a stair. Returns the count.
 */
function terraceRow(P, x0, x1, front, depth, side, widths = [5, 4, 6, 5, 4], opts = {}) {
	let x = x0, k = 0;
	const skip = opts.skip ?? [];
	while (x + 4 <= x1) {
		const w = widths[k % widths.length];
		if (x + w > x1) break;
		if (skip.some(([a, b]) => x + w > a && x < b)) { x = skip.find(([a, b]) => x + w > a && x < b)[1]; continue; }
		const [y0, y1] = side === 'n' ? [front, front + depth] : [front - depth, front];
		P.house(x, y0, x + w, y1, { door: side, wall: 'brick', floor: 'wood', light: opts.light ?? 'brazier', loft: (opts.lofts ?? true) && k % 2 === 0 });
		x += w; k++;
	}
	return k;
}
/** The same, along a north-south street: fronts on `front` (an x), doors on 'w' or 'e'. */
function terraceCol(P, y0, y1, front, depth, side, widths = [5, 4, 6, 5, 4], opts = {}) {
	let y = y0, k = 0;
	while (y + 4 <= y1) {
		const w = widths[k % widths.length];
		if (y + w > y1) break;
		const [x0, x1] = side === 'w' ? [front, front + depth] : [front - depth, front];
		P.house(x0, y, x1, y + w, { door: side, wall: 'brick', floor: 'wood', light: opts.light ?? 'brazier', loft: (opts.lofts ?? true) && k % 2 === 0 });
		y += w; k++;
	}
	return k;
}

/**
 * The Ten Bells: a public house, the bar along one wall, one long table where sixteen sit (the parish's
 * reckonings), a fire; rooms upstairs off a passage. Door(s) on `side`.
 */
function tenBells(P, x0, y0, x1, y1, side) {
	P.room(x0, y0, x1, y1, 'brick', 'wood');
	const mx = (x0 + x1) >> 1, my = (y0 + y1) >> 1;
	const d = side === 's' ? [mx, y1] : side === 'n' ? [mx, y0] : side === 'e' ? [x1, my] : [x0, my];
	P.thing(d[0], d[1], 'door', 'floor wood');
	// The long table: eight long, a chair each side of each place.
	const tx = mx - 4;
	for (let x = tx; x < tx + 8; x++) { P.thing(x, my, 'table', 'floor wood'); P.thing(x, my - 1, 'chair', 'floor wood'); P.thing(x, my + 1, 'chair', 'floor wood'); }
	// The bar: barrels along the far wall.
	const by = side === 'n' ? y1 - 1 : y0 + 1;
	for (let x = x0 + 2; x <= x1 - 2; x += 2) P.thing(x, by, 'barrel', 'floor wood');
	P.thing(side === 'w' ? x1 - 1 : x0 + 1, my, 'brazier', 'floor wood');
	P.thing(x1 - 1, by === y0 + 1 ? y1 - 1 : y0 + 1, 'gas lamp', 'floor wood');
	// Upstairs: rooms along the far side, a passage on the near side, the stair in it.
	P.upRoom(x0, y0, x1, y1, 'brick', 'wood');
	const far = side === 'n' ? [my + 1, y1 - 1] : [y0 + 1, my - 1], wallY = side === 'n' ? my : my;
	for (let x = x0 + 1; x < x1; x++) P.up(x, wallY, 'wall brick');
	let n = 0;
	for (let x = x0 + 4; x < x1 - 1; x += 4) for (let y = far[0]; y <= far[1]; y++) P.up(x, y, 'wall brick');
	for (let x = x0 + 2; x < x1 - 1; x += 4) { P.up(x, wallY, 'floor wood | door'); P.up(x, far[0] === y0 + 1 ? y0 + 1 : y1 - 1, 'floor wood | bed'); n++; }
	const sy = side === 'n' ? y0 + 1 : y1 - 1;
	P.stair(x1 - 2, sy, 'wood');
	return n;
}

/** A church: nave with pews, an altar at the east, a tower at the west with the bell up its stair. Door on `side`. */
function church(P, x0, y0, x1, y1, side) {
	P.room(x0, y0, x1, y1, 'stone block', 'stone block');
	const my = (y0 + y1) >> 1;
	P.thing(x1 - 1, my, 'altar', 'floor stone block');
	for (let x = x0 + 5; x <= x1 - 4; x += 2) for (let y = y0 + 1; y < y1; y++) if (Math.abs(y - my) > 0 && y !== y0 + 1 && y !== y1 - 1) P.thing(x, y, 'pew', 'floor stone block');
	P.thing(x1 - 1, y0 + 1, 'candle', 'floor stone block'); P.thing(x1 - 1, y1 - 1, 'candle', 'floor stone block');
	// The west tower: a room of its own, the bell above.
	for (let y = y0; y <= y1; y++) P.put(x0 + 4, y, y === my ? 'floor stone block | door' : 'wall stone block');
	P.upRoom(x0, y0, x0 + 4, y1, 'stone block', 'stone block');
	P.stair(x0 + 1, y0 + 1, 'stone block');
	P.up(x0 + 2, my, 'floor stone block | bell');
	for (let x = x0 + 6; x < x1 - 1; x += 3) { P.put(x, y0, 'wall glass'); P.put(x, y1, 'wall glass'); }
	const d = side === 's' ? [x0 + 7, y1] : side === 'n' ? [x0 + 7, y0] : side === 'w' ? [x0, my] : [x1, my - 1];
	P.thing(d[0], d[1], 'door', 'floor stone block');
}

/** Abel Quill's: the clockmaker's, clocks on every wall, a bench, the anvil; Abel's rooms over it. */
function clockmaker(P, x0, y0, x1, y1, side) {
	P.room(x0, y0, x1, y1, 'brick', 'wood');
	const mx = (x0 + x1) >> 1, my = (y0 + y1) >> 1;
	const d = side === 's' ? [mx, y1] : side === 'n' ? [mx, y0] : side === 'e' ? [x1, my] : [x0, my];
	P.thing(d[0], d[1], 'door', 'floor wood');
	for (let x = x0 + 1; x < x1; x += 2) for (const y of [y0 + 1, y1 - 1]) if (Math.abs(x - d[0]) + Math.abs(y - d[1]) > 1) P.thing(x, y, 'clock', 'floor wood');
	P.thing(mx - 1, my, 'table', 'floor wood'); P.thing(mx, my, 'table', 'floor wood'); P.thing(mx - 1, my + 1, 'chair', 'floor wood');
	P.thing(x0 + 1, side === 'w' ? my - 2 : my, 'anvil', 'floor wood'); P.thing(x1 - 1, my, 'candle', 'floor wood');
	P.upRoom(x0, y0, x1, y1, 'brick', 'wood');
	P.stair(x1 - 1, my + 1, 'wood');
	P.up(x0 + 1, y0 + 1, 'floor wood | bed'); P.up(x0 + 2, y0 + 1, 'floor wood | clock'); P.up(mx, my, 'floor wood | wheel'); P.up(x1 - 1, y0 + 1, 'floor wood | candle');
}

/** Gas lamps on the given cells where they are street. */
function lamps(P, cells) {
	let n = 0;
	for (const [x, y] of cells) { const c = P.get(x, y); if (c === 'floor cobble' || c === 'floor mud' || c === 'floor stone block' || c === 'floor gravel') { P.thing(x, y, 'gas lamp', c); n++; } }
	return n;
}

// ---- the parish ----

const P = plan(72, 69, 'floor mud', 1888);
const { W, H, put, get, fill, thing, room, house, stair, up, label, rnd } = P;
const C = 'floor cobble';

// ---- the streets ----
fill(1, 7, 70, 8, C); label(2, 9, 'Arches Lane');
fill(30, 7, 32, 67, C); label(33, 10, 'Commercial St');
fill(52, 7, 54, 42, C); label(55, 9, 'Flower & Dean St');
fill(1, 53, 70, 55, C); label(2, 56, 'Thrawl Street');
fill(1, 65, 70, 67, C); label(2, 67, 'Back Alley');
fill(1, 7, 2, 42, C); fill(69, 7, 70, 42, C); fill(1, 53, 2, 67, C); fill(69, 53, 70, 67, C);

// ---- Commercial Square, the clock in the middle ----
fill(22, 19, 44, 33, C);
clockSquare(P, 33, 26, 6, 3.6);
label(23, 18, 'Commercial Square');
// Wentworth Street east from the square, Petticoat Lane's barrows along it.
fill(44, 25, 68, 27, C);
for (let x = 46; x <= 66; x += 3) thing(x, 24 + (x % 2 ? 0 : 4), 'cart', get(x, 24 + (x % 2 ? 0 : 4)) === C ? C : 'floor mud');
label(45, 28, 'Petticoat Lane');

// ---- the viaduct across the north: arches below, the line above ----
// Arches of 6 m, open to Arches Lane: a smithy, a stable, lodgings, a cooper's, a rag shop.
const arches = [];
for (let x = 1; x + 6 <= 70; x += 6) { room(x, 0, x + 6, 6, 'brick', 'soil'); arches.push(x); }
fill(67, 0, 70, 6, 'wall brick');
arches.forEach((x, k) => {
	thing(x + 3, 6, 'door', 'floor soil');
	const kind = k % 5;
	if (kind === 0) { thing(x + 2, 2, 'anvil', 'floor soil'); thing(x + 4, 2, 'oven', 'floor soil'); thing(x + 1, 4, 'barrel', 'floor soil'); }
	if (kind === 1) { thing(x + 2, 2, 'cart', 'floor soil'); thing(x + 4, 2, 'hay bale', 'floor soil'); thing(x + 4, 3, 'hay bale', 'floor soil'); }
	if (kind === 2) { thing(x + 1, 1, 'bed', 'floor soil'); thing(x + 5, 1, 'brazier', 'floor soil'); thing(x + 1, 4, 'chest', 'floor soil'); }
	if (kind === 3) { for (const dx of [1, 2, 4, 5]) thing(x + dx, 1, 'barrel', 'floor soil'); thing(x + 3, 3, 'anvil', 'floor soil'); }
	if (kind === 4) { thing(x + 1, 1, 'chest', 'floor soil'); thing(x + 5, 1, 'chest', 'floor soil'); thing(x + 2, 3, 'loom', 'floor soil'); thing(x + 5, 4, 'bed', 'floor soil'); }
});
label(2, 0, 'The Viaduct');
// The line on top: two tracks, a signal lamp, the station stair in the middle arch.
for (let y = 0; y <= 6; y++) for (let x = 0; x < W; x++) up(x, y, y === 0 || y === 6 || x === 0 || x === W - 1 ? 'wall iron' : 'floor stone block');
for (let x = 1; x < W - 1; x++) { up(x, 2, 'floor stone block | rail'); up(x, 4, 'floor stone block | rail'); }
const sx = arches[Math.floor(arches.length / 2)];
for (let y = 1; y <= 5; y++) for (let x = sx + 1; x <= sx + 5; x++) put(x, y, 'floor stone block');
stair(sx + 3, 1, 'stone block');
up(sx + 2, 5, 'floor stone block | gas lamp'); up(sx + 4, 1, 'floor stone block | clock');
label(sx, 0, 'Station');

// ---- Christ Church, west of the square, and its yard ----
fill(3, 10, 21, 10, 'floor grass');
church(P, 4, 11, 21, 21, 'e');
fill(22, 15, 22, 21, C);
fill(3, 22, 21, 24, 'floor grass');
for (let k = 0; k < 6; k++) thing(5 + k * 3, 23, 'statue', 'floor grass');
label(4, 25, 'Christ Church yard');

// ---- the Ten Bells on the square's north-east corner; Abel Quill's on its south side ----
tenBells(P, 34, 9, 50, 18, 's');
fill(34, 19, 50, 19, C);
label(35, 19, 'The Ten Bells');
clockmaker(P, 36, 34, 44, 40, 'n');
label(36, 41, "Abel Quill's");

// ---- the doss-house, south-west of the square ----
room(4, 27, 21, 41, 'brick', 'wood');
thing(21, 30, 'door', 'floor wood'); fill(22, 30, 29, 31, C);
for (let y = 29; y <= 39; y += 2) for (let x = 6; x <= 18; x += 3) thing(x, y, 'bed', 'floor wood');
thing(5, 40, 'brazier', 'floor wood'); thing(20, 40, 'chest', 'floor wood');
label(4, 26, 'Doss-house');

// ---- Flower and Dean Street: houses facing the street, Wentworth Court and its pump behind ----
terraceCol(P, 10, 24, 55, 6, 'w', [5, 4, 5]);
terraceCol(P, 28, 42, 55, 6, 'w', [5, 4, 5]);
fill(62, 10, 68, 42, 'floor mud');
thing(65, 33, 'well', 'floor stone block');
terraceCol(P, 29, 42, 68, 5, 'e', [5, 4, 4]);
for (let y = 10; y < 24; y += 4) thing(64, y + 1, 'barrel', 'floor mud');
label(60, 29, 'Wentworth Court');
// South of the square: a row facing it, and one on Wentworth Street.
terraceRow(P, 23, 30, 34, 6, 'n', [7]);
terraceRow(P, 45, 51, 29, 6, 'n', [6]);

// ---- the Cut: a straight river of black water between stone wharves, cranes, barges, two bridges ----
for (let y = 45; y <= 50; y++) for (let x = 1; x <= 70; x++) put(x, y, 'floor water');
fill(1, 43, 70, 44, 'floor stone block'); fill(1, 51, 70, 52, 'floor stone block');
label(3, 47, 'The Cut');
// Commercial Street crosses on a stone bridge, parapets each side; an iron footbridge downstream.
for (let y = 45; y <= 50; y++) { put(29, y, 'wall stone block'); put(33, y, 'wall stone block'); for (let x = 30; x <= 32; x++) put(x, y, 'floor stone block'); }
for (let y = 45; y <= 50; y++) { put(60, y, 'wall iron'); put(63, y, 'wall iron'); put(61, y, 'floor iron'); put(62, y, 'floor iron'); }
label(64, 47, 'Iron Bridge');
// The wharves: cranes, crates and casks, a cart; barges moored along the north side.
for (const [x, y] of [[8, 43], [24, 43], [44, 43], [56, 52], [14, 52]]) thing(x, y, 'wheel', 'floor stone block');
for (const [x, y] of [[9, 43], [10, 43], [25, 43], [45, 44], [46, 43], [57, 52], [15, 51], [40, 52], [41, 52]]) thing(x, y, 'barrel', 'floor stone block');
for (const [x, y] of [[11, 44], [26, 44], [47, 44], [58, 51]]) thing(x, y, 'chest', 'floor stone block');
thing(20, 52, 'cart', 'floor stone block'); thing(50, 43, 'cart', 'floor stone block');
for (const [x0, len, y] of [[5, 6, 46], [36, 7, 46], [48, 6, 49], [16, 5, 49]]) for (let x = x0; x < x0 + len; x++) put(x, y, 'floor water | plank bridge');
label(36, 44, 'Wapping Wharf');

// ---- back-to-backs on Thrawl Street, the Back Alley behind ----
terraceRow(P, 3, 69, 56, 4, 'n', [5, 4, 6, 4, 5], { skip: [[30, 33]] });
terraceRow(P, 3, 69, 64, 4, 's', [4, 6, 5, 4, 5], { skip: [[30, 33]], lofts: false });
// A tunnel from Thrawl Street to the Back Alley under the terrace.
fill(30, 56, 32, 64, C);

// ---- gas lamps at the corners, along the wharves, a few between ----
lamps(P, [[3, 8], [29, 8], [33, 8], [51, 8], [55, 8], [68, 8], [3, 42], [29, 42], [34, 42], [51, 42], [55, 42], [68, 42], [22, 19], [44, 19], [22, 33], [44, 33], [56, 27], [66, 25], [65, 30],
	[18, 44], [58, 43], [28, 51], [66, 51], [3, 54], [29, 54], [34, 54], [68, 54], [3, 66], [29, 66], [34, 66], [68, 66]]);

// The parish wall round it all.
for (let x = 0; x < W; x++) { if (!get(x, 0).startsWith('wall')) put(x, 0, 'wall brick'); put(x, H - 1, 'wall brick'); }
for (let y = 0; y < H; y++) { put(0, y, 'wall brick'); put(W - 1, y, 'wall brick'); }
P.clearDoorsteps((c) => c.includes('| cart') || c.includes('| statue') || c.includes('| gas lamp') || c.includes('| barrel') || c.includes('| chest') || c.includes('| wheel'), 'floor mud');
P.connect(33, 22);

P.write(new URL('./whitechapel.tbp', import.meta.url), 'whitechapel', [
	'Whitechapel, the Rookery: the parish round Commercial Square, the Cut through it, for the clockwork games.',
	'Made by town/make-whitechapel.mjs; edit that and run it again. `label x y Name` names a place.'
], { 'floor cobble': ',', 'floor mud': '~', 'wall brick': 'B', 'floor wood': '+', 'floor stone block': 's', 'wall stone block': 'S', 'wall iron': 'I', 'floor iron': 'i', 'floor water': 'w', 'wall glass': 'g', 'floor soil': '.', 'floor grass': '"' });
