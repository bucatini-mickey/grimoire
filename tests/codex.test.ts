import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/core/index.ts';
import { CREDITS, HOW_TO_PLAY, INTERACTIONS, TIPS } from '../src/core/codex.ts';

// The codex has first thoughts for every character of the scripts the app plays, and its pages say something.
test('every character of every script has first thoughts in the codex', () => {
	const missing = Object.values(G.SCRIPTS).flatMap((s) => s.characters.map((c) => c.id)).filter((id) => !TIPS[id]?.length);
	assert.deepEqual([...new Set(missing)], []);
});

test('the codex pages have headings and words', () => {
	for (const p of [HOW_TO_PLAY, INTERACTIONS, CREDITS]) {
		assert.ok(p.lines.some((l) => l.startsWith('## ')), p.title);
		assert.ok(p.lines.filter((l) => !l.startsWith('## ')).every((l) => l.length > 20), p.title);
	}
});

// Long names of two or more words are set on two lines in the codex; short names and single words stay on one.
test('nameLines wraps long multi-word names at a space and leaves the rest', async () => {
	const { nameLines } = await import('../src/ui/ascii.ts');
	assert.deepEqual(nameLines('Fortune Teller'), ['Fortune', 'Teller']);
	assert.deepEqual(nameLines('Devil’s Advocate'), ['Devil’s', 'Advocate']);
	assert.deepEqual(nameLines('Spirit of Ivory'), ['Spirit', 'of Ivory']);
	assert.deepEqual(nameLines('Deus ex Fiasco'), ['Deus ex', 'Fiasco']);
	for (const short of ['Town Crier', 'Evil Twin', 'Tea Lady', 'Fang Gu', 'Empath', 'Washerwoman']) assert.deepEqual(nameLines(short), [short]);
});

test('wrapping never changes a name: every character name rejoins from its lines', async () => {
	const { nameLines } = await import('../src/ui/ascii.ts');
	const names = Object.values(G.SCRIPTS).flatMap((s) => [...s.characters, ...(s.travellers ?? [])].map((c) => c.name)).concat(G.FABLED.map((f) => f.name));
	for (const n of names) {
		const lines = nameLines(n);
		assert.ok(lines.length <= 2, n);
		assert.equal(lines.join(' '), n);
	}
});

test('a wrapped name is one block, so its two lines never part across the leaves of the open book', async () => {
	const { namePlates, nameLines } = await import('../src/ui/ascii.ts');
	const two = namePlates(nameLines('Fortune Teller'));
	const one = namePlates(nameLines('Empath'));
	assert.equal(one?.block?.h, 6);
	assert.equal(two?.block?.h, 12);
});

test('the credits say it is an unofficial fan project and name the owner of the game', () => {
	const text = CREDITS.lines.join(' ');
	assert.match(text, /Pandemonium Institute/);
	assert.match(text, /unofficial/i);
	assert.match(text, /not affiliated/i);
	assert.match(text, /do not own/i);
});
