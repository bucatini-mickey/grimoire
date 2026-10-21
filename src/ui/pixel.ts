/**
 * pixel.ts - small pixel-art pictures, drawn as crisp SVG.
 *
 * A sprite is a list of strings, one character per pixel; '.' is empty and
 * every other letter names an ink from INKS. Each ink has a day and a night
 * colour (CSS variables --px-*), so pictures follow the page's light.
 *
 * The built-in sprites below are only defaults. Pictures you draw yourself
 * (PNGs in art/, see art/README.md) come first: the build reads them and
 * main.ts hands them over with registerArt. art/logo.png is the logo.
 */

import { cellsHtml } from './asciiart.ts';

export interface Ink {
	key: string;
	name: string;
	day: string;
	night: string;
}

/** A small, fixed palette: part of the retro look. */
export const INKS: Ink[] = [
	{ key: 'k', name: 'ink', day: '#2b1d12', night: '#050403' },
	{ key: 'n', name: 'grey', day: '#8a8478', night: '#5a564e' },
	{ key: 'W', name: 'white', day: '#f8f4ea', night: '#d8d0c0' },
	{ key: 'c', name: 'parchment', day: '#f6eed8', night: '#e9dcb4' },
	{ key: 's', name: 'stone', day: '#cdb88c', night: '#6f6250' },
	{ key: 'S', name: 'stone-dark', day: '#9a8459', night: '#4a4033' },
	{ key: 'd', name: 'wood', day: '#4a2e1a', night: '#2a1a0f' },
	{ key: 'f', name: 'skin', day: '#e0b08a', night: '#b88a6a' },
	{ key: 'r', name: 'red', day: '#8a3324', night: '#5a2a22' },
	{ key: 'R', name: 'red-dark', day: '#5e2016', night: '#3a1914' },
	{ key: 'l', name: 'scarlet', day: '#b0201a', night: '#c0302a' },
	{ key: 'g', name: 'gold', day: '#b8891f', night: '#dcaa4a' },
	{ key: 'y', name: 'sun', day: '#d9a321', night: '#d9a321' },
	{ key: 'e', name: 'green', day: '#3d6a35', night: '#4a7a3f' },
	{ key: 'b', name: 'blue', day: '#2f4f8a', night: '#3d5a8a' },
	{ key: 'w', name: 'glass', day: '#3f5f8f', night: '#f2c14e' },
	{ key: 'v', name: 'violet', day: '#6a3a7a', night: '#7a4a8a' },
	{ key: 'm', name: 'moon', day: '#efe3b0', night: '#efe3b0' },
	{ key: 't', name: 'star', day: '#efe3b0', night: '#efe3b0' },
	{ key: 'h', name: 'hand', day: '#2b1d12', night: '#16110c' }
];
const INK_BY_KEY = new Map(INKS.map((i) => [i.key, i]));

/** Your own pictures (art/*.png): their rows, and their colours, exactly as drawn. */
let own: Record<string, string[]> = {};
const OWN_INK = new Map<string, string>();
export function registerArt(a: { palette: Record<string, string>; images: Record<string, string[]> }) {
	own = a.images;
	for (const [ch, hex] of Object.entries(a.palette)) OWN_INK.set(ch, hex);
}
/** Did you draw this one yourself? ('tower' is the logo.) */
export const hasOwn = (id: string) => !!own[id] || (id === 'tower' && !!own.logo);

/** The colours as CSS, for the pictures. */
export function paletteCss(): string {
	const vars = (when: 'day' | 'night') => INKS.map((i) => `--px-${i.name}:${i[when]};`).join('');
	const rules = INKS.map((i) => `.px-${i.name}{fill:var(--px-${i.name})}.cell.px-${i.name},.swatch.px-${i.name}{background:var(--px-${i.name})}`).join('');
	return `:root{${vars('day')}}:root[data-phase="night"]{${vars('night')}}${rules}`;
}

/** A picture as ASCII on coloured blocks, one square cell to a pixel (see asciiart.ts). */
export function svg(sprite: string[], cls = ''): string {
	const h = Math.max(1, sprite.length);
	const w = Math.max(1, ...sprite.map((r) => [...r].length));
	const rows = sprite.map((r) => [...r]);
	return cellsHtml(w, h, (x, y) => {
		const ch = rows[y][x];
		const ink = ch && INK_BY_KEY.get(ch);
		return ink ? `var(--px-${ink.name})` : (ch && OWN_INK.get(ch)) || null;
	}, `pixel ${cls}`);
}

/** Lay smaller sprites onto a blank field, later ones on top. */
function compose(width: number, height: number, parts: { sprite: string[]; x: number; y: number }[]): string[] {
	const grid = Array.from({ length: height }, () => Array(width).fill('.'));
	for (const p of parts) {
		p.sprite.forEach((line, dy) => [...line].forEach((ch, dx) => {
			const x = p.x + dx, y = p.y + dy;
			if (ch !== '.' && y >= 0 && y < height && x >= 0 && x < width) grid[y][x] = ch;
		}));
	}
	return grid.map((r) => r.join(''));
}

// ---- the built-in pictures ------------------------------------------------------

export const DEFAULTS: Record<string, string[]> = {
	tower: [
		'........g........',
		'.......ggg.......',
		'........g........',
		'.......kkk.......',
		'......krrRk......',
		'......krrRk......',
		'.....krrrRRk.....',
		'.....krrrRRk.....',
		'....krrrrRRRk....',
		'....krrrrRRRk....',
		'...kkkkkkkkkkk...',
		'....ksssssSSk....',
		'....kskkkkkSk....',
		'....kskchckSk....',
		'....kskchhkSk....',
		'....kskccckSk....',
		'....kskkkkkSk....',
		'....ksssssSSk....',
		'....kswsswSSk....',
		'....kswsswSSk....',
		'....ksssssSSk....',
		'...kkkkkkkkkkk...',
		'...ksssssssSSk...',
		'...ksssdddsSSk...',
		'...kssdddddSSk...',
		'...kssdddddSSk...',
		'.kkkkkkkkkkkkkkk.'
	],
	moon: ['..mmm..', '.mm....', 'mm.....', 'mm.....', 'mm.....', '.mm....', '..mmm..'],
	sun: ['....y....', '.y.....y.', '...yyy...', '..yyyyy..', 'y.yyyyy.y', '..yyyyy..', '...yyy...', '.y.....y.', '....y....'],
	stars: ['t......', '....t..', '.......', '.t.....']
};

/** The scene pictures, in the order the Art tab lists them. */
export const SCENE = [
	{ id: 'tower', name: 'Clocktower' },
	{ id: 'moon', name: 'Moon' },
	{ id: 'sun', name: 'Sun' },
	{ id: 'stars', name: 'Stars' }
];

/** The size a new picture starts at. */
export const NEW_SIZE = { w: 16, h: 16 };

// ---- what has been drawn, kept in this browser ------------------------------------

const KEY = 'grimoire.art';
let art: Record<string, string[]> = {};
try {
	const raw = localStorage.getItem(KEY);
	if (raw) art = JSON.parse(raw);
} catch {
	/* no storage: the defaults still draw */
}

export function saveArt() {
	try {
		localStorage.setItem(KEY, JSON.stringify(art));
	} catch {
		/* the drawing stays for this visit */
	}
}

/** A picture by id: drawn on the Art tab, else built in, else nothing. */
export function sprite(id: string): string[] | null {
	return own[id] ?? (id === 'tower' ? own.logo : undefined) ?? art[id] ?? DEFAULTS[id] ?? null;
}

export function setSprite(id: string, rows: string[] | null) {
	if (rows) art[id] = rows;
	else delete art[id];
	saveArt();
}

export const isCustom = (id: string) => id in art;
export const allArt = () => ({ ...art });

/** The clocktower under the night or day sky. */
export function towerScene(phase: 'night' | 'day' | 'other'): string {
	const tower = sprite('tower') ?? [];
	const tw = Math.max(0, ...tower.map((r) => r.length));
	const width = Math.max(26, tw + 9);
	const height = Math.max(30, tower.length + 3);
	const parts = [{ sprite: tower, x: Math.floor((width - tw) / 2) - 1, y: height - tower.length }];
	if (phase === 'night') parts.push({ sprite: sprite('moon') ?? [], x: width - 8, y: 0 }, { sprite: sprite('stars') ?? [], x: 0, y: 1 });
	if (phase === 'day') parts.push({ sprite: sprite('sun') ?? [], x: width - 10, y: 0 });
	return svg(compose(width, height, parts), `scene-${phase}`);
}
