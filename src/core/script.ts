/**
 * script.ts - looking characters up, and the standard team-size table.
 */
import type { Alignment, CharacterDef, CharacterId, Composition, Script, Team } from './types.ts';
import { troubleBrewing } from './scripts/trouble-brewing.ts';
import { badMoonRising } from './scripts/bad-moon-rising.ts';
import { sectsAndViolets } from './scripts/sects-and-violets.ts';
import { TRAVELLERS } from './scripts/travellers.ts';
import { EXPERIMENTAL } from './scripts/experimental.ts';
import { firstNightOrder, otherNightOrder } from './scripts/night-order.ts';

/**
 * A script's wake order comes from the official night sheet. A character's
 * own definition says only whether it wakes (null: never by itself; any
 * number: when the sheet says); the sheet says when.
 */
function officialOrder(script: Script): Script {
	return {
		...script,
		characters: script.characters.map((c) => ({
			...c,
			firstNight: c.firstNight === null ? null : firstNightOrder(c.id) ?? c.firstNight,
			otherNight: c.otherNight === null ? null : otherNightOrder(c.id) ?? c.otherNight
		})),
		travellers: (script.travellers ?? []).map((c) => ({
			...c,
			firstNight: c.firstNight === null ? null : firstNightOrder(c.id) ?? c.firstNight,
			otherNight: c.otherNight === null ? null : otherNightOrder(c.id) ?? c.otherNight
		}))
	};
}

export const SCRIPTS: Record<string, Script> = Object.fromEntries([troubleBrewing, badMoonRising, sectsAndViolets].map((s) => [s.id, officialOrder({ ...s, travellers: TRAVELLERS[s.id] ?? [] })]));

/**
 * Every character the app knows, for custom scripts. The three scripts' own
 * definitions (their abilities are modelled); the experimental ones wake when
 * the official sheet says, and the Storyteller resolves them by hand.
 */
export const CATALOG: CharacterDef[] = [
	...[troubleBrewing, badMoonRising, sectsAndViolets].flatMap((sc) => sc.characters),
	...EXPERIMENTAL.filter((c) => c.team !== 'traveller').map((c) => ({ ...c, firstNight: firstNightOrder(c.id), otherNight: otherNightOrder(c.id) }))
];
const ALL_TRAVELLERS: CharacterDef[] = [
	...Object.values(TRAVELLERS).flat(),
	...EXPERIMENTAL.filter((c) => c.team === 'traveller').map((c) => ({ ...c, firstNight: firstNightOrder(c.id), otherNight: otherNightOrder(c.id) }))
];

/** Laissez un Faire (Steven Medway): a small script for five or six. The Cult Leader may be swapped for the Amnesiac. */
const LAISSEZ_UN_FAIRE = ['balloonist', 'savant', 'amnesiac', 'fisherman', 'artist', 'cult-leader', 'mutant', 'lunatic', 'goblin', 'widow', 'leviathan'];
SCRIPTS['laissez-un-faire'] = officialOrder({
	id: 'laissez-un-faire', name: 'Laissez un Faire',
	characters: LAISSEZ_UN_FAIRE.map((id) => CATALOG.find((c) => c.id === id)!),
	travellers: ALL_TRAVELLERS
});

/** A character modelled by the engine (the three scripts and their Travellers), or only known (resolved by hand). */
export const isModelled = (id: CharacterId) => [troubleBrewing, badMoonRising, sectsAndViolets].some((sc) => sc.characters.some((c) => c.id === id)) || Object.values(TRAVELLERS).flat().some((c) => c.id === id);

/** A custom script's id: its characters, in order. */
export const customScriptId = (ids: CharacterId[]) => `custom:${ids.join(',')}`;

const customCache = new Map<string, Script>();
function customScript(id: string): Script {
	const ids = id.slice('custom:'.length).split(',').filter(Boolean);
	const characters = ids.map((c) => CATALOG.find((x) => x.id === c) ?? (() => { throw new Error(`Unknown character "${c}"`); })());
	if (new Set(ids).size !== ids.length) throw new Error('A character is on the custom script twice.');
	return officialOrder({ id, name: 'Custom script', characters, travellers: ALL_TRAVELLERS });
}

export function getScript(id: string): Script {
	if (id.startsWith('custom:')) {
		let c = customCache.get(id);
		if (!c) { c = customScript(id); customCache.set(id, c); }
		return c;
	}
	const s = SCRIPTS[id];
	if (!s) throw new Error(`Unknown script "${id}"`);
	return s;
}

export function charDef(script: Script, id: CharacterId): CharacterDef {
	const c = script.characters.find((x) => x.id === id) ?? script.travellers?.find((x) => x.id === id);
	if (!c) throw new Error(`"${id}" is not on ${script.name}`);
	return c;
}

export function teamAlignment(team: Team): Alignment {
	return team === 'minion' || team === 'demon' ? 'evil' : 'good';
}

export function charactersOfTeam(script: Script, team: Team): CharacterDef[] {
	return script.characters.filter((c) => c.team === team);
}

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 15;

const TABLE: Record<number, Composition> = {
	5: { townsfolk: 3, outsider: 0, minion: 1, demon: 1 },
	6: { townsfolk: 3, outsider: 1, minion: 1, demon: 1 },
	7: { townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
	8: { townsfolk: 5, outsider: 1, minion: 1, demon: 1 },
	9: { townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
	10: { townsfolk: 7, outsider: 0, minion: 2, demon: 1 },
	11: { townsfolk: 7, outsider: 1, minion: 2, demon: 1 },
	12: { townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
	13: { townsfolk: 9, outsider: 0, minion: 3, demon: 1 },
	14: { townsfolk: 9, outsider: 1, minion: 3, demon: 1 },
	15: { townsfolk: 9, outsider: 2, minion: 3, demon: 1 }
};

/** Team counts for a player count, before setup characters (Baron) adjust them. */
export function baseComposition(players: number): Composition {
	const c = TABLE[players];
	if (!c) throw new Error(`Trouble Brewing needs ${MIN_PLAYERS}-${MAX_PLAYERS} players, not ${players}`);
	return { ...c };
}

/** Team counts once the chosen characters' setup changes are applied. */
export function expectedComposition(script: Script, players: number, chosen: CharacterId[]): Composition {
	const c = baseComposition(players);
	for (const id of chosen) {
		const mod = charDef(script, id).setup;
		if (!mod) continue;
		c.townsfolk += mod.townsfolk ?? 0;
		c.outsider += mod.outsider ?? 0;
		c.minion += mod.minion ?? 0;
		c.demon += mod.demon ?? 0;
	}
	// One fewer Outsider when there are none (the Vigormortis at 5 players): nothing changes.
	if (c.outsider < 0) { c.townsfolk += c.outsider; c.outsider = 0; }
	return c;
}

/**
 * Every team count the setup allows. Most characters change it one fixed way
 * (the Baron); some let the Storyteller choose (the Godfather: one more or one
 * fewer Outsider), so there may be several right answers.
 */
export function allowedCompositions(script: Script, players: number, chosen: CharacterId[], fabled: string[] = []): Composition[] {
	let out = [expectedComposition(script, players, chosen)];
	// The Sentinel: one more or one fewer Outsider is allowed too.
	if (fabled.includes('sentinel')) {
		out = out.flatMap((c) => [c, { ...c, outsider: c.outsider + 1, townsfolk: c.townsfolk - 1 }, { ...c, outsider: c.outsider - 1, townsfolk: c.townsfolk + 1 }])
			.filter((c) => c.townsfolk >= 0 && c.outsider >= 0);
	}
	for (const id of chosen) {
		const opts = charDef(script, id).setupOptions;
		if (!opts) continue;
		out = out.flatMap((c) => opts.map((o) => ({
			townsfolk: c.townsfolk + (o.townsfolk ?? 0),
			outsider: c.outsider + (o.outsider ?? 0),
			minion: c.minion + (o.minion ?? 0),
			demon: c.demon + (o.demon ?? 0)
		}))).filter((c) => c.townsfolk >= 0 && c.outsider >= 0);
	}
	return out;
}

/** Minions and the Demon learn each other on the first night only with 7 or more players. */
export function evilLearnEachOther(players: number): boolean {
	return players >= 7;
}
