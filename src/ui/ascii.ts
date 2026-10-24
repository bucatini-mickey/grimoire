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

export const COLS = 52;
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
	'manuscript-night': ['#110e0d', '#1d1816', '#4e4238', '#857868', '#d4c9b4', '#ece2cc', '#b08d55', '#a8683a', '#b0362c', '#6e1f1a', '#7f8a62', '#343a2a', '#6f87a6', '#26344a', '#8a6a90', '#4f3a2a'],
	// The home page is the book's cover: brown calf, blind-tooled, gilt lettering and brass.
	// The book's first page, opened: clean vellum, dark ink, red and brass.
	folio: ['#e4dccb', '#d6ccb8', '#9c8f7a', '#706556', '#241c17', '#100b08', '#7d6232', '#93532a', '#8c2a22', '#6a1d17', '#56603f', '#b2b59a', '#3a5576', '#bcc4cf', '#6a4a72', '#ad9e86'],
	cover: ['#2b1810', '#3a2216', '#5e3a26', '#a3825e', '#e3cfa8', '#f3e3c0', '#c69a45', '#b06a35', '#b8382c', '#6a1c14', '#7f8a62', '#3b3a26', '#6f87a6', '#26344a', '#8a6a90', '#4f3a2a'],
	leather: ['#2b1810', '#3a2216', '#5e3a26', '#a3825e', '#e3cfa8', '#f3e3c0', '#c69a45', '#b06a35', '#b8382c', '#6a1c14', '#7f8a62', '#3b3a26', '#6f87a6', '#26344a', '#8a6a90', '#4f3a2a'],
	'manuscript-day': ['#e4dccb', '#d6ccb8', '#9c8f7a', '#706556', '#241c17', '#100b08', '#7d6232', '#93532a', '#8c2a22', '#6a1d17', '#56603f', '#b2b59a', '#3a5576', '#bcc4cf', '#6a4a72', '#ad9e86'],
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
export const setExtra = (f: typeof extra, shown: () => boolean = () => true) => { extra = f; extraShown = shown; };
let extraShown: () => boolean = () => false;
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
	// On a leaf of the book a button is an entry written on the page: its words in ink (the main one
	// in red), its numeral or first letter on a red plate, a flourish at each end and a dotted rule
	// under it, so it reads as writing and still shows where to tap.
	if (paletteKey() === 'folio') {
		const ink = st === 'primary' ? 8 : st === 'quiet' || st === 'off' ? 3 : 5;
		const label = [...b.label].slice(0, Math.max(1, w - 6)).join('');
		const lx = x + Math.floor((w - [...label].length) / 2);
		g.text(lx, y + 1, label, ink);
		const numeral = label.match(/^[IVXLC]+(?=\.)/)?.[0];
		if (st !== 'off') for (let k = 0; k < (numeral?.length ?? (/\p{L}/u.test(label[0]) ? 1 : 0)); k++) g.set(lx + k, y + 1, label[k], 0, 8);
		if (st !== 'quiet' && st !== 'off') { g.text(x + 1, y + 1, '~', 6); g.text(x + w - 2, y + 1, '~', 6); }
		for (let i = x + 2; i < x + w - 2; i += 2) g.set(i, y + 2, '.', st === 'primary' ? 8 : 2);
		if (!b.disabled) c.hit({ x, y, w, h: 3 }, b.act);
		return;
	}
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
	// A leading Roman numeral ("III. The village") is marked whole; otherwise the first letter.
	const numeral = label.match(/^[IVXLC]+(?=\.)/)?.[0];
	if (numeral) {
		// On the red plate of a main button the numeral takes a brass plate instead.
		for (let k = 0; k < numeral.length; k++) {
			if (st === 'primary') g.set(lx + k, y + 1, numeral[k], 0, 6);
			else if (st === 'normal') initial(g, lx + k, y + 1, numeral[k]);
			else g.set(lx + k, y + 1, numeral[k], cap, bg);
		}
	} else if (label && /\p{L}/u.test(label[0])) { if (st === 'normal') initial(g, lx, y + 1, label[0]); else g.set(lx, y + 1, label[0], cap, bg); }
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

/**
 * The logo as pixels: art/logo.png when the build found one (any size, any colours, transparent
 * pixels left empty; edit it in any pixel editor), else the drawing above. Each colour gets a
 * glyph of its own, from dark to light.
 */
declare const __LOGO__: { w: number; h: number; px: (string | null)[][] } | undefined;
let logoMemo: { w: number; h: number; px: (number[] | null)[][]; glyph: (rgb: number[]) => string } | null = null;
function logo() {
	if (logoMemo) return logoMemo;
	const hex = (s: string) => [1, 3, 5].map((k) => parseInt(s.slice(k, k + 2), 16));
	const src = typeof __LOGO__ !== 'undefined' && __LOGO__ ? __LOGO__ : null;
	const px: (number[] | null)[][] = src
		? src.px.map((r) => r.map((c) => (c ? hex(c) : null)))
		: LOGO.map((ln) => [...ln].map((k) => LOGO_INK[k][0]));
	const colours = [...new Set(px.flat().filter(Boolean).map((c) => c!.join(',')))].sort((a, b) => {
		const l = (s: string) => s.split(',').map(Number).reduce((k, v, i) => k + v * [0.3, 0.59, 0.11][i], 0);
		return l(a) - l(b);
	});
	const GLYPHS = ['#', '-', '=', ':', '+', '~', '*', '|', '%', 'o', ' '];
	const builtIn = !src ? new Map(Object.values(LOGO_INK).map(([rgb, gl]) => [rgb.join(','), gl])) : null;
	const glyph = (rgb: number[]) => builtIn?.get(rgb.join(',')) ?? GLYPHS[Math.min(GLYPHS.length - 1, colours.indexOf(rgb.join(',')))] ?? '+';
	logoMemo = { w: src?.w ?? 16, h: src?.h ?? 16, px, glyph };
	return logoMemo;
}

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

/**
 * The title's own face: narrow, single-stemmed letters with their corners cut on the slant,
 * as a scribe's pen cuts them. # is a stroke; / and \\ are the cut corners.
 */
const TITLE_FACE: Record<string, string[]> = {
	G: ['/###\\', '#....', '#..##', '#...#', '\\###/'], R: ['###\\.', '#..#.', '###/.', '#.\\..', '#..\\#'],
	I: ['/#\\', '.#.', '.#.', '.#.', '\\#/'], M: ['#\\./#', '##.##', '#.#.#', '#...#', '#...#'],
	O: ['/###\\', '#...#', '#...#', '#...#', '\\###/'], E: ['####', '#...', '###.', '#...', '####']
};

function lettering(g: Grid, x0: number, y: number, word: string, face = LETTERS) {
	let x = x0;
	[...word.toUpperCase()].forEach((ch, k) => {
		const art = face[ch] ?? LETTERS[ch];
		if (!art) { x += 3; return; }
		// The first letter is rubricated, the rest in ink; each stroke a filled cell with its own glyph,
		// a cut corner a stroke cell with the slant cut through it in the page's ground.
		const [bg, fg, gl] = k === 0 ? [8, 9, '%'] : [4, 3, ':'];
		art.forEach((ln, j) => [...ln].forEach((p, i) => {
			if (p === '#') g.set(x + i, y + j, gl, fg, bg);
			else if (p === '/' || p === '\\') g.set(x + i, y + j, p, 0, bg);
		}));
		x += art[0].length + 1;
	});
}
export const letteringWidth = (word: string, face = LETTERS) => [...word.toUpperCase()].reduce((a, ch) => a + ((face[ch] ?? LETTERS[ch])?.[0].length ?? 2) + 1, -1);

/** A word lettered large (five rows), centred; null when it will not fit in `width` or has letters the face lacks. */
export function letteredRow(word: string, width: number): Row | null {
	if (!/^[A-Za-z ]+$/.test(word) || letteringWidth(word) > width) return null;
	return blockRow(5, (c) => lettering(c.g, c.x + Math.floor((c.w - letteringWidth(word)) / 2), c.y, word));
}

/** The head of the home page: the logo, and the book's name lettered under it. Small screens get the logo at half size. */
export function titleRow(word = 'Grimoire'): Row {
	const L = logo();
	const big = (term?.rows ?? 0) >= 44 + L.h, none = (term?.rows ?? 99) < 36;
	const h = none ? 7 : (big ? L.h + 1 : Math.ceil(L.h / 2) + 1) + 7;
	return blockRow(h, (c) => {
		let y = c.y;
		if (none) { /* a short screen: the lettered name alone */ }
		else if (big) {
			// Each pixel two cells wide, so it is square; each colour its ground and its own glyph.
			const lx = c.x + Math.floor((c.w - L.w * 2) / 2);
			for (let j = 0; j < L.h; j++) for (let i = 0; i < L.w; i++) {
				const rgb = L.px[j][i];
				if (!rgb) continue;
				const bg = quant(rgb), fg = quant(rgb.map((v) => (v > 128 ? v * 0.7 : v * 1.6 + 20))), gl = L.glyph(rgb);
				c.g.set(lx + i * 2, y + j, gl, fg, bg);
				c.g.set(lx + i * 2 + 1, y + j, gl, fg, bg);
			}
			y += L.h + 1;
		} else {
			// Half size: two pixels a cell, the upper one the glyph's ink, the lower its ground.
			const lx = c.x + Math.floor((c.w - L.w) / 2);
			for (let j = 0; j < L.h; j += 2) for (let i = 0; i < L.w; i++) {
				const top = L.px[j][i], bot = L.px[j + 1]?.[i] ?? null;
				if (top || bot) c.g.set(lx + i, y + j / 2, '▀', top ? quant(top) : 0, bot ? quant(bot) : 0);
			}
			y += Math.ceil(L.h / 2) + 1;
		}
		if (word === 'Grimoire') scriptTitle(c.g, c.x, c.w, y);
		else lettering(c.g, c.x + Math.floor((c.w - letteringWidth(word, TITLE_FACE)) / 2), y, word, TITLE_FACE);
	}, 'title');
}

/**
 * A lowercase hand, five rows: a row above for the dot of the i, four for the letters. Strokes
 * are filled cells like the capitals, so it reads at a phone's size; the slant is added as it
 * is drawn.
 */
const SCRIPT: Record<string, string[]> = {
	r: ['....', '#.##', '##..', '#...', '#...'],
	i: ['.#.', '...', '##.', '.#.', '.##'],
	m: ['.....', '##.#.', '#.#.#', '#.#.#', '#.#.#'],
	o: ['....', '.##.', '#..#', '#..#', '.##.'],
	e: ['....', '.##.', '####', '#...', '.###']
};

/**
 * The book's name as a scribe would head a page: an illuminated capital G, rubricated in its
 * brass frame, and the rest of the word running on beside it in a lowercase hand.
 */
function scriptTitle(g: Grid, x0: number, w: number, y: number) {
	const rest = [...'rimoire'];
	// The hand leans a little: its upper half sits one column to the right of its foot.
	const SLANT = 1;
	const lean = (j: number) => (j <= 2 ? SLANT : 0);
	const restW = rest.reduce((k, ch) => k + SCRIPT[ch][0].length + 1, -1) + SLANT;
	const capW = 9, total = capW + 1 + restW;
	const x = x0 + Math.max(0, Math.floor((w - total) / 2));
	// The capital: a plate of red in a brass double rule, the letter in bone with its corners cut.
	g.fill({ x, y, w: capW, h: 7 }, ' ', 4, 8);
	g.box({ x, y, w: capW, h: 7 }, 6, 8, '', 6, 'double');
	TITLE_FACE.G.forEach((ln, j) => [...ln].forEach((p, i) => {
		if (p === '#') g.set(x + 2 + i, y + 1 + j, '%', 5, 4);
		else if (p === '/' || p === '\\') g.set(x + 2 + i, y + 1 + j, p, 8, 4);
	}));
	// The hand, standing on the capital's foot, in bone with the grain of the ink in it.
	let sx = x + capW + 1;
	for (const ch of rest) {
		SCRIPT[ch].forEach((ln, j) => [...ln].forEach((p, i) => { if (p === '#') g.set(sx + i + lean(j), y + 1 + j, ':', 3, 4); }));
		sx += SCRIPT[ch][0].length + 1;
	}
	sx += SLANT - 1;
	// A hairline flourish under the word, ending in a small lozenge.
	for (let k = x + capW + 1; k < sx - 1; k++) g.set(k, y + 6, '~', 6);
	g.set(sx - 1, y + 6, '♦', 8);
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

/**
 * The corners of a panel: small gilt bosses, as on the corners of a bound book,
 * in place of the plain joins.
 */
function cornerBosses(g: Grid, x0: number, y: number, width: number) {
	g.set(x0, y, '◘', 6, 0);
	g.set(x0 + width - 1, y, '◘', 6, 0);
}

/** A rubricated initial: the letter in the page's ground on a plate of red, so it stands out on light or dark. */
export function initial(g: Grid, x: number, y: number, ch: string) {
	g.set(x, y, ch, 0, 8);
}

/** Stamp one row at (x, y); returns nothing. */
function drawRow(g: Grid, r: Row, x0: number, y: number, width: number, h: number, ink: (t: Tone | undefined) => number) {
	const ctx: Ctx = { g, x: x0, y, w: width, ink, hit: (rc, fn) => g.hit(rc, fn) };
	// On a leaf of the book there are no boxes: a heading is written in red, centred, with a
	// flourish each side, and the words below it stand on the page.
	const book = paletteKey() === 'folio';
	if (book && (r.cls === 'frame-top' || r.cls === 'frame-bot')) {
		const t = r.cls === 'frame-top' && r.segs[0] && !isButton(r.segs[0]) ? r.segs[0].t : '';
		if (t) {
			const tx = x0 + Math.floor((width - [...t].length) / 2);
			g.text(tx - 4, y, '~~ ', 6);
			g.text(tx, y, t, 8);
			g.text(tx + [...t].length + 1, y, '~~', 6);
		}
		return;
	}
	// A panel is a leaf of vellum in a gold double rule, its title rubricated on the rule between two lozenges.
	if (r.cls === 'frame-top') {
		g.set(x0, y, '╔', 6, 0);
		for (let i = 1; i < width - 1; i++) g.set(x0 + i, y, '═', 6, 0);
		g.set(x0 + width - 1, y, '╗', 6, 0);
		cornerBosses(g, x0, y, width);
		const t = r.segs[0] && !isButton(r.segs[0]) ? r.segs[0].t : '';
		if (t) {
			const tx = x0 + 2;
			g.text(tx, y, '╡ ', 6, 0);
			g.text(tx + 2, y, t, 5, 0);
			initial(g, tx + 2, y, [...t][0]);
			g.text(tx + 2 + [...t].length, y, ' ╞', 6, 0);
		}
		return;
	}
	if (r.cls === 'frame-bot') {
		g.set(x0, y, '╚', 6, 0);
		for (let i = 1; i < width - 1; i++) g.set(x0 + i, y, '═', 6, 0);
		g.set(x0 + width - 1, y, '╝', 6, 0);
		cornerBosses(g, x0, y, width);
		return;
	}
	const inPanel = !!r.cls?.includes('frame-mid') && !book;
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
	// Words beside buttons sit on the buttons' middle line, level with their labels.
	const ty = h === 3 ? y + 1 : y;
	for (const s of r.segs) {
		const w = segWidth(s);
		if (isButton(s)) drawButton(ctx, x, y, w, s);
		else {
			const text = s.data ? dynamic(s.data) ?? s.t : s.t;
			g.text(x, ty, text, ink(s.tone));
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

export interface Tab { label: string; on: boolean; act: () => void }

/**
 * A strip of book tabs standing on the page's edge, three rows tall so a
 * thumb finds them. The open tab is a rubric plate in a gold rule whose foot
 * opens into the page; the others are vellum, their first letters in red.
 */
export function tabStrip(tabs: Tab[], width = COLS): Row {
	return blockRow(3, (c) => {
		const g = c.g;
		const w = Math.min(width, c.w);
		const x0 = c.x + Math.floor((c.w - w) / 2);
		// The spare columns are shared out, so every label sits in the middle of its tab.
		const bare = tabs.reduce((k, t) => k + [...t.label].length + 2, 0);
		const padn = Math.max(0, Math.min(4, Math.floor((w - bare) / tabs.length / 2) * 2));
		const gap = tabs.length > 1 && w - bare - padn * tabs.length >= tabs.length - 1 ? 1 : 0;
		const used = bare + padn * tabs.length + gap * (tabs.length - 1);
		// The page's edge the tabs stand on.
		for (let x = x0; x < x0 + w; x++) g.set(x, c.y + 2, '═', 6, 0);
		let x = x0 + Math.max(0, Math.floor((w - used) / 2));
		for (const t of tabs) {
			const tw = [...t.label].length + padn + 2;
			const [fg, bg, edge] = t.on ? [0, 8, 6] : [5, 1, 2];
			g.fill({ x, y: c.y, w: tw, h: 2 }, ' ', fg, bg);
			g.set(x, c.y, t.on ? '╔' : '┌', edge, 0); g.set(x + tw - 1, c.y, t.on ? '╗' : '┐', edge, 0);
			for (let i = 1; i < tw - 1; i++) g.set(x + i, c.y, t.on ? '═' : '─', edge, 0);
			g.set(x, c.y + 1, t.on ? '║' : '│', edge, bg); g.set(x + tw - 1, c.y + 1, t.on ? '║' : '│', edge, bg);
			const lx = x + 1 + padn / 2;
			g.text(lx, c.y + 1, t.label, fg, bg);
			if (!t.on && /\p{L}/u.test(t.label[0])) initial(g, lx, c.y + 1, t.label[0]);
			// The open tab has no foot: it runs into the page below.
			if (t.on) { g.set(x, c.y + 2, '╝', 6, 0); g.set(x + tw - 1, c.y + 2, '╚', 6, 0); for (let i = 1; i < tw - 1; i++) g.set(x + i, c.y + 2, ' ', 0, 0); }
			else { g.set(x, c.y + 2, '╧', 2, 0); g.set(x + tw - 1, c.y + 2, '╧', 2, 0); }
			c.hit({ x, y: c.y, w: tw, h: 3 }, t.act);
			x += tw + gap;
		}
	});
}

/**
 * The way back (Home, Back, Close): always the same button, the same size, at the top left of
 * the page, so a thumb finds it in one place on every screen.
 */
export function navRow(label: string, act: () => void): Row {
	return { ...buttonBlock([btn('‹ ' + label.replace(/^[<‹]s*/, ''), act, { style: 'quiet', width: 12 })]), cls: 'nav' };
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
 * The ground under every page: soot-dark (or bone, by day) with a little grain, small
 * crosses set wide apart like nail-heads in a church door, and, low on the page where
 * nothing is written, a pentacle in its circle so faint you half see it. On a wide
 * screen the margins have a plain rule with a cross now and then.
 */
function ground(g: Grid, width: number, used = g.rows) {
	if (paletteKey() === 'cover') return; // the cover paints itself, every pixel (coverRow)
	if (paletteKey() === 'leather') return cover(g);
	if (paletteKey() === 'folio') return folio(g, width, used);
	const night = !paletteKey().endsWith('-day');
	for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) {
		const h = cellHash(x, y);
		if (h < 40) g.set(x, y, h < 14 ? "'" : h < 30 ? '.' : '`', 1, 0);
		else if (y % 4 === 1 && (x + (y % 8 === 1 ? 0 : 6)) % 12 === 3) g.set(x, y, '+', 1, 0);
	}
	// The sigil: a five-pointed star drawn point by point inside its circle.
	const sig = night ? shade(9, 3) : 2;
	const cx = g.cols / 2, cy = g.rows * 0.74, ry = Math.min(g.rows * 0.2, g.cols / 4.4), rx = ry * 2;
	const dot = (x: number, y: number, ch: string) => { const c = g.get(Math.round(x), Math.round(y)); if (c) { c.ch = ch; c.fg = sig; } };
	for (let k = 0; k < 160; k++) { const a = (k / 160) * Math.PI * 2; dot(cx + rx * Math.cos(a), cy + ry * Math.sin(a), '.'); }
	const pts = Array.from({ length: 5 }, (_, k) => { const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5; return [cx + rx * 0.95 * Math.cos(a), cy + ry * 0.95 * Math.sin(a)]; });
	for (let k = 0; k < 5; k++) {
		const [ax, ay] = pts[k], [bx, by] = pts[(k + 2) % 5];
		const n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay) * 2));
		for (let t = 0; t <= n; t++) dot(ax + ((bx - ax) * t) / n, ay + ((by - ay) * t) / n, '.');
	}
	const spare = g.cols - width;
	if (spare < 8) return;
	const x0 = Math.floor(spare / 2);
	for (const mx of [x0 - 3, x0 + width + 2]) for (let y = 0; y < g.rows; y++) g.set(mx, y, y % 10 === 4 ? '+' : '|', 2, 0);
}

/**
 * The cover of a leather-bound book: the calf's grain, two blind-tooled rules round the
 * edge (pressed in, a shade darker than the leather), brass bosses at the corners, and a
 * tooled lozenge at the middle of each side.
 */
function cover(g: Grid) {
	for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) {
		const h = cellHash(x, y);
		if (h < 60) g.set(x, y, h < 25 ? '.' : h < 45 ? ',' : "'", 1, 0);
	}
	const W = g.cols, H = g.rows;
	for (const [i, ink] of [[0, 2], [2, 1]] as const) {
		g.box({ x: i, y: i, w: W - 2 * i, h: H - 2 * i }, ink, 0, '', ink, i ? 'single' : 'double');
	}
	for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) g.set(x, y, '◘', 6, 0);
	for (const [x, y] of [[Math.floor(W / 2), 0], [Math.floor(W / 2), H - 1], [0, Math.floor(H / 2)], [W - 1, Math.floor(H / 2)]]) g.set(x, y, '♦', 6, 0);
}

/** A page of the opened book: vellum, a fine grain, and nothing else behind the words. */
declare const __MARGINS__: Record<string, { w: number; h: number; px: (string | null)[][] }> | undefined;

/** A smooth value noise, 0-1, for the vellum's mottling. */
function vnoise(x: number, y: number, seed: number): number {
	const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
	const r = (a: number, b: number) => (cellHash(a * 7 + seed * 131, b * 13 + seed) & 1023) / 1023;
	const sm = (t: number) => t * t * (3 - 2 * t);
	const top = r(xi, yi) + (r(xi + 1, yi) - r(xi, yi)) * sm(fx);
	const bot = r(xi, yi + 1) + (r(xi + 1, yi + 1) - r(xi, yi + 1)) * sm(fx);
	return top + (bot - top) * sm(fy);
}

let folioMemo: { key: string; px: Int16Array } | null = null;

/**
 * A leaf of the opened book, drawn as pixels (two to a cell, top and bottom): vellum mottled and
 * foxed, darker at its edges and in the gutter where it is sewn into the binding, the edges of
 * the leaves beneath stacked at its fore-edge, an old water stain; round the text a ruled frame
 * of gold, in the margins a painted vine with leaves and flowers, and below the writing, where the
 * page is empty, a few devils of the kind scribes drew. The words are written over all of it.
 */
function folio(g: Grid, width: number, used: number) {
	const W = g.cols, H = g.rows * 2;
	const x0 = Math.floor((W - width) / 2), x1 = x0 + width - 1;
	const yTop = 2, yBot = H - 3;
	const key = `${W}x${H}:${width}:${used}:${term?.palette.length}`;
	if (!folioMemo || folioMemo.key !== key) {
		const px = new Int16Array(W * H).fill(-1);
		const set = (x: number, y: number, rgb: number[]) => { if (x >= 0 && y >= 0 && x < W && y < H) px[x + y * W] = quant(rgb); };
		const VELLUM = [232, 221, 198];
		for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
			// Mottling, foxing, a darker rim; the gutter's shadow; the stain.
			const m = vnoise(x / 9, y / 7, 1) * 0.6 + vnoise(x / 3, y / 3, 2) * 0.4;
			const rim = Math.min(x / 6, (W - 1 - x) / 4, y / 6, (H - 1 - y) / 6, 1);
			const gutter = x < 6 ? (6 - x) / 6 : 0;
			// Inside the gold rule the vellum is kept clean for the writing; outside it is worn.
			const inText = x >= x0 && x <= x1 && y > yTop && y < yBot;
			let k = 0.95 + (m - 0.5) * (inText ? 0.03 : 0.1) - (1 - rim) * 0.18 - gutter * 0.35;
			const sx = x - W * 0.78, sy = (y - H * 0.18) * 1.2, sd = Math.hypot(sx, sy);
			if (Math.abs(sd - 9) < 0.9) k -= 0.1; else if (sd < 9) k -= 0.03;
			let rgb = VELLUM.map((v, i) => v * k - (i === 2 ? (1 - k) * 30 : 0));
			if ((cellHash(x * 3, y * 5) & 1023) < (inText ? 0 : 6)) rgb = [176, 140, 100]; // foxing, never on the writing
			set(x, y, rgb);
		}
		// Sewing: stitches down the gutter; the edges of the leaves beneath at the fore-edge and foot.
		for (let y = 6; y < H - 6; y += 7) set(1, y, [70, 48, 30]);
		for (let y = 0; y < H; y++) for (const d of [1, 2]) set(W - d, y, d === 1 ? [180, 160, 128] : [205, 190, 160]);
		for (let x = 0; x < W; x++) set(x, H - 1, [180, 160, 128]);
		// The text's frame: a ruled line of gold.
		const gold = [176, 136, 62];
		for (let x = x0 - 1; x <= x1 + 1; x++) { set(x, yTop, gold); set(x, yBot, gold); }
		for (let y = yTop; y <= yBot; y++) { set(x0 - 1, y, gold); set(x1 + 1, y, gold); }
		// The vine in each side margin: a stem that sways, leaves on it, a flower every so often.
		const FLOWERS = [[178, 52, 40], [104, 70, 120], [70, 96, 150]];
		for (const side of [0, 1]) {
			const mx = side ? x1 + 3 : 3;
			if (side ? mx > W - 3 : mx > x0 - 2) continue;
			for (let y = yTop + 2; y < yBot - 1; y++) {
				const x = mx + Math.round(Math.sin(y / 5 + side) * 0.9);
				set(x, y, [90, 110, 60]);
				if (y % 6 === 0) set(x + (side ? -1 : 1), y - 1, [110, 140, 70]);
				if (y % 6 === 3) set(x - (side ? -1 : 1), y - 1, [110, 140, 70]);
				if (y % 23 === 11) {
					const c = FLOWERS[(y + side) % FLOWERS.length];
					for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) set(x + dx, y + dy, dx || dy ? c : [212, 170, 70]);
				}
			}
		}
		// Devils at the foot of the page, if the writing leaves room for them.
		const M = typeof __MARGINS__ !== 'undefined' && __MARGINS__ ? Object.values(__MARGINS__) : [];
		const free = yBot - (used * 2 + 2);
		if (M.length && free >= 14) {
			// As many as fit across the text's width, tallest first.
			const pick: typeof M = [];
			let used2 = 0;
			for (const m of [...M].sort((a, b) => b.h - a.h)) if (m.h <= free - 2 && used2 + m.w + (pick.length ? 4 : 0) <= width) { pick.push(m); used2 += m.w + (pick.length > 1 ? 4 : 0); }
			const span = pick.reduce((k, m) => k + m.w, 0);
			let x = x0 + Math.max(0, Math.floor((width - span - (pick.length - 1) * 4) / 2));
			for (const m of pick) {
				const top = yBot - 2 - m.h;
				m.px.forEach((row, j) => row.forEach((c, i) => { if (c) set(x + i, top + j, [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16))); }));
				x += m.w + 4;
			}
			// The ground they stand on: a tendril of the vine.
			for (let xx = x0 + 2; xx < x1 - 1; xx++) set(xx, yBot - 2 + Math.round(Math.sin(xx / 3) * 0.6), [90, 110, 60]);
		}
		folioMemo = { key, px };
	}
	const px = folioMemo.px;
	for (let cy = 0; cy < g.rows; cy++) for (let x = 0; x < W; x++) {
		const t = px[x + cy * 2 * W], b = px[x + (cy * 2 + 1) * W];
		if (t === b) g.set(x, cy, ' ', 4, t);
		else g.set(x, cy, '▀', t, b);
	}
}

// ---- the cover --------------------------------------------------------------------------------

declare const __TITLE__: { w: number; h: number; a: number[][] } | undefined;

/**
 * Paint pixels as cells, two to a cell top and bottom (upper half block): `at(px, py)` gives a
 * pixel's ink, or null for none (the leather shows).
 */
function pixels(g: Grid, x0: number, y0: number, w: number, h: number, at: (px: number, py: number) => number | null) {
	for (let py = 0; py < h; py += 2) for (let px = 0; px < w; px++) {
		const top = at(px, py), bot = py + 1 < h ? at(px, py + 1) : null;
		if (top === null && bot === null) continue;
		const cx = x0 + px, cy = y0 + py / 2;
		if (top === bot) g.set(cx, cy, ' ', 0, top!);
		else g.set(cx, cy, top === null ? '▄' : '▀', top ?? bot!, top === null ? 0 : bot ?? 0);
	}
}

/**
 * The cover: the logo, and under it the name in black-letter, gilt and pressed into the calf
 * (a shadow below and right of each stroke), with blood on some of the letters and a few drips
 * from them, and old stains on the leather. A tap anywhere opens the book.
 */
export function coverRow(open: () => void): Row {
	return blockRow(term?.rows ?? 40, (c) => {
		const g = c.g, W = g.cols, H = g.rows;
		const L = logo();
		const T = typeof __TITLE__ !== 'undefined' && __TITLE__ ? __TITLE__ : null;
		const tw = T?.w ?? 0, th = T?.h ?? 0;
		// The logo as large as fits: S pixels to its pixel.
		// The cover carries the title alone; the logo waits for a better place.
		const S = 0;
		const logoRows = Math.ceil((L.h * S) / 2), titleRows = Math.ceil((th + 6) / 2);
		let y = Math.max(2, Math.floor((H - titleRows - 4) / 2) - 3);
		const lx = Math.floor((W - L.w * S) / 2);
		void lx; void logoRows;
		// The leather itself, pixel by pixel: mottled calf, rubbed paler at its edges, two rules
		// blind-tooled into it, brass fittings at the corners, and old stains soaked in.
		pixels(g, 0, 0, W, H * 2, (px, py) => {
			const HH = H * 2;
			const m = vnoise(px / 7, py / 5, 3) * 0.6 + vnoise(px / 2, py / 2, 4) * 0.4;
			const edge = Math.min(px, W - 1 - px, py, HH - 1 - py);
			let rgb = [74, 42, 27].map((v) => v * (0.9 + m * 0.18 + (edge < 3 ? 0.25 : 0)));
			for (const ins of [5, 8]) if ((edge === ins) && !(px < 14 && py < 14) && !(px > W - 15 && py < 14) && !(px < 14 && py > HH - 15) && !(px > W - 15 && py > HH - 15)) rgb = [44, 24, 15];
			const cx = Math.min(px, W - 1 - px), cy = Math.min(py, HH - 1 - py);
			if (cx < 12 && cy < 12 && cx + cy < 16 && (cx < 3 || cy < 3 || cx + cy > 12)) rgb = (cx + cy) % 3 ? [176, 136, 62] : [120, 90, 40];
			const st = vnoise(px / 6, py / 4, 9) + vnoise(px / 2, py / 2, 10) * 0.25;
			if (py > HH * 0.6 && st > 0.95) rgb = [58, 18, 12];
			else if (st > 1.16) rgb = [64, 30, 18];
			return quant(rgb);
		});
		if (T) {
			const tx = Math.floor((W - tw) / 2);
			// Blood: on the strokes of some letters (a wash from the right), and drips from their feet.
			const bloody = (px: number, py: number) => ((cellHash(px >> 2, py >> 2) & 1023) < 230 + px * 4) && px > tw * 0.45;
			const drips = new Map<number, number>();
			for (const [f, len] of [[0.58, 5], [0.72, 3], [0.9, 6]] as const) {
				const px = Math.floor(tw * f);
				let foot = -1;
				for (let py = th - 1; py >= 0; py--) if (T.a[py][px] > 140) { foot = py; break; }
				if (foot >= 0) drips.set(px, foot + len);
			}
			const at = (px: number, py: number): number | null => {
				const a = py < th && px < tw ? T.a[py][px] : 0;
				if (a > 70) {
					if (bloody(px, py)) return a > 180 ? 8 : 9;
					return a > 200 ? 5 : a > 130 ? 6 : shade(6, 2);
				}
				// The carving: the cut's shadow below and to the right of a stroke.
				const up = py > 0 && px > 0 && py - 1 < th && px - 1 < tw ? T.a[py - 1][px - 1] : 0;
				if (up > 140) return shade(15, 0);
				const d = drips.get(px);
				if (d !== undefined && py >= th - 4 && py <= d) return py >= d - 1 ? 9 : 8;
				return null;
			};
			pixels(g, tx, y, tw, th + 8, at);
			y += titleRows + 1;
		}
		const hint = '-  tap to open the book  -';
		g.text(Math.floor((W - hint.length) / 2), Math.min(H - 3, y + 1), hint, 3);
		c.hit({ x: 0, y: 0, w: W, h: H }, open);
	});
}

/**
 * The opening of the page: the G of the title as an illuminated initial (red on a blue field
 * pricked with white, in a square of gold), and the first words written beside it.
 */
export function illuminatedRow(lines: { t: string; tone?: Tone }[]): Row {
	const BOX = 22, ROWS = 11;
	return blockRow(Math.max(ROWS, lines.length), (c) => {
		const g = c.g, T = typeof __TITLE__ !== 'undefined' && __TITLE__ ? __TITLE__ : null;
		const px: (number | null)[][] = Array.from({ length: ROWS * 2 }, () => Array(BOX).fill(null));
		for (let y = 0; y < ROWS * 2; y++) for (let x = 0; x < BOX; x++) {
			const edge = x < 2 || y < 2 || x >= BOX - 2 || y >= ROWS * 2 - 2;
			px[y][x] = quant(edge ? [190, 150, 70] : (x + y * 3) % 7 === 0 ? [220, 225, 235] : [46, 66, 128]);
		}
		if (T) {
			// The G: the first letter of the title's bitmap, from its left edge to the first empty column.
			let gw = 0;
			// The letters touch, so the G ends at the column with the least ink between its bowl and the r.
			let least = Infinity;
			for (let x = 12; x < Math.min(T.w, 26); x++) { const ink = T.a.reduce((k, r) => k + r[x], 0); if (ink < least) { least = ink; gw = x; } }
			const ox = Math.floor((BOX - gw) / 2), oy = Math.floor((ROWS * 2 - T.h) / 2);
			for (let y = 0; y < T.h; y++) for (let x = 0; x < gw; x++) {
				const a = T.a[y][x];
				if (a > 70 && px[oy + y]) px[oy + y][ox + x] = quant(a > 180 ? [168, 40, 52] : [210, 120, 110]);
			}
		}
		for (let y = 0; y < ROWS * 2; y += 2) for (let x = 0; x < BOX; x++) {
			const t = px[y][x]!, b = px[y + 1][x]!;
			g.set(c.x + x, c.y + y / 2, t === b ? ' ' : '▀', t, b);
		}
		lines.forEach((l, j) => g.text(c.x + BOX + 2, c.y + 1 + j, l.t, c.ink(l.tone)));
	});
}

function frame(g: Grid) {
	// The town is lit for the dark: over it, the pages take their night inks.
	const key = extra && extraShown() ? paletteKey().replace('-day', '-night') : paletteKey();
	term!.palette = PALETTES[key] ?? PALETTES['manuscript-night'];
	// The cover wants a margin of leather round its page: a few more columns (a touch smaller type).
	// The cover is a picture, drawn fine: many more columns (small cells, two pixels each).
	term!.setCols(key === 'cover' ? 84 : key === 'folio' ? COLS + 12 : key === 'leather' ? COLS + 6 : COLS);
	document.body.style.background = term!.palette[0];
	document.documentElement.style.background = term!.palette[0];
	g.clear(4, 0);
	const top = [...order].reverse().map((k) => layers.get(k)).find((L) => L && L.rows.length);
	if (top) ground(g, top.width, Math.min(g.rows, top.rows.reduce((k, r) => k + lineH(r), 0)));
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
		// Enough rows that a page holds a whole screen of the grimoire on a desktop too.
		rows: 40,
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
