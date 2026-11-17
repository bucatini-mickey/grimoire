// Pull the most-favourited scripts from botcscripts.com: listing pages, then each script's JSON.
import { writeFileSync, mkdirSync } from 'node:fs';
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const UA = { 'User-Agent': 'Mozilla/5.0 (script list fetch)' };
const rows = [];
for (let page = 1; page <= 8 && rows.length < 160; page++) {
	const html = await (await fetch(`https://www.botcscripts.com/?sort=num_favs&page=${page}`, { headers: UA })).text();
	const trs = html.split('<tr').slice(1);
	for (const tr of trs) {
		const m = tr.match(/<a href="\/script\/(\d+)\/([^"]+)">([^<]+)<\/a>/);
		if (!m) continue;
		const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1].replace(/<[^>]+>/g, '').trim());
		rows.push({ id: +m[1], ver: m[2], title: m[3].replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"'), author: tds[1], type: tds[2], likes: parseInt(tds[3]) || 0, favs: parseInt(tds[4]) || 0, tags: tds[5] });
	}
	console.error('page', page, rows.length);
}
for (const r of rows) {
	try {
		const j = await (await fetch(`https://www.botcscripts.com/script/${r.id}/${r.ver}/download`, { headers: UA })).json();
		r.content = j;
	} catch (e) { r.error = String(e); }
}
writeFileSync(`${out}/top.json`, JSON.stringify(rows, null, 1));
console.error('done', rows.length);
