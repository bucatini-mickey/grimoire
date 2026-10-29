/**
 * codex.ts - what the book teaches a newcomer: how the game is played, how abilities meet, and for
 * each character a few first thoughts on playing it (or against it). Starting points, not strategy:
 * plain enough for someone at their first game.
 */

/** A page of the codex: a title, and its paragraphs (a heading is a line starting "## "). */
export interface CodexPage { title: string; lines: string[] }

export const HOW_TO_PLAY: CodexPage = {
	title: 'How the game works',
	lines: [
		'## The two sides',
		'Blood on the Clocktower is a game of hidden roles. Most players are good: the Townsfolk, each with a useful ability, and a few Outsiders, whose abilities hinder their own side. A few are evil: the Minions, and one Demon.',
		'Good wins when the Demon dies. Evil wins when only two players are left alive (or by some other ability that says so).',
		'## The Storyteller',
		'One person does not play: the Storyteller runs the game, keeps the grimoire (every character, and every mark on them), wakes players at night and decides what they learn. The Storyteller wants a close, exciting game, not one side to win.',
		'## The night',
		'Everyone closes their eyes. The Storyteller wakes characters one by one, in a set order: some choose a player (the Demon chooses who dies), some learn something. On the first night the evil team learn who each other are, and the Demon is told three good characters not in play, to bluff as.',
		'## The day',
		'Everyone opens their eyes and hears who died. Then the town talks: openly, or in private corners. Good players share what they learned, but evil players lie, and may claim to be good characters. Nobody is ever forced to tell the truth, and you never show your character token.',
		'## Nominations and votes',
		'Later in the day the Storyteller opens nominations. Each living player may nominate once, and each player may be nominated once. Everyone votes by raising a hand. If the votes reach half the living players, the nominee is "on the block"; a later nomination must beat that count to replace them. At the end of the day, whoever is on the block is executed. Only one execution a day, and there may be none.',
		'## Death is not the end',
		'Dead players keep talking and keep their seat: their information still matters. They have no ability any more, and one last vote for the rest of the game, so they spend it carefully.',
		'## Drunk and poisoned',
		'A drunk or poisoned player has no ability, but the Storyteller does not tell them: they wake as usual, and what they learn may be false. So all information is a little uncertain, and good players compare notes to find what fits.',
		'## Your first game',
		'Listen more than you talk, and tell people what you learned. If you are evil, pick a believable bluff from the three you were given and stick to it. Ask the Storyteller anything about the rules: they are there to help.'
	]
};

export const INTERACTIONS: CodexPage = {
	title: 'When abilities meet',
	lines: [
		'## Drunk or poisoned',
		'A drunk or poisoned player’s ability does nothing, and anything they learn may be false. The Poisoner poisons a different player each night; the Drunk thinks they are a Townsfolk and never learns otherwise.',
		'## Registering as something else',
		'Some characters can register falsely to other abilities. The Recluse may register as evil, or as a Minion or the Demon. The Spy may register as good, or as a Townsfolk or Outsider. The Storyteller decides each time, so a single "evil" reading on a Recluse proves little.',
		'## When the Demon dies',
		'Good normally wins at once. But if five or more players are alive and the Scarlet Woman is in play, she becomes the new Demon and the game goes on. The Imp can also kill itself at night to pass the Demon to a Minion.',
		'## Protection',
		'The Monk protects one other player from the Demon each night; the Soldier is safe from the Demon. When nobody dies at night, a protector may have done their job, or the Demon may have aimed at a protected or immune player.',
		'## Executions and their echoes',
		'The Undertaker learns the character of whoever was executed, and the Virgin, the Saint and the Mayor turn executions into evidence or into a trap: the Virgin’s first nominator dies if they are a Townsfolk; executing the Saint loses the game for good; the Mayor wins for good if three are alive and nobody is executed.',
		'## Votes',
		'The Butler may only vote if their master (chosen each night) votes too. Each dead player has one vote left for the rest of the game, so a close count often comes down to how the dead spend theirs.'
	]
};

/** For each character: a few first thoughts for a new player. */
export const TIPS: Record<string, string[]> = {
	// ---- Trouble Brewing ----
	washerwoman: ['You learn that one of two players is a particular Townsfolk. Share it early: it pins down two people at once.', 'If one of your two turns out to be evil, the other is very likely the Townsfolk you were shown.'],
	librarian: ['Like the Washerwoman, but for an Outsider. Learning "no Outsiders" is information too: anyone claiming Butler, Recluse, Saint or Drunk is then lying.', 'Your Outsider pair can catch a Drunk who believes they are a Townsfolk.'],
	investigator: ['You learn that one of two players is a particular Minion. Watch both closely, and do not shout it out too soon: the Minion will start lying the moment they know.', 'The Recluse can show up as a Minion, so a pair with a Recluse in it may be a false alarm.'],
	chef: ['You learn how many pairs of evil players sit next to each other. A 0 means no two evil players are neighbours, which rules out many theories.', 'Combine it with other seating information to place the evil team around the circle.'],
	empath: ['Each night you learn how many of your two living neighbours are evil. As neighbours die, your neighbours change: keep track of who you are reading.', 'A steady 0 makes your neighbours trustworthy; a sudden change can mean poison, or a death beside you.'],
	'fortune-teller': ['Each night pick two players: you learn if either is the Demon. One good player is your "red herring" and always reads yes.', 'Check people who seem trustworthy as well as suspects: a "no" clears both at once.'],
	undertaker: ['Each night you learn the character of whoever was executed that day. It confirms or exposes claims.', 'If an executed player claimed a Townsfolk but you saw a Minion, the town knows who lied, and who backed them.'],
	monk: ['Each night protect one other player from the Demon. Protect the players the evil team most wants dead: those with strong information.', 'A night without deaths might be your doing: say who you protected, carefully.'],
	ravenkeeper: ['If the Demon kills you at night, you choose a player and learn their character. Your death is your moment.', 'Pick someone whose claim the town is arguing about, so your answer settles something.'],
	virgin: ['Your one nomination is a test that can confirm two people at a stroke: if a Townsfolk nominates you, they die, and you are both proven good. Even though a good player is lost, the town gains two players it can trust.', 'If nothing happens, one of you may be lying: the nominator is not a Townsfolk, or you are not the Virgin, or you were drunk or poisoned. If one of you can be cleared, suspicion falls on the other.'],
	slayer: ['Once per game, during the day, you publicly choose a player: if they are the Demon, they die.', 'Wait until the town has a good suspect. A miss still teaches something: that player is not the Demon (unless you were drunk or poisoned).'],
	soldier: ['You are safe from the Demon. Evil may want you executed instead, so be believable.', 'Claiming Soldier can draw the Demon’s attack away from others, and a night with no death may be the Demon wasting a kill on you.'],
	mayor: ['If only three players live and no one is executed, good wins. And if you die at night, another player might die instead.', 'Late in the game, steer the town not to execute when three are left, if you are trusted.'],
	butler: ['Each night choose a master; tomorrow you may only vote if they vote too. You are an Outsider: your ability gets in the way.', 'Choosing a trusted player as master keeps your vote useful.'],
	drunk: ['You do not know you are the Drunk: you believe you are a Townsfolk, and what you learn may be false.', 'If your information keeps clashing with everyone else’s, consider that you might be the Drunk.'],
	recluse: ['You might register as evil, even as a Minion or the Demon, to other abilities. Good players may read you as a threat.', 'Tell the town you are the Recluse early, so odd readings on you are understood.'],
	saint: ['If you are executed, your team loses. Make sure the town believes you, and is careful.', 'Evil may try to get you executed: claim early enough to be safe, late enough not to be a target.'],
	poisoner: ['Each night poison a player: their ability fails and their information may be false.', 'Poison the players whose information would hurt you most, and let the town argue about whose information is wrong.'],
	spy: ['Each night you see the grimoire: every character in play. You may register as good to abilities.', 'You know exactly what to bluff and who to discredit. Feed your Demon what you know, carefully.'],
	'scarlet-woman': ['If the Demon dies while five or more players are alive, you become the Demon.', 'Keep a low profile and keep yourself alive: the town may think they have won.'],
	baron: ['There are two extra Outsiders in play. Good players will find more Outsiders than they expect.', 'Your bluff is often an Outsider too: there are plenty around.'],
	imp: ['Each night choose a player to die. If you choose yourself, a Minion becomes the Imp.', 'Use your three bluffs. Killing yourself late can pass the Demon to a trusted Minion and throw the town off.'],
	// ---- Bad Moon Rising ----
	grandmother: ['You learn a good player and their character. If the Demon kills that player, you die too.', 'Your grandchild is someone you can trust: work with them, and keep them hidden.'],
	sailor: ['Each night choose a player: either you or they are drunk until dusk. You cannot die while sober.', 'Choosing an evil player makes them drunk: a useful way to blunt a Minion.'],
	chambermaid: ['Each night learn how many of two other players woke tonight because of their ability.', 'It shows who has a night ability: check claims that should or should not wake.'],
	exorcist: ['Each night choose a player: if it is the Demon, they learn who you are and do not act tonight.', 'Pick a suspected Demon: a night with no deaths after your choice is a strong hint.'],
	innkeeper: ['Each night two players are safe from death, but one of them is drunk until dusk.', 'Protect players the Demon wants dead; mention the drunkenness when their information looks strange.'],
	gambler: ['Each night guess a player’s character: if you are wrong, you die.', 'Guess characters you are confident about, and share correct guesses: they confirm a claim.'],
	gossip: ['Each day you may make a public statement: if it is true, a player dies tonight.', 'Say things you think are true but are not sure about: a death the next night confirms it.'],
	courtier: ['Once per game choose a character: they are drunk for three nights.', 'Name the Demon’s character to stop its kills, or a Minion to blunt it.'],
	professor: ['Once per game, at night, choose a dead player: if they are a Townsfolk, they are resurrected.', 'Bring back a trusted information character, or test a claim: a failed resurrection means they were not a Townsfolk.'],
	minstrel: ['When a Minion dies by execution, all other players (except Travellers) are drunk until dusk tomorrow.', 'Executing a Minion then blanks evil abilities for a night: a good time to act.'],
	'tea-lady': ['If both your living neighbours are good, they cannot die.', 'Sit near trusted players: your neighbours surviving is itself information.'],
	pacifist: ['Executed good players might not die.', 'If a good player survives execution, the town can trust them more.'],
	fool: ['The first time you die, you do not.', 'You can take a risk others cannot: volunteer for executions to test the town.'],
	goon: ['Each night, the first player to choose you with their ability is drunk until dusk, and you turn their alignment.', 'Your alignment can change: tell the town early who you are.'],
	lunatic: ['You think you are the Demon, but you are not. The real Demon knows who you are.', 'You will not know you are the Lunatic: if your kills never seem to land, think about it.'],
	tinker: ['You might die at any time.', 'Your sudden death is not evidence of anything: say so early.'],
	moonchild: ['When you learn you died, publicly choose a living player: if good, they die.', 'Choose someone you suspect is evil: a good choice kills a friend.'],
	godfather: ['You start knowing which Outsiders are in play. If one died today, choose a player tonight to die.', 'Getting Outsiders executed gives you extra kills.'],
	'devils-advocate': ['Each night choose a living player: if they are executed tomorrow, they do not die.', 'Protect your Demon from execution, and watch the town’s reaction.'],
	assassin: ['Once per game, at night, choose a player: they die, even if somehow protected.', 'Save it for a player who cannot otherwise be killed, or who knows too much.'],
	mastermind: ['If the Demon dies by execution, play continues for one more day: if a good player is then executed, evil wins.', 'Push for a good execution the day after the Demon falls.'],
	zombuul: ['Each night, if nobody died today, choose a player to die. The first time you die, you live but register as dead.', 'Seeming dead is your greatest disguise.'],
	pukka: ['Each night choose a player: they are poisoned. The previously poisoned player dies then becomes healthy.', 'Your kills come a night late: confuse the town about who did what.'],
	shabaloth: ['Each night choose two players: they die. A dead player you choose may be regurgitated (brought back).', 'Two deaths a night is fast: press while the town is confused.'],
	po: ['Each night you may choose a player to die. If you choose nobody, next night choose three.', 'Holding back for a night of three kills can swing the game late.'],
	// ---- Sects & Violets ----
	clockmaker: ['You start knowing how many steps the Demon is from its nearest Minion.', 'A 1 means the Demon sits next to a Minion: useful with seating information.'],
	dreamer: ['Each night choose a player: you learn one good and one evil character, one of which is theirs.', 'Check players whose claims matter: if neither character fits the claim, they lied.'],
	'snake-charmer': ['Each night choose a player: if it is the Demon, you swap characters and alignments, and they are poisoned.', 'Becoming the Demon is a surprise: you will be told. Pick suspects.'],
	mathematician: ['Each night learn how many players’ abilities worked abnormally since dawn, because of another character.', 'A high number means drunkenness, poisoning or meddling: something is wrong in the town.'],
	flowergirl: ['Each night learn if a Demon voted today.', 'Watch who voted: the list narrows when the answer is yes.'],
	'town-crier': ['Each night learn if a Minion nominated today.', 'Watch who nominated: a yes points at one of them.'],
	oracle: ['Each night learn how many dead players are evil.', 'It tells you whether executions are hitting evil.'],
	savant: ['Each day you may visit the Storyteller to learn two things in private: one true and one false.', 'Over several days, the true statements line up with what others learn.'],
	seamstress: ['Once per game, at night, choose two players: you learn if they are the same alignment.', 'Pair a trusted player with a suspect to learn the suspect’s side.'],
	philosopher: ['Once per game, at night, choose a good character: you gain its ability. If it is in play, they are drunk.', 'Pick a character that would help most right now.'],
	artist: ['Once per game, during the day, privately ask the Storyteller any yes/no question.', 'Ask something that cuts the possibilities in half: "Is X the Demon?"'],
	juggler: ['On your first day, publicly guess up to five players’ characters. That night, learn how many were right.', 'Guess the claims you believe: a low count means people are lying.'],
	sage: ['If the Demon kills you, you learn that it is one of two players.', 'Your death points at the Demon: make it count.'],
	mutant: ['If you are "mad" about being an Outsider, you might be executed.', 'Do not claim to be the Mutant: bluff a Townsfolk.'],
	sweetheart: ['When you die, one player is drunk from now on.', 'Your death leaves a drunk player: tell the town so they weigh information.'],
	barber: ['If you died today or tonight, the Demon may choose two players (not another Demon) to swap characters.', 'Your death shuffles characters: expect claims to change.'],
	klutz: ['When you learn you died, publicly choose one alive player: if they are evil, your team loses.', 'Choose someone you are very sure is good.'],
	'evil-twin': ['You and an opposing player know each other. If the good player is executed, evil wins. Good cannot win while you both live.', 'Make the town doubt your good twin.'],
	witch: ['Each night choose a player: if they nominate tomorrow, they die.', 'Curse players who are likely to nominate your friends.'],
	cerenovus: ['Each night choose a player and a good character: they are "mad" they are that character tomorrow, or might be executed.', 'Make good players claim things that confuse the town.'],
	'pit-hag': ['Each night choose a player and a character they become. If a Demon is made, deaths tonight are arbitrary.', 'Change players into characters that sow doubt.'],
	'fang-gu': ['Each night choose a player to die. The first Outsider this kills becomes an evil Fang Gu and you die instead.', 'Jumping into an Outsider renews your disguise.'],
	vigormortis: ['Each night choose a player to die. Minions you kill keep their ability and poison a Townsfolk neighbour.', 'Killing your own Minions can be a strength.'],
	'no-dashii': ['Each night choose a player to die. Your two Townsfolk neighbours are poisoned.', 'Your neighbours’ information is false: let them mislead the town.'],
	vortox: ['Each night choose a player to die. Townsfolk abilities yield false information. Each day, if no one is executed, evil wins.', 'All good information is wrong: the town must execute every day.'],
	// ---- Laissez un Faire ----
	balloonist: ['Each night learn a player of a different character type than last night.', 'Over the nights you see one of each type: line them up with claims.'],
	amnesiac: ['You do not know what your ability is. Each day, privately guess what it is: you learn how accurate you are.', 'Ask the Storyteller good guesses: your ability may be powerful once found.'],
	fisherman: ['Once per game, during the day, visit the Storyteller for some advice to help your team win.', 'Save it for when the town is stuck.'],
	'cult-leader': ['Each night you become the alignment of one of your living neighbours. If all good players choose to join your cult, your team wins.', 'Your alignment can change: keep your neighbours in mind.'],
	goblin: ['If you publicly claim to be the Goblin when nominated and are executed that day, your team wins.', 'Time your claim for a nomination that is likely to pass.'],
	widow: ['On your first night look at the grimoire and choose a player: they are poisoned. One good player knows a Widow is in play.', 'Use what you saw to guide your team, and poison the most dangerous player.'],
	leviathan: ['If more than one good player is executed, evil wins. All players know you are in play. After day 5, evil wins.', 'Time is on your side: help the town make mistakes.']
};
