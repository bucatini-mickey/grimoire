import type { CharacterDef, Script } from '../types.ts';

/**
 * Sects & Violets. Ability text is our own paraphrase, written for the
 * Storyteller's reference - not the printed card wording. A number for
 * firstNight / otherNight only says the character wakes that night; the
 * order comes from the official night sheet (script.ts). Rulings:
 * docs/rules/INTERACTIONS.md, "Sects & Violets".
 */
const characters: CharacterDef[] = [
	// ---- Townsfolk ----
	{ id: 'clockmaker', name: 'Clockmaker', team: 'townsfolk', firstNight: 1, otherNight: null,
		ability: 'First night: learns how many steps round the circle it is from the Demon to its nearest Minion.' },
	{ id: 'dreamer', name: 'Dreamer', team: 'townsfolk', firstNight: 1, otherNight: 1,
		ability: 'Each night: chooses another player and learns two characters, one good and one evil; one of them is theirs.' },
	{ id: 'snake-charmer', name: 'Snake Charmer', team: 'townsfolk', firstNight: 1, otherNight: 1,
		ability: 'Each night: chooses a living player. If it is the Demon, they swap characters and alignments, and the new Snake Charmer is poisoned.' },
	{ id: 'mathematician', name: 'Mathematician', team: 'townsfolk', firstNight: 1, otherNight: 1,
		ability: 'Each night: learns how many players’ abilities went wrong since dawn because of another character.' },
	{ id: 'flowergirl', name: 'Flowergirl', team: 'townsfolk', firstNight: null, otherNight: 1,
		ability: 'Each night but the first: learns whether a Demon voted today.' },
	{ id: 'town-crier', name: 'Town Crier', team: 'townsfolk', firstNight: null, otherNight: 1,
		ability: 'Each night but the first: learns whether a Minion nominated today.' },
	{ id: 'oracle', name: 'Oracle', team: 'townsfolk', firstNight: null, otherNight: 1,
		ability: 'Each night but the first: learns how many dead players are evil.' },
	{ id: 'savant', name: 'Savant', team: 'townsfolk', firstNight: null, otherNight: null,
		ability: 'Each day: may visit the Storyteller to hear two things, one true and one false.' },
	{ id: 'seamstress', name: 'Seamstress', team: 'townsfolk', firstNight: 1, otherNight: 1,
		ability: 'Once per game, at night: chooses two other players and learns whether they are on the same team.' },
	{ id: 'philosopher', name: 'Philosopher', team: 'townsfolk', firstNight: 1, otherNight: 1,
		ability: 'Once per game, at night: chooses a good character and gains its ability. If that character is in play, its player is drunk.' },
	{ id: 'artist', name: 'Artist', team: 'townsfolk', firstNight: null, otherNight: null,
		ability: 'Once per game, by day: privately asks the Storyteller a yes-or-no question and is answered.' },
	{ id: 'juggler', name: 'Juggler', team: 'townsfolk', firstNight: null, otherNight: 1,
		ability: 'On their first day: publicly guesses up to five players’ characters. That night, learns how many guesses were right.' },
	{ id: 'sage', name: 'Sage', team: 'townsfolk', firstNight: null, otherNight: 1,
		ability: 'If the Demon kills the Sage, they learn two players, one of them the Demon.' },

	// ---- Outsiders ----
	{ id: 'mutant', name: 'Mutant', team: 'outsider', firstNight: null, otherNight: null,
		ability: 'If they try to convince anyone they are an Outsider, they might be executed.' },
	{ id: 'sweetheart', name: 'Sweetheart', team: 'outsider', firstNight: null, otherNight: 1,
		ability: 'When the Sweetheart dies, one player is drunk from then on.' },
	{ id: 'barber', name: 'Barber', team: 'outsider', firstNight: null, otherNight: 1,
		ability: 'If the Barber died today or tonight, the Demon may choose two players (not another Demon) to swap characters.' },
	{ id: 'klutz', name: 'Klutz', team: 'outsider', firstNight: null, otherNight: null,
		ability: 'On learning they died, publicly chooses a living player. If that player is evil, the good team loses.' },

	// ---- Minions ----
	{ id: 'evil-twin', name: 'Evil Twin', team: 'minion', firstNight: 1, otherNight: null,
		ability: 'The Evil Twin and a good player of the opposite team know each other’s characters. If the good twin is executed, evil wins. Good cannot win while both twins live.' },
	{ id: 'witch', name: 'Witch', team: 'minion', firstNight: 1, otherNight: 1,
		ability: 'Each night: chooses a player; if they nominate tomorrow, they die. With three players alive, this ability is lost.' },
	{ id: 'cerenovus', name: 'Cerenovus', team: 'minion', firstNight: 1, otherNight: 1,
		ability: 'Each night: chooses a player and a good character; tomorrow they must be "mad" that they are it, or might be executed.' },
	{ id: 'pit-hag', name: 'Pit-Hag', team: 'minion', firstNight: null, otherNight: 1,
		ability: 'Each night but the first: chooses a player and a character not in play; they become it. A new Demon makes tonight’s deaths the Storyteller’s choice.' },

	// ---- Demons ----
	{ id: 'fang-gu', name: 'Fang Gu', team: 'demon', firstNight: null, otherNight: 1,
		ability: 'Each night but the first: chooses a player to die. The first Outsider chosen becomes an evil Fang Gu and the Fang Gu dies instead. [+1 Outsider]',
		setup: { outsider: 1, townsfolk: -1 } },
	{ id: 'vigormortis', name: 'Vigormortis', team: 'demon', firstNight: null, otherNight: 1,
		ability: 'Each night but the first: chooses a player to die. A Minion it kills keeps their ability, and one Townsfolk next to them is poisoned. [-1 Outsider]',
		setup: { outsider: -1, townsfolk: 1 } },
	{ id: 'no-dashii', name: 'No Dashii', team: 'demon', firstNight: null, otherNight: 1,
		ability: 'Each night but the first: chooses a player to die. The nearest Townsfolk on each side are poisoned.' },
	{ id: 'vortox', name: 'Vortox', team: 'demon', firstNight: null, otherNight: 1,
		ability: 'Each night but the first: chooses a player to die. Townsfolk learn only false information. A day with no execution, and evil wins.' }
];

export const sectsAndViolets: Script = { id: 'sects-and-violets', name: 'Sects & Violets', characters };
