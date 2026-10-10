/**
 * easel.ts - the Art tab: draw the little pictures, a pixel at a time.
 *
 * Pick a picture (the clocktower, the sky, or any character), pick an ink,
 * and paint by tapping or dragging across the grid. Every stroke is kept in
 * this browser at once, and used everywhere that picture appears. "Copy as
 * code" gives the rows to paste into pixel.ts, to make a drawing permanent
 * for everyone.
 */
import { COLS, INNER, blank, btn, buttonRows, pad, row, rubric, txt, wrap } from './ascii.ts';
import type { Button, Row } from './ascii.ts';
import { DEFAULTS, INKS, NEW_SIZE, SCENE, isCustom, setSprite, sprite, svg } from './pixel.ts';

interface Easel {
	id: string;
	ink: string;
	tool: 'draw' | 'fill';
	undo: string[][];
	showCode: boolean;
	message: string;
}

const easel: Easel = { id: 'tower', ink: 'k', tool: 'draw', undo: [], showCode: false, message: '' };

/** The picture being drawn, as a mutable grid (blank at the default size if new). */
function grid(): string[][] {
	const rows = sprite(easel.id) ?? Array.from({ length: NEW_SIZE.h }, () => '.'.repeat(NEW_SIZE.w));
	const w = Math.max(1, ...rows.map((r) => r.length));
	return rows.map((r) => [...r.padEnd(w, '.')]);
}

function store(g: string[][]) {
	setSprite(easel.id, g.map((r) => r.join('')));
}

function remember() {
	easel.undo.push(grid().map((r) => r.join('')));
	if (easel.undo.length > 50) easel.undo.shift();
}

function fill(g: string[][], x: number, y: number, ink: string) {
	const from = g[y][x];
	if (from === ink) return;
	const stack = [[x, y]];
	while (stack.length) {
		const [cx, cy] = stack.pop()!;
		if (cy < 0 || cy >= g.length || cx < 0 || cx >= g[0].length || g[cy][cx] !== from) continue;
		g[cy][cx] = ink;
		stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
	}
}

/** Paint one pixel during a stroke (drawn straight onto the page, no redraw). */
function paintPixel(x: number, y: number, cell: HTMLElement | null) {
	const g = grid();
	if (!g[y] || g[y][x] === undefined) return;
	if (easel.tool === 'fill') {
		fill(g, x, y, easel.ink);
		store(g);
		return 'redraw';
	}
	if (g[y][x] === easel.ink) return;
	g[y][x] = easel.ink;
	store(g);
	if (cell) cell.className = `cell ${inkClass(easel.ink)}`;
}

const inkClass = (key: string) => {
	const ink = INKS.find((i) => i.key === key);
	return ink ? `px-${ink.name}` : 'empty';
};

function resize(dw: number, dh: number) {
	remember();
	let g = grid();
	const w = Math.max(1, Math.min(40, g[0].length + dw));
	const h = Math.max(1, Math.min(40, g.length + dh));
	g = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => g[y]?.[x] ?? '.'));
	store(g);
}

export function easelRows(names: { id: string; name: string }[], render: () => void): Row[] {
	const rows: Row[] = [];
	const pick = (id: string) => btn(id === easel.id ? `*${label(id)}` : label(id), () => { easel.id = id; easel.undo = []; easel.message = ''; render(); }, { style: id === easel.id ? 'on' : isCustom(id) ? 'primary' : undefined });
	const all = [...SCENE, ...names];
	const label = (id: string) => all.find((x) => x.id === id)?.name ?? id;

	rows.push(rubric('Pictures'));
	rows.push(...wrap('Gold names have a drawing of yours. Tap one to open it on the easel.', INNER).map((l) => row(txt(l, 'dim'))));
	rows.push(row(txt('The scene', 'dim')), ...buttonRows(SCENE.map((s) => pick(s.id))));
	rows.push(row(txt('The characters', 'dim')), ...buttonRows(names.map((s) => pick(s.id))));

	const g = grid();
	const w = g[0].length, h = g.length;
	rows.push(rubric(`Easel: ${label(easel.id)}  ${w}x${h}`));
	const cells = g.map((r, y) => r.map((ch, x) => `<i class="cell ${inkClass(ch)}" data-px="${x},${y}"></i>`).join('')).join('');
	rows.push({ segs: [], cls: 'easel-row', html: `<div class="easel" style="--w:${w};--h:${h}">${cells}</div>` });

	// Inks: a swatch per colour, plus the eraser.
	const inks = INKS.filter((i) => i.key !== 'h');
	const swatches = [{ key: '.', name: 'erase' }, ...inks].map((i, n) =>
		`<button class="swatch ${i.key === '.' ? 'erase' : `px-${i.name}`}${easel.ink === i.key ? ' chosen' : ''}" data-act="${n}" aria-label="${i.name}" title="${i.name}">${i.key === '.' ? 'x' : ''}</button>`).join('');
	rows.push({ segs: [], cls: 'easel-row', custom: { html: `<div class="swatches">${swatches}</div>`, acts: [{ key: '.' }, ...inks].map((i) => () => { easel.ink = i.key; render(); }) } });
	rows.push(rubric('Tools'));
	const inkName = easel.ink === '.' ? 'erase' : INKS.find((i) => i.key === easel.ink)?.name ?? '';
	rows.push(row(txt(pad(`Ink: ${inkName}`, 20), 'gold'), txt(`Tool: ${easel.tool}`, 'gold')));
	rows.push(...buttonRows([
		btn('Draw', () => { easel.tool = 'draw'; render(); }, { style: easel.tool === 'draw' ? 'on' : undefined }),
		btn('Fill', () => { easel.tool = 'fill'; render(); }, { style: easel.tool === 'fill' ? 'on' : undefined }),
		btn('Undo', () => { const last = easel.undo.pop(); if (last) setSprite(easel.id, last); render(); }, { disabled: !easel.undo.length }),
		btn('Flip', () => { remember(); store(grid().map((r) => r.reverse())); render(); }),
		btn('Clear', () => { remember(); store(grid().map((r) => r.map(() => '.'))); render(); }, { style: 'danger' })
	]));
	rows.push(...buttonRows([
		btn('W-', () => { resize(-1, 0); render(); }), btn('W+', () => { resize(1, 0); render(); }),
		btn('H-', () => { resize(0, -1); render(); }), btn('H+', () => { resize(0, 1); render(); }),
		btn(DEFAULTS[easel.id] ? 'Back to built-in' : 'Delete drawing', () => { remember(); setSprite(easel.id, null); render(); }, { style: 'quiet', disabled: !isCustom(easel.id) })
	]));

	rows.push(rubric('As it will look'));
	rows.push({ segs: [], cls: 'easel-row', html: `<div class="easel-preview">${svg(sprite(easel.id) ?? [], 'preview-big')}${svg(sprite(easel.id) ?? [], 'preview-small')}</div>` });

	rows.push(rubric('Keep it'));
	rows.push(...wrap('Drawings are kept in this browser. To make one part of the app for everyone, copy it as code into src/ui/pixel.ts (DEFAULTS), or paste rows below to load one.', INNER).map((l) => row(txt(l, 'dim'))));
	const code = `${JSON.stringify(easel.id)}: [\n${(sprite(easel.id) ?? []).map((r) => `\t${JSON.stringify(r)}`).join(',\n')}\n]`;
	rows.push({ segs: [], cls: 'easel-row', html: `<textarea id="easel-code" rows="8" spellcheck="false" aria-label="Picture as code">${code.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</textarea>` });
	const actions: Button[] = [
		btn('Copy as code', () => {
			navigator.clipboard?.writeText(code).then(() => { easel.message = 'Copied.'; render(); }, () => { easel.message = 'Select the text above and copy it.'; render(); });
		}),
		btn('Load from text', () => {
			const text = (document.getElementById('easel-code') as HTMLTextAreaElement | null)?.value ?? '';
			const found = [...text.matchAll(/"([^"\n]*)"/g)].map((m) => m[1]).filter((r, i) => !(i === 0 && /:\s*\[/.test(text) && r === easel.id));
			const rowsIn = found.filter((r) => /^[.a-zA-Z]+$/.test(r));
			if (!rowsIn.length) { easel.message = 'No picture rows found: each row is a string of ink letters and dots.'; return render(); }
			remember();
			setSprite(easel.id, rowsIn);
			easel.message = `Loaded ${rowsIn.length} rows.`;
			render();
		})
	];
	rows.push(...buttonRows(actions));
	if (easel.message) rows.push(row(txt(easel.message, 'gold')));
	rows.push(blank());
	return rows;
}

/**
 * Painting by finger or mouse: press on a cell and drag. Wired once on the
 * page; a stroke saves as it goes and redraws the page when it ends.
 */
export function wireEasel(root: HTMLElement, render: () => void) {
	let painting = false;
	const at = (ev: PointerEvent) => {
		const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
		const cell = el?.closest('[data-px]') as HTMLElement | null;
		if (!cell) return;
		const [x, y] = cell.dataset.px!.split(',').map(Number);
		if (paintPixel(x, y, cell) === 'redraw') { painting = false; render(); }
	};
	root.addEventListener('pointerdown', (ev) => {
		if (!(ev.target as HTMLElement).closest('[data-px]')) return;
		ev.preventDefault();
		remember();
		painting = true;
		at(ev);
	});
	root.addEventListener('pointermove', (ev) => { if (painting) at(ev); });
	const end = () => { if (painting) { painting = false; render(); } };
	window.addEventListener('pointerup', end);
	window.addEventListener('pointercancel', end);
}

export { COLS };
