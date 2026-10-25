/**
 * make-whitechapel.mjs - draws town/whitechapel.tbp: Whitechapel in the fog, for Sects & Violets,
 * clockwork London (gaslight, soot and brass; clockwork, not steampunk).
 *
 * Cobbled streets on a grid, gas lamps at the corners, terraces of sooty brick back to back with a
 * yard or an alley between. Commercial Square in the middle: the public clock (speak there and the
 * whole parish hears you; fifteen benches round it). North of the square, the Ten Bells, whose long
 * tables the parish sits at for its reckonings. Christ Church and its yard; Abel Quill's, the
 * clockmaker's, every wall of it clocks; the doss-house; the workhouse; the market's barrows. To the
 * south the river: wharves, warehouses, stairs down to the water.
 *
 * Two levels: the terraces' back bedrooms, the Ten Bells' rooms, the warehouse lofts, the clock loft.
 *
 *   node town/make-whitechapel.mjs
 */
import { plan } from './gen.mjs';

const P = plan(104, 88, 'floor cobble', 1888);
const { W, H, put, get, fill, thing, room, house, stair, upRoom, up, label, rnd } = P;

// ---- the river along the south, its wharves and the stairs down ----
const riverTop = 77;
for (let y = riverTop; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 'floor water');
fill(0, riverTop - 3, W - 1, riverTop - 1, 'floor stone block');
for (const x of [18, 52, 86]) for (let y = riverTop; y <= riverTop + 4; y++) { put(x, y, 'floor water | plank bridge'); put(x + 1, y, 'floor water | plank bridge'); }
label(4, riverTop + 2, 'The River');

// ---- the streets: two lanes wide, cobbled; between them, blocks ----
const COLS = [2, 26, 50, 76, 100], ROWS = [2, 20, 38, 56, 73];
for (const x of COLS) fill(x, 0, x + 1, riverTop - 1, 'floor cobble');
for (const y of ROWS) fill(0, y, W - 1, y + 1, 'floor cobble');
const names = ['Fournier Street', 'Hanbury Street', 'Dorset Street', 'Thrawl Street'];
ROWS.slice(1).forEach((y, k) => label(4, y - 1, names[k]));
label(COLS[1] + 3, 1, 'Commercial Street');

/** A block between streets: terraces back to back, a yard or alley between their backs. */
const terrace = (x0, y0, x1, y1) => {
	const mid = (y0 + y1) >> 1;
	fill(x0, y0, x1, y1, 'floor mud');
	// Houses of five to seven yards' frontage; now and then a court round a pump instead, or an alley cut through.
	for (let x = x0, wd = 6; x1 - x >= 4; x += wd, wd = 5 + Math.floor(rnd() * 3)) {
		// The last house takes what is left of the row.
		if (x1 - x <= 9 || x + wd > x1) wd = x1 - x;
		const r = rnd();
		if (r < 0.12 && x > x0) { fill(x + 1, y0, x + wd - 1, y1, 'floor gravel'); thing(x + (wd >> 1), mid, 'well', 'floor gravel'); continue; }
		if (r < 0.2 && x > x0) { fill(x + 2, y0, x + 3, y1, 'floor gravel'); }
		const loft = rnd() < 0.5;
		if (!(r < 0.2 && x > x0)) house(x, y0, x + wd, mid - 1, { wall: 'brick', floor: 'wood', door: 'n', loft, light: 'candle' });
		if (!(r < 0.2 && x > x0)) house(x, mid + 1, x + wd, y1, { wall: 'brick', floor: 'wood', door: 's', loft: !loft, light: 'candle' });
	}
	// The alley between the backs, a lamp at its mouth.
	fill(x0, mid, x1, mid, 'floor gravel');
	thing(x0, mid, 'gas lamp', 'floor gravel');
};

const blockOf = (c, r) => ({ x0: COLS[c] + 2, x1: COLS[c + 1] - 1, y0: ROWS[r] + 2, y1: ROWS[r + 1] - 1 });
for (let r = 0; r < ROWS.length - 1; r++) for (let c = 0; c < COLS.length - 1; c++) {
	const b = blockOf(c, r);
	// The square and the buildings round it are drawn after.
	if ((r === 1 || r === 2) && (c === 1 || c === 2)) continue;
	if (r === 0 && c === 1) continue; // Christ Church
	if (r === 3 && c === 3) continue; // the warehouses
	terrace(b.x0, b.y0, b.x1, b.y1);
}

// ---- Commercial Square: the public clock, fifteen benches round it ----
const sq = { x0: COLS[1] + 2, x1: COLS[3] - 1, y0: ROWS[2] + 2, y1: ROWS[3] - 1 };
const qx = (sq.x0 + sq.x1) >> 1, qy = (sq.y0 + sq.y1) >> 1;
fill(sq.x0, sq.y0, sq.x1, sq.y1, 'floor cobble');
thing(qx, qy, 'clock', 'floor stone block');
for (let k = 0; k < 15; k++) {
	const a = (k / 15) * Math.PI * 2;
	thing(Math.round(qx + Math.cos(a) * 9), Math.round(qy + Math.sin(a) * 5), 'chair', 'floor cobble');
}
for (const [x, y] of [[sq.x0, sq.y0], [sq.x1, sq.y0], [sq.x0, sq.y1], [sq.x1, sq.y1]]) thing(x, y, 'gas lamp', 'floor cobble');
// Barrows of the market along the square's edge.
for (let x = sq.x0 + 3; x < sq.x1 - 2; x += 6) thing(x, sq.y1 - 1, 'cart', 'floor cobble');
label(qx - 8, sq.y0 - 1, 'Commercial Square');

// ---- the Ten Bells, north of the square: long tables, rooms above ----
const tb = { x0: COLS[1] + 4, x1: COLS[2] + 12, y0: ROWS[1] + 2, y1: ROWS[2] - 1 };
fill(COLS[1] + 2, ROWS[1] + 2, COLS[3] - 1, ROWS[2] - 1, 'floor cobble');
room(tb.x0, tb.y0, tb.x1, tb.y1, 'brick', 'wood');
const tbx = (tb.x0 + tb.x1) >> 1;
for (const x of [tbx - 1, tbx]) thing(x, tb.y1, 'door', 'floor wood');
for (const ty of [tb.y0 + 11]) {
	for (let x = tb.x0 + 6; x <= tb.x1 - 6; x++) thing(x, ty, 'table', 'floor wood');
	for (let x = tb.x0 + 6; x <= tb.x1 - 6; x += 2) { thing(x, ty - 1, 'chair', 'floor wood'); thing(x, ty + 1, 'chair', 'floor wood'); }
}
for (let x = tb.x0 + 2; x <= tb.x0 + 4; x++) thing(x, tb.y0 + 1, 'barrel', 'floor wood');
for (const [x, y] of [[tb.x0 + 1, tb.y1 - 1], [tb.x1 - 1, tb.y1 - 1], [tb.x1 - 1, tb.y0 + 1]]) thing(x, y, 'gas lamp', 'floor wood');
upRoom(tb.x0, tb.y0, tb.x1, tb.y1, 'brick', 'wood');
for (let x = tb.x0 + 6; x < tb.x1; x += 6) { for (let y = tb.y0; y <= tb.y0 + 6; y++) up(x, y, 'wall brick'); up(x - 3, tb.y0 + 2, 'floor wood | bed'); }
for (let x = tb.x0 + 6; x < tb.x1; x += 6) up(x, tb.y0 + 6, 'floor wood | door');
for (let x = tb.x0 + 1; x < tb.x1; x++) up(x, tb.y0 + 7, 'floor wood');
stair(tb.x0 + 1, tb.y0 + 8, 'wood');
label(tb.x0, tb.y0 - 1, 'The Ten Bells');

// ---- Abel Quill's, the clockmaker's, east of the Ten Bells: clocks on every wall ----
const cm = { x0: tb.x1 + 3, x1: COLS[3] - 2, y0: ROWS[1] + 3, y1: ROWS[2] - 2 };
house(cm.x0, cm.y0, cm.x1, cm.y1, { wall: 'brick', floor: 'wood', door: 's', loft: true, light: 'gas lamp', extra: [] });
for (let x = cm.x0 + 1; x < cm.x1; x += 2) thing(x, cm.y0 + 1, 'clock', 'floor wood');
thing(cm.x0 + 2, cm.y1 - 2, 'anvil', 'floor wood');
label(cm.x0, cm.y0 - 1, "Abel Quill's");

// ---- the doss-house and the workhouse, the far sides of the square ----
const dh = { x0: COLS[1] + 2, x1: COLS[1] + 12, y0: ROWS[3] + 2, y1: ROWS[4] - 1 };
fill(dh.x0, dh.y0, COLS[3] - 1, dh.y1, 'floor cobble');
room(dh.x0, dh.y0, dh.x1, dh.y1, 'brick', 'wood');
thing((dh.x0 + dh.x1) >> 1, dh.y0, 'door', 'floor wood');
for (let y = dh.y0 + 2; y < dh.y1; y += 2) { thing(dh.x0 + 1, y, 'bed', 'floor wood'); thing(dh.x1 - 1, y, 'bed', 'floor wood'); }
thing(dh.x0 + 5, dh.y1 - 1, 'brazier', 'floor wood');
label(dh.x0, dh.y0 - 1, 'Doss-house');
const wh = { x0: dh.x1 + 3, x1: COLS[3] - 2, y0: ROWS[3] + 2, y1: ROWS[4] - 1 };
room(wh.x0, wh.y0, wh.x1, wh.y1, 'stone block', 'stone block');
thing((wh.x0 + wh.x1) >> 1, wh.y0, 'door', 'floor stone block');
for (let x = wh.x0 + 2; x < wh.x1 - 1; x += 3) { thing(x, wh.y0 + 3, 'loom', 'floor stone block'); thing(x, wh.y0 + 7, 'loom', 'floor stone block'); }
thing(wh.x1 - 1, wh.y1 - 1, 'oven', 'floor stone block');
label(wh.x0, wh.y0 - 1, 'The Workhouse');

// ---- Christ Church and its yard ----
const cc = blockOf(1, 0);
fill(cc.x0, cc.y0, cc.x1, cc.y1, 'floor grass');
room(cc.x0 + 3, cc.y0 + 2, cc.x1 - 3, cc.y1 - 2, 'stone block', 'stone block');
const ccx = (cc.x0 + cc.x1) >> 1;
thing(ccx, cc.y1 - 2, 'door', 'floor stone block');
thing(ccx, cc.y0 + 3, 'altar', 'floor stone block');
for (let y = cc.y0 + 5; y < cc.y1 - 3; y++) for (const x of [ccx - 4, ccx - 3, ccx - 2, ccx + 2, ccx + 3, ccx + 4]) thing(x, y, 'pew', 'floor stone block');
for (const x of [ccx - 6, ccx + 6]) thing(x, cc.y0 + 3, 'candle', 'floor stone block');
upRoom(cc.x0 + 3, cc.y0 + 2, cc.x0 + 9, cc.y0 + 8, 'stone block', 'stone block');
stair(cc.x0 + 4, cc.y0 + 3, 'stone block');
up(cc.x0 + 7, cc.y0 + 5, 'floor stone block | bell');
for (let k = 0; k < 8; k++) thing(cc.x0 + 1 + (k % 4) * 6, k < 4 ? cc.y0 : cc.y1, 'statue', 'floor grass');
label(cc.x0 + 3, cc.y0 + 1, 'Christ Church');

// ---- the warehouses on the wharf, east ----
const wa = blockOf(3, 3);
fill(wa.x0, wa.y0, wa.x1, wa.y1, 'floor stone block');
room(wa.x0, wa.y0, wa.x1, wa.y1, 'brick', 'wood');
thing((wa.x0 + wa.x1) >> 1, wa.y1, 'door', 'floor wood');
for (let x = wa.x0 + 2; x < wa.x1 - 1; x += 3) for (let y = wa.y0 + 2; y < wa.y1 - 2; y += 3) thing(x, y, rnd() < 0.5 ? 'barrel' : 'chest', 'floor wood');
upRoom(wa.x0, wa.y0, wa.x1, wa.y1, 'brick', 'wood');
stair(wa.x0 + 1, wa.y1 - 1, 'wood');
label(wa.x0, wa.y0 - 1, 'Bonded Warehouses');

// ---- gas lamps at the street corners; the river's edge ----
for (const x of COLS) for (const y of ROWS) if (get(x, y) === 'floor cobble') thing(x, y, 'gas lamp', 'floor cobble');
for (let x = 4; x < W; x += 12) thing(x, riverTop - 2, 'gas lamp', 'floor stone block');
// The map's edge: the river, or a brick wall where the streets run off.
for (let x = 0; x < W; x++) if (get(x, 0) !== 'floor water') put(x, 0, 'wall brick');
for (let y = 0; y < riverTop; y++) for (const x of [0, W - 1]) put(x, y, 'wall brick');
for (let x = 0; x < W; x++) put(x, H - 1, 'floor water');
P.connect(qx + 9, qy, { track: 'floor gravel', tree: () => false });

P.write(new URL('./whitechapel.tbp', import.meta.url), 'whitechapel', [
	'Whitechapel in the fog, for Grimoire\'s Sects & Violets games.',
	'Made by town/make-whitechapel.mjs; edit that and run it again. `label x y Name` names a place.'
], { 'floor cobble': '.', 'wall brick': '#', 'floor wood': '+', 'floor water': '~', 'floor mud': ',', 'floor gravel': ':', 'wall stone block': 'S', 'floor stone block': 's', 'floor grass': '"', 'stair-up wood': '<', 'stair-down wood': '>' });
