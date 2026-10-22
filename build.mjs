// Bundles the grimoire into ONE self-contained HTML file: dist/grimoire.html
// (and dist/index.html). It runs from file://, a phone's Downloads folder, or
// any static host. Beside it go the pieces that make it an installable app
// when served over https: a manifest, icons drawn from the pixel clocktower,
// and a service worker that keeps it working offline.
//   node build.mjs          build once
//   node build.mjs --serve  rebuild on change and serve on http://localhost:5317
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(dirname(fileURLToPath(import.meta.url)));

const serve = process.argv.includes('--serve');
mkdirSync('dist', { recursive: true });

const inline = {
	name: 'inline-html',
	setup(build) {
		build.onEnd((result) => {
			if (result.errors.length) return;
			const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text;
			const html = readFileSync('src/ui/index.html', 'utf8')
				.replace('/*JS*/', () => js.replace(/<\/script/gi, '<\/script'));
			writeFileSync('dist/grimoire.html', html);
			writeFileSync('dist/index.html', html);
			writeAppFiles();
			console.log(`built dist/grimoire.html (${(html.length / 1024).toFixed(0)} KB)`);
		});
	}
};

// ---- the installable app ------------------------------------------------------------

/** A PNG from RGBA bytes: just enough of the format for an icon. */
function png(w, h, rgba) {
	const crcTable = Array.from({ length: 256 }, (_, n) => {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		return c >>> 0;
	});
	const crc = (buf) => {
		let c = 0xffffffff;
		for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	};
	const chunk = (type, data) => {
		const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
		const td = Buffer.concat([Buffer.from(type), data]);
		const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
		return Buffer.concat([len, td, c]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
	const raw = Buffer.alloc((w * 4 + 1) * h);
	for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
	return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** The icon: a rubric G, an illuminated capital, on dark vellum in a gold square. */
const G = ['.####', '#....', '#.###', '#...#', '.###.'];
function icon(size) {
	const bg = [0x16, 0x11, 0x0c, 255], gold = [0xd4, 0xa7, 0x3a, 255], ink = [0xc8, 0x41, 0x2f, 255], leaf = [0x22, 0x1a, 0x12, 255];
	const rgba = Buffer.alloc(size * size * 4);
	for (let i = 0; i < size * size; i++) rgba.set(bg, i * 4);
	const sq = Math.floor(size * 0.72), x0 = Math.floor((size - sq) / 2);
	const k = Math.floor(sq / 7);
	const put = (x, y, c) => rgba.set(c, (y * size + x) * 4);
	for (let y = 0; y < sq; y++) for (let x = 0; x < sq; x++) put(x0 + x, x0 + y, x < 4 || y < 4 || x >= sq - 4 || y >= sq - 4 ? gold : leaf);
	const gx = x0 + Math.floor((sq - 5 * k) / 2), gy = x0 + Math.floor((sq - 5 * k) / 2);
	G.forEach((line, y) => [...line].forEach((ch, x) => {
		if (ch !== '#') return;
		for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) put(gx + x * k + dx, gy + y * k + dy, ink);
	}));
	return png(size, size, rgba);
}

function writeAppFiles() {
	writeFileSync('dist/icon-192.png', icon(192));
	writeFileSync('dist/icon-512.png', icon(512));
	writeFileSync('dist/manifest.webmanifest', JSON.stringify({
		name: 'Grimoire',
		short_name: 'Grimoire',
		description: 'A Storyteller companion for Blood on the Clocktower',
		start_url: './',
		scope: './',
		display: 'standalone',
		orientation: 'portrait',
		background_color: '#16110c',
		theme_color: '#16110c',
		icons: [
			{ src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
			{ src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
		]
	}, null, 2));
	// The offline cache: the page itself first from the network (so new versions
	// arrive), falling back to the cached copy; fonts kept once fetched.
	writeFileSync('dist/sw.js', `const CACHE = 'grimoire-${Date.now()}';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
	e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
	self.clients.claim();
});
self.addEventListener('fetch', (e) => {
	const req = e.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
		e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
		return;
	}
	if (url.origin !== location.origin) return;
	e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))));
});
`);
}

const options = {
	absWorkingDir: process.cwd(),
	entryPoints: ['src/ui/main.ts'],
	bundle: true,
	format: 'iife',
	target: 'es2020',
	minify: !serve,
	write: false,
	outdir: 'dist/.js',
	loader: { '.tbp': 'text' },
	plugins: [inline],
	logLevel: 'warning'
};

if (serve) {
	const ctx = await esbuild.context(options);
	await ctx.watch();
	const { port } = await ctx.serve({ servedir: 'dist', port: 5317 });
	console.log(`serving http://localhost:${port}`);
} else {
	await esbuild.build(options);
}
