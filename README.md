# Grimoire

An ASCII Storyteller's companion for **Blood on the Clocktower**, styled as a late-medieval book: vellum and iron-gall ink by day, the same page by candlelight at night. Text is set in Grenze, a book face with a touch of blackletter; headings, timers and the player's big lines in Grenze Gotisch; the page title in UnifrakturCook. Panels are framed with a fine double rule.

**Play it:** <https://bucatini-mickey.github.io/grimoire/> (open on a phone, then *Add to Home Screen*). Part of [Bucatini Mickey's game dev](https://bucatini-mickey.github.io/game-dev/), alongside the [Tachyon](https://github.com/bucatini-mickey/tachyon) engine.

> Not affiliated with The Pandemonium Institute. Ability text is our own paraphrase.

## What's here

**Mode 1, in person** ([design notes](docs/DESIGN.md)): one phone, held by the Storyteller, for **Trouble Brewing**.

- **Setup.** Enter names, then pick the characters in play (live team counts, Baron included) or take a random set. Place tokens by tapping a seat and then a character, or shuffle them. Tap two seats to swap. Choose the Drunk's token, the red herring and the bluffs.
- **The circle.** Seats are round parchment tokens with a thin double edge in their team's colour (blue good, red evil, purple for the Drunk, shown as who they think they are), on a fine double-ruled ring, clockwise from the top. The character is inside with any reminders (poisoned, safe, master, red herring, drunk, shot used, Virgin spent, no vote) in small italic; the player is beneath; P / D / R flags sit at the shoulder; the dead are dimmed and marked †. The middle shows the phase, who is alive and the votes needed. Tap a seat and *Move seat* to swap two players mid-game.
- **Art tab.** A pixel easel: pick the clocktower, moon, sun, stars or any character, choose an ink from a small retro palette, and paint by tapping or dragging (draw, fill, flip, resize, undo). Drawings are kept in this browser and appear in the circle, on the title page and on the player's pages; *Copy as code* gives the rows to paste into `src/ui/pixel.ts` to make one permanent.
- **The first night.** Every player is woken once, in night order, and shown their character, ability and team on the phone. Players with a first-night ability see it as the first page of their own turn; everyone else gets a short wake just to see it (so the Poisoner still acts before anyone learns anything).
- **The night, in wake order.** The Storyteller's view names who to rouse next, with their ability and whether they are drunk or poisoned. For information roles you first choose what they learn: suggestions are labelled *Neutral*, *Helps good* or *Helps evil*, each with its reason. A drunk or poisoned player is also offered false answers, or you can write your own. A falsehood to a hale player needs an explicit "I insist", which is logged.
- **The book in the player's hands.** *Hand them the phone* gives the player their own pages: who they are (on the first night, Minions also see their Demon), then whom they choose (Confirm / Back) or what they learn, then a plain "Hand the phone back" page, so nothing about the next player shows. The Spy's pages are the whole grimoire, bluffs included. If you'd rather they just point, tap their choice on the table instead. A blank space is left for each character's picture.
- **The day, on the clock.** Discussion, then a nomination phase. A nomination pauses the phase clock and runs an accusation timer, then a defence timer, then the vote: hands are tapped one by one, clockwise from the player after the nominee, the nominee last. Every timer can be paused, restarted or given ±30s, and survives a reload. Lengths are set under *Clock*. The phone buzzes when a running timer reaches zero.
- **Announcements to the room.** Anything everyone must hear comes up large: who died in the night, each vote's result, executions, the Virgin, the Slayer's shot, the end of the day with no execution, and the winner. Secret things (a Monk's save, a starpass, a Scarlet Woman taking over) are never announced.
- **Counting hands.** The vote opens full screen: the voter's name large and two big buttons, *Hand raised* and *No hand*, so you can watch the room and still press the right one. *Small view* puts it back in the panel.
- **Nominating and the Slayer** pick their players from name buttons right in the panel, no scrolling up to the circle.
- **The Storyteller's hand.** Tap any seat to kill or revive, poison or cure, move the red herring, give back or spend a ghost vote, or swap the token. All of it is logged.
- **Rules kept by the engine.** Registration, Mayor bounce, starpass, Scarlet Woman, Virgin, Slayer, Butler, Saint, ghost votes, ties, and both win conditions. Where the rules leave a choice to the Storyteller, it asks.
- **Undo** per command, the **Chronicle** log, and the **Ties** grid of who did what to whom.

**Mode 3, players' phones** (first version): the Storyteller opens a room on the *Phones* tab and gets a four-letter code and a QR code. Players open the app, choose *Join a game* (or scan), type the code and tap their name. Then:

- each player can see their own character (hidden until they tap, in case of wandering eyes);
- at night the Storyteller taps *Send to Ada's phone*: her phone buzzes with her pages, she chooses on her own phone, and the choice comes straight back (for the Fortune Teller and Ravenkeeper, the Storyteller then sends the answer);
- every phone shows the circle as the room knows it (deaths only at dawn), the block, the clock, and the announcements.

The Storyteller's phone runs the game; the others only show what `src/net/views.ts` says that player may see, and that file is covered by tests so nothing secret leaks. Phones find each other through PeerJS's free public broker and then talk directly (WebRTC), so they need internet (wifi or mobile data). Hand-the-phone still works for anyone without one.

**Mode 2, the village** (a demo; *Visit the village* on the first page, or `#village`): a top-down town everyone walks on their own phone, with proximity voice.

**Playing a real game in the village:** open a room on the *Phones* tab and tap *Play in the village*. Every seated phone then walks the town instead of looking at the circle, and the game drives it: night sends everyone home behind locked doors; *Send to Ada's phone* takes the Storyteller to Ada's house as her pages arrive over the village; the day is the town; opening nominations moves everyone to the circle, whose middle shows the nominations, votes and the block; the dead walk as faded letters marked †. Players open their character with *My character*. **Nominating and voting from phones:** in the circle a player taps *Nominate* and picks whom; the Storyteller gets *Accept* / *Not now* (in the grimoire, or as a bar in the village), and accepting runs the nomination as usual. A bar in the village also takes the Storyteller through the accusation, the defence and into the vote. During the vote each player has *Raise hand* / *Lower hand*; the circle shows a gold clock hand pointing at whoever is being counted, and a ▲ over raised hands. The Storyteller's big vote screen shows each voter's phone hand, and *Count by phones* runs the clock round by itself, stopping at anyone without a phone. The Storyteller switches between the grimoire and the village with the *Village* button and *Back to the grimoire*.

The demo village: the church closes the north of the square, its clocktower rising at the back; the 15 seats ring a market cross in the middle. Chairs in the open are the seats, wherever a town puts them.

- Made for a phone held upright: the map fills the screen and the buttons sit under your thumb. The Storyteller opens a village and gets a code and QR (in the *Storyteller* drawer); players join with the code and a name. Tap a place to walk there, or hold and drag to steer (arrow keys or WASD on a computer).
- **Drawn like Tachyon** (`src/town/look.ts`, with Tachyon's colours and light numbers): every cell filled with its material's colours, sky light that leaks through doorways and fades into rooms, and coloured, flickering torchlight. After dark everyone carries a lantern.
- **People** are a blackletter initial in their own colour (the host gives everyone a different one), with their name above. A letter goes bold and glows while that person talks. The Storyteller is a gold ✦, a ghost: they walk through walls and doors, see the whole town, and never lock doors.
- **Voice:** *Talk* uses the microphone; *Test note* hums instead, to try it without talking. You hear whoever is near: full volume within 2 m, fading to nothing at 10 m. Voices stop at walls; an open doorway carries both ways. In the ring of seats round the clocktower, everyone in it hears everyone in it.
- **A private word:** *People* lists everyone; ask anyone for a private word. If they agree, you two hear only each other, wherever you are, and nobody else hears you. *End* finishes it.
- **Doors:** standing inside beside a door, *Lock door* shuts it. A locked door stops anyone walking in and stops the eye, and it shows plainly to everyone in town. Double doors lock and unlock together. Unlock from inside.
- **Sight:** walls and locked doors hide what is behind them. The whole town is on your map (you live here), dim where you cannot see now.
- **The phases** (the Storyteller's drawer): *Day*; *Ring the bell* (dusk: the bell sounds, phones buzz, the seats light up and *My seat* walks you to yours); *The circle* (the town falls away and everyone sits on one glowing circle, seen and heard by all); *Night* (everyone is sent home to a house with a bed, every house is locked, and nobody can talk, except to the Storyteller, who from *People*, can *Visit* anyone straight away).
- **+ Test villager** adds a humming walker on the Storyteller's phone, for trying it alone.
- **The town is a Tachyon blueprint**, `town/village.tbp`: one character per metre, with a key saying what each character is (`key d floor wood | door`). Edit it in any text editor, or build in Tachyon's editor and save a blueprint, then *Load my own town* on the Storyteller's phone. Players get the host's town when they join. Rooms come from walls and doors; chairs in the open round a `stair-up` (the clocktower) are the dusk seats.

Phones call each other directly (WebRTC through PeerJS), only while in earshot. Some strict networks (some offices, some mobile carriers) block direct calls; a relay server fixes that if it turns out to be needed.

## Putting it on phones

The build is a static site in `dist/`. Pushing to `main` publishes it with GitHub Pages (`.github/workflows/pages.yml`, after the type check and tests pass) at <https://bucatini-mickey.github.io/grimoire/>; any other https host works too. Share the link. On a phone, open it and choose *Add to Home Screen* (Android Chrome may offer *Install app*): it gets the clocktower icon, opens full screen, and keeps working offline. Nothing to install from an app store, no accounts.

## Running it

Requires Node 22.6 or later (the tests run TypeScript directly).

```bash
npm install
```

```bash
npm test
```

```bash
npm run build
```

`npm run build` writes **one self-contained file**, `dist/grimoire.html`. Copy it to a phone and open it, or put it on any static host. It needs no server and no app. Fonts load from Google Fonts when online, with plain fallbacks offline.

```bash
npm run dev
```

`npm run dev` rebuilds on change and serves at http://localhost:5317.

## Testing the rules

Besides the hand-written tests, a **simulator** (`tests/sim/`) plays whole random games. A robot Storyteller and robot players wake in order, poison, protect, kill, starpass, nominate, vote and shoot, and make the Storyteller's rulings at random. Now and then they try something illegal, to check it is refused. After **every event** it checks the rules, written a second time independently of the engine:

- **Winning and death:** wins, deaths and saves (the Monk, the Soldier, the Mayor's bounce, the Scarlet Woman at five alive, the starpass).
- **Waking:** the official night order; everyone wakes on the first night, and nobody wakes twice.
- **Information:** each piece is true for the player who gets it, Spy and Recluse registration included.
- **The day:** votes, ties and ghost votes; nominations; the Virgin, the Saint and the Slayer.
- **Poison:** it wears off at dusk.
- **The phones:** they never see a character, or a death before dawn.
- **The log:** replaying a game's events rebuilds it exactly.

When a rule breaks, the game is cut down to the fewest commands that still break it and written to `tests/sim/failures/`. `node tests/sim/explain.ts <file>` tells it as a story.

```bash
npm run sim
```

This plays 10,000 games and reports how often each interaction came up (`npm run sim -- 50000 7` plays 50,000 from seed 7). `npm test` plays 300 of them every time.

```bash
npm run mutants
```

This tests the tests: it plants a rule bug in the engine (24 of them, one at a time, always put back) and checks that the simulator catches each one.

## Layout

| Path | What |
|---|---|
| `src/core/` | The rules engine. Pure TypeScript, no DOM, no dependencies. |
| `src/core/engine.ts` | Commands → events, with every rule check. Start here. |
| `src/core/rules.ts` | Droisoning, registration, neighbours, and judging information. |
| `src/core/night.ts` | The wake order, worked out fresh from the state each time. |
| `src/core/state.ts` | Folds events into state. Records facts, decides nothing. |
| `src/core/graph.ts` | Interaction edges from the log. |
| `src/ui/ascii.ts` | The 40-column text grid with touch buttons. Knows nothing about the game. |
| `src/ui/main.ts` | The Storyteller's app (and hosting phones). |
| `src/ui/player.ts` | The app on a player's own phone. |
| `src/ui/wakepages.ts` | A night wake drawn as the player's pages (both modes). |
| `src/net/views.ts` | Exactly what a player may see. Tested for leaks. |
| `src/net/protocol.ts`, `src/net/link.ts` | Messages between phones, and the PeerJS connection. |
| `src/ui/pixel.ts` | Pixel sprites, the ink palette and the clocktower scene. |
| `src/ui/easel.ts` | The Art tab: the pixel easel. |
| `src/core/candidates.ts` | Suggested answers with a lean and a reason. |
| `src/ui/timer.ts` | Pausable, saveable countdowns. |
| `src/ui/art.ts` | Character portraits (put your ASCII art here) and the table's centrepiece. |
| `src/town/` | Mode 2: `blueprint.ts` reads Tachyon blueprints, `map.ts` the rules of sight, rooms and hearing (tested), `look.ts` Tachyon's colours and light, `voice.ts` proximity voice, `village.ts` the app. |
| `town/village.tbp` | The demo village. Edit freely. |
| `tests/` | Rule, view and town tests (`node --test`), and the game simulator (`tests/sim/`). |
