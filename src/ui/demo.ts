/**
 * demo.ts - fixed demo games for looking at one screen without playing up to it.
 *
 * Open the app with #demo=bluffs (the Demon's "Your bluffs" page) or #demo=scarlet-woman (the Scarlet Woman's
 * "You are" page, her name on two lines). The game is built by the same commands play uses, from a fixed setup,
 * and is never saved, so it cannot touch a real game kept on the device. The review snapshots use these addresses.
 */
import * as G from '../core/index.ts';
import type { GameEvent, GameState } from '../core/index.ts';
import type { Page } from './wakepages.ts';

export type DemoName = 'bluffs' | 'scarlet-woman';

/** Seven players (the evil team learn each other and the Demon has three bluffs), each of the bluffs drawn. */
const NAMES = ['Ada', 'Bram', 'Cael', 'Dorn', 'Esme', 'Fenn', 'Gwen'];
const CHARACTERS = ['imp', 'scarlet-woman', 'washerwoman', 'librarian', 'chef', 'monk', 'empath'];
const BLUFFS = ['soldier', 'mayor', 'slayer'];

/** The step each demo stops at, and the page it opens on. */
const TARGET: Record<DemoName, { kind: string; page: Page }> = {
	'bluffs': { kind: G.DEMON_INFO, page: 'bluffs' },
	'scarlet-woman': { kind: G.MINION_INFO, page: 'who' }
};

export const isDemo = (name: string): name is DemoName => Object.hasOwn(TARGET, name);

/** The demo's game at the step it shows (the evil team's wake, with the steps before it done), the log of how it got there, and the page. */
export function demoGame(name: DemoName): { events: GameEvent[]; state: GameState; step: string; page: Page } {
	const want = TARGET[name];
	let state = G.emptyState();
	const events: GameEvent[] = [];
	const run = (cmd: G.Command) => {
		const r = G.perform(state, cmd);
		if (!r.ok) throw new Error(`demo ${name}: ${cmd.type} refused: ${r.error}`);
		state = r.state;
		events.push(...r.events);
	};
	run({ type: 'create', names: NAMES });
	run({ type: 'assign', characters: CHARACTERS, bluffs: BLUFFS, redHerring: null });
	run({ type: 'begin' });
	// The first night opens with the evil team: wake, in order, whoever comes before the step the demo shows.
	for (let guard = 0; guard < 10; guard++) {
		const step = G.nextStep(state);
		if (!step) throw new Error(`demo ${name}: the night ended before ${want.kind}`);
		if (step.kind === want.kind) return { events, state, step: step.id, page: want.page };
		run({ type: 'acknowledge' });
	}
	throw new Error(`demo ${name}: no ${want.kind} step`);
}
