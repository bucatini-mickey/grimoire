/**
 * make-keep.mjs - draws town/keep.tbp: the Keep, the inside of a castle on three floors, for Trouble Brewing
 * and the medieval games. No village: the whole game is played within the walls, so nobody is far away.
 *
 * The ground floor is four ranges round an open court: the great hall (its round table is where the town
 * sits in judgement), the kitchens and the chapel on the north; the guardroom west, the armoury east;
 * the library, the entrance hall and the steward's room on the south. In the court, fifteen benches round
 * the fountain (speak there and everyone in the court hears you). Stairs at two corners of the court climb
 * to the first floor: a gallery round the open court and sixteen bedchambers. Two more stairs climb to the
 * second floor: the solar, the lord's chambers and more bedchambers. Step on a stair and you climb it.
 *
 *   node town/make-keep.mjs
 */
import { plan } from './gen.mjs';

const W = 60, H = 46;
const P = plan(W, H, 'wall stone block', 77);
const [G, F1, F2] = [P.on(0), P.on(1), P.on(2)];
const { label } = P;
const disc = (cx, cy, r, f) => { for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (Math.hypot(x - cx, y - cy) <= r) f(x, y); };
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

// ---- the ground floor ----
// The court, open to the sky: fifteen benches round the fountain, torches at its corners.
const C = { x0: 18, x1: 41, y0: 16, y1: 29 }, mid = { x: 29, y: 22 };
G.fill(C.x0, C.y0, C.x1, C.y1, 'floor cobble');
G.thing(mid.x, mid.y, 'well', 'floor stone block');
for (let k = 0; k < 15; k++) {
	const a = (k / 15) * Math.PI * 2 - Math.PI / 2;
	G.thing(Math.round(mid.x + Math.cos(a) * 5.5), Math.round(mid.y + Math.sin(a) * 5.5), 'chair', 'floor cobble');
}
for (const [x, y] of [[C.x0 + 2, C.y0], [C.x1 - 2, C.y0], [C.x0, C.y1 - 2], [C.x1 - 2, C.y1]]) G.thing(x, y, 'torch', 'floor cobble');
label(mid.x - 2, C.y0, 'Court');

// The great hall: a round table and sixteen chairs, braziers in the corners.
G.room(2, 2, 27, 15, 'stone block', 'wood');
for (const x of [21, 22, 23]) G.thing(x, 15, 'door', 'floor wood');
const T = { x: 14, y: 8 };
disc(T.x, T.y, 3.3, (x, y) => G.thing(x, y, 'table', 'floor wood'));
for (let k = 0; k < 16; k++) {
	const a = (k / 16) * Math.PI * 2 - Math.PI / 2;
	G.thing(Math.round(T.x + Math.cos(a) * 4.3), Math.round(T.y + Math.sin(a) * 4.3), 'chair', 'floor wood');
}
for (const [x, y] of [[4, 4], [25, 4], [4, 13], [25, 13]]) G.thing(x, y, 'brazier', 'floor wood');
label(3, 2, 'Great Hall');
// The kitchens.
G.room(27, 2, 39, 15, 'stone block', 'stone block');
G.thing(33, 15, 'door', 'floor stone block');
for (const [x, y, k] of [[29, 4, 'oven'], [30, 4, 'oven'], [33, 8, 'table'], [34, 8, 'table'], [29, 12, 'barrel'], [30, 12, 'barrel'], [37, 4, 'brazier']]) G.thing(x, y, k, 'floor stone block');
label(28, 2, 'Kitchens');
// The chapel.
G.room(39, 2, 57, 15, 'stone block', 'stone block');
G.thing(40, 15, 'door', 'floor stone block');
G.thing(48, 4, 'altar', 'floor stone block');
for (let y = 7; y <= 12; y += 2) for (const x of [43, 44, 45, 51, 52, 53]) G.thing(x, y, 'pew', 'floor stone block');
for (const x of [42, 54]) G.thing(x, 4, 'candle', 'floor stone block');
label(40, 2, 'Chapel');
// The guardroom west (a bed for the watch), the armoury east.
chamber(G, 2, 15, 17, 30, 'e', { floor: 'stone block', extra: [[5, 18, 'table'], [6, 18, 'table'], [4, 26, 'barrel'], [14, 17, 'brazier']] });
label(3, 16, 'Guardroom');
G.room(42, 15, 57, 30, 'stone block', 'stone block');
G.thing(42, 22, 'door', 'floor stone block');
for (const [x, y, k] of [[45, 18, 'anvil'], [47, 18, 'brazier'], [54, 18, 'barrel'], [54, 19, 'barrel'], [50, 26, 'chest'], [51, 26, 'chest']]) G.thing(x, y, k, 'floor stone block');
label(43, 16, 'Armoury');
// The south range: the library, the entrance hall, the steward's room.
G.room(2, 30, 21, 43, 'stone block', 'wood');
G.thing(19, 30, 'door', 'floor wood');
for (let x = 4; x <= 19; x++) if (x % 5) G.thing(x, 32, 'bookshelf', 'floor wood');
for (const [x, y, k] of [[8, 37, 'table'], [9, 37, 'table'], [14, 37, 'table'], [15, 37, 'table'], [4, 41, 'candle'], [19, 41, 'candle']]) G.thing(x, y, k, 'floor wood');
label(3, 30, 'Library');
G.room(21, 30, 38, 43, 'stone block', 'stone block');
for (const x of [28, 29, 30]) G.thing(x, 30, 'door', 'floor stone block');
G.thing(29, 38, 'rug', 'floor stone block');
for (const [x, y] of [[23, 32], [36, 32], [23, 41], [36, 41]]) G.thing(x, y, 'torch', 'floor stone block');
label(22, 43, 'Entrance Hall');
chamber(G, 38, 30, 57, 43, 'n', { floor: 'wood', extra: [[44, 36, 'table'], [45, 36, 'table'], [54, 33, 'bookshelf']] });
G.thing(39, 30, 'door', 'floor wood');
label(39, 43, 'Steward');
// The stairs up, at two corners of the court.
G.stair(C.x0, C.y0, 'stone block');
G.stair(C.x1, C.y1, 'stone block');

// ---- the first floor: a gallery round the open court, sixteen bedchambers ----
// Corridors: north and south the width of the keep, west and east the galleries over the court.
F1.fill(3, 13, 56, 14, 'floor wood');
F1.fill(3, 31, 56, 32, 'floor wood');
F1.fill(16, 13, 17, 32, 'floor wood');
F1.fill(42, 13, 43, 32, 'floor wood');
for (let x = 2; x <= 57; x++) for (const y of [12, 15, 30, 33]) if (!F1.get(x, y)) F1.put(x, y, 'wall stone block');
for (let y = 12; y <= 33; y++) for (const x of [2, 57]) F1.put(x, y, 'wall stone block');
// The stairs come up at the court's corners; a step of floor beside each.
F1.put(C.x0, C.y0 - 1, 'floor wood'); F1.put(C.x1 + 1, C.y1, 'floor wood');
// Rooms north (doors south onto the corridor) and south (doors north), two each side west and east.
const north = [[2, 11], [11, 20], [20, 29], [29, 38], [38, 47], [47, 57]];
for (const [x0, x1] of north) chamber(F1, x0, 2, x1, 12, 's');
for (const [x0, x1] of north) chamber(F1, x0, 33, x1, 43, 'n');
chamber(F1, 2, 15, 15, 22, 'e'); chamber(F1, 2, 22, 15, 30, 'e');
chamber(F1, 44, 15, 57, 22, 'w'); chamber(F1, 44, 22, 57, 30, 'w');
for (const [x, y] of [[16, 13], [43, 13], [16, 32], [43, 32]]) F1.thing(x, y, 'candle', 'floor wood');
label(3, 13, 'Gallery');

// ---- the second floor: the solar, the lord's chambers, bedchambers, the roof walk ----
F2.fill(3, 13, 56, 14, 'floor wood');
F2.fill(3, 31, 56, 32, 'floor wood');
F2.fill(16, 13, 17, 32, 'floor slate');
F2.fill(42, 13, 43, 32, 'floor slate');
for (let x = 2; x <= 57; x++) for (const y of [12, 15, 30, 33]) if (!F2.get(x, y)) F2.put(x, y, 'wall stone block');
for (let y = 12; y <= 33; y++) for (const x of [2, 57]) F2.put(x, y, 'wall stone block');
for (const [x0, x1] of [[2, 15], [15, 29], [29, 43], [43, 57]]) chamber(F2, x0, 2, x1, 12, 's', { floor: 'carpet' });
chamber(F2, 2, 15, 15, 30, 'e', { floor: 'carpet', extra: [[5, 17, 'bookshelf'], [6, 17, 'bookshelf']] });
chamber(F2, 44, 15, 57, 30, 'w', { floor: 'carpet' });
// The solar: the lord's day room, books and a hearth.
F2.room(2, 33, 30, 43, 'stone block', 'carpet');
F2.thing(16, 33, 'door', 'floor carpet');
for (let x = 4; x <= 28; x += 3) F2.thing(x, 42, 'bookshelf', 'floor carpet');
for (const [x, y, k] of [[10, 37, 'table'], [11, 37, 'table'], [20, 37, 'table'], [21, 37, 'table'], [4, 35, 'brazier'], [28, 35, 'candle']]) F2.thing(x, y, k, 'floor carpet');
label(3, 44, 'Solar');
chamber(F2, 30, 33, 57, 43, 'n', { floor: 'carpet', extra: [[40, 38, 'rug'], [50, 35, 'bookshelf']] });
label(31, 44, 'Lord\'s Chambers');
for (const [x, y] of [[16, 13], [43, 13], [16, 32], [43, 32]]) F2.thing(x, y, 'candle', P.on(2).get(x, y)?.split('|')[0].trim());
label(18, 31, 'Roof Walk');
// The stairs from the first floor on up (drawn last, over the second floor's corridors).
F1.stair(43, 14, 'wood');
F1.stair(16, 31, 'wood');

P.write(new URL('./keep.tbp', import.meta.url), 'keep', [
	'The Keep, a castle\'s inside on three floors round an open court, for Grimoire\'s medieval games.',
	'Made by town/make-keep.mjs; edit that and run it again. `label x y Name` names a place.'
], { 'wall stone block': '#', 'floor stone block': 's', 'floor wood': '+', 'floor cobble': ':', 'floor carpet': 'c', 'floor slate': '=', 'stair-up stone block': '{', 'stair-down stone block': '}', 'stair-up wood': '<', 'stair-down wood': '>' });
