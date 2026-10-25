/**
 * make-grimm.mjs - draws town/grimm.tbp: Wolfsgrund, a village in the snow for Bad Moon Rising, a grim
 * German fairy tale.
 *
 * Mountains of black rock along the north, snow on everything. A stream comes down out of the
 * mountains, frozen at the edges, turns the mill's wheel and runs off south-east into the wood. The
 * village sits in a clearing: timbered houses round the well (speak there and the whole village hears
 * you; fifteen benches round it), the Gasthaus zum Wolf, whose long table is where the village sits
 * in judgement, the smithy, the mill. The pine wood presses in on every side, and deep in it, where the
 * paths give out: the woodcutter's hut, the old chapel and its graves, and the cottage with the oven.
 *
 * Two levels: the houses' bedchambers under the roof, the inn's rooms, the mill's loft.
 *
 *   node town/make-grimm.mjs
 */
import { plan } from './gen.mjs';

const P = plan(100, 84, 'floor snow', 1812);
const { W, H, put, get, fill, thing, room, house, stair, upRoom, up, label, rnd } = P;
const wave = (x, y) => Math.sin(x * 0.23) * 0.5 + Math.cos(y * 0.19 + x * 0.07) * 0.5 + Math.sin((x - y) * 0.11) * 0.4;

// ---- the mountains: black rock along the north, ragged, with snowy ledges ----
for (let x = 0; x < W; x++) {
	const top = 9 + Math.round(wave(x, 3) * 4 + Math.sin(x * 0.08) * 3);
	for (let y = 0; y < top; y++) put(x, y, rnd() < 0.82 ? 'wall granite' : 'floor granite');
}
// A cave in the cliff above the mill, where nobody goes.
for (let y = 6; y <= 13; y++) for (let x = 18; x <= 23; x++) if (Math.hypot((x - 20.5) / 3, (y - 9) / 4) < 1) put(x, y, 'floor granite');
label(16, 5, 'The Hollow');

// ---- the wood: pines thick round the edge, thinning into the clearing ----
const cx = 50, cy = 46;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
	if (get(x, y) !== 'floor snow') continue;
	const d = Math.hypot((x - cx) / 34, (y - cy) / 26) + wave(x, y) * 0.12;
	const p = d > 1.05 ? 0.62 : d > 0.9 ? 0.3 : d > 0.78 ? 0.08 : 0;
	if (rnd() < p) put(x, y, 'wall pine');
	else if (d > 0.9 && rnd() < 0.05) thing(x, y, 'fern', 'floor snow');
}

// ---- the stream: out of the mountains by the cave, past the mill, away south-east ----
const streamAt = (y) => Math.round(24 + (y - 12) * 0.62 + Math.sin(y * 0.21) * 3);
for (let y = 12; y < H; y++) {
	const sx = streamAt(y);
	for (let dx = -2; dx <= 2; dx++) put(sx + dx, y, Math.abs(dx) === 2 ? 'floor ice' : 'floor water');
}
label(streamAt(20) + 3, 20, 'Mill Brook');

// ---- paths of trodden snow ----
const path = (pts, wdt = 1) => {
	for (let k = 0; k + 1 < pts.length; k++) {
		const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
		const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
		for (let t = 0; t <= n; t++) {
			const x = Math.round(ax + ((bx - ax) * t) / n), y = Math.round(ay + ((by - ay) * t) / n);
			for (let dy = 0; dy < wdt; dy++) for (let dx = 0; dx < wdt; dx++) {
				const c = get(x + dx, y + dy);
				if (c === 'floor water' || c === 'floor ice') put(x + dx, y + dy, 'floor water | plank bridge');
				else if (!c.startsWith('wall granite')) put(x + dx, y + dy, 'floor soil');
			}
		}
	}
};
path([[cx, cy], [cx, 16]], 2); // north to the mountains
path([[cx, cy], [6, 50]], 2); // west
path([[cx, cy], [94, 44]], 2); // east
path([[cx, cy], [cx + 4, 82]], 2); // south, into the wood
path([[cx - 20, 48], [streamAt(36) - 4, 36]], 1); // to the mill
path([[cx + 4, 70], [cx + 26, 78], [cx + 36, 80]], 1); // the old path to the cottage

// ---- the square: the well, fifteen benches round it ----
for (let y = cy - 7; y <= cy + 7; y++) for (let x = cx - 12; x <= cx + 12; x++) if (Math.hypot((x - cx) / 12, (y - cy) / 7) <= 1) put(x, y, 'floor soil');
thing(cx, cy, 'well', 'floor stone block');
for (let k = 0; k < 15; k++) {
	const a = (k / 15) * Math.PI * 2;
	thing(Math.round(cx + Math.cos(a) * 7.5), Math.round(cy + Math.sin(a) * 4), 'chair', 'floor soil');
}
for (const [x, y] of [[cx - 12, cy], [cx + 12, cy], [cx, cy - 7], [cx, cy + 7]]) thing(x, y, 'torch', 'floor soil');
label(cx - 3, cy - 8, 'The Well');

// ---- the Gasthaus zum Wolf, north of the square: the long table, rooms above ----
const G = { x0: cx - 11, y0: 22, x1: cx + 11, y1: 35 };
room(G.x0, G.y0, G.x1, G.y1, 'wood', 'wood');
for (const x of [cx - 1, cx, cx + 1]) thing(x, G.y1, 'door', 'floor wood');
// The long table down the middle, eight chairs a side and one at each end.
for (let x = cx - 7; x <= cx + 7; x++) { thing(x, 28, 'table', 'floor wood'); thing(x, 29, 'table', 'floor wood'); }
for (let x = cx - 7; x <= cx + 7; x += 2) { thing(x, 27, 'chair', 'floor wood'); thing(x, 30, 'chair', 'floor wood'); }
thing(cx - 8, 28, 'chair', 'floor wood'); thing(cx + 8, 29, 'chair', 'floor wood');
thing(G.x0 + 1, G.y0 + 1, 'barrel', 'floor wood'); thing(G.x0 + 2, G.y0 + 1, 'barrel', 'floor wood');
thing(G.x1 - 1, G.y0 + 1, 'oven', 'floor wood');
for (const x of [G.x0 + 1, G.x1 - 1]) thing(x, 31, 'candle', 'floor wood');
// Upstairs: a passage and the guest rooms, a bed in each.
upRoom(G.x0, G.y0, G.x1, G.y1, 'wood', 'wood');
for (let x = G.x0 + 4; x < G.x1; x += 4) for (let y = G.y0; y <= 29; y++) up(x, y, 'wall wood');
for (let x = G.x0 + 4; x < G.x1; x += 4) up(x, 29, 'floor wood | door');
for (let x = G.x0 + 2; x < G.x1 - 1; x += 4) up(x, G.y0 + 2, 'floor wood | bed');
for (let x = G.x0 + 1; x < G.x1; x++) up(x, 30, 'floor wood');
stair(G.x0 + 1, G.y1 - 1, 'wood');
label(G.x0, G.y0 - 1, 'Gasthaus zum Wolf');

// ---- the houses round the square: timber and plaster, a bed upstairs in each ----
const homes = [
	[cx - 30, 36, cx - 22, 42, 'e'], [cx - 30, 52, cx - 22, 58, 'e'], [cx - 19, 56, cx - 13, 62, 'n'],
	[cx - 9, 57, cx - 3, 63, 'n'], [cx + 3, 57, cx + 9, 63, 'n'], [cx + 13, 56, cx + 19, 62, 'n'],
	[cx + 22, 52, cx + 30, 58, 'w'], [cx + 22, 36, cx + 30, 42, 'w'], [cx + 15, 25, cx + 22, 31, 's'],
	[cx - 20, 17, cx - 13, 23, 's'], [cx + 32, 46, cx + 38, 52, 'w'], [cx - 38, 44, cx - 32, 50, 'e'],
	[cx + 24, 64, cx + 30, 70, 'n'], [cx - 30, 64, cx - 24, 70, 'n'], [cx + 34, 30, cx + 40, 36, 's'], [cx - 6, 66, cx, 72, 'n']
];
for (const [x0, y0, x1, y1, door] of homes) house(x0, y0, x1, y1, { door, loft: true, light: 'candle' });

// ---- the smithy: an open forge on the east road ----
room(cx + 33, 38, cx + 41, 43, 'stone block', 'gravel');
thing(cx + 37, 43, 'door', 'floor gravel'); thing(cx + 35, 40, 'anvil', 'floor gravel'); thing(cx + 38, 40, 'brazier', 'floor gravel');
label(cx + 33, 37, 'Smithy');

// ---- the mill on the brook: the wheel in the water, sacks in the loft ----
const mx = streamAt(36) - 11;
house(mx, 32, mx + 7, 39, { door: 's', loft: true, wall: 'stone block', floor: 'wood', light: 'oven', extra: [[mx + 2, 34, 'hay bale'], [mx + 3, 34, 'hay bale']] });
for (let y = 34; y <= 37; y++) thing(streamAt(y) - 2, y, 'barrel', 'floor ice');
label(mx, 31, 'The Mill');

// ---- the woodcutter's hut, west in the trees ----
fill(4, 54, 16, 64, 'floor snow');
house(6, 56, 12, 61, { door: 'e', light: 'candle', extra: [[7, 57, 'chest']] });
for (const [x, y] of [[14, 57], [14, 59], [15, 61]]) thing(x, y, 'cart', 'floor snow');
label(5, 55, 'Woodcutter');

// ---- the old chapel in the wood, east, and its graves ----
fill(70, 60, 92, 76, 'floor snow');
room(74, 62, 86, 70, 'stone block', 'stone block');
thing(80, 70, 'door', 'floor stone block');
thing(80, 63, 'altar', 'floor stone block');
for (const x of [77, 83]) thing(x, 64, 'candle', 'floor stone block');
for (let y = 66; y <= 68; y++) for (const x of [76, 77, 78, 82, 83, 84]) thing(x, y, 'pew', 'floor stone block');
for (let k = 0; k < 9; k++) thing(72 + (k % 3) * 3 + (k > 5 ? 12 : 0), 72 + Math.floor(k / 3) % 2 * 2, k % 4 ? 'statue' : 'coffin', 'floor snow');
label(74, 61, 'St. Wendel');

// ---- the cottage with the oven, deep in the wood where the old path gives out ----
fill(cx + 30, 74, cx + 44, 83, 'floor snow');
house(cx + 33, 76, cx + 40, 82, { door: 'n', light: 'oven', extra: [[cx + 34, 77, 'oven'], [cx + 37, 81, 'loom']] });
for (const [x, y] of [[cx + 32, 75], [cx + 41, 75], [cx + 31, 79]]) thing(x, y, 'flowers', 'floor snow');
label(cx + 33, 75, 'The Cottage');

// ---- torches along the roads; the doorsteps clear ----
for (const [x, y] of [[cx, 18], [cx, 40], [14, 50], [30, 50], [70, 44], [88, 44], [cx + 4, 66], [cx + 1, 76]]) thing(x, y, 'torch', P.floorOf(x, y) ?? 'floor soil');
// The wood closes the map's edge: nobody walks off it.
for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (!get(x, y).startsWith('wall')) put(x, y, 'wall pine');
for (let y = 0; y < H; y++) for (const x of [0, W - 1]) if (!get(x, y).startsWith('wall')) put(x, y, 'wall pine');
P.clearDoorsteps((c) => c === 'wall pine' || c.startsWith('floor snow |'), 'floor snow');
// Every door has a way to the well: a track cut through the trees where there is none.
P.connect(cx + 8, cy);

P.write(new URL('./grimm.tbp', import.meta.url), 'grimm', [
	'Wolfsgrund, a village in the snow under the mountains, for Grimoire\'s Bad Moon Rising games.',
	'Made by town/make-grimm.mjs; edit that and run it again. `label x y Name` names a place.'
], { 'floor snow': '.', 'wall pine': 'T', 'floor soil': ':', 'wall wood': 'W', 'floor wood': '+', 'floor water': '~', 'floor ice': '=', 'wall granite': 'R', 'floor granite': 'G', 'wall stone block': 'S', 'floor stone block': 's', 'stair-up wood': '<', 'stair-down wood': '>' });
