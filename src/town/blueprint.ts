/**
 * blueprint.ts - reads Tachyon's blueprint text format (tachyon/src/make/blueprint.rs),
 * so a town built in Tachyon's editor can be dropped straight into Grimoire.
 *
 *   tachyon-blueprint 1
 *   name chapel
 *   size 7 5 1
 *   key # wall stone block
 *   key d floor stone block | door
 *   level 0
 *   ###d###
 *   end
 *
 * One character per one-metre cell; a space means "keep" (here: open grass).
 */

export type Tile = 'open' | 'floor' | 'wall' | 'ramp' | 'stair-up' | 'stair-down' | 'stair-updown';
const TILES: Tile[] = ['open', 'floor', 'wall', 'ramp', 'stair-up', 'stair-down', 'stair-updown'];

export interface BpCell {
	tile: Tile;
	/** Material name ('' for open air). */
	mat: string;
	/** Kind names of the things here, lowest first: 'door', 'bed', 'chair'... */
	things: string[];
}

export interface Blueprint {
	name: string;
	w: number;
	h: number;
	d: number;
	/** x + y*w + z*w*h; null = keep. */
	cells: (BpCell | null)[];
}

export function parseBlueprint(text: string): Blueprint {
	const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
	if (!lines[0]?.startsWith('tachyon-blueprint')) throw new Error("not a blueprint (no 'tachyon-blueprint' header)");
	const bp: Blueprint = { name: '', w: 0, h: 0, d: 0, cells: [] };
	const keys = new Map<string, BpCell>();
	const num = (s: string) => {
		const n = Number(s.trim());
		if (!Number.isInteger(n)) throw new Error(`bad number '${s}'`);
		return n;
	};
	let i = 1;
	while (i < lines.length) {
		const line = lines[i++];
		if (line.startsWith('#') || !line.trim()) continue;
		const sp = line.indexOf(' ');
		const word = sp < 0 ? line : line.slice(0, sp);
		const rest = sp < 0 ? '' : line.slice(sp + 1);
		if (word === 'name') bp.name = rest;
		else if (word === 'size') {
			const v = rest.trim().split(/\s+/);
			if (v.length !== 3) throw new Error('size needs width, height and levels');
			[bp.w, bp.h, bp.d] = v.map(num);
			bp.cells = new Array(bp.w * bp.h * bp.d).fill(null);
		} else if (word === 'key') {
			const ch = rest[0];
			if (!ch) throw new Error('key needs a character');
			const [body, thingList] = rest.slice(1).split('|');
			const b = body.trim();
			const s2 = b.indexOf(' ');
			const tw = s2 < 0 ? b : b.slice(0, s2);
			if (!TILES.includes(tw as Tile)) throw new Error(`unknown tile '${tw}'`);
			const things = (thingList ?? '').split(',').map((t) => t.trim()).filter(Boolean);
			keys.set(ch, { tile: tw as Tile, mat: s2 < 0 ? '' : b.slice(s2 + 1).trim(), things });
		} else if (word === 'level') {
			const z = num(rest);
			if (z < 0 || z >= bp.d) throw new Error(`level ${z} is outside size`);
			for (let y = 0; y < bp.h; y++) {
				const row = lines[i++];
				if (row === undefined) throw new Error('level ends early');
				[...row].slice(0, bp.w).forEach((ch, x) => {
					if (ch === ' ') return;
					const c = keys.get(ch);
					if (!c) throw new Error(`character '${ch}' has no key`);
					bp.cells[x + y * bp.w + z * bp.w * bp.h] = c;
				});
			}
		} else if (word === 'end') break;
		else throw new Error(`unknown line '${word}'`);
	}
	if (!bp.cells.length) throw new Error('blueprint has no size');
	return bp;
}
