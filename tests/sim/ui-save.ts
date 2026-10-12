/**
 * Make a saved game to try the Storyteller's screens by hand: a Bad Moon
 * Rising game played through night 1 and day 1 to the start of night 2.
 *
 *   node tests/sim/ui-save.ts [characters,comma,separated] > save.json
 *
 * Paste the output into localStorage['grimoire.v2'] and reload.
 */
import { emptyState, perform, nextStep, stepAction, pickSpec, suggestInfo, charDef, getScript } from '../../src/core/index.ts';
import type { Command, GameEvent, GameState } from '../../src/core/index.ts';

const chars = (process.argv[2] ?? 'po,godfather,sailor,gambler,courtier,gossip,tinker,lunatic').split(',');
const names = 'Ada Bram Cael Dorn Esme Fenn Gwen Hal Isolde Jory Kit Lior'.split(' ').slice(0, chars.length);
let s: GameState = emptyState();
const events: GameEvent[] = [];
const marks: number[] = [];
const run = (c: Command) => {
	const r = perform(s, c);
	if (!r.ok) throw new Error(`${c.type}: ${r.error}`);
	marks.push(events.length);
	events.push(...r.events);
	s = r.state;
};
run({ type: 'create', names, scriptId: process.argv[3] ?? 'bad-moon-rising' });
run({ type: 'assign', characters: chars, bluffs: JSON.parse(process.argv[4] ?? '["grandmother","chambermaid","fool"]'), allowNonstandard: true, ...(chars.includes('lunatic') ? { lunaticBelieves: 'po' } : {}), ...(chars.includes('evil-twin') ? { evilTwin: chars.findIndex((c) => ['townsfolk'].includes(charDef(getScript(s.scriptId), c).team)) } : {}) });
run({ type: 'begin' });
for (let i = 0; i < 60; i++) {
	const step = nextStep(s);
	if (!step) break;
	const action = stepAction(step.kind);
	if (action === 'acknowledge') run({ type: 'acknowledge' });
	else if (action === 'tell') run({ type: 'tell', info: suggestInfo(s, step.kind, step.seat!, [])! });
	else {
		const spec = pickSpec(s, step.kind, step.seat);
		if (spec.noneAllowed || spec.character === 'instead') { run({ type: 'choose', none: true }); continue; }
		const ok = s.seats.filter((x) => x.id !== step.seat && x.alive && charDef(getScript(s.scriptId), x.character).team !== 'demon');
		const targets = ok.slice(0, spec.count).map((x) => x.id);
		run({ type: 'choose', targets, drunk: step.kind === 'sailor' ? step.seat! : targets[0], ...(spec.character ? { character: s.seats[targets[0]].character } : {}) });
	}
}
run({ type: 'end-night' });
run({ type: 'end-day' });
process.stdout.write(JSON.stringify({ events, marks }));
