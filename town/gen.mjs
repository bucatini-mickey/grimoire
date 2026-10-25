/**
 * gen.mjs - what the town generators share: a plan of cells on two levels, the strokes to draw it
 * (rooms, stairs, houses), and the writer of the Tachyon blueprint (.tbp) the game reads.
 *
 * A cell is its key spec: 'floor grass', 'wall stone block', 'floor wood | bed'. Things stand on a
 * floor ('floor wood | chair'). What a town needs to be played in (src/town/map.ts):
 *   - fifteen or more chairs in the open, round a speaking place (a cross, a clock, a well);
 *   - a council room: five or more chairs drawn up to a table indoors (the great hall);
 *   - a room with a bed for each player to go home to at night (fifteen or more);
 *   - lights (torch, brazier, candle, gas lamp, oven) for the night.
 */
import { writeFileSync } from 'node:fs';

/** Things nobody walks through (src/town/map.ts BLOCKING). */
const BLOCKING = ['well', 'brazier', 'altar', 'statue', 'anvil', 'barrel', 'bookshelf', 'coffin', 'table', 'waterfall', 'bell', 'clock', 'oak', 'loom', 'oven', 'cart', 'gas lamp'];

export function plan(W, H, ground, seed = 1) {
	let s = seed;
	const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
	const g = Array.from({ length: H }, () => Array(W).fill(ground));
	const u = Array.from({ length: H }, () => Array(W).fill(null));
	const labels = [];
	const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
	const P = {
		W, H, g, u, rnd, labels,
		put: (x, y, spec) => { if (inside(x, y)) g[y][x] = spec; },
		get: (x, y) => (inside(x, y) ? g[y][x] : ground),
		up: (x, y, spec) => { if (inside(x, y)) u[y][x] = spec; },
		fill: (x0, y0, x1, y1, spec) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) P.put(x, y, spec); },
		floorOf: (x, y) => { const c = P.get(x, y); return c.startsWith('floor') ? c.split('|')[0].trim() : null; },
		/** A thing on whatever floor is there (or the floor given). */
		thing: (x, y, name, floor) => P.put(x, y, `${floor ?? P.floorOf(x, y) ?? 'floor soil'} | ${name}`),
		room: (x0, y0, x1, y1, wall, floor) => { P.fill(x0, y0, x1, y1, `wall ${wall}`); P.fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, `floor ${floor}`); },
		upRoom: (x0, y0, x1, y1, wall, floor) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) P.up(x, y, y === y0 || y === y1 || x === x0 || x === x1 ? `wall ${wall}` : `floor ${floor}`); },
		/** A stair between the levels, at the same spot on both. */
		stair: (x, y, mat) => { P.put(x, y, `stair-up ${mat}`); P.up(x, y, `stair-down ${mat}`); },
		label: (x, y, name) => labels.push([x, y, name]),
		/**
		 * A house: walls, a door on the side given ('n', 's', 'e', 'w'), a bed (a home), a table, a candle or
		 * hearth, a chest. `loft` puts a bedchamber upstairs, reached by a stair by the door.
		 */
		house: (x0, y0, x1, y1, o = {}) => {
			const { wall = 'wood', floor = 'wood', door = 's', light = 'candle', loft = false, extra = [] } = o;
			P.room(x0, y0, x1, y1, wall, floor);
			const mx = (x0 + x1) >> 1, my = (y0 + y1) >> 1;
			const d = door === 's' ? [mx, y1] : door === 'n' ? [mx, y0] : door === 'e' ? [x1, my] : [x0, my];
			P.thing(d[0], d[1], 'door', `floor ${floor}`);
			const inX = d[0] === x0 ? x0 + 1 : d[0] === x1 ? x1 - 1 : d[0], inY = d[1] === y0 ? y0 + 1 : d[1] === y1 ? y1 - 1 : d[1];
			// The far corner from the door: the bed; beside the door: the light; the middle: a table.
			const fx = inX <= mx ? x1 - 1 : x0 + 1, fy = inY <= my ? y1 - 1 : y0 + 1;
			P.thing(fx, fy, 'bed', `floor ${floor}`);
			const lx = inX <= mx ? x0 + 1 : x1 - 1, ly = inY <= my ? y0 + 1 : y1 - 1;
			if (light) P.thing(lx === inX && ly === inY ? x1 - 1 : lx, ly === inY && lx === inX ? y0 + 1 : ly, light, `floor ${floor}`);
			if (x1 - x0 >= 4 && y1 - y0 >= 4) P.thing(mx, my, 'table', `floor ${floor}`);
			if (x1 - x0 >= 5) P.thing(fx === x1 - 1 ? x0 + 1 : x1 - 1, fy, 'chest', `floor ${floor}`);
			for (const [ex, ey, name] of extra) P.thing(ex, ey, name, `floor ${floor}`);
			if (loft) {
				P.upRoom(x0, y0, x1, y1, wall, floor);
				P.stair(inX === x0 + 1 ? x0 + 1 : inX === x1 - 1 ? x1 - 1 : inX + (inX < x1 - 1 ? 1 : -1), inY === y0 + 1 ? y0 + 1 : inY === y1 - 1 ? y1 - 1 : inY, floor);
				P.up(fx, fy, `floor ${floor} | bed`);
			}
			return { door: d, inside: [inX, inY] };
		},
		/** Clear the step outside every door of what would block it. */
		clearDoorsteps: (blockers, to) => {
			for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
				if (!g[y][x].includes('| door')) continue;
				for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (blockers(P.get(x + dx, y + dy))) P.put(x + dx, y + dy, to);
			}
		},
		/**
		 * Make sure every door can be reached from (sx, sy): from the step outside each door, the cheapest
		 * way to the start is found (open ground cheap, trees and rock dearer, water dearer still, building
		 * walls never), and what it crosses is made passable: trees and rough ground become `track`, water a
		 * plank bridge. `tree` says which wall specs are trees (cut), `rough` which other walls can be cut.
		 */
		connect: (sx, sy, { track = 'floor soil', tree = (c) => c === 'wall pine' || c === 'wall leaves', rough = () => false } = {}) => {
			const cost = (c) => {
				if (c.includes('| door')) return 1;
				if (c.startsWith('floor water') && !c.includes('plank bridge')) return 8;
				if (c.startsWith('floor')) return BLOCKING.some((b) => c.includes('| ' + b)) ? Infinity : 1;
				if (c.startsWith('stair')) return 1;
				if (tree(c)) return 4;
				if (rough(c)) return 10;
				return Infinity;
			};
			const dist = new Float64Array(W * H).fill(Infinity), prev = new Int32Array(W * H).fill(-1);
			const heap = [[0, sx + sy * W]];
			dist[sx + sy * W] = 0;
			while (heap.length) {
				let bi = 0;
				for (let k = 1; k < heap.length; k++) if (heap[k][0] < heap[bi][0]) bi = k;
				const [d, i] = heap.splice(bi, 1)[0];
				if (d > dist[i]) continue;
				const x = i % W, y = (i - x) / W;
				for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
					const nx = x + dx, ny = y + dy;
					if (!inside(nx, ny) || nx === 0 || ny === 0 || nx === W - 1 || ny === H - 1) continue;
					const c = g[ny][nx];
					const nd = d + cost(c);
					if (nd < dist[nx + ny * W]) { dist[nx + ny * W] = nd; prev[nx + ny * W] = i; heap.push([nd, nx + ny * W]); }
				}
			}
			for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
				if (!g[y][x].includes('| door')) continue;
				let i = x + y * W;
				while (i >= 0 && i !== sx + sy * W) {
					const cx = i % W, cy = (i - cx) / W, c = g[cy][cx];
					if (tree(c) || rough(c)) g[cy][cx] = track;
					else if (c.startsWith('floor water') && !c.includes('plank bridge')) g[cy][cx] = 'floor water | plank bridge';
					i = prev[i];
				}
			}
		},
		/** Write the blueprint: one character a distinct cell, the same keys for both levels. */
		write: (file, name, about, preferred = {}) => {
			const POOL = [...'.,:;_=+#%&*~-^"\'`!?$@ABCDEFGHIJKLMNOPQRSUVWXYZabcdefghijklmnopqrstuvwxyz0123456789()[]/|\\'];
			const keyOf = new Map(Object.entries(preferred));
			const used = new Set(keyOf.values());
			const specs = new Set([...g.flat(), ...u.flat().filter(Boolean)]);
			for (const sp of specs) {
				if (keyOf.has(sp)) continue;
				const ch = POOL.find((c) => !used.has(c));
				if (!ch) throw new Error('out of key characters');
				keyOf.set(sp, ch); used.add(ch);
			}
			const twoLevels = u.some((r) => r.some(Boolean));
			const out = [
				'tachyon-blueprint 1',
				...about.map((l) => '# ' + l),
				`name ${name}`,
				`size ${W} ${H} ${twoLevels ? 2 : 1}`,
				...[...keyOf].filter(([sp]) => specs.has(sp)).map(([sp, ch]) => `key ${ch} ${sp}`),
				'level 0',
				...g.map((r) => r.map((sp) => keyOf.get(sp)).join('')),
				...(twoLevels ? ['level 1', ...u.map((r) => r.map((sp) => (sp ? keyOf.get(sp) : ' ')).join(''))] : []),
				...labels.map(([x, y, nm]) => `label ${x} ${y} ${nm}`),
				'end',
				''
			].join('\n');
			writeFileSync(file, out);
			const homes = g.flat().filter((c) => c.includes('| bed')).length + u.flat().filter((c) => c && c.includes('| bed')).length;
			const chairs = g.flat().filter((c) => c.includes('| chair')).length;
			console.log(JSON.stringify({ file: String(file).split('/').pop(), beds: homes, chairs, keys: keyOf.size }));
		}
	};
	return P;
}
