# Requests waiting to be done

Asked for by the user, not yet built. Newest first; tick off (move to "Done") as they land.

## 2026-11-01 (playtest of a Trouble Brewing game with friends)

**Maps: small enough to find people**
- Ravensburg's castle town is too big. Go back to a smaller castle town, after Talmberg in Kingdom Come: Deliverance (reference: `references/grimoire-maps/talmberg-kcd-reference.webp`: one compact walled keep with two round towers, a dry moat with a bridge, a small walled upper village of a dozen houses, woods and a stream around). Every map follows the same idea: it should never be hard to find people.
- The user is tempted to drop the village part and use a **castle interior map of 3 levels** instead (auto stairs). Build it.
- **Dev mode**: walk any map alone as the Storyteller or as a player, without a game.
- The round table: rounder, more like a table. One character's name was drawn far off in the distance (a label bug).
- Keep a real (perhaps smaller) table in the map, but at the nomination/voting stage everyone moves to a **liminal zone** around the table: a shared meeting room where everyone discusses and votes together, in essence a larger-scale version of the map's table with a blank surround and more styling; a space of its own, free to hold the timer, the clock hands and other styling, everything more refined and better looking; if there is room, names in a more stylised gothic lettering.

**Look**
- Desktop: the cells are too small for the screen. Zoom in (bigger cells, fewer columns, so smaller details read).
- Lighting is too shabby: go back to a brighter system, still atmospheric but less moody.
- Reveals need flair: a death shows the name in large gothic word art; the same for the winning team.
- Hovering (or tapping) a player's letter shows their full name as a banner in their colour. Each player keeps that colour everywhere: the grimoire circle, the circle and other views.

**Players' menu** (like the Storyteller's, without roles)
- The circle with names, at any time.
- The script's characters and their abilities.
- Their own character, with portrait and ability.
- On their own circle: their guesses, notes and statuses (private to them).
- A setup option: a log of the information each player has received, which they can read back.

**Village**
- Remove the bell (redundant).
- Private chat request with anyone; once accepted, a private waypoint or direction marker helps the two find each other.
- **Faces in ASCII**: players' webcam faces as moving ASCII, tied to proximity chat (shown for people in earshot), always shown in the circle; an option in the menu. First a standalone example program the user can test themselves.

**Bug**
- Players had left the page open. The Storyteller made a new game and it did not take the players with it: they should follow the host into the new game. **Done:** the old room tells its phones the new room's code and they rejoin it under the same name; it stays open 20 minutes for phones that were asleep.

## 2026-10-25

**Where things stand** (2026-10-25, evening): everything below is built. Still open:
- Unconfirmed with the user: Sects & Violets = Clockwork (one line in src/ui/theme.ts).
- Not yet seen by eye: Saltgrave's beam at night; the liner and abbey at night.
- Possible next: an airship (the user's other modern idea); a picture in each wake card's arch; the Lovecraftian and clockwork books want more figures (draw them in tools/margin-editor.html, tick their books).

**Look and palette**
- Revisit the palette: moody but realistic. One per game mode and per script, to fit its theme.
- Per-script looks: Laissez un Faire Lovecraftian; Bad Moon Rising a folkish, woodland, sinister grim fairytale; a Jack-the-Ripper Victorian, clockwork rather than steampunk (the user dislikes steampunk; which script still to confirm: Sects & Violets or Trouble Brewing).
- The hares keep their colours by candlelight (the trumpet's brass turns light brown on the night page).
- Desktop: show the book open, two pages side by side.
- What players are shown on their phones (wake cards): clearer, larger, centred, the character's name as gothic word art, framed with vines like an illuminated page (the user's reference: an arched miniature over a text panel, inside a dense vine border with a roundel at the foot).

**Maps (mode III, the village)**
Asked for around 2026-10-23 15:12 in a chat that is missing from this PC (the user may look into why later; don't spend effort finding it). The point of the request: maps with more going on in them (weather, light, movement), more of them, and the current ones more dynamic and realistic. Reference pictures are kept outside the repo (they aren't ours to publish) in `Game Dev/references/grimoire-maps/`.
1. **The castle town**, redone from real castle plans: `castle-plan-courtyards-moat.png` (bakehouse, two courtyards, great hall and great chambers, kitchens, a dam and moat, gatehouse with barbican, chapel and priest's house, an outer court with stables, outer gatehouse, raised ground) and `castle-plan-wards-towers.png` (outer and inner wards, round towers on the curtain wall, west and east barbicans with drawbridges over a ditch, great hall with lesser hall and chapel, kitchen tower, granary, stairs to a water gate, the town wall running off). Castle generation ideas are kept for Tachyon and the other games: see the memory note "settlement-generation-idea".
2. **The lighthouse island**: rain, thunderstorms (lightning), and the lighthouse beam turning round in the dark. (Saltgrave, the gas-lit harbour island, already has a lighthouse with a lamp room up a stair, but no beam and no weather.)
3. **A medieval rural village**, after `medieval-village-painting.webp`: rolling green fields, a stone church with a squat tower in a fenced yard of vegetable plots, thatched longhouses and barns, a winding dirt track, a stream with reeds, bare winter trees, cattle and sheep; plus flower fields and deep woods.
4. **Inside a monastery**: the whole map within its walls.
5. **A snow map**, perhaps snowy mountains.
6. **A map for each script's look**: if one script gets the Jack-the-Ripper Victorian look (clockwork rather than steampunk: the user finds steampunk tiring and usually dislikes it), it gets a map of its own.
7. **Idea for more modern themes**: a Lovecraftian ocean liner (Titanic-like) or airship.
- The map's light looks very red and odd on the user's PC: look at the night inks the map is drawn in, and the torchlight.

**How to reach the maps now:** Contents → For the players → Walk the village alone → Open the castle town / Open Saltgrave. A mode III game uses the castle town; a Laissez un Faire game uses Saltgrave.

## Done
- 2026-10-25 (evening): three more towns, each look able to have several (src/ui/theme.ts TOWN_LIST; the lobby lists them, the Storyteller switches in the village's Storyteller panel): Ashcombe in the fields (town/make-hamlet.mjs: wheat the wind runs through, sheep and cattle wandering the common, the Leam and its reeds, the church in its fenced yard), St. Cuthwin's Abbey within its precinct wall (make-abbey.mjs: cloister, chapter house, dorter of sixteen cells), the RMS Carcosa on a black sea in a storm (make-liner.mjs: promenade, grand saloon, staterooms, the boat deck's funnels and lifeboats, lights in the water).
- 2026-10-25 (evening): each look its own margins (a briar, an iron chain with cogs, a tentacle) and its own figures, ticked per book in the margin editor; button vines per look.
- 2026-10-25 (evening): on a desktop the book lies open, two leaves; long pages run across both.
- 2026-10-25 (evening): wake cards as illuminated pages: the name in textura under a pointed arch (blue good, red evil), centred text, vine border, roundel.
- 2026-10-25: the hares' brass keeps its gold by candlelight (checked: the night gold is the nearest ink).
- 2026-10-25: a look and a town per script (src/ui/theme.ts): Trouble Brewing medieval in Ravensburg, rebuilt from the castle plans; Bad Moon Rising grimm in Wolfsgrund, a village in the snow; Sects & Violets clockwork in Whitechapel's fog; Laissez un Faire Lovecraftian in Saltgrave, in rain and thunderstorms with the lighthouse beam turning. Each map in its own true inks (the red cast is gone); torches dim by day. The day gold brightened so brass stays brass.
- 2026-10-25: pages one thing each (contents, Storyteller's and players' leaves; setup as pages; settings; book of characters); bordered buttons; the margin editor with demons; the phone keyboard no longer opens on every tap.
