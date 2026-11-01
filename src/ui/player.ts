/**
 * player.ts - the app on a player's own phone (mode 3).
 *
 * A thin window onto the Storyteller's game: join with the room code, say
 * which seat is yours, then see your character, the circle as the room knows
 * it, the clock and the announcements. At night your phone buzzes when it is
 * your turn and shows your pages; what you choose goes back to the
 * Storyteller. Nothing is decided here, and nothing secret arrives here
 * except what views.ts says is yours.
 */
import { navRow } from './ascii.ts';
import { bookKey, themeOf } from './theme.ts';
import { tickGrid, personInk, COLS, INNER, illuminatedRow, blank, blockRow, boxRow, btn, buttonBlock, buttonRows, center, endPanel, field, frameBottom, frameTop, listRow, paint, paneled, pad, redraw, row, rubric, setDynamic, setPalette, txt, wrap } from './ascii.ts';
import type { Row } from './ascii.ts';
import { joinRoom } from '../net/link.ts';
import type { LinkStatus, PlayerLink } from '../net/link.ts';
import type { Announcement, ClockView, HostMsg, VoteView } from '../net/protocol.ts';
import type { CharacterCard, LogEntry, PublicView, SheetEntry, Wake } from '../net/views.ts';
import type { SeatId } from '../core/index.ts';
import { CARD_COLS, CARD_INNER, big, cardButtons, characterRows, nextPage, note, revealRows, wakeRows } from './wakepages.ts';
import type { Page } from './wakepages.ts';
import * as T from './timer.ts';
import { villageOnPhone } from '../town/village.ts';
import { LobbyVoice } from '../town/lobbyvoice.ts';
import type { Extra } from '../town/village.ts';

const CLIENT_KEY = 'grimoire.client';
const ROOM_KEY = 'grimoire.room';
const NAME_KEY = 'grimoire.name';
const savedName = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };

function clientId(): string {
	try {
		let id = localStorage.getItem(CLIENT_KEY);
		if (!id) {
			id = Math.random().toString(36).slice(2) + Date.now().toString(36);
			localStorage.setItem(CLIENT_KEY, id);
		}
		return id;
	} catch {
		return Math.random().toString(36).slice(2);
	}
}

type Menu = null | 'home' | 'circle' | 'chars' | 'me' | 'log' | 'note';

const P = {
	code: '',
	link: null as PlayerLink | null,
	status: 'closed' as LinkStatus,
	detail: '',
	seats: [] as { id: SeatId; name: string; taken: boolean }[],
	seat: null as SeatId | null,
	card: null as CharacterCard | null,
	showCard: false,
	view: null as PublicView | null,
	clock: null as (ClockView & { at: number }) | null,
	wake: null as Wake | null,
	page: 'who' as Page,
	picks: [] as SeatId[],
	announce: null as Announcement[] | null,
	message: '',
	/** In the village: their character, opened from the village's bar. */
	cardOpen: false,
	/** A nomination under way, and whether my hand is up for it. */
	vote: null as VoteView | null,
	handUp: false,
	/** The name I gave, and everyone in the room so far (in seating order). */
	name: savedName(),
	lobby: [] as string[],
	lobbyYou: null as number | null,
	/** The script's characters (the sheet on the table), for the menu. */
	chars: [] as SheetEntry[],
	/** What I have been told, kept by the Storyteller's phone (null: they keep no log). */
	log: null as LogEntry[] | null,
	/** The player's menu, and which page of it is open (null: shut). */
	menu: null as Menu,
	/** The seat I am writing a note on. */
	noteSeat: null as SeatId | null
};

/** A player's own notes on another (only on this phone): a guess at their character, marks, a line of words. */
interface SeatNote { guess?: string; tags?: string[]; text?: string; }
const TAGS = ['Good?', 'Evil?', 'Drunk?', 'Poisoned?', 'Trusted', 'Lying'];
const notesKey = () => 'grimoire.notes.' + P.code;
function notes(): Record<string, SeatNote> {
	try { return JSON.parse(localStorage.getItem(notesKey()) ?? '{}'); } catch { return {}; }
}
function setNote(seat: SeatId, f: (n: SeatNote) => SeatNote) {
	const all = notes();
	all[seat] = f(all[seat] ?? {});
	try { localStorage.setItem(notesKey(), JSON.stringify(all)); } catch { /* private mode: kept until the page closes */ }
	render();
}

/**
 * The village's buttons for this player: their character; in the day,
 * Nominate (the Storyteller accepts it); during a vote, their hand.
 */
function villageButtons(): Extra[] {
	const out: Extra[] = [{ label: 'My character', act: () => { P.cardOpen = !P.cardOpen; render(); } }, { label: 'Menu', act: () => { P.menu = P.menu ? null : 'home'; render(); } }];
	const v = P.view, me = P.seat;
	if (!v || me === null || v.phase !== 'day') return out;
	const mine = v.seats.find((s) => s.id === me);
	const vote = P.vote;
	if (vote?.voting) {
		const canVote = !!mine && (mine.alive || mine.ghostVote);
		const passed = vote.at === null || vote.order.indexOf(me) < vote.order.indexOf(vote.at);
		if (canVote && !passed) {
			out.unshift({
				label: P.handUp ? 'Lower hand' : 'Raise hand', primary: !P.handUp,
				act: () => { P.handUp = !P.handUp; P.link?.send({ t: 'hand', up: P.handUp }); village?.refresh(); }
			});
		}
	} else if (!vote && mine?.alive && v.executed === null && !v.nominations.some((n) => n.nominator === me)) {
		out.unshift({
			label: 'Nominate', primary: true,
			act: () => village?.choose('Nominate whom?',
				v.order.filter((id) => !v.nominations.some((n) => n.nominee === id)).map((id) => ({ id: String(id), label: nameOf(id) })),
				(id) => P.link?.send({ t: 'nominate', nominee: Number(id) }))
		});
	}
	return out;
}

/** Mode 2: the village, once the Storyteller turns it on. */
let village: ReturnType<typeof villageOnPhone> | null = null;

let root: HTMLElement;
let cardRoot: HTMLElement;

const nameOf = (id: SeatId) => P.view?.seats.find((s) => s.id === id)?.name ?? P.seats.find((s) => s.id === id)?.name ?? '?';
const buzz = (pattern: number[]) => { try { navigator.vibrate?.(pattern); } catch { /* no buzzer */ } };

function connect(code: string) {
	P.code = code.toUpperCase().trim();
	try { localStorage.setItem(ROOM_KEY, P.code); } catch { /* fine */ }
	P.link?.close();
	P.link = joinRoom(P.code, {
		message: receive,
		status: (s, detail) => {
			P.status = s;
			P.detail = detail ?? '';
			if (s === 'open') P.link?.send({ t: 'hello', clientId: clientId(), name: P.name || undefined });
			render();
		}
	});
	P.status = 'connecting';
	render();
}

function receive(msg: HostMsg) {
	switch (msg.t) {
		case 'welcome':
			P.seats = msg.seats;
			P.seat = msg.you;
			// Not seated (a new game, a freed seat): nothing of the last game stays on screen.
			if (msg.you === null) { P.card = null; P.wake = null; P.announce = null; P.cardOpen = false; P.vote = null; P.handUp = false; }
			break;
		case 'public':
			P.view = msg.view;
			village?.refresh();
			P.clock = msg.clock ? { ...msg.clock, at: Date.now() } : null;
			break;
		case 'card':
			P.card = msg.card;
			break;
		case 'wake': {
			const again = P.wake?.id === msg.wake.id;
			P.wake = msg.wake;
			if (again && msg.wake.info) {
				// The Storyteller's answer to what we chose.
				P.page = 'info';
			} else {
				P.page = 'who';
				P.picks = [];
			}
			// Your turn in the night comes before any announcement still showing from the day (and the menu).
			P.announce = null;
			P.cardOpen = false;
			P.menu = null;
			buzz([120, 80, 120]);
			break;
		}
		case 'sleep':
			P.wake = null;
			break;
		case 'announce':
			P.announce = msg.items;
			buzz([200]);
			break;
		case 'lobby':
			P.lobby = msg.names;
			P.lobbyYou = msg.you;
			lobbyVoice.setPeers(msg.peers ?? []);
			break;
		case 'moved':
			// A new game in a new room: follow the Storyteller (a fresh page, the same name).
			P.link?.close();
			try { localStorage.setItem(ROOM_KEY, msg.room); } catch { /* fine */ }
			location.hash = '#join=' + msg.room;
			location.reload();
			return;
		case 'script':
			P.chars = msg.chars;
			break;
		case 'log':
			P.log = msg.entries;
			break;
		case 'denied':
			P.message = msg.reason;
			break;
		case 'vote':
			if (!msg.vote || !msg.vote.voting || msg.vote.nominee !== P.vote?.nominee) P.handUp = false;
			// The Storyteller's phone lost my hand (it reloaded): raise it again.
			else if (P.handUp && P.seat !== null && !msg.vote.raised.includes(P.seat)) P.link?.send({ t: 'hand', up: true });
			P.vote = msg.vote;
			village?.refresh();
			break;
		case 'note':
			if (village) village.toast(msg.text);
			else P.message = msg.text;
			break;
		case 'village':
			if (!village && P.link) {
				const link = P.link;
				village = villageOnPhone({ peer: link.peer, send: (m) => link.send({ t: 'village', m }) }, villageButtons);
				const LABEL: Record<string, string> = { day: 'Talk', nom: 'Nominate', speech: 'Speak' };
				village.clock({
					get: () => {
						const c = P.clock;
						if (!c) return null;
						const left = c.running ? Math.max(0, c.remainingMs - (Date.now() - c.at)) : c.remainingMs;
						return { left, total: c.totalMs ?? Math.max(c.remainingMs, 60_000), running: c.running, label: LABEL[c.label] ?? '' };
					}
				});
			}
			village?.receive(msg.m);
			return;
	}
	render();
}

// ---- screens ------------------------------------------------------------------------

/** The head of a player's page: the book's illuminated G and its name, as on the Storyteller's first leaf. */
function header(): Row[] {
	return [illuminatedRow([{ t: 'a leaf for a player' }, { t: 'at the Storyteller’s table,' }, { t: 'for Blood on the Clocktower.', tone: 'dim' }]), blank()];
}

const esc = (x: string) => x.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** Leave the room for good: home, and this phone forgets it. */
function leave() {
	P.link?.close();
	try { localStorage.removeItem(ROOM_KEY); } catch { /* fine */ }
	location.hash = '';
	location.reload();
}

/** A page's head: back home (or out of the room), and its name. */
function head(title: string, back: [string, () => void]): Row[] {
	return [navRow(back[0], back[1]), rubric(title)];
}

function joinScreen(): Row[] {
	const tryJoin = () => {
		const v = P.code;
		const n = P.name.trim();
		if (v.trim().length !== 4) { P.message = 'The code is four letters.'; render(); return; }
		if (!n) { P.message = 'Your name, so the others know who you are.'; render(); return; }
		P.name = n.slice(0, 14);
		try { localStorage.setItem(NAME_KEY, P.name); } catch { /* fine */ }
		P.message = '';
		connect(v);
	};
	// Only a code from the link is filled in: never an old room from before.
	return [
		...head('Join a game', ['< Home', () => { location.hash = ''; location.reload(); }]),
		field('code', 'Room code', P.code, (v) => { P.code = v.trim().toUpperCase(); render(); }, 4, 'four letters'),
		field('pname', 'Your name', P.name, (v) => { P.name = v.trim(); render(); }, 14, 'tap to type'),
		...(P.message ? [row(txt(P.message, 'rubric'))] : []),
		buttonBlock([btn('Join', tryJoin, { style: 'primary', width: INNER })])
	];
}

/** Waiting in the room: the code, everyone so far (you marked), and what happens next. */
function lobbyScreen(): Row[] {
	const dealing = P.seats.length > 0;
	return [
		...head('Lobby', ['Leave', leave]),
		rubric('Room code'),
		boxRow([P.code.split('').join(' ')], 'gold', 20),
		...wrap(dealing ? 'The Storyteller is dealing the characters...' : 'Waiting for the Storyteller to start.', INNER).map((l) => row(txt(l, 'dim'))),
		endPanel(),
		rubric('Players - ' + P.lobby.length),
		...(P.lobby.length ? P.lobby.map((n, i) => row(txt((i === P.lobbyYou ? '> ' : '  ') + n + (i === P.lobbyYou ? ' (you)' : ''), i === P.lobbyYou ? 'gold' : undefined))) : [row(txt('Just you so far...', 'dim'))]),
		endPanel(),
		rubric('Voice'), ...wrap(lobbyVoice.line(), INNER).map((l) => row(txt(l, 'dim'))), buttonBlock(lobbyVoice.buttons()), endPanel(),
		buttonBlock([btn('Change my name', () => { lobbyVoice.stop(); P.link?.close(); P.status = 'closed'; render(); })])
	];
}

/** Talking in the lobby until the game begins (then the village's voice takes over). */
const lobbyVoice = new LobbyVoice(() => P.link?.peer ?? null, () => render());

function seatScreen(): Row[] {
	return [
		rubric('Which one are you?'),
		...wrap('Tap your name. The Storyteller can free a seat if you pick the wrong one.', INNER).map((l) => row(txt(l, 'dim'))),
		...buttonRows(P.seats.map((s) => btn(s.name, () => { P.link?.send({ t: 'claim', seat: s.id }); }, { width: 13, disabled: s.taken })), INNER, 0),
		endPanel()
	];
}

/**
 * The circle as the room knows it: names, who is dead. Your own token shows your character. With `noting`,
 * each other seat shows your own guess and marks on it, and a tap opens your note on them.
 */
function ring(noting = false): Row[] {
	const mine0 = noting ? notes() : {};
	const v = P.view!;
	const n = v.order.length;
	const alive = v.seats.filter((s) => s.alive).length;
	const caption: string[] = [];
	if (v.phase === 'night') caption.push('Night ' + v.n, alive + ' alive', 'Eyes closed');
	else if (v.phase === 'day') {
		caption.push('Day ' + v.n, alive + ' alive', Math.ceil(alive / 2) + ' to execute',
			v.executed !== null ? nameOf(v.executed) + ' executed' : v.block ? 'Block: ' + nameOf(v.block.seat) + ' (' + v.block.votes + ')' : '');
		if (P.clock) caption.push('@clock');
	} else if (v.phase === 'over') caption.push(v.winner === 'good' ? 'Good wins' : 'Evil wins');
	else caption.push('Waiting', 'for the Storyteller');
	const rx = 16, ry = Math.max(6, Math.min(10, 3 + n / 2));
	const h = Math.ceil(2 * ry) + 4;
	const tw = Math.max(5, Math.min(9, Math.floor(2 * rx * Math.sin(Math.PI / Math.max(n, 2)) - 0.5)));
	return [...frameTop('The town'), { ...blockRow(h, (c) => {
		const cx = c.x + Math.floor(c.w / 2), cy = c.y + Math.floor(h / 2);
		caption.forEach((line, i) => {
			const text = line === '@clock' ? clockText() : line;
			c.g.text(cx - Math.floor(text.length / 2), cy - Math.floor(caption.length / 2) + i, text, i === 0 ? 8 : 3);
		});
		v.order.forEach((id, i) => {
			const s = v.seats.find((x) => x.id === id)!;
			const a = (2 * Math.PI * i) / n;
			const x = Math.round(cx + rx * Math.sin(a) - tw / 2), y = Math.round(cy - ry * Math.cos(a) - 1);
			const mine = id === P.seat;
			const reveal = mine && P.card && P.showCard;
			const role = reveal ? P.card!.name : '';
			const fg = s.alive ? 4 : 3, bg = mine ? 1 : 0;
			const cut = (t: string) => [...t].slice(0, tw).join('');
			c.g.fill({ x, y, w: tw, h: 3 }, ' ', fg, bg);
			// Each player's name in their own colour (the same as their letter in the village).
			const [pf, pb] = personInk(i);
			c.g.text(x, y, cut((s.alive ? '☺' : '†') + s.name), !s.alive ? fg : pf, !s.alive ? bg : pb || bg);
			c.g.text(x, y + 1, cut(role), reveal ? (P.card!.team === 'evil' ? 8 : 12) : fg, bg);
			if (!s.alive && !s.ghostVote) c.g.text(x, y + 2, cut('no vote'), 3, bg);
			if (noting && !mine) {
				const n = mine0[id];
				if (n?.guess) c.g.text(x, y + 1, cut('?' + n.guess), 6, bg);
				const tags = (n?.tags ?? []).map((t) => t[0]).join('') + (n?.text ? '*' : '');
				if (tags) c.g.text(x + Math.max(0, tw - tags.length), y + 2, tags, n?.tags?.includes('Evil?') ? 8 : 12, bg);
				c.hit({ x, y, w: tw, h: 3 }, () => { P.noteSeat = id; P.menu = 'note'; render(); });
			}
		});
	}), cls: 'frame-mid' }, frameBottom()];
}

const clockText = () => {
	if (!P.clock) return '';
	const left = P.clock.running ? Math.max(0, P.clock.remainingMs - (Date.now() - P.clock.at)) : P.clock.remainingMs;
	return T.clock(left);
};

function mainScreen(): Row[] {
	const rows: Row[] = [];
	const me = P.seat === null ? '' : nameOf(P.seat);
	rows.push(rubric(`You are ${me}`));
	if (!P.card) rows.push(...wrap('Your character will appear here once the Storyteller deals.', INNER).map((l) => row(txt(l, 'dim'))));
	else if (!P.showCard) rows.push(...buttonRows([btn('Show my character', () => { P.showCard = true; render(); }, { style: 'primary' })]), ...wrap('Hidden, in case someone is looking over your shoulder.', INNER).map((l) => row(txt(l, 'dim'))));
	else {
		rows.push(row(txt('  ' + P.card.name, P.card.team === 'evil' ? 'evil' : 'good', 'heading')));
		rows.push(row(txt('  ' + P.card.team === 'evil' ? 'Evil' : 'Good', 'dim')));
		rows.push(...wrap(P.card.ability, INNER).map((l) => row(txt(l))));
		rows.push(...buttonRows([btn('Hide', () => { P.showCard = false; render(); }, { style: 'quiet' })]));
	}
	rows.push(endPanel());
	if (P.view) {
		rows.push(...ring());
		if (P.view.phase === 'day' && P.view.nominations.length) {
			rows.push(rubric('Today'));
			for (const n of P.view.nominations) {
				rows.push(row(txt(pad(`${nameOf(n.nominator)} » ${nameOf(n.nominee)}`, 30)), txt(n.votes === null ? 'voting' : `${n.votes} votes`, 'dim')));
			}
			rows.push(endPanel());
		}
	}
	rows.push(blank(), ...buttonRows([btn('Menu', () => { P.menu = 'home'; render(); }, { style: 'primary' }), btn('Not me: change seat', () => { P.link?.send({ t: 'leave-seat' }); P.seat = null; P.card = null; render(); }, { style: 'quiet' })]));
	return rows;
}

/**
 * The player's menu (like the Storyteller's, without anyone's character): the circle with their own notes,
 * the script's characters, their own character, and what they have been told (if the Storyteller keeps it).
 */
function menuRows(): Row[] {
	const go = (m: Menu) => () => { P.menu = m; render(); };
	const back = (label: string, m: Menu) => navRow(label, go(m));
	const v = P.view;
	const dim = (s: string) => wrap(s, CARD_INNER).map((l) => row(txt(l, 'dim')));
	switch (P.menu) {
		case 'circle':
			if (!v) break;
			return [back('Menu', 'home'), ...ring(true), ...dim('Tap a player to note your guess, marks and words about them. Only this phone sees them.')];
		case 'note': {
			const id = P.noteSeat;
			if (id === null) break;
			const n = notes()[id] ?? {};
			const rows: Row[] = [back('The circle', 'circle'), rubric(nameOf(id), CARD_COLS), row(txt('Marks', 'dim'))];
			rows.push(...tickGrid(TAGS.map((t) => ({ label: t, on: !!n.tags?.includes(t), act: () => setNote(id, (x) => ({ ...x, tags: x.tags?.includes(t) ? x.tags.filter((k) => k !== t) : [...(x.tags ?? []), t] })) })), 3, CARD_INNER));
			rows.push(field('note-' + id, 'Words', n.text ?? '', (val) => setNote(id, (x) => ({ ...x, text: val.trim() })), 30, 'tap to write'));
			rows.push(row(txt('Your guess at their character', 'dim')));
			rows.push(...tickGrid(P.chars.filter((c) => c.team !== 'fabled').map((c) => ({ label: c.name, on: n.guess === c.name, tone: c.team === 'minion' || c.team === 'demon' ? ('evil' as const) : undefined, act: () => setNote(id, (x) => ({ ...x, guess: x.guess === c.name ? undefined : c.name })) })), 3, CARD_INNER));
			return rows;
		}
		case 'chars': {
			const rows: Row[] = [back('Menu', 'home')];
			const TEAM: Record<string, string> = { townsfolk: 'Townsfolk', outsider: 'Outsiders', minion: 'Minions', demon: 'Demons', traveller: 'Travellers', fabled: 'Fabled' };
			for (const team of Object.keys(TEAM)) {
				const cs = P.chars.filter((c) => c.team === team);
				if (!cs.length) continue;
				rows.push(rubric(TEAM[team], CARD_COLS));
				for (const c of cs) rows.push(row(txt(c.name, team === 'minion' || team === 'demon' ? 'evil' : 'good', 'heading')), ...dim(c.ability));
			}
			if (!P.chars.length) rows.push(...dim('The script comes once the Storyteller has chosen it.'));
			return rows;
		}
		case 'me':
			return characterRows(P.card, btn('Back', go('home'), { style: 'primary' }));
		case 'log': {
			const rows: Row[] = [back('Menu', 'home'), rubric('What you have been told', CARD_COLS)];
			if (!P.log?.length) rows.push(row(txt('Nothing yet.', 'dim')));
			for (const e of P.log ?? []) rows.push(row(txt(e.title, 'rubric')), ...e.lines.flatMap((l) => wrap(l, CARD_INNER).map((w) => row(txt('  ' + w)))));
			return rows;
		}
	}
	const rows: Row[] = [navRow('Close', () => { P.menu = null; render(); }), rubric('Menu', CARD_COLS)];
	const entry = (label: string, sub: string, m: Menu) => rows.push(buttonBlock([btn(label, go(m), { width: INNER })]), ...dim(sub), blank());
	if (v) entry('The circle', 'Everyone round the circle, with your own notes on them.', 'circle');
	entry('The characters', 'This script’s characters and what they do.', 'chars');
	entry('My character', 'Your character, its picture and ability.', 'me');
	if (P.log) entry('What I have been told', 'Everything the Storyteller has shown you at night, to read back.', 'log');
	return rows;
}

function screen(): Row[] {
	const rows = header();
	if (!P.code || P.status === 'closed') return [...rows, ...joinScreen()];
	if (P.message) rows.push(...wrap(P.message, INNER).map((l) => row(txt(l, 'evil'))), blank());
	if (P.status !== 'open' && !P.view) {
		return [...rows, rubric('Linking'), ...wrap(P.status === 'error' ? P.detail || 'Could not reach the Storyteller’s phone. Still trying.' : 'Finding the Storyteller’s phone...', INNER).map((l) => row(txt(l, 'dim'))),
			...buttonRows([btn('Different code', leave, { style: 'quiet' })]), endPanel()];
	}
	// Before the first night: the lobby (seated or not); a seat to pick only if the deal missed you.
	if (P.seat === null && P.seats.length && P.view && P.view.phase !== 'setup') return [...rows, ...seatScreen()];
	if (P.seat === null || !P.view || P.view.phase === 'setup') return [...rows, ...lobbyScreen()];
	return [...rows, ...mainScreen()];
}

function overlay(): Row[] {
	if (P.announce) {
		return [blank(), ...revealRows(P.announce), blank(), ...cardButtons([btn('Done', () => { P.announce = null; render(); }, { style: 'primary' })])];
	}
	if (P.menu && !P.wake) return menuRows();
	if (P.cardOpen && !P.wake) return characterRows(P.card, btn('Hide', () => { P.cardOpen = false; render(); }, { style: 'primary' }));
	const w = P.wake;
	if (!w) return [];
	return wakeRows(w, P.page, P.picks, {
		go: (page) => { P.page = page; render(); },
		toggle: (id) => {
			if (P.picks.includes(id)) P.picks = P.picks.filter((p) => p !== id);
			else { P.picks.push(id); if (P.picks.length > (w.pick?.count ?? 1)) P.picks.shift(); }
			render();
		},
		confirm: () => {
			P.link?.send({ t: 'answer', wakeId: w.id, picks: [...P.picks] });
			P.page = w.followUp ? 'wait' : nextPage(w, 'pick');
			render();
		},
		finish: () => {
			P.link?.send({ t: 'done', wakeId: w.id });
			P.wake = null;
			render();
		},
		ending: 'own-phone',
		name: nameOf,
		deadAtDusk: (id) => !(P.view?.seats.find((s) => s.id === id)?.alive ?? true)
	});
}

function render() {
	// The game has begun: the village's own voice takes over.
	if (lobbyVoice.voice && P.view && P.view.phase !== 'setup') lobbyVoice.stop();
	const theme = themeOf(P.view?.script);
	document.documentElement.dataset.phase = P.view?.phase === 'night' ? 'night' : 'day';
	document.documentElement.dataset.theme = theme;
	setPalette(() => bookKey(theme, P.view?.phase === 'night' || !P.view));
	// In the village the town is the screen; the player's pages come up over it as cards (My character, a wake).
	// The way back is always the first thing on the page, above even the book's name.
	const rows = screen();
	const nav = rows.findIndex((r) => r.cls === 'nav');
	if (nav > 0) rows.unshift(...rows.splice(nav, 1));
	paint(root, village && P.view && P.view.phase !== 'setup' ? [] : paneled(rows));
	const pages = overlay();
	paint(cardRoot, pages.length ? paneled(pages, CARD_COLS) : [], CARD_COLS);
	tick();
}

function tick() {
	if (P.clock) redraw();
}

export function startPlayer(appRoot: HTMLElement, overlayRoot: HTMLElement, code: string) {
	root = appRoot;
	cardRoot = overlayRoot;
	setInterval(tick, 250);
	setDynamic(() => null);
	if (code && P.name) connect(code);
	else { P.code = code; render(); }
}
