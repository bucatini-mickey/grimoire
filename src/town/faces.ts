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

/** The cell at (x, y) of a frame (hex levels, row by row of samples). */
export function cellOf(f: string, x: number, y: number) {
	return faceCell(parseInt(f[x + 2 * y * FACE_W], 16), parseInt(f[x + (2 * y + 1) * FACE_W], 16));
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
		await v.play().catch(() => {});
		this.video = v;
		return true;
	}

	stop() {
		for (const t of this.stream?.getTracks() ?? []) t.stop();
		this.stream = null;
		this.video = null;
	}

	/** The picture now: a square round the middle (a little high, where a face is), mirrored, as a frame. */
	frame(): string | null {
		const v = this.video;
		if (!v || v.readyState < 2) return null;
		const W = FACE_W, H = FACE_H * 2, cv = (this.cv ??= document.createElement('canvas'));
		cv.width = W; cv.height = H;
		const g = cv.getContext('2d', { willReadFrequently: true })!;
		const side = Math.min(v.videoWidth, v.videoHeight) * 0.8;
		g.save();
		g.translate(W, 0); g.scale(-1, 1);
		g.drawImage(v, (v.videoWidth - side) / 2, Math.max(0, (v.videoHeight - side) / 2 - side * 0.06), side, side, 0, 0, W, H);
		g.restore();
		const px = g.getImageData(0, 0, W, H).data;
		return toFrame(Array.from({ length: W * H }, (_, i) => 0.3 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.11 * px[i * 4 + 2]), W, H);
	}
}
