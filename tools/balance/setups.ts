/**
 * What a game is dealt: characters by seat, and the table's house rules.
 * A Spec describes a family of setups; draw() deals one at random.
 */

export type Team = 'townsfolk' | 'outsider' | 'minion' | 'demon';

/**
 * Every character the simulator knows. Minions marked "blank" are on the
 * script for bluffs and counts, but their ability isn't modelled yet.
 */
export const TEAM: Record<string, Team> = {
	washerwoman: 'townsfolk', librarian: 'townsfolk', investigator: 'townsfolk', chef: 'townsfolk',
	empath: 'townsfolk', fortuneteller: 'townsfolk', undertaker: 'townsfolk', monk: 'townsfolk',
	ravenkeeper: 'townsfolk', virgin: 'townsfolk', slayer: 'townsfolk', soldier: 'townsfolk', mayor: 'townsfolk',
	knight: 'townsfolk', flowergirl: 'townsfolk', sage: 'townsfolk',
	butler: 'outsider', drunk: 'outsider', recluse: 'outsider', saint: 'outsider',
	poisoner: 'minion', spy: 'minion', scarletwoman: 'minion', baron: 'minion',
	assassin: 'minion', psychopath: 'minion', devilsadvocate: 'minion', witch: 'minion', mastermind: 'minion',
	cerenovus: 'minion', organgrinder: 'minion', fearmonger: 'minion', pithag: 'minion',
	imp: 'demon', po: 'demon', ojo: 'demon',
	// Homebrew under test.
	piedpiper: 'minion', piedpiper3: 'minion', piedpiper1: 'minion',
	piedpiperVoted: 'minion', piedpiperNom: 'minion', piedpiper1Voted: 'minion',
	ouroboros: 'demon', ouroborosSpiral: 'demon', ouroborosReset: 'demon', ouroborosSpiralSelf: 'demon',
	familiar: 'outsider', familiarWakes: 'outsider'
};

export const BLANK = new Set(['cerenovus', 'organgrinder', 'fearmonger', 'pithag']);

/** Who on the evil team learns who, on night 1. */
export type EvilKnow = 'all' | 'minionsKnowDemon' | 'demonKnowsMinions' | 'none';
/** majority: the usual. legion: fails if only evil voted. two: any 2 votes will do. */
export type Exec = 'majority' | 'legion' | 'two';

export interface Setup {
	/** Character by seat. */
	chars: string[];
	/** What the Drunk thinks they are, by seat. */
	thinks: (string | null)[];
	script: string[];
	evilKnow: EvilKnow;
	/** The good players learn each other. */
	goodKnow: boolean;
	exec: Exec;
	/** The Fortune Teller's red herring is a Minion, not a good player. */
	herringMinion: boolean;
}

/** force: characters put in play every game, replacing one of the same team. */
export type Spec =
	| { kind: 'tb'; n?: number; force?: string[] }
	| {
		kind: 'wolf';
		force?: string[];
		n: number;
		good: number;
		demons: number;
		evilKnow: EvilKnow;
		goodKnow: boolean;
		exec: Exec;
		town?: string[];
		minions?: string[];
		demonPool?: string[];
	};

export const TB = {
	town: ['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller', 'undertaker', 'monk', 'ravenkeeper', 'virgin', 'slayer', 'soldier', 'mayor'],
	outsiders: ['butler', 'drunk', 'recluse', 'saint'],
	minions: ['poisoner', 'spy', 'scarletwoman', 'baron'],
	demons: ['imp']
};

/** The Hour of the Wolf draft roster. */
export const WOLF = {
	town: ['slayer', 'fortuneteller', 'knight', 'flowergirl', 'sage', 'monk', 'soldier', 'undertaker'],
	minions: ['poisoner', 'witch', 'assassin', 'psychopath', 'devilsadvocate', 'scarletwoman', 'mastermind', 'cerenovus', 'organgrinder', 'fearmonger', 'pithag'],
	demons: ['imp', 'po', 'ojo']
};

/** Townsfolk, Outsiders, Minions by player count (the standard table). */
const COUNTS: Record<number, [number, number, number]> = {
	5: [3, 0, 1], 6: [3, 1, 1], 7: [5, 0, 1], 8: [5, 1, 1], 9: [5, 2, 1], 10: [7, 0, 2],
	11: [7, 1, 2], 12: [7, 2, 2], 13: [9, 0, 3], 14: [9, 1, 3], 15: [9, 2, 3]
};

export type Rng = () => number;

export function rng(seed: number): Rng {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function shuffle<T>(r: Rng, xs: T[]): T[] {
	const a = [...xs];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(r() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

export function draw(spec: Spec, r: Rng): Setup {
	const setup = spec.kind === 'tb' ? troubleBrewing(spec.n ?? 7 + Math.floor(r() * 9), r) : wolf(spec, r);
	for (const c of spec.force ?? []) force(setup, c, r);
	return setup;
}

/**
 * Put a character in play: it replaces a seat of its own team (an Outsider
 * with no Outsider seat replaces a Townsfolk). A forced Demon also takes
 * the other Demons off the script.
 */
function force(setup: Setup, c: string, r: Rng): void {
	if (setup.chars.includes(c)) return;
	const team = TEAM[c];
	let seats = setup.chars.map((_, i) => i).filter((i) => TEAM[setup.chars[i]] === team);
	if (!seats.length && team === 'outsider') seats = setup.chars.map((_, i) => i).filter((i) => TEAM[setup.chars[i]] === 'townsfolk');
	if (!seats.length) return;
	const at = seats[Math.floor(r() * seats.length)];
	setup.chars[at] = c;
	setup.thinks[at] = null;
	if (team === 'demon') {
		for (let i = 0; i < setup.chars.length; i++) if (TEAM[setup.chars[i]] === 'demon') setup.chars[i] = c;
		setup.script = setup.script.filter((x) => TEAM[x] !== 'demon');
	}
	setup.script.push(c);
}

function wolf(spec: Extract<Spec, { kind: 'wolf' }>, r: Rng): Setup {
	const town = shuffle(r, spec.town ?? WOLF.town).slice(0, spec.good);
	const minionCount = spec.n - spec.good - spec.demons;
	const pool = shuffle(r, spec.minions ?? WOLF.minions);
	const minions = Array.from({ length: minionCount }, (_, i) => pool[i % pool.length]);
	const demonPool = shuffle(r, spec.demonPool ?? WOLF.demons);
	const demons = Array.from({ length: spec.demons }, (_, i) => demonPool[i % demonPool.length]);
	const chars = shuffle(r, [...town, ...minions, ...demons]);
	return {
		chars,
		thinks: chars.map(() => null),
		script: [...(spec.town ?? WOLF.town), ...(spec.minions ?? WOLF.minions), ...(spec.demonPool ?? WOLF.demons)],
		evilKnow: spec.evilKnow,
		goodKnow: spec.goodKnow,
		exec: spec.exec,
		herringMinion: true
	};
}

function troubleBrewing(n: number, r: Rng): Setup {
	let [t, o, m] = COUNTS[n];
	const minions = shuffle(r, TB.minions).slice(0, m);
	if (minions.includes('baron')) { t -= 2; o += 2; }
	const town = shuffle(r, TB.town);
	const outsiders = shuffle(r, TB.outsiders).slice(0, o);
	const inPlay = town.slice(0, t);
	const chars = shuffle(r, [...inPlay, ...outsiders, ...minions, 'imp']);
	const fake = town[t];
	return {
		chars,
		thinks: chars.map((c) => (c === 'drunk' ? fake : null)),
		script: [...TB.town, ...TB.outsiders, ...TB.minions, ...TB.demons],
		evilKnow: n >= 7 ? 'all' : 'demonKnowsMinions',
		goodKnow: false,
		exec: 'majority',
		herringMinion: false
	};
}
