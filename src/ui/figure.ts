/**
 * figure.ts - the page where a player makes their figure while they wait: the lobby, or the village.
 * Figures and heads are tiles of the real glyphs, in the player's own colour, so they choose by looking;
 * only those this device can draw are offered.
 */
import { BODIES, HEADS, defaultLook, loadLook, lookGlyph, saveLook } from '../town/avatar.ts';
import type { Look } from '../town/avatar.ts';
import { canDraw } from './glyphs.ts';
import { blank, blockRow, btn, buttonBlock, endPanel, personInk, rubric, shade, wrap } from './ascii.ts';
import type { Row } from './ascii.ts';

/** A tile and the gap after it, across and down. */
const TILE_W = 4, TILE_H = 2;

/** A block of tiles, as many to a line as fit: each shows a glyph, and a tap picks it. */
function tiles(items: { glyph: string; i: number }[], at: number, ink: number, width: number, pick: (i: number) => void): Row {
	const across = Math.floor(width / TILE_W), lines = Math.ceil(items.length / across);
	return blockRow(lines * TILE_H, (c) => {
		items.forEach(({ glyph, i }, n) => {
			const x = c.x + (n % across) * TILE_W, y = c.y + Math.floor(n / across) * TILE_H;
			const on = i === at, ground = shade(ink, on ? 2 : 0);
			c.g.fill({ x, y, w: TILE_W - 1, h: 1 }, ' ', ink, ground);
			c.g.setWide(x, y, glyph, on ? 5 : ink, ground);
			c.hit({ x, y: y - 0, w: TILE_W, h: TILE_H }, () => pick(i));
		});
	});
}

/** `k`: their colour's number (a seat), or null if they have no seat yet. `changed` hears each new look. */
export function figureRows(name: string, k: number | null, changed: (l: Look) => void): Row[] {
	const n = k ?? 0;
	const look = loadLook() ?? defaultLook(n);
	const [fg, bg] = personInk(n);
	const ink = bg || fg;
	const set = (l: Look) => { saveLook(l); changed(l); };
	const figures = BODIES.map((_, b) => ({ glyph: lookGlyph({ ...look, b }), i: b })).filter((t) => canDraw(t.glyph));
	const heads = HEADS.map((_, h) => ({ glyph: lookGlyph({ ...look, h }), i: h })).filter((t) => canDraw(t.glyph));
	const rows: Row[] = [rubric('Your figure')];
	rows.push(blockRow(3, (c) => {
		c.g.text(c.x + 1, c.y, name || 'You', ink);
		c.g.text(c.x + 1, c.y + 1, '. , \' . ', 2);
		c.g.setWide(c.x + 9, c.y + 1, lookGlyph(look), ink, shade(ink, 0));
		c.g.text(c.x + 11, c.y + 1, ' . , \'', 2);
		wrap(k === null ? 'Your colour comes with your seat.' : 'Your colour stays: it is how they know you.', 46).forEach((l, i) => c.g.text(c.x + 1, c.y + 2 + i, l, 3));
	}));
	rows.push(endPanel(), rubric('Body'), tiles(figures, look.b, ink, 48, (b) => set({ ...look, b })), endPanel());
	if (!BODIES[look.b].whole) rows.push(rubric('Head'), tiles(heads, look.h, ink, 48, (h) => set({ ...look, h })), endPanel());
	rows.push(blank(), buttonBlock([btn('Surprise me', () => {
		const t = figures[Math.floor(Math.random() * figures.length)];
		set({ b: t.i, h: Math.floor(Math.random() * HEADS.length) });
	})]));
	return rows;
}
