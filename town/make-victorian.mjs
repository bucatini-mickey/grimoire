/**
 * make-victorian.mjs - draws town/victorian.tbp: Saltgrave, a gas-lit
 * Victorian city for Laissez un Faire. A grid of cobbled streets, and between
 * them blocks of back-to-back brick terraces, a dark ginnel running down the
 * middle of each block where the back doors open. Among the terraces: Clock
 * Square (stand at the clock and the whole city hears you; fifteen benches
 * round it), Mercy Gardens behind their railings, St. Jude's and its
 * churchyard, the Athenaeum, Ashgrove Asylum, the Drowned Man and the
 * pawnbroker's, Hollow Glass Mansions with a glasshouse to every flat, the
 * Widow's House, the Artist's Garret, warehouses and mews, and the Lodge of
 * the Esoteric Order, whose cellars run down into the Undercroft: cells, an
 * ossuary, a cistern and the chamber of the sigil. To the west, Ravensmoor
 * Park: lawns, a pond, a bandstand, old trees. To the south, the canal.
 * Gas lamps are few, and far apart.
 * One level, no stairs: the Undercroft is walled in stone rather than below.
 *
 *   node town/make-victorian.mjs
 */
import { writeFileSync } from 'node:fs';

const W = 112, H = 92;
// Each cell is its key spec ('floor cobble', 'floor wood | bed', 'wall brick'); keys are given out at the end.
const g = Array.from({ length: H }, () => Array(W).fill('floor cobble'));
const put = (x, y, spec) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = spec; };
const get = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? g[y][x] : 'wall brick');
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
const homes = [];

// ---- the grid: blocks between cobbled streets two cells wide ----
const COLS = [[34, 53], [56, 75], [78, 97], [100, 109]]; // streets at x 32-33, 54-55, 76-77, 98-99
const ROWS = [[4, 17], [20, 33], [36, 49], [52, 65], [68, 81]]; // streets at y 2-3, 18-19, 34-35, 50-51, 66-67, 82-83
// The city goes on past the edges, lost in the fog: a wall of buildings all round.
fill(0, 0, W - 1, 1, 'wall brick'); fill(W - 2, 0, W - 1, H - 1, 'wall brick');
const STREETS = { 'Moor Lane': [36, 2], 'Crowe Street': [58, 18], 'High Street': [80, 34], 'Mercy Lane': [36, 50], 'Ash Row': [58, 66], 'Canal Walk': [40, 82], 'Gaslight Row': [54, 22], 'Tallow Street': [76, 54], 'Saint’s Passage': [98, 6] };
for (const [n, [x, y]] of Object.entries(STREETS)) label(x, y, n);

// ---- the canal along the south: a towpath, black water, a footbridge to a little wharf ----
fill(32, 84, W - 3, 84, 'floor stone block');
fill(0, 85, W - 1, 89, 'floor water');
fill(0, 90, W - 1, H - 1, 'wall brick');
for (const x of [44, 45, 46]) for (let y = 85; y <= 89; y++) put(x, y, 'floor water | plank bridge');
fill(40, 90, 50, 90, 'floor stone block');
for (const x of [36, 58, 70, 90, 104]) thing(x, 84, 'barrel');
label(60, 86, 'The Canal');

// ---- Ravensmoor Park, to the west: lawns, paths, a pond, a bandstand, old trees, iron railings ----
fill(0, 2, 31, 89, 'floor grass');
for (let y = 0; y < H; y++) for (let x = 0; x < 3 + Math.round(1.2 * Math.sin(y * 0.4) + rnd()); x++) put(x, y, 'wall leaves');
for (let y = 2; y <= 84; y++) put(31, y, 'wall iron');
for (const y of [2, 3, 18, 19, 34, 35, 50, 51, 66, 67, 82, 83]) put(31, y, 'floor gravel'); // the gates
const path = (pts) => {
	for (let k = 0; k < pts.length - 1; k++) {
		let [x, y] = pts[k]; const [tx, ty] = pts[k + 1];
		while (x !== tx || y !== ty) { put(x, y, 'floor gravel'); put(x + 1, y, 'floor gravel'); if (x !== tx && (y === ty || rnd() < 0.55)) x += Math.sign(tx - x); else y += Math.sign(ty - y); }
	}
};
path([[30, 18], [20, 22], [16, 32], [17, 45], [16, 58], [20, 70], [30, 82]]);
path([[30, 50], [22, 48], [17, 45]]); path([[30, 34], [24, 30], [16, 32]]); path([[16, 32], [8, 20], [10, 6], [30, 3]]);
path([[17, 45], [22, 45]]);
// The pond.
for (let y = 52; y <= 66; y++) for (let x = 4; x <= 14; x++) if (Math.hypot((x - 9) / 5.5, (y - 59) / 7) <= 1) put(x, y, 'floor water');
label(4, 50, 'The Pond');
// The bandstand: an iron ring on a stone floor, open to the west.
for (let y = 37; y <= 45; y++) for (let x = 20; x <= 28; x++) { const d = Math.hypot(x - 24, y - 41); if (d <= 4.4) put(x, y, d > 3.5 ? 'wall iron' : 'floor stone block'); }
put(20, 41, 'floor stone block'); put(21, 41, 'floor stone block'); thing(24, 41, 'gas lamp');
label(19, 36, 'The Bandstand');
// Old trees, in clumps and alone; benches by the paths (pews: the square's ring is chairs).
for (let n = 0; n < 150; n++) {
	const x = 4 + Math.floor(rnd() * 26), y = 4 + Math.floor(rnd() * 80);
	if (get(x, y) === 'floor grass' && !get(x + 1, y).includes('gravel') && !get(x - 1, y).includes('gravel') && !get(x, y + 1).includes('gravel') && !get(x, y - 1).includes('gravel')) put(x, y, 'wall leaves');
}
for (const [x, y] of [[19, 24], [13, 46], [22, 66], [9, 12]]) if (get(x, y) === 'floor grass') thing(x, y, 'pew', 'floor grass');
for (const [x, y] of [[20, 23], [15, 47], [21, 69], [11, 8]]) thing(x, y, 'gas lamp', floorOf(x, y) ?? 'floor grass');
label(5, 4, 'Ravensmoor Park');
for (let y = 0; y < H; y++) for (let x = 0; x < 31; x++) if (g[y][x] === 'floor grass' && rnd() < 0.05) put(x, y, 'floor grass | flowers');

// ---- a block of back-to-back terraces: houses facing the streets, a ginnel down the middle ----
const TRADES = ['Clockmaker', 'Taxidermist', 'Photographer', 'Bookbinder', 'Undertaker', 'Seamstress', 'Phrenologist', 'Spirit Medium', 'Tobacconist', 'Engraver', 'Chimney Sweep', 'Lamplighter', 'Governess', 'Telegraphist', 'Mesmerist', 'Surgeon', 'Rat-catcher', 'Organ Grinder', 'Bone-setter', 'Milliner', 'Locksmith'];
let ti = 0;
const terraces = (x0, y0, x1, y1) => {
	const mid = Math.floor((y0 + y1) / 2);
	fill(x0, y0, x1, y1, 'wall brick');
	fill(x0, mid, x1, mid, 'floor cobble'); // the ginnel
	const n = Math.floor((x1 - x0) / 6);
	for (const [top, bot, north] of [[y0, mid - 1, true], [mid + 1, y1, false]]) {
		for (let k = 0; k < n; k++) {
			const a = x0 + k * 6, b = a + 6;
			room(a, top, b, bot, 'brick', 'wood');
			const front = north ? top : bot, back = north ? bot : top;
			const inner = north ? top + 1 : bot - 1, rear = north ? bot - 1 : top + 1;
			door(a + 2, front, 'wood'); win(a + 4, front);
			if (rnd() < 0.5) door(a + 4, back, 'wood'); // a back door onto the ginnel
			thing(a + 1, rear, 'bed'); thing(a + 5, rear, 'oven'); thing(a + 5, inner, 'chest');
			homes.push([a, top]);
			if (rnd() < 0.4) label(a, top, TRADES[ti++ % TRADES.length]);
		}
	}
	// A passage from the streets into the ginnel, at the block's east end.
	fill(x0 + n * 6 + 1, y0, x1, y1, 'floor cobble');
};

// ---- the special blocks ----
const SPECIAL = new Set();
// Clock Square, in the middle of the city.
{
	const [x0, x1] = COLS[1], [y0, y1] = ROWS[2];
	SPECIAL.add('1,2');
	fill(x0, y0, x1, y1, 'floor stone block');
	const cx = Math.floor((x0 + x1) / 2), cy = Math.floor((y0 + y1) / 2);
	thing(cx, cy, 'clock');
	for (let k = 0; k < 15; k++) { const a = (k / 15) * Math.PI * 2; thing(Math.round(cx + Math.cos(a) * 6.4), Math.round(cy + Math.sin(a) * 4.8), 'chair'); }
	for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) thing(x, y, 'gas lamp');
	label(cx - 5, y0, 'Clock Square');
}
// Mercy Gardens: plane trees inside railings, a path across.
{
	const [x0, x1] = COLS[1], [y0, y1] = ROWS[3];
	SPECIAL.add('1,3');
	fill(x0, y0, x1, y1, 'floor grass');
	for (let x = x0; x <= x1; x++) { put(x, y0, 'wall iron'); put(x, y1, 'wall iron'); }
	for (let y = y0; y <= y1; y++) { put(x0, y, 'wall iron'); put(x1, y, 'wall iron'); }
	const cx = Math.floor((x0 + x1) / 2);
	fill(cx, y0, cx + 1, y1, 'floor gravel');
	for (let y = y0 + 2; y <= y1 - 2; y += 3) for (const x of [x0 + 2, x0 + 6, x1 - 6, x1 - 2]) put(x, y, 'wall leaves');
	thing(cx - 2, Math.floor((y0 + y1) / 2), 'statue', 'floor grass');
	label(x0, y0, 'Mercy Gardens');
}
// St. Jude's and its churchyard.
{
	const [x0, x1] = COLS[0], [y0, y1] = ROWS[0];
	SPECIAL.add('0,0');
	room(x0, y0, x0 + 13, y1, 'stone block', 'stone block');
	door(x0 + 6, y1, 'stone block'); door(x0 + 7, y1, 'stone block');
	thing(x0 + 6, y0 + 1, 'altar'); thing(x0 + 7, y0 + 1, 'altar'); thing(x0 + 4, y0 + 1, 'candle'); thing(x0 + 9, y0 + 1, 'candle');
	for (const x of [x0 + 2, x0 + 4, x0 + 9, x0 + 11]) for (let y = y0 + 4; y <= y1 - 3; y += 2) thing(x, y, 'pew');
	for (const y of [y0 + 4, y0 + 9]) { win(x0, y); win(x0 + 13, y); }
	fill(x0 + 14, y0, x1, y1, 'floor grass');
	for (let y = y0; y <= y1; y++) put(x1, y, 'wall iron');
	for (let x = x0 + 14; x <= x1; x++) put(x, y1, 'wall iron');
	put(x0 + 16, y1, 'floor gravel');
	for (let y = y0 + 1; y <= y1 - 2; y += 2) for (let x = x0 + 15; x < x1; x += 2) thing(x, y, rnd() < 0.15 ? 'coffin' : 'statue', 'floor grass');
	put(x1 - 1, y0 + 2, 'wall leaves'); put(x1 - 1, y1 - 3, 'wall leaves');
	label(x0, y0, 'St. Jude’s');
}
// The Athenaeum.
{
	const [x0, x1] = COLS[1], [y0, y1] = ROWS[0];
	SPECIAL.add('1,0');
	room(x0, y0, x1, y1, 'brick', 'slate');
	door(Math.floor((x0 + x1) / 2), y1, 'slate');
	for (let x = x0 + 2; x < x1 - 1; x += 3) for (const y of [y0 + 2, y0 + 3, y0 + 7, y0 + 8]) thing(x, y, 'bookshelf');
	thing(x0 + 9, y1 - 2, 'table'); thing(x0 + 8, y1 - 2, 'chair'); thing(x0 + 10, y1 - 2, 'chair'); thing(x0 + 14, y1 - 2, 'gas lamp');
	for (const x of [x0 + 4, x0 + 9, x0 + 14]) win(x, y0);
	label(x0, y0, 'The Athenaeum');
}
// Ashgrove Asylum: a stone ward of locked rooms.
{
	const [x0, x1] = COLS[2], [y0, y1] = ROWS[0];
	SPECIAL.add('2,0');
	room(x0, y0, x1, y1, 'stone block', 'stone block');
	door(Math.floor((x0 + x1) / 2), y1, 'stone block');
	fill(x0 + 1, y0 + 5, x1 - 1, y0 + 5, 'wall iron');
	for (let k = 0; k < 4; k++) {
		const a = x0 + 1 + k * 5;
		if (k) fill(a - 1, y0 + 1, a - 1, y0 + 4, 'wall stone block');
		thing(a, y0 + 1, 'bed'); door(a + 1, y0 + 5, 'stone block');
	}
	thing(x0 + 3, y1 - 2, 'table'); thing(x1 - 3, y1 - 2, 'chest'); thing(x0 + 10, y1 - 3, 'gas lamp');
	label(x0, y0, 'Ashgrove Asylum');
}
// The Drowned Man, and the pawnbroker's beside it.
{
	const [x0, x1] = COLS[0], [y0, y1] = ROWS[2];
	SPECIAL.add('0,2');
	room(x0, y0, x0 + 13, y1, 'brick', 'wood');
	door(x0 + 5, y0, 'wood'); door(x0, y0 + 6, 'wood');
	fill(x0 + 1, y0 + 1, x0 + 4, y0 + 1, 'floor wood | barrel'); thing(x0 + 12, y0 + 1, 'oven');
	for (const [dx, dy] of [[3, 4], [9, 4], [3, 8], [9, 8]]) { thing(x0 + dx, y0 + dy, 'table'); thing(x0 + dx - 1, y0 + dy, 'chair'); thing(x0 + dx + 1, y0 + dy, 'chair'); }
	fill(x0 + 1, y1 - 3, x0 + 12, y1 - 3, 'wall brick'); door(x0 + 6, y1 - 3, 'wood'); thing(x0 + 1, y1 - 1, 'bed'); thing(x0 + 12, y1 - 1, 'chest');
	thing(x0 + 12, y0 + 6, 'brazier'); win(x0 + 2, y0); win(x0 + 9, y0);
	label(x0, y0, 'The Drowned Man');
	homes.push([x0, y1 - 3]);
	room(x0 + 13, y0, x1, y1, 'brick', 'wood');
	door(x0 + 16, y1, 'wood'); win(x1 - 2, y1);
	thing(x1 - 1, y0 + 1, 'bed'); thing(x0 + 14, y0 + 1, 'chest'); thing(x0 + 15, y0 + 1, 'chest'); thing(x0 + 16, y0 + 6, 'table'); thing(x1 - 1, y1 - 2, 'candle');
	homes.push([x0 + 13, y0]);
	label(x0 + 13, y1 - 1, 'Pawnbroker');
}
// Hollow Glass Mansions: six flats either side of a stair hall, a glasshouse of ferns outside each.
{
	const [x0, x1] = COLS[0], [y0, y1] = ROWS[3];
	SPECIAL.add('0,3');
	fill(x0, y0, x1, y1, 'wall brick');
	const hall = y0 + 7;
	fill(x0 + 1, hall, x1 - 1, hall, 'floor slate'); door(x0, hall, 'slate'); door(x1, hall, 'slate'); thing(x0 + 10, hall, 'gas lamp');
	for (let k = 0; k < 3; k++) {
		const a = x0 + 1 + k * 6, b = a + 4;
		for (let x = a; x <= b; x++) { put(x, y0, 'wall glass'); put(x, y1, 'wall glass'); }
		// North: the glasshouse, then the flat, then a door onto the hall.
		fill(a, y0 + 1, b, y0 + 2, 'floor slate'); thing(a, y0 + 1, 'fern'); thing(b, y0 + 1, 'fern'); thing(a + 2, y0 + 1, 'fern');
		door(a + 2, y0 + 3, 'wood');
		fill(a, y0 + 4, b, y0 + 5, 'floor wood'); thing(a, y0 + 4, 'bed'); thing(b, y0 + 5, 'oven'); thing(b, y0 + 4, 'chest');
		door(a + 1, y0 + 6, 'slate');
		// South: a door off the hall, the flat, then the glasshouse.
		door(a + 1, y0 + 8, 'slate');
		fill(a, y0 + 9, b, y0 + 10, 'floor wood'); thing(a, y0 + 10, 'bed'); thing(b, y0 + 9, 'oven'); thing(b, y0 + 10, 'chest');
		door(a + 2, y0 + 11, 'wood');
		fill(a, y0 + 12, b, y0 + 12, 'floor slate'); thing(a, y0 + 12, 'fern'); thing(b, y0 + 12, 'fern'); thing(a + 3, y0 + 12, 'fern');
		homes.push([a, y0 + 4], [a, y0 + 9]);
	}
	label(x0, y0, 'Hollow Glass Mansions');
}
// The widow's house and the artist's garret, with a yard between.
{
	const [x0, x1] = COLS[1], [y0, y1] = ROWS[4];
	SPECIAL.add('1,4');
	room(x0, y0, x0 + 8, y1, 'brick', 'wood'); door(x0 + 4, y0, 'wood'); win(x0 + 2, y0);
	thing(x0 + 7, y1 - 1, 'bed'); thing(x0 + 1, y1 - 1, 'rug'); thing(x0 + 2, y1 - 1, 'rug'); thing(x0 + 7, y0 + 2, 'chest'); thing(x0 + 1, y0 + 2, 'candle');
	homes.push([x0, y0]); label(x0, y0, 'The Widow’s House');
	fill(x0 + 9, y0, x1 - 9, y1, 'floor gravel'); put(x0 + 10, y0 + 4, 'wall leaves'); thing(x0 + 10, y1 - 2, 'barrel');
	room(x1 - 8, y0, x1, y1, 'brick', 'wood'); door(x1 - 4, y1, 'wood'); win(x1 - 6, y0); win(x1 - 2, y0);
	thing(x1 - 1, y0 + 1, 'bed'); thing(x1 - 5, y0 + 5, 'table'); thing(x1 - 3, y0 + 7, 'statue'); thing(x1 - 7, y1 - 2, 'chest');
	homes.push([x1 - 8, y0]); label(x1 - 8, y0, 'The Artist’s Garret');
}
// The Lodge of the Esoteric Order, and under it (walled in stone) the Undercroft.
{
	const [x0, x1] = COLS[2], y0 = ROWS[2][0], y1 = ROWS[3][1];
	SPECIAL.add('2,2'); SPECIAL.add('2,3');
	fill(x0, ROWS[2][1] + 1, x1, ROWS[3][0] - 1, 'wall granite'); // the street between the two blocks is built over
	const L1 = y0 + 9;
	room(x0, y0, x1, L1, 'brick', 'slate');
	door(Math.floor((x0 + x1) / 2), y0, 'slate'); door(Math.floor((x0 + x1) / 2) + 1, y0, 'slate');
	for (const y of [y0 + 3, y0 + 5, y0 + 7]) { thing(x0 + 5, y, 'chair'); thing(x1 - 5, y, 'chair'); }
	thing(x0 + 9, L1 - 1, 'altar'); thing(x0 + 10, L1 - 1, 'altar'); thing(x0 + 7, L1 - 1, 'candle'); thing(x0 + 12, L1 - 1, 'candle');
	thing(x0 + 1, y0 + 1, 'bookshelf'); thing(x0 + 2, y0 + 1, 'bookshelf'); thing(x1 - 1, y0 + 1, 'bed'); thing(x1 - 2, y0 + 1, 'chest');
	win(x0 + 4, y0); win(x1 - 4, y0);
	homes.push([x0, y0]);
	label(x0, y0, 'The Lodge');
	// The Undercroft: old stone, reached down a long passage from the Lodge's east end.
	fill(x0, L1 + 1, x1, y1, 'wall granite');
	door(x1 - 1, L1, 'slate');
	const tunnel = (pts) => {
		for (let k = 0; k < pts.length - 1; k++) {
			let [x, y] = pts[k]; const [tx, ty] = pts[k + 1];
			while (x !== tx || y !== ty) { put(x, y, 'floor granite'); if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y); }
			put(x, y, 'floor granite');
		}
	};
	const carve = (cx, cy, rx, ry, spec = 'floor granite') => { for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) if (Math.hypot((x - cx) / (rx + 0.4), (y - cy) / (ry + 0.4)) <= 1) put(x, y, spec); };
	tunnel([[x1 - 1, L1 + 1], [x1 - 1, L1 + 5], [x0 + 2, L1 + 5], [x0 + 2, L1 + 7]]);
	// The cells, off the passage: barred doors, straw.
	for (const x of [x0 + 5, x0 + 9, x0 + 13]) { fill(x, L1 + 2, x + 1, L1 + 3, 'floor granite'); put(x, L1 + 4, 'wall iron'); door(x + 1, L1 + 4, 'granite'); thing(x, L1 + 2, 'hay bale'); }
	label(x0 + 4, L1 + 1, 'The Cells');
	// The ossuary; the chamber of the sigil beyond it; the cistern below.
	carve(x0 + 4, L1 + 10, 3, 3);
	for (const [dx, dy] of [[1, 8], [7, 8], [1, 12], [7, 12]]) thing(x0 + dx, L1 + dy, 'coffin', 'floor granite');
	thing(x0 + 4, L1 + 8, 'candle', 'floor granite');
	label(x0, L1 + 6, 'The Ossuary');
	tunnel([[x0 + 7, L1 + 10], [x0 + 10, L1 + 10]]);
	const sx = x0 + 13, sy = L1 + 11;
	carve(sx, sy, 5, 5);
	for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; thing(Math.round(sx + Math.cos(a) * 3.2), Math.round(sy + Math.sin(a) * 3.2), 'sigil', 'floor granite'); }
	thing(sx, sy, 'altar', 'floor granite');
	for (const [dx, dy] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) thing(sx + dx, sy + dy, 'candle', 'floor granite');
	label(sx - 5, sy - 6, 'The Sigil Chamber');
	carve(x0 + 4, y1 - 3, 3, 1, 'floor water');
	tunnel([[x0 + 4, L1 + 13], [x0 + 4, y1 - 5]]);
	label(x0, y1 - 1, 'The Cistern');
	// Seal the stone at the edges (the streets must not see in).
	for (let y = L1 + 1; y <= y1; y++) { put(x0, y, 'wall granite'); put(x1, y, 'wall granite'); }
	for (let x = x0; x <= x1; x++) put(x, y1, 'wall granite');
}
// The far column: narrow houses and warehouses, facing the street to their west.
for (let r = 0; r < ROWS.length; r++) {
	const [x0, x1] = COLS[3], [y0, y1] = ROWS[r];
	SPECIAL.add(`3,${r}`);
	if (r % 2) {
		room(x0, y0, x1 + 1, y1, 'brick', 'wood'); door(x0, Math.floor((y0 + y1) / 2), 'wood');
		for (let y = y0 + 2; y < y1 - 1; y += 2) { thing(x0 + 3, y, 'barrel'); thing(x0 + 6, y, 'chest'); }
		label(x0, y0, r === 1 ? 'Bonded Warehouse' : 'Tannery');
	} else {
		const m = Math.floor((y0 + y1) / 2);
		for (const [a, b] of [[y0, m], [m, y1]]) {
			room(x0, a, x1 + 1, b, 'brick', 'wood'); door(x0, Math.floor((a + b) / 2), 'wood'); win(x0, a + 1);
			thing(x1, a + 1, 'bed'); thing(x1, b - 1, 'oven'); thing(x0 + 3, b - 1, 'chest');
			homes.push([x0, a]);
		}
	}
}
// Everything else: terraces.
for (let c = 0; c < 3; c++) for (let r = 0; r < ROWS.length; r++) if (!SPECIAL.has(`${c},${r}`)) terraces(COLS[c][0], ROWS[r][0], COLS[c][1], ROWS[r][1]);

// ---- few gas lamps, far apart, at the crossings ----
for (const x of [32, 76]) for (const y of [2, 34, 66]) thing(x, y, 'gas lamp');
for (const x of [54, 98]) for (const y of [18, 82]) thing(x, y, 'gas lamp');
thing(33, 83, 'gas lamp'); thing(99, 3, 'gas lamp'); thing(55, 51, 'gas lamp');

// ---- every door opens onto a way out: clear trees from each door to a path ----
const isWall = (s) => s.startsWith('wall') && s !== 'wall leaves';
const WAY = (s) => /^floor (cobble|stone block|slate|granite|wood|gravel)/.test(s);
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
		for (let p = goal; p; p = from.get(p[0] + ',' + p[1])) if (get(p[0], p[1]) === 'wall leaves') put(p[0], p[1], 'floor gravel');
	}
}

// ---- keys: one printable character per distinct cell ----
const POOL = [...'.,:;_=+#%&*~-^"\'`!?$@ABCDEFGHIJKLMNOPQRSUVWXYZabcdefghijklmnopqrstuvwxyz0123456789<>/()[]{}|\\'];
const preferred = { 'floor grass': ',', 'wall leaves': 'T', 'floor cobble': '.', 'wall brick': '#', 'floor wood': '+', 'floor water': '~', 'wall granite': 'R', 'floor granite': 'G', 'wall glass': 'w', 'floor slate': '_', 'wall stone block': 'S', 'floor stone block': 's', 'wall iron': 'I', 'floor gravel': ':' };
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
	'# Saltgrave, a gas-lit Victorian city for Grimoire\'s Laissez un Faire games.',
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
console.log(JSON.stringify({ homes: homes.length, keys: keyOf.size }));
