/**
 * demo.ts - fixed demo games for looking at one screen without playing up to it.
 *
 * Open the app with #demo=bluffs (the Demon's "Your bluffs" page), #demo=scarlet-woman (the Scarlet Woman's
 * "You are" page, her name on two lines), #demo=recall (the Demon's "Remind me" index, after being shown their
 * pages) or #demo=recall-page (the bluffs page opened from it). The game is built by the same commands play uses, from a fixed setup,
 * and is never saved, so it cannot touch a real game kept on the device. The review snapshots use these addresses.
 */
import * as G from '../core/index.ts';
import type { GameEvent, GameState } from '../core/index.ts';
import type { Page } from './wakepages.ts';
import { recallKey, record, shownPage } from '../net/history.ts';
import type { History } from '../net/history.ts';
import { wakeFor } from '../net/views.ts';

export type DemoName = 'bluffs' | 'scarlet-woman' | 'recall' | 'recall-page';

/** Seven players (the evil team learn each other and the Demon has three bluffs), each of the bluffs drawn. */
const NAMES = ['Ada', 'Bram', 'Cael', 'Dorn', 'Esme', 'Fenn', 'Gwen'];
const CHARACTERS = ['imp', 'scarlet-woman', 'washerwoman', 'librarian', 'chef', 'monk', 'empath'];
const BLUFFS = ['soldier', 'mayor', 'slayer'];

/** The step each demo stops at, and the page it opens on. */
const TARGET: Record<DemoName, { kind: string; page: Page }> = {
	'bluffs': { kind: G.DEMON_INFO, page: 'bluffs' },
	'scarlet-woman': { kind: G.MINION_INFO, page: 'who' },
	'recall': { kind: G.DEMON_INFO, page: 'who' },
	'recall-page': { kind: G.DEMON_INFO, page: 'bluffs' }
};

export const isDemo = (name: string): name is DemoName => Object.hasOwn(TARGET, name);

/** The demo's game at the step it shows (the evil team's wake, with the steps before it done), the log of how it got there, and the page. */
export function demoGame(name: DemoName): { events: GameEvent[]; state: GameState; step: string; page: Page; history?: History; recall?: { seat: number; open: string | null } } {
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
		if (step.kind === want.kind) {
			if (!name.startsWith('recall')) return { events, state, step: step.id, page: want.page };
			// The Demon has been handed the phone and shown their pages; "Remind me" reads them again.
			const history: History = {};
			const w = wakeFor(state, step);
			const seating = { name: (id: number) => state.seats[id].name, dead: (id: number) => !state.seats[id].alive };
			for (const page of ['who', 'bluffs'] as const) {
				const e = shownPage(w, page, 1, seating);
				if (e && w.seat !== null) record(history, w.seat, e);
			}
			const bluffs = w.seat === null ? undefined : history[w.seat].find((p) => p.kind === 'bluffs');
			return { events, state, step: step.id, page: want.page, history, recall: { seat: w.seat!, open: name === 'recall-page' && bluffs ? recallKey(bluffs) : null } };
		}
		run({ type: 'acknowledge' });
	}
	throw new Error(`demo ${name}: no ${want.kind} step`);
}
