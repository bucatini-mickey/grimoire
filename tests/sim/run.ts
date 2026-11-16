/**
 * Play many random games and report: any broken rules (cut down to the
 * fewest commands), and how often each interaction came up.
 *
 *   npm run sim                 10,000 games from seed 1
 *   npm run sim -- 50000 7      50,000 games from seed 7
 *   npm run sim -- 5000 1 mix   random custom scripts of modelled characters (any player count 5-15)
 *   npm run sim -- 5000 1 mix 13   the same, always 13 players (the third word may be a script id, or all, instead of mix)
 *
 * Failures are written to tests/sim/failures/<rule>-<seed>.json: the
 * commands that break the rule, ready to replay as a test.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { play, shrink } from './sim.ts';

const games = Number(process.argv[2] ?? 10000);
const from = Number(process.argv[3] ?? 1);
/** Only this script (optional): npm run sim -- 2000 1 sects-and-violets */
const only = process.argv[4] === 'all' ? undefined : process.argv[4];
/** Fix the player count (optional): npm run sim -- 2000 1 mix 13 */
const fixedPlayers = process.argv[5] ? Number(process.argv[5]) : undefined;
const totals: Record<string, number> = {};
const broken = new Map<string, { seed: number; detail: string }>();
let refusals = 0;
let commands = 0;
const t0 = Date.now();

for (let seed = from; seed < from + games; seed++) {
	const g = play(seed, only, fixedPlayers);
	refusals += g.refusals;
	commands += g.commands.length;
	for (const [k, v] of Object.entries(g.stats)) totals[k] = (totals[k] ?? 0) + v;
	for (const v of g.violations) {
		if (broken.has(v.rule)) continue;
		broken.set(v.rule, { seed, detail: v.detail });
		const small = shrink(g.commands, v.rule);
		mkdirSync(new URL('./failures/', import.meta.url), { recursive: true });
		writeFileSync(new URL(`./failures/${v.rule}-${seed}.json`, import.meta.url), JSON.stringify({ rule: v.rule, detail: v.detail, seed, commands: small }, null, 1));
		console.log(`BROKEN ${v.rule} (seed ${seed}, cut to ${small.length} commands): ${v.detail}`);
	}
	if ((seed - from + 1) % 2000 === 0) console.log(`  ${seed - from + 1} games...`);
}

const secs = (Date.now() - t0) / 1000;
console.log(`\n${games} games, ${commands} commands accepted, ${refusals} refused, in ${secs.toFixed(1)}s`);
const show = (title: string, keys: string[]) => {
	console.log(`\n${title}`);
	for (const k of keys.sort()) console.log(`  ${String(totals[k]).padStart(8)}  ${k}`);
};
const keys = Object.keys(totals);
show('How games ended', keys.filter((k) => k.startsWith('won:') || k === 'unfinished'));
show('Deaths and saves', keys.filter((k) => k.startsWith('died:') || k.startsWith('saved:') || k.startsWith('via ') || k === 'kill-redirected' || k === 'virgin executes nominator'));
show('The Storyteller was asked', keys.filter((k) => k.startsWith('asked:')));
show('Tricky rules reached (each is checked when it comes up)', keys.filter((k) => k.startsWith('cover: ')));
show('Events', keys.filter((k) => !k.includes(':') && !k.startsWith('via ') && k !== 'unfinished' && k !== 'kill-redirected' && k !== 'virgin executes nominator'));
console.log(broken.size ? `\n${broken.size} rule(s) broken.` : '\nNo rules broken.');
process.exitCode = broken.size ? 1 : 0;
