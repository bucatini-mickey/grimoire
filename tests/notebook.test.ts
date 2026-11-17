import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanNotebook, cleanText, chronicleLines, diffNotebook, notebooksNow, recordChat, recordNotebook, MAX_TEXT } from '../src/net/notebook.ts';
import type { Notebook, StoredNotebook } from '../src/net/notebook.ts';
import { publicView, cardFor, scriptSheet, wakeFor } from '../src/net/views.ts';
import { nextStep } from '../src/core/index.ts';
import { game } from './helpers.ts';

const NAMES = ['Ada', 'Bram', 'Cael', 'Dorn', 'Esme'];
const nameOf = (s: number) => NAMES[s] ?? '?';
const SEATS = [0, 1, 2, 3, 4];
const CHARS = ['Imp', 'Poisoner', 'Empath', 'Monk'];
const ctx = (at: number, when = 'Day 1') => ({ at, when, nameOf });

test('a notebook is cleaned: only other players, real marks, real characters, short plain words', () => {
	const raw = {
		0: { status: 'cleared', text: 'my own seat' },
		1: { status: 'suspected', guess: 'Poisoner', text: '  lied\n\tabout   the Monk  ' },
		2: { status: 'zombie', guess: 'Not a character', text: 'x'.repeat(500) },
		9: { status: 'dead' },
		3: { text: '   ' },
		4: 'nonsense'
	};
	const book = cleanNotebook(raw, SEATS, 0, CHARS);
	assert.deepEqual(Object.keys(book), ['1', '2']);
	assert.deepEqual(book[1], { status: 'suspected', guess: 'Poisoner', text: 'lied about the Monk' });
	assert.equal(book[2].status, undefined);
	assert.equal(book[2].guess, undefined);
	assert.equal([...book[2].text!].length, MAX_TEXT);
	assert.deepEqual(cleanNotebook(null, SEATS, 0, CHARS), {});
	assert.deepEqual(cleanNotebook([1, 2], SEATS, 0, CHARS), {});
	assert.equal(cleanText(42), '');
});

test('an older notebook (marks like Evil?) is read as the nearest of the four marks', () => {
	const book = cleanNotebook({ 1: { tags: ['Drunk?', 'Evil?'] }, 2: { tags: ['Trusted'] }, 3: { tags: ['Drunk?'] } }, null, null, null);
	assert.equal(book[1].status, 'suspected');
	assert.equal(book[2].status, 'cleared');
	assert.equal(book[3], undefined);
});

test('what changed is told one line per player', () => {
	const a: Notebook = { 1: { status: 'suspected' } };
	const b: Notebook = { 1: { status: 'suspected', guess: 'Poisoner' }, 2: { text: 'quiet' } };
	assert.deepEqual(diffNotebook({}, a, nameOf), ['Bram: suspected']);
	assert.deepEqual(diffNotebook(a, b, nameOf), ['Bram: suspected · Poisoner', 'Cael: "quiet"']);
	assert.deepEqual(diffNotebook(b, { 2: { text: 'quiet' } }, nameOf), ['Bram: note rubbed out']);
	assert.deepEqual(diffNotebook(b, b, nameOf), []);
});

test('the Storyteller keeps each change once, stamped, and nothing when nothing changed', () => {
	let kept: StoredNotebook | undefined;
	kept = recordNotebook(kept, { 1: { status: 'suspected' } }, ctx(10, 'Day 1'));
	const same = recordNotebook(kept, { 1: { status: 'suspected' } }, ctx(11, 'Day 1'));
	assert.equal(same, kept, 'the same notebook again adds nothing');
	kept = recordNotebook(kept, { 1: { status: 'cleared' } }, ctx(20, 'Day 2'));
	assert.deepEqual(kept.history.map((e) => [e.at, e.when, e.line]), [[10, 'Day 1', 'Bram: suspected'], [20, 'Day 2', 'Bram: cleared']]);
	assert.deepEqual(kept.now, { 1: { status: 'cleared' } });
});

test('the history is capped, keeping the newest', () => {
	let kept: StoredNotebook | undefined;
	for (let i = 0; i < 400; i++) kept = recordNotebook(kept, { 1: { text: 'note ' + i } }, ctx(i));
	assert.equal(kept!.history.length, 300);
	assert.match(kept!.history.at(-1)!.line, /note 399/);
});

test('a chat request is noted, with who it is about only if that is a real player', () => {
	const a = recordChat(undefined, 1, { ...ctx(5), valid: true });
	const b = recordChat(a, null, { ...ctx(6), valid: false });
	assert.deepEqual(b.history.map((e) => e.line), ['asks for a chat, about Bram', 'asks for a chat']);
	assert.deepEqual(b.now, {});
});

test('the Chronicle gets each entry after the event it followed; entries beyond an Undo join the end', () => {
	const ada = recordNotebook(undefined, { 1: { status: 'suspected' } }, ctx(0, 'before the game'));
	const adaMore = recordChat(recordNotebook(ada, { 1: { status: 'cleared' } }, ctx(3, 'Day 1')), 2, { ...ctx(3, 'Day 1'), valid: true });
	const bram = recordNotebook(undefined, { 0: { guess: 'Imp' } }, ctx(9, 'Night 2'));
	const lines = chronicleLines({ 0: adaMore, 1: bram }, 5, nameOf);
	assert.deepEqual(lines.get(0), ["Ada's notebook (before the game). Bram: suspected"]);
	assert.deepEqual(lines.get(3), ["Ada's notebook (Day 1). Bram: cleared", 'Ada asks for a chat, about Cael (Day 1)']);
	assert.deepEqual(lines.get(5), ["Bram's notebook (Night 2). Ada: Imp"], 'event 9 was undone: it joins the end (5 events now)');
	assert.equal(chronicleLines(undefined, 5, nameOf).size, 0);
});

test('the Storyteller can read every notebook as it stands', () => {
	const ada = recordNotebook(undefined, { 1: { status: 'suspected', guess: 'Poisoner', text: 'odd' } }, ctx(1));
	const bram = recordNotebook(undefined, {}, ctx(1));
	assert.deepEqual(notebooksNow({ 0: ada, 1: bram }, nameOf), [{ who: 'Ada', lines: ['Bram: suspected · Poisoner · "odd"'] }]);
});

// ---- nothing about the game goes in, and nothing about a notebook goes out ----------------------

test('an empty notebook stays empty whatever the game knows: nothing is filled in', () => {
	const s = game(['imp', 'poisoner', 'drunk', 'empath', 'monk', 'soldier', 'fortune-teller'], { drunkBelieves: 'washerwoman', redHerring: 4 });
	const chars = scriptSheet(s).map((c) => c.name);
	assert.deepEqual(cleanNotebook({}, s.order, 0, chars), {});
	assert.deepEqual(cleanNotebook(undefined, s.order, 0, chars), {});
});

test('a notebook is never in anything a player is sent', () => {
	const s = game(['imp', 'poisoner', 'drunk', 'empath', 'monk', 'soldier', 'fortune-teller'], { drunkBelieves: 'washerwoman', redHerring: 4 });
	// Whatever Ada writes, no other player's view carries it (the views are built from the game alone).
	const secret = 'ZEBRA-GUESS-ONLY-ADA-WROTE';
	recordNotebook(undefined, { 1: { text: secret, status: 'suspected' } }, { at: 0, when: 'Day 1', nameOf: (i) => s.seats[i].name });
	const sent = JSON.stringify([publicView(s), scriptSheet(s), cardFor(s, 1), wakeFor(s, nextStep(s)!)]);
	assert.ok(!sent.includes(secret));
	assert.ok(!sent.toLowerCase().includes('notebook'));
});

test('structure: notebooks travel player to Storyteller only', () => {
	const read = (f: string) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
	// The messages to phones carry no notebook; only the messages from phones do.
	const protocol = read('net/protocol.ts');
	const host = protocol.slice(protocol.indexOf('export type HostMsg'), protocol.indexOf('export type PlayerMsg'));
	assert.ok(host.length > 100 && !/notes|notebook|chat/i.test(host), 'HostMsg mentions a notebook');
	assert.match(protocol.slice(protocol.indexOf('export type PlayerMsg')), /t: 'notes'/);
	// What a player may see is built in views.ts, which knows nothing of notebooks.
	assert.ok(!/notebook/i.test(read('net/views.ts')), 'views.ts mentions a notebook');
	// The Storyteller's phone never sends a stored notebook anywhere.
	for (const line of read('ui/main.ts').split('\n')) {
		if (/sendTo\(|village\??\.(toast|send)/.test(line)) assert.ok(!/notebooks|NB\./.test(line), 'main.ts sends a notebook: ' + line.trim());
	}
});
