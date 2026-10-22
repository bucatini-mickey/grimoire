import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Grid } from '../src/term/pterm.ts';

test('vendored pterm matches Tachyon web/pterm.ts when ../Tachyon exists', (t) => {
	const theirs = new URL('../../Tachyon/web/pterm.ts', import.meta.url);
	if (!existsSync(theirs)) return t.skip('Tachyon not checked out beside Grimoire');
	assert.equal(readFileSync(new URL('../src/term/pterm.ts', import.meta.url), 'utf8'), readFileSync(theirs, 'utf8'));
});

test('grid draws text and boxes, and taps hit the topmost region', () => {
	const g = new Grid();
	g.resize(10, 4);
	g.box({ x: 0, y: 0, w: 6, h: 3 }, 4, 0, 'ab');
	assert.equal(g.toText().split('\n')[0], '+ ab +');
	let hit = '';
	g.hit({ x: 0, y: 0, w: 6, h: 3 }, () => (hit = 'under'));
	g.hit({ x: 1, y: 1, w: 2, h: 1 }, () => (hit = 'over'));
	g.hitAt(1, 1)!();
	assert.equal(hit, 'over');
	assert.equal(g.hitAt(9, 3), null);
});
