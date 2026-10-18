/**
 * helpers.ts - suggestions for the Storyteller where the rules leave it to
 * them: the Savant's daily pair of statements (one true, one false; when the
 * Savant is drunk or poisoned, by the Widow say, two truths or two lies), and
 * ideas for an Amnesiac's secret ability. Suggestions only: nothing here
 * changes the game.
 */
import * as G from '../core/index.ts';
import type { GameState, SeatId } from '../core/index.ts';

/** A statement for the Savant, and whether it is true. */
export interface Statement { text: string; true: boolean; }

function rng(seed: number) {
	let s = (seed * 2654435761) >>> 0 || 1;
	return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
}

/** True and false statements drawn from the grimoire, for the Savant at `savant`. */
export function savantStatements(state: GameState, savant: SeatId, seed: number): Statement[] {
	const r = rng(seed);
	const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
	const others = state.order.filter((id) => id !== savant);
	const nm = (id: SeatId) => state.seats[id].name;
	const team = (id: SeatId) => G.teamOf(state, state.seats[id].character);
	const evil = (id: SeatId) => state.seats[id].alignment === 'evil';
	const out: Statement[] = [];
	const both = (truth: string, lie: string) => { out.push({ text: truth, true: true }, { text: lie, true: false }); };
	// How many evil among three.
	const three = [...others].sort(() => r() - 0.5).slice(0, 3);
	if (three.length === 3) {
		const n = three.filter(evil).length;
		const lie = n === 0 ? 1 : n === 3 ? 2 : pick([n - 1, n + 1]);
		const say = (k: number) => `Exactly ${k} of ${three.map(nm).join(', ').replace(/, ([^,]*)$/, ' and $1')} ${k === 1 ? 'is' : 'are'} evil.`;
		both(say(n), say(lie));
	}
	// How many Outsiders.
	const outsiders = state.order.filter((id) => team(id) === 'outsider').length;
	both(`There ${outsiders === 1 ? 'is' : 'are'} ${outsiders} Outsider${outsiders === 1 ? '' : 's'} in play.`, `There ${outsiders === 0 ? 'is' : 'are'} ${outsiders === 0 ? 1 : outsiders - 1 || outsiders + 1} Outsider${(outsiders === 0 ? 1 : outsiders - 1 || outsiders + 1) === 1 ? '' : 's'} in play.`);
	// How far the Demon sits.
	const demon = state.order.find((id) => team(id) === 'demon');
	if (demon !== undefined && demon !== savant) {
		const n = state.order.length, a = state.order.indexOf(savant), b = state.order.indexOf(demon);
		const d = Math.min((a - b + n) % n, (b - a + n) % n);
		both(`The Demon sits ${d} seat${d === 1 ? '' : 's'} from you.`, `The Demon sits ${d + 1} seats from you.`);
	}
	// What kind of character someone is.
	const x = pick(others);
	const kinds = ['a Townsfolk', 'an Outsider', 'a Minion', 'the Demon'];
	const real = { townsfolk: 0, outsider: 1, minion: 2, demon: 3 }[team(x) as string] ?? 0;
	both(`${nm(x)} is ${kinds[real]}.`, `${nm(x)} is ${kinds[(real + 1 + Math.floor(r() * 3)) % 4]}.`);
	// Two players, one team or not.
	const [p, q] = [...others].sort(() => r() - 0.5);
	if (q !== undefined) {
		const same = evil(p) === evil(q);
		both(`${nm(p)} and ${nm(q)} are ${same ? 'on the same team' : 'on different teams'}.`, `${nm(p)} and ${nm(q)} are ${same ? 'on different teams' : 'on the same team'}.`);
	}
	// Evil sitting together.
	const n = state.order.length;
	const together = state.order.some((id, i) => evil(id) && evil(state.order[(i + 1) % n]));
	both(together ? 'Two evil players sit next to each other.' : 'No two evil players sit next to each other.', together ? 'No two evil players sit next to each other.' : 'Two evil players sit next to each other.');
	return out;
}

/**
 * Today's pair: one true and one false as the rules say; when the Savant is
 * drunk or poisoned, `mode` may make it two truths or two lies.
 */
export function savantPair(all: Statement[], seed: number, mode: 'normal' | 'truths' | 'lies'): Statement[] {
	const r = rng(seed + 7);
	const truths = all.filter((s) => s.true).sort(() => r() - 0.5), lies = all.filter((s) => !s.true).sort(() => r() - 0.5);
	const pair = mode === 'truths' ? truths.slice(0, 2) : mode === 'lies' ? lies.slice(0, 2) : [truths[0], lies.find((l) => l.text.split(' ')[0] !== truths[0]?.text.split(' ')[0]) ?? lies[0]];
	return pair.filter(Boolean).sort(() => r() - 0.5);
}

/** Secret abilities that suit an Amnesiac: each day they may guess, and you say how close they are. */
export const AMNESIAC_IDEAS: { name: string; text: string }[] = [
	{ name: 'Seer of pairs', text: 'Each night, you learn whether either of two players you choose is evil.' },
	{ name: 'Second sight', text: 'Each night, you learn which of your two living neighbours is closer to a Minion.' },
	{ name: 'Ward', text: 'Each night, choose a player: if the Demon attacks them tonight, nobody dies.' },
	{ name: 'Lantern', text: 'The first time you nominate an evil player, you learn they are evil.' },
	{ name: 'Tolling bell', text: 'Each night, you learn how many players died since you last woke who were good.' },
	{ name: 'Witness', text: 'If you die at night, you learn one Minion.' },
	{ name: 'Mourner', text: 'Each night, you learn the character of a dead player of your choice.' },
	{ name: 'Counterweight', text: 'Your vote counts twice while you are alive.' },
	{ name: 'Spirit level', text: 'Each night, learn whether more evil players sit to your left or your right.' },
	{ name: 'Penitent', text: 'Once per game, by day, publicly choose a player: if they are the Demon, they are drunk until dusk.' },
	{ name: 'Shepherd', text: 'Each night, choose a player: they cannot be made drunk or poisoned tonight.' },
	{ name: 'Herald', text: 'Each dawn, you learn whether the Demon chose a player who was nominated yesterday.' }
];
