/**
 * camwin.ts - an experiment (grim-017): a small floating window in the village, drawn in the terminal's
 * own cells, that holds camera tiles. By default it shows the people close to you, by the same rule as
 * voices (map.ts loudness): whoever you can hear, you see. So in the circle everyone, at night only you
 * (and the Storyteller, in the room they visit), in a private word just the two of you.
 *
 * Nothing here sends a picture anywhere, and nothing receives one. A tile is one of:
 *   your camera   on this phone only, and only after you turn it on (it starts off, every time)
 *   a stand-in    a drawn face made on this phone (the test villagers; or everyone, to try it alone)
 *   your letter   you, with your camera off
 *   their letter  anyone else: this phone has no picture of them (there is no streaming)
 * A live tile is drawn either as letters in the cells (faces.ts's two-samples-a-cell glyph trick, at the
 * tile's size) or as a picture: a <canvas> laid exactly over the tile's cells, which are left blank
 * (VIDEO_CH on VIDEO_BG) so the canvas can tell whether anything has since been drawn over them.
 *
 * The window docks in a corner of the map; tap its title to move it round the corners, [-] to fold it
 * to its title, [x] to close it (which turns your camera off).
 */
import { shade } from '../term/pterm.ts';
import type { Grid, Rect, Term } from '../term/pterm.ts';
import { cellOf, crop } from './faces.ts';
import type { RigCell } from '../avatar/rig.ts';

/**
 * Where the window sits: a corner over the map, or a bar across the whole page at the top or the bottom (a
 * sub-terminal of its own: the map gives up those rows rather than being covered).
 */
export type Corner = 'tr' | 'br' | 'bl' | 'tl' | 'top' | 'bottom' | 'side';
/** The places in the order a tap on the title moves the window round them. */
export const CORNERS: Corner[] = ['tr', 'br', 'bl', 'tl', 'top', 'bottom'];
export const CORNER_NAME: Record<Corner, string> = { tr: 'top right', br: 'bottom right', bl: 'bottom left', tl: 'top left', top: 'bar at the top', bottom: 'bar at the bottom', side: 'down the side' };

/**
 * Where the camera window goes (16 Nov, standardised): at the edge of the screen, never over the middle of
 * the map. Auto: down the right-hand side on a wide screen (a desktop has room to spare at the sides), a
 * bar across the top on a phone. Or chosen: the side, the top, the bottom.
 */
export type Place = 'auto' | 'side' | 'top' | 'bottom';
export const PLACES: Place[] = ['auto', 'side', 'top', 'bottom'];
export const PLACE_NAME: Record<Place, string> = { auto: 'auto (side on a wide screen, top on a phone)', side: 'down the side', top: 'bar at the top', bottom: 'bar at the bottom' };
/** The place in a word, for a button. */
export const PLACE_SHORT: Record<Place, string> = { auto: 'auto', side: 'side', top: 'top', bottom: 'bottom' };
export const nextPlace = (p: Place): Place => PLACES[(PLACES.indexOf(p) + 1) % PLACES.length];
/** Columns wide enough for a side column and still a good map (a desktop or a tablet held wide). */
export const SIDE_FROM_COLS = 90;
/** Where a place puts the window on a screen this wide (a phone's split grid always takes a bar). */
export function resolvePlace(p: Place, cols: number, split: boolean): 'side' | 'top' | 'bottom' {
	if (p === 'auto') return split || cols < SIDE_FROM_COLS ? 'top' : 'side';
	if (p === 'side' && split) return 'top';
	return p;
}
/**
 * Whether the window takes a strip of the screen (a column the map gives up, or a bar of rows) or sits small
 * in a corner over the map: a strip only when its faces fill most of it, so one face is never a long empty band.
 * Returns where to lay the window out, and which strip (if any) to take.
 */
export function stripFor(place: 'side' | 'top' | 'bottom', n: number, tile: { tw: number; th: number }, cols: number, rows: number): { corner: Corner; side: boolean; bar: boolean } {
	if (place === 'side') return { corner: 'side', side: n * (tile.th + 1) + 2 >= rows * 0.5, bar: false };
	const bar = n * (tile.tw + 1) + 1 >= cols * 0.6;
	return { corner: bar ? place : place === 'top' ? 'tr' : 'br', side: false, bar };
}

/** A side column's width: a tile and its frame. */
export const sideWidth = (tile = AVATAR_TILE) => tile.tw + 2;
export const isBar = (c: Corner) => c === 'top' || c === 'bottom';
/** A bar's height in rows on a screen this wide: its frame, a row of tiles and their names (folded, its title). */
export const barHeight = (cols: number, folded: boolean, tile = tileSize(cols)) => (folded ? 1 : tile.th + 3);
/**
 * An avatar's tile: the middle face's own size (rig.ts DETAIL_SIZE[2]), the letter tile with a face round
 * the letter (Lavender, 16 Nov: the full avatar is not needed, and smaller is better on a PC).
 */
export const AVATAR_TILE = { tw: 10, th: 5 };
export const nextCorner = (c: Corner): Corner => CORNERS[(CORNERS.indexOf(c) + 1) % CORNERS.length];

/** A blank cell under a picture: a no-break space on its own ground, so the picture knows it is uncovered. */
export const VIDEO_CH = ' ';
export const VIDEO_BG = shade(3, 0);

/** A tile's size in cells: square on the screen, as a cell is twice as tall as it is wide. */
export function tileSize(cols: number): { tw: number; th: number } {
	const tw = cols >= 60 ? 16 : 12;
	return { tw, th: tw / 2 };
}

export interface CamLayout {
	/** The whole window, frame included. */
	rect: Rect;
	/** Each tile's picture (its name goes on the row under it). None while folded. */
	tiles: Rect[];
	/** How many tiles the window could hold here. */
	cap: number;
}

/**
 * The window for `n` people in a corner of `area` (the map): up to two tiles across (three on a wide
 * screen) and two down, never more than seven tenths of the map's height. Smaller tiles on a small map;
 * null when not even one fits. Folded, it is its title row alone.
 */
export function camLayout(area: Rect, n: number, corner: Corner, folded = false, tile?: { tw: number; th: number }): CamLayout | null {
	let { tw, th } = tile ?? tileSize(area.w);
	const small = !!tile && tile.tw <= 10;
	if (corner === 'side') {
		// A column down the side: tiles one under another, as many as fit, the window as tall as they need.
		if (tw + 2 > area.w || th + 3 > area.h) return null;
		const cap = Math.max(1, Math.floor((area.h - 2) / (th + 1)));
		const k = Math.max(1, Math.min(n, cap));
		const tiles: Rect[] = [];
		if (!folded) for (let i = 0; i < k; i++) tiles.push({ x: area.x + 1, y: area.y + 1 + i * (th + 1), w: tw, h: th });
		return { rect: { x: area.x, y: area.y, w: tw + 2, h: folded ? 1 : k * (th + 1) + 2 }, tiles, cap };
	}
	if (isBar(corner)) {
		// A bar: the whole strip it is given, one row of tiles across it, centred.
		if (tw + 2 > area.w || (!folded && th + 3 > area.h)) return null;
		const cap = Math.max(1, Math.floor((area.w - 1) / (tw + 1)));
		const k = Math.max(1, Math.min(n, cap));
		const x0 = area.x + Math.floor((area.w - (k * (tw + 1) + 1)) / 2);
		const tiles: Rect[] = [];
		if (!folded) for (let i = 0; i < k; i++) tiles.push({ x: x0 + 1 + i * (tw + 1), y: area.y + 1, w: tw, h: th });
		return { rect: { x: area.x, y: area.y, w: area.w, h: folded ? 1 : th + 3 }, tiles, cap };
	}
	while (tw > 8 && (tw + 2 > area.w || th + 3 > area.h)) { tw -= 2; th = tw / 2; }
	if (tw + 2 > area.w || th + 3 > area.h) return null;
	// Small tiles: more of them across a corner window.
	const across = Math.max(1, Math.min(small ? (area.w >= 100 ? 5 : 3) : area.w >= 100 ? 3 : 2, Math.floor((area.w - 1) / (tw + 1))));
	const down = Math.max(1, Math.min(2, Math.floor((area.h * 0.7 - 2) / (th + 1))));
	const cap = across * down;
	const k = Math.max(1, Math.min(n, cap));
	const ac = Math.min(across, k), dn = Math.ceil(k / ac);
	const w = ac * (tw + 1) + 1, h = folded ? 1 : dn * (th + 1) + 2;
	const x = corner === 'tr' || corner === 'br' ? area.x + area.w - w : area.x;
	const y = corner === 'bl' || corner === 'br' ? area.y + area.h - h : area.y;
	const tiles: Rect[] = [];
	if (!folded) for (let i = 0; i < k; i++) tiles.push({ x: x + 1 + (i % ac) * (tw + 1), y: y + 1 + Math.floor(i / ac) * (th + 1), w: tw, h: th });
	return { rect: { x, y, w, h }, tiles, cap };
}

/** Someone this phone might show: how loud they are to you (0: out of earshot). */
export interface Near { id: string; name: string; loud: number; }

/**
 * Whose tiles to show: you first, then those close to you (anyone you can hear), the loudest first in
 * steps of a quarter, so the order holds still while people talk and shuffle, then by name. `more` is
 * how many close ones did not fit.
 */
export function pickTiles(me: string, others: Near[], max: number): { ids: string[]; more: number } {
	const near = others.filter((q) => q.id !== me && q.loud > 0)
		.sort((a, b) => Math.round(b.loud * 4) - Math.round(a.loud * 4) || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	const room = Math.max(0, max - 1);
	return { ids: [me, ...near.slice(0, room).map((q) => q.id)], more: Math.max(0, near.length - room) };
}

/**
 * A stand-in face, w x h brightness samples (0..255), drawn on this phone: an oval with hair, eyes that
 * blink and glance, a mouth that moves while `talk`. `k` varies the look (and the timing) per person.
 */
export function standIn(k: number, ms: number, talk: boolean, w: number, h: number): number[] {
	const out: number[] = [];
	const blink = ((ms + k * 977) / 3700) % 1 < 0.06;
	const look = Math.sin((ms + k * 500) / 1300) * 0.04;
	const open = talk && Math.floor(ms / 180) % 2 === 1;
	const ground = 40 + (k % 4) * 18, hair = 50 + (k % 3) * 35, skin = 175 + (k % 5) * 12;
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		const u = (x + 0.5) / w, v = (y + 0.5) / h;
		const r = Math.hypot((u - 0.5) / 0.34, (v - 0.54) / 0.4);
		let s = r < 1 ? skin - r * 50 : ground;
		if (r < 1.12 && v < 0.34) s = hair;
		const eye = Math.abs(v - 0.47) < 0.05 && (Math.abs(u - 0.36 - look) < 0.06 || Math.abs(u - 0.64 - look) < 0.06);
		if (eye && !blink) s = 15;
		if (Math.abs(v - 0.74) < (open ? 0.06 : 0.025) && Math.abs(u - 0.5) < 0.12) s = open ? 20 : 95;
		out.push(Math.max(0, Math.min(255, s)));
	}
	return out;
}

/** What one tile shows. */
export interface TileView {
	id: string;
	/** The name on the row under it. */
	label: string;
	/** Their mark: [glyph ink, ground]. */
	ink: [number, number];
	/** Their letter, for a tile with no picture. */
	glyph: string;
	/**
	 * Letters from a frame (faces.ts hex levels, tile-sized), a picture laid over, an avatar drawn from a
	 * rig (rig.ts: cells, centred in the tile), or nothing to show.
	 */
	kind: 'letters' | 'video' | 'avatar' | 'blank';
	frame?: string;
	cells?: RigCell[][];
	/** Letters only: a drawn face over yours (faces.ts faceOver): an oval of blank, the face at (x, y). */
	over?: { cx: number; cy: number; rx: number; ry: number; x: number; y: number; cells: RigCell[][] };
	/** Under the letter of a tile with no picture: why there is none. */
	note?: string;
	talking: boolean;
	/** Fainter with distance: a shade step (0 faintest .. 3), or none for full strength. */
	fade?: number;
	/** They have asked you for a word: their tile is marked until you answer. */
	asking?: boolean;
}

export interface CamWindowDraw {
	title: string;
	tiles: TileView[];
	more: number;
	folded: boolean;
	/** Taps: the title (move round the corners), [-] (fold or unfold), [x] (close), a tile. */
	onMove: () => void;
	onFold: () => void;
	onClose: () => void;
	/** Resync my face (the tracker learns it afresh, this moment's face its rest); none: no [~] shown. */
	onSync?: () => void;
	onTile: (id: string) => void;
}

/** A level 0..15 of a letters tile as an ink: faint ones dim, bright ones gold. */
const levelInk = (l: number) => (l < 6 ? 3 : l < 10 ? 4 : l < 13 ? 5 : 6);

/** Draw the window into the grid at its layout, with its taps (on top of the map's). */
export function drawCamWindow(g: Grid, L: CamLayout, d: CamWindowDraw) {
	const { x, y, w, h } = L.rect;
	// The whole window catches taps first, so a tap on it never walks you somewhere under it.
	g.hit(L.rect, () => {});
	const ctl = (d.onSync && !d.folded ? '[~]' : '') + (d.folded ? '[+][x]' : '[-][x]');
	const room = Math.max(0, w - 2 - ctl.length - 1);
	// A title that does not fit (a narrow side column) is left out rather than cut short.
	const full = d.folded && d.tiles.length > 1 ? `${d.title} ${d.tiles.length}` : d.title;
	const title = full.length <= room ? full : '';
	if (d.folded) {
		g.fill({ x, y, w, h: 1 }, '─', 3, 0);
		g.text(x + 1, y, title, 6, 0);
	} else {
		g.fill(L.rect, ' ', 4, 0);
		g.box(L.rect, 3, 0, '', 3, 'single');
		if (title) g.text(x + 1, y, ' ' + title + ' ', 6, 0);
		if (d.more > 0) { const m = ` +${d.more} more `; if (m.length <= w - 2) g.text(x + w - 1 - m.length, y + h - 1, m, 3, 0); }
	}
	g.text(x + w - ctl.length, y, ctl, 5, 0);
	g.hit({ x, y, w: Math.max(1, w - ctl.length), h: 1 }, () => d.onMove());
	if (d.onSync && !d.folded) g.hit({ x: x + w - 9, y, w: 3, h: 1 }, () => d.onSync!());
	g.hit({ x: x + w - 6, y, w: 3, h: 1 }, () => d.onFold());
	g.hit({ x: x + w - 3, y, w: 3, h: 1 }, () => d.onClose());
	if (d.folded) return;
	L.tiles.forEach((r, i) => {
		const t = d.tiles[i];
		if (!t) return;
		if (t.kind === 'video') g.fill(r, VIDEO_CH, 3, VIDEO_BG);
		else if (t.kind === 'avatar' && t.cells) {
			// The letter tile's faint ground, the face over it: eyes, brows and mouth in their colour, the
			// nose's sides dim, and the nose itself their letter on its plate.
			for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) g.set(r.x + xx, r.y + yy, (xx + 2 * yy) % 4 ? ' ' : '.', shade(3, 1), 0);
			const ah = t.cells.length, aw = t.cells[0]?.length ?? 0;
			const ox = r.x + Math.floor((r.w - aw) / 2), oy = r.y + Math.floor((r.h - ah) / 2);
			const fd = (ink: number) => (t.fade === undefined ? ink : shade(ink, t.fade));
			const feature = fd(t.ink[1] ? 5 : t.ink[0]);
			// Someone asking for a word: their tile's ground in gold, flickering, until you answer.
			if (t.asking && Math.floor(performance.now() / 500) % 2 === 0) for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) if ((xx + 2 * yy) % 4 === 0) g.set(r.x + xx, r.y + yy, '.', 6, 0);
			for (let yy = 0; yy < ah; yy++) for (let xx = 0; xx < aw; xx++) {
				const c = t.cells[yy][xx];
				if (c.ch === ' ') continue;
				if (c.ink === 3 && t.glyph) g.set(ox + xx, oy + yy, t.glyph, fd(t.ink[0]), t.ink[1] ? fd(t.ink[1]) : 0);
				else g.set(ox + xx, oy + yy, c.ch, c.ink === 2 ? feature : t.fade === undefined ? 3 : shade(3, Math.max(0, t.fade - 1)), 0);
			}
		} else if (t.kind === 'letters' && t.frame) {
			const o = t.over;
			for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
				// Inside the oval over your face: blank, so only your outline is yours.
				if (o && ((xx + 0.5 - o.cx) / o.rx) ** 2 + ((yy + 0.5 - o.cy) / o.ry) ** 2 <= 1) { g.set(r.x + xx, r.y + yy, ' ', 3, 0); continue; }
				const c = cellOf(t.frame, xx, yy, r.w);
				g.set(r.x + xx, r.y + yy, c.ch, levelInk(c.level), 0);
			}
			if (o) o.cells.forEach((row, yy) => row.forEach((c, xx) => {
				const px = o.x + xx, py = o.y + yy;
				if (c.ch !== ' ' && px >= 0 && py >= 0 && px < r.w && py < r.h) g.set(r.x + px, r.y + py, c.ch, 6, 0);
			}));
		} else {
			// No picture: a faint ground, their letter in the middle on its plate, why under it.
			for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) g.set(r.x + xx, r.y + yy, (xx + 2 * yy) % 4 ? ' ' : '.', shade(3, 1), 0);
			const cy = r.y + Math.floor((r.h - 1) / 2);
			if (t.glyph) g.set(r.x + Math.floor(r.w / 2), cy, t.glyph, t.ink[0], t.ink[1]);
			if (t.note) {
				const n = t.note.slice(0, r.w);
				g.text(r.x + Math.floor((r.w - n.length) / 2), t.glyph ? cy + 1 : cy, n, 3, 0);
			}
		}
		// The name under it, in their colour; a note before it while they talk.
		const label = ((t.asking ? '? ' : t.talking ? '♪' : '') + t.label).slice(0, r.w);
		const [pf, pb] = t.ink;
		g.fill({ x: r.x, y: r.y + r.h, w: r.w, h: 1 }, ' ', 3, 0);
		if (t.asking) g.text(r.x + Math.floor((r.w - label.length) / 2), r.y + r.h, label, 0, 6);
		else if (t.fade !== undefined) g.text(r.x + Math.floor((r.w - label.length) / 2), r.y + r.h, label, shade(pb || pf, t.fade), 0);
		else g.text(r.x + Math.floor((r.w - label.length) / 2), r.y + r.h, label, pb ? 0 : pf, pb);
		g.hit({ x: r.x, y: r.y, w: r.w, h: r.h + 1 }, () => d.onTile(t.id));
	});
}

/** Whether a picture tile's cells are still the blank under a picture (nothing drawn over it since). */
export function uncovered(g: Grid, r: Rect): boolean {
	for (const [cx, cy] of [[r.x, r.y], [r.x + r.w - 1, r.y], [r.x, r.y + r.h - 1], [r.x + r.w - 1, r.y + r.h - 1]]) {
		const c = g.get(cx, cy);
		if (!c || c.ch !== VIDEO_CH || c.bg !== VIDEO_BG) return false;
	}
	return true;
}

// ---- pictures over the cells (the browser only) -------------------------------------------

/** A tile drawn as a picture: where, and how to paint it (w x h device pixels). */
export interface PictureTile { key: string; rect: Rect; paint: (cx: CanvasRenderingContext2D, w: number, h: number) => void; }

/** Paint this phone's own camera into a tile: cropped to the tile's shape round the face, mirrored. */
export const paintCamera = (v: HTMLVideoElement) => (cx: CanvasRenderingContext2D, w: number, h: number) => {
	if (!v.videoWidth || !v.videoHeight) return;
	const c = crop(v.videoWidth, v.videoHeight, w / h);
	cx.save();
	cx.translate(w, 0); cx.scale(-1, 1);
	cx.drawImage(v, c.sx, c.sy, c.sw, c.sh, 0, 0, w, h);
	cx.restore();
};

let small: HTMLCanvasElement | null = null;
/** Paint a stand-in face into a tile: drawn small, in warm greys, and scaled up soft. */
export const paintStandIn = (k: number, talk: () => boolean) => (cx: CanvasRenderingContext2D, w: number, h: number) => {
	const S = 24;
	const c = (small ??= document.createElement('canvas'));
	c.width = S; c.height = S;
	const g = c.getContext('2d')!;
	const img = g.createImageData(S, S);
	standIn(k, performance.now(), talk(), S, S).forEach((v, i) => { img.data.set([v, v * 0.92, v * 0.8, 255], i * 4); });
	g.putImageData(img, 0, 0);
	cx.imageSmoothingEnabled = true;
	cx.drawImage(c, 0, 0, w, h);
};

/**
 * Canvases laid over the terminal's cells, one a picture tile, kept in place each animation frame and
 * repainted a dozen times a second. A tile the grid no longer shows blank (a sheet or a notice drawn
 * over it, the village put away) has its canvas taken down; so does everything when nobody has asked
 * for pictures for a moment. They never take taps: those go through to the grid.
 */
export class CamOverlay {
	private els = new Map<string, HTMLCanvasElement>();
	private want: PictureTile[] = [];
	private asked = 0;
	private painted = 0;
	private running = false;
	private term: () => Term | null;
	private fps: number;

	constructor(term: () => Term | null, fps = 12) {
		this.term = term;
		this.fps = fps;
	}

	/** The picture tiles the grid has just drawn (call on each draw; an empty list takes them all down). */
	show(tiles: PictureTile[]) {
		this.want = tiles;
		this.asked = performance.now();
		if (!this.running && tiles.length) {
			this.running = true;
			requestAnimationFrame(this.loop);
		}
	}

	private loop = () => {
		const t = this.term(), now = performance.now();
		const live = t && now - this.asked < 700 ? this.want : [];
		const b = t?.pre.getBoundingClientRect();
		const paint = now - this.painted >= 1000 / this.fps;
		if (paint) this.painted = now;
		const seen = new Set<string>();
		for (const tile of live) {
			if (!t || !b || !uncovered(t, tile.rect)) continue;
			seen.add(tile.key);
			let el = this.els.get(tile.key);
			const fresh = !el;
			if (!el) {
				el = document.createElement('canvas');
				el.style.cssText = 'position:fixed;pointer-events:none;z-index:2;';
				el.setAttribute('aria-hidden', 'true');
				document.body.appendChild(el);
				this.els.set(tile.key, el);
			}
			const cw = b.width / t.cols, lh = b.height / t.rows, dpr = devicePixelRatio || 1;
			const W = tile.rect.w * cw, H = tile.rect.h * lh;
			el.style.left = `${b.left + tile.rect.x * cw}px`;
			el.style.top = `${b.top + tile.rect.y * lh}px`;
			el.style.width = `${W}px`;
			el.style.height = `${H}px`;
			const pw = Math.max(1, Math.round(W * dpr)), ph = Math.max(1, Math.round(H * dpr));
			const resized = el.width !== pw || el.height !== ph;
			if (resized) { el.width = pw; el.height = ph; }
			if (paint || fresh || resized) tile.paint(el.getContext('2d')!, pw, ph);
		}
		for (const [k, el] of this.els) if (!seen.has(k)) { el.remove(); this.els.delete(k); }
		if (live.length) requestAnimationFrame(this.loop);
		else this.running = false;
	};
}
