# Palette research (grim-019)

Research only. No code was changed. Goal: the app's look "a shade brighter", with colours that come from
documented dyes and pigments, not guesses. Proposed values are for `PALETTES` in `src/ui/ascii.ts`.

## How to read the hex values and confidence

Web search found good historical text (Cambridge "Moving Word" medieval palette; Making and Knowing teaching
notes; Wikipedia colour articles) but almost no measured swatch data. So hex values are of three kinds:

- **Web convention**: a published web colour for that named colour (alizarin crimson #E32636, Prussian blue
  #003153). Conventions, not measurements. Confidence: medium for hue, low for exact value.
- **Typical swatch**: the colour of a modern reproduction of the pigment as sold, or of a manuscript detail, as
  recalled from memory. Not re-measured here. Confidence: medium-low.
- **J (judgement)**: my estimate where no standard swatch exists (dyes on cloth vary hugely with mordant and
  light). Confidence: low.

Treat every hex as "right family, roughly right lightness". Sources:
[Cambridge, The medieval palette](https://exhibitions.lib.cam.ac.uk/moving-word/?p=1648),
[Making and Knowing, paints and pigments](https://teaching640.makingandknowing.org/documents/pdf/introduction-paints-pigments_njr_2021.pdf),
[Wikipedia, Alizarin crimson](https://en.wikipedia.org/wiki/Alizarin_crimson_(color)),
[Wikipedia, Mauve](https://en.wikipedia.org/wiki/Mauve),
[Imperial College, Mauveine](https://www.ch.imperial.ac.uk/motm/perkin/Mauveine.pdf).

## 1. Medieval (manuscript, folio, cover, leather, map-medieval)

| Dye / pigment | Used for | Source | Hex | Where from / sureness |
|---|---|---|---|---|
| Madder (as lake) | Reds on cloth; red lake in painting (rare as paint before 17th c.) | Cambridge, Making and Knowing | #B5483A | Typical swatch; medium-low |
| Kermes | Scarlet/crimson silk and wool, manuscript crimson | Cambridge | #A8283A | Typical swatch; medium-low |
| Cochineal (from the 1520s) | Crimson lake | Making and Knowing | #9E1B32 | Typical swatch; medium-low |
| Vermilion (cinnabar) | Rubrics, initials, the bright red of manuscripts | Cambridge | #D9402B | Typical swatch; medium |
| Weld (Reseda luteola) | Yellow dye and yellow lake | Cambridge | #D8B13A | J, from lake swatches; low |
| Orpiment | Gold-imitating yellow in manuscripts | Cambridge | #E6B422 | Typical swatch; medium |
| Woad / indigo | Blue dye, blue in manuscripts | Cambridge | #2F4F7F | Typical swatch; medium-low |
| Ultramarine (lapis lazuli) | The costly sky and robe blue | Cambridge | #2E4FA3 | Typical swatch; medium (real ground lapis is paler, about #3A5BA0) |
| Azurite | Cheaper blue | Cambridge | #3F6FB0 | Typical swatch; medium-low |
| Verdigris | The standard green | Cambridge | #3E8F7A | Typical swatch; medium (it browns with age) |
| Tyrian-style purple (murex) | Imperial purple, purple-dyed parchment | Making and Knowing | #7A2F5A | J; low (reddish, not blue) |
| Lichen / orchil | Poor man's purple | Making and Knowing | #7B4F8C | J; low |
| Oak-gall (iron-gall) ink | Black text, fading to brown | Cambridge | #2B2018 fresh, #5A4130 aged | Typical; medium |
| Lead white | White, highlights | Cambridge | #F2EDE0 | Typical; medium |
| Shell / leaf gold | Gilding | Cambridge | #C9A24A | Typical; medium |
| Vellum | The page | Cambridge | #E8DDC4 | Typical; medium |

### Proposed slot mapping (medieval)

Slot order: 0 page, 1 panel, 2 rule, 3 dim, 4 ink, 5 bright, 6 gold, 7 amber, 8 rubric, 9 deep rubric, 10 green,
11 deep green, 12 lapis, 13 deep lapis, 14 violet, 15 brown. Mapping: 6 shell gold, 7 vermilion/weld mix, 8 kermes
or vermilion, 9 madder-dark, 10 verdigris-and-weld mix (kept olive, not teal), 12 woad/ultramarine lightened,
14 orchil, 15 oak-gall brown. In the `folio*` keys the comment in `ascii.ts` redefines 7, 11, 13, 15 as the hares'
vermilion, flesh, hare's brown and fawn; the proposals follow that.

"Now" is the present value. "Proposed" is one step brighter: about +8 to +12 percent lightness on dark pages;
a slightly lighter page and a little more chroma in the accents on light pages.

| Key | Now | Proposed |
|---|---|---|
| manuscript-night | #110e0d #1d1816 #4e4238 #857868 #d4c9b4 #ece2cc #b08d55 #a8683a #b0362c #6e1f1a #7f8a62 #343a2a #6f87a6 #26344a #8a6a90 #4f3a2a | #15110f #241d1a #5a4c40 #978872 #e0d5bf #f4ebd6 #c29d5e #bd7640 #c43d30 #7e2620 #8f9c6c #3d4430 #7f99b8 #2d3d56 #9c7aa2 #5c4432 |
| folio | #e4dccb #d6ccb8 #9c8f7a #706556 #241c17 #100b08 #b8913e #c2522e #8c2a22 #6a1d17 #56603f #dcb38c #3a5576 #9a7b55 #6a4a72 #cdb592 | #ece5d4 #ddd4c0 #a89b84 #7a6e5e #241c17 #100b08 #c49b44 #cd5a30 #9a2e24 #74201a #5f6b42 #e3bd98 #3f6288 #a58260 #75527d #d6bf9c |
| folio-night | #2a2119 #352a20 #5c4c3a #9a8a72 #e2d4b8 #f4e8cf #c69a45 #c8573a #c0453a #7a2a22 #7f8a62 #c9a383 #6f87a6 #9a7b55 #8a6a90 #cdb592 | #322820 #3e3126 #685640 #a89880 #ebddc0 #f9eed8 #d0a44c #d4603f #cf4a3e #86302a #8f9c6c #d3ae8d #7f99b8 #a58260 #9a7aa0 #d6bf9c |
| cover and leather (identical now; keep identical) | #2b1810 #3a2216 #5e3a26 #a3825e #e3cfa8 #f3e3c0 #c69a45 #b06a35 #b8382c #6a1c14 #7f8a62 #3b3a26 #6f87a6 #26344a #8a6a90 #4f3a2a | #341f14 #452a1c #6c4630 #b4916b #ecd9b2 #fbedca #d4a64c #bd7439 #c83f32 #75201a #8f9c6c #45442d #7f99b8 #2d3d56 #9c7aa2 #5c4432 |
| manuscript-day | #e4dccb #d6ccb8 #9c8f7a #706556 #241c17 #100b08 #7d6232 #93532a #8c2a22 #6a1d17 #56603f #b2b59a #3a5576 #bcc4cf #6a4a72 #ad9e86 | #ece5d4 #ddd4c0 #a89b84 #7a6e5e #241c17 #100b08 #8f7035 #a25a2e #9a2e24 #74201a #5f6b42 #bcc0a2 #3f6288 #c8d0da #75527d #b8a98f |
| map-medieval | #0b0c0d #1c1f22 #4a4d4e #8f8c84 #d8d2c2 #f5efe0 #d9a441 #c46a2c #a83a2c #6b4a2e #4f7a36 #2c4a24 #4c79a8 #2a3d5c #7d5aa0 #a8885a | #101213 #232729 #55595a #9d9a91 #e2dccd #fbf5e8 #e3ae4a #cf7430 #b8412f #7a5434 #5a8a3e #34562b #5a8bbc #304768 #8a66ae #b4925f |

## 2. Victorian and clockwork (victorian-*, folio-clockwork*, map-clockwork)

| Dye / pigment | Used for | Source | Hex | Where from / sureness |
|---|---|---|---|---|
| Mauveine (Perkin, 1856) | First synthetic dye; silk, later stamps | Imperial College; Wikipedia Mauve | #8D4B8E | The web "mauve" #E0B0FF is a modern pale name, not the dye. This is J for a faded-silk mauveine; low |
| Alizarin (synthetic madder, 1868) | Turkey-red cotton, alizarin crimson paint | Wikipedia | #E32636 (web); #A8202E as paint mass-tone | Web convention / typical swatch; medium-low |
| Prussian blue (1706, in use throughout) | Blueprints, uniforms, paint | Wikipedia | #003153 (web); #1B3A5C typical | Web convention; medium (very dark, lightens as a tint) |
| Chrome yellow (lead chromate, 1800s) | Omnibuses, signs, paint | Wikipedia | #E8A317 | Typical swatch; medium-low |
| Gaslit brass | Fittings, instrument bezels | none | #C9A04A | J; low |
| Soot / lampblack | Paper tint, grime | none | #3A352E | J |
| Emerald / Paris green | Wallpaper, gaslit green | Wikipedia | #3E8E5A | Web convention; medium-low (arsenical, era-true) |
| Aniline magenta (fuchsine, 1859) | Aniline reds and violets | Wikipedia | #B03060 | Typical; low |

### Proposed mapping (Victorian and clockwork)

6 gaslit brass, 7 chrome yellow dimmed toward orange, 8 alizarin, 9 deep alizarin, 12 Prussian blue (lightened),
13 deep Prussian, 14 mauveine, 10 Paris green dimmed.

| Key | Now | Proposed |
|---|---|---|
| victorian-night | #0e1411 #16201b #3f5648 #7d9486 #cfd6c0 #ecebd2 #c7a24a #b9792f #b5503c #6b2a22 #8cb36a #2f4a2c #6f9aa8 #20404a #8a6aa0 #4a3a24 | #121b16 #1b2821 #4a6354 #8ca394 #dbe2cc #f4f3dc #d4ae52 #c9832f #c85a42 #7a3026 #9cc577 #37562f #7fabba #264b57 #9c7ab2 #54422a |
| victorian-day | #e2dcc0 #d3cdae #8f9a82 #66705e #1e2a22 #0c150f #8a6a1a #9a5c20 #8e2f24 #6b1f18 #3f5a28 #a9b78e #2a5a66 #b4c8c8 #5e3f78 #a89870 | #ebe5ca #dcd6b8 #9aa58c #5b6553 #1e2a22 #0c150f #99761f #aa6424 #9e3327 #761f18 #46662c #b4c29a #2f6573 #bdd2d2 #6a4486 #b3a37a |
| folio-clockwork | #ddd3c0 #cec2ab #958670 #665b4c #1f1a16 #0c0907 #b38c3c #a8442c #7a1f1a #4f1410 #4f5a46 #d0b08c #34465a #8c6e4c #55435e #c4ab88 | #e6dccb #d7ccb4 #9a8b74 #6a5f50 #1f1a16 #0c0907 #c29a40 #b84c30 #8c2420 #5a1814 #566249 #d8b892 #3a5170 #9a7a55 #644c70 #cdb48e |
| folio-clockwork-night | #1c1a17 #25221e #4a4338 #8d826f #ddd2bb #f2e8d2 #c9a04a #c45a3a #b33a2e #6b1f19 #8a9a6a #c4a383 #7d93a8 #9a7b55 #8d7699 #cdb592 | #211e1a #2c2823 #50483b #988d78 #e5dac4 #f8eeda #d8ae52 #d46440 #c4443a #78231d #96a874 #cdad8c #8aa1b8 #a5845c #9d84aa #d6bf9c |
| map-clockwork | #0b0b0b #1e1d1b #4a4741 #8a847a #cfc6b4 #f2ead8 #d6d48a #c47a36 #9a3028 #5c3e2c #56684a #2a3626 #4a6a86 #25344a #6a5a7a #a07a4a | #0f0f0e #232220 #524f48 #968f84 #d8cfbc #f8f0de #deda90 #cf8440 #a63429 #664634 #62764f #30402d #5476a0 #2c3d56 #78668a #b0864f |

## 3. German fairy tale (grimm) and sea-damp (lovecraft)

Few documented dyes apply: a village palette is made of materials as much as of pigments. Read these as materials.

| Material | Used for | Source | Hex | Where from / sureness |
|---|---|---|---|---|
| Birch bark (white) | Page tone, birch trunks | none | #E8E6DC | J; medium |
| Scots pine / spruce needle | Forest green | none | #44653F | J; medium |
| Blood red (iron oxide / madder-ish) | Rubric, cloak | red ochre / vermilion swatch | #962020 | Typical; medium-low |
| Red ochre | Folk paint, barn red | Making and Knowing | #A5472E | Typical; medium |
| Lampblack / charcoal | Ink, night wood | Cambridge | #1A1D1A | Typical; medium |
| Gold leaf (candle-lit) | Gilt | Cambridge | #B8953F | Typical; medium |
| Verdigris (for lovecraft) | Green rubric, copper roofs | Cambridge | #3E8F7A, darker #2F6A62 | Typical; medium |
| Woad blue (lovecraft and grimm lapis) | Dusk, water | Cambridge | #3F5A78 | Typical; medium-low |

| Key | Now | Proposed |
|---|---|---|
| folio-grimm | #e2e0d6 #d3d1c4 #929486 #5e6158 #1a1d1a #0a0c0a #ad8c3e #b0402e #8b1e1e #5a1414 #3e5a3a #d9b896 #3a4f6a #8a6d4c #5b4766 #c9b48e | #e8e6dc #d9d7ca #969a8a #60635a #1a1d1a #0a0c0a #b8953f #bc4a32 #962020 #641616 #44653f #e0bf9e #3f5a78 #947450 #644d72 #d1bd97 |
| folio-grimm-night | #141815 #1c221d #3c463d #7f8a7c #d8dcd0 #f0f2ea #b8964a #c0503a #c0392f #6e1c18 #6f9a62 #c4a383 #7a94b8 #9a7b55 #8d72a0 #cdb592 | #19201b #232b25 #46514a #8b9788 #e0e4d8 #f6f8f0 #c8a24f #cc5a42 #d0443a #7c201b #7fad70 #cdad8c #8aa3c4 #a5845c #9a7fae #d6bf9c |
| map-grimm | #0a0c0e #1a1f24 #475058 #8e98a0 #cfd6dc #f4f7f8 #e0a848 #c45a2a #a0282a #5e4630 #3f6a3c #1f3a26 #5a86b0 #2a3f5e #6e5a8a #9a8466 | #0e1013 #1e242a #505b64 #9aa5ad #d8dfe5 #f8fbfc #e8b250 #cc6230 #aa2c30 #66503a #46763f #24442c #6491bc #314869 #7c64a0 #a8926f |
| folio-lovecraft | #d5d8c6 #c6cab5 #8a917c #5f665a #1b2421 #0b1210 #a8923e #a8533a #2f5d57 #1e3d3a #4d6b4a #cdb08c #2e4f66 #8a7556 #5b4a6e #bfae8c | #dde0cf #cdd2bd #939a86 #5f665a #1b2421 #0b1210 #b59d3f #b55a3c #2f6a62 #24504b #52734f #d6b891 #33587a #917b5a #644f7a #c6b592 |
| folio-lovecraft-night | #0e1615 #16211f #2f4440 #6f8a80 #c8d6c8 #e8f0e0 #b59a4a #b8613f #5fa592 #2c5a50 #6f8f63 #b39a7c #5f88a6 #8a7556 #8a74a6 #bfae8c | #121b1a #1b2826 #36504a #7a968b #d2dfd0 #eef6e6 #c4a752 #c76a44 #6ab5a0 #336a5e #7a9c6e #bda285 #6a96b6 #9a825f #9780b2 #c6b592 |
| map-lovecraft | #080b0c #161d20 #3d4a4c #7d8a88 #c9d0c6 #eef2e8 #d8c070 #b8693a #9a3a32 #5a4634 #4a6e46 #24402c #3f7a8c #1d3a48 #6a5a8a #8a7a5a | #0c1011 #1b2427 #47585a #8a9896 #d3dad0 #f3f7ee #e0c878 #c4743f #a8403a #66503a #54794f #2b4a34 #4a8799 #23455a #7864a0 #96865f |

Contrast note: on the light keys the ink slots (4, 5) are unchanged and dim (3) moves only slightly, so text stays
readable on the paler page. After applying, check slot 3 on slot 0 (aim for at least 4.5:1).

## 4. Materials for later tasks (timber, thatch, turf, stone, slate)

General-knowledge reference colours (photographic and conservation), judgement, medium-low sureness.

| Material | Mid | Light / shadow | Notes |
|---|---|---|---|
| Oak, new | #A9824F | #C4A06B / #6E4F2C | Honey-tan. |
| Oak, aged / smoke-black | #5B4630 | #7A6046 / #2E2218 | Old beams; near-black brown. |
| Elm | #8B5E3B | #A97D55 / #5A3A22 | Redder brown, pale grain. |
| Weathered grey boards | #8A8579 | #A9A59A / #5E5A52 | Silver-grey, warm tint; green-grey damp near ground. |
| Pine, fresh | #D2A265 | #E4C28A / #A57A44 | Yellow-pale; orange with age (#B8803F). |
| Pine, dark / resinous / painted | #7A5A3A | #94734F / #4A3622 | Fairy-tale cottages. |
| Teak | #8F6B3A | #A98558 / #5C4224 | Golden-brown, oily; greys to silver outdoors (#9B958A). |
| Thatch, new straw | #C9A55C | #DEC07F / #8C6E34 | Golden. |
| Thatch, old | #6F634F | #877B65 / #3E3628 | Grey-brown; mossy at eaves (#5A6240). |
| Turf / sod | #5F7A3A | #7E9A52 / #364A22 | Meadow green; turf roof edge #4A5A30; bare soil #5A4430. |
| Limestone | #BDB59F | #D4CDB8 / #8A836E | Pale cream-grey. |
| Granite | #8C8E8C | #A9ABA8 / #5F615F | Cool grey; lichen spots #A9B08A. |
| Sandstone | #B08A64 | #C7A47E / #7C5C3E | Warm red-buff. |
| Slate | #4F5961 | #6A757D / #2F363C | Blue-grey; wet slate #3A434A; green slate (Lakeland) #5E6A5C. |
| Red brick (Victorian) | #9A4B35 | #B5654C / #6A3022 | Soot-darkened #5E3E34. |

## 5. Suggested rollout

1. Apply the proposed rows in `PALETTES` one theme at a time and look at each by day and by night.
2. If a theme looks too bright, step back halfway between Now and Proposed for that row only.
3. `PERSON` colours use slots 5, 6, 7, 8, 10, 12, 14: check they stay distinct from one another afterwards.
