/** Replay a saved failure against the current engine: node tests/sim/recheck.ts tests/sim/failures/<file>.json */
import { readFileSync } from 'node:fs';
import { check } from './sim.ts';
const f = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const v = check(f.commands);
console.log(v.length ? v : 'passes now');
