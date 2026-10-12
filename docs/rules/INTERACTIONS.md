# Interactions and rulings

Each line: an id, the ruling in our own words, and its status.
**tested** = a test in `tests/rulings.test.ts` (or named file) and checked by the simulator;
**sim** = checked by the simulator's independent rules; **engine** = enforced, no dedicated
test yet; **todo** = not yet modelled. Sources in `SOURCES.md` (mostly the official wiki's
"How to Run" and examples for each character).

## General (the rules pages: States, Glossary)

- GEN-EXEC-DEAD: a dead player may be executed; it uses up the day's execution but kills no one. **engine**
- GEN-DIE-ONCE: a dead player cannot die again; an attack on them is no death (and no news at dawn). **sim**
- GEN-ONCE-WASTED: a once-per-game ability used while drunk or poisoned is gone. **sim** (Slayer, Virgin)
- GEN-DROISON-RESUME: a lasting ability stops while drunk or poisoned and resumes when sober and healthy (Tea Lady, Witch's curse). **todo** (no such ability in TB)
- GEN-DROISON-TRIGGER: an ability triggered while drunk or poisoned is wasted for good (poisoned Sweetheart, drunk Innkeeper). **todo**
- GEN-DROISON-SEPARATE: drunk and poisoned are separate states; they never cancel out. **todo** (TB has only one source of each)
- GEN-STATE-FOLLOWS-PLAYER: the player is drunk or poisoned, not the character; it stays through a change of character. **todo**
- GEN-ALIGN-INDEPENDENT: alignment and character are independent; a change of one keeps the other. **todo** (TB: only Minion-to-Imp, which stays evil)
- GEN-RESURRECT: a resurrected player gets their ability back, once-per-game ones included; first-night abilities act that night. **todo**
- GEN-ONCE-DEAD: a player who dies before using a once-per-game ability cannot use it. **engine**
- GEN-PERSISTENT-ENDS: when a player dies, the lasting effects of their ability end (the Poisoner's poison). **sim**
- GEN-TIE: an execution needs votes of at least half the living and more than any other nominee today; a tie clears the block. **sim**
- GEN-NOMINATE-ONCE: a player may nominate once a day and be nominated once a day; only the living nominate. **sim**
- GEN-GHOST-VOTE: the dead may vote once more in the game. **sim**
- GEN-TWO-LEFT: evil wins when only two players live (Travellers not counted). **sim** (no Travellers yet)
- GEN-DEMON-DEAD: good wins when the Demon dies (unless something takes over). **sim**
- GEN-INFO-RULES-TRUE: the rules are always told truly, even to the drunk or poisoned. (Storyteller practice)
- GEN-LEARN-OWN-CHANGE: a player told of a change to their own character or alignment learns it truly, drunk or not (not information). **todo**
- GEN-MADNESS: madness is the Storyteller's judgement of whether a player tries to convince the group of something. **todo** (S&V)

## Trouble Brewing

- TB-WASHER-SPY: the Spy may register as a Townsfolk (any) to the Washerwoman. **tested** (info.test)
- TB-INVEST-RECLUSE: the Recluse may register as any Minion, in play or not, to the Investigator. **tested** (info.test)
- TB-LIBRARIAN-DRUNK: the Librarian learns the Drunk as the Drunk, not the Townsfolk they think they are; "no Outsiders" is false with a Drunk in play. **tested** (info.test)
- TB-CHEF-PAIRS: a run of three evil players is two pairs; the circle wraps round. **tested** (info.test)
- TB-CHEF-RECLUSE: the Recluse (or Spy) may register differently for each pair: between the Imp and the Poisoner, the Chef may learn 0, 1 or 2. **tested** (fixed 2026-10-11: we used to allow only 0 or 2)
- TB-CHEF-SPY: the Spy may read evil to the Chef and good to the Empath on the same night. **tested**
- TB-EMPATH-LIVING: the Empath reads the nearest living player each way, after the Demon has killed. **sim**
- TB-EMPATH-THREE: with three alive (Empath, Imp, Minion) the Empath learns 2. **sim**
- TB-FT-HERRING: the red herring is one good player for the whole game, possibly the Fortune Teller themself. **tested**
- TB-FT-ANY: the Fortune Teller may choose anyone, dead or alive, or themself; a dead Demon still reads yes. **sim**
- TB-FT-SW: once the Scarlet Woman becomes the Demon, the Fortune Teller reads her as the Demon. **sim**
- TB-UNDERTAKER-DRUNK: an executed Drunk shows as the Drunk to the Undertaker. **sim**
- TB-UNDERTAKER-SPY: an executed Spy may show as a good character (the Butler, say). **sim**
- TB-UNDERTAKER-NONE: no execution death today: the Undertaker does not wake. **sim**
- TB-MONK-NOT-SELF: the Monk may not choose themself. **sim**
- TB-MONK-NO-RETARGET: the Demon attacking a protected player gets no second choice; no one dies. **sim**
- TB-MONK-MAYOR: a protected Mayor attacked: the bounce does not happen; no one dies. **engine**
- TB-MONK-IMP: the Monk protects the Imp, who chooses themself: nothing happens, no new Imp. **tested** (fixed 2026-10-11: the Imp used to die and pass the Demon on)
- TB-SOLDIER-POISONED: a poisoned Soldier (or a Drunk who thinks they are the Soldier) dies to the Imp. **sim**
- TB-SOLDIER-EXECUTE: the Soldier is safe only from the Demon's ability, not execution. **engine**
- TB-RAVENKEEPER-ANY-NIGHT-DEATH: the Ravenkeeper wakes on any night death (even a Mayor bounce) and may choose a dead player. **sim**
- TB-RAVENKEEPER-RECLUSE: a dead Recluse may show as a Minion to the Ravenkeeper. **sim**
- TB-MAYOR-BOUNCE: the Storyteller may make another player die instead of the Mayor; onto a dead, protected or Soldier player, no one dies. **sim**
- TB-MAYOR-WIN: three alive at dusk and no execution today (a tie counts as none): good wins. **sim**
- TB-VIRGIN-TOWNSFOLK: only a Townsfolk nominator is executed; the Drunk is an Outsider so is safe. **tested** (day.test)
- TB-VIRGIN-SPENT: the first nomination spends the Virgin's ability, even if she is poisoned or the nominator is not a Townsfolk. **tested** (day.test)
- TB-VIRGIN-DEAD-NOMINATOR: a dead player cannot nominate, so the Virgin keeps her ability. **sim**
- TB-VIRGIN-ENDS-DAY: a Virgin execution is the day's execution; no more nominations. **tested** (day.test)
- TB-VIRGIN-SPY: the Spy may register as a Townsfolk to the Virgin, and be executed. **engine** (asks the Storyteller)
- TB-SLAYER-DEAD-IMP: shooting a dead Imp does nothing. **sim**
- TB-SLAYER-RECLUSE: the Recluse may register as the Demon and die to the Slayer; the game goes on. **sim**
- TB-SLAYER-SPENT: the shot is spent even if the Slayer is drunk or poisoned; a bluffing "Slayer" shoots harmlessly. **sim**
- TB-BUTLER-SLIP: a Butler who votes without their master is counted anyway (to keep them hidden), with a note for a word later. **tested** (fixed 2026-10-11: we used to refuse the vote)
- TB-BUTLER-DEAD: a dead Butler votes freely with their vote token. **sim**
- TB-BUTLER-DEAD-MASTER: a dead master can still vote (with a token); the Butler follows that. **engine**
- TB-DRUNK-WAKES: the Drunk wakes and acts as the Townsfolk they think they are; any information may be false. **sim**
- TB-RECLUSE-ANY-PART: the Recluse may register differently for each ability, even within one night. **sim**
- TB-SAINT-OTHER-DEATH: the Saint dying any other way than execution does not end the game. **sim**
- TB-SAINT-POISONED: a poisoned Saint executed: the game goes on. **sim**
- TB-POISONER-DIES: the Poisoner's poison ends when the Poisoner dies or becomes the Imp. **sim**
- TB-POISONER-DUSK: poison lasts the night and the next day, ending at dusk. **sim**
- TB-SW-FIVE: the Scarlet Woman takes over only if five or more were alive just before the Demon died (Travellers not counted). **sim**
- TB-SW-STARPASS: with five or more alive, an Imp who kills themself must pass to the Scarlet Woman. **tested** (night.test)
- TB-IMP-NEW-NO-KILL: a new Imp (starpass) does not kill that night. **sim**
- TB-IMP-ATTACK-DEAD: the Imp may attack a dead player; no one dies. **sim**
- TB-BARON-SETUP: +2 Outsiders at setup, replacing Townsfolk; it does not change back. **engine**
- TB-SPY-GRIMOIRE: the Spy sees the whole Grimoire each night. **engine**

## Bad Moon Rising

Status: every entry below is **tested** (tests/bmr.test.ts, one test per id) and checked
independently in random games by the simulator (tests/sim), except BMR-TRAVELLERS (**todo**,
see D3). Entries marked *(sim)* were found by the simulator.

- BMR-GRANDMOTHER-DEMON-ONLY: the Grandmother dies with her grandchild only if the Demon kills them (not execution, Gambler, Godfather...); a drunk or poisoned Grandmother survives.
- BMR-GRANDMOTHER-CHILD: the grandchild is a good Townsfolk or Outsider, chosen by the Storyteller; the grandchild is not told.
- BMR-SAILOR-DRUNK-CHOICE: the Sailor chooses an alive player; the Storyteller decides whether the Sailor or that player is drunk until dusk.
- BMR-SAILOR-CANT-DIE: a sober Sailor cannot die (night or execution: "executed but remains alive"), even before waking that night; a drunk Sailor can.
- BMR-CHAMBERMAID-ABILITY-WAKES: counts only wakes to use one's own ability tonight (not Minion/Demon info, not woken by another's ability, not the Exorcist-woken Demon); drunk or poisoned wakers still count; a Gossip's kill is not a wake.
- BMR-CHAMBERMAID-ALIVE: chooses two alive players, not themself; not woken if fewer than two can be chosen.
- BMR-INNKEEPER-SAFE: the two chosen cannot die tonight from anything (Demon, Minion, Townsfolk, Outsider, Traveller), except the Assassin; one of the two (Storyteller's choice) is drunk until dusk. A drunk Innkeeper protects no one, even after sobering.
- BMR-INNKEEPER-SELF: if the Innkeeper picks themself and is the drunk one, neither is protected.
- BMR-GAMBLER: guess a player's character; wrong means the Gambler dies (not told why); may choose anyone, even themself.
- BMR-EXORCIST: a chosen Demon learns who the Exorcist is and does not wake to use their ability tonight; their other abilities still work (Zombuul survives, Pukka's previous victim dies, Shabaloth may regurgitate); not the same player two nights running.
- BMR-GOSSIP: a definite, true, public statement means the Storyteller kills a player that night; what counts is the Gossip's state at night (drunk by day, sober at night: still kills); a Gossip who dies first kills no one.
- BMR-COURTIER: once per game, choose a character: if in play, that player is drunk for 3 nights and 3 days from now; only while the Courtier stays sober and healthy (suspended, then resumes); a drunk Courtier wastes it; one copy only if duplicated.
- BMR-PROFESSOR: once per game, a dead Townsfolk is resurrected (regains abilities, even once-per-game; first-night ones act at once); a non-Townsfolk choice wastes it; must choose a dead player.
- BMR-MINSTREL: a Minion dying by execution makes every other player (not Travellers) drunk until dusk tomorrow; not if the Minion was already dead or survived, nor if the Minstrel is drunk or poisoned.
- BMR-TEA-LADY: if both alive neighbours are good, they cannot die (any cause, execution included) except the Assassin; updated continuously (an alignment change or a death changes who is protected).
- BMR-FOOL: the first time the Fool would die, they don't (not told); protection from something else does not use it up; a drunk or poisoned Fool dies.
- BMR-PACIFIST: an executed good player might survive (Storyteller's choice); still counts as the day's execution; does not apply to exile.
- BMR-GOON: the first player each night to choose the Goon with their ability is drunk until dusk (ability fails tonight and tomorrow), and the Goon takes their alignment, even if the chooser was already drunk or poisoned; the Storyteller choosing the Goon does not count; Assassin choosing the Goon: the Goon still dies, and turns evil.
- BMR-LUNATIC: thinks they are the Demon; wakes as that Demon (any number of "Minions" and three bluffs, possibly wrong); their choices do nothing; the real Demon learns who the Lunatic is and whom they chose.
- BMR-TINKER: the Storyteller may kill the Tinker at any time, unless they are protected from death.
- BMR-MOONCHILD: when they learn they died (execution or at dawn) they publicly choose an alive player: if good, that player dies tonight; their state at night decides; a Goon counts by the alignment it had when chosen; surviving an execution is not dying.
- BMR-GODFATHER-SETUP: one more or one fewer Outsider (Storyteller's choice); starts knowing which Outsiders are in play.
- BMR-GODFATHER-KILL: if an Outsider died today (execution or otherwise by day, not at night), choose a player tonight: they die; only one kill even if two Outsiders died.
- BMR-DEVILS-ADVOCATE: choose a living player (not last night's): if executed tomorrow, they survive; cannot choose a Zombuul who registers as dead.
- BMR-ASSASSIN: once per game, at night (not the first), kills anyone regardless of any protection; wasted if drunk or poisoned; the Goon still turns evil.
- BMR-MASTERMIND: if the Demon dies by execution, the game goes on one more day (not announced); then if a good player is executed, evil wins; an evil player or no one executed, good wins; it overrides "two left" for that day.
- BMR-ZOMBUUL: the first death registers as dead but is not real (the game goes on, it still attacks); it wakes only if no one died today (a dead player executed again does not count as dying); a drunk or poisoned Zombuul dies for real.
- BMR-PUKKA: wakes every night, the first included; poisons the chosen player; the previous victim dies after the next choice and is then healthy; a drunk Pukka's choice poisons no one; poison resumes if the Pukka sobers.
- BMR-SHABALOTH: kills two a night; the next night the Storyteller may regurgitate one of last night's choices (dead), restoring abilities.
- BMR-PO: may choose no one; if their last choice was no one, they choose three tonight (and must); the first night and an Exorcist night do not count as "chose no one".
- BMR-PROFESSOR-NONE *(sim)*: a Professor who chooses no one keeps the once-per-game ability for another night (the engine used to crash here).
- BMR-SHABALOTH-SELF *(sim)*: a Shabaloth that chooses itself first dies and the game ends at once; its second choice does not die. Same for a Po choosing itself among three.
- BMR-REVIVED-WAKES *(sim)*: a player brought back tonight whose place in the night order has passed (the Courtier, the Exorcist, a Lunatic) wakes just after the Professor; the Demon the revived Exorcist chose is told just after the Exorcist.
- BMR-MOONCHILD-ONCE: the Moonchild chooses once for each death; after the curse plays out they cannot choose again (unless revived and killed again).
- BMR-LUNATIC-PO: a Lunatic who thinks they are the Po and chooses no one is asked for three players next time, to keep up the pretence.
- BMR-TRAVELLERS: Matron (seat swaps), Judge (force an execution to pass or fail), Apprentice (gains a Townsfolk or Minion ability), Bishop (Storyteller nominates), Voudon (only the dead vote).

## Sects & Violets

Status: **tested** in tests/snv.test.ts (one test per id below) unless marked otherwise.
Where the engine models a ruling more simply than the full rule, it says **approx.** and how.

- SNV-CLOCKMAKER: steps from the Demon to its nearest Minion, either way round.
- SNV-DREAMER: one true character and one of the other side (good if the player is evil, evil if good); not themself or a Traveller.
- SNV-SNAKE-CHARMER: choosing the Demon swaps characters and alignments with them; the old Demon becomes a poisoned good Snake Charmer (for the rest of the game).
- SNV-MATHEMATICIAN: counts abilities that worked abnormally since dawn because of another character's ability (not their own failures).
- SNV-FLOWERGIRL: whether any Demon (even dead ones) voted today; exiles do not count.
- SNV-TOWN-CRIER: whether any Minion nominated today.
- SNV-ORACLE: how many dead players are evil (alignment, not type).
- SNV-SAVANT / SNV-ARTIST: Storyteller statements by day (outside the engine; logged as notes).
- SNV-SEAMSTRESS: once per game, two players (not themself): same alignment?
- SNV-PHILOSOPHER: once per game, gain a good character's ability; if that character is in play, its player is drunk while the Philosopher keeps the ability.
- SNV-JUGGLER: first day, up to five public guesses; that night, how many were right (their state at night decides).
- SNV-SAGE: killed by the Demon: learns two players, one the Demon that killed them.
- SNV-SWEETHEART: when they die, one player is drunk for the rest of the game (works while dead).
- SNV-KLUTZ: on learning they died, publicly chooses an alive player: if evil, their team loses.
- SNV-BARBER: if they died today or tonight, the Demon may swap two players' characters (not another Demon); alignments stay.
- SNV-MUTANT / SNV-CERENOVUS: madness: the Storyteller may execute them (even at night; counts as the day's execution).
- SNV-WITCH: the cursed player dies if they nominate tomorrow (the nomination still stands); with three alive the Witch loses the ability.
- SNV-PIT-HAG: change a player to a character not in play; making a Demon makes tonight's deaths arbitrary.
- SNV-EVIL-TWIN: twins know each other; the good twin executed: evil wins; good cannot win while both live.
- SNV-NO-DASHII: its nearest Townsfolk each way are poisoned (dead or alive), recomputed when things change.
- SNV-VIGORMORTIS: Minions it kills keep their ability and poison a neighbouring Townsfolk; [-1 Outsider].
- SNV-VORTOX: Townsfolk information must be false (drunk or poisoned too); a day with no execution: evil wins.
- SNV-FANG-GU: the first Outsider it kills becomes an evil Fang Gu and the old one dies instead; [+1 Outsider].
- SNV-MODEL-PHILOSOPHER **approx.**: the Philosopher is modelled as becoming the chosen character (they act as it from now on, waking tonight if its place is still to come); the real holder is drunk while the Philosopher keeps it.
- SNV-MODEL-BARBER **approx.**: the swap may not include any Demon (the card allows the Demon itself; not modelled yet); alignments stay.
- SNV-MODEL-PIT-HAG **approx.**: a player turned into a Demon becomes evil and is told; the old Demon stays (two Demons until one dies); "arbitrary deaths" is the Storyteller's kill button that night. A changed player acts as the new character tonight only if its place is still to come.
- SNV-MODEL-FANG-GU **approx.**: the jump happens once per game, whatever protects the Outsider (they do not die, so protection does not apply).
- SNV-MODEL-MATHEMATICIAN **approx.**: the number is the Storyteller's judgment; the engine accepts any count (also with the Vortox).
- SNV-MODEL-SAVANT-ARTIST: by day, outside the engine (notes in the log).
- SNV-MODEL-SWEETHEART **approx.**: the drunk player is chosen at the Sweetheart's place in the next night (or tonight), not at the moment of death.
- SNV-TRAVELLERS: Barista (sober and healthy, or acts twice), Harlot, Butcher (a second execution), Bone Collector, Deviant.

## Jinxes

The official list (docs/rules/jinx-pairs.json) has 131 jinxed pairs. None has both characters
on the same base script, so none applies to Trouble Brewing, Bad Moon Rising or Sects & Violets
as the engine plays them. Seven pair characters from two different base scripts and would
matter only on a custom script mixing them: Mastermind + Vigormortis, Mathematician + Chambermaid,
Mathematician + Drunk, Mathematician + Lunatic, Pit-Hag + Goon, Recluse + Sage,
Scarlet Woman + Fang Gu. Status: **not modelled** until custom scripts are supported (D3).

## Travellers

Status: **tested** (tests/travellers.test.ts, and in random games by the simulator) for joining, the evil Traveller learning the Demon, exile, the count for the evil win, the Bureaucrat, Thief, Gunslinger, Judge, Voudon, Barista (sober), Apprentice, Harlot, Bone Collector and Deviant. **Storyteller by hand** (the engine records notes and seat swaps): the Butcher's second nomination, the Scapegoat, the Bishop, the Matron, the Beggar's tokens, the Barista's "twice". **approx.**: the Apprentice is modelled as becoming the character (still a Traveller); a dead Demon given its ability back by the Bone Collector does not wake to kill; a pardon sets the day's highest vote to the best of the other nominations.

- TRAV-JOIN: a Traveller may join (or leave) at any time; the player picks the character, the Storyteller the alignment; everyone knows which Traveller they are. An evil Traveller learns who the Demon is (no Minions, no bluffs).
- TRAV-EXILE: Travellers are exiled, never executed. An exile is a group decision, any number per day, that anyone may support, the dead included (no vote token used); no ability affects it (the Gunslinger, Bureaucrat, Thief, Beggar do not apply); it is not an execution (the Butcher gets nothing).
- TRAV-COUNT: Travellers do not count for the evil win: a Traveller and two other players alive, and evil has won. The Apprentice is still a Traveller after gaining an ability.
- TRAV-GUNSLINGER: after the first vote of the day is tallied, may choose a player who voted in it; they die at once. Not for exiles.
- TRAV-BUTCHER: after the day's first execution (even if the player survives), may nominate once more for a second execution; nothing if no one was executed.
- TRAV-BUREAUCRAT / TRAV-THIEF: the chosen player's votes count three times / count minus one tomorrow, every vote; ends at once if the Traveller dies or is exiled; never for exiles.
- TRAV-SCAPEGOAT: when a player of the Scapegoat's alignment is executed, the Storyteller may execute the Scapegoat instead (still the day's execution).
- TRAV-JUDGE: once per game, on another player's nomination: pardon (not executed, votes do not count) or condemn (executed at once, whatever the votes).
- TRAV-BISHOP: only the Storyteller nominates, at least one player of the opposite alignment to the Bishop each day.
- TRAV-VOUDON: only the dead and the Voudon vote, as often as they like, without spending vote tokens; the most votes is executed (no majority needed).
- TRAV-MATRON: up to three seat swaps a day; no private talk away from one's seat.
- TRAV-BEGGAR: votes only with tokens given by dead players (who then cannot vote); the giver's alignment is learned.
- TRAV-APPRENTICE: on their first night gains a Townsfolk (good) or Minion (evil) ability from the script; acts with it that night if it would; first-night-only abilities work on the Apprentice's first night.
- TRAV-BARISTA: each night the Storyteller picks a player and either makes them sober and healthy with true information until dusk (even under the Vortox) or makes their ability act twice.
- TRAV-HARLOT: chooses a living player each night; if they agree to show their character, both might die.
- TRAV-BONE-COLLECTOR: once per game, a dead player regains their ability until dusk (used once-per-game abilities included); ends if the Bone Collector dies.
- TRAV-DEVIANT: if they were funny today (the Storyteller judges), they cannot die by exile.

## Fabled

Status: **tested** in tests/fabled.test.ts and in random games for the five that change the rules; the rest are announced and run by the Storyteller (src/core/scripts/fabled.ts lists them with our own wording).

- FAB-SENTINEL: one more or one fewer Outsider is a legal setup.
- FAB-TOYMAKER: the Demon may attack no one (and must, once a game: the Storyteller's to enforce); the evil team learns each other and the Demon gets bluffs, whatever the player count.
- FAB-DOOMSAYER: with four or more alive, each living player may once call it; the Storyteller kills a living player of the caller's team (protections apply: they pick someone who can die).
- FAB-FERRYMAN: on the final day (the Storyteller's call), every dead player gets their vote back.
- FAB-STORM-CATCHER: names a good character; if in play (and good) it dies only by execution. Evil learning who it is: the Storyteller's.
- FAB-NOTES: Angel, Buddhist, Hell's Librarian, Revolutionary, Fibbin, Duchess, Fiddler, Spirit of Ivory, Djinn, Deus ex Fiasco: **Storyteller by hand**.

## Experimental characters (all **todo**: not on a script the engine plays; wording in src/core/scripts/experimental.ts)

- EXP-STEWARD / EXP-KNIGHT / EXP-NOBLE / EXP-SHUGENJA: learn once; if made mid-game, they learn that night. The Knight's two may be any type (even Minions). The Noble's three are always two good and one evil. The Shugenja learns only a direction, never the distance; a tie is answered either way, and they are not told it was a tie.
- EXP-PIXIE: learns an in-play Townsfolk (not who); gains it on that player's death only if they pretended to be it; not told when it happens; if that player changed character first, the Pixie still gains the Townsfolk they learned.
- EXP-BOUNTY-HUNTER: learns players, never characters; a new evil player each time the last one dies; never the same one twice; when drunk may be shown a good player; with it in play at setup, one Townsfolk is evil (and may be the one shown).
- EXP-HIGH-PRIESTESS / EXP-GENERAL: the Storyteller's judgment, made when they wake (alive or dead, good or evil; good, evil or neither).
- EXP-BALLOONIST: each night a player of a different type from the last (not told the type; alive or dead); drunk, the type may repeat; may add an Outsider at setup.
- EXP-PREACHER: a chosen non-Minion is unaffected; may choose the dead; a preached Minion has no ability while the Preacher is sober and healthy (it comes back while they are drunk or poisoned).
- EXP-VILLAGE-IDIOT: one to three in play whatever the player count, replacing Townsfolk; with more than one, exactly one is drunk (and may still be told the truth); made mid-game, only one.
- EXP-KING: the Demon learns the King (made mid-game: that night); once the dead equal or outnumber the living, the King learns one living character a night (either team, repeats allowed).
- EXP-CULT-LEADER: takes a living neighbour's alignment each night; once a day may publicly form a cult; if every good player joins (no vote token used), the game ends and the Cult Leader's team wins.
- EXP-ACROBAT: may choose anyone, dead or alive, themself too; dies if the chosen player is drunk or poisoned at any point that night (the Drunk counts); a drunk Acrobat cannot die this way; not told why.
- EXP-LYCANTHROPE: must choose a living player; a good one dies and the Demon kills no one tonight; an evil one, or a good one who survives, and the Demon still kills; one good player registers as evil while the Lycanthrope lives (cannot be the one killed; still wins with good).
- EXP-ALSAAHIR: must name every Minion and every Demon (dead Demons too) by type, not character; a Legion-like Minion-and-Demon counts as a Demon; bluffers' guesses are played along with.
- EXP-ENGINEER: changes which characters the evil players have, not who is evil; choosing an in-play character changes nothing (and the ability is still spent); only characters on the script; the right number of Minions.
- EXP-NIGHTWATCHMAN: chooses the night; the chosen player wakes separately and learns who the Nightwatchman is.
- EXP-HUNTSMAN / EXP-DAMSEL: one night guess; a right guess turns the Damsel (even drunk) into a Townsfolk not in play (the Storyteller's choice, and the Damsel learns it). The Minions together get one public guess by day; right, and evil wins; wrong, and it is spent.
- EXP-FISHERMAN: advice, not facts; a drunk Fisherman may get bad advice.
- EXP-PRINCESS: their first day only, their own nominee executed (dying not needed; exiles do not count); their state at night decides; the Demon still chooses and the rest of its ability works, but no one dies to it.
- EXP-ALCHEMIST: still a good Townsfolk (registers as such); learns the Minion ability on the first night; does not learn the evil team; setup changes of that Minion still happen; may be told to choose again.
- EXP-CANNIBAL: gains the ability of the last player executed who died (not told which); loses it at the next such death; an evil one leaves the Cannibal poisoned (thinking they have it) until a good one dies by execution; "even if dead" abilities stay after the Cannibal dies.
- EXP-AMNESIAC: the ability is the Storyteller's invention; may wake or be passive; daily private guesses answered cold, warm or hot.
- EXP-FARMER: dying at night (not by day) makes a living good player a Farmer, chain included; the new Farmer is told; a Farmer turned evil still passes it on; Townsfolk turned evil cannot receive it.
- EXP-CHOIRBOY / EXP-KING: only the Demon's own kill of the King counts (not an execution, not a Minion); a failed attack does not; learns the player, not the character.
- EXP-BANSHEE: killed by the Demon (only), everyone learns it; dead, may nominate twice a day and vote twice on any nomination without a vote token.
- EXP-MAGICIAN: the Demon is shown the Magician as one of its Minions, the Minions see two Demons, in any order; the Magician does not wake; also applies when the Poppy Grower's death reveals the team later.
- EXP-POPPY-GROWER: the evil team does not learn each other until the Poppy Grower dies (sober and healthy at that moment), then as on a first night; an evil Traveller still learns the Demon on joining.
- EXP-ATHEIST: no evil characters; the Storyteller may break any rule; any living player may nominate the Storyteller, executed with half the living voting: with the Atheist in play good wins, otherwise evil does; two left alive and good loses.
- EXP-HERMIT: has every Outsider ability on the script; an "even if dead" one stays after death, the rest go; with the Drunk's ability they do not know they are the Hermit; Outsider jinxes apply to them; may remove itself at setup (one fewer Outsider) and still be a bluff.
- EXP-OGRE: takes the alignment of their first-night choice at once, even drunk or poisoned, and is not told it; told of later changes as usual; made mid-game, chooses that night.
- EXP-GOLEM: nominates once a game; a non-Demon nominee dies at once (the Demon: "nothing happens", the vote goes on); keeping to one nomination is the player's job.
- EXP-PLAGUE-DOCTOR: on dying sober and healthy, the Storyteller gains a Minion ability for the rest of the game (without becoming a player or evil).
- EXP-HATTER: dying today or tonight lets each Minion and the Demon pick a new character of their type (or keep theirs; no duplicates); new abilities work at once, used ones included; old ones end.
- EXP-POLITICIAN: switches team and wins only if most responsible for their team's loss, and only if sober and healthy; otherwise wins with good as usual.
- EXP-ZEALOT: with five or more alive (Travellers count) must vote on every nomination (not exiles), even if possibly drunk; dead, votes normally; their own responsibility.
- EXP-DAMSEL: one Minion guess in total (a wrong one spends it for all; the Demon bluffing a guess does not count); a dead Damsel can no longer be guessed.
- EXP-SNITCH: each Minion gets three bluffs (the Demon's or others; each Minion may differ).
- EXP-HERETIC: reverses every win, whatever ended the game, even while dead, but not while drunk or poisoned.
- EXP-PUZZLEMASTER: one player is drunk for good (even after the Puzzlemaster dies); one guess (public or private): right, told the Demon player; wrong, told a false one; not told which; a dead Puzzlemaster cannot guess.
- EXP-MEZEPHELES: the first good player heard saying the word turns evil that night (told then; the Mezepheles is not); it depends on the Mezepheles being sober and healthy at night.
- EXP-HARPY: the effect lasts until the next choice; the Storyteller may kill one, both or neither; a dead choice means only the living one can die.
- EXP-FEARMONGER: everyone learns when a new player is chosen (not who); executing the current choice on the Fearmonger's own nomination ends the game, that player's team losing, even if they survive the execution.
- EXP-PSYCHOPATH: may kill once a day before nominations (optional); executed, they play rock-paper-scissors with the nominator and die only if they lose; still the day's execution; other deaths are ordinary.
- EXP-WIZARD: the wish may be announced later; any price and any public clue are the Storyteller's; whether it outlives the Wizard depends on the wish.
- EXP-WIDOW: the poison lasts until the Widow dies; one good player learns a Widow is in play (not who, nor who is poisoned).
- EXP-XAAN: the poison night is the Outsider count at setup (usually 1 to 4, overriding other setup changes), even if the count changes; the Xaan must be alive.
- EXP-MARIONETTE: sits next to the Demon, who knows them; does not wake with the evil team and the Minions do not learn them; their pretend good ability works as the Drunk's does (not at all).
- EXP-WRAITH: may peek or open their eyes; woken whenever other evil players are (the Demon's kill, an evil Traveller, ...); open-eyed evil players may signal; being seen has no effect.
- EXP-SUMMONER: no Demon until night 3, when the chosen player becomes a Demon and acts that night (the team does not learn each other); if the Summoner cannot make one (dead, drunk on night 3), good wins.
- EXP-GOBLIN: must claim it publicly when nominated that same day, before the vote; any player may claim it.
- EXP-BOOMDANDY: executed, all but three die (the Demon among them); no more nominations; after a countdown the most-pointed-at dies (the dead point too).
- EXP-VIZIER: cannot die by day; after a tally may execute that nominee at once if any good player voted, whatever the count; the day's execution.
- EXP-ORGAN-GRINDER: votes with eyes closed; the count and the block are secret until the execution; dead votes are spent at the end of the day.
- EXP-BOFFIN: the Demon keeps the good ability while drunk; it pauses while the Boffin is drunk; a new Demon gets one too (maybe different); only one living Demon has it.
- EXP-YAGGABABBLE: each saying of the phrase lets the Storyteller kill one player, any time until dawn; the Storyteller chooses who.
- EXP-LIL-MONSTA: the babysitter "is the Demon" (registers as one; good if a good player holds it); the babysitter dying, or a dead babysitter, ends it as the Demon's death; Minions babysitting keep their ability.
- EXP-OJO: may name evil characters; with duplicates, one dies; a character not in play: the Storyteller picks (almost always a living good player).
- EXP-KAZALI: picks the Minions' characters during the first night's setup (from the script, no duplicates); their old good characters may be bluffs.
- EXP-LEGION: the rest are Townsfolk or Outsiders; a nomination only evil voted for counts as no votes; each Legion registers as Minion and Demon; night deaths are the Storyteller's.
- EXP-LORD-OF-TYPHON: every evil character sits in a line at setup with the Lord of Typhon flanked by evil on both sides (evil Travellers and Townsfolk may join the line); one more Minion.
- EXP-LLEECH: the host is poisoned; while the host lives the Lleech cannot die (executed, the group hears only that they live); the host dying kills the Lleech (good wins even with two left); made mid-game, picks a living host that night.
- EXP-AL-HADIKHIA: chosen players (announced, silence kept) each nod to live or shake to die, the dead may live again; if every chosen player lives, all die; choosing no one, nothing happens.
- EXP-RIOT: on day 3 the Minions become Riot; each nominee dies and must nominate at once (counted down); the Storyteller nominates first if no one does; good wins when every Riot is dead, even with two left.
- EXP-LEVIATHAN: everyone knows it is in play; a second good player executed (alignment at the time; any execution, even survived or the Virgin's) and evil wins; if the Leviathan lives into night 6, evil wins.
- EXP-CACKLEJACK: each day names an immune player; the Storyteller changes another player's character that night (in play or not), as a fresh instance of the new ability.
- EXP-GANGSTER: once a day, with one living neighbour's spoken agreement, the other dies; if both want the other dead, the Gangster picks.
- EXP-GNOME: everyone learns one player of the Gnome's alignment (the amigo); the Gnome may kill whoever nominates them (must speak up; any number of times); the vote still happens; the amigo turning does not turn the Gnome.

## Loric (**todo**, wording in experimental.ts)

Rule changes announced for a script, like the Fabled: Big Wig, Bootlegger, Gardener, God of Ug, Hindu, Knaves, Pope, Storm Catcher (modelled, see Fabled), Tor, Ventriloquist, Zenomancer. Their rulings are table rules for the Storyteller.
