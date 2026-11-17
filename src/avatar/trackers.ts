/**
 * trackers.ts - face trackers that turn a camera's picture into a Rig (rig.ts): the few numbers the
 * webcam avatar is drawn from. The picture stays in the page; only the Rig is ever sent.
 *
 * Three trackers, to compare (docs/avatar-trackers.md has the measurements):
 *   landmarker  MediaPipe Face Landmarker: 478 points and 52 blendshapes (blink, jaw, smile, gaze) and the
 *               head's pose. The most it can tell; about 6 MB to download (the runtime and the model),
 *               loaded only when the camera is turned on.
 *   blazeface   MediaPipe's BlazeFace detector: a box and six points (eyes, nose, mouth, ears), so the
 *               head's turn, tip and lean; eyes and mouth from the pixels round those points (heuristics
 *               below). A 230 KB model, but the same 2.3 MB runtime as the landmarker.
 *   pixel       nothing to download: the face found by skin tone (or the browser's own FaceDetector)
 *               as in asciiavatar.ts, eyes and mouth guessed from where they usually are in the face's
 *               box, the same pixel heuristics; turn from where the face's dark features sit.
 * If a tracker cannot be loaded (offline, a blocked download) the caller falls back to pixel, or to the
 * picture avatar of asciiavatar.ts.
 *
 * The pure part (raw measures to a Rig, smoothing, the heuristics on small grey patches, poses from a
 * matrix or from points) is tested in tests/avatar.rig.test.ts; the classes at the bottom need a browser.
 */
import type { Rig } from './rig.ts';
import { RIG_KEYS } from './rig.ts';
import { FaceFinder } from './asciiavatar.ts';

// ---- raw measures to a rig ------------------------------------------------------------------------------

/**
 * What a tracker measures, before it is squeezed into digits. Eyes and mouth 0 (shut) .. 1 (open; eyes
 * may go above 1 when wide); smile -1..1; angles in degrees; gaze -1..1. All in the mirror's terms: left
 * and right as drawn (the player's right is the drawing's right), so the avatar moves as a mirror would.
 */
export interface Raw {
	eyeL: number; eyeR: number; mouth: number; smile: number;
	yaw: number; pitch: number; roll: number; gazeX: number; gazeY: number;
	/** Brows -1 (down, a frown) .. 1 (raised). */
	browL: number; browR: number;
}
export const RAW_ZERO: Raw = { eyeL: 1, eyeR: 1, mouth: 0, smile: 0, yaw: 0, pitch: 0, roll: 0, gazeX: 0, gazeY: 0, browL: 0, browR: 0 };

/** How raw measures become digits: the angles and amounts that reach the ends of the scale. */
export interface Gains {
	/** Degrees of turn, tip and lean that reach the end (7 steps from the middle). */
	yawDeg: number; pitchDeg: number; rollDeg: number;
	/** Gaze and smile that reach the end. */
	gaze: number; smile: number;
	/** Mouth openness that reaches 15. */
	mouth: number;
	/** Brow movement that reaches the end. */
	brow: number;
}
export const GAINS: Gains = { yawDeg: 35, pitchDeg: 25, rollDeg: 30, gaze: 0.6, smile: 0.5, mouth: 0.7, brow: 0.45 };

/** Flips, for when a camera or a tracker has a side the wrong way round (the test page has a switch each). */
export interface Flips { eyes: boolean; yaw: boolean; pitch: boolean; roll: boolean; gazeX: boolean; gazeY: boolean; }
export const NO_FLIPS: Flips = { eyes: false, yaw: false, pitch: false, roll: false, gazeX: false, gazeY: false };

/** The resting face, taken by "Neutral": what to subtract so that it draws as the middle. */
export interface Neutral { yaw: number; pitch: number; roll: number; gazeX: number; gazeY: number; smile: number; browL?: number; browR?: number; }
export const NO_NEUTRAL: Neutral = { yaw: 0, pitch: 0, roll: 0, gazeX: 0, gazeY: 0, smile: 0, browL: 0, browR: 0 };

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const sgn = (v: number, ends: number) => 8 + clamp(v / ends, -1, 1) * 7;

/** Raw measures to a rig's values (not yet whole: the smoother rounds them, with hysteresis). */
export function rigOf(raw: Raw, g: Gains = GAINS, n: Neutral = NO_NEUTRAL, f: Flips = NO_FLIPS): Rig {
	const flip = (on: boolean, v: number) => (on ? -v : v);
	const [l, r] = f.eyes ? [raw.eyeR, raw.eyeL] : [raw.eyeL, raw.eyeR];
	const [bl, br] = f.eyes ? [raw.browR, raw.browL] : [raw.browL, raw.browR];
	return {
		eyeL: clamp(l * 11, 0, 15),
		eyeR: clamp(r * 11, 0, 15),
		mouth: clamp((raw.mouth / g.mouth) * 15, 0, 15),
		smile: sgn(raw.smile - n.smile, g.smile),
		yaw: sgn(flip(f.yaw, raw.yaw - n.yaw), g.yawDeg),
		pitch: sgn(flip(f.pitch, raw.pitch - n.pitch), g.pitchDeg),
		// Head roll (a lean) is not sent (Jason, 17 Nov): always level. The drawing still knows a lean; turn it
		// back on here with: sgn(flip(f.roll, raw.roll - n.roll), g.rollDeg).
		roll: 8,
		gazeX: sgn(flip(f.gazeX, raw.gazeX - n.gazeX), g.gaze),
		gazeY: sgn(flip(f.gazeY, raw.gazeY - n.gazeY), g.gaze),
		browL: sgn((bl ?? 0) - (n.browL ?? 0), g.brow),
		browR: sgn((br ?? 0) - (n.browR ?? 0), g.brow)
	};
}

/**
 * Smooths a rig from frame to frame and rounds it to digits. Each value eases toward the new one (eyes and
 * mouth fast, so a blink is not lost; the head's pose and gaze slower, so they do not tremble), and a digit
 * changes only once the value is clearly past the next one (`hold` of a step), so a still face holds still.
 * `amount` 0 turns smoothing off; 1 is the usual; 2 twice as smooth.
 */
export class RigSmoother {
	private v: Rig | null = null;
	private d: Rig | null = null;
	amount = 1;
	hold = 0.6;
	static readonly SPEED: Rig = { eyeL: 0.75, eyeR: 0.75, mouth: 0.7, smile: 0.4, yaw: 0.4, pitch: 0.4, roll: 0.4, gazeX: 0.35, gazeY: 0.35, browL: 0.5, browR: 0.5 };

	push(r: Rig): Rig {
		if (!this.v || !this.d) {
			this.v = { ...r };
			this.d = {} as Rig;
			for (const k of RIG_KEYS) this.d[k] = Math.round(r[k]);
			return { ...this.d };
		}
		for (const k of RIG_KEYS) {
			const a = this.amount <= 0 ? 1 : Math.pow(RigSmoother.SPEED[k], this.amount);
			// A blink closes faster than it opens: the shutting is what has to show.
			const fast = (k === 'eyeL' || k === 'eyeR') && r[k] < this.v[k] ? Math.max(a, 0.9) : a;
			this.v[k] += (r[k] - this.v[k]) * fast;
			const cur = this.d[k];
			if (Math.abs(this.v[k] - cur) > (this.amount <= 0 ? 0.5 : this.hold)) this.d[k] = Math.round(this.v[k]);
		}
		return { ...this.d };
	}
	reset() { this.v = null; this.d = null; }
}

// ---- head pose ------------------------------------------------------------------------------------

const DEG = 180 / Math.PI;

/**
 * Yaw, pitch and roll in degrees from a 4x4 transform (column-major, as MediaPipe gives it), in the
 * mirror's terms: yaw above 0 turns toward the drawing's right, pitch above 0 tips up, roll above 0 leans
 * clockwise on the screen.
 */
export function poseFromMatrix(m: ArrayLike<number>): { yaw: number; pitch: number; roll: number } {
	const R = (i: number, j: number) => m[j * 4 + i];
	const yaw = Math.asin(clamp(-R(2, 0), -1, 1)) * DEG;
	const pitch = Math.atan2(R(2, 1), R(2, 2)) * DEG;
	const roll = Math.atan2(R(1, 0), R(0, 0)) * DEG;
	// The camera's picture is unmirrored; the avatar is a mirror: a turn changes sides. Tip and lean as
	// checked on Lavender (14 Nov: both read the wrong way round before).
	return { yaw: -yaw, pitch: -pitch, roll };
}

/** A point, 0..1 across and down the picture as the camera gives it (unmirrored). */
export interface Pt { x: number; y: number; }

/**
 * Turn, tip and lean from BlazeFace's points (unmirrored picture): the lean is the slope of the line
 * between the eyes; the turn is how far the nose sits from the eyes' midpoint, as a share of the eyes'
 * distance apart; the tip is where the nose sits between the eyes and the mouth (`rest`: its share at
 * rest, about 0.5).
 */
export function poseFromPoints(a: { eyeA: Pt; eyeB: Pt; nose: Pt; mouth: Pt }, aspect = 4 / 3, rest = 0.5): { yaw: number; pitch: number; roll: number } {
	// Mirror, and square the units (x is across a wider picture).
	const P = (p: Pt) => ({ x: (1 - p.x) * aspect, y: p.y });
	let l = P(a.eyeA), r = P(a.eyeB);
	if (l.x > r.x) [l, r] = [r, l];
	const n = P(a.nose), mo = P(a.mouth);
	const dx = r.x - l.x, dy = r.y - l.y, d = Math.hypot(dx, dy) || 1e-6;
	const roll = Math.atan2(dy, dx) * DEG;
	const mid = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
	// Measure along and across the eye line, so a lean does not read as a turn.
	const ux = dx / d, uy = dy / d;
	const along = ((n.x - mid.x) * ux + (n.y - mid.y) * uy) / d;
	const down = (q: { x: number; y: number }) => (-(q.x - mid.x) * uy + (q.y - mid.y) * ux);
	const share = down(n) / (down(mo) || 1e-6);
	const yaw = Math.asin(clamp(along / 0.55, -1, 1)) * DEG;
	const pitch = (rest - share) * 160;
	return { yaw, pitch, roll };
}

// ---- MediaPipe's blendshapes to raw measures --------------------------------------------------------------

/** A blendshape score as MediaPipe gives them. */
export interface Category { categoryName: string; score: number; }

/**
 * Raw measures from Face Landmarker's blendshapes (and its transform, for the pose). MediaPipe names sides
 * from the player's point of view, which is the mirror's too: eyeBlinkLeft is the player's left eye,
 * drawn on the left.
 */
export function rawFromBlendshapes(cats: Category[], matrix?: ArrayLike<number> | null, shut = 0.55, lm?: Pt[] | null): Raw {
	const s: Record<string, number> = {};
	for (const c of cats) s[c.categoryName] = c.score;
	const v = (k: string) => s[k] ?? 0;
	// Open from blink: a score under ~0.1 is wide awake, past `shut` is shut; wide adds to it.
	const open = (blink: number, wide: number) => clamp((shut - blink) / (shut - 0.08), 0, 1) + wide * 0.4;
	const pose = matrix && matrix.length >= 16 ? poseFromMatrix(matrix) : { yaw: 0, pitch: 0, roll: 0 };
	// Talking barely moves the jaw: the gap between the lips (its share of the face's height) shows it.
	let gap = 0;
	if (lm && lm.length > 152) {
		const faceH = Math.hypot(lm[10].x - lm[152].x, lm[10].y - lm[152].y) || 1;
		gap = clamp((Math.hypot(lm[13].x - lm[14].x, lm[13].y - lm[14].y) / faceH - 0.012) / 0.12, 0, 1);
	}
	// Frowns score low in MediaPipe: counted three times; a pressed mouth and a pushed-up lower lip (a pout)
	// a little too. Sadness also lifts the brows' inner ends (17 Nov: sad was hard to show): that counts
	// toward a frown, but not while the mouth is open or smiling (surprise and laughter lift them too).
	const smileAvg = (v('mouthSmileLeft') + v('mouthSmileRight')) / 2;
	// Surprise lifts the whole brow and widens the eyes; sadness lifts only the inner ends (17 Nov: a
	// surprised face read as sad). So only the inner lift past the outer counts, and not with wide eyes.
	const outerUp = (v('browOuterUpLeft') + v('browOuterUpRight')) / 2, wideEyes = (v('eyeWideLeft') + v('eyeWideRight')) / 2;
	const sadBrows = Math.max(0, v('browInnerUp') - outerUp * 1.2) * 0.45 * clamp(1 - v('jawOpen') * 3, 0, 1)
		* clamp(1 - smileAvg * 3, 0, 1) * clamp(1 - wideEyes * 3, 0, 1);
	const frown = (v('mouthFrownLeft') + v('mouthFrownRight')) * 1.5 + (v('mouthPressLeft') + v('mouthPressRight')) * 0.25
		+ v('mouthShrugLower') * 0.3 * clamp(1 - wideEyes * 3, 0, 1) + sadBrows;
	// Brows: raised by the outer and the inner lifts, lowered by the brow-down shapes.
	const brow = (outer: number, down: number) => outer * 0.6 + v('browInnerUp') * 0.6 - down * 1.2;
	return {
		eyeL: open(v('eyeBlinkLeft'), v('eyeWideLeft')),
		eyeR: open(v('eyeBlinkRight'), v('eyeWideRight')),
		mouth: Math.max(v('jawOpen') * 1.4, gap),
		smile: smileAvg - frown,
		browL: brow(v('browOuterUpLeft'), v('browDownLeft')),
		browR: brow(v('browOuterUpRight'), v('browDownRight')),
		...pose,
		// The player's left eye looking out looks to their left (the drawing's left); looking in, to the right.
		gazeX: (v('eyeLookInLeft') + v('eyeLookOutRight') - v('eyeLookOutLeft') - v('eyeLookInRight')) / 2,
		gazeY: (v('eyeLookUpLeft') + v('eyeLookUpRight') - v('eyeLookDownLeft') - v('eyeLookDownRight')) / 2
	};
}

// ---- pixel heuristics (BlazeFace and pixel trackers) ------------------------------------------------------

/**
 * How dark each sample of a small grey patch is, against the patch's own middle brightness: 0 for anything
 * at or above the median, up to 1 for black. Lighting falls away: only the dark against the face counts.
 */
export function darkness(lum: ArrayLike<number>): Float32Array {
	const sorted = Float32Array.from(lum).sort();
	const med = Math.max(8, sorted[Math.floor(sorted.length * 0.6)]);
	const out = new Float32Array(lum.length);
	for (let i = 0; i < lum.length; i++) out[i] = clamp((med - lum[i]) / med, 0, 1);
	return out;
}

/**
 * An eye patch (w x h grey samples, the eye in the middle) to how open it looks and where it looks.
 * Open eyes show a dark iris and pupil over several rows; a shut eye only a thin line of lashes. So:
 * `open` is the dark's height (rows whose darkest third is clearly dark) as a share of the patch,
 * `look` the dark's middle across (-1 left .. 1 right, unmirrored) and `lookY` down it.
 */
export function eyeMeasure(lum: ArrayLike<number>, w: number, h: number): { open: number; look: number; lookY: number; mass: number } {
	const d = darkness(lum);
	let rows = 0, mass = 0, sx = 0, sy = 0;
	for (let y = 0; y < h; y++) {
		const row = Array.from(d.subarray(y * w, y * w + w)).sort((a, b) => b - a);
		const third = row.slice(0, Math.max(1, Math.floor(w / 3)));
		if (third.reduce((a, b) => a + b, 0) / third.length > 0.28) rows++;
		for (let x = 0; x < w; x++) {
			const k = d[x + y * w];
			const q = k * k;
			mass += q; sx += q * x; sy += q * y;
		}
	}
	const cx = mass > 0 ? sx / mass : (w - 1) / 2, cy = mass > 0 ? sy / mass : (h - 1) / 2;
	return { open: rows / h, look: clamp((cx - (w - 1) / 2) / ((w - 1) / 2), -1, 1), lookY: clamp((cy - (h - 1) / 2) / ((h - 1) / 2), -1, 1), mass: mass / (w * h) };
}

/**
 * A mouth patch (w x h, the mouth across its middle) to how open and how wide it looks: an open mouth is a
 * dark hole several rows tall; a smile is the dark line of the lips stretched wider. `open` is the dark's
 * height as a share of the patch; `wide` the widest dark run's share of the width.
 */
export function mouthMeasure(lum: ArrayLike<number>, w: number, h: number): { open: number; wide: number } {
	const d = darkness(lum);
	let rows = 0, wide = 0;
	for (let y = 0; y < h; y++) {
		let run = 0, best = 0, dark = 0;
		for (let x = 0; x < w; x++) {
			const k = d[x + y * w];
			if (k > 0.3) { run++; dark++; best = Math.max(best, run); } else run = 0;
		}
		if (dark >= w * 0.25) rows++;
		wide = Math.max(wide, best / w);
	}
	return { open: rows / h, wide };
}

/**
 * Learns a measure's range as it goes, so a heuristic's raw number becomes 0..1 for this face, this light,
 * this camera: `lo` and `hi` follow the lowest and highest values seen, each sliding slowly back toward the
 * middle so an old extreme is forgotten in a few seconds.
 */
export class Range {
	lo = Infinity;
	hi = -Infinity;
	forget: number;
	min: number;
	constructor(forget = 0.004, min = 0.05) { this.forget = forget; this.min = min; }
	push(v: number): number {
		if (!Number.isFinite(v)) return 0.5;
		if (this.lo === Infinity) { this.lo = v; this.hi = v; }
		this.lo = Math.min(v, this.lo + (this.hi - this.lo) * this.forget);
		this.hi = Math.max(v, this.hi - (this.hi - this.lo) * this.forget);
		const span = Math.max(this.min, this.hi - this.lo);
		return clamp((v - this.lo) / span, 0, 1);
	}
	reset() { this.lo = Infinity; this.hi = -Infinity; }
}

// ---- resting levels: brows behind glasses, a face that rests smiling or not --------------------------------

/**
 * Measures each face rests at differently: brows (glasses' frames sit near them, and some faces rest with
 * brows high or low) and the smile (a resting face is rarely exactly neutral). Each is measured against its
 * own resting level, learnt as it goes: quickly in the first second, then slowly, and only from values near
 * it, so a held frown or smile is not learnt away. A steady offset reads as rest; only movement shows.
 */
export class Recentre {
	private rest: Record<'browL' | 'browR' | 'smile', number> | null = null;
	private n = 0;
	/** How far the resting level may drift from zero (it is a correction, not a reading). */
	limit = 0.5;
	push(raw: Raw): Raw {
		const keys = ['browL', 'browR', 'smile'] as const;
		if (!this.rest) this.rest = { browL: raw.browL, browR: raw.browR, smile: raw.smile };
		this.n++;
		const out = { ...raw };
		for (const k of keys) {
			const v = raw[k], r = this.rest[k];
			// After the first moments, the resting smile is never learnt downward: a mild frown held a while
			// stays a frown (17 Nov: sad was being learnt away).
			const rate = this.n < 15 ? 0.2 : Math.abs(v - r) < 0.2 && !(k === 'smile' && v < r - 0.04) ? 0.01 : 0;
			this.rest[k] = clamp(r + (v - r) * rate, -this.limit, this.limit);
			out[k] = v - this.rest[k];
		}
		return out;
	}
	reset() { this.rest = null; this.n = 0; }
}

// ---- browser trackers -------------------------------------------------------------------------------------

/** Where MediaPipe comes from (a fixed version, from the jsDelivr CDN; the models from Google's bucket). */
export const MP_VERSION = '0.10.35';
export const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
export const MODEL_URL = {
	landmarker: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
	blazeface: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
};

export type TrackerName = 'landmarker' | 'blazeface' | 'pixel';
export const TRACKER_NAMES: TrackerName[] = ['landmarker', 'blazeface', 'pixel'];
export const TRACKER_LABEL: Record<TrackerName, string> = { landmarker: 'Face Landmarker', blazeface: 'BlazeFace + pixels', pixel: 'Pixels only' };

/** What one frame gave: the measures (null when no face was found) and, for showing, the points used. */
export interface Track { raw: Raw | null; points: Pt[]; box: { x: number; y: number; w: number; h: number } | null; ms: number; note?: string; }

/** What loading a tracker cost. */
export interface Loaded { bytes: number; ms: number; files: { url: string; bytes: number }[]; note: string; }

export interface Tracker {
	readonly name: TrackerName;
	load(): Promise<Loaded>;
	/** One frame from a video or canvas (sw x sh), at time `t` (ms, increasing). */
	track(src: HTMLVideoElement | HTMLCanvasElement, sw: number, sh: number, t: number): Track;
	/** Forget the learnt ranges (a new face, new light). */
	relearn(): void;
	close(): void;
}

// The dynamic import stays a dynamic import: esbuild leaves a computed URL alone, so MediaPipe is not
// bundled and nothing is fetched until a tracker is loaded.
const load = (u: string) => import(/* @vite-ignore */ u) as Promise<any>;

let vision: Promise<{ mod: any; fileset: any }> | null = null;
/** MediaPipe's vision runtime, once per page. */
function visionRuntime() {
	return (vision ??= (async () => {
		const mod = await load(`${MP_BASE}/vision_bundle.mjs`);
		const fileset = await mod.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
		return { mod, fileset };
	})().catch((e) => { vision = null; throw e; }));
}

/**
 * A MediaPipe task (Face Landmarker or Face Detector), on the CPU on every device (17 Nov). The GPU is a
 * little faster where it works, but where it does not it can fail mid-run, not at start (Rosemary: "reading
 * 'activeTexture'", then "memory access out of bounds" and nonsense after), and the CPU gives the same
 * answers: about 33 ms a frame for the Landmarker on Rosemary, enough for the village's 15 a second.
 */
class MpTask {
	private task: any = null;
	async start(make: (d: 'CPU') => Promise<any>): Promise<string> {
		this.task = await make('CPU');
		return 'CPU';
	}
	/** One frame's result. Throws if MediaPipe fails: the caller says so (never a quiet "no face"). */
	detect(src: HTMLVideoElement | HTMLCanvasElement, t: number): any | null {
		return this.task ? this.task.detectForVideo(src, t) : null;
	}
	readonly note: string | undefined = undefined;
	close() { try { this.task?.close?.(); } catch { /* gone */ } this.task = null; }
}

/** A model's bytes, fetched here so its size is known exactly. */
async function fetchModel(url: string): Promise<Uint8Array> {
	const r = await fetch(url);
	if (!r.ok) throw new Error(`${url}: ${r.status}`);
	return new Uint8Array(await r.arrayBuffer());
}

/** What the page has downloaded from these hosts, by the browser's own count (compressed, as sent). */
export function downloaded(match: (u: string) => boolean): { url: string; bytes: number }[] {
	const seen = new Map<string, number>();
	for (const e of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
		if (!match(e.name)) continue;
		const b = e.transferSize || e.encodedBodySize || 0;
		seen.set(e.name, Math.max(seen.get(e.name) ?? 0, b));
	}
	return [...seen].map(([url, bytes]) => ({ url, bytes }));
}
/**
 * The files with the model's own size in: Google's bucket does not let the page read its download sizes
 * (no Timing-Allow-Origin), so the model's bytes as fetched stand in (uncompressed, which they are anyway).
 */
function withModel(files: { url: string; bytes: number }[], url: string, bytes: number) {
	return [...files.filter((f) => f.url !== url), { url, bytes }];
}
const fromMediaPipe = (u: string) => u.includes('@mediapipe/tasks-vision') || u.includes('mediapipe-models');

/** Grey samples of a part of the picture, w x h, through one small canvas. */
class Patcher {
	private cv = document.createElement('canvas');
	private g = this.cv.getContext('2d', { willReadFrequently: true })!;
	grab(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, w: number, h: number): Float32Array {
		if (this.cv.width !== w) this.cv.width = w;
		if (this.cv.height !== h) this.cv.height = h;
		this.g.drawImage(src, sx, sy, Math.max(1, sw), Math.max(1, sh), 0, 0, w, h);
		const px = this.g.getImageData(0, 0, w, h).data;
		const out = new Float32Array(w * h);
		for (let i = 0; i < out.length; i++) out[i] = 0.3 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.11 * px[i * 4 + 2];
		return out;
	}
}

/**
 * Eyes and mouth from pixels round where they are (pixels, in the unmirrored picture), with ranges learnt
 * for this face. `eyeA`/`eyeB` either order; `span` the eyes' distance apart in pixels.
 */
class PixelFeatures {
	private p = new Patcher();
	private eye = [new Range(0.003, 0.15), new Range(0.003, 0.15)];
	private mouthOpen = new Range(0.003, 0.2);
	private mouthWide = new Range(0.002, 0.08);
	private lookX = new Range(0.002, 0.3);
	private lookY = new Range(0.002, 0.3);

	measure(src: CanvasImageSource, eyes: [Pt, Pt], mouth: Pt, span: number): Pick<Raw, 'eyeL' | 'eyeR' | 'mouth' | 'smile' | 'gazeX' | 'gazeY'> {
		// Drawn left is the picture's right (the mirror).
		const [onLeft, onRight] = eyes[0].x > eyes[1].x ? eyes : [eyes[1], eyes[0]];
		const EW = 20, EH = 12, MW = 24, MH = 14;
		const ew = span * 0.55, eh = span * 0.33;
		const one = (e: Pt, i: number) => {
			const m = eyeMeasure(this.p.grab(src, e.x - ew / 2, e.y - eh / 2, ew, eh, EW, EH), EW, EH);
			return { open: this.eye[i].push(m.open), look: m.look, lookY: m.lookY };
		};
		const a = one(onLeft, 0), b = one(onRight, 1);
		const mw = span * 1.0, mh = span * 0.55;
		const mm = mouthMeasure(this.p.grab(src, mouth.x - mw / 2, mouth.y - mh * 0.4, mw, mh, MW, MH), MW, MH);
		// Gaze: the pupils' place, unmirrored, so a look to the picture's left is to the drawing's right.
		const gx = -(a.look + b.look) / 2, gy = -(a.lookY + b.lookY) / 2;
		return {
			// Shut is the bottom of the learnt range; anything in its top two thirds is fully open.
			eyeL: clamp(a.open * 1.5, 0, 1),
			eyeR: clamp(b.open * 1.5, 0, 1),
			mouth: this.mouthOpen.push(mm.open) * 0.8,
			smile: (this.mouthWide.push(mm.wide) - 0.5) * 0.8,
			gazeX: (this.lookX.push(gx) - 0.5) * 1.2,
			gazeY: (this.lookY.push(gy) - 0.5) * 1.2
		};
	}
	relearn() { for (const r of [...this.eye, this.mouthOpen, this.mouthWide, this.lookX, this.lookY]) r.reset(); }
}

/** MediaPipe Face Landmarker: blendshapes and the head's transform. */
export class LandmarkerTracker implements Tracker {
	readonly name = 'landmarker' as const;
	private fl = new MpTask();
	shut = 0.55;
	/** Brows and smile against their resting levels (glasses, resting faces). */
	centre = new Recentre();

	async load(): Promise<Loaded> {
		const t0 = performance.now();
		const { mod, fileset } = await visionRuntime();
		const model = await fetchModel(MODEL_URL.landmarker);
		const opts = (delegate: 'CPU') => ({
			baseOptions: { modelAssetBuffer: model, delegate }, runningMode: 'VIDEO', numFaces: 1,
			outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true
		});
		const note = await this.fl.start((d) => mod.FaceLandmarker.createFromOptions(fileset, opts(d)));
		const files = withModel(downloaded(fromMediaPipe).filter((f) => !f.url.includes('blaze_face')), MODEL_URL.landmarker, model.byteLength);
		return { bytes: files.reduce((a, f) => a + f.bytes, 0), ms: performance.now() - t0, files, note };
	}

	track(src: HTMLVideoElement | HTMLCanvasElement, sw: number, sh: number, t: number): Track {
		const t0 = performance.now();
		const r = this.fl.detect(src, t);
		const ms = performance.now() - t0;
		const lm: Pt[] | undefined = r?.faceLandmarks?.[0];
		if (!lm) return { raw: null, points: [], box: null, ms, note: this.fl.note };
		const cats: Category[] = r.faceBlendshapes?.[0]?.categories ?? [];
		const m = r.facialTransformationMatrixes?.[0]?.data ?? null;
		// A few points to show: eye corners, nose tip, mouth corners, chin, brow.
		const points = [33, 133, 362, 263, 1, 61, 291, 152, 10].map((i) => lm[i]).filter(Boolean);
		let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
		for (const p of lm) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
		return { raw: this.centre.push(rawFromBlendshapes(cats, m, this.shut, lm)), points, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, ms };
	}
	relearn() { this.centre.reset(); }
	close() { this.fl.close(); }
}

/** BlazeFace: a box and six points from MediaPipe; eyes and mouth from the pixels. */
export class BlazeTracker implements Tracker {
	readonly name = 'blazeface' as const;
	private fd = new MpTask();
	private px = new PixelFeatures();
	rest = 0.5;

	async load(): Promise<Loaded> {
		const t0 = performance.now();
		const { mod, fileset } = await visionRuntime();
		const model = await fetchModel(MODEL_URL.blazeface);
		const opts = (delegate: 'CPU') => ({ baseOptions: { modelAssetBuffer: model, delegate }, runningMode: 'VIDEO', minDetectionConfidence: 0.4 });
		const note = await this.fd.start((d) => mod.FaceDetector.createFromOptions(fileset, opts(d)));
		const files = withModel(downloaded(fromMediaPipe).filter((f) => !f.url.includes('face_landmarker')), MODEL_URL.blazeface, model.byteLength);
		return { bytes: files.reduce((a, f) => a + f.bytes, 0), ms: performance.now() - t0, files, note };
	}

	track(src: HTMLVideoElement | HTMLCanvasElement, sw: number, sh: number, t: number): Track {
		const t0 = performance.now();
		const r = this.fd.detect(src, t);
		const det = r?.detections?.[0];
		if (!det || (det.keypoints?.length ?? 0) < 4) return { raw: null, points: [], box: null, ms: performance.now() - t0, note: this.fd.note };
		// MediaPipe's order: right eye, left eye, nose tip, mouth, right ear, left ear (0..1).
		const k: Pt[] = det.keypoints.map((p: Pt) => ({ x: p.x, y: p.y }));
		const pose = poseFromPoints({ eyeA: k[0], eyeB: k[1], nose: k[2], mouth: k[3] }, sw / sh, this.rest);
		const px = (p: Pt) => ({ x: p.x * sw, y: p.y * sh });
		const span = Math.hypot((k[0].x - k[1].x) * sw, (k[0].y - k[1].y) * sh);
		const f = this.px.measure(src, [px(k[0]), px(k[1])], px(k[3]), span);
		const b = det.boundingBox;
		const box = b ? { x: b.originX / sw, y: b.originY / sh, w: b.width / sw, h: b.height / sh } : null;
		return { raw: { ...f, ...pose, browL: 0, browR: 0 }, points: k, box, ms: performance.now() - t0 };
	}
	relearn() { this.px.relearn(); }
	close() { this.fd.close(); }
}

/**
 * No download: the face's box from skin tone (or the browser's FaceDetector), as the picture avatar finds
 * it; the eyes and mouth where they usually sit in that box; the turn from where the dark of the eyes sits
 * against the box's middle. Weak at pose, but it costs nothing and works offline.
 */
export class PixelTracker implements Tracker {
	readonly name = 'pixel' as const;
	private finder = new FaceFinder();
	private px = new PixelFeatures();

	async load(): Promise<Loaded> { return { bytes: 0, ms: 0, files: [], note: 'nothing to download' }; }

	track(src: HTMLVideoElement | HTMLCanvasElement, sw: number, sh: number): Track {
		const t0 = performance.now();
		const b = this.finder.update(src, sw, sh, { skin: 1, margin: 1, follow: 0.5 }, !(src instanceof HTMLCanvasElement));
		if (!b || this.finder.how.startsWith('no face')) return { raw: null, points: [], box: null, ms: performance.now() - t0 };
		// The box is a square on the face (skin, so mostly forehead to chin).
		const at = (u: number, v: number): Pt => ({ x: b.x + b.s * u, y: b.y + b.s * v });
		const eyes: [Pt, Pt] = [at(0.32, 0.42), at(0.68, 0.42)];
		const mouth = at(0.5, 0.76);
		const f = this.px.measure(src, eyes, mouth, b.s * 0.36);
		const norm = (p: Pt) => ({ x: p.x / sw, y: p.y / sh });
		return {
			raw: { ...f, yaw: 0, pitch: 0, roll: 0, browL: 0, browR: 0 },
			points: [...eyes, mouth].map(norm),
			box: { x: b.x / sw, y: b.y / sh, w: b.s / sw, h: b.s / sh },
			ms: performance.now() - t0
		};
	}
	relearn() { this.px.relearn(); this.finder.reset(); }
	close() {}
}

export function makeTracker(name: TrackerName): Tracker {
	return name === 'landmarker' ? new LandmarkerTracker() : name === 'blazeface' ? new BlazeTracker() : new PixelTracker();
}
