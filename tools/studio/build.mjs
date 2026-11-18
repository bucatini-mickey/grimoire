/**
 * build.mjs - makes the Grimoire Icons page (tools/studio/studio.html) ready to publish, and seed data for
 * its store.
 *
 *   node tools/studio/build.mjs [seed-dir]
 *
 * Writes tools/studio/out/grimoire-icons.html: the template with INDEX filled in from art/portraits.json
 * (who the characters are and the scripts they're on; refresh that first with `node tools/art-index.mjs`).
 * With a seed-dir, also writes one JSON file per picture there (portraits/<id>.json, margins/<name>.json),
 * each the document the page keeps: {rows, ink (only the letters it uses), updated} plus {on, books} for
 * margin figures. Those are what gets written into the page's store the first time.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const art = (f) => JSON.parse(readFileSync(new URL(`../../art/${f}`, import.meta.url), 'utf8'));
const portraits = art('portraits.json'), margins = art('margins.json');

const INDEX = { about: portraits.about, scripts: portraits.scripts };
const tpl = readFileSync(new URL('./studio.html', import.meta.url), 'utf8');
if (!tpl.includes('/*INDEX*/null')) throw new Error('studio.html has lost its /*INDEX*/null marker');
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(new URL('./out/grimoire-icons.html', import.meta.url), tpl.replace('/*INDEX*/null', JSON.stringify(INDEX)));
console.log(`out/grimoire-icons.html: ${Object.keys(INDEX.about).length} characters on ${INDEX.scripts.length} lists`);

const seedDir = process.argv[2];
if (seedDir) {
	const docOf = (data, rows) => {
		const used = new Set(rows.join(''));
		return { rows, ink: Object.fromEntries(Object.entries(data.ink).filter(([k]) => used.has(k))), updated: Date.now() };
	};
	let n = 0;
	for (const [kind, data] of [['portraits', portraits], ['margins', margins]]) {
		mkdirSync(join(seedDir, kind), { recursive: true });
		for (const [id, rows] of Object.entries(data.figures)) {
			const doc = docOf(data, rows);
			if (kind === 'margins') { doc.on = !(data.off ?? []).includes(id); doc.books = data.themes?.[id] ?? []; }
			writeFileSync(join(seedDir, kind, `${id}.json`), JSON.stringify(doc));
			n++;
		}
	}
	console.log(`${n} seed documents in ${seedDir}`);
}
