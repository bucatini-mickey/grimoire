/**
 * deal.ts - a random but legal deal, from a seed.
 *
 * Produces an `assign` command rather than events, so a dealt game goes
 * through exactly the same checks as one the Storyteller sets up by hand.
 * The same seed always gives the same deal.
 */
import type { CharacterId, Script, SeatId, Team } from './types.ts';
import type { Command } from './engine.ts';
import { baseComposition, charactersOfTeam, evilLearnEachOther, teamAlignment, charDef } from './script.ts';

/** mulberry32: small, fast, good enough for shuffling tokens. */
export function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
	const a = [...xs];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

export function randomDeal(script: Script, players: number, seed: number): Extract<Command, { type: 'assign' }> {
	const rand = rng(seed);
	const ids = (team: Team) => shuffle(charactersOfTeam(script, team).map((c) => c.id), rand);
	const comp = baseComposition(players);

	const demon = ids('demon').slice(0, comp.demon);
	const minions = ids('minion').slice(0, comp.minion);
	for (const m of [...minions, ...demon]) {
		const def = charDef(script, m);
		// A fixed change (the Baron), or one of the Storyteller's options (the Godfather), at random.
		// Only options that leave a possible setup (no fewer than zero Outsiders).
		const options = (def.setupOptions ?? []).filter((o) => comp.outsider + (o.outsider ?? 0) >= 0 && comp.townsfolk + (o.townsfolk ?? 0) >= 0);
		const mod = def.setup ?? (options.length ? options[Math.floor(rand() * options.length)] : undefined);
		comp.townsfolk += mod?.townsfolk ?? 0;
		comp.outsider += mod?.outsider ?? 0;
	}
	if (comp.outsider < 0) { comp.townsfolk += comp.outsider; comp.outsider = 0; }
	const outsiders = ids('outsider').slice(0, comp.outsider);
	const townsfolk = ids('townsfolk').slice(0, comp.townsfolk);
	const characters = shuffle([...demon, ...minions, ...outsiders, ...townsfolk], rand);

	const inPlay = new Set(characters);
	const spareTownsfolk = ids('townsfolk').filter((c) => !inPlay.has(c));
	const drunkBelieves = inPlay.has('drunk') ? spareTownsfolk[0] : undefined;

	const goodSeats: SeatId[] = characters
		.map((c, i) => (teamAlignment(charDef(script, c).team) === 'good' ? i : -1))
		.filter((i) => i >= 0);
	const believesFT = characters.includes('fortune-teller') || drunkBelieves === 'fortune-teller';
	const redHerring = believesFT ? shuffle(goodSeats, rand)[0] : null;

	const bluffPool: CharacterId[] = shuffle(
		// Any good character not in play, the Drunk included.
		script.characters.filter((c) => teamAlignment(c.team) === 'good' && !inPlay.has(c.id) && c.id !== drunkBelieves).map((c) => c.id),
		rand
	);
	const bluffs = evilLearnEachOther(players) ? bluffPool.slice(0, 3) : [];

	// The Evil Twin's good twin: a good player.
	const evilTwin = characters.includes('evil-twin') ? shuffle(goodSeats, rand)[0] : undefined;
	return { type: 'assign', characters, drunkBelieves, redHerring, bluffs, ...(evilTwin !== undefined ? { evilTwin } : {}) };
}
