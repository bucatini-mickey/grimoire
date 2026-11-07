import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Grid } from '../src/term/pterm.ts';
import type { Rect } from '../src/term/pterm.ts';
import { camLayout, CORNERS, drawCamWindow, nextCorner, pickTiles, standIn, tileSize, uncovered, VIDEO_BG, VIDEO_CH } from '../src/town/camwin.ts';
import type { CamWindowDraw, TileView } from '../src/town/camwin.ts';
import { cellOf, crop, FACE_W, testFace, toFrame } from '../src/town/faces.ts';

const inside = (a: Rect, b: Rect) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('the window sits in its corner of the map, its tiles inside it and apart', () => {
	const map = { x: 0, y: 1, w: 44, h: 24 };
	for (const corner of CORNERS) for (let n = 1; n <= 7; n++) {
		const L = camLayout(map, n, corner)!;
		assert.ok(inside(L.rect, map), `${corner} ${n}`);
		assert.equal(L.tiles.length, Math.min(n, L.cap));
		L.tiles.forEach((t, i) => {
			// Each tile and the name row under it inside the frame.
			assert.ok(inside({ ...t, h: t.h + 1 }, { x: L.rect.x + 1, y: L.rect.y + 1, w: L.rect.w - 2, h: L.rect.h - 2 }));
			for (const u of L.tiles.slice(i + 1)) assert.ok(!overlap({ ...t, h: t.h + 1 }, { ...u, h: u.h + 1 }));
		});
		if (corner[1] === 'r') assert.equal(L.rect.x + L.rect.w, map.x + map.w);
		else assert.equal(L.rect.x, map.x);
		if (corner[0] === 'b') assert.equal(L.rect.y + L.rect.h, map.y + map.h);
		else assert.equal(L.rect.y, map.y);
	}
	// A phone: tiles of 12 x 6 (square on the screen), two across, two down at most.
	assert.deepEqual(tileSize(44), { tw: 12, th: 6 });
	assert.equal(camLayout(map, 9, 'tr')!.cap, 4);
	// A wide screen: bigger tiles, three across.
	const wide = camLayout({ x: 0, y: 0, w: 120, h: 40 }, 9, 'tr')!;
	assert.equal(wide.tiles[0].w, 16);
	assert.equal(wide.cap, 6);
});

test('the window keeps small on a short map, folds to its title, and gives up when nothing fits', () => {
	const short = camLayout({ x: 0, y: 0, w: 44, h: 12 }, 4, 'tr')!;
	assert.ok(short.rect.h <= 12);
	assert.equal(short.cap, 2, 'one row of tiles on a short map');
	const tight = camLayout({ x: 0, y: 0, w: 44, h: 8 }, 1, 'tr')!;
	assert.ok(tight.tiles[0].w < 12 && tight.rect.h <= 8, 'smaller tiles on a very short map');
	const folded = camLayout({ x: 0, y: 0, w: 44, h: 24 }, 3, 'br', true)!;
	assert.equal(folded.rect.h, 1);
	assert.equal(folded.rect.y, 23);
	assert.equal(folded.tiles.length, 0);
	assert.equal(camLayout({ x: 0, y: 0, w: 44, h: 5 }, 1, 'tr'), null);
	assert.equal(camLayout({ x: 0, y: 0, w: 8, h: 20 }, 1, 'tr'), null);
	assert.equal(nextCorner('tl'), 'tr');
	assert.deepEqual(CORNERS.map(nextCorner), ['br', 'bl', 'tl', 'tr']);
});

test('who shows: you first, then those you can hear, loudest first and steady, the rest counted', () => {
	const others = [
		{ id: 'far', name: 'Far', loud: 0 },
		{ id: 'b', name: 'Bea', loud: 0.5 },
		{ id: 'a', name: 'Ada', loud: 0.52 },
		{ id: 'c', name: 'Cob', loud: 1 },
		{ id: 'd', name: 'Dot', loud: 0.1 },
		{ id: 'me', name: 'Me', loud: 1 }
	];
	assert.deepEqual(pickTiles('me', others, 4), { ids: ['me', 'c', 'a', 'b'], more: 1 });
	assert.deepEqual(pickTiles('me', others, 9), { ids: ['me', 'c', 'a', 'b', 'd'], more: 0 });
	// A small change of loudness while people shuffle does not reorder them.
	const shuffled = others.map((q) => (q.id === 'a' ? { ...q, loud: 0.45 } : q.id === 'b' ? { ...q, loud: 0.55 } : q));
	assert.deepEqual(pickTiles('me', shuffled, 4).ids, ['me', 'c', 'a', 'b']);
	assert.deepEqual(pickTiles('me', others, 1), { ids: ['me'], more: 4 });
	assert.deepEqual(pickTiles('me', [{ id: 'far', name: 'Far', loud: 0 }], 4), { ids: ['me'], more: 0 }, 'alone, or at night: only you');
});

test('a stand-in face is made here: the right size, steady, blinking and talking', () => {
	const a = standIn(3, 1000, false, 12, 12);
	assert.equal(a.length, 144);
	assert.ok(a.every((v) => v >= 0 && v <= 255));
	assert.deepEqual(standIn(3, 1000, false, 12, 12), a);
	// The mouth opens and shuts while talking (every 180 ms), and not otherwise.
	const shut = standIn(3, 180 * 2, true, 24, 24), open = standIn(3, 180 * 3, true, 24, 24);
	assert.deepEqual(shut, standIn(3, 180 * 2, false, 24, 24));
	assert.notDeepEqual(open, standIn(3, 180 * 3, false, 24, 24));
	// Eyes: dark while open, gone during a blink (the first 6% of each 3.7 s, offset per person).
	const eyesAt = (ms: number) => standIn(0, ms, false, 24, 24).filter((v) => v === 15).length;
	assert.ok(eyesAt(1000) > 0);
	assert.equal(eyesAt(100), 0);
	// Its letters are a face's: brighter in the middle than at the corner.
	const f = toFrame(standIn(1, 1000, false, 12, 12), 12, 12);
	assert.ok(cellOf(f, 6, 3, 12).level > cellOf(f, 0, 5, 12).level);
});

test('letters at any tile size read a frame as the face strip did', () => {
	const f = testFace(0, 1000, false);
	for (let y = 0; y < 6; y++) for (let x = 0; x < FACE_W; x++) assert.deepEqual(cellOf(f, x, y, FACE_W), cellOf(f, x, y));
});

test('a camera picture is cropped to the tile round the face; a square crop as before', () => {
	const sq = crop(320, 240, 1);
	assert.equal(sq.sw, 240 * 0.8);
	assert.equal(sq.sh, 240 * 0.8);
	assert.equal(sq.sx, (320 - 192) / 2);
	assert.equal(sq.sy, Math.max(0, (240 - 192) / 2 - 192 * 0.06));
	for (const aspect of [0.5, 1, 4 / 3, 2, 3]) {
		const c = crop(640, 480, aspect);
		assert.ok(Math.abs(c.sw / c.sh - aspect) < 1e-9);
		assert.ok(c.sx >= 0 && c.sy >= 0 && c.sx + c.sw <= 640 && c.sy + c.sh <= 480, String(aspect));
	}
});

function window(tiles: TileView[], folded = false) {
	const g = new Grid();
	g.resize(44, 26);
	const map = { x: 0, y: 1, w: 44, h: 24 };
	let walked = '';
	g.hit(map, () => (walked = 'walk'));
	const L = camLayout(map, tiles.length, 'tr', folded)!;
	const said: string[] = [];
	const d: CamWindowDraw = {
		title: 'Near you', tiles, more: 2, folded,
		onMove: () => said.push('move'), onFold: () => said.push('fold'), onClose: () => said.push('close'), onTile: (id) => said.push('tile ' + id)
	};
	drawCamWindow(g, L, d);
	return { g, L, said, walked: () => walked };
}

const base = { ink: [5, 0] as [number, number], talking: false };
const TILES: TileView[] = [
	{ ...base, id: 'me', label: 'You', glyph: '', kind: 'blank', note: 'camera off' },
	{ ...base, id: 'a', label: 'Agnes', glyph: 'A', kind: 'video' },
	{ ...base, id: 'w', label: 'Wat', glyph: 'W', kind: 'letters', frame: toFrame(standIn(2, 1000, false, 12, 12), 12, 12), talking: true },
	{ ...base, id: 'j', label: 'Joan', glyph: 'J', kind: 'blank', note: 'no picture' }
];

test('the window draws in the grid: a framed title, its tiles, their names, why a tile is blank', () => {
	const { g, L } = window(TILES);
	const text = g.toText();
	assert.match(text, /Near you/);
	assert.match(text, /\[-\]\[x\]/);
	assert.match(text, /camera off/);
	assert.match(text, /no picture/);
	assert.match(text, /You/);
	assert.match(text, /Agnes/);
	assert.match(text, /♪Wat/, 'a talking name has a note');
	assert.match(text, /\+2 more/);
	// A picture tile is left blank on its own ground, for the canvas over it; letters are drawn.
	const [, pic, letters] = L.tiles;
	assert.ok(uncovered(g, pic));
	assert.equal(g.get(pic.x + 3, pic.y + 2)!.ch, VIDEO_CH);
	assert.ok(!uncovered(g, letters));
	let inked = 0;
	for (let y = 0; y < letters.h; y++) for (let x = 0; x < letters.w; x++) if (g.get(letters.x + x, letters.y + y)!.ch.trim()) inked++;
	assert.ok(inked > 10, 'a letters tile has a face in it');
	// Anything drawn over a picture tile (a notice, a faded sheet) takes the picture down.
	g.set(pic.x + pic.w - 1, pic.y + pic.h - 1, ' ', 4, 0);
	assert.ok(!uncovered(g, pic));
	const faded = window(TILES);
	for (const c of faded.g.cells) { c.fg = 1; c.bg = 0; }
	assert.ok(!uncovered(faded.g, faded.L.tiles[1]));
	assert.notEqual(VIDEO_BG, 0);
});

test('taps on the window move, fold or close it, or pick a tile; never walk you under it', () => {
	const { g, L, said, walked } = window(TILES);
	const { x, y, w } = L.rect;
	g.hitAt(x + 2, y)!();
	g.hitAt(x + w - 5, y)!();
	g.hitAt(x + w - 2, y)!();
	g.hitAt(L.tiles[1].x + 1, L.tiles[1].y + 1)!();
	g.hitAt(L.tiles[0].x + 1, L.tiles[0].y + L.tiles[0].h)!();
	g.hitAt(x, y + 1)!();
	assert.deepEqual(said, ['move', 'fold', 'close', 'tile a', 'tile me']);
	assert.equal(walked(), '', 'the frame is not the map');
	g.hitAt(0, 10)!();
	assert.equal(walked(), 'walk');
	// Folded: one row, [+] to open it again.
	const f = window(TILES, true);
	assert.equal(f.L.rect.h, 1);
	assert.match(f.g.toText(), /Near you 4.*\[\+\]\[x\]/);
	f.g.hitAt(f.L.rect.x + f.L.rect.w - 5, f.L.rect.y)!();
	assert.deepEqual(f.said, ['fold']);
});

test('the camera window sends nothing: no link, no peer connection, no upload', () => {
	const src = readFileSync(new URL('../src/town/camwin.ts', import.meta.url), 'utf8');
	assert.doesNotMatch(src, /from '\.\.\/net\//);
	assert.doesNotMatch(src, /RTCPeerConnection|WebSocket|fetch\(|sendBeacon|XMLHttpRequest|getUserMedia/);
	// In the village, the window's own camera is only ever drawn: never passed to the link.
	const village = readFileSync(new URL('../src/town/village.ts', import.meta.url), 'utf8');
	for (const line of village.split('\n')) if (/myCam/.test(line)) assert.doesNotMatch(line, /\bup\(|sendTo\(|send\(/, line.trim());
	// It starts off: nothing turns it on but the player's own tap (the Cameras page's My camera button).
	const starts = village.split('\n').filter((l) => /myCam\.start\(/.test(l));
	assert.equal(starts.length, 1);
	assert.match(village, /case 'cams-cam': void myCamToggle\(\)/);
});
