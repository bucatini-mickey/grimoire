// A tiny static server for the tools folder, so a phone (or another laptop) on the same wifi can open
// tools/ascii-face.html. Read-only, GET only, the tools folder and nothing outside it; no dependencies.
//
// A phone's browser offers the camera only to https pages (or localhost), so for phones use --https:
//   node tools/serve.mjs --https          https://<this computer's address>:8443/ascii-face.html
//   node tools/serve.mjs                  http://localhost:8080/ascii-face.html (this computer only is enough)
//   options: --port 9000, --host 127.0.0.1 (default 0.0.0.0: every address of this computer, the wifi too)
//
// --https makes a self-signed certificate on first use with openssl (Git for Windows has it) and keeps it
// in tools/.cert/ (not committed). The phone warns that the certificate is not trusted: on Android Chrome
// tap Advanced, then Proceed; on iPhone Safari tap Show Details, then visit this website. Then allow the
// camera. Stop the server with Ctrl+C. Windows may ask whether Node may use private networks: yes for
// the phone to reach it.
import { createServer as http } from 'node:http';
import { createServer as https } from 'node:https';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const secure = process.argv.includes('--https');
const port = +arg('--port', secure ? 8443 : 8080);
const host = arg('--host', '0.0.0.0');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function certificate() {
	const certDir = join(dir, '.cert'), key = join(certDir, 'key.pem'), cert = join(certDir, 'cert.pem');
	if (!existsSync(key) || !existsSync(cert)) {
		mkdirSync(certDir, { recursive: true });
		const args = ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '825', '-keyout', key, '-out', cert, '-subj', '/CN=grimoire-tools'];
		// openssl on the PATH, else the one inside Git for Windows.
		const made = ['openssl', 'C:/Program Files/Git/usr/bin/openssl.exe', 'C:/Program Files/Git/mingw64/bin/openssl.exe'].some((exe) => {
			try { execFileSync(exe, args, { stdio: 'ignore' }); return existsSync(cert); } catch { return false; }
		});
		if (!made) {
			console.error('Could not run openssl to make a certificate. Install Git for Windows (it brings openssl) or put key.pem and cert.pem in tools/.cert/.');
			process.exit(1);
		}
	}
	return { key: readFileSync(key), cert: readFileSync(cert) };
}

function handle(req, res) {
	if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
	let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
	if (path === '/') path = '/ascii-face.html';
	const file = normalize(join(dir, path));
	if (!file.startsWith(dir + sep) || file.includes(sep + '.cert') || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end('not found'); return; }
	res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
	res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
}

const server = secure ? https(certificate(), handle) : http(handle);
server.listen(port, host, () => {
	const scheme = secure ? 'https' : 'http';
	console.log(`Serving ${dir}`);
	console.log(`  this computer: ${scheme}://localhost:${port}/ascii-face.html`);
	if (host === '0.0.0.0') for (const list of Object.values(networkInterfaces())) for (const a of list ?? []) {
		if (a.family === 'IPv4' && !a.internal) console.log(`  same wifi:     ${scheme}://${a.address}:${port}/ascii-face.html${secure ? '' : '   (no camera over plain http: use --https)'}`);
	}
	console.log('Ctrl+C to stop.');
});
