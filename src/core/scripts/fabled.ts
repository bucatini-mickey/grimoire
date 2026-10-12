/**
 * The Fabled: characters the Storyteller takes on to change the rules for a
 * game (never a player's). Text is our own paraphrase. `engine` says what the
 * engine does with it; the rest are announced and run by the Storyteller.
 * Rulings: docs/rules/INTERACTIONS.md ("Fabled").
 */
export interface FabledDef {
	id: string;
	name: string;
	ability: string;
	/** What the engine does: 'rules' changes play; 'notes' is the Storyteller's alone. */
	engine: 'rules' | 'notes';
	/** It names a character when chosen (the Storm Catcher). */
	needsCharacter?: boolean;
}

export const FABLED: FabledDef[] = [
	{ id: 'sentinel', name: 'Sentinel', engine: 'rules', ability: 'There might be one more or one fewer Outsider in play.' },
	{ id: 'doomsayer', name: 'Doomsayer', engine: 'rules', ability: 'With four or more alive, each living player may once publicly choose that a player of their own team dies (the Storyteller picks who).' },
	{ id: 'toymaker', name: 'Toymaker', engine: 'rules', ability: 'The Demon may choose to attack no one, and must do so once a game. The evil team always learns each other and the Demon gets bluffs.' },
	{ id: 'ferryman', name: 'Ferryman', engine: 'rules', ability: 'On the final day, every dead player gets their vote back.' },
	{ id: 'storm-catcher', name: 'Storm Catcher', engine: 'rules', needsCharacter: true, ability: 'Names a good character: if in play, they can only die by execution; evil players learn who it is (or it is not in play).' },
	{ id: 'angel', name: 'Angel', engine: 'notes', ability: 'Protects new players: whoever is most responsible for their death might suffer for it.' },
	{ id: 'buddhist', name: 'Buddhist', engine: 'notes', ability: 'For the first two minutes of each day, experienced players stay silent.' },
	{ id: 'hells-librarian', name: 'Hell’s Librarian', engine: 'notes', ability: 'Something bad might happen to whoever talks when the Storyteller asks for silence.' },
	{ id: 'revolutionary', name: 'Revolutionary', engine: 'notes', ability: 'Two neighbours are known to be on the same team; once a game one of them registers falsely.' },
	{ id: 'fibbin', name: 'Fibbin', engine: 'notes', ability: 'Once a game, one good player might get false information.' },
	{ id: 'duchess', name: 'Duchess', engine: 'notes', ability: 'Each day three players may visit; each learns how many visitors are evil, one of them falsely.' },
	{ id: 'fiddler', name: 'Fiddler', engine: 'notes', ability: 'Once a game, the Demon secretly picks an opponent; everyone votes which of the two wins, and that team wins.' },
	{ id: 'spirit-of-ivory', name: 'Spirit of Ivory', engine: 'notes', ability: 'No more than one extra evil player can ever be made.' },
	{ id: 'djinn', name: 'Djinn', engine: 'notes', ability: 'Announces the special rule for any jinxed characters on the script.' },
	{ id: 'deus-ex-fiasco', name: 'Deus ex Fiasco', engine: 'notes', ability: 'At least once a game, the Storyteller makes a mistake, then corrects it publicly.' }
];
