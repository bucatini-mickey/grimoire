/**
 * candidates.ts - ready-made answers for an information step, each with a lean.
 *
 * Trouble Brewing leaves the Storyteller real choices even when telling the
 * truth: which decoy to pair with the true player, how the Spy or Recluse
 * registers. And a drunk or poisoned player may be told anything at all,
 * true or false. This offers a handful of worded options so the Storyteller
 * is choosing rather than composing:
 *
 *   neutral    true, chosen without leaning either way
 *   good       true, but chosen to make good's job easier
 *   evil       true, but chosen to muddy things for good
 *   false      only offered when the player is drunk or poisoned
 *
 * The leans are ordinary Storyteller judgement, not game theory, which is
 * why every candidate carries its reason. Every candidate is checked by
 * judgeInfo, so its `truthful` flag is always right.
 */
import type { CharacterId, GameState, Info, Seat, SeatId } from './types.ts';
import { charDef, getScript, charactersOfTeam } from './script.ts';
import { suggestInfo } from './suggest.ts';
import {
	chefNumbers, clockwiseFrom, empathNumbers, fortuneAnswers, isDroisoned, judgeInfo, livingNeighbours, PAIR_ROLE_TEAM, registrations, teamOf
} from './rules.ts';

export type Lean = 'neutral' | 'good' | 'evil';

export interface Candidate {
	lean: Lean;
	truthful: boolean;
	info: Info;
	why: string;
}

/** Seats in circle order starting after `from`, so different players get different picks. */
function around(state: GameState, from: SeatId): Seat[] {
	return clockwiseFrom(state, from).map((id) => state.seats[id]);
}

const isEvil = (s: Seat) => s.alignment === 'evil';

export function infoCandidates(state: GameState, role: string, to: SeatId, chosen: SeatId[] = []): Candidate[] {
	const out: Candidate[] = [];
	const seen = new Set<string>();
	const droisoned = isDroisoned(state, to);
	const add = (lean: Lean, info: Info | null | undefined, why: string) => {
		if (!info) return;
		const key = JSON.stringify(info);
		if (seen.has(key)) return;
		const v = judgeInfo(state, to, role, info);
		if (!v.wellFormed) return;
		if (!v.truthful && !droisoned) return;
		seen.add(key);
		out.push({ lean, truthful: v.truthful, info, why });
	};
	const name = (id: SeatId) => state.seats[id].name;
	const script = getScript(state.scriptId);
	const others = around(state, to);

	if (role in PAIR_ROLE_TEAM) {
		const team = PAIR_ROLE_TEAM[role];
		const pair = (a: Seat, b: Seat, character: CharacterId): Info => ({ kind: 'pair', players: [a.id, b.id], character });
		const holders = others.filter((s) => teamOf(state, s.character) === team);
		const truth = holders[0];
		if (truth) {
			const decoys = others.filter((s) => s.id !== truth.id);
			const goodDecoy = decoys.find((s) => !isEvil(s));
			const evilDecoy = decoys.find(isEvil);
			const c = truth.character;
			add('neutral', pair(truth, decoys[Math.floor(decoys.length / 2)], c), 'True. A decoy from across the circle.');
			if (team === 'minion') {
				add('good', evilDecoy && pair(truth, evilDecoy, c), 'True, and the decoy is evil too: either guess catches someone.');
				add('evil', goodDecoy && pair(truth, goodDecoy, c), 'True, but the decoy is good, so suspicion splits onto an innocent.');
			} else {
				add('good', goodDecoy && pair(truth, goodDecoy, c), 'True, and the decoy is good: no cover handed to evil.');
				add('evil', evilDecoy && pair(truth, evilDecoy, c), `True, but the decoy is evil: they can now claim the ${charDef(script, c).name}.`);
			}
		}
		// The Spy can pass as a Townsfolk or Outsider; the Recluse as a Minion.
		for (const s of others) {
			if (s.character === truth?.character) continue;
			// Never the receiver's own character: "one of these is the Washerwoman" tells a Washerwoman nothing.
			const passes = registrations(state, s.id).characters.find((c) => c !== s.character && c !== role && teamOf(state, c) === team);
			if (!passes) continue;
			const decoy = others.find((d) => d.id !== s.id)!;
			add(s.alignment === 'evil' ? 'evil' : 'good', pair(s, decoy, passes),
				`True by registration: ${s.name} (${charDef(script, s.character).name}) may register as the ${charDef(script, passes).name}.`);
		}
		if (role === 'librarian') add(holders.length ? 'evil' : 'neutral', { kind: 'none' }, holders.length ? 'False unless registrations allow it.' : 'True: there are no Outsiders.');
		if (droisoned) {
			const goods = others.filter((s) => !isEvil(s));
			const evils = others.filter(isEvil);
			const wrong = charactersOfTeam(script, team).map((c) => c.id).find((c) => !state.seats.some((s) => s.character === c));
			if (team === 'minion' && goods.length >= 2) {
				const m = state.seats.find((s) => teamOf(state, s.character) === 'minion')?.character ?? charactersOfTeam(script, 'minion')[0].id;
				add('evil', pair(goods[0], goods[1], m), `False: frames two good players as the ${charDef(script, m).name}.`);
			}
			if (team !== 'minion' && evils.length && goods.length && wrong) {
				add('evil', pair(evils[0], goods[0], wrong), `False: offers ${evils[0].name} (evil) a ${charDef(script, wrong).name} cover.`);
			}
			if (truth && wrong) {
				const decoy = others.find((d) => d.id !== truth.id)!;
				add('neutral', pair(truth, decoy, wrong), 'False: the right player, the wrong character.');
			}
		}
		return out;
	}

	if (role === 'chef' || role === 'empath') {
		const truths = role === 'chef' ? chefNumbers(state) : empathNumbers(state, to);
		const max = role === 'empath' ? Math.min(2, livingNeighbours(state, to).length) : state.seats.filter(isEvil).length;
		const actual = role === 'chef'
			? state.order.filter((id, i) => isEvil(state.seats[id]) && isEvil(state.seats[state.order[(i + 1) % state.order.length]])).length
			: livingNeighbours(state, to).filter((id) => isEvil(state.seats[id])).length;
		for (const v of truths) {
			const lean: Lean = truths.length === 1 ? 'neutral' : v >= actual ? 'good' : 'evil';
			add(lean, { kind: 'number', value: v }, truths.length === 1 ? 'True.' : v === actual ? 'True, with everyone registering as they are.' : 'True by the Spy or Recluse registering otherwise.');
		}
		if (droisoned) {
			for (const v of [actual - 1, actual + 1, actual - 2, actual + 2]) {
				if (v < 0 || v > max) continue;
				add('evil', { kind: 'number', value: v }, v < actual ? 'False: hides evil.' : 'False: casts suspicion on the innocent.');
			}
		}
		return out;
	}

	if (role === 'fortune-teller') {
		if (chosen.length !== 2) return out;
		const [a, b] = chosen;
		const players: [SeatId, SeatId] = [a, b];
		const answers = fortuneAnswers(state, chosen);
		const demonThere = chosen.some((p) => state.seats[p].alignment === 'evil' && teamOf(state, state.seats[p].character) === 'demon');
		for (const yes of answers) {
			const why = answers.length === 1
				? (state.redHerring !== null && chosen.includes(state.redHerring) && !demonThere ? 'True: the red herring reads as the Demon.' : 'True.')
				: yes ? 'True if the Recluse registers as the Demon.' : 'True with the Recluse registering as himself.';
			add(answers.length === 1 ? 'neutral' : yes ? 'evil' : 'good', { kind: 'fortune', players, yes }, why);
		}
		if (droisoned) {
			add('evil', { kind: 'fortune', players, yes: !demonThere }, demonThere ? `False: hides the Demon among ${name(a)} and ${name(b)}.` : `False: frames ${name(a)} or ${name(b)}.`);
		}
		return out;
	}

	if (role === 'undertaker' || role === 'ravenkeeper') {
		const target = role === 'undertaker' ? state.lastExecution?.seat : chosen[0];
		if (target === undefined) return out;
		const t = state.seats[target];
		const info = (character: CharacterId): Info =>
			role === 'undertaker' ? { kind: 'character', character } : { kind: 'reveal', player: target, character };
		add('neutral', info(t.character), `True: ${t.name} is the ${charDef(script, t.character).name}.`);
		for (const c of registrations(state, target).characters) {
			if (c === t.character) continue;
			add(isEvil(t) ? 'evil' : 'good', info(c), `True by registration as the ${charDef(script, c).name}.`);
			if (out.length > 4) break;
		}
		if (droisoned) {
			const bluff = isEvil(t)
				? state.bluffs[0] ?? charactersOfTeam(script, 'townsfolk')[0].id
				: state.seats.find((s) => teamOf(state, s.character) === 'minion')?.character ?? 'imp';
			add('evil', info(bluff), isEvil(t) ? `False: shows evil ${t.name} as a good character.` : `False: shows good ${t.name} as evil.`);
		}
		return out;
	}
	// Any other role: the plain true answer, as a starting point.
	add('neutral', suggestInfo(state, role, to, chosen), 'True.');
	return out;
}
