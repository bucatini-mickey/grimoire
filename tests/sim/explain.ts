/**
 * Tell a failing game as a story: each command, then what it caused.
 *
 *   node tests/sim/explain.ts tests/sim/failures/<file>.json
 */
import { readFileSync } from 'node:fs';
import { emptyState, perform } from '../../src/core/index.ts';
import type { Command, GameEvent, GameState } from '../../src/core/index.ts';
import { check } from './sim.ts';

const file = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { rule: string; detail: string; commands: Command[] };
let s: GameState = emptyState();
const who = (id: number) => (s.seats[id] ? `${s.seats[id].name}(${s.seats[id].character})` : String(id));
const say = (e: GameEvent): string => {
	const { type, ...rest } = e as GameEvent & Record<string, unknown>;
	const parts = Object.entries(rest).map(([k, v]) => {
		if (['to', 'by', 'seat', 'target', 'nominator', 'nominee', 'from'].includes(k) && typeof v === 'number') return `${k}=${who(v)}`;
		return `${k}=${JSON.stringify(v)}`;
	});
	return `${type} ${parts.join(' ')}`;
};
console.log(`Rule: ${file.rule}\n${file.detail}\n`);
for (const cmd of file.commands) {
	const r = perform(s, cmd);
	const c = JSON.stringify(cmd);
	if (!r.ok) { console.log(`  (refused) ${c.slice(0, 120)}: ${r.error}`); continue; }
	console.log(`> ${cmd.type === 'create' || cmd.type === 'assign' ? cmd.type : c}`);
	for (const e of r.events) console.log(`    ${say(e)}`);
	s = r.state;
}
console.log('\nViolations on replay:', check(file.commands));
