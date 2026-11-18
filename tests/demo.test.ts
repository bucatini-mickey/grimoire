import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/core/index.ts';
import { stepRole, wakeFor } from '../src/net/views.ts';
import { demoGame, isDemo } from '../src/ui/demo.ts';

// The demo screens (#demo=bluffs, #demo=scarlet-woman) are the review snapshots' way to the changed pages (grim-043):
// each must land on the step and page it names, using only the commands play uses.

test('only the named demos are demos', () => {
	assert.ok(isDemo('bluffs') && isDemo('scarlet-woman'));
	assert.ok(!isDemo('') && !isDemo('constructor') && !isDemo('village'));
});

test('#demo=bluffs opens the Demon’s "Your bluffs" page with three bluffs', async () => {
	const { nextPage, wakeRows } = await import('../src/ui/wakepages.ts');
	const d = demoGame('bluffs');
	const step = G.nextStep(d.state)!;
	assert.equal(step.id, d.step);
	assert.equal(step.kind, G.DEMON_INFO);
	assert.equal(d.page, 'bluffs');
	// the log replays to the same game, so what is shown is what play would show
	assert.deepEqual(G.replay(d.events).seats, d.state.seats);
	const w = wakeFor(d.state, step);
	assert.equal(w.sections.find((s) => s.title === 'Not in play')?.lines.length, 3);
	assert.equal(nextPage(w, 'who'), 'bluffs', 'the way on from the Demon’s first page is the bluffs');
	const rows = wakeRows(w, 'bluffs', [], { go() {}, toggle() {}, confirm() {}, finish() {}, ending: 'hand-back', name: () => '', deadAtDusk: () => false });
	const text = rows.map((r) => r.segs.map((s) => ('t' in s ? s.t : '')).join('')).join('\n');
	assert.match(text, /Your bluffs/);
});

test('#demo=scarlet-woman opens the Scarlet Woman’s "You are" page, whose name sets on two lines', async () => {
	const { nameLines } = await import('../src/ui/ascii.ts');
	const d = demoGame('scarlet-woman');
	const step = G.nextStep(d.state)!;
	assert.equal(step.id, d.step);
	assert.equal(step.kind, G.MINION_INFO);
	assert.equal(d.page, 'who');
	assert.equal(stepRole(d.state, step.kind, step.seat), 'scarlet-woman');
	const you = wakeFor(d.state, step).sections.find((s) => s.title === 'You are')!;
	assert.equal(you.style, 'big');
	assert.deepEqual(nameLines(you.lines[0].replace(/^the /i, '')), ['Scarlet', 'Woman']);
});

test('#demo=recall and #demo=recall-page open the Demon’s "Remind me" index and its bluffs page, from kept pages only', async () => {
	const { recallIndex } = await import('../src/net/history.ts');
	assert.ok(isDemo('recall') && isDemo('recall-page'));
	const idx = demoGame('recall');
	assert.ok(idx.history && idx.recall);
	assert.equal(idx.recall.open, null);
	assert.deepEqual(recallIndex(idx.history, idx.recall.seat).map((i) => i.label), ['Who I am', 'My Minions', 'My bluffs']);
	const page = demoGame('recall-page');
	const bluffs = recallIndex(page.history!, page.recall!.seat).find((i) => i.label === 'My bluffs')!;
	assert.equal(page.recall!.open, bluffs.key);
	assert.deepEqual(G.replay(page.events).seats, page.state.seats);
});

test('#demo=recall-confirm opens on the "Hand to <name>?" question, and the others on the pages', () => {
	assert.ok(isDemo('recall-confirm'));
	const c = demoGame('recall-confirm');
	assert.equal(c.recall!.turn, 0);
	assert.equal(c.state.seats[c.recall!.seat].name, 'Ada');
	assert.equal(demoGame('recall').recall!.turn, 2);
	assert.equal(demoGame('recall-page').recall!.turn, 2);
});
