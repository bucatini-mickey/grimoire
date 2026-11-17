import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextStep, stepAction, suggestInfo } from '../src/core/index.ts';
import type { Command, GameState, Info, SeatId } from '../src/core/index.ts';
import { wakeFor } from '../src/net/views.ts';
import type { Wake } from '../src/net/views.ts';
import { pagesFor, record, recordChoice, recallIndex, shownPage, wakeOf } from '../src/net/history.ts';
import type { History } from '../src/net/history.ts';
import { handBackRows, handOverRows, nextPage, recallIndexRows, wakeRows } from '../src/ui/wakepages.ts';
import type { Page, PageHandlers } from '../src/ui/wakepages.ts';
import type { Button, Row } from '../src/ui/ascii.ts';
import { game, ok, playNight } from './helpers.ts';

// "Remind me" (grim-046): a player is handed the phone and reads again the pages they were shown, from the
// kept history only. The index per role, the pages replayed as shown, and nothing of anyone else's.

// 0 Ada imp, 1 Bram poisoner, 2 Cael drunk (thinks washerwoman), 3 Dorn empath, 4 Esme monk, 5 Fenn soldier, 6 Gwen fortune-teller
const base = () => game(['imp', 'poisoner', 'drunk', 'empath', 'monk', 'soldier', 'fortune-teller'], { drunkBelieves: 'washerwoman', redHerring: 4 });
const seating = (s: GameState) => ({ name: (id: SeatId) => s.seats[id].name, dead: (id: SeatId) => !s.seats[id].alive });

/** What main.ts does when the Storyteller hands the phone over: each page is recorded as it comes up. */
function showPages(h: History, s: GameState, w: Wake, picks: SeatId[] = [], first: Page = 'who'): void {
	const night = s.phase.kind === 'night' ? s.phase.n : 0;
	let page: Page = first;
	while (page !== 'done') {
		const e = shownPage(w, page, night, seating(s));
		if (e && w.seat !== null) record(h, w.seat, e);
		if (page === 'pick') { if (w.seat !== null) recordChoice(h, w.seat, w.id, picks); page = nextPage(w, 'pick'); continue; }
		page = nextPage(w, page);
	}
}

/** Play steps (true answers, harmless choices) until the next step is `kind`. */
function until(s: GameState, kind: string, by: Record<string, Command> = {}): GameState {
	for (let guard = 0; guard < 40; guard++) {
		const step = nextStep(s)!;
		if (step.kind === kind) return s;
		let cmd: Command = by[step.kind] ?? { type: 'acknowledge' };
		if (!by[step.kind] && stepAction(step.kind) === 'choose') cmd = { type: 'choose', target: step.seat === 5 ? 0 : 5 };
		if (!by[step.kind] && stepAction(step.kind) === 'tell') cmd = { type: 'tell', info: suggestInfo(s, step.kind, step.seat!, step.kind === 'fortune-teller' ? [0, 1] : [])! };
		s = ok(s, cmd);
	}
	assert.fail('never reached ' + kind);
}

const labels = (h: History, seat: SeatId) => recallIndex(h, seat).map((i) => (i.night === null ? '' : `N${i.night} `) + i.label);
const textOf = (rows: Row[]) => rows.map((r) => r.segs.map((s) => ('t' in s ? s.t : 'label' in s ? `[${s.label}]` : '')).join('')).join('\n');
const buttonsOf = (rows: Row[]): Button[] => rows.flatMap((r) => r.segs.filter((s): s is Button => 'label' in s));
const handlers = (over: Partial<PageHandlers> = {}): PageHandlers => ({ go() {}, toggle() {}, confirm() {}, finish() {}, ending: 'hand-back', name: (id) => String(id), deadAtDusk: () => false, ...over });

/** The Demon on night 1: shown who they are (with their Minions), then their bluffs. */
function demonShown(): { s: GameState; h: History } {
	const s = base();
	const h: History = {};
	showPages(h, s, wakeFor(s, nextStep(s)!));
	assert.equal(nextStep(s)!.seat, 0);
	return { s, h };
}

test('the Demon index: who I am, my Minions, my bluffs', () => {
	const { h } = demonShown();
	assert.deepEqual(labels(h, 0), ['Who I am', 'My Minions', 'My bluffs']);
	const items = recallIndex(h, 0);
	// "Who I am" and "My Minions" are the one page, which holds the role, ability, team and Minions together.
	assert.equal(items[0].entry.id, items[1].entry.id);
	assert.equal(items[0].entry.kind, 'evil-team');
	assert.equal(items[2].entry.kind, 'bluffs');
});

test('a Minion index: who I am, my Demon, then the choice made that night', () => {
	let s = ok(base(), { type: 'acknowledge' });
	const h: History = {};
	showPages(h, s, wakeFor(s, nextStep(s)!), [4]);
	assert.equal(nextStep(s)!.seat, 1);
	assert.deepEqual(labels(h, 1), ['Who I am', 'My Demon', 'N1 Whom I chose']);
	assert.ok(!labels(h, 1).includes('My bluffs'), 'only the Demon has bluffs');
	s = until(s, 'empath');
});

test('a Washerwoman index: who I am, and what I learned on night 1', () => {
	const s = until(ok(base(), { type: 'acknowledge' }), 'washerwoman', { poisoner: { type: 'choose', target: 4 } });
	// (the Drunk is woken as the Washerwoman: what they are shown is what they get back)
	const info: Info = { kind: 'pair', players: [4, 6], character: 'soldier' };
	const h: History = {};
	showPages(h, s, wakeFor(s, nextStep(s)!, info));
	assert.deepEqual(labels(h, 2), ['Who I am', 'N1 What I learned']);
	const [, learned] = recallIndex(h, 2);
	const text = textOf(wakeRows(wakeOf(learned.entry, 2), learned.entry.page, [], handlers({ recall: () => {} })));
	assert.match(text, /Soldier/);
	assert.match(text, /Esme/);
	assert.ok(!/drunk/i.test(text + JSON.stringify(recallIndex(h, 2))), 'the Drunk is never named to themselves');
	// (the name itself is lettered large, so it is in the page's words rather than its plain text)
	const who = recallIndex(h, 2)[0].entry;
	assert.deepEqual(who.sections.find((x) => x.title === 'You are')?.lines, ['the Washerwoman']);
	assert.match(textOf(wakeRows(wakeOf(who, 2), 'who', [], handlers({ recall: () => {} }))), /Your ability/);
});

test('a seat shown nothing yet has an empty index, and says so', () => {
	const { h } = demonShown();
	assert.deepEqual(recallIndex(h, 5), []);
	assert.deepEqual(recallIndex({}, 3), []);
	const text = textOf(recallIndexRows('Fenn', undefined, [], () => {}));
	assert.match(text, /Nothing yet/);
	assert.match(text, /\[Hand the phone back\]/);
});

test('the bluffs stay reachable on later nights, with the nights after them in order', () => {
	let s = base();
	const h: History = {};
	showPages(h, s, wakeFor(s, nextStep(s)!));
	// Night 1 through, then day 1, then night 2: the Imp is woken and chooses.
	s = ok(playNight(s), { type: 'end-day' });
	assert.equal(s.phase.kind === 'night' && s.phase.n, 2);
	const step = until(s, 'imp');
	const w = wakeFor(step, nextStep(step)!);
	showPages(h, step, w, [3]);
	const got = labels(h, 0);
	assert.deepEqual(got, ['Who I am', 'My Minions', 'My bluffs', 'N2 Whom I chose'], 'the plain "You are the Imp" of night 2 adds nothing new');
	const bluffs = recallIndex(h, 0).find((i) => i.label === 'My bluffs')!;
	assert.deepEqual(bluffs.entry.sections[0].roles, s.bluffs);
	assert.equal(bluffs.entry.night, 1);
	// It is the bluffs page as drawn, with the same characters, on night 2 as on night 1.
	const text = textOf(wakeRows(wakeOf(bluffs.entry, 0), 'bluffs', [], handlers({ recall: () => {} })));
	assert.equal(bluffs.entry.sections[0].lines.length, s.bluffs.length, 'all the bluffs, as they were shown');
	assert.match(text, /Your bluffs/);
	assert.match(text, /\[Back to my pages\]/);
});

test('a recalled page is drawn exactly as it was shown, with the way on back to the index', () => {
	let s = ok(base(), { type: 'acknowledge' });
	const h: History = {};
	const w = wakeFor(s, nextStep(s)!);
	showPages(h, s, w, [4]);
	s = until(s, 'empath');
	for (const item of recallIndex(h, 1)) {
		const e = item.entry;
		const options = Object.fromEntries((e.choice?.options ?? []).map((o) => [o.id, o.name])) as Record<number, string>;
		let back = 0;
		const recalled = wakeRows(wakeOf(e, 1), e.page, e.choice?.chosen ?? [], handlers({ recall: () => { back++; }, name: (id) => options[id] ?? s.seats[id].name }));
		const buttons = buttonsOf(recalled);
		const way = buttons.find((b) => b.label === 'Back to my pages');
		assert.ok(way, item.label);
		way.act();
		assert.equal(back, 1);
		assert.ok(!buttons.some((b) => b.label === 'Confirm' || b.label === 'Next'), 'no way to choose again or turn on: ' + item.label);
		// Apart from that button, the page is the page shown.
		const shown = wakeRows(w, e.page, e.choice?.chosen ?? [], handlers({ name: (id) => options[id] ?? s.seats[id].name }));
		const strip = (rows: Row[]) => textOf(rows).replace(/\[(Next|Back to my pages|Back|Confirm)\]/g, '');
		assert.equal(strip(recalled).replace(/\s+/g, ' '), strip(shown).replace(/\s+/g, ' '), item.label);
	}
	// A choice is shown as it was made.
	const choice = recallIndex(h, 1).find((i) => i.label === 'Whom I chose')!;
	assert.deepEqual(choice.entry.choice?.chosen, [4]);
});

test('the page that hands the phone back shows nothing of any seat', () => {
	const { s, h } = demonShown();
	showPages(h, s, wakeFor(s, nextStep(ok(s, { type: 'acknowledge' }))!), [4]);
	const names = s.seats.map((x) => x.name);
	const secrets = ['Poisoner', 'Imp', 'Drunk', 'Washerwoman', 'Empath', 'Monk', 'Soldier', 'Fortune', 'Demon', 'Minion', 'bluff', ...s.bluffs.map((b) => b.replace(/-/g, ' '))];
	const back = textOf(handBackRows(() => {}));
	for (const x of [...names, ...secrets]) assert.ok(!back.toLowerCase().includes(x.toLowerCase().replace('minions', 'minion')), `the hand-back page mentions ${x}`);
	assert.match(back, /hand the phone back/i);
	assert.deepEqual(buttonsOf(handBackRows(() => {})).map((b) => b.label), ['Storyteller: holding the phone']);
	// The page that names who takes the phone is the same for anyone: their name and nothing of theirs.
	const over = textOf(handOverRows('Ada', () => {}, { line: 'Everyone else, look away.', cancel: () => {} }));
	assert.match(over, /look away/);
	for (const x of ['Imp', 'Demon', 'bluff', 'Bram']) assert.ok(!over.includes(x));
});

test('one seat’s index holds only that seat’s pages', () => {
	const { s, h } = demonShown();
	const s1 = ok(s, { type: 'acknowledge' });
	showPages(h, s1, wakeFor(s1, nextStep(s1)!), [4]);
	const adaPages = JSON.stringify(recallIndex(h, 0));
	const bramPages = JSON.stringify(recallIndex(h, 1));
	assert.ok(!adaPages.includes('Poison') && !adaPages.includes('"Whom I chose"'));
	assert.ok(!bramPages.includes('bluffs') && !bramPages.includes('Your Minions'));
	// and the index text lists names only on a page opened, never on the index itself
	const idx = textOf(recallIndexRows('Ada', 'imp', recallIndex(h, 0).map((i) => ({ label: i.label, night: i.night, open() {} })), () => {}));
	for (const x of s.seats.slice(1).map((x) => x.name)) assert.ok(!idx.includes(x), x + ' is on Ada’s index');
});

test('a page shown twice (backed out and shown again differently) is listed once per showing', () => {
	const s = until(ok(base(), { type: 'acknowledge' }), 'washerwoman', { poisoner: { type: 'choose', target: 4 } });
	const step = nextStep(s)!;
	const h: History = {};
	showPages(h, s, wakeFor(s, step, { kind: 'pair', players: [5, 6], character: 'butler' }), [], 'info');
	showPages(h, s, wakeFor(s, step, { kind: 'pair', players: [4, 6], character: 'butler' }), [], 'info');
	assert.deepEqual(labels(h, 2), ['N1 What I learned (showing 1)', 'N1 What I learned (showing 2)']);
	const keys = new Set(recallIndex(h, 2).map((i) => i.key));
	assert.equal(keys.size, 2);
});

test('dead players can still recall: the index reads the kept pages, not the game', () => {
	const { s, h } = demonShown();
	const before = JSON.stringify(recallIndex(h, 0));
	const dead = ok(s, { type: 'adjust', seat: 0, alive: false });
	assert.equal(dead.seats[0].alive, false);
	assert.equal(JSON.stringify(recallIndex(h, 0)), before);
	assert.equal(recallIndex.length, 2, 'it takes the history and a seat, nothing from the game');
	// and asking again changes nothing kept
	const kept = JSON.stringify(pagesFor(h, 0));
	recallIndex(h, 0);
	assert.equal(JSON.stringify(pagesFor(h, 0)), kept);
});
