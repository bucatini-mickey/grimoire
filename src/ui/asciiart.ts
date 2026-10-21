/**
 * asciiart.ts - pictures and lettering as ASCII on coloured blocks, the way
 * Tachyon and the Tokamak draw: every pixel is one square cell, its colour
 * the cell's background and a character over it, a shade lighter or darker,
 * for texture (dim cells get dots, bright ones stars and hashes).
 *
 * Lettering is traced from a pixel blackletter (Jacquard 12, Jacquarda
 * Bastarda 9) drawn once into a canvas, then laid out the same way: ink
 * blocks for the letters, and for an initial, lapis on a square of gold.
 * It is drawn when the font has loaded; until then the plain word shows.
 */

const hash = (x: number, y: number) => {
	let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
	h = Math.imul(h ^ (h >>> 13), 1103515245);
	return (h ^ (h >>> 16)) >>> 0;
};
const DIM = ['.', ',', ':', '-'], MID = ['=', '+', ':', '~', '-'], BRIGHT = ['#', '*', '%', '+'];

/** How light a colour is, 0-1 (for '#rrggbb'; CSS colours count as middling). */
function light(c: string): number {
	const m = /^#([0-9a-f]{6})$/i.exec(c);
	if (!m) return 0.5;
	const n = parseInt(m[1], 16);
	return (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255;
}

/**
 * One cell's character: one per colour, so a patch of colour reads as one
 * material (all the wood alike, all the gold alike); dim colours get light
 * marks, bright ones heavy. Where it is no longer matters (x, y kept for callers).
 */
export function glyphFor(colour: string, _x: number, _y: number): string {
	const l = light(colour), set = l < 0.28 ? DIM : l < 0.62 ? MID : BRIGHT;
	let h = 0;
	for (const ch of colour) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
	return set[(h >>> 0) % set.length];
}

/**
 * Cells as HTML: `colourAt(x, y)` gives a cell's background (any CSS colour)
 * or null for an empty cell. Runs of one colour share a span; each row is a
 * block one cell tall, so the cells come out square.
 */
export function cellsHtml(w: number, h: number, colourAt: (x: number, y: number) => string | null, cls = '', mix = 68): string {
	const rows: string[] = [];
	for (let y = 0; y < h; y++) {
		let line = '', x = 0;
		while (x < w) {
			const c = colourAt(x, y);
			let end = x + 1;
			while (end < w && colourAt(end, y) === c) end++;
			let text = '';
			for (let k = x; k < end; k++) text += c ? glyphFor(c, k, y) : ' ';
			const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
			// The character a shade off its block: towards the page for a themed colour, else towards white or black.
			const tint = c?.startsWith('var(') ? 'var(--bg)' : light(c ?? '') < 0.5 ? '#fff' : '#000';
			line += c ? `<span style="background:${c};color:color-mix(in srgb, ${c} ${mix}%, ${tint})">${esc}</span>` : esc;
			x = end;
		}
		rows.push(`<div>${line}</div>`);
	}
	return `<div class="asc ${cls}" style="--cols:${w}" aria-hidden="true">${rows.join('')}</div>`;
}

// ---- lettering ----------------------------------------------------------------------------------

/** The pixel faces, and the grid each is designed on (its size in pixels: one design pixel to one cell). */
export const FACES = { title: { family: 'Jacquard 24', px: 24 }, small: { family: 'Jacquarda Bastarda 9', px: 9 } } as const;
/** Words are drawn this many times larger, on the font's grid, then each design pixel read by how much of it is inked. */
const K = 4;
export type Face = keyof typeof FACES;

const bitmaps = new Map<string, boolean[][]>();
/** The word in a pixel face, as rows of on/off; null until the font is ready. */
function bitmap(text: string, face: Face): boolean[][] | null {
	const key = `${face}:${text}`;
	const hit = bitmaps.get(key);
	if (hit) return hit;
	const { family, px } = FACES[face];
	if (typeof document === 'undefined' || !document.fonts?.check(`${px}px "${family}"`)) return null;
	const cv = document.createElement('canvas');
	const x = cv.getContext('2d', { willReadFrequently: true });
	if (!x) return null;
	// Drawn large with its origin and baseline on the design grid, so every design pixel is a K-by-K square.
	const font = `${px * K}px "${family}"`;
	x.font = font;
	const gw = Math.ceil(x.measureText(text).width / K) + 4, gh = Math.ceil(px * 1.7);
	const W = gw * K, H = gh * K;
	cv.width = W; cv.height = H;
	x.font = font;
	x.textBaseline = 'alphabetic';
	x.fillStyle = '#000';
	x.fillText(text, 2 * K, Math.round(px * 1.25) * K);
	const d = x.getImageData(0, 0, W, H).data;
	let rows: boolean[][] = [];
	for (let gy = 0; gy < gh; gy++) {
		const r: boolean[] = [];
		for (let gx = 0; gx < gw; gx++) {
			let ink = 0;
			for (let dy = 0; dy < K; dy++) for (let dx = 0; dx < K; dx++) ink += d[((gy * K + dy) * W + gx * K + dx) * 4 + 3];
			r.push(ink / (K * K) >= 110);
		}
		rows.push(r);
	}
	const w = gw;
	// Trim the empty rows; keep the columns (spaces between words count).
	while (rows.length && !rows[0].some(Boolean)) rows.shift();
	while (rows.length && !rows[rows.length - 1].some(Boolean)) rows.pop();
	let l = 0, r = w - 1;
	while (l < r && rows.every((row) => !row[l])) l++;
	while (r > l && rows.every((row) => !row[r])) r--;
	rows = rows.map((row) => row.slice(l, r + 1));
	bitmaps.set(key, rows);
	return rows;
}

/** Leaf: a gold that shimmers a little from cell to cell. */
const GOLD = ['#c39535', '#d4a83f', '#b8892c', '#e0bb55', '#c9a042'];

/** A word in ASCII lettering; `ink` is its colour (a CSS colour; var(--ink) by default). */
function wordHtml(text: string, face: Face, ink: string): string | null {
	const b = bitmap(text, face);
	if (!b) return null;
	return cellsHtml(b[0]?.length ?? 0, b.length, (x, y) => (b[y][x] ? ink : null), 'asc-word', 80);
}

/** An initial: the letter in lapis on a square of gold leaf, a cell of gold round it. */
function initialHtml(ch: string, face: Face, ink: string): string | null {
	const b = bitmap(ch, face);
	if (!b) return null;
	const h = b.length, w = b[0]?.length ?? 0, side = Math.max(h, w) + 2, ox = Math.floor((side - w) / 2), oy = Math.floor((side - h) / 2);
	return cellsHtml(side, side, (x, y) => {
		const on = b[y - oy]?.[x - ox];
		if (on) return ink;
		if (x === 0 || y === 0 || x === side - 1 || y === side - 1) return '#3a2614';
		return GOLD[hash(x, y) % GOLD.length];
	}, 'asc-initial', 72);
}

/**
 * Fill every [data-asc] element under `root` with its lettering:
 *   data-asc="Grimoire" data-face="title|small" data-ink="var(--ink)" data-initial (first letter illuminated)
 * Elements whose font has not loaded yet keep their plain text, and are done when it arrives.
 */
export function letter(root: ParentNode) {
	const els = root.querySelectorAll<HTMLElement>('[data-asc]');
	let waiting = false;
	for (const el of els) {
		const text = el.dataset.asc!, face = (el.dataset.face as Face) ?? 'title', ink = el.dataset.ink ?? 'var(--ink)';
		const key = `${text}|${face}|${ink}|${el.dataset.initial ?? ''}`;
		if (el.dataset.drawn === key) continue;
		let html: string | null;
		if (el.dataset.initial !== undefined) {
			const [first, ...rest] = [...text];
			const a = initialHtml(first, face, el.dataset.initialInk ?? 'var(--lapis)'), b = rest.length ? wordHtml(rest.join(''), face, ink) : '';
			html = a !== null && b !== null ? a + b : null;
		} else html = wordHtml(text, face, ink);
		if (html === null) { waiting = true; continue; }
		el.innerHTML = html;
		el.dataset.drawn = key;
		el.classList.add('asc-drawn');
	}
	if (waiting && typeof document !== 'undefined') {
		const fams = Object.values(FACES).map((f) => document.fonts.load(`${f.px}px "${f.family}"`));
		void Promise.all(fams).then(() => { if (Object.values(FACES).every((f) => document.fonts.check(`${f.px}px "${f.family}"`))) letter(root); });
	}
}
