/**
 * figure.ts - the page where a player chooses their figure and their face while they wait: the lobby,
 * or the village. The figure walks the map, chosen from tiles of the real glyphs; only those this device
 * can draw are offered. The face is their webcam avatar's (src/avatar/rigface.ts): brows, eyes, nose and
 * mouth, each one of four, shown live as the others will see it, their letter as its nose and their name
 * under it. (The faces once picked for the voting table are gone, 16 Nov: the avatar is the face now.)
 */
import { FIGURES, defaultLook, filling, loadLook, saveLook } from '../town/avatar.ts';
import { decodeStyle, drawRig, encodeStyle, NEUTRAL, PLAIN_STYLE, SHOWN_PARTS, STYLE_NAMES } from '../avatar/rig.ts';
import { PART_LABEL } from '../avatar/rigface.ts';
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
	const style = decodeStyle(look.style);
	const letter = (name || 'You')[0].toUpperCase();
	const setStyle = (st: FaceStyle) => set({ ...look, style: encodeStyle(st) });
	const rows: Row[] = [rubric('You')];
	// The face as the camera window shows it (your letter its nose, your name under it), your figure beside it.
	rows.push(blockRow(6, (c) => {
		faceTile(c.g, c.x + 1, c.y, style, letter, name || 'You', fg, bg);
		c.g.text(c.x + 14, c.y, 'Walking as', 3);
		c.g.setWide(c.x + 25, c.y, filling(FIGURES[look.figure]), ink, shade(ink, 0));
		wrap(k === null ? 'Your colour comes with your seat.' : 'Your colour stays: it is how they know you.', Math.max(10, c.w - 15)).forEach((l, i) => c.g.text(c.x + 14, c.y + 2 + i, l, 3));
	}));
	// Each part on one line, two to a line: tap the left of a choice for the one before, the right for the next.
	for (let i = 0; i < SHOWN_PARTS.length; i += 2) rows.push(chooserRow(SHOWN_PARTS.slice(i, i + 2), style, setStyle));
	const anyStyle = () => { const st = { ...PLAIN_STYLE }; for (const p of SHOWN_PARTS) st[p] = Math.floor(Math.random() * STYLE_NAMES[p].length); return st; };
	rows.push(buttonBlock([
		btn('Surprise me', () => set({ ...look, figure: anyOf(FIGURES), style: encodeStyle(anyStyle()) })),
		btn('Plain face', () => setStyle({ ...PLAIN_STYLE }), { style: 'quiet' })
	]));
	rows.push(endPanel(), rubric('Figure'), tiles(FIGURES, look.figure, ink, (figure) => set({ ...look, figure })), endPanel());
	return rows;
}

/** Up to two parts of the face on one line: the part's name, then its choice between < and >. */
function chooserRow(parts: (keyof FaceStyle)[], style: FaceStyle, set: (st: FaceStyle) => void): Row {
	return blockRow(2, (c) => {
		const half = Math.floor(c.w / 2);
		parts.forEach((part, i) => {
			const x = c.x + i * half, names = STYLE_NAMES[part], at = style[part];
			const step = (d: number) => set({ ...style, [part]: (at + d + names.length) % names.length });
			c.g.text(x, c.y, PART_LABEL[part], 3);
			const bx = x + 10, bw = Math.max(12, half - 11);
			c.g.text(bx, c.y, '<', 6);
			const label = names[at].slice(0, bw - 4);
			c.g.text(bx + 2 + Math.floor((bw - 4 - label.length) / 2), c.y, label, 5);
			c.g.text(bx + bw - 1, c.y, '>', 6);
			c.hit({ x: bx, y: c.y, w: Math.floor(bw / 2), h: 2 }, () => step(-1));
			c.hit({ x: bx + Math.floor(bw / 2), y: c.y, w: bw - Math.floor(bw / 2), h: 2 }, () => step(1));
		});
	});
}
