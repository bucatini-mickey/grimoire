import type { CharacterDef } from '../types.ts';

/**
 * The experimental characters (the "carousel") and the Loric, in our own
 * words: reference text for the Storyteller and for custom scripts later.
 * They are not on any script the engine plays yet, so their night order is
 * left to the official sheet and their abilities are not modelled.
 * Rulings: docs/rules/INTERACTIONS.md.
 */
const t = (id: string, name: string, ability: string): CharacterDef => ({ id, name, team: 'townsfolk', firstNight: null, otherNight: null, ability });
const o = (id: string, name: string, ability: string): CharacterDef => ({ id, name, team: 'outsider', firstNight: null, otherNight: null, ability });
const m = (id: string, name: string, ability: string): CharacterDef => ({ id, name, team: 'minion', firstNight: null, otherNight: null, ability });
const d = (id: string, name: string, ability: string): CharacterDef => ({ id, name, team: 'demon', firstNight: null, otherNight: null, ability });
const v = (id: string, name: string, ability: string): CharacterDef => ({ id, name, team: 'traveller', firstNight: null, otherNight: null, ability });

export const EXPERIMENTAL: CharacterDef[] = [
	// ---- Townsfolk ----
	t('steward', 'Steward', 'First night: learns one player who is good.'),
	t('knight', 'Knight', 'First night: learns two players, neither of them the Demon.'),
	t('noble', 'Noble', 'First night: learns three players, exactly one of whom is evil.'),
	t('shugenja', 'Shugenja', 'First night: learns which way round the circle the nearest evil player is (either, if it is a tie).'),
	t('pixie', 'Pixie', 'First night: learns a Townsfolk in play. Having pretended to be it convincingly, gains its ability when its player dies.'),
	t('bounty-hunter', 'Bounty Hunter', 'Knows one evil player; each time the one they know dies, learns another that night. [one Townsfolk is evil]'),
	t('high-priestess', 'High Priestess', 'Each night: learns the player the Storyteller thinks they should talk to most.'),
	t('balloonist', 'Balloonist', 'Each night: learns a player whose character type differs from last night’s. [maybe one more Outsider]'),
	t('general', 'General', 'Each night: learns which team the Storyteller thinks is winning, or neither.'),
	t('preacher', 'Preacher', 'Each night: chooses a player; a Minion chosen learns it and has no ability while the Preacher has theirs.'),
	t('village-idiot', 'Village Idiot', 'Each night: chooses a player and learns their alignment. [up to two more Village Idiots; one of the extra is drunk]'),
	t('king', 'King', 'Once the dead are as many as the living, each night learns one living character. The Demon knows who the King is.'),
	t('cult-leader', 'Cult Leader', 'Each night: takes the alignment of a living neighbour. If every good player joins the cult, the cult’s team wins.'),
	t('acrobat', 'Acrobat', 'Each night but the first: chooses a player; if they are or become drunk or poisoned tonight, the Acrobat dies.'),
	t('lycanthrope', 'Lycanthrope', 'Each night but the first: chooses a living player; if good, they die and the Demon kills no one. One good player registers as evil.'),
	t('alsaahir', 'Alsaahir', 'Each day: may publicly name who are the Minions and who the Demon; all right, and good wins.'),
	t('engineer', 'Engineer', 'Once per game, at night: chooses which Minions, or which Demon, are in play.'),
	t('nightwatchman', 'Nightwatchman', 'Once per game, at night: chooses a player, who learns who the Nightwatchman is.'),
	t('huntsman', 'Huntsman', 'Once per game, at night: chooses a living player; if it is the Damsel, they become a Townsfolk not in play. [adds the Damsel]'),
	t('fisherman', 'Fisherman', 'Once per game, by day: asks the Storyteller for advice on how to win.'),
	t('princess', 'Princess', 'On their first day, if they nominated a player who was executed, the Demon kills no one that night.'),
	t('alchemist', 'Alchemist', 'Has a Minion’s ability (usually one not in play); the Storyteller may ask them to choose again.'),
	t('cannibal', 'Cannibal', 'Has the ability of the last player executed; if that player was evil, the Cannibal is poisoned until a good player is executed.'),
	t('amnesiac', 'Amnesiac', 'Has an ability no one tells them; each day may guess it privately and learn how close they are.'),
	t('farmer', 'Farmer', 'If they die at night, a living good player becomes a Farmer.'),
	t('choirboy', 'Choirboy', 'If the Demon kills the King, the Choirboy learns who the Demon is. [adds the King]'),
	t('banshee', 'Banshee', 'If the Demon kills them, everyone learns it, and from then on they may nominate twice a day and vote twice each time.'),
	t('magician', 'Magician', 'The Demon thinks the Magician is a Minion; the Minions think the Magician is a Demon.'),
	t('poppy-grower', 'Poppy Grower', 'Minions and the Demon do not learn each other; when the Poppy Grower dies, they do that night.'),
	t('atheist', 'Atheist', 'The Storyteller may break the rules; if the Atheist is executed, good wins, even if already dead. [no evil characters]'),
	// ---- Outsiders ----
	o('hermit', 'Hermit', 'Has every Outsider ability. [maybe one fewer Outsider]'),
	o('ogre', 'Ogre', 'First night: chooses another player and becomes their alignment without knowing it, drunk or poisoned or not.'),
	o('golem', 'Golem', 'May nominate only once a game; if that nominee is not the Demon, they die.'),
	o('plague-doctor', 'Plague Doctor', 'When they die, the Storyteller gains a Minion ability.'),
	o('hatter', 'Hatter', 'If they died today or tonight, the Minions and Demon may choose new Minion and Demon characters.'),
	o('politician', 'Politician', 'If they were the most to blame for their team losing, they change team and win, even if dead.'),
	o('zealot', 'Zealot', 'With five or more alive, must vote on every nomination.'),
	o('damsel', 'Damsel', 'The Minions know a Damsel is in play; if a Minion publicly guesses who it is (once), good loses.'),
	o('snitch', 'Snitch', 'Each Minion gets three bluffs.'),
	o('heretic', 'Heretic', 'The winners lose and the losers win, even if the Heretic is dead.'),
	o('puzzlemaster', 'Puzzlemaster', 'One player is drunk, even after the Puzzlemaster dies. One guess who: right, learn the Demon; wrong, false information.'),
	// ---- Minions ----
	m('mezepheles', 'Mezepheles', 'Starts knowing a secret word; the first good player to say it turns evil that night.'),
	m('harpy', 'Harpy', 'Each night: chooses two players; tomorrow the first must be mad that the second is evil, or one or both might die.'),
	m('fearmonger', 'Fearmonger', 'Each night: chooses a player; if the Fearmonger nominates them and they are executed, their team loses. Everyone learns when the choice changes.'),
	m('psychopath', 'Psychopath', 'Each day, before nominations, may publicly kill a player. Executed, they die only if they lose at rock-paper-scissors.'),
	m('wizard', 'Wizard', 'Once per game, may make a wish; if granted, it may have a price, and leave a clue to what it was.'),
	m('widow', 'Widow', 'First night: sees the Grimoire and poisons a player. One good player learns a Widow is in play.'),
	m('xaan', 'Xaan', 'On the night numbered by the Outsider count, all Townsfolk are poisoned until dusk. [as many Outsiders as that night]'),
	m('marionette', 'Marionette', 'Thinks they are a good character but is a Minion; the Demon knows who. [sits next to the Demon]'),
	m('wraith', 'Wraith', 'May open their eyes at night; wakes whenever other evil players do.'),
	m('summoner', 'Summoner', 'Gets three bluffs; on the third night chooses a player who becomes an evil Demon of the Summoner’s choosing. [no Demon at the start]'),
	m('goblin', 'Goblin', 'If, when nominated, they publicly claim to be the Goblin and are executed that day, their team wins.'),
	m('boomdandy', 'Boomdandy', 'If executed, all but three players die; after a countdown, the player most pointed at dies.'),
	m('vizier', 'Vizier', 'Everyone knows who the Vizier is; cannot die by day; if a good player voted, may have a nominee executed at once.'),
	m('organ-grinder', 'Organ Grinder', 'Votes are cast with eyes closed and the tally is secret. Each night chooses whether to be drunk until dusk.'),
	m('boffin', 'Boffin', 'The Demon (even drunk or poisoned) has the ability of a good character not in play; both know which.'),
	// ---- Demons ----
	d('yaggababble', 'Yaggababble', 'Starts knowing a secret phrase; each time they say it in public today, a player might die tonight.'),
	d('lil-monsta', 'Lil’ Monsta', 'Each night the Minions choose who minds Lil’ Monsta and counts as the Demon; each night but the first a player might die. [one more Minion]'),
	d('ojo', 'Ojo', 'Each night but the first: chooses a character, and its player dies; if it is not in play, the Storyteller chooses who dies.'),
	d('kazali', 'Kazali', 'Each night but the first: chooses a player to die. Chooses at the start which players are which Minions. [Outsider count may change]'),
	d('legion', 'Legion', 'Each night but the first a player might die; an execution fails if only evil voted; registers as a Minion too. [most players are Legion]'),
	d('lord-of-typhon', 'Lord of Typhon', 'Each night but the first: chooses a player to die. [the evil players sit in a line with the Lord of Typhon in the middle; one more Minion; Outsider count may change]'),
	d('lleech', 'Lleech', 'Each night but the first: chooses a player to die. First chooses a host, who is poisoned; the Lleech dies only when the host is dead.'),
	d('al-hadikhia', 'Al-Hadikhia', 'Each night but the first may choose three players, announced to all; each secretly chooses to live or die, but if all live, all die.'),
	d('riot', 'Riot', 'On day 3 the Minions become Riot; every nominee dies but must nominate a living player at once. This must happen.'),
	d('leviathan', 'Leviathan', 'Everyone knows a Leviathan is in play. If more than one good player is executed, or once day 5 ends, evil wins.'),
	// ---- Travellers ----
	v('cacklejack', 'Cacklejack', 'Each day: chooses a player; a different player changes character tonight.'),
	v('gangster', 'Gangster', 'Once a day: may kill a living neighbour, if their other living neighbour agrees.'),
	v('gnome', 'Gnome', 'Everyone starts knowing a player of the Gnome’s alignment; the Gnome may kill anyone who nominates them.')
];

/** The Loric: rule changes the Storyteller announces for a script (like the Fabled). */
export const LORIC: { id: string; name: string; ability: string }[] = [
	{ id: 'big-wig', name: 'Big Wig', ability: 'Each nominee picks a player who alone may speak until the vote, and must be mad the nominee is good, or might die.' },
	{ id: 'bootlegger', name: 'Bootlegger', ability: 'This script has home-made characters or rules.' },
	{ id: 'gardener', name: 'Gardener', ability: 'The Storyteller assigns every player’s character.' },
	{ id: 'god-of-ug', name: 'God of Ug', ability: 'Whoever wears the Ug hat speaks one sound at a time but votes twice; failing that, they pass the hat on.' },
	{ id: 'hindu', name: 'Hindu', ability: 'The first four players to die come straight back as Travellers of their alignment.' },
	{ id: 'knaves', name: 'Knaves', ability: 'Two Storytellers, one lying and one truthful; once a game, at dusk, they might swap.' },
	{ id: 'pope', name: 'Pope', ability: 'Good characters may be duplicated in play, and may also be bluffs.' },
	{ id: 'storm-catcher', name: 'Storm Catcher', ability: 'Names a good character: if in play, they can only die by execution; evil learns who it is.' },
	{ id: 'tor', name: 'Tor', ability: 'Players do not know their character or alignment until they die.' },
	{ id: 'ventriloquist', name: 'Ventriloquist', ability: 'A nominee who is mad about being a new character during their nomination might survive an execution today.' },
	{ id: 'zenomancer', name: 'Zenomancer', ability: 'Some players have a goal; reaching it, they learn something true.' }
];
