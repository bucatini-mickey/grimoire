import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { getScript, nextStep, setupSummary, scriptJson, summaryFileName } from '../src/core/index.ts';
import type { GameState, SeatId } from '../src/core/index.ts';
import { wakeFor } from '../src/net/views.ts';
import type { Wake } from '../src/net/views.ts';
import { forgetAfter, pagesFor, record, recordChoice, recallIndex, shownPage } from '../src/net/history.ts';
import type { History } from '../src/net/history.ts';
import { nextPage } from '../src/ui/wakepages.ts';
import type { Page } from '../src/ui/wakepages.ts';
import { recallRows, startRecall } from '../src/ui/recallflow.ts';
import type { Recall, RecallDeps } from '../src/ui/recallflow.ts';
import type { Button, Row } from '../src/ui/ascii.ts';
import { game, ok, playNight } from './helpers.ts';

// Review of "Remind me" (grim-047): the phone must not be handed to the wrong person, a page must not lead to
// another seat's page, nothing recalled stays on screen, in the title, in undo or in the log, and the
// history never leaves the Storyteller's phone (the share/export holds none of it).

// 0 Ada imp, 1 Bram poisoner, 2 Cael scarlet woman (a second Minion), 3 Dorn empath, 4 Esme monk, 5 Fenn soldier, 6 Gwen fortune-teller
const base = () => game(['imp', 'poisoner', 'scarlet-woman', 'empath', 'monk', 'soldier', 'fortune-teller'], { redHerring: 4 });
const seating = (s: GameState) => ({ name: (id: SeatId) => s.seats[id].name, dead: (id: SeatId) => !s.seats[id].alive });

/** What main.ts does as the phone is shown: every page is recorded as it comes up. */
function showPages(h: History, s: GameState, w: Wake, picks: SeatId[] = []): void {
	const night = s.phase.kind === 'night' ? s.phase.n : 0;
	let page: Page = 'who';
	while (page !== 'done') {
		const e = shownPage(w, page, night, seating(s));
		if (e && w.seat !== null) record(h, w.seat, e);
		if (page === 'pick') { if (w.seat !== null) recordChoice(h, w.seat, w.id, picks); page = nextPage(w, 'pick'); continue; }
		page = nextPage(w, page);
	}
}

/** The first night's first three wakes (a Minion, the Demon, the Poisoner who chooses Esme), each shown their pages. */
function firstNight(): { s: GameState; h: History } {
	let s = base();
	const h: History = {};
	for (let i = 0; i < 3; i++) {
		const step = nextStep(s)!;
		showPages(h, s, wakeFor(s, step), step.kind === 'poisoner' ? [4] : []);
		s = ok(s, step.kind === 'poisoner' ? { type: 'choose', target: 4 } : { type: 'acknowledge' });
	}
	return { s, h };
}

const textOf = (rows: Row[]) => rows.map((r) => r.segs.map((x) => ('t' in x ? x.t : 'label' in x ? `[${x.label}]` : '')).join('')).join('\n');
const buttonsOf = (rows: Row[]): Button[] => rows.flatMap((r) => r.segs.filter((x): x is Button => 'label' in x));
const find = (rows: Row[], label: string): Button => {
	const b = buttonsOf(rows).find((x) => x.label === label);
	assert.ok(b, `no "${label}" button in\n${textOf(rows)}`);
	return b;
};

/** A "Remind me" screen over this history, with a count of what it was asked to do. */
function screen(h: History, s: GameState) {
	const calls = { render: 0, close: 0 };
	const d: RecallDeps = { history: h, name: (id) => s.seats[id].name, render: () => { calls.render++; }, close: () => { calls.close++; } };
	return { calls, d };
}

const src = (f: string) => readFileSync(f, 'utf8');
/** The body of `function name(` in a source file (up to the next top-level function or section comment). */
const bodyOf = (code: string, name: string): string => {
	const at = code.indexOf(`function ${name}(`);
	assert.ok(at >= 0, name + ' not found');
	const end = code.slice(at + 1).search(/\n(?:\/\*\*|\/\/ ----|function |async function )/);
	return code.slice(at, end < 0 ? undefined : at + 1 + end);
};

// ---- a deliberate step before anything is shown ------------------------------------------------

test('Remind me starts on "Hand to <name>?", which names the seat and shows nothing of it', () => {
	const { s, h } = firstNight();
	const { calls, d } = screen(h, s);
	const r = startRecall(0);
	assert.equal(r.turn, 0);
	const rows = recallRows(r, d);
	const text = textOf(rows);
	assert.match(text, /Hand to Ada\?/);
	assert.deepEqual(buttonsOf(rows).map((b) => b.label), ['Hand to Ada', 'Not now']);
	// Nothing kept for the seat, and no other name, is on it.
	for (const x of ['Who I am', 'My Minions', 'My bluffs', 'Imp', 'Demon', 'Minion', 'bluff', ...s.seats.slice(1).map((x) => x.name)]) assert.ok(!text.includes(x), `the confirm shows "${x}"`);
	assert.equal(calls.render + calls.close, 0, 'drawing it does nothing');
});

test('"Not now" closes it without going on; only the Storyteller\'s yes and then the player\'s own press reach the pages', () => {
	const { s, h } = firstNight();
	const { calls, d } = screen(h, s);
	let r = startRecall(1);
	find(recallRows(r, d), 'Not now').act();
	assert.equal(calls.close, 1);
	assert.equal(r.turn, 0, 'still on the question');
	// Yes: the phone-goes-to page, which still shows no page of the seat.
	r = startRecall(1);
	find(recallRows(r, d), 'Hand to Bram').act();
	assert.equal(r.turn, 1);
	const over = textOf(recallRows(r, d));
	assert.match(over, /look away/);
	for (const x of ['Who I am', 'My Demon', 'Whom I chose', 'Demon', 'Poisoner']) assert.ok(!over.includes(x), `the hand-over shows "${x}"`);
	assert.deepEqual(buttonsOf(recallRows(r, d)).map((b) => b.label), ['I am holding the phone', 'Not now']);
	find(recallRows(r, d), 'Not now').act();
	assert.equal(calls.close, 2);
	assert.equal(r.turn, 1, 'a Not now never advances');
	find(recallRows(r, d), 'I am holding the phone').act();
	assert.equal(r.turn, 2);
	assert.match(textOf(recallRows(r, d)), /Who I am/);
});

test('the index cannot be reached without both presses: no button on the first two screens opens a page', () => {
	const { s, h } = firstNight();
	for (const seat of [0, 1, 2]) {
		const { d } = screen(h, s);
		const r = startRecall(seat);
		for (let turn = 0; turn < 2; turn++) {
			assert.equal(r.turn, turn);
			const labels = new Set(recallIndex(h, seat).map((i) => i.label));
			for (const b of buttonsOf(recallRows(r, d))) assert.ok(!labels.has(b.label), `${b.label} opens a page on turn ${turn}`);
			// Anything but the one forward press leaves the turn alone.
			for (const b of buttonsOf(recallRows(r, d)).filter((x) => x.label === 'Not now')) { b.act(); assert.equal(r.turn, turn); }
			find(recallRows(r, d), turn === 0 ? `Hand to ${s.seats[seat].name}` : 'I am holding the phone').act();
		}
		assert.equal(r.turn, 2);
	}
});

test('both places that open it (a seat\'s panel, beside Skip in the night panel) go through the same question', () => {
	const code = src('src/ui/main.ts');
	const calls = [...code.matchAll(/openRecall\(([^)]*)\)/g)].map((m) => m[1]);
	assert.ok(calls.length >= 3, 'the definition and both buttons');
	// openRecall only ever starts on turn 0 (startRecall), and nothing else sets ui.recall to a later turn
	// except the demo address, which never runs in a real game.
	assert.match(bodyOf(code, 'openRecall'), /startRecall\(seat\)/);
	const sets = code.split('\n').filter((l) => /ui\.recall = (?!null)/.test(l));
	assert.equal(sets.length, 2, sets.join('\n'));
	assert.ok(sets.some((l) => /startRecall\(seat\)/.test(l)) && sets.some((l) => /startRecall\(d\.recall\.seat\)/.test(l)));
	assert.match(bodyOf(code, 'openRecall'), /if \(ui\.show \|\| ui\.banner\) return/, 'never over pages being read or an announcement');
});

// ---- Back never reveals another seat's page --------------------------------------------------------

test('every button on every recalled page leads to the index of the same seat, and to nothing else', () => {
	const { s, h } = firstNight();
	const everyone = [0, 1, 2];
	const mine = new Map(everyone.map((seat) => [seat, recallIndex(h, seat)]));
	for (const seat of everyone) {
		const labels = mine.get(seat)!.map((i) => i.label);
		assert.ok(labels.length > 0);
		for (const item of mine.get(seat)!) {
			const { calls, d } = screen(h, s);
			const r: Recall = { ...startRecall(seat), turn: 2, open: item.key };
			const opened = recallRows(r, d);
			for (const b of buttonsOf(opened)) {
				if (b.disabled) continue;
				const again: Recall = { ...startRecall(seat), turn: 2, open: item.key };
				const rows = recallRows(again, d);
				buttonsOf(rows).find((x) => x.label === b.label)!.act();
				assert.equal(again.seat, seat, 'the seat never changes');
				// (the names on a choice page are only shown as chosen: pressing one does nothing, and stays on that very page)
				const isName = s.seats.some((x) => x.name === b.label || `${x.name} †` === b.label);
				if (isName) assert.equal(again.open, item.key, 'a name on a recalled choice changes nothing');
				else assert.equal(again.open, null, `"${b.label}" on "${item.label}" leaves the page for the index`);
				assert.equal(again.turn, 2, 'and stays in the pages, not on to the hand-back');
				const idx = recallRows(again, d);
				if (again.open === null) assert.deepEqual(buttonsOf(idx).map((x) => x.label).filter((l) => l !== 'Hand the phone back'), labels, 'the index is this seat\'s');
			}
			assert.ok(calls.close === 0);
		}
	}
	// Ada's index has the bluffs; Bram's has a choice of his own; neither holds the other's.
	assert.ok(mine.get(0)!.some((i) => i.label === 'My bluffs') && !mine.get(1)!.some((i) => i.label === 'My bluffs'));
	assert.ok(mine.get(1)!.some((i) => /chose/.test(i.label)) && !mine.get(0)!.some((i) => /chose/.test(i.label)));
});

test('a page opened for one seat is never found in another seat\'s index, even if the keys match', () => {
	const { s, h } = firstNight();
	// The two Minions were woken one after the other and were shown the same kind of page; whatever their keys,
	// a key kept from one seat means nothing in the other: it lands on the index, not on the other seat's page.
	const adaKeys = recallIndex(h, 0).map((i) => i.key);
	const { d } = screen(h, s);
	for (const seat of [1, 2]) {
		for (const key of adaKeys) {
			const r: Recall = { ...startRecall(seat), turn: 2, open: key };
			const text = textOf(recallRows(r, d));
			const mineKeys = recallIndex(h, seat).map((i) => i.key);
			if (mineKeys.includes(key)) continue;
			assert.match(text, /tap a page to read it again/, 'the index, not a page');
			assert.ok(!/Your bluffs|Not in play/.test(text));
		}
	}
	// And a seat's page is drawn from that seat's own kept pages: the Scarlet Woman's name never turns up on the Imp's.
	const imp = JSON.stringify(pagesFor(h, 0));
	const sw = JSON.stringify(pagesFor(h, 2));
	assert.notEqual(imp, sw);
	assert.ok(!/Scarlet/.test(JSON.stringify(recallIndex(h, 3))));
});

test('"Hand the phone back" is the one way on, and the hand-back page holds nothing of the seat', () => {
	const { s, h } = firstNight();
	const { calls, d } = screen(h, s);
	const r: Recall = { ...startRecall(0), turn: 2, open: null };
	find(recallRows(r, d), 'Hand the phone back').act();
	assert.equal(r.turn, 3);
	assert.equal(r.open, null);
	const back = recallRows(r, d);
	const text = textOf(back).toLowerCase();
	for (const x of [...s.seats.map((x) => x.name), 'imp', 'demon', 'minion', 'bluff', 'who i am']) assert.ok(!text.includes(x.toLowerCase()), `the hand-back page shows "${x}"`);
	assert.deepEqual(buttonsOf(back).map((b) => b.label), ['Storyteller: holding the phone']);
	buttonsOf(back)[0].act();
	assert.equal(calls.close, 1, 'the Storyteller\'s press takes the screen away');
	assert.equal(r.turn, 3, 'and there is no way back to the pages');
});

// ---- nothing left on the screen, in the title, in undo or in the log -------------------------------------

test('going through Remind me changes nothing kept: no page recorded, no choice made again, no game command', () => {
	const { s, h } = firstNight();
	const before = JSON.stringify(h);
	const { d } = screen(h, s);
	for (const seat of [0, 1, 2, 3]) {
		const r = startRecall(seat);
		find(recallRows(r, d), `Hand to ${s.seats[seat].name}`).act();
		find(recallRows(r, d), 'I am holding the phone').act();
		for (const item of recallIndex(h, seat)) {
			r.open = item.key;
			for (const b of buttonsOf(recallRows(r, d))) { b.act(); r.open = item.key; }
		}
		r.open = null;
		find(recallRows(r, d), 'Hand the phone back').act();
		buttonsOf(recallRows(r, d))[0].act();
	}
	assert.equal(JSON.stringify(h), before);
	// (nothing in this file's flow can reach the game: it imports only types from the engine)
	const flow = src('src/ui/recallflow.ts');
	assert.ok(!/^import (?!type)[^\n]*core\/index/m.test(flow), 'recallflow.ts imports engine values');
	assert.ok(!/\bact\(|\bedit\(|\bsave\(|localStorage|toPlayers|sendTo|updatePhones|document\./.test(flow.replace(/\/\*[\s\S]*?\*\//g, '')), 'recallflow.ts reaches for the game, a save, a phone or the page');
});

test('the title of the window never carries a page, and undo, a new game and a finished game take Remind me away', () => {
	for (const f of readdirSync('src', { recursive: true, encoding: 'utf8' }).filter((x) => /\.(ts|html)$/.test(x))) {
		const code = src('src/' + f.replace(/\\/g, '/'));
		assert.ok(!/document\.title\s*=|setTitle|<title>[^<]*\$\{/.test(code), `${f} sets the window title`);
	}
	assert.match(src('src/ui/index.html'), /<title>Grimoire<\/title>/);
	const main = src('src/ui/main.ts');
	for (const fn of ['undo', 'newGame', 'endSaved']) assert.match(bodyOf(main, fn), /ui\.recall = null/, `${fn} leaves Remind me open`);
	// It is a screen, not saved: a reload or a crash cannot bring a page back.
	const saved = main.slice(main.indexOf('interface Saved {'), main.indexOf('function freshFlow'));
	assert.ok(!/recall/i.test(saved));
	assert.match(bodyOf(main, 'recallScreen'), /close: \(\) => \{ ui\.recall = null; render\(\); \}/);
});

test('undo drops what was shown on a night now undone, and everything if it goes back before the first night', () => {
	const { s, h } = firstNight();
	const adaNight1 = JSON.stringify(pagesFor(h, 0));
	// Night 2: whoever wakes first is shown their pages.
	let s2 = ok(playNight(s), { type: 'end-day' });
	assert.equal(s2.phase.kind === 'night' && s2.phase.n, 2);
	const step = nextStep(s2)!;
	const seat = step.seat!;
	showPages(h, s2, wakeFor(s2, step), [3]);
	assert.ok(pagesFor(h, seat).some((p) => p.night === 2));
	// Back to night 1 (still a night 1 step, or the day): night 2's pages go, night 1's stay as seen.
	forgetAfter(h, 1);
	assert.equal(JSON.stringify(pagesFor(h, 0)), adaNight1);
	assert.ok(recallIndex(h, 1).length > 0);
	assert.ok(!recallIndex(h, seat).some((i) => i.night === 2));
	// Back before any night: the characters may be dealt again, so nothing of the old deal can be recalled.
	forgetAfter(h, 0);
	assert.deepEqual(h, {});
	assert.deepEqual(recallIndex(h, 0), []);
	// A finished game keeps all of it.
	showPages(h, s, wakeFor(s, nextStep(s)!));
	forgetAfter(h, Infinity);
	assert.ok(recallIndex(h, nextStep(s)!.seat!).length > 0);
	assert.match(bodyOf(src('src/ui/main.ts'), 'undo'), /H\.forgetAfter\(/);
});

test('the game log (the Chronicle) is the event log alone: no page is read from the history, and Remind me adds no event', () => {
	const main = src('src/ui/main.ts');
	assert.ok(!/history/i.test(bodyOf(main, 'logScreen')));
	assert.ok(!/history/i.test(bodyOf(main, 'describe')));
	// openRecall / recallScreen / noteShown touch the history and the screen, never the events or the undo marks.
	for (const fn of ['openRecall', 'recallScreen']) assert.ok(!/saved\.events|saved\.marks|\bact\(|\bedit\(|\bactAll\(|keepLog/.test(bodyOf(main, fn)), fn);
	assert.ok(!/saved\.events|saved\.marks|\bact\(|\bedit\(/.test(bodyOf(main, 'noteShown')));
});

// ---- the share/export holds none of it ------------------------------------------------------------------

test('the setup export is built from the script and the player count alone, so no history, name or role of the game is in it', () => {
	const { s, h } = firstNight();
	assert.ok(Object.keys(h).length > 0);
	const sc = getScript(s.scriptId);
	const players = s.seats.length;
	const out = setupSummary(sc, players, 'Jo');
	// Whatever has been shown to anyone, the export is the same: it cannot read it.
	assert.equal(setupSummary(sc, players, 'Jo'), setupSummary(getScript('trouble-brewing'), players, 'Jo'));
	for (const x of s.seats.map((x) => x.name)) assert.ok(!out.includes(x), `${x} is in the export`);
	const kept = JSON.stringify(h);
	for (const piece of ['Who I am', 'Your Minions', 'Your bluffs', 'Whom I chose', 'night-result', 'evil-team', 'showing', 'Remind me', 'Hand to', 'history']) {
		assert.ok(!out.includes(piece), `the export holds "${piece}"`);
		assert.ok(!scriptJson(sc, 'Jo').includes(piece));
	}
	// Every line of what the pages said (a bluff list, an answer, a chosen name) is absent unless it is just a script character.
	for (const p of Object.values(h).flat()) for (const sec of p.sections) for (const line of sec.lines) {
		if (line.length > 25) assert.ok(!out.includes(line), `a page's words are in the export: ${line}`);
	}
	assert.ok(kept.length > 200);
	assert.ok(!/bluff|red herring|seat/i.test(out));
	assert.equal(typeof summaryFileName(sc), 'string');
});

test('nothing but setupSummary reaches the clipboard or file of the share page, and the share code never reads the saved game', () => {
	const code = src('src/ui/main.ts');
	const share = bodyOf(code, 'sharePage') + bodyOf(code, 'shareSource');
	assert.match(share, /const text = G\.setupSummary\(sc, players\)/);
	assert.ok(!/saved\b|history|\blog\b|events/i.test(share.replace('Share the setup', '')), 'the share page reads the saved game');
	assert.match(share, /new Blob\(\[text\]/);
	assert.match(share, /writeText\(text\)/);
	assert.equal([...code.matchAll(/new Blob\(/g)].length, 1, 'the only file the app makes is the setup summary');
	// share.ts itself imports no state and no net code.
	const shareTs = src('src/core/share.ts');
	assert.ok(!/from '\.\.\/net|history|state\.ts|GameState/.test(shareTs));
	// setupSummary takes a script, a player count and an author: there is nowhere to pass a game or a history.
	assert.equal(setupSummary.length >= 2 && setupSummary.length <= 3, true);
});
