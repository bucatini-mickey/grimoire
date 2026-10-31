/**
 * announce.ts - what the whole room is told after a command.
 *
 * Deaths at dawn, each vote's result, executions, the Virgin and the Slayer,
 * and the end of the game. Only public facts: a Monk's save, a starpass, a
 * Scarlet Woman taking over, who is drunk or poisoned and which ability
 * stopped a death are never announced. Pure, so the simulator can check it
 * (tests/sim) as well as the Storyteller's screen and the players' phones.
 */
import type { GameEvent, GameState, SeatId } from '../core/index.ts';
import type { Announcement } from './protocol.ts';

export function announce(prev: GameState, events: GameEvent[], next: GameState): Announcement[] | null {
	const out: Announcement[] = [];
	const nm = (id: SeatId) => next.seats[id]?.name ?? '?';
	for (const e of events) {
		switch (e.type) {
			case 'day-began': {
				// Who the room saw alive at dusk and sees dead now: not someone killed and brought back in the night (the Professor), nor someone already dead at dusk whom the night brought back and killed again.
				const alive = new Set(prev.night?.aliveAtDusk ?? []);
				const dead = [...new Set(prev.night?.deaths ?? [])].filter((d) => alive.has(d) && !next.seats[d].alive);
				out.push({ title: `Day ${e.n} dawns`, lines: dead.length ? dead.map((d) => `${nm(d)} died in the night.`) : ['Nobody died in the night.'] });
				break;
			}
			case 'vote-tallied': {
				const block = next.day?.block ?? null;
				const lines = [e.outcome === 'on-the-block' ? `${nm(e.nominee)} is about to die.`
					: e.outcome === 'tied' ? 'A tie: nobody is about to die.' : `Not enough. ${e.needed} were needed.`];
				if (e.outcome === 'not-enough' && block !== null) lines.push(`${nm(block)} is still about to die.`);
				out.push({ title: `${e.votes} vote${e.votes === 1 ? '' : 's'} for ${nm(e.nominee)}`, lines });
				break;
			}
			case 'executed': {
				const virgin = events.some((x) => x.type === 'ability-spent' && x.ability === 'virgin');
				// What the room sees: the player dies (a Zombuul's first death looks like one), or is still there.
				// Why they are still there (the Fool, the Tea Lady...) is never said.
				const dies = events.some((x) => (x.type === 'died' || x.type === 'seems-dead') && x.seat === e.seat);
				const survives = events.some((x) => x.type === 'survived-execution' && x.seat === e.seat);
				// A Zombuul who already seems dead and is saved looks, to the room, like a dead player executed: nothing is said that a dead player would not get.
				const looksDead = !prev.seats[e.seat].alive;
				const wasDead = !prev.seats[e.seat].alive && !prev.seats[e.seat].undead;
				// Neither dies nor survives, and was alive: the game ended with the execution (the Mastermind's day, the Evil Twin), and the winner says the rest.
				const fate = dies ? `${nm(e.seat)} dies.` : survives && looksDead ? `${nm(e.seat)} was already dead.` : survives ? `${nm(e.seat)} does not die.` : wasDead ? `${nm(e.seat)} was already dead.` : null;
				out.push(virgin
					? { title: 'The Virgin!', lines: [`${nm(e.seat)} nominated the Virgin.`, `${nm(e.seat)} is executed.`, ...(fate ? [fate] : [])] }
					: { title: 'Execution', lines: [`${nm(e.seat)} is executed.`, ...(fate ? [fate] : [])] });
				break;
			}
			case 'slayer-shot':
				// A hit that something stopped (the Tea Lady's neighbour...) looks like a miss.
				const dies = events.some((x) => (x.type === 'died' || x.type === 'seems-dead') && x.seat === e.target);
				out.push({ title: 'The Slayer', lines: [`${nm(e.by)} shoots ${nm(e.target)}.`, dies ? `${nm(e.target)} dies.` : 'Nothing happens.'] });
				break;
			case 'game-over':
				out.push({ title: e.winner === 'good' ? 'Good wins' : 'Evil wins', lines: [e.reason] });
				break;
		}
	}
	const dusk = events.some((e) => e.type === 'night-began') && prev.phase.kind === 'day';
	if (dusk && !events.some((e) => e.type === 'executed') && prev.day?.executed === null) {
		out.push({ title: 'Dusk', lines: ['Nobody is executed today.'] });
	}
	return out.length ? out : null;
}
