/**
 * figure.ts - the page where a player chooses their figure and their face while they wait: the lobby,
 * or the village. They choose from tiles of the real glyphs, in their own colour; only those this
 * device can draw are offered.
 */
import { FACES, FIGURES, defaultLook, filling, loadLook, saveLook } from '../town/avatar.ts';
import type { Look } from '../town/avatar.ts';
import { canDraw } from './glyphs.ts';
import { blank, blockRow, btn, buttonBlock, endPanel, personInk, rubric, shade, wrap } from './ascii.ts';
import type { Row } from './ascii.ts';

/** A tile and the gap after it, across and down. */
const TILE_W = 4, TILE_H = 2, WIDTH = 48;

/** A block of tiles, as many to a line as fit: each shows a glyph, and a tap picks it. */
function tiles(list: string[], at: number, ink: number, pick: (i: number) => void): Row {
	const items = list.map((glyph, i) => ({ glyph, i })).filter((t) => canDraw(t.glyph));
	const across = Math.floor(WIDTH / TILE_W), lines = Math.ceil(items.length / across);
	return blockRow(lines * TILE_H, (c) => {
		items.forEach(({ glyph, i }, n) => {
			const x = c.x + (n % across) * TILE_W, y = c.y + Math.floor(n / across) * TILE_H;
			const on = i === at, ground = shade(ink, on ? 2 : 0);
			c.g.fill({ x, y, w: TILE_W - 1, h: 1 }, ' ', ink, ground);
			c.g.setWide(x, y, filling(glyph), on ? 5 : ink, ground);
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
	const anyOf = (list: string[]) => { const ok = list.map((g, i) => ({ g, i })).filter((t) => canDraw(t.g)); return ok[Math.floor(Math.random() * ok.length)]?.i ?? 0; };
	const rows: Row[] = [rubric('You')];
	rows.push(blockRow(3, (c) => {
		c.g.text(c.x + 1, c.y, name || 'You', ink);
		c.g.text(c.x + 1, c.y + 1, 'Walking:', 3);
		c.g.setWide(c.x + 10, c.y + 1, filling(FIGURES[look.figure]), ink, shade(ink, 0));
		c.g.text(c.x + 15, c.y + 1, 'At the table:', 3);
		c.g.setWide(c.x + 29, c.y + 1, filling(FACES[look.face]), ink, shade(ink, 0));
		wrap(k === null ? 'Your colour comes with your seat.' : 'Your colour stays: it is how they know you.', 46).forEach((l, i) => c.g.text(c.x + 1, c.y + 2 + i, l, 3));
	}));
	rows.push(endPanel(), rubric('Figure'), tiles(FIGURES, look.figure, ink, (figure) => set({ ...look, figure })), endPanel());
	rows.push(rubric('Face'), tiles(FACES, look.face, ink, (face) => set({ ...look, face })), endPanel());
	rows.push(blank(), buttonBlock([btn('Surprise me', () => set({ figure: anyOf(FIGURES), face: anyOf(FACES) }))]));
	return rows;
}
