/**
 * Balance simulator: play many bot games and report how often good wins.
 * Runs locally on every core; no network.
 *
 *   node tools/balance/run.ts calibrate [games]   tune the skill knob so Trouble Brewing is 50/50
 *   node tools/balance/run.ts tb [games]          Trouble Brewing by player count
 *   node tools/balance/run.ts wolf [games]        search Hour of the Wolf layouts
 *   node tools/balance/run.ts chars '<spec>' [games]   per-character effect on one layout
 *   node tools/balance/run.ts one '<spec>' [games]     one layout, at three skill levels
 *   node tools/balance/run.ts compare [games] [chars...]   each character forced into play vs baseline
 *
 * The bots are not people: trust the ranking of layouts against each
 * other and against Trouble Brewing, not the exact percentages.
 */
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { play, type Knobs } from './game.ts';
import { draw, rng, type Spec, type EvilKnow, type Exec } from './setups.ts';

interface Tally {
	games: number;
	good: number;
	days: number;
	why: Record<string, number>;
	/** Character -> [games in play, good wins]. */
	chars: Record<string, [number, number]>;
}

interface Job { spec: Spec; knobs: Knobs; from: number; count: number }

function batch({ spec, knobs, from, count }: Job): Tally {
	const t: Tally = { games: 0, good: 0, days: 0, why: {}, chars: {} };
	for (let seed = from; seed < from + count; seed++) {
		const r = rng(seed * 2654435761);
		const setup = draw(spec, r);
		const o = play(setup, knobs, r);
		t.games++;
		if (o.good) t.good++;
		t.days += o.days;
		t.why[o.why] = (t.why[o.why] ?? 0) + 1;
		for (const c of new Set(setup.chars)) {
			const row = (t.chars[c] ??= [0, 0]);
			row[0]++;
			if (o.good) row[1]++;
		}
	}
	return t;
}

function merge(a: Tally, b: Tally): Tally {
	a.games += b.games;
	a.good += b.good;
	a.days += b.days;
	for (const [k, v] of Object.entries(b.why)) a.why[k] = (a.why[k] ?? 0) + v;
	for (const [k, [g, w]] of Object.entries(b.chars)) {
		const row = (a.chars[k] ??= [0, 0]);
		row[0] += g;
		row[1] += w;
	}
	return a;
}

if (!isMainThread) {
	parentPort!.on('message', (job: Job) => parentPort!.postMessage(batch(job)));
} else {
	// After the module finishes loading, so the classes below exist.
	setImmediate(main);
}

// ---- main thread ------------------------------------------------------------

async function main(): Promise<void> {
	const [cmd = 'help', ...args] = process.argv.slice(2);
	const pool = new Pool(Math.max(1, availableParallelism() - 2));
	const t0 = Date.now();
	try {
		if (cmd === 'calibrate') await calibrate(pool, Number(args[0] ?? 3000));
		else if (cmd === 'tb') await troubleBrewing(pool, Number(args[0] ?? 3000));
		else if (cmd === 'wolf') await wolf(pool, Number(args[0] ?? 600));
		else if (cmd === 'chars') await chars(pool, JSON.parse(args[0]), Number(args[1] ?? 5000));
		else if (cmd === 'one') await one(pool, JSON.parse(args[0]), Number(args[1] ?? 3000));
		else if (cmd === 'compare') await compare(pool, Number(args[0] ?? 4000), args.slice(1));
		else console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]);
	} finally {
		pool.close();
	}
	console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

class Pool {
	private idle: Worker[] = [];
	private queue: { job: Job; done: (t: Tally) => void }[] = [];
	private all: Worker[] = [];

	constructor(size: number) {
		for (let i = 0; i < size; i++) {
			const w = new Worker(new URL(import.meta.url));
			this.all.push(w);
			this.idle.push(w);
		}
	}

	private next(): void {
		while (this.idle.length && this.queue.length) {
			const w = this.idle.pop()!;
			const { job, done } = this.queue.shift()!;
			w.once('message', (t: Tally) => {
				this.idle.push(w);
				done(t);
				this.next();
			});
			w.postMessage(job);
		}
	}

	/** Play `games` games of a spec, split across the workers. */
	async run(spec: Spec, knobs: Knobs, games: number, seed = 1): Promise<Tally> {
		const chunk = Math.max(50, Math.ceil(games / (this.all.length * 2)));
		const parts: Promise<Tally>[] = [];
		for (let from = seed; from < seed + games; from += chunk) {
			const count = Math.min(chunk, seed + games - from);
			parts.push(new Promise((done) => { this.queue.push({ job: { spec, knobs, from, count }, done }); }));
		}
		this.next();
		const all = await Promise.all(parts);
		return all.reduce(merge, { games: 0, good: 0, days: 0, why: {}, chars: {} });
	}

	close(): void {
		for (const w of this.all) w.terminate();
	}
}

const CAL = new URL('./calibration.json', import.meta.url);

function skill(): number {
	if (!existsSync(CAL)) {
		console.log('No calibration yet; using skill = 0.5. Run "calibrate" first.');
		return 0.5;
	}
	return JSON.parse(readFileSync(CAL, 'utf8')).skill;
}

const pct = (t: Tally) => (100 * t.good) / t.games;
const fmt = (x: number) => `${x.toFixed(1).padStart(5)}%`;

async function calibrate(pool: Pool, games: number): Promise<void> {
	console.log(`Trouble Brewing, 7-15 players, ${games} games per setting. Target: good wins 50%.\n`);
	console.log('skill   good wins  avg days');
	const rows: [number, number][] = [];
	for (let s = 0; s <= 1.001; s += 0.1) {
		const t = await pool.run({ kind: 'tb' }, { skill: s }, games);
		rows.push([s, pct(t)]);
		console.log(`${s.toFixed(3)}   ${fmt(pct(t))}    ${(t.days / t.games).toFixed(2)}`);
	}
	// First crossing of 50%, interpolated.
	let pick = rows.reduce((a, b) => (Math.abs(b[1] - 50) < Math.abs(a[1] - 50) ? b : a))[0];
	for (let i = 1; i < rows.length; i++) {
		const [s0, p0] = rows[i - 1];
		const [s1, p1] = rows[i];
		if ((p0 - 50) * (p1 - 50) <= 0 && p0 !== p1) { pick = s0 + ((50 - p0) * (s1 - s0)) / (p1 - p0); break; }
	}
	pick = Math.round(pick * 1000) / 1000;
	const check = await pool.run({ kind: 'tb' }, { skill: pick }, games * 2, 10_000_000);
	writeFileSync(CAL, JSON.stringify({ skill: pick, tbGood: Number(pct(check).toFixed(2)), games: games * 2 }, null, '\t') + '\n');
	console.log(`\nCalibrated skill = ${pick} (check run: good wins ${fmt(pct(check))}). Saved calibration.json.`);
}

async function troubleBrewing(pool: Pool, games: number): Promise<void> {
	const s = skill();
	console.log(`Trouble Brewing at skill = ${s}\n\nplayers  good wins  avg days`);
	for (let n = 7; n <= 15; n++) {
		const t = await pool.run({ kind: 'tb', n }, { skill: s }, games);
		console.log(`${String(n).padStart(4)}     ${fmt(pct(t))}    ${(t.days / t.games).toFixed(2)}`);
	}
}

async function one(pool: Pool, spec: Spec, games: number): Promise<void> {
	const s = skill();
	for (const d of [-0.15, 0, 0.15]) {
		const t = await pool.run(spec, { skill: s + d }, games);
		console.log(`skill ${(s + d).toFixed(2)}: good ${fmt(pct(t))}, ${(t.days / t.games).toFixed(2)} days`, t.why);
	}
}

async function chars(pool: Pool, spec: Spec, games: number): Promise<void> {
	const s = skill();
	const t = await pool.run(spec, { skill: s }, games);
	console.log(`Overall: good wins ${fmt(pct(t))} over ${t.games} games\n\ncharacter        in play  good wins  vs overall`);
	const rows = Object.entries(t.chars).sort((a, b) => b[1][1] / b[1][0] - a[1][1] / a[1][0]);
	for (const [c, [g, w]] of rows) {
		const p = (100 * w) / g;
		console.log(`${c.padEnd(16)} ${String(g).padStart(7)}  ${fmt(p)}    ${(p - pct(t) >= 0 ? '+' : '') + (p - pct(t)).toFixed(1)}`);
	}
}

type WolfSpec = Extract<Spec, { kind: 'wolf' }>;

const label = (w: WolfSpec) =>
	`${w.n}p ${w.good}g ${w.demons}d  evil:${w.evilKnow.padEnd(17)} good:${w.goodKnow ? 'know ' : 'blind'} exec:${w.exec}`;

async function wolf(pool: Pool, games: number): Promise<void> {
	const s = skill();
	const specs: WolfSpec[] = [];
	const knows: EvilKnow[] = ['none', 'minionsKnowDemon', 'demonKnowsMinions'];
	const execs: Exec[] = ['majority', 'legion', 'two'];
	for (const n of [8, 10, 12])
		for (const good of [2, 3, 4])
			for (const demons of [1, 2])
				for (const evilKnow of knows)
					for (const goodKnow of [true, false])
						for (const exec of execs)
							if (good < n - good) specs.push({ kind: 'wolf', n, good, demons, evilKnow, goodKnow, exec });
	console.log(`Hour of the Wolf: ${specs.length} layouts x ${games} games at skill = ${s}. Target: good wins 50%.\n`);
	const scored: { w: WolfSpec; p: number; days: number }[] = [];
	await Promise.all(specs.map(async (w) => {
		const t = await pool.run(w, { skill: s }, games);
		scored.push({ w, p: pct(t), days: t.days / t.games });
	}));
	scored.sort((a, b) => Math.abs(a.p - 50) - Math.abs(b.p - 50));
	console.log('Closest to 50% (first pass):');
	for (const x of scored.slice(0, 25)) console.log(`  ${fmt(x.p)}  ${x.days.toFixed(1)}d  ${label(x.w)}`);
	// How the knobs move the needle, averaged over everything else.
	console.log('\nAverage good win rate by setting:');
	const by = (name: string, key: (w: WolfSpec) => string) => {
		const groups = new Map<string, number[]>();
		for (const x of scored) {
			const k = key(x.w);
			if (!groups.has(k)) groups.set(k, []);
			groups.get(k)!.push(x.p);
		}
		const parts = [...groups].map(([k, v]) => `${k} ${fmt(v.reduce((a, b) => a + b, 0) / v.length)}`);
		console.log(`  ${name.padEnd(10)} ${parts.join('   ')}`);
	};
	by('players', (w) => `${w.n}p`);
	by('good', (w) => `${w.good}g`);
	by('demons', (w) => `${w.demons}d`);
	by('evil know', (w) => w.evilKnow);
	by('good know', (w) => (w.goodKnow ? 'know' : 'blind'));
	by('exec', (w) => w.exec);
	// Robustness: re-run the best at lower and higher skill.
	console.log('\nTop 10, re-run with 4x games at three skill levels (a balanced layout stays near 50 across all three):');
	for (const x of scored.slice(0, 10)) {
		const ps: number[] = [];
		for (const d of [-0.15, 0, 0.15]) ps.push(pct(await pool.run(x.w, { skill: s + d }, games * 4, 5_000_000)));
		const spread = Math.max(...ps) - Math.min(...ps);
		console.log(`  ${ps.map(fmt).join(' ')}  spread ${spread.toFixed(1).padStart(4)}  ${label(x.w)}`);
	}
	console.log(`\nInspect one: node tools/balance/run.ts chars '${JSON.stringify(scored[0].w)}'`);
}

const HOMEBREW = ['piedpiper', 'piedpiper3', 'piedpiper1', 'piedpiperVoted', 'piedpiperNom', 'piedpiper1Voted',
	'ouroboros', 'ouroborosSpiral', 'ouroborosSpiralSelf', 'ouroborosReset', 'familiar', 'familiarWakes'];

/** Each character forced into every game, against the same layout without it. */
async function compare(pool: Pool, games: number, list: string[]): Promise<void> {
	const s = skill();
	const chars = list.length ? list : HOMEBREW;
	const contexts: [string, Spec][] = [
		['Trouble Brewing 7-15p', { kind: 'tb' }],
		['Wolf 10p 3 good', { kind: 'wolf', n: 10, good: 3, demons: 1, evilKnow: 'none', goodKnow: true, exec: 'legion' }],
		['Wolf 8p 2 good', { kind: 'wolf', n: 8, good: 2, demons: 1, evilKnow: 'none', goodKnow: true, exec: 'legion' }]
	];
	const se = (100 * 0.5) / Math.sqrt(games);
	console.log(`Skill ${s}, ${games} games per row (noise about +/-${(2 * se).toFixed(1)} points).
`);
	for (const [name, base] of contexts) {
		const b = await pool.run(base, { skill: s }, games);
		console.log(`${name}: baseline good wins ${fmt(pct(b))}, ${(b.days / b.games).toFixed(2)} days`);
		console.log('  character          good wins   shift   days   how games end');
		for (const c of chars) {
			const t = await pool.run({ ...base, force: [c] } as Spec, { skill: s }, games);
			const ends = Object.entries(t.why).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k} ${Math.round((100 * v) / t.games)}%`).join(', ');
			const d = pct(t) - pct(b);
			console.log(`  ${c.padEnd(18)} ${fmt(pct(t))}   ${(d >= 0 ? '+' : '') + d.toFixed(1).padStart(5)}   ${(t.days / t.games).toFixed(2)}   ${ends}`);
		}
		console.log('');
	}
}
