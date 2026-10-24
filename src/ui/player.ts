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
import { COLS, INNER, titleRow, blank, blockRow, boxRow, btn, buttonBlock, buttonRows, center, endPanel, field, frameBottom, frameTop, listRow, paint, paneled, pad, redraw, row, rubric, setDynamic, setPalette, txt, wrap } from './ascii.ts';
import type { Row } from './ascii.ts';
import { joinRoom } from '../net/link.ts';
import type { LinkStatus, PlayerLink } from '../net/link.ts';
import type { Announcement, ClockView, HostMsg, VoteView } from '../net/protocol.ts';
import type { CharacterCard, PublicView, Wake } from '../net/views.ts';
import type { SeatId } from '../core/index.ts';
import { CARD_COLS, CARD_INNER, big, cardButtons, nextPage, note, wakeRows } from './wakepages.ts';
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
	lobbyYou: null as number | null
};

/**
 * The village's buttons for this player: their character; in the day,
 * Nominate (the Storyteller accepts it); during a vote, their hand.
 */
function villageButtons(): Extra[] {
	const out: Extra[] = [{ label: 'My character', act: () => { P.cardOpen = !P.cardOpen; render(); } }];
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
			// Your turn in the night comes before any announcement still showing from the day.
			P.announce = null;
			P.cardOpen = false;
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

function header(): Row[] {
	return [titleRow()];
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

/** The circle as the room knows it: names, who is dead. Your own token shows your character. */
function ring(): Row[] {
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
			c.g.text(x, y, cut((s.alive ? '☺' : '†') + s.name), mine ? 6 : fg, bg);
			c.g.text(x, y + 1, cut(role), reveal ? (P.card!.team === 'evil' ? 8 : 12) : fg, bg);
			if (!s.alive && !s.ghostVote) c.g.text(x, y + 2, cut('no vote'), 3, bg);
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
	rows.push(blank(), ...buttonRows([btn('Not me: change seat', () => { P.link?.send({ t: 'leave-seat' }); P.seat = null; P.card = null; render(); }, { style: 'quiet' })]));
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
		const rows: Row[] = [blank()];
		for (const a of P.announce) {
			rows.push(rubric(a.title));
			for (const l of a.lines) rows.push(...wrap(l, CARD_INNER - 2).map((w) => row(txt('  ' + w, 'gold', 'heading'))));
		}
		rows.push(endPanel(), blank(), ...cardButtons([btn('Done', () => { P.announce = null; render(); }, { style: 'primary' })]));
		return rows;
	}
	if (P.cardOpen && !P.wake) {
		const rows: Row[] = [blank(), rubric('Your character')];
		if (!P.card) rows.push(...wrap('It will appear here once the Storyteller deals.', CARD_INNER - 2).map((l) => row(txt('  ' + l, 'dim'))));
		else {
			rows.push(row(txt('  ' + P.card.name, P.card.team === 'evil' ? 'evil' : 'good', 'heading')));
			rows.push(row(txt('  ' + P.card.team === 'evil' ? 'Evil' : 'Good', 'dim')));
			rows.push(...wrap(P.card.ability, CARD_INNER).map((l) => row(txt(l))));
		}
		rows.push(endPanel(), blank(), ...cardButtons([btn('Hide', () => { P.cardOpen = false; render(); }, { style: 'primary' })]));
		return rows;
	}
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
	const theme = P.view?.script === 'laissez-un-faire' ? 'victorian' : 'folio';
	document.documentElement.dataset.phase = P.view?.phase === 'night' ? 'night' : 'day';
	document.documentElement.dataset.theme = P.view?.script === 'laissez-un-faire' ? 'occult' : '';
	setPalette(() => theme + (P.view?.phase === 'night' || !P.view ? '-night' : theme === 'folio' ? '' : '-day'));
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
