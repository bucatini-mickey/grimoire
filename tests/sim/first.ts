/**
 * Stop at the first broken rule, without cutting the game down (quick, for
 * mutants.ts when QUICK=1):  node tests/sim/first.ts [games] [from seed]
 */
import { play } from './sim.ts';

const games = Number(process.argv[2] ?? 1000);
const from = Number(process.argv[3] ?? 1);
/** Only this script, or `mix` for random custom scripts (optional). */
const only = process.argv[4];
for (let seed = from; seed < from + games; seed++) {
	const g = play(seed, only);
	if (g.violations.length) {
		console.log(`BROKEN ${g.violations[0].rule} (seed ${seed}): ${g.violations[0].detail}`);
		process.exit(1);
	}
}
console.log('No rules broken.');
