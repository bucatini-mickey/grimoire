/**
 * figure.ts - the page where a player makes their figure while they wait: the lobby, or the village.
 * Bodies and heads are tiles of the real glyphs, in the player's own colour, so they choose by looking.
 */
import { BODIES, HEADS, defaultLook, loadLook, lookGlyph, randomLook, saveLook } from '../town/avatar.ts';
import type { Look } from '../town/avatar.ts';
import { blank, blockRow, btn, buttonBlock, endPanel, personInk, rubric, shade, wrap } from './ascii.ts';
import type { Row } from './ascii.ts';

/** A tile and the gap after it. */
const TILE_W = 6, TILE_H = 4;

/** A block of tiles, as many to a line as fit: each shows a glyph, and a tap picks it. */
function tiles(glyphs: string[], at: number, ink: number, width: number, pick: (i: number) => void): Row {
	const across = Math.floor(width / TILE_W), lines = Math.ceil(glyphs.length / across);
	return blockRow(lines * TILE_H, (c) => {
		// (a tile is three lines, the glyph in the middle one)
		glyphs.forEach((g, i) => {
			const x = c.x + (i % across) * TILE_W, y = c.y + Math.floor(i / across) * TILE_H;
			const on = i === at, ground = shade(ink, on ? 2 : 0);
			c.g.fill({ x, y, w: TILE_W - 1, h: TILE_H - 1 }, ' ', ink, ground);
			c.g.setWide(x + 1, y + 1, g, on ? 5 : ink, ground);
			c.hit({ x, y, w: TILE_W, h: TILE_H }, () => pick(i));
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
	const rows: Row[] = [rubric('Your figure')];
	rows.push(blockRow(3, (c) => {
		c.g.text(c.x + 1, c.y, name || 'You', ink);
		c.g.text(c.x + 1, c.y + 1, '. , \' . ', 2);
		c.g.setWide(c.x + 9, c.y + 1, lookGlyph(look), ink, shade(ink, 0));
		c.g.text(c.x + 11, c.y + 1, ' . , \'', 2);
		c.g.text(c.x + 19, c.y + 1, BODIES[look.b].name + ', ' + HEADS[look.h].name.toLowerCase(), 4);
		wrap(k === null ? 'Your colour comes with your seat.' : 'Your colour stays: it is how they know you.', 46).forEach((l, i) => c.g.text(c.x + 1, c.y + 2 + i, l, 3));
	}));
	rows.push(endPanel(), rubric('Body'), tiles(BODIES.map((_, b) => lookGlyph({ ...look, b })), look.b, ink, 48, (b) => set({ ...look, b })), endPanel());
	rows.push(rubric('Head'), tiles(HEADS.map((_, h) => lookGlyph({ ...look, h })), look.h, ink, 48, (h) => set({ ...look, h })), endPanel());
	rows.push(blank(), buttonBlock([btn('Surprise me', () => set(randomLook()))]));
	return rows;
}
