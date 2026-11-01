/**
 * make-keep.mjs - draws town/keep.tbp: the Keep, the inside of a minor castle on three floors, for Trouble
 * Brewing and the medieval games. No village: the whole game is played within the walls, so nobody is far.
 *
 * A square is a metre, and the rooms are a small castle's: a great hall of fifteen metres by nine round its
 * oval table (where the town sits in judgement), a kitchen and pantry, a chapel, a library, the steward's
 * room, a guardroom and armoury, a bakehouse, the stables and the entrance hall, all round a court with the
 * well and its benches (speak there and everyone in the court hears you). Stairs at two corners of the court
 * climb to the first floor: a gallery round the open court and sixteen small bedchambers. A stair from the
 * north corridor climbs on to the lord's chamber and the solar. Step on a stair and you climb it.
 *
 *   node town/make-keep.mjs
 */
import { plan } from './gen.mjs';

const W = 41, H = 36;
const P = plan(W, H, 'wall stone block', 77);
const [G, F1, F2] = [P.on(0), P.on(1), P.on(2)];
const { label } = P;
/** A bedchamber on level L: a bed in the far corner, a candle, a chest; its door on the side given. */
const chamber = (L, x0, y0, x1, y1, door, { floor = 'wood', extra = [] } = {}) => {
	L.room(x0, y0, x1, y1, 'stone block', floor);
	const mx = (x0 + x1) >> 1, my = (y0 + y1) >> 1;
	const d = door === 's' ? [mx, y1] : door === 'n' ? [mx, y0] : door === 'e' ? [x1, my] : [x0, my];
	L.thing(d[0], d[1], 'door', `floor ${floor}`);
	const fx = d[0] <= mx ? x1 - 1 : x0 + 1, fy = d[1] <= my ? y1 - 1 : y0 + 1;
	L.thing(fx, fy, 'bed', `floor ${floor}`);
	L.thing(fx === x1 - 1 ? x0 + 1 : x1 - 1, fy, 'chest', `floor ${floor}`);
	L.thing(fx, fy === y1 - 1 ? y0 + 1 : y1 - 1, 'candle', `floor ${floor}`);
	for (const [ex, ey, k] of extra) L.thing(ex, ey, k, `floor ${floor}`);
};
/** Things on a level at (x, y), on its floor. */
const put = (L, list, floor) => { for (const [x, y, k] of list) L.thing(x, y, k, floor); };

// ---- the ground floor ----
// The court, open to the sky: fifteen benches round the well.
const C = { x0: 11, x1: 26, y0: 13, y1: 26 }, mid = { x: 18, y: 19 };
G.fill(C.x0, C.y0, C.x1, C.y1, 'floor cobble');
G.thing(mid.x, mid.y, 'well', 'floor stone block');
for (let k = 0; k < 15; k++) {
	const a = (k / 15) * Math.PI * 2 - Math.PI / 2;
	G.thing(Math.round(mid.x + Math.cos(a) * 5.5), Math.round(mid.y + Math.sin(a) * 5.5), 'chair', 'floor cobble');
}
put(G, [[C.x0 + 2, C.y0, 'torch'], [C.x1 - 2, C.y0, 'torch'], [C.x0, C.y1 - 3, 'torch'], [C.x1 - 3, C.y1, 'torch'], [C.x1, C.y0 + 3, 'barrel'], [C.x0 + 4, C.y1, 'cart']], 'floor cobble');
label(mid.x - 2, C.y0, 'Court');

// The great hall, fifteen metres by nine: an oval table, sixteen chairs round it, braziers, the lord's chest.
G.room(2, 2, 18, 12, 'stone block', 'wood');
for (const x of [14, 15, 16]) G.thing(x, 12, 'door', 'floor wood');
const T = { x: 10, y: 7 };
for (let y = T.y - 3; y <= T.y + 3; y++) for (let x = T.x - 6; x <= T.x + 6; x++) if (Math.hypot((x - T.x) / 5, (y - T.y) / 2.3) <= 1) G.thing(x, y, 'table', 'floor wood');
for (let k = 0; k < 16; k++) {
	const a = (k / 16) * Math.PI * 2 - Math.PI / 2;
	G.thing(Math.round(T.x + Math.cos(a) * 6), Math.round(T.y + Math.sin(a) * 3.5), 'chair', 'floor wood');
}
put(G, [[3, 3, 'brazier'], [17, 3, 'brazier'], [3, 11, 'brazier'], [17, 11, 'candle'], [17, 7, 'chest']], 'floor wood');
label(3, 2, 'Great Hall');
// The kitchen and the pantry beside the hall.
G.room(18, 2, 25, 8, 'stone block', 'stone block');
put(G, [[19, 3, 'oven'], [20, 3, 'oven'], [24, 3, 'brazier'], [21, 5, 'table'], [22, 5, 'table'], [19, 7, 'barrel'], [24, 7, 'barrel']], 'floor stone block');
G.thing(21, 8, 'door', 'floor stone block');
G.room(18, 8, 25, 12, 'stone block', 'stone block');
put(G, [[19, 9, 'barrel'], [20, 9, 'barrel'], [24, 9, 'barrel'], [19, 11, 'chest'], [24, 11, 'barrel']], 'floor stone block');
G.thing(22, 12, 'door', 'floor stone block');
label(19, 2, 'Kitchen');
// The chapel: an altar, pews close together.
G.room(25, 2, 34, 12, 'stone block', 'stone block');
G.thing(26, 12, 'door', 'floor stone block');
G.thing(29, 3, 'altar', 'floor stone block');
for (let y = 5; y <= 10; y += 2) for (const x of [27, 28, 31, 32]) G.thing(x, y, 'pew', 'floor stone block');
put(G, [[26, 3, 'candle'], [33, 3, 'candle']], 'floor stone block');
label(26, 2, 'Chapel');
// The north-east tower's undercroft, and the long store down the east wall.
G.room(34, 2, 39, 8, 'stone block', 'stone block');
G.thing(36, 8, 'door', 'floor stone block');
put(G, [[35, 3, 'barrel'], [38, 3, 'barrel'], [38, 7, 'torch'], [35, 7, 'hay bale']], 'floor stone block');
G.room(34, 8, 39, 27, 'stone block', 'stone block');
for (let y = 10; y <= 25; y += 3) put(G, [[35, y, 'barrel'], [38, y, 'barrel'], [38, y + 1, 'hay bale']], 'floor stone block');
G.thing(34, 16, 'door', 'floor stone block');
label(35, 8, 'Store');
// The east range: the guardroom (a bed for the watch) and the armoury.
chamber(G, 27, 12, 34, 19, 'w', { floor: 'stone block', extra: [[31, 15, 'table'], [32, 15, 'table'], [29, 13, 'brazier']] });
label(28, 12, 'Guardroom');
G.room(27, 19, 34, 27, 'stone block', 'stone block');
G.thing(27, 23, 'door', 'floor stone block');
put(G, [[29, 20, 'anvil'], [30, 20, 'brazier'], [33, 20, 'barrel'], [33, 21, 'barrel'], [32, 25, 'chest'], [33, 25, 'chest'], [29, 25, 'barrel']], 'floor stone block');
label(28, 27, 'Armoury');
// The west range: the library and the steward's room.
G.room(2, 12, 10, 20, 'stone block', 'wood');
G.thing(10, 16, 'door', 'floor wood');
for (let x = 3; x <= 9; x++) if (x !== 6) G.thing(x, 13, 'bookshelf', 'floor wood');
put(G, [[5, 16, 'table'], [6, 16, 'table'], [3, 19, 'candle'], [9, 19, 'bookshelf']], 'floor wood');
label(3, 12, 'Library');
chamber(G, 2, 20, 10, 27, 'e', { floor: 'wood', extra: [[5, 23, 'table'], [4, 21, 'bookshelf']] });
label(3, 27, 'Steward');
// The south range: the bakehouse, the entrance hall, the stables.
G.room(2, 27, 13, 33, 'stone block', 'stone block');
G.thing(12, 27, 'door', 'floor stone block');
put(G, [[3, 28, 'oven'], [4, 28, 'oven'], [6, 30, 'table'], [7, 30, 'table'], [12, 32, 'barrel'], [3, 32, 'hay bale']], 'floor stone block');
label(3, 33, 'Bakehouse');
G.room(13, 27, 25, 33, 'stone block', 'stone block');
for (const x of [18, 19, 20]) G.thing(x, 27, 'door', 'floor stone block');
put(G, [[14, 28, 'torch'], [24, 28, 'torch'], [19, 31, 'rug'], [14, 32, 'chest']], 'floor stone block');
label(14, 33, 'Entrance Hall');
G.room(25, 27, 39, 33, 'stone block', 'soil');
G.thing(26, 27, 'door', 'floor soil');
for (const x of [29, 32, 35]) for (let y = 28; y <= 30; y++) G.put(x, y, 'wall wood');
put(G, [[30, 28, 'hay bale'], [33, 28, 'hay bale'], [36, 28, 'hay bale'], [38, 32, 'cart'], [27, 32, 'torch']], 'floor soil');
label(26, 33, 'Stables');
// Stairs up at two corners of the court.
G.stair(C.x0, C.y0, 'stone block');
G.stair(C.x1, C.y1, 'stone block');

// ---- the first floor: a gallery round the open court, sixteen small bedchambers ----
// The gallery: the court's edge, two wide, the middle open to the sky.
for (let y = C.y0; y <= C.y1; y++) for (let x = C.x0 - 1; x <= C.x1; x++) {
	if (x >= C.x0 + 2 && x <= C.x1 - 2 && y >= C.y0 + 2 && y <= C.y1 - 2) continue;
	if (!F1.get(x, y)) F1.put(x, y, 'floor wood');
}
// The corridors: north (two wide) and south, the width of the keep, and west down to the gallery.
F1.fill(3, 11, 33, 12, 'floor wood');
F1.fill(3, 27, 33, 27, 'floor wood');
F1.fill(9, 13, 9, 26, 'floor wood');
// Bedchambers, each about four metres by five: six along the north, six along the south, two west, two east.
for (let k = 0; k < 6; k++) {
	const x0 = 2 + k * 5, x1 = x0 + 5;
	chamber(F1, x0, 4, x1, 10, 's');
	chamber(F1, x0, 28, x1, 34, 'n');
}
chamber(F1, 2, 13, 8, 19, 'e'); chamber(F1, 2, 19, 8, 26, 'e');
chamber(F1, 27, 13, 33, 19, 'w'); chamber(F1, 27, 19, 33, 26, 'w');
// Walls round the corridors where nothing else stands.
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
	if (F1.get(x, y)) continue;
	const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const c = F1.get(x + dx, y + dy); return !!c && c.startsWith('floor'); });
	const overCourt = x >= C.x0 + 2 && x <= C.x1 - 2 && y >= C.y0 + 2 && y <= C.y1 - 2;
	if (near && !overCourt) F1.put(x, y, 'wall stone block');
}
for (const [x, y] of [[12, 12], [26, 12], [12, 27], [26, 27]]) F1.thing(x, y, 'candle', 'floor wood');

// ---- the second floor: the lord's chamber and the solar, over the north range ----
F2.fill(20, 12, 36, 12, 'floor wood');
chamber(F2, 22, 5, 29, 11, 's', { floor: 'carpet', extra: [[24, 6, 'rug'], [27, 8, 'bookshelf']] });
F2.room(29, 5, 36, 11, 'stone block', 'carpet');
F2.thing(32, 11, 'door', 'floor carpet');
put(F2, [[30, 6, 'bookshelf'], [31, 6, 'bookshelf'], [33, 8, 'table'], [34, 8, 'table'], [35, 6, 'brazier'], [30, 10, 'candle']], 'floor carpet');
for (let x = 19; x <= 37; x++) for (const y of [11, 13]) if (!F2.get(x, y)) F2.put(x, y, 'wall stone block');
F2.put(19, 12, 'wall stone block'); F2.put(37, 12, 'wall stone block');
label(23, 4, 'Lord\'s Chamber');
// The stair up from the first floor's north corridor (its upper lane, so the corridor's lower lane stays clear).
F1.stair(21, 11, 'wood');

P.write(new URL('./keep.tbp', import.meta.url), 'keep', [
	'The Keep, a minor castle\'s inside on three floors round an open court (a square is a metre), for Grimoire\'s medieval games.',
	'Made by town/make-keep.mjs; edit that and run it again. `label x y Name` names a place.'
], { 'wall stone block': '#', 'floor stone block': 's', 'floor wood': '+', 'floor cobble': ':', 'floor carpet': 'c', 'stair-up stone block': '{', 'stair-down stone block': '}', 'stair-up wood': '<', 'stair-down wood': '>' });
