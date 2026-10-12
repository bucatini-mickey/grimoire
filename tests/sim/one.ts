/** Play one seed and print its violations:  node tests/sim/one.ts <seed> [script] */
import { play } from './sim.ts';
const g = play(Number(process.argv[2]), process.argv[3]);
console.log(g.scriptId, g.violations.slice(0, 5));
