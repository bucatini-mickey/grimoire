/**
 * faces.ts - players' faces as moving ASCII in the village (tools/ascii-face.html is the same drawing,
 * standalone, to try on its own).
 *
 * A phone that turns its camera on samples it a few times a second into a small grid of brightness
 * levels (FACE_W x FACE_H cells, a cell twice as tall as wide), one hex digit a cell: about two hundred
 * bytes a frame. That, not video, goes to the Storyteller's phone over the game's own link, which passes
 * each face on to whoever can hear its owner (everyone, when the town sits in the circle). Nothing is
 * kept; a phone that stops sending simply drops out.
 */
export const FACE_W = 20, FACE_H = 10;
/** Glyphs from dark to bright: plain ASCII, denser as the cell gets brighter. */
const RAMP = ' .,:;-=+*oa#%@';

/** The glyph for a cell's hex level (0..15). */
export const faceGlyph = (h: number) => RAMP[Math.round((h * (RAMP.length - 1)) / 15)];

/** A drawn face for a test villager (no camera): an oval, eyes that blink, a mouth that moves with `talk`. */
export function testFace(k: number, ms: number, talk: boolean): string {
	const out: string[] = [];
	const blink = ((ms + k * 977) / 3700) % 1 < 0.06;
	const look = Math.round(Math.sin((ms + k * 500) / 1300));
	for (let y = 0; y < FACE_H; y++) for (let x = 0; x < FACE_W; x++) {
		const dx = (x - 9.5) / 7.5, dy = (y - 5) / 4.6;
		const r = Math.hypot(dx, dy);
		let h = r < 1 ? Math.round(11 - r * 4) : Math.max(0, 3 - Math.round((r - 1) * 6));
		if (y <= 1 && r < 1.05) h = 3 + (k % 3); // hair
		if (y === 4 && [6, 7, 12, 13].includes(x - look)) h = blink ? 9 : 0;
		if (y === 7 && x >= 8 && x <= 11) h = talk && Math.floor(ms / 180) % 2 ? 0 : 4;
		out.push(Math.max(0, Math.min(15, h)).toString(16));
	}
	return out.join('');
}

/** This phone's camera, as cell frames. */
export class FaceCam {
	private video: HTMLVideoElement | null = null;
	private stream: MediaStream | null = null;
	private cv: HTMLCanvasElement | null = null;

	get on() { return !!this.stream; }

	/** Ask for the camera (video only); false if refused or missing. */
	async start(): Promise<boolean> {
		if (this.stream) return true;
		try {
			this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 160, height: 120, facingMode: 'user' }, audio: false });
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

	/** The picture now: the middle square, mirrored, as FACE_W x FACE_H hex levels stretched to its own range. */
	frame(): string | null {
		const v = this.video;
		if (!v || v.readyState < 2) return null;
		const W = FACE_W, H = FACE_H, cv = (this.cv ??= document.createElement('canvas'));
		cv.width = W; cv.height = H;
		const g = cv.getContext('2d', { willReadFrequently: true })!;
		const side = Math.min(v.videoWidth, v.videoHeight);
		g.save();
		g.translate(W, 0); g.scale(-1, 1);
		g.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, W, H);
		g.restore();
		const px = g.getImageData(0, 0, W, H).data;
		const lum = Array.from({ length: W * H }, (_, i) => 0.3 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.11 * px[i * 4 + 2]);
		const sorted = [...lum].sort((a, b) => a - b);
		const lo = sorted[Math.floor(lum.length * 0.03)], hi = sorted[Math.floor(lum.length * 0.97)];
		const span = Math.max(20, hi - lo);
		return lum.map((l) => Math.round(Math.min(1, Math.max(0, (l - lo) / span)) * 15).toString(16)).join('');
	}
}
