import type { CharacterDef, Script } from '../types.ts';

/**
 * Bad Moon Rising. Ability text is our own paraphrase, written for the
 * Storyteller's reference - not the printed card wording. A number for
 * firstNight / otherNight only says the character wakes that night; the
 * order comes from the official night sheet (script.ts). Rulings:
 * docs/rules/INTERACTIONS.md, "Bad Moon Rising".
 */
const characters: CharacterDef[] = [
	// ---- Townsfolk ----
	{ id: 'grandmother', name: 'Grandmother', team: 'townsfolk', firstNight: 1, otherNight: null,
		ability: 'First night: learns a good player and their character (the grandchild). If the Demon kills the grandchild, the Grandmother dies too.' },
	{ id: 'sailor', name: 'Sailor', team: 'townsfolk', firstNight: 1, otherNight: 1,
		ability: 'Each night: chooses a living player; either the Sailor or they are drunk until dusk. While sober, the Sailor cannot die.' },
	{ id: 'chambermaid', name: 'Chambermaid', team: 'townsfolk', firstNight: 1, otherNight: 1,
		ability: 'Each night: chooses two living players (not themself) and learns how many of them woke tonight to use their own ability.' },
	{ id: 'exorcist', name: 'Exorcist', team: 'townsfolk', firstNight: null, otherNight: 1,
		ability: 'Each night but the first: chooses a player, not the one chosen last night. A chosen Demon learns who the Exorcist is and does not wake to act tonight.' },
	{ id: 'innkeeper', name: 'Innkeeper', team: 'townsfolk', firstNight: null, otherNight: 1,
		ability: 'Each night but the first: chooses two players; they cannot die tonight, and one of them is drunk until dusk.' },
	{ id: 'gambler', name: 'Gambler', team: 'townsfolk', firstNight: null, otherNight: 1,
		ability: 'Each night but the first: chooses a player and guesses their character. A wrong guess and the Gambler dies.' },
	{ id: 'gossip', name: 'Gossip', team: 'townsfolk', firstNight: null, otherNight: 1,
		ability: 'Each day: may make a public statement. If it was true, a player dies tonight.' },
	{ id: 'courtier', name: 'Courtier', team: 'townsfolk', firstNight: 1, otherNight: 1,
		ability: 'Once per game, at night: chooses a character; its player is drunk for three nights and three days.' },
	{ id: 'professor', name: 'Professor', team: 'townsfolk', firstNight: null, otherNight: 1,
		ability: 'Once per game, at night but not the first: chooses a dead player; if they are a Townsfolk, they come back to life.' },
	{ id: 'minstrel', name: 'Minstrel', team: 'townsfolk', firstNight: null, otherNight: null,
		ability: 'When a Minion dies by execution, every other player (not Travellers) is drunk until dusk tomorrow.' },
	{ id: 'tea-lady', name: 'Tea Lady', team: 'townsfolk', firstNight: null, otherNight: null,
		ability: 'If both of the Tea Lady’s living neighbours are good, they cannot die.' },
	{ id: 'pacifist', name: 'Pacifist', team: 'townsfolk', firstNight: null, otherNight: null,
		ability: 'An executed good player might not die.' },
	{ id: 'fool', name: 'Fool', team: 'townsfolk', firstNight: null, otherNight: null,
		ability: 'The first time the Fool would die, they do not.' },

	// ---- Outsiders ----
	{ id: 'goon', name: 'Goon', team: 'outsider', firstNight: null, otherNight: null,
		ability: 'Each night, the first player to choose the Goon with their ability is drunk until dusk, and the Goon takes their alignment.' },
	{ id: 'lunatic', name: 'Lunatic', team: 'outsider', firstNight: 1, otherNight: 1,
		ability: 'Thinks they are a Demon, but is not. The real Demon knows who the Lunatic is and whom they choose at night.' },
	{ id: 'tinker', name: 'Tinker', team: 'outsider', firstNight: null, otherNight: null,
		ability: 'Might die at any time.' },
	{ id: 'moonchild', name: 'Moonchild', team: 'outsider', firstNight: null, otherNight: 1,
		ability: 'On learning they died, publicly chooses a living player. Tonight, if that player is good, they die.' },

	// ---- Minions ----
	{ id: 'godfather', name: 'Godfather', team: 'minion', firstNight: 1, otherNight: 1,
		ability: 'Starts knowing which Outsiders are in play. If an Outsider died today, chooses a player tonight: they die. [one more or one fewer Outsider]',
		setupOptions: [{ outsider: 1, townsfolk: -1 }, { outsider: -1, townsfolk: 1 }] },
	{ id: 'devils-advocate', name: 'Devil’s Advocate', team: 'minion', firstNight: 1, otherNight: 1,
		ability: 'Each night: chooses a living player, not last night’s; if executed tomorrow, they do not die.' },
	{ id: 'assassin', name: 'Assassin', team: 'minion', firstNight: null, otherNight: 1,
		ability: 'Once per game, at night but not the first: chooses a player; they die, whatever would protect them.' },
	{ id: 'mastermind', name: 'Mastermind', team: 'minion', firstNight: null, otherNight: null,
		ability: 'If the Demon dies by execution (ending the game), play one more day; if a player is then executed, their team loses.' },

	// ---- Demons ----
	{ id: 'zombuul', name: 'Zombuul', team: 'demon', firstNight: null, otherNight: 1,
		ability: 'Each night but the first, if no one died today: chooses a player to die. The first time the Zombuul dies, they live on but count as dead.' },
	{ id: 'pukka', name: 'Pukka', team: 'demon', firstNight: 1, otherNight: 1,
		ability: 'Each night: chooses a player to poison. The player poisoned before dies, then is healthy.' },
	{ id: 'shabaloth', name: 'Shabaloth', team: 'demon', firstNight: null, otherNight: 1,
		ability: 'Each night but the first: chooses two players to die. One dead player chosen last night might come back.' },
	{ id: 'po', name: 'Po', team: 'demon', firstNight: null, otherNight: 1,
		ability: 'Each night but the first: may choose a player to die. If their last choice was no one, they choose three tonight.' }
];

export const badMoonRising: Script = { id: 'bad-moon-rising', name: 'Bad Moon Rising', characters };
