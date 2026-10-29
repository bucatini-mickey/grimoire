/**
 * main.ts - the Storyteller's grimoire, in-person mode.
 *
 * One device, held by the Storyteller. Players talk, nominate and vote out
 * loud. The Storyteller records it here and the engine keeps the rules.
 *
 * At night the app says who to wake next. The Storyteller opens that
 * player's profile, enters whoever the player points at, picks what to tell
 * them (with suggestions leaning neutral, good or evil), and can turn the
 * phone round to show them a card.
 *
 * By day it runs the clock: discussion, then a nomination phase whose timer
 * stops for each nomination's accusation, defence and clockwise vote.
 *
 * What is saved: the game's event log (the truth), plus the clocks and the
 * setup draft (conveniences). Everything else here is passing screen state.
 */
import * as G from '../core/index.ts';
import type { Candidate, CharacterId, Command, GameEvent, GameState, Info, SeatId, Script, Lean } from '../core/index.ts';
import { coverRow, illuminatedRow, navRow, tabStrip } from './ascii.ts';
import { bookKey, themeOf } from './theme.ts';
import { LobbyVoice } from '../town/lobbyvoice.ts';
import type { Tab as TabSpec } from './ascii.ts';
import { COLS, INNER, Canvas, letteredRow, shade, titleRow, blank, blockRow, boxRow, btn, buttonBlock, buttonRows, center, endPanel, field, frameBottom, frameTop, listRow, paint, paneled, pad, redraw, row, rubric, rule, segWidth, setDynamic, setExtra, setPalette, txt, wrap } from './ascii.ts';
import type { Button, Row, Seg, Tone } from './ascii.ts';
import * as T from './timer.ts';
import * as V from '../net/views.ts';
import { hostRoom, newRoomCode } from '../net/link.ts';
import type { HostLink, LinkStatus } from '../net/link.ts';
import type { ClockView, HostMsg, PlayerMsg, VoteView } from '../net/protocol.ts';
import { startPlayer } from './player.ts';

import { INKS, startVillage, villageForGame } from '../town/village.ts';
import { AMNESIAC_IDEAS, savantPair, savantStatements } from './helpers.ts';
import type { Extra, StActions, VillageHost } from '../town/village.ts';
import { CARD_COLS, CARD_INNER, big, cardButtons, handBackRows, handOverRows, nextPage, note, wakeRows } from './wakepages.ts';
import type { Page } from './wakepages.ts';

// ---- saved data -------------------------------------------------------------

const KEY = 'grimoire.v2';

interface Settings {
	dayMs: number;
	nominationsMs: number;
	accusationMs: number;
	defenceMs: number;
}

const DEFAULT_SETTINGS: Settings = { dayMs: 5 * 60_000, nominationsMs: 3 * 60_000, accusationMs: 45_000, defenceMs: 45_000 };

interface Speech {
	stage: 'accusation' | 'defence' | 'vote';
	timer: T.Timer;
}

interface VoteRound {
	order: SeatId[];
	index: number;
	hands: SeatId[];
}

/** The setup being built before it is committed with `assign`. */
interface Draft {
	selected: CharacterId[];
	placed: (CharacterId | null)[];
	drunkBelieves: CharacterId | null;
	/** The good character the Marionette is told they are. */
	marionetteBelieves?: CharacterId | null;
	/** The Demon the Lunatic is told they are. */
	lunaticBelieves?: CharacterId | null;
	/** The Evil Twin's good twin. */
	evilTwin?: SeatId | null;
	/** The Fabled announced for this game (the Storm Catcher names a character). */
	fabled?: { id: string; character?: CharacterId }[];
	redHerring: SeatId | null;
	bluffs: CharacterId[];
}

interface Flow {
	dayN: number;
	dayTimer: T.Timer;
	nomTimer: T.Timer;
	speech: Speech | null;
	vote: VoteRound | null;
	draft: Draft | null;
}

interface Saved {
	events: GameEvent[];
	/** Event count before each command, so undo removes one whole command. */
	marks: number[];
	flow: Flow;
	settings: Settings;
	/** Hosting players' phones: the room code and each phone's seat, kept so a reload re-opens the room. */
	net?: { room: string; claims: Record<string, SeatId>; village?: boolean; lobby?: { client: string; name: string }[] };
}

function freshFlow(settings: Settings): Flow {
	return { dayN: 0, dayTimer: T.newTimer(settings.dayMs), nomTimer: T.newTimer(settings.nominationsMs), speech: null, vote: null, draft: null };
}

function load(): Saved {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) {
			const s = JSON.parse(raw) as Saved;
			G.replay(s.events); // throws if the log is unreadable
			const settings = { ...DEFAULT_SETTINGS, ...s.settings };
			return { events: s.events, marks: s.marks ?? [], settings, flow: { ...freshFlow(settings), ...s.flow }, net: s.net };
		}
	} catch {
		/* fall through to a fresh game */
	}
	return { events: [], marks: [], settings: { ...DEFAULT_SETTINGS }, flow: freshFlow(DEFAULT_SETTINGS) };
}

function save() {
	try {
		localStorage.setItem(KEY, JSON.stringify(saved));
	} catch {
		/* private mode etc: the game still runs, it just will not survive a reload */
	}
}

let saved = load();
let state: GameState = G.replay(saved.events);
const flow = () => saved.flow;

// ---- passing screen state ------------------------------------------------------

type Tab = 'grimoire' | 'log' | 'ties' | 'settings' | 'options' | 'phones';
/** In a village game the grimoire is a drawer over the town; these are its tabs. */
type DrawerTab = Tab | 'actions';
type DayMode = 'none' | 'nominate' | 'slay';

const ui = {
	tab: 'grimoire' as Tab,
	/** The drawer pulled out over the village (a village game), or null when it is put away. */
	drawer: (state.phase.kind === 'setup' ? 'actions' : null) as DrawerTab | null,
	picks: [] as SeatId[],
	inspect: null as SeatId | null,
	/** A player being moved: the next seat tapped changes places with them. */
	moving: null as SeatId | null,
	/** The day whose bell has been rung (the town is walking to the council). */
	bellRung: -1,
	/** Rearranging the circle: taps pick a player and swap them along; the arrows walk them round. */
	rearrange: false,
	/** Put away until asked for: the key to the grimoire's marks, and the rest of tonight's wakings. */
	showKey: false,
	showLater: false,
	/** Choosing a new token for the inspected seat: first the character, then (Drunk) what they believe. */
	retoken: null as null | 'character' | 'believes',
	retokenTo: null as CharacterId | null,
	dayMode: 'none' as DayMode,
	message: '',
	pending: null as Command | null,
	decision: null as string | null,
	question: '',
	/** The phone in a player's hands, page by page. */
	show: null as Show | null,
	/** Something the whole room should hear, shown large until dismissed. */
	banner: null as Banner[] | null,
	/** Counting hands in the small, inline view rather than full screen. */
	voteSmall: false,
	/** In a village game the count runs in the bar; the full count only when asked for. */
	voteBig: false,
	/** The Savant helper: which suggestions, and true-and-false or (drunk, poisoned) two truths or two lies. */
	savantSeed: 1,
	savantMode: 'normal' as 'normal' | 'truths' | 'lies',
	amnesiacSeed: 0,
	/** Which page: the home page, or the app itself (a grimoire, a hosted game). */
	page: 'app' as 'home' | 'app',
	/** The home page starts as the book's shut cover; a tap opens it to the menu. */
	coverOpen: false,
	/** Which leaf of the opened book: its contents, the Storyteller's leaf, or the players'. */
	leaf: 'contents' as 'contents' | 'st' | 'players',
	/** Second taps that confirm ending a game (home: host anew, play in person, end it). */
	confirm: '' as '' | 'host' | 'grimoire' | 'table' | 'end',
	showQr: false,
	copied: false,
	/** A wake sent to a player's phone and not yet finished. */
	remote: null as null | { wakeId: string; seat: SeatId; answered: boolean },
	names: 'Ada\nBram\nCael\nDorn\nEsme\nFenn\nGwen\nHal',
	/** In a village game: players without a phone, seated after those in the room. */
	extraNames: '',
	/** The start screen's choice: run a game, join one, or walk the village. */
	mode: 'storyteller' as 'storyteller' | 'player' | 'village',
	confirmNew: false,
	seed: Date.now() % 100000,
	/** What the Storyteller has chosen to tell the woken player. */
	draftInfo: null as Info | null,
	/** The Storyteller insisted on telling a hale player a falsehood. */
	draftOverride: false,
	/** Composing an answer by hand rather than from the suggestions. */
	compose: false,
	composeChar: null as string | null,
	/** A character the woken player chose (the Gambler's guess, the Courtier's pick). */
	charPick: null as CharacterId | null,
	/** The Juggler's guesses being made: who, then which character. */
	juggle: null as null | { by: SeatId; player: SeatId | null; guesses: { player: SeatId; character: CharacterId }[] },
	/** A Traveller joining: their name, then character, alignment and seat. */
	travel: null as null | { name: string; character: CharacterId | null; alignment: 'good' | 'evil' | null },
	/** Who called on the Doomsayer. */
	doom: null as SeatId | null,
	/** An exile being decided: who supports it. */
	exile: null as null | { traveller: SeatId; supporters: SeatId[] },
	/** Which page of setting the table: the script and the players' names, then the characters and the seats (the Fabled to one side). */
	setup: 'script' as 'script' | 'players' | 'characters' | 'seats' | 'fabled',
	/** Reading the book of characters (over whatever page it was opened from). */
	reading: false,
	/** A second tap to confirm starting again (settings). */
	confirmRestart: '' as '' | 'same' | 'new',
	/** The edition for a new game ('custom' to pick characters). */
	scriptId: 'trouble-brewing',
	/** The characters of a custom script being built. */
	customIds: [] as CharacterId[],
	/** The team the custom-script picker is showing. */
	customTeam: 'townsfolk' as G.Team,
	nonstandard: false
};

function clearPicks() {
	ui.picks = [];
	ui.inspect = null;
	ui.retoken = null;
	ui.draftInfo = null;
	ui.draftOverride = false;
	ui.composeChar = null;
	ui.charPick = null;
}

interface Banner {
	title: string;
	lines: string[];
}

/** Run a command. On refusal, show why; if it needs a decision, remember it. */
function act(cmd: Command): boolean {
	return actAll([cmd]);
}

/** Run several commands as one step: all or nothing, undone together. */
function actAll(cmds: Command[]): boolean {
	const r = G.performAll(state, cmds);
	if (!r.ok) {
		ui.message = r.decision ? '' : r.error;
		ui.question = r.decision ? r.error : '';
		ui.decision = r.decision ?? null;
		ui.pending = r.decision ? cmds[cmds.length - 1] : null;
		if (r.decision) ui.picks = [];
		render();
		return false;
	}
	saved.marks.push(saved.events.length);
	saved.events.push(...r.events);
	const before = state;
	state = r.state;
	ui.banner = announce(before, r.events, r.state);
	ui.remote = null;
	if (ui.banner) toPlayers({ t: 'announce', items: ui.banner });
	ui.message = '';
	ui.pending = null;
	ui.decision = null;
	ui.question = '';
	ui.dayMode = 'none';
	ui.compose = false;
	clearPicks();
	syncFlow();
	save();
	render();
	return true;
}

/**
 * What the room needs to hear from what just happened: deaths at dawn,
 * votes, executions, the Virgin and the Slayer, and the end of the game.
 * Only public facts: a Monk's save, a starpass or a Scarlet Woman taking
 * over are never announced.
 */
function announce(prev: GameState, events: GameEvent[], next: GameState): Banner[] | null {
	const out: Banner[] = [];
	const nm = (id: SeatId) => next.seats[id]?.name ?? '?';
	for (const e of events) {
		switch (e.type) {
			case 'day-began': {
				const dead = prev.night?.deaths ?? [];
				out.push({ title: `Day ${e.n} dawns`, lines: dead.length ? dead.map((d) => `${nm(d)} died in the night.`) : ['Nobody died in the night.'] });
				break;
			}
			case 'vote-tallied': {
				const block = next.day?.block ?? null;
				const lines = [e.outcome === 'on-the-block' ? `${nm(e.nominee)} is about to die.`
					: e.outcome === 'tied' ? 'A tie: nobody is about to die.' : `Not enough. ${e.needed} were needed.`];
				if (e.outcome === 'not-enough' && block !== null) lines.push(`${nm(block)} is still about to die.`);
				out.push({ title: `${e.votes} vote${e.votes === 1 ? '' : 's'} for ${nm(e.nominee)}`, lines });
				break;
			}
			case 'executed': {
				const virgin = events.some((x) => x.type === 'ability-spent' && x.ability === 'virgin');
				const died = events.some((x) => x.type === 'died' && x.seat === e.seat);
				out.push(virgin
					? { title: 'The Virgin!', lines: [`${nm(e.seat)} nominated the Virgin.`, `${nm(e.seat)} is executed and dies.`] }
					: { title: 'Execution', lines: [`${nm(e.seat)} is executed.`, died ? `${nm(e.seat)} dies.` : `${nm(e.seat)} was already dead.`] });
				break;
			}
			case 'slayer-shot':
				out.push({ title: 'The Slayer', lines: [`${nm(e.by)} shoots ${nm(e.target)}.`, e.hit ? `${nm(e.target)} dies.` : 'Nothing happens.'] });
				break;
			case 'game-over':
				out.push({ title: e.winner === 'good' ? 'Good wins' : 'Evil wins', lines: [e.reason] });
				break;
		}
	}
	const dusk = events.some((e) => e.type === 'night-began') && prev.phase.kind === 'day';
	if (dusk && !events.some((e) => e.type === 'executed') && prev.day?.executed === null) {
		out.push({ title: 'Dusk', lines: ['Nobody is executed today.'] });
	}
	return out.length ? out : null;
}

function bannerRows(): Row[] {
	const rows: Row[] = [blank()];
	for (const b of ui.banner!) {
		rows.push(rubric(b.title));
		for (const l of b.lines) rows.push(...wrap(l, CARD_INNER - 2).map((w) => row(txt('  ' + w, 'gold', 'heading'))));
	}
	rows.push(endPanel(), blank(), ...cardButtons([btn('Done', () => { ui.banner = null; render(); }, { style: 'primary' })]));
	return rows;
}

function undo() {
	const mark = saved.marks.pop();
	if (mark === undefined) return;
	saved.events = saved.events.slice(0, mark);
	state = G.replay(saved.events);
	ui.message = 'Undone.';
	ui.pending = null;
	ui.decision = null;
	ui.question = '';
	ui.show = null;
	clearPicks();
	syncFlow();
	save();
	render();
}

function newGame() {
	saved = { events: [], marks: [], settings: saved.settings, flow: freshFlow(saved.settings), net: saved.net ? { room: saved.net.room, claims: {}, village: saved.net.village, lobby: saved.net.lobby } : undefined };
	state = G.replay([]);
	save();
	ui.confirmNew = false;
	ui.message = '';
	ui.tab = 'grimoire';
	if (saved.net?.village) ui.mode = 'village';
	clearPicks();
	render();
	for (const peer of phones.keys()) welcome(peer);
}

/** Keep the clocks in step with the game: a new day, a nomination opening or closing. */
function syncFlow() {
	const f = flow();
	const now = Date.now();
	const st = saved.settings;
	if (state.phase.kind === 'day') {
		if (f.dayN !== state.phase.n) {
			f.dayN = state.phase.n;
			f.dayTimer = T.newTimer(st.dayMs);
			f.nomTimer = T.newTimer(st.nominationsMs);
			f.speech = null;
			f.vote = null;
		}
		const nom = openNomination();
		if (nom && !f.speech) {
			f.speech = { stage: 'accusation', timer: T.start(T.newTimer(st.accusationMs), now) };
			f.nomTimer = T.pause(f.nomTimer, now);
		}
		if (!nom) {
			f.speech = null;
			f.vote = null;
		}
	} else {
		f.speech = null;
		f.vote = null;
	}
	if (state.phase.kind !== 'setup' || !state.seats.length) f.draft = null;
	else if (!f.draft || f.draft.placed.length !== state.seats.length) f.draft = emptyDraft();
}

// ---- words ------------------------------------------------------------------------

const script = (): Script => G.getScript(state.scriptId || 'trouble-brewing');
const charName = (id: string | null | undefined) => (id ? G.charDef(script(), id).name : '?');
const name = (id: SeatId) => state.seats[id]?.name ?? '?';
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];
const roman = (n: number) => ROMAN[n] ?? String(n);
const ORDINAL = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth'];
const ordinal = (n: number) => ORDINAL[n] ?? `${n}th`;

const ABBR: Record<string, string> = {
	washerwoman: 'WSH', librarian: 'LIB', investigator: 'INV', chef: 'CHF', empath: 'EMP',
	'fortune-teller': 'FTL', undertaker: 'UND', monk: 'MNK', ravenkeeper: 'RVN', virgin: 'VRG',
	slayer: 'SLY', soldier: 'SOL', mayor: 'MAY', butler: 'BTL', drunk: 'DRK', recluse: 'RCL',
	saint: 'SNT', poisoner: 'POI', spy: 'SPY', 'scarlet-woman': 'SCW', baron: 'BAR', imp: 'IMP'
};

function toneFor(character: string | null | undefined): Tone {
	if (!character) return 'dim';
	const team = G.charDef(script(), character).team;
	return team === 'minion' || team === 'demon' ? 'evil' : 'good';
}

/** A sentence or two, wrapped to the grid (inside a panel by default). */
function prose(text: string, tone?: Tone, width = INNER): Row[] {
	return wrap(text, width).map((l) => row(txt(l, tone)));
}

function infoText(i: Info, role = ''): string {
	switch (i.kind) {
		case 'pair': return `${name(i.players[0])} or ${name(i.players[1])} is the ${charName(i.character)}`;
		case 'none': return 'there are no Outsiders';
		case 'number': return role === 'chef'
			? `${i.value} pair${i.value === 1 ? '' : 's'} of evil neighbours`
			: role === 'empath' ? `${i.value} evil neighbour${i.value === 1 ? '' : 's'}` : String(i.value);
		case 'fortune': return `${name(i.players[0])} & ${name(i.players[1])}: ${i.yes ? 'YES' : 'NO'}`;
		case 'character': return `the ${charName(i.character)}`;
		case 'reveal': return `${name(i.player)} is the ${charName(i.character)}`;
		case 'woke': return `${name(i.players[0])} & ${name(i.players[1])}: ${i.value} woke`;
		case 'characters': return i.characters.length ? i.characters.map((c) => `the ${charName(c)}`).join(', ') : 'no Outsiders';
		case 'yesno': return i.yes ? 'YES' : 'NO';
		case 'dream': return `${name(i.player)} is the ${charName(i.characters[0])} or the ${charName(i.characters[1])}`;
		case 'players': return `${name(i.players[0])} or ${name(i.players[1])} is the Demon`;
		case 'same': return `${name(i.players[0])} & ${name(i.players[1])}: ${i.yes ? 'same team' : 'different teams'}`;
	}
}

// ---- the circle ----------------------------------------------------------------------

/**
 * The seats as round tokens on a fine double-ruled ring, clockwise from the
 * top in circle order (which the Storyteller can change mid-game). Each token
 * is edged in its team's colour with the character inside; the player's name
 * sits beneath, any flags at the token's shoulder and any reminders below in
 * small italic. The middle of the ring only says where we are in the game.
 */

interface SeatLook {
	flags: Seg[];
	/** The character's name, inside the token. */
	role: string;
	roleTone: Tone;
	style?: Button['style'];
	/** Little notes under the seat, like reminder tokens in a grimoire. */
	reminders?: string[];
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function table(look: (id: SeatId) => SeatLook, centre: string[] = [], title = 'The Grimoire'): Row[] {
	const order = state.order.length ? state.order : state.seats.map((s) => s.id);
	const n = order.length;
	const rx = 16, ry = Math.max(6, Math.min(10, 3 + n / 2));
	const h = Math.ceil(2 * ry) + 4;
	const tw = Math.max(6, Math.min(10, Math.floor((2 * rx * Math.sin(Math.PI / Math.max(n, 2))) - 0.5)));
	return [
		...frameTop(title),
		{ ...blockRow(h, (c) => {
			const cx = c.x + Math.floor(c.w / 2), cy = c.y + Math.floor(h / 2);
			// The round table the tokens sit about: a ring of gilt dots.
			const tx = rx - tw / 2 - 2.5, ty = ry - 2.5;
			for (let k = 0; k < 64; k++) {
				const a = (2 * Math.PI * k) / 64;
				const x = Math.round(cx + tx * Math.sin(a)), y = Math.round(cy - ty * Math.cos(a));
				if (c.g.get(x, y)?.ch === ' ') c.g.set(x, y, k % 8 ? '·' : '+', shade(6, 1));
			}
			centre.forEach((line, i) => {
				const text = line.startsWith('@timer:') ? (dynamicText({ timer: line.slice(7) }) ?? '') : line;
				c.g.text(cx - Math.floor(text.length / 2), cy - Math.floor(centre.length / 2) + i, text, i === 0 ? 8 : 3);
			});
			order.forEach((id, i) => {
				const s = state.seats[id];
				const l = look(id);
				const a = (2 * Math.PI * i) / n;
				const x = Math.round(cx + rx * Math.sin(a) - tw / 2), y = Math.round(cy - ry * Math.cos(a) - 1);
				const on = l.style === 'on', lit = l.style === 'primary';
				// A token: the name over it, the character in a ring of the team's ink, the reminders under it.
				const rim = on ? 0 : !s.alive ? 3 : lit ? 6 : c.ink(l.roleTone);
				const disc = on ? 6 : 0;
				const cut = (t: string, w: number) => [...t].slice(0, w).join('');
				const mid = (t: string, w: number) => x + Math.max(0, Math.floor((w - [...t].length) / 2));
				const nm = cut((s.alive ? '' : '†') + s.name, tw);
				c.g.text(mid(nm, tw), y, nm, on ? 6 : s.alive ? (lit ? 6 : 5) : 3);
				c.g.fill({ x, y: y + 1, w: tw, h: 1 }, ' ', 4, disc);
				c.g.set(x, y + 1, lit ? '»' : '(', rim, disc);
				c.g.set(x + tw - 1, y + 1, lit ? '«' : ')', rim, disc);
				const role = cut(l.role, tw - 2);
				c.g.text(x + 1 + Math.floor((tw - 2 - [...role].length) / 2), y + 1, role, on ? 0 : c.ink(l.roleTone), disc);
				const flags = l.flags.filter((f) => 't' in f) as { t: string; tone?: Tone }[];
				let fx = x + Math.max(0, Math.floor((tw - flags.reduce((k, f) => k + f.t.length + 1, -1)) / 2));
				if (flags.length) for (const f of flags) { c.g.text(fx, y + 2, f.t, c.ink(f.tone)); fx += f.t.length + 1; }
				else if (l.reminders?.[0]) { const r = cut(l.reminders[0], tw); c.g.text(mid(r, tw), y + 2, r, 3); }
				c.hit({ x, y, w: tw, h: 3 }, () => tapSeat(id));
			});
		}), cls: 'frame-mid' },
		frameBottom()
	];
}

/** A seat as the grimoire shows it: flags beside the name, the character beneath. */
function grimoireLook(id: SeatId): SeatLook {
	const s = state.seats[id];
	const flags: Seg[] = [];
	if (!s.alive) flags.push(txt(s.ghostVote ? '†' : '×', 'dim'));
	if (G.isPoisoned(state, id)) flags.push(txt('P', 'poison'));
	if (s.character === 'drunk') flags.push(txt('D', 'drunk'));
	if (s.character === 'marionette') flags.push(txt('M', 'evil'));
	if (state.redHerring === id) flags.push(txt('R', 'gold'));
	// The Drunk shows as the Townsfolk they think they are, marked D; the Marionette as the good character they think they are, marked M.
	const overlay = s.character === 'drunk' || s.character === 'marionette';
	const shown = overlay ? s.believes : s.character;
	// Reminders, as a Storyteller would lay small tokens beside the seat.
	const reminders: string[] = [];
	if (G.isPoisoned(state, id)) reminders.push('poisoned');
	if (s.character === 'drunk') reminders.push('drunk');
	if (s.character === 'marionette') reminders.push('marionette');
	reminders.push(...G.reminders(state, id));
	if (!s.alive && !s.ghostVote) reminders.push('no vote');
	return { flags, role: charName(shown), roleTone: !s.alive ? 'dim' : s.character === 'drunk' ? 'drunk' : s.character === 'marionette' ? 'evil' : toneFor(s.character), reminders };
}

function legend(): Row[] {
	return [
		rubric('Key'),
		row(txt('†', 'dim'), txt(' dead      '), txt('×', 'dim'), txt(' vote spent  '), txt('P', 'poison'), txt(' poisoned')),
		row(txt('D', 'drunk'), txt(' the Drunk (shows who they think)')),
		row(txt('R', 'gold'), txt(' the red herring   '), txt('M', 'evil'), txt(' the Marionette')),
		endPanel()
	];
}

/** How many seats the current context wants picked. */
function pickLimit(): number {
	if (ui.decision === 'mayorRedirect' || ui.decision === 'newDemon') return 1;
	if (state.phase.kind === 'setup') return 2;
	if (state.phase.kind === 'night') {
		const step = G.nextStep(state);
		if (!step) return 0;
		const k = step.kind;
		if (k in G.PAIR_ROLE_TEAM) return ui.compose ? 2 : 0;
		if (k === 'grandmother') return ui.compose ? 1 : 0;
		return playerPicks(k, state, step.seat);
	}
	if (state.phase.kind === 'day') {
		if (flow().vote) return 0;
		if (ui.dayMode !== 'none') return 2;
	}
	return 0;
}

function tapSeat(id: SeatId) {
	if (ui.rearrange) {
		// Tap a player, then where they go: they change places, and stay picked to move on.
		if (ui.moving === null || ui.moving === id) { ui.moving = ui.moving === id ? null : id; return render(); }
		return void act({ type: 'swap-seats', a: ui.moving, b: id });
	}
	if (ui.moving !== null) {
		const from = ui.moving;
		ui.moving = null;
		if (from === id) return render();
		return void act({ type: 'swap-seats', a: from, b: id });
	}
	// During a vote, tapping a seat jumps the count to them.
	const v = flow().vote;
	if (v && state.phase.kind === 'day') {
		const at = v.order.indexOf(id);
		if (at >= 0) v.index = at;
		save();
		return render();
	}
	const limit = pickLimit();
	if (limit === 0) {
		ui.inspect = ui.inspect === id ? null : id;
		ui.retoken = null;
		return render();
	}
	if (state.phase.kind === 'setup') return tapDraftSeat(id);
	if (ui.picks.includes(id)) ui.picks = ui.picks.filter((p) => p !== id);
	else {
		ui.picks.push(id);
		if (ui.picks.length > limit) ui.picks.shift();
	}
	ui.message = '';
	ui.draftInfo = null;
	if (state.phase.kind === 'day' && ui.picks.length === 2) {
		const [a, b] = ui.picks;
		if (ui.dayMode === 'nominate') return void act({ type: 'nominate', nominator: a, nominee: b });
		if (ui.dayMode === 'slay') return void act({ type: 'slay', by: a, target: b });
	}
	render();
}

function openNomination() {
	const noms = state.day?.nominations ?? [];
	const last = noms[noms.length - 1];
	return state.day && state.day.executed === null && last && last.votes === null ? last : null;
}

// ---- header and tabs --------------------------------------------------------------

function header(): Row[] {
	const p = state.phase;
	const phase =
		p.kind === 'setup' ? 'Setting the Table' :
		p.kind === 'night' ? `Night ${p.n}` :
		p.kind === 'day' ? `Day ${p.n}` : 'Game over';
	const inSettings = ui.tab === 'settings' || ui.tab === 'options' || ui.tab === 'phones';
	const tab = (t: Tab, label: string, on = ui.tab === t): TabSpec => ({ label, on, act: () => { ui.tab = t; ui.reading = false; ui.confirmRestart = ''; render(); } });
	return [
		listRow(phase, 'rubric', [btn('Undo', undo, { disabled: !saved.marks.length, style: 'quiet' })], COLS),
		tabStrip([
			tab('grimoire', 'Grim'), tab('log', 'Log'), tab('ties', 'Ties'), tab('settings', link ? 'Settings*' : 'Settings', inSettings),
			...(village ? [{ label: 'Town', on: false, act: () => village?.open() }] : [])
		])
	];
}

/** A thin band of ASCII lace, top and bottom of the page. */
function ornament(): Row {
	return row(txt('.:*~*:.'.repeat(7).slice(0, COLS - 2).padStart(COLS - 1).padEnd(COLS), 'dim', 'art'));
}

function messageRows(): Row[] {
	if (!ui.message) return [];
	return [...prose(ui.message, 'evil'), blank()];
}

// ---- setup ----------------------------------------------------------------------------

function emptyDraft(): Draft {
	return { selected: [], placed: state.seats.map(() => null), drunkBelieves: null, redHerring: null, bluffs: [] };
}

/** Option tags: a row of choices, the chosen one lit. */
function tagsRow(_cls: string, items: { label: string; on: boolean; act: () => void }[]): Row {
	return buttonBlock(items.map((t) => btn(t.label, t.act, { style: t.on ? 'on' : undefined })));
}

/** The in-person grimoire's setup before the seats exist: the script, then the players' names. */
function namesScreen(): Row[] {
	if (ui.setup === 'players') return playersPage();
	return [...pageHead('The script'), ...scriptPage()];
}

/** The way on from a page of the book: one plain button at its foot. */
const onward = (label: string, act: () => void, disabled = false): Row => buttonBlock([btn(label + ' \u203a', act, { style: 'primary', width: INNER, disabled })]);

/** Go to a page of the app (a fresh start of it, so nothing old lingers). */
function go(hash: string) {
	location.hash = hash;
	location.reload();
}

/** A page's head: back to the home page, and the page's name. */
function pageHead(title: string, back: [string, () => void] = ['< Home', () => go('')]): Row[] {
	return [navRow(back[0], back[1]), rubric(title)];
}

const esc = (x: string) => x.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** What a saved game is up to, in a few words. */
function gameSummary(): string {
	const p = state.phase;
	if (p.kind === 'setup') return state.seats.length ? 'Dealing the characters' : `In the lobby · ${lobby().length} joined`;
	if (p.kind === 'over') return p.winner === 'good' ? 'Over: good won' : 'Over: evil won';
	return `${p.kind === 'night' ? 'Night' : 'Day'} ${p.n} · ${state.seats.length} players`;
}

/** Throw away the saved game (and its room). */
function endSaved() {
	link?.close();
	link = null;
	saved = { events: [], marks: [], settings: saved.settings, flow: freshFlow(saved.settings) };
	state = G.replay([]);
	save();
	ui.confirm = '';
	render();
}

/** An in-person game where each player's own phone is linked: a room, then the grimoire. */
function hostTable() {
	link?.close();
	saved = { events: [], marks: [], settings: saved.settings, flow: freshFlow(saved.settings), net: { room: newRoomCode(), claims: {}, village: false } };
	state = G.replay([]);
	save();
	go('#grimoire');
}

/** A new online game: a fresh room and its lobby. */
function hostNew() {
	link?.close();
	saved = { events: [], marks: [], settings: saved.settings, flow: freshFlow(saved.settings), net: { room: newRoomCode(), claims: {}, village: true, lobby: [] } };
	state = G.replay([]);
	save();
	go('#host');
}

/**
 * The home page: the book shut, then opened to its contents (a game to pick up, and a leaf each for
 * the Storyteller and the players), each leaf a page of its own.
 */
function homeScreen(): Row[] {
	const busy = saved.events.length > 0 || (saved.net?.lobby?.length ?? 0) > 0;
	// Shut: the cover alone. Open: the first page, the illuminated G at its head.
	if (!ui.coverOpen) return [coverRow(() => { ui.coverOpen = true; ui.leaf = 'contents'; render(); })];
	const toLeaf = (l: typeof ui.leaf) => () => { ui.leaf = l; ui.confirm = ''; render(); };
	if (ui.leaf === 'st') return storytellerLeaf(busy, toLeaf('contents'));
	if (ui.leaf === 'players') return playersLeaf(toLeaf('contents'));
	const rows: Row[] = [navRow('Close the book', () => { ui.coverOpen = false; render(); }), illuminatedRow([
		{ t: 'the book of the Storyteller' }, { t: 'for Blood on the Clocktower,' }, { t: 'wherein the game is kept,', tone: 'dim' }, { t: 'its nights and its dead.', tone: 'dim' }
	]), blank()];
	// A game going: pick it up from here.
	if (saved.net && busy) {
		rows.push(rubric((saved.net.village ? 'Your game' : 'Your grimoire') + ' - ' + saved.net.room), ...prose(gameSummary(), 'dim'),
			buttonBlock([btn('Resume', () => go(saved.net!.village ? '#host' : '#grimoire'), { style: 'primary', width: INNER })]), endPanel());
	} else if (!saved.net && saved.events.length) {
		rows.push(rubric('Your grimoire'), ...prose(gameSummary(), 'dim'), buttonBlock([btn('Open', () => go('#grimoire'), { style: 'primary', width: INNER })]), endPanel());
	}
	rows.push(rubric('Contents'));
	rows.push(buttonBlock([btn('For the Storyteller', toLeaf('st'), { width: INNER })]), ...prose('Run a game: on your one phone, with every player\u2019s phone, or in the village online.', 'dim'), blank());
	rows.push(buttonBlock([btn('For the players', toLeaf('players'), { width: INNER })]), ...prose('Join the Storyteller\u2019s game, or walk the village.', 'dim'));
	return rows;
}

/** The Storyteller's leaf: the three ways to run a game (a game going asks before it is ended). */
function storytellerLeaf(busy: boolean, back: () => void): Row[] {
	const rows: Row[] = [navRow('Contents', back), rubric('For the Storyteller')];
	if (busy) rows.push(...prose('A game is going: starting another ends it. (End it here, or pick it up from the contents.)', 'dim'),
		buttonBlock([btn(ui.confirm === 'end' ? 'Sure? End it' : 'End the game going', () => { if (ui.confirm === 'end') endSaved(); else { ui.confirm = 'end'; render(); } }, { style: 'danger' })]), blank());
	const mode = (key: typeof ui.confirm, title: string, sub: string, start: () => void) => {
		const sure = ui.confirm === key;
		rows.push(buttonBlock([btn(sure ? 'End the game going and start?' : title, () => {
			if (busy && !sure) { ui.confirm = key; render(); return; }
			if (busy) endSaved();
			start();
		}, { style: sure ? 'danger' : undefined, width: INNER })]), ...prose(sure ? 'Your current game will end. Tap again.' : sub, 'dim'), blank());
	};
	mode('grimoire', 'I. The Grimoire', 'One phone, in person. You keep it; players come to you at night.', () => go('#grimoire'));
	mode('table', 'II. Phones at the table', 'In person. Each player is woken on their own phone; no phone is passed round.', hostTable);
	mode('host', 'III. The village', 'Online. Everyone walks a little town on their phone, talks by voice, and gathers in the castle hall.', hostNew);
	return rows;
}

/** The players' leaf: join a game (or rejoin the last one), or walk the village alone. */
function playersLeaf(back: () => void): Row[] {
	const rows: Row[] = [navRow('Contents', back), rubric('For the players')];
	const mine = (() => { try { return { room: localStorage.getItem('grimoire.room') ?? '', name: localStorage.getItem('grimoire.name') ?? '' }; } catch { return { room: '', name: '' }; } })();
	if (mine.room && mine.name) rows.push(buttonBlock([btn('Rejoin room ' + mine.room, () => go('#join=' + mine.room), { style: 'primary', width: INNER })]), ...prose('as ' + mine.name, 'dim'), blank());
	rows.push(buttonBlock([btn('Join a game', () => go('#join'), { style: mine.room ? undefined : 'primary', width: INNER })]), ...prose('Type the four letters the Storyteller gives you.', 'dim'), blank());
	rows.push(buttonBlock([btn('Walk the village alone', () => go('#village'), { width: INNER })]), ...prose('No game: wander the castle town or Saltgrave, to learn the way round.', 'dim'));
	return rows;
}

/** The room's code, big and plain to read aloud. */
function roomCodeRow(room: string): Row {
	return boxRow([room.split('').join(' ')], 'gold', 20);
}

/** Someone playing without a phone, added by the Storyteller. */
function addLocal(raw: string) {
	const name = raw.trim().slice(0, 14);
	if (!name || !saved.net) return;
	const list = (saved.net.lobby ??= []);
	if (list.some((e) => e.name.toLowerCase() === name.toLowerCase())) { ui.message = name + ' is already here.'; render(); return; }
	list.push({ client: 'local:' + name, name });
	save();
	for (const peer of phones.keys()) welcome(peer);
	render();
}

/** The invite link, copied (or shared, where the phone can). */
function copyInvite() {
	if (!saved.net) return;
	const url = joinUrl(saved.net.room);
	const nav = navigator as Navigator & { share?: (d: { url: string; title: string }) => Promise<void> };
	if (nav.share && matchMedia('(pointer: coarse)').matches) { void nav.share({ url, title: 'Join my Grimoire game' }).catch(() => {}); return; }
	void navigator.clipboard?.writeText(url).then(() => { ui.copied = true; render(); setTimeout(() => { ui.copied = false; render(); }, 2000); });
}

/** Deal from the lobby: everyone in it gets the seat in its order. */
function dealFromLobby() {
	const names = lobby().map((e) => e.name);
	const made = act({ type: 'create', names, scriptId: ui.scriptId === 'custom' ? G.customScriptId(ui.customIds) : ui.scriptId });
	if (!made || !saved.net) return;
	saved.net.claims = {};
	lobby().forEach((e, i) => { if (!e.client.startsWith('local:')) saved.net!.claims[e.client] = state.order[i]; });
	save();
	for (const peer of phones.keys()) welcome(peer);
	render();
}

/** The host's lobby, a page of its own: the code, who has joined, the script, then deal. */
function hostLobbyPage(): Row[] {
	const net = saved.net!;
	const list = lobby();
	const online = new Set([...phones.entries()].filter(([peer]) => link?.peers.get(peer)?.open).map(([, c]) => c));
	const status = linkStatus === 'open' ? 'Open: players can join' : linkStatus === 'connecting' ? 'Opening the room...' : 'Trouble: ' + (linkDetail || linkStatus);
	const rows: Row[] = [...pageHead('Lobby'), rubric('Room code'), roomCodeRow(net.room), row(txt(center(status, INNER), linkStatus === 'open' ? 'good' : 'evil')),
		...prose('Players open this app, tap Join a game, and type the code and their name.', 'dim'),
		buttonBlock([btn(ui.copied ? 'Link copied' : 'Invite link', copyInvite)]), endPanel(),
		rubric('Voice'), ...prose(lobbyVoice.line(), 'dim'), buttonBlock(lobbyVoice.buttons()), endPanel(),
		rubric('Players - ' + list.length), ...prose('5 to 15 to play. Seats go in this order.', 'dim')];
	if (!list.length) rows.push(row(txt('Waiting for players to join...', 'dim')));
	list.forEach((e, i) => {
		const local = e.client.startsWith('local:'), on = local || online.has(e.client);
		rows.push(listRow(e.name + (local ? ' (no phone)' : on ? '' : ' (away)'), on ? undefined : 'dim', [...(i ? [btn('Up', () => lobbyUp(e.client), { width: 6, style: 'quiet' })] : []), btn('x', () => dropFromLobby(e.client), { width: 6, style: 'quiet' })]));
	});
	rows.push(field('add-name', 'Add someone without a phone', '', addLocal, 14, 'tap to type a name'), endPanel());
	const n = list.length, ok = n >= 5 && n <= 15;
	return [
		...rows,
		...messageRows(),
		rubric('The Script'),
		tagsRow('tags', [
			...Object.values(G.SCRIPTS).map((sc) => ({ label: sc.name, on: ui.scriptId === sc.id, act: () => { ui.scriptId = sc.id; render(); } })),
			{ label: 'Custom', on: ui.scriptId === 'custom', act: startCustom }
		]),
		...customPicker(),
		endPanel(),
		buttonBlock([btn(ok ? 'Choose the characters - ' + n + ' players' : n < 5 ? 'Need ' + (5 - n) + ' more player' + (5 - n === 1 ? '' : 's') : 'Too many players (15 at most)', dealFromLobby, { style: 'primary', disabled: !ok, width: INNER })])
	];
}

/** The first page of setting the table: which script. */
function scriptPage(): Row[] {
	const rows: Row[] = [];
	rows.push(...prose('Choose the edition to play. Custom lets you make your own from any of them.', 'dim'));
	rows.push(tagsRow('tags', [
		...Object.values(G.SCRIPTS).map((sc) => ({ label: sc.name, on: ui.scriptId === sc.id, act: () => { ui.scriptId = sc.id; render(); } })),
		{ label: 'Custom', on: ui.scriptId === 'custom', act: startCustom }
	]));
	rows.push(...customPicker(), blank());
	rows.push(onward('Next: the players', () => { ui.setup = 'players'; render(); }));
	return rows;
}

/** The second page: the players' names, round the table from the Storyteller's left. */
function playersPage(): Row[] {
	const rows: Row[] = [...pageHead('The players', ['The script', () => { ui.setup = 'script'; render(); }])];
	rows.push(...prose('Picture yourself at the table: name the players clockwise, starting from the one on your left. 5 to 15 players.', 'dim'));
	const names = ui.names.split('\n').map((x) => x.trim()).filter(Boolean);
	names.forEach((nm, i) => rows.push(listRow((i + 1) + '. ' + nm, undefined, [
		...(i ? [btn('Up', () => { const n = [...names]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; ui.names = n.join('\n'); render(); }, { width: 6, style: 'quiet' })] : []),
		btn('x', () => { ui.names = names.filter((_, k) => k !== i).join('\n'); render(); }, { width: 5, style: 'quiet' })
	])));
	rows.push(field('names', 'Add a player', '', (v) => { const add = v.split(',').map((x) => x.trim()).filter(Boolean); ui.names = [...names, ...add].join('\n'); render(); }, 14, 'tap to type a name'));
	rows.push(...messageRows());
	const n = names.length;
	rows.push(onward(n < 5 ? `Need ${5 - n} more` : n > 15 ? 'Too many (15 at most)' : 'Next: the characters', () => {
		if (act({ type: 'create', names, scriptId: ui.scriptId === 'custom' ? G.customScriptId(ui.customIds) : ui.scriptId })) { ui.setup = 'characters'; render(); }
	}, n < 5 || n > 15));
	return rows;
}

/** Custom: it starts as a copy of the script that was chosen, to change from there. */
function startCustom() {
	const from = G.SCRIPTS[ui.scriptId];
	if (!ui.customIds.length && from) ui.customIds = from.characters.map((c) => c.id);
	ui.scriptId = 'custom';
	render();
}

/**
 * Building a custom script: start from one of the standard scripts (or nothing), then
 * take characters off and put others on, a team at a time. Gold ones the app runs;
 * the rest you resolve by hand.
 */
function customPicker(): Row[] {
	if (ui.scriptId !== 'custom') return [];
	const teams: [string, G.Team][] = [['Townsfolk', 'townsfolk'], ['Outsiders', 'outsider'], ['Minions', 'minion'], ['Demons', 'demon']];
	const on = new Set(ui.customIds);
	const toggle = (id: CharacterId) => { ui.customIds = on.has(id) ? ui.customIds.filter((x) => x !== id) : [...ui.customIds, id]; render(); };
	const rows: Row[] = [rubric('Custom script'), ...prose('Start from a script, then change it.', 'dim'),
		buttonBlock([...Object.values(G.SCRIPTS).map((sc) => btn(sc.name, () => { ui.customIds = sc.characters.map((c) => c.id); render(); })),
			btn('Empty', () => { ui.customIds = []; render(); }, { style: 'quiet' })])];
	const count = (t: G.Team) => ui.customIds.filter((id) => G.CATALOG.find((c) => c.id === id)?.team === t).length;
	rows.push(...prose(`${ui.customIds.length} characters: ${teams.map(([l, t]) => `${count(t)} ${l}`).join(', ')}. Gold ones have their rules built in.`, 'dim'));
	// One team at a time: what is on the script (tap to take off), then what could be added.
	const team = ui.customTeam;
	rows.push(endPanel(), tabStrip(teams.map(([l, t]) => ({ label: `${l.slice(0, 5)} ${count(t)}`, on: team === t, act: () => { ui.customTeam = t; render(); } }))));
	const of = G.CATALOG.filter((c) => c.team === team);
	rows.push(rubric('On the script: tap to take off'));
	const mine = of.filter((c) => on.has(c.id));
	rows.push(...(mine.length ? [buttonBlock(mine.map((c) => btn(c.name, () => toggle(c.id), { style: 'on' })))] : prose('None yet.', 'dim')));
	rows.push(rubric('Add'));
	rows.push(buttonBlock(of.filter((c) => !on.has(c.id)).map((c) => btn(c.name, () => toggle(c.id), { style: G.isModelled(c.id) ? 'primary' : undefined }))));
	rows.push(endPanel());
	return rows;
}

function art(): Row[] {
	return [titleRow(), row(txt(center('Blood on the Clocktower', COLS), 'rubric')), row(txt(center('a Storyteller’s companion', COLS), 'dim'))];
}

function escapeHtml(s: string) {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function draftCounts(d: Draft) {
	const sc = script();
	const have = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
	for (const c of d.selected) have[G.charDef(sc, c).team as keyof typeof have]++;
	const options = G.allowedCompositions(sc, state.seats.length, d.selected);
	const off = (c: typeof have) => Math.abs(c.townsfolk - have.townsfolk) + Math.abs(c.outsider - have.outsider) + Math.abs(c.minion - have.minion) + Math.abs(c.demon - have.demon);
	const want = options.reduce((a, b) => (off(b) < off(a) ? b : a));
	return { want, have };
}

/** The Marionette always sits beside the Demon: whatever moves, it follows. */
function keepMarionette(d: Draft) {
	const sc = script();
	d.placed = G.seatMarionette(d.placed, state.order.length ? state.order : state.seats.map((x) => x.id), (c) => G.charDef(sc, c!).team === 'demon');
}

function tapDraftSeat(id: SeatId) {
	const d = flow().draft!;
	if (ui.picks.length === 1 && ui.picks[0] !== id) {
		// Two seats: swap their tokens.
		const a = ui.picks[0];
		[d.placed[a], d.placed[id]] = [d.placed[id], d.placed[a]];
		keepMarionette(d);
		ui.picks = [];
	} else {
		ui.picks = ui.picks[0] === id ? [] : [id];
	}
	save();
	render();
}

function tapDraftCharacter(c: CharacterId) {
	const d = flow().draft!;
	const seat = ui.picks[0];
	if (seat !== undefined) {
		// Put this token on the chosen seat (taking it off anyone else).
		if (!d.selected.includes(c)) d.selected.push(c);
		d.placed = d.placed.map((p) => (p === c ? null : p));
		const old = d.placed[seat];
		d.placed[seat] = c;
		if (old && !d.placed.includes(old)) d.selected = d.selected.filter((x) => x !== old);
		ui.picks = [];
	} else if (d.selected.includes(c)) {
		d.selected = d.selected.filter((x) => x !== c);
		d.placed = d.placed.map((p) => (p === c ? null : p));
	} else {
		d.selected.push(c);
	}
	if (!d.selected.includes('drunk')) d.drunkBelieves = null;
	if (d.drunkBelieves && d.selected.includes(d.drunkBelieves)) d.drunkBelieves = null;
	if (!d.selected.includes('marionette') || (d.marionetteBelieves && d.selected.includes(d.marionetteBelieves))) d.marionetteBelieves = null;
	d.bluffs = d.bluffs.filter((b) => !d.selected.includes(b));
	keepMarionette(d);
	save();
	render();
}

function randomDraft() {
	const deal = G.randomDeal(script(), state.seats.length, ++ui.seed);
	flow().draft = {
		selected: [...deal.characters],
		placed: [...deal.characters],
		drunkBelieves: deal.drunkBelieves ?? null,
		marionetteBelieves: deal.marionetteBelieves ?? null,
		evilTwin: deal.evilTwin ?? null,
		redHerring: deal.redHerring ?? null,
		bluffs: [...deal.bluffs]
	};
	ui.picks = [];
	save();
	render();
}

function shuffleDraft() {
	const d = flow().draft!;
	const rand = G.rng(++ui.seed);
	const a = [...d.selected];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	d.placed = state.seats.map((_, i) => a[i] ?? null);
	keepMarionette(d);
	d.redHerring = null;
	save();
	render();
}

/** While setting up a village game: the code to join with, and who has. */
function joiningRows(): Row[] {
	if (!link || !village) return [];
	const linked = new Set(Object.values(claims()));
	const phoneless = state.order.filter((id) => !linked.has(id)).map(name);
	return [
		rubric('The Room'),
		roomCodeRow(link.room),
		...prose(`Joining late? Player, type ${link.room} and the same name as their seat.`, 'dim'),
		...prose(phoneless.length ? `Without a phone (you run their turns): ${phoneless.join(', ')}` : 'Everyone is on their phone.', phoneless.length ? 'gold' : 'good'),
		...buttonRows([btn('Code, QR and seats', () => { if (villageGame()) ui.drawer = 'phones'; else ui.tab = 'phones'; render(); }, { style: 'quiet' })]),
		endPanel(), blank()
	];
}

/**
 * Setting the table once the seats exist, a page at a time: the characters (and what the Drunk and
 * the rest believe, and the Demon's bluffs), then the seats, then begin. The Fabled are a page aside.
 * `back` is the way off the first page: to the names, or the village's lobby.
 */
function draftScreen(back: [string, () => void]): Row[] {
	if (ui.setup === 'seats') return draftSeats();
	if (ui.setup === 'fabled') return fabledPage();
	return draftCharacters(back);
}

function draftCharacters(back: [string, () => void]): Row[] {
	const d = flow().draft!;
	const sc = script();
	const n = state.seats.length;
	const { want, have } = draftCounts(d);
	const rows: Row[] = [...pageHead('The characters', back), ...joiningRows()];
	const count = (label: string, k: keyof typeof want) =>
		[txt(`${label} `), txt(`${have[k]}/${want[k]}`, have[k] === want[k] ? 'good' : 'evil'), txt('  ')];
	rows.push(...prose(`${n} players. Choose who is in play, or take a random set.`, 'dim'));
	rows.push(row(...count('Town', 'townsfolk'), ...count('Out', 'outsider'), ...count('Min', 'minion'), ...count('Dem', 'demon')));
	const teams: [string, G.Team][] = [['Townsfolk', 'townsfolk'], ['Outsiders', 'outsider'], ['Minions', 'minion'], ['Demon', 'demon']];
	for (const [label, team] of teams) {
		rows.push(row(txt(label, 'dim')));
		rows.push(...buttonRows(G.charactersOfTeam(sc, team).map((c) =>
			btn(c.name, () => tapDraftCharacter(c.id), { style: d.selected.includes(c.id) ? 'on' : undefined }))));
	}
	rows.push(...buttonRows([btn('Random set', randomDraft), btn('Clear', () => { flow().draft = emptyDraft(); save(); render(); }, { style: 'quiet' }), btn('What they do', () => { ui.reading = true; render(); }, { style: 'quiet' })]));

	if (d.selected.includes('drunk')) {
		rows.push(blank(), rubric('The Drunk thinks they are'));
		rows.push(...buttonRows(G.charactersOfTeam(sc, 'townsfolk').filter((c) => !d.selected.includes(c.id)).map((c) =>
			btn(c.name, () => { d.drunkBelieves = c.id; save(); render(); }, { style: d.drunkBelieves === c.id ? 'on' : undefined }))));
	}
	if (d.selected.includes('marionette')) {
		rows.push(blank(), rubric('The Marionette thinks they are'));
		rows.push(...prose('They sit beside the Demon, and wake as this good character, whose ability never works. The Demon learns who they are.', 'dim'));
		rows.push(...buttonRows(sc.characters.filter((c) => (c.team === 'townsfolk' || c.team === 'outsider') && !d.selected.includes(c.id) && c.id !== d.drunkBelieves).map((c) =>
			btn(c.name, () => { d.marionetteBelieves = c.id; save(); render(); }, { style: d.marionetteBelieves === c.id ? 'on' : undefined }))));
	}
	if (d.selected.includes('lunatic')) {
		rows.push(blank(), rubric('The Lunatic thinks they are'));
		rows.push(...buttonRows(G.charactersOfTeam(sc, 'demon').map((c) =>
			btn(c.name, () => { d.lunaticBelieves = c.id; save(); render(); }, { style: (d.lunaticBelieves ?? d.selected.find((x) => G.charDef(sc, x).team === 'demon')) === c.id ? 'on' : undefined }))));
	}
	const fab = d.fabled ?? [];
	rows.push(blank(), rubric('Fabled'));
	rows.push(...prose(fab.length ? `In play: ${fab.map((f) => G.FABLED.find((x) => x.id === f.id)?.name ?? f.id).join(', ')}.` : 'None: they are optional rule changes for special games.', 'dim'));
	rows.push(...buttonRows([btn('The Fabled', () => { ui.setup = 'fabled'; render(); }, { style: 'quiet' })]));
	rows.push(blank(), ...messageRows());
	const ready = have.townsfolk === want.townsfolk && have.outsider === want.outsider && have.minion === want.minion && have.demon === want.demon;
	rows.push(onward(ready ? 'Next: the seats' : 'Next: the seats (counts not yet right)', () => {
		// The Demon's bluffs start as a random three (changed on the seats page if wanted).
		if (!d.bluffs.length && (G.evilLearnEachOther(n) || fab.some((x) => x.id === 'toymaker'))) {
			const rand = G.rng(++ui.seed);
			d.bluffs = sc.characters.filter((c) => G.teamAlignment(c.team) === 'good' && !d.selected.includes(c.id) && c.id !== d.drunkBelieves && c.id !== d.marionetteBelieves).map((c) => c.id).sort(() => rand() - 0.5).slice(0, 3);
			save();
		}
		ui.setup = 'seats'; ui.message = ''; render();
	}, d.selected.length !== n));
	return rows;
}

function draftSeats(): Row[] {
	const d = flow().draft!;
	const sc = script();
	const n = state.seats.length;
	const rows: Row[] = [navRow('The characters', () => { ui.setup = 'characters'; clearPicks(); render(); })];
	rows.push(...table((id) => {
		const c = d.placed[id];
		const flags: Seg[] = [];
		if (c === 'drunk') flags.push(txt('D', 'drunk'));
		if (c === 'marionette') flags.push(txt('M', 'evil'));
		if (d.redHerring === id) flags.push(txt('R', 'gold'));
		const shown = c === 'drunk' ? d.drunkBelieves ?? 'drunk' : c === 'marionette' ? d.marionetteBelieves ?? 'marionette' : c;
		return { flags, role: c ? charName(shown) : '?', roleTone: c === 'drunk' ? 'drunk' : c === 'marionette' ? 'evil' : toneFor(c), style: ui.picks.includes(id) ? 'on' : undefined };
	}, [], 'The seats'));
	rows.push(...prose(ui.picks.length ? `${name(ui.picks[0])}: tap another seat to swap the two, or a character below.` : 'Shuffle the characters onto the seats, or place them by hand: tap a seat, then a character. Tap two seats to swap.', 'dim'));
	rows.push(...buttonRows([btn('Shuffle onto seats', shuffleDraft, { disabled: d.selected.length !== n, style: d.placed.some((c) => !c) ? 'primary' : undefined })]));
	const unplaced = d.selected.filter((c) => !d.placed.includes(c));
	if (unplaced.length) {
		rows.push(...prose('Not yet seated:', 'gold'));
		rows.push(...buttonRows(unplaced.map((c) => btn(charName(c), () => tapDraftCharacter(c)))));
	}
	if (d.selected.includes('evil-twin')) {
		rows.push(blank(), rubric('The Evil Twin\u2019s twin'));
		const good = state.seats.filter((x) => d.placed[x.id] && G.teamAlignment(G.charDef(sc, d.placed[x.id]!).team) === 'good');
		rows.push(...buttonRows(good.map((x) => btn(x.name, () => { d.evilTwin = x.id; save(); render(); }, { style: d.evilTwin === x.id ? 'on' : undefined }))));
	}
	if (d.selected.includes('fortune-teller') || d.drunkBelieves === 'fortune-teller' || d.marionetteBelieves === 'fortune-teller') {
		rows.push(blank(), rubric('The red herring'));
		rows.push(...prose('A good player the Fortune Teller sees as the Demon.', 'dim'));
		const good = state.seats.filter((x) => d.placed[x.id] && G.teamAlignment(G.charDef(sc, d.placed[x.id]!).team) === 'good');
		rows.push(...buttonRows(good.map((x) =>
			btn(x.name, () => { d.redHerring = x.id; save(); render(); }, { style: d.redHerring === x.id ? 'on' : undefined }))));
	}

	const fab = d.fabled ?? [];
	if (G.evilLearnEachOther(n) || fab.some((x) => x.id === 'toymaker')) {
		const pool = sc.characters.filter((c) => G.teamAlignment(c.team) === 'good' && !d.selected.includes(c.id));
		// Three, unless a small script leaves fewer good characters out of play.
		rows.push(blank(), rubric(`The Demon's bluffs ${d.bluffs.length}/${Math.min(3, pool.length)}`));
		rows.push(...prose('Good characters not in play, shown to the Demon on the first night.', 'dim'));
		rows.push(...buttonRows(pool.map((c) => btn(c.name, () => {
			d.bluffs = d.bluffs.includes(c.id) ? d.bluffs.filter((b) => b !== c.id) : [...d.bluffs, c.id].slice(-3);
			save();
			render();
		}, { style: d.bluffs.includes(c.id) ? 'on' : undefined }))));
		rows.push(...buttonRows([btn('Random bluffs', () => {
			const rand = G.rng(++ui.seed);
			const p = pool.map((c) => c.id).filter((c) => c !== d.drunkBelieves && c !== d.marionetteBelieves);
			d.bluffs = p.sort(() => rand() - 0.5).slice(0, 3);
			save();
			render();
		})]));
	}
	// A refusal that wants something chosen (the bluffs, a red herring) is said here too.
	rows.push(blank(), ...messageRows(), ...(ui.question && !ui.message ? [...prose(ui.question, 'evil'), blank()] : []));
	const assign = (allowNonstandard: boolean): Command => ({
		type: 'assign',
		characters: d.placed.map((c) => c ?? ''),
		drunkBelieves: d.drunkBelieves ?? undefined,
		marionetteBelieves: d.selected.includes('marionette') ? d.marionetteBelieves ?? undefined : undefined,
		lunaticBelieves: d.selected.includes('lunatic') ? d.lunaticBelieves ?? undefined : undefined,
		evilTwin: d.selected.includes('evil-twin') ? d.evilTwin ?? undefined : undefined,
		...(d.fabled?.length ? { fabled: d.fabled } : {}),
		redHerring: d.redHerring,
		bluffs: d.bluffs,
		allowNonstandard
	});
	const begin = (ns: boolean) => {
		if (d.placed.some((c) => !c)) {
			ui.message = 'Every seat needs a character.';
			return render();
		}
		ui.nonstandard = !actAll([assign(ns), { type: 'begin' }]) && /expects/.test(ui.message);
		render();
	};
	if (ui.nonstandard) rows.push(...buttonRows([btn('Begin anyway', () => begin(true), { style: 'danger' })]));
	rows.push(onward('Begin the first night', () => begin(false), d.placed.some((c) => !c)));
	return rows;
}

/** The Fabled, a page aside: rule changes for special games, each with what it does. */
function fabledPage(): Row[] {
	const d = flow().draft!;
	const sc = script();
	const fab = d.fabled ?? [];
	const rows: Row[] = [...pageHead('The Fabled', ['The characters', () => { ui.setup = 'characters'; render(); }])];
	rows.push(...prose('Fabled are not players: they are rules the Storyteller announces for the whole game, to suit a new group, a big table or a strange script. Most games use none. Those marked kept are run by this book; the rest are reminders for you.', 'dim'));
	for (const f of G.FABLED) {
		const on = fab.some((x) => x.id === f.id);
		rows.push(blank(), buttonBlock([btn(f.name + (f.engine === 'rules' ? '  (kept)' : ''), () => {
			d.fabled = on ? fab.filter((x) => x.id !== f.id) : [...fab, { id: f.id }];
			save();
			render();
		}, { style: on ? 'on' : undefined })]), ...prose(f.ability, 'dim'));
		if (f.id === 'storm-catcher' && on) {
			const storm = fab.find((x) => x.id === 'storm-catcher')!;
			rows.push(...prose('The Storm Catcher names a good character:', 'gold'));
			rows.push(...buttonRows(sc.characters.filter((c) => G.teamAlignment(c.team) === 'good').map((c) => btn(c.name, () => { storm.character = c.id; save(); render(); }, { style: storm.character === c.id ? 'on' : undefined }))));
		}
	}
	rows.push(blank(), onward('Back to the characters', () => { ui.setup = 'characters'; render(); }));
	return rows;
}

/** The book of characters: every character of the script (and the Fabled), and what each does. */
function readingPage(): Row[] {
	const sc = script();
	const scName = state.seats.length ? sc.name : G.SCRIPTS[ui.scriptId]?.name ?? 'Custom';
	const chars = state.seats.length ? sc.characters : (G.SCRIPTS[ui.scriptId]?.characters ?? G.CATALOG.filter((c) => ui.customIds.includes(c.id)));
	const rows: Row[] = [...pageHead('The characters', ['Back', () => { ui.reading = false; render(); }])];
	rows.push(...prose(scName + '. What each character does.', 'dim'));
	const teams: [string, G.Team][] = [['Townsfolk', 'townsfolk'], ['Outsiders', 'outsider'], ['Minions', 'minion'], ['Demons', 'demon'], ['Travellers', 'traveller']];
	for (const [label, team] of teams) {
		const of = chars.filter((c) => c.team === team);
		if (!of.length) continue;
		rows.push(blank(), rubric(label));
		for (const c of of) rows.push(row(txt(c.name, toneFor(c.id))), ...prose(c.ability, 'dim'));
	}
	rows.push(blank(), onward('Back', () => { ui.reading = false; render(); }));
	return rows;
}

/** The grimoire's settings, each thing a page of its own: the clocks, the phones, the characters, starting again, home. */
function settingsScreen(): Row[] {
	const rows: Row[] = [rubric('Settings')];
	const to = (t: Tab) => () => { if (villageGame() || ui.drawer) ui.drawer = t; else ui.tab = t; render(); };
	const entry = (label: string, sub: string, act: () => void, style?: Button['style']) => rows.push(buttonBlock([btn(label, act, { width: INNER, style })]), ...prose(sub, 'dim'), blank());
	entry('The clocks', 'How long the discussion, nominations and speeches run.', to('options'));
	entry(link ? 'Players\u2019 phones (room open)' : 'Players\u2019 phones', 'Link each player\u2019s phone, and the village.', to('phones'));
	entry('The characters', 'What each character of this script does.', () => { ui.reading = true; render(); });
	const names = state.seats.map((x) => x.name);
	const sure = (k: typeof ui.confirmRestart, label: string, sub: string, run: () => void) =>
		entry(ui.confirmRestart === k ? label + ': sure? This game ends' : label, ui.confirmRestart === k ? 'Tap again to start again.' : sub, () => { if (ui.confirmRestart === k) { ui.confirmRestart = ''; run(); } else { ui.confirmRestart = k; render(); } }, ui.confirmRestart === k ? 'danger' : undefined);
	if (names.length) sure('same', 'Start again, same players', 'Back to choosing the characters; the names and seats stay.', () => {
		const scriptId = state.scriptId;
		ui.names = names.join('\n');
		newGame();
		if (act({ type: 'create', names, scriptId })) { ui.setup = 'characters'; render(); }
	});
	sure('new', 'A new game', 'Back to the script and the names.', () => { if (names.length) ui.names = names.join('\n'); ui.setup = 'script'; newGame(); });
	entry('Home', 'Close the grimoire; the game is kept for later.', () => go(''), 'quiet');
	return rows;
}

// ---- night ----------------------------------------------------------------------------
//
// Two faces. The Storyteller's view names who to rouse next and, for the
// roles that learn something, offers answers to choose from. Then the book
// is handed to the player, who sees only their own pages (see "the player's
// pages" below) and ends on a page telling them to hand it back.

function evilTeam() {
	const demon = state.seats.filter((s) => G.teamOf(state, s.character) === 'demon');
	const minions = state.seats.filter((s) => G.teamOf(state, s.character) === 'minion');
	return { demon, minions };
}

function flagsText(id: SeatId): string[] {
	const f: string[] = [];
	const s = state.seats[id];
	if (s.character === 'drunk') f.push(`Actually the Drunk (thinks they are the ${charName(s.believes)}).`);
	if (G.isPoisoned(state, id)) f.push('Poisoned.');
	if (state.redHerring === id) f.push('The red herring.');
	return f;
}

const { playerPicks, PICK_PROMPT, pickAllowed } = V;

/** Information roles where the Storyteller settles the answer before handing the phone over. */
const answerFirst = (kind: string, seat: SeatId | null) => G.stepAction(kind) === 'tell' && playerPicks(kind, state, seat) === 0;

/** The character a step is about: the evil-team and reveal steps are about the player's own. */
const stepRole = (kind: string, seat: SeatId | null) => V.stepRole(state, kind, seat);

/** What a wake is for, when it is not plainly the character's ability. */
const WAKE_NOTE: Record<string, string> = {
	[G.REVEAL]: ' (sees their character)',
	[G.MINION_INFO]: ' (learns their Demon)',
	[G.DEMON_INFO]: ' (learns Minions and bluffs)',
	[G.GODFATHER_INFO]: ' (learns which Outsiders are in play)',
	[G.EXORCISED]: ' (learns who the Exorcist is; does not act tonight)',
	[G.LUNATIC_INFO]: ' (thinks they are the Demon)',
	[G.LUNATIC]: ' (the Lunatic, choosing as the Demon)',
	[G.NEW_DEMON]: ' (is now the Demon)'
};

function groupLabel(kind: string): string {
	const { demon, minions } = evilTeam();
	if (kind === G.MINION_INFO) return `The Minions: ${minions.map((m) => m.name).join(', ')}`;
	if (kind === G.DEMON_INFO) return `The Demon: ${demon.map((d) => d.name).join(', ')}`;
	return '';
}

function nightPanel(): Row[] {
	const rows: Row[] = [];
	const steps = G.nightSteps(state);
	const step = G.nextStep(state);
	// Progress through tonight's wakings, shown inside the panel below.
	const progress = row(txt(center(steps.map((s) => (s.done ? '·' : s.id === step?.id ? '»' : 'o')).join(' '), INNER), 'dim', 'art'));
	if (ui.decision) return [...rows, ...decisionRows()];
	if (!step) {
		const deaths = state.night!.deaths;
		rows.push(rubric('Dawn'), progress);
		rows.push(...prose(deaths.length ? `Died in the night: ${deaths.map(name).join(', ')}.` : 'Nobody died in the night.'));
		rows.push(...buttonRows([btn('Start the day', () => act({ type: 'end-night' }), { style: 'primary' })]));
		return rows;
	}
	const kind = step.kind;
	const who = step.seat === null ? null : state.seats[step.seat];
	rows.push(rubric('Next to wake'), progress);
rows.push(...prose(who ? `${who.name}, the ${charName(stepRole(kind, who.id))}${WAKE_NOTE[kind] ?? ''}` : groupLabel(kind), 'gold'));
	if (who) {
		for (const f of flagsText(who.id)) rows.push(...prose(f, 'evil'));
		rows.push(...prose(G.charDef(script(), stepRole(kind, who.id)).ability, 'dim'));
		if (kind === G.LUNATIC_INFO) rows.push(...prose('The Lunatic: wake them as the Demon. Point at any players as their Minions and give three bluffs; the real Demon learns who the Lunatic is and what they choose each night.', 'evil'));
		if (kind === G.LUNATIC) rows.push(...prose('The Lunatic: play along, but their choice kills no one. The real Demon learns whom they chose.', 'evil'));
		if (kind === 'gossip') rows.push(...prose('The Gossip does not wake. Their statement today was true: you choose who dies.', 'evil'));
		if (kind === 'moonchild') rows.push(...prose('The Moonchild chose earlier: if that player is good, they die now.', 'dim'));
		if (kind === 'spy' && G.isDroisoned(state, who.id)) rows.push(...prose('The Spy is poisoned, so what they see need not be true. The phone shows the true grimoire: show it, or tell them otherwise in person.', 'evil'));
	} else {
		rows.push(...prose(kind === G.MINION_INFO ? 'They wake together and learn who their Demon is.' : 'They learn their Minions, and three characters not in play.', 'dim'));
	}
	rows.push(blank());

	const hand = (page: Show['page'], label = 'Hand them the phone') =>
		btn(label, () => { ui.show = { step: step.id, page, picks: [], turn: 0 }; render(); }, { style: 'primary' });
	const need = playerPicks(kind, state, step.seat);
	const action = G.stepAction(kind);

	// Their own phone, if they have one linked.
	const phone = step.seat !== null ? peerOfSeat(step.seat) : null;
	if (ui.remote && ui.remote.wakeId === V.wakeFor(state, step).id) {
		rows.push(...prose(ui.remote.answered ? `Waiting for ${who?.name} to finish reading...` : `Sent to ${who?.name}'s phone. Waiting for them...`, 'gold'));
		rows.push(...buttonRows([btn('Take it back', () => { if (phone) sendTo(phone, { t: 'sleep' }); ui.remote = null; render(); }, { style: 'quiet' })]));
		return rows;
	}
	const sendWake = (withAnswer: boolean) => btn(`Send to ${who?.name}'s phone`, () => wakePhone(step, phone!, withAnswer), { style: 'primary' });
	if (phone && canSendFirst(step)) rows.push(...buttonRows([sendWake(false)]));

	if (action === 'choose') {
		rows.push(...chooseRows(kind, step.seat, hand('who')));
	} else if (action === 'acknowledge') {
		rows.push(...buttonRows([hand('who'), btn('Done without the phone', () => act({ type: 'acknowledge' }), { style: 'quiet' })]));
	} else if (need && ui.picks.length < need) {
		rows.push(...buttonRows([hand('who')]));
		rows.push(...prose(`Or tap the ${need === 2 ? 'two players' : 'player'} they point at on the table.`, 'dim'));
	} else {
		rows.push(...tellRows(kind, step.seat!));
		const info = ui.draftInfo;
		// A falsehood to a hale player waits until the Storyteller insists.
		const allowed = info && (G.judgeInfo(state, step.seat!, kind, info).truthful || G.isDroisoned(state, step.seat!) || ui.draftOverride);
		if (info && allowed) {
			if (phone) rows.push(...buttonRows([sendWake(true)]));
			rows.push(...buttonRows([
				btn(need ? 'Show them the answer' : 'Hand them the phone', () => { ui.show = { step: step.id, page: need ? 'info' : 'who', picks: [...ui.picks], turn: 0 }; render(); }, { style: 'primary' }),
				btn('Confirm without showing', () => act({ type: 'tell', info, override: ui.draftOverride }), { style: 'quiet' })
			]));
		}
	}
	const later = steps.filter((s) => !s.done && s.id !== step.id).map((s) => (s.seat === null ? groupLabel(s.kind).split(':')[0] : `${name(s.seat)} (${charName(stepRole(s.kind, s.seat))})`));
	const quiet: Button[] = [btn('Skip', () => act({ type: 'skip', reason: 'Storyteller skipped' }), { style: 'quiet' })];
	if (later.length) quiet.push(btn(ui.showLater ? 'Hide the rest' : `Later tonight (${later.length})`, () => { ui.showLater = !ui.showLater; render(); }, { style: ui.showLater ? 'on' : 'quiet' }));
	rows.push(blank(), ...buttonRows(quiet));
	if (later.length && ui.showLater) rows.push(...prose(`Then: ${later.join(', ')}.`, 'dim'));
	rows.push(...storytellerTools());
	return rows;
}

/** Send a night step to the player's own phone; in the village, the Storyteller goes to them. */
function wakePhone(step: G.NightStep, phone: string, withAnswer: boolean) {
	const w = V.wakeFor(state, step, withAnswer ? ui.draftInfo : null);
	ui.remote = { wakeId: w.id, seat: step.seat!, answered: withAnswer && !!playerPicks(step.kind, state, step.seat) };
	sendTo(phone, { t: 'wake', wake: w });
	village?.visit(phone);
	render();
}

/** Can this step go to the phone before the Storyteller has decided anything? (Not an answer still to be chosen.) */
function canSendFirst(step: G.NightStep): boolean {
	const need = playerPicks(step.kind, state, step.seat);
	return step.kind !== 'gossip' && !(G.stepAction(step.kind) === 'tell' && (!need || ui.picks.length >= need));
}

/**
 * A choosing step on the Storyteller's screen: the players they point at
 * (one, two, three), a character (the Gambler's guess, the Courtier), or no one.
 */
function chooseRows(kind: string, seat: SeatId | null, handOver: Button): Row[] {
	const rows: Row[] = [];
	const spec = G.pickSpec(state, kind, seat);
	const picks = ui.picks;
	const storytellers = kind === 'gossip';
	if (spec.count) {
		if (!storytellers) rows.push(...buttonRows([handOver]));
		rows.push(...prose(storytellers ? 'Tap who dies on the table:' : spec.count === 1 ? 'Or tap their choice on the table:' : `Or tap their ${spec.count} choices on the table (${picks.length}/${spec.count}):`, 'dim'));
		const bad = picks.filter((t) => !V.pickAllowed(state, kind, seat, t));
		if (bad.length) rows.push(...prose(`They cannot choose ${bad.map(name).join(', ')}.`, 'evil'));
	}
	if (spec.character) {
		rows.push(...prose(spec.character === 'instead' ? 'The character they choose:' : 'Their guess:', 'dim'));
		rows.push(...buttonRows(script().characters.map((c) =>
			btn(c.name, () => { ui.charPick = ui.charPick === c.id ? null : c.id; render(); }, { style: ui.charPick === c.id ? 'on' : undefined }))));
	}
	const ready = picks.length === spec.count && (!spec.character || ui.charPick !== null);
	const label = [...picks.map(name), ...(ui.charPick ? [charName(ui.charPick)] : [])].join(', ');
	rows.push(...buttonRows([
		btn(ready ? `Confirm: ${label}` : 'Confirm choice', () => act({ type: 'choose', targets: [...picks], ...(ui.charPick ? { character: ui.charPick } : {}) }), { disabled: !ready }),
		...(spec.noneAllowed ? [btn('They choose no one', () => act({ type: 'choose', none: true }), { style: 'quiet' })] : [])
	]));
	return rows;
}

const LEAN_LABEL: Record<Lean, string> = { neutral: 'Neutral', good: 'Helps good', evil: 'Helps evil' };

/** The Storyteller choosing what an information role learns. */
function tellRows(kind: string, to: SeatId): Row[] {
	const rows: Row[] = [];
	const need = playerPicks(kind, state, to);
	if (need) rows.push(...prose(`They chose ${ui.picks.map(name).join(' and ')}.`, 'gold'), blank());
	const droisoned = G.isDroisoned(state, to);
	rows.push(...prose(droisoned
		? 'Drunk or poisoned: you may tell them anything, true or false.'
		: 'Sober and healthy: they must be told the truth.', droisoned ? 'evil' : 'dim'));

	if (!ui.compose) {
		for (const c of G.infoCandidates(state, kind, to, ui.picks)) {
			const on = ui.draftInfo !== null && JSON.stringify(ui.draftInfo) === JSON.stringify(c.info);
			rows.push(blank());
			rows.push({ segs: [
				btn(`${LEAN_LABEL[c.lean]}${c.truthful ? '' : ', false'}`, () => { ui.draftInfo = c.info; ui.draftOverride = false; render(); }, { style: on ? 'on' : c.truthful ? undefined : 'danger' }),
				txt(' '), txt(c.truthful ? 'true' : 'FALSE', c.truthful ? 'good' : 'evil')
			] });
			rows.push(...prose(infoText(c.info, kind), 'gold'));
			rows.push(...prose(c.why, 'dim'));
		}
		rows.push(blank(), ...buttonRows([btn('Write my own', () => { ui.compose = true; if (!need) ui.picks = []; ui.draftInfo = null; render(); }, { style: 'quiet' })]));
	} else {
		rows.push(blank(), ...composeRows(kind, to));
		rows.push(...buttonRows([btn('Back to suggestions', () => { ui.compose = false; ui.draftInfo = null; render(); }, { style: 'quiet' })]));
	}

	const info = ui.draftInfo;
	if (info) {
		const v = G.judgeInfo(state, to, kind, info);
		rows.push(blank(), rubric('To tell'), ...prose(infoText(info, kind), 'gold'));
		rows.push(...prose(v.truthful ? 'This is true.' : `This is FALSE. ${v.reason}`, v.truthful ? 'good' : 'evil'));
		if (!v.truthful && !droisoned && !ui.draftOverride) {
			rows.push(...prose('They are healthy, so false information needs an override.', 'dim'));
			rows.push(...buttonRows([btn('Override: tell it', () => { ui.draftOverride = true; render(); }, { style: 'danger' })]));
		}
	}
	return rows;
}

/** Making an answer by hand: tap players, pick a character or number. */
function composeRows(kind: string, to: SeatId): Row[] {
	const rows: Row[] = [];
	const truthful = (info: Info) => G.judgeInfo(state, to, kind, info).truthful;
	const choose = (info: Info) => { ui.draftInfo = info; ui.draftOverride = false; render(); };
	const pick = (info: Info, label: string) =>
		btn(label, () => choose(info), { style: JSON.stringify(ui.draftInfo) === JSON.stringify(info) ? 'on' : truthful(info) ? 'primary' : undefined });

	if (kind === 'chef' || kind === 'empath') {
		const max = kind === 'empath' ? 2 : state.seats.filter((s) => s.alignment === 'evil').length;
		const nums: Button[] = [];
		for (let v = 0; v <= max; v++) nums.push(pick({ kind: 'number', value: v }, String(v)));
		rows.push(...prose('Gold numbers are true.', 'dim'), ...buttonRows(nums));
		return rows;
	}
	if (kind === 'chambermaid') {
		const [a, b] = ui.picks;
		rows.push(...prose('How many of the two woke tonight for their own ability? Gold is true.', 'dim'));
		rows.push(...buttonRows([0, 1, 2].map((v) => pick({ kind: 'woke', players: [a, b], value: v }, String(v)))));
		return rows;
	}
	if (kind === 'seamstress') {
		const [a, b] = ui.picks;
		if (a === undefined || b === undefined) return rows;
		rows.push(...buttonRows([true, false].map((yes) => pick({ kind: 'same', players: [a, b], yes }, yes ? 'Same team' : 'Different teams'))));
		return rows;
	}
	if (kind === 'dreamer') {
		// One good character, then one evil: tap a good one, then an evil one.
		const player = ui.picks[0];
		if (player === undefined) return rows;
		const good = script().characters.filter((c) => G.teamAlignment(c.team) === 'good');
		const evil = script().characters.filter((c) => G.teamAlignment(c.team) === 'evil');
		const g = ui.composeChar;
		rows.push(...prose(g ? `${name(player)} is the ${charName(g)} or... (an evil character; gold is true)` : `${name(player)}: first a good character`, 'dim'));
		if (!g) rows.push(...buttonRows(good.map((c) => btn(c.name, () => { ui.composeChar = c.id; render(); }))));
		else rows.push(...buttonRows(evil.map((c) => pick({ kind: 'dream', player, characters: [g, c.id] }, c.name))));
		return rows;
	}
	if (kind === 'godfather-info' || kind === 'godfather') {
		// Tap Outsiders on and off.
		const now = ui.draftInfo?.kind === 'characters' ? ui.draftInfo.characters : [];
		const flip = (c: CharacterId): Info => ({ kind: 'characters', characters: now.includes(c) ? now.filter((x) => x !== c) : [...now, c] });
		rows.push(...prose('Tap the Outsiders to show.', 'dim'));
		rows.push(...buttonRows(G.charactersOfTeam(script(), 'outsider').map((c) => btn(c.name, () => choose(flip(c.id)), { style: now.includes(c.id) ? 'on' : undefined }))));
		rows.push(...buttonRows([pick({ kind: 'characters', characters: [] }, 'No Outsiders')]));
		return rows;
	}
	if (kind === 'fortune-teller') {
		const [a, b] = ui.picks;
		rows.push(...buttonRows([true, false].map((yes) => pick({ kind: 'fortune', players: [a, b], yes }, yes ? 'Yes' : 'No'))));
		return rows;
	}
	const team = G.PAIR_ROLE_TEAM[kind];
	if (team) {
		const [a, b] = ui.picks;
		rows.push(...prose(a === undefined || b === undefined ? 'Tap the two players to show on the table.' : `Showing ${name(a)} and ${name(b)}. Now the ${team}:`, 'dim'));
		const opts = G.charactersOfTeam(script(), team).map((c) =>
			a !== undefined && b !== undefined ? pick({ kind: 'pair', players: [a, b], character: c.id }, c.name) : btn(c.name, () => {}, { disabled: true }));
		if (kind === 'librarian') opts.push(pick({ kind: 'none' }, 'No Outsiders'));
		rows.push(...buttonRows(opts));
		return rows;
	}
	const target = kind === 'undertaker' ? state.lastExecution?.seat : ui.picks[0];
	if (target === undefined) return rows;
	rows.push(...prose(`Show ${name(target)} as... (gold is true)`, 'dim'));
	rows.push(...buttonRows(script().characters.map((c) =>
		pick(kind === 'undertaker' ? { kind: 'character', character: c.id } : { kind: 'reveal', player: target, character: c.id }, c.name))));
	return rows;
}

function decisionRows(): Row[] {
	const p = ui.pending!;
	const resubmit = (patch: Record<string, unknown>) => act({ ...p, ...patch } as Command);
	const rows = [rubric('Your ruling'), ...prose(ui.question, 'gold'), blank()];
	const pick = ui.picks[0];
	switch (ui.decision) {
		case 'mayorRedirect':
			rows.push(...prose('Tap who dies instead, or let the Mayor die.', 'dim'));
			rows.push(...buttonRows([
				btn('The Mayor dies', () => resubmit({ mayorRedirect: null }), { style: 'danger' }),
				btn(pick === undefined ? 'Bounce to...' : `Bounce to ${name(pick)}`, () => resubmit({ mayorRedirect: pick }), { disabled: pick === undefined, style: 'primary' })
			]));
			break;
		case 'newDemon':
			rows.push(...prose('Tap the Minion who becomes the Imp.', 'dim'));
			rows.push(...buttonRows([btn(pick === undefined ? 'Choose...' : `${name(pick)} is the Imp`, () => resubmit({ newDemon: pick }), { disabled: pick === undefined, style: 'primary' })]));
			break;
		case 'drunk': {
			// The Sailor and their choice, or the Innkeeper's two: the Storyteller says which is drunk.
			const c = p as Extract<Command, { type: 'choose' }>;
			const step = G.nextStep(state);
			const targets = c.targets ?? (c.target !== undefined ? [c.target] : []);
			const options = step?.kind === 'sailor' && step.seat !== null ? [step.seat, ...targets] : targets;
			rows.push(...buttonRows([...new Set(options)].map((id) => btn(`${name(id)} is drunk`, () => resubmit({ drunk: id }), { style: 'primary' }))));
			break;
		}
		case 'regurgitate': {
			const step = G.nextStep(state);
			const last = state.effects.filter((e) => e.kind === 'chose-last' && e.by === step?.seat && e.role === 'shabaloth' && !state.seats[e.target].alive).map((e) => e.target);
			rows.push(...buttonRows([
				...last.map((id) => btn(`${name(id)} comes back`, () => resubmit({ regurgitate: id }), { style: 'primary' })),
				btn('No one comes back', () => resubmit({ regurgitate: null }))
			]));
			break;
		}
		case 'poisonNeighbour': {
			const c = p as Extract<Command, { type: 'choose' }>;
			const t = c.targets?.[0] ?? c.target!;
			const nb = G.livingNeighbours(state, t).filter((x) => G.teamOf(state, state.seats[x].character) === 'townsfolk');
			rows.push(...buttonRows(nb.map((id) => btn(`${name(id)} is poisoned`, () => resubmit({ poisonNeighbour: id }), { style: 'primary' }))));
			break;
		}
		case 'barista':
			rows.push(...buttonRows([btn('Sober and healthy', () => resubmit({ barista: 'sober' }), { style: 'primary' }), btn('Ability twice', () => resubmit({ barista: 'twice' }))]));
			break;
		case 'harlot':
			rows.push(...buttonRows([btn('They refuse', () => resubmit({ harlot: 'refused' })), btn('They show it', () => resubmit({ harlot: 'shown' })), btn('Both die', () => resubmit({ harlot: 'both-die' }), { style: 'danger' })]));
			break;
		case 'deviantFunny':
			rows.push(...buttonRows([btn('Funny: survives', () => resubmit({ deviantFunny: true }), { style: 'primary' }), btn('Not funny: exiled', () => resubmit({ deviantFunny: false }), { style: 'danger' })]));
			break;
		case 'executionSurvives':
			rows.push(...buttonRows([btn('They survive', () => resubmit({ executionSurvives: true }), { style: 'primary' }), btn('They die', () => resubmit({ executionSurvives: false }), { style: 'danger' })]));
			break;
		case 'nominatorIsTownsfolk':
			rows.push(...buttonRows([btn('Yes, executed', () => resubmit({ nominatorIsTownsfolk: true }), { style: 'danger' }), btn('No', () => resubmit({ nominatorIsTownsfolk: false }))]));
			break;
		case 'targetIsDemon':
			rows.push(...buttonRows([btn('Yes, they die', () => resubmit({ targetIsDemon: true }), { style: 'danger' }), btn('No', () => resubmit({ targetIsDemon: false }))]));
			break;
	}
	rows.push(...buttonRows([btn('Cancel', () => { ui.pending = null; ui.decision = null; clearPicks(); render(); }, { style: 'quiet' })]));
	return rows;
}

// ---- the player's pages -------------------------------------------------------------------
//
// When the Storyteller hands over their own phone: the wake from views.ts,
// drawn by wakepages.ts, the same pages a player's own phone would show.

interface Show {
	step: string;
	page: Page;
	picks: SeatId[];
	/** 0: the page naming who takes the phone; 1: their pages (and the hand-back page after them). */
	turn: number;
}

function showRows(): Row[] {
	const sh = ui.show!;
	const step = G.nextStep(state);
	if (!step || step.id !== sh.step) { ui.show = null; return []; }
	const w = V.wakeFor(state, step, ui.draftInfo);
	// First, whose turn it is; last, the phone back to the Storyteller.
	if (sh.turn === 0) return handOverRows(step.seat === null ? groupLabel(step.kind).split(':')[0] : name(step.seat), () => { sh.turn = 1; render(); });
	if (sh.page === 'done') return handBackRows(finishShow);
	return wakeRows(w, sh.page, sh.picks, {
		go: (page) => { sh.page = page; render(); },
		toggle: (id) => {
			if (sh.picks.includes(id)) sh.picks = sh.picks.filter((p) => p !== id);
			else { sh.picks.push(id); if (sh.picks.length > (w.pick?.count ?? 1)) sh.picks.shift(); }
			render();
		},
		confirm: () => { sh.page = nextPage(w, 'pick'); render(); },
		finish: finishShow,
		ending: 'hand-back',
		name,
		deadAtDusk: (id) => V.deadAtDusk(state, id)
	});
}

/** The phone is back with the Storyteller: record what happened. */
function finishShow() {
	const sh = ui.show!;
	ui.show = null;
	const step = G.nextStep(state);
	if (!step) return render();
	const action = G.stepAction(step.kind);
	if (action === 'choose') {
		// A character to go with it (the Gambler): the Storyteller asks and taps it.
		if (G.pickSpec(state, step.kind, step.seat).character) { ui.picks = [...sh.picks]; return render(); }
		return void act({ type: 'choose', targets: [...sh.picks] });
	}
	if (action === 'acknowledge') return void act({ type: 'acknowledge' });
	if (ui.draftInfo) return void act({ type: 'tell', info: ui.draftInfo, override: ui.draftOverride });
	// The Fortune Teller or Ravenkeeper has chosen; now the Storyteller settles the answer.
	ui.picks = [...sh.picks];
	ui.draftInfo = null;
	render();
}

// ---- day ------------------------------------------------------------------------------------

function timerRow(key: 'day' | 'nom' | 'speech', label: string): Row {
	return { segs: [txt(pad(label, INNER - 12), 'dim'), { t: pad('', 12), tone: 'gold', face: 'heading', data: { timer: key } }], cls: 'clock-row' };
}

function timerOf(key: 'day' | 'nom' | 'speech'): T.Timer | null {
	const f = flow();
	return key === 'day' ? f.dayTimer : key === 'nom' ? f.nomTimer : f.speech?.timer ?? null;
}

function setTimer(key: 'day' | 'nom' | 'speech', t: T.Timer) {
	const f = flow();
	if (key === 'day') f.dayTimer = t;
	else if (key === 'nom') f.nomTimer = t;
	else if (f.speech) f.speech.timer = t;
	save();
	render();
}

function timerControls(key: 'day' | 'nom' | 'speech'): Row[] {
	const t = timerOf(key)!;
	const now = Date.now();
	return buttonRows([
		btn(T.running(t) ? 'Pause' : 'Start', () => setTimer(key, T.toggle(timerOf(key)!, Date.now())), { style: T.running(t) ? undefined : 'primary' }),
		btn('Restart', () => setTimer(key, T.restart(timerOf(key)!, Date.now())), { style: 'quiet' }),
		btn('-30s', () => setTimer(key, T.extend(timerOf(key)!, -30_000, Date.now())), { style: 'quiet', disabled: T.remaining(t, now) === 0 }),
		btn('+30s', () => setTimer(key, T.extend(timerOf(key)!, 30_000, Date.now())), { style: 'quiet' })
	]);
}

function dayPanel(): Row[] {
	const day = state.day!;
	const f = flow();
	const alive = G.living(state).length;
	const needed = Math.ceil(alive / 2);
	const rows: Row[] = [];
	if (ui.decision) return decisionRows();

	const blockText = day.executed !== null
		? `${name(day.executed)} has been executed.`
		: day.block !== null ? `On the block: ${name(day.block)}, ${day.highest} votes` : 'Nobody is on the block.';
	// (until someone is nominated there is nothing to say of the block)
	if (day.nominations.length || day.block !== null || day.executed !== null) rows.push(rubric('The block'), row(txt('  ' + blockText, day.block !== null || day.executed !== null ? 'evil' : 'dim')));

	const nom = openNomination();
	if (nom && f.speech) {
		rows.push(blank(), rubric(`${name(nom.nominator)} Nominates ${name(nom.nominee)}`));
		if (f.speech.stage === 'accusation' || f.speech.stage === 'defence') {
			const accusing = f.speech.stage === 'accusation';
			rows.push(timerRow('speech', accusing ? `${name(nom.nominator)} accuses` : `${name(nom.nominee)} defends`));
			rows.push(...timerControls('speech'));
			rows.push(blank(), ...buttonRows([
				accusing
					? btn('On to the defence', toDefence, { style: 'primary' })
					: btn('Begin the vote', startVote, { style: 'primary' }),
				btn('Withdraw', () => { undo(); }, { style: 'quiet' })
			]));
			return rows;
		}
		return [...rows, ...voteRows(nom.nominee, needed)];
	}

	rows.push(blank());
	if (day.stage === 'discussion') {
		rows.push(rubric('Discussion'), timerRow('day', 'Time left'), ...timerControls('day'));
		rows.push(blank(), ...buttonRows([
			btn('Open nominations', openNominations, { style: 'primary' }),
			...slayerButton()
		]));
	} else {
		rows.push(rubric('Nominations'), timerRow('nom', 'Time left'), ...timerControls('nom'));
		for (const a of validAsks()) {
			rows.push(blank(), ...prose(`From ${name(a.by)}'s phone: ${name(a.by)} nominates ${name(a.nominee)}.`, 'gold'));
			rows.push(...buttonRows([btn('Accept', () => acceptNomination(a), { style: 'primary' }), btn('Not now', () => declineNomination(a), { style: 'quiet' })]));
		}
		rows.push(blank());
		if (ui.dayMode !== 'none') {
			rows.push(...dayPicker());
		} else {
			rows.push(...buttonRows([
				btn('Nominate', () => { ui.dayMode = 'nominate'; clearPicks(); render(); }, { disabled: day.executed !== null, style: 'primary' }),
				...slayerButton(),
				btn('End the day', () => act({ type: 'end-day' }), { style: 'danger' })
			]));
		}
	}
	if (state.day!.stage === 'discussion' && ui.dayMode !== 'none') rows.push(...dayPicker());
	rows.push(...storytellerTools());
	if (day.nominations.length) {
		rows.push(blank(), rubric('Today'));
		for (const n of day.nominations) {
			const v = n.votes === null ? '' : `${n.votes} vote${n.votes === 1 ? '' : 's'}`;
			rows.push(row(txt(pad(`${name(n.nominator)} » ${name(n.nominee)}`, 30)), txt(v, 'dim')));
		}
	}
	return rows;
}

/** The Slayer's shot: anyone may claim it, but only on a script with a Slayer. */
function slayerButton(): Button[] {
	if (!script().characters.some((c) => c.id === 'slayer')) return [];
	return [btn('Slayer shot', () => { ui.dayMode = 'slay'; clearPicks(); render(); })];
}

/**
 * Abilities the Storyteller works by hand, at any moment: the Gossip's
 * statement (by day), the dead Moonchild's choice, the Tinker's death.
 */
function storytellerTools(): Row[] {
	const rows: Row[] = [];
	const day = state.phase.kind === 'day';
	for (const g of state.seats.filter((x) => x.character === 'gossip' && x.alive && day)) {
		const said = state.day?.gossip.some((x) => x.by === g.id);
		rows.push(blank(), rubric(`${g.name}, the Gossip`));
		rows.push(...prose(said ? 'Has made a statement today.' : 'If they make a public statement today, is it true?', 'dim'));
		if (!said) rows.push(...buttonRows([btn('True', () => act({ type: 'gossip', by: g.id, true: true }), { style: 'danger' }), btn('False', () => act({ type: 'gossip', by: g.id, true: false }))]));
	}
	for (const m of state.seats.filter((x) => x.character === 'moonchild' && !x.alive && !state.spent.includes(`${x.id}:moonchild`) && !state.effects.some((e) => e.kind === 'moonchild' && e.by === x.id))) {
		rows.push(blank(), rubric(`${m.name}, the Moonchild, chooses`));
		rows.push(...prose('When they learn they died, they publicly choose a living player. If good, that player dies tonight.', 'dim'));
		rows.push(...buttonRows(state.order.filter((id) => state.seats[id].alive).map((id) => btn(state.seats[id].name, () => act({ type: 'moonchild', by: m.id, target: id }), { width: 10 })), INNER, 0));
	}
	for (const t of state.seats.filter((x) => x.character === 'tinker' && x.alive && G.abilityWorks(state, x.id, 'tinker'))) {
		rows.push(blank(), rubric(`${t.name}, the Tinker`));
		rows.push(...buttonRows([btn('The Tinker dies', () => act({ type: 'tinker', seat: t.id }), { style: 'danger' })]));
	}
	const living = state.order.filter((id) => state.seats[id].alive);
	for (const k of state.seats.filter((x) => x.character === 'klutz' && !x.alive && !state.spent.includes(`${x.id}:klutz`))) {
		rows.push(blank(), rubric(`${k.name}, the Klutz, chooses`));
		rows.push(...prose('On learning they died, they publicly choose a living player. If evil, good loses.', 'dim'));
		rows.push(...buttonRows(living.map((id) => btn(state.seats[id].name, () => act({ type: 'klutz', by: k.id, target: id }), { width: 10 })), INNER, 0));
	}
	// The Savant: today's pair of statements, one true and one false (drunk or poisoned: two truths or two lies, if you like).
	for (const sv of state.seats.filter((x) => x.character === 'savant' && x.alive && day)) {
		const droisoned = G.isDroisoned(state, sv.id);
		const mode = droisoned ? ui.savantMode : 'normal';
		rows.push(blank(), rubric(`${sv.name}, the Savant`));
		rows.push(...prose(droisoned ? 'Drunk or poisoned: any two statements will do. Two truths or two lies can be crueller.' : 'If they visit you today: one true statement and one false, in either order.', droisoned ? 'evil' : 'dim'));
		for (const st of savantPair(savantStatements(state, sv.id, ui.savantSeed), ui.savantSeed, mode)) rows.push(...prose(`${st.true ? 'TRUE' : 'FALSE'}: ${st.text}`, st.true ? 'good' : 'evil'));
		rows.push(...buttonRows([
			btn('Another pair', () => { ui.savantSeed++; render(); }, { style: 'quiet' }),
			...(droisoned ? (['normal', 'truths', 'lies'] as const).map((m) => btn(m === 'normal' ? 'True and false' : m === 'truths' ? 'Two truths' : 'Two lies', () => { ui.savantMode = m; render(); }, { style: ui.savantMode === m ? 'on' : 'quiet' })) : [])
		]));
	}
	// The Amnesiac: ideas for the ability you give them (they guess it by day; you say how close).
	for (const am of state.seats.filter((x) => x.character === 'amnesiac' && x.alive)) {
		rows.push(blank(), rubric(`${am.name}, the Amnesiac`));
		rows.push(...prose('Ideas for their secret ability. Each day they may guess it; tell them whether they are cold, warm or right.', 'dim'));
		for (let k = 0; k < 3; k++) {
			const idea = AMNESIAC_IDEAS[(ui.amnesiacSeed * 3 + k) % AMNESIAC_IDEAS.length];
			rows.push(...prose(`${idea.name}: ${idea.text}`, 'gold'));
		}
		rows.push(...buttonRows([btn('More ideas', () => { ui.amnesiacSeed++; render(); }, { style: 'quiet' })]));
	}
	rows.push(...juggleRows(day));
	rows.push(...travellerRows(day));
	rows.push(...fabledRows(day));
	// Madness (the Mutant, the Cerenovus): the Storyteller may execute for it, by day.
	const madness = script().characters.some((c) => c.id === 'mutant' || c.id === 'cerenovus');
	if (day && madness && state.day!.executed === null) {
		const mad = state.effects.filter((e) => e.kind === 'mad').map((e) => `${name(e.target)} (${charName(e.note ?? '')})`);
		rows.push(blank(), rubric('Madness'));
		rows.push(...prose(mad.length ? `Must be mad today: ${mad.join(', ')}. Execute anyone who breaks madness:` : 'Execute a player who breaks madness (a Mutant claiming Outsider):', 'dim'));
		rows.push(...buttonRows(living.map((id) => btn(state.seats[id].name, () => act({ type: 'madness', seat: id }), { width: 10 })), INNER, 0));
	}
	// The Pit-Hag made a Demon: tonight's deaths are the Storyteller's.
	if (state.phase.kind === 'night' && state.night?.arbitrary) {
		rows.push(blank(), rubric('Deaths tonight are yours'));
		rows.push(...buttonRows(living.map((id) => btn(state.seats[id].name, () => act({ type: 'storyteller-kill', seat: id }), { width: 10, style: 'danger' })), INNER, 0));
	}
	return rows;
}

/** The Fabled the Storyteller runs by day: the Doomsayer, the Ferryman. */
function fabledRows(day: boolean): Row[] {
	const rows: Row[] = [];
	const has = (id: string) => state.fabled?.some((f) => f.id === id);
	if (!day) return rows;
	if (has('doomsayer') && G.living(state).length >= 4) {
		const by = ui.doom;
		rows.push(blank(), rubric('The Doomsayer'));
		if (by === null) {
			rows.push(...prose('Who calls on the Doomsayer?', 'dim'));
			rows.push(...buttonRows(state.order.filter((id) => state.seats[id].alive && !state.spent.includes(`${id}:doomsayer`)).map((id) => btn(state.seats[id].name, () => { ui.doom = id; render(); }, { width: 10 })), INNER, 0));
		} else {
			rows.push(...prose(`${name(by)} calls it. Choose a living player of their team to die:`, 'dim'));
			rows.push(...buttonRows(state.order.filter((id) => state.seats[id].alive && state.seats[id].alignment === state.seats[by].alignment).map((id) => btn(state.seats[id].name, () => { ui.doom = null; act({ type: 'doomsayer', by, victim: id }); }, { width: 10, style: 'danger' })), INNER, 0));
			rows.push(...buttonRows([btn('Cancel', () => { ui.doom = null; render(); }, { style: 'quiet' })]));
		}
	}
	if (has('ferryman') && !state.spent.includes('-1:ferryman')) {
		rows.push(blank(), rubric('The Ferryman'), ...buttonRows([btn('Final day: the dead vote again', () => act({ type: 'ferryman' }))]));
	}
	return rows;
}

/** Travellers: joining, exile, and the day abilities the Storyteller runs (the Gunslinger, the Judge). */
/** A Traveller may join: the script has one not yet seated, and there is room at the table. */
function travellerCanJoin(): boolean {
	const pool = (script().travellers ?? []).filter((c) => !state.seats.some((x) => x.character === c.id));
	return state.phase.kind !== 'setup' && state.phase.kind !== 'over' && !ui.travel && pool.length > 0 && state.seats.length < 20;
}
function travellerJoins() {
	const n = (globalThis.prompt?.('The Traveller\u2019s name?') ?? '').trim();
	if (n) { ui.travel = { name: n, character: null, alignment: null }; render(); }
}

function travellerRows(day: boolean): Row[] {
	const rows: Row[] = [];
	const pool = (script().travellers ?? []).filter((c) => !state.seats.some((x) => x.character === c.id));
	const t = ui.travel;
	if (t) {
		rows.push(blank(), rubric(`${t.name} joins as a Traveller`));
		if (!t.character) rows.push(...buttonRows(pool.map((c) => btn(c.name, () => { t.character = c.id; render(); }))));
		else if (!t.alignment) {
			rows.push(...prose(`The ${charName(t.character)}. Their alignment (your choice):`, 'dim'));
			rows.push(...buttonRows([btn('Good', () => { t.alignment = 'good'; render(); }, { style: 'primary' }), btn('Evil', () => { t.alignment = 'evil'; render(); }, { style: 'danger' })]));
		} else {
			rows.push(...prose('They sit just after...', 'dim'));
			rows.push(...buttonRows(state.order.map((id) => btn(state.seats[id].name, () => {
				const j = { type: 'traveller-joins' as const, name: t.name, character: t.character!, alignment: t.alignment!, after: id };
				ui.travel = null;
				act(j);
			}, { width: 10 })), INNER, 0));
		}
		rows.push(...buttonRows([btn('Cancel', () => { ui.travel = null; render(); }, { style: 'quiet' })]));
		return rows;
	}
	const e = ui.exile;
	if (e && day) {
		const needed = Math.ceil(G.living(state).length / 2);
		rows.push(blank(), rubric(`Exile ${name(e.traveller)}?`));
		rows.push(...prose(`Anyone may support it, the dead too. ${e.supporters.length} of ${needed} needed.`, 'dim'));
		rows.push(...buttonRows(state.order.map((id) => btn(state.seats[id].name, () => {
			e.supporters = e.supporters.includes(id) ? e.supporters.filter((x) => x !== id) : [...e.supporters, id];
			render();
		}, { width: 10, style: e.supporters.includes(id) ? 'on' : undefined })), INNER, 0));
		rows.push(...buttonRows([
			btn('Decide', () => { const c = { type: 'exile' as const, traveller: e.traveller, supporters: e.supporters }; ui.exile = null; act(c); }, { style: 'primary' }),
			btn('Cancel', () => { ui.exile = null; render(); }, { style: 'quiet' })
		]));
		return rows;
	}
	if (!day) return rows;
	for (const x of state.seats.filter((y) => y.traveller && y.alive)) {
		rows.push(blank(), rubric(`${x.name}, the ${charName(x.character)} (Traveller)`));
		const extra: Button[] = [btn('Call for exile', () => { ui.exile = { traveller: x.id, supporters: [] }; render(); })];
		if (x.character === 'judge' && !state.spent.includes(`${x.id}:judge`) && state.day!.nominations.length) {
			extra.push(btn('Judge: pardon', () => act({ type: 'judge', by: x.id, verdict: 'pardon' })), btn('Judge: condemn', () => act({ type: 'judge', by: x.id, verdict: 'condemn' }), { style: 'danger' }));
		}
		rows.push(...buttonRows(extra));
		const first = state.day!.nominations.find((n) => n.votes !== null);
		if (x.character === 'gunslinger' && first && !state.spent.includes(`${x.id}:gunslinger@${state.day!.n}`)) {
			rows.push(...prose('The Gunslinger may shoot one who voted in the first vote:', 'dim'));
			rows.push(...buttonRows((first.voters ?? []).map((id) => btn(state.seats[id].name, () => act({ type: 'gunslinger', by: x.id, target: id }), { width: 10, style: 'danger' })), INNER, 0));
		}
	}
	return rows;
}

/** The Juggler's first day: up to five guesses, each a player then a character. */
function juggleRows(day: boolean): Row[] {
	const rows: Row[] = [];
	const jugglers = state.seats.filter((x) => x.alive && x.believes === 'juggler' && !state.spent.includes(`${x.id}:juggle`));
	if (!day || !jugglers.length) return rows;
	const j = ui.juggle;
	if (!j) {
		for (const x of jugglers) {
			rows.push(blank(), rubric(`${x.name}, the Juggler`));
			rows.push(...buttonRows([btn('Record their guesses', () => { ui.juggle = { by: x.id, player: null, guesses: [] }; render(); })]));
		}
		return rows;
	}
	rows.push(blank(), rubric(`${name(j.by)} juggles`));
	if (j.guesses.length) rows.push(...prose(j.guesses.map((g) => `${name(g.player)}: ${charName(g.character)}`).join('; '), 'gold'));
	if (j.player === null) {
		if (j.guesses.length < 5) {
			rows.push(...prose('Who is the guess about?', 'dim'));
			rows.push(...buttonRows(state.order.filter((id) => !j.guesses.some((g) => g.player === id)).map((id) => btn(state.seats[id].name, () => { j.player = id; render(); }, { width: 10 })), INNER, 0));
		}
	} else {
		rows.push(...prose(`${name(j.player)} is the...`, 'dim'));
		rows.push(...buttonRows(script().characters.map((c) => btn(c.name, () => { j.guesses.push({ player: j.player!, character: c.id }); j.player = null; render(); }))));
	}
	rows.push(...buttonRows([
		btn('Done', () => { const g = j.guesses; ui.juggle = null; act({ type: 'juggle', by: j.by, guesses: g }); }, { disabled: !j.guesses.length, style: 'primary' }),
		btn('Cancel', () => { ui.juggle = null; render(); }, { style: 'quiet' })
	]));
	return rows;
}

/**
 * Nominating, or the Slayer's shot, right here in the panel: first who acts,
 * then at whom, as a grid of names in circle order. (Tapping the circle
 * still works too.)
 */
function dayPicker(): Row[] {
	const day = state.day!;
	const nominating = ui.dayMode === 'nominate';
	const first = ui.picks[0];
	const order = state.order;
	// Everyone stays where they are, round the circle: the one picked first lit (tap again to take it
	// back), those who cannot be picked now greyed, so a name is never where another was a tap ago.
	const can = (id: SeatId) => first === undefined
		? state.seats[id].alive && (!nominating || !day.nominations.some((n) => n.nominator === id))
		: id === first || (nominating ? !day.nominations.some((n) => n.nominee === id) : true);
	const prompt = first === undefined
		? (nominating ? 'Who nominates?' : 'Who takes the shot?')
		: (nominating ? `${name(first)} nominates...` : `${name(first)} shoots at...`);
	return [
		rubric(nominating ? 'Nomination' : 'The Slayer\u2019s shot'),
		...prose(prompt, 'gold'),
		...buttonRows(order.map((id) => btn(state.seats[id].name, () => tapSeat(id), { width: 10, disabled: !can(id), style: ui.picks.includes(id) ? 'on' : undefined })), INNER, 0),
		...buttonRows([btn(first === undefined ? 'Cancel' : 'Back', () => { if (first === undefined) ui.dayMode = 'none'; clearPicks(); render(); }, { style: 'quiet' })])
	];
}

function startVote() {
	const f = flow();
	const nom = openNomination()!;
	f.speech = { stage: 'vote', timer: T.pause(f.speech!.timer, Date.now()) };
	const order = G.voteOrder(state, nom.nominee);
	f.vote = { order, index: 0, hands: [] };
	ui.voteSmall = !!village && document.body.classList.contains('village-map');
	skipVoteless();
	save();
	render();
}

/** Move the count past anyone who cannot vote (dead, vote spent). */
function skipVoteless() {
	const v = flow().vote!;
	while (v.index < v.order.length && !G.canVote(state, v.order[v.index])) v.index++;
}

function voteRows(nominee: SeatId, needed: number): Row[] {
	const v = flow().vote!;
	const rows: Row[] = [];
	const highest = state.day!.highest;
	rows.push(...prose(`Hands go up clockwise from ${name(v.order[0])}, ${name(nominee)} last. ${needed} needed${highest ? `, and more than ${highest}` : ''}.`, 'dim'));
	// The order of hands, eight to a line: + up, . down, ? now, - cannot vote.
	const marks = v.order.map((id, i) => {
		const s = state.seats[id];
		const mark = !G.canVote(state, id) ? '-' : v.hands.includes(id) ? '+' : i < v.index ? '.' : i === v.index ? '?' : ' ';
		return [txt(mark, mark === '+' ? 'good' : mark === '?' ? 'gold' : 'dim'), txt(pad(s.name.slice(0, 3), 4), s.alive ? undefined : 'dim')];
	});
	for (let i = 0; i < marks.length; i += 8) rows.push(row(...marks.slice(i, i + 8).flat()));
	rows.push(row(txt(`  ${v.hands.length} hand${v.hands.length === 1 ? '' : 's'} up`, 'gold')));
	rows.push(blank());
	if (v.index < v.order.length) {
		const id = v.order[v.index];
		const s = state.seats[id];
		const note = s.alive ? '' : ' (spends their ghost vote)';
		const master = G.butlerMaster(state);
		const butler = G.hasWorkingAbility(state, id, 'butler') && master !== null
			? ` Butler: only if ${name(master)} votes.` : '';
		rows.push(...prose(`${s.name}?${note}${butler}`, 'gold'));
		const answer = (up: boolean) => {
			v.hands = v.hands.filter((h) => h !== id);
			if (up) v.hands.push(id);
			v.index++;
			skipVoteless();
			save();
			render();
		};
		rows.push(...buttonRows([btn('Hand up', () => answer(true), { style: 'primary' }), btn('No', () => answer(false))]));
	} else {
		rows.push(...buttonRows([btn(`Record ${v.hands.length} vote${v.hands.length === 1 ? '' : 's'}`, () => {
			if (act({ type: 'vote', voters: [...v.hands] })) {
				flow().nomTimer = T.start(flow().nomTimer, Date.now());
				save();
				render();
			}
		}, { style: 'primary' })]));
	}
	rows.push(...buttonRows([
		btn('Back', () => { v.index = Math.max(0, v.index - 1); while (v.index > 0 && !G.canVote(state, v.order[v.index])) v.index--; save(); render(); }, { style: 'quiet', disabled: v.index === 0 }),
		btn('Big view', () => { ui.voteSmall = false; render(); }, { style: 'primary' })
	]));
	return rows;
}

/** Record one hand (or none) and move round the circle. */
function answerVote(up: boolean) {
	const v = flow().vote!;
	const id = v.order[v.index];
	v.hands = v.hands.filter((h) => h !== id);
	if (up) v.hands.push(id);
	v.index++;
	skipVoteless();
	save();
	render();
}

function recordVote() {
	const v = flow().vote!;
	if (act({ type: 'vote', voters: [...v.hands] })) {
		flow().nomTimer = T.start(flow().nomTimer, Date.now());
		save();
		render();
	}
}

/**
 * Counting hands full screen: the voter's name large and two big buttons,
 * so the Storyteller can watch the room and still press the right one.
 */
function voteStage(): Row[] {
	const v = flow().vote!;
	const nom = openNomination()!;
	const needed = Math.ceil(G.living(state).length / 2);
	const highest = state.day!.highest;
	// Names lettered large where they fit, so the table can read them from across the room.
	const large = (n: string) => { const l = letteredRow(n, CARD_INNER); return l ? [l] : big(n); };
	const rows: Row[] = [rubric(`${name(nom.nominator)} nominates`), ...large(name(nom.nominee)),
		...note(`${needed} needed${highest ? `, and more than ${highest}` : ''}`),
		row(txt(`  ${v.hands.length} raised`, 'gold', 'heading'))];
	const marks = v.order.map((id, i) => {
		const mark = !G.canVote(state, id) ? '-' : v.hands.includes(id) ? '+' : i < v.index ? '.' : i === v.index ? '?' : ' ';
		return [txt(mark, mark === '+' ? 'good' : mark === '?' ? 'gold' : 'dim'), txt(pad(state.seats[id].name.slice(0, 4), 5), state.seats[id].alive ? undefined : 'dim')];
	});
	for (let i = 0; i < marks.length; i += 6) rows.push(row(...marks.slice(i, i + 6).flat(), txt(' ')));
	if (v.index < v.order.length) {
		const id = v.order[v.index];
		const s = state.seats[id];
		rows.push(rubric('Now'), ...large(s.name));
		const hand = phoneHand(id);
		if (hand !== null) rows.push(...note(hand ? 'Hand UP on their phone' : 'Hand down on their phone'));
		if (!s.alive) rows.push(...note('(spends their ghost vote)'));
		const master = G.butlerMaster(state);
		if (G.hasWorkingAbility(state, id, 'butler') && master !== null) rows.push(...note(`Butler: only if ${name(master)} votes`));
		const half = Math.floor((CARD_INNER - 1) / 2);
		rows.push(endPanel(), buttonBlock([btn('Hand raised', () => answerVote(true), { style: 'primary', width: half }), btn('No hand', () => answerVote(false), { width: half })], CARD_INNER));
	} else {
		rows.push(rubric('The count'), ...big(`${v.hands.length} hand${v.hands.length === 1 ? '' : 's'}`), endPanel(),
			buttonBlock([btn('Record the vote', recordVote, { style: 'primary' })], CARD_INNER));
	}
	rows.push(blank(), ...cardButtons([
		btn('Back', () => { v.index = Math.max(0, v.index - 1); while (v.index > 0 && !G.canVote(state, v.order[v.index])) v.index--; save(); render(); }, { style: 'quiet', disabled: v.index === 0 }),
		btn('Small view', () => { ui.voteSmall = true; ui.voteBig = false; render(); }, { style: 'quiet' })
	]));
	if (link && v.index < v.order.length) rows.push(...cardButtons([btn(autoCount ? 'Stop counting' : 'Count by phones', countByPhones, { style: autoCount ? 'danger' : 'primary' })]));
	return rows;
}

function voteLook(id: SeatId): Button['style'] | undefined {
	const v = flow().vote;
	if (!v) return undefined;
	if (v.order[v.index] === id) return 'primary';
	if (v.hands.includes(id)) return 'on';
	return undefined;
}

// ---- inspecting and editing a seat ----------------------------------------------------------

function inspectRows(): Row[] {
	if (ui.inspect === null) return [];
	const id = ui.inspect;
	const s = state.seats[id];
	if (!s.character) return [];
	const edit = (cmd: Command) => { const keep = id; if (act(cmd)) { ui.inspect = keep; render(); } };
	const rows: Row[] = [rubric(`${s.name}, seat ${id + 1}`)];
	rows.push(...prose(`The ${charName(s.character)}${s.character !== s.believes ? `, thinks they are the ${charName(s.believes)}` : ''}. ${s.alignment === 'evil' ? 'Evil' : 'Good'}. ${s.alive ? 'Alive.' : s.ghostVote ? 'Dead, ghost vote unused.' : 'Dead, vote spent.'}`));
	for (const f of flagsText(id).filter((f) => !f.startsWith('DRUNK'))) rows.push(...prose(f[0].toUpperCase() + f.slice(1) + '.', 'evil'));
	if (G.butlerMaster(state) === id) rows.push(...prose('The Butler’s master.', 'dim'));
	rows.push(...prose(G.charDef(script(), s.character).ability, 'dim'));

	if (ui.retoken === 'character') {
		rows.push(blank(), ...prose('New token:', 'gold'));
		rows.push(...buttonRows(script().characters.map((c) => btn(c.name, () => {
			if (c.id === 'drunk') { ui.retoken = 'believes'; ui.retokenTo = 'drunk'; render(); }
			else edit({ type: 'adjust', seat: id, character: c.id });
		}))));
	} else if (ui.retoken === 'believes') {
		rows.push(blank(), ...prose('The Drunk thinks they are:', 'gold'));
		rows.push(...buttonRows(G.charactersOfTeam(script(), 'townsfolk').map((c) => btn(c.name, () => edit({ type: 'adjust', seat: id, character: 'drunk', believes: c.id })))));
	} else {
		rows.push(blank(), ...prose('By hand (logged):', 'dim'));
		rows.push(...buttonRows([
			btn(s.alive ? 'Kill' : 'Revive', () => edit({ type: 'adjust', seat: id, alive: !s.alive }), { style: s.alive ? 'danger' : undefined }),
			btn(G.isPoisoned(state, id) ? 'Cure' : 'Poison', () => edit({ type: 'set-poison', target: G.isPoisoned(state, id) ? null : id })),
			btn(state.redHerring === id ? 'Not herring' : 'Red herring', () => edit({ type: 'set-red-herring', seat: state.redHerring === id ? null : id })),
			...(!s.alive ? [btn(s.ghostVote ? 'Spend vote' : 'Give vote', () => edit({ type: 'adjust', seat: id, ghostVote: !s.ghostVote }))] : []),
			btn('New token', () => { ui.retoken = 'character'; render(); }),
			btn('Move seat', () => { ui.rearrange = true; ui.moving = id; ui.inspect = null; render(); })
		]));
	}
	rows.push(...buttonRows([btn('Close', () => { ui.inspect = null; ui.retoken = null; render(); }, { style: 'quiet' })]), endPanel());
	return rows;
}

// ---- log, ties, options -----------------------------------------------------------------------

function describe(e: GameEvent): string | null {
	switch (e.type) {
		case 'night-began': return `Night ${roman(e.n)}`;
		case 'day-began': return `Day ${roman(e.n)}`;
		case 'chose': return `${name(e.by)} (${charName(e.role)}) chose ${e.targets.map(name).join(', ')}${e.effective ? '' : ': no effect'}`;
		case 'info-given': return `${name(e.to)} (${charName(e.role)}): ${infoText(e.info, e.role)}${e.truthful ? '' : e.override ? ' [FALSE, overridden]' : ' [false]'}`;
		case 'role-shown': return `${name(e.to)} shown their character`;
		case 'evil-info-shown': return e.as === 'minion' ? `${name(e.to)} shown their Demon` : `${name(e.to)} shown their Minions and bluffs`;
		case 'grimoire-shown': return `${name(e.to)} read the grimoire`;
		case 'demon-told': return `${name(e.to)} told they are the Demon`;
		case 'kill-prevented': return `${name(e.target)} survives: ${e.reason}`;
		case 'kill-redirected': return `The Mayor's death passes from ${name(e.from)} to ${name(e.to)}`;
		case 'died': return `${name(e.seat)} dies (${e.cause})`;
		case 'became-demon': return `${name(e.seat)} becomes the ${charName(e.character)}`;
		case 'step-skipped': return `Skipped ${e.step}`;
		case 'nominations-opened': return 'Nominations open';
		case 'nominated': return `${name(e.nominator)} nominates ${name(e.nominee)}`;
		case 'vote-tallied': return `  ${e.votes} of ${e.needed} for ${name(e.nominee)}: ${e.outcome.replace(/-/g, ' ')}`;
		case 'executed': return `${name(e.seat)} is executed`;
		case 'slayer-shot': return `${name(e.by)} shoots ${name(e.target)}: ${e.hit ? 'hit' : 'nothing happens'}`;
		case 'adjusted': return `By hand: ${name(e.seat)}${e.alive !== undefined ? (e.alive ? ' revived' : ' killed') : ''}${e.character ? ` made the ${charName(e.character)}` : ''}${e.ghostVote !== undefined ? (e.ghostVote ? ' given a vote' : ' vote spent') : ''}`;
		case 'poison-set': return e.target === null ? 'By hand: poison cleared' : `By hand: ${name(e.target)} poisoned`;
		case 'red-herring-set': return e.seat === null ? 'By hand: no red herring' : `By hand: ${name(e.seat)} is the red herring`;
		case 'game-over': return `${e.winner.toUpperCase()} WINS. ${e.reason}`;
		case 'note': return e.text;
		default: return null;
	}
}

function logScreen(): Row[] {
	const rows: Row[] = [rubric('The Chronicle')];
	for (const e of saved.events) {
		const d = describe(e);
		if (!d) continue;
		const heading = e.type === 'night-began' || e.type === 'day-began';
		if (heading) rows.push(blank());
		rows.push(...wrap(d).map((l) => row(txt(l, heading ? 'rubric' : e.type === 'died' || e.type === 'game-over' ? 'evil' : undefined))));
	}
	return rows;
}

/** Who-did-what-to-whom as a grid: rows act, columns are acted on. */
function tiesScreen(): Row[] {
	const edges = G.interactions(saved.events);
	const n = state.seats.length;
	const rows: Row[] = [rubric('Ties Between Players')];
	if (!n) return rows;
	const SYMBOL: Record<string, string> = {
		nominated: 'N', voted: 'v', poisoned: 'P', protected: 'M', attacked: 'K', 'chose-master': 'B',
		read: 'r', shown: 's', redirected: '>', slayed: 'S', 'executed-by-virgin': 'X'
	};
	const priority = 'KSXPNMB>rsv';
	const cell: string[][] = Array.from({ length: n }, () => Array(n).fill('·'));
	for (const e of edges) {
		const cur = cell[e.from][e.to];
		const sym = SYMBOL[e.kind];
		if (cur === '·' || priority.indexOf(sym) < priority.indexOf(cur)) cell[e.from][e.to] = sym;
	}
	rows.push(row(txt(pad('', 8) + state.seats.map((s) => pad(s.name.slice(0, 1), 2)).join(''), 'gold', 'art')));
	for (let i = 0; i < n; i++) rows.push(row(txt(pad(state.seats[i].name, 7) + ' ', 'gold'), txt(cell[i].map((c) => pad(c, 2)).join(''), undefined, 'art')));
	rows.push(blank(), ...prose('Row acts on column. K attacked  S shot  X Virgin  P poisoned  N nominated  M Monk  B master  > Mayor  r read  s shown  v voted', 'dim'));
	return rows;
}

/** Back to the settings, from one of its pages. */
const settingsBack = (): Row => navRow('Settings', () => { if (ui.drawer) ui.drawer = 'settings'; else ui.tab = 'settings'; render(); });

function optionsScreen(): Row[] {
	const st = saved.settings;
	const rows: Row[] = [settingsBack(), rubric('The clocks')];
	const line = (label: string, key: keyof Settings) => {
		const step = key === 'dayMs' || key === 'nominationsMs' ? 60_000 : 15_000;
		rows.push({ segs: [
			txt(pad(label, 14)),
			btn('-', () => { st[key] = Math.max(step, st[key] - step); save(); render(); }, { aria: `Less ${label}` }),
			txt(' ' + pad(T.clock(st[key]), 6), 'gold'),
			btn('+', () => { st[key] += step; save(); render(); }, { aria: `More ${label}` })
		] });
	};
	line('Discussion', 'dayMs');
	line('Nominations', 'nominationsMs');
	line('Accusation', 'accusationMs');
	line('Defence', 'defenceMs');
	rows.push(blank(), ...prose('New lengths apply from the next day (or the next speech). Each running clock can also be paused, restarted or given more time on the spot.', 'dim'));
	return rows;
}

// ---- players' phones -----------------------------------------------------------------------
//
// The Storyteller's phone hosts a room; players' phones join it (see
// src/net). The game still runs here. Each phone is sent only what views.ts
// says that player may see, and sends back only what they choose.

let link: HostLink | null = null;
/** Mode 2 inside the game: the village, when it is on. */
let village: VillageHost | null = null;
let villageKey = '';
/** The night step the Storyteller last went to in the village. */
let visitedWake = '';
/** Nominations asked for from phones, waiting for the Storyteller. */
let nomAsks: { by: SeatId; nominee: SeatId }[] = [];
/** Hands raised on phones for the nomination under way (cleared for each new one). */
const phoneHands = new Set<SeatId>();
let handsFor = '';
/** Counting by phones: the clock moves itself while each voter has a phone. */
let autoCount: ReturnType<typeof setInterval> | null = null;

const seatOfPeer = (peer: string): SeatId | null => { const c = phones.get(peer); return c ? seatOfClient(c) : null; };

/** Why this nomination cannot be made now, or null if it can. */
function nominationProblem(by: SeatId, nominee: SeatId): string | null {
	const d = state.day;
	if (state.phase.kind !== 'day' || !d) return 'Nominations happen in the day.';
	if (d.stage !== 'nominations') return 'Nominations are not open yet.';
	if (openNomination()) return 'Wait: a nomination is under way.';
	if (d.executed !== null) return 'Someone has already been executed today.';
	if (!state.seats[by]?.alive) return 'The dead cannot nominate.';
	if (d.nominations.some((n) => n.nominator === by)) return 'You have already nominated today.';
	if (d.nominations.some((n) => n.nominee === nominee)) return `${name(nominee)} has already been nominated today.`;
	return null;
}

const validAsks = () => (nomAsks = nomAsks.filter((a) => !nominationProblem(a.by, a.nominee)));

function acceptNomination(a: { by: SeatId; nominee: SeatId }) {
	nomAsks = nomAsks.filter((x) => x !== a);
	const why = nominationProblem(a.by, a.nominee);
	if (why) { ui.message = why; render(); return; }
	act({ type: 'nominate', nominator: a.by, nominee: a.nominee });
}

function declineNomination(a: { by: SeatId; nominee: SeatId }) {
	nomAsks = nomAsks.filter((x) => x !== a);
	const peer = peerOfSeat(a.by);
	if (peer) sendTo(peer, { t: 'note', text: 'The Storyteller did not take your nomination just now.' });
	render();
}

/** The nomination under way, for the phones. */
function voteView(): VoteView | null {
	const nom = openNomination();
	if (!nom || state.phase.kind !== 'day') return null;
	const key = `${flow().dayN}:${state.day!.nominations.length}`;
	if (key !== handsFor) { handsFor = key; phoneHands.clear(); }
	const v = flow().vote;
	return {
		nominator: nom.nominator, nominee: nom.nominee, voting: !!v,
		order: v?.order ?? G.voteOrder(state, nom.nominee),
		at: v && v.index < v.order.length ? v.order[v.index] : null,
		counted: v?.hands ?? [],
		raised: [...phoneHands]
	};
}

function toDefence() {
	flow().speech = { stage: 'defence', timer: T.start(T.newTimer(saved.settings.defenceMs), Date.now()) };
	save();
	render();
}

function openNominations() {
	const f = flow();
	f.dayTimer = T.pause(f.dayTimer, Date.now());
	if (act({ type: 'open-nominations' })) { flow().nomTimer = T.start(flow().nomTimer, Date.now()); save(); render(); }
}

/** The hand on this voter's phone, if they have one linked: true up, false down, null no phone. */
const phoneHand = (id: SeatId): boolean | null => (peerOfSeat(id) ? phoneHands.has(id) : null);

/** Let the count run round by itself while each voter has a phone; it stops at anyone without one. */
function countByPhones() {
	if (autoCount) { clearInterval(autoCount); autoCount = null; render(); return; }
	autoCount = setInterval(() => {
		const v = flow().vote;
		const id = v && v.index < v.order.length ? v.order[v.index] : null;
		const hand = id === null ? null : phoneHand(id);
		if (hand === null) { clearInterval(autoCount!); autoCount = null; render(); return; }
		answerVote(hand);
	}, 1200);
	render();
}

/** What the Storyteller does next, as a bar in the village. */
function villageActions(): StActions | null {
	const grim: Extra = { label: 'Grimoire', act: () => openDrawer('actions') };
	const p = state.phase;
	if (ui.decision) return { text: 'The grimoire needs a ruling.', buttons: [grim] };
	if (p.kind === 'night') {
		const step = G.nextStep(state);
		if (!step) return { text: `Dawn. ${state.night!.deaths.length ? `Died in the night: ${state.night!.deaths.map(name).join(', ')}.` : 'Nobody died in the night.'}`, buttons: [{ label: 'Start the day', primary: true, act: () => void act({ type: 'end-night' }) }, grim] };
		const who = step.seat === null ? null : state.seats[step.seat];
		const role = who ? `${who.name}, the ${charName(stepRole(step.kind, who.id))}${WAKE_NOTE[step.kind] ?? ''}` : groupLabel(step.kind).split(':')[0];
		const phone = step.seat !== null ? peerOfSeat(step.seat) : null;
		if (ui.remote && phone && ui.remote.seat === step.seat) {
			return { text: `${role}: their pages are on their phone.`, buttons: [{ label: 'Take it back', act: () => { sendTo(phone, { t: 'sleep' }); ui.remote = null; render(); } }, grim] };
		}
		const action = G.stepAction(step.kind);
		const need = playerPicks(step.kind, state, step.seat);
		const skip: Extra = { label: 'Skip', act: () => void act({ type: 'skip', reason: 'Storyteller skipped' }) };
		// Their phone wakes them; without one (or while it is away) the Storyteller runs the step
		// from here and tells them by voice.
		if (phone && canSendFirst(step)) return { text: `${role}.`, buttons: [{ label: `Wake ${who!.name}`, primary: true, act: () => wakePhone(step, phone, false) }, skip, grim] };
		const away = who !== null && Object.values(claims()).includes(who.id);
		const by = phone ? '' : away ? ' Their phone is away: tell them yourself.' : ' No phone: tell them yourself.';
		// The players they point at, tapped here (in turn, up to how many they choose).
		const pickFrom = (count: number): Extra[] => state.order.filter((id) => V.pickAllowed(state, step.kind, step.seat, id)).map((id) => ({
			label: `${ui.picks.includes(id) ? '✓ ' : ''}${name(id)}`,
			primary: ui.picks.includes(id),
			act: () => {
				ui.picks = ui.picks.includes(id) ? ui.picks.filter((x) => x !== id) : [...ui.picks, id].slice(-count);
				render();
			}
		}));
		if (who && action === 'tell') {
			if (need && ui.picks.length < need) {
				return { text: `${role}: whom do they point at? (${ui.picks.length} of ${need})${by}`, buttons: [...pickFrom(need), skip, grim] };
			}
			const seat = who.id;
			const chose = need ? ` chose ${ui.picks.map(name).join(' and ')}` : '';
			const droisoned = G.isDroisoned(state, seat);
			const info = ui.draftInfo;
			if (info && (G.judgeInfo(state, seat, step.kind, info).truthful || droisoned || ui.draftOverride)) {
				const told = phone
					? { label: `Tell ${who.name}`, primary: true, act: () => wakePhone(step, phone, true) }
					: { label: 'Done: I told them', primary: true, act: () => void act({ type: 'tell', info, override: ui.draftOverride }) };
				return { text: `${role}${chose}. Tell them: ${infoText(info, step.kind)}.${phone ? '' : by}`, buttons: [told, { label: 'Change', act: () => { ui.draftInfo = null; render(); } }, grim] };
			}
			const options = G.infoCandidates(state, step.kind, seat, ui.picks).filter((c) => c.truthful || droisoned);
			return { text: `${role}${chose}. ${droisoned ? 'Drunk or poisoned: tell them anything.' : 'What do they learn?'}`, buttons: [
				...options.map((c) => ({ label: `${infoText(c.info, step.kind)}${c.truthful ? '' : ' (false)'}`, act: () => { ui.draftInfo = c.info; ui.draftOverride = false; ui.compose = false; render(); } })),
				...(need ? [{ label: 'Change who', act: () => { ui.picks = []; ui.draftInfo = null; render(); } }] : []),
				{ label: 'Something else', act: grim.act }] };
		}
		if (action === 'choose') {
			const spec = G.pickSpec(state, step.kind, step.seat);
			if (spec.count && !spec.character) {
				const ready = ui.picks.length === spec.count;
				const ask = step.kind === 'gossip' ? 'who dies?' : 'whom do they choose?';
				return { text: `${role}: ${ask} ${ready ? ui.picks.map(name).join(', ') : `(${ui.picks.length} of ${spec.count})`}${step.kind === 'gossip' ? '' : by}`, buttons: [
					...(ready ? [{ label: `Confirm: ${ui.picks.map(name).join(', ')}`, primary: true, act: () => void act({ type: 'choose', targets: [...ui.picks] }) }] : []),
					...pickFrom(spec.count),
					...(spec.noneAllowed ? [{ label: 'No one', act: () => void act({ type: 'choose', none: true }) }] : []),
					skip, grim] };
			}
		}
		if (who && action === 'acknowledge') {
			// What an evil player learns, to say to them.
			const { demon, minions } = evilTeam();
			const learns = step.kind === G.MINION_INFO ? ` Their Demon: ${demon.map((d) => d.name).join(', ')}.`
				: step.kind === G.DEMON_INFO ? ` Their Minions: ${minions.map((m) => m.name).join(', ')}. Not in play: ${state.bluffs.map(charName).join(', ')}.` : '';
			return { text: `${role}.${learns}${by}`, buttons: [{ label: 'Done', primary: true, act: () => void act({ type: 'acknowledge' }) }, skip, grim] };
		}
		return { text: `Next: ${role}. This one is run in the grimoire.`, buttons: [{ label: 'Open the grimoire', primary: true, act: grim.act }, skip] };
	}
	if (p.kind === 'over') return { text: `${p.winner === 'good' ? 'Good' : 'Evil'} wins. ${p.reason}`, buttons: [{ label: 'New game', primary: true, act: () => { newGame(); openDrawer('actions'); } }, grim] };
	if (p.kind !== 'day') return null;
	const f = flow(), day = state.day!, nom = openNomination();
	if (nom && f.speech?.stage === 'accusation') return { text: `${name(nom.nominator)} accuses ${name(nom.nominee)}.`, buttons: [{ label: 'On to the defence', primary: true, act: toDefence }, { label: 'Withdraw', act: undo }] };
	if (nom && f.speech?.stage === 'defence') return { text: `${name(nom.nominee)} defends.`, buttons: [{ label: 'Begin the vote', primary: true, act: startVote }] };
	if (nom && f.vote) {
		// Counting round the circle, from the bar, while the clock hand moves round the cross.
		const v = f.vote;
		const needed = Math.ceil(G.living(state).length / 2);
		const tally = `${v.hands.length} for ${name(nom.nominee)}; ${needed} needed${day.highest ? `, more than ${day.highest}` : ''}.`;
		if (v.index >= v.order.length) return { text: `The count: ${tally}`, buttons: [{ label: 'Record the vote', primary: true, act: recordVote }, { label: 'Full count', act: () => { ui.voteSmall = false; ui.voteBig = true; render(); } }] };
		const id = v.order[v.index];
		const hand = phoneHand(id);
		const now = hand === null ? '' : hand ? ' (hand UP on their phone)' : ' (hand down on their phone)';
		return { text: `${tally} Now: ${name(id)}${now}${state.seats[id].alive ? '' : ', a ghost vote'}.`, buttons: [
			{ label: 'Hand up', primary: hand === true, act: () => answerVote(true) },
			{ label: 'No hand', primary: hand === false, act: () => answerVote(false) },
			...(link ? [{ label: autoCount ? 'Stop counting' : 'Count by phones', act: countByPhones }] : []),
			{ label: 'Full count', act: () => { ui.voteSmall = false; ui.voteBig = true; render(); } }] };
	}
	// The bell calls the town to the round table in the great hall; nominations open once they are seated.
	if (day.stage === 'discussion') {
		const bell: Extra = { label: 'Ring the bell', act: () => { ui.bellRung = state.day?.n ?? 0; village?.phase('dusk'); render(); } };
		return { text: ui.bellRung === state.day?.n ? 'Bell rung: all walk to the great hall.' : 'Discussion.', buttons: [...(ui.bellRung === state.day?.n ? [] : [bell]), { label: 'Open nominations', primary: true, act: openNominations }, grim] };
	}
	const ask = validAsks()[0];
	if (ask) return { text: `${name(ask.by)} nominates ${name(ask.nominee)}.`, buttons: [{ label: 'Accept', primary: true, act: () => acceptNomination(ask) }, { label: 'Not now', act: () => declineNomination(ask) }] };
	const block = day.executed !== null ? `${name(day.executed)} was executed.` : day.block !== null ? `On the block: ${name(day.block)} (${day.highest}).` : 'Nobody is on the block.';
	return { text: `${block} Nominations are open.`, buttons: [{ label: 'End the day', act: () => void act({ type: 'end-day' }) }, grim] };
}
let linkStatus: LinkStatus = 'closed';
let linkDetail = '';
/** Connected phones: connection id -> the phone's lasting id. */
const phones = new Map<string, string>();
/** What each phone was last sent, so unchanged news is not resent. */
const lastSent = new Map<string, string>();

const claims = () => saved.net?.claims ?? {};
const seatOfClient = (clientId: string): SeatId | null => claims()[clientId] ?? null;
function peerOfSeat(seat: SeatId): string | null {
	for (const [peer, client] of phones) if (seatOfClient(client) === seat && link?.peers.get(peer)?.open) return peer;
	return null;
}
function sendTo(peer: string, msg: HostMsg): boolean {
	return link?.send(peer, msg) ?? false;
}
function toPlayers(msg: HostMsg) {
	for (const [peer, client] of phones) if (seatOfClient(client) !== null) sendTo(peer, msg);
}

const lobby = () => saved.net?.lobby ?? [];

/** Someone in the room gave their name: they join the lobby (or are renamed), in the order they came. */
function joinLobby(client: string, raw: string) {
	const name = raw.trim().slice(0, 14);
	if (!saved.net || !name) return;
	const list = (saved.net.lobby ??= []);
	const mine = list.find((e) => e.client === client);
	if (mine) mine.name = name;
	else if (!list.some((e) => e.name.toLowerCase() === name.toLowerCase())) list.push({ client, name });
	// The game is already set: the seat with their name, if it is free, is theirs.
	if (state.seats.length && claims()[client] === undefined) {
		const seat = state.order.find((id) => state.seats[id].name.toLowerCase() === name.toLowerCase());
		if (seat !== undefined && !Object.values(claims()).includes(seat)) saved.net.claims[client] = seat;
	}
	save();
	for (const p of phones.keys()) if (p !== [...phones.entries()].find(([, c]) => c === client)?.[0]) welcome(p);
	render();
}

/** Take someone out of the lobby (they left, or joined by mistake). */
function dropFromLobby(client: string) {
	if (!saved.net?.lobby) return;
	saved.net.lobby = saved.net.lobby.filter((e) => e.client !== client);
	save();
	for (const p of phones.keys()) welcome(p);
	render();
}

/** Move someone one place earlier round the circle. */
function lobbyUp(client: string) {
	const list = saved.net?.lobby;
	const i = list?.findIndex((e) => e.client === client) ?? -1;
	if (!list || i <= 0) return;
	[list[i - 1], list[i]] = [list[i], list[i - 1]];
	save();
	for (const p of phones.keys()) welcome(p);
	render();
}

function welcome(peer: string) {
	const client = phones.get(peer)!;
	const order = state.seats.length ? state.order.map((id) => state.seats[id].name) : lobby().map((e) => e.name);
	const mine = state.seats.length ? (seatOfClient(client) === null ? null : state.order.indexOf(seatOfClient(client)!)) : lobby().findIndex((e) => e.client === client);
	// Everyone's phone (and this one), so the lobby can talk before the game.
	sendTo(peer, { t: 'lobby', names: order, you: mine === -1 ? null : mine, peers: [link!.peer.id, ...phones.keys()] });
	const taken = new Set(Object.entries(claims()).filter(([c]) => c !== client).map(([, seat]) => seat));
	sendTo(peer, { t: 'welcome', room: link!.room, seats: state.order.map((id) => ({ id, name: state.seats[id].name, taken: taken.has(id) })), you: seatOfClient(client) });
	lastSent.delete(peer);
	updatePhones();
}

/** The clock the room is watching, if any, for the phones' own countdown. */
/** Which of the day's clocks the room is watching. */
function roomClockKey(): 'day' | 'nom' | 'speech' | null {
	if (state.phase.kind !== 'day') return null;
	return openNomination() && flow().speech ? 'speech' : state.day!.stage === 'discussion' ? 'day' : 'nom';
}
const CLOCK_LABEL = { day: 'Talk', nom: 'Nominate', speech: 'Speak' };

/** The village's clock: the room's, started or paused by a tap (the Storyteller's). */
const villageClock = {
	get() {
		const key = roomClockKey();
		const t = key ? timerOf(key) : null;
		if (!key || !t) return null;
		return { left: T.remaining(t, Date.now()), total: t.durationMs, running: T.running(t), label: CLOCK_LABEL[key] };
	},
	toggle() {
		const key = roomClockKey();
		const t = key ? timerOf(key) : null;
		if (key && t) setTimer(key, T.toggle(t, Date.now()));
	}
};

function roomClock(): ClockView | null {
	if (state.phase.kind !== 'day') return null;
	const f = flow();
	const key = openNomination() && f.speech ? 'speech' : state.day!.stage === 'discussion' ? 'day' : 'nom';
	const t = timerOf(key);
	if (!t) return null;
	const now = Date.now();
	return { label: key, remainingMs: T.remaining(t, now), running: T.running(t), sentAt: now, totalMs: t.durationMs };
}

/** Send every phone the circle, the clock and its own card, when they change. */
function updatePhones() {
	if (!link) return;
	const view = V.publicView(state);
	const clock = roomClock();
	const vote = voteView();
	for (const [peer, client] of phones) {
		const seat = seatOfClient(client);
		if (seat === null) continue;
		const card = state.seats[seat] ? V.cardFor(state, seat) : null;
		const news = JSON.stringify({ view, clock: clock && { ...clock, sentAt: 0, remainingMs: Math.round(clock.remainingMs / 1000) }, card, vote });
		if (lastSent.get(peer) === news) continue;
		lastSent.set(peer, news);
		sendTo(peer, { t: 'public', view, clock });
		sendTo(peer, { t: 'card', card });
		sendTo(peer, { t: 'vote', vote });
	}
}

function fromPhone(peer: string, msg: PlayerMsg) {
	switch (msg.t) {
		case 'hello': {
			phones.set(peer, msg.clientId);
			if (msg.name) joinLobby(msg.clientId, msg.name);
			welcome(peer);
			// Back mid-wake (the phone reloaded or lost signal): their pages again.
			const step = state.phase.kind === 'night' ? G.nextStep(state) : null;
			if (step && ui.remote && ui.remote.seat === step.seat && seatOfClient(msg.clientId) === step.seat) {
				sendTo(peer, { t: 'wake', wake: V.wakeFor(state, step, ui.remote.answered ? ui.draftInfo : null) });
			}
			break;
		}
		case 'claim': {
			const client = phones.get(peer);
			if (!client || !saved.net) return;
			const holder = Object.entries(saved.net.claims).find(([c, seat]) => seat === msg.seat && c !== client);
			if (holder) return sendTo(peer, { t: 'denied', reason: `${name(msg.seat)} is already taken. Ask the Storyteller to free it.` });
			saved.net.claims[client] = msg.seat;
			save();
			for (const p of phones.keys()) welcome(p);
			break;
		}
		case 'leave-seat': {
			const client = phones.get(peer);
			if (client && saved.net) delete saved.net.claims[client];
			save();
			for (const p of phones.keys()) welcome(p);
			break;
		}
		case 'answer': {
			const step = G.nextStep(state);
			if (!step || !ui.remote || ui.remote.wakeId !== msg.wakeId) return;
			if (G.stepAction(step.kind) === 'choose') {
				ui.remote = null;
				if (G.pickSpec(state, step.kind, step.seat).character) { ui.picks = [...msg.picks]; return render(); }
				act({ type: 'choose', targets: [...msg.picks] });
				return;
			}
			// The Fortune Teller or Ravenkeeper has chosen: now the Storyteller answers.
			ui.picks = [...msg.picks];
			ui.draftInfo = null;
			ui.remote = null;
			ui.message = `${name(step.seat!)} chose ${msg.picks.map(name).join(' and ')}. Choose the answer, then send it.`;
			break;
		}
		case 'village':
			village?.fromPhone(peer, msg.m);
			return;
		case 'nominate': {
			const by = seatOfPeer(peer);
			if (by === null) return;
			const why = nominationProblem(by, msg.nominee);
			if (why) return sendTo(peer, { t: 'note', text: why });
			if (!nomAsks.some((a) => a.by === by)) nomAsks.push({ by, nominee: msg.nominee });
			sendTo(peer, { t: 'note', text: 'Sent. The Storyteller will call it.' });
			village?.toast(`${name(by)} nominates ${name(msg.nominee)}`);
			break;
		}
		case 'hand': {
			const s = seatOfPeer(peer);
			if (s === null || !openNomination()) return;
			voteView();
			if (msg.up) phoneHands.add(s);
			else phoneHands.delete(s);
			break;
		}
		case 'done': {
			const step = G.nextStep(state);
			if (!step || !ui.remote || ui.remote.wakeId !== msg.wakeId) return;
			const action = G.stepAction(step.kind);
			ui.remote = null;
			if (action === 'acknowledge') return void act({ type: 'acknowledge' });
			if (action === 'tell' && ui.draftInfo) return void act({ type: 'tell', info: ui.draftInfo, override: ui.draftOverride });
			break;
		}
	}
	render();
}

/** Tries at taking back our own code after a reload, while the broker still holds the old one. */
let reclaimTries = 0;

function startHosting(room = saved.net?.room ?? newRoomCode()) {
	if (!saved.net || saved.net.room !== room) saved.net = { room, claims: saved.net?.claims ?? {}, village: saved.net?.village };
	save();
	link?.close();
	link = hostRoom(room, {
		message: fromPhone,
		joined: () => render(),
		left: (peer) => { phones.delete(peer); lastSent.delete(peer); render(); },
		status: (st, detail) => {
			linkStatus = st;
			linkDetail = detail ?? '';
			// Our code is still held (this phone reloaded and the broker has not let go yet):
			// keep asking for it for a while, so the players' phones find us again; then take a fresh one.
			if (st === 'error' && detail === 'unavailable-id') {
				link?.close();
				if (reclaimTries++ < 12) { linkStatus = 'connecting'; linkDetail = ''; setTimeout(() => startHosting(room), 2500); render(); return; }
				reclaimTries = 0;
				startHosting(newRoomCode());
				return;
			}
			if (st === 'open') reclaimTries = 0;
			render();
		}
	});
	linkStatus = 'connecting';
	if (saved.net?.village) villageOn();
	render();
}

/** Mode 2 inside the game: each seated phone walks the village. */
function villageOn() {
	if (!link || !saved.net) return;
	saved.net.village = true;
	save();
	const l = link;
	village = villageForGame({ peer: l.peer, send: (p, m) => sendTo(p, { t: 'village', m }), peers: () => [] }, () => openDrawer('actions'));
	villageShown = false;
	village.clock(villageClock);
	villageKey = '';
	syncVillage();
	render();
}

function villageOff() {
	village?.stop();
	village = null;
	villageShown = false;
	ui.tab = 'grimoire';
	if (saved.net) { saved.net.village = false; save(); }
	render();
}

/** Keep the village in step with the game: who is seated and alive, the phase, what the circle shows. */
function syncVillage() {
	if (!village || !link) return;
	const view = V.publicView(state);
	const list: { peer: string; name: string; seat: number; dead: boolean }[] = [];
	for (const [peer, client] of phones) {
		const seat = seatOfClient(client);
		if (seat === null || !link.peers.get(peer)?.open || !state.seats[seat]) continue;
		list.push({ peer, name: state.seats[seat].name, seat: state.order.indexOf(seat), dead: !(view.seats.find((s) => s.id === seat)?.alive ?? true) });
	}
	village.script(state.seats.length ? state.scriptId : ui.scriptId);
	// Before the first night the phones wait in the lobby, not in the town.
	village.seats(state.phase.kind === 'setup' ? [] : list);
	village.ring(state.order.map((id, i) => ({ seat: i, name: state.seats[id].name, dead: !(view.seats.find((s) => s.id === id)?.alive ?? true) })));
	// The game sets the village's phase when it moves on (the Storyteller may still ring the bell in between).
	const p = state.phase;
	const key = `${p.kind}:${p.kind === 'night' || p.kind === 'day' ? p.n : 0}:${state.day?.stage ?? ''}`;
	if (key !== villageKey) {
		villageKey = key;
		// The game begins at night. Before it, while the Storyteller deals, the town sits gathered
		// round the market cross at dusk; nominations, votes and the end are there too.
		village.phase(p.kind === 'night' ? 'night' : p.kind === 'over' || (p.kind === 'day' && state.day?.stage === 'nominations') ? 'circle' : p.kind === 'setup' ? 'dusk' : 'day');
	}
	// At night the Storyteller goes to whoever wakes next.
	const step = p.kind === 'night' ? G.nextStep(state) : null;
	const wakeKey = step ? `${state.phase.kind === 'night' ? state.phase.n : 0}:${step.id}` : '';
	if (wakeKey && wakeKey !== visitedWake) {
		const phone = step!.seat !== null ? peerOfSeat(step!.seat) : null;
		if (phone) { visitedWake = wakeKey; village.visit(phone); }
	}
	village.caption(circleCaption(view));
	const vv = voteView();
	const at = (id: SeatId) => state.order.indexOf(id);
	village.vote(vv && { nominee: at(vv.nominee), at: vv.voting && vv.at !== null ? at(vv.at) : null, raised: vv.raised.map(at), counted: vv.counted.map(at) });
	village.actions(villageActions());
}

/** The circle's middle: the day, the nominations and votes, the block. */
function circleCaption(v: V.PublicView): string[] {
	if (v.phase === 'over') return [v.winner === 'good' ? 'Good wins' : 'Evil wins'];
	if (v.phase !== 'day') return [];
	const alive = v.seats.filter((s) => s.alive).length;
	const lines = [`Day ${v.n} · ${alive} alive · ${Math.ceil(alive / 2)} to execute`];
	for (const n of v.nominations) lines.push(`${name(n.nominator)} nominates ${name(n.nominee)}${n.votes === null ? ': voting' : `: ${n.votes}`}`);
	if (v.executed !== null) lines.push(`${name(v.executed)} executed`);
	else if (v.block) lines.push(`On the block: ${name(v.block.seat)} (${v.block.votes})`);
	return lines;
}

function stopHosting() {
	village?.stop();
	village = null;
	link?.close();
	link = null;
	phones.clear();
	lastSent.clear();
	linkStatus = 'closed';
	if (saved.net) saved.net = undefined;
	save();
	render();
}

function joinUrl(room: string): string {
	return `${location.origin}${location.pathname}#join=${room}`;
}

function phonesScreen(): Row[] {
	const rows: Row[] = [settingsBack(), rubric('Players\u2019 phones')];
	if (!link) {
		rows.push(...prose('Link the players\u2019 phones to this one. Each player sees their own character, gets their night pages on their own phone, and sees the circle, the clock and the announcements. Nobody passes a phone around.', 'dim'));
		rows.push(...prose('Phones need internet (wifi or mobile data) to find each other.', 'dim'));
		rows.push(...buttonRows([btn('Open a room', () => startHosting(), { style: 'primary' })]));
		return rows;
	}
	const room = link.room;
	const status = linkStatus === 'open' ? 'Open' : linkStatus === 'connecting' ? 'Opening...' : `Trouble: ${linkDetail || linkStatus}`;
	rows.push(roomCodeRow(room), row(txt(center(status), linkStatus === 'open' ? 'good' : 'evil')));
	rows.push(...prose('Players open this app, choose Join a game, and type the code. Or scan:', 'dim'), endPanel());
	rows.push(row(txt(joinUrl(room).slice(0, INNER), 'gold')), ...prose(joinUrl(room).slice(INNER), 'gold'));
	rows.push(rubric('The village'));
	rows.push(...prose(village
		? 'On: every seated phone walks the village, with voices by distance. The game sets the day, the night, and dusk at the market cross for nominations and votes; at night you go to whoever wakes.'
		: 'Play in the village (mode 2): each seated player walks a top-down town on their phone and talks to whoever is near.', 'dim'));
	rows.push(...buttonRows(village
		? [btn('Open the village', () => village?.open(), { style: 'primary' }), btn('Turn off', villageOff, { style: 'quiet' })]
		: [btn('Play in the village', villageOn, { style: 'primary' })]), endPanel());
	rows.push(rubric('Seats'));
	const byseat = new Map<SeatId, string>();
	for (const [client, seat] of Object.entries(claims())) byseat.set(seat, client);
	const online = new Set([...phones.entries()].filter(([peer]) => link?.peers.get(peer)?.open).map(([, c]) => c));
	for (const id of state.order) {
		const client = byseat.get(id);
		const label = !client ? 'no phone' : online.has(client) ? 'linked' : 'away';
		rows.push({ segs: [txt(pad(state.seats[id].name, 16)), txt(pad(label, 10), !client ? 'dim' : online.has(client) ? 'good' : 'evil'),
			...(client ? [btn('Free', () => { delete saved.net!.claims[client]; save(); for (const p of phones.keys()) welcome(p); render(); }, { style: 'quiet' })] : [])] });
	}
	if (!state.seats.length) rows.push(...prose('Enter the players\u2019 names first; then they can each claim theirs.', 'dim'));
	const waiting = [...phones.values()].filter((c) => seatOfClient(c) === null).length;
	if (waiting) rows.push(...prose(`${waiting} phone${waiting === 1 ? '' : 's'} linked but not yet seated.`, 'gold'));
	rows.push(blank(), ...buttonRows([btn('Close the room', stopHosting, { style: 'danger' })]));
	return rows;
}

// ---- assembling the screen ----------------------------------------------------------------------

function screen(): Row[] {
	if (ui.reading) return readingPage();
	if (saved.net?.village && state.phase.kind === 'setup') {
		return state.seats.length ? draftScreen(['Lobby', () => { undo(); ui.message = ''; }]) : hostLobbyPage();
	}
	const p = state.phase;
	// Setting the table is a run of pages of its own, without the grimoire's tabs.
	if (p.kind === 'setup') return state.seats.length ? draftScreen(['The players', () => { ui.setup = 'players'; undo(); ui.message = ''; render(); }]) : namesScreen();
	const rows = header();
	if (ui.tab === 'log') return [...rows, ...logScreen()];
	if (ui.tab === 'ties') return [...rows, ...tiesScreen()];
	if (ui.tab === 'settings') return [...rows, ...settingsScreen()];
	if (ui.tab === 'options') return [...rows, ...optionsScreen()];
	if (ui.tab === 'phones') return [...rows, ...phonesScreen()];
	rows.push(...circleRows(), ...messageRows(), ...inspectRows(), ...actionRows());
	return rows;
}

/** The circle of seats, the moving of a seat, the key. */
function circleRows(): Row[] {
	const rows: Row[] = [];
	const p = state.phase;
	const step = p.kind === 'night' ? G.nextStep(state) : null;
	const alive = G.living(state).length;
	const caption: string[] = [];
	if (p.kind === 'night') {
		const nextUp = step ? (step.seat === null ? '' : `Next: ${name(step.seat)}`) : 'Dawn is coming';
		caption.push(`Night ${p.n}`, `${alive} alive`, nextUp);
	} else if (p.kind === 'day') {
		const day = state.day!;
		const clock = openNomination() && flow().speech ? 'speech' : day.stage === 'discussion' ? 'day' : 'nom';
		// Short lines: the middle of the circle is narrow on a phone.
		caption.push(`Day ${p.n}`, `${alive} alive`, `${Math.ceil(alive / 2)} to execute`,
			(day.executed !== null ? `${name(day.executed)} executed` : day.block !== null ? `Block: ${name(day.block)} (${day.highest})` : ''),
			'@timer:' + clock);
	} else if (p.kind === 'over') {
		caption.push(p.winner === 'good' ? 'Good wins' : 'Evil wins');
	}
	rows.push(...table((id) => ({
		...grimoireLook(id),
		style: ui.picks.includes(id) || (ui.rearrange && ui.moving === id) ? 'on' : step?.seat === id ? 'primary' : voteLook(id)
	}), caption));
	if (ui.rearrange) {
		const m = ui.moving;
		// One place round the circle: change places with the neighbour that way.
		const step = (dir: 1 | -1) => () => {
			if (m === null) return;
			const o = state.order, at = o.indexOf(m);
			void act({ type: 'swap-seats', a: m, b: o[(at + dir + o.length) % o.length] });
		};
		rows.push(rubric('Rearranging the circle'), ...prose(m === null ? 'Tap a player, then the seat they go to: the two change places.' : `${name(m)}: tap where they go, or walk them round.`, 'gold'),
			buttonBlock([btn('◄ Back one', step(-1), { disabled: m === null }), btn('On one ►', step(1), { disabled: m === null }), btn('Done', () => { ui.rearrange = false; ui.moving = null; render(); }, { style: 'primary' })]), endPanel());
	} else if (ui.moving !== null) {
		rows.push(rubric('Moving'), ...prose(`Tap the seat ${name(ui.moving)} moves to. The two players change places.`, 'gold'),
			...buttonRows([btn('Cancel', () => { ui.moving = null; render(); }, { style: 'quiet' })]), endPanel());
	} else {
		const tools: Button[] = [btn('Key', () => { ui.showKey = !ui.showKey; render(); }, { style: ui.showKey ? 'on' : 'quiet' })];
		if (state.phase.kind !== 'over') tools.push(btn('Rearrange seats', () => { ui.rearrange = true; ui.inspect = null; render(); }, { style: 'quiet' }));
		if (travellerCanJoin()) tools.push(btn('Traveller joins', travellerJoins, { style: 'quiet' }));
		rows.push(...buttonRows(tools));
	}
	if (ui.showKey) rows.push(blank(), ...legend());
	rows.push(blank());
	return rows;
}

/** What the Storyteller does next: the night's wakings, the day's business, the end. */
function actionRows(): Row[] {
	const rows: Row[] = [];
	const p = state.phase;
	if (p.kind === 'over') {
		rows.push(rubric(p.winner === 'good' ? 'Good Prevails' : 'Evil Prevails'), ...prose(p.reason, 'gold'));
		rows.push(...buttonRows([btn('New game', newGame, { style: 'primary' })]));
	} else if (p.kind === 'night') rows.push(...nightPanel());
	else rows.push(...dayPanel());
	rows.push(endPanel(), blank());
	return rows;
}


const villageGame = () => !!village && state.phase.kind !== 'setup';
let villageShown = false;
let lastKind = state.phase.kind;

function drawerScreen(): Row[] {
	if (ui.reading) return readingPage();
	const p = state.phase;
	const phase = p.kind === 'setup' ? 'Setting the Table' : p.kind === 'night' ? `Night ${p.n}` : p.kind === 'day' ? `Day ${p.n}` : 'Game over';
	const tab = ui.drawer ?? 'actions';
	const inSettings = tab === 'settings' || tab === 'options' || tab === 'phones';
	const rows: Row[] = [
		listRow(phase, 'rubric', [
			btn('Undo', undo, { disabled: !saved.marks.length, style: 'quiet' }),
			btn('To town', () => { ui.drawer = null; render(); }, { style: 'primary' })
		], COLS),
		tabStrip(DRAWER_TABS.map(([t, l]) => ({ label: l, on: t === 'settings' ? inSettings : ui.drawer === t, act: () => { ui.drawer = t; ui.confirmRestart = ''; render(); } })))
	];
	if (tab === 'log') return [...rows, ...logScreen()];
	if (tab === 'ties') return [...rows, ...tiesScreen()];
	if (tab === 'settings') return [...rows, ...settingsScreen()];
	if (tab === 'options') return [...rows, ...optionsScreen()];
	if (tab === 'phones') return [...rows, ...phonesScreen()];
	if (p.kind === 'setup') return state.seats.length ? draftScreen(['Lobby', () => { undo(); ui.message = ''; }]) : [...rows, ...namesScreen(), ...messageRows()];
	if (tab === 'actions') return [...rows, ...messageRows(), ...actionRows()];
	// The grimoire: the circle of seats and tokens, and whoever is tapped.
	return [...rows, ...circleRows(), ...messageRows(), ...inspectRows()];
}

const DRAWER_TABS: [DrawerTab, string][] = [['actions', 'Acts'], ['grimoire', 'Grim'], ['log', 'Log'], ['ties', 'Ties'], ['settings', 'Settings']];

/** Pull the drawer out on a page (from the village's bar: "Grimoire"). */
function openDrawer(t: DrawerTab = 'actions') {
	ui.drawer = t;
	render();
}

const root = document.getElementById('app')!;
const cardRoot = document.createElement('div');

/** Talking in the lobby: everyone in the room hears everyone, until the game begins. */
const lobbyVoice = new LobbyVoice(() => link?.peer ?? null, () => render());

function render() {
	if (lobbyVoice.voice) {
		if (state.phase.kind !== 'setup' || !link) lobbyVoice.stop();
		else lobbyVoice.setPeers([...phones.keys()]);
	}
	// The script sets the look (src/ui/theme.ts); the night is the leaf by candlelight, the day light.
	const theme = themeOf(state.seats.length ? state.scriptId : ui.scriptId);
	document.documentElement.dataset.phase = state.phase.kind === 'night' ? 'night' : 'day';
	document.documentElement.dataset.theme = theme;
	// The home page is the book shut, its leather cover; inside, the pages by night or day.
	setPalette(() => (ui.page === 'home' ? (ui.coverOpen ? 'folio' : 'cover') : bookKey(theme, state.phase.kind === 'night')));
	// A village game: the town is always there; the grimoire is a drawer over it.
	const vg = villageGame();
	if (vg && lastKind === 'setup' && state.phase.kind !== 'setup') ui.drawer = null;
	lastKind = state.phase.kind;
	if (vg && !villageShown) { villageShown = true; village!.open(); }
	if (!vg && villageShown) { village?.close(); villageShown = false; }
	if (ui.page === 'home') {
		paint(root, paneled(homeScreen()));
		paint(cardRoot, []);
		return;
	}
	// In the town the page layer is empty until the drawer is pulled out.
	paint(root, vg && !ui.drawer ? [] : paneled(vg ? drawerScreen() : screen()));
	const voting = state.phase.kind === 'day' && !!flow().vote && !!openNomination() && (villageGame() ? ui.voteBig : !ui.voteSmall);
	const pages = ui.banner ? bannerRows() : voting ? voteStage() : ui.show ? showRows() : [];
	paint(cardRoot, pages.length ? paneled(pages, CARD_COLS) : [], CARD_COLS);
	updatePhones();
	syncVillage();
	tick();
}

/** Update the clocks in place, without redrawing; buzz once when one runs out. */
const buzzed = new Set<string>();
function tick() {
	const now = Date.now();
	let running = false;
	for (const key of ['day', 'nom', 'speech'] as const) {
		const t = timerOf(key);
		if (!t) continue;
		running = true;
		const left = T.remaining(t, now);
		const id = key + ':' + flow().dayN + ':' + (state.day?.nominations.length ?? 0);
		if (left === 0 && T.running(t) && !buzzed.has(id)) {
			buzzed.add(id);
			try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
		}
	}
	if (running) redraw();
}
/** The clocks, drawn into the cells as they are laid out. */
const dynamicText = (d: Record<string, string>): string | null => {
	const t = d.timer ? timerOf(d.timer as 'day' | 'nom' | 'speech') : null;
	return t ? T.clock(T.remaining(t, Date.now())) : null;
};
setDynamic(dynamicText);
setInterval(tick, 250);

// A player's phone (#join=CODE, or "Join a game") runs the player app instead.
const joining = location.hash.match(/^#join(?:=([A-Za-z]{4}))?/);
const villageDemo = location.hash.match(/^#village(?:=([A-Za-z]{4}))?/);
if (villageDemo) {
	startVillage(root, (villageDemo[1] ?? '').toUpperCase());
} else if (joining) {
	startPlayer(root, cardRoot, (joining[1] ?? '').toUpperCase());
} else if ((location.hash === '#host' && saved.net?.village) || location.hash === '#grimoire') {
	syncFlow();
	render();
	if (saved.net) startHosting(saved.net.room);
} else {
	ui.page = 'home';
	if (location.hash) history.replaceState(null, '', location.pathname + location.search);
	render();
}

// A different page in the address (typed, a link, back or forward): open that page afresh.
window.addEventListener('hashchange', () => location.reload());
