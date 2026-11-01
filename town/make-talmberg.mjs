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

// ---- the upper village in its palisade, the well and its benches in the middle ----
const V = { x: 42, y: 21, rx: 30, ry: 16 };
ring(V.x, V.y, V.rx, V.ry, (x, y, d) => { if (d <= 1) put(x, y, d > 0.9 ? 'wall paling' : 'floor soil'); });
label(V.x - 6, V.y - V.ry - 2, 'Upper Village');
// The well, fifteen benches round it.
thing(V.x, V.y, 'well', 'floor gravel');
disc(V.x, V.y, 6.5, (x, y) => { if (get(x, y) === 'floor soil') put(x, y, 'floor gravel'); });
for (let k = 0; k < 15; k++) {
	const a = (k / 15) * Math.PI * 2 - Math.PI / 2;
	thing(Math.round(V.x + Math.cos(a) * 5.5), Math.round(V.y + Math.sin(a) * 5.5), 'chair', 'floor gravel');
}
for (const [x, y] of [[V.x - 7, V.y], [V.x + 7, V.y], [V.x, V.y - 7]]) thing(x, y, 'torch', 'floor gravel');
label(V.x + 2, V.y - 1, 'Well');
// A dozen houses round the well, each with its loft.
const homes = [
	[28, 10, 's'], [36, 8, 's'], [44, 8, 's'], [51, 10, 's'], [21, 13, 's'], [58, 13, 's'],
	[16, 19, 'e'], [62, 19, 'w'], [22, 25, 'n'], [56, 25, 'n'], [48, 28, 'n']
];
for (const [x0, y0, door] of homes) house(x0, y0, x0 + 6, y0 + 5, { door, loft: true, light: 'candle' });
// The tavern by the gate, its hearth and barrels.
house(30, 28, 36, 33, { door: 'n', light: 'brazier', loft: true, extra: [[31, 31, 'barrel']] });
label(30, 34, 'Tavern');
// The gate in the palisade's south, and the bridge over the dry moat.
for (let y = V.y + V.ry - 2; y <= V.y + V.ry + 1; y++) for (const x of [V.x - 1, V.x, V.x + 1]) put(x, y, 'floor soil');
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

// The great hall in the south-west: a round table, sixteen chairs round it, braziers in the corners.
room(K.x0 + 2, 59, 44, K.y1 - 2, 'stone block', 'wood');
for (const x of [38, 39, 40]) thing(x, 59, 'door', 'floor wood');
const T = { x: 35, y: 66 };
disc(T.x, T.y, 3.3, (x, y) => thing(x, y, 'table', 'floor wood'));
for (let k = 0; k < 16; k++) {
	const a = (k / 16) * Math.PI * 2 - Math.PI / 2;
	thing(Math.round(T.x + Math.cos(a) * 4.3), Math.round(T.y + Math.sin(a) * 4.3), 'chair', 'floor wood');
}
for (const [x, y] of [[29, 61], [42, 61], [29, 70], [42, 70]]) thing(x, y, 'brazier', 'floor wood');
label(K.x0 + 3, 58, 'Great Hall');
// The lord's chamber beside it: a bed, a chest, books; the solar above, reached by a stair.
house(45, 64, K.x1 - 2, K.y1 - 2, { wall: 'stone block', floor: 'carpet', door: 'n', light: 'candle', loft: true, extra: [[47, 65, 'bookshelf'], [48, 65, 'bookshelf']] });
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
