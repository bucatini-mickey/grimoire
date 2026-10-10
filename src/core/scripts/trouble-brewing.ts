import type { CharacterDef, Script } from '../types.ts';

/**
 * Trouble Brewing. Ability text is our own paraphrase, written for the
 * Storyteller's reference - not the printed card wording.
 *
 * Wake order numbers are relative sort keys. The sequence follows the
 * official night sheet as best remembered; the only orderings the rules
 * actually depend on are: Poisoner first, Monk before the Imp, the Imp
 * before the Ravenkeeper and before every "learn" ability, Spy last.
 * Those are pinned by tests. See docs/DESIGN.md, "Things to verify".
 */
const characters: CharacterDef[] = [
	// ---- Townsfolk ----
	{ id: 'washerwoman', name: 'Washerwoman', team: 'townsfolk', firstNight: 20, otherNight: null,
		ability: 'First night: shown two players and a Townsfolk; one of the two is that character.' },
	{ id: 'librarian', name: 'Librarian', team: 'townsfolk', firstNight: 21, otherNight: null,
		ability: 'First night: shown two players and an Outsider; one of the two is that character. Or told there are no Outsiders.' },
	{ id: 'investigator', name: 'Investigator', team: 'townsfolk', firstNight: 22, otherNight: null,
		ability: 'First night: shown two players and a Minion; one of the two is that character.' },
	{ id: 'chef', name: 'Chef', team: 'townsfolk', firstNight: 23, otherNight: null,
		ability: 'First night: learns how many pairs of evil players sit next to each other.' },
	{ id: 'empath', name: 'Empath', team: 'townsfolk', firstNight: 24, otherNight: 31,
		ability: 'Each night: learns how many of their two nearest living neighbours are evil.' },
	{ id: 'fortune-teller', name: 'Fortune Teller', team: 'townsfolk', firstNight: 25, otherNight: 32,
		ability: 'Each night: chooses two players and learns if either is the Demon. One good player always reads as the Demon.' },
	{ id: 'undertaker', name: 'Undertaker', team: 'townsfolk', firstNight: null, otherNight: 33,
		ability: 'Each night but the first: learns which character died by execution today.' },
	{ id: 'monk', name: 'Monk', team: 'townsfolk', firstNight: null, otherNight: 12,
		ability: 'Each night but the first: chooses another player; the Demon cannot kill them tonight.' },
	{ id: 'ravenkeeper', name: 'Ravenkeeper', team: 'townsfolk', firstNight: null, otherNight: 30,
		ability: 'If killed at night: wakes, chooses a player and learns their character.' },
	{ id: 'virgin', name: 'Virgin', team: 'townsfolk', firstNight: null, otherNight: null,
		ability: 'The first time they are nominated, if the nominator is a Townsfolk, the nominator is executed at once.' },
	{ id: 'slayer', name: 'Slayer', team: 'townsfolk', firstNight: null, otherNight: null,
		ability: 'Once per game, by day, publicly chooses a player: if they are the Demon, they die.' },
	{ id: 'soldier', name: 'Soldier', team: 'townsfolk', firstNight: null, otherNight: null,
		ability: 'Cannot be killed by the Demon.' },
	{ id: 'mayor', name: 'Mayor', team: 'townsfolk', firstNight: null, otherNight: null,
		ability: 'If three players live and no one is executed, good wins. If killed at night, someone else might die instead.' },

	// ---- Outsiders ----
	{ id: 'butler', name: 'Butler', team: 'outsider', firstNight: 26, otherNight: 34,
		ability: 'Each night: chooses a master (not themselves). Tomorrow they may vote only if their master votes too.' },
	{ id: 'drunk', name: 'Drunk', team: 'outsider', firstNight: null, otherNight: null,
		ability: 'Believes they are a Townsfolk, but has no ability. Their information may be false.' },
	{ id: 'recluse', name: 'Recluse', team: 'outsider', firstNight: null, otherNight: null,
		ability: 'Might register as evil, and as a Minion or Demon, even if dead.' },
	{ id: 'saint', name: 'Saint', team: 'outsider', firstNight: null, otherNight: null,
		ability: 'If executed and killed, the good team loses.' },

	// ---- Minions ----
	{ id: 'poisoner', name: 'Poisoner', team: 'minion', firstNight: 10, otherNight: 10,
		ability: 'Each night: chooses a player, whose ability fails tonight and tomorrow.' },
	{ id: 'spy', name: 'Spy', team: 'minion', firstNight: 27, otherNight: 35,
		ability: 'Each night: sees the grimoire. Might register as good, and as a Townsfolk or Outsider, even if dead.' },
	{ id: 'scarlet-woman', name: 'Scarlet Woman', team: 'minion', firstNight: null, otherNight: null,
		ability: 'If five or more players are alive when the Demon dies, becomes the Demon.' },
	{ id: 'baron', name: 'Baron', team: 'minion', firstNight: null, otherNight: null,
		ability: 'There are two extra Outsiders in play.', setup: { outsider: 2, townsfolk: -2 } },

	// ---- Demon ----
	{ id: 'imp', name: 'Imp', team: 'demon', firstNight: null, otherNight: 20,
		ability: 'Each night but the first: chooses a player to die. If it chooses itself, a Minion becomes the Imp.' }
];

export const troubleBrewing: Script = { id: 'trouble-brewing', name: 'Trouble Brewing', characters };
