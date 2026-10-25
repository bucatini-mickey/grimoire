# Your own pictures

Draw in any pixel editor and save a **PNG** in this folder. Since the move to the ASCII terminal only `logo.png` is read (see "The logo" below); the other pictures in the table are not drawn yet.

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

## The logo

`art/logo.png` is the logo at the head of the home page. Any size works (16 x 16 is the size it was drawn at; up to about 20 pixels wide fits a phone); transparent pixels stay empty. Each colour becomes a coloured cell with a glyph of its own (dark colours get #, light ones lighter marks). On a phone it is drawn at half height, two pixels to a cell. The build reads it once: after editing, run `npm run build`, or restart `npm run dev`.

## The figures in the margins

`margin-<name>.png` are the little figures at the foot of the book's pages: hares after the marginalia of the old books, and whatever else you draw (an imp is there to start demons from). They are kept as letter grids in `margins.json` (one letter an ink); `off` lists the figures kept to work on but not shown in the app yet.

**To edit them,** open `tools/margin-editor.html` in Chrome or Edge (double-click it), press **Open art folder** and pick this folder. Paint, tick **On the pages** for the ones to show, then **Save** (or Ctrl+S): it writes `margins.json` and the pictures. Restart `npm run dev` to see them in the app. The editor shows each figure on the page by day and by candlelight, in the colours the app will really draw it in. In other browsers, use **Load margins.json** and the download buttons, and put the files here yourself.

From the command line, `node tools/draw-margins.mjs` writes the pictures from `margins.json`.
