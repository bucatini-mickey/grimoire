import type { CharacterDef } from '../types.ts';

/**
 * Travellers: players who join late or leave early. The Storyteller chooses
 * each one's alignment; everyone knows they are a Traveller and which one.
 * They can be exiled by any vote (the dead vote too, free). Ability text is
 * our own paraphrase, for the Storyteller's reference - not the card wording.
 * Rulings: docs/rules/INTERACTIONS.md ("Travellers").
 */
export const TRAVELLERS: Record<string, CharacterDef[]> = {
	'trouble-brewing': [
		{ id: 'scapegoat', name: 'Scapegoat', team: 'traveller', firstNight: null, otherNight: null,
			ability: 'If a player of your alignment is executed, you might be executed instead.' },
		{ id: 'gunslinger', name: 'Gunslinger', team: 'traveller', firstNight: null, otherNight: null,
			ability: 'Each day, after the first vote has been counted: may choose a player who voted; they die.' },
		{ id: 'beggar', name: 'Beggar', team: 'traveller', firstNight: null, otherNight: null,
			ability: 'May vote only with a vote token handed over by another player; a dead player who gives one learns your alignment.' },
		{ id: 'bureaucrat', name: 'Bureaucrat', team: 'traveller', firstNight: 1, otherNight: 1,
			ability: 'Each night: chooses another player; tomorrow their vote counts three times.' },
		{ id: 'thief', name: 'Thief', team: 'traveller', firstNight: 1, otherNight: 1,
			ability: 'Each night: chooses another player; tomorrow their vote counts against the total (minus one).' }
	],
	'bad-moon-rising': [
		{ id: 'apprentice', name: 'Apprentice', team: 'traveller', firstNight: 1, otherNight: null,
			ability: 'On the first night: good, gains a Townsfolk ability; evil, gains a Minion ability.' },
		{ id: 'matron', name: 'Matron', team: 'traveller', firstNight: null, otherNight: null,
			ability: 'Each day: may move up to three pairs of players to swap seats; players may not leave their seat to talk privately.' },
		{ id: 'judge', name: 'Judge', team: 'traveller', firstNight: null, otherNight: null,
			ability: 'Once per game, after another player nominates: may make that nomination’s execution pass or fail, whatever the votes.' },
		{ id: 'bishop', name: 'Bishop', team: 'traveller', firstNight: null, otherNight: null,
			ability: 'Only the Storyteller nominates, at least once a day, each nomination a player of the opposite team.' },
		{ id: 'voudon', name: 'Voudon', team: 'traveller', firstNight: null, otherNight: null,
			ability: 'Only the Voudon and the dead vote; dead votes are free, and a majority is not needed.' }
	],
	'sects-and-violets': [
		{ id: 'barista', name: 'Barista', team: 'traveller', firstNight: 1, otherNight: 1,
			ability: 'Each night, until dusk: one player is sober, healthy and gets true information, or their ability works twice. They learn which.' },
		{ id: 'harlot', name: 'Harlot', team: 'traveller', firstNight: null, otherNight: 1,
			ability: 'Each night but the first: chooses a living player; if they agree, they learn the Harlot’s character, and both might die.' },
		{ id: 'butcher', name: 'Butcher', team: 'traveller', firstNight: null, otherNight: null,
			ability: 'Each day, after the first execution: may nominate again.' },
		{ id: 'bone-collector', name: 'Bone Collector', team: 'traveller', firstNight: null, otherNight: 1,
			ability: 'Once per game, at night: chooses a dead player; they regain their ability until dusk.' },
		{ id: 'deviant', name: 'Deviant', team: 'traveller', firstNight: null, otherNight: null,
			ability: 'If they were funny today, they cannot die by exile.' }
	]
};
