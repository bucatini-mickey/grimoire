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
import qrcode from 'qrcode-generator';
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
const BELL_SVG = '<svg class="v-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="3.4" r="1.6" fill="currentColor"/><path d="M12 4.6c-3.6 0-6 2.7-6 6.4v3.6L4 18.2h16l-2-3.6V11c0-3.7-2.4-6.4-6-6.4z" fill="currentColor"/><circle cx="12" cy="20.3" r="1.9" fill="currentColor"/></svg>';
const CLOCK_SVG = '<svg class="v-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 6.5V12l3.6 2.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
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

let canvas: HTMLCanvasElement;
let view = { x0: 0, y0: 0 };
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
const MONO = '"Courier Prime", "Courier New", monospace';
const CAVE_DARK: Rgb = [8, 8, 10];
const BOOK = '"Grenze", "Iowan Old Style", Georgia, serif';
/** People's initials: Almendra's bold capitals, medieval and plain to read even small. */
const INITIALS = '"Almendra", "Grenze", Georgia, serif';
/** People's letters: blackletter. */
const GOTHIC = '"Grenze Gotisch", "UnifrakturCook", "Old English Text MT", serif';

const talking = (q: Person) => (q.id === S.me ? S.voice?.myLevel() ?? 0 : S.voice?.level(q.id) ?? 0);

/** A person: their letter in their colour, bold and glowing while they talk. */
function drawPerson(c: CanvasRenderingContext2D, q: Person, x: number, y: number, size: number, label: boolean) {
	const ink = inkOf(q);
	const talk = talking(q);
	c.save();
	// Their initial in their colour, in uncial capitals, edged in dark so it reads on any ground.
	if (q.dead) c.globalAlpha = 0.5;
	c.font = `700 ${Math.round(size * (q.st ? 1 : 0.95))}px ${q.st ? MONO : INITIALS}`;
	c.textAlign = 'center';
	c.textBaseline = 'middle';
	c.lineJoin = 'round';
	c.lineWidth = Math.max(2, size * 0.16);
	c.strokeStyle = 'rgba(8, 6, 4, .9)';
	c.strokeText(glyphOf(q), x, y + size * 0.04);
	if (talk > 0.06) {
		c.shadowColor = ink;
		c.shadowBlur = 6 + Math.min(14, talk * 30);
	}
	c.fillStyle = ink;
	c.fillText(glyphOf(q), x, y + size * 0.04);
	c.restore();
	if (!label) return;
	c.save();
	c.font = `600 ${Math.max(11, Math.round(size * 0.6))}px Grenze, Georgia, serif`;
	c.textAlign = 'center';
	c.textBaseline = 'middle';
	const text = q.st ? 'Storyteller' : q.id === S.me ? 'you' : q.dead ? `† ${q.name}` : q.name;
	const w = c.measureText(text).width + 6, h = Math.max(13, size * 0.62);
	c.fillStyle = 'rgba(0,0,0,.55)';
	c.fillRect(x - w / 2, y - size * 0.62 - h, w, h);
	c.fillStyle = ink;
	c.fillText(text, x, y - size * 0.62 - h / 2);
	c.restore();
}

function draw() {
	const t = S.town, p = me();
	if (!canvas || !t || !p || root.hidden) return;
	const now = performance.now();
	// Flames flicker about eight times a second; otherwise draw only when something moved.
	const relight = !dyn || now - lightAt > 120;
	if (!cam.ready) Object.assign(cam, { x: p.x, y: p.y, ready: true });
	const settled = Math.abs(cam.x - p.x) < 0.01 && Math.abs(cam.y - p.y) < 0.01;
	// Draw every frame while anything glides (and in the circle, where the fog drifts); otherwise only when needed.
	if (!relight && !S.dirty && settled && !animating && S.phase !== 'circle' && now - drawnAt < 250) return;
	const dt = Math.min(100, Math.max(1, now - drawnAt));
	animating = false;
	for (const q of S.people.values()) glide(q.id, q.x, q.y, dt);
	for (const id of [...shownAt.keys()]) if (!S.people.has(id)) shownAt.delete(id);
	// The camera eases after you, a little behind your own glide.
	const me0 = shownAt.get(p.id) ?? p;
	const k = 1 - Math.exp(-dt / 80);
	cam.x += (me0.x - cam.x) * k;
	cam.y += (me0.y - cam.y) * k;
	if (Math.abs(cam.x - p.x) < 0.02 && Math.abs(cam.y - p.y) < 0.02) Object.assign(cam, { x: p.x, y: p.y });
	S.dirty = false;
	drawnAt = now;
	const dpr = Math.min(2, window.devicePixelRatio || 1);
	const cw = canvas.clientWidth, chh = canvas.clientHeight;
	if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(chh * dpr)) {
		canvas.width = Math.round(cw * dpr);
		canvas.height = Math.round(chh * dpr);
	}
	const c = canvas.getContext('2d')!;
	c.setTransform(dpr, 0, 0, dpr, 0, 0);
	if (S.phase === 'circle') return drawCircle(c, cw, chh, now);
	if (relight) {
		lightAt = now;
		const srcs = sources(t, ++lightTick);
		// After dark, everyone carries a lantern.
		if (S.phase !== 'day') for (const q of S.people.values()) srcs.push({ x: q.x, y: q.y, c: q.id === S.me ? LANTERN : (LANTERN.map((v) => v * 0.75) as Rgb) });
		dyn = lightMap(t, srcs);
	}
	// Indoors (a player inside, not in the doorway): no fog in here, and outside is dark
	// but for what a doorway or a window shows. Outdoors, beyond what you can see: the fog.
	const mine = p.st ? [] : roomsAt(t, p);
	const inside = mine.length > 0 && !mine.includes(t.outdoors);
	// In the cave: the daylight outside is a bright mouth, the rest falls into dark and mist.
	const here = at(t, p.x, p.y);
	const inCave = !p.st && !inside && here?.tile !== 'wall' && here?.mat === 'granite';
	const fogBase = FOG[S.phase];
	c.fillStyle = inside ? '#060608' : inCave ? css(lerp(fogBase, CAVE_DARK, 0.65)) : css(fogBase);
	c.fillRect(0, 0, cw, chh);
	const s = S.cell;
	// You in the middle; beyond the town's edge is dark.
	const sheet = document.getElementById('card');
	const lift = sheet && !sheet.hidden && document.body.classList.contains('village-map') ? Math.min(chh * 0.4, sheet.offsetHeight / 2) : 0;
	const ox = Math.round(cw / 2 - (cam.x + 0.5) * s), oy = Math.round(chh / 2 - lift - (cam.y + 0.5) * s);
	const xa = Math.max(0, Math.floor(-ox / s)), xb = Math.min(t.w, Math.ceil((cw - ox) / s));
	const ya = Math.max(0, Math.floor(-oy / s)), yb = Math.min(t.h, Math.ceil((chh - oy) / s));
	view = { x0: -ox / s, y0: -oy / s };

	// Sight is line of sight; light decides how much of it you can make out. The Storyteller sees everything.
	const vis = p.st ? new Set(t.cells.map((_, i) => i)) : visibleCells(t, p, 'day');
	for (const i of vis) S.seen![i] = 1;
	const sk = sky(t), day = sunlight(S.phase);
	const seatSet = new Set(t.seats.map((q) => q.x + q.y * t.w));
	const mySeat = !p.st ? seatCell(t, p.seat) : null;
	c.font = `${Math.round(s * 0.8)}px ${MONO}`;
	c.textAlign = 'center';
	c.textBaseline = 'middle';
	const lit = new Map<number, Rgb>();
	const ground = new Map<number, string>();
	for (let y = ya; y < yb; y++) {
		for (let x = xa; x < xb; x++) {
			const i = x + y * t.w;
			const shown = vis.has(i);
			if (!shown && !S.seen![i]) continue;
			// Rooms have no fog. Indoors, a wall or doorway of your room counts as in here.
			const r = t.room[i];
			const indoors = r >= 0 ? r !== t.outdoors : inside && touchesRoom(t, x, y, mine);
			// Indoors, what you are not seeing now is out of mind: only your own room is remembered.
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
				// A locked door shows from anywhere: everyone can see it is shut.
				if (t.locked.has(i)) [fg, bg] = [look.fg, mul(look.bg, [0.6, 0.6, 0.6])];
			}
			// The fog: thicker with distance and at the forest's edge, glowing where firelight falls in it.
			const f = indoors ? (shown ? 0 : 0.2)
				: inCave && rock ? fogAt(t, x, y, cam, S.phase, now) * 0.25 * (shown ? 1 : 0.6) + (shown ? 0 : 0.35)
				: fogAt(t, x, y, cam, S.phase, now) * (p.st ? 0.6 : 1) * (shown ? 1 : 0.6) + (shown ? 0 : 0.35) + (inCave ? 0.25 : 0);
			if (f > 0.01) {
				const glow = dyn ? ([0, 1, 2].map((k) => fogBase[k] + dyn![i * 3 + k] * 0.18) as Rgb) : fogBase;
				fg = lerp(fg, glow, Math.min(1, f * 1.05));
				bg = lerp(bg, glow, Math.min(1, f));
			}
			if (inCave && !rock) { fg = lerp(fg, CAVE_DARK, 0.4); bg = lerp(bg, CAVE_DARK, 0.45); }
			if (S.phase === 'dusk' && seatSet.has(i)) bg = lerp(bg, GOLD, mySeat && mySeat.x === x && mySeat.y === y ? 0.6 : 0.3);
			const px = ox + x * s, py = oy + y * s;
			c.fillStyle = css(bg);
			ground.set(i, c.fillStyle);
			c.fillRect(px, py, s + 0.5, s + 0.5);
			if (look.glass) {
				// The pane: a pale bar along the wall, lit by whatever is brighter, in or out.
				const h = look.wall!.mask & 10;
				c.fillStyle = css(lerp(bg, fg, 0.35));
				c.fillRect(px + (h ? 0 : s * 0.3), py + (h ? s * 0.3 : 0), h ? s + 0.5 : s * 0.4, h ? s * 0.4 : s + 0.5);
			}
			if (look.wall) drawWall(c, look.wall, px, py, s, fg);
			c.fillStyle = css(fg);
			if (look.icon === 'bell') drawBell(c, px + s * 0.5, py + s * 0.5, s * 0.42, css(fg));
			else if (look.icon === 'clock') { if (!(S.game && S.phase === 'dusk')) drawClockIcon(c, px + s * 0.5, py + s * 0.5, s * 0.4, css(fg)); }
			else if (look.ch !== ' ') c.fillText(look.ch, px + s * 0.5, py + s * 0.54);
		}
	}

	// Names of places, small, at the top left of buildings: shown once you have seen them.
	c.save();
	c.font = `italic ${Math.max(9, Math.round(s * 0.5))}px ${BOOK}`;
	c.textAlign = 'left';
	c.textBaseline = 'top';
	for (const l of t.labels) {
		const i = l.x + l.y * t.w;
		if (!S.seen![i] && !p.st) continue;
		if ((inside || inCave) && !vis.has(i)) continue;
		const lx = ox + l.x * s + s * 0.15, ly = oy + l.y * s - s * 0.55;
		if (lx > cw || ly > chh || lx + s * 12 < 0 || ly + s < 0) continue;
		const f = fogAt(t, l.x, l.y, cam, S.phase, now) * (p.st ? 0.6 : 1);
		const a = Math.max(0.15, 1 - f * 1.1);
		c.fillStyle = `rgba(0,0,0,${0.55 * a})`;
		c.fillText(l.text, lx + 1, ly + 1);
		c.fillStyle = css([236, 222, 190], 0.9 * a);
		c.fillText(l.text, lx, ly);
	}
	c.restore();

	// At the cross (a game's dusk, while the Storyteller deals): everyone in their seat.
	const atCross = S.game && S.phase === 'dusk' && !!t.meeting;
	const scr = (q: P) => ({ x: ox + (q.x + 0.5) * s, y: oy + (q.y + 0.5) * s });

	// People: anyone in sight and in enough light to make out (or right beside you).
	// At night the Storyteller is seen only by whoever they visit.
	const people = [...S.people.values()].filter((q) => {
		if (q.id === S.me) return true;
		if (q.st && S.phase === 'night' && !p.st && !sameRoom(t, p, q)) return false;
		const l = lit.get(q.x + q.y * t.w);
		return !!l && (luma(l.map((v) => v * 255) as Rgb) > 30 || Math.hypot(q.x - p.x, q.y - p.y) < 2);
	});
	for (const q of people) {
		// Whoever stands on a bed or a chair hides it: their letter on the bare ground colour.
		c.fillStyle = ground.get(q.x + q.y * t.w) ?? '#000';
		const d = shownAt.get(q.id) ?? q;
		c.fillRect(ox + Math.round(d.x) * s, oy + Math.round(d.y) * s, s + 0.5, s + 0.5);
		drawPerson(c, q, ox + d.x * s + s / 2, oy + d.y * s + s / 2, s * 0.95, q.id !== S.me);
	}
	if (atCross) {
		// Seats whose player has no phone here: their place in the circle all the same.
		for (const r of S.ring) {
			if ([...S.people.values()].some((q) => !q.st && q.seat === r.seat)) continue;
			const cell = seatCell(t, r.seat);
			if (!cell) continue;
			const at = scr(cell);
			drawPerson(c, { id: `seat-${r.seat}`, name: r.name, ink: r.seat % INKS.length, x: cell.x, y: cell.y, voice: false, seat: r.seat, dead: r.dead, with: null }, at.x, at.y, s * 0.95, true);
		}
	}
	// Wisps: soft banks of mist rolling slowly across the view (not indoors).
	for (let k = 0; k < (inside ? 0 : inCave ? 2 : 6); k++) {
		const wx = ((noise(k * 3.1, now * 0.00003, 9) * 1.6 - 0.3) * cw + now * 0.006 * (k % 2 ? 1 : -0.6)) % (cw * 1.4) - cw * 0.2;
		const wy = noise(k * 5.7, now * 0.00002, 11) * chh;
		const r = Math.max(cw, chh) * (0.18 + 0.12 * noise(k, now * 0.00004, 13));
		const wisp = c.createRadialGradient(wx, wy, 0, wx, wy, r);
		wisp.addColorStop(0, css(lerp(fogBase, [255, 255, 255], 0.12), S.phase === 'night' ? 0.1 : 0.16));
		wisp.addColorStop(1, css(fogBase, 0));
		c.fillStyle = wisp;
		c.fillRect(0, 0, cw, chh);
	}
	// A vignette: the edges of sight fall into shadow.
	const vg = c.createRadialGradient(cw / 2, chh / 2, Math.min(cw, chh) * 0.3, cw / 2, chh / 2, Math.max(cw, chh) * 0.75);
	vg.addColorStop(0, 'rgba(0,0,0,0)');
	vg.addColorStop(1, `rgba(0,0,0,${S.phase === 'night' ? 0.85 : S.phase === 'dusk' ? 0.72 : 0.6})`);
	c.fillStyle = vg;
	c.fillRect(0, 0, cw, chh);
	// Where you are walking to.
	if (S.route.length) {
		const g = S.route[S.route.length - 1];
		c.strokeStyle = css(GOLD, 0.9);
		c.setLineDash([3, 3]);
		c.lineWidth = 1.5;
		c.strokeRect(ox + g.x * s + 1.5, oy + g.y * s + 1.5, s - 3, s - 3);
		c.setLineDash([]);
	}
}

/** Where the vote hand points now, and when it was last drawn (it sweeps, it does not jump). */
let hand = { a: -Math.PI / 2, at: 0, nominee: -1 };

/** A cog: teeth round a wheel, turned to `spin`. */
function cog(c: CanvasRenderingContext2D, x: number, y: number, r: number, teeth: number, spin: number) {
	c.beginPath();
	for (let k = 0; k < teeth * 4; k++) {
		const a = spin + (k / (teeth * 4)) * Math.PI * 2;
		const rr = k % 4 < 2 ? r : r * 0.8;
		const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
		if (k) c.lineTo(px, py); else c.moveTo(px, py);
	}
	c.closePath();
	c.moveTo(x + r * 0.32, y);
	c.arc(x, y, r * 0.32, 0, Math.PI * 2, true);
	c.fillStyle = 'rgba(150, 112, 58, .82)';
	c.fill('evenodd');
	c.strokeStyle = 'rgba(40, 28, 14, .9)';
	c.lineWidth = Math.max(1, r * 0.05);
	c.stroke();
}

/** A clock hand from the hub at angle `a`, `len` long. */
function clockHand(c: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, width: number, colour: string) {
	const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
	c.beginPath();
	c.moveTo(x - dx * len * 0.16 + nx * width * 0.6, y - dy * len * 0.16 + ny * width * 0.6);
	c.lineTo(x + dx * len * 0.82 + nx * width * 0.4, y + dy * len * 0.82 + ny * width * 0.4);
	c.lineTo(x + dx * len, y + dy * len);
	c.lineTo(x + dx * len * 0.82 - nx * width * 0.4, y + dy * len * 0.82 - ny * width * 0.4);
	c.lineTo(x - dx * len * 0.16 - nx * width * 0.6, y - dy * len * 0.16 - ny * width * 0.6);
	c.closePath();
	c.fillStyle = colour;
	c.fill();
}

/** A bell, for the church tower. */
function drawBell(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
	c.save();
	c.fillStyle = fill;
	c.beginPath();
	c.arc(x, y - r * 0.82, r * 0.13, 0, Math.PI * 2);
	c.fill();
	c.beginPath();
	c.moveTo(x - r * 0.78, y + r * 0.5);
	c.quadraticCurveTo(x - r * 0.62, y - r * 0.72, x, y - r * 0.72);
	c.quadraticCurveTo(x + r * 0.62, y - r * 0.72, x + r * 0.78, y + r * 0.5);
	c.lineTo(x + r * 0.92, y + r * 0.64);
	c.lineTo(x - r * 0.92, y + r * 0.64);
	c.closePath();
	c.fill();
	c.beginPath();
	c.arc(x, y + r * 0.8, r * 0.15, 0, Math.PI * 2);
	c.fill();
	c.restore();
}

/** A small clock face, for the market cross by day. */
function drawClockIcon(c: CanvasRenderingContext2D, x: number, y: number, r: number, ink: string) {
	c.save();
	c.beginPath();
	c.arc(x, y, r, 0, Math.PI * 2);
	c.fillStyle = 'rgba(30, 24, 14, .9)';
	c.fill();
	c.strokeStyle = ink;
	c.lineWidth = Math.max(1.5, r * 0.18);
	c.stroke();
	c.lineCap = 'round';
	c.beginPath();
	c.moveTo(x, y);
	c.lineTo(x + r * 0.5, y - r * 0.3);
	c.moveTo(x, y);
	c.lineTo(x - r * 0.15, y - r * 0.72);
	c.lineWidth = Math.max(1.2, r * 0.14);
	c.stroke();
	c.restore();
}

/**
 * A wall as lines from the middle of its cell to each side it joins: double
 * for stone, single for timber; a lone post where it joins nothing. Lines run
 * edge to edge, so neighbouring walls meet without gaps.
 */
/** Is (x, y) beside one of these rooms (a wall or doorway of it)? */
function touchesRoom(t: Town, x: number, y: number, rooms: number[]): boolean {
	for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
		const nx = x + dx, ny = y + dy;
		if (nx >= 0 && ny >= 0 && nx < t.w && ny < t.h && rooms.includes(t.room[nx + ny * t.w])) return true;
	}
	return false;
}

const bitOf = (dx: number, dy: number) => (dy < 0 ? 1 : dx > 0 ? 2 : dy > 0 ? 4 : dx < 0 ? 8 : 0);

function drawWall(c: CanvasRenderingContext2D, w: { mask: number; style: 'double' | 'single' }, px: number, py: number, s: number, fg: Rgb) {
	const cx = px + s / 2, cy = py + s / 2;
	c.strokeStyle = css(fg);
	c.lineCap = 'butt';
	const arms: [number, number, number][] = [[1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]];
	const lines = w.style === 'double' ? [-s * 0.14, s * 0.14] : [0];
	c.lineWidth = Math.max(1, s * (w.style === 'double' ? 0.07 : 0.1));
	if (!w.mask) {
		c.fillStyle = css(fg);
		c.fillRect(cx - s * 0.16, cy - s * 0.16, s * 0.32, s * 0.32);
		return;
	}
	c.beginPath();
	for (const [bit, dx, dy] of arms) {
		if (!(w.mask & bit)) continue;
		for (const off of lines) {
			// Along the arm to the cell's edge. A double line starts at the inner corner if it turns
			// towards its side, carries straight on if the wall continues, else closes the outer corner.
			const ox = -dy * off, oy = dx * off;
			const sx = Math.sign(ox), sy = Math.sign(oy);
			const o = Math.abs(off);
			const back = !off ? 0 : w.mask & bitOf(sx, sy) ? -o : w.mask & bitOf(-dx, -dy) ? 0 : o;
			c.moveTo(cx + ox - dx * back, cy + oy - dy * back);
			c.lineTo(cx + ox + dx * (s / 2 + 0.5), cy + oy + dy * (s / 2 + 0.5));
		}
	}
	c.stroke();
}

/**
 * The circle: the castle's hall, where the town sits at a round oak table
 * with the clock set into it (a candle at every place, snuffed and the chair
 * knocked over when someone dies). During a nomination a shadowy hand rises and
 * points at the nominee; when the vote begins it sweeps clockwise to each
 * voter in turn. A pale hand runs down the time. The circle is sized to the
 * players: their marks keep the same spacing however many there are.
 */
function drawCircle(c: CanvasRenderingContext2D, cw: number, chh: number, now: number) {
	// The space left between the top bar and whatever covers the bottom (the buttons, the Storyteller's bar).
	const cover = (sel: string) => { const el = root.querySelector<HTMLElement>(sel); return el && !el.hidden ? el.offsetHeight : 0; };
	// Below the top bar, its line of status, and the day's tally.
	const capTop = 78;
	const top = capTop + Math.min(4, S.caption.length) * 17 + 6, bottom = Math.max(cover('.v-tools'), 60) + cover('.v-stbar');
	const cx = cw / 2, cy = top + (chh - top - bottom) / 2;
	const room = Math.max(80, Math.min(cw, chh - top - bottom) / 2);

	// In a game, every seat is on the circle, phone or not; otherwise whoever is here.
	const walkers = [...S.people.values()].filter((q) => !q.st);
	const ring: Person[] = S.ring.length
		? S.ring.map((r) => {
			const q = walkers.find((w) => w.seat === r.seat);
			return q ? { ...q, dead: r.dead } : { id: `seat-${r.seat}`, name: r.name, ink: r.seat % INKS.length, x: 0, y: 0, voice: false, seat: r.seat, dead: r.dead };
		})
		: walkers.sort((a, b) => a.seat - b.seat);
	const n = Math.max(1, ring.length);
	// One circle, as big as the room allows, whoever is playing: the marks shrink to fit as more join.
	// (and never too big for a short screen: the table and its clock always have room).
	const size = Math.min(room * 0.2, Math.max(18, Math.min(38, ((2 * Math.PI * room * 0.72) / n) * 0.5)));
	const r = room - size * 1.45;
	const face = r - size * 0.9;
	const angle = (k: number) => -Math.PI / 2 + (k / n) * Math.PI * 2;
	const spot = (k: number) => ({ x: cx + Math.cos(angle(k)) * r, y: cy + Math.sin(angle(k)) * r });

	// The castle's hall: dark flagstones, torchlight from the walls, smoke drifting under the beams.
	const g = c.createRadialGradient(cx, cy, face * 0.2, cx, cy, Math.max(cw, chh) * 0.8);
	g.addColorStop(0, '#2a1d12');
	g.addColorStop(1, '#070504');
	c.fillStyle = g;
	c.fillRect(0, 0, cw, chh);
	c.save();
	c.strokeStyle = 'rgba(0, 0, 0, .35)';
	c.lineWidth = 1;
	const flag = Math.max(34, room * 0.32);
	for (let y = (cy % flag) - flag; y < chh; y += flag) {
		c.beginPath(); c.moveTo(0, y); c.lineTo(cw, y); c.stroke();
		const off = Math.round(y / flag) % 2 ? flag / 2 : 0;
		for (let x = ((cx + off) % flag) - flag; x < cw; x += flag) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + flag); c.stroke(); }
	}
	c.restore();
	for (const [tx, ty, k] of [[0, top, 0], [cw, top, 1], [0, chh - bottom, 2], [cw, chh - bottom, 3]] as const) {
		const flick = 0.85 + 0.15 * noise(k * 4.1, now * 0.004, 7);
		const glow = c.createRadialGradient(tx, ty, 0, tx, ty, room * 1.1 * flick);
		glow.addColorStop(0, 'rgba(255, 170, 80, .30)');
		glow.addColorStop(1, 'rgba(255, 170, 80, 0)');
		c.fillStyle = glow;
		c.fillRect(0, 0, cw, chh);
	}
	for (let k = 0; k < 4; k++) {
		const sx = cx + Math.cos(now * 0.00005 * (k + 1) + k * 1.7) * r * 1.2, sy = cy + Math.sin(now * 0.00004 * (k + 2) + k) * r * 0.9;
		const smoke = c.createRadialGradient(sx, sy, 0, sx, sy, r * 0.9);
		smoke.addColorStop(0, 'rgba(160, 150, 140, .07)');
		smoke.addColorStop(1, 'rgba(160, 150, 140, 0)');
		c.fillStyle = smoke;
		c.fillRect(0, 0, cw, chh);
	}

	// The vote: a shadowy hand, on the nominee, then clockwise round the voters.
	const v = S.vote;
	const idx = (seat: number) => Math.max(0, ring.findIndex((q) => q.seat === seat));
	if (v && v.nominee !== hand.nominee) hand = { a: angle(idx(v.nominee)), at: now, nominee: v.nominee };
	if (!v) hand.nominee = -1;
	const target = v ? angle(idx(v.at ?? v.nominee)) : -Math.PI / 2;
	const dt = Math.min(0.1, (now - (hand.at || now)) / 1000);
	hand.at = now;
	let turn = (target - hand.a) % (Math.PI * 2);
	if (turn < 0) turn += Math.PI * 2;
	if (turn > Math.PI * 2 - 0.01) turn = 0;
	hand.a += Math.min(turn, dt * 3.2);

	c.save();
	// The chairs round the table (a dead player's knocked over), then the round oak table.
	const table = r - size * 0.1;
	ring.forEach((q, k) => {
		const a = angle(k) + (q.dead ? 0.55 : 0);
		const hx = cx + Math.cos(angle(k)) * (r + size * 0.42), hy = cy + Math.sin(angle(k)) * (r + size * 0.42);
		c.save();
		c.translate(hx, hy);
		c.rotate(a + Math.PI / 2);
		c.globalAlpha = q.dead ? 0.55 : 1;
		c.fillStyle = '#3b2513';
		c.strokeStyle = 'rgba(0, 0, 0, .6)';
		c.lineWidth = 1.5;
		c.beginPath();
		c.roundRect(-size * 0.55, -size * 0.32, size * 1.1, size * 0.64, size * 0.14);
		c.fill();
		c.stroke();
		c.restore();
	});
	const wood = c.createRadialGradient(cx, cy, table * 0.2, cx, cy, table);
	wood.addColorStop(0, '#6a4526');
	wood.addColorStop(1, '#3f2814');
	c.beginPath();
	c.arc(cx, cy, table, 0, Math.PI * 2);
	c.fillStyle = wood;
	c.shadowColor = 'rgba(0, 0, 0, .7)';
	c.shadowBlur = 24;
	c.fill();
	c.shadowBlur = 0;
	c.strokeStyle = '#24160b';
	c.lineWidth = Math.max(3, size * 0.16);
	c.stroke();
	// The grain.
	c.strokeStyle = 'rgba(30, 18, 8, .28)';
	c.lineWidth = 1;
	for (let k = 1; k < 6; k++) { c.beginPath(); c.arc(cx + k * 2, cy - k, table * (0.2 + k * 0.13), 0.3 * k, 0.3 * k + Math.PI * 1.3); c.stroke(); }
	// A candle at each place: lit while they live, snuffed (a thin smoke) when they die.
	ring.forEach((q, k) => {
		const a = angle(k);
		const x = cx + Math.cos(a) * (r - size * 0.62), y = cy + Math.sin(a) * (r - size * 0.62);
		c.fillStyle = '#e8dcc0';
		c.fillRect(x - size * 0.07, y - size * 0.05, size * 0.14, size * 0.22);
		if (!q.dead) {
			const fl = 0.8 + 0.2 * noise(k * 3.3, now * 0.006, 2);
			const halo = c.createRadialGradient(x, y - size * 0.1, 0, x, y - size * 0.1, size * 0.7 * fl);
			halo.addColorStop(0, 'rgba(255, 200, 110, .45)');
			halo.addColorStop(1, 'rgba(255, 200, 110, 0)');
			c.fillStyle = halo;
			c.beginPath(); c.arc(x, y - size * 0.1, size * 0.7 * fl, 0, Math.PI * 2); c.fill();
			c.fillStyle = '#ffd27a';
			c.beginPath(); c.ellipse(x, y - size * 0.14, size * 0.06, size * 0.12 * fl, 0, 0, Math.PI * 2); c.fill();
		} else {
			c.strokeStyle = 'rgba(200, 200, 200, .35)';
			c.lineWidth = 1;
			c.beginPath(); c.moveTo(x, y - size * 0.06); c.quadraticCurveTo(x + size * 0.1, y - size * 0.3, x - size * 0.04, y - size * 0.5); c.stroke();
		}
	});
	// The clock, inlaid in the table: brass rim, dark face, a mark at every place.
	const fg = c.createRadialGradient(cx, cy, face * 0.1, cx, cy, face);
	fg.addColorStop(0, 'rgba(38, 28, 16, .92)');
	fg.addColorStop(1, 'rgba(18, 12, 6, .95)');
	c.beginPath();
	c.arc(cx, cy, face, 0, Math.PI * 2);
	c.fillStyle = fg;
	c.fill();
	c.strokeStyle = 'rgba(214, 172, 92, .95)';
	c.lineWidth = Math.max(2.5, size * 0.1);
	c.stroke();
	c.beginPath();
	c.arc(cx, cy, face * 0.9, 0, Math.PI * 2);
	c.strokeStyle = 'rgba(214, 172, 92, .35)';
	c.lineWidth = 1;
	c.stroke();
	ring.forEach((q, k) => {
		const a = angle(k), nom = v && v.nominee === q.seat;
		c.beginPath();
		c.moveTo(cx + Math.cos(a) * face * 0.8, cy + Math.sin(a) * face * 0.8);
		c.lineTo(cx + Math.cos(a) * face * 0.95, cy + Math.sin(a) * face * 0.95);
		c.strokeStyle = nom ? 'rgba(240, 112, 90, .95)' : 'rgba(232, 200, 130, .8)';
		c.lineWidth = nom ? 4 : 2;
		c.stroke();
	});
	// The time: a pale thin hand running down, the minutes above the hub.
	const ck = S.clock?.get() ?? null;
	if (ck && ck.total > 0) {
		c.globalAlpha = 0.7;
		clockHand(c, cx, cy, -Math.PI / 2 + Math.PI * 2 * (1 - Math.max(0, ck.left) / ck.total), face * 0.86, 3, 'rgba(225, 218, 255, .85)');
		c.globalAlpha = 1;
		const sec = Math.ceil(Math.max(0, ck.left) / 1000);
		c.font = `700 ${Math.max(12, Math.round(size * 0.5))}px ${MONO}`;
		c.textAlign = 'center';
		c.textBaseline = 'middle';
		c.fillStyle = ck.left <= 0 ? '#f0705a' : ck.running ? 'rgba(255, 220, 140, .95)' : 'rgba(225, 218, 255, .5)';
		c.fillText(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, cx, cy + face * 0.42);
	}
	// The shadowy hand: only while someone is nominated; darker and sharper once the vote is counted.
	if (v) {
		const counting = v.at !== null;
		c.shadowColor = 'rgba(0, 0, 0, .95)';
		c.shadowBlur = counting ? 28 : 18;
		clockHand(c, cx, cy, hand.a, r - size * 0.75, Math.max(9, size * 0.5), counting ? 'rgba(8, 6, 14, .88)' : 'rgba(8, 6, 14, .55)');
		c.shadowBlur = 0;
		c.globalAlpha = counting ? 0.9 : 0.5;
		c.lineWidth = 1.5;
		c.strokeStyle = 'rgba(240, 200, 120, .8)';
		c.stroke();
		c.globalAlpha = 1;
	}
	c.beginPath();
	c.arc(cx, cy, Math.max(4, size * 0.22), 0, Math.PI * 2);
	c.fillStyle = 'rgba(215, 205, 255, .7)';
	c.fill();
	c.restore();

	// The players round the rim, their names outward, a hand up over whoever raised it.
	ring.forEach((q, k) => {
		const { x, y } = spot(k);
		const a = angle(k);
		if (v && v.nominee === q.seat) {
			c.save();
			c.strokeStyle = '#f0705a';
			c.lineWidth = 2.5;
			c.beginPath();
			c.arc(x, y, size * 0.72, 0, Math.PI * 2);
			c.stroke();
			c.restore();
		}
		drawPerson(c, q, x, y, size, false);
		if (v) {
			const counted = v.counted.includes(q.seat), raised = v.raised.includes(q.seat);
			if (counted || raised) {
				c.save();
				c.fillStyle = '#ffd27a';
				c.font = `700 ${Math.round(size * 0.55)}px ${MONO}`;
				c.textAlign = 'center';
				c.textBaseline = 'middle';
				c.globalAlpha = counted ? 1 : 0.7;
				c.fillText(counted ? '▲' : '△', x + Math.cos(a + Math.PI / 2) * size * 0.75, y + Math.sin(a + Math.PI / 2) * size * 0.75);
				c.restore();
			}
		}
		// The name, outward from the clock, so the ring stays clear however full.
		c.save();
		c.font = `600 ${Math.max(11, Math.round(size * 0.42))}px Grenze, Georgia, serif`;
		c.textAlign = Math.abs(Math.cos(a)) < 0.3 ? 'center' : Math.cos(a) > 0 ? 'left' : 'right';
		c.textBaseline = Math.sin(a) < -0.3 ? 'bottom' : Math.sin(a) > 0.3 ? 'top' : 'middle';
		c.fillStyle = v && v.nominee === q.seat ? '#f0705a' : q.id === S.me ? ST_INK : 'rgba(232, 216, 178, .9)';
		c.fillText(`${q.dead ? '† ' : ''}${q.name}${q.id === S.me ? ' (you)' : ''}`, x + Math.cos(a) * size * 1.05, y + Math.sin(a) * size * 1.05);
		c.restore();
	});
	// The Storyteller at the hub.
	const st = [...S.people.values()].find((q) => q.st);
	if (st) drawPerson(c, st, cx, cy, size * 0.9, false);
	// The day so far, under the top bar, clear of the circle.
	c.save();
	c.textAlign = 'center';
	c.textBaseline = 'top';
	S.caption.slice(0, 4).forEach((line, k) => {
		c.font = `${k ? 500 : 700} ${k ? 13 : 15}px Grenze, Georgia, serif`;
		c.fillStyle = k ? 'rgba(232, 216, 178, .82)' : '#ffd27a';
		c.fillText(line, cx, capTop + k * 17, cw - 24);
	});
	c.restore();
}

// ---- around the map: the bars, sheets and drawers ----------------------------------------------

let root: HTMLElement;

function hearList() {
	const t = S.town, p = me();
	if (!t || !p) return [];
	return [...S.people.values()].filter((q) => q.id !== S.me && q.voice).map((q) => ({ q, loud: loudness(t, p, q, S.phase) }));
}

let chromeKey = '';
/** Redraw the buttons only when what they offer changes (a door beside you, a private word). */
function drawChromeIfChanged() {
	const p = me();
	const d = doorBeside();
	const key = `${d}|${d !== null && S.town!.locked.has(d)}|${S.town?.locked.size}|${p?.with}|${S.phase}`;
	if (key !== chromeKey) drawChrome();
}

function drawChrome() {
	const bar = root?.querySelector('.v-top');
	if (!bar) return;
	const p = me();
	const near = doorBeside();
	chromeKey = `${near}|${near !== null && S.town!.locked.has(near)}|${S.town?.locked.size}|${p?.with}|${S.phase}`;
	const linkText = S.status === 'open' ? '' : S.status === 'error' ? S.statusDetail : 'connecting…';
	bar.innerHTML = `<b>${S.phase === 'dusk' ? BELL_SVG : ''}${PHASE_NAME[S.phase]}</b><span class="v-code">${esc(S.room)}</span><span class="v-dim v-status">${esc(linkText)}</span>`
		+ `<button data-act="clock" class="v-clock" hidden title="The clock">${CLOCK_SVG}<span data-vclock></span></button>`
		+ `<button data-act="sound" class="v-sound${soundOn() ? ' on' : ''}" aria-pressed="${soundOn()}" aria-label="${soundOn() ? 'Bell on' : 'Bell off'}" title="${soundOn() ? 'The bell rings at dusk' : 'The bell is silent'}">${BELL_SVG}${soundOn() ? '' : '<i class="v-slash"></i>'}</button>`
		+ (S.host ? `<button data-act="st-toggle" class="${S.stOpen ? 'on' : ''}">Storyteller</button>` : '');
	const tools = root.querySelector('.v-tools');
	if (!tools) return;
	const v = S.voice;
	const voiceBtns = v
		? v.mode === 'listen'
			? `<button data-act="voice-talk" class="primary">Talk</button><button data-act="voice-stop" class="on">Listening</button>`
			: `<button data-act="mute" class="${v.muted ? 'on' : 'primary'}">${v.muted ? 'Unmute' : 'Mute'}</button>`
		: S.voiceBusy ? '<span class="v-dim">Starting voice…</span>'
		: `<button data-act="voice-mic" class="primary">Talk</button><button data-act="voice-listen">Listen</button>`;
	const door = doorBeside();
	const doorBtn = door !== null ? `<button data-act="door" class="v-door">${S.town!.locked.has(door) ? 'Unlock door' : 'Lock door'}</button>` : '';
	const seat = S.phase === 'dusk' && !S.game && p && !p.st && S.town?.seats.length ? `<button data-act="seat" class="primary">My seat</button>` : '';
	const priv = p?.with ? `<span class="v-private">Private: <b>${esc(nameOf(p.with))}</b></span><button data-act="end">End</button>` : '';
	const extra = S.extra().map((e, i) => `<button data-act="extra" data-i="${i}" class="${e.primary ? 'primary' : ''}">${esc(e.label)}</button>`).join('');
	tools.innerHTML = `${priv}${voiceBtns}${extra}<button data-act="people">People</button>${doorBtn}${seat}`
		+ (S.phase === 'circle' ? '' : `<span class="v-zoom"><button data-act="zoom-out" aria-label="Zoom out">−</button><button data-act="zoom-in" aria-label="Zoom in">+</button></span>`);

	// The Storyteller's next steps in the game.
	const bar2 = root.querySelector('.v-stbar') as HTMLElement;
	const sa = S.host ? S.stActions : null;
	bar2.hidden = !sa;
	// Sit just above the buttons, however many rows they wrap to (a private word adds a row).
	const toolsEl = root.querySelector<HTMLElement>('.v-tools');
	if (toolsEl) bar2.style.bottom = `${toolsEl.offsetHeight}px`;
	if (sa) bar2.innerHTML = `<div>${esc(sa.text)}</div><div class="v-st-row">${sa.buttons.map((b, i) => `<button data-act="st-act" data-i="${i}" class="${b.primary ? 'primary' : ''}">${esc(b.label)}</button>`).join('')}</div>`;

	// A request for a private word, waiting.
	const ask = root.querySelector('.v-ask') as HTMLElement;
	const from = S.asks.find((id) => S.people.has(id));
	ask.hidden = !from;
	if (from) ask.innerHTML = `<div><b>${esc(nameOf(from))}</b> asks for a private word.</div><div class="v-st-row"><button data-act="accept" class="primary">Talk</button><button data-act="decline">Not now</button></div>`;

	// Everyone, to ask for a private word (and, for the Storyteller, to visit).
	const sheet = root.querySelector('.v-sheet') as HTMLElement;
	sheet.hidden = S.sheet !== 'people' && !S.choice;
	if (S.choice) {
		sheet.innerHTML = `<div class="v-sheet-head"><b>${esc(S.choice.title)}</b><button data-act="choice-close">Close</button></div>`
			+ `<div class="v-choices">${S.choice.options.map((o) => `<button data-act="choice" data-id="${esc(o.id)}">${esc(o.label)}</button>`).join('')}</div>`;
	} else if (S.sheet === 'people') {
		const others = [...S.people.values()].filter((q) => q.id !== S.me).sort((a, b) => Number(!!b.st) - Number(!!a.st) || a.name.localeCompare(b.name));
		const can = p && privateAllowed(p) && !p.with;
		sheet.innerHTML = `<div class="v-sheet-head"><b>People</b><button data-act="sheet-close">Close</button></div>`
			+ (can ? '' : `<div class="v-dim">${p?.with ? 'You are already talking privately.' : 'Private words wait for the day.'}</div>`)
			+ others.map((q) => {
				const busy = q.with ? `<span class="v-dim">talking privately</span>` : '';
				const askBtn = can && !q.with && (q.st || p?.st) ? `<button data-act="ask" data-id="${esc(q.id)}">Private word</button>` : '';
				const visitBtn = p?.st && !q.st ? `<button data-act="visit" data-id="${esc(q.id)}">Visit</button>` : '';
				const state = q.dead ? '<span class="v-dim">dead</span>' : '';
				return `<div class="v-person"><span class="v-mark" style="--ink:${inkOf(q)}" aria-hidden="true">${esc(glyphOf(q))}</span><span class="v-pname">${esc(q.st ? 'Storyteller' : q.name)}</span>${state}${busy}<span class="v-person-btns">${visitBtn}${askBtn}</span></div>`;
			}).join('');
	}

	const st = root.querySelector('.v-st') as HTMLElement;
	st.hidden = !S.host || !S.stOpen;
	if (S.host && S.stOpen) {
		const link = `${location.origin}${location.pathname}#village=${S.room}`;
		const ph = (k: Phase, label: string) => `<button data-act="phase-${k}" class="${S.phase === k ? 'on' : ''}">${label}</button>`;
		st.innerHTML = (S.game ? '' : `<div class="v-st-row">${ph('day', 'Day')}${ph('dusk', 'Ring the bell')}</div>
			<div class="v-st-row">${ph('circle', 'The circle')}${ph('night', 'Night')}</div>`)
			+ `<div class="v-st-row"><button data-act="ears" class="${me()?.ears ? 'on' : ''}">All ears: ${me()?.ears ? 'on' : 'off'}</button></div>
			<div class="v-st-row"><button data-act="bot">+ Test villager</button><button data-act="st-toggle">Close</button></div>
			${S.game ? '<button data-act="back-game" class="primary">Open the grimoire</button>' : `<div class="v-share">Players scan this, or open <b>${esc(link)}</b></div>
			<div class="v-qr">${qr(link)}</div>`}
			<label class="v-file">Load my own town (.tbp)<input type="file" accept=".tbp,.txt" data-act="town-file"></label>
			${store.get('grimoire.town') ? '<button data-act="town-reset">Use the demo village</button>' : ''}`;
	}
}

function drawNear() {
	const list = root?.querySelector('.v-near');
	if (!list) return;
	const t = S.town, p = me();
	if (!t || !p) return;
	const near = hearList().filter((h) => h.loud > 0).sort((a, b) => b.loud - a.loud);
	const where = p.with ? `Private with ${esc(nameOf(p.with))}: nobody else hears you`
		: S.phase === 'circle' ? 'The circle: everyone hears everyone'
		: S.phase === 'night' ? (p.st ? 'Night: whoever is in this room hears you' : 'Night: at home. Only the Storyteller may visit')
		: inMeeting(t, p, S.phase) ? 'In the ring of seats: all in it hear you'
		: p.st && p.ears ? 'All ears: you hear everyone, and everyone hears you'
		: atSpeakingPlace(t, p) ? 'At the market cross: the whole town hears you'
		: t.room[p.x + p.y * t.w] === t.outdoors ? 'Outdoors: voices carry' : 'Indoors: voices carry through open doors; lock them to be private';
	const rows = near.slice(0, 5).map(({ q, loud }) => {
		const lvl = S.voice ? S.voice.level(q.id) : 0;
		return `<div class="v-who"><b style="color:${inkOf(q)}">${esc(q.st ? 'Storyteller' : q.name)}</b><span class="v-meter"><i style="width:${Math.round(loud * 100)}%"></i><em style="width:${Math.round(Math.min(1, lvl) * loud * 100)}%"></em></span></div>`;
	}).join('');
	const more = near.length > 5 ? `<div class="v-dim">and ${near.length - 5} more</div>` : '';
	list.innerHTML = `<div class="v-where">${where}${S.voice ? '' : ' · voice off'}</div>${rows}${more}`;
}

function qr(text: string): string {
	const q = qrcode(0, 'M');
	q.addData(text);
	q.make();
	return q.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
}

const BANNERS: Record<Phase, { title: string; line: string }> = {
	day: { title: 'Dawn', line: 'Day. Wander, talk, conspire.' },
	dusk: { title: 'The bell tolls', line: 'Dusk. The town gathers round the market cross.' },
	circle: { title: 'The circle', line: 'The town gathers. Everyone sees and hears everyone.' },
	night: { title: 'Night falls', line: 'You are at home and the doors are locked. The Storyteller may visit.' }
};

function showBanner(title: string, line: string, ms = 5000) {
	const b = root?.querySelector('.v-banner') as HTMLElement | null;
	if (!b) return;
	// Dusk is the bell's: it hangs over the title.
	const bell = S.phase === 'dusk' && title === BANNERS.dusk.title ? `<i class="v-banner-bell">${BELL_SVG}</i>` : '';
	b.innerHTML = `${bell}<b>${esc(title)}</b><span>${esc(line)}</span>`;
	b.hidden = false;
	clearTimeout(bannerTimer);
	bannerTimer = setTimeout(() => { b.hidden = true; }, ms);
}
let bannerTimer: ReturnType<typeof setTimeout>;

function toast(text: string) {
	const el = root?.querySelector('.v-toast') as HTMLElement | null;
	if (!el) return;
	el.textContent = text;
	el.hidden = false;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}
let toastTimer: ReturnType<typeof setTimeout>;

/** The top bar's clock, a few times a second. */
function tickClock() {
	const el = root?.querySelector<HTMLButtonElement>('.v-clock');
	if (!el) return;
	const c = S.clock?.get() ?? null;
	el.hidden = !c;
	if (!c) return;
	const sec = Math.ceil(c.left / 1000);
	el.querySelector('[data-vclock]')!.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
	el.title = `${c.label}: ${c.running ? 'running' : 'paused'}${S.clock?.toggle ? ' (tap to start or pause)' : ''}`;
	el.classList.toggle('paused', !c.running && c.left > 0);
	el.classList.toggle('expired', c.left <= 0);
	el.classList.toggle('static', !S.clock?.toggle);
}
setInterval(tickClock, 250);

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
	drawNear();
	drawChromeIfChanged();
	if (S.voice) S.dirty = true;
}, 200);

function cellAt(ev: PointerEvent): P {
	const r = canvas.getBoundingClientRect();
	return { x: Math.floor(view.x0 + (ev.clientX - r.left) / S.cell), y: Math.floor(view.y0 + (ev.clientY - r.top) / S.cell) };
}

function enterMap() {
	// The face for people's initials and names, before the first frame needs it.
	void document.fonts?.load('700 20px "Almendra"').then(() => { S.dirty = true; });
	void document.fonts?.load('700 20px "Grenze"');
	document.body.classList.add('village-map');
	root.innerHTML = `<div class="village v-map">
		<div class="v-stage"><canvas aria-label="The village. Tap a place to walk there, or hold and drag to steer."></canvas></div>
		<div class="v-top"></div>
		<div class="v-near"></div>
		<div class="v-banner" hidden></div>
		<div class="v-toast" hidden></div>
		<div class="v-stbar v-panel" hidden></div>
		<div class="v-tools"></div>
		<div class="v-ask v-panel" hidden></div>
		<div class="v-sheet v-panel" hidden></div>
		<div class="v-st v-panel" hidden></div>
	</div>`;
	canvas = root.querySelector('canvas')!;
	// About 21 cells across a phone held upright; capped on a big screen.
	S.cell = Math.max(16, Math.min(28, Math.floor(canvas.clientWidth / 21)));
	// Tap to walk there; hold and drag to steer.
	let held = false, last = '';
	canvas.addEventListener('pointerdown', (ev) => {
		audio();
		held = true;
		canvas.setPointerCapture(ev.pointerId);
		const g = cellAt(ev);
		last = `${g.x},${g.y}`;
		const t = S.town, p = me(), cell = g.x + g.y * (t?.w ?? 0);
		if (t && p && t.locked.has(cell) && mayWorkDoor(t, p, cell)) { workDoor(cell); return; }
		walkTo(g);
		S.dirty = true;
	});
	canvas.addEventListener('pointermove', (ev) => {
		if (!held) return;
		const g = cellAt(ev);
		const k = `${g.x},${g.y}`;
		if (k === last) return;
		last = k;
		walkTo(g);
		S.dirty = true;
	});
	const lift = () => { held = false; };
	canvas.addEventListener('pointerup', lift);
	canvas.addEventListener('pointercancel', lift);
	drawChrome();
	announcePhase();
	if (looping) return;
	looping = true;
	window.addEventListener('resize', () => { S.dirty = true; });
	const loop = () => {
		draw();
		requestAnimationFrame(loop);
	};
	requestAnimationFrame(loop);
}
let looping = false;

// ---- the lobby ------------------------------------------------------------------------------------

function lobby(code: string) {
	const name = store.get('grimoire.villageName') ?? '';
	root.innerHTML = `<div class="village v-lobby">
		<h1>The Village</h1>
		<p class="v-dim">Walk the town on your own phone. Talk to whoever is near you: voices fade with distance and stop at walls.</p>
		${code ? '' : '<button data-act="open" class="primary">Open the castle town (I am the Storyteller)</button><button data-act="open-saltgrave">Open Saltgrave, the Victorian city</button><div class="v-or">or join one</div>'}
		<label>Your name <input id="v-name" maxlength="14" value="${esc(name)}" autocomplete="off"></label>
		<label>Village code <input id="v-code" maxlength="4" value="${esc(code)}" autocomplete="off" autocapitalize="characters"></label>
		<button data-act="join" class="${code ? 'primary' : ''}">Join</button>
		<p><a href="#" data-act="back">Back to the grimoire</a></p>
	</div>`;
}

function onAct(act: string, el: HTMLElement) {
	const nameIn = root.querySelector<HTMLInputElement>('#v-name');
	const name = nameIn?.value.trim() ?? '';
	if (nameIn) store.set('grimoire.villageName', name);
	const id = el.dataset.id ?? '';
	switch (act) {
		case 'open': audio(); openVillage(); break;
		case 'open-saltgrave': audio(); openVillage('laissez-un-faire'); break;
		case 'join': {
			const code = (root.querySelector<HTMLInputElement>('#v-code')?.value ?? '').trim().toUpperCase();
			if (code.length !== 4 || !name) { alert('Enter your name and the four-letter code.'); return; }
			audio();
			history.replaceState(null, '', `#village=${code}`);
			root.innerHTML = '<div class="village"><div class="v-top"></div><p class="v-dim">Finding the village…</p></div>';
			joinVillage(code, name);
			break;
		}
		case 'back': location.hash = ''; location.reload(); break;
		case 'clock': S.clock?.toggle?.(); tickClock(); break;
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
		// From listening to talking: start again with the microphone.
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
			if (from) up({ t: 'reply', to: from, yes: act === 'accept' });
			drawChrome();
			break;
		}
		case 'end': up({ t: 'end' }); break;
		case 'door': {
			const d = doorBeside();
			if (d !== null) workDoor(d);
			break;
		}
		case 'extra': S.extra()[Number(el.dataset.i)]?.act(); break;
		case 'st-act': S.stActions?.buttons[Number(el.dataset.i)]?.act(); break;
		case 'choice': { const c = S.choice; S.choice = null; c?.pick(id); drawChrome(); break; }
		case 'choice-close': S.choice = null; drawChrome(); break;
		case 'back-game': S.stOpen = false; if (S.onBack) { drawChrome(); S.onBack(); } else hideVillage(); break;
		case 'zoom-in': S.cell = Math.min(36, S.cell + 3); break;
		case 'zoom-out': S.cell = Math.max(11, S.cell - 3); break;
		case 'phase-day': setPhase('day'); break;
		case 'phase-dusk': setPhase('dusk'); break;
		case 'phase-circle': setPhase('circle'); break;
		case 'phase-night': setPhase('night'); break;
		case 'bot': addBot(); break;
		case 'st-toggle': S.stOpen = !S.stOpen; S.sheet = null; drawChrome(); break;
		case 'town-reset':
			try { localStorage.removeItem('grimoire.town'); } catch { /* private mode */ }
			alert('Reopen the village to use the demo village.');
			drawChrome();
			break;
	}
	S.dirty = true;
	// Door and private-word buttons follow what the host decides.
	setTimeout(drawChromeIfChanged, 250);
}

let wired = false;
/** Taps, town files and keys, for the village's container. */
function wire(el: HTMLElement) {
	root = el;
	if (wired) return;
	wired = true;
	el.addEventListener('click', (ev) => {
		const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
		if (!t || t.tagName === 'INPUT') return;
		ev.preventDefault();
		onAct(t.dataset.act!, t);
	});
	el.addEventListener('change', (ev) => {
		const input = ev.target as HTMLInputElement;
		if (input.dataset.act !== 'town-file' || !input.files?.[0]) return;
		void input.files[0].text().then((text) => {
			try {
				makeTown(parseBlueprint(text));
				store.set('grimoire.town', text);
				alert('Saved. Reopen the village to walk your town (players already in will need to rejoin).');
			} catch (e) {
				alert(`That town file has a problem: ${(e as Error).message}`);
			}
		});
	});
	window.addEventListener('keydown', (ev) => {
		const tgt = ev.target as HTMLElement;
		if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.closest?.('#app') || root.hidden || !document.body.classList.contains('village-map')) return;
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
export function startVillage(appRoot: HTMLElement, code: string) {
	document.body.classList.add('in-village');
	wire(appRoot);
	lobby(code);
}

/** In a game the village is its own layer, under the grimoire's pages (night wakes, announcements). */
function gameRoot() {
	let el = document.getElementById('village-root');
	if (!el) {
		el = document.createElement('div');
		el.id = 'village-root';
		el.hidden = true;
		document.body.appendChild(el);
	}
	wire(el);
}

function showVillage() {
	root.hidden = false;
	document.body.classList.add('village-map');
	if (!root.querySelector('canvas')) enterMap();
	else drawChrome();
	S.dirty = true;
}

function hideVillage() {
	if (!S.game) return;
	root.hidden = true;
	document.body.classList.remove('village-map');
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
