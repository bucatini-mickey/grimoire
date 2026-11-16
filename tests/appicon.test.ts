import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ICON, ICON_KEY, SHIPPED, SYMBOLS, applyIcon, loadIcon, manifestFor, normalise, renderIcon, sameIcon, saveIcon, symbolRows, tokenRows } from '../src/ui/appicon.ts';
import type { IconSpec, Store } from '../src/ui/appicon.ts';

const memory = (): Store & { data: Map<string, string> } => {
	const data = new Map<string, string>();
	return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } };
};
const px = (img: { w: number; rgba: Uint8Array }, x: number, y: number) => '#' + [0, 1, 2].map((k) => img.rgba[(y * img.w + x) * 4 + k].toString(16).padStart(2, '0')).join('');

test('the default icon is the book\'s capital G in a gold frame, as it always was', () => {
	const img = renderIcon(DEFAULT_ICON, 192);
	assert.equal(img.rgba.length, 192 * 192 * 4);
	assert.equal(px(img, 0, 0), DEFAULT_ICON.bg, 'the ground at the corner');
	const sq = Math.floor(192 * 0.72), x0 = Math.floor((192 - sq) / 2);
	assert.equal(px(img, x0, x0), DEFAULT_ICON.frame, 'the frame');
	assert.equal(px(img, x0 + 10, x0 + 10), DEFAULT_ICON.leaf, 'the leaf inside it');
	// The G's top bar, five cells across at sq/7 pixels a cell, starts one cell in.
	const k = Math.floor(sq / 7), gx = x0 + Math.floor((sq - 5 * k) / 2);
	assert.equal(px(img, gx + 2 * k, gx), DEFAULT_ICON.ink);
	assert.equal(px(img, gx, gx), DEFAULT_ICON.leaf, 'the G\'s first cell is empty');
});

test('every symbol draws inside its frame, in its ink, at every size', () => {
	for (const s of SYMBOLS) {
		const spec: IconSpec = normalise({ ...DEFAULT_ICON, symbol: s.id, letter: 'Q', frame: '#00ff00', ink: '#ff0000', bg: '#000001', leaf: '#0000ff' });
		for (const size of [12, 16, 28, 180, 192, 512]) {
			const img = renderIcon(spec, size);
			const sq = Math.floor(size * 0.72), x0 = Math.floor((size - sq) / 2);
			let ink = 0;
			for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
				const inside = x >= x0 && x < x0 + sq && y >= x0 && y < x0 + sq;
				if (px(img, x, y) === '#ff0000') { ink++; assert.ok(inside, `${s.id} at ${size}: ink outside the frame at ${x},${y}`); }
				if (!inside) assert.equal(px(img, x, y), '#000001', 'outside the frame is only the ground');
			}
			assert.ok(ink > 0, `${s.id} at ${size} shows its ink`);
		}
	}
});

test('a different design makes a different picture, and the pixels are crisp (only the four colours)', () => {
	const a = renderIcon(DEFAULT_ICON, 64), b = renderIcon({ ...DEFAULT_ICON, symbol: 'tower' }, 64);
	assert.notDeepEqual(a.rgba, b.rgba);
	const seen = new Set<string>();
	for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) seen.add(px(b, x, y));
	assert.ok([...seen].every((c) => [DEFAULT_ICON.bg, DEFAULT_ICON.leaf, DEFAULT_ICON.frame, DEFAULT_ICON.ink].includes(c)));
});

test('a character token is the capital of their name cut out of a round of ink', () => {
	const rows = tokenRows('T');
	assert.equal(rows.length, 11);
	assert.ok(rows.every((r) => r.length === 11));
	assert.ok(rows[0].includes('.') && rows[5].includes('o') && rows[5].includes('#'), 'round, edged in the frame colour');
	assert.equal(rows[3].slice(3, 8), 'LLLLL', 'the top bar of the T');
	assert.equal(rows[4].slice(3, 8), '##L##');
	assert.deepEqual(symbolRows({ ...DEFAULT_ICON, symbol: 'token', letter: 'T' }), rows);
	assert.notDeepEqual(tokenRows('A'), tokenRows('B'));
});

test('stored designs are cleaned: bad colours, symbols and letters fall back one by one', () => {
	assert.deepEqual(normalise(null), DEFAULT_ICON);
	assert.deepEqual(normalise('x'), DEFAULT_ICON);
	const n = normalise({ symbol: 'dragon', bg: 'red', leaf: '#ABCDEF', frame: 12, ink: '#0a0b0c', letter: 'z' });
	assert.equal(n.symbol, 'g');
	assert.equal(n.bg, DEFAULT_ICON.bg);
	assert.equal(n.leaf, '#abcdef');
	assert.equal(n.frame, DEFAULT_ICON.frame);
	assert.equal(n.ink, '#0a0b0c');
	assert.equal(n.letter, undefined, 'a letter only belongs to a token');
	assert.equal(normalise({ symbol: 'token', letter: 'zz' }).letter, 'A');
	assert.equal(normalise({ symbol: 'token', letter: 'z' }).letter, 'Z');
});

test('a design is kept in the browser; the default, or null, forgets it', () => {
	const store = memory();
	assert.equal(loadIcon(store), null);
	const mine: IconSpec = { ...DEFAULT_ICON, symbol: 'moon', ink: '#6f87a6' };
	saveIcon(mine, store);
	assert.ok(store.data.has(ICON_KEY));
	assert.deepEqual(loadIcon(store), mine);
	saveIcon({ ...DEFAULT_ICON }, store);
	assert.equal(loadIcon(store), null, 'the default is not kept: the shipped files are used');
	saveIcon(mine, store);
	saveIcon(null, store);
	assert.equal(loadIcon(store), null);
	store.setItem(ICON_KEY, '{not json');
	assert.equal(loadIcon(store), null, 'a broken record is ignored');
	assert.doesNotThrow(() => saveIcon(mine, null));
	assert.doesNotThrow(() => saveIcon(mine, { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } }));
	assert.ok(sameIcon(mine, { ...mine }));
	assert.ok(!sameIcon(mine, DEFAULT_ICON));
});

test('the manifest of a design names the icons and keeps the app at its own address', () => {
	const m = manifestFor({ src192: 'data:a', src512: 'data:b' }, 'https://bucatini-mickey.github.io/grimoire/index.html#grimoire');
	assert.equal(m.start_url, 'https://bucatini-mickey.github.io/grimoire/');
	assert.equal(m.scope, m.start_url);
	assert.equal(m.display, 'standalone');
	assert.deepEqual(m.icons.map((i) => [i.sizes, i.src]), [['192x192', 'data:a'], ['512x512', 'data:b']]);
});

test('applying a design sets the favicon, the apple-touch-icon and the manifest; null puts the shipped ones back', () => {
	const links: Record<string, string> = {};
	const doc = { querySelector: (sel: string) => ({ setAttribute: (k: string, v: string) => { assert.equal(k, 'href'); links[sel] = v; } }) };
	const asked: number[] = [];
	const made = applyIcon(doc, { ...DEFAULT_ICON, symbol: 'sun' }, (n) => { asked.push(n); return `png${n}`; }, (json) => 'blob:' + json.length, 'https://x.test/app/');
	assert.ok(made);
	assert.equal(links['link[rel="icon"]'], 'png192');
	assert.equal(links['link[rel="apple-touch-icon"]'], 'png180');
	assert.match(links['link[rel="manifest"]'], /^blob:\d+$/);
	assert.ok(asked.includes(512));
	assert.equal(applyIcon(doc, null, () => '', () => '', 'https://x.test/'), false);
	assert.equal(links['link[rel="icon"]'], SHIPPED.icon);
	assert.equal(links['link[rel="apple-touch-icon"]'], SHIPPED.icon);
	assert.equal(links['link[rel="manifest"]'], SHIPPED.manifest);
	// a page without a link just goes without
	assert.doesNotThrow(() => applyIcon({ querySelector: () => null }, DEFAULT_ICON, () => '', () => '', 'https://x.test/'));
});
