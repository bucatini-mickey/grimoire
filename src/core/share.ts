/**
 * share.ts - a shareable summary of a game's setup.
 *
 * It is built only from the script and the player count, never from the game
 * state, so it cannot carry anything secret (seats, who is what, the Drunk,
 * the red herring, bluffs). Setup modifiers are listed as what the script
 * *can* do, not which of them is in play: saying "Baron: +2 Outsiders" for the
 * players is fine, saying that the Baron is in this game is not.
 */
import type { CharacterDef, Composition, Script } from './types.ts';
import { MAX_PLAYERS, MIN_PLAYERS, baseComposition } from './script.ts';

/** The official script-tool id: lower case, letters and digits only ("Pit-Hag" is "pithag"). */
export const officialId = (id: string) => id.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The script in the official JSON format that other tools import: a _meta entry, then the character ids. */
export function scriptJson(script: Script, author = ''): string {
	return JSON.stringify([{ id: '_meta', name: script.name, author }, ...script.characters.map((c) => officialId(c.id))]);
}

const TEAM_LABELS: [keyof Composition, string][] = [['townsfolk', 'Townsfolk'], ['outsider', 'Outsiders'], ['minion', 'Minions'], ['demon', 'Demon']];

const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '\u2212' : '') + Math.abs(n);

function change(m: Partial<Composition>): string {
	return TEAM_LABELS.filter(([k]) => m[k]).map(([k, l]) => `${signed(m[k]!)} ${l}`).join(', ');
}

/** The characters on the script that change the team counts, and how. */
export function setupModifiers(script: Script): { name: string; change: string }[] {
	const out: { name: string; change: string }[] = [];
	for (const c of script.characters as CharacterDef[]) {
		if (c.setup) out.push({ name: c.name, change: change(c.setup) });
		else if (c.setupOptions) out.push({ name: c.name, change: c.setupOptions.map(change).join(' or ') });
	}
	return out;
}

/** Players this summary can speak about: 5 to 15 (Travellers are not counted), else null. */
export function usablePlayerCount(n: number | null | undefined): number | null {
	return n != null && Number.isInteger(n) && n >= MIN_PLAYERS && n <= MAX_PLAYERS ? n : null;
}

const countsLine = (c: Composition) => TEAM_LABELS.map(([k, l]) => `${c[k]} ${l}`).join(', ');

/** The plain-text summary, with the script JSON at the end. */
export function setupSummary(script: Script, players: number | null | undefined, author = ''): string {
	const n = usablePlayerCount(players);
	const lines: string[] = [`Blood on the Clocktower setup: ${script.name}`];
	if (n !== null) lines.push(`Players: ${n}`, `Teams before setup modifiers: ${countsLine(baseComposition(n))}`);
	else {
		lines.push('Teams before setup modifiers, by number of players:');
		for (let p = MIN_PLAYERS; p <= MAX_PLAYERS; p++) lines.push(`  ${p}: ${countsLine(baseComposition(p))}`);
	}
	const mods = setupModifiers(script);
	if (mods.length) {
		lines.push('Setup modifiers on this script (applied if the character is in play):');
		for (const m of mods) lines.push(`  ${m.name}: ${m.change}`);
	} else lines.push('Setup modifiers on this script: none');
	lines.push('Characters:');
	for (const [k, l] of [['townsfolk', 'Townsfolk'], ['outsider', 'Outsiders'], ['minion', 'Minions'], ['demon', 'Demons']] as const) {
		const of = script.characters.filter((c) => c.team === k);
		if (of.length) lines.push(`  ${l}: ${of.map((c) => c.name).join(', ')}`);
	}
	lines.push('', 'Script (official JSON, import it into other tools):', scriptJson(script, author));
	return lines.join('\n');
}

/** A safe file name for the download. */
export const summaryFileName = (script: Script) => (script.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'script') + '-setup.txt';
