/**
 * ascii.ts - the text-grid renderer.
 *
 * A screen is a list of rows; a row is a list of segments; a segment is
 * either text or a button. Everything sits on one grid COLS columns wide,
 * scaled by the CSS to fill a phone's width.
 *
 * Every segment is drawn as a box exactly as many columns wide as it has
 * characters. So the grid stays true whatever font the words are set in:
 * text can use a book face while the ASCII art (marked `art`) keeps its
 * fixed-width font. Buttons are real <button> elements drawn as `[ Label ]`,
 * so they work with touch, keyboard and screen readers.
 *
 * Nothing here knows about the game. It is the piece most likely to be
 * shared with other projects (menus for Broadside, say).
 */

export const COLS = 44;
/** The width inside a panel's frame: a border and a space each side. */
export const INNER = COLS - 4;

export type Tone = 'plain' | 'rubric' | 'gold' | 'evil' | 'good' | 'dim' | 'title' | 'poison' | 'drunk';

export interface Text {
	t: string;
	tone?: Tone;
	/** A face for this text: 'art' keeps the fixed-width font (for ASCII art); 'heading' is the blackletter. */
	face?: 'art' | 'heading';
	/** data-* attributes, for text updated in place (the clocks). */
	data?: Record<string, string>;
}

export interface Button {
	label: string;
	act: () => void;
	/** primary = the main thing to do now; on = toggled/selected; danger = irreversible-ish. */
	style?: 'primary' | 'on' | 'danger' | 'quiet';
	disabled?: boolean;
	/** Exact width in columns (label is padded/cut to fit). Used inside art. */
	width?: number;
	/** Reader-friendly name when the label is cryptic. */
	aria?: string;
}

export type Seg = Text | Button;

export interface Row {
	segs: Seg[];
	/** Extra class for the row, e.g. a big card line. */
	cls?: string;
	/** Raw markup in place of segments, for the odd form field. Trusted (ours) only. */
	html?: string;
	/** Set on a rubric row: the title of the panel it opens (see paneled). */
	title?: string;
	/** Inline CSS custom properties for the row (e.g. where a frame's title sits). */
	vars?: Record<string, number>;
	/**
	 * Free-form markup with its own buttons, for pictures that are not text
	 * (the seating circle). Buttons in it carry data-act="n", n indexing acts.
	 */
	custom?: { html: string; acts: (() => void)[] };
}

export const isButton = (s: Seg): s is Button => 'act' in s;

export const txt = (t: string, tone?: Tone, face?: Text['face']): Text => (face ? { t, tone, face } : { t, tone });
export const btn = (label: string, act: () => void, extra: Partial<Button> = {}): Button => ({ label, act, ...extra });
export const row = (...segs: (Seg | string)[]): Row => ({ segs: segs.map((s) => (typeof s === 'string' ? txt(s) : s)) });
export const blank = (): Row => row('');

/** The width a segment takes on the grid. Buttons draw as "[label]". */
export function segWidth(s: Seg): number {
	if (!isButton(s)) return [...s.t].length;
	return s.width ?? [...s.label].length + 2;
}

export function center(text: string, width = COLS): string {
	const len = [...text].length;
	if (len >= width) return text;
	const left = Math.floor((width - len) / 2);
	return ' '.repeat(left) + text;
}

export function pad(text: string, width: number): string {
	const chars = [...text];
	if (chars.length >= width) return chars.slice(0, width).join('');
	return text + ' '.repeat(width - chars.length);
}

/** Break prose into lines no wider than `width`. */
export function wrap(text: string, width = INNER): string[] {
	const out: string[] = [];
	for (const para of text.split('\n')) {
		let line = '';
		for (const word of para.split(/\s+/).filter(Boolean)) {
			if (!line) line = word;
			else if (line.length + 1 + word.length <= width) line += ' ' + word;
			else {
				out.push(line);
				line = word;
			}
		}
		out.push(line);
	}
	return out;
}

/** A run of buttons, wrapped onto as many rows as needed. */
export function buttonRows(buttons: Button[], width = INNER, gap = 1): Row[] {
	const rows: Row[] = [];
	let cur: Seg[] = [];
	let used = 0;
	for (const b of buttons) {
		const w = segWidth(b);
		if (cur.length && used + gap + w > width) {
			rows.push({ segs: cur });
			cur = [];
			used = 0;
		}
		if (cur.length) {
			cur.push(txt(' '.repeat(gap)));
			used += gap;
		}
		cur.push(b);
		used += w;
	}
	if (cur.length) rows.push({ segs: cur });
	return rows;
}

// ---- frames ----------------------------------------------------------------

/** A ruled heading in the manner of a manuscript rubric:  ──§ Title §── */
export function rubric(title: string, width = COLS): Row {
	const inner = ` ${title} `;
	const len = [...inner].length + 2;
	const left = Math.max(1, Math.floor((width - len) / 2));
	const right = Math.max(1, width - len - left);
	return { ...row(txt('─'.repeat(left) + '§', 'dim', 'art'), txt(inner, 'rubric', 'heading'), txt('§' + '─'.repeat(right), 'dim', 'art')), title };
}

/**
 * The top of a frame: a manuscript double rule (drawn by the stylesheet,
 * .frame-top) with the title set into it; the rule stops either side of the
 * title (columns t0..t1).
 */
export function frameTop(title: string, width = COLS): Row[] {
	const name = ' ' + title + ' ';
	const used = 3 + [...name].length;
	return [{ segs: [txt('   '), txt(name, 'rubric', 'heading'), txt(' '.repeat(Math.max(0, width - used)))], cls: 'frame-top', vars: { t0: 2, t1: used + 1 } }];
}

/** The foot of a frame: the double rule, unbroken. */
export function frameBottom(width = COLS): Row {
	// No gap to leave: the left rule runs almost the whole way, the right one just closes it off.
	return { segs: [txt(' '.repeat(width))], cls: 'frame-bot', vars: { t0: width - 1, t1: width - 1 } };
}

/** Ends the current panel early (see paneled). */
export const endPanel = (): Row => ({ segs: [], cls: 'end-panel' });

const isBlank = (r: Row) => r.html === undefined && !r.custom && r.segs.every((g) => !isButton(g) && !g.t.trim());

/**
 * Turn a flat screen into boxed sections. Each rubric row opens a panel
 * titled with it; the rows after it go inside the frame until the next
 * rubric, an endPanel(), a raw-markup row or a full-width ('wide') row.
 * Rows inside must fit `width - 4` columns; they are padded to the frame.
 *
 *   ┌─ Title ──────────┐
 *   │ rows...          │
 *   └──────────────────┘
 *
 * The frame's lines are drawn by the stylesheet (frame-top / frame-mid /
 * frame-bot) along the middle of the outer columns, so they run unbroken
 * however tall a row is. The title is a heading that masks the top line.
 */
export function paneled(rows: Row[], width = COLS): Row[] {
	const out: Row[] = [];
	const inner = width - 4;
	let body: Row[] | null = null;
	let title = '';
	let opener: Row | null = null;
	const close = () => {
		if (!body) return;
		while (body.length && isBlank(body[body.length - 1])) body.pop();
		// Nothing inside (say, a heading over a full-width table): just the heading.
		if (!body.length) {
			out.push(opener!);
			body = null;
			return;
		}
		out.push(...frameTop(title, width));
		for (const r of body) {
			const used = r.segs.reduce((a, g) => a + segWidth(g), 0);
			out.push({ ...r, segs: [txt('  '), ...r.segs, txt(' '.repeat(Math.max(0, inner - used))), txt('  ')], cls: ['frame-mid', r.cls ?? ''].join(' ').trim() });
		}
		out.push(frameBottom(width));
		body = null;
	};
	for (const r of rows) {
		if (r.title !== undefined) {
			close();
			body = [];
			title = r.title;
			opener = r;
		} else if (r.cls === 'end-panel') {
			close();
		} else if (body && (r.html !== undefined || r.custom || r.cls?.includes('wide') || r.cls === 'frame-top' || r.cls === 'frame-bot')) {
			close();
			out.push(r);
		} else if (body) {
			if (body.length || !isBlank(r)) body.push(r);
		} else {
			out.push(r);
		}
	}
	close();
	return out;
}

export function rule(width = COLS): Row {
	return row(txt(center('-=§=-', width), 'dim', 'art'));
}

// ---- canvas: free placement of text and buttons ---------------------------

interface Placed {
	x: number;
	y: number;
	seg: Seg;
}

/**
 * A fixed grid you can stamp text and buttons onto anywhere, for art and the
 * seating circle. Later stamps win where they overlap.
 */
export class Canvas {
	width: number;
	height: number;
	private items: Placed[] = [];

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
	}

	put(x: number, y: number, seg: Seg | string) {
		this.items.push({ x: Math.round(x), y: Math.round(y), seg: typeof seg === 'string' ? txt(seg) : seg });
	}

	rows(): Row[] {
		const out: Row[] = [];
		for (let y = 0; y < this.height; y++) {
			// Each column holds either a character of text or a slice of a button.
			// Each column holds a character and the item that put it there (none for gaps).
			const cells: { ch: string; owner?: Placed }[] = Array.from({ length: this.width }, () => ({ ch: ' ' }));
			for (const p of this.items) {
				if (p.y !== y) continue;
				const w = segWidth(p.seg);
				const chars = isButton(p.seg) ? [] : [...p.seg.t];
				for (let i = 0; i < w; i++) {
					const x = p.x + i;
					if (x < 0 || x >= this.width) continue;
					cells[x] = { ch: isButton(p.seg) ? '' : chars[i], owner: p };
				}
			}
			const segs: Seg[] = [];
			let x = 0;
			while (x < this.width) {
				const c = cells[x];
				const owner = c.owner;
				let w = 0;
				let s = '';
				while (x + w < this.width && cells[x + w].owner === owner) s += cells[x + w++].ch;
				if (owner && isButton(owner.seg)) segs.push({ ...owner.seg, width: w });
				else if (owner) segs.push({ ...(owner.seg as Text), t: s });
				else segs.push(txt(s));
				x += w;
			}
			out.push({ segs });
		}
		return out;
	}
}

// ---- DOM ------------------------------------------------------------------

const escChar = (c: string) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : c);

/**
 * Escape text for the grid. Glyphs beyond Latin-1 (skull, moon, tick...) usually
 * come from a fallback font with a different width, which would knock every
 * column after them out of line. Each is pinned into a box one column wide.
 */
const esc = (s: string, pin = false) =>
	[...s].map((c) => (pin && c.codePointAt(0)! > 0xff ? `<span class="g">${escChar(c)}</span>` : escChar(c))).join('');
const escAttr = (s: string) => [...s].map(escChar).join('');

/**
 * A text segment as boxes on the grid: leading spaces as an empty box, then
 * the words in a box as wide as their characters. The words may be set in
 * a narrower face than the grid; they still start and end where they should.
 */
function textBoxes(s: Text): string {
	const chars = [...s.t];
	let lead = 0;
	// Text filled in later (data-*) keeps its whole width as one box.
	while (!s.data && lead < chars.length && chars[lead] === ' ') lead++;
	const body = chars.slice(lead).join('');
	const cls = ['s', s.tone && s.tone !== 'plain' ? `t-${s.tone}` : '', s.face ?? ''].filter(Boolean).join(' ');
	const gap = lead ? `<span class="s" style="width:calc(var(--cw) * ${lead})"></span>` : '';
	const data = Object.entries(s.data ?? {}).map(([k, v]) => ` data-${k}="${escAttr(v)}"`).join('');
	// Only fixed-width art needs each odd glyph pinned to a column; words just need their box.
	return body || data ? `${gap}<span class="${cls}"${data} style="width:calc(var(--cw) * ${chars.length - lead})">${esc(body, s.face === 'art')}</span>` : gap;
}

/** The book's name at the head of the page, its first letter a painted initial. */
export function titleRow(word = 'Grimoire'): Row {
	const [first, ...rest] = [...word];
	return { segs: [], cls: 'title', html: `<h1 class="ms-title" aria-label="${escAttr(word)}"><span class="ini" aria-hidden="true">${esc(first)}</span><span aria-hidden="true">${esc(rest.join(''))}</span></h1>` };
}

/**
 * Words set in a book face are wider or narrower than the grid's columns, and
 * a long name may not fit its box at all. Any word or button that would spill
 * past its box is set a little smaller, so the box's right edge (a border, the
 * next word) stays where the grid put it. Measured after the fonts load and
 * again whenever the page changes width.
 */
const painted = new Set<HTMLElement>();
function fit(root: HTMLElement) {
	if (!root.isConnected) { painted.delete(root); return; }
	const els = root.querySelectorAll<HTMLElement>('.s:not(.art), .b');
	for (const el of els) el.style.fontSize = '';
	const shrink: [HTMLElement, number][] = [];
	for (const el of els) {
		const w = el.clientWidth, sw = el.scrollWidth;
		if (w > 0 && sw > w + 0.5) shrink.push([el, w / sw]);
	}
	// Read everything first, then write, so the page lays out once.
	const sizes = shrink.map(([el]) => parseFloat(getComputedStyle(el).fontSize));
	shrink.forEach(([el, k], i) => { el.style.fontSize = `${(sizes[i] * k * 0.98).toFixed(2)}px`; });
}
if (typeof document !== 'undefined') {
	const again = () => { for (const r of [...painted]) fit(r); };
	void document.fonts?.ready.then(again);
	document.fonts?.addEventListener?.('loadingdone', again);
	let t = 0;
	addEventListener('resize', () => { clearTimeout(t); t = setTimeout(again, 120) as unknown as number; });
}

/**
 * Draw rows into `root`. Buttons get a data-id; one delegated listener on the
 * root calls the right action, so re-rendering never leaks listeners.
 */
export function paint(root: HTMLElement, rows: Row[]) {
	const actions: (() => void)[] = [];
	const html: string[] = [];
	for (const r of rows) {
		if (r.html !== undefined) {
			html.push(`<div class="row ${r.cls ?? ''}">${r.html}</div>`);
			continue;
		}
		if (r.custom) {
			const base = actions.length;
			actions.push(...r.custom.acts);
			html.push(`<div class="${r.cls ?? ''}">${r.custom.html.replace(/data-act="(\d+)"/g, (_, n) => `data-id="${base + Number(n)}"`)}</div>`);
			continue;
		}
		const hasBtn = r.segs.some(isButton);
		const cls = ['row', hasBtn ? 'has-btn' : '', r.cls ?? ''].filter(Boolean).join(' ');
		const inner = r.segs.map((s) => {
			if (!isButton(s)) return textBoxes(s);
			const w = segWidth(s);
			// In a fixed width, the brackets hug the label and the spare columns
			// sit outside them, still part of the button (a bigger target).
			const label = [...s.label].slice(0, Math.max(1, w - 2)).join('');
			const spare = Math.max(0, w - 2 - [...label].length);
			const before = ' '.repeat(Math.floor(spare / 2));
			const after = ' '.repeat(spare - before.length);
			const id = actions.push(s.act) - 1;
			const attrs = [
				`data-id="${id}"`,
				`class="b b-${s.style ?? 'normal'}"`,
				`style="width:calc(var(--cw) * ${w})"`,
				s.disabled ? 'disabled' : '',
				s.aria ? `aria-label="${escAttr(s.aria)}"` : ''
			].join(' ');
			return `<button ${attrs}>${before}<span class="br">[</span>${esc(label)}<span class="br">]</span>${after}</button>`;
		}).join('');
		const style = r.vars ? ` style="${Object.entries(r.vars).map(([k, v]) => `--${k}:${v}`).join(';')}"` : '';
		html.push(`<div class="${cls}"${style}>${inner || '&nbsp;'}</div>`);
	}
	root.innerHTML = html.join('');
	fit(root);
	painted.add(root);
	(root as HTMLElement & { _actions?: (() => void)[] })._actions = actions;
	if (!root.dataset.wired) {
		root.dataset.wired = '1';
		root.addEventListener('click', (ev) => {
			const el = (ev.target as HTMLElement).closest('button[data-id]') as HTMLButtonElement | null;
			if (!el || el.disabled) return;
			const acts = (root as HTMLElement & { _actions?: (() => void)[] })._actions ?? [];
			acts[Number(el.dataset.id)]?.();
		});
	}
}
