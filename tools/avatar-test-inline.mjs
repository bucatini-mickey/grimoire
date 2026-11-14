// Compiles src/avatar/testpage.ts (with rig.ts, trackers.ts and asciiavatar.ts) into tools/avatar-test.html
// between its markers, so the test page stays one self-contained file to copy to a laptop.
//   node tools/avatar-test-inline.mjs           refresh the copy (npm run avatar-test)
//   node tools/avatar-test-inline.mjs --check   exit 1 if the copy is stale (tests/avatar.rig.test.ts runs this)
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = join(root, 'tools', 'avatar-test.html');
const BEGIN = '/* ==== avatar-test: BEGIN. Compiled from src/avatar/testpage.ts; refresh with `npm run avatar-test`, do not edit here. ==== */';
const END = '/* ==== avatar-test: END ==== */';

const r = await esbuild.build({
	absWorkingDir: root,
	entryPoints: ['src/avatar/testpage.ts'],
	bundle: true,
	format: 'iife',
	target: 'es2020',
	charset: 'utf8',
	legalComments: 'none',
	write: false,
	logLevel: 'warning'
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script').trimEnd();
const html = readFileSync(page, 'utf8').replace(/\r\n/g, '\n');
const a = html.indexOf(BEGIN), b = html.indexOf(END);
if (a < 0 || b < a) { console.error('tools/avatar-test.html: markers not found'); process.exit(1); }
const fresh = html.slice(0, a) + BEGIN + '\n' + js + '\n' + html.slice(b);
if (process.argv.includes('--check')) {
	if (fresh !== html) { console.error('tools/avatar-test.html is stale: run npm run avatar-test'); process.exit(1); }
	console.log('tools/avatar-test.html: current');
} else if (fresh !== html) {
	writeFileSync(page, fresh);
	console.log(`tools/avatar-test.html: refreshed (${(fresh.length / 1024).toFixed(0)} KB)`);
} else console.log('tools/avatar-test.html: already current');
