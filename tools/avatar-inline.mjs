// Copies src/avatar/asciiavatar.ts, compiled to plain JavaScript (the global `asciiAvatar`), into
// tools/ascii-face.html between its module markers, so the tool stays one self-contained file.
//   node tools/avatar-inline.mjs           refresh the copy (npm run avatar)
//   node tools/avatar-inline.mjs --check   exit 1 if the copy is stale (tests/asciiavatar.test.ts runs this)
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = join(root, 'tools', 'ascii-face.html');
export const BEGIN = '/* ==== ascii-avatar module: BEGIN. Compiled from src/avatar/asciiavatar.ts (read that for the documented interface); refresh with `npm run avatar`, do not edit here. ==== */';
export const END = '/* ==== ascii-avatar module: END ==== */';

/** The module as one script: an IIFE that sets the global `asciiAvatar`. */
export async function compiled() {
	const r = await esbuild.build({
		absWorkingDir: root,
		entryPoints: ['src/avatar/asciiavatar.ts'],
		bundle: true,
		format: 'iife',
		globalName: 'asciiAvatar',
		target: 'es2019',
		charset: 'utf8',
		legalComments: 'none',
		write: false,
		logLevel: 'warning'
	});
	return r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script').trimEnd();
}

const html = readFileSync(page, 'utf8').replace(/\r\n/g, '\n');
const a = html.indexOf(BEGIN), b = html.indexOf(END);
if (a < 0 || b < a) { console.error('tools/ascii-face.html: module markers not found'); process.exit(1); }
const fresh = html.slice(0, a) + BEGIN + '\n' + (await compiled()) + '\n' + html.slice(b);
if (process.argv.includes('--check')) {
	if (fresh !== html) { console.error('tools/ascii-face.html carries a stale copy of src/avatar/asciiavatar.ts: run npm run avatar'); process.exit(1); }
	console.log('tools/ascii-face.html: module copy is current');
} else if (fresh !== html) {
	writeFileSync(page, fresh);
	console.log('tools/ascii-face.html: module copy refreshed');
} else console.log('tools/ascii-face.html: module copy already current');
