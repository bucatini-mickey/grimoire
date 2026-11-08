# Rules audit: docs/rules against the engine (task grim-003)

Read in full: `docs/rules/` (INTERACTIONS, ENGINE-DESIGN, PROGRESS, SOURCES, characters.json, jinx-pairs.json) and
`src/core/` (engine, rules, night, state, script, types, deal, candidates, suggest, the four script files,
travellers, fabled), plus `src/net/announce.ts`. Branch `queue/grimoire` at d20f5ba (it is 7 commits ahead of main
and has the newest INTERACTIONS.md). **No code was changed.**

How findings were checked:
- **[run]** = reproduced with a throwaway test scenario (deleted afterwards, not committed).
- **[read]** = from reading the code only.
- **[verify]** = depends on what the official rule really is; I could not check the wiki from here, so decide from the source.

Ability wording is our own paraphrase and the Storyteller decides open choices, so a finding is a gap when the engine
(1) contradicts a line in INTERACTIONS.md, (2) guesses where it should ask, or (3) has no way to express the rule.

## Summary

| # | Severity | Finding |
|---|---|---|
| A1 | High | Innkeeper who picks themself as the drunk one still protects both (doc says neither); the test is vacuous [run] |
| A2 | High | Exorcist on a Pukka or Shabaloth stops them waking, so the Pukka's old victim does not die and no regurgitation (doc says it still happens) [run] |
| A3 | High | An Innkeeper-protected Imp who chooses themself still starpasses [run] |
| A4 | High | A Drunk who believes they are the Juggler is never woken, which gives the Drunk away [run] |
| A5 | High | The Goon is not triggered by abilities that choose players through "tell" steps (Fortune Teller, Chambermaid, Dreamer, Seamstress, Ravenkeeper) [read] |
| A6 | Medium | Madness executions only by day; doc says "even at night" [run] |
| A7 | Medium | Bone Collector does not restore used once-per-game abilities (doc says it does) [read] |
| B1 | Medium | Alignment checks ignore Spy/Recluse registration (Tea Lady, Pacifist, Moonchild, Klutz, Mastermind day, Gambler, Exorcist, Snake Charmer) [read, verify] |
| B2 | Medium | Courtier and Philosopher take the first copy of a duplicated character instead of asking [read] |
| B3 | Medium | A changed player is not told after night 1; no belief asked for a new Drunk/Lunatic/Marionette [read] |
| B4 | Medium | Character changes keep alignment, `adjust` recomputes it; Pit-Hag never asks [read, verify] |
| B5 | Medium | Evil Twin: no step lets the twins learn each other [read] |
| B6 | Medium | Sweetheart's drunkenness ignores a poisoned/drunk Sweetheart [read] |
| B7 | Medium | Red herring not asked when a Fortune Teller is made mid-game [read] |
| B8 | Low-Med | Exile threshold is not in the docs; engine uses half of the living [verify] |
| B9 | Low-Med | Assassin skips the Mayor's bounce (and the Fool); PROGRESS says the bounce applies to any night kill [verify] |
| C1-C9 | Low | Smaller engine gaps (Clockmaker, Sage, Dreamer, Chambermaid, Doomsayer, Mayor count, announcements, bluffs, Fang Gu) |
| D1-D9 | Low | Doc-to-doc inconsistencies and stale notes |

## A. Engine contradicts INTERACTIONS.md

**A1. BMR-INNKEEPER-SELF [run].** Doc: if the Innkeeper picks themself and is the drunk one, neither guest is protected.
`engine.ts:602-609` adds `safe-tonight` for both guests, then adds the drunk effect, and `attemptDeath` (`engine.ts:905`)
only checks that a `safe-tonight` effect exists, never whether the Innkeeper still works. Scenario (Shabaloth hits the
Innkeeper and a guest, `drunk: Innkeeper`): both survive. The existing test (`tests/bmr.test.ts:107-113`) asserts
`!alive(2) || !alive(3) || isDrunk(2)`, and `isDrunk(2)` is always true there, so it cannot fail. The same
check would be needed if the Innkeeper became droisoned after choosing, but only the self case is reachable in the normal order.
**Fixed (grim-034):** `innkeeperProtects` (rules.ts) also requires the Innkeeper to be sober and healthy now; `attemptDeath` and the grimoire reminder use it. Tests: bmr.test.ts, tests/regressions/innkeeper-self-1.json.

**A2. BMR-EXORCIST [run].** Doc: a chosen Demon's other abilities still work (Zombuul survives, "Pukka's previous victim
dies", "Shabaloth may regurgitate"). `night.ts:209-216` removes Pukka and Shabaloth from the night when `exorcised`, so
nothing wakes: night 2 Pukka poisons seat 3, night 3 the Exorcist picks the Pukka, seat 3 stays alive and poisoned, and
the Pukka's step never appears. The Zombuul part is fine. Either the doc or the engine is wrong; the engine has no way to
run "the death/regurgitation half without the choosing half".

**A3. BMR-INNKEEPER-SAFE vs starpass [run].** Doc: the two guests cannot die tonight from anything except the Assassin.
`engine.ts:771-775` handles only the Monk for an Imp choosing themself, then `starpass()` emits `died` directly
(`engine.ts:1024`), bypassing `attemptDeath`. Scenario: Innkeeper protects the Imp, Imp chooses themself, Scarlet Woman
catches; the Imp dies and she becomes the Imp. (The Fang Gu's jump has the same bypass; that one is a documented approximation, SNV-MODEL-FANG-GU.)
**Fixed for the Imp (grim-034):** an Innkeeper-protected Imp who chooses themself is saved like a Monk-protected one (nothing happens, no new Imp). The Fang Gu jump is untouched, pending a ruling. Tests: bmr.test.ts, tests/regressions/innkeeper-starpass-1.json.

**A4. TB-DRUNK-WAKES applied to the Juggler [run].** `juggle()` returns before recording guesses unless the seat's real
character is the Juggler (`engine.ts:1300`), and the Juggler's night step requires recorded guesses (`night.ts:222`). Result:
a Drunk who believes they are the Juggler is skipped on night 2 while a real Juggler wakes. The Storyteller cannot even
give them the false answer, and the skipped wake is a tell. Every other Drunk-as-Townsfolk wakes.

**A5. BMR-GOON [read].** Doc: the first player each night to choose the Goon with their ability is drunk and the Goon takes
their alignment. `goonCatches` is called from every `choose()` branch, but players whose choosing happens inside an
information step (`tell`, `engine.ts:1075`) never reach it: Fortune Teller, Chambermaid, Dreamer, Seamstress,
Ravenkeeper. Their picks are only checked for shape in `judgeInfo`.

**A6. SNV-MUTANT / SNV-CERENOVUS [run].** Doc: madness execution "even at night; counts as the day's execution". The
`madness` command calls `requireDay` (`engine.ts:256-263`), so at night it is refused ("It is not day."), and it also
refuses once anyone was executed today or while a nomination is open.

**A7. TRAV-BONE-COLLECTOR [read].** Doc: the chosen dead player regains their ability, "used once-per-game abilities
included". `engine.ts:712` only adds a `keeps-ability` effect; `spent` is not cleared (compare `revived` in `state.ts:232`), and
`night.ts:221` still filters Professor, Courtier, Assassin, Seamstress and Philosopher on `spent`. A used one stays used.
No test covers it.

## B. Gaps where the engine guesses, ignores, or cannot express a rule

**B1. Registration only partly applied [read, verify each].** Spy and Recluse registration is handled for information, the
Virgin and the Slayer, but these use the raw `alignment` or `character`: Tea Lady (`rules.ts:136`), Pacifist
(`engine.ts:1247`), Moonchild target (`engine.ts:1410`), Klutz (`engine.ts:1384`), Mastermind's day (`engine.ts:1229`),
Gambler's guess (`engine.ts:863`), Exorcist and Snake Charmer "is the Demon" (`engine.ts:858`, `630`). A Recluse who
could register as evil/Demon, or a Spy who could register as good, never prompts the Storyteller there. Policy says ask.

**B2. Duplicates [read].** BMR-COURTIER says one copy only if a character is duplicated (the Storyteller's choice).
`engine.ts:614` uses the first seat with that character; the Philosopher does the same (`engine.ts:660`).

**B3. GEN-LEARN-OWN-CHANGE (todo in doc) [read].** `night.ts:150-155` shows a changed player their new character only on
night 1. After that a Pit-Hag target, a Barber swap, a Philosopher, and the old Demon turned Snake Charmer (poisoned, good) get no
wake. Only the new Demon is told. Also `changeCharacter` (`engine.ts:1036`) sets `believes = character`, so the Pit-Hag
or Barber making or swapping with a Drunk, Lunatic or Marionette never asks what they should believe (`assign` and
`adjust` do ask for the Drunk).

**B4. GEN-ALIGN-INDEPENDENT (todo in doc) [read, verify].** `character-changed` (`state.ts:124`) keeps alignment; only
`became-demon` forces evil; `adjusted` with a character recomputes alignment from the team (`state.ts:203-206`). So a Pit-Hag
turning a good player into a Minion leaves them good, and the manual adjust does the opposite. Nothing asks the
Storyteller. The Barber's "alignments stay" is stated in the doc and correct.

**B5. SNV-EVIL-TWIN [read].** Doc: the twins know each other. The Evil Twin's night step is a bare acknowledge
(`engine.ts:444-451` has no branch), the good twin has no step, and nothing displays the other twin. The twin link is only an
effect. The ability text in `sects-and-violets.ts` ("a good player of the opposite team") is also garbled.

**B6. GEN-DROISON-TRIGGER (todo in doc) [read].** The Sweetheart case (`engine.ts:676-681`) only checks the character, not
whether the Sweetheart was drunk or poisoned when they died. Same family: a droisoned Klutz is handled, a droisoned Sweetheart is not.

**B7. Red herring mid-game [read].** It is asked in `assign` only. A Fortune Teller made by the Pit-Hag, Philosopher or Barber
has none, so `fortuneAnswers` can never answer "yes" through it, and nothing prompts for `set-red-herring`.

**B8. Exile threshold [verify].** `engine.ts:1331`: `ceil(living/2)` supporters (the dead may support, so the count can exceed
it). INTERACTIONS (TRAV-EXILE) gives no threshold. Please check the wiki: I believe the official count is over all players,
not only the living.

**B9. Assassin vs Mayor/Fool [verify].** `ignoreProtection` skips the whole block, including the Mayor's bounce and the
Fool (`engine.ts:901-924`). PROGRESS E1 says the checker covers "the Mayor's bounce for any night kill"; BMR-ASSASSIN says
"regardless of any protection". Decide whether the bounce counts as protection.

## C. Smaller engine gaps

- **C1. Clockmaker** (`rules.ts:427-440`): with a Spy/Recluse among the Minions it accepts every number between the
  smallest and the largest distance, but only the actual registration outcomes are true.
- **C2. Sage** (`rules.ts:485-490`): accepts any player who could register as a Demon, not the Demon that killed the Sage (matters with two Demons).
- **C3. Dreamer** (`rules.ts:441-448`): SNV-DREAMER says not themself or a Traveller; only "not themself" is checked.
- **C4. Chambermaid**: BMR-CHAMBERMAID-ALIVE says not woken if fewer than two players can be chosen; `night.ts` has no such case (only reachable with very few players).
- **C5. Doomsayer** (`engine.ts:236-248`): doc says the Storyteller picks someone who can die; the call is spent even if protection stops the death.
- **C6. Counting living players is inconsistent [verify].** The Mayor's three-left win, vote threshold, Witch (>3) and Doomsayer (>=4) use `living()`
  (excludes a seemingly-dead Zombuul); two-left and the Scarlet Woman use `livingResidents` (includes it). Unstated in the docs.
- **C7. Announcements** (`announce.ts`): GEN-ANNOUNCE lists deaths at dawn, votes, executions, Virgin, Slayer, winner. Day deaths from
  exile, Gunslinger, Doomsayer and the Witch's curse produce no announcement. `game-over` reasons name the hidden cause (Vortox, Evil Twin, Klutz); fine after the end, worth a decision.
- **C8. Bluffs**: `assign` rejects characters in play but not the Drunk's believed character (`engine.ts:411-416`); `deal.ts` avoids it.
- **C9. Documented approximations, confirmed as described**: Philosopher (becomes the character), Barber (no Demon at all), Pit-Hag, Fang Gu
  (jump ignores protection), Mathematician (any count accepted, also under the Vortox), Sweetheart timing, Apprentice.

## D. Docs against docs, and stale notes

- **D1.** SNV-VORTOX says false information "(drunk or poisoned too)"; GEN-OFFERS says a drunk or poisoned player may be offered anything
  well-formed. The engine follows GEN-OFFERS (`engine.ts:1083`). Reword SNV-VORTOX.
- **D2.** The BMR header says BMR-TRAVELLERS is todo; the Travellers section says tested. SNV-TRAVELLERS has no status.
- **D3.** The Jinxes section says "not modelled until custom scripts are supported (D3)". Custom scripts now exist (PROGRESS 14:45), and there is no
  jinx code (only the Djinn's text in `fabled.ts`). The seven cross-script pairs and the 131 count match `jinx-pairs.json`.
- **D4.** ENGINE-DESIGN.md describes a plan not built as written: no `CharacterModule` hooks (`registersAs`, `winCheck`...), `attemptKill` is `attemptDeath`,
  character logic is switch statements in `engine.ts`, the opening "Today the engine knows Trouble Brewing by name" is out of date, and the
  `Effect` shape differs from `types.ts`. PROGRESS ticks C2 as done. Mark it as design history or update it.
- **D5.** PROGRESS says "Nothing is committed or pushed" (it is). Counts: "70 experimental characters" vs 66 non-Traveller carousel characters in
  `characters.json` (71 carousel entries include 3 Travellers plus Ferryman and Deus ex Fiasco); "151 non-Fabled characters" vs 138 in `CATALOG` (+15 modelled and 3 experimental Travellers);
  "15 Fabled" is 14 Fabled plus the Storm Catcher, which the data files as Loric.
- **D6.** INTERACTIONS "Experimental" says all todo, but the Cannibal entry says partly modelled. The line `EXP-CHOIRBOY / EXP-KING` is mislabelled (text is the Choirboy's; the King has its own line).
- **D7.** The BMR/SNV headers say one test per id; tests are grouped under coarser ids, and some "tested" entries are tested only in part (BMR-EXORCIST covers the Zombuul only; BMR-INNKEEPER-SELF is vacuous, A1).
- **D8.** The official night sheet has other-night entries for Scarlet Woman, Grandmother and Tinker; our definitions give them `otherNight: null`. The Scarlet Woman is
  covered by the new-Demon slot; Grandmother and Tinker are Storyteller-only. The official data flags `setup: true` on the Drunk and Marionette (handled in `assign`) and on 13 experimental characters (not modelled); our definitions carry no such flag. Not stated in the docs.
- **D9.** `characters.json` agrees with our `team` and first/other-night wake flags for every character we define (checked by script), apart from the entries in D8.

## E. Checked and consistent

Chef pairs and the Recluse/Spy cases; Empath neighbours; Fortune Teller red herring and Recluse; Undertaker; Monk (including a protected Mayor and a self-choosing Imp);
Soldier (Demon only); Mayor bounce and win; Virgin (spent when poisoned, Townsfolk only, ends the day); Slayer; Butler slip; Saint; Poisoner timing; Scarlet Woman
(five, Travellers not counted, starpass); Baron and Godfather/Fang Gu/Vigormortis setup; Sailor, Fool, Tea Lady, Pacifist (execution side), Minstrel, Gambler, Professor,
Devil's Advocate, Assassin, Mastermind, Zombuul (dead-execution, wake rule), Po (three after none), Shabaloth (regurgitate, self-kill), Moonchild, Godfather kill,
Gossip, Tinker; Snake Charmer, Witch, Cerenovus, Evil Twin win rules, Klutz, Vortox win, Courtier and Minstrel durations (`dusk: n+3` / `n+2` read correctly in `state.ts:68`);
Travellers (Gunslinger, Bureaucrat, Thief, Judge, Voudon, Deviant, Harlot, evil Traveller info) and Fabled (Sentinel, Toymaker, Storm Catcher, Ferryman) as the docs describe.
