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
import { INNER, onMap, btn, buttonBlock, buttonRows, drawButton, endPanel, field, isButton, listRow, paint, quant, redraw, shade, theTerm, paneled, setPalette, navRow, rubric, row, segWidth, setExtra, txt, wrap, center } from '../ui/ascii.ts';
import type { Button, Row } from '../ui/ascii.ts';
import type { Grid } from '../term/pterm.ts';
import { hostRoom, joinRoom, newRoomCode } from '../net/link.ts';
import type { LinkStatus } from '../net/link.ts';
import type { Peer } from 'peerjs';
import { parseBlueprint } from './blueprint.ts';
import { at, atSpeakingPlace, canWorkDoor, DOOR_REACH, doorLeaves, doorStepIn, doorsOf, inMeeting, isAir, loudness, makeWorld, path, roomsAt, sameRoom, stairGoes, visibleCells, walkable } from './map.ts';
import type { P, Phase, Town } from './map.ts';
import { css, FOG, fogAt, LANTERN, sunlight, lerp, level, lightMap, lookAt, luma, mul, noise, remembered, sky, sources } from './look.ts';
import type { Rgb } from './look.ts';
import { audio, bell, startVoice } from './voice.ts';
import type { Voice, VoiceMode } from './voice.ts';
import CASTLE from '../../town/castle.tbp';
import SALTGRAVE from '../../town/victorian.tbp';
import WOLFSGRUND from '../../town/grimm.tbp';
import WHITECHAPEL from '../../town/whitechapel.tbp';
import { animated, beamAt, fall, flash, weatherOf } from './weather.ts';
import { bookKey, THEMES, THEME_TOWN, themeOf } from '../ui/theme.ts';
import type { Theme } from '../ui/theme.ts';

/** Each theme's town (src/ui/theme.ts): the castle town, Wolfsgrund in the snow, Whitechapel, Saltgrave. */
const TOWNS: Record<Theme, string> = { medieval: CASTLE, grimm: WOLFSGRUND, clockwork: WHITECHAPEL, lovecraft: SALTGRAVE };
/** A script to open each theme's town with, from the lobby. */
const THEME_SCRIPT: Record<Theme, string> = { medieval: 'trouble-brewing', grimm: 'bad-moon-rising', clockwork: 'sects-and-violets', lovecraft: 'laissez-un-faire' };
/** The town a script is played in. A town the Storyteller loaded themselves wins. */
const townFor = (script: string | undefined) => store.get('grimoire.town') ?? TOWNS[themeOf(script)];
const themeOfTown = (text: string): Theme => THEMES.find((t) => TOWNS[t] === text) ?? 'medieval';

const PREFIX = 'grimoire-village-';

export interface Person {
	id: string;
	name: string;
	ink: number;
	x: number;
	y: number;
	/** The level they are on (0 or missing: the ground). Stairs move them up and down. */
	z?: number;
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
	| { t: 'place'; x: number; y: number; z?: number }
	/** Someone asks you for a private word. */
	| { t: 'asked'; from: string }
	| { t: 'notice'; text: string };
type Up =
	| { t: 'hello'; name: string; clientId: string }
	| { t: 'at'; x: number; y: number; z?: number }
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
	/** Steps still to take; each may name its level (the route can go by a stair). */
	route: [] as (P & { z?: number })[],
	seen: null as Uint8Array | null,
	voice: null as Voice | null,
	voiceBusy: false,
	cell: 20,
	dirty: true,
	stOpen: false,
	sheet: null as null | 'people' | 'more',
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
/** The level someone is on, as a town of its own (the ground holds them all). */
const lvl = (q: { z?: number }): Town => S.town!.levels[q.z ?? 0] ?? S.town!;
const nameOf = (id: string | null | undefined) => (id && S.people.get(id)?.name) || 'someone';
/**
 * Each walker's mark on the map: a strong ink of their own, as [glyph ink, ground]. The first
 * seven are bright letters on the dark; the rest are dark letters on a plate of colour, so
 * fifteen people never share a look.
 */
const PERSON: [number, number][] = [[8, 0], [12, 0], [10, 0], [14, 0], [6, 0], [7, 0], [5, 0], [0, 8], [0, 12], [0, 10], [0, 14], [0, 7], [0, 5], [0, 4], [4, 0]];
const personInk = (k: number): [number, number] => PERSON[((k % PERSON.length) + PERSON.length) % PERSON.length];
const markOf = (q: Person): [number, number] => (q.st ? [6, 0] : personInk(q.ink));
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
		if (walkable(lvl(msg), msg.x, msg.y, p.st)) { p.x = msg.x; p.y = msg.y; p.z = msg.z ?? 0; }
		void t;
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
	// The bell: everyone walks to their seat. When the council sits, anyone still on the way is seated.
	if (phase === 'circle' && t.council) gatherAtCross(t);
	else if (phase === 'dusk' && S.game && !t.council) gatherAtCross(t);
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
	q.z = 0;
	const b = S.bots.get(q.id);
	if (b) b.route = [];
	sendTo(q.id, { t: 'place', x: bed.x, y: bed.y, z: 0 });
}

/** Where the town sits together: the council round the great hall's table, or else the ring of seats in the square. */
function gathering(t: Town): { seats: P[]; at: P } | null {
	return t.council ?? (t.meeting && t.seats.length ? { seats: t.seats, at: t.meeting.at } : null);
}

/** Where seat `i` sits at the gathering: the game's seats spread evenly round it, the first at the top. */
function seatCell(t: Town, i: number): P | null {
	const gp = gathering(t);
	if (!gp) return null;
	const L = gp.seats.length;
	const n = S.ring.length || [...S.people.values()].filter((q) => !q.st).length;
	const m = gp.at;
	let top = 0, best = Infinity;
	gp.seats.forEach((c, k) => {
		const a = Math.abs(Math.atan2(c.y - m.y, c.x - m.x) + Math.PI / 2);
		if (a < best) { best = a; top = k; }
	});
	const step = n > 0 && n <= L && i < n ? L / n : 1;
	return gp.seats[(top + Math.round(i * step)) % L];
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
		q.z = 0;
		const b = S.bots.get(q.id);
		if (b) b.route = [];
		sendTo(q.id, { t: 'place', x: c.x, y: c.y, z: 0 });
	}
	const st = [...S.people.values()].find((q) => q.st);
	const gp = gathering(t);
	if (st && gp) {
		const m = gp.at;
		st.x = Math.round(m.x);
		st.y = Math.round(m.y);
		st.z = 0;
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
	const st = me(), q = S.people.get(id);
	if (!st || !q) return;
	const t = lvl(q);
	st.z = q.z ?? 0;
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
		if (p) { p.x = msg.x; p.y = msg.y; p.z = msg.z ?? 0; }
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
		if (mine && S.people.has(S.me)) Object.assign(S.people.get(S.me)!, { x: mine.x, y: mine.y, z: mine.z });
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
	if (!S.host) S.playerWire?.send({ t: 'at', x: p.x, y: p.y, z: p.z ?? 0 });
}

// ---- the town and moving round it ----------------------------------------------------------------

function loadTown(text: string) {
	S.town = makeWorld(parseBlueprint(text));
	// Villagers know their own town: all of it is on the map, dim, until they can see it.
	S.seen = new Uint8Array(S.town.w * S.town.h).fill(1);
	S.dirty = true;
}

/** In a game the town walks to the council itself at the bell; in a town with no council it is seated at once. */
const canWalk = () => S.phase !== 'circle' && !!me() && !(S.game && S.phase === 'dusk' && !me()!.st && !S.town?.council);

/**
 * Stairs: stepping onto one takes you to the level above (or below), onto the same spot there.
 * Arriving on a stair that way does not take you straight back: you must step off it first.
 */
function climb(p: Person) {
	const t = lvl(p);
	const key = `${p.z ?? 0}:${p.x},${p.y}`;
	if (stairFrom.get(p.id) === key) return;
	// Passing over a stair on the way somewhere on this level: stay on this level.
	if (p.id === S.me && S.route.length && (S.route[0].z ?? p.z ?? 0) === (p.z ?? 0)) return;
	stairFrom.delete(p.id);
	const go = stairGoes(at(t, p.x, p.y));
	const to = t.levels[(p.z ?? 0) + go];
	if (!go || !to || !walkable(to, p.x, p.y, p.st)) return;
	p.z = (p.z ?? 0) + go;
	stairFrom.set(p.id, `${p.z}:${p.x},${p.y}`);
	if (p.id === S.me) toast(go > 0 ? 'Up the stairs.' : 'Down the stairs.');
}
const stairFrom = new Map<string, string>();

function step(dx: number, dy: number) {
	const p = me();
	const t = p && S.town ? lvl(p) : null;
	if (!p || !t || !canWalk()) return;
	S.route = [];
	const nx = p.x + dx, ny = p.y + dy;
	if (!walkable(t, nx, ny, p.st)) return;
	if (dx && dy && (!walkable(t, p.x + dx, p.y, p.st) || !walkable(t, p.x, p.y + dy, p.st))) return;
	lastAt = { x: p.x, y: p.y };
	p.x = nx; p.y = ny;
	climb(p);
	sendPos(p);
	S.dirty = true;
}

function walkTo(goal: P) {
	const p = me();
	const t = p && S.town ? lvl(p) : null;
	if (!p || !t || !canWalk()) return;
	let g = goal;
	const pz = p.z ?? 0;
	// Tapped the level below, through open air: go there, by a stair down.
	const below = pz > 0 ? t.levels[pz - 1] : null;
	if (below && isAir(at(t, g.x, g.y)) && walkable(below, g.x, g.y, p.st)) {
		S.route = byStairs(p, t, below, g);
		return;
	}
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

/** The way to `goal` on another level: to the nearest stair that goes there, onto it, then on from its foot. */
function byStairs(p: Person, from: Town, to: Town, goal: P): (P & { z?: number })[] {
	const dir = to.z - from.z;
	let best: (P & { z?: number })[] = [];
	for (let i = 0; i < from.w * from.h; i++) {
		if (stairGoes(from.cells[i]) !== dir) continue;
		const st = { x: i % from.w, y: Math.floor(i / from.w) };
		if (!walkable(to, st.x, st.y, p.st)) continue;
		const a = st.x === p.x && st.y === p.y ? [] : path(from, p, st, p.st);
		if (!a.length && !(st.x === p.x && st.y === p.y)) continue;
		const b = path(to, st, goal, p.st);
		if (!b.length && !(st.x === goal.x && st.y === goal.y)) continue;
		const r = [...a.map((q) => ({ ...q, z: from.z })), ...b.map((q) => ({ ...q, z: to.z }))];
		if (!best.length || r.length < best.length) best = r;
	}
	return best;
}

setInterval(() => {
	const p = me();
	if (!p || !S.town || !S.route.length) return;
	// The next step is on another level and you stand on the stair there: take it first.
	const nz = S.route[0].z;
	if (nz !== undefined && nz !== (p.z ?? 0) && stairGoes(at(lvl(p), p.x, p.y)) === Math.sign(nz - (p.z ?? 0))) {
		stairFrom.delete(p.id);
		climb(p);
		sendPos(p);
		S.dirty = true;
		return;
	}
	const next = S.route.shift()!;
	const t = lvl(next.z === undefined ? p : next);
	// A door shut in your face: stop. (A step on another level waits for the stair to take you there.)
	if ((next.z ?? p.z ?? 0) !== (p.z ?? 0) || !walkable(t, next.x, next.y, p.st)) { S.route = []; return; }
	lastAt = { x: p.x, y: p.y };
	p.x = next.x; p.y = next.y;
	climb(p);
	sendPos(p);
	S.dirty = true;
	drawChromeIfChanged();
}, 80);

/** The nearest door you could work from here (standing in it, or within two steps inside), if any. */
function doorBeside(): number | null {
	const t = S.town, p = me();
	// Doors lock on the ground only; upstairs they stand open.
	if (!t || !p || p.z) return null;
	let best: number | null = null, bestD = Infinity;
	for (let dy = -DOOR_REACH; dy <= DOOR_REACH; dy++) for (let dx = -DOOR_REACH; dx <= DOOR_REACH; dx++) {
		const x = p.x + dx, y = p.y + dy, d = Math.hypot(dx, dy);
		if (d < bestD && at(t, x, y)?.things.includes('door') && mayWorkDoor(t, p, x + y * t.w)) { best = x + y * t.w; bestD = d; }
	}
	return best;
}

// ---- drawing: Tachyon's look (look.ts) --------------------------------------------------------------

let dyn: Uint8ClampedArray | null = null;
let lightAt = 0, lightTick = 0, drawnAt = 0, litFor = '';
/** Where each person is drawn: gliding after where they are, so steps slide instead of jump. */
const shownAt = new Map<string, { x: number; y: number }>();
/** Something is still gliding: draw the next frame too. */
let animating = false;
function glide(id: string, x: number, y: number, dt: number) {
	let d = shownAt.get(id);
	// Far (a teleport: home at night, to a seat, a visit): there at once.
	if (!d || Math.hypot(d.x - x, d.y - y) > 3) { d = { x, y }; shownAt.set(id, d); return d; }
	const k = 1 - Math.exp(-dt / 30);
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
setExtra(villageCells, () => shown);
function touchesRoom(t: Town, x: number, y: number, rooms: number[]): boolean {
	for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
		const nx = x + dx, ny = y + dy;
		if (nx >= 0 && ny >= 0 && nx < t.w && ny < t.h && rooms.includes(t.room[nx + ny * t.w])) return true;
	}
	return false;
}

const prose = (text: string, tone?: 'dim'): Row[] => wrap(text, INNER).map((l) => row(txt(l, tone)));

const talking = (q: Person) => (q.id === S.me ? S.voice?.myLevel() ?? 0 : S.voice?.level(q.id) ?? 0);

const hash2 = (x: number, y: number) => (Math.imul(x * 73856093 ^ y * 19349663, 0x27d4eb2d) >>> 15);

/**
 * The glyphs the map draws as they are: the CP437 set the user chose (furniture, lights,
 * plants, water, walls and shading, the sun, the bell, arches). Anything else outside ASCII
 * is folded to a plain stand-in.
 */
const fold = (ch: string) => {
	if (ch.charCodeAt(0) < 128 || KEEP.has(ch)) return ch;
	const m: Record<string, string> = { '·': '.', '∙': '.', '•': '.', '∼': '~', '○': 'o', '✶': '*', '✦': '*', '❀': '*', '↑': '^' };
	return m[ch] ?? '*';
};
const KEEP = new Set([...'≈π╥Θ■ö¡Ω‡♠♣¶⌐◙╫≡═▬†¬╤▒▓░▲♪☼∩']);

/** The map's frame: move people and the camera, light the town, and ask for a redraw only when something changed. */
function tickMap() {
	const t = S.town, p = me();
	if (!shown || !t || !p) return;
	const now = performance.now();
	// Relight when someone carrying a lantern moved, else only now and then for the flicker of the flames.
	const lt = lvl(p);
	const lamps = (p.z ?? 0) + '|' + (S.phase === 'day' ? '' : [...S.people.values()].map((q) => q.x + ',' + q.y + ',' + (q.z ?? 0)).join(';'));
	const relight = !dyn || lamps !== litFor || now - lightAt > 260;
	litFor = lamps;
	if (!cam.ready) Object.assign(cam, { x: p.x, y: p.y, ready: true });
	const aim = S.phase === 'circle' && t.council ? t.council.at : p;
	const settled = Math.abs(cam.x - aim.x) < 0.01 && Math.abs(cam.y - aim.y) < 0.01;
	if (!relight && !S.dirty && settled && !animating && S.phase !== 'circle' && now - drawnAt < (animated(weatherOf(t.name)) ? 100 : 250)) return;
	const dt = Math.min(100, Math.max(1, now - drawnAt));
	animating = false;
	for (const q of S.people.values()) glide(q.id, q.x, q.y, dt);
	for (const id of [...shownAt.keys()]) if (!S.people.has(id)) shownAt.delete(id);
	// On a grid of cells a glide only blurs the step: you stay fixed in the middle and the town
	// moves under you a whole cell at a time, in the same frame as your step (no lag, no wobble).
	const me0 = S.phase === 'circle' && t.council ? t.council.at : p;
	shownAt.set(p.id, { x: p.x, y: p.y });
	Object.assign(cam, { x: me0.x, y: me0.y });
	S.dirty = false;
	drawnAt = now;
	if (relight) {
		lightAt = now;
		// The light of the level you are on: its own lamps, and the lanterns of those on it.
		const srcs = sources(lt, ++lightTick);
		if (S.phase !== 'day') for (const q of S.people.values()) if ((q.z ?? 0) === (p.z ?? 0)) srcs.push({ x: q.x, y: q.y, c: q.id === S.me ? LANTERN : (LANTERN.map((v) => v * 0.75) as Rgb) });
		dyn = lightMap(lt, srcs);
	}
	redraw();
}

/** Everything the bottom bar could offer, most wanted first. */
function toolButtons(): Button[] {
	const p = me();
	if (S.asks.some((id) => S.people.has(id))) return [btn('Talk', () => act('accept'), { style: 'primary' }), btn('Not now', () => act('decline'))];
	const bs: Button[] = [];
	if (p?.with) bs.push(btn('End', () => act('end')));
	const v = S.voice;
	const later: Button[] = [];
	if (v) {
		if (v.mode === 'listen') { bs.push(btn('Talk', () => act('voice-talk'), { style: 'primary' })); later.push(btn('Stop listening', () => act('voice-stop'), { style: 'on' })); }
		else bs.push(btn(v.muted ? 'Unmute' : 'Mute', () => act('mute'), { style: v.muted ? 'on' : 'primary' }));
	} else if (S.voiceBusy) bs.push(btn('Starting...', () => {}, { disabled: true }));
	else { bs.push(btn('Talk', () => act('voice-mic'), { style: 'primary' })); later.push(btn('Listen only', () => act('voice-listen'))); }
	for (const e of S.extra()) (e.primary ? bs : later).push(btn(e.label, e.act, { style: e.primary ? 'primary' : undefined }));
	if (S.phase === 'dusk' && (!S.game || S.town?.council) && p && !p.st && S.town && gathering(S.town)) bs.push(btn('My seat', () => act('seat'), { style: 'primary' }));
	const door = doorBeside();
	if (door !== null) bs.push(btn(S.town!.locked.has(door) ? 'Unlock' : 'Lock', () => act('door')));
	if (S.host) bs.push(btn('Menu', () => act('st-toggle'), { style: S.stOpen ? 'on' : undefined }));
	bs.push(btn('People', () => act('people')));
	return [...bs, ...later, btn(soundOn() ? 'Bell: on' : 'Bell: off', () => act('sound'), { style: 'quiet' })];
}

/** The bar: one row of the most wanted buttons that fit, the rest behind More. */
function barButtons(cols: number): { bar: Button[]; more: Button[] } {
	const all = toolButtons();
	const fits = (bs: Button[]) => bs.reduce((k, b) => k + segWidth(b), 0) <= cols;
	if (fits(all)) return { bar: all, more: [] };
	const more = btn('More', () => act('more'), { style: S.sheet === 'more' ? 'on' : 'quiet' });
	const bar: Button[] = [];
	for (const b of all) if (fits([...bar, b, more])) bar.push(b); else break;
	return { bar: [...bar, more], more: all.slice(bar.length) };
}

/** Stamp wrapped buttons at (x, y) in `w` columns; returns the height used. */
function stampButtons(g: Grid, x: number, y: number, w: number, bs: Button[]): number {
	const lines = buttonRows(bs, w, 0);
	lines.forEach((r, i) => {
		// Each row of buttons in the middle of the bar.
		const used = r.segs.reduce((k, sg) => k + segWidth(sg), 0);
		let bx = x + Math.max(0, Math.floor((w - used) / 2));
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
	const tools = barButtons(g.cols).bar;
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
	// The council sits in the great hall itself; a town without one shows the old ethereal ring.
	if (S.phase === 'circle' && !t.council) circleCells(g, mapY, mapH);
	else {
		mapCells(g, mapY, mapH, p, lvl(p), now);
		if (S.phase === 'circle') councilCells(g, mapY, mapH, t);
	}
	// The line of what you can hear, and the passing notice.
	const where = p.with ? 'Private with ' + nameOf(p.with) + ': nobody else hears you'
		: S.phase === 'night' ? (p.st ? 'Night: whoever is in this room hears you' : 'Night: at home. Only the Storyteller may visit')
		: inMeeting(t, p, S.phase) ? 'In the ring of seats: all in it hear you'
		: atSpeakingPlace(t, p) ? 'At the market cross: the whole town hears you'
		: p.z ? `Upstairs (level ${p.z}): only those up here hear you`
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
		// In the book's game the notice is a slip of parchment pinned over the town.
		const [ink, ground, rule] = onMap() ? [0, 4, 15] : [4, 0, 6];
		g.fill({ x: bx, y: mapY + 1, w, h: lines.length + 4 }, ' ', 5, ground);
		g.box({ x: bx, y: mapY + 1, w, h: lines.length + 4 }, rule, ground, '', rule, 'double');
		g.text(bx + Math.floor((w - banner.title.length) / 2), mapY + 2, banner.title, onMap() ? 9 : 8, ground);
		lines.forEach((l, i) => g.text(bx + 2, mapY + 4 + i, l, ink, ground));
	}
	return true;
}

const visMemo: { key: string; town: Town | null; vis: Set<number>; all: Set<number> | null } = { key: '', town: null, vis: new Set(), all: null };
/** Each level's cell looks, kept until a door changes (running water is looked at afresh). */
const lookMemos = new WeakMap<Town, { locks: string; looks: (ReturnType<typeof lookAt> | undefined)[] }>();
function looksFor(t: Town, locks: string) {
	let m = lookMemos.get(t);
	if (!m || m.locks !== locks) { m = { locks, looks: new Array(t.w * t.h) }; lookMemos.set(t, m); }
	return m.looks;
}

/** Tap to walk: the cell under a tap in the map. */
let view = { x0: 0, y0: 0 };

/**
 * A town cell is two columns wide, so it is square on screen and square buildings look
 * square: the glyph, then a second column that carries a wall's line on, or a little texture.
 */
const CW = 2;
/** The second column of a cell. */
function filler(ch: string, wall: { mask: number; style: string } | undefined, x: number, y: number): string {
	if (wall) return wall.mask & 2 ? (wall.style === 'double' ? '═' : '─') : ' ';
	if (ch === '~' || ch === '▒' || ch === '=' || ch === '-') return ch;
	return ch !== ' ' && (hash2(x * 3 + 1, y) & 3) === 0 ? ch : ' ';
}

/** Where a town's turning lamp stands, on whatever level it is (null if it has none). */
const beacons = new WeakMap<Town, { x: number; y: number } | null>();
function beaconOf(t: Town): { x: number; y: number } | null {
	if (beacons.has(t)) return beacons.get(t)!;
	let found: { x: number; y: number } | null = null;
	for (const l of t.levels.length ? t.levels : [t]) {
		const i = l.cells.findIndex((c) => c.things.includes('beacon'));
		if (i >= 0) { found = { x: i % l.w, y: Math.floor(i / l.w) }; break; }
	}
	beacons.set(t, found);
	return found;
}

function mapCells(g: Grid, mapY: number, mapH: number, p: Person, t: Town, now: number) {
	const cols = g.cols;
	const x0 = Math.round(cam.x) - Math.floor(cols / CW / 2), y0 = Math.round(cam.y) - Math.floor(mapH / 2);
	view = { x0, y0: y0 - mapY };
	/** The screen column of a town column. */
	const scr = (cx: number) => (cx - x0) * CW;
	g.hit({ x: 0, y: mapY, w: cols, h: mapH }, (sx, sy) => {
		audio();
		const cell = { x: x0 + Math.floor(sx / CW), y: y0 + (sy - mapY) };
		// Tapping the stair you stand on takes it.
		if (cell.x === p.x && cell.y === p.y && stairGoes(at(t, p.x, p.y))) { stairFrom.delete(p.id); climb(p); sendPos(p); S.dirty = true; return; }
		const i = cell.x + cell.y * t.w;
		if (t.locked.has(i) && mayWorkDoor(t, p, i)) { workDoor(i); return; }
		walkTo(cell);
		S.dirty = true;
	});
	const mine = p.st ? [] : roomsAt(t, p);
	const inside = mine.length > 0 && !mine.includes(t.outdoors);
	const here = at(t, p.x, p.y);
	const inCave = !p.st && !inside && here?.tile !== 'wall' && here?.mat === 'granite';
	const fogBase = weatherOf(t.name).fogTint && S.phase === 'day' ? weatherOf(t.name).fogTint! : FOG[S.phase];
	// What you can see changes only when you move or a door does: keep it till then.
	const lockKey = [...t.locked].join(',');
	const visKey = `${p.st}|${p.x},${p.y}|${lockKey}`;
	if (visMemo.key !== visKey || visMemo.town !== t) {
		visMemo.vis = p.st ? (visMemo.town === t && visMemo.all ? visMemo.all : new Set(t.cells.map((_, i) => i))) : visibleCells(t, p, 'day');
		if (p.st) visMemo.all = visMemo.vis;
		for (const i of visMemo.vis) S.seen![i] = 1;
		Object.assign(visMemo, { key: visKey, town: t });
	}
	const vis = visMemo.vis;
	const memo = looksFor(t, lockKey);
	const below = t.z > 0 ? t.levels[t.z - 1] : null;
	const memoBelow = below ? looksFor(below, '') : null;
	// The mist rolls slowly: move it on in steps, so a still screen stays still.
	const fogMs = Math.floor(now / 250) * 250;
	const sk = sky(t), w = weatherOf(t.name);
	// Lightning lights the whole sky white for a moment.
	const fl = w.storm ? flash(now) : 0;
	const day: Rgb = fl ? lerp(sunlight(S.phase), [1.5, 1.55, 1.7], fl) : sunlight(S.phase);
	const lamp = w.beam ? beaconOf(t) : null;
	const seatSet = new Set((gathering(t)?.seats ?? []).map((q) => q.x + q.y * t.w));
	const mySeat = !p.st && S.phase === 'dusk' ? seatCell(t, p.seat) : null;
	const lit = new Map<number, Rgb>();
	const ground = new Map<number, number>();
	for (let sy = 0; sy < mapH; sy++) {
		for (let cx = 0; cx * CW < cols; cx++) {
			const x = x0 + cx, y = y0 + sy, sx = cx * CW;
			if (x < 0 || y < 0 || x >= t.w || y >= t.h) continue;
			const i = x + y * t.w;
			const shown = vis.has(i);
			if (!shown && !S.seen![i]) continue;
			const r = t.room[i];
			const indoors = r >= 0 ? r !== t.outdoors : inside && touchesRoom(t, x, y, mine);
			if (inside && !shown && !t.locked.has(i) && !(r >= 0 ? mine.includes(r) : touchesRoom(t, x, y, mine))) continue;
			const rock = t.cells[i].mat === 'granite';
			if (inCave && !shown && !rock) continue;
			// A cell's look is fixed but for running water; the rest is kept until a door changes.
			// Open air above the ground: the level below shows through, dim and far.
			if (below && memoBelow && isAir(t.cells[i])) {
				const lb = memoBelow[i] ?? (memoBelow[i] = lookAt(below, x, y, 0));
				const ch = lb.wall ? (lb.wall.style === 'double' ? WALL_DOUBLE : WALL_SINGLE)[lb.wall.mask] : fold(lb.ch);
				const dim = quant(mul(lb.fg, [0.32, 0.32, 0.38]));
				if (lb.wall) { g.set(sx, mapY + sy, ch, dim, 0); g.set(sx + 1, mapY + sy, filler(ch, lb.wall, x, y), dim, 0); }
				else g.setWide(sx, mapY + sy, ch === ' ' ? '.' : ch, dim, 0);
				continue;
			}
			let look = memo[i];
			if (!look) {
				look = lookAt(t, x, y, now);
				if (t.cells[i].mat !== 'water' && !t.cells[i].things.includes('waterfall')) memo[i] = look;
			}
			let fg: Rgb, bg: Rgb;
			if (shown) {
				let l = level(t, sk, dyn!, day, x, y);
				// The lighthouse's beam sweeps the open ground and the water.
				if (lamp && t.room[i] === t.outdoors) { const b = beamAt(lamp, x, y, now); if (b) l = [l[0] + b * 1.1, l[1] + b * 1.05, l[2] + b * 0.8]; }
				lit.set(i, l);
				fg = look.emissive ? look.fg : mul(look.fg, l);
				bg = mul(look.bg, l);
			} else {
				[fg, bg] = remembered(look.fg, look.bg);
				if (S.phase === 'night') [fg, bg] = [mul(fg, [0.5, 0.5, 0.6]), mul(bg, [0.5, 0.5, 0.6])];
				if (t.locked.has(i)) [fg, bg] = [look.fg, mul(look.bg, [0.6, 0.6, 0.6])];
			}
			const f = indoors ? (shown ? 0 : 0.2)
				: inCave && rock ? fogAt(t, x, y, cam, S.phase, fogMs) * 0.25 * (shown ? 1 : 0.6) + (shown ? 0 : 0.35)
				: fogAt(t, x, y, cam, S.phase, fogMs) * w.fog * (p.st ? 0.6 : 1) * (shown ? 1 : 0.6) + (shown ? 0 : 0.35) + (inCave ? 0.25 : 0);
			if (f > 0.01) fg = lerp(fg, fogBase, Math.min(1, f * 1.05));
			let ch = fold(look.ch);
			if (look.wall) {
				const m = look.wall.mask;
				ch = (look.wall.style === 'double' ? WALL_DOUBLE : WALL_SINGLE)[m];
			} else if (look.glass) ch = '▒';
			else if (look.icon === 'bell') ch = '♪';
			else if (look.icon === 'clock') ch = '☼';
			else if (ch === ' ' && luma(bg) > 14) { ch = '.'; fg = lerp(bg, [255, 255, 255], 0.28); }
			// Open ground thins out as the light goes: full texture where lit, a dot in the dusk, bare in the dark.
			const bare = !look.wall && !look.glass && !look.icon && t.cells[i].tile !== 'wall' && !t.cells[i].things.length;
			if (bare) {
				const lf = luma(fg);
				if (lf < 16) ch = ' ';
				else if (lf < 34 && ch !== '~') ch = hash2(x, y) & 1 ? '.' : ' ';
			}
			if (shown && !indoors && !look.wall && (w.rain || w.snow)) {
				const f2 = fall(w, x, y, now);
				if (f2 && !t.cells[i].things.length) { ch = f2.ch; fg = mul(f2.c, lit.get(i)!.map((v) => Math.min(1, v + 0.35)) as Rgb); }
			}
			const fgi = quant(fg);
			// The ground keeps its own colour, in the shades of its ink, so a lit square glows and the dark falls away.
			// At dusk the seats are picked out in gold.
			const bgi = mySeat && mySeat.x === x && mySeat.y === y ? 8 : S.phase === 'dusk' && seatSet.has(i) ? shade(6, 1) : shown && luma(bg) > 9 ? quant(bg) : 0;
			ground.set(i, bgi);
			// A wall's line runs on through both columns; anything else sits in the middle of its square.
			if (look.wall || look.glass) { g.set(sx, mapY + sy, ch, fgi, bgi); g.set(sx + 1, mapY + sy, look.glass ? '▒' : filler(ch, look.wall, x, y), fgi, bgi); }
			else g.setWide(sx, mapY + sy, ch, fgi, bgi);
		}
	}
	for (const l of t.labels) {
		const i = l.x + l.y * t.w;
		if (!S.seen![i] && !p.st) continue;
		if ((inside || inCave) && !vis.has(i)) continue;
		const sx = scr(l.x), sy = l.y - y0 - 1;
		if (sy < 0 || sy >= mapH) continue;
		// The name whole, in faded ink on the ground beneath it (cells are two columns, so it seldom covers much).
		for (let k = 0; k < l.text.length; k++) {
			const cell = g.get(sx + k, mapY + sy);
			if (cell) g.set(sx + k, mapY + sy, l.text[k], 4);
		}
	}
	const people = [...S.people.values()].filter((q) => {
		if (q.id === S.me) return true;
		if ((q.z ?? 0) !== (p.z ?? 0)) return false;
		if (q.st && S.phase === 'night' && !p.st && !sameRoom(t, p, q)) return false;
		const l = lit.get(q.x + q.y * t.w);
		return !!l && (luma(l.map((v) => v * 255) as Rgb) > 30 || Math.hypot(q.x - p.x, q.y - p.y) < 2);
	});
	for (const q of people) {
		const d = shownAt.get(q.id) ?? q;
		const sx = scr(Math.round(d.x)), sy = Math.round(d.y) - y0;
		if (sy < 0 || sy >= mapH) continue;
		const [fg, bg] = markOf(q);
		const mineQ = q.id === S.me;
		const talk = talking(q) > 0.15;
		// You are drawn reversed out of your ink; someone talking gets a gold plate.
		const lit = bg ? bg : fg;
		// A square plate: the letter and its second column share the ground.
		const pf = mineQ ? 0 : talk ? 0 : fg, pb = mineQ ? lit : talk ? 6 : bg;
		g.setWide(sx, mapY + sy, q.st ? '☼' : glyphOf(q), pf, pb || (g.get(sx, mapY + sy)?.bg ?? 0));
	}
	if (S.game && (S.phase === 'dusk' || S.phase === 'circle') && gathering(t)) {
		for (const r of S.ring) {
			if ([...S.people.values()].some((q) => !q.st && q.seat === r.seat)) continue;
			const cell = seatCell(t, r.seat);
			if (!cell) continue;
			g.setWide(scr(cell.x), mapY + cell.y - y0, r.name[0]?.toUpperCase() ?? '?', r.dead ? 3 : personInk(r.seat)[0] || 4, r.dead ? 0 : personInk(r.seat)[1]);
		}
	}
	if (S.route.length) {
		const goal = S.route[S.route.length - 1];
		for (let k = 0; k < CW; k++) {
			const cell = g.get(scr(goal.x) + k, mapY + goal.y - y0);
			if (cell) cell.bg = 6, cell.fg = 0;
		}
	}
}

/** Wall joins by mask (1 up, 2 right, 4 down, 8 left) as CP437 line glyphs. */
const WALL_SINGLE = [' ', '│', '─', '└', '│', '│', '┌', '├', '─', '┘', '─', '┴', '┐', '┤', '┬', '┼'];
const WALL_DOUBLE = [' ', '║', '═', '╚', '║', '║', '╔', '╠', '═', '╝', '═', '╩', '╗', '╣', '╦', '╬'];


/**
 * The council in the great hall, drawn over the map: each seat's name beside it, the
 * nominee on a red plate, raised hands green, counted ones gold, and the day's business
 * on a scroll at the top.
 */
function councilCells(g: Grid, mapY: number, mapH: number, t: Town) {
	const c = t.council!;
	const ring = S.ring.length ? S.ring : [...S.people.values()].filter((q) => !q.st).map((q) => ({ seat: q.seat, name: q.name, dead: !!q.dead }));
	// Screen cell of a town cell: x - view.x0, y - view.y0 (see mapCells).
	const x0 = view.x0, y0 = view.y0;
	const v = S.vote;
	for (const r of ring) {
		const cell = seatCell(t, r.seat);
		if (!cell) continue;
		const sx = (cell.x - x0) * CW, sy = cell.y - y0;
		const here = g.get(sx, sy), next = g.get(sx + 1, sy);
		if (!here || sy < mapY || sy >= mapY + mapH) continue;
		const plate = v?.nominee === r.seat ? 8 : v?.raised.includes(r.seat) ? 10 : v?.counted.includes(r.seat) ? 6 : -1;
		if (plate >= 0) for (const c of [here, next]) if (c) { c.fg = 0; c.bg = plate; }
		if (v?.at === r.seat) { g.set(sx - 1, sy, '>', 6); }
		// The name, out from the table along the seat's own direction, so the ring of names never crowds the ring of seats.
		const dx = cell.x - c.at.x, dy = (cell.y - c.at.y) * 2, d = Math.hypot(dx, dy) || 1;
		const ux = dx / d, uy = dy / d;
		const label = (r.dead ? '+' : '') + r.name.slice(0, 7);
		const ax = sx + (ux > 0 ? 1 : 0) + Math.round(ux * 4), ay = sy + Math.round(uy * 1.6);
		const lx = Math.abs(ux) < 0.4 ? ax - Math.floor(label.length / 2) : ux < 0 ? ax - label.length + 1 : ax;
		g.text(lx, ay, label, r.dead ? 3 : v?.nominee === r.seat ? 8 : 5, 0);
	}
	if (S.caption.length) {
		const w = Math.min(g.cols - 2, Math.max(...S.caption.map((l) => l.length)) + 4);
		const bx = Math.floor((g.cols - w) / 2);
		const [ink, ground, rule] = onMap() ? [0, 4, 15] : [4, 1, 6];
		g.fill({ x: bx, y: mapY, w, h: S.caption.length + 2 }, ' ', 5, ground);
		g.box({ x: bx, y: mapY, w, h: S.caption.length + 2 }, rule, ground, '', rule, 'double');
		S.caption.forEach((l, i) => g.text(bx + Math.floor((w - l.length) / 2), mapY + 1 + i, l, i === 0 ? (onMap() ? 9 : 8) : ink, ground));
	}
}

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
		const [pf, pb] = person ? markOf(person) : [3, 0];
		const ink = r.dead ? 3 : pf || pb;
		const hand = v?.raised.includes(r.seat) ? '▲' : v?.counted.includes(r.seat) ? '•' : ' ';
		const label = (hand + (r.dead ? '†' : '☺') + r.name).slice(0, 10);
		const nominee = v?.nominee === r.seat;
		g.text(x - Math.floor(label.length / 2), y, label, nominee ? 0 : ink, nominee ? 8 : 0);
	});
}

function hearList() {
	const t = S.town, p = me();
	if (!t || !p) return [];
	return [...S.people.values()].filter((q) => q.id !== S.me && q.voice).map((q) => ({ q, loud: loudness(lvl(p), p, q, S.phase) }));
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
	const close = (a: string) => navRow('Close', () => act(a));
	if (S.choice) {
		return [close('choice-close'), rubric(S.choice.title), ...S.choice.options.map((o) => buttonBlock([btn(o.label, () => act('choice', o.id), { width: INNER })])), endPanel()];
	}
	if (S.sheet === 'more') {
		const more = barButtons(theTerm()?.cols ?? 44).more;
		// Each choice closes the page as it is made.
		return [close('sheet-close'), rubric('More'), ...more.map((b) => buttonBlock([btn(b.label, () => { S.sheet = null; b.act(); drawChrome(); }, { style: b.style, width: INNER })])), endPanel()];
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
		return [close('sheet-close'), ...rows, endPanel()];
	}
	if (S.host && S.stOpen) {
		const ph = (k: Phase, label: string) => btn(label, () => act('phase-' + k), { style: S.phase === k ? 'on' : undefined });
		const rows: Row[] = [rubric('Storyteller')];
		if (!S.game) rows.push(buttonBlock([ph('day', 'Day'), ph('dusk', 'Ring the bell'), ph('circle', 'The circle'), ph('night', 'Night')]));
		rows.push(buttonBlock([btn('All ears: ' + (me()?.ears ? 'on' : 'off'), () => act('ears'), { style: me()?.ears ? 'on' : undefined }), btn('+ Test villager', () => act('bot'))]));
		if (S.game) rows.push(buttonBlock([btn('Open the grimoire', () => act('back-game'), { style: 'primary', width: INNER })]));
		else rows.push(...prose('Players open ' + location.origin + location.pathname + '#village=' + S.room, 'dim'));
		if (store.get('grimoire.town')) rows.push(buttonBlock([btn('Use the demo village', () => act('town-reset'))]));
		return [close('st-toggle'), ...rows, endPanel()];
	}
	return [];
}

function drawChrome() {
	const p = me();
	const near = doorBeside();
	chromeKey = `${near}|${near !== null && S.town!.locked.has(near)}|${S.town?.locked.size}|${p?.with}|${S.phase}`;
	paint(VSHEET, paneled(sheetRows()));
	redraw();
}

const BANNERS: Record<Phase, { title: string; line: string }> = {
	day: { title: 'Dawn', line: 'Day. Wander, talk, conspire.' },
	dusk: { title: 'The bell tolls', line: 'Dusk. Walk to the great hall and take your seat at the round table (My seat shows the way).' },
	circle: { title: 'The council sits', line: 'The town sits at the round table in the great hall. Everyone there hears everyone.' },
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
	// A town with no council gathers in the square, in the old way.
	const b = !S.town?.council && S.phase === 'dusk' ? { title: 'The bell tolls', line: 'Dusk. The town gathers round the market cross.' }
		: !S.town?.council && S.phase === 'circle' ? { title: 'The circle', line: 'The town gathers. Everyone sees and hears everyone.' } : BANNERS[S.phase];
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
	const rows: Row[] = [navRow('Home', () => act('back')), rubric('The Village'), ...prose('Walk the town on your own phone. Talk to whoever is near you: voices fade with distance and stop at walls.', 'dim')];
	if (!lobbyCode) {
		// One town for each script's look.
		THEMES.forEach((th, k) => rows.push(buttonBlock([btn('Open ' + THEME_TOWN[th], () => { audio(); openVillage(THEME_SCRIPT[th]); }, { style: k ? undefined : 'primary', width: INNER })])));
		rows.push(row(txt(center('or join one', INNER), 'dim')));
	}
	rows.push(field('v-name', 'Your name', lobbyName, (v) => { lobbyName = v.trim(); store.set('grimoire.villageName', lobbyName); drawChrome(); }, 14, 'tap to type'),
		field('v-code', 'Village code', lobbyCodeIn, (v) => { lobbyCodeIn = v.trim().toUpperCase(); drawChrome(); }, 4, 'four letters'));
	if (lobbyMsg) rows.push(row(txt(lobbyMsg, 'rubric')));
	rows.push(buttonBlock([btn('Join', () => act('join'), { style: lobbyCode ? 'primary' : undefined })]));
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
		case 'more': S.sheet = S.sheet === 'more' ? null : 'more'; S.stOpen = false; drawChrome(); break;
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
	// Walking the town alone: the lobby a leaf of the town's own book by candlelight; the map in its own inks.
	setPalette(() => bookKey(themeOfTown(S.townText), true));
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
	// Joining (or back) while the town is gathered: straight to their seat (in a town with a council, once it sits).
	if (S.game && (t.council ? S.phase === 'circle' : S.phase === 'dusk')) {
		for (const q of fresh) {
			const c = seatCell(t, q.seat);
			if (c) { q.x = c.x; q.y = c.y; q.z = 0; sendTo(q.id, { t: 'place', x: c.x, y: c.y, z: 0 }); }
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
