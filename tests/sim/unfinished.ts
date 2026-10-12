/** Why a game did not finish: what happened each night and day (node tests/sim/unfinished.ts <seed>). */
import { play } from './sim.ts';
import { emptyState, perform } from '../../src/core/index.ts';
import type { GameState } from '../../src/core/index.ts';
const g = play(Number(process.argv[2] ?? 29));
let s: GameState = emptyState();
const tally: Record<string, number> = {};
for (const c of g.commands) {
	const r = perform(s, c);
	if (!r.ok) continue;
	for (const e of r.events) {
		const k = e.type === 'died' ? `died ${e.cause}` : e.type === 'kill-prevented' ? `saved ${e.reason}` : e.type === 'chose' ? `chose ${e.role} ${e.effective ? '' : '(no effect)'}` : e.type === 'vote-tallied' ? `vote ${e.outcome}` : e.type === 'survived-execution' ? `survived ${e.reason}` : e.type;
		tally[k] = (tally[k] ?? 0) + 1;
	}
	s = r.state;
}
console.log(g.scriptId, JSON.stringify(s.phase), s.seats.map((x) => `${x.character}${x.alive ? '' : '+'}${x.alignment === 'evil' ? '*' : ''}`).join(' '));
console.log(Object.entries(tally).sort().map(([k, v]) => `${v}\t${k}`).join('\n'));
