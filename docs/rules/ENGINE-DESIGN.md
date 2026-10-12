# Engine design for every script

Today the engine knows Trouble Brewing by name: `engine.ts`, `rules.ts`, `night.ts` and
`state.ts` each mention characters directly. Bad Moon Rising, Sects & Violets and the
experimental characters need far more than that can bear. This is the plan; it keeps
the parts that work (event sourcing, refusals with a `decision`, pure functions, the
simulator) and changes how characters are described.

## 1. What the other scripts need (from reading every character's rulings)

| Need | Characters |
|---|---|
| Drunk and poisoned from many sources, each with its own end (dusk, dawn, "3 nights & 3 days", "from now on") and some only while their source keeps their ability | Sailor, Innkeeper, Courtier, Minstrel, Goon, Philosopher, Sweetheart, Pukka, No Dashii, Vigormortis, Poisoner, Widow, ... |
| "Can't die" of several kinds, and one thing that ignores them | Monk, Soldier, Innkeeper, Tea Lady, Sailor, Fool, Pacifist, Devil's Advocate, Zombuul (registers dead); Assassin ignores all |
| Several deaths a night, deaths that wait (Pukka, Moonchild, Gossip), deaths caused by the Storyteller (Tinker, Gossip, Pit-Hag) | |
| Coming back to life, with abilities restored and first-night abilities acting again | Professor, Shabaloth |
| Alignment that changes on its own | Goon, Snake Charmer, Fang Gu, Bounty Hunter, ... |
| Characters that change (and swap) | Pit-Hag, Barber, Snake Charmer, Fang Gu, Imp, Scarlet Woman |
| Players who think they are something else | Drunk, Lunatic, Marionette |
| Extra ways to win and lose | Evil Twin, Klutz, Vortox, Mastermind, Saint, Mayor, Lil' Monsta |
| Execution that does not kill, more than one execution | Pacifist, Devil's Advocate, Fool, Sailor, Butcher |
| Information that must be false | Vortox |
| Knowing who woke, who voted, who nominated, what went "abnormal" | Chambermaid, Flowergirl, Town Crier, Mathematician |
| Madness (a judgement call, so a Storyteller decision) | Mutant, Cerenovus |

## 2. The shape

**A character is a module**, declared once, with only the hooks it needs:

```ts
interface CharacterModule {
  id: CharacterId;
  // when it wakes, and what resolves it
  wakes?(s, seat, night): boolean;          // default: alive and order says so
  action?: Action;                          // choose k players / a character / player+character / info / nothing
  resolve?(tx, seat, choice): void;         // emits events
  // what it changes about the rules
  registersAs?(s, seat): Registration;      // Spy, Recluse
  protects?(s, target, cause): string|null; // Monk, Soldier, Tea Lady, Innkeeper, ...
  onDeath?(tx, seat, cause): void;          // Ravenkeeper, Sweetheart, Moonchild, Klutz, Grandmother ...
  onExecution?(tx, seat): 'dies'|'survives'|ask;
  onNominated?(tx, nominator, nominee): void;  // Virgin, Witch's curse
  winCheck?(s): Alignment | null;           // Evil Twin, Vortox, Klutz, Saint, Mayor
  setup?: Partial<Composition> | 'ask';     // Baron, Godfather (+/-1 asks), Fang Gu, Vigormortis
  truth?(s, to, info): boolean | null;      // the information oracle
}
```

**Lasting effects are data**, not flags on the state:

```ts
interface Effect {
  kind: 'drunk' | 'poisoned' | 'safe' | 'survives-execution' | 'cursed' | 'mad' | 'master' | ...;
  target: SeatId;
  by: SeatId | null;      // whose ability, null for the Storyteller's hand
  role: CharacterId;      // which ability (for Mathematician, and for "while the source works")
  until: 'dusk' | 'dawn' | { day: number } | { dusk: number } | 'game';
  whileSourceWorks?: boolean;   // Courtier, Philosopher, Poisoner (dead Poisoner: poison ends)
}
```

`isDrunk(s, id)` and `isPoisoned(s, id)` become "any current effect of that kind", plus
the derived ones (the Drunk always; No Dashii neighbours; Vigormortis Minions). Effects
whose source must still work are evaluated with a recursion guard, so a Poisoner and a
Courtier disabling each other settle the way the rules intend: the effect applied later
wins (the Storyteller can always correct by hand).

**Death goes through one door**: `attemptKill(tx, target, cause, by)`; it asks every
module's `protects`, the Fool, the Zombuul, the Mayor's bounce and the Assassin's
override in one place, in the documented order, then `kill`. Executions likewise go
through `execute(tx, target)`.

**Night order** comes from the official night sheet (`docs/rules/characters.json`),
not hand-typed numbers.

**Alignment** is stored per seat and only changes by events (`alignment-changed`).

## 3. Order of work

1. Effects list and the death door, with Trouble Brewing moved onto them; every test and
   the simulator still green (the simulator's independent rules unchanged).
2. Character modules for Trouble Brewing (move the switch statements into modules).
3. Bad Moon Rising, one character at a time: module, rulings tests, simulator robot
   support, an independent check in the simulator's rules.
4. Sects & Violets the same way.
5. Experimental characters, Travellers and Fabled, in order of how often they appear on
   popular scripts.

The app keeps working throughout: Trouble Brewing stays the default script, and a script
is only offered in setup once all its characters are done.
