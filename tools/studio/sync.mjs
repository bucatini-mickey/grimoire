/**
 * sync.mjs - brings the drawings from the Grimoire Icons page into art/portraits.json and art/margins.json.
 *
 *   node tools/studio/sync.mjs <dir> [--dry]
 *
 * <dir> holds the page's store as JSON files, <dir>/portraits/<id>.json and <dir>/margins/<name>.json (what
 * Claude's ArtifactData "list" saves with out_dir). The store is the authority: every picture in it is
 * written into the art file, and a picture the art file has but the store doesn't is removed (it was cleared
 * or deleted on the page). Each picture's colours are matched to the file's ink letters, with new letters
 * for new colours. Margin figures also set "off" (not on the pages) and "themes" (their books).
 * Afterwards run `node tools/draw-margins.mjs` for the margin pictures, then build.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [dir, flag] = process.argv.slice(2);
if (!dir) { console.error('usage: node tools/studio/sync.mjs <dir> [--dry]'); process.exit(1); }
const dry = flag === '--dry';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function readStore(kind) {
	const d = join(dir, kind);
	if (!existsSync(d)) return null;
	const out = {};
	for (const f of readdirSync(d).filter((f) => f.endsWith('.json'))) {
		let o = JSON.parse(readFileSync(join(d, f), 'utf8'));
		if (!o.rows && o.data?.rows) o = o.data;
		out[f.slice(0, -5)] = o;
	}
	return out;
}

function sync(kind, file) {
	const store = readStore(kind);
	if (!store) return console.log(`${kind}: nothing in ${dir}, left alone`);
	const url = new URL(`../../art/${file}`, import.meta.url);
	const data = JSON.parse(readFileSync(url, 'utf8'));
	const byHex = new Map(Object.entries(data.ink).map(([k, v]) => [v.toLowerCase(), k]));
	const letterFor = (hex) => {
		hex = hex.toLowerCase();
		if (byHex.has(hex)) return byHex.get(hex);
		const free = [...LETTERS].find((L) => !(L in data.ink));
		if (!free) throw new Error(`${file}: out of ink letters`);
		data.ink[free] = hex; byHex.set(hex, free); return free;
	};
	const before = data.figures, figures = {}, said = [];
	// the file's own order first (the app may lean on it), new pictures after
	const order = [...Object.keys(before).filter((id) => store[id]), ...Object.keys(store).filter((id) => !before[id]).sort()];
	for (const id of order) {
		const d = store[id];
		const rows = d.rows.map((r) => [...r].map((ch) => (ch === '.' || !d.ink[ch] ? '.' : letterFor(d.ink[ch]))).join(''));
		figures[id] = rows;
		if (!before[id]) said.push(`+ ${id}`);
		else if (JSON.stringify(before[id]) !== JSON.stringify(rows)) said.push(`~ ${id}`);
	}
	for (const id of Object.keys(before)) if (!figures[id]) said.push(`- ${id}`);
	data.figures = figures;
	if (kind === 'margins') {
		data.off = order.filter((id) => !store[id].on);
		data.themes = Object.fromEntries(order.map((id) => [id, store[id].books ?? []]));
	}
	console.log(`${file}: ${Object.keys(figures).length} pictures${said.length ? '; ' + said.join(', ') : ', no changes'}`);
	if (!dry) writeFileSync(url, pretty(data));
}

/** The art files' layout: one key a line, each figure's rows one a line (as the editors write them). */
function pretty(d) {
	const parts = Object.entries(d).map(([k, v]) => {
		if (k === 'figures') return '\t"figures": {\n' + Object.entries(v).map(([n, rows]) => `\t\t${JSON.stringify(n)}: [\n${rows.map((r) => `\t\t\t${JSON.stringify(r)}`).join(',\n')}\n\t\t]`).join(',\n') + '\n\t}';
		if (k === 'scripts') return '\t"scripts": [\n' + v.map((s) => '\t\t' + JSON.stringify(s)).join(',\n') + '\n\t]';
		return `\t${JSON.stringify(k)}: ` + JSON.stringify(v).replace(/,"/g, ', "');
	});
	return '{\n' + parts.join(',\n') + '\n}\n';
}

sync('portraits', 'portraits.json');
sync('margins', 'margins.json');
if (dry) console.log('(dry run: nothing written)');
