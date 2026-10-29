import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/core/index.ts';
import { HOW_TO_PLAY, INTERACTIONS, TIPS } from '../src/core/codex.ts';

// The codex has first thoughts for every character of the scripts the app plays, and its pages say something.
test('every character of every script has first thoughts in the codex', () => {
	const missing = Object.values(G.SCRIPTS).flatMap((s) => s.characters.map((c) => c.id)).filter((id) => !TIPS[id]?.length);
	assert.deepEqual([...new Set(missing)], []);
});

test('the codex pages have headings and words', () => {
	for (const p of [HOW_TO_PLAY, INTERACTIONS]) {
		assert.ok(p.lines.some((l) => l.startsWith('## ')), p.title);
		assert.ok(p.lines.filter((l) => !l.startsWith('## ')).every((l) => l.length > 20), p.title);
	}
});
