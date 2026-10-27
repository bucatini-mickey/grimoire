/**
 * art-index.mjs - tells the art editor (tools/margin-editor.html) who the characters are: writes into
 * art/portraits.json each character's name and side ("about") and the scripts they are listed under
 * ("scripts"), keeping the portraits already drawn and their inks. Run it when characters or scripts
 * change; the editor's Portraits list and its script menu come from it.
 *
 *   node tools/art-index.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ALL_CHARACTERS, SCRIPTS } from '../src/core/index.ts';

const FILE = new URL('../art/portraits.json', import.meta.url);
const old = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { ink: {}, figures: {} };
const about = Object.fromEntries(ALL_CHARACTERS.map((c) => [c.id, `${c.name}|${c.team}`]));
// The scripts the app plays, then everyone else by kind.
const listed = new Set();
const scripts = [];
for (const s of Object.values(SCRIPTS)) {
	const ids = s.characters.map((c) => c.id);
	ids.forEach((id) => listed.add(id));
	scripts.push({ name: s.name, ids });
}
const travellers = ALL_CHARACTERS.filter((c) => c.team === 'traveller').map((c) => c.id);
travellers.forEach((id) => listed.add(id));
scripts.push({ name: 'Travellers', ids: travellers });
for (const [name, teams] of [['Experimental', ['townsfolk', 'outsider', 'minion', 'demon']], ['Fabled', ['fabled']], ['Loric', ['loric']]]) {
	const ids = ALL_CHARACTERS.filter((c) => teams.includes(c.team) && !listed.has(c.id)).map((c) => c.id);
	scripts.push({ name, ids });
}
const out = { ink: old.ink ?? {}, off: old.off ?? [], themes: old.themes ?? {}, about, scripts, figures: old.figures ?? {} };
const pretty = (d) => '{\n\t"ink": ' + JSON.stringify(d.ink).replace(/,/g, ', ') + ',\n\t"off": ' + JSON.stringify(d.off) + ',\n\t"themes": ' + JSON.stringify(d.themes) +
	',\n\t"about": ' + JSON.stringify(d.about).replace(/,"/g, ', "') + ',\n\t"scripts": [\n' + d.scripts.map((s) => '\t\t' + JSON.stringify(s)).join(',\n') + '\n\t],\n\t"figures": {\n' +
	Object.entries(d.figures).map(([k, v]) => `\t\t"${k}": [\n${v.map((r) => `\t\t\t"${r}"`).join(',\n')}\n\t\t]`).join(',\n') + '\n\t}\n}\n';
writeFileSync(FILE, pretty(out));
console.log(`${Object.keys(out.figures).length} portraits drawn; ${scripts.map((s) => `${s.name} ${s.ids.length}`).join(', ')}`);
