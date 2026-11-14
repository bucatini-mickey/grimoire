import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Grid, figurePx } from '../src/term/pterm.ts';

test('vendored pterm matches Tachyon web/pterm.ts when ../Tachyon exists (bar the figure box Grimoire fixed first)', (t) => {
	const theirs = new URL('../../Tachyon/web/pterm.ts', import.meta.url);
	if (!existsSync(theirs)) return t.skip('Tachyon not checked out beside Grimoire');
	// grim-030 fixed the figure box here; those lines differ until Tachyon takes the same change.
	const plain = (src: string) => {
		const a = src.indexOf('/**\n * The font size, in whole pixels');
		const b = src.indexOf('/** The cell buffer');
		if (a >= 0 && b > a) src = src.slice(0, a) + src.slice(b);
		return src.split('\n').filter((l) => !/--pt-fig|\.pt-row i\.f\{|the figure is a whole-pixel|never clips, so a mark|one outside ASCII, a face/.test(l)).join('\n');
	};
	assert.equal(plain(readFileSync(new URL('../src/term/pterm.ts', import.meta.url), 'utf8')), plain(readFileSync(theirs, 'utf8')));
});

test('a figure glyph is a whole-pixel size that never exceeds its line (grim-030: phones cut the top and bottom)', () => {
	for (let font = 8; font <= 48; font++) {
		const lh = Math.round(font * 1.2); // the line height fit() sets
		const px = figurePx(font, lh);
		assert.ok(Number.isInteger(px), `font ${font}: ${px}px is not whole`);
		assert.ok(px <= lh, `font ${font}: figure ${px}px is taller than its ${lh}px line`);
		assert.ok(px >= font, `font ${font}: figure ${px}px is smaller than the text`);
	}
});

test('the figure rule takes its size from fit() and does not clip', () => {
	const src = readFileSync(new URL('../src/term/pterm.ts', import.meta.url), 'utf8');
	const rule = /\.pt-row i\.f\{([^}]*)\}/.exec(src)![1];
	assert.match(rule, /font-size:var\(--pt-fig/);
	assert.match(rule, /overflow:visible/);
	assert.doesNotMatch(rule, /1\.5em/);
	assert.match(src, /setProperty\('--pt-fig'/);
});

test('grid draws text and boxes, and taps hit the topmost region', () => {
	const g = new Grid();
	g.resize(10, 4);
	g.box({ x: 0, y: 0, w: 8, h: 3 }, 4, 0, 'ab');
	assert.equal(g.toText().split('\n')[0], '+- ab -+');
	let hit = '';
	g.hit({ x: 0, y: 0, w: 6, h: 3 }, () => (hit = 'under'));
	g.hit({ x: 1, y: 1, w: 2, h: 1 }, () => (hit = 'over'));
	g.hitAt(1, 1)!();
	assert.equal(hit, 'over');
	assert.equal(g.hitAt(9, 3), null);
});
