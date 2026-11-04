/**
 * appicon.ts - the home-screen icon, designed in the app.
 *
 * An icon is a small spec (a symbol and four colours) drawn in the book's own pixel manner: dark
 * ground, a framed leaf, the symbol in ink. `renderIcon` is pure, so the build (build.mjs) draws the
 * default icon files with it and the page draws the Storyteller's design and its previews with it.
 *
 * A design is kept in this browser (localStorage) and applied at runtime to the page's favicon, its
 * apple-touch-icon and its web manifest. What a platform does with it afterwards is its own business:
 * an icon already on a home screen or installed as an app is fixed when it is added, so the new one
 * shows only after it is added again (see README, "The app icon").
 *
 * Nothing here knows about the game.
 */

export type IconSymbol = 'g' | 'tower' | 'moon' | 'sun' | 'star' | 'token';

export interface IconSpec {
	symbol: IconSymbol;
	/** The ground outside the frame, the leaf inside it, the frame, and the symbol's ink: '#rrggbb'. */
	bg: string;
	leaf: string;
	frame: string;
	ink: string;
	/** A character token's capital letter, and the character it came from (for the designer to show). */
	letter?: string;
	character?: string;
}

/** The icon the app has always had: a rubric G, an illuminated capital, on dark vellum in a gold frame. */
export const DEFAULT_ICON: IconSpec = { symbol: 'g', bg: '#16110c', leaf: '#221a12', frame: '#d4a73a', ink: '#c8412f' };

export const ICON_KEY = 'grimoire.icon';

// ---- the symbols ---------------------------------------------------------------------------
// Rows of cells: '#' ink, 'o' the frame's colour, 'L' the leaf's (cut out of something), '.' nothing.

const FONT: Record<string, string[]> = {
	A: ['.###.', '#...#', '#####', '#...#', '#...#'], B: ['####.', '#...#', '####.', '#...#', '####.'],
	C: ['.####', '#....', '#....', '#....', '.####'], D: ['####.', '#...#', '#...#', '#...#', '####.'],
	E: ['#####', '#....', '###..', '#....', '#####'], F: ['#####', '#....', '###..', '#....', '#....'],
	G: ['.####', '#....', '#.###', '#...#', '.###.'], H: ['#...#', '#...#', '#####', '#...#', '#...#'],
	I: ['#####', '..#..', '..#..', '..#..', '#####'], J: ['..###', '...#.', '...#.', '#..#.', '.##..'],
	K: ['#...#', '#..#.', '###..', '#..#.', '#...#'], L: ['#....', '#....', '#....', '#....', '#####'],
	M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#...#', '##..#', '#.#.#', '#..##', '#...#'],
	O: ['.###.', '#...#', '#...#', '#...#', '.###.'], P: ['####.', '#...#', '####.', '#....', '#....'],
	Q: ['.###.', '#...#', '#.#.#', '#..#.', '.##.#'], R: ['####.', '#...#', '####.', '#..#.', '#...#'],
	S: ['.####', '#....', '.###.', '....#', '####.'], T: ['#####', '..#..', '..#..', '..#..', '..#..'],
	U: ['#...#', '#...#', '#...#', '#...#', '.###.'], V: ['#...#', '#...#', '#...#', '.#.#.', '..#..'],
	W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], X: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
	Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..'], Z: ['#####', '...#.', '..#..', '.#...', '#####']
};

const shape = (n: number, f: (x: number, y: number) => string): string[] =>
	Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => f(x, y)).join(''));
const dist = (x: number, y: number, cx: number, cy: number) => Math.hypot(x - cx, y - cy);

const TOWER = [
	'....#....', '...###...', '..#####..', '.#######.', '..#####..', '..#ooo#..', '..#o#o#..',
	'..#ooo#..', '..#####..', '..#####..', '..#####..', '.#######.', '#########'
];
const STAR = [
	'.....#.....', '.....#.....', '....###....', '....###....', '###########', '.#########.',
	'..#######..', '...#####...', '..#######..', '..###.###..', '.###...###.'
];
const MOON = shape(11, (x, y) => (dist(x, y, 5, 5) <= 5.2 && dist(x, y, 7.4, 4) > 4.3 ? '#' : '.'));
const SUN = shape(11, (x, y) => {
	if (dist(x, y, 5, 5) <= 3.3) return dist(x, y, 5, 5) <= 2.2 ? 'o' : '#';
	const dx = Math.abs(x - 5), dy = Math.abs(y - 5);
	return (dx === 0 && dy >= 4) || (dy === 0 && dx >= 4) || (dx === dy && dx >= 3 && dx <= 4) ? '#' : '.';
});

/** A character's token: a round of ink edged in the frame's colour, the capital cut out of it. */
export function tokenRows(letter: string): string[] {
	const g = FONT[letter] ?? FONT.A;
	return shape(11, (x, y) => {
		const d = dist(x, y, 5, 5);
		if (d > 5.4) return '.';
		const gx = x - 3, gy = y - 3;
		if (gx >= 0 && gx < 5 && gy >= 0 && gy < 5 && g[gy][gx] === '#') return 'L';
		return d > 4.3 ? 'o' : '#';
	});
}

export const SYMBOLS: { id: IconSymbol; name: string }[] = [
	{ id: 'g', name: 'Capital G' }, { id: 'tower', name: 'Clocktower' }, { id: 'moon', name: 'Moon' },
	{ id: 'sun', name: 'Sun' }, { id: 'star', name: 'Star' }, { id: 'token', name: 'A character' }
];

export function symbolRows(spec: IconSpec): string[] {
	switch (spec.symbol) {
		case 'tower': return TOWER;
		case 'moon': return MOON;
		case 'sun': return SUN;
		case 'star': return STAR;
		case 'token': return tokenRows(spec.letter ?? 'A');
		default: return FONT.G;
	}
}

// ---- drawing -----------------------------------------------------------------------------

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)) as Rgb;

/**
 * The icon as RGBA bytes, `size` pixels square. The framed leaf takes 72% of the square (inside the
 * safe zone a round or rounded mask leaves), the symbol standing in it at a whole number of pixels
 * to a cell so its edges stay crisp.
 */
export function renderIcon(spec: IconSpec, size: number): { w: number; h: number; rgba: Uint8Array } {
	const rgba = new Uint8Array(size * size * 4);
	const put = (x: number, y: number, c: Rgb) => { rgba.set([c[0], c[1], c[2], 255], (y * size + x) * 4); };
	const [bg, leaf, frame, ink] = [spec.bg, spec.leaf, spec.frame, spec.ink].map(rgb);
	for (let i = 0; i < size * size; i++) put(i % size, Math.floor(i / size), bg);
	const sq = Math.floor(size * 0.72), x0 = Math.floor((size - sq) / 2), edge = Math.max(1, Math.round(size / 48));
	for (let y = 0; y < sq; y++) for (let x = 0; x < sq; x++) {
		put(x0 + x, x0 + y, x < edge || y < edge || x >= sq - edge || y >= sq - edge ? frame : leaf);
	}
	const rows = symbolRows(spec), w = rows[0].length, h = rows.length;
	const colour: Record<string, Rgb> = { '#': ink, o: frame, L: leaf };
	const m = Math.max(w, h), k = Math.floor(sq / (m + 2));
	if (k >= 1) {
		const gx = x0 + Math.floor((sq - w * k) / 2), gy = x0 + Math.floor((sq - h * k) / 2);
		rows.forEach((line, y) => [...line].forEach((ch, x) => {
			const c = colour[ch];
			if (!c) return;
			for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) put(gx + x * k + dx, gy + y * k + dy, c);
		}));
	} else {
		// (too small for a whole pixel to a cell: the symbol is sampled to fit inside the frame)
		const room = Math.max(1, sq - 2 * edge), cell = room / m, ox = x0 + edge + Math.floor((room - w * cell) / 2), oy = x0 + edge + Math.floor((room - h * cell) / 2);
		for (let y = 0; y < room; y++) for (let x = 0; x < room; x++) {
			const c = colour[rows[Math.floor((y - (oy - x0 - edge)) / cell)]?.[Math.floor((x - (ox - x0 - edge)) / cell)]];
			if (c && x - (ox - x0 - edge) >= 0 && y - (oy - x0 - edge) >= 0) put(x0 + edge + x, x0 + edge + y, c);
		}
	}
	return { w: size, h: size, rgba };
}

// ---- keeping a design ------------------------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/i;

/** A spec from whatever was stored: anything wrong falls back, field by field, to the default icon. */
export function normalise(raw: unknown): IconSpec {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const hex = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d);
	const symbol = SYMBOLS.some((s) => s.id === r.symbol) ? (r.symbol as IconSymbol) : DEFAULT_ICON.symbol;
	const spec: IconSpec = { symbol, bg: hex(r.bg, DEFAULT_ICON.bg), leaf: hex(r.leaf, DEFAULT_ICON.leaf), frame: hex(r.frame, DEFAULT_ICON.frame), ink: hex(r.ink, DEFAULT_ICON.ink) };
	if (symbol === 'token') {
		spec.letter = typeof r.letter === 'string' && /^[A-Za-z]$/.test(r.letter) ? r.letter.toUpperCase() : 'A';
		if (typeof r.character === 'string') spec.character = r.character.slice(0, 40);
	}
	return spec;
}

export const sameIcon = (a: IconSpec, b: IconSpec) => JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));

export interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; }
const browserStore = (): Store | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

/** The Storyteller's design, or null if they have made none (the page then keeps the files it ships with). */
export function loadIcon(store: Store | null = browserStore()): IconSpec | null {
	try {
		const raw = store?.getItem(ICON_KEY);
		return raw ? normalise(JSON.parse(raw)) : null;
	} catch { return null; }
}

/** Keep a design; null (or the default) forgets it, back to the shipped icon. */
export function saveIcon(spec: IconSpec | null, store: Store | null = browserStore()) {
	try {
		if (!spec || sameIcon(spec, DEFAULT_ICON)) store?.removeItem(ICON_KEY);
		else store?.setItem(ICON_KEY, JSON.stringify(normalise(spec)));
	} catch { /* storage blocked: the design lasts until the page is closed */ }
}

// ---- applying it -------------------------------------------------------------------------

/** The web manifest for a design: the app as shipped, with the icons given (and absolute addresses, as a blob has no home to resolve against). */
export function manifestFor(icons: { src192: string; src512: string }, base: string) {
	const home = new URL('./', base).href;
	return {
		name: 'Grimoire',
		short_name: 'Grimoire',
		description: 'A Storyteller companion for Blood on the Clocktower',
		start_url: home,
		scope: home,
		display: 'standalone',
		orientation: 'portrait',
		background_color: '#16110c',
		theme_color: '#16110c',
		icons: [
			{ src: icons.src192, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
			{ src: icons.src512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
		]
	};
}

/** The least of a document that applying an icon needs (so it can be tried without a browser). */
export interface IconDoc {
	querySelector(sel: string): { setAttribute(k: string, v: string): void } | null;
}

/** What the page ships with, put back when a design is dropped. */
export const SHIPPED = { manifest: 'manifest.webmanifest', icon: 'icon-192.png' };

/**
 * Point the page's favicon, apple-touch-icon and manifest at a design (or, with null, back at the files
 * it ships with). `png(size)` gives a data URL of the icon; `blob(json)` a URL for the manifest.
 */
export function applyIcon(doc: IconDoc, spec: IconSpec | null, png: (size: number) => string, blob: (json: string) => string, base: string): boolean {
	const set = (sel: string, href: string) => doc.querySelector(sel)?.setAttribute('href', href);
	if (!spec) {
		set('link[rel="manifest"]', SHIPPED.manifest);
		set('link[rel="icon"]', SHIPPED.icon);
		set('link[rel="apple-touch-icon"]', SHIPPED.icon);
		return false;
	}
	// (iOS draws its own corners and wants 180 px; the manifest gets 192 and 512)
	set('link[rel="icon"]', png(192));
	set('link[rel="apple-touch-icon"]', png(180));
	set('link[rel="manifest"]', blob(JSON.stringify(manifestFor({ src192: png(192), src512: png(512) }, base))));
	return true;
}

/** A data URL (PNG) of the icon, drawn on a canvas; only in a browser. */
export function iconDataUrl(spec: IconSpec, size: number): string {
	const { rgba } = renderIcon(spec, size);
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), size, size), 0, 0);
	return canvas.toDataURL('image/png');
}

let manifestUrl = '';
/** Apply a design (by default the saved one) to this page; null puts the shipped files back. */
export function applySaved(spec: IconSpec | null = loadIcon()): boolean {
	try {
		return applyIcon(document, spec, (n) => iconDataUrl(spec!, n), (json) => {
			if (manifestUrl) URL.revokeObjectURL(manifestUrl);
			return (manifestUrl = URL.createObjectURL(new Blob([json], { type: 'application/manifest+json' })));
		}, location.href);
	} catch { return false; }
}
