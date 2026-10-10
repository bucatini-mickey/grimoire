# Design notes

## The three modes

1. **In person** (built first). Everyone is in one room playing only this. The app is the Storyteller's grimoire on one phone. Nothing is networked.
2. **Virtual village.** Top-down characters walking a village to conspire, played online and on phones, maybe with proximity voice later.
3. **Event companion** (the wedding-reception idea, started in `../BOTC`). People mingle while the game runs in the background, and timers call them to a meeting point. Rules-wise it is mode 1 plus a clock and per-player screens.

All three share one rules engine. Modes 2 and 3 differ only in who holds which screen and how events travel.

## Why TypeScript, not Python / Broadside's engine

The game has to run on players' phones without installing anything, so it has to run in a browser, which means JavaScript. TypeScript keeps the rules typed, and Node 22+ runs it directly for tests. The engine has no dependencies. Broadside's engine is Python and terminal-only, so nothing is shared at code level. What carries over is the shape: a fixed-width cell grid (`ascii.ts` ~ Broadside's `render/buffer.py`) and an event log. `ascii.ts` deliberately knows nothing about Clocktower, so it could drive menus elsewhere.

## The engine: event-sourced

- **Commands** are requests from the Storyteller (`choose`, `tell`, `nominate`, `vote`...).
- `perform(state, command)` refuses with a plain-English reason, or returns **events**: facts such as `died`, `info-given` or `vote-tallied`.
- `reduce(state, event)` only records facts. Every decision is made in `engine.ts`.

What this buys:

- **Undo** is "drop the last command's events and replay".
- **Saving** is just storing the log, and replay is exact (tested).
- **The interaction graph** is a read of the log, so it cannot drift from what happened.
- **Networking later** is sending events. The host's engine stays authoritative, and each player is sent only the events they are allowed to see.

### Storyteller decisions

Where the rules leave a choice open, a command carries the answer (`mayorRedirect`, `newDemon`, `nominatorIsTownsfolk`, `targetIsDemon`). If the answer is missing and the choice really is open, the engine refuses with a `decision` code naming what it needs, and the UI asks. If the choice is not open (a real Townsfolk nominating the Virgin), no question is asked.

### Information

For every info role, `judgeInfo` decides whether a piece of information *could be true* under some allowed registration of the Spy and Recluse. True information is always accepted. False information is accepted only if the receiver is drunk or poisoned, or with an explicit `override`, and both cases are logged.

## Hosting (mode 3 first version built: WebRTC through PeerJS; see README)

The constraint: free, no accounts, no odd apps, works on phones.

- **Mode 1 needs none of this**: one HTML file on the Storyteller's phone.
- **Static hosting is free and easy.** GitHub Pages can serve the HTML (`../BOTC` already deploys this way).
- **A phone as host.** `../BOTC/docs/decisions.md` ruled out the host phone acting as a *server*, because a browser tab cannot accept incoming connections. **WebRTC** gets around that. The Storyteller's tab is the authoritative host, and each player's browser connects to it peer-to-peer over data channels. The catch is that WebRTC still needs a one-time handshake ("signalling"). The options are a free public broker (PeerJS's cloud), a tiny relay we host, or no server at all, by swapping the handshake as QR codes (clunky but genuinely serverless). The host tab must also stay open and awake.
- **Fallback:** the self-hosted Supabase setup already built in `../BOTC`.

Recommendation when we get there: WebRTC with the host on the Storyteller's phone and QR-code join, with PeerJS signalling as the convenience path. The engine needs no changes for any of these.

## Rulings and assumptions

- Seats are players, not places: `GameState.order` is who sits where, and the Storyteller can swap two players mid-game. Neighbours (Empath, Chef), the vote order and the circle all read the order.
- A poisoned Spy still sees the true grimoire on the phone; the Storyteller is warned and may tell them otherwise in person.
- First night: every player is woken exactly once. A player with a first-night ability learns everything in that wake (a Poisoner or Spy also learns their Demon and fellow Minions there). A Minion with no first-night ability wakes at the Minion-info point and the Demon at the Demon-info point to learn the evil team. Anyone else is woken at the end of the night just to see their character (night.ts).

- The Imp kills before the Fortune Teller, Butler and other later wakes (official order). What players see on the phone at night never gives a death away early: only players dead when the night began are marked.
- The red herring is always a good player, however it is set. The Drunk may be one of the Demon's bluffs when not in play.

## Things to verify against official sources

- Vote order. Implemented as the official rule: clockwise starting with the player after the nominee, the nominee last. If your group counts from the nominee first, it is one line in `voteOrder` (rules.ts).

- Night order: checked against the community role data used by clocktower.online (bra1n/townsquare roles.json). First night: Poisoner, Washerwoman, Librarian, Investigator, Chef, Empath, Fortune Teller, Butler, Spy. Other nights: Poisoner, Monk, Scarlet Woman, Imp, Ravenkeeper, Empath, Fortune Teller, Undertaker, Butler, Spy. Ours matches.
- That the Spy and Recluse keep registering while dead. Assumed yes, which only ever widens the Storyteller's choices.
- That the Scarlet Woman's "5 or more alive" counts the Demon before it dies. Implemented that way: 5 alive, the Demon is slayed, and the Scarlet Woman becomes the Demon.

## Next steps (mode 1)

- Travellers, and Teensyville scripts.
- Per-player private notes; Storyteller reminder tokens.
- A proper interaction graph drawing (the Ties grid is the data already).
- Fonts bundled into the file for fully offline use, and character close-ups as ASCII stained glass.
