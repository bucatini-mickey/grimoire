// sync-figures.mjs - makes src/town/figures.ts from art/figure-picks.json, the figures and faces picked
// in tools/figure-picker.html. Run it after changing the picks:
//   node tools/sync-figures.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const { figure, face } = JSON.parse(readFileSync('art/figure-picks.json', 'utf8'));
// (the plainest letters first: everyone who has not chosen gets one of these)
const plain = (c) => /^[a-z]$/.test(c);
const ordered = [...figure.filter(plain), ...figure.filter((c) => !plain(c))];
writeFileSync('src/town/figures.ts', `/** Made by tools/sync-figures.mjs from art/figure-picks.json: edit that and run it again. */
/** Who walks round the village: one glyph each. */
export const FIGURES: string[] = ${JSON.stringify(ordered.join(' '))}.split(' ');
/** Who sits at the voting table: one glyph each. */
export const FACES: string[] = ${JSON.stringify(face.join(' '))}.split(' ');
`);
console.log(`${ordered.length} figures, ${face.length} faces`);
