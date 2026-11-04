/**
 * figure.ts - the page where a player makes their figure while they wait: the lobby, or the village.
 */
import { FACES, HATS, defaultLook, loadLook, lookBust, lookGlyph, randomLook, saveLook } from '../town/avatar.ts';
import type { Look } from '../town/avatar.ts';
import { blank, blockRow, btn, buttonBlock, buttonRows, endPanel, personInk, row, rubric, shade, txt, wrap } from './ascii.ts';
import type { Row } from './ascii.ts';

/** `k`: their colour's number (a seat), or null if they have no seat yet. `changed` hears each new look. */
export function figureRows(name: string, k: number | null, changed: (l: Look) => void): Row[] {
	const n = k ?? 0;
	const look = loadLook() ?? defaultLook(n);
	const [fg, bg] = personInk(n);
	const ink = bg || fg;
	const set = (l: Look) => { saveLook(l); changed(l); };
	const pick = <T extends { name: string }>(list: T[], at: number, to: (i: number) => Look) =>
		buttonRows(list.map((o, i) => btn(o.name, () => set(to(i)), { style: i === at ? 'on' : 'quiet' })));
	const rows: Row[] = [rubric('Your figure')];
	rows.push(blockRow(6, (c) => {
		lookBust(look).forEach((l, i) => c.g.text(c.x + 1, c.y + i, l, ink));
		const x = c.x + 13;
		c.g.text(x, c.y, name || 'You', ink);
		c.g.text(x, c.y + 2, 'On the map:', 3);
		c.g.text(x + 12, c.y + 2, '. , ', 2);
		c.g.setWide(x + 16, c.y + 2, lookGlyph(look), ink, shade(ink, 0));
		c.g.text(x + 18, c.y + 2, ' . ,', 2);
		wrap(k === null ? 'Your colour comes with your seat.' : 'Your colour stays: it is how they know you.', 30).forEach((l, i) => c.g.text(x, c.y + 4 + i, l, 3));
	}));
	rows.push(endPanel(), rubric('Face or body'), ...pick(FACES, look.f, (f) => ({ ...look, f })), endPanel());
	rows.push(rubric('Head or headgear'), ...pick(HATS, look.h, (h) => ({ ...look, h })), ...wrap('For a little person: a body (Arms up, Star, Striding) and Dot head.', 44).map((l) => row(txt(l, 'dim'))), endPanel());
	rows.push(blank(), buttonBlock([btn('Surprise me', () => set(randomLook()))]));
	return rows;
}
