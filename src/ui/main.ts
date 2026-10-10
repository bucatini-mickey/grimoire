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
import { COLS, INNER, Canvas, blank, btn, buttonRows, center, endPanel, frameBottom, frameTop, paint, paneled, pad, row, rubric, rule, segWidth, txt, wrap } from './ascii.ts';
import type { Button, Row, Seg, Tone } from './ascii.ts';
import * as T from './timer.ts';
import { paletteCss, sprite, svg, towerScene } from './pixel.ts';
import { easelRows, wireEasel } from './easel.ts';
import * as V from '../net/views.ts';
import { hostRoom, newRoomCode } from '../net/link.ts';
import type { HostLink, LinkStatus } from '../net/link.ts';
import type { ClockView, HostMsg, PlayerMsg } from '../net/protocol.ts';
import { startPlayer } from './player.ts';
import qrcode from 'qrcode-generator';
import { CARD_COLS, CARD_INNER, big, cardButtons, nextPage, note, wakeRows } from './wakepages.ts';
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
	net?: { room: string; claims: Record<string, SeatId> };
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

type Tab = 'grimoire' | 'log' | 'ties' | 'art' | 'options' | 'phones';
type DayMode = 'none' | 'nominate' | 'slay';

const ui = {
	tab: 'grimoire' as Tab,
	picks: [] as SeatId[],
	inspect: null as SeatId | null,
	/** A player being moved: the next seat tapped changes places with them. */
	moving: null as SeatId | null,
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
	/** A wake sent to a player's phone and not yet finished. */
	remote: null as null | { wakeId: string; seat: SeatId; answered: boolean },
	names: 'Ada\nBram\nCael\nDorn\nEsme\nFenn\nGwen\nHal',
	confirmNew: false,
	seed: Date.now() % 100000,
	/** What the Storyteller has chosen to tell the woken player. */
	draftInfo: null as Info | null,
	/** The Storyteller insisted on telling a hale player a falsehood. */
	draftOverride: false,
	/** Composing an answer by hand rather than from the suggestions. */
	compose: false,
	composeChar: null as string | null,
	nonstandard: false
};

function clearPicks() {
	ui.picks = [];
	ui.inspect = null;
	ui.retoken = null;
	ui.draftInfo = null;
	ui.draftOverride = false;
	ui.composeChar = null;
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
		for (const l of b.lines) rows.push(...wrap(l, CARD_INNER).map((w) => row(txt(center(w, CARD_INNER), 'gold', 'heading'))));
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
	ui.show = null;
	clearPicks();
	syncFlow();
	save();
	render();
}

function newGame() {
	saved = { events: [], marks: [], settings: saved.settings, flow: freshFlow(saved.settings), net: saved.net ? { room: saved.net.room, claims: {} } : undefined };
	state = G.replay([]);
	save();
	ui.confirmNew = false;
	ui.message = '';
	ui.tab = 'grimoire';
	clearPicks();
	render();
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
	const R = 36; // ring radius, % of the ring's width
	const d = Math.min(17, ((2 * Math.PI * R) / n) * 0.66); // token diameter, same units
	const acts: (() => void)[] = [];
	const tokens = order.map((id, i) => {
		const s = state.seats[id];
		const l = look(id);
		const a = (2 * Math.PI * i) / n;
		const x = 50 + R * Math.sin(a);
		const y = 50 - R * Math.cos(a);
		// Shrink the words to fit the longest one on a line of its own.
		const longest = Math.max(...l.role.split(/\s+/).map((w) => w.length), 4);
		const rs = Math.min(0.2, 1.55 / longest);
		const flags = (l.flags.filter((f) => 't' in f) as { t: string; tone?: Tone }[])
			.map((f) => `<b class="t-${f.tone ?? 'plain'}">${escHtml(f.t)}</b>`).join('');
		const cls = ['tok', `tone-${l.roleTone}`, s.alive ? '' : 'dead', l.style === 'on' ? 'picked' : '', l.style === 'primary' ? 'lit' : ''].filter(Boolean).join(' ');
		acts.push(() => tapSeat(id));
		return `<button class="${cls}" data-act="${i}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;--d:${d.toFixed(2)};--rs:${rs.toFixed(3)}" aria-label="${escHtml(`${s.name}, ${l.role}${s.alive ? '' : ', dead'}`)}">`
			// Reminders sit inside the token, under the character, so they never crowd a neighbour.
			+ `<span class="tok-face"><span class="tok-role">${escHtml(l.role)}</span>`
			+ (l.reminders?.length ? `<span class="tok-rem">${l.reminders.slice(0, 2).map(escHtml).join('<br>')}</span>` : '')
			+ `${flags ? `<span class="tok-flags">${flags}</span>` : ''}</span>`
			+ `<span class="tok-name">${s.alive ? '' : '† '}${escHtml(s.name)}</span>`
			+ `</button>`;
	});
	// Captions arrive as markup (already escaped), so a live clock can sit among them.
	const middle = `<div class="ring-centre">${centre.map((c) => `<div class="ring-caption">${c}</div>`).join('')}</div>`;
	return [
		...frameTop(title),
		{ segs: [], cls: 'ring-row frame-mid', custom: { html: `<div class="ring">${middle}${tokens.join('')}</div>`, acts } },
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
	if (state.redHerring === id) flags.push(txt('R', 'gold'));
	// The Drunk shows as the Townsfolk they think they are, marked D.
	const shown = s.character === 'drunk' ? s.believes : s.character;
	// Reminders, as a Storyteller would lay small tokens beside the seat.
	const reminders: string[] = [];
	if (G.isPoisoned(state, id)) reminders.push('poisoned');
	if (state.night?.protectedSeat === id) reminders.push('safe');
	if (state.butlerMaster === id) reminders.push('master');
	if (state.redHerring === id) reminders.push('red herring');
	if (s.character === 'drunk') reminders.push('drunk');
	if (state.spent.includes(`${id}:slayer`)) reminders.push('shot used');
	if (state.spent.includes(`${id}:virgin`)) reminders.push('Virgin spent');
	if (!s.alive && !s.ghostVote) reminders.push('no vote');
	return { flags, role: charName(shown), roleTone: !s.alive ? 'dim' : s.character === 'drunk' ? 'drunk' : toneFor(s.character), reminders };
}

function legend(): Row[] {
	return [
		rubric('Key'),
		row(txt('†', 'dim'), txt(' dead      '), txt('×', 'dim'), txt(' vote spent  '), txt('P', 'poison'), txt(' poisoned')),
		row(txt('D', 'drunk'), txt(' the Drunk (shows who they think)')),
		row(txt('R', 'gold'), txt(' the red herring')),
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
		return playerPicks(k);
	}
	if (state.phase.kind === 'day') {
		if (flow().vote) return 0;
		if (ui.dayMode !== 'none') return 2;
	}
	return 0;
}

function tapSeat(id: SeatId) {
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
	const tab = (t: Tab, label: string) => btn(label, () => { ui.tab = t; render(); }, { style: ui.tab === t ? 'on' : undefined });
	return [
		{ segs: [txt('Grimoire', 'title')], cls: 'title' },
		row(txt(center(phase), 'rubric', 'heading')),
		...buttonRows([
			tab('grimoire', 'Grim'), tab('log', 'Log'), tab('ties', 'Ties'), tab('art', 'Art'), tab('options', 'Clock'), tab('phones', link ? 'Phones*' : 'Phones'),
			btn('Undo', undo, { disabled: !saved.marks.length, style: 'quiet' }),
			btn(ui.confirmNew ? 'Sure?' : 'New', () => { if (ui.confirmNew) newGame(); else { ui.confirmNew = true; render(); } }, { style: ui.confirmNew ? 'danger' : 'quiet' })
		], COLS, 0),
		blank()
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

function namesScreen(): Row[] {
	return [
		...art(), blank(),
		rubric('A player?'),
		...prose('If the Storyteller is running the game on their phone, join it from yours.', 'dim'),
		...buttonRows([btn('Join a game', () => { location.hash = '#join'; location.reload(); }, { style: 'primary' })]),
		endPanel(), blank(),
		rubric('The Players'),
		...prose('One name per line, in seating order, clockwise. 5 to 15 players.', 'dim'),
		{ segs: [], html: `<textarea id="names" rows="8" spellcheck="false" aria-label="Player names">${escapeHtml(ui.names)}</textarea>` },
		...buttonRows([btn('Choose the characters', () => {
			const names = ui.names.split('\n').map((s) => s.trim()).filter(Boolean);
			act({ type: 'create', names });
		}, { style: 'primary' })])
	];
}

function art(): Row[] {
	return [
		{ segs: [], cls: 'title-art', html: svg(sprite('tower') ?? [], 'title-tower') },
		row(txt(center('Blood on the Clocktower'), 'rubric', 'heading')),
		row(txt(center('a Storyteller\u2019s companion'), 'dim'))
	];
}

function escapeHtml(s: string) {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function draftCounts(d: Draft) {
	const sc = script();
	const want = G.expectedComposition(sc, state.seats.length, d.selected);
	const have = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
	for (const c of d.selected) have[G.charDef(sc, c).team]++;
	return { want, have };
}

function tapDraftSeat(id: SeatId) {
	const d = flow().draft!;
	if (ui.picks.length === 1 && ui.picks[0] !== id) {
		// Two seats: swap their tokens.
		const a = ui.picks[0];
		[d.placed[a], d.placed[id]] = [d.placed[id], d.placed[a]];
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
	d.bluffs = d.bluffs.filter((b) => !d.selected.includes(b));
	save();
	render();
}

function randomDraft() {
	const deal = G.randomDeal(script(), state.seats.length, ++ui.seed);
	flow().draft = {
		selected: [...deal.characters],
		placed: [...deal.characters],
		drunkBelieves: deal.drunkBelieves ?? null,
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
	d.redHerring = null;
	save();
	render();
}

function draftScreen(): Row[] {
	const d = flow().draft!;
	const sc = script();
	const n = state.seats.length;
	const { want, have } = draftCounts(d);
	const rows: Row[] = [rubric('Characters in Play')];
	const count = (label: string, k: keyof typeof want) =>
		[txt(`${label} `), txt(`${have[k]}/${want[k]}`, have[k] === want[k] ? 'good' : 'evil'), txt('  ')];
	rows.push(row(...count('Town', 'townsfolk'), ...count('Out', 'outsider'), ...count('Min', 'minion'), ...count('Dem', 'demon')));
	const teams: [string, G.Team][] = [['Townsfolk', 'townsfolk'], ['Outsiders', 'outsider'], ['Minions', 'minion'], ['Demon', 'demon']];
	for (const [label, team] of teams) {
		rows.push(row(txt(label, 'dim')));
		rows.push(...buttonRows(G.charactersOfTeam(sc, team).map((c) =>
			btn(c.name, () => tapDraftCharacter(c.id), { style: d.selected.includes(c.id) ? 'on' : undefined }))));
	}
	rows.push(...buttonRows([btn('Random set', randomDraft), btn('Clear', () => { flow().draft = emptyDraft(); save(); render(); }, { style: 'quiet' })]));

	rows.push(endPanel(), blank());
	rows.push(...table((id) => {
		const c = d.placed[id];
		const flags: Seg[] = [];
		if (c === 'drunk') flags.push(txt('D', 'drunk'));
		if (d.redHerring === id) flags.push(txt('R', 'gold'));
		const shown = c === 'drunk' ? d.drunkBelieves ?? 'drunk' : c;
		return { flags, role: c ? charName(shown) : '?', roleTone: c === 'drunk' ? 'drunk' : toneFor(c), style: ui.picks.includes(id) ? 'on' : undefined };
	}, [], 'The Seats'));
	rows.push(rubric('Placing'));
	rows.push(...prose(ui.picks.length ? `${name(ui.picks[0])}: tap a character above to seat it here, or another seat to swap.` : 'Tap a seat, then a character, to place it. Tap two seats to swap.', 'dim'));
	const unplaced = d.selected.filter((c) => !d.placed.includes(c));
	if (unplaced.length) rows.push(...prose(`Not yet seated: ${unplaced.map(charName).join(', ')}`, 'gold'));
	rows.push(...buttonRows([btn('Shuffle onto seats', shuffleDraft, { disabled: d.selected.length !== n })]));

	if (d.selected.includes('drunk')) {
		rows.push(blank(), rubric('The Drunk Thinks They Are'));
		rows.push(...buttonRows(G.charactersOfTeam(sc, 'townsfolk').filter((c) => !d.selected.includes(c.id)).map((c) =>
			btn(c.name, () => { d.drunkBelieves = c.id; save(); render(); }, { style: d.drunkBelieves === c.id ? 'on' : undefined }))));
	}
	if (d.selected.includes('fortune-teller') || d.drunkBelieves === 'fortune-teller') {
		rows.push(blank(), rubric('Red Herring'));
		const good = state.seats.filter((s) => d.placed[s.id] && G.teamAlignment(G.charDef(sc, d.placed[s.id]!).team) === 'good');
		rows.push(...buttonRows(good.map((s) =>
			btn(s.name, () => { d.redHerring = s.id; save(); render(); }, { style: d.redHerring === s.id ? 'on' : undefined }))));
	}
	if (G.evilLearnEachOther(n)) {
		rows.push(blank(), rubric(`Demon Bluffs ${d.bluffs.length}/3`));
		const pool = sc.characters.filter((c) => G.teamAlignment(c.team) === 'good' && !d.selected.includes(c.id));
		rows.push(...buttonRows(pool.map((c) => btn(c.name, () => {
			d.bluffs = d.bluffs.includes(c.id) ? d.bluffs.filter((b) => b !== c.id) : [...d.bluffs, c.id].slice(-3);
			save();
			render();
		}, { style: d.bluffs.includes(c.id) ? 'on' : undefined }))));
		rows.push(...buttonRows([btn('Random bluffs', () => {
			const rand = G.rng(++ui.seed);
			const p = pool.map((c) => c.id).filter((c) => c !== d.drunkBelieves);
			d.bluffs = p.sort(() => rand() - 0.5).slice(0, 3);
			save();
			render();
		})]));
	}

	rows.push(blank(), ...messageRows());
	const assign = (allowNonstandard: boolean): Command => ({
		type: 'assign',
		characters: d.placed.map((c) => c ?? ''),
		drunkBelieves: d.drunkBelieves ?? undefined,
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
	rows.push(...buttonRows([
		btn('Back to names', undo, { style: 'quiet' }),
		btn('Begin the first night', () => begin(false), { style: 'primary' }),
		...(ui.nonstandard ? [btn('Begin anyway', () => begin(true), { style: 'danger' })] : [])
	]));
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
const answerFirst = (kind: string) => G.stepAction(kind) === 'tell' && playerPicks(kind) === 0;

/** The character a step is about: the evil-team and reveal steps are about the player's own. */
const stepRole = (kind: string, seat: SeatId | null) => V.stepRole(state, kind, seat);

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
	rows.push(...prose(who ? `${who.name}, the ${charName(stepRole(kind, who.id))}${kind === G.REVEAL ? ' (sees their character)' : kind === G.MINION_INFO ? ' (learns their Demon)' : kind === G.DEMON_INFO ? ' (learns Minions and bluffs)' : ''}` : groupLabel(kind), 'gold'));
	if (who) {
		for (const f of flagsText(who.id)) rows.push(...prose(f, 'evil'));
		rows.push(...prose(G.charDef(script(), stepRole(kind, who.id)).ability, 'dim'));
		if (kind === 'spy' && G.isDroisoned(state, who.id)) rows.push(...prose('The Spy is poisoned, so what they see need not be true. The phone shows the true grimoire: show it, or tell them otherwise in person.', 'evil'));
	} else {
		rows.push(...prose(kind === G.MINION_INFO ? 'They wake together and learn who their Demon is.' : 'They learn their Minions, and three characters not in play.', 'dim'));
	}
	rows.push(blank());

	const hand = (page: Show['page'], label = 'Hand them the phone') =>
		btn(label, () => { ui.show = { step: step.id, page, picks: [], turn: 0 }; render(); }, { style: 'primary' });
	const need = playerPicks(kind);
	const action = G.stepAction(kind);

	// Their own phone, if they have one linked.
	const phone = step.seat !== null ? peerOfSeat(step.seat) : null;
	if (ui.remote && ui.remote.wakeId === V.wakeFor(state, step).id) {
		rows.push(...prose(ui.remote.answered ? `Waiting for ${who?.name} to finish reading...` : `Sent to ${who?.name}'s phone. Waiting for them...`, 'gold'));
		rows.push(...buttonRows([btn('Take it back', () => { if (phone) sendTo(phone, { t: 'sleep' }); ui.remote = null; render(); }, { style: 'quiet' })]));
		return rows;
	}
	const sendWake = (withAnswer: boolean) => btn(`Send to ${who?.name}'s phone`, () => {
		const w = V.wakeFor(state, step, withAnswer ? ui.draftInfo : null);
		ui.remote = { wakeId: w.id, seat: step.seat!, answered: withAnswer && !!need };
		sendTo(phone!, { t: 'wake', wake: w });
		render();
	}, { style: 'primary' });
	if (phone && !(action === 'tell' && (!need || ui.picks.length >= need))) rows.push(...buttonRows([sendWake(false)]));

	if (action === 'choose') {
		const t = ui.picks[0];
		rows.push(...buttonRows([hand('who')]));
		rows.push(...prose('Or tap their choice on the table:', 'dim'));
		rows.push(...buttonRows([btn(t === undefined ? 'Confirm choice' : `Confirm: ${name(t)}`, () => act({ type: 'choose', target: t }), { disabled: t === undefined })]));
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
	rows.push(blank(), ...buttonRows([btn('Skip', () => act({ type: 'skip', reason: 'Storyteller skipped' }), { style: 'quiet' })]));
	const later = steps.filter((s) => !s.done && s.id !== step.id).map((s) => (s.seat === null ? groupLabel(s.kind).split(':')[0] : `${name(s.seat)} (${charName(stepRole(s.kind, s.seat))})`));
	if (later.length) rows.push(blank(), ...prose(`Then: ${later.join(', ')}.`, 'dim'));
	return rows;
}

const LEAN_LABEL: Record<Lean, string> = { neutral: 'Neutral', good: 'Helps good', evil: 'Helps evil' };

/** The Storyteller choosing what an information role learns. */
function tellRows(kind: string, to: SeatId): Row[] {
	const rows: Row[] = [];
	const need = playerPicks(kind);
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
	turn: number;
}

function showRows(): Row[] {
	const sh = ui.show!;
	const step = G.nextStep(state);
	if (!step || step.id !== sh.step) { ui.show = null; return []; }
	const w = V.wakeFor(state, step, ui.draftInfo);
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
	if (action === 'choose') return void act({ type: 'choose', target: sh.picks[0] });
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
	rows.push(rubric('The block'), row(txt(center(blockText, INNER), day.block !== null || day.executed !== null ? 'evil' : 'dim')));

	const nom = openNomination();
	if (nom && f.speech) {
		rows.push(blank(), rubric(`${name(nom.nominator)} Nominates ${name(nom.nominee)}`));
		if (f.speech.stage === 'accusation' || f.speech.stage === 'defence') {
			const accusing = f.speech.stage === 'accusation';
			rows.push(timerRow('speech', accusing ? `${name(nom.nominator)} accuses` : `${name(nom.nominee)} defends`));
			rows.push(...timerControls('speech'));
			rows.push(blank(), ...buttonRows([
				accusing
					? btn('On to the defence', () => { f.speech = { stage: 'defence', timer: T.start(T.newTimer(saved.settings.defenceMs), Date.now()) }; save(); render(); }, { style: 'primary' })
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
			btn('Open nominations', () => {
				f.dayTimer = T.pause(f.dayTimer, Date.now());
				if (act({ type: 'open-nominations' })) { flow().nomTimer = T.start(flow().nomTimer, Date.now()); save(); render(); }
			}, { style: 'primary' }),
			btn('Slayer shot', () => { ui.dayMode = 'slay'; clearPicks(); render(); })
		]));
	} else {
		rows.push(rubric('Nominations'), timerRow('nom', 'Time left'), ...timerControls('nom'));
		rows.push(blank());
		if (ui.dayMode !== 'none') {
			rows.push(...dayPicker());
		} else {
			rows.push(...buttonRows([
				btn('Nominate', () => { ui.dayMode = 'nominate'; clearPicks(); render(); }, { disabled: day.executed !== null, style: 'primary' }),
				btn('Slayer shot', () => { ui.dayMode = 'slay'; clearPicks(); render(); }),
				btn('End the day', () => act({ type: 'end-day' }), { style: 'danger' })
			]));
		}
	}
	if (state.day!.stage === 'discussion' && ui.dayMode !== 'none') rows.push(...dayPicker());
	if (day.nominations.length) {
		rows.push(blank(), rubric('Today'));
		for (const n of day.nominations) {
			const v = n.votes === null ? '' : `${n.votes} vote${n.votes === 1 ? '' : 's'}`;
			rows.push(row(txt(pad(`${name(n.nominator)} » ${name(n.nominee)}`, 30)), txt(v, 'dim')));
		}
	}
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
	const candidates = first === undefined
		? order.filter((id) => state.seats[id].alive && (!nominating || !day.nominations.some((n) => n.nominator === id)))
		: order.filter((id) => (nominating ? !day.nominations.some((n) => n.nominee === id) : id !== first));
	const prompt = first === undefined
		? (nominating ? 'Who nominates?' : 'Who takes the shot?')
		: (nominating ? `${name(first)} nominates...` : `${name(first)} shoots at...`);
	return [
		rubric(nominating ? 'Nomination' : 'The Slayer\u2019s shot'),
		...prose(prompt, 'gold'),
		...buttonRows(candidates.map((id) => btn(state.seats[id].name, () => tapSeat(id), { width: 10, style: ui.picks.includes(id) ? 'on' : undefined })), INNER, 0),
		...buttonRows([btn(first === undefined ? 'Cancel' : 'Back', () => { if (first === undefined) ui.dayMode = 'none'; clearPicks(); render(); }, { style: 'quiet' })])
	];
}

function startVote() {
	const f = flow();
	const nom = openNomination()!;
	f.speech = { stage: 'vote', timer: T.pause(f.speech!.timer, Date.now()) };
	const order = G.voteOrder(state, nom.nominee);
	f.vote = { order, index: 0, hands: [] };
	ui.voteSmall = false;
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
	rows.push(row(txt(center(`${v.hands.length} hand${v.hands.length === 1 ? '' : 's'} up`), 'gold')));
	rows.push(blank());
	if (v.index < v.order.length) {
		const id = v.order[v.index];
		const s = state.seats[id];
		const note = s.alive ? '' : ' (spends their ghost vote)';
		const butler = G.hasWorkingAbility(state, id, 'butler') && state.butlerMaster !== null
			? ` Butler: only if ${name(state.butlerMaster)} votes.` : '';
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
	const rows: Row[] = [rubric(`${name(nom.nominator)} nominates`), ...big(name(nom.nominee)),
		...note(`${needed} needed${highest ? `, and more than ${highest}` : ''}`),
		row(txt(center(`${v.hands.length} raised`, CARD_INNER), 'gold', 'heading'))];
	const marks = v.order.map((id, i) => {
		const mark = !G.canVote(state, id) ? '-' : v.hands.includes(id) ? '+' : i < v.index ? '.' : i === v.index ? '?' : ' ';
		return [txt(mark, mark === '+' ? 'good' : mark === '?' ? 'gold' : 'dim'), txt(pad(state.seats[id].name.slice(0, 4), 5), state.seats[id].alive ? undefined : 'dim')];
	});
	for (let i = 0; i < marks.length; i += 3) rows.push(row(...marks.slice(i, i + 3).flat()));
	if (v.index < v.order.length) {
		const id = v.order[v.index];
		const s = state.seats[id];
		rows.push(rubric('Now'), ...big(s.name));
		if (!s.alive) rows.push(...note('(spends their ghost vote)'));
		if (G.hasWorkingAbility(state, id, 'butler') && state.butlerMaster !== null) rows.push(...note(`Butler: only if ${name(state.butlerMaster)} votes`));
		rows.push(endPanel(), { segs: [], cls: 'giants-row', custom: { html: '<div class="giants"><button class="giant up" data-act="0">Hand<br>raised</button><button class="giant down" data-act="1">No<br>hand</button></div>', acts: [() => answerVote(true), () => answerVote(false)] } });
	} else {
		rows.push(rubric('The count'), ...big(`${v.hands.length} hand${v.hands.length === 1 ? '' : 's'}`), endPanel(),
			{ segs: [], cls: 'giants-row', custom: { html: '<div class="giants"><button class="giant up" data-act="0">Record<br>the vote</button></div>', acts: [recordVote] } });
	}
	rows.push(blank(), ...cardButtons([
		btn('Back', () => { v.index = Math.max(0, v.index - 1); while (v.index > 0 && !G.canVote(state, v.order[v.index])) v.index--; save(); render(); }, { style: 'quiet', disabled: v.index === 0 }),
		btn('Small view', () => { ui.voteSmall = true; render(); }, { style: 'quiet' })
	]));
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
	if (state.butlerMaster === id) rows.push(...prose('The Butler’s master.', 'dim'));
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
			btn('Move seat', () => { ui.moving = id; ui.inspect = null; render(); })
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

function optionsScreen(): Row[] {
	const st = saved.settings;
	const rows: Row[] = [rubric('The Clocks')];
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
function sendTo(peer: string, msg: HostMsg) {
	link?.send(peer, msg);
}
function toPlayers(msg: HostMsg) {
	for (const [peer, client] of phones) if (seatOfClient(client) !== null) sendTo(peer, msg);
}

function welcome(peer: string) {
	const client = phones.get(peer)!;
	const taken = new Set(Object.entries(claims()).filter(([c]) => c !== client).map(([, seat]) => seat));
	sendTo(peer, { t: 'welcome', room: link!.room, seats: state.order.map((id) => ({ id, name: state.seats[id].name, taken: taken.has(id) })), you: seatOfClient(client) });
	lastSent.delete(peer);
	updatePhones();
}

/** The clock the room is watching, if any, for the phones' own countdown. */
function roomClock(): ClockView | null {
	if (state.phase.kind !== 'day') return null;
	const f = flow();
	const key = openNomination() && f.speech ? 'speech' : state.day!.stage === 'discussion' ? 'day' : 'nom';
	const t = timerOf(key);
	if (!t) return null;
	const now = Date.now();
	return { label: key, remainingMs: T.remaining(t, now), running: T.running(t), sentAt: now };
}

/** Send every phone the circle, the clock and its own card, when they change. */
function updatePhones() {
	if (!link) return;
	const view = V.publicView(state);
	const clock = roomClock();
	for (const [peer, client] of phones) {
		const seat = seatOfClient(client);
		if (seat === null) continue;
		const card = state.seats[seat] ? V.cardFor(state, seat) : null;
		const news = JSON.stringify({ view, clock: clock && { ...clock, sentAt: 0, remainingMs: Math.round(clock.remainingMs / 1000) }, card });
		if (lastSent.get(peer) === news) continue;
		lastSent.set(peer, news);
		sendTo(peer, { t: 'public', view, clock });
		sendTo(peer, { t: 'card', card });
	}
}

function fromPhone(peer: string, msg: PlayerMsg) {
	switch (msg.t) {
		case 'hello':
			phones.set(peer, msg.clientId);
			welcome(peer);
			break;
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
				act({ type: 'choose', target: msg.picks[0] });
				return;
			}
			// The Fortune Teller or Ravenkeeper has chosen: now the Storyteller answers.
			ui.picks = [...msg.picks];
			ui.draftInfo = null;
			ui.remote = null;
			ui.message = `${name(step.seat!)} chose ${msg.picks.map(name).join(' and ')}. Choose the answer, then send it.`;
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

function startHosting(room = saved.net?.room ?? newRoomCode()) {
	if (!saved.net || saved.net.room !== room) saved.net = { room, claims: saved.net?.claims ?? {} };
	save();
	link?.close();
	link = hostRoom(room, {
		message: fromPhone,
		joined: () => render(),
		left: (peer) => { phones.delete(peer); lastSent.delete(peer); render(); },
		status: (st, detail) => {
			linkStatus = st;
			linkDetail = detail ?? '';
			// Someone else holds this code (an old tab, say): take a fresh one.
			if (st === 'error' && detail === 'unavailable-id') { link?.close(); startHosting(newRoomCode()); return; }
			render();
		}
	});
	linkStatus = 'connecting';
	render();
}

function stopHosting() {
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
	const rows: Row[] = [rubric('Players\u2019 phones')];
	if (!link) {
		rows.push(...prose('Link the players\u2019 phones to this one. Each player sees their own character, gets their night pages on their own phone, and sees the circle, the clock and the announcements. Nobody passes a phone around.', 'dim'));
		rows.push(...prose('Phones need internet (wifi or mobile data) to find each other.', 'dim'));
		rows.push(...buttonRows([btn('Open a room', () => startHosting(), { style: 'primary' })]));
		return rows;
	}
	const room = link.room;
	const status = linkStatus === 'open' ? 'Open' : linkStatus === 'connecting' ? 'Opening...' : `Trouble: ${linkDetail || linkStatus}`;
	rows.push(row(txt(center(room), 'gold', 'heading')), row(txt(center(status), linkStatus === 'open' ? 'good' : 'evil')));
	rows.push(...prose('Players open this app, choose Join a game, and type the code. Or scan:', 'dim'), endPanel());
	const qr = qrcode(0, 'M');
	qr.addData(joinUrl(room));
	qr.make();
	rows.push({ segs: [], cls: 'qr-row', html: `<div class="qr">${qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}</div>` });
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
	const rows = header();
	if (ui.tab === 'log') return [...rows, ...logScreen()];
	if (ui.tab === 'ties') return [...rows, ...tiesScreen()];
	if (ui.tab === 'options') return [...rows, ...optionsScreen()];
	if (ui.tab === 'phones') return [...rows, ...phonesScreen()];
	if (ui.tab === 'art') return [...rows, ...easelRows(script().characters.map((c) => ({ id: c.id, name: c.name })), render)];
	const p = state.phase;
	if (p.kind === 'setup') return [...rows, ...(state.seats.length ? draftScreen() : [...namesScreen(), ...messageRows()])];

	const step = p.kind === 'night' ? G.nextStep(state) : null;
	const alive = G.living(state).length;
	const caption: string[] = [];
	if (p.kind === 'night') {
		const nextUp = step ? (step.seat === null ? '' : `Next: ${name(step.seat)}`) : 'Dawn is coming';
		caption.push(`Night ${p.n}`, `${alive} alive`, escHtml(nextUp));
	} else if (p.kind === 'day') {
		const day = state.day!;
		const clock = openNomination() && flow().speech ? 'speech' : day.stage === 'discussion' ? 'day' : 'nom';
		caption.push(`Day ${p.n}`, `${alive} alive \u00b7 ${Math.ceil(alive / 2)} to execute`,
			escHtml(day.executed !== null ? `${name(day.executed)} executed` : day.block !== null ? `Block: ${name(day.block)} (${day.highest})` : 'Nobody on the block'),
			`<span class="ring-clock" data-timer="${clock}"></span>`);
	} else if (p.kind === 'over') {
		caption.push(p.winner === 'good' ? 'Good wins' : 'Evil wins');
	}
	rows.push(...table((id) => ({
		...grimoireLook(id),
		style: ui.picks.includes(id) ? 'on' : step?.seat === id ? 'primary' : voteLook(id)
	}), caption));
	if (ui.moving !== null) {
		rows.push(rubric('Moving'), ...prose(`Tap the seat ${name(ui.moving)} moves to. The two players change places.`, 'gold'),
			...buttonRows([btn('Cancel', () => { ui.moving = null; render(); }, { style: 'quiet' })]), endPanel());
	}
	rows.push(blank(), ...legend(), blank(), ...messageRows(), ...inspectRows());
	if (p.kind === 'over') {
		rows.push(rubric(p.winner === 'good' ? 'Good Prevails' : 'Evil Prevails'), ...prose(p.reason, 'gold'));
		rows.push(...buttonRows([btn('New game', newGame, { style: 'primary' })]));
	} else if (p.kind === 'night') rows.push(...nightPanel());
	else rows.push(...dayPanel());
	rows.push(endPanel(), blank());
	return rows;
}

const root = document.getElementById('app')!;
const cardRoot = document.getElementById('card')!;

function render() {
	document.documentElement.dataset.phase = state.phase.kind === 'night' ? 'night' : 'day';
	paint(root, paneled(screen()));
	const voting = state.phase.kind === 'day' && !!flow().vote && !!openNomination() && !ui.voteSmall;
	const pages = ui.banner ? bannerRows() : voting ? voteStage() : ui.show ? showRows() : [];
	cardRoot.hidden = !pages.length;
	if (pages.length) paint(cardRoot, paneled(pages, CARD_COLS));
	cardRoot.classList.toggle('announce', !!ui.banner);
	updatePhones();
	tick();
}

/** Update the clocks in place, without redrawing; buzz once when one runs out. */
const buzzed = new Set<string>();
function tick() {
	const now = Date.now();
	for (const el of document.querySelectorAll<HTMLElement>('[data-timer]')) {
		const key = el.dataset.timer as 'day' | 'nom' | 'speech';
		const t = timerOf(key);
		if (!t) continue;
		const left = T.remaining(t, now);
		el.textContent = T.clock(left);
		el.classList.toggle('expired', left === 0);
		el.classList.toggle('paused', !T.running(t) && left > 0);
		const id = `${key}:${flow().dayN}:${state.day?.nominations.length ?? 0}`;
		if (left === 0 && T.running(t) && !buzzed.has(id)) {
			buzzed.add(id);
			try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
		}
	}
}
setInterval(tick, 250);

// The pixel inks, as CSS, once.
const inks = document.createElement('style');
inks.textContent = paletteCss();
document.head.appendChild(inks);
wireEasel(root, () => render());

root.addEventListener('input', (ev) => {
	const t = ev.target as HTMLTextAreaElement;
	if (t.id === 'names') ui.names = t.value;
});

// A player's phone (#join=CODE, or "Join a game") runs the player app instead.
const joining = location.hash.match(/^#join(?:=([A-Za-z]{4}))?/);
if (joining) {
	startPlayer(root, cardRoot, (joining[1] ?? '').toUpperCase());
} else {
	syncFlow();
	render();
	if (saved.net) startHosting(saved.net.room);
}
