/**
 * graph.ts - who did what to whom, read straight off the event log.
 *
 * For the Storyteller's interaction graph: every nomination, vote, night
 * choice, kill and piece of information that names another player becomes
 * an edge. The log is the single source, so the graph can never disagree
 * with what actually happened.
 */
import type { GameEvent, SeatId } from './types.ts';

export type EdgeKind =
	| 'nominated' | 'voted' | 'poisoned' | 'protected' | 'attacked' | 'chose-master'
	| 'read' | 'shown' | 'redirected' | 'slayed' | 'executed-by-virgin';

export interface Edge {
	from: SeatId;
	to: SeatId;
	kind: EdgeKind;
	/** e.g. "N2" or "D3": when it happened. */
	when: string;
	/** Index into the event log, to jump back to the moment. */
	at: number;
}

const CHOICE_KIND: Record<string, EdgeKind> = {
	poisoner: 'poisoned',
	monk: 'protected',
	imp: 'attacked',
	butler: 'chose-master'
};

export function interactions(events: GameEvent[]): Edge[] {
	const edges: Edge[] = [];
	let when = 'setup';
	let lastNominee: SeatId | null = null;
	events.forEach((e, at) => {
		const add = (from: SeatId, to: SeatId, kind: EdgeKind) => edges.push({ from, to, kind, when, at });
		switch (e.type) {
			case 'night-began': when = `N${e.n}`; break;
			case 'day-began': when = `D${e.n}`; break;
			case 'chose':
				for (const t of e.targets) add(e.by, t, CHOICE_KIND[e.role] ?? 'read');
				break;
			case 'info-given': {
				const i = e.info;
				if (i.kind === 'pair' || i.kind === 'fortune') for (const p of i.players) add(e.to, p, i.kind === 'fortune' ? 'read' : 'shown');
				if (i.kind === 'reveal') add(e.to, i.player, 'read');
				break;
			}
			case 'nominated':
				lastNominee = e.nominee;
				add(e.nominator, e.nominee, 'nominated');
				break;
			case 'vote-tallied':
				for (const v of e.voters) add(v, e.nominee, 'voted');
				break;
			case 'executed':
				if (lastNominee !== null && events[at - 1]?.type === 'ability-spent') add(lastNominee, e.seat, 'executed-by-virgin');
				break;
			case 'kill-redirected': add(e.from, e.to, 'redirected'); break;
			case 'slayer-shot': add(e.by, e.target, 'slayed'); break;
		}
	});
	return edges;
}
