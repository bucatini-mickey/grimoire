import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { nextStep, stepAction, suggestInfo } from '../src/core/index.ts';
import type { Command, GameState, Info, SeatId } from '../src/core/index.ts';
import { cardFor, infoSections, logEntry, publicView, scriptSheet, wakeFor } from '../src/net/views.ts';
import type { Wake } from '../src/net/views.ts';
import { pagesFor, record, recordChoice, reviveHistory, shownPage, wakeOf } from '../src/net/history.ts';
import type { History } from '../src/net/history.ts';
import { nextPage, wakeRows } from '../src/ui/wakepages.ts';
import type { Page, PageHandlers } from '../src/ui/wakepages.ts';
import { game, ok } from './helpers.ts';

// 0 Ada imp, 1 Bram poisoner, 2 Cael drunk (thinks washerwoman), 3 Dorn empath, 4 Esme monk, 5 Fenn soldier, 6 Gwen fortune-teller
const base = () => game(['imp', 'poisoner', 'drunk', 'empath', 'monk', 'soldier', 'fortune-teller'], { drunkBelieves: 'washerwoman', redHerring: 4 });

const seating = (s: GameState) => ({ name: (id: SeatId) => s.seats[id].name, dead: (id: SeatId) => !s.seats[id].alive });

/** What main.ts does when the Storyteller hands the phone over: each page is recorded as it comes up. */
function showPages(h: History, s: GameState, w: Wake, picks: SeatId[] = [], first: Page = 'who'): Page[] {
	const shown: Page[] = [];
	const night = s.phase.kind === 'night' ? s.phase.n : 0;
	let page: Page = first;
	while (page !== 'done') {
		const e = shownPage(w, page, night, seating(s));
		if (e && w.seat !== null) { record(h, w.seat, e); shown.push(page); }
		if (page === 'pick') { if (w.seat !== null) recordChoice(h, w.seat, w.id, picks); page = nextPage(w, 'pick'); continue; }
		page = nextPage(w, page);
	}
	return shown;
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

const plain = (h: History, seat: SeatId) => JSON.stringify(h[seat]);
const handlers = (names: Record<number, string>): PageHandlers => ({ go() {}, toggle() {}, confirm() {}, finish() {}, ending: 'hand-back', name: (id) => names[id], deadAtDusk: () => false });

test('a seat has each page it was shown, in order, with its kind and the night', () => {
	const s = base();
	const h: History = {};
	// The Demon: its role page (with its Minions), then its bluffs.
	const step = nextStep(s)!;
	assert.equal(step.seat, 0);
	assert.deepEqual(showPages(h, s, wakeFor(s, step)), ['who', 'bluffs']);
	const [who, bluffs] = pagesFor(h, 0);
	assert.equal(who.kind, 'evil-team');
	assert.equal(who.night, 1);
	assert.equal(who.role, 'imp');
	const titles = who.sections.map((x) => x.title);
	assert.ok(titles.includes('You are') && titles.includes('Your ability') && titles.includes('Your team') && titles.includes('Your Minions'));
	assert.ok(!titles.includes('Not in play'), 'the bluffs are their own page');
	assert.equal(bluffs.kind, 'bluffs');
	assert.deepEqual(bluffs.sections[0].roles, s.bluffs);
	assert.deepEqual(Object.keys(h), ['0'], 'only the Demon has a history');
});

test('a Minion first page names the Demon; a plain Townsfolk gets their role, then the result', () => {
	let s = ok(base(), { type: 'acknowledge' });
	const h: History = {};
	showPages(h, s, wakeFor(s, nextStep(s)!, null));
	const [m] = pagesFor(h, 1);
	assert.equal(m.kind, 'evil-team');
	assert.deepEqual(m.sections.find((x) => x.title === 'Your Demon')?.lines, ['Ada']);
	s = until(s, 'empath');
	showPages(h, s, wakeFor(s, nextStep(s)!, { kind: 'number', value: 0 }));
	assert.deepEqual(pagesFor(h, 3).map((p) => p.kind), ['role', 'night-result']);
});

test('a choosing wake is kept as a choice page with whom they could pick and whom they chose', () => {
	const s = ok(base(), { type: 'acknowledge' });
	const h: History = {};
	const w = wakeFor(s, nextStep(s)!);
	assert.deepEqual(showPages(h, s, w, [4]), ['who', 'pick']);
	const c = pagesFor(h, 1).find((p) => p.kind === 'choice')!;
	assert.equal(c.choice?.prompt, 'Choose a player to poison');
	assert.deepEqual(c.choice?.chosen, [4]);
	assert.equal(c.choice?.options.length, 7);
	assert.equal(c.choice?.options.find((o) => o.id === 4)?.name, 'Esme');
});

test('the Spy look at the grimoire is kept as shown', () => {
	let s = game(['imp', 'poisoner', 'spy', 'empath', 'monk', 'soldier', 'fortune-teller'], { redHerring: 4 });
	s = until(s, 'spy');
	const h: History = {};
	showPages(h, s, wakeFor(s, nextStep(s)!));
	const g = pagesFor(h, 2).find((p) => p.kind === 'grimoire')!;
	assert.equal(g.grimoire?.lines.length, 7);
});

test('a page shown twice unchanged is kept once; shown again with another answer it is a second showing', () => {
	const s = until(ok(base(), { type: 'acknowledge' }), 'washerwoman', { poisoner: { type: 'choose', target: 4 } });
	const h: History = {};
	const a: Info = { kind: 'pair', players: [5, 6], character: 'butler' };
	const b: Info = { kind: 'pair', players: [4, 6], character: 'butler' };
	const step = nextStep(s)!;
	showPages(h, s, wakeFor(s, step, a), [], 'info');
	showPages(h, s, wakeFor(s, step, a), [], 'info');
	assert.equal(pagesFor(h, 2).length, 1);
	showPages(h, s, wakeFor(s, step, b), [], 'info');
	const pages = pagesFor(h, 2);
	assert.deepEqual(pages.map((p) => p.showing), [1, 2]);
	assert.notEqual(JSON.stringify(pages[0].sections), JSON.stringify(pages[1].sections));
});

test('the Drunk history holds the false information they were given and their pretend role, never the truth', () => {
	const s = until(ok(base(), { type: 'acknowledge' }), 'washerwoman', { poisoner: { type: 'choose', target: 4 } });
	const step = nextStep(s)!;
	assert.equal(step.seat, 2);
	// Cael is the Drunk: neither Esme nor Gwen is the Soldier, but a Drunk may be told so.
	const lie: Info = { kind: 'pair', players: [4, 6], character: 'soldier' };
	const truth = suggestInfo(s, 'washerwoman', 2, [])!;
	assert.notDeepEqual(truth, lie);
	ok(s, { type: 'tell', info: lie }); // the engine accepts it for a Drunk
	const h: History = {};
	showPages(h, s, wakeFor(s, step, lie));
	const mine = pagesFor(h, 2);
	const result = mine.find((p) => p.kind === 'night-result')!;
	assert.deepEqual(result.sections.flatMap((x) => x.lines), ['One of these is the', 'Soldier', 'Esme', 'Gwen']);
	const everything = plain(h, 2);
	assert.ok(everything.includes('Washerwoman'));
	assert.ok(!/drunk/i.test(everything), 'the Drunk is never named to themselves');
	assert.equal(mine[0].role, 'washerwoman');
	assert.notDeepEqual(result.sections, infoSections(s, 'washerwoman', truth), 'what the Washerwoman would truly learn is not what was kept');
});

test('a poisoned player history holds the false number they were given', () => {
	// Bram poisons Dorn (the Empath, between Cael and Esme: both good, so the truth is 0).
	const s = until(ok(base(), { type: 'acknowledge' }), 'empath', { poisoner: { type: 'choose', target: 3 } });
	const step = nextStep(s)!;
	assert.equal(step.seat, 3);
	assert.deepEqual(suggestInfo(s, 'empath', 3, []), { kind: 'number', value: 0 });
	const lie: Info = { kind: 'number', value: 2 };
	ok(s, { type: 'tell', info: lie });
	const h: History = {};
	showPages(h, s, wakeFor(s, step, lie));
	const result = pagesFor(h, 3).find((p) => p.kind === 'night-result')!;
	assert.deepEqual(result.sections.flatMap((x) => x.lines).slice(-1), ['2']);
	assert.ok(!plain(h, 3).includes('"0"'), 'the true 0 was never shown, so it is not kept');
	assert.ok(!/poison/i.test(plain(h, 3)), 'nothing tells them they are poisoned');
});

test('a kept page draws exactly as it was drawn', () => {
	const s = ok(base(), { type: 'acknowledge' });
	const names = Object.fromEntries(s.seats.map((x) => [x.id, x.name]));
	const emp = until(s, 'empath');
	const cases: [GameState, Wake, SeatId[]][] = [
		[base(), wakeFor(base(), nextStep(base())!), []],
		[s, wakeFor(s, nextStep(s)!), [4]],
		[emp, wakeFor(emp, nextStep(emp)!, { kind: 'number', value: 1 }), []]
	];
	for (const [st, w, picks] of cases) {
		const h: History = {};
		showPages(h, st, w, picks);
		for (const e of pagesFor(h, w.seat!)) {
			const again = wakeOf(e, w.seat!);
			const optionNames = Object.fromEntries((e.choice?.options ?? []).map((o) => [o.id, o.name])) as Record<number, string>;
			const original = JSON.stringify(wakeRows(w, e.page, picks, handlers(names)));
			const recalled = JSON.stringify(wakeRows(again, e.page, e.choice?.chosen ?? [], handlers(e.choice ? optionNames : names)));
			assert.equal(recalled, original, `${w.id} ${e.page}`);
		}
	}
});

test('saved games: history survives a save and load, and an older save loads with none', () => {
	const s = base();
	const h: History = {};
	showPages(h, s, wakeFor(s, nextStep(s)!));
	const saved = JSON.parse(JSON.stringify({ events: [], marks: [], history: h })) as { history: unknown };
	assert.deepEqual(reviveHistory(saved.history), h);
	// older saves have no history field; damaged ones load empty rather than throwing
	for (const raw of [undefined, null, {}, [], 'x', 7, { 0: 'junk' }, { 0: [{ id: 5 }] }, { x: [] }]) assert.deepEqual(reviveHistory(raw), {}, JSON.stringify(raw));
	// a good page next to a bad one keeps the good one
	const mixed = reviveHistory({ 0: [{ junk: 1 }, ...h[0]] });
	assert.equal(mixed[0].length, h[0].length);
});

test('the history is Storyteller-side: no view, card, sheet or log carries it, and nothing in net/ can send it', () => {
	const s = base();
	const h: History = {};
	showPages(h, s, wakeFor(s, nextStep(s)!));
	assert.ok(!('history' in s), 'GameState has no history');
	for (const out of [publicView(s), scriptSheet(s), cardFor(s, 0), logEntry(wakeFor(s, nextStep(s)!), 1)]) assert.ok(!/history|"showing"|night-result|evil-team/.test(JSON.stringify(out)));
	// Only history.ts itself mentions it in net/; main.ts keeps it out of anything it sends to a phone.
	for (const f of readdirSync('src/net').filter((x) => x !== 'history.ts')) assert.ok(!/history/i.test(readFileSync('src/net/' + f, 'utf8')), f + ' mentions the history');
	const main = readFileSync('src/ui/main.ts', 'utf8').split('\n');
	main.forEach((line, i) => {
		if (!/\bhistory\b|\bH\./.test(line)) return;
		assert.ok(!/sendTo|broadcast|village|JSON\.stringify\(\{ view/.test(line), `main.ts line ${i + 1} puts history near a send: ${line.trim()}`);
	});
});
