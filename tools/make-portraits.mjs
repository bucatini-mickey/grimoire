/**
 * make-portraits.mjs - the starter portraits in art/portraits.json: a small bust for every character,
 * put together from parts (what is on the head, the face, the robe in the side's colours, the thing
 * held), sixteen pixels square in the same lettered inks as the margin figures. Redraw any of them in
 * tools/margin-editor.html ("Portraits"): a portrait already in the file is kept, never drawn over,
 * unless it is run with --all.
 *
 *   node tools/make-portraits.mjs [--all]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ALL_CHARACTERS } from '../src/core/index.ts';

const FILE = new URL('../art/portraits.json', import.meta.url);
const INK = {
	E: '#241c17', k: '#d8a47e', K: '#a8734f', j: '#9a6644', J: '#64402a', h: '#5a3a22', H: '#2a1c14', w: '#cfc8bc', o: '#c8a050',
	m: '#3a5a96', M: '#22345e', r: '#a8302a', R: '#6a1a16', g: '#4f7a3a', G: '#2e4a24', p: '#6a4a8a', P: '#3e2a56',
	b: '#7a5a3a', B: '#4e3824', a: '#f0ebe0', s: '#9a968e', S: '#5e5a54', Y: '#c8a040', y: '#8a6a28', c: '#6ac0c8', f: '#f0b040', n: '#d07a8a'
};

// What each is drawn with: head, held, robe (and its trim), and anything more.
const R = {
	// Trouble Brewing
	washerwoman: 'coif scroll m', librarian: 'hood book b', investigator: 'hat lens B', chef: 'toque dagger a', empath: 'long rose p',
	'fortune-teller': 'veil orb p', undertaker: 'hat shovel S', monk: 'hood candle b', ravenkeeper: 'hood raven H', virgin: 'veil flower a',
	slayer: 'hair sword g', soldier: 'helmet shield s', mayor: 'hair coin p chain beard', butler: 'hair bell H', drunk: 'messy bottle b flush',
	recluse: 'hood staff G', saint: 'halo cup a', poisoner: 'hood flask G', spy: 'hat dagger H mask', 'scarlet-woman': 'redlong rose r',
	baron: 'hat coin P beard', imp: 'horns trident R demon',
	// Bad Moon Rising
	grandmother: 'bonnet cup b grey', sailor: 'cap anchor m', chambermaid: 'coif candle a', exorcist: 'mitre cross a', innkeeper: 'hair cup b beard',
	gambler: 'hat dice g', gossip: 'long quill p', courtier: 'hat cup p', professor: 'bald book H beard', minstrel: 'hat lute g',
	'tea-lady': 'bonnet cup p grey', pacifist: 'hair flower a', fool: 'jester bell r', tinker: 'hat hammer b', moonchild: 'grey moon M',
	goon: 'bald staff S', lunatic: 'messy eye s', godfather: 'hat coin H', 'devils-advocate': 'grey scroll R', assassin: 'hood dagger H mask',
	mastermind: 'hood book P', zombuul: 'skull skull G', pukka: 'horns snake G demon', shabaloth: 'horns skull R demon', po: 'hood eye H demon',
	// Sects & Violets
	clockmaker: 'hair clock b lens', dreamer: 'long moon M', 'snake-charmer': 'turban snake g', mathematician: 'bald book m beard', flowergirl: 'bonnet flower p',
	'town-crier': 'hat bell r', oracle: 'veil eye p', savant: 'hair book m', seamstress: 'coif needle p', philosopher: 'bald scroll a beard',
	artist: 'beret quill g', juggler: 'jester orb r', sage: 'grey staff m beard', mutant: 'messy eye g', sweetheart: 'long heart r',
	barber: 'hair dagger a', klutz: 'messy cup b', 'evil-twin': 'hair dagger R mask', witch: 'witch flask P', cerenovus: 'hood eye P',
	'pit-hag': 'hood flask G grey', 'fang-gu': 'horns skull R demon', vigormortis: 'skull staff G', 'no-dashii': 'horns snake G demon', vortox: 'horns orb P demon',
	// Travellers
	thief: 'hood coin H mask', bureaucrat: 'hat scroll S', gunslinger: 'hat dagger b', scapegoat: 'messy flower s', beggar: 'messy cup B',
	apprentice: 'hair book g', matron: 'bonnet staff p', judge: 'grey scroll H', bishop: 'mitre cross p', voudon: 'hood skull P',
	barista: 'hair cup b', harlot: 'redlong rose r', butcher: 'bald dagger a', 'bone-collector': 'hood skull S', deviant: 'jester mask g'
};
// Anyone not above, by their side: a head, a thing held and a robe chosen by their name.
const BY_TEAM = {
	townsfolk: [['hair', 'hood', 'hat', 'coif', 'long', 'bonnet', 'beret'], ['book', 'candle', 'key', 'quill', 'rose', 'star', 'lens', 'scroll', 'bell'], ['m', 'g', 'b', 'p', 'a', 'M']],
	outsider: [['hood', 'messy', 'hair', 'bald'], ['staff', 'bottle', 'cup', 'flower'], ['b', 's', 'G', 'B']],
	minion: [['hood', 'hat', 'witch', 'long'], ['dagger', 'flask', 'coin', 'eye', 'snake'], ['r', 'P', 'H', 'G']],
	demon: [['horns', 'skull', 'hood'], ['skull', 'eye', 'orb', 'trident'], ['R', 'H', 'P', 'G']],
	traveller: [['hat', 'hair', 'hood'], ['staff', 'coin', 'scroll'], ['g', 'b', 'p']],
	fabled: [['halo', 'crown'], ['star', 'scroll', 'orb'], ['a', 'Y', 'm']],
	loric: [['crown', 'halo'], ['orb', 'star'], ['Y', 'a']]
};
const hash = (s) => [...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261) >>> 0;
const DARK = { m: 'M', g: 'G', b: 'B', p: 'P', r: 'R', a: 's', s: 'S', H: 'E', S: 'H', G: 'E', M: 'E', P: 'E', R: 'E', B: 'E', Y: 'y' };

function portrait(id, team) {
	const h = hash(id);
	const pick = (list, k) => list[(h >>> k) % list.length];
	const recipe = R[id] ?? (() => { const t = BY_TEAM[team] ?? BY_TEAM.townsfolk; return `${pick(t[0], 3)} ${pick(t[1], 7)} ${pick(t[2], 11)}${team === 'demon' ? ' demon' : ''}`; })();
	const [head, held, robe, ...more] = recipe.split(' ');
	const has = (k) => more.includes(k);
	const px = Array.from({ length: 16 }, () => Array(16).fill('.'));
	const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < 16 && y < 16) px[y][x] = c; };
	const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c); };
	// The skin: two tones by the name; a demon's red, the dead's bone.
	const [skin, shadow] = has('demon') ? ['r', 'R'] : (h >>> 5) % 3 === 0 ? ['j', 'J'] : ['k', 'K'];
	const hair = has('grey') ? 'w' : head === 'redlong' ? 'r' : ['h', 'H', 'o', 'h'][(h >>> 9) % 4];
	const dark = DARK[robe] ?? 'E';
	// The robe: shoulders widening to the foot, outlined, a fold down the middle.
	for (let y = 11; y < 16; y++) { const w = 8 + (y - 11) * 2, x0 = 8 - w / 2, x1 = 7 + w / 2; rect(x0, y, x1, y, robe); put(x0, y, 'E'); put(x1, y, 'E'); }
	rect(5, 11, 10, 11, 'E'); rect(6, 11, 9, 11, robe);
	for (let y = 12; y < 16; y++) put(7 + (y % 2), y, dark);
	if (has('chain')) { for (const [x, y] of [[5, 12], [6, 13], [7, 13], [8, 13], [9, 13], [10, 12]]) put(x, y, 'Y'); put(7, 14, 'Y'); put(8, 14, 'Y'); }
	// The neck and face; eyes, a nose's shadow, a mouth.
	rect(7, 10, 8, 10, shadow);
	rect(5, 4, 10, 9, skin); rect(6, 10, 9, 10, skin);
	for (let y = 4; y <= 9; y++) { put(4, y, 'E'); put(11, y, 'E'); }
	put(5, 10, 'E'); put(10, 10, 'E'); rect(6, 11, 9, 11, has('beard') ? hair : 'E');
	put(6, 6, 'E'); put(9, 6, 'E'); put(7, 7, shadow); put(7, 8, shadow); put(8, 8, shadow);
	if (has('flush')) { put(5, 7, 'n'); put(10, 7, 'n'); }
	if (has('mask')) { rect(5, 5, 10, 6, 'E'); put(6, 6, 'a'); put(9, 6, 'a'); }
	if (has('lens')) { put(9, 5, 'Y'); put(10, 6, 'Y'); put(9, 7, 'Y'); put(8, 6, 'Y'); put(9, 6, 'c'); }
	if (has('beard')) { rect(5, 8, 10, 10, hair); put(7, 8, 'E'); put(8, 8, 'E'); rect(6, 11, 9, 11, hair); }
	// The head.
	const hairTop = () => { rect(4, 2, 11, 3, hair); put(4, 4, hair); put(11, 4, hair); rect(5, 1, 10, 1, hair); };
	switch (head) {
		case 'hair': case 'grey': hairTop(); break;
		case 'messy': hairTop(); for (const x of [4, 6, 9, 11]) put(x, 0, hair); put(3, 3, hair); put(12, 3, hair); break;
		case 'long': case 'redlong': hairTop(); rect(3, 3, 4, 11, hair); rect(11, 3, 12, 11, hair); break;
		case 'bald': rect(5, 2, 10, 3, skin); for (const x of [5, 6, 7, 8, 9, 10]) put(x, 1, 'E'); put(4, 3, 'E'); put(11, 3, 'E'); put(4, 4, hair); put(11, 4, hair); break;
		case 'hood': { const c = robe === 'a' ? 's' : robe; for (let y = 0; y <= 11; y++) { const w = y < 2 ? 4 + y * 2 : 10; rect(8 - w / 2 - 1, y, 7 + w / 2 + 1, y, c); } rect(5, 3, 10, 9, skin); rect(5, 2, 10, 2, dark); put(6, 6, 'E'); put(9, 6, 'E'); put(7, 8, shadow); put(8, 8, shadow); if (has('mask')) { rect(5, 5, 10, 6, 'E'); put(6, 6, 'a'); put(9, 6, 'a'); } break; }
		case 'hat': rect(5, 0, 10, 2, 'E'); rect(6, 1, 9, 1, (h & 1) ? 'H' : 'B'); rect(2, 3, 13, 3, 'E'); rect(5, 2, 10, 2, 'r'); break;
		case 'beret': rect(4, 1, 11, 3, 'r'); put(3, 3, 'r'); put(8, 0, 'E'); hairTop(); rect(4, 1, 11, 2, 'r'); break;
		case 'cap': rect(5, 1, 10, 3, 'm'); rect(4, 3, 13, 3, 'M'); put(7, 0, 'a'); break;
		case 'crown': hairTop(); rect(5, 1, 10, 3, 'Y'); for (const x of [5, 7, 8, 10]) put(x, 0, 'Y'); put(6, 2, 'r'); put(9, 2, 'm'); break;
		case 'halo': hairTop(); rect(4, 0, 11, 0, 'Y'); put(3, 1, 'Y'); put(12, 1, 'Y'); break;
		case 'helmet': rect(4, 0, 11, 5, 's'); rect(5, 0, 10, 0, 'S'); rect(4, 5, 11, 5, 'S'); put(7, 1, 'S'); put(8, 1, 'S'); rect(3, 3, 3, 9, 's'); rect(12, 3, 12, 9, 's'); break;
		case 'veil': case 'coif': { const c = head === 'veil' ? (robe === 'a' ? 'a' : robe) : 'a'; rect(4, 1, 11, 3, c); rect(3, 3, 4, 12, c); rect(11, 3, 12, 12, c); if (head === 'veil') rect(5, 1, 10, 1, dark); break; }
		case 'bonnet': rect(3, 1, 12, 4, 'a'); rect(4, 0, 11, 0, 'a'); rect(3, 5, 3, 8, 'a'); rect(12, 5, 12, 8, 'a'); put(10, 9, 'r'); put(11, 10, 'r'); rect(5, 3, 10, 3, hair); break;
		case 'toque': rect(5, 0, 10, 2, 'a'); rect(4, 0, 4, 1, 'a'); rect(11, 0, 11, 1, 'a'); rect(5, 3, 10, 3, 's'); break;
		case 'mitre': rect(6, 0, 9, 3, 'a'); put(5, 2, 'a'); put(10, 2, 'a'); put(5, 3, 'a'); put(10, 3, 'a'); rect(7, 0, 8, 3, 'Y'); put(7, 1, 'a'); put(8, 1, 'a'); break;
		case 'jester': rect(4, 2, 11, 3, 'r'); rect(2, 0, 4, 2, 'r'); rect(11, 0, 13, 2, 'g'); put(1, 0, 'Y'); put(14, 0, 'Y'); rect(8, 2, 11, 3, 'g'); break;
		case 'turban': rect(4, 0, 11, 3, 'a'); rect(4, 2, 11, 2, 's'); put(7, 1, 'r'); put(8, 1, 'Y'); break;
		case 'witch': rect(7, 0, 8, 0, 'E'); rect(6, 1, 9, 2, 'E'); rect(2, 3, 13, 3, 'E'); put(9, 0, 'E'); rect(6, 2, 9, 2, 'p'); break;
		case 'horns': hairTop(); for (const [x, y] of [[3, 0], [3, 1], [4, 2], [12, 0], [12, 1], [11, 2]]) put(x, y, 'a'); put(4, 1, 's'); put(11, 1, 's'); break;
		case 'skull': rect(5, 1, 10, 9, 'a'); rect(4, 2, 11, 7, 'a'); rect(5, 5, 6, 6, 'E'); rect(9, 5, 10, 6, 'E'); put(7, 7, 'E'); put(8, 7, 'E'); for (const x of [6, 7, 8, 9]) put(x, 9, x % 2 ? 'E' : 'a'); rect(6, 10, 9, 10, 's'); break;
	}
	// What they hold, at the right.
	const H = {
		book: () => { rect(11, 11, 15, 14, 'b'); rect(11, 11, 15, 11, 'E'); rect(12, 12, 14, 12, 'a'); put(13, 13, 'Y'); },
		scroll: () => { rect(11, 10, 14, 14, 'a'); put(11, 10, 's'); put(14, 14, 's'); rect(12, 12, 13, 12, 'S'); },
		candle: () => { rect(13, 10, 14, 14, 'a'); put(13, 8, 'f'); put(13, 9, 'Y'); put(12, 15, 'Y'); put(15, 15, 'Y'); },
		key: () => { put(12, 8, 'Y'); put(14, 8, 'Y'); put(13, 7, 'Y'); put(13, 9, 'Y'); for (let y = 10; y <= 14; y++) put(13, y, 'Y'); put(14, 13, 'Y'); put(14, 14, 'Y'); },
		quill: () => { for (let k = 0; k < 6; k++) { put(10 + k, 13 - k * 2, 'a'); put(11 + k, 13 - k * 2, 's'); } put(10, 14, 'E'); },
		rose: () => { rect(12, 9, 14, 10, 'r'); put(13, 8, 'R'); for (let y = 11; y <= 14; y++) put(13, y, 'g'); put(14, 12, 'g'); },
		flower: () => { put(13, 8, 'Y'); put(12, 8, 'a'); put(14, 8, 'a'); put(13, 7, 'a'); put(13, 9, 'a'); for (let y = 10; y <= 14; y++) put(13, y, 'g'); put(12, 12, 'g'); },
		heart: () => { rect(11, 9, 15, 10, 'r'); rect(12, 11, 14, 11, 'r'); put(13, 12, 'r'); put(12, 8, 'r'); put(14, 8, 'r'); },
		star: () => { put(13, 7, 'Y'); rect(11, 9, 15, 9, 'Y'); rect(12, 8, 14, 10, 'Y'); put(12, 11, 'Y'); put(14, 11, 'Y'); },
		moon: () => { rect(12, 7, 14, 12, 'a'); rect(13, 8, 14, 11, '.'); put(11, 9, 'a'); put(11, 10, 'a'); },
		lens: () => { put(13, 8, 'Y'); put(12, 9, 'Y'); put(14, 9, 'Y'); put(13, 10, 'Y'); put(13, 9, 'c'); put(14, 11, 'b'); put(15, 12, 'b'); },
		bell: () => { rect(12, 9, 14, 12, 'Y'); rect(11, 12, 15, 12, 'Y'); put(13, 8, 'y'); put(13, 13, 'y'); },
		sword: () => { for (let y = 1; y <= 11; y++) put(13, y, 's'); put(13, 0, 'a'); rect(11, 11, 15, 11, 'Y'); put(13, 12, 'b'); put(13, 13, 'b'); put(13, 14, 'Y'); },
		dagger: () => { for (let y = 7; y <= 11; y++) put(13, y, 's'); put(13, 6, 'a'); rect(12, 12, 14, 12, 'Y'); put(13, 13, 'b'); },
		needle: () => { for (let y = 6; y <= 13; y++) put(13, y, 's'); put(13, 6, 'a'); put(14, 9, 'r'); put(15, 10, 'r'); put(14, 11, 'r'); },
		trident: () => { for (let y = 3; y <= 15; y++) put(13, y, 'B'); rect(11, 3, 15, 3, 's'); put(11, 1, 's'); put(11, 2, 's'); put(13, 1, 's'); put(13, 2, 's'); put(15, 1, 's'); put(15, 2, 's'); },
		staff: () => { for (let y = 2; y <= 15; y++) put(14, y, 'b'); rect(13, 1, 15, 2, 'Y'); },
		shovel: () => { for (let y = 2; y <= 11; y++) put(14, y, 'b'); rect(13, 12, 15, 15, 's'); rect(13, 1, 15, 1, 'b'); },
		hammer: () => { for (let y = 9; y <= 15; y++) put(13, y, 'b'); rect(11, 7, 15, 8, 's'); },
		cup: () => { rect(11, 9, 15, 11, 'Y'); rect(12, 12, 14, 12, 'Y'); put(13, 13, 'y'); rect(12, 14, 14, 14, 'Y'); rect(12, 9, 14, 9, 'R'); },
		bottle: () => { rect(12, 10, 14, 15, 'G'); put(13, 9, 'G'); put(13, 8, 'b'); put(12, 12, 'g'); },
		flask: () => { rect(11, 11, 15, 14, 'g'); rect(12, 10, 14, 10, 'g'); put(13, 9, 'a'); put(13, 8, 'b'); put(12, 12, 'c'); put(11, 14, 'G'); put(15, 14, 'G'); },
		coin: () => { rect(12, 10, 14, 12, 'Y'); put(11, 11, 'Y'); put(15, 11, 'Y'); put(13, 11, 'y'); rect(11, 14, 15, 14, 'Y'); },
		orb: () => { rect(11, 9, 15, 13, 'c'); rect(12, 8, 14, 14, 'c'); put(12, 10, 'a'); rect(11, 15, 15, 15, 'Y'); },
		eye: () => { rect(11, 9, 15, 11, 'a'); put(10, 10, 'a'); put(13, 10, 'c'); put(13, 9, 'E'); put(13, 11, 'E'); rect(11, 8, 15, 8, 'E'); rect(11, 12, 15, 12, 'E'); },
		skull: () => { rect(11, 10, 15, 13, 'a'); rect(12, 14, 14, 14, 'a'); put(12, 11, 'E'); put(14, 11, 'E'); put(13, 13, 'E'); },
		raven: () => { rect(11, 9, 14, 11, 'H'); put(15, 9, 's'); put(12, 8, 'H'); put(11, 12, 'H'); put(10, 12, 'H'); put(13, 9, 'Y'); put(12, 12, 's'); put(14, 12, 's'); },
		snake: () => { for (const [x, y] of [[11, 14], [12, 13], [13, 12], [14, 11], [13, 10], [12, 9], [13, 8], [14, 7], [15, 7]]) put(x, y, 'g'); put(15, 6, 'r'); },
		shield: () => { rect(10, 9, 15, 13, 'm'); rect(11, 14, 14, 14, 'm'); put(12, 15, 'm'); put(13, 15, 'm'); for (let y = 9; y <= 14; y++) put(12 + (y > 13 ? 0 : 0), y, 'Y'); rect(10, 11, 15, 11, 'Y'); },
		cross: () => { for (let y = 7; y <= 14; y++) put(13, y, 'Y'); rect(11, 9, 15, 9, 'Y'); },
		anchor: () => { for (let y = 7; y <= 13; y++) put(13, y, 's'); rect(11, 8, 15, 8, 's'); put(11, 12, 's'); put(15, 12, 's'); rect(11, 13, 15, 13, 's'); put(13, 6, 's'); },
		dice: () => { rect(11, 10, 15, 14, 'a'); put(12, 11, 'E'); put(14, 13, 'E'); put(13, 12, 'E'); },
		lute: () => { rect(11, 11, 14, 14, 'b'); for (let k = 0; k < 4; k++) put(14 + (k > 1 ? 1 : 0), 10 - k, 'B'); put(12, 12, 'E'); },
		clock: () => { rect(11, 9, 15, 13, 'Y'); rect(12, 10, 14, 12, 'a'); put(13, 11, 'E'); put(13, 10, 'E'); put(13, 8, 'Y'); },
		mask: () => { rect(11, 9, 15, 11, 'a'); put(12, 10, 'E'); put(14, 10, 'E'); put(13, 12, 'a'); }
	};
	(H[held] ?? H.book)();
	return px.map((r) => r.join(''));
}

const old = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { ink: {}, figures: {} };
const all = process.argv.includes('--all');
const figures = { ...old.figures };
let made = 0;
for (const c of ALL_CHARACTERS) if (all || !figures[c.id]) { figures[c.id] = portrait(c.id, c.team); made++; }
// (who each is, for the editor's list: name, side, edition)
const about = Object.fromEntries(ALL_CHARACTERS.map((c) => [c.id, `${c.name}|${c.team}|${c.edition}`]));
const out = { ink: { ...INK, ...old.ink }, off: old.off ?? [], themes: old.themes ?? {}, about, figures };
const pretty = (d) => '{\n\t"ink": ' + JSON.stringify(d.ink).replace(/,/g, ', ') + ',\n\t"off": ' + JSON.stringify(d.off) + ',\n\t"themes": ' + JSON.stringify(d.themes) + ',\n\t"about": ' + JSON.stringify(d.about).replace(/,"/g, ', "') + ',\n\t"figures": {\n' +
	Object.entries(d.figures).map(([k, v]) => `\t\t"${k}": [\n${v.map((r) => `\t\t\t"${r}"`).join(',\n')}\n\t\t]`).join(',\n') + '\n\t}\n}\n';
writeFileSync(FILE, pretty(out));
console.log(`${made} portraits drawn, ${Object.keys(figures).length} in art/portraits.json`);
