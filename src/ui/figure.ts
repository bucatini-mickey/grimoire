/**
 * figure.ts - the page where a player chooses their figure and their face while they wait: the lobby,
 * or the village. The figure walks the map, chosen from tiles of the real glyphs; only those this device
 * can draw are offered. The face is their webcam avatar's (src/avatar/rigface.ts): brows, eyes, nose and
 * mouth, each one of four, shown live as the others will see it, their letter as its nose and their name
 * under it. (The faces once picked for the voting table are gone, 16 Nov: the avatar is the face now.)
 */
import { FIGURES, defaultLook, filling, loadLook, saveLook } from '../town/avatar.ts';
import { decodeStyle, drawRig, encodeStyle, NEUTRAL, STYLE_NAMES, STYLE_PARTS } from '../avatar/rig.ts';
import type { FaceStyle } from '../avatar/rig.ts';
import type { Look } from '../town/avatar.ts';
import { canDraw } from './glyphs.ts';
import { blank, blockRow, btn, buttonBlock, endPanel, personInk, rubric, shade, wrap } from './ascii.ts';
import type { Row } from './ascii.ts';

/** A tile and the gap after it, across and down. */
const TILE_W = 6, TILE_H = 3, WIDTH = 48;

/** A block of tiles, as many to a line as fit: each shows a glyph, and a tap picks it. */
function tiles(list: string[], at: number, ink: number, pick: (i: number) => void): Row {
	const items = list.map((glyph, i) => ({ glyph, i })).filter((t) => canDraw(t.glyph));
	const across = Math.floor(WIDTH / TILE_W), lines = Math.ceil(items.length / across);
	return blockRow(lines * TILE_H, (c) => {
		items.forEach(({ glyph, i }, n) => {
			const x = c.x + (n % across) * TILE_W, y = c.y + Math.floor(n / across) * TILE_H;
			const on = i === at, ground = shade(ink, on ? 2 : 0);
			c.g.fill({ x, y, w: TILE_W - 2, h: TILE_H - 1 }, ' ', ink, ground);
			c.g.setWide(x + 1, y, filling(glyph), on ? 5 : ink, ground);
			c.hit({ x, y, w: TILE_W, h: TILE_H }, () => pick(i));
		});
	});
}

/**
 * A face tile as the camera window draws it: the avatar's middle face at rest (a small smile) on the letter
 * tile's faint ground, the letter on its plate as the nose (unless a nose is chosen), the name under it.
 */
export function faceTile(g: { set(x: number, y: number, ch: string, fg: number, bg: number): void; text(x: number, y: number, s: string, fg: number, bg?: number): void }, x: number, y: number, style: FaceStyle, letter: string, name: string, fg: number, bg: number) {
	const cells = drawRig({ ...NEUTRAL, smile: 12 }, 10, 5, style);
	const feature = bg ? 5 : fg;
	for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 10; xx++) {
		const c = cells[yy][xx];
		if (c.ch === ' ') g.set(x + xx, y + yy, (xx + 2 * yy) % 4 ? ' ' : '.', shade(3, 1), 0);
		else if (c.ink === 3) g.set(x + xx, y + yy, letter, fg, bg);
		else g.set(x + xx, y + yy, c.ch, c.ink === 2 ? feature : 3, 0);
	}
	const label = name.slice(0, 10);
	g.text(x + Math.floor((10 - label.length) / 2), y + 5, label, bg ? 0 : fg, bg);
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
	const style = decodeStyle(look.style);
	const letter = (name || 'You')[0].toUpperCase();
	rows.push(blockRow(7, (c) => {
		c.g.text(c.x + 1, c.y, 'Walking:', 3);
		c.g.setWide(c.x + 10, c.y, filling(FIGURES[look.figure]), ink, shade(ink, 0));
		wrap(k === null ? 'Your colour comes with your seat.' : 'Your colour stays: it is how they know you.', 30).forEach((l, i) => c.g.text(c.x + 1, c.y + 2 + i, l, 3));
		// The face as the camera window shows it: a 10 x 5 tile, your letter its nose, your name under it.
		faceTile(c.g, c.x + 34, c.y, style, letter, name || 'You', fg, bg);
	}));
	rows.push(endPanel(), rubric('Figure'), tiles(FIGURES, look.figure, ink, (figure) => set({ ...look, figure })), endPanel());
	rows.push(rubric('Face'));
	for (const part of STYLE_PARTS) {
		rows.push(buttonBlock(STYLE_NAMES[part].map((label, i) => btn(label, () => set({ ...look, style: encodeStyle({ ...style, [part]: i } as FaceStyle) }), { style: style[part] === i ? 'on' : undefined }))));
	}
	rows.push(endPanel());
	const any4 = () => Math.floor(Math.random() * 4);
	rows.push(blank(), buttonBlock([btn('Surprise me', () => set({ ...look, figure: anyOf(FIGURES), style: encodeStyle({ brow: any4(), eye: any4(), nose: any4(), mouth: any4() }) }))]));
	return rows;
}
