# Your own pictures

Draw in any pixel editor and save a **PNG** in this folder. The build reads every PNG here and uses it instead of the built-in picture of the same name. Your colours are kept exactly, and transparent pixels stay empty.

| File | What it becomes |
|---|---|
| `logo.png` | The logo: the head of the home page, the sky scenes on the cards, and the app icon on phones |
| `moon.png`, `sun.png`, `stars.png` | The night and day sky behind the logo on the cards |
| `<character>.png` | That character's picture on their cards and wake pages, e.g. `washerwoman.png`, `fortune-teller.png`, `scarlet-woman.png`, `imp.png`, `leviathan.png`, `cult-leader.png` |

Character file names are the character's name in lower case, with spaces as hyphens.

## Tips

- **Size:** small is best: 16 to 64 pixels tall. Pictures are drawn crisp at any size, so draw at 1 pixel = 1 pixel and let the app scale up.
- **Background:** keep it transparent, so the page shows round the picture. Empty rows and columns round the edges are trimmed for you.
- **Editors that work:**
  - [Piskel](https://www.piskelapp.com) (free, in the browser: *Export → PNG*)
  - Aseprite
  - Paint, GIMP or Photoshop (save as an ordinary 8-bit PNG, not interlaced)
- **Seeing it:** with the dev server running (`npm run dev`), saving a PNG here rebuilds the app straight away. Otherwise run `npm run build`.
- **Problems:** a picture that can't be read is skipped with a warning in the build output, and the built-in picture is used.

## Making a picture simpler

Detailed pictures can look busy as ASCII blocks. `tools/simplify.mjs` makes a smaller, plainer copy: each block of pixels becomes its commonest colour, and near-identical colours are merged.

```
node tools/simplify.mjs art/originals/logo-32.png art/logo.png 2 48
```

The `2` halves the size (3 makes it a third), and `48` is how close two colours must be to merge (higher means fewer colours). Keep the full-size drawings in `art/originals/`; the build only reads the PNGs directly in `art/`.
