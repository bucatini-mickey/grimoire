/**
 * Every hidden world a player might believe in: which seats are evil, and
 * which of those are Demons. A bot's belief is a weight on each world, so
 * any clue ("one of these two is a Minion", "my neighbours hold 1 evil")
 * is just a test run over the list.
 */

/** A world is two seat masks: evil seats, and the Demons among them. */
export type Test = (evil: number, demon: number) => boolean;

export interface Worlds {
	n: number;
	/** Evil seats and Demon seats in every world. */
	H: number;
	evil: Int32Array;
	demon: Int32Array;
	/** Seat lists per world, flattened: evilSeats[h * e + i]. */
	e: number;
	d: number;
	evilSeats: Int8Array;
	demonSeats: Int8Array;
	index: Map<number, number>;
}

const cache = new Map<string, Worlds>();

export function worlds(n: number, e: number, d: number): Worlds {
	const key = `${n}/${e}/${d}`;
	const hit = cache.get(key);
	if (hit) return hit;
	const evil: number[] = [];
	const demon: number[] = [];
	for (const E of subsets((1 << n) - 1, e)) for (const D of subsets(E, d)) { evil.push(E); demon.push(D); }
	const H = evil.length;
	const w: Worlds = {
		n, H, e, d,
		evil: Int32Array.from(evil),
		demon: Int32Array.from(demon),
		evilSeats: new Int8Array(H * e),
		demonSeats: new Int8Array(H * d),
		index: new Map()
	};
	for (let h = 0; h < H; h++) {
		seatsOf(evil[h], w.evilSeats, h * e);
		seatsOf(demon[h], w.demonSeats, h * d);
		w.index.set(evil[h] * 65536 + demon[h], h);
	}
	cache.set(key, w);
	return w;
}

/** Every k-seat subset of a mask. */
function* subsets(mask: number, k: number): Generator<number> {
	const bits: number[] = [];
	for (let i = 0; i < 16; i++) if (mask & (1 << i)) bits.push(i);
	const pick = (from: number, left: number, acc: number): number[] => {
		if (left === 0) return [acc];
		const out: number[] = [];
		for (let i = from; i <= bits.length - left; i++) out.push(...pick(i + 1, left - 1, acc | (1 << bits[i])));
		return out;
	};
	yield* pick(0, k, 0);
}

function seatsOf(mask: number, into: Int8Array, at: number): void {
	let i = at;
	for (let s = 0; s < 16; s++) if (mask & (1 << s)) into[i++] = s;
}

export const has = (mask: number, s: number): boolean => (mask & (1 << s)) !== 0;

/** One bot's weights over the worlds, in log space. */
export class Belief {
	w: Worlds;
	log: Float64Array;
	/** Bumped on every change, so marginals can be cached. */
	version = 0;
	private cached = -1;
	private pe: Float64Array;
	private pd: Float64Array;
	/** Worlds the bot knows for certain are impossible (its own seat, its team). */
	private ruledOut: Uint8Array;

	constructor(w: Worlds) {
		this.w = w;
		this.log = new Float64Array(w.H);
		this.ruledOut = new Uint8Array(w.H);
		this.pe = new Float64Array(w.n);
		this.pd = new Float64Array(w.n);
	}

	/** Rule out every world that fails the test. */
	restrict(test: Test): void {
		const { evil, demon, H } = this.w;
		for (let h = 0; h < H; h++) if (!test(evil[h], demon[h])) { this.log[h] = -Infinity; this.ruledOut[h] = 1; }
		this.version++;
	}

	/** Add a likelihood (log space) from evidence(). */
	apply(logL: Float64Array): void {
		for (let h = 0; h < this.w.H; h++) this.log[h] += logL[h];
		this.version++;
	}

	/** Add a per-seat read: delta[s] is added to every world where s is evil. */
	applyReads(delta: Float64Array): void {
		const { evilSeats, e, H } = this.w;
		for (let h = 0; h < H; h++) {
			let sum = 0;
			for (let i = h * e; i < h * e + e; i++) sum += delta[evilSeats[i]];
			this.log[h] += sum;
		}
		this.version++;
	}

	/** Chance each seat is evil, and is a Demon. */
	marginals(): { evil: Float64Array; demon: Float64Array } {
		if (this.cached === this.version) return { evil: this.pe, demon: this.pd };
		const { evilSeats, demonSeats, e, d, H } = this.w;
		let max = -Infinity;
		for (let h = 0; h < H; h++) if (this.log[h] > max) max = this.log[h];
		this.pe.fill(0);
		this.pd.fill(0);
		let total = 0;
		if (max === -Infinity) {
			// Every world ruled out (a lie the bot believed): start over from what it knows.
			for (let h = 0; h < H; h++) this.log[h] = this.ruledOut[h] ? -Infinity : 0;
			max = 0;
		}
		for (let h = 0; h < H; h++) {
			const p = Math.exp(this.log[h] - max);
			if (p < 1e-12) continue;
			total += p;
			for (let i = h * e; i < h * e + e; i++) this.pe[evilSeats[i]] += p;
			for (let i = h * d; i < h * d + d; i++) this.pd[demonSeats[i]] += p;
		}
		if (total === 0) {
			// Even its certainties contradict each other: forget everything.
			this.log.fill(0);
			this.ruledOut.fill(0);
			this.version++;
			return this.marginals();
		}
		for (let s = 0; s < this.w.n; s++) { this.pe[s] /= total; this.pd[s] /= total; }
		// Keep the numbers sane: shift so the best world sits at 0.
		for (let h = 0; h < H; h++) this.log[h] -= max;
		this.cached = this.version;
		return { evil: this.pe, demon: this.pd };
	}

	/**
	 * Seat x just died and the game went on. Worlds where x was the last
	 * living Demon either pass the Demon to a living Minion (Imp, Scarlet
	 * Woman) or are impossible.
	 */
	survive(x: number, alive: number, canPass: boolean): void {
		const { evil, demon, H, index } = this.w;
		const moved = new Float64Array(H);
		let any = false;
		for (let h = 0; h < H; h++) {
			if (!has(demon[h], x) || this.log[h] === -Infinity) continue;
			if ((demon[h] & alive & ~(1 << x)) !== 0) continue;
			const heirs = evil[h] & ~demon[h] & alive & ~(1 << x);
			const p = Math.exp(this.log[h]);
			this.log[h] = -Infinity;
			if (!canPass || heirs === 0) continue;
			const k = popcount(heirs);
			for (let m = 0; m < 16; m++) {
				if (!has(heirs, m)) continue;
				const to = index.get(evil[h] * 65536 + ((demon[h] & ~(1 << x)) | (1 << m)));
				if (to !== undefined) { moved[to] += (p * 0.5) / k; this.ruledOut[to] = 0; any = true; }
			}
		}
		if (any) for (let h = 0; h < H; h++) if (moved[h] > 0) this.log[h] = logAdd(this.log[h], Math.log(moved[h]));
		this.version++;
	}

}

/**
 * A clue as a likelihood. Worlds that pass the test keep their weight,
 * worlds that fail it are scaled by eps (the chance the clue was false:
 * drunk, poisoned, misregistered). With a claimant, the clue only counts
 * in worlds where the claimant is good: an evil claimant could say anything.
 */
export function evidence(w: Worlds, test: Test, eps: number, claimant = -1): Float64Array {
	const out = new Float64Array(w.H);
	const miss = Math.log(eps);
	for (let h = 0; h < w.H; h++) {
		if (claimant >= 0 && has(w.evil[h], claimant)) continue;
		if (!test(w.evil[h], w.demon[h])) out[h] = miss;
	}
	return out;
}

export function popcount(x: number): number {
	let c = 0;
	while (x) { x &= x - 1; c++; }
	return c;
}

function logAdd(a: number, b: number): number {
	if (a === -Infinity) return b;
	const m = Math.max(a, b);
	return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
}
