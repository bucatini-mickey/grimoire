/**
 * make-talmberg.mjs - draws town/talmberg.tbp: Talmberg, a small castle town for Trouble Brewing and the
 * medieval games, after the castle of that name (a compact keep and its upper village on a hill).
 *
 * Small on purpose: everyone is a short walk from everyone. At the north, the upper village in its
 * palisade: a dozen houses round the well, where fifteen benches stand (speak there and the town hears
 * you). A bridge crosses the dry moat south into the keep: a walled court with a round tower at each
 * northern corner, the kitchens and stores on the west, the great hall in the south-west round its round
 * table (where the town sits in judgement), the lord's chamber beside it, a guardroom on the east. Woods
 * all round, a brook in the south-west, two cottages and a barn by the road east.
 *
 * Two levels: the wall-walk round the keep and its towers' tops, the houses' lofts.
 *
 *   node town/make-talmberg.mjs
 */
import { plan } from './gen.mjs';

const P = plan(84, 86, 'floor grass', 1402);
const { W, H, put, get, fill, thing, room, house, stair, up, label, rnd } = P;
const disc = (cx, cy, r, f) => { for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (Math.hypot(x - cx, y - cy) <= r) f(x, y); };
const ring = (cx, cy, rx, ry, f) => { for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) f(x, y, Math.hypot((x - cx) / rx, (y - cy) / ry)); };

// ---- the land: woods thick at the edge, a brook in the south-west ----
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
	const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
	const p = edge < 2 ? 1 : edge < 6 ? 0.65 : edge < 9 ? 0.2 : 0.03;
	if (rnd() < p) put(x, y, 'wall leaves');
}
const brookAt = (y) => Math.round(2 + (y - 52) * 0.55 + Math.sin(y * 0.3) * 1.5);
for (let y = 52; y < H; y++) for (let dx = -1; dx <= 1; dx++) put(brookAt(y) + dx, y, 'floor water');
for (let y = 52; y < H; y += 3) { const x = brookAt(y) + 2; if (get(x, y) === 'floor grass') thing(x, y, 'reeds', 'floor grass'); }
label(4, 76, 'Brook');

// ---- the upper village in its palisade: a green round the well, houses huddled anyhow ----
// The palisade follows the hilltop, not a compass: an oval pushed in and out (but straight across the
// south, where the gate is).
const V = { x: 42, y: 21, rx: 30, ry: 16 };
const reach = (x, y) => {
	const a = Math.atan2(y - V.y, x - V.x);
	const r = 1 + 0.07 * Math.sin(2 * a + 0.6) + 0.05 * Math.sin(4 * a) * Math.abs(Math.cos(a)) + 0.04 * Math.cos(3 * a);
	return Math.hypot((x - V.x) / V.rx, (y - V.y) / V.ry) / r;
};
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
	const d = reach(x, y);
	if (d <= 1) put(x, y, d > 0.93 ? 'wall paling' : rnd() < 0.18 ? 'floor mud' : 'floor soil');
}
label(V.x - 6, V.y - V.ry - 2, 'Upper Village');
// The green: the well a little west of the middle, fifteen benches round it, its grass worn to gravel.
const well = { x: V.x - 3, y: V.y - 1 };
thing(well.x, well.y, 'well', 'floor gravel');
disc(well.x, well.y, 7, (x, y) => { if (Math.hypot(x - well.x, y - well.y) < 6.6 || rnd() < 0.5) put(x, y, rnd() < 0.25 ? 'floor grass' : 'floor gravel'); });
for (let k = 0; k < 15; k++) {
	const a = (k / 15) * Math.PI * 2 - Math.PI / 2;
	thing(Math.round(well.x + Math.cos(a) * 5.5), Math.round(well.y + Math.sin(a) * 5.5), 'chair', 'floor gravel');
}
for (const [x, y] of [[well.x - 7, well.y], [well.x + 7, well.y], [well.x, well.y - 7]]) thing(x, y, 'torch', 'floor gravel');
label(well.x + 2, well.y - 1, 'Well');
// The gate's lane, kept clear from the green down through the palisade.
const lane = (x, y) => x >= V.x - 2 && x <= V.x + 2 && y >= well.y + 6;
// Houses where they fit: sizes of their own, a gap of a step between them, clear of the green and the
// lane, inside the palisade; each door on the side that looks most toward the well. Most have a loft.
const placed = [];
const fits = (x0, y0, x1, y1) => {
	for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) if (reach(cx, cy) > 0.9) return false;
	for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (lane(x, y) || Math.hypot(x - well.x, (y - well.y) * 1.1) < 8.5) return false;
	return !placed.some((p) => x0 <= p.x1 + 1 && x1 >= p.x0 - 1 && y0 <= p.y1 + 1 && y1 >= p.y0 - 1);
};
const doorToward = (x0, y0, x1, y1, tx, ty) => {
	const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = tx - mx, dy = ty - my;
	return Math.abs(dx) * (y1 - y0) > Math.abs(dy) * (x1 - x0) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n';
};
// The tavern first, the biggest, by the lane to the gate.
house(V.x + 4, V.y + 7, V.x + 12, V.y + 12, { door: 'w', light: 'brazier', loft: true, extra: [[V.x + 10, V.y + 11, 'barrel'], [V.x + 9, V.y + 11, 'barrel']] });
placed.push({ x0: V.x + 4, y0: V.y + 7, x1: V.x + 12, y1: V.y + 12 });
label(V.x + 5, V.y + 13, 'Tavern');
for (let tries = 0; tries < 4000 && placed.length < 20; tries++) {
	const w = 4 + Math.floor(rnd() * 4), h = 4 + Math.floor(rnd() * 3);
	const x0 = Math.round(V.x - V.rx + 2 + rnd() * (2 * V.rx - 4 - w)), y0 = Math.round(V.y - V.ry + 2 + rnd() * (2 * V.ry - 4 - h));
	const x1 = x0 + w, y1 = y0 + h;
	if (!fits(x0, y0, x1, y1)) continue;
	const door = doorToward(x0, y0, x1, y1, well.x, well.y);
	const wood = rnd() < 0.7;
	house(x0, y0, x1, y1, { door, wall: wood ? 'wood' : 'stone block', floor: wood ? 'wood' : 'stone block', loft: w >= 5 && h >= 5 && rnd() < 0.8, light: 'candle' });
	placed.push({ x0, y0, x1, y1 });
	// Behind some, away from the well: a garden of crops in a little fence, or a woodpile.
	const away = { n: [0, 1], s: [0, -1], e: [-1, 0], w: [1, 0] }[door];
	if (rnd() < 0.3) {
		const gx0 = away[0] > 0 ? x1 + 2 : away[0] < 0 ? x0 - 5 : x0, gy0 = away[1] > 0 ? y1 + 2 : away[1] < 0 ? y0 - 4 : y0;
		const gx1 = gx0 + (away[0] ? 3 : Math.min(w, 5)), gy1 = gy0 + (away[1] ? 2 : Math.min(h, 4));
		if (fits(gx0, gy0, gx1, gy1)) {
			for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) {
				const edge = x === gx0 || x === gx1 || y === gy0 || y === gy1;
				put(x, y, edge ? 'wall paling' : (x + y) % 2 ? 'floor tilled | crops' : 'floor tilled');
			}
			placed.push({ x0: gx0, y0: gy0, x1: gx1, y1: gy1 });
		}
	} else if (rnd() < 0.6) {
		const bx = away[0] > 0 ? x1 + 1 : away[0] < 0 ? x0 - 1 : x0 + 1, by = away[1] > 0 ? y1 + 1 : away[1] < 0 ? y0 - 1 : y0 + 1;
		if (get(bx, by) === 'floor soil' || get(bx, by) === 'floor mud') thing(bx, by, rnd() < 0.5 ? 'barrel' : 'hay bale', get(bx, by));
	}
}
// The gate in the palisade's south, and the lane from the green.
for (let y = well.y + 6; y <= V.y + V.ry + 1; y++) for (const x of [V.x - 1, V.x, V.x + 1]) put(x, y, 'floor soil');
for (const x of [V.x - 2, V.x + 2]) thing(x, V.y + V.ry - 1, 'torch', 'floor soil');

// ---- the keep: a walled court, two round towers, the ranges round it ----
const K = { x0: 26, x1: 58, y0: 42, y1: 74 };
// The dry moat round it, its banks thick with bushes.
ring((K.x0 + K.x1) / 2, (K.y0 + K.y1) / 2, 23, 20, (x, y, d) => { if (d <= 1 && d > 0.78) put(x, y, rnd() < 0.18 ? 'wall leaves' : 'floor mud'); });
label(K.x1 + 3, K.y0 - 3, 'Dry Moat');
for (let y = V.y + V.ry + 2; y < K.y0; y++) for (const x of [V.x - 1, V.x, V.x + 1]) put(x, y, 'floor wood');
label(V.x + 3, K.y0 - 4, 'Bridge');
// The curtain wall, its corners rounded; the wall-walk on top.
for (let y = K.y0; y <= K.y1; y++) for (let x = K.x0; x <= K.x1; x++) {
	const cx = Math.max(K.x0 + 3, Math.min(K.x1 - 3, x)), cy = Math.max(K.y0 + 3, Math.min(K.y1 - 3, y));
	const d = Math.hypot(x - cx, y - cy);
	if (d > 3.4) continue;
	put(x, y, d > 1.6 ? 'wall stone block' : 'floor gravel');
	if (d > 1.6) up(x, y, 'floor stone block');
}
label(K.x0, K.y1 + 2, 'Keep');
// The gate in the north wall.
for (let y = K.y0; y <= K.y0 + 2; y++) for (const x of [V.x - 1, V.x, V.x + 1]) put(x, y, 'floor stone block');
thing(V.x - 2, K.y0 + 3, 'torch', 'floor gravel'); thing(V.x + 2, K.y0 + 3, 'torch', 'floor gravel');
// Round towers at the north corners: a room inside each, a stair up to its top.
const tower = (cx, cy) => {
	disc(cx, cy, 4.2, (x, y) => put(x, y, 'wall stone block'));
	disc(cx, cy, 2.6, (x, y) => put(x, y, 'floor stone block'));
	disc(cx, cy, 4.2, (x, y) => up(x, y, 'floor stone block'));
	thing(cx, cy - 1, 'candle', 'floor stone block');
	stair(cx, cy + 1, 'stone block');
	// The door faces the court.
	const dx = cx < V.x ? 1 : -1;
	thing(cx + dx * 3, cy, 'door', 'floor stone block');
	put(cx + dx * 4, cy, 'floor gravel');
	put(cx + dx * 5, cy, 'floor gravel');
};
tower(K.x0 + 6, K.y0 + 6);
tower(K.x1 - 6, K.y0 + 6);
label(K.x0 + 2, K.y0 - 1, 'Towers');
// The court: gravel, the well, torches.
thing(V.x, 56, 'well', 'floor gravel');
for (const [x, y] of [[36, 52], [48, 52], [36, 58], [48, 58]]) thing(x, y, 'torch', 'floor gravel');
label(V.x + 2, 55, 'Court');

// The west range: the kitchens, the stores.
room(K.x0 + 2, 53, 35, 58, 'stone block', 'stone block');
thing(35, 55, 'door', 'floor stone block');
for (const [x, y, k] of [[29, 54, 'oven'], [30, 54, 'oven'], [31, 56, 'table'], [32, 56, 'table'], [29, 57, 'barrel'], [33, 54, 'brazier']]) thing(x, y, k, 'floor stone block');
label(K.x0 + 3, 59, 'Kitchens');
// The east range: the guardroom (a bed for the watch), and the chapel.
house(49, 53, K.x1 - 2, 57, { wall: 'stone block', floor: 'stone block', door: 'w', light: 'brazier' });
label(50, 52, 'Guardroom');
room(49, 58, K.x1 - 2, 62, 'stone block', 'stone block');
thing(49, 60, 'door', 'floor stone block');
thing(55, 59, 'altar', 'floor stone block');
for (const x of [51, 52, 53, 55]) thing(x, 61, 'pew', 'floor stone block');
thing(51, 59, 'candle', 'floor stone block');
label(50, 63, 'Chapel');

// The great hall in the south-west, fifteen metres by nine (a square is a metre): an oval table, sixteen
// chairs round it, braziers in the corners.
room(K.x0 + 2, 62, 44, K.y1 - 2, 'stone block', 'wood');
for (const x of [38, 39, 40]) thing(x, 62, 'door', 'floor wood');
const T = { x: 36, y: 67 };
for (let y = T.y - 3; y <= T.y + 3; y++) for (let x = T.x - 6; x <= T.x + 6; x++) if (Math.hypot((x - T.x) / 5, (y - T.y) / 2.3) <= 1) thing(x, y, 'table', 'floor wood');
for (let k = 0; k < 16; k++) {
	const a = (k / 16) * Math.PI * 2 - Math.PI / 2;
	thing(Math.round(T.x + Math.cos(a) * 6), Math.round(T.y + Math.sin(a) * 3.5), 'chair', 'floor wood');
}
for (const [x, y] of [[29, 63], [43, 63], [29, 71], [43, 71]]) thing(x, y, 'brazier', 'floor wood');
label(K.x0 + 3, 61, 'Great Hall');
// The lord's chamber beside it: a bed, a chest, books; the solar above, reached by a stair.
house(45, 64, 50, K.y1 - 2, { wall: 'stone block', floor: 'carpet', door: 'n', light: 'candle', loft: true, extra: [[46, 65, 'bookshelf']] });
// The solar beside it: the lord's day room, books and a hearth.
room(50, 64, K.x1 - 2, K.y1 - 2, 'stone block', 'carpet');
thing(53, 64, 'door', 'floor carpet');
for (const [x, y, k] of [[51, 65, 'bookshelf'], [52, 65, 'bookshelf'], [53, 68, 'table'], [54, 68, 'table'], [55, 71, 'brazier'], [51, 71, 'candle']]) thing(x, y, k, 'floor carpet');
label(46, K.y1 - 1, 'Lord\'s Chamber');
// Stairs up to the wall-walk from the court.
for (const x of [37, 47]) { stair(x, 46, 'stone block'); up(x, 45, 'floor stone block'); up(x, 44, 'floor stone block'); }

// ---- the road east: two cottages and a barn ----
const road = (pts, spec = 'floor soil', wdt = 2) => {
	for (let k = 0; k + 1 < pts.length; k++) {
		const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
		const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
		for (let t = 0; t <= n; t++) {
			const x = Math.round(ax + ((bx - ax) * t) / n), y = Math.round(ay + ((by - ay) * t) / n);
			for (let dy = 0; dy < wdt; dy++) for (let dx = 0; dx < wdt; dx++) {
				const c = get(x + dx, y + dy);
				if (c === 'floor water') put(x + dx, y + dy, 'floor water | plank bridge');
				else if (c === 'floor grass' || c === 'wall leaves' || c === 'floor mud' || c.startsWith('floor grass |')) put(x + dx, y + dy, spec);
			}
		}
	}
};
road([[44, 37], [60, 37], [72, 42], [72, 60], [60, 84]]);
road([[40, 37], [14, 48], [6, 60]]);
house(70, 46, 77, 52, { door: 'w', loft: true });
house(66, 64, 73, 70, { door: 'n', loft: true });
room(75, 64, 81, 72, 'wood', 'soil');
thing(75, 68, 'door', 'floor soil');
for (const [x, y] of [[77, 66], [78, 66], [77, 70]]) thing(x, y, 'hay bale', 'floor soil');
label(75, 73, 'Barn');
for (const [x, y] of [[70, 40], [66, 60], [20, 44]]) thing(x, y, 'torch', P.floorOf(x, y) ?? 'floor soil');
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (get(x, y) === 'floor grass' && rnd() < 0.04) thing(x, y, 'flowers', 'floor grass');

// The map's edge is the wood; every door has its way to the well.
for (let x = 0; x < W; x++) for (const y of [0, H - 1]) put(x, y, 'wall leaves');
for (let y = 0; y < H; y++) for (const x of [0, W - 1]) put(x, y, 'wall leaves');
P.clearDoorsteps((c) => c === 'wall leaves' || c.startsWith('floor grass |'), 'floor grass');
P.connect(V.x, V.y + 8, { track: 'floor soil' });

P.write(new URL('./talmberg.tbp', import.meta.url), 'talmberg', [
	'Talmberg, a small keep and its upper village, for Grimoire\'s medieval games.',
	'Made by town/make-talmberg.mjs; edit that and run it again. `label x y Name` names a place.'
], { 'floor grass': ',', 'wall leaves': 'T', 'floor gravel': ':', 'floor soil': '.', 'wall wood': 'W', 'floor wood': '+', 'floor water': '~', 'wall stone block': '#', 'floor stone block': 's', 'stair-up wood': '<', 'stair-down wood': '>', 'stair-up stone block': '{', 'stair-down stone block': '}' });
