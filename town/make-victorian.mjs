/**
 * make-victorian.mjs - draws town/victorian.tbp: Saltgrave, a gas-lit
 * Victorian harbour town for Laissez un Faire. Brick terraces along the
 * cobbled streets, each a narrow house with its range, bed and front window;
 * Hollow Glass Mansions, a tenement whose top-floor flats each keep a
 * glasshouse of ferns; St. Jude's and its railed graveyard; the Athenaeum;
 * Ashgrove Asylum; the Drowned Man; a square round a public clock (stand at
 * the clock and the whole town hears you; fifteen benches round it); the
 * quay, the piers and the lighthouse; and in the eastern cliffs, under the
 * Lodge of the Esoteric Order, the Undercroft: cells, an ossuary, a cistern
 * open to the sea, and the chamber of the sigil.
 * One level, no stairs: the Undercroft is cut into the cliff rather than
 * below it, and the glasshouses sit beside their flats.
 *
 *   node town/make-victorian.mjs
 */
import { writeFileSync } from 'node:fs';

const W = 112, H = 92;
// Each cell is its key spec ('floor cobble', 'floor wood | bed', 'wall brick'); keys are given out at the end.
const g = Array.from({ length: H }, () => Array(W).fill('floor grass'));
const put = (x, y, spec) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = spec; };
const get = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? g[y][x] : 'wall leaves');
const fill = (x0, y0, x1, y1, spec) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, spec); };
const floorOf = (x, y) => { const s = get(x, y); return s.startsWith('floor') ? s.split('|')[0].trim() : null; };
/** A thing on whatever floor is there. */
const thing = (x, y, name, floor) => put(x, y, `${floor ?? floorOf(x, y) ?? 'floor cobble'} | ${name}`);
const room = (x0, y0, x1, y1, wall, floor) => { fill(x0, y0, x1, y1, `wall ${wall}`); fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, `floor ${floor}`); };
const door = (x, y, floor) => put(x, y, `floor ${floor} | door`);
const win = (x, y) => put(x, y, 'wall glass');
let seed = 1887;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const labels = [];
const label = (x, y, name) => labels.push([x, y, name]);

// ---- the edges: the moor's trees to the north and west, the cliffs to the east, the sea to the south ----
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
	const depth = Math.max(2, 3 + Math.round(1.5 * Math.sin(x * 0.29) + 1.2 * Math.cos(y * 0.41) + rnd()));
	if (Math.min(x, y) < depth) put(x, y, 'wall leaves');
}
const SEA = 79;
fill(0, SEA, W - 1, H - 1, 'floor water'); // the harbour wall is straight: the sea comes right up to the quay
for (let y = 0; y < SEA + 2; y++) {
	// A straight face where the buildings back onto it (so the Undercroft is sealed), an outcrop now and then.
	const face = rnd() < 0.3 ? 93 : 94;
	for (let x = face; x < W; x++) put(x, y, 'wall granite');
}

// ---- the streets: cobbles, with flagged pavements at the edge ----
const street = (x0, y0, x1, y1) => fill(x0, y0, x1, y1, 'floor cobble');
street(4, 18, 93, 19); // Moor Lane
street(4, 41, 93, 42); // High Street
street(4, 70, 93, 71); // Harbour Row
street(30, 5, 31, 71); // Church Street
street(56, 18, 57, 71); // Market Street
street(81, 18, 82, 71); // Lodge Lane
// The quay: flagstones above the water, bollards and crates; three piers and the lighthouse.
fill(4, 72, 93, SEA - 1, 'floor stone block');
for (const px of [14, 44, 70]) { fill(px, SEA - 2, px + 2, 88, 'floor wood'); if (px < 70) thing(px, 88, 'barrel'); }
for (const x of [8, 22, 36, 52, 63, 78]) thing(x, 77, 'barrel');
for (const x of [10, 11, 40, 41, 66]) thing(x, 74, 'chest');
label(4, 72, 'The Quay');
// The lighthouse, at the end of the east pier.
fill(69, 84, 73, 88, 'floor wood');
room(68, 84, 74, 90, 'stone block', 'stone block');
door(71, 84, 'stone block');
thing(71, 87, 'brazier'); thing(69, 85, 'bed'); thing(73, 89, 'chest'); thing(73, 85, 'gas lamp');
label(68, 84, 'The Lighthouse');

// ---- the square: a public clock on its column, fifteen benches round it, gas lamps, plane trees ----
const sq = { x: 43, y: 45, x1: 70, y1: 66, cx: 56, cy: 55 };
fill(sq.x, sq.y, sq.x1, sq.y1, 'floor cobble');
fill(sq.x + 2, sq.y + 2, sq.x1 - 2, sq.y1 - 2, 'floor stone block');
thing(sq.cx, sq.cy, 'clock');
for (let k = 0; k < 15; k++) {
	const a = (k / 15) * Math.PI * 2;
	thing(Math.round(sq.cx + Math.cos(a) * 6.2), Math.round(sq.cy + Math.sin(a) * 4.6), 'chair');
}
for (const [x, y] of [[sq.x + 1, sq.y + 1], [sq.x1 - 1, sq.y + 1], [sq.x + 1, sq.y1 - 1], [sq.x1 - 1, sq.y1 - 1], [sq.cx - 9, sq.cy], [sq.cx + 9, sq.cy]]) thing(x, y, 'gas lamp');
for (const [x, y] of [[sq.x + 3, sq.y + 3], [sq.x1 - 3, sq.y + 3], [sq.x + 3, sq.y1 - 3], [sq.x1 - 3, sq.y1 - 3]]) put(x, y, 'wall leaves');
for (const x of [sq.cx - 3, sq.cx + 3]) { thing(x, sq.y + 1, 'flowers', 'floor grass'); thing(x, sq.y1 - 1, 'flowers', 'floor grass'); }
label(sq.cx - 5, sq.cy - 6, 'Clock Square');

// ---- the terraces: narrow brick houses sharing their walls; a range, a bed, a chest, a front window ----
const homes = [];
const TRADES = ['Clockmaker', 'Taxidermist', 'Photographer', 'Bookbinder', 'Undertaker', 'Seamstress', 'Phrenologist', 'Spirit Medium', 'Tobacconist', 'Pawnbroker', 'Engraver', 'Chimney Sweep', 'Lamplighter', 'Governess', 'Telegraphist', 'Mesmerist', 'Surgeon', 'Ship’s Chandler', 'Organ Grinder', 'Rat-catcher'];
let ti = 0;
const terrace = (x0, y0, n, side) => {
	for (let k = 0; k < n; k++) {
		const a = x0 + k * 6, b = a + 6, y1 = y0 + 6;
		room(a, y0, b, y1, 'brick', 'wood');
		const front = side === 'n' ? y0 : y1, back = side === 'n' ? y1 - 1 : y0 + 1, mid = side === 'n' ? y0 + 1 : y1 - 1;
		door(a + 2, front, 'wood');
		win(a + 4, front);
		thing(a + 1, back, 'bed'); thing(a + 5, back, 'oven'); thing(a + 5, mid, 'chest');
		if (rnd() < 0.5) thing(a + 3, back, 'table'); else thing(a + 3, back, 'bookshelf');
		homes.push([a, y0]);
		label(a, y0, TRADES[ti++ % TRADES.length]);
	}
};
terrace(5, 20, 4, 'n'); terrace(33, 20, 3, 'n'); terrace(59, 20, 3, 'n');
terrace(5, 34, 4, 's'); terrace(33, 34, 3, 's'); terrace(59, 34, 3, 's');
// Gas lamps down the streets, outside the terraces.
for (const x of [8, 20, 34, 46, 60, 72, 88]) { thing(x, 17, 'gas lamp'); thing(x, 43, 'gas lamp'); }
for (const y of [28, 50, 62]) { thing(29, y, 'gas lamp'); thing(83, y, 'gas lamp'); }

// ---- St. Jude's, with its railed graveyard ----
room(33, 6, 53, 16, 'stone block', 'stone block');
door(43, 16, 'stone block'); door(44, 16, 'stone block');
thing(43, 7, 'altar'); thing(44, 7, 'altar'); thing(41, 7, 'candle'); thing(46, 7, 'candle');
for (const x of [36, 38, 40, 47, 49, 51]) for (const y of [10, 11, 13, 14]) thing(x, y, 'pew');
for (const x of [36, 40, 47, 51]) win(x, 6);
for (const y of [9, 13]) { win(33, y); win(53, y); }
label(33, 6, 'St. Jude’s');
fill(5, 6, 28, 16, 'floor grass');
for (let x = 5; x <= 28; x++) { put(x, 6, 'wall iron'); put(x, 16, 'wall iron'); }
for (let y = 6; y <= 16; y++) { put(5, y, 'wall iron'); put(28, y, 'wall iron'); }
put(28, 11, 'floor cobble'); put(28, 12, 'floor cobble'); // the lych-gate onto Church Street
for (let y = 8; y <= 14; y += 2) for (let x = 7; x <= 26; x += 3) thing(x + (y % 4 ? 1 : 0), y, 'statue', 'floor grass');
thing(25, 13, 'coffin', 'floor grass'); thing(9, 9, 'gas lamp', 'floor grass');
label(5, 6, 'Graveyard');

// ---- the Athenaeum: a reading room of shelves and lamps ----
room(59, 6, 77, 16, 'brick', 'slate');
door(68, 16, 'slate');
for (const x of [61, 64, 67, 70, 73]) for (const y of [8, 9, 12, 13]) thing(x, y, 'bookshelf');
thing(68, 10, 'table'); thing(67, 10, 'chair'); thing(69, 10, 'chair'); thing(68, 14, 'gas lamp');
for (const x of [62, 66, 70, 74]) win(x, 6);
label(59, 6, 'The Athenaeum');

// ---- Ashgrove Asylum: a stone ward of locked rooms; its cellar runs into the cliff ----
room(80, 5, 93, 16, 'stone block', 'stone block');
door(86, 16, 'stone block');
fill(81, 10, 92, 10, 'wall iron'); // the bars along the ward
for (const x of [84, 88]) fill(x, 6, x, 9, 'wall stone block');
for (const [x0, x1] of [[81, 83], [85, 87], [89, 92]]) { thing(x0, 6, 'bed'); door(x0 + 1, 10, 'stone block'); }
thing(82, 14, 'table'); thing(90, 14, 'chest'); thing(86, 13, 'gas lamp');
door(93, 13, 'stone block'); // down to the Undercroft
label(80, 5, 'Ashgrove Asylum');

// ---- Hollow Glass Mansions: six flats either side of a stair hall, each with a glasshouse of ferns ----
const M = { x0: 5, y0: 45, x1: 26, y1: 66 };
room(M.x0, M.y0, M.x1, M.y1, 'brick', 'wood');
fill(M.x0 + 1, 54, M.x1 - 1, 57, 'floor slate'); // the stair hall
fill(M.x0 + 1, 53, M.x1 - 1, 53, 'wall brick'); fill(M.x0 + 1, 58, M.x1 - 1, 58, 'wall brick');
door(M.x1, 55, 'slate'); door(M.x1, 56, 'slate'); thing(15, 55, 'gas lamp');
for (let k = 0; k < 3; k++) {
	const a = M.x0 + k * 7, b = a + 7;
	// North flats and their glasshouses (glass to the north, the side the sun never is, as built).
	fill(b, M.y0, b, 53, 'wall brick');
	fill(a + 1, 49, b - 1, 49, 'wall brick');
	for (let x = a + 1; x < b; x++) put(x, M.y0, 'wall glass');
	fill(a + 1, M.y0 + 1, b - 1, 48, 'floor slate');
	for (let x = a + 1; x < b; x += 2) thing(x, M.y0 + 1, 'fern');
	thing(a + 3, 47, 'fern'); door(a + 4, 49, 'wood');
	door(a + 3, 53, 'wood'); thing(a + 1, 50, 'bed'); thing(b - 1, 50, 'chest'); thing(b - 1, 52, 'oven');
	homes.push([a, 49]);
	// South flats and their glasshouses.
	fill(b, 58, b, M.y1, 'wall brick');
	fill(a + 1, 62, b - 1, 62, 'wall brick');
	for (let x = a + 1; x < b; x++) put(x, M.y1, 'wall glass');
	fill(a + 1, 63, b - 1, M.y1 - 1, 'floor slate');
	for (let x = a + 1; x < b; x += 2) thing(x, M.y1 - 1, 'fern');
	thing(a + 3, 63, 'fern'); door(a + 4, 62, 'wood');
	door(a + 3, 58, 'wood'); thing(a + 1, 61, 'bed'); thing(b - 1, 61, 'chest'); thing(b - 1, 59, 'oven');
	homes.push([a, 58]);
}
put(M.x1, M.y0, 'wall brick'); put(M.x1, M.y1, 'wall brick');
for (let y = M.y0; y <= 48; y++) put(M.x0, y, 'wall glass');
for (let y = 63; y <= M.y1; y++) put(M.x0, y, 'wall glass');
put(M.x0, M.y0, 'wall brick'); put(M.x0, M.y1, 'wall brick');
label(M.x0, M.y0, 'Hollow Glass Mansions');
label(M.x0, 62, 'the glasshouses');

// ---- the Drowned Man: a public house between Church Street and the square ----
room(33, 45, 41, 66, 'brick', 'wood');
door(33, 52, 'wood'); door(41, 58, 'wood');
fill(34, 47, 38, 47, 'floor wood | barrel'); thing(39, 47, 'oven');
for (const [x, y] of [[36, 51], [36, 55], [36, 59]]) { thing(x, y, 'table'); thing(x - 1, y, 'chair'); thing(x + 1, y, 'chair'); }
fill(34, 62, 40, 62, 'wall brick'); door(37, 62, 'wood'); thing(34, 65, 'bed'); thing(40, 65, 'chest'); // the landlady's room
thing(39, 51, 'gas lamp'); thing(39, 57, 'brazier');
win(33, 48); win(33, 57); win(41, 50);
label(33, 45, 'The Drowned Man');

// ---- east of the square: the widow's house, the artist's garret, the balloon yard ----
room(73, 45, 79, 52, 'brick', 'wood'); door(73, 48, 'wood'); win(79, 48);
thing(78, 46, 'bed'); thing(74, 46, 'rug'); thing(75, 46, 'rug'); thing(78, 51, 'chest'); thing(74, 51, 'candle');
homes.push([73, 45]); label(73, 45, 'The Widow’s House');
room(73, 54, 79, 61, 'brick', 'wood'); door(73, 57, 'wood'); win(76, 54); win(77, 54);
thing(78, 60, 'bed'); thing(75, 56, 'table'); thing(77, 57, 'statue'); thing(74, 60, 'chest');
homes.push([73, 54]); label(73, 54, 'The Artist’s Garret');
fill(72, 63, 79, 68, 'floor grass'); thing(76, 65, 'cart', 'floor grass'); thing(74, 64, 'barrel', 'floor grass'); thing(78, 67, 'gas lamp', 'floor grass');
label(72, 63, 'Balloon Yard');

// ---- on the quay: the bonded warehouse, the net loft, a fisherman's cottage ----
room(84, 72, 92, 78, 'brick', 'wood'); door(84, 75, 'wood'); thing(91, 73, 'chest'); thing(91, 77, 'chest'); thing(88, 73, 'barrel'); thing(88, 77, 'barrel');
label(84, 72, 'Bonded Warehouse');
const cottage = (x0, y0, name) => {
	room(x0, y0, x0 + 5, y0 + 4, 'wood', 'wood'); door(x0 + 2, y0 + 4, 'wood');
	thing(x0 + 1, y0 + 1, 'bed'); thing(x0 + 4, y0 + 1, 'oven'); thing(x0 + 4, y0 + 3, 'barrel');
	homes.push([x0, y0]); label(x0, y0, name);
};
cottage(24, 72, 'Net Loft');
cottage(54, 72, 'Fisherman’s Cottage');

// ---- the Lodge of the Esoteric Order: a polished hall, and behind it a door into the cliff ----
room(84, 45, 93, 66, 'brick', 'slate');
door(84, 55, 'slate'); door(84, 56, 'slate');
fill(85, 59, 92, 59, 'wall brick'); door(89, 59, 'slate');
for (const y of [48, 51, 54]) { thing(87, y, 'chair'); thing(90, y, 'chair'); }
thing(88, 47, 'altar'); thing(89, 47, 'altar'); thing(86, 46, 'candle'); thing(91, 46, 'candle'); thing(92, 57, 'bookshelf');
thing(86, 64, 'bed'); thing(91, 64, 'chest'); thing(88, 62, 'gas lamp'); // the Grand Master's rooms
door(93, 61, 'slate');
for (const y of [49, 52]) win(84, y);
homes.push([84, 59]);
label(84, 45, 'The Lodge');

// ---- the Undercroft, cut into the cliff: passages, cells, an ossuary, the cistern, the sigil chamber ----
const carve = (cx, cy, rx, ry, spec = 'floor granite') => {
	for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++)
		if (Math.hypot((x - cx) / (rx + 0.4), (y - cy) / (ry + 0.4)) <= 1) put(x, y, spec);
};
const tunnel = (pts) => {
	for (let k = 0; k < pts.length - 1; k++) {
		let [x, y] = pts[k]; const [tx, ty] = pts[k + 1];
		while (x !== tx || y !== ty) { put(x, y, 'floor granite'); if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y); }
		put(x, y, 'floor granite');
	}
};
tunnel([[94, 61], [98, 61], [98, 48], [101, 48]]); // from the Lodge
tunnel([[94, 13], [98, 13], [98, 28], [108, 28]]); // from the Asylum's cellar
tunnel([[103, 28], [103, 33]]);
// The cells: barred, a door of bars to each, straw on the floor (no one sleeps here by choice).
for (const x of [100, 103, 106]) { fill(x, 23, x + 1, 26, 'floor granite'); put(x, 27, 'wall iron'); door(x + 1, 27, 'granite'); thing(x, 23, 'hay bale'); }
label(99, 22, 'The Cells');
// The ossuary: niches of bones.
carve(104, 36, 4, 3);
for (const [x, y] of [[100, 35], [100, 37], [108, 35], [108, 37], [104, 33], [104, 39]]) thing(x, y, 'coffin', 'floor granite');
thing(102, 36, 'candle', 'floor granite');
label(100, 32, 'The Ossuary');
// The sigil chamber: a ring of sigils, the altar, black candles.
carve(105, 50, 5, 5);
tunnel([[104, 39], [104, 45]]); tunnel([[101, 48], [101, 50]]);
for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; thing(Math.round(105 + Math.cos(a) * 3.2), Math.round(50 + Math.sin(a) * 3.2), 'sigil', 'floor granite'); }
thing(105, 50, 'altar', 'floor granite');
for (const [x, y] of [[101, 46], [109, 46], [101, 54], [109, 54]]) thing(x, y, 'candle', 'floor granite');
label(100, 44, 'The Sigil Chamber');
// The cistern, open to the sea under the cliff: what comes up it is not a fish.
carve(104, 64, 4, 4, 'floor water');
tunnel([[105, 55], [105, 59]]);
tunnel([[100, 59], [100, 66]]); tunnel([[100, 59], [105, 59]]);
label(99, 61, 'The Cistern');

// ---- every door opens onto a way out: clear the fewest trees from each door to a street ----
const isWall = (s) => s.startsWith('wall') && s !== 'wall leaves';
const WAY = (s) => /^floor (cobble|stone block|slate|granite|wood)/.test(s);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
	if (!g[y][x].includes('| door')) continue;
	for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
		const sx = x + ax, sy = y + ay, start = get(sx, sy);
		if (!(start === 'wall leaves' || start.startsWith('floor grass'))) continue;
		const cost = new Map([[sx + ',' + sy, 0]]), from = new Map(), q = [[0, sx, sy]];
		let goal = null;
		while (q.length) {
			q.sort((p, r) => p[0] - r[0]);
			const [c, cx, cy] = q.shift();
			if (WAY(get(cx, cy))) { goal = [cx, cy]; break; }
			for (const [bx, by] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const nx = cx + bx, ny = cy + by, c2 = get(nx, ny);
				if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1 || isWall(c2) || c2.includes('| door') || c2 === 'floor water') continue;
				const nc = c + (c2 === 'wall leaves' ? 5 : 1), k = nx + ',' + ny;
				if (nc < (cost.get(k) ?? Infinity)) { cost.set(k, nc); from.set(k, [cx, cy]); q.push([nc, nx, ny]); }
			}
		}
		for (let p = goal; p; p = from.get(p[0] + ',' + p[1])) if (get(p[0], p[1]) === 'wall leaves') put(p[0], p[1], 'floor cobble');
	}
}
// A few wild corners: grass between the buildings, flowers in it.
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === 'floor grass' && rnd() < 0.04) put(x, y, 'floor grass | flowers');

// ---- keys: one printable character per distinct cell ----
const POOL = [...'.,:;_=+#%&*~-^"\'`!?$@ABCDEFGHIJKLMNOPQRSUVWXYZabcdefghijklmnopqrstuvwxyz0123456789<>/()[]{}|\\'];
const preferred = { 'floor grass': ',', 'wall leaves': 'T', 'floor cobble': '.', 'wall brick': '#', 'floor wood': '+', 'floor water': '~', 'wall granite': 'R', 'floor granite': 'G', 'wall glass': 'w', 'floor slate': '_', 'wall stone block': 'S', 'floor stone block': 's', 'wall iron': 'I' };
const keyOf = new Map(Object.entries(preferred));
const used = new Set(keyOf.values());
const specs = new Set(g.flat());
for (const s of specs) {
	if (keyOf.has(s)) continue;
	const ch = POOL.find((c) => !used.has(c));
	if (!ch) throw new Error('out of key characters');
	keyOf.set(s, ch); used.add(ch);
}
const out = [
	'tachyon-blueprint 1',
	'# Saltgrave, a gas-lit Victorian harbour town for Grimoire\'s Laissez un Faire games.',
	'# Made by town/make-victorian.mjs; edit that and run it again. `label x y Name` names a place.',
	'name victorian',
	`size ${W} ${H} 1`,
	...[...keyOf].filter(([s]) => specs.has(s)).map(([s, ch]) => `key ${ch} ${s}`),
	'level 0',
	...g.map((r) => r.map((s) => keyOf.get(s)).join('')),
	...labels.map(([x, y, n]) => `label ${x} ${y} ${n}`),
	'end',
	''
].join('\n');
writeFileSync(new URL('./victorian.tbp', import.meta.url), out);
console.log(JSON.stringify({ homes: homes.length, keys: keyOf.size, clock: [sq.cx, sq.cy] }));
