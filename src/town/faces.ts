/**
 * faces.ts - players' faces as moving ASCII in the village (tools/ascii-face.html is the same drawing,
 * standalone, to try your own camera with).
 *
 * A face is small: FACE_W x FACE_H cells. The trick that lets so few cells read as a face: each cell is
 * sampled twice, its top half and its bottom half (so the picture is FACE_W x 2*FACE_H samples, square,
 * as a cell is twice as tall as it is wide), and the glyph is chosen by shape as well as weight: ink high
 * in the cell (' " `) when only the top is bright, low (. , o) when only the bottom is, otherwise denser
 * glyphs for brighter cells. The picture is stretched to its own range and sharpened, so a dim room and
 * a small face still read.
 *
 * A phone that turns its camera on sends one hex digit a sample, 144 bytes a frame, a few times a second.
 * That, not video, goes to the Storyteller's phone over the game's own link, which passes each face on to
 * whoever can hear its owner (everyone, when the town sits in the circle). Nothing is kept.
 */
export const FACE_W = 12, FACE_H = 6;
/** Samples in a frame: two a cell, top then bottom. */
export const FACE_SAMPLES = FACE_W * FACE_H * 2;
/** Glyphs from faint to dense, for a cell whose halves are alike. */
const RAMP = ' .:-=+*#%@';

/** A cell from its top and bottom halves (levels 0..15): its glyph, and how bright its ink is (0..15). */
export function faceCell(t: number, b: number): { ch: string; level: number } {
	const level = Math.max(t, b);
	if (level < 2) return { ch: ' ', level };
	const d = t - b;
	if (d >= 5) return { ch: t >= 11 ? '"' : t >= 7 ? "'" : '`', level };
	if (d <= -5) return { ch: b >= 11 ? 'o' : b >= 7 ? ',' : '.', level };
	return { ch: RAMP[Math.round(((t + b) / 30) * (RAMP.length - 1))], level };
}

/** The cell at (x, y) of a frame (hex levels, row by row of samples) `w` cells wide (a face's, unless said). */
export function cellOf(f: string, x: number, y: number, w = FACE_W) {
	return faceCell(parseInt(f[x + 2 * y * w], 16), parseInt(f[x + (2 * y + 1) * w], 16));
}

/**
 * The part of a camera's picture (vw x vh) to show in a tile of the given shape (width / height): as
 * large as fits in 80% of the picture, centred across, a little above the middle (where a face is).
 */
export function crop(vw: number, vh: number, aspect: number): { sx: number; sy: number; sw: number; sh: number } {
	const sh = Math.min(vh, vw / aspect) * 0.8, sw = sh * aspect;
	return { sx: (vw - sw) / 2, sy: Math.max(0, (vh - sh) / 2 - sh * 0.06), sw, sh };
}

/**
 * Where a face found in the camera's picture (box: 0..1 across and down, unmirrored) sits in a letters tile
 * of tw x th cells (cropped as crop() does, mirrored): the oval that hides your own face, and the drawn face
 * (cells from drawRig) with its eyes at your eyes. Your face's real shape is hidden; your outline is not.
 */
export function faceOver<C>(box: { x: number; y: number; w: number; h: number }, vw: number, vh: number, tw: number, th: number, cells: C[][]) {
	const c = crop(vw, vh, tw / (th * 2));
	const cx = (1 - ((box.x + box.w / 2) * vw - c.sx) / c.sw) * tw;
	const top = ((box.y * vh - c.sy) / c.sh) * th, hc = (box.h * vh / c.sh) * th;
	// Eyes about 40% down the face (the box runs brow to chin), the mouth under them.
	const ah = cells.length, aw = cells[0]?.length ?? 0;
	const x = Math.round(cx - aw / 2), y = Math.round(top + hc * 0.4 - 0.5) - (ah > 2 ? 1 : 0);
	// The blank behind it hugs the drawn face (17 Nov: the oval over the whole face was too big): the 3 x 2
	// small face's own cells, a little more only for a face that fills much of the tile.
	const rx = Math.max(1.9, (box.w * vw / c.sw) * tw * 0.3), ry = Math.max(1.3, hc * 0.3);
	return { cx: x + aw / 2, cy: y + ah / 2, rx, ry, cells, x, y };
}

/** Whether cell (x, y) is inside the blank behind a drawn face (faceOver's or overAt's oval). */
export const inOval = (o: { cx: number; cy: number; rx: number; ry: number }, x: number, y: number) =>
	((x + 0.5 - o.cx) / o.rx) ** 2 + ((y + 0.5 - o.cy) / o.ry) ** 2 <= 1;

/**
 * Whether cell (x, y) of a letters tile belongs to the person in it, as far as their face tells: a head
 * round the drawn face and shoulders widening below it (18 Nov: drawn in their colour, the rest of the
 * picture quietened, so the person stands out from a busy room).
 */
export function inFigure(o: { cx: number; cy: number; rx: number; ry: number }, x: number, y: number): boolean {
	const px = x + 0.5, py = y + 0.5;
	if (((px - o.cx) / (o.rx * 1.25 + 0.4)) ** 2 + ((py - o.cy) / (o.ry * 1.5 + 0.3)) ** 2 <= 1) return true;
	const neck = o.cy + o.ry * 0.9;
	return py > neck && Math.abs(px - o.cx) <= o.rx * 1.1 + (py - neck) * 1.6;
}

/** A letters cell behind the person: only faint marks, so the room is there but does not crowd them. */
export function quietCell(level: number): string {
	return level < 6 ? ' ' : level < 10 ? '.' : level < 13 ? ':' : '+';
}

/**
 * A frame (w x h cells, two samples a cell) with the cells inside the oval blanked: what a Letters phone
 * sends, so your own face never leaves it (the drawn face goes there on every phone, from your numbers).
 */
export function hideFace(frame: string, w: number, h: number, o: { cx: number; cy: number; rx: number; ry: number }): string {
	const a = frame.split('');
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inOval(o, x, y)) { a[x + 2 * y * w] = '0'; a[x + (2 * y + 1) * w] = '0'; }
	return a.join('');
}

/** A frame w0 x h0 cells drawn at w x h cells (nearest sample): a sent Letters picture in a tile of any size. */
export function resample(frame: string, w0: number, h0: number, w: number, h: number): string {
	let out = '';
	for (let y = 0; y < h * 2; y++) for (let x = 0; x < w; x++) {
		const sx = Math.min(w0 - 1, Math.floor(((x + 0.5) * w0) / w)), sy = Math.min(h0 * 2 - 1, Math.floor(((y + 0.5) * h0 * 2) / (h * 2)));
		out += frame[sx + sy * w0];
	}
	return out;
}

/** A sent face's place (`at`: its top left in a w0 x h0 frame) in a tile tw x th, with the blank behind it. */
export function overAt<C>(at: [number, number], w0: number, h0: number, tw: number, th: number, cells: C[][]) {
	const ah = cells.length, aw = cells[0]?.length ?? 0;
	const x = Math.round(((at[0] + aw / 2) * tw) / w0 - aw / 2), y = Math.round(((at[1] + ah / 2) * th) / h0 - ah / 2);
	return { cx: x + aw / 2, cy: y + ah / 2, rx: 1.9, ry: 1.3, cells, x, y };
}

/** Brightness samples (0..255) to a frame: stretched to the picture's own range, a little sharpened. */
export function toFrame(lum: ArrayLike<number>, w: number, h: number): string {
	const sorted = Array.from(lum).sort((a, b) => a - b);
	const lo = sorted[Math.floor(lum.length * 0.04)], hi = sorted[Math.floor(lum.length * 0.96)];
	const span = Math.max(24, hi - lo);
	const n = (i: number) => (lum[i] - lo) / span;
	let out = '';
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		const i = x + y * w;
		let s = 0, k = 0;
		for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const xx = x + dx, yy = y + dy;
			if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += n(xx + yy * w); k++; }
		}
		const v = Math.min(1, Math.max(0, n(i) + (n(i) - s / k) * 0.7));
		out += Math.round(v * 15).toString(16);
	}
	return out;
}

/** A drawn face for a test villager (no camera): an oval, eyes that blink, a mouth that moves with `talk`. */
export function testFace(k: number, ms: number, talk: boolean): string {
	const W = FACE_W, H = FACE_H * 2;
	const lum: number[] = [];
	const blink = ((ms + k * 977) / 3700) % 1 < 0.06;
	const look = Math.round(Math.sin((ms + k * 500) / 1300) * 0.6);
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
		const r = Math.hypot((x - 5.5) / 4.6, (y - 6) / 5.4);
		let v = r < 1 ? 200 - r * 60 : 30;
		if (y <= 2 && r < 1.1) v = 60 + (k % 3) * 20; // hair
		if (y === 5 && [3, 4, 7, 8].includes(x - look) && !blink) v = 10;
		if (y === 9 && x >= 4 && x <= 7) v = talk && Math.floor(ms / 180) % 2 ? 10 : 90;
		lum.push(v);
	}
	return toFrame(lum, W, H);
}

/** This phone's camera, as frames. */
export class FaceCam {
	private video: HTMLVideoElement | null = null;
	private stream: MediaStream | null = null;
	private cv: HTMLCanvasElement | null = null;

	get on() { return !!this.stream; }
	/** The camera's live picture, on this phone only (null while off or starting). */
	get picture(): HTMLVideoElement | null { return this.video && this.video.readyState >= 2 ? this.video : null; }

	/** Ask for the camera (video only); false if refused or missing. */
	async start(): Promise<boolean> {
		if (this.stream) return true;
		try {
			this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
		} catch {
			return false;
		}
		const v = document.createElement('video');
		v.muted = true;
		v.playsInline = true;
		v.srcObject = this.stream;
		// On the page but out of sight: some phone browsers give no frames from a video that is not on it.
		v.setAttribute('aria-hidden', 'true');
		v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1';
		document.body.appendChild(v);
		await v.play().catch(() => {});
		this.video = v;
		return true;
	}

	stop() {
		for (const t of this.stream?.getTracks() ?? []) t.stop();
		this.stream = null;
		this.video?.remove();
		this.video = null;
	}

	/** The picture now: a square round the middle (a little high, where a face is), mirrored, as a frame. */
	frame(): string | null {
		const lum = this.lum(FACE_W, FACE_H * 2);
		return lum && toFrame(lum, FACE_W, FACE_H * 2);
	}

	private still: HTMLCanvasElement | null = null;
	/**
	 * A copy of the picture now, kept until the next copy: the tracker reads it and the letters are drawn
	 * from it, so the face drawn over the letters sits on the very frame it was found in (17 Nov: a live
	 * picture under a face found a moment before left the face on your shoulder as you moved).
	 */
	snap(): HTMLCanvasElement | null {
		const v = this.picture;
		if (!v || !v.videoWidth) return null;
		const c = (this.still ??= document.createElement('canvas'));
		if (c.width !== v.videoWidth) c.width = v.videoWidth;
		if (c.height !== v.videoHeight) c.height = v.videoHeight;
		c.getContext('2d')!.drawImage(v, 0, 0);
		return c;
	}
	/** The last copy snap() made (null before the first, or once the camera is off). */
	get lastSnap(): HTMLCanvasElement | null { return this.stream ? this.still : null; }

	/**
	 * The picture now (or the copy `from`) as w x h brightness samples (0..255), cropped to that shape,
	 * mirrored; null while off.
	 */
	lum(w: number, h: number, from?: HTMLCanvasElement | null): number[] | null {
		const live = this.picture;
		const v: HTMLCanvasElement | HTMLVideoElement | null = from ?? live;
		if (!v) return null;
		const vw = from ? from.width : live!.videoWidth, vh = from ? from.height : live!.videoHeight;
		const cv = (this.cv ??= document.createElement('canvas'));
		if (cv.width !== w) cv.width = w;
		if (cv.height !== h) cv.height = h;
		const g = cv.getContext('2d', { willReadFrequently: true })!;
		const c = crop(vw, vh, w / h);
		g.save();
		g.translate(w, 0); g.scale(-1, 1);
		g.drawImage(v, c.sx, c.sy, c.sw, c.sh, 0, 0, w, h);
		g.restore();
		const px = g.getImageData(0, 0, w, h).data;
		return Array.from({ length: w * h }, (_, i) => 0.3 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.11 * px[i * 4 + 2]);
	}
}
