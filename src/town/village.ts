/**
 * village.ts - mode 2: a top-down village everyone walks round on their own
 * phone, talking to whoever is near (voice.ts). The Storyteller's phone hosts
 * (as in mode 3) and sets the phase:
 *
 *   day     wander, talk, ask anyone for a private word, lock yourselves in
 *   dusk    the bell: gather on the seats round the clocktower
 *   circle  the town drops away; everyone on one circle, all hear all
 *   night   everyone at home, doors locked; the Storyteller visits
 *
 *   #village          open a village (the host, who is the Storyteller)
 *   #village=CODE     join one
 *
 * Or inside a real game (mode 3, players' phones): the grimoire's room
 * carries the village too (villageForGame / villageOnPhone below). The game
 * sets the phase (night, the day, nominations in the circle), the seats are
 * the game's seats, the dead walk as faded letters, and when the
 * Storyteller sends someone their night pages, the Storyteller visits them.
 *
 * The town is a Tachyon blueprint (town/village.tbp, or one the host loads),
 * sent to every phone when it joins. The host holds where everyone is, who
 * is talking privately and which doors are locked; each phone moves its own
 * walker and asks the host for the rest.
 */
import { INNER, btn, buttonBlock, buttonRows, drawButton, endPanel, field, isButton, listRow, paint, quant, redraw, rubric, row, segWidth, setExtra, txt, wrap, center } from '../ui/ascii.ts';
import type { Button, Row } from '../ui/ascii.ts';
import type { Grid } from '../term/pterm.ts';
import { hostRoom, joinRoom, newRoomCode } from '../net/link.ts';
import type { LinkStatus } from '../net/link.ts';
import type { Peer } from 'peerjs';
import { parseBlueprint } from './blueprint.ts';
import { at, atSpeakingPlace, canWorkDoor, DOOR_REACH, doorLeaves, doorStepIn, doorsOf, inMeeting, loudness, makeTown, path, roomsAt, sameRoom, visibleCells, walkable } from './map.ts';
import type { P, Phase, Town } from './map.ts';
import { css, FOG, fogAt, LANTERN, sunlight, lerp, level, lightMap, lookAt, luma, mul, noise, remembered, sky, sources } from './look.ts';
import type { Rgb } from './look.ts';
import { audio, bell, startVoice } from './voice.ts';
import type { Voice, VoiceMode } from './voice.ts';
import VILLAGE from '../../town/castle.tbp';
import SALTGRAVE from '../../town/victorian.tbp';

/** The town a script is played in: Laissez un Faire in gas-lit Saltgrave, the rest in the castle town. A town the Storyteller loaded themselves wins. */
const townFor = (script: string | undefined) => store.get('grimoire.town') ?? (script === 'laissez-un-faire' ? SALTGRAVE : VILLAGE);

const PREFIX = 'grimoire-village-';

export interface Person {
	id: string;
	name: string;
	ink: number;
	x: number;
	y: number;
	voice: boolean;
	/** Test villagers hum this note instead of talking. */
	hum?: number;
	seat: number;
	/** The Storyteller (the host). */
	st?: boolean;
	/** The Storyteller's All ears: hears, and is heard by, everyone. */
	ears?: boolean;
	/** In a private conversation with. */
	with?: string | null;
	/** Dead in the game: still walks and talks, faded. */
	dead?: boolean;
}

/** A button a game puts in the village. */
export interface Extra { label: string; act: () => void; primary?: boolean; }

/** A clock the village shows: time left of how long, whether it runs; the Storyteller may start or pause it. */
export interface ClockSource {
	get(): { left: number; total: number; running: boolean; label: string } | null;
	toggle?: () => void;
}

/** Little pictures for the bars: a bell (dusk) and a clock face (the timer). */
/** The Storyteller's next steps in the game, as a bar in the village. */
export interface StActions { text: string; buttons: Extra[]; }
/** A vote in the circle, by seat number round the circle: who is up, where the count is, whose hands are up. */
export interface VoteDraw { nominee: number; at: number | null; raised: number[]; counted: number[]; }

/** Every seat in the game, for the circle (some may have no phone). */
export interface RingSeat { seat: number; name: string; dead: boolean; }

export type VillageDown = Down;
export type VillageUp = Up;

/** How the host's messages travel: the village's own room, or a game's. */
export interface HostWire { peer: Peer; send(peer: string, m: Down): boolean; peers(): string[]; }
export interface PlayerWire { peer: Peer; send(m: Up): boolean; }

type Down =
	| { t: 'welcome'; you: string; town: string; phase: Phase; people: Person[]; locked: number[]; caption: string[]; vote: VoteDraw | null; ring: RingSeat[] }
	| { t: 'people'; people: Person[]; locked: number[]; caption: string[]; vote: VoteDraw | null; ring: RingSeat[] }
	/** The village is put away (the Storyteller turned it off). */
	| { t: 'off' }
	| { t: 'phase'; phase: Phase }
	/** Move your walker here (sent home at night). */
	| { t: 'place'; x: number; y: number }
	/** Someone asks you for a private word. */
	| { t: 'asked'; from: string }
	| { t: 'notice'; text: string };
type Up =
	| { t: 'hello'; name: string; clientId: string }
	| { t: 'at'; x: number; y: number }
	| { t: 'voice'; on: boolean }
	| { t: 'ask'; to: string }
	| { t: 'reply'; to: string; yes: boolean }
	| { t: 'end' }
	| { t: 'door'; cell: number; x?: number; y?: number };

/** Walkers' inks: bright, to read on a lit map; each person gets their own. */
export const INKS = ['#f0705a', '#86a9de', '#8fd06a', '#d09ad8', '#e8b84a', '#6ccfd2', '#f0905a', '#b0b0ff', '#d8d86a', '#f07aa0', '#7ad08a', '#e0b080', '#8ac0f0', '#e07ae0', '#7ae0c0'];
const ST_INK = '#ffd27a';
const BOT_NAMES = ['Agnes', 'Wat', 'Hild', 'Osric', 'Maud', 'Piers', 'Joan', 'Tib'];
const PHASE_NAME: Record<Phase, string> = { day: 'Day', dusk: 'Dusk', circle: 'The circle', night: 'Night' };

// ---- state ------------------------------------------------------------------------------

const S = {
	host: false,
	room: '',
	hostWire: null as HostWire | null,
	playerWire: null as PlayerWire | null,
	/** Inside a real game (mode 3) rather than the demo. */
	game: false,
	/** What the circle shows in its middle (the day, the block, the votes). */
	caption: [] as string[],
	/** Extra buttons a game adds to a player's bar (their character). */
	extra: (() => []) as () => Extra[],
	/** The Storyteller's bar: what the game wants next. */
	stActions: null as StActions | null,
	/** A vote under way in the circle. */
	vote: null as VoteDraw | null,
	/** In a game: every seat, so the circle shows those without a phone too. */
	ring: [] as RingSeat[],
	/** A list to choose from (whom to nominate). */
	choice: null as null | { title: string; options: { id: string; label: string }[]; pick: (id: string) => void },
	onBack: null as null | (() => void),
	/** The game's clock, if any is running the day (a speech, the discussion, nominations). */
	clock: null as ClockSource | null,
	status: 'connecting' as LinkStatus,
	statusDetail: '',
	town: null as Town | null,
	townText: '',
	phase: 'day' as Phase,
	me: '',
	people: new Map<string, Person>(),
	route: [] as P[],
	seen: null as Uint8Array | null,
	voice: null as Voice | null,
	voiceBusy: false,
	cell: 20,
	dirty: true,
	stOpen: false,
	sheet: null as null | 'people',
	/** Requests for a private word, waiting for an answer. */
	asks: [] as string[],
	// host only
	clients: new Map<string, string>(),
	bots: new Map<string, { route: P[]; rest: number }>(),
	/** Doors the night locked, unlocked again at dawn. */
	nightLocks: new Set<number>(),
	/** Walkers of phones that dropped out, by phone, to give back if they return. */
	gone: new Map<string, Person>(),
	/** In a game: the phones that have the village. */
	welcomed: new Set<string>()
};

const store = {
	get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
	set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
};
/** The bell (and its buzz) at dusk: off unless this phone has turned it on. */
const soundOn = () => store.get('grimoire.sound') === 'on';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const me = () => S.people.get(S.me);
const nameOf = (id: string | null | undefined) => (id && S.people.get(id)?.name) || 'someone';
const inkOf = (q: Person) => (q.st ? ST_INK : INKS[q.ink % INKS.length]);
const glyphOf = (q: Person) => (q.st ? '✦' : q.name[0]?.toUpperCase() ?? '?');
const privateAllowed = (from: Person) => S.phase === 'day' || S.phase === 'dusk' || (!!from.st && S.phase === 'night');

// ---- the host -----------------------------------------------------------------------------

function spawnPoint(t: Town, n: number): P {
	// In the square, a little apart from the others.
	const base = t.meeting ? { x: Math.round(t.meeting.at.x) - 3, y: Math.round(t.meeting.at.y + 3) } : { x: Math.floor(t.w / 2), y: Math.floor(t.h / 2) };
	for (let r = 0; r < 20; r++) {
		for (let k = 0; k < 16; k++) {
			const p = { x: base.x + Math.round(Math.cos(k + n) * r), y: base.y + Math.round(Math.sin(k + n) * r) };
			// Two steps from anyone else, so the name labels do not overlap.
			if (walkable(t, p.x, p.y) && ![...S.people.values()].some((q) => Math.abs(q.x - p.x) < 3 && Math.abs(q.y - p.y) < 2)) return p;
		}
	}
	return base;
}

function addPerson(id: string, name: string, extra: Partial<Person> = {}): Person {
	const p = spawnPoint(S.town!, S.people.size);
	const lowest = (used: Set<number>) => { let k = 0; while (used.has(k)) k++; return k; };
	const players = [...S.people.values()].filter((q) => !q.st);
	const person: Person = {
		id, name: name.slice(0, 14) || 'Someone', x: p.x, y: p.y, voice: false,
		ink: lowest(new Set(players.map((q) => q.ink))),
		seat: lowest(new Set(players.map((q) => q.seat))),
		with: null, ...extra
	};
	S.people.set(id, person);
	return person;
}

/** Send a message to one person: over the link, to the host's own screen, or to a test villager. */
function sendTo(id: string, msg: Down) {
	if (id === S.me) return onDown(msg);
	if (S.bots.has(id)) {
		// Test villagers say yes to a private word, after a moment.
		if (msg.t === 'asked') setTimeout(() => onUp(id, { t: 'reply', to: msg.from, yes: true }), 900);
		return;
	}
	S.hostWire?.send(id, msg);
}

function welcome(id: string) {
	sendTo(id, { t: 'welcome', you: id, town: S.townText, phase: S.phase, people: [...S.people.values()], locked: [...S.town!.locked], caption: S.caption, vote: S.vote, ring: S.ring });
}

/** Everything a phone asks of the host (the host's own taps come here too). */
function onUp(from: string, msg: Up) {
	const t = S.town!;
	const p = S.people.get(from);
	if (!p) return;
	if (msg.t === 'at') {
		if (walkable(t, msg.x, msg.y, p.st)) { p.x = msg.x; p.y = msg.y; }
	} else if (msg.t === 'voice') p.voice = msg.on;
	else if (msg.t === 'ask') {
		const q = S.people.get(msg.to);
		if (!q || q.id === from) return;
		if (!privateAllowed(p)) return sendTo(from, { t: 'notice', text: 'Private words wait for the day.' });
		// A private word is with the Storyteller: a player and them, nobody else.
		if (!p.st && !q.st) return sendTo(from, { t: 'notice', text: 'Private words are with the Storyteller.' });
		if (p.with || q.with) return sendTo(from, { t: 'notice', text: `${q.with ? q.name : 'You'} ${q.with ? 'is' : 'are'} already talking privately.` });
		sendTo(q.id, { t: 'asked', from });
		sendTo(from, { t: 'notice', text: `Asked ${q.name}…` });
	} else if (msg.t === 'reply') {
		const q = S.people.get(msg.to);
		if (!q) return;
		if (msg.yes && !p.with && !q.with && privateAllowed(q)) {
			p.with = q.id;
			q.with = p.id;
			sendTo(q.id, { t: 'notice', text: `${p.name} agreed. Only you two can hear each other.` });
			sendTo(p.id, { t: 'notice', text: `Talking privately with ${q.name}.` });
		} else if (!msg.yes) sendTo(q.id, { t: 'notice', text: `${p.name} would rather not.` });
	} else if (msg.t === 'end') endPrivate(p);
	else if (msg.t === 'door') {
		const c = msg.cell;
		if (msg.x !== undefined && msg.y !== undefined && walkable(t, msg.x, msg.y, p.st)) { p.x = msg.x; p.y = msg.y; }
		if (!mayWorkDoor(t, p, c)) return sendTo(from, { t: 'notice', text: S.phase === 'day' || S.phase === 'dusk' ? 'Get nearer the door, on the inside.' : 'The doors stay as they are now.' });
		// Double doors go together.
		const leaves = doorLeaves(t, c);
		if ([...S.people.values()].some((q) => leaves.includes(q.x + q.y * t.w))) return sendTo(from, { t: 'notice', text: 'Someone is standing in the doorway.' });
		const lock = !t.locked.has(c);
		for (const d of leaves) {
			if (lock) t.locked.add(d);
			else t.locked.delete(d);
			S.nightLocks.delete(d);
		}
	}
	S.dirty = true;
}

function endPrivate(p: Person) {
	const q = p.with ? S.people.get(p.with) : null;
	p.with = null;
	if (q) {
		q.with = null;
		sendTo(q.id, { t: 'notice', text: `${p.name} ended the private word.` });
	}
}

/** You may lock or unlock a door from inside (never from the street), and not at night. The Storyteller never does: they walk through. */
function mayWorkDoor(t: Town, p: Person, cell: number): boolean {
	return !p.st && S.phase !== 'night' && S.phase !== 'circle' && canWorkDoor(t, p, cell);
}

/** Where you stood before your last step (to know which way is "in" from a doorway). */
let lastAt: P | null = null;

/** Lock or unlock a door near you. From the doorway itself, step inside first. */
function workDoor(d: number) {
	const p = me(), t = S.town;
	if (!p || !t) return;
	if (doorLeaves(t, d).includes(p.x + p.y * t.w)) {
		const inn = doorStepIn(t, p, d, lastAt);
		if (!inn) return toast('Step inside first.');
		S.route = [];
		lastAt = { x: p.x, y: p.y };
		p.x = inn.x; p.y = inn.y;
		sendPos(p);
	}
	if (!up({ t: 'door', cell: d, x: p.x, y: p.y })) toast('Reconnecting to the Storyteller… try again in a moment.');
	S.dirty = true;
}

function openVillage(script?: string) {
	S.host = true;
	S.room = newRoomCode();
	S.townText = townFor(script);
	loadTown(S.townText);
	const link = hostRoom<Up, Down>(S.room, {
		message: (peerId, msg) => {
			if (msg.t === 'hello') {
				let p = S.people.get(peerId);
				// The same phone again (it lost signal, or reloaded): give it back its walker.
				const back = S.gone.get(msg.clientId);
				if (!p && back) {
					p = { ...back, id: peerId, with: null };
					S.gone.delete(msg.clientId);
					S.people.set(peerId, p);
				}
				if (!p) {
					p = addPerson(peerId, msg.name);
					if (S.phase === 'night') sendHome(S.town!, p, occupied());
				}
				S.clients.set(peerId, msg.clientId);
				welcome(peerId);
			} else onUp(peerId, msg);
			S.dirty = true;
		},
		joined: () => {},
		left: (peerId) => {
			const p = S.people.get(peerId);
			if (p) {
				endPrivate(p);
				const client = S.clients.get(peerId);
				if (client) S.gone.set(client, p);
			}
			S.people.delete(peerId);
			S.dirty = true;
		},
		status: (s, d) => { S.status = s; S.statusDetail = d ?? ''; drawChrome(); }
	}, PREFIX);
	S.hostWire = { peer: link.peer, send: (id, m) => link.send(id, m), peers: () => [...link.peers.keys()] };
	S.me = PREFIX + S.room;
	addPerson(S.me, 'Storyteller', { st: true, ink: -1, seat: -1 });
	startTicker();
	enterMap();
}

/** Everyone's whereabouts, the doors and the circle's words, a few times a second. */
let ticking = false;
function startTicker() {
	if (ticking) return;
	ticking = true;
	let last = '';
	setInterval(() => {
		moveBots();
		const people = [...S.people.values()];
		const locked = [...S.town!.locked];
		const json = JSON.stringify([people, locked, S.caption, S.vote, S.ring]);
		if (json === last) return;
		last = json;
		for (const id of S.hostWire?.peers() ?? []) sendTo(id, { t: 'people', people, locked, caption: S.caption, vote: S.vote, ring: S.ring });
	}, 150);
}

function setPhase(phase: Phase) {
	const t = S.town!;
	const was = S.phase;
	S.phase = phase;
	if (phase === 'circle' || phase === 'night') for (const p of S.people.values()) if (p.with && !(phase === 'night' && p.st)) endPrivate(p);
	if (was === 'night' && phase !== 'night') {
		for (const c of S.nightLocks) t.locked.delete(c);
		S.nightLocks.clear();
	}
	if (phase === 'night') sendEveryoneHome(t);
	if (phase === 'dusk' && S.game) gatherAtCross(t);
	for (const id of S.hostWire?.peers() ?? []) sendTo(id, { t: 'phase', phase });
	announcePhase();
}

/** Night: each villager to a home (a room with a bed), and every home's door locked. */
function sendEveryoneHome(t: Town) {
	if (!t.homes.length) return;
	const taken = new Set<number>();
	for (const q of [...S.people.values()].filter((q) => !q.st).sort((a, b) => a.seat - b.seat)) sendHome(t, q, taken);
	for (const room of t.homes) for (const d of doorsOf(t, room)) if (!t.locked.has(d)) { t.locked.add(d); S.nightLocks.add(d); }
	S.dirty = true;
}

/** One villager to their home (by seat), to a bed if one is free; `taken` collects the places used. */
function sendHome(t: Town, q: Person, taken: Set<number>) {
	if (!t.homes.length) return;
	const room = t.homes[q.seat % t.homes.length];
	const cells: P[] = [];
	for (let i = 0; i < t.w * t.h; i++) if (t.room[i] === room && !taken.has(i) && walkable(t, i % t.w, Math.floor(i / t.w))) cells.push({ x: i % t.w, y: Math.floor(i / t.w) });
	const bed = cells.find((c) => t.cells[c.x + c.y * t.w].things.includes('bed')) ?? cells[0];
	if (!bed) return;
	taken.add(bed.x + bed.y * t.w);
	q.x = bed.x;
	q.y = bed.y;
	const b = S.bots.get(q.id);
	if (b) b.route = [];
	sendTo(q.id, { t: 'place', x: bed.x, y: bed.y });
}

/** Where seat `i` sits round the market cross: the game's seats spread evenly round it, the first at the top. */
function seatCell(t: Town, i: number): P | null {
	const L = t.seats.length;
	if (!L || !t.meeting) return null;
	const n = S.ring.length || [...S.people.values()].filter((q) => !q.st).length;
	const m = t.meeting.at;
	let top = 0, best = Infinity;
	t.seats.forEach((c, k) => {
		const a = Math.abs(Math.atan2(c.y - m.y, c.x - m.x) + Math.PI / 2);
		if (a < best) { best = a; top = k; }
	});
	const step = n > 0 && n <= L && i < n ? L / n : 1;
	return t.seats[(top + Math.round(i * step)) % L];
}

/** Dusk in a game: everyone to their seat round the market cross, the Storyteller to the cross. */
function gatherAtCross(t: Town) {
	for (const q of S.people.values()) {
		if (q.st) continue;
		const c = seatCell(t, q.seat);
		if (!c) continue;
		endPrivate(q);
		q.x = c.x;
		q.y = c.y;
		const b = S.bots.get(q.id);
		if (b) b.route = [];
		sendTo(q.id, { t: 'place', x: c.x, y: c.y });
	}
	const st = [...S.people.values()].find((q) => q.st);
	if (st && t.meeting) {
		const m = t.meeting.at;
		st.x = Math.round(m.x);
		st.y = Math.round(m.y);
		if (st.id === S.me) { S.route = []; cam.ready = false; }
	}
	S.dirty = true;
}

/** The nearest walkable cell to `p` not in `taken`. */
function nearestOpen(t: Town, p: P, taken: Set<number>): P {
	for (let r = 0; r < Math.max(t.w, t.h); r++)
		for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
			if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
			const x = p.x + dx, y = p.y + dy;
			if (walkable(t, x, y) && !taken.has(x + y * t.w)) return { x, y };
		}
	return p;
}

const occupied = () => new Set([...S.people.values()].map((q) => q.x + q.y * S.town!.w));

/** The Storyteller steps into someone's room, beside them. */
function visit(id: string) {
	const t = S.town!, st = me(), q = S.people.get(id);
	if (!st || !q) return;
	const spots = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
		.map(([dx, dy]) => ({ x: q.x + dx, y: q.y + dy }))
		.filter((c) => walkable(t, c.x, c.y, true) && sameRoom(t, c, q) && ![...S.people.values()].some((o) => o.x === c.x && o.y === c.y));
	const spot = spots[0] ?? { x: q.x, y: q.y };
	st.x = spot.x;
	st.y = spot.y;
	S.route = [];
	cam.ready = false;
	S.sheet = null;
	drawChrome();
	S.dirty = true;
}

function addBot() {
	const n = S.bots.size;
	const id = `bot-${n}-${Math.random().toString(36).slice(2, 6)}`;
	// In a game, test villagers sit after the real seats.
	addPerson(id, BOT_NAMES[n % BOT_NAMES.length], { voice: true, hum: 150 + ((n * 67) % 250), ...(S.game ? { seat: 100 + n } : {}) });
	S.bots.set(id, { route: [], rest: 0 });
	S.dirty = true;
}

let botTick = 0;
function moveBots() {
	if (++botTick % 3 || S.phase === 'circle') return;
	const t = S.town!;
	for (const [id, b] of S.bots) {
		const p = S.people.get(id);
		if (!p || p.with) continue;
		if (b.route.length) {
			const next = b.route.shift()!;
			if (walkable(t, next.x, next.y)) { p.x = next.x; p.y = next.y; } else b.route = [];
		} else if (b.rest > 0) b.rest--;
		else {
			// Dusk: to their seat. Otherwise: wander somewhere nearby (at night, round the house).
			const seat = S.phase === 'dusk' ? seatCell(t, p.seat) : null;
			const goal = seat ?? { x: p.x + Math.round((Math.random() - 0.5) * 24), y: p.y + Math.round((Math.random() - 0.5) * 16) };
			b.route = path(t, p, goal).slice(0, 30);
			b.rest = S.phase === 'dusk' ? 6 : 4 + Math.floor(Math.random() * 12);
		}
	}
	S.dirty = true;
}

/** Ask the host: over the link, or straight to it on the host's own phone. */
function up(msg: Up): boolean {
	if (S.host) { onUp(S.me, msg); return true; }
	return !!S.playerWire?.send(msg);
}

// ---- a player -------------------------------------------------------------------------------

/** What the host tells this phone (the host's own phone too). */
function onDown(msg: Down) {
	if (msg.t === 'place') {
		const p = me();
		if (p) { p.x = msg.x; p.y = msg.y; }
		S.route = [];
		cam.ready = false;
	} else if (msg.t === 'asked') {
		if (!S.asks.includes(msg.from)) S.asks.push(msg.from);
		try { navigator.vibrate?.(200); } catch { /* not supported */ }
		drawChrome();
	} else if (msg.t === 'notice') toast(msg.text);
	S.dirty = true;
}

function joinVillage(code: string, name: string) {
	S.room = code;
	let clientId = store.get('grimoire.villageClient');
	if (!clientId) { clientId = Math.random().toString(36).slice(2); store.set('grimoire.villageClient', clientId); }
	const link = joinRoom<Down, Up>(code, {
		message: onPlayerDown,
		status: (s, d) => {
			S.status = s;
			S.statusDetail = d ?? '';
			if (s === 'open') link.send({ t: 'hello', name, clientId: clientId! });
			drawChrome();
		}
	}, PREFIX);
	S.playerWire = { peer: link.peer, send: (m) => link.send(m) };
	drawChrome();
}

/** A player's phone: everything the host sends. */
function onPlayerDown(msg: Down) {
	if (msg.t === 'welcome') {
		S.me = msg.you;
		if (msg.town !== S.townText) { S.townText = msg.town; loadTown(msg.town); }
		S.phase = msg.phase;
		S.people = new Map(msg.people.map((p) => [p.id, p]));
		S.town!.locked = new Set(msg.locked);
		S.caption = msg.caption ?? [];
		S.vote = msg.vote ?? null;
		S.ring = msg.ring ?? [];
		if (S.voice) up({ t: 'voice', on: true });
		showVillage();
		announcePhase();
	} else if (msg.t === 'people') {
		const mine = me();
		S.people = new Map(msg.people.map((p) => [p.id, p]));
		// Our own walker is ours: the host's copy may be a step behind.
		if (mine && S.people.has(S.me)) Object.assign(S.people.get(S.me)!, { x: mine.x, y: mine.y });
		if (S.town) S.town.locked = new Set(msg.locked);
		S.caption = msg.caption ?? [];
		S.vote = msg.vote ?? null;
		S.ring = msg.ring ?? [];
		drawChromeIfChanged();
	} else if (msg.t === 'phase') {
		S.phase = msg.phase;
		announcePhase();
	} else if (msg.t === 'off') hideVillage();
	else onDown(msg);
	S.dirty = true;
}

function sendPos(p: Person) {
	if (!S.host) S.playerWire?.send({ t: 'at', x: p.x, y: p.y });
}

// ---- the town and moving round it ----------------------------------------------------------------

function loadTown(text: string) {
	S.town = makeTown(parseBlueprint(text));
	// Villagers know their own town: all of it is on the map, dim, until they can see it.
	S.seen = new Uint8Array(S.town.w * S.town.h).fill(1);
	S.dirty = true;
}

const canWalk = () => S.phase !== 'circle' && !!me() && !(S.game && S.phase === 'dusk' && !me()!.st);

function step(dx: number, dy: number) {
	const p = me();
	const t = S.town;
	if (!p || !t || !canWalk()) return;
	S.route = [];
	const nx = p.x + dx, ny = p.y + dy;
	if (!walkable(t, nx, ny, p.st)) return;
	if (dx && dy && (!walkable(t, p.x + dx, p.y, p.st) || !walkable(t, p.x, p.y + dy, p.st))) return;
	lastAt = { x: p.x, y: p.y };
	p.x = nx; p.y = ny;
	sendPos(p);
	S.dirty = true;
}

function walkTo(goal: P) {
	const p = me();
	const t = S.town;
	if (!p || !t || !canWalk()) return;
	let g = goal;
	if (!walkable(t, g.x, g.y, p.st)) {
		// Tapped a wall or a table: go to the nearest place beside it.
		const near = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]
			.map(([dx, dy]) => ({ x: g.x + dx, y: g.y + dy }))
			.filter((q) => walkable(t, q.x, q.y, p.st))
			.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
		if (!near.length) return;
		g = near[0];
	}
	S.route = path(t, p, g, p.st);
}

setInterval(() => {
	const p = me(), t = S.town;
	if (!p || !t || !S.route.length) return;
	const next = S.route.shift()!;
	// A door shut in your face: stop.
	if (!walkable(t, next.x, next.y, p.st)) { S.route = []; return; }
	lastAt = { x: p.x, y: p.y };
	p.x = next.x; p.y = next.y;
	sendPos(p);
	S.dirty = true;
	drawChromeIfChanged();
}, 140);

/** The nearest door you could work from here (standing in it, or within two steps inside), if any. */
function doorBeside(): number | null {
	const t = S.town, p = me();
	if (!t || !p) return null;
	let best: number | null = null, bestD = Infinity;
	for (let dy = -DOOR_REACH; dy <= DOOR_REACH; dy++) for (let dx = -DOOR_REACH; dx <= DOOR_REACH; dx++) {
		const x = p.x + dx, y = p.y + dy, d = Math.hypot(dx, dy);
		if (d < bestD && at(t, x, y)?.things.includes('door') && mayWorkDoor(t, p, x + y * t.w)) { best = x + y * t.w; bestD = d; }
	}
	return best;
}

// ---- drawing: Tachyon's look (look.ts) --------------------------------------------------------------

let dyn: Uint8ClampedArray | null = null;
let lightAt = 0, lightTick = 0, drawnAt = 0;
/** Where each person is drawn: gliding after where they are, so steps slide instead of jump. */
const shownAt = new Map<string, { x: number; y: number }>();
/** Something is still gliding: draw the next frame too. */
let animating = false;
function glide(id: string, x: number, y: number, dt: number) {
	let d = shownAt.get(id);
	// Far (a teleport: home at night, to a seat, a visit): there at once.
	if (!d || Math.hypot(d.x - x, d.y - y) > 3) { d = { x, y }; shownAt.set(id, d); return d; }
	const k = 1 - Math.exp(-dt / 55);
	d.x += (x - d.x) * k;
	d.y += (y - d.y) * k;
	if (Math.abs(d.x - x) < 0.01 && Math.abs(d.y - y) < 0.01) { d.x = x; d.y = y; } else animating = true;
	return d;
}
/** The camera: glides after you, so you stay in the middle of the screen. */
const cam = { x: 0, y: 0, ready: false };
const GOLD: Rgb = [220, 160, 60];
const VSHEET = {};
let shown = false;
let banner: { title: string; line: string; until: number } | null = null;
let toastMsg: { text: string; until: number } | null = null;
setExtra(villageCells);
function touchesRoom(t: Town, x: number, y: number, rooms: number[]): boolean {
	for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
		const nx = x + dx, ny = y + dy;
		if (nx >= 0 && ny >= 0 && nx < t.w && ny < t.h && rooms.includes(t.room[nx + ny * t.w])) return true;
	}
	return false;
}

const prose = (text: string, tone?: 'dim'): Row[] => wrap(text, INNER).map((l) => row(txt(l, tone)));

const talking = (q: Person) => (q.id === S.me ? S.voice?.myLevel() ?? 0 : S.voice?.level(q.id) ?? 0);

const fold = (ch: string) => {
	if (ch.charCodeAt(0) < 128) return ch;
	const m: Record<string, string> = { '·': '.', '♣': '&', '♠': '&', '▒': '%', '▓': '#', '█': '#', '░': ':', '≈': '~', '∼': '~', '▲': '^', '↑': '^', '○': 'o', '•': '.', '✶': '*', '✦': '*' };
	return m[ch] ?? '*';
};

/** The map's frame: move people and the camera, light the town, and ask for a redraw only when something changed. */
function tickMap() {
	const t = S.town, p = me();
	if (!shown || !t || !p) return;
	const now = performance.now();
	const relight = !dyn || now - lightAt > 120;
	if (!cam.ready) Object.assign(cam, { x: p.x, y: p.y, ready: true });
	const settled = Math.abs(cam.x - p.x) < 0.01 && Math.abs(cam.y - p.y) < 0.01;
	if (!relight && !S.dirty && settled && !animating && S.phase !== 'circle' && now - drawnAt < 250) return;
	const dt = Math.min(100, Math.max(1, now - drawnAt));
	animating = false;
	for (const q of S.people.values()) glide(q.id, q.x, q.y, dt);
	for (const id of [...shownAt.keys()]) if (!S.people.has(id)) shownAt.delete(id);
	const me0 = shownAt.get(p.id) ?? p;
	const k = 1 - Math.exp(-dt / 80);
	cam.x += (me0.x - cam.x) * k;
	cam.y += (me0.y - cam.y) * k;
	if (Math.abs(cam.x - p.x) < 0.02 && Math.abs(cam.y - p.y) < 0.02) Object.assign(cam, { x: p.x, y: p.y });
	S.dirty = false;
	drawnAt = now;
	if (relight) {
		lightAt = now;
		const srcs = sources(t, ++lightTick);
		if (S.phase !== 'day') for (const q of S.people.values()) srcs.push({ x: q.x, y: q.y, c: q.id === S.me ? LANTERN : (LANTERN.map((v) => v * 0.75) as Rgb) });
		dyn = lightMap(t, srcs);
	}
	redraw();
}

/** The buttons of the bottom bar. */
function toolButtons(): Button[] {
	const p = me();
	if (S.asks.some((id) => S.people.has(id))) return [btn('Talk', () => act('accept'), { style: 'primary' }), btn('Not now', () => act('decline'))];
	const bs: Button[] = [];
	if (p?.with) bs.push(btn('End', () => act('end')));
	const v = S.voice;
	if (v) {
		if (v.mode === 'listen') bs.push(btn('Talk', () => act('voice-talk'), { style: 'primary' }), btn('Listening', () => act('voice-stop'), { style: 'on' }));
		else bs.push(btn(v.muted ? 'Unmute' : 'Mute', () => act('mute'), { style: v.muted ? 'on' : 'primary' }));
	} else if (S.voiceBusy) bs.push(btn('Starting...', () => {}, { disabled: true }));
	else bs.push(btn('Talk', () => act('voice-mic'), { style: 'primary' }), btn('Listen', () => act('voice-listen')));
	for (const e of S.extra()) bs.push(btn(e.label, e.act, { style: e.primary ? 'primary' : undefined }));
	bs.push(btn('People', () => act('people')));
	const door = doorBeside();
	if (door !== null) bs.push(btn(S.town!.locked.has(door) ? 'Unlock door' : 'Lock door', () => act('door')));
	if (S.phase === 'dusk' && !S.game && p && !p.st && S.town?.seats.length) bs.push(btn('My seat', () => act('seat'), { style: 'primary' }));
	bs.push(btn(soundOn() ? 'Bell on' : 'Bell off', () => act('sound'), { style: 'quiet' }));
	if (S.host) bs.push(btn('Menu', () => act('st-toggle'), { style: S.stOpen ? 'on' : 'quiet' }));
	return bs;
}

/** Stamp wrapped buttons at (x, y) in `w` columns; returns the height used. */
function stampButtons(g: Grid, x: number, y: number, w: number, bs: Button[]): number {
	const lines = buttonRows(bs, w, 0);
	lines.forEach((r, i) => {
		let bx = x;
		for (const s of r.segs) {
			if (isButton(s)) drawButton({ g, x, y, w, ink: () => 4, hit: (rc, fn) => g.hit(rc, fn) }, bx, y + i * 3, segWidth(s), s);
			bx += segWidth(s);
		}
	});
	return lines.length * 3;
}

/** The village, drawn as cells under the grimoire's pages: map (or circle), status lines and the button bar. */
function villageCells(g: Grid): boolean {
	const t = S.town, p = me();
	if (!shown || !t || !p) return false;
	if (!dyn) tickMap();
	if (!dyn) return false;
	const now = performance.now();
	const stbar = S.host ? S.stActions : null;
	const tools = toolButtons();
	const toolH = buttonRows(tools, g.cols, 0).length * 3;
	const stBs = stbar ? stbar.buttons.map((b) => btn(b.label, b.act, { style: b.primary ? 'primary' : undefined })) : [];
	const stH = stbar ? 1 + buttonRows(stBs, g.cols, 0).length * 3 : 0;
	const mapY = 1, mapH = Math.max(4, g.rows - 3 - stH - toolH);
	// Top line: where we are in the game.
	const c = S.clock?.get() ?? null;
	const sec = c ? Math.ceil(c.left / 1000) : 0;
	const top = PHASE_NAME[S.phase] + '  ' + S.room + (S.status === 'open' ? '' : '  ' + (S.status === 'error' ? S.statusDetail : 'connecting...')) + (c ? '  ' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') : '');
	g.fill({ x: 0, y: 0, w: g.cols, h: 1 }, ' ', 5, 1);
	g.text(1, 0, top.slice(0, g.cols - 2), 5, 1);
	if (S.phase === 'circle') circleCells(g, mapY, mapH);
	else mapCells(g, mapY, mapH, p, t, now);
	// The line of what you can hear, and the passing notice.
	const where = p.with ? 'Private with ' + nameOf(p.with) + ': nobody else hears you'
		: S.phase === 'night' ? (p.st ? 'Night: whoever is in this room hears you' : 'Night: at home. Only the Storyteller may visit')
		: inMeeting(t, p, S.phase) ? 'In the ring of seats: all in it hear you'
		: atSpeakingPlace(t, p) ? 'At the market cross: the whole town hears you'
		: t.room[p.x + p.y * t.w] === t.outdoors ? 'Outdoors: voices carry' : 'Indoors: voices carry through open doors';
	const near = hearList().filter((h) => h.loud > 0).sort((a, b) => b.loud - a.loud).slice(0, 3).map((h) => (h.q.st ? 'Storyteller' : h.q.name) + ' ' + Math.round(h.loud * 100) + '%').join('  ');
	const iy = mapY + mapH;
	g.fill({ x: 0, y: iy, w: g.cols, h: 2 }, ' ', 3, 0);
	g.text(1, iy, (toastMsg && toastMsg.until > now ? toastMsg.text : where).slice(0, g.cols - 2), toastMsg && toastMsg.until > now ? 6 : 3, 0);
	g.text(1, iy + 1, (near ? 'Near: ' + near : S.voice ? '' : 'voice off').slice(0, g.cols - 2), 3, 0);
	let y = iy + 2;
	if (stbar) { g.text(1, y, stbar.text.slice(0, g.cols - 2), 6, 0); y += 1 + stampButtons(g, 0, y + 1, g.cols, stBs) - 1; }
	const from = S.asks.find((id) => S.people.has(id));
	if (from) g.text(1, y, (nameOf(from) + ' asks for a private word.').slice(0, g.cols - 2), 6, 0);
	stampButtons(g, 0, g.rows - toolH, g.cols, tools);
	if (banner && banner.until > now) {
		const w = Math.min(g.cols - 2, Math.max(banner.title.length, banner.line.length) + 4);
		const lines = wrap(banner.line, w - 4);
		const bx = Math.floor((g.cols - w) / 2);
		g.fill({ x: bx, y: mapY + 1, w, h: lines.length + 4 }, ' ', 5, 0);
		g.box({ x: bx, y: mapY + 1, w, h: lines.length + 4 }, 6, 0);
		g.text(bx + Math.floor((w - banner.title.length) / 2), mapY + 2, banner.title, 8, 0);
		lines.forEach((l, i) => g.text(bx + 2, mapY + 4 + i, l, 4, 0));
	}
	return true;
}

/** Tap to walk: the cell under a tap in the map. */
let view = { x0: 0, y0: 0 };

function mapCells(g: Grid, mapY: number, mapH: number, p: Person, t: Town, now: number) {
	const cols = g.cols;
	const x0 = Math.round(cam.x) - Math.floor(cols / 2), y0 = Math.round(cam.y) - Math.floor(mapH / 2);
	view = { x0, y0: y0 - mapY };
	g.hit({ x: 0, y: mapY, w: cols, h: mapH }, (sx, sy) => {
		audio();
		const cell = { x: x0 + sx, y: y0 + (sy - mapY) };
		const i = cell.x + cell.y * t.w;
		if (t.locked.has(i) && mayWorkDoor(t, p, i)) { workDoor(i); return; }
		walkTo(cell);
		S.dirty = true;
	});
	const mine = p.st ? [] : roomsAt(t, p);
	const inside = mine.length > 0 && !mine.includes(t.outdoors);
	const here = at(t, p.x, p.y);
	const inCave = !p.st && !inside && here?.tile !== 'wall' && here?.mat === 'granite';
	const fogBase = FOG[S.phase];
	const vis = p.st ? new Set(t.cells.map((_, i) => i)) : visibleCells(t, p, 'day');
	for (const i of vis) S.seen![i] = 1;
	const sk = sky(t), day = sunlight(S.phase);
	const seatSet = new Set(t.seats.map((q) => q.x + q.y * t.w));
	const lit = new Map<number, Rgb>();
	const ground = new Map<number, number>();
	for (let sy = 0; sy < mapH; sy++) {
		for (let sx = 0; sx < cols; sx++) {
			const x = x0 + sx, y = y0 + sy;
			if (x < 0 || y < 0 || x >= t.w || y >= t.h) continue;
			const i = x + y * t.w;
			const shown = vis.has(i);
			if (!shown && !S.seen![i]) continue;
			const r = t.room[i];
			const indoors = r >= 0 ? r !== t.outdoors : inside && touchesRoom(t, x, y, mine);
			if (inside && !shown && !t.locked.has(i) && !(r >= 0 ? mine.includes(r) : touchesRoom(t, x, y, mine))) continue;
			const rock = t.cells[i].mat === 'granite';
			if (inCave && !shown && !rock) continue;
			const look = lookAt(t, x, y, now);
			let fg: Rgb, bg: Rgb;
			if (shown) {
				const l = level(t, sk, dyn!, day, x, y);
				lit.set(i, l);
				fg = look.emissive ? look.fg : mul(look.fg, l);
				bg = mul(look.bg, l);
			} else {
				[fg, bg] = remembered(look.fg, look.bg);
				if (S.phase === 'night') [fg, bg] = [mul(fg, [0.5, 0.5, 0.6]), mul(bg, [0.5, 0.5, 0.6])];
				if (t.locked.has(i)) [fg, bg] = [look.fg, mul(look.bg, [0.6, 0.6, 0.6])];
			}
			const f = indoors ? (shown ? 0 : 0.2)
				: inCave && rock ? fogAt(t, x, y, cam, S.phase, now) * 0.25 * (shown ? 1 : 0.6) + (shown ? 0 : 0.35)
				: fogAt(t, x, y, cam, S.phase, now) * (p.st ? 0.6 : 1) * (shown ? 1 : 0.6) + (shown ? 0 : 0.35) + (inCave ? 0.25 : 0);
			if (f > 0.01) fg = lerp(fg, fogBase, Math.min(1, f * 1.05));
			let ch = fold(look.ch);
			if (look.wall) {
				const m = look.wall.mask;
				ch = (m & 10) && (m & 5) ? '+' : m & 10 ? (look.wall.style === 'double' ? '=' : '-') : '|';
			} else if (look.glass) ch = '"';
			else if (look.icon === 'bell') ch = 'A';
			else if (look.icon === 'clock') ch = '@';
			else if (ch === ' ' && luma(bg) > 14) { ch = '.'; fg = lerp(bg, [255, 255, 255], 0.28); }
			const fgi = quant(fg);
			// Backgrounds carry meaning only: seats at dusk, and the page elsewhere.
			const bgi = S.phase === 'dusk' && seatSet.has(i) ? 1 : 0;
			ground.set(i, bgi);
			g.set(sx, mapY + sy, ch, fgi, bgi);
		}
	}
	for (const l of t.labels) {
		const i = l.x + l.y * t.w;
		if (!S.seen![i] && !p.st) continue;
		if ((inside || inCave) && !vis.has(i)) continue;
		const sx = l.x - x0, sy = l.y - y0 - 1;
		if (sy < 0 || sy >= mapH) continue;
		for (let k = 0; k < l.text.length; k++) {
			const cell = g.get(sx + k, mapY + sy);
			if (cell && cell.ch === ' ') g.set(sx + k, mapY + sy, l.text[k], 3, 0);
		}
	}
	const people = [...S.people.values()].filter((q) => {
		if (q.id === S.me) return true;
		if (q.st && S.phase === 'night' && !p.st && !sameRoom(t, p, q)) return false;
		const l = lit.get(q.x + q.y * t.w);
		return !!l && (luma(l.map((v) => v * 255) as Rgb) > 30 || Math.hypot(q.x - p.x, q.y - p.y) < 2);
	});
	for (const q of people) {
		const d = shownAt.get(q.id) ?? q;
		const sx = Math.round(d.x) - x0, sy = Math.round(d.y) - y0;
		if (sy < 0 || sy >= mapH) continue;
		const ink = q.st ? 6 : quant(hexRgb(inkOf(q)));
		const mineQ = q.id === S.me;
		const talk = talking(q) > 0.15;
		g.set(sx, mapY + sy, q.st ? '*' : glyphOf(q), mineQ ? 0 : ink, mineQ ? ink : talk ? 1 : 0);
	}
	if (S.game && S.phase === 'dusk' && t.meeting) {
		for (const r of S.ring) {
			if ([...S.people.values()].some((q) => !q.st && q.seat === r.seat)) continue;
			const cell = seatCell(t, r.seat);
			if (!cell) continue;
			g.set(cell.x - x0, mapY + cell.y - y0, r.name[0]?.toUpperCase() ?? '?', r.dead ? 3 : quant(hexRgb(INKS[r.seat % INKS.length])), 0);
		}
	}
	if (S.route.length) {
		const goal = S.route[S.route.length - 1];
		const cell = g.get(goal.x - x0, mapY + goal.y - y0);
		if (cell) cell.bg = 6, cell.fg = 0;
	}
}

const hexRgb = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** The circle: everyone on one ring, the vote's hands raised. */
function circleCells(g: Grid, y0: number, h: number) {
	const ring = S.ring.length ? S.ring : [...S.people.values()].filter((q) => !q.st).map((q) => ({ seat: q.seat, name: q.name, dead: !!q.dead }));
	const n = Math.max(1, ring.length);
	const cx = Math.floor(g.cols / 2), cy = y0 + Math.floor(h / 2);
	const rx = Math.max(6, cx - 5), ry = Math.max(3, Math.floor(h / 2) - 2);
	S.caption.forEach((line, i) => g.text(cx - Math.floor(line.length / 2), cy - Math.floor(S.caption.length / 2) + i, line.slice(0, g.cols - 2), i === 0 ? 8 : 3, 0));
	const v = S.vote;
	ring.forEach((r, i) => {
		const a = (2 * Math.PI * i) / n;
		const x = Math.round(cx + rx * Math.sin(a)), y = Math.round(cy - ry * Math.cos(a));
		const person = [...S.people.values()].find((q) => !q.st && q.seat === r.seat);
		const ink = r.dead ? 3 : person ? quant(hexRgb(inkOf(person))) : 3;
		const hand = v?.raised.includes(r.seat) ? '^' : v?.counted.includes(r.seat) ? '.' : ' ';
		const label = (hand + r.name).slice(0, 9);
		const nominee = v?.nominee === r.seat;
		g.text(x - Math.floor(label.length / 2), y, label, nominee ? 0 : ink, nominee ? 8 : 0);
	});
}

function hearList() {
	const t = S.town, p = me();
	if (!t || !p) return [];
	return [...S.people.values()].filter((q) => q.id !== S.me && q.voice).map((q) => ({ q, loud: loudness(t, p, q, S.phase) }));
}

let chromeKey = '';
/** Redraw the sheets only when what they offer changes (a door beside you, a private word). */
function drawChromeIfChanged() {
	const p = me();
	const d = doorBeside();
	const key = `${d}|${d !== null && S.town!.locked.has(d)}|${S.town?.locked.size}|${p?.with}|${S.phase}`;
	if (key !== chromeKey) drawChrome();
}

/** The sheet over the map (people, a choice, the Storyteller's menu, the lobby): a page of its own, or nothing. */
function sheetRows(): Row[] {
	const p = me();
	if (inLobby) return lobbyRows();
	if (!shown) return [];
	const close = (a: string) => buttonBlock([btn('Close', () => act(a), { style: 'quiet' })]);
	if (S.choice) {
		return [rubric(S.choice.title), ...S.choice.options.map((o) => buttonBlock([btn(o.label, () => act('choice', o.id), { width: INNER })])), endPanel(), close('choice-close')];
	}
	if (S.sheet === 'people') {
		const others = [...S.people.values()].filter((q) => q.id !== S.me).sort((a, b) => Number(!!b.st) - Number(!!a.st) || a.name.localeCompare(b.name));
		const can = p && privateAllowed(p) && !p.with;
		const rows: Row[] = [rubric('People')];
		if (!can) rows.push(...wrap(p?.with ? 'You are already talking privately.' : 'Private words wait for the day.', INNER).map((l) => row(txt(l, 'dim'))));
		for (const q of others) {
			const bs: Button[] = [];
			if (p?.st && !q.st) bs.push(btn('Visit', () => act('visit', q.id), { width: 9 }));
			if (can && !q.with && (q.st || p?.st)) bs.push(btn('Ask', () => act('ask', q.id), { width: 7 }));
			rows.push(listRow((q.st ? 'Storyteller' : q.name) + (q.dead ? ' (dead)' : '') + (q.with ? ' (talking)' : ''), q.dead ? 'dim' : undefined, bs));
		}
		return [...rows, endPanel(), close('sheet-close')];
	}
	if (S.host && S.stOpen) {
		const ph = (k: Phase, label: string) => btn(label, () => act('phase-' + k), { style: S.phase === k ? 'on' : undefined });
		const rows: Row[] = [rubric('Storyteller')];
		if (!S.game) rows.push(buttonBlock([ph('day', 'Day'), ph('dusk', 'Ring the bell'), ph('circle', 'The circle'), ph('night', 'Night')]));
		rows.push(buttonBlock([btn('All ears: ' + (me()?.ears ? 'on' : 'off'), () => act('ears'), { style: me()?.ears ? 'on' : undefined }), btn('+ Test villager', () => act('bot'))]));
		if (S.game) rows.push(buttonBlock([btn('Open the grimoire', () => act('back-game'), { style: 'primary', width: INNER })]));
		else rows.push(...prose('Players open ' + location.origin + location.pathname + '#village=' + S.room, 'dim'));
		if (store.get('grimoire.town')) rows.push(buttonBlock([btn('Use the demo village', () => act('town-reset'))]));
		return [...rows, endPanel(), close('st-toggle')];
	}
	return [];
}

function drawChrome() {
	const p = me();
	const near = doorBeside();
	chromeKey = `${near}|${near !== null && S.town!.locked.has(near)}|${S.town?.locked.size}|${p?.with}|${S.phase}`;
	paint(VSHEET, sheetRows());
	redraw();
}

const BANNERS: Record<Phase, { title: string; line: string }> = {
	day: { title: 'Dawn', line: 'Day. Wander, talk, conspire.' },
	dusk: { title: 'The bell tolls', line: 'Dusk. The town gathers round the market cross.' },
	circle: { title: 'The circle', line: 'The town gathers. Everyone sees and hears everyone.' },
	night: { title: 'Night falls', line: 'You are at home and the doors are locked. The Storyteller may visit.' }
};

function showBanner(title: string, line: string, ms = 5000) {
	banner = { title, line, until: performance.now() + ms };
	setTimeout(redraw, ms + 50);
	S.dirty = true;
}

function toast(text: string) {
	toastMsg = { text, until: performance.now() + 3500 };
	setTimeout(redraw, 3550);
	S.dirty = true;
}

function announcePhase() {
	document.documentElement.dataset.phase = S.phase === 'night' ? 'night' : 'day';
	const b = BANNERS[S.phase];
	// The Storyteller is not sent home: they go where they like.
	showBanner(b.title, me()?.st && S.phase === 'night' ? 'The town sleeps behind locked doors. Walk through walls; People, then Visit, takes you to anyone.' : b.line);
	if (S.phase === 'dusk' && soundOn()) {
		try { bell(); } catch { /* no audio yet */ }
		try { navigator.vibrate?.([300, 200, 300, 200, 300]); } catch { /* not supported */ }
	}
	S.asks = [];
	drawChrome();
	S.dirty = true;
}

async function voiceOn(mode: VoiceMode) {
	const peer = S.hostWire?.peer ?? S.playerWire?.peer;
	if (!peer || S.voice || S.voiceBusy) return;
	S.voiceBusy = true;
	drawChrome();
	try {
		S.voice = await startVoice(peer, mode);
		const p = me();
		if (p) p.voice = true;
		up({ t: 'voice', on: true });
	} catch (e) {
		alert(mode === 'mic' ? 'The microphone could not start. Allow it for this site, or choose Listen to hear the others.' : `Voice could not start: ${e}`);
	}
	S.voiceBusy = false;
	drawChrome();
}

/** Hang up: no more hearing or being heard. */
function voiceOff() {
	S.voice?.stop();
	S.voice = null;
	const p = me();
	if (p) p.voice = false;
	up({ t: 'voice', on: false });
	drawChrome();
}

// Voices: who is in earshot, a few times a second.
setInterval(() => {
	if (!S.town || !me()) return;
	const hear = hearList();
	if (S.voice) S.voice.update(hear.map(({ q, loud }) => ({ id: q.id, loud, hum: q.hum })));
	drawChromeIfChanged();
	if (S.voice) S.dirty = true;
}, 200);

function enterMap() {
	inLobby = false;
	shown = true;
	document.body.classList.add('village-map');
	// Tap to walk: the grid's hit region (see mapCells).
	S.cell = 1;
	drawChrome();
	announcePhase();
	if (looping) return;
	looping = true;
	const loop = () => {
		tickMap();
		requestAnimationFrame(loop);
	};
	requestAnimationFrame(loop);
}
let looping = false;

// ---- the lobby ------------------------------------------------------------------------------------

function lobbyRows(): Row[] {
	const rows: Row[] = [rubric('The Village'), ...prose('Walk the town on your own phone. Talk to whoever is near you: voices fade with distance and stop at walls.', 'dim')];
	if (!lobbyCode) {
		rows.push(buttonBlock([btn('Open the castle town', () => { audio(); openVillage(); }, { style: 'primary', width: INNER })]),
			buttonBlock([btn('Open Saltgrave (Victorian)', () => { audio(); openVillage('laissez-un-faire'); }, { width: INNER })]),
			row(txt(center('or join one', INNER), 'dim')));
	}
	rows.push(field('v-name', 'Your name', lobbyName, (v) => { lobbyName = v.trim(); store.set('grimoire.villageName', lobbyName); drawChrome(); }, 14, 'tap to type'),
		field('v-code', 'Village code', lobbyCodeIn, (v) => { lobbyCodeIn = v.trim().toUpperCase(); drawChrome(); }, 4, 'four letters'));
	if (lobbyMsg) rows.push(row(txt(lobbyMsg, 'rubric')));
	rows.push(buttonBlock([btn('Join', () => act('join'), { style: lobbyCode ? 'primary' : undefined })]), buttonBlock([btn('Back to the grimoire', () => act('back'), { style: 'quiet' })]));
	return rows;
}
let inLobby = false, lobbyCode = '', lobbyName = '', lobbyCodeIn = '', lobbyMsg = '';

function act(a: string, id = '') {
	switch (a) {
		case 'join': {
			const code = (lobbyCodeIn || lobbyCode).trim().toUpperCase();
			if (code.length !== 4 || !lobbyName) { lobbyMsg = 'Enter your name and the four-letter code.'; drawChrome(); return; }
			audio();
			inLobby = false;
			history.replaceState(null, '', `#village=${code}`);
			joinVillage(code, lobbyName);
			break;
		}
		case 'back': location.hash = ''; location.reload(); break;
		case 'ears': { const m = me(); if (m?.st) { m.ears = !m.ears; S.dirty = true; drawChrome(); } break; }
		case 'sound': {
			const on = !soundOn();
			store.set('grimoire.sound', on ? 'on' : 'off');
			if (on) { try { audio(); bell(1); } catch { /* no audio */ } }
			drawChrome();
			break;
		}
		case 'voice-mic': void voiceOn('mic'); break;
		case 'voice-listen': void voiceOn('listen'); break;
		case 'voice-stop': voiceOff(); break;
		case 'voice-talk': voiceOff(); void voiceOn('mic'); break;
		case 'mute': S.voice?.setMuted(!S.voice.muted); drawChrome(); break;
		case 'seat': {
			const p = me(), t = S.town;
			const c = p && t ? seatCell(t, p.seat) : null;
			if (c) walkTo(c);
			break;
		}
		case 'people': S.sheet = S.sheet === 'people' ? null : 'people'; S.stOpen = false; drawChrome(); break;
		case 'sheet-close': S.sheet = null; drawChrome(); break;
		case 'ask': up({ t: 'ask', to: id }); S.sheet = null; drawChrome(); break;
		case 'visit': visit(id); break;
		case 'accept':
		case 'decline': {
			const from = S.asks.shift();
			if (from) up({ t: 'reply', to: from, yes: a === 'accept' });
			drawChrome();
			break;
		}
		case 'end': up({ t: 'end' }); break;
		case 'door': {
			const d = doorBeside();
			if (d !== null) workDoor(d);
			break;
		}
		case 'choice': { const c = S.choice; S.choice = null; c?.pick(id); drawChrome(); break; }
		case 'choice-close': S.choice = null; drawChrome(); break;
		case 'back-game': S.stOpen = false; if (S.onBack) { drawChrome(); S.onBack(); } else hideVillage(); break;
		case 'phase-day': setPhase('day'); break;
		case 'phase-dusk': setPhase('dusk'); break;
		case 'phase-circle': setPhase('circle'); break;
		case 'phase-night': setPhase('night'); break;
		case 'bot': addBot(); break;
		case 'st-toggle': S.stOpen = !S.stOpen; S.sheet = null; drawChrome(); break;
		case 'town-reset':
			try { localStorage.removeItem('grimoire.town'); } catch { /* private mode */ }
			toast('Reopen the village to use the demo village.');
			drawChrome();
			break;
	}
	S.dirty = true;
	setTimeout(drawChromeIfChanged, 250);
}

let wired = false;
/** Arrow keys and WASD walk, on a desktop. */
function wire() {
	if (wired) return;
	wired = true;
	window.addEventListener('keydown', (ev) => {
		if (!shown || ev.target instanceof HTMLInputElement) return;
		const d: Record<string, [number, number]> = {
			ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
			w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0]
		};
		const v = d[ev.key];
		if (!v) return;
		ev.preventDefault();
		step(v[0], v[1]);
	});
}

/** The demo: #village. */
export function startVillage(_appRoot: HTMLElement, code: string) {
	document.body.classList.add('in-village');
	wire();
	inLobby = true;
	lobbyCode = code;
	lobbyCodeIn = code;
	lobbyName = store.get('grimoire.villageName') ?? '';
	drawChrome();
}

/** In a game the village is its own layer, under the grimoire's pages (night wakes, announcements). */
function gameRoot() {
	wire();
}

function showVillage() {
	inLobby = false;
	shown = true;
	document.body.classList.add('village-map');
	if (!looping) enterMap();
	else drawChrome();
	S.dirty = true;
}

function hideVillage() {
	if (!S.game) return;
	shown = false;
	document.body.classList.remove('village-map');
	drawChrome();
}

// ---- inside a real game (mode 3) ---------------------------------------------------------------

/** A seated player, as the game knows them. `seat` is their place round the circle. */
export interface GameSeat { peer: string; name: string; seat: number; dead: boolean; }

export interface VillageHost {
	/** Show the Storyteller the village (Back to the grimoire returns). */
	open(): void;
	/** Back to the grimoire. */
	close(): void;
	fromPhone(peer: string, m: Up): void;
	/** Who is seated with a phone, alive or dead; call whenever it may have changed. */
	seats(list: GameSeat[]): void;
	phase(p: Phase): void;
	/** The Storyteller goes to them (when their night pages are sent). */
	visit(peer: string): void;
	/** What the circle shows in its middle. */
	caption(lines: string[]): void;
	/** Put the village away on every phone. */
	stop(): void;
	/** The Storyteller's next steps, as a bar over the village (null: none). */
	actions(a: StActions | null): void;
	/** A vote in the circle (null when none). */
	vote(v: VoteDraw | null): void;
	/** Every seat in the game, in order round the circle. */
	ring(seats: RingSeat[]): void;
	/** The game's clock (shown in the top bar and on the clock at the cross). */
	clock(src: ClockSource | null): void;
	toast(text: string): void;
	/** The script being played, which picks the town. */
	script(id: string | undefined): void;
}

/** The Storyteller's side, on the grimoire's own room. */
export function villageForGame(wire: HostWire, onBack: () => void): VillageHost {
	gameRoot();
	S.game = true;
	S.host = true;
	S.onBack = onBack;
	S.hostWire = { ...wire, peers: () => [...S.welcomed] };
	S.status = 'open';
	if (!S.town) {
		S.townText = townFor(undefined);
		loadTown(S.townText);
	}
	// A new room means a new name for the Storyteller's phone.
	for (const q of [...S.people.values()]) if (q.st && q.id !== wire.peer.id) S.people.delete(q.id);
	S.me = wire.peer.id;
	if (!S.people.has(S.me)) addPerson(S.me, 'Storyteller', { st: true, ink: -1, seat: -1 });
	startTicker();
	return {
		open: showVillage,
		close: () => { S.stOpen = false; hideVillage(); },
		fromPhone: (peer, m) => { if (S.people.has(peer)) onUp(peer, m); },
		seats: syncSeats,
		phase: (p) => { if (p !== S.phase) setPhase(p); },
		visit: (peer) => { if (S.people.has(peer)) visit(peer); },
		caption: (lines) => { S.caption = lines; },
		actions: (a) => {
			const was = JSON.stringify(S.stActions && { t: S.stActions.text, b: S.stActions.buttons.map((b) => b.label) });
			S.stActions = a;
			if (JSON.stringify(a && { t: a.text, b: a.buttons.map((b) => b.label) }) !== was) drawChrome();
		},
		vote: (v) => { if (JSON.stringify(v) !== JSON.stringify(S.vote)) { S.vote = v; S.dirty = true; } },
		ring: (seats) => { if (JSON.stringify(seats) !== JSON.stringify(S.ring)) { S.ring = seats; S.dirty = true; } },
		clock: (src) => { S.clock = src; },
		toast,
		script: (id) => {
			const text = townFor(id);
			if (text === S.townText) return;
			S.townText = text;
			loadTown(text);
			// Everyone stands somewhere in the new town: at their seat if they have one, by the meeting place if not.
			const t = S.town!;
			const taken = new Set<number>();
			for (const q of S.people.values()) {
				const c = (!q.st && seatCell(t, q.seat)) || nearestOpen(t, t.meeting ? { x: Math.round(t.meeting.at.x), y: Math.round(t.meeting.at.y) } : { x: t.w >> 1, y: t.h >> 1 }, taken);
				q.x = c.x; q.y = c.y; taken.add(c.x + c.y * t.w);
				const b = S.bots.get(q.id);
				if (b) b.route = [];
			}
			S.route = []; cam.ready = false;
			for (const id of S.welcomed) welcome(id);
		},
		stop: () => {
			for (const id of S.welcomed) wire.send(id, { t: 'off' });
			S.welcomed.clear();
			hideVillage();
		}
	};
}

function rekey(q: Person, id: string) {
	S.people.delete(q.id);
	for (const o of S.people.values()) if (o.with === q.id) o.with = id;
	q.id = id;
	S.people.set(id, q);
}

function syncSeats(list: GameSeat[]) {
	const t = S.town!;
	const peers = new Set(list.map((e) => e.peer));
	for (const q of [...S.people.values()]) {
		if (q.st || S.bots.has(q.id) || peers.has(q.id)) continue;
		// Same seat, new phone connection: the same walker.
		const still = list.find((e) => e.seat === q.seat);
		if (still) { rekey(q, still.peer); continue; }
		endPrivate(q);
		S.gone.set(`seat:${q.seat}`, q);
		S.people.delete(q.id);
	}
	const fresh: Person[] = [];
	for (const e of list) {
		let q = S.people.get(e.peer);
		if (!q) {
			const back = S.gone.get(`seat:${e.seat}`);
			if (back) {
				q = { ...back, id: e.peer, with: null };
				S.gone.delete(`seat:${e.seat}`);
				S.people.set(e.peer, q);
			} else {
				q = addPerson(e.peer, e.name, { seat: e.seat, ink: e.seat % INKS.length });
				if (S.phase === 'night') sendHome(t, q, occupied());
			}
			fresh.push(q);
		}
		q.name = e.name;
		q.seat = e.seat;
		q.dead = e.dead;
	}
	// Joining (or back) while the town is gathered: straight to their seat round the cross.
	if (S.game && S.phase === 'dusk') {
		for (const q of fresh) {
			const c = seatCell(t, q.seat);
			if (c) { q.x = c.x; q.y = c.y; sendTo(q.id, { t: 'place', x: c.x, y: c.y }); }
		}
	}
	for (const id of [...S.welcomed]) if (!peers.has(id)) { S.welcomed.delete(id); S.hostWire?.send(id, { t: 'off' }); }
	for (const e of list) if (!S.welcomed.has(e.peer)) { S.welcomed.add(e.peer); welcome(e.peer); }
	S.dirty = true;
}

/** A player's side, on the grimoire's room. `extra` adds buttons to their bar. */
export function villageOnPhone(wire: PlayerWire, extra: () => Extra[]) {
	gameRoot();
	S.game = true;
	S.playerWire = wire;
	S.extra = extra;
	S.status = 'open';
	return {
		receive: onPlayerDown,
		/** The game's buttons may have changed. */
		refresh: () => drawChrome(),
		/** The game's clock, as this phone last heard it. */
		clock: (src: ClockSource | null) => { S.clock = src; },
		toast,
		/** Ask the player to pick from a list. */
		choose: (title: string, options: { id: string; label: string }[], pick: (id: string) => void) => { S.choice = { title, options, pick }; S.sheet = null; drawChrome(); }
	};
}
