/**
 * make-liner.mjs - draws town/liner.tbp: the RMS Carcosa, a liner far out on a black sea in a storm,
 * for Grimoire's Lovecraftian games.
 *
 * Nothing but water to the edge of the map, and out in it, now and then, something glowing. On the
 * ship: the promenade deck round the superstructure; the after deck, where the passengers gather in
 * fifteen deck chairs round the ship's bell (the speaking place); amidships the grand saloon, whose
 * long table is where the passengers sit in judgement, the staterooms fore and aft of it along their
 * corridors, a stateroom for each; the forecastle with its hatches. Up the grand stair: the boat deck,
 * the four funnels, the lifeboats, the smoking room aft and the bridge forward.
 *
 * Two levels: the main deck and the boat deck.
 *
 *   node town/make-liner.mjs
 */
import { plan } from './gen.mjs';

const P = plan(120, 60, 'floor water', 1912);
const { put, get, fill, thing, room, stair, upRoom, up, label } = P;
const CY = 30;

// ---- the hull: a round stern in the west, the long bow running east ----
const half = (x) => {
	if (x < 8 || x > 113) return -1;
	if (x <= 14) return Math.round(13 * Math.sqrt(Math.max(0, 1 - ((14 - x) / 7) ** 2)));
	if (x >= 92) return Math.round(13 * (1 - ((x - 92) / 21) ** 1.6));
	return 13;
};
const aboard = (x, y) => half(x) >= 0 && Math.abs(y - CY) <= half(x);
for (let y = 0; y < P.H; y++) for (let x = 0; x < P.W; x++) {
	if (!aboard(x, y)) continue;
	const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !aboard(x + dx, y + dy));
	// The gunwale: a rail nobody climbs over, but no wall: the deck is out under the sky with the sea.
	put(x, y, edge ? 'floor hull | rail' : 'floor teak');
}
label(60, 15, 'RMS Carcosa');

// ---- the superstructure: staterooms, the grand saloon ----
room(28, 20, 90, 40, 'steel', 'carpet');
// The corridors, aft and forward of the saloon, with staterooms either side.
const cabins = (xs) => {
	for (let k = 0; k + 1 < xs.length; k++) {
		const x0 = xs[k], x1 = xs[k + 1], mx = (x0 + x1) >> 1;
		for (const [y0, y1, door] of [[20, 28, 28], [32, 40, 32]]) {
			room(x0, y0, x1, y1, 'steel', 'carpet');
			thing(mx, door, 'door', 'floor carpet');
			const far = door === 28 ? y0 + 1 : y1 - 1;
			thing(x0 + 1, far, 'bed', 'floor carpet');
			thing(x1 - 1, far, 'chest', 'floor carpet');
			thing(x1 - 1, door === 28 ? door - 1 : door + 1, 'lamp', 'floor carpet');
		}
	}
	fill(xs[0] + 1, 29, xs[xs.length - 1] - 1, 31, 'floor carpet');
};
cabins([28, 32, 36, 40]);
cabins([64, 68, 72, 76, 80, 84, 90]);
for (const y of [29, 30, 31]) { put(28, y, 'wall steel'); put(90, y, 'wall steel'); }
thing(28, 30, 'door', 'floor carpet'); thing(90, 30, 'door', 'floor carpet');
label(29, 19, 'Staterooms');
// The grand saloon: the long table, the piano, the stair up.
room(40, 20, 64, 40, 'steel', 'carpet');
thing(40, 30, 'door', 'floor carpet'); thing(64, 30, 'door', 'floor carpet');
thing(52, 20, 'door', 'floor carpet'); thing(52, 40, 'door', 'floor carpet');
for (let x = 44; x <= 60; x++) { thing(x, 29, 'table', 'floor carpet'); thing(x, 30, 'table', 'floor carpet'); }
for (let x = 44; x <= 60; x += 2) { thing(x, 28, 'chair', 'floor carpet'); thing(x, 31, 'chair', 'floor carpet'); }
thing(43, 29, 'chair', 'floor carpet'); thing(61, 30, 'chair', 'floor carpet');
thing(42, 22, 'piano', 'floor carpet');
for (const [x, y] of [[41, 21], [63, 21], [41, 39], [63, 39], [52, 25], [52, 35]]) thing(x, y, 'lamp', 'floor carpet');
label(41, 41, 'the Grand Saloon');

// ---- the after deck: fifteen deck chairs round the ship's bell ----
const ax = 18;
thing(ax, CY, 'bell', 'floor teak');
for (let k = 0; k < 15; k++) {
	const a = (k / 15) * Math.PI * 2;
	thing(Math.round(ax + Math.cos(a) * 5.5), Math.round(CY + Math.sin(a) * 7.5), 'chair', 'floor teak');
}
label(9, 15, 'the After Deck');

// ---- the forecastle: hatches, capstans, the foremast ----
for (const [x, y] of [[96, 26], [97, 26], [96, 34], [97, 34], [103, 28], [103, 32]]) thing(x, y, 'chest', 'floor teak');
thing(100, CY, 'statue', 'floor teak');
for (const [x, y] of [[108, 29], [108, 31]]) thing(x, y, 'barrel', 'floor teak');
label(94, 44, 'the Forecastle');

// ---- lamps along the promenade ----
for (let x = 12; x <= 108; x += 8) for (const y of [CY - half(x) + 1, CY + half(x) - 1]) if (get(x, y) === 'floor teak') thing(x, y, 'lamp', 'floor teak');
label(30, 44, 'the Promenade');

// ---- the boat deck: funnels, lifeboats, the smoking room aft, the bridge forward ----
upRoom(28, 20, 90, 40, 'steel', 'teak');
for (let x = 28; x <= 90; x++) for (const y of [20, 40]) up(x, y, 'floor steel | rail');
for (let y = 20; y <= 40; y++) for (const x of [28, 90]) up(x, y, 'floor steel | rail');
for (const fx of [38, 50, 66, 78]) for (let y = 28; y <= 32; y++) for (let x = fx; x <= fx + 3; x++) up(x, y, 'wall funnel');
for (let x = 37; x <= 81; x += 4) for (const y of [21, 39]) up(x, y, 'floor teak | lifeboat');
// The smoking room, aft.
for (let y = 21; y <= 39; y++) up(34, y, 'wall steel');
up(34, 30, 'floor carpet | door');
for (let y = 21; y <= 39; y++) for (let x = 29; x <= 33; x++) up(x, y, 'floor carpet');
up(31, 24, 'floor carpet | table'); up(30, 24, 'floor carpet | chair'); up(32, 24, 'floor carpet | chair');
up(31, 36, 'floor carpet | table'); up(30, 36, 'floor carpet | chair'); up(32, 36, 'floor carpet | chair');
up(33, 22, 'floor carpet | lamp'); up(33, 38, 'floor carpet | lamp');
// The bridge, forward.
for (let y = 21; y <= 39; y++) up(84, y, 'wall steel');
up(84, 30, 'floor teak | door');
up(88, 30, 'floor teak | wheel'); up(87, 26, 'floor teak | table'); up(86, 34, 'floor teak | lamp'); up(89, 22, 'floor teak | lamp'); up(89, 38, 'floor teak | lamp');
for (const [x, y] of [[44, 24], [60, 36], [72, 24]]) up(x, y, 'floor teak | lamp');
// The stairs: the grand stair in the saloon, the after stair at the end of the corridor.
stair(62, 22, 'wood');
stair(29, 30, 'wood');

// ---- out in the water, far off: lights that should not be there ----
for (const [x, y] of [[4, 6], [113, 52], [70, 55], [24, 54], [104, 5]]) put(x, y, 'floor water | sigil');

P.write(new URL('./liner.tbp', import.meta.url), 'liner', [
	'The RMS Carcosa, a liner on a black sea in a storm, for Grimoire\'s Lovecraftian games.',
	'Made by town/make-liner.mjs; edit that and run it again. `label x y Name` names a place.'
], { 'floor water': '~', 'floor hull': 'H', 'floor teak': '=', 'wall steel': 'S', 'floor carpet': 'c', 'wall funnel': 'F', 'stair-up wood': '<', 'stair-down wood': '>' });
