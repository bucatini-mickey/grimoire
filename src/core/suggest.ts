/**
 * suggest.ts - a ready-made truthful answer for an information step.
 *
 * The Storyteller is never bound by these; they are a starting point the UI
 * can offer with one tap (and the tests use them to play nights quickly).
 * Every suggestion is checked by judgeInfo before it is returned.
 */
import type { GameState, Info, SeatId } from './types.ts';
import { charDef, getScript } from './script.ts';
import { chefNumbers, empathNumbers, fortuneAnswers, judgeInfo, librarianNoneIsTrue, PAIR_ROLE_TEAM, wokeTonight } from './rules.ts';

/**
 * `chosen` is what the player picked, for the roles that pick before they
 * learn: the Fortune Teller's two players, the Ravenkeeper's one.
 */
export function suggestInfo(state: GameState, role: string, to: SeatId, chosen: SeatId[] = []): Info | null {
	const script = getScript(state.scriptId);
	const others = state.seats.filter((s) => s.id !== to);
	let info: Info | null = null;

	switch (role) {
		case 'washerwoman':
		case 'librarian':
		case 'investigator': {
			const team = PAIR_ROLE_TEAM[role];
			const truth = others.find((s) => charDef(script, s.character).team === team);
			if (!truth) {
				info = role === 'librarian' && librarianNoneIsTrue(state) ? { kind: 'none' } : null;
				break;
			}
			const decoy = others.find((s) => s.id !== truth.id)!;
			const pair: [SeatId, SeatId] = truth.id < decoy.id ? [truth.id, decoy.id] : [decoy.id, truth.id];
			info = { kind: 'pair', players: pair, character: truth.character };
			break;
		}
		case 'chef':
			info = { kind: 'number', value: chefNumbers(state)[0] };
			break;
		case 'empath':
			info = { kind: 'number', value: empathNumbers(state, to)[0] };
			break;
		case 'fortune-teller':
			if (chosen.length !== 2) return null;
			info = { kind: 'fortune', players: [chosen[0], chosen[1]], yes: fortuneAnswers(state, chosen)[0] };
			break;
		case 'undertaker':
			if (!state.lastExecution) return null;
			info = { kind: 'character', character: state.seats[state.lastExecution.seat].character };
			break;
		case 'ravenkeeper':
			if (chosen.length !== 1) return null;
			info = { kind: 'reveal', player: chosen[0], character: state.seats[chosen[0]].character };
			break;
		case 'grandmother': {
			const child = others.find((s) => s.alignment === 'good' && ['townsfolk', 'outsider'].includes(charDef(script, s.character).team));
			if (!child) return null;
			info = { kind: 'reveal', player: child.id, character: child.character };
			break;
		}
		case 'chambermaid': {
			const pick = chosen.length === 2 ? chosen : others.filter((s) => s.alive).slice(0, 2).map((s) => s.id);
			if (pick.length !== 2) return null;
			const n = pick.filter((p) => wokeTonight(state, p)).length;
			info = { kind: 'woke', players: [pick[0], pick[1]], value: n };
			break;
		}
		case 'godfather-info':
		case 'godfather':
			info = { kind: 'characters', characters: state.seats.filter((s) => charDef(script, s.character).team === 'outsider').map((s) => s.character) };
			break;
	}
	if (info && judgeInfo(state, to, role, info).truthful) return info;
	// The rest (Sects & Violets): try the possible answers in turn and take the first true one.
	if (!info) for (const c of possibleAnswers(state, role, to, chosen)) if (judgeInfo(state, to, role, c).truthful) return c;
	return null;
}

/** Every answer of the right shape, for the roles answered by trying (small lists). */
function possibleAnswers(state: GameState, role: string, to: SeatId, chosen: SeatId[]): Info[] {
	const script = getScript(state.scriptId);
	const others = state.seats.filter((x) => x.id !== to).map((x) => x.id);
	const numbers = (max: number): Info[] => Array.from({ length: max + 1 }, (_, value) => ({ kind: 'number', value }));
	switch (role) {
		case 'clockmaker':
		case 'oracle':
		case 'juggler':
		case 'mathematician':
			return numbers(state.seats.length);
		case 'flowergirl':
		case 'town-crier':
			return [{ kind: 'yesno', yes: true }, { kind: 'yesno', yes: false }];
		case 'dreamer': {
			const player = chosen[0] ?? others[0];
			const good = script.characters.filter((c) => c.team === 'townsfolk' || c.team === 'outsider');
			const evil = script.characters.filter((c) => c.team === 'minion' || c.team === 'demon');
			const own = state.seats[player].character;
			// Their own character first, with any of the other side.
			const mine = script.characters.find((c) => c.id === own);
			const pairs: Info[] = [];
			if (mine) for (const o of (good.includes(mine) ? evil : good)) pairs.push({ kind: 'dream', player, characters: [mine.id, o.id] });
			for (const g of good) for (const e of evil) pairs.push({ kind: 'dream', player, characters: [g.id, e.id] });
			return pairs;
		}
		case 'seamstress': {
			const [a, b] = chosen.length === 2 ? chosen : others.slice(0, 2);
			return [{ kind: 'same', players: [a, b], yes: true }, { kind: 'same', players: [a, b], yes: false }];
		}
		case 'sage': {
			const out: Info[] = [];
			for (const a of others) for (const b of others) if (a < b) out.push({ kind: 'players', players: [a, b] });
			return out;
		}
	}
	return [];
}
