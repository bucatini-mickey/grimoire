# Overnight rules work: plan and log

Asked 2026-10-11 (evening): review the game against the official rules, longer write-ups and
tactics discussions online; learn the obscure interactions of every character on every
script; implement each character; list the interesting interactions; keep testing them
and other rule checks.

Resume rule: if picking this up after a break, read this file, take the first unchecked
item, and log what you did at the bottom. Keep `npm test` green and the app building at
every step. Nothing is committed or pushed; that is for Mickey to decide.

## Phases

### A. Research (sources in docs/rules/SOURCES.md)
- [x] A1. Character data for every official character: script, team, night order (first /
      other), setup changes, reminder tokens. Source: bra1n/townsquare roles.json + wiki.
- [x] A2. Our own paraphrased ability text for every character (never the card text).
- [x] A3. Per character: rulings and obscure interactions from the wiki pages ("How to
      run", "Rules", examples) and longer community write-ups. Into INTERACTIONS.md, each
      with an id, a source and a status (untested / tested / not modelled).
- [x] A4. Jinxes (official list).

### B. Trouble Brewing audit
- [x] B1. Check every TB character in the engine against A3; fix differences.
- [x] B2. Scenario tests from the official examples for each TB character.

### C. Engine for the other scripts
- [x] C1. Design: character modules (hooks), status effects with durations (drunk/poisoned
      by whom and until when, protected, mad), several deaths a night, resurrection,
      character and alignment changes, extra win conditions. DESIGN note first.
- [x] C2. Refactor TB onto it with every test and the simulator still passing.

### D. The other scripts, one character at a time (rules + tests + simulator + oracle)
- [x] D1. Bad Moon Rising.
- [x] D2. Sects & Violets.
- [x] D3. Experimental characters, Travellers, Fabled (as far as is sensible).

### E. Keep testing
- [x] E1. Simulator plays every script; checker gains the new rules independently.
- [x] E2. Mutants for the new rules.
- [x] E3. Long runs; every failure shrunk and kept as a test.

## Log
- 2026-10-11 23:00 A1: official character facts for all 181 characters, the night sheet and jinx pairs saved to docs/rules/characters.json (facts only, no card text). Official TB night order matches ours.
- 23:20 Read every character page on the official wiki (181) and the rules pages; condensed extracts kept outside the repo.
- 23:40 B1: TB audit found 3 differences, fixed with tests: Monk-protected Imp choosing themself (nothing happens, no new Imp); Chef with a Recluse or Spy (each pair counts on its own: 0, 1 or 2); a Butler voting without their master is counted with a note, not refused.
- 23:55 Simulator: now checks that true information is never refused (found the Chef case would have slipped by); 26/26 planted bugs caught once the robot tries every number.
- 00:10 B2: 19 rulings tests from the official TB examples (tests/rulings.test.ts); 100 tests pass. INTERACTIONS.md started (general + TB). C1: ENGINE-DESIGN.md written.
- 00:40 A3 (BMR, S&V): every Bad Moon Rising and Sects & Violets ruling written up in INTERACTIONS.md (121 entries so far).
- 01:30 C2 step 1: lasting effects are now events and data (poison, the Monk, the Butler); old saved games upgrade on load; UI reads reminders(). 100 tests, 2,000-game runs clean, 26/26 planted bugs caught (mutants now play 1,000 games each; the robot aims at tricky characters more often).
- 02:30 C2: night order now from the official night sheet for every script (src/core/scripts/night-order.ts, generated). New engine: one door for every death (protections, Mayor, Fool, Zombuul, Grandmother, Minstrel, Scarlet Woman) and one for executions (Devil's Advocate, Tea Lady, Sailor, Fool, Pacifist, Zombuul, Saint, Mastermind); TB unchanged (all tests, 3,000 games).
- 03:30 D1 (engine): all 25 Bad Moon Rising characters (script file with our own wording, wake rules, abilities, Gossip/Moonchild/Tinker day commands, Godfather setup options). tests/bmr.test.ts: 30 rulings tests from the official examples, all passing; 130 tests in all.
- 05:00 E1: the simulator plays both scripts (every other seed is Bad Moon Rising) with the checker extended independently: the official night sheet, revivals, Goon alignment changes, the Lunatic, the Zombuul's seeming death, every protection (Innkeeper, Tea Lady, Sailor, Fool) except the Assassin, the Mayor's bounce for any night kill, the Gambler, Godfather, Grandmother, Gossip, Moonchild and Assassin deaths, the Minstrel, the Mastermind's extra day, the Po's and Shabaloth's counts, the Exorcist. It found real engine bugs, each fixed with a test in tests/bmr.test.ts: the Professor choosing no one crashed; a Shabaloth or Po killing itself kept killing after the game ended; a player revived after their place in the night (Courtier, Exorcist, Lunatic) woke out of order; a Moonchild could choose again after the curse; random Bad Moon Rising deals could pick "one fewer Outsider" for the Godfather when there were none. 20,000 games across both scripts: no rules broken. `npm test` now plays 400 games of both and checks that 30+ interactions actually happen.
- 05:30 D1 (UI): the Storyteller screens play Bad Moon Rising: script choice, the Godfather's setup counts, the Lunatic's believed Demon, choosing 0-3 players, a character (Gambler's guess, Courtier) or no one, the rulings (who is drunk for the Sailor/Innkeeper, the Shabaloth's regurgitation, the Pacifist), the Gossip's statement, the Moonchild's choice, the Tinker's death, composing Chambermaid and Godfather answers. Tried by hand in the browser through two nights and a day.
- 07:00 E2: planted bugs updated for the rewritten engine and extended to Bad Moon Rising (Tea Lady, Sailor, Innkeeper, Fool, Zombuul, Goon, Minstrel, Mastermind, Assassin, Grandmother, Po, Exorcist, Gambler, Godfather, Professor) and to every bug the simulator found tonight; order bugs now planted in the official night sheet. The misses showed checker gaps (the Fool saved twice, the Mastermind's day, the Assassin's kill, the Grandmother, the Zombuul after a day death, a Moonchild choosing twice), all now checked. `node tests/sim/mutants.ts 1000 "<name filter>"` reruns a subset.
- 08:30 D2 (engine): Sects & Violets, all 25 characters: our own wording (src/core/scripts/sects-and-violets.ts); info roles judged true or false (Clockmaker, Dreamer, Flowergirl, Town Crier, Oracle, Seamstress, Juggler, Sage; the Mathematician is the Storyteller's judgment); character and alignment changes (Snake Charmer, Pit-Hag, Barber, Philosopher, Fang Gu); the No Dashii's poison worked out live; the Vigormortis's dead Minions; the Witch's curse; madness executions; the Vortox (Townsfolk told false things, a day without an execution loses); the Evil Twin; the Klutz; the Sweetheart. 20 rulings tests in tests/snv.test.ts. Approximations are marked **approx.** in INTERACTIONS.md. Also fixed: a Lunatic who thinks they are the Po is asked for three after choosing no one; the grimoire's "drunk" tag only while it is in force.
- 09:30 E1 (Sects & Violets): the simulator plays all three scripts with independent checks for the new rules. It found real engine bugs, all fixed: a Philosopher woken twice on night 1; the Pit-Hag turning the only Demon into something else did not end the game; a Snake Charmer swap on night 1 sent "Demon info" late; a Witch's curse outlived the Witch; two Demons made in one night (Snake Charmer + Pit-Hag) overwrote each other, so one was never told and still acted; a new Demon was told before the next step, not after the one that made them; a Barber or Sage killed late in the night woke out of order; the Vigormortis "killing" an already-dead Minion gave them their ability back, which they kept after the Pit-Hag changed them; with the Demon dead and the twins holding, the Evil Twin made drunk did not let good win, and two left did not end it. 10,000 S&V games and 6,000 mixed games: no rules broken. `npm test` plays 600 games over the three scripts. UI: Evil Twin at setup, the Vigormortis's poison ruling, Juggler, Klutz, madness and the Pit-Hag's "deaths are yours" tools, and answers for the new information.
- 09:45 A4: jinxes checked against the three scripts the engine plays: none of the 131 official jinxes has both characters on one base script, so none applies; the seven cross-script pairs are listed in INTERACTIONS.md ("Jinxes") for when custom scripts arrive.
- 11:30 D2 done (engine, tests, simulator, UI). Planted bugs for Sects & Violets: the misses showed checker gaps (Witch, Vortox day, Evil Twin, Klutz, Fang Gu, Seamstress, Vigormortis Minions waking), all now checked; one was a real engine bug: the night order re-required "alive" for the Witch, Godfather, Assassin..., so a dead Minion kept by the Vigormortis never woke, and its curse never worked.
- 12:30 D3 (part): Travellers for all three scripts (src/core/scripts/travellers.ts, our own wording): joining at any time next to a chosen player, the evil Traveller learning the Demon, exile (anyone supports, the dead too; not an execution; never nominated), not counting for "two left", the Bureaucrat, Thief, Gunslinger, Judge, Voudon, Barista, Harlot, Bone Collector, Apprentice and Deviant; the Butcher, Scapegoat, Bishop, Matron and Beggar are the Storyteller's by hand. Fabled (src/core/scripts/fabled.ts): Sentinel, Toymaker, Doomsayer, Ferryman and Storm Catcher change the rules; the others are notes. tests/travellers.test.ts (12), tests/fabled.test.ts (5). The simulator joins Travellers, exiles them, announces Fabled; fixes it found: describing an evil Traveller's wake crashed; a Traveller joining mid-night woke out of order; a dead Fang Gu given back its ability by the Bone Collector died twice; the Doomsayer's kill skipped the Sailor, Fool and Zombuul; a dead Snake Charmer could swap into a dead Demon; how far the night had got was lost when a step's player changed character. 6,000 games over everything: no rules broken. 173 tests.
- 13:30 A2: our own wording for every official character: the three scripts, 15 Travellers (travellers.ts), 15 Fabled (fabled.ts), and the 70 experimental characters and 11 Loric (experimental.ts: reference text, not yet playable). UI: Fabled at setup and the Doomsayer/Ferryman by day, Travellers joining and exile, the Dreamer and Seamstress picking first with hand-made answers, duplicate reminder tags removed; checked in the browser through a Sects & Violets night and day with a Traveller. The long run found one more: the Bone Collector giving a dead player an ability whose place had passed tonight made them wake out of order (fixed, with a test).
- 14:00 A3: rulings for all 70 experimental characters, the Fabled and the Loric written up in our own words in INTERACTIONS.md (from the saved wiki pages), marked todo until custom scripts are playable.
- 14:45 D3: custom scripts: any mix of the 151 non-Fabled characters the app knows (a "custom:" script built on demand, night order from the official sheet). Characters from the three scripts and the Travellers keep their full rules; the 70 experimental characters are not modelled: they wake at their official place and the Storyteller resolves them by hand (their rulings are in INTERACTIONS.md). Setup screen: "Custom" with the catalogue (gold = rules built in). tests/custom.test.ts checks the catalogue covers every official character and that a mixed script plays by each character's rules. 176 tests.
- 16:00 E3: a 60,000-game run over everything found four failures (one real: the Bone Collector waking a player whose place had passed; three checker gaps around the Mastermind's day with the Judge), all fixed. Full planted-bug pass on the final code: 67 of 67 caught (the Snake Charmer's swap now has its own check). Every shrunk failure game (140, from real and planted bugs) is kept in tests/regressions/ and replayed by tests/regressions.test.ts against the real engine; doing so found one more (a Traveller joining at night woke for an ability whose place had passed), fixed. 177 tests.
- 16:30 E3 done: a final 40,000-game run on the finished code broke one rule, a checker gap (a Grandmother revived by the Professor acts at once), fixed and kept in tests/regressions/ (141 games). 177 tests, build fine.

## Summary

All items are done. Nothing is committed or pushed.

- **Scripts the engine plays in full:** Trouble Brewing, Bad Moon Rising and Sects & Violets, plus their 15 Travellers and the five Fabled that change rules (Sentinel, Toymaker, Doomsayer, Ferryman, Storm Catcher). Custom scripts can mix any official characters; the 70 experimental ones wake at their official place and the Storyteller resolves them by hand.
- **Rules written up:** docs/rules/INTERACTIONS.md, in our own words, covers every official character, the Travellers, Fabled, Loric and jinxes, each marked tested, approx. (with how), Storyteller by hand, or todo. Every character has our own ability text (src/core/scripts/).
- **Testing:** 177 tests, including rulings tests per character (tests/rulings, bmr, snv, travellers, fabled, custom). The simulator (tests/sim) plays random whole games of all three scripts with Travellers and Fabled and checks every event with rules written a second, independent way; tens of thousands of games, no rules broken. 67 planted bugs, all caught. 141 shrunk failure games kept as regressions.
- **Real engine bugs found and fixed tonight:** about 30, from the Professor crash and the Shabaloth killing after the game ended to two Demons made in one night overwriting each other and the Vigormortis's dead Minions never waking (see the log above).
- **Storyteller UI:** script choice (and Custom), the new choices and rulings, Gossip, Moonchild, Tinker, Juggler, Klutz, madness, Travellers joining and exile, the Fabled. Checked by hand in the browser.
- **Worth a look next:** approximations listed as approx. in INTERACTIONS.md (the Philosopher, Barber, Pit-Hag, Apprentice, Mathematician, Sweetheart timing); the experimental characters' abilities; about 4% of random games stall (the robots rarely execute), which is a robot matter, not a rules one.
