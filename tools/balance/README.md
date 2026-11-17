# Balance simulator

Plays thousands of bot games locally (every core, no network) and reports how often good wins. It was built to tune Hour of the Wolf, an evil-majority script, against Trouble Brewing.

```
npm run balance -- calibrate [games]     tune the skill knob until Trouble Brewing is 50/50
npm run balance -- tb [games]            Trouble Brewing by player count
npm run balance -- wolf [games]          search Hour of the Wolf layouts
npm run balance -- one '<spec>' [games]  one layout at three skill levels
npm run balance -- chars '<spec>' [games]  how much each character helps or hurts good
npm run balance -- compare [games] [chars...]  force each character into play, vs the baseline
```

A spec is JSON, for example:

```
{"kind":"wolf","n":10,"good":2,"demons":1,"evilKnow":"none","goodKnow":true,"exec":"majority"}
```

- `evilKnow`: `all` | `minionsKnowDemon` | `demonKnowsMinions` | `none`
- `exec`: `majority` (the usual), `legion` (fails if only evil voted), or `two` (any 2 votes execute)
- Optional `town`, `minions` and `demonPool` override the roster in `setups.ts`.
- Optional `force` puts characters in play every game, e.g. `"force":["piedpiper"]`.

Homebrew under test: `piedpiper`, `piedpiper3` (3-follower cap), `piedpiper1` (1-follower cap), `piedpiperVoted` (followers die only if they voted with him that day), `piedpiperNom` (followers forced only on his nominations), `piedpiper1Voted`, `ouroboros` (clockwise cycle), `ouroborosSpiral`, `ouroborosSpiralSelf` (stops killing instead of dying), `ouroborosReset`, `familiar`, `familiarWakes` (may realise they are good from day 3 and confess the Demon).

## How it works

- **world.ts:** every hidden world, meaning which seats are evil and which are Demons. Each bot holds a weight on every world. A clue is a test run over the worlds, so contradictions and double claims are handled exactly.
- **game.ts:** a light rules model, not the Grimoire engine. Info characters get true clues unless they're drunk, poisoned or misregistered. In a good-majority game, good players publish their clues and evil publishes fake ones. A claim only counts in worlds where the claimant is good. Bots nominate and vote for whoever they most want dead, and evil kills and poisons by the same logic.
- **skill** (0–1) sets how well the whole table plays: trust in clues, social reads, and careless votes. `calibrate` finds the skill at which Trouble Brewing is 50/50 and saves it to `calibration.json`. Every other layout is then judged by the same table.

## Limits (v1)

- Bots aren't people. Trust the ranking of layouts, not exact percentages.
- Not modelled: vote-reading, whispers, Butler, Virgin, Cerenovus, Organ Grinder, Fearmonger and Pit-Hag. The last four count as abilityless Minions.
- Outsiders cost good too little, so Trouble Brewing's 9-, 12- and 15-player counts come out good-leaning.
