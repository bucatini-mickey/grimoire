/**
 * ascii.ts - the screen layer, drawn as cells on a pseudo-terminal (term/pterm.ts).
 *
 * A screen is a list of rows; a row is a list of segments (text or button), or a
 * `block` that draws itself into cells. `paint` lays the rows out as lines,
 * splits them into pages that fit the viewport (the page never scrolls), and
 * draws the page with a `[< Back]` / `[Next >]` bar when there is more than one.
 * Buttons are ASCII boxes three rows tall, so a thumb can hit them.
 *
 * Nothing here knows about the game.
 */

import { Term, shade } from '../term/pterm.ts';
import type { Grid, Palette, Rect } from '../term/pterm.ts';

export const COLS = 44;
/** The width inside a panel's frame: a border and a space each side. */
export const INNER = COLS - 4;

export type Tone = 'plain' | 'rubric' | 'gold' | 'evil' | 'good' | 'dim' | 'title' | 'poison' | 'drunk';

export interface Text {
	t: string;
	tone?: Tone;
	/** Kept for the callers that mark art or headings; both draw in the one terminal font. */
	face?: 'art' | 'heading';
	/** Text filled in as it is drawn (the clocks): `timer` names the clock. */
	data?: Record<string, string>;
}

export interface Button {
	label: string;
	act: () => void;
	/** primary = the main thing to do now; on = toggled/selected; danger = irreversible-ish. */
	style?: 'primary' | 'on' | 'danger' | 'quiet';
	disabled?: boolean;
	/** Exact width in columns (label is padded/cut to fit). Used inside art. */
	width?: number;
	aria?: string;
}

export type Seg = Text | Button;

/** Where a block draws, and how to put buttons on it. */
export interface Ctx {
	g: Grid;
	x: number;
	y: number;
	w: number;
	ink: (t: Tone | undefined) => number;
	hit: (r: Rect, fn: (x: number, y: number) => void) => void;
}

export interface Block {
	h: number;
	draw: (c: Ctx) => void;
}

export interface Row {
	segs: Seg[];
	cls?: string;
	/** Set on a rubric row: the title of the panel it opens (see paneled). */
	title?: string;
	/** A row that draws itself (the seating circle, a field, a picture). */
	block?: Block;
}

export const isButton = (s: Seg): s is Button => 'act' in s;

export const txt = (t: string, tone?: Tone, face?: Text['face']): Text => (face ? { t, tone, face } : { t, tone });
export const btn = (label: string, act: () => void, extra: Partial<Button> = {}): Button => ({ label, act, ...extra });
export const row = (...segs: (Seg | string)[]): Row => ({ segs: segs.map((s) => (typeof s === 'string' ? txt(s) : s)) });
export const blank = (): Row => row('');
export const blockRow = (h: number, draw: Block['draw'], cls?: string): Row => ({ segs: [], cls, block: { h, draw } });

/** The width a segment takes on the grid. A button is a box: label, a space each side, a border each side. */
export function segWidth(s: Seg): number {
	if (!isButton(s)) return [...s.t].length;
	return s.width ?? [...s.label].length + 4;
}

export function center(text: string, width = COLS): string {
	const len = [...text].length;
	if (len >= width) return text;
	const left = Math.floor((width - len) / 2);
	return ' '.repeat(left) + text;
}

export function pad(text: string, width: number): string {
	const chars = [...text];
	if (chars.length >= width) return chars.slice(0, width).join('');
	return text + ' '.repeat(width - chars.length);
}

/** Break prose into lines no wider than `width`. */
export function wrap(text: string, width = INNER): string[] {
	const out: string[] = [];
	for (const para of text.split('\n')) {
		let line = '';
		for (const word of para.split(/\s+/).filter(Boolean)) {
			if (!line) line = word;
			else if (line.length + 1 + word.length <= width) line += ' ' + word;
			else {
				out.push(line);
				line = word;
			}
		}
		out.push(line);
	}
	return out;
}

/** A run of buttons, wrapped onto as many rows as needed. */
export function buttonRows(buttons: Button[], width = INNER, gap = 1): Row[] {
	const rows: Row[] = [];
	let cur: Seg[] = [];
	let used = 0;
	for (const b of buttons) {
		const w = segWidth(b);
		if (cur.length && used + gap + w > width) {
			rows.push({ segs: cur });
			cur = [];
			used = 0;
		}
		if (cur.length && gap) {
			cur.push(txt(' '.repeat(gap)));
			used += gap;
		}
		cur.push(b);
		used += w;
	}
	if (cur.length) rows.push({ segs: cur });
	return rows;
}

// ---- frames ----------------------------------------------------------------

/** A ruled heading in the manner of a manuscript rubric:  --§ Title §-- */
export function rubric(title: string, width = COLS): Row {
	const inner = ` ${title} `;
	const len = [...inner].length + 2;
	const left = Math.max(1, Math.floor((width - len) / 2));
	const right = Math.max(1, width - len - left);
	return { ...row(txt('─'.repeat(left) + '§', 'dim'), txt(inner, 'rubric'), txt('§' + '─'.repeat(right), 'dim')), title };
}

/** The top of a frame: `+-= Title =---+`, drawn by paint (class frame-top). */
export function frameTop(title: string, width = COLS): Row[] {
	void width;
	return [{ segs: [txt(title)], cls: 'frame-top' }];
}

/** The foot of a frame. */
export function frameBottom(width = COLS): Row {
	void width;
	return { segs: [], cls: 'frame-bot' };
}

/** Ends the current panel early (see paneled). */
export const endPanel = (): Row => ({ segs: [], cls: 'end-panel' });

const isBlank = (r: Row) => !r.block && r.segs.every((g) => !isButton(g) && !g.t.trim());

/**
 * Turn a flat screen into boxed sections. Each rubric row opens a panel
 * titled with it; the rows after it go inside the frame until the next
 * rubric, an endPanel(), a block row marked 'wide' or a full-width ('wide') row.
 * Side rules are drawn by paint down every line of a frame-mid row.
 */
export function paneled(rows: Row[], width = COLS): Row[] {
	const out: Row[] = [];
	const inner = width - 4;
	let body: Row[] | null = null;
	let title = '';
	let opener: Row | null = null;
	const close = () => {
		if (!body) return;
		while (body.length && isBlank(body[body.length - 1])) body.pop();
		if (!body.length) {
			out.push(opener!);
			body = null;
			return;
		}
		out.push(...frameTop(title, width));
		for (const r of body) {
			const used = r.segs.reduce((a, g) => a + segWidth(g), 0);
			out.push({ ...r, segs: [txt('  '), ...r.segs, txt(' '.repeat(Math.max(0, inner - used))), txt('  ')], cls: ['frame-mid', r.cls ?? ''].join(' ').trim() });
		}
		out.push(frameBottom(width));
		body = null;
	};
	for (const r of rows) {
		if (r.title !== undefined) {
			close();
			body = [];
			title = r.title;
			opener = r;
		} else if (r.cls === 'end-panel') {
			close();
		} else if (body && (r.cls?.includes('wide') || r.cls === 'frame-top' || r.cls === 'frame-bot')) {
			close();
			out.push(r);
		} else if (body) {
			if (body.length || !isBlank(r)) body.push(r);
		} else {
			out.push(r);
		}
	}
	close();
	return out;
}

export function rule(width = COLS): Row {
	return row(txt(center('-=§=-', width), 'dim'));
}

// ---- canvas: free placement of text and buttons ---------------------------

interface Placed {
	x: number;
	y: number;
	seg: Seg;
}

/** A fixed grid you can stamp text and buttons onto anywhere. Later stamps win. */
export class Canvas {
	width: number;
	height: number;
	private items: Placed[] = [];

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
	}

	put(x: number, y: number, seg: Seg | string) {
		this.items.push({ x: Math.round(x), y: Math.round(y), seg: typeof seg === 'string' ? txt(seg) : seg });
	}

	/** One block row: text stamped at its place, buttons as boxes at theirs (a button spans three lines). */
	rows(): Row[] {
		const items = this.items;
		return [blockRow(this.height, (c) => {
			for (const p of items) {
				if (isButton(p.seg)) drawButton(c, c.x + p.x, c.y + p.y, segWidth(p.seg), p.seg);
				else c.g.text(c.x + p.x, c.y + p.y, p.seg.t, c.ink(p.seg.tone));
			}
		})];
	}
}

// ---- cells ----------------------------------------------------------------

/**
 * Palettes: slot 0 page, 1 panel, 2 rule, 3 dim, 4 ink, 5 bright, 6 gold,
 * 7 amber, 8 rubric, 9 deep rubric, 10 green, 11 deep green, 12 lapis,
 * 13 deep lapis, 14 violet, 15 brown. Manuscript: ink and rubric on vellum;
 * the Victorian variant drowns it in greens and brass.
 */
const PALETTES: Record<string, Palette> = {
	'manuscript-night': ['#16110c', '#221a12', '#5a4a34', '#8f7d60', '#d9c9a3', '#f2e6c4', '#d4a73a', '#c9702a', '#c8412f', '#7a241b', '#7d9a52', '#3a4a26', '#5b84b8', '#27406b', '#9a6bb0', '#5c3f24'],
	'manuscript-day': ['#eadfc2', '#ddd0ae', '#a39270', '#7a6c50', '#2a1f14', '#120c06', '#9a6e10', '#a8541a', '#a4271c', '#7a1a12', '#4d6a2a', '#a9b98a', '#2c5588', '#b8c6dc', '#6e3f86', '#b39b76'],
	'victorian-night': ['#0e1411', '#16201b', '#3f5648', '#7d9486', '#cfd6c0', '#ecebd2', '#c7a24a', '#b9792f', '#b5503c', '#6b2a22', '#8cb36a', '#2f4a2c', '#6f9aa8', '#20404a', '#8a6aa0', '#4a3a24'],
	'victorian-day': ['#e2dcc0', '#d3cdae', '#8f9a82', '#66705e', '#1e2a22', '#0c150f', '#8a6a1a', '#9a5c20', '#8e2f24', '#6b1f18', '#3f5a28', '#a9b78e', '#2a5a66', '#b4c8c8', '#5e3f78', '#a89870']
};

const TONE: Record<Tone, number> = { plain: 4, rubric: 8, gold: 6, evil: 8, good: 12, dim: 3, title: 5, poison: 10, drunk: 14 };

let term: Term | null = null;
const layers = new Map<unknown, { rows: Row[]; width: number; page: number; sig: string }>();
/** Latest on top: the card layer (set by the caller) covers the app layer. */
const order: unknown[] = [];
let dynamic: (d: Record<string, string>) => string | null = () => null;
let paletteKey: () => string = () => 'manuscript-night';
/** Anything drawn after the page layers (the village, set by main). */
let extra: ((g: Grid) => boolean) | null = null;

export const setDynamic = (f: typeof dynamic) => { dynamic = f; };
export const setPalette = (f: () => string) => { paletteKey = f; };
export const setExtra = (f: typeof extra) => { extra = f; };
export const redraw = () => term?.draw();

let parsed: { pal: Palette; rgb: number[][]; memo: Int16Array } | null = null;
/**
 * The palette entry nearest to an [r, g, b] colour (0-255), for drawing the town in the page's inks:
 * the 16 inks and their shade steps, so a light fading out stays its own hue. Memoised at 6 bits a channel.
 */
export function quant(c: number[]): number {
	const pal = term?.palette ?? PALETTES['manuscript-night'];
	if (!parsed || parsed.pal !== pal) parsed = { pal, rgb: pal.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]), memo: new Int16Array(1 << 18).fill(-1) };
	const r = Math.max(0, Math.min(255, c[0])) >> 2, g = Math.max(0, Math.min(255, c[1])) >> 2, b = Math.max(0, Math.min(255, c[2])) >> 2;
	const key = (r << 12) | (g << 6) | b;
	const hit = parsed.memo[key];
	if (hit >= 0) return hit;
	const [cr, cg, cb] = [r * 4 + 2, g * 4 + 2, b * 4 + 2];
	let best = 0, bd = Infinity;
	parsed.rgb.forEach((p, i) => {
		const d = 2 * (p[0] - cr) ** 2 + 4 * (p[1] - cg) ** 2 + 3 * (p[2] - cb) ** 2;
		if (d < bd) { bd = d; best = i; }
	});
	parsed.memo[key] = best;
	return best;
}
export { shade };
export const theTerm = () => term;

const lineH = (r: Row) => (r.block ? r.block.h : r.segs.some(isButton) ? 3 : 1);

/**
 * Draw a button: a ruled cartouche three lines tall. The main action is a
 * rubric plate in a gold double rule; an ordinary one is vellum in a gold
 * rule with its first letter in red, as a scribe would letter it.
 */
export function drawButton(c: Ctx, x: number, y: number, w: number, b: Button) {
	const g = c.g;
	const st = b.disabled ? 'off' : b.style ?? 'normal';
	// label ink, ground, rule, initial, rule style
	const [fg, bg, edge, cap, line]: [number, number, number, number, 'single' | 'double'] =
		st === 'primary' ? [0, 8, 6, 0, 'double']
		: st === 'on' ? [0, 6, 9, 9, 'double']
		: st === 'danger' ? [8, 1, 8, 8, 'single']
		: st === 'quiet' ? [3, 1, 2, 3, 'single']
		: st === 'off' ? [2, 1, 2, 2, 'single']
		: [5, 1, 6, 8, 'single'];
	g.fill({ x, y, w, h: 3 }, ' ', fg, bg);
	g.box({ x, y, w, h: 3 }, edge, bg, '', edge, line);
	const room = Math.max(1, w - 4);
	const label = [...b.label].slice(0, room).join('');
	const lx = x + 2 + Math.floor((room - [...label].length) / 2);
	g.text(lx, y + 1, label, fg, bg);
	if (label && /\p{L}/u.test(label[0])) g.set(lx, y + 1, label[0], cap, bg);
	if (!b.disabled) c.hit({ x, y, w, h: 3 }, b.act);
}

/**
 * The logo (art/logo.png, 16 x 16): a bleeding clock on boards. Each pixel
 * is two cells, so it is square; each colour is a ground with its own glyph,
 * as the logo was drawn.
 */
const LOGO = [
	'aaaaaaaaaaaaaaaa', 'abcccbbbbbbcccba', 'accbbddddddbbcca', 'accbdeeeeeedbcca',
	'acbdeefgffeedbca', 'abbdeffgfffedbba', 'abcdeffgfffedcba', 'accdeffgggfedccb',
	'abbdeffffffedbbb', 'abcdeeffffeedcba', 'abbcdheeeehdcbbb', 'abbbbhhhhhdbbbba',
	'abbbbichhhcbbbba', 'accbbbchbibbbcca', 'acccbbbibcbbccca', 'accccaaabaacccca'
];
/** Logo colour -> [ground rgb, glyph]. */
const LOGO_INK: Record<string, [number[], string]> = {
	a: [[170, 151, 110], '+'], b: [[128, 89, 45], '='], c: [[83, 50, 13], '-'], d: [[242, 194, 58], '*'], e: [[18, 13, 8], '#'],
	f: [[251, 243, 207], ' '], g: [[194, 134, 26], '|'], h: [[227, 38, 28], '~'], i: [[125, 15, 10], ':']
};

/** Lettering for the name, five rows tall, in the logo's manner: each stroke a coloured cell with its glyph. */
const LETTERS: Record<string, string[]> = {
	G: ['.###', '#...', '#.##', '#..#', '.###'], R: ['###.', '#..#', '###.', '#.#.', '#..#'], I: ['###', '.#.', '.#.', '.#.', '###'],
	M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], O: ['.##.', '#..#', '#..#', '#..#', '.##.'], E: ['####', '#...', '###.', '#...', '####'],
	A: ['.##.', '#..#', '####', '#..#', '#..#'], S: ['.###', '#...', '.##.', '...#', '###.'], L: ['#...', '#...', '#...', '#...', '####'],
	T: ['###', '.#.', '.#.', '.#.', '.#.'], V: ['#...#', '#...#', '.#.#.', '.#.#.', '..#..'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
	B: ['###.', '#..#', '###.', '#..#', '###.'], C: ['.###', '#...', '#...', '#...', '.###'], D: ['###.', '#..#', '#..#', '#..#', '###.'],
	F: ['####', '#...', '###.', '#...', '#...'], H: ['#..#', '#..#', '####', '#..#', '#..#'], J: ['..##', '...#', '...#', '#..#', '.##.'],
	K: ['#..#', '#.#.', '##..', '#.#.', '#..#'], P: ['###.', '#..#', '###.', '#...', '#...'], Q: ['.##.', '#..#', '#..#', '#.##', '.###'],
	U: ['#..#', '#..#', '#..#', '#..#', '.##.'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], X: ['#..#', '#..#', '.##.', '#..#', '#..#'],
	Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['####', '..#.', '.#..', '#...', '####']
};

function lettering(g: Grid, x0: number, y: number, word: string) {
	let x = x0;
	[...word.toUpperCase()].forEach((ch, k) => {
		const art = LETTERS[ch];
		if (!art) { x += 3; return; }
		// The first letter is rubricated, the rest in ink; each stroke a filled cell with its own glyph.
		const [bg, fg, gl] = k === 0 ? [8, 9, '%'] : [4, 3, ':'];
		art.forEach((ln, j) => [...ln].forEach((p, i) => { if (p === '#') g.set(x + i, y + j, gl, fg, bg); }));
		x += art[0].length + 1;
	});
}
export const letteringWidth = (word: string) => [...word.toUpperCase()].reduce((a, ch) => a + (LETTERS[ch]?.[0].length ?? 2) + 1, -1);

/** A word lettered large (five rows), centred; null when it will not fit in `width` or has letters the face lacks. */
export function letteredRow(word: string, width: number): Row | null {
	if (!/^[A-Za-z ]+$/.test(word) || letteringWidth(word) > width) return null;
	return blockRow(5, (c) => lettering(c.g, c.x + Math.floor((c.w - letteringWidth(word)) / 2), c.y, word));
}

/** The head of the home page: the logo, and the book's name lettered under it. Small screens get the logo at half size. */
export function titleRow(word = 'Grimoire'): Row {
	const big = (term?.rows ?? 0) >= 60;
	const h = (big ? 17 : 9) + 6;
	return blockRow(h, (c) => {
		let y = c.y;
		if (big) {
			const lx = c.x + Math.floor((c.w - 32) / 2);
			LOGO.forEach((ln, j) => [...ln].forEach((k, i) => {
				const [rgb, gl] = LOGO_INK[k];
				const bg = quant(rgb), fg = quant(rgb.map((v) => (v > 128 ? v * 0.7 : v * 1.6 + 20)));
				c.g.set(lx + i * 2, y + j, gl, fg, bg);
				c.g.set(lx + i * 2 + 1, y + j, gl, fg, bg);
			}));
			y += 17;
		} else {
			// Half size: two pixels a cell, the upper one the glyph's ink, the lower its ground.
			const lx = c.x + Math.floor((c.w - 16) / 2);
			for (let j = 0; j < 8; j++) for (let i = 0; i < 16; i++) c.g.set(lx + i, y + j, '▀', quant(LOGO_INK[LOGO[j * 2][i]][0]), quant(LOGO_INK[LOGO[j * 2 + 1][i]][0]));
			y += 9;
		}
		lettering(c.g, c.x + Math.floor((c.w - letteringWidth(word)) / 2), y, word);
	}, 'title');
}


/** A text field: tap it to type; the hidden input echoes into these cells. */
export function field(id: string, label: string, value: string, set: (v: string) => void, max = 14, placeholder = ''): Row {
	return blockRow(3, (c) => {
		const active = term?.editing && fieldId === id;
		const shown = active ? term!.entry : value;
		c.g.fill({ x: c.x, y: c.y, w: c.w, h: 3 }, ' ', 4, 1);
		c.g.box({ x: c.x, y: c.y, w: c.w, h: 3 }, active ? 6 : 3, 1, label, 8, 'single');
		const room = c.w - 4;
		const view = [...shown].slice(-room).join('');
		if (view) c.g.text(c.x + 2, c.y + 1, view, 5, 1);
		else c.g.text(c.x + 2, c.y + 1, placeholder, 3, 1);
		if (active) c.g.set(c.x + 2 + [...view].length, c.y + 1, '_', 6, 1);
		c.hit({ x: c.x, y: c.y, w: c.w, h: 3 }, () => {
			fieldId = id;
			term?.startEntry(value, max, (v) => { if (v !== null) set(v); term?.draw(); });
		});
	});
}
let fieldId = '';

/** Stamp one row at (x, y); returns nothing. */
function drawRow(g: Grid, r: Row, x0: number, y: number, width: number, h: number, ink: (t: Tone | undefined) => number) {
	const ctx: Ctx = { g, x: x0, y, w: width, ink, hit: (rc, fn) => g.hit(rc, fn) };
	// A panel is a leaf of vellum in a gold double rule, its title rubricated on the rule between two lozenges.
	if (r.cls === 'frame-top') {
		g.set(x0, y, '╔', 6, 0);
		for (let i = 1; i < width - 1; i++) g.set(x0 + i, y, '═', 6, 0);
		g.set(x0 + width - 1, y, '╗', 6, 0);
		const t = r.segs[0] && !isButton(r.segs[0]) ? r.segs[0].t : '';
		if (t) {
			const tx = x0 + 2;
			g.text(tx, y, '♦ ', 8, 0);
			g.text(tx + 2, y, t, 5, 0);
			g.set(tx + 2, y, [...t][0], 8, 0);
			g.text(tx + 2 + [...t].length, y, ' ♦', 8, 0);
		}
		return;
	}
	if (r.cls === 'frame-bot') {
		g.set(x0, y, '╚', 6, 0);
		for (let i = 1; i < width - 1; i++) g.set(x0 + i, y, '═', 6, 0);
		g.set(x0 + width - 1, y, '╝', 6, 0);
		const mid = x0 + Math.floor(width / 2);
		g.text(mid - 2, y, '═╡♣╞═', 6, 0);
		g.set(mid, y, '♣', 10, 0);
		return;
	}
	const inPanel = !!r.cls?.includes('frame-mid');
	if (inPanel) g.fill({ x: x0 + 1, y, w: width - 2, h }, ' ', 4, 1);
	const sides = () => { if (inPanel) for (let j = 0; j < h; j++) { g.set(x0, y + j, '║', 6, 0); g.set(x0 + width - 1, y + j, '║', 6, 0); } };
	if (r.block) {
		// A block inside a frame sits within the side rules.
		const inFrame = r.cls?.includes('frame-mid');
		r.block.draw(inFrame ? { ...ctx, x: x0 + 2, w: width - 4 } : ctx);
		if (inFrame) sides();
		return;
	}
	let x = x0;
	for (const s of r.segs) {
		const w = segWidth(s);
		if (isButton(s)) drawButton(ctx, x, y, w, s);
		else {
			const text = s.data ? dynamic(s.data) ?? s.t : s.t;
			g.text(x, y, text, ink(s.tone));
		}
		x += w;
	}
	sides();
}

const inFrame = (r: Row | undefined) => !!r?.cls?.includes('frame-mid');

/**
 * Split lines into pages. A panel that fits on a page is kept together;
 * a long one runs on to the next page, closed by a rule at the foot of one
 * and reopened at the head of the next, so no page is left half empty.
 */
function paginate(rows: Row[], avail: number): { from: number; to: number }[] {
	const pages: { from: number; to: number }[] = [];
	let from = 0, used = 0;
	for (let i = 0; i < rows.length; i++) {
		const r = rows[i], h = lineH(r);
		let need = h + (inFrame(r) ? 1 : 0);
		if (r.cls === 'frame-top') {
			let whole = 0;
			for (let j = i; j < rows.length; j++) { whole += lineH(rows[j]); if (rows[j].cls === 'frame-bot') break; }
			// Keep it whole if it fits on a page and would not leave much of this one empty; else start it here if a row of it fits.
			need = whole <= avail && avail - used < 8 ? whole : h + lineH(rows[i + 1] ?? r) + 1;
		}
		if (used > 0 && used + need > avail) {
			pages.push({ from, to: i });
			from = i;
			used = inFrame(r) ? 1 : 0;
		}
		used += h;
	}
	pages.push({ from, to: rows.length });
	return pages;
}

function drawLayer(g: Grid, key: unknown, ink: (t: Tone | undefined) => number, sheet = false) {
	const L = layers.get(key)!;
	const total = L.rows.reduce((a, r) => a + lineH(r), 0);
	const barH = 3;
	let pages = paginate(L.rows, g.rows);
	if (total > g.rows) pages = paginate(L.rows, g.rows - barH);
	L.page = Math.max(0, Math.min(L.page, pages.length - 1));
	const x0 = Math.max(0, Math.floor((g.cols - L.width) / 2));
	let y = 0;
	const p = pages[L.page];
	if (sheet) {
		let h = 0;
		for (let i = p.from; i < p.to; i++) h += lineH(L.rows[i]);
		g.fill({ x: Math.max(0, x0 - 1), y: 0, w: Math.min(g.cols, L.width + 2), h: Math.min(g.rows, h + 2) }, ' ', 4, 0);
		if (pages.length > 1) g.fill({ x: 0, y: g.rows - barH, w: g.cols, h: barH }, ' ', 4, 0);
	}
	// A panel carried over from the page before: its rule again, its title marked as continued.
	if (inFrame(L.rows[p.from])) {
		let k = p.from;
		while (k > 0 && L.rows[k].cls !== 'frame-top') k--;
		const t = L.rows[k].segs[0] && !isButton(L.rows[k].segs[0]) ? (L.rows[k].segs[0] as Text).t : '';
		drawRow(g, { segs: [txt(t ? t + ' (cont.)' : '')], cls: 'frame-top' }, x0, y++, L.width, 1, ink);
	}
	for (let i = p.from; i < p.to; i++) {
		const h = lineH(L.rows[i]);
		drawRow(g, L.rows[i], x0, y, L.width, h, ink);
		y += h;
	}
	if (inFrame(L.rows[p.to - 1])) drawRow(g, { segs: [], cls: 'frame-bot' }, x0, y, L.width, 1, ink);
	if (pages.length > 1) {
		const by = g.rows - barH;
		const w = Math.min(g.cols, Math.max(L.width, 30));
		const bx = Math.floor((g.cols - w) / 2);
		const ctx: Ctx = { g, x: bx, y: by, w, ink, hit: (r, fn) => g.hit(r, fn) };
		drawButton(ctx, bx, by, 12, { label: '< Back', act: () => { L.page--; term?.draw(); }, disabled: L.page === 0, style: 'quiet' });
		drawButton(ctx, bx + w - 12, by, 12, { label: 'Next >', act: () => { L.page++; term?.draw(); }, disabled: L.page === pages.length - 1, style: L.page === pages.length - 1 ? 'quiet' : 'primary' });
		const mid = `page ${L.page + 1}/${pages.length}`;
		g.text(bx + Math.floor((w - mid.length) / 2), by + 1, mid, 3);
		pagesOf.set(key, pages.length);
	} else pagesOf.set(key, 1);
}
const pagesOf = new Map<unknown, number>();

/** A line of text on the middle of a 3-high row, with buttons at its right end. */
export function listRow(text: string, tone: Tone | undefined, buttons: Button[], width = INNER): Row {
	return blockRow(3, (c) => {
		const bw = buttons.reduce((a, b) => a + segWidth(b) + 1, 0);
		c.g.text(c.x, c.y + 1, [...text].slice(0, Math.max(0, Math.min(width, c.w) - bw)).join(''), c.ink(tone));
		let x = c.x + c.w - bw + 1;
		for (const b of buttons) { drawButton(c, x, c.y, segWidth(b), b); x += segWidth(b) + 1; }
	});
}

/** A run of buttons as one block row (wraps like buttonRows). */
export function buttonBlock(buttons: Button[], width = INNER, gap = 1): Row {
	const lines = buttonRows(buttons, width, gap);
	return blockRow(Math.max(1, lines.length) * 3, (c) => {
		lines.forEach((r, i) => {
			let x = c.x;
			for (const s of r.segs) { if (isButton(s)) drawButton(c, x, c.y + i * 3, segWidth(s), s); x += segWidth(s); }
		});
	});
}

/** A bordered box with a few centred lines (a room code, a banner). */
export function boxRow(lines: string[], tone: Tone = 'gold', width = INNER): Row {
	return blockRow(lines.length + 2, (c) => {
		const w = Math.min(width, c.w), x0 = c.x + Math.floor((c.w - w) / 2);
		c.g.box({ x: x0, y: c.y, w, h: lines.length + 2 }, 2, 0, '', 2, 'double');
		lines.forEach((l, i) => c.g.text(x0 + Math.floor((w - [...l].length) / 2), c.y + 1 + i, l, c.ink(tone)));
	});
}

/** A small, steady hash of a cell, for textures that do not shimmer between frames. */
const cellHash = (x: number, y: number) => {
	let h = Math.imul(x * 374761393 + y * 668265263, 1274126177);
	h ^= h >>> 13;
	return (Math.imul(h, 1103515245) >>> 16) & 1023;
};

/**
 * The ground under every page: vellum with a faint grain, and, where the
 * screen is wider than the page, illuminated margins: a gold double rule
 * with vine leaves and red lozenges climbing it.
 */
function ground(g: Grid, width: number) {
	for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) {
		const h = cellHash(x, y);
		if (h < 70) g.set(x, y, h < 20 ? "'" : h < 45 ? '.' : '`', 1, 0);
		else if (h < 76) g.set(x, y, ',', shade(15, 2), 0);
	}
	const spare = g.cols - width;
	if (spare < 8) return;
	const x0 = Math.floor(spare / 2);
	for (const mx of [x0 - 3, x0 + width + 2]) {
		for (let y = 0; y < g.rows; y++) {
			g.set(mx, y, '║', shade(6, 2), 0);
			const k = (y + (mx > x0 ? 3 : 0)) % 6;
			if (k === 0) g.set(mx, y, '♦', 8, 0);
			else if (k === 3) { g.set(mx - 1, y, '♣', 11, 0); g.set(mx + 1, y, '♣', 10, 0); }
			else if (k === 2 || k === 4) { g.set(mx - 1, y, k === 2 ? '/' : '\\', shade(10, 2), 0); g.set(mx + 1, y, k === 2 ? '\\' : '/', shade(10, 2), 0); }
		}
	}
}

function frame(g: Grid) {
	const key = paletteKey();
	term!.palette = PALETTES[key] ?? PALETTES['manuscript-night'];
	document.body.style.background = term!.palette[0];
	document.documentElement.style.background = term!.palette[0];
	g.clear(4, 0);
	const top = [...order].reverse().map((k) => layers.get(k)).find((L) => L && L.rows.length);
	if (top) ground(g, top.width);
	const ink = (t: Tone | undefined) => TONE[t ?? 'plain'];
	const under = !!extra?.(g);
	// The topmost layer with rows is shown alone, as a page of its own. Over the town it is a
	// sheet: the town fades to a ghost behind it and the sheet gets a ground of its own.
	for (let i = order.length - 1; i >= 0; i--) {
		const L = layers.get(order[i]);
		if (!L || !L.rows.length) continue;
		if (under) {
			for (const c of g.cells) { c.fg = 1; c.bg = 0; }
			g.hits.length = 0;
		}
		drawLayer(g, order[i], ink, under);
		return;
	}
}

function ensureTerm(): Term {
	if (term) return term;
	const host = document.getElementById('app')!;
	term = new Term(host, {
		cols: COLS,
		maxFont: 22,
		onDraw: (t) => frame(t),
		onKey: (k) => {
			for (let i = order.length - 1; i >= 0; i--) {
				const L = layers.get(order[i]);
				if (!L || !L.rows.length) continue;
				if (k === 'PageDown' || k === 'ArrowRight') L.page++;
				else if (k === 'PageUp' || k === 'ArrowLeft') L.page--;
				else return;
				term!.draw();
				return;
			}
		}
	});
	// For measuring in the browser console: __term.stats has the last frame's timings.
	(globalThis as { __term?: Term }).__term = term;
	return term;
}

/**
 * Show `rows` as the screen for `root` (a key: the page, or the card over it).
 * A layer with no rows is hidden. Keeps its page while the screen is the same one.
 */
export function paint(root: unknown, rows: Row[], width = COLS) {
	const t = ensureTerm();
	const first = rows.find((r) => r.segs.some((s) => !isButton(s) && s.t.trim()));
	const sig = first ? first.segs.map((s) => (isButton(s) ? '' : s.t)).join('').trim().slice(0, 30) : '';
	const old = layers.get(root);
	layers.set(root, { rows, width, page: old && old.sig === sig ? old.page : 0, sig });
	// The layer shown most recently is on top.
	if (rows.length && !old?.rows.length) { const k = order.indexOf(root); if (k >= 0) order.splice(k, 1); }
	if (!order.includes(root)) order.push(root);
	t.draw();
}
