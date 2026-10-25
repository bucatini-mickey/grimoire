/**
 * make-hamlet.mjs - draws town/hamlet.tbp: Ashcombe, a medieval village in the fields, after the
 * painting the user gave (a stone church with a squat tower in a fenced yard of vegetable plots,
 * thatched longhouses and barns, a winding dirt track, a stream with reeds, bare trees, cattle and
 * sheep), with flower meadows and the deep wood round it all.
 *
 * The track winds in from the west, across the green, over the Leam by the bridge and away east. On
 * the green under the old oak, fifteen benches: speak there and the village hears you. The manor hall
 * by the green has the long table where the village sits in judgement. North, the church in its yard;
 * south, the wheat (the wind runs through it) and the meadow; east of the stream, the pasture, where
 * the sheep and cattle graze and wander (src/town/weather.ts).
 *
 * Two levels: the church tower's bell loft, the manor's great chamber and the mill's loft.
 *
 *   node town/make-hamlet.mjs
 */
import { plan } from './gen.mjs';

const P = plan(112, 84, 'floor grass', 1347);
const { W, H, put, get, fill, thing, room, house, stair, upRoom, up, label, rnd } = P;
const wave = (x, y) => Math.sin(x * 0.21) * 0.5 + Math.cos(y * 0.17 + x * 0.05) * 0.5 + Math.sin((x - y) * 0.09) * 0.4;

// ---- the stream: the Leam, down from the wood in the north, winding south ----
const riverAt = (y) => Math.round(88 + Math.sin(y * 0.09) * 4 + Math.sin(y * 0.23) * 1.5);
for (let y = 0; y < H; y++) {
	const rx = riverAt(y);
	for (let dx = -4; dx <= 4; dx++) {
		const a = Math.abs(dx);
		if (a <= 1) put(rx + dx, y, 'floor water');
		else if (a === 2) put(rx + dx, y, rnd() < 0.45 ? 'floor water' : 'floor mud | reeds');
		else if (a === 3 && rnd() < 0.5) put(rx + dx, y, rnd() < 0.6 ? 'floor mud | reeds' : 'floor mud');
	}
}
label(riverAt(70) + 3, 70, 'the Leam');

// ---- the deep wood: thick on the north-east and round the edges, oaks and holly ----
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
	if (get(x, y) !== 'floor grass') continue;
	const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
	const ne = Math.hypot((x - W) / 46, y / 22);
	const p = edge < 2 ? 0.9 : edge < 5 ? 0.45 : ne < 1 ? 0.6 + wave(x, y) * 0.2 : 0;
	if (rnd() < p) put(x, y, 'wall leaves');
	else if ((edge < 6 || ne < 1.1) && rnd() < 0.06) thing(x, y, 'fern', 'floor grass');
}
label(80, 4, 'Ashcombe Wood');

// ---- fields, each hedged, with gaps to walk through ----
const hedge = (x0, y0, x1, y1, gaps) => {
	for (let x = x0; x <= x1; x++) for (const y of [y0, y1]) put(x, y, rnd() < 0.85 ? 'wall leaves' : 'floor grass | bare tree');
	for (let y = y0; y <= y1; y++) for (const x of [x0, x1]) put(x, y, rnd() < 0.85 ? 'wall leaves' : 'floor grass | bare tree');
	for (const [gx, gy] of gaps) { put(gx, gy, 'floor grass'); put(gx + (gy === y0 || gy === y1 ? 1 : 0), gy + (gx === x0 || gx === x1 ? 1 : 0), 'floor grass'); }
};
// The wheat, south of the green: the wind runs through it.
fill(22, 64, 62, 79, 'floor wheat');
hedge(21, 63, 63, 80, [[40, 63], [63, 72]]);
label(36, 81, 'the Long Field');
// The flower meadow, south-west, round the pond.
for (let y = 58; y <= 80; y++) for (let x = 4; x <= 18; x++) if (get(x, y) === 'floor grass' && rnd() < 0.42) thing(x, y, 'flowers', 'floor grass');
for (let y = 66; y <= 70; y++) for (let x = 8; x <= 14; x++) {
	const d = Math.hypot((x - 11) / 3.4, (y - 68) / 2.4);
	if (d < 0.8) put(x, y, 'floor water'); else if (d < 1.15) put(x, y, 'floor mud | reeds');
}
label(5, 57, 'Lady Meadow');
// The pasture east of the stream, fenced: the flock and the herd.
const fence = (x0, y0, x1, y1, gaps) => {
	for (let x = x0; x <= x1; x++) for (const y of [y0, y1]) put(x, y, 'wall paling');
	for (let y = y0; y <= y1; y++) for (const x of [x0, x1]) put(x, y, 'wall paling');
	for (const [gx, gy] of gaps) put(gx, gy, 'floor pasture');
};
fill(96, 52, 109, 81, 'floor pasture');
fence(95, 51, 110, 82, [[95, 60], [101, 51]]);
label(97, 50, 'the Common');
// The north-west pasture by the wood's edge.
fill(5, 8, 30, 27, 'floor pasture');
for (let y = 8; y <= 27; y++) for (let x = 5; x <= 30; x++) if (rnd() < 0.015) thing(x, y, 'bare tree', 'floor pasture');
fence(4, 7, 31, 28, [[31, 18], [18, 28]]);
label(6, 6, 'Sheepcote Leys');

// ---- the track: winding in from the west, round the green, over the bridge and away east ----
const track = (pts, wdt = 2) => {
	for (let k = 0; k + 1 < pts.length; k++) {
		const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
		const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
		for (let t = 0; t <= n; t++) {
			const x = Math.round(ax + ((bx - ax) * t) / n), y = Math.round(ay + ((by - ay) * t) / n + Math.sin((ax + t) * 0.18) * 0.8);
			for (let dy = 0; dy < wdt; dy++) for (let dx = 0; dx < wdt; dx++) {
				const c = get(x + dx, y + dy);
				if (c.startsWith('floor water') || c.startsWith('floor mud')) put(x + dx, y + dy, 'floor water | plank bridge');
				else if (!c.startsWith('wall') || c === 'wall leaves') { if (!c.includes('| ')) put(x + dx, y + dy, 'floor soil'); }
			}
		}
	}
};
const gx = 50, gy = 44;
track([[1, 46], [14, 44], [28, 45], [gx - 12, gy]]);
track([[gx + 12, gy], [70, 43], [80, 42], [94, 41], [110, 40]]);
track([[gx - 1, gy - 6], [gx - 1, 27]]); // north to the church gate
track([[gx - 1, gy + 6], [gx - 2, 62], [40, 63]], 1); // south to the field gate
track([[96, 41], [101, 50]], 1); // to the common
track([[31, 18], [40, 26], [gx - 1, 28]], 1); // the drove from the leys
track([[gx + 12, gy + 2], [72, 49]], 1); // to the manor

// ---- the green: the old oak, fifteen benches round it ----
for (let y = gy - 6; y <= gy + 6; y++) for (let x = gx - 12; x <= gx + 12; x++) {
	const d = Math.hypot((x - gx) / 12, (y - gy) / 6);
	if (d <= 1 && d > 0.88) put(x, y, 'floor soil');
	else if (d <= 0.88) put(x, y, 'floor grass');
}
thing(gx, gy, 'oak', 'floor grass');
for (let k = 0; k < 15; k++) {
	const a = (k / 15) * Math.PI * 2;
	thing(Math.round(gx + Math.cos(a) * 8), Math.round(gy + Math.sin(a) * 4.2), 'chair', 'floor grass');
}
for (const [x, y] of [[gx - 12, gy], [gx + 12, gy], [gx, gy - 6], [gx, gy + 6]]) thing(x, y, 'torch', 'floor soil');
label(gx - 4, gy - 7, 'the Green');

// ---- the church of St. Michael in its fenced yard: squat tower, nave, graves, vegetable plots ----
fence(34, 5, 66, 28, [[49, 28], [50, 28]]);
fill(35, 6, 65, 27, 'floor grass');
room(42, 9, 62, 18, 'stone block', 'stone block'); // the nave and chancel
thing(52, 18, 'door', 'floor stone block');
thing(61, 13, 'altar', 'floor stone block');
for (const y of [11, 15]) thing(60, y, 'candle', 'floor stone block');
for (let x = 45; x <= 56; x += 2) for (const y of [11, 12, 15, 16]) thing(x, y, 'pew', 'floor stone block');
// The tower at the west end: a stair up to the bell.
room(37, 10, 42, 17, 'stone block', 'stone block');
put(42, 13, 'floor stone block | door');
thing(39, 17, 'door', 'floor stone block');
upRoom(37, 10, 42, 17, 'stone block', 'stone block');
stair(38, 11, 'stone block');
up(40, 13, 'floor stone block | bell');
up(41, 15, 'floor stone block | candle');
label(36, 8, 'St. Michael');
// Graves in the west of the yard, the plots in the east.
for (let k = 0; k < 14; k++) thing(37 + (k % 7) * 2, 21 + Math.floor(k / 7) * 3, k % 5 ? 'statue' : 'coffin', 'floor grass');
for (let y = 20; y <= 26; y++) for (let x = 55; x <= 64; x++) put(x, y, y % 2 ? 'floor tilled | crops' : 'floor tilled');
thing(56, 19, 'well', 'floor grass');

// ---- the manor hall by the green: the long table, the great chamber above ----
const M = { x0: 64, y0: 50, x1: 80, y1: 60 };
room(M.x0, M.y0, M.x1, M.y1, 'stone block', 'wood');
for (const x of [71, 72]) thing(x, M.y0, 'door', 'floor wood');
for (let x = 66; x <= 78; x++) { thing(x, 54, 'table', 'floor wood'); thing(x, 55, 'table', 'floor wood'); }
for (let x = 66; x <= 78; x += 2) { thing(x, 53, 'chair', 'floor wood'); thing(x, 56, 'chair', 'floor wood'); }
thing(65, 54, 'chair', 'floor wood'); thing(79, 55, 'chair', 'floor wood');
thing(M.x0 + 1, M.y1 - 1, 'brazier', 'floor wood'); thing(M.x1 - 1, M.y1 - 1, 'brazier', 'floor wood');
thing(M.x0 + 1, M.y0 + 1, 'barrel', 'floor wood'); thing(M.x1 - 1, M.y0 + 1, 'chest', 'floor wood');
upRoom(M.x0, M.y0, M.x1, M.y0 + 6, 'stone block', 'wood');
stair(M.x0 + 2, M.y0 + 1, 'wood');
up(M.x1 - 2, M.y0 + 2, 'floor wood | bed'); up(M.x1 - 3, M.y0 + 2, 'floor wood | chest'); up(M.x0 + 5, M.y0 + 3, 'floor wood | candle'); up(M.x0 + 8, M.y0 + 4, 'floor wood | rug');
label(M.x0, M.y1 + 1, 'the Manor');

// ---- the longhouses: thatch over timber, a hearth, a bed ----
const homes = [
	[4, 36, 12, 41, 's'], [15, 35, 23, 40, 's'], [26, 36, 33, 41, 's'],
	[4, 49, 12, 54, 'n'], [15, 50, 23, 55, 'n'], [26, 49, 33, 54, 'n'],
	[33, 30, 40, 35, 's'], [56, 30, 63, 35, 's'],
	[34, 53, 41, 58, 'n'], [44, 54, 51, 59, 'n'],
	[64, 35, 71, 40, 's'], [74, 34, 80, 39, 's'],
	[97, 31, 104, 36, 's'], [100, 44, 107, 48, 'n']
];
for (const [x0, y0, x1, y1, door] of homes) house(x0, y0, x1, y1, { door, wall: 'thatch', floor: 'wood', light: rnd() < 0.5 ? 'candle' : 'oven' });

// ---- the smithy and the barns ----
room(54, 53, 61, 58, 'stone block', 'gravel');
thing(57, 53, 'door', 'floor gravel'); thing(56, 55, 'anvil', 'floor gravel'); thing(59, 55, 'brazier', 'floor gravel');
label(54, 59, 'Smithy');
room(68, 21, 82, 29, 'thatch', 'soil'); // the tithe barn
for (const x of [74, 75, 76]) thing(x, 29, 'door', 'floor soil');
for (let x = 70; x <= 80; x += 2) for (const y of [23, 24, 26]) thing(x, y, 'hay bale', 'floor soil');
thing(71, 27, 'cart', 'floor soil');
label(68, 20, 'Tithe Barn');
room(12, 58, 19, 63, 'thatch', 'soil'); // the cowshed by the meadow
thing(15, 58, 'door', 'floor soil'); thing(13, 60, 'hay bale', 'floor soil'); thing(17, 61, 'hay bale', 'floor soil');

// ---- the mill on the Leam, below the bridge ----
const mx = riverAt(66) - 12;
house(mx, 62, mx + 7, 69, { door: 'n', loft: true, wall: 'stone block', floor: 'wood', light: 'oven', extra: [[mx + 2, 64, 'hay bale'], [mx + 3, 64, 'barrel']] });
for (let y = 63; y <= 68; y++) put(riverAt(y) - 3, y, 'floor water');
label(mx, 70, 'the Mill');
track([[mx + 3, 61], [62, 61], [62, 47]], 1);

// ---- bare trees in the hedgerows and the fields, the wood's edge; torches on the track ----
for (let k = 0; k < 40; k++) {
	const x = 2 + Math.floor(rnd() * (W - 4)), y = 2 + Math.floor(rnd() * (H - 4));
	if (get(x, y) === 'floor grass' && Math.hypot(x - gx, y - gy) > 14) thing(x, y, 'bare tree', 'floor grass');
}
for (const [x, y] of [[14, 43], [28, 44], [70, 42], [86, 40], [100, 39], [gx - 1, 30], [gx - 2, 58]]) thing(x, y, 'torch', P.floorOf(x, y) ?? 'floor soil');

// The wood closes the map's edge: nobody walks off it.
for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (!get(x, y).startsWith('wall')) put(x, y, 'wall leaves');
for (let y = 0; y < H; y++) for (const x of [0, W - 1]) if (!get(x, y).startsWith('wall')) put(x, y, 'wall leaves');
P.clearDoorsteps((c) => c === 'wall leaves' || c.includes('| bare tree') || c.includes('| flowers') || c.includes('| fern'), 'floor grass');
P.connect(gx + 8, gy, { track: 'floor grass' });

P.write(new URL('./hamlet.tbp', import.meta.url), 'hamlet', [
	'Ashcombe, a medieval village in the fields, for Grimoire\'s medieval games.',
	'Made by town/make-hamlet.mjs; edit that and run it again. `label x y Name` names a place.'
], { 'floor grass': ',', 'wall leaves': 'T', 'floor soil': ':', 'wall thatch': 'H', 'floor wood': '+', 'floor water': '~', 'floor mud': 'm', 'floor wheat': 'w', 'floor pasture': '.', 'wall paling': '|', 'wall stone block': 'S', 'floor stone block': 's', 'stair-up wood': '<', 'stair-down wood': '>' });
