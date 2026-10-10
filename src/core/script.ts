/**
 * script.ts - looking characters up, and the standard team-size table.
 */
import type { Alignment, CharacterDef, CharacterId, Composition, Script, Team } from './types.ts';
import { troubleBrewing } from './scripts/trouble-brewing.ts';

export const SCRIPTS: Record<string, Script> = { [troubleBrewing.id]: troubleBrewing };

export function getScript(id: string): Script {
	const s = SCRIPTS[id];
	if (!s) throw new Error(`Unknown script "${id}"`);
	return s;
}

export function charDef(script: Script, id: CharacterId): CharacterDef {
	const c = script.characters.find((x) => x.id === id);
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
	return c;
}

/** Minions and the Demon learn each other on the first night only with 7 or more players. */
export function evilLearnEachOther(players: number): boolean {
	return players >= 7;
}
