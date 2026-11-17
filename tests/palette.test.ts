/**
 * Palette sweep (grim-022): every book palette stays readable, and the village's materials stay distinct.
 *
 * Floors are WCAG 2.x contrast ratios (relative luminance, (L1 + 0.05) / (L2 + 0.05)), chosen for a
 * parchment look rather than a screen UI, so decorative slots are not held to 4.5:
 *   ink on page      >= 7.0  (AAA: all body text)
 *   bright on panel  >= 7.0  (AAA: strong text on a panel; panel is the page's slightly darker/lighter shade)
 *   rubric on page   >= 3.0  (AA large / graphics: rubrics are headings, initials and numbers, bold)
 *   dim on page      >= 3.0  (AA large: captions and hints, deliberately quieter than ink)
 * Village: a wall, a floor and furniture must differ in colour (RGB distance) and furniture must also
 * stand out from the floor under it (contrast ratio), so a table is never lost on boards.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES } from '../src/ui/ascii.ts';
import { MATS, KINDS } from '../src/town/look.ts';

const rgb = (h: string): number[] => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
const lum = (c: number[]) => {
	const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const FLOORS = { page: 0, panel: 1, dim: 3, ink: 4, bright: 5, rubric: 8 };
const BOOKS = Object.keys(PALETTES).filter((k) => !k.startsWith('map-'));

test('every book palette is readable', () => {
	assert.ok(BOOKS.length >= 10);
	for (const key of BOOKS) {
		const p = PALETTES[key].map(rgb);
		const check = (name: string, fg: number, bg: number, min: number) => {
			const r = ratio(p[fg], p[bg]);
			assert.ok(r >= min, `${key}: ${name} ${r.toFixed(2)} < ${min}`);
		};
		check('ink on page', FLOORS.ink, FLOORS.page, 7);
		check('bright on panel', FLOORS.bright, FLOORS.panel, 7);
		check('rubric on page', FLOORS.rubric, FLOORS.page, 3);
		check('dim on page', FLOORS.dim, FLOORS.page, 3);
	}
});

test('village walls, floors and furniture stay distinct', () => {
	const walls = Object.entries(MATS).filter(([, m]) => m.style);
	const floors = ['wood', 'stone block', 'limestone', 'brick', 'teak', 'steel', 'carpet', 'cobble', 'soil', 'grass', 'snow'].map((n) => [n, MATS[n]] as const);
	// Furniture that stands on floors and must not vanish into them or into a wall.
	const furniture = ['table', 'chair', 'bed', 'chest', 'bookshelf', 'barrel', 'pew', 'coffin', 'loom', 'cart'];
	for (const [wn, w] of walls) for (const [fn, f] of floors) {
		if (wn === fn) continue;
		assert.ok(dist(w.fg, f.bg) >= 60, `wall ${wn} vs floor ${fn} too alike (${dist(w.fg, f.bg).toFixed(0)})`);
	}
	// Snow is open ground (nothing is furnished on it), so furniture is checked on the other floors.
	for (const n of furniture) for (const [fn, f] of floors.filter(([x]) => x !== 'snow')) {
		const k = KINDS[n];
		assert.ok(ratio(k.fg, f.bg) >= 2, `${n} on ${fn}: ${ratio(k.fg, f.bg).toFixed(2)} < 2`);
		if (n !== 'bed' && n !== 'coffin') assert.ok(dist(k.fg, f.bg) >= 60, `${n} vs floor ${fn} colour too alike`);
	}
	for (const n of furniture) for (const [wn, w] of walls) {
		if (['wood', 'teak', 'paling'].includes(wn) && n !== 'bed') continue; // timber furniture against timber walls: same craft, told apart by shape
		assert.ok(dist(KINDS[n].fg, w.fg) >= 30, `${n} vs wall ${wn} colour too alike (${dist(KINDS[n].fg, w.fg).toFixed(0)})`);
	}
});
