/**
 * suggest.ts - a ready-made truthful answer for an information step.
 *
 * The Storyteller is never bound by these; they are a starting point the UI
 * can offer with one tap (and the tests use them to play nights quickly).
 * Every suggestion is checked by judgeInfo before it is returned.
 */
import type { GameState, Info, SeatId } from './types.ts';
import { charDef, getScript } from './script.ts';
import { chefNumbers, empathNumbers, fortuneAnswers, judgeInfo, librarianNoneIsTrue, PAIR_ROLE_TEAM } from './rules.ts';

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
	}
	if (info && judgeInfo(state, to, role, info).truthful) return info;
	return null;
}
