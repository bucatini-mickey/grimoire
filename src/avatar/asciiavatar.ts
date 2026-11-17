/**
 * asciiavatar.ts - your face as moving ASCII, live from a camera, in any page.
 *
 * The reusable heart of tools/ascii-face.html. That page carries a compiled copy of this file between its
 * "ascii-avatar module" markers, so it stays one self-contained file; `npm run avatar` refreshes the copy,
 * and a test fails while it is stale. Compiled, everything below is the global `asciiAvatar`.
 *
 * How a frame is drawn (the village's trick, src/town/faces.ts, with care for smoothness):
 *   1. find the face: the browser's FaceDetector where there is one, else skin tone (YCbCr); or a crop
 *      that stays put (the middle, or where you clicked). A found face is followed smoothly, with a
 *      small dead zone so the crop does not tremble;
 *   2. sample the crop as cols x 2*rows brightness samples, two a cell (a cell is twice as tall as it is
 *      wide, so the picture is square), averaged down from a larger copy so a face does not shimmer;
 *   3. smooth in time: each sample keeps part of its last value (`smooth`), unless it jumped by more than
 *      `snap` (a movement shows at once; only the noise is smoothed away);
 *   4. expose for the face: black and white points read from the face's oval (a bright window behind you
 *      does not set them), eased from frame to frame; then gamma, sharpening, the background faded;
 *   5. squeeze to 16 levels (one hex digit, what the game sends), a cell keeping its level until the
 *      value is clearly past the next one (`steady`), so still parts of the face do not flicker;
 *   6. a glyph per cell from its two halves: ink high (` ' ") when only the top is bright, low (. , o)
 *      when only the bottom is, otherwise by weight from a density ramp.
 *
 * Nothing here sends anything anywhere: the camera's picture stays in the page.
 *
 * The interface, smallest first:
 *   mount(el, settings?)              start the camera and draw into `el` (a <pre>); returns { avatar, camera, stop }
 *   new AsciiAvatar(settings?)        the drawing: .frame(source, w, h) -> AvatarFrame { text, html, levels, ... }
 *                                     (.locate() and .draw() are its two halves, to draw one crop at two sizes)
 *   new AvatarCamera()                the camera: .start('user' | 'environment'), .stop(), .video, .ready
 *   drawToCanvas(canvas, frame, o?)   a frame as pixels: for a PNG, a video recording, picture in picture
 *   playerHtml(frames, fps, o?)       a recorded clip of frames as a standalone HTML page that plays it
 *   embedHtml(moduleJs, settings)     a snippet (module included) that runs a live avatar in any page
 * and the pure pieces under them (cellGlyph, toLevels, blend, quantize, ...), tested in
 * tests/asciiavatar.test.ts.
 */

// ---- settings ---------------------------------------------------------------------------------------

/** Everything that shapes the avatar. All plain numbers and booleans, so they keep as JSON. */
export interface AvatarSettings {
	/** Cells across. Rows are half as many, so the face is square on the screen. */
	cols: number;
	/** Frames a second to aim for (mount and the tool's loop). */
	fps: number;
	/** Without tracking: the crop's side as a share of the picture's shorter side (1 = all of it). */
	zoom: number;
	/** Without tracking: how far above the middle the crop sits, as a share of its side. */
	lift: number;
	/** Black and white points, as percentiles of the face's brightness (0..100). */
	black: number;
	white: number;
	/** Gamma on the stretched brightness (above 1: darker mid tones). */
	gamma: number;
	/** Sharpening: how far a sample is pushed from its neighbours' mean. */
	sharpen: number;
	/** How much brighter one half of a cell must be (in levels, 1..15) for a high or low glyph. */
	shape: number;
	/** Glyphs by shape (two samples a cell) or by weight only. */
	shaped: boolean;
	/** Each glyph in an ink of its own brightness, or all in one ink. */
	colour: boolean;
	invert: boolean;
	/** Mirror the picture (as a front camera is usually shown). */
	mirror: boolean;
	/** Follow the face (FaceDetector or skin tone) instead of a fixed crop. */
	track: boolean;
	/** The crop round a found face, as a multiple of the face's size (takes in the hair). */
	margin: number;
	/** Skin tolerance: how far from skin's colour a pixel may be (1 = as tuned). */
	skin: number;
	/** How fast the crop follows the face each frame (0..1). */
	follow: number;
	/** Read the black and white points from the face's oval only. */
	faceExpose: boolean;
	/** How much cells outside the face's oval fade to the ground (0..1). */
	fade: number;
	/** The face's oval, as a multiple of its usual size. */
	oval: number;
	/** Smoothing in time: how much of its last value a sample keeps each frame (0 = none, 0.9 = a lot). */
	smooth: number;
	/** A sample that jumps by more than this (0..255) skips the smoothing, so movement is not smeared. */
	snap: number;
	/** Hysteresis, in levels: how far past the half-way mark a cell must go to change level (0..0.5). */
	steady: number;
	/** Which camera: the front ('user') or the back ('environment'). */
	facing: 'user' | 'environment';
}

export const DEFAULTS: AvatarSettings = {
	cols: 40, fps: 20, zoom: 0.5, lift: 0.1, black: 2, white: 98, gamma: 0.8, sharpen: 0.8, shape: 5,
	shaped: true, colour: true, invert: false, mirror: true,
	track: false, margin: 1.5, skin: 1, follow: 0.25, faceExpose: true, fade: 0.8, oval: 1,
	smooth: 0.5, snap: 40, steady: 0.25, facing: 'user'
};

/** Rows for a width in cells: half as many (a cell is twice as tall as wide), at least one. */
export const rowsFor = (cols: number) => Math.max(1, Math.round(cols / 2));

/** Glyphs from faint to dense, for a cell whose halves are alike (the game's ramp). */
export const DENSE = ' .:-=+*#%@';
/** A longer ramp for drawing by weight only. */
export const RAMP = ' .,:;-=+*oa#%@';
/** Inks from dark to bright (candlelit vellum), by level 0..15. */
export const INKS = ['#15110d', '#2a2017', '#3d2e20', '#503c29', '#634a32', '#76593c', '#8a6a47', '#9d7b53', '#ae8c60', '#bd9c6f', '#cbad80', '#d7bd92', '#e2cda6', '#ecdcba', '#f4e9cf', '#fbf4e4'];
/** The page's ground and its single ink (when `colour` is off). */
export const GROUND = '#15110d', INK = '#e9dcc0';

// ---- brightness -------------------------------------------------------------------------------------

/** A pixel's brightness (0..255), weighted as the eye sees. */
export const luma = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;

/**
 * RGBA pixels (W x H) to brightness, averaged over k x k blocks: (W/k) x (H/k) samples. Averaging a
 * larger copy, instead of letting the browser shrink straight to a few samples, keeps fine detail (an
 * eyelash, the camera's noise) from flickering a whole cell on and off.
 */
export function boxDown(rgba: ArrayLike<number>, W: number, H: number, k: number): Float32Array {
	const w = Math.floor(W / k), h = Math.floor(H / k);
	const out = new Float32Array(w * h);
	const kk = k * k;
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		let s = 0;
		for (let dy = 0; dy < k; dy++) {
			let i = ((y * k + dy) * W + x * k) * 4;
			for (let dx = 0; dx < k; dx++, i += 4) s += luma(rgba[i], rgba[i + 1], rgba[i + 2]);
		}
		out[x + y * w] = s / kk;
	}
	return out;
}

/**
 * Smoothing in time, in place: each of `prev` moves toward `next`, keeping `keep` of itself (0..1), except
 * a sample that jumped by more than `snap`, which takes the new value at once. Returns `prev`.
 */
export function blend(prev: Float32Array, next: ArrayLike<number>, keep: number, snap: number): Float32Array {
	const k = Math.min(0.95, Math.max(0, keep));
	for (let i = 0; i < prev.length; i++) {
		const d = next[i] - prev[i];
		prev[i] = Math.abs(d) > snap ? next[i] : prev[i] + d * (1 - k);
	}
	return prev;
}

/** How far outside the face's oval a sample is: 0 inside, rising to 1 a little beyond its edge. */
export function outside(x: number, y: number, w: number, h: number, oval = 1): number {
	const r = Math.hypot((x + 0.5 - w / 2) / (w * 0.36 * oval), (y + 0.5 - h * 0.48) / (h * 0.46 * oval));
	return Math.min(1, Math.max(0, (r - 0.9) / 0.35));
}

/** The black and white points (0..255): percentiles of the face's oval, or of the whole crop. */
export function exposure(v: ArrayLike<number>, w: number, h: number, s: Pick<AvatarSettings, 'faceExpose' | 'oval' | 'black' | 'white'>): { lo: number; hi: number } {
	const inFace: number[] = [];
	if (s.faceExpose) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (outside(x, y, w, h, s.oval) < 0.5) inFace.push(v[x + y * w]);
	const sorted = Float32Array.from(inFace.length > 8 ? inFace : Array.from(v)).sort();
	const at = (p: number) => sorted[Math.floor((sorted.length - 1) * Math.min(100, Math.max(0, p)) / 100)];
	return { lo: at(s.black), hi: at(s.white) };
}

/**
 * A brightness (0..1) to a level 0..15, holding the cell's last level (`prev`, -1 for none) until the
 * value is more than `steady` past the half-way mark to the next level: the cure for a cell that sits on
 * a boundary and flickers between two glyphs. With steady 0 it is plain rounding.
 */
export function quantize(b: number, prev: number, steady: number): number {
	const x = Math.min(15, Math.max(0, b * 15));
	if (prev >= 0 && Math.abs(x - prev) <= 0.5 + steady) return prev;
	return Math.round(x);
}

/**
 * Brightness samples (w x h, 0..255) to levels 0..15: stretched between the black and white points (lo,
 * hi), bent by gamma, sharpened, inverted if asked, faded outside the face's oval, and quantized against
 * the last frame's levels (`prev`, updated in place; null for none).
 */
export function toLevels(v: ArrayLike<number>, w: number, h: number, s: Pick<AvatarSettings, 'gamma' | 'sharpen' | 'invert' | 'fade' | 'oval' | 'steady'>,
	lo: number, hi: number, prev: Int8Array | null = null): Uint8Array {
	const span = Math.max(12, hi - lo);
	const n = new Float32Array(w * h);
	for (let i = 0; i < n.length; i++) n[i] = Math.pow(Math.min(1, Math.max(0, (v[i] - lo) / span)), s.gamma);
	const out = new Uint8Array(w * h);
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		const i = x + y * w;
		let sum = 0, k = 0;
		if (x > 0) { sum += n[i - 1]; k++; }
		if (x < w - 1) { sum += n[i + 1]; k++; }
		if (y > 0) { sum += n[i - w]; k++; }
		if (y < h - 1) { sum += n[i + w]; k++; }
		let b = Math.min(1, Math.max(0, n[i] + (k ? n[i] - sum / k : 0) * s.sharpen));
		if (s.invert) b = 1 - b;
		b *= 1 - s.fade * outside(x, y, w, h, s.oval);
		const q = quantize(b, prev ? prev[i] : -1, s.steady);
		out[i] = q;
		if (prev) prev[i] = q;
	}
	return out;
}

// ---- glyphs -----------------------------------------------------------------------------------------

/**
 * The luminance-to-character mapping: a cell from the levels (0..15) of its top and bottom halves, as
 * [glyph, ink level]. Shaped: ink high (` ' ") when the top is brighter by `shape` levels or more, low
 * (. , o) when the bottom is, otherwise by weight from DENSE. Unshaped: by the halves' mean from RAMP.
 * Shaped with shape 5 is exactly the village's faceCell (src/town/faces.ts).
 */
export function cellGlyph(t: number, b: number, shape = 5, shaped = true): [string, number] {
	if (!shaped) {
		const k = Math.round((t + b) / 2);
		return [RAMP[Math.round((k * (RAMP.length - 1)) / 15)], k];
	}
	const level = Math.max(t, b);
	if (level < 2) return [' ', level];
	const d = t - b;
	if (d >= shape) return [t >= 11 ? '"' : t >= 7 ? "'" : '`', level];
	if (d <= -shape) return [b >= 11 ? 'o' : b >= 7 ? ',' : '.', level];
	return [DENSE[Math.round(((t + b) / 30) * (DENSE.length - 1))], level];
}

/** A drawn frame. */
export interface AvatarFrame {
	cols: number;
	rows: number;
	/** Levels 0..15, two a cell: sample row 2y is the cells' top halves, 2y + 1 their bottoms. */
	levels: Uint8Array;
	/** The glyphs, a string a row. */
	lines: string[];
	/** Each cell's ink level, row by row. */
	inks: Uint8Array;
	/** The frame as plain text (rows joined by newlines). */
	text: string;
	/** The frame as HTML for a <pre>: runs of one ink in one span (plain escaped text with colour off). */
	html: string;
}

const esc = (c: string) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c);

/** HTML for a <pre>: each run of cells in one ink in one span, or plain escaped text. */
export function toHtml(lines: string[], inks: ArrayLike<number>, colour: boolean, palette: string[] = INKS): string {
	const cols = lines[0]?.length ?? 0;
	return lines.map((line, y) => {
		if (!colour) return Array.from(line, esc).join('');
		let out = '', run = '', ink = -1;
		for (let x = 0; x < cols; x++) {
			const k = inks[x + y * cols];
			if (k !== ink) { if (run) out += `<span style="color:${palette[ink]}">${run}</span>`; run = ''; ink = k; }
			run += esc(line[x]);
		}
		if (run) out += `<span style="color:${palette[ink]}">${run}</span>`;
		return out;
	}).join('\n');
}

/** Levels (two a cell, cols x 2*rows) to a frame of glyphs. */
export function toFrame(levels: Uint8Array, cols: number, rows: number, s: Pick<AvatarSettings, 'shape' | 'shaped' | 'colour'>): AvatarFrame {
	const lines: string[] = [];
	const inks = new Uint8Array(cols * rows);
	for (let y = 0; y < rows; y++) {
		let line = '';
		for (let x = 0; x < cols; x++) {
			const [ch, k] = cellGlyph(levels[x + 2 * y * cols], levels[x + (2 * y + 1) * cols], s.shape, s.shaped);
			line += ch;
			inks[x + y * cols] = k;
		}
		lines.push(line);
	}
	return { cols, rows, levels, lines, inks, text: lines.join('\n'), html: toHtml(lines, inks, s.colour) };
}

/** Levels as hex digits, one a sample: the village's frame format (faces.ts cellOf reads it, given cols). */
export const hexFrame = (levels: ArrayLike<number>) => Array.from(levels, (k) => k.toString(16)).join('');

// ---- finding the face -------------------------------------------------------------------------------

/** A square in the source picture (unmirrored): left, top, side. */
export interface Box { x: number; y: number; s: number }

/** Skin's colour in Cb and Cr; `taught` once learned from a click on this face. */
export interface SkinRef { cb: number; cr: number; taught: boolean }
/** A typical skin, to start with. */
export const SKIN_START: SkinRef = { cb: 106, cr: 152, taught: false };

export const ycc = (r: number, g: number, b: number) => ({
	y: 0.299 * r + 0.587 * g + 0.114 * b,
	cb: 128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
	cr: 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
});

/** Skin in YCbCr: near skin's colour in Cb and Cr (brightness hardly matters), not blown out or black. */
export function isSkin(r: number, g: number, b: number, ref: SkinRef, tolerance: number): boolean {
	const c = ycc(r, g, b);
	const d = Math.hypot((c.cb - ref.cb) / (ref.taught ? 9 : 20), (c.cr - ref.cr) / (ref.taught ? 7 : 16));
	return c.y > 20 && c.y < 248 && d < tolerance;
}

/** Which pixels of a small RGBA picture are skin (1), looking only inside `win` (in its pixels) if given. */
export function skinMask(rgba: ArrayLike<number>, w: number, h: number, ref: SkinRef, tolerance: number,
	win: { x0: number; x1: number; y0: number; y1: number } | null = null): Uint8Array {
	const m = new Uint8Array(w * h);
	for (let i = 0; i < w * h; i++) {
		const x = i % w, y = (i - x) / w;
		if (win && (x < win.x0 || x > win.x1 || y < win.y0 || y > win.y1)) continue;
		m[i] = isSkin(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], ref, tolerance) ? 1 : 0;
	}
	return m;
}

/** A patch of the mask: its bounds and middle. */
export interface Patch { x0: number; x1: number; y0: number; y1: number; cx: number; cy: number; n: number }

/**
 * The face's patch: of the patches of 1s joined edge to edge (at least `min` pixels), the largest,
 * favouring those near `near` (where the face was): a big patch far away loses to a good one close by.
 */
export function bestPatch(mask: Uint8Array, w: number, h: number, near: { x: number; y: number }, min: number): Patch | null {
	const seen = new Uint8Array(w * h);
	let best: Patch | null = null, bestScore = 0;
	const stack: number[] = [];
	for (let i = 0; i < w * h; i++) {
		if (!mask[i] || seen[i]) continue;
		stack.push(i);
		seen[i] = 1;
		let n = 0, x0 = w, x1 = 0, y0 = h, y1 = 0, sx = 0, sy = 0;
		while (stack.length) {
			const k = stack.pop()!, x = k % w, y = (k - x) / w;
			n++; sx += x; sy += y;
			if (x < x0) x0 = x;
			if (x > x1) x1 = x;
			if (y < y0) y0 = y;
			if (y > y1) y1 = y;
			if (x > 0 && mask[k - 1] && !seen[k - 1]) { seen[k - 1] = 1; stack.push(k - 1); }
			if (x < w - 1 && mask[k + 1] && !seen[k + 1]) { seen[k + 1] = 1; stack.push(k + 1); }
			if (y > 0 && mask[k - w] && !seen[k - w]) { seen[k - w] = 1; stack.push(k - w); }
			if (y < h - 1 && mask[k + w] && !seen[k + w]) { seen[k + w] = 1; stack.push(k + w); }
		}
		if (n < min) continue;
		const score = n / (1 + Math.hypot(sx / n - near.x, sy / n - near.y) / 12);
		if (score > bestScore) { bestScore = score; best = { x0, x1, y0, y1, cx: sx / n, cy: sy / n, n }; }
	}
	return best;
}

/** A square of side `size` centred on (cx, cy), kept inside a sw x sh picture (and no bigger than it). */
export function squareAround(cx: number, cy: number, size: number, sw: number, sh: number): Box {
	const s = Math.min(sw, sh, Math.max(1, size));
	return { x: Math.max(0, Math.min(sw - s, cx - s / 2)), y: Math.max(0, Math.min(sh - s, cy - s / 2)), s };
}

/**
 * The crop moving toward where it should be: `k` of the way each frame, ignoring moves of less than
 * `dead` of its side (so a still face gets a still crop instead of one that trembles with the noise).
 */
export function follow(box: Box, want: Box, k: number, dead = 0.02): Box {
	const step = (a: number, b: number) => (Math.abs(b - a) < dead * box.s ? a : a + (b - a) * k);
	return { x: step(box.x, want.x), y: step(box.y, want.y), s: step(box.s, want.s) };
}

/** The crop without tracking: `zoom` of the shorter side, round the pinned point or a little above the middle. */
export function fixedCrop(sw: number, sh: number, zoom: number, lift: number, pin: { x: number; y: number } | null = null): Box {
	const s = Math.min(sw, sh) * zoom;
	const at = pin ?? { x: sw / 2, y: sh / 2 - s * lift };
	return squareAround(at.x, at.y, s, sw, sh);
}

// ---- recording and embedding (pure: they only build text) -------------------------------------------

/** A frame kept for a clip: its text and each cell's ink as a hex digit. */
export interface ClipFrame { text: string; inks: string }
export const clipFrame = (f: AvatarFrame): ClipFrame => ({ text: f.text, inks: hexFrame(f.inks) });

/** JSON that is safe inside a <script>: no "</script", no "<!--". */
const scriptSafe = (s: string) => s.replace(/</g, '\\u003c');

/**
 * A recorded clip as a whole HTML page that plays it on a loop, fitted to the window: no camera, no
 * libraries, nothing fetched. Put it on any site, or open it from a folder.
 */
export function playerHtml(frames: ClipFrame[], fps: number, o: { colour?: boolean; bg?: string; title?: string } = {}): string {
	const colour = o.colour ?? true, bg = o.bg ?? GROUND, title = (o.title ?? 'ASCII avatar').replace(/[<&>]/g, '');
	const data = scriptSafe(JSON.stringify({ frames, fps: Math.max(1, Math.min(60, fps)), inks: INKS, ink: INK, colour }));
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>html,body{margin:0;height:100%;background:${bg}}body{display:grid;place-items:center}pre{margin:0;line-height:1.2;font-family:'Cascadia Mono',Consolas,'DejaVu Sans Mono',Menlo,monospace;user-select:none}</style>
</head>
<body>
<pre id="avatar" aria-label="An ASCII avatar, recorded"></pre>
<script>
(function () {
	var D = ${data};
	var el = document.getElementById('avatar'), i = 0;
	var esc = function (c) { return c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c; };
	function html(f) {
		var lines = f.text.split('\\n'), cols = lines[0].length;
		return lines.map(function (line, y) {
			if (!D.colour) return line.split('').map(esc).join('');
			var out = '', run = '', ink = -1;
			for (var x = 0; x < cols; x++) {
				var k = parseInt(f.inks[x + y * cols], 16);
				if (k !== ink) { if (run) out += '<span style="color:' + D.inks[ink] + '">' + run + '</span>'; run = ''; ink = k; }
				run += esc(line[x]);
			}
			return run ? out + '<span style="color:' + D.inks[ink] + '">' + run + '</span>' : out;
		}).join('\\n');
	}
	function fit() {
		var lines = D.frames[0].text.split('\\n');
		el.style.fontSize = Math.max(4, Math.min(innerWidth / (lines[0].length * 0.62), innerHeight / (lines.length * 1.2)) * 0.95) + 'px';
	}
	el.style.color = D.ink;
	addEventListener('resize', fit);
	fit();
	function show() { el.innerHTML = html(D.frames[i]); i = (i + 1) % D.frames.length; }
	show();
	setInterval(show, 1000 / D.fps);
})();
</script>
</body>
</html>
`;
}

/**
 * A snippet that runs a live avatar in any page: a <pre>, this module (`moduleJs`, the compiled copy
 * the tool carries), and one line to mount it with these settings. The page must be served over https
 * or from localhost (or opened as a file) for the browser to offer the camera.
 */
export function embedHtml(moduleJs: string, settings: Partial<AvatarSettings>, id = 'ascii-avatar'): string {
	const js = moduleJs.replace(/<\/script/gi, '<\\/script');
	return `<!-- ASCII avatar: drawn live from this device's camera, in the page; nothing is sent anywhere. -->
<pre id="${id}" style="margin:0;display:inline-block;padding:6px 8px;background:${GROUND};color:${INK};font:12px/1.2 'Cascadia Mono',Consolas,Menlo,monospace"></pre>
<script>${js}</script>
<script>asciiAvatar.mount(document.getElementById(${JSON.stringify(id)}), ${scriptSafe(JSON.stringify(settings))});</script>
`;
}

/** embedHtml as a whole page whose avatar fills the window. */
export function embedPage(moduleJs: string, settings: Partial<AvatarSettings>): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ASCII avatar</title>
<style>html,body{margin:0;height:100%;background:${GROUND}}body{display:grid;place-items:center}</style>
</head>
<body>
${embedHtml(moduleJs, { ...settings, fit: true } as Partial<AvatarSettings>)}</body>
</html>
`;
}

// ---- in the browser ---------------------------------------------------------------------------------

/** What drawImage takes: a video, a canvas, an image. */
type Source = CanvasImageSource;

/** The few lines of the (non-standard) FaceDetector the finder uses. */
interface FaceDetectorLike { detect(src: Source): Promise<{ boundingBox: { x: number; y: number; width: number; height: number } }[]> }

/** The finder's small copy of the picture. */
export const FIND_W = 80, FIND_H = 60;

/** Finds the face in each frame and keeps a smoothed square on it (`box`, in the source picture). */
export class FaceFinder {
	ref: SkinRef = { ...SKIN_START };
	box: Box | null = null;
	/** How the face was found this frame, in words. */
	how = '';
	/** This frame's skin, FIND_W x FIND_H (for showing). */
	mask: Uint8Array = new Uint8Array(FIND_W * FIND_H);
	private cv: HTMLCanvasElement | null = null;
	private g: CanvasRenderingContext2D | null = null;
	private detector: FaceDetectorLike | null | undefined;
	private detected: { x: number; y: number; width: number; height: number } | null = null;
	private busy = false;

	/** The picture shrunk to FIND_W x FIND_H, RGBA. */
	small(src: Source, sw: number, sh: number): Uint8ClampedArray {
		if (!this.cv) {
			this.cv = document.createElement('canvas');
			this.cv.width = FIND_W; this.cv.height = FIND_H;
			this.g = this.cv.getContext('2d', { willReadFrequently: true });
		}
		this.g!.drawImage(src, 0, 0, sw, sh, 0, 0, FIND_W, FIND_H);
		return this.g!.getImageData(0, 0, FIND_W, FIND_H).data;
	}

	private faceDetector(): FaceDetectorLike | null {
		if (this.detector === undefined) {
			const FD = (globalThis as unknown as { FaceDetector?: new (o: object) => FaceDetectorLike }).FaceDetector;
			try { this.detector = FD ? new FD({ fastMode: true, maxDetectedFaces: 1 }) : null; } catch { this.detector = null; }
		}
		return this.detector;
	}

	/** Look for the face in this frame and move the box toward it; the box (unchanged if none is found). */
	update(src: Source, sw: number, sh: number, s: Pick<AvatarSettings, 'skin' | 'margin' | 'follow'>, useDetector = true): Box | null {
		let target: { cx: number; cy: number; size: number } | null = null;
		const fd = useDetector ? this.faceDetector() : null;
		if (fd) {
			if (!this.busy) {
				this.busy = true;
				fd.detect(src).then((fs) => { this.detected = fs[0]?.boundingBox ?? null; }, () => { this.detected = null; }).finally(() => { this.busy = false; });
			}
			const d = this.detected;
			if (d) { target = { cx: d.x + d.width / 2, cy: d.y + d.height / 2, size: Math.max(d.width, d.height) }; this.how = 'browser face detector'; }
		}
		const fx = FIND_W / sw, fy = FIND_H / sh;
		const win = this.box ? (() => { const m = this.box.s * 0.9; return { x0: (this.box.x - m) * fx, x1: (this.box.x + this.box.s + m) * fx, y0: (this.box.y - m) * fy, y1: (this.box.y + this.box.s + m) * fy }; })() : null;
		this.mask = skinMask(this.small(src, sw, sh), FIND_W, FIND_H, this.ref, s.skin, win);
		if (!target) {
			const near = this.box ? { x: (this.box.x + this.box.s / 2) * fx, y: (this.box.y + this.box.s / 2) * fy } : { x: FIND_W / 2, y: FIND_H / 2 };
			const p = bestPatch(this.mask, FIND_W, FIND_H, near, FIND_W * FIND_H * 0.006);
			if (p) {
				// A square round the patch, a little above its middle (the patch misses the hair).
				const w = (p.x1 - p.x0 + 1) / fx, h = (p.y1 - p.y0 + 1) / fy;
				target = { cx: p.cx / fx, cy: p.cy / fy - h * 0.08, size: Math.max(w, h * 0.85) };
				this.how = 'skin tone';
			}
		}
		if (!target) { this.how = 'no face found: holding'; return this.box; }
		const want = squareAround(target.cx, target.cy, target.size * s.margin, sw, sh);
		this.box = this.box ? follow(this.box, want, s.follow) : want;
		return this.box;
	}

	/** Learn skin's colour from the 5 x 5 patch round (fx, fy) (0..1 across the unmirrored picture) and put the box there. */
	teach(src: Source, sw: number, sh: number, fx: number, fy: number): boolean {
		const d = this.small(src, sw, sh);
		const x0 = Math.round(fx * FIND_W), y0 = Math.round(fy * FIND_H);
		let cb = 0, cr = 0, n = 0;
		for (let y = y0 - 2; y <= y0 + 2; y++) for (let x = x0 - 2; x <= x0 + 2; x++) {
			if (x < 0 || y < 0 || x >= FIND_W || y >= FIND_H) continue;
			const i = (x + y * FIND_W) * 4, c = ycc(d[i], d[i + 1], d[i + 2]);
			cb += c.cb; cr += c.cr; n++;
		}
		if (!n) return false;
		this.ref = { cb: cb / n, cr: cr / n, taught: true };
		this.box = squareAround(fx * sw, fy * sh, Math.min(sw, sh) * 0.35, sw, sh);
		return true;
	}

	reset() { this.ref = { ...SKIN_START }; this.box = null; this.detected = null; }
}

/** What one size of drawing remembers between frames. */
interface Memory { v: Float32Array; lo: number; hi: number; levels: Int8Array }

/** The drawing: a picture (and where the face is in it) to a frame of glyphs, smoothly from frame to frame. */
export class AsciiAvatar {
	s: AvatarSettings;
	finder = new FaceFinder();
	/** Where a click pinned the crop (source picture), used when not tracking. */
	pin: { x: number; y: number } | null = null;
	private mem = new Map<string, Memory>();
	private cv: HTMLCanvasElement | null = null;
	private g: CanvasRenderingContext2D | null = null;

	constructor(settings: Partial<AvatarSettings> = {}) { this.s = { ...DEFAULTS, ...settings }; }

	/** Change settings (any of them, any time). */
	set(p: Partial<AvatarSettings>) { Object.assign(this.s, p); }

	/** Forget the last frames and the face (after a new source, say). */
	forget() { this.mem.clear(); this.finder.box = null; }

	/** Where to crop this frame: the followed face if tracking, else the pinned or fixed square. */
	locate(src: Source, sw: number, sh: number): Box {
		if (this.s.track) {
			const b = this.finder.update(src, sw, sh, this.s, !(src instanceof HTMLCanvasElement));
			if (b) return { ...b };
		}
		return fixedCrop(sw, sh, this.s.zoom, this.s.lift, this.pin);
	}

	/** Draw the crop `c` of a picture `cols` cells wide (each size keeps its own memory of past frames). */
	draw(src: Source, c: Box, cols = this.s.cols): AvatarFrame {
		const s = this.s, rows = rowsFor(cols), w = cols, h = rows * 2;
		const k = Math.max(1, Math.min(4, Math.floor(192 / Math.max(w, h))));
		const W = w * k, H = h * k;
		if (!this.cv) { this.cv = document.createElement('canvas'); this.g = this.cv.getContext('2d', { willReadFrequently: true }); }
		const cv = this.cv, g = this.g!;
		if (cv.width !== W) cv.width = W;
		if (cv.height !== H) cv.height = H;
		g.save();
		if (s.mirror) { g.translate(W, 0); g.scale(-1, 1); }
		g.imageSmoothingEnabled = true;
		g.imageSmoothingQuality = 'high';
		g.drawImage(src, c.x, c.y, c.s, c.s, 0, 0, W, H);
		g.restore();
		const lum = boxDown(g.getImageData(0, 0, W, H).data, W, H, k);
		const key = w + 'x' + h;
		let m = this.mem.get(key);
		const e = exposure(m ? blend(m.v, lum, s.smooth, s.snap) : lum, w, h, s);
		if (!m) { m = { v: lum, lo: e.lo, hi: e.hi, levels: new Int8Array(w * h).fill(-1) }; this.mem.set(key, m); }
		else { m.lo += (e.lo - m.lo) * 0.3; m.hi += (e.hi - m.hi) * 0.3; }
		return toFrame(toLevels(m.v, w, h, s, m.lo, m.hi, m.levels), cols, rows, s);
	}

	/** One frame from a picture sw x sh: find the face, crop, draw. */
	frame(src: Source, sw: number, sh: number, cols = this.s.cols): AvatarFrame {
		return this.draw(src, this.locate(src, sw, sh), cols);
	}
}

/** The camera, video only. */
export class AvatarCamera {
	readonly video: HTMLVideoElement;
	stream: MediaStream | null = null;
	facing: 'user' | 'environment' = 'user';

	constructor(video?: HTMLVideoElement) {
		this.video = video ?? document.createElement('video');
		this.video.muted = true;
		this.video.playsInline = true;
	}

	/** Whether this page may ask for a camera at all (https, localhost or a file; and a browser that has one). */
	static get possible(): boolean { return !!(globalThis.navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

	/** Ask for the camera (laptop-sized, at most 640 x 480, 30 a second). Throws if refused or missing. */
	async start(facing: 'user' | 'environment' = this.facing): Promise<void> {
		if (this.stream && facing === this.facing) return;
		this.stop();
		if (!AvatarCamera.possible) throw Object.assign(new Error('The camera needs https or localhost'), { name: 'InsecureContext' });
		this.facing = facing;
		this.stream = await navigator.mediaDevices.getUserMedia({
			video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false
		});
		this.video.srcObject = this.stream;
		await this.video.play().catch(() => {});
	}

	/** Turn the camera off (its light goes out). */
	stop() {
		for (const t of this.stream?.getTracks() ?? []) t.stop();
		this.stream = null;
		this.video.srcObject = null;
	}

	/** True while there is a picture to draw. */
	get ready() { return !!this.stream && this.video.readyState >= 2 && this.video.videoWidth > 0; }
}

/**
 * A frame drawn as pixels on a canvas (sized to fit): for saving a PNG, recording a video with
 * canvas.captureStream(), or floating in picture in picture. `size` is the font's height in pixels.
 */
export function drawToCanvas(canvas: HTMLCanvasElement, f: AvatarFrame, o: { size?: number; bg?: string; colour?: boolean; font?: string } = {}) {
	const size = o.size ?? 16, cw = Math.ceil(size * 0.6), lh = Math.ceil(size * 1.2), pad = Math.ceil(size / 2);
	const W = f.cols * cw + 2 * pad, H = f.rows * lh + 2 * pad;
	if (canvas.width !== W) canvas.width = W;
	if (canvas.height !== H) canvas.height = H;
	const g = canvas.getContext('2d')!;
	g.fillStyle = o.bg ?? GROUND;
	g.fillRect(0, 0, W, H);
	g.font = `${size}px ${o.font ?? "'Cascadia Mono', Consolas, 'DejaVu Sans Mono', Menlo, monospace"}`;
	g.textBaseline = 'top';
	g.textAlign = 'center';
	const colour = o.colour ?? true;
	for (let y = 0; y < f.rows; y++) for (let x = 0; x < f.cols; x++) {
		const ch = f.lines[y][x];
		if (ch === ' ') continue;
		g.fillStyle = colour ? INKS[f.inks[x + y * f.cols]] : INK;
		g.fillText(ch, pad + x * cw + cw / 2, pad + y * lh + (lh - size) / 2);
	}
}

/**
 * The simplest use: start the front camera and draw the avatar into `el` (a <pre>, ideally), a few times
 * a second, until stop(). The camera goes off while the page is hidden and comes back when it is shown.
 * With `fit: true` the font is sized so the avatar fills el's parent. Nothing leaves the page.
 */
export function mount(el: HTMLElement, settings: Partial<AvatarSettings> & { fit?: boolean } = {}) {
	const { fit, ...rest } = settings;
	const avatar = new AsciiAvatar(rest);
	const camera = new AvatarCamera();
	let raf = 0, last = 0, stopped = false;
	const show = (msg: string) => { el.textContent = msg; };
	const begin = () => camera.start(avatar.s.facing).catch((e: Error) => show('No camera (' + (e && e.name || 'refused') + '). It needs https or localhost, and your permission.'));
	const loop = (t: number) => {
		raf = requestAnimationFrame(loop);
		if (t - last < 1000 / avatar.s.fps || !camera.ready) return;
		last = t;
		const f = avatar.frame(camera.video, camera.video.videoWidth, camera.video.videoHeight);
		if (fit && el.parentElement) {
			const p = el.parentElement;
			el.style.fontSize = Math.max(4, Math.min(p.clientWidth / (f.cols * 0.62), p.clientHeight / (f.rows * 1.2)) * 0.95).toFixed(1) + 'px';
		}
		el.innerHTML = f.html;
	};
	const vis = () => { if (stopped) return; if (document.hidden) camera.stop(); else begin(); };
	document.addEventListener('visibilitychange', vis);
	show('Starting the camera...');
	begin();
	raf = requestAnimationFrame(loop);
	return {
		avatar, camera,
		stop() { stopped = true; cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', vis); camera.stop(); }
	};
}
