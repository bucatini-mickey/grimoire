// sync-figures.mjs - makes src/town/figures.ts from art/figure-picks.json, the figures and faces picked
// in tools/figure-picker.html. Run it after changing the picks:
//   node tools/sync-figures.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const { figure, face } = JSON.parse(readFileSync('art/figure-picks.json', 'utf8'));
if (figure.length > 30 || face.length > 30) throw new Error('30 of each at most');
writeFileSync('src/town/figures.ts', `/** Made by tools/sync-figures.mjs from art/figure-picks.json: edit that and run it again. */
/** Who walks round the village: one glyph each. */
export const FIGURES: string[] = ${JSON.stringify(figure.join(' '))}.split(' ');
/** Who sits at the voting table: one glyph each. */
export const FACES: string[] = ${JSON.stringify(face.join(' '))}.split(' ');
`);
console.log(`${figure.length} figures, ${face.length} faces`);
