/**
 * One game, played by bots. Not the Grimoire engine: a lighter model built
 * for speed, where every bot keeps a belief over who is evil and who is the
 * Demon, and nominates, votes, kills and protects from that belief.
 *
 * What a bot learns:
 *  - its own seat, and its team if the setup tells it (worlds.ts restrict);
 *  - clues from info characters, true unless drunk, poisoned or misregistered;
 *  - claims: in a good-majority game good players publish their clues, and
 *    evil players publish fake ones; a claim only counts if the claimant is good;
 *  - night deaths (the Demon rarely kills its own) and "the game went on";
 *  - a daily social read on every living player: everything people pick up
 *    talking at a table.
 *
 * One knob, skill (0-1), sets how well the whole table plays: how much bots
 * trust clues, how sharp their reads are, how often they misvote or
 * nominate on a whim. It is calibrated so Trouble Brewing comes out 50/50,
 * then the same table plays every other layout.
 */
import { Belief, evidence, has, popcount, worlds, type Test, type Worlds } from './world.ts';
import { TEAM, type Rng, type Setup } from './setups.ts';

export interface Knobs {
	/** How well the table plays, 0-1. */
	skill: number;
}

export interface Outcome {
	good: boolean;
	days: number;
	why: string;
}

interface Seat {
	char: string;
	evil: boolean;
	alive: boolean;
	ghostVote: boolean;
	/** The Drunk: thinks it is `thinks`. */
	drunk: boolean;
	thinks: string;
	poisonedNight: number;
	cursedDay: number;
	used: boolean;
	/** Follows the Pied Piper. */
	follows: boolean;
	/** The last day this follower was made to vote with the Piper. */
	withPiper: number;
	/** A Familiar who has worked out they are good. */
	woke: boolean;
}

type World = { E: number; D: number };

export function play(setup: Setup, knobs: Knobs, r: Rng): Outcome {
	return new Game(setup, knobs, r).run();
}

class Game {
	r: Rng;
	s: Setup;
	k: Knobs;
	n: number;
	seats: Seat[];
	W: Worlds;
	bel: Belief[];
	evilMask = 0;
	/** Demon seats as the bots' worlds see them: a passed-on Demon leaves this set. */
	demons = 0;
	night = 0;
	day = 0;
	eps: number;
	/** Clues count this much (likelihoods are raised to this power). */
	trust: number;
	/** Chance a social read is right. */
	acc: number;
	/** Chance of a careless vote or nomination. */
	noise: number;
	publish: boolean;
	blindKills: boolean;
	herring = -1;
	monkTarget = -1;
	advocateTarget = -1;
	poCharged = false;
	masterDay = -1;
	voted = 0;
	executed = -1;
	/** Average suspicion the good players hold of each seat, refreshed daily. */
	townSusp: Float64Array;
	over: Outcome | null = null;
	/** Pied Piper: the town knows who the Piper is once anyone follows. */
	piperKnown = false;
	/** Ouroboros: per Demon seat, the measure of its last kill. */
	ouroLast = new Map<number, number>();
	/** Night deaths so far, in order: the town reads the Ouroboros pattern from them. */
	victims: number[] = [];

	constructor(setup: Setup, knobs: Knobs, r: Rng) {
		this.r = r;
		this.s = setup;
		this.k = knobs;
		this.n = setup.chars.length;
		this.seats = setup.chars.map((char, i) => ({
			char,
			evil: TEAM[char] === 'minion' || TEAM[char] === 'demon',
			alive: true,
			ghostVote: true,
			drunk: char === 'drunk',
			thinks: setup.thinks[i] ?? char,
			poisonedNight: -1,
			cursedDay: -1,
			used: false,
			follows: false,
			withPiper: -1,
			woke: false
		}));
		this.seats.forEach((x, i) => {
			if (x.evil) this.evilMask |= 1 << i;
			if (TEAM[x.char] === 'demon') this.demons |= 1 << i;
		});
		this.W = worlds(this.n, popcount(this.evilMask), popcount(this.demons));
		const script = new Set(setup.script);
		this.trust = 0.15 + 0.85 * knobs.skill;
		this.acc = 0.5 + 0.2 * knobs.skill;
		this.noise = 0.4 * (1 - knobs.skill);
		this.eps = script.has('poisoner') || script.has('drunk') ? 0.2 : 0.05;
		const goods = this.n - popcount(this.evilMask);
		this.publish = goods > this.n - goods;
		this.blindKills = setup.evilKnow === 'none' || setup.evilKnow === 'minionsKnowDemon';
		this.townSusp = new Float64Array(this.n);
		this.bel = this.seats.map((_, i) => this.knowledge(i));
		const ft = this.seats.findIndex((_, i) => this.role(i) === 'fortuneteller');
		if (ft >= 0) {
			const pool = this.seats.map((_, i) => i).filter((i) => i !== ft && (setup.herringMinion ? this.minion(i) : !this.seats[i].evil));
			if (pool.length) this.herring = this.pick(pool);
		}
	}

	run(): Outcome {
		while (!this.over) {
			this.night++;
			this.nightPhase();
			if (this.over) break;
			this.day = this.night;
			this.dayPhase();
			if (this.day > 25) this.end(false, 'stalemate');
		}
		return this.over!;
	}

	// ---- knowledge ----------------------------------------------------------

	private knowledge(i: number): Belief {
		const b = new Belief(this.W);
		const me = this.seats[i];
		const E = this.evilMask;
		const D = this.demons;
		const isDemon = has(D, i);
		b.restrict((e, d) => has(e, i) === me.evil && has(d, i) === isDemon);
		const know = this.s.evilKnow;
		if (me.evil) {
			if (know === 'all') b.restrict((e, d) => e === E && d === D);
			if (know === 'minionsKnowDemon' && !isDemon) b.restrict((_, d) => d === D);
			if (know === 'demonKnowsMinions' && isDemon) b.restrict((e) => e === E);
		} else if (isFamiliar(me.char)) {
			// Thinks they are a Minion; truly learns the Demon.
			b.restrict((_, d) => d === D);
		} else if (this.s.goodKnow) {
			b.restrict((e) => e === E);
		}
		return b;
	}

	private role(i: number): string {
		return this.seats[i].drunk ? this.seats[i].thinks : this.seats[i].char;
	}

	private minion(i: number): boolean {
		return TEAM[this.seats[i].char] === 'minion';
	}

	/** Plays for evil: evil, or a Familiar who still thinks they are a Minion. */
	private evilMinded(i: number): boolean {
		const x = this.seats[i];
		return x.evil || (isFamiliar(x.char) && !x.woke);
	}

	private piper(): number {
		return this.seats.findIndex((x) => x.char.startsWith('piedpiper'));
	}

	/** Has this character, alive or dead, sober and healthy. */
	private works(i: number): boolean {
		const x = this.seats[i];
		return !x.drunk && x.poisonedNight !== this.night;
	}

	private find(char: string): number {
		return this.seats.findIndex((x) => x.char === char);
	}

	private living(): number[] {
		return this.seats.map((_, i) => i).filter((i) => this.seats[i].alive);
	}

	private aliveMask(): number {
		let m = 0;
		this.seats.forEach((x, i) => { if (x.alive) m |= 1 << i; });
		return m;
	}

	private pick<T>(xs: T[]): T {
		return xs[Math.floor(this.r() * xs.length)];
	}

	/** The world as the Storyteller's checks see it: Spy and Recluse may misregister. */
	private registered(): World {
		let E = this.evilMask;
		let D = this.demons;
		const spy = this.find('spy');
		if (spy >= 0 && this.works(spy) && this.r() < 0.5) E &= ~(1 << spy);
		const rec = this.find('recluse');
		if (rec >= 0 && this.works(rec) && this.r() < 0.5) {
			E |= 1 << rec;
			if (this.r() < 0.3) D |= 1 << rec;
		}
		return { E, D };
	}

	/** A plausible wrong world, for false information to the drunk and poisoned. */
	private fakeWorld(holder: number): World {
		const others = this.seats.map((_, i) => i).filter((i) => i !== holder);
		const ev = shuffleIn(this.r, others).slice(0, this.W.e);
		const dm = shuffleIn(this.r, ev).slice(0, this.W.d);
		return { E: maskOf(ev), D: maskOf(dm) };
	}

	// ---- beliefs ------------------------------------------------------------

	private marg(i: number) {
		return this.bel[i].marginals();
	}

	/**
	 * How much bot i wants seat t dead. Good: the Demon above all, Minions a
	 * little when the town is the majority. Evil: good players, never the Demon.
	 */
	private want(i: number, t: number): number {
		const m = this.marg(i);
		if (!this.evilMinded(i)) {
			let v = m.demon[t] + (this.publish ? 0.35 * m.evil[t] : 0.02 * m.evil[t]);
			// Executing the Piper kills his followers: the town weighs the cost.
			if (this.piperKnown && t === this.piper()) {
				const goodFollowers = this.seats.filter((x) => x.follows && x.alive && !x.evil).length;
				v -= 0.12 * goodFollowers;
			}
			return v;
		}
		return 1 - m.evil[t] - 2 * m.demon[t] + 0.3 * this.townSusp[t];
	}

	private top(i: number, among: number[], score: (t: number) => number): number {
		let best = -1;
		let bestScore = -Infinity;
		for (const t of among) {
			if (t === i) continue;
			const v = score(t) + this.r() * 1e-6;
			if (v > bestScore) { bestScore = v; best = t; }
		}
		return best;
	}

	/** Share a clue: with everyone as a public claim, or only with known good partners. */
	private share(holder: number, test: Test, eps: number): void {
		const L = evidence(this.W, test, eps, holder);
		for (let h = 0; h < L.length; h++) L[h] *= this.trust;
		if (this.publish) {
			for (const b of this.bel) b.apply(L);
			return;
		}
		this.bel[holder].apply(L);
		if (this.s.goodKnow) this.seats.forEach((x, i) => { if (!x.evil && i !== holder) this.bel[i].apply(L); });
	}

	/** Evil bluffs a clue that frames good players. Only in a good-majority game. */
	private fakeClaim(i: number): void {
		const goods = this.seats.map((_, j) => j).filter((j) => !this.seats[j].evil && this.seats[j].alive && j !== i);
		if (goods.length < 2) return;
		const [a, b] = shuffleIn(this.r, goods);
		const test: Test = this.r() < 0.5
			? (_, d) => has(d, a) || has(d, b)
			: (e, d) => has(e & ~d, a) || has(e & ~d, b);
		const L = evidence(this.W, test, this.eps, i);
		for (let h = 0; h < L.length; h++) L[h] *= this.trust;
		for (const x of this.bel) x.apply(L);
	}

	private socialReads(): void {
		const acc = this.acc;
		const yes = Math.log(acc / (1 - acc));
		const live = this.living();
		const delta = new Float64Array(this.n);
		for (const i of live) {
			if (this.seats[i].evil && this.s.evilKnow === 'all') continue;
			delta.fill(0);
			for (const t of live) {
				if (t === i) continue;
				const looksEvil = this.r() < (this.seats[t].evil ? acc : 1 - acc);
				delta[t] = looksEvil ? yes : -yes;
			}
			this.bel[i].applyReads(delta);
		}
	}

	/**
	 * What the room suspects: the average belief of every living player who
	 * talks openly. Players with private certainty (an evil team that knows
	 * itself, good players who know each other) keep it to themselves.
	 */
	private refreshTown(): void {
		this.townSusp.fill(0);
		const open = this.living().filter((i) => (this.seats[i].evil ? this.s.evilKnow !== 'all' : !this.s.goodKnow));
		if (!open.length) return;
		for (const g of open) {
			const m = this.marg(g);
			for (let t = 0; t < this.n; t++) this.townSusp[t] += m.evil[t] / open.length;
		}
	}

	// ---- night --------------------------------------------------------------

	private nightPhase(): void {
		const first = this.night === 1;
		const live = this.living();
		for (const i of live) {
			const c = this.seats[i].char;
			if (c === 'poisoner' && this.works(i)) this.seats[this.evilTarget(i, live)].poisonedNight = this.night;
			if (c === 'witch' && this.works(i)) this.seats[this.evilTarget(i, live)].cursedDay = this.night;
			if (c.startsWith('piedpiper') && this.works(i)) {
				const cap = c === 'piedpiper3' ? 3 : c === 'piedpiper1' || c === 'piedpiper1Voted' ? 1 : Infinity;
				const following = this.seats.filter((x) => x.follows && x.alive).length;
				const free = live.filter((t) => t !== i && !this.seats[t].follows);
				if (following < cap && free.length) {
					const t = this.evilTarget(i, free);
					this.seats[t].follows = true;
					this.piperKnown = true;
					// The follower learns who the Piper is, and says so if good.
					if (!this.evilMinded(t)) this.share(t, (e, d) => has(e & ~d, i), this.eps);
				}
			}
			if (c === 'devilsadvocate' && this.works(i)) {
				const m = this.marg(i);
				this.advocateTarget = this.top(-1, live, (t) => m.demon[t]);
			}
		}
		this.monkTarget = -1;
		const monk = live.find((i) => this.role(i) === 'monk');
		if (!first && monk !== undefined) {
			const m = this.marg(monk);
			this.monkTarget = this.top(monk, live, (t) => -m.evil[t] + this.r() * 0.05);
		}
		const deaths: { t: number; demon: boolean }[] = [];
		if (!first) this.kills(live, deaths);
		// Information.
		for (const i of this.living()) {
			if (this.seats[i].evil) continue;
			const role = this.role(i);
			if (first && ['washerwoman', 'librarian', 'investigator', 'chef', 'knight'].includes(role)) this.learn(i, role);
			if (['empath', 'fortuneteller'].includes(role)) this.learn(i, role);
			if (!first && role === 'undertaker' && this.executed >= 0) this.learn(i, role);
			if (!first && role === 'flowergirl') this.learn(i, role);
		}
		for (const d of deaths) {
			if (this.seats[d.t].evil) continue;
			const role = this.role(d.t);
			if (role === 'ravenkeeper') this.learn(d.t, role);
			if (role === 'sage' && d.demon) this.learn(d.t, role);
		}
		this.executed = -1;
		// Dawn: the town sees who died.
		for (const d of deaths) {
			if (this.over) return;
			const x = d.t;
			this.publicDeath(x);
			this.ouroPattern(x);
			this.resolveDeath(x, 'night');
		}
	}

	/** Pick a good player to hurt: known-good if the team is known, else the likeliest. */
	private evilTarget(i: number, live: number[]): number {
		const m = this.marg(i);
		return this.top(i, live, (t) => 1 - m.evil[t] - 2 * m.demon[t] + (1 - this.townSusp[t]) * 0.5 + this.r() * 0.3);
	}

	private kills(live: number[], deaths: { t: number; demon: boolean }[]): void {
		const attack = (t: number, byDemon: boolean, sure = false): void => {
			if (t < 0 || !this.seats[t].alive || deaths.some((d) => d.t === t)) return;
			if (!sure) {
				const monk = this.find('monk');
				if (byDemon && t === this.monkTarget && monk >= 0 && this.works(monk)) return;
				if (byDemon && this.seats[t].char === 'soldier' && this.works(t)) return;
				if (byDemon && this.seats[t].char === 'mayor' && this.works(t) && this.r() < 0.5) {
					const others = live.filter((j) => j !== t && !has(this.demons, j));
					if (!others.length) return;
					t = this.pick(others);
					if (deaths.some((d) => d.t === t)) return;
				}
			}
			this.seats[t].alive = false;
			deaths.push({ t, demon: byDemon });
		};
		for (const i of live) {
			if (!has(this.demons, i) || !this.seats[i].alive || !this.works(i)) continue;
			const c = this.seats[i].char;
			if (c === 'imp') {
				const heirs = live.filter((j) => this.minion(j));
				if (heirs.length && this.townSusp[i] > 0.55 && this.r() < 0.7) {
					// Starpass: the Imp dies, a Minion becomes the Imp.
					const m = this.pick(heirs);
					this.seats[i].alive = false;
					this.seats[m].char = 'imp';
					this.demons = (this.demons & ~(1 << i)) | (1 << m);
					this.bel[m] = this.knowledge(m);
					deaths.push({ t: i, demon: true });
					continue;
				}
				attack(this.evilTarget(i, live), true);
			} else if (c === 'po') {
				if (this.poCharged) {
					this.poCharged = false;
					const m = this.marg(i);
					const ranked = live.filter((t) => t !== i).sort((a, b) => m.evil[a] - m.evil[b]);
					for (const t of ranked.slice(0, 3)) attack(t, true);
				} else if (this.r() < 0.25) this.poCharged = true;
				else attack(this.evilTarget(i, live), true);
			} else if (c.startsWith('ouroboros')) {
				const legal = live.filter((t) => t !== i && this.ouroLegal(c, i, t));
				if (!legal.length) {
					// This one only dies if it chooses itself, which a bot never does: it just stops killing.
					if (c === 'ouroborosSpiralSelf') continue;
					// Its kills would pass its own seat: it eats its own tail.
					this.seats[i].alive = false;
					deaths.push({ t: i, demon: true });
					continue;
				}
				const m = this.marg(i);
				const t = this.top(i, legal, (j) => 1 - m.evil[j] - 2 * m.demon[j] + (1 - this.townSusp[j]) * 0.5 + this.r() * 0.3 - 0.08 * this.ouroStep(c, i, j));
				this.ouroLast.set(i, this.ouroMeasure(c, i, t));
				attack(t, true);
			} else if (c === 'ojo') {
				const goodChars = this.s.script.filter((x) => TEAM[x] === 'townsfolk' || TEAM[x] === 'outsider');
				const named = this.pick(goodChars);
				const hit = live.find((t) => this.seats[t].char === named);
				if (hit !== undefined) attack(hit, true);
				else attack(this.pick(live.filter((t) => !has(this.demons, t))), true);
			}
		}
		const assassin = live.find((i) => this.seats[i].char === 'assassin');
		if (assassin !== undefined && !this.seats[assassin].used && this.works(assassin) && this.r() < 0.4) {
			this.seats[assassin].used = true;
			attack(this.evilTarget(assassin, live), false, true);
		}
	}

	/** Cycle and Reset: clockwise distance. Spiral: distance either way. */
	private ouroMeasure(c: string, from: number, t: number): number {
		const cw = (t - from + this.n) % this.n;
		return c.startsWith('ouroborosSpiral') ? Math.min(cw, this.n - cw) : cw;
	}

	private ouroLegal(c: string, from: number, t: number): boolean {
		const last = this.ouroLast.get(from);
		const m = this.ouroMeasure(c, from, t);
		if (c.startsWith('ouroborosSpiral')) return last === undefined || m < last;
		return m > (last ?? 0);
	}

	/** How much of its remaining room a kill uses up. */
	private ouroStep(c: string, from: number, t: number): number {
		const m = this.ouroMeasure(c, from, t);
		const last = this.ouroLast.get(from);
		if (c.startsWith('ouroborosSpiral')) return (last ?? this.n / 2 + 1) - m;
		return m - (last ?? 0);
	}

	/** The town checks a new night death against the Ouroboros rule, for every seat the Demon might be in. */
	private ouroPattern(v: number): void {
		const kind = this.s.script.find((x) => x.startsWith('ouroboros'));
		const p = this.victims[this.victims.length - 1];
		this.victims.push(v);
		if (!kind || p === undefined) return;
		let legal = 0;
		for (let d = 0; d < this.n; d++) {
			if (d === v) continue;
			const ok = kind.startsWith('ouroborosSpiral')
				? this.ouroMeasure(kind, d, v) < this.ouroMeasure(kind, d, p)
				: this.ouroMeasure(kind, d, v) > this.ouroMeasure(kind, d, p);
			if (ok) legal |= 1 << d;
		}
		const L = evidence(this.W, (_, d) => (d & legal) !== 0, kind === 'ouroborosReset' ? 0.35 : 0.1);
		for (let h = 0; h < L.length; h++) L[h] *= this.trust;
		for (const b of this.bel) b.apply(L);
	}

	/** An info character wakes and learns something, true unless it shouldn't be. */
	private learn(i: number, role: string): void {
		const sober = this.works(i);
		const w = sober ? this.registered() : this.fakeWorld(i);
		const others = this.seats.map((_, j) => j).filter((j) => j !== i);
		const live = this.living().filter((j) => j !== i);
		const m = this.marg(i);
		let test: Test | null = null;
		let eps = this.eps;
		switch (role) {
			case 'washerwoman':
			case 'librarian': {
				const pool = others.filter((j) => !has(w.E, j) && (role === 'washerwoman' || !sober || TEAM[this.seats[j].char] === 'outsider'));
				if (!pool.length) return;
				const g = this.pick(pool);
				const x = this.pick(others.filter((j) => j !== g));
				test = (e) => !has(e, g) || !has(e, x);
				break;
			}
			case 'investigator': {
				const pool = others.filter((j) => has(w.E & ~w.D, j));
				if (!pool.length) return;
				const g = this.pick(pool);
				const x = this.pick(others.filter((j) => j !== g));
				test = (e, d) => has(e & ~d, g) || has(e & ~d, x);
				break;
			}
			case 'chef': {
				const k = pairs(w.E, this.n);
				test = (e) => pairs(e, this.n) === k;
				break;
			}
			case 'empath': {
				const [a, b] = this.neighbours(i);
				const k = Number(has(w.E, a)) + Number(has(w.E, b));
				test = (e) => Number(has(e, a)) + Number(has(e, b)) === k;
				break;
			}
			case 'fortuneteller': {
				if (live.length < 2) return;
				const a = this.top(i, live, (t) => m.demon[t] + this.r() * 0.02);
				const b = this.top(i, live.filter((t) => t !== a), (t) => m.demon[t] + this.r() * 0.02);
				const D = w.D | (sober && this.herring >= 0 ? 1 << this.herring : 0);
				const yes = has(D, a) || has(D, b);
				test = (_, d) => (has(d, a) || has(d, b)) === yes;
				if (yes) eps = Math.max(eps, 0.15);
				break;
			}
			case 'undertaker': {
				const x = this.executed;
				const evil = has(w.E, x);
				test = (e) => has(e, x) === evil;
				break;
			}
			case 'ravenkeeper': {
				const x = this.top(i, this.living(), (t) => Math.min(m.evil[t], 1 - m.evil[t]));
				if (x < 0) return;
				const evil = has(w.E, x);
				const dem = has(w.D, x);
				test = (e, d) => has(e, x) === evil && has(d, x) === dem;
				break;
			}
			case 'knight': {
				const pool = others.filter((j) => !has(w.D, j));
				const [a, b] = shuffleIn(this.r, pool);
				test = (_, d) => !has(d, a) && !has(d, b);
				break;
			}
			case 'sage': {
				const dem = others.filter((j) => has(w.D, j) && this.seats[j].alive);
				if (!dem.length) return;
				const a = this.pick(dem);
				const b = this.pick(others.filter((j) => j !== a));
				test = (_, d) => has(d, a) || has(d, b);
				break;
			}
			case 'flowergirl': {
				const yes = (this.voted & w.D) !== 0;
				const voted = this.voted;
				test = (_, d) => ((voted & d) !== 0) === yes;
				break;
			}
		}
		if (test) this.share(i, test, eps);
	}

	private neighbours(i: number): [number, number] {
		const live = this.living();
		const at = live.indexOf(i);
		const L = live.length;
		if (at < 0) return [(i + this.n - 1) % this.n, (i + 1) % this.n];
		return [live[(at - 1 + L) % L], live[(at + 1) % L]];
	}

	/** Everyone sees a night death: the Demon seldom kills its own. */
	private publicDeath(x: number): void {
		const own = this.blindKills ? 1 : 0.2;
		const L = new Float64Array(this.W.H);
		const lo = Math.log(own);
		for (let h = 0; h < this.W.H; h++) if (has(this.W.evil[h], x)) L[h] = lo;
		for (const b of this.bel) b.apply(L);
	}

	// ---- deaths and the end -------------------------------------------------

	private end(good: boolean, why: string): void {
		if (!this.over) this.over = { good, days: this.day, why };
	}

	private resolveDeath(x: number, how: 'night' | 'execution' | 'day'): void {
		const seat = this.seats[x];
		seat.alive = false;
		if (TEAM[seat.char] === 'minion' && this.s.script.includes('ouroborosReset')) this.ouroLast.clear();
		const aliveAfter = this.living().length;
		if (has(this.demons, x)) {
			const others = this.living().filter((j) => has(this.demons, j));
			if (!others.length) {
				const sw = this.find('scarletwoman');
				const mm = this.find('mastermind');
				if (sw >= 0 && this.seats[sw].alive && this.works(sw) && aliveAfter + 1 >= 5) {
					this.seats[sw].char = seat.char;
					this.demons = (this.demons & ~(1 << x)) | (1 << sw);
					this.bel[sw] = this.knowledge(sw);
				} else if (how === 'execution' && mm >= 0 && this.seats[mm].alive && this.works(mm) && this.masterDay < 0) {
					this.masterDay = this.day + 1;
				} else {
					return this.end(true, how === 'execution' ? 'demon executed' : 'demon killed');
				}
			}
		}
		const goods = this.living().filter((j) => !this.seats[j].evil).length;
		if (goods === 0) return this.end(false, 'all good dead');
		if (aliveAfter <= 2 && this.living().some((j) => has(this.demons, j))) return this.end(false, 'two left');
		const canPass = how === 'night' ? this.s.script.includes('imp') : this.s.script.includes('scarletwoman');
		const alive = this.aliveMask();
		for (const b of this.bel) b.survive(x, alive, canPass);
	}

	// ---- day ----------------------------------------------------------------

	private dayPhase(): void {
		this.socialReads();
		this.familiarWakes();
		if (this.publish) for (const i of this.living()) if (this.seats[i].evil && this.r() < 0.6) this.fakeClaim(i);
		this.refreshTown();
		this.voted = 0;
		this.daytimeKills();
		if (this.over) return;
		if (this.masterDay === this.day) return this.mastermindDay();
		const x = this.nominations();
		if (this.over) return;
		if (x >= 0) this.execute(x);
		if (this.over) return;
		const mayor = this.find('mayor');
		if (x < 0 && this.living().length === 3 && mayor >= 0 && this.seats[mayor].alive && this.works(mayor)) this.end(true, 'mayor');
	}

	/** A Familiar who can wake: from day 3, a 1-in-4 chance a day of realising, then confessing the Demon. */
	private familiarWakes(): void {
		for (const i of this.living()) {
			const x = this.seats[i];
			if (x.char !== 'familiarWakes' || x.woke || this.day < 3 || this.r() >= 0.25) continue;
			x.woke = true;
			const m = this.marg(i);
			const dem = this.top(i, this.living(), (t) => m.demon[t]);
			if (dem < 0) continue;
			// Evil could fake this confession, so the town trusts it less.
			const L = evidence(this.W, (_, d) => has(d, dem), 0.3, i);
			for (let h = 0; h < L.length; h++) L[h] *= this.trust;
			for (const b of this.bel) b.apply(L);
		}
	}

	private daytimeKills(): void {
		for (const i of this.living()) {
			if (this.over) return;
			const x = this.seats[i];
			if (this.role(i) === 'slayer' && !x.evil && !x.used && x.alive) {
				const m = this.marg(i);
				const t = this.top(i, this.living(), (j) => m.demon[j]);
				if (t < 0 || (m.demon[t] < 0.35 && this.living().length > 5)) continue;
				x.used = true;
				const hit = this.works(i) && has(this.registered().D, t);
				if (hit) this.resolveDeath(t, 'day');
				else for (const b of this.bel) b.apply(evidence(this.W, (_, d) => !has(d, t), this.eps, i));
				// A shot is public: in a good-minority game it marks the shooter as likely good.
				if (!this.publish) for (const b of this.bel) b.apply(evidence(this.W, (e) => !has(e, i), 0.3));
			}
			if (x.char === 'psychopath' && x.alive && this.works(i) && this.day >= 2) {
				const t = this.evilTarget(i, this.living());
				if (t < 0) continue;
				// Out in the open: everyone now knows the Psychopath is a Minion.
				for (const b of this.bel) b.apply(evidence(this.W, (e, d) => has(e & ~d, i), 0.001));
				this.resolveDeath(t, 'day');
			}
		}
	}

	/** Returns the seat to execute, or -1. */
	private nominations(): number {
		const live = this.living();
		const alive = live.length;
		const nominated = new Set<number>();
		const mayorDay = alive === 3 && live.some((i) => this.role(i) === 'mayor');
		const cap = 3 + Math.floor(alive / 4);
		let best = -1;
		let bestVotes = 0;
		let tied = false;
		for (const i of shuffleIn(this.r, live)) {
			if (nominated.size >= cap || this.over) break;
			if (!this.seats[i].alive) continue;
			if (mayorDay && !this.evilMinded(i)) continue;
			const open = this.living().filter((j) => !nominated.has(j) && j !== i);
			const t = this.r() < this.noise ? this.pick(open) ?? -1 : this.top(i, open, (j) => this.want(i, j));
			if (t < 0 || this.want(i, t) <= 0) continue;
			nominated.add(t);
			if (this.seats[i].cursedDay === this.day && this.find('witch') >= 0) {
				this.resolveDeath(i, 'day');
				if (this.over) return -1;
			}
			const { votes, goodVoted } = this.vote(t, i);
			const needed = this.s.exec === 'two' ? 2 : Math.ceil(this.living().length / 2);
			if (votes < needed || (this.s.exec === 'legion' && !goodVoted)) continue;
			if (votes > bestVotes) { best = t; bestVotes = votes; tied = false; }
			else if (votes === bestVotes) tied = true;
		}
		return tied ? -1 : best;
	}

	private vote(t: number, nominator: number): { votes: number; goodVoted: boolean } {
		let votes = 0;
		let goodVoted = false;
		const alive = this.living().length;
		const pp = this.piper();
		const piperVotes = pp >= 0 && this.seats[pp].alive && this.works(pp)
			&& (this.seats[pp].char !== 'piedpiperNom' || nominator === pp);
		const wants = new Array<boolean>(this.n).fill(false);
		const order = [...this.seats.keys()];
		if (piperVotes) order.unshift(...order.splice(pp, 1));
		for (const v of order) {
			const x = this.seats[v];
			if (!x.alive && (!x.ghostVote || alive > 5)) continue;
			if (v === t) continue;
			let yes: boolean;
			if (piperVotes && x.follows && v !== pp) {
				// Followers vote whenever the Piper votes.
				yes = wants[pp];
				if (yes) { votes++; x.withPiper = this.day; if (!x.evil) goodVoted = true; if (!x.alive) x.ghostVote = false; this.voted |= 1 << v; }
				continue;
			}
			if (x.evil && this.s.evilKnow === 'all') yes = !this.seats[t].evil && this.r() < 0.85;
			else {
				const score = this.want(v, t);
				const others = this.living().filter((j) => j !== v);
				let max = 0;
				for (const j of others) max = Math.max(max, this.want(v, j));
				yes = score > 0 && score >= 0.75 * max;
			}
			if (!(x.evil && this.s.evilKnow === 'all') && this.r() < this.noise) yes = !yes;
			wants[v] = yes;
			if (!yes) continue;
			votes++;
			if (!x.evil) goodVoted = true;
			if (!x.alive) x.ghostVote = false;
			this.voted |= 1 << v;
		}
		return { votes, goodVoted };
	}

	private execute(x: number): void {
		this.executed = x;
		const seat = this.seats[x];
		const da = this.find('devilsadvocate');
		if (x === this.advocateTarget && da >= 0 && this.works(da)) return;
		if (seat.char === 'psychopath' && this.works(x) && this.r() < 0.5) return;
		if (seat.char === 'saint' && this.works(x)) {
			seat.alive = false;
			return this.end(false, 'saint executed');
		}
		this.resolveDeath(x, 'execution');
		// The town would not pay the Piper: his followers die with him.
		if (seat.char.startsWith('piedpiper') && this.works(x)) {
			for (let f = 0; f < this.n; f++) {
				if (this.over) return;
				const onlyVoters = seat.char === 'piedpiperVoted' || seat.char === 'piedpiper1Voted';
				if (this.seats[f].follows && this.seats[f].alive && (!onlyVoters || this.seats[f].withPiper === this.day)) this.resolveDeath(f, 'day');
			}
		}
	}

	/** The Mastermind's extra day: whoever is executed, their team loses. */
	private mastermindDay(): void {
		const x = this.nominations();
		if (x < 0) return this.end(true, 'mastermind: no execution');
		this.end(this.seats[x].evil, 'mastermind');
	}
}

function isFamiliar(c: string): boolean {
	return c === 'familiar' || c === 'familiarWakes';
}

function pairs(e: number, n: number): number {
	let k = 0;
	for (let i = 0; i < n; i++) if (has(e, i) && has(e, (i + 1) % n)) k++;
	return k;
}

function maskOf(xs: number[]): number {
	return xs.reduce((m, i) => m | (1 << i), 0);
}

function shuffleIn<T>(r: Rng, xs: T[]): T[] {
	const a = [...xs];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(r() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}
