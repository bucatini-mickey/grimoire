/**
 * testpage.ts - tools/avatar-test.html: try the webcam avatar's trackers side by side, with the raw numbers
 * beside the avatar, and measure them. Compiled into the page by `npm run avatar-test`.
 *
 * Nothing is sent anywhere, except a report you choose to send to the computer serving the page
 * (tools/serve.mjs, "Send to Rosemary"): numbers about the trackers, never a picture.
 */
import { decodeRig, drawRig, encodeRig, NEUTRAL, RIG_KEYS, DETAIL_SIZE, withVoice } from './rig.ts';
import { drawTrial, TRIAL_PLAIN, TRIALS } from './trialface.ts';
import type { TrialKind, TrialStyle } from './trialface.ts';
import type { Rig, RigCell } from './rig.ts';
import { GAINS, makeTracker, MP_VERSION, NO_FLIPS, NO_NEUTRAL, RigSmoother, rigOf, TRACKER_LABEL, TRACKER_NAMES } from './trackers.ts';
import type { Flips, Loaded, Neutral, Raw, Track, Tracker, TrackerName } from './trackers.ts';
import { AsciiAvatar } from './asciiavatar.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const store = {
	get: (k: string) => { try { return localStorage.getItem('avatar-test.' + k); } catch { return null; } },
	set: (k: string, v: string) => { try { localStorage.setItem('avatar-test.' + k, v); } catch { /* private window */ } }
};

// ---- state ------------------------------------------------------------------------------------------

type Bad = 'none' | 'lowres' | 'dark' | 'noisy' | 'all';
const BAD_LABEL: Record<Bad, string> = { none: 'as it is', lowres: 'low-res (160x120, blurry)', dark: 'dark room', noisy: 'noisy (grain)', all: 'all three' };

const S = {
	video: document.createElement('video'),
	stream: null as MediaStream | null,
	source: 'camera' as 'camera' | 'demo',
	trackerName: (TRACKER_NAMES.find((n) => n === store.get('tracker')) ?? 'landmarker') as TrackerName,
	trackers: new Map<TrackerName, Tracker>(),
	loaded: new Map<TrackerName, Loaded>(),
	failed: new Map<TrackerName, string>(),
	bad: 'none' as Bad,
	flips: { ...NO_FLIPS, ...JSON.parse(store.get('flips2') ?? '{}') } as Flips,
	neutral: { ...NO_NEUTRAL } as Neutral,
	smoother: new RigSmoother(),
	lastRaw: null as Raw | null,
	lastTrack: null as Track | null,
	rig: { ...NEUTRAL } as Rig,
	fps: 0,
	ms: 0,
	found: 0,
	frames: 0,
	history: [] as { t: number; rig: Rig }[],
	fallback: false,
	bench: null as null | { results: BenchRow[]; running: boolean },
	t0: performance.now(),
	/** The microphone's level 0..1, while on (it never leaves the page either). */
	mic: null as null | { stream: MediaStream; analyser: AnalyserNode; buf: Float32Array; level: number }
};
S.video.muted = true;
S.video.playsInline = true;
S.smoother.amount = Number(store.get('smooth') ?? 1);

// ---- the picture: the camera, made worse on purpose if asked ------------------------------------------------

const bad = document.createElement('canvas');
const badG = bad.getContext('2d', { willReadFrequently: true })!;
const lowCv = document.createElement('canvas');
lowCv.width = 160; lowCv.height = 120;
const lowG = lowCv.getContext('2d')!;
let seed = 1;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

/** The frame the tracker sees: the camera's, or a worse copy of it. */
function frameSource(): { src: HTMLVideoElement | HTMLCanvasElement; w: number; h: number } | null {
	const v = S.video;
	if (!S.stream || v.readyState < 2 || !v.videoWidth) return null;
	if (S.bad === 'none') return { src: v, w: v.videoWidth, h: v.videoHeight };
	const W = v.videoWidth, H = v.videoHeight;
	if (bad.width !== W) bad.width = W;
	if (bad.height !== H) bad.height = H;
	const low = S.bad === 'lowres' || S.bad === 'all', dark = S.bad === 'dark' || S.bad === 'all', noisy = S.bad === 'noisy' || S.bad === 'all';
	if (low) {
		lowG.drawImage(v, 0, 0, 160, 120);
		badG.imageSmoothingEnabled = true;
		badG.drawImage(lowCv, 0, 0, W, H);
	} else badG.drawImage(v, 0, 0, W, H);
	if (dark || noisy) {
		const img = badG.getImageData(0, 0, W, H), d = img.data;
		for (let i = 0; i < d.length; i += 4) {
			const n = noisy ? (rand() - 0.5) * 70 : 0;
			for (let c = 0; c < 3; c++) {
				let x = d[i + c];
				if (dark) x = Math.pow(x / 255, 1.6) * 255 * 0.3 + 4;
				d[i + c] = x + n;
			}
		}
		badG.putImageData(img, 0, 0);
	}
	return { src: bad, w: W, h: H };
}

async function cameraOn() {
	try {
		S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false });
	} catch (e) {
		status(`No camera (${(e as Error).name}). It needs https, localhost or a file opened from disk, and your permission. "Demo" shows the avatar without one.`);
		return;
	}
	S.video.srcObject = S.stream;
	await S.video.play().catch(() => {});
	S.source = 'camera';
	await ensureTracker(S.trackerName);
	ui();
}
function cameraOff() {
	for (const t of S.stream?.getTracks() ?? []) t.stop();
	S.stream = null;
	S.video.srcObject = null;
	ui();
}
document.addEventListener('visibilitychange', () => { if (document.hidden && S.stream && !S.bench?.running) cameraOff(); });

// ---- trackers -------------------------------------------------------------------------------------------

async function ensureTracker(name: TrackerName): Promise<Tracker | null> {
	if (S.trackers.has(name)) return S.trackers.get(name)!;
	if (S.failed.has(name)) return null;
	status(`Loading ${TRACKER_LABEL[name]}...`);
	const t = makeTracker(name);
	try {
		const info = await t.load();
		S.trackers.set(name, t);
		S.loaded.set(name, info);
		status(`${TRACKER_LABEL[name]} loaded: ${kb(info.bytes)} in ${(info.ms / 1000).toFixed(1)} s (${info.note}).`);
		return t;
	} catch (e) {
		S.failed.set(name, String((e as Error).message ?? e));
		status(`${TRACKER_LABEL[name]} could not load (${S.failed.get(name)}). Falling back: pixels, and the picture avatar.`);
		return null;
	} finally { ui(); }
}

const kb = (b: number) => (b >= 1e6 ? (b / 1e6).toFixed(2) + ' MB' : (b / 1e3).toFixed(0) + ' KB');

// ---- each frame ---------------------------------------------------------------------------------------------

/** A rig typed in by hand, held still in demo mode until Demo is pressed again. */
let demoHold: Rig | null = null;
const picture = new AsciiAvatar({ cols: 32, track: true });
let lastFrame = 0, fpsCount = 0, fpsAt = performance.now(), msSum = 0, foundCount = 0;

function demoRig(t: number): Rig {
	const s = t / 1000;
	const blink = (s % 3.7) < 0.15;
	const wink = (s % 11) > 10.5;
	const tri = (p: number) => Math.abs(((s / p) % 2) - 1) * 2 - 1;
	return {
		eyeL: blink ? 0 : 11, eyeR: blink || wink ? 0 : 11,
		browL: 8 + Math.round(tri(5) * 7), browR: 8 + Math.round(tri(5) * 7),
		mouth: Math.round(Math.max(0, Math.sin(s * 5) * 12) * (s % 8 < 4 ? 1 : 0)), smile: 8 + Math.round(tri(9) * 7),
		yaw: 8 + Math.round(Math.sin(s * 0.7) * 7), pitch: 8 + Math.round(Math.sin(s * 0.45) * 5), roll: 8 + Math.round(Math.sin(s * 0.33) * 6),
		gazeX: 8 + Math.round(Math.sin(s * 1.3) * 7), gazeY: 8 + Math.round(Math.cos(s * 0.9) * 5)
	};
}

/** The next frame, on a timer (not an animation frame, which some hidden or embedded views never give). */
const next = () => { setTimeout(() => tick(performance.now()), 15); };

function tick(now: number) {
	next();
	if (now - lastFrame < 1000 / 30) return;
	lastFrame = now;
	let rig: Rig | null = null;
	if (S.source === 'demo') rig = demoHold ?? demoRig(now);
	else {
		const f = frameSource();
		const t = S.trackers.get(S.trackerName) ?? (S.failed.has(S.trackerName) ? S.trackers.get('pixel') : undefined);
		if (f && t) {
			let tr: Track;
			try { tr = t.track(f.src, f.w, f.h, now); } catch (e) { status('Tracker error: ' + (e as Error).message); return; }
			S.lastTrack = tr;
			msSum += tr.ms;
			fpsCount++;
			if (tr.raw) {
				foundCount++;
				S.lastRaw = tr.raw;
				rig = S.smoother.push(rigOf(tr.raw, GAINS, S.neutral, S.flips));
			}
			drawVideo(f, tr);
		} else if (S.failed.has(S.trackerName) && !S.trackers.has('pixel')) void ensureTracker('pixel');
		if (f && (S.fallback || S.failed.has(S.trackerName))) $('picture').innerHTML = picture.frame(f.src, f.w, f.h).html;
	}
	if (rig && S.mic) rig = withVoice(rig, micLevel());
	if (rig) {
		S.rig = rig;
		S.history.push({ t: now, rig });
		while (S.history.length && S.history[0].t < now - 6000) S.history.shift();
		benchSample(rig, now);
	}
	if (now - fpsAt >= 1000) {
		S.fps = fpsCount * 1000 / (now - fpsAt);
		S.ms = fpsCount ? msSum / fpsCount : 0;
		S.found = fpsCount ? foundCount / fpsCount : 0;
		fpsCount = 0; msSum = 0; foundCount = 0; fpsAt = now;
		meters();
	}
	drawAvatars();
	numbers();
	chart(now);
}

// ---- drawing ------------------------------------------------------------------------------------------------

const INK_CLASS = ['g', 'o', 'f', 'o'];

async function micToggle() {
	if (S.mic) { for (const t of S.mic.stream.getTracks()) t.stop(); S.mic = null; ui(); return; }
	try {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
		const ctx = new AudioContext();
		const analyser = ctx.createAnalyser();
		analyser.fftSize = 512;
		ctx.createMediaStreamSource(stream).connect(analyser);
		S.mic = { stream, analyser, buf: new Float32Array(analyser.fftSize), level: 0 };
	} catch (e) { status('No microphone (' + (e as Error).name + ').'); }
	ui();
}
/** The microphone's loudness now, 0..1 (rough, as voice.ts's level is). */
function micLevel(): number {
	const m = S.mic!;
	m.analyser.getFloatTimeDomainData(m.buf as Float32Array<ArrayBuffer>);
	let sum = 0;
	for (const v of m.buf) sum += v * v;
	const rms = Math.sqrt(sum / m.buf.length);
	m.level = Math.min(1, rms * 6);
	return m.level;
}
/** The avatar as HTML; with `mark`, the nose's middle is that letter on a plate (as the village's tiles draw it). */
function cellsHtml(cells: RigCell[][], mark = '', dots = false): string {
	return cells.map((row, y) => row.map((c, x) => c.ch === ' ' ? (dots && (x + 2 * y) % 4 === 0 ? '<span class="d">.</span>' : ' ')
		: c.ink === 3 && mark ? `<span class="plate">${mark}</span>` : `<span class="${INK_CLASS[c.ink]}">${c.ch.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')}</span>`).join('')).join('\n');
}
/** A trial face as HTML, in the village's way: letters outside ASCII in a box one cell wide, spilling evenly. */
function trialHtml(cells: RigCell[][]): string {
	const esc = (c: string) => c.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
	return cells.map((row, y) => row.map((c, x) => {
		if (c.ch === ' ') return (x + 2 * y) % 4 === 0 ? '<span class="d">.</span>' : ' ';
		if (c.ink === 3) return '<span class="plate">J</span>';
		const inner = c.ch.charCodeAt(0) > 126 ? `<span class="u">${c.ch}</span>` : esc(c.ch);
		return `<span class="${INK_CLASS[c.ink]}">${inner}</span>`;
	}).join('')).join('\n');
}
/** Each trial's own choices: the sizes offer different hair and beards. */
const trialStyle = new Map<TrialKind, TrialStyle>(TRIALS.map((t) => [t.kind, { ...TRIAL_PLAIN }]));
const PART_LABELS: Record<keyof TrialStyle, string> = { hair: 'Hair', brow: 'Brows', glasses: 'Glasses', tache: 'Moustache', beard: 'Beard' };
function trialFigures() {
	$('trials').innerHTML = '<figure><pre id="trialNow" class="tile"></pre><figcaption>Now, 10x5</figcaption></figure>' + TRIALS.map((t) =>
		`<figure><pre id="trial${t.kind}" class="tile"></pre><figcaption>${t.label}</figcaption><div class="parts" id="parts${t.kind}"></div></figure>`).join('');
	for (const t of TRIALS) trialButtons(t.kind);
}
function trialButtons(kind: TrialKind) {
	const t = TRIALS.find((x) => x.kind === kind)!, st = trialStyle.get(kind)!;
	const box = $('parts' + kind);
	box.innerHTML = (Object.keys(PART_LABELS) as (keyof TrialStyle)[]).filter((k) => t.names[k].length > 1).map((k) =>
		`<button data-k="${k}">${PART_LABELS[k]}: ${t.names[k][st[k]]}</button>`).join('');
	for (const el of Array.from(box.querySelectorAll('button'))) el.onclick = () => {
		const k = (el as HTMLElement).dataset.k as keyof TrialStyle;
		st[k] = (st[k] + 1) % t.names[k].length;
		trialButtons(kind);
		drawAvatars();
	};
}

function drawAvatars() {
	// The trial: smaller main faces in the far face's letters, beside the current one.
	$('trialNow').innerHTML = cellsHtml(drawRig(S.rig, DETAIL_SIZE[2].w, DETAIL_SIZE[2].h), 'J', true);
	for (const t of TRIALS) $('trial' + t.kind).innerHTML = trialHtml(drawTrial(S.rig, t.kind, trialStyle.get(t.kind)));
	// The village's tile: the middle face round your letter, on the letter tile's faint ground.
	$('tile').innerHTML = cellsHtml(drawRig(S.rig, DETAIL_SIZE[2].w, DETAIL_SIZE[2].h), 'J', true);
	for (const d of [3, 2, 1] as const) {
		const { w, h } = DETAIL_SIZE[d];
		$('av' + d).innerHTML = cellsHtml(drawRig(S.rig, w, h));
	}
	$('hex').textContent = encodeRig(S.rig);
}

const vcv = () => $<HTMLCanvasElement>('video');
function drawVideo(f: { src: CanvasImageSource; w: number; h: number }, tr: Track) {
	if (!($<HTMLInputElement>('showVideo')).checked) return;
	const c = vcv(), g = c.getContext('2d')!;
	const W = 320, H = Math.round(320 * f.h / f.w);
	if (c.width !== W) c.width = W;
	if (c.height !== H) c.height = H;
	g.save();
	g.translate(W, 0); g.scale(-1, 1);
	g.drawImage(f.src, 0, 0, W, H);
	g.strokeStyle = '#e8c460'; g.fillStyle = '#e86050'; g.lineWidth = 1;
	if (tr.box) g.strokeRect(tr.box.x * W, tr.box.y * H, tr.box.w * W, tr.box.h * H);
	for (const p of tr.points) g.fillRect(p.x * W - 2, p.y * H - 2, 4, 4);
	g.restore();
}

const SIGNED = new Set(['smile', 'yaw', 'pitch', 'roll', 'gazeX', 'gazeY', 'browL', 'browR']);
const UNIT: Record<string, string> = { yaw: '°', pitch: '°', roll: '°' };
function numbers() {
	const raw = S.source === 'demo' ? null : S.lastRaw;
	const rows = RIG_KEYS.map((k) => {
		const d = S.rig[k];
		const r = raw ? (raw[k as keyof Raw] as number) : null;
		const bar = SIGNED.has(k)
			? (d < 8 ? ' '.repeat(d) + '#'.repeat(8 - d) + '|' + ' '.repeat(7) : ' '.repeat(8) + '|' + '#'.repeat(d - 8) + ' '.repeat(15 - d))
			: '#'.repeat(d) + '.'.repeat(15 - d);
		return `${k.padEnd(6)} ${r === null ? '     -' : (r.toFixed(UNIT[k] ? 1 : 2) + (UNIT[k] ?? '')).padStart(6)}  ${d.toString(16)}  ${bar}`;
	});
	$('numbers').textContent = 'name     raw  hex  0 ........ 15\n' + rows.join('\n');
}

/** The last six seconds of a few digits, so a lag or a flicker shows. */
function chart(now: number) {
	const c = $<HTMLCanvasElement>('chart'), g = c.getContext('2d')!;
	const W = c.width, H = c.height;
	g.fillStyle = '#0b0d12'; g.fillRect(0, 0, W, H);
	const lines: [keyof Rig, string][] = [['eyeL', '#86a9de'], ['eyeR', '#6ccfd2'], ['mouth', '#e86050'], ['smile', '#e8c460'], ['yaw', '#8fd06a'], ['browL', '#d09ad8']];
	g.font = '10px monospace';
	lines.forEach(([k, col], i) => {
		g.strokeStyle = col; g.fillStyle = col;
		g.fillText(k, 4 + i * 44, 10);
		g.beginPath();
		S.history.forEach((h, j) => {
			const x = W - (now - h.t) / 6000 * W, y = H - 4 - (h.rig[k] / 15) * (H - 18);
			if (j) g.lineTo(x, y); else g.moveTo(x, y);
		});
		g.stroke();
	});
}

function meters() {
	const parts = [S.source === 'demo' ? 'Demo (no camera)' : S.stream ? `Camera ${S.video.videoWidth}x${S.video.videoHeight}` : 'Camera off'];
	if (S.source === 'camera' && S.stream) {
		const tName = S.trackers.has(S.trackerName) ? TRACKER_LABEL[S.trackerName] : S.failed.has(S.trackerName) ? 'Pixels only (fallback)' : 'loading';
		parts.push(tName, `${S.fps.toFixed(0)} fps`, `${S.ms.toFixed(1)} ms a frame`, `face found ${(S.found * 100).toFixed(0)}%`);
	}
	parts.push('the picture never leaves this page');
	$('meters').textContent = parts.join(' · ');
}

function status(s: string) { $('status').textContent = s; }

// ---- the comparison -------------------------------------------------------------------------------------

interface BenchRow {
	tracker: TrackerName; bad: Bad; fps: number; msMedian: number; msP90: number; found: number;
	/** How much the head's digits wobble while you hold still (mean of their standard deviations). */
	jitter: number;
	/** Blinks it saw, of the three asked for. */
	blinks: number;
	download: number;
}
const BENCH_MS = 7000;
let bench: { tracker: TrackerName; bad: Bad; start: number; ms: number[]; frames: number; found: number; rigs: Rig[]; shut: boolean; blinks: number } | null = null;

function benchSample(rig: Rig, now: number) {
	if (!bench || now < bench.start) return;
	bench.rigs.push(rig);
	const shut = rig.eyeL <= 3 && rig.eyeR <= 3;
	if (shut && !bench.shut) bench.blinks++;
	bench.shut = shut;
}

async function runBench() {
	if (!S.stream) { await cameraOn(); if (!S.stream) return; }
	S.bench = { results: [], running: true };
	ui();
	const conds: Bad[] = ['none', 'lowres', 'dark', 'noisy'];
	const keepT = S.trackerName, keepB = S.bad;
	for (const tn of TRACKER_NAMES) {
		const t = await ensureTracker(tn);
		if (!t) continue;
		for (const b of conds) {
			S.trackerName = tn; S.bad = b; S.smoother.reset(); t.relearn();
			const start = performance.now() + 1200;
			bench = { tracker: tn, bad: b, start, ms: [], frames: 0, found: 0, rigs: [], shut: false, blinks: 0 };
			const orig = t.track.bind(t);
			t.track = (src, w, h, tt) => {
				const r = orig(src, w, h, tt);
				if (bench && performance.now() >= bench.start) { bench.frames++; bench.ms.push(r.ms); if (r.raw) bench.found++; }
				return r;
			};
			status(`Comparison: ${TRACKER_LABEL[tn]}, picture ${BAD_LABEL[b]}. Hold your head still and blink three times, slowly.`);
			await new Promise((r) => setTimeout(r, 1200 + BENCH_MS));
			t.track = orig;
			const ms = bench.ms.slice().sort((a, b) => a - b);
			const sd = (k: keyof Rig) => {
				const v = bench!.rigs.map((r) => r[k]);
				const m = v.reduce((a, b) => a + b, 0) / (v.length || 1);
				return Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length || 1));
			};
			S.bench.results.push({
				tracker: tn, bad: b, fps: bench.frames / (BENCH_MS / 1000), msMedian: ms[Math.floor(ms.length / 2)] ?? 0, msP90: ms[Math.floor(ms.length * 0.9)] ?? 0,
				found: bench.frames ? bench.found / bench.frames : 0, jitter: (sd('yaw') + sd('pitch') + sd('roll') + sd('gazeX')) / 4,
				blinks: bench.blinks, download: S.loaded.get(tn)?.bytes ?? 0
			});
			benchTable();
		}
	}
	bench = null;
	S.trackerName = keepT; S.bad = keepB;
	S.bench.running = false;
	store.set('lastReport', JSON.stringify(report()));
	status('Comparison done. Copy the report, or send it to Rosemary.');
	ui();
}

function deviceInfo() {
	let gpu = '';
	try {
		const gl = document.createElement('canvas').getContext('webgl');
		const ext = gl?.getExtension('WEBGL_debug_renderer_info');
		gpu = ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
	} catch { /* none */ }
	return { userAgent: navigator.userAgent, cores: navigator.hardwareConcurrency, memoryGB: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null, gpu, camera: S.stream ? `${S.video.videoWidth}x${S.video.videoHeight}` : null };
}

function report() {
	return {
		page: 'avatar-test', when: new Date().toISOString(), mediapipe: MP_VERSION, device: deviceInfo(),
		loads: Object.fromEntries([...S.loaded].map(([k, v]) => [k, { bytes: v.bytes, ms: Math.round(v.ms), note: v.note, files: v.files }])),
		failed: Object.fromEntries(S.failed), flips: S.flips, smoothing: S.smoother.amount,
		results: S.bench?.results ?? [], notes: ($<HTMLTextAreaElement>('notes')).value
	};
}

function reportText(): string {
	const r = report();
	const lines = [`Avatar tracker comparison, ${r.when}`, `Device: ${r.device.cores} cores, ${r.device.memoryGB ?? '?'} GB, ${r.device.gpu || 'GPU unknown'}, camera ${r.device.camera ?? 'off'}`, ''];
	for (const [k, v] of Object.entries(r.loads)) lines.push(`${TRACKER_LABEL[k as TrackerName]}: ${kb(v.bytes)} downloaded, loaded in ${(v.ms / 1000).toFixed(1)} s, ${v.note}`);
	for (const [k, v] of Object.entries(r.failed)) lines.push(`${TRACKER_LABEL[k as TrackerName]}: FAILED to load (${v})`);
	lines.push('', 'tracker              picture     fps   ms(med/p90)  found  jitter  blinks/3');
	for (const x of r.results) lines.push(`${TRACKER_LABEL[x.tracker].padEnd(20)} ${x.bad.padEnd(10)} ${x.fps.toFixed(0).padStart(4)}  ${x.msMedian.toFixed(1).padStart(5)}/${x.msP90.toFixed(1).padEnd(6)} ${(x.found * 100).toFixed(0).padStart(4)}%  ${x.jitter.toFixed(2).padStart(5)}   ${x.blinks}`);
	lines.push('', `Flips: ${Object.entries(r.flips).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}; smoothing ${r.smoothing}`);
	if (r.notes) lines.push('', 'Notes: ' + r.notes);
	return lines.join('\n');
}
function benchTable() { $('report').textContent = reportText(); }

async function sendReport() {
	try {
		const res = await fetch('report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report()) });
		status(res.ok ? 'Sent: Rosemary has the report.' : `Not sent (${res.status}). Copy it instead.`);
	} catch { status('Not sent: this page is not served by Rosemary (npm run tools there). Copy it instead.'); }
}

// ---- controls -------------------------------------------------------------------------------------------

function ui() {
	$('cam').textContent = S.stream ? 'Camera: on' : 'Camera: off';
	$('cam').classList.toggle('on', !!S.stream);
	$('mic').textContent = S.mic ? 'Microphone: on' : 'Microphone: off';
	$('mic').classList.toggle('on', !!S.mic);
	$('demo').classList.toggle('on', S.source === 'demo');
	const sel = $<HTMLSelectElement>('tracker');
	for (const o of Array.from(sel.options)) {
		const n = o.value as TrackerName, l = S.loaded.get(n);
		o.textContent = TRACKER_LABEL[n] + (l ? ` (${kb(l.bytes)})` : S.failed.has(n) ? ' (failed)' : '');
	}
	sel.value = S.trackerName;
	$<HTMLSelectElement>('bad').value = S.bad;
	$('bench').toggleAttribute('disabled', !!S.bench?.running);
	$('send').hidden = !location.protocol.startsWith('http');
	$('pictureBox').hidden = !(S.fallback || S.failed.has(S.trackerName));
	for (const k of Object.keys(NO_FLIPS) as (keyof Flips)[]) $<HTMLInputElement>('flip-' + k).checked = S.flips[k];
	meters();
}

function setup() {
	const sel = $<HTMLSelectElement>('tracker');
	sel.innerHTML = TRACKER_NAMES.map((n) => `<option value="${n}">${TRACKER_LABEL[n]}</option>`).join('');
	$<HTMLSelectElement>('bad').innerHTML = (Object.keys(BAD_LABEL) as Bad[]).map((b) => `<option value="${b}">${BAD_LABEL[b]}</option>`).join('');
	$('flips').innerHTML = (Object.keys(NO_FLIPS) as (keyof Flips)[]).map((k) => `<label><input type="checkbox" id="flip-${k}"> ${k}</label>`).join(' ');
	trialFigures();
	$('cam').onclick = () => { if (S.stream) cameraOff(); else void cameraOn(); };
	$('mic').onclick = () => { void micToggle(); };
	$('demo').onclick = () => { demoHold = null; S.source = S.source === 'demo' ? 'camera' : 'demo'; ui(); };
	sel.onchange = async () => { S.trackerName = sel.value as TrackerName; store.set('tracker', S.trackerName); S.smoother.reset(); if (S.stream) await ensureTracker(S.trackerName); ui(); };
	$<HTMLSelectElement>('bad').onchange = (e) => { S.bad = (e.target as HTMLSelectElement).value as Bad; S.trackers.get(S.trackerName)?.relearn(); ui(); };
	$('neutral').onclick = () => {
		const r = S.lastRaw;
		if (!r) { status('No face yet: turn the camera on and look at it.'); return; }
		S.neutral = { yaw: r.yaw, pitch: r.pitch, roll: r.roll, gazeX: r.gazeX, gazeY: r.gazeY, smile: r.smile, browL: r.browL, browR: r.browR };
		status('Neutral taken: your face as it is now draws as the middle.');
	};
	$('relearn').onclick = () => { S.trackers.get(S.trackerName)?.relearn(); S.neutral = { ...NO_NEUTRAL }; S.smoother.reset(); status('Forgotten: the tracker learns your face and light again.'); };
	const sm = $<HTMLInputElement>('smooth');
	sm.value = String(S.smoother.amount);
	$('smoothV').textContent = sm.value;
	sm.oninput = () => { S.smoother.amount = Number(sm.value); $('smoothV').textContent = sm.value; store.set('smooth', sm.value); };
	for (const k of Object.keys(NO_FLIPS) as (keyof Flips)[]) $<HTMLInputElement>('flip-' + k).onchange = (e) => { S.flips[k] = (e.target as HTMLInputElement).checked; store.set('flips2', JSON.stringify(S.flips)); };
	$('fallback').onclick = () => { S.fallback = !S.fallback; ui(); };
	$('bench').onclick = () => { void runBench(); };
	$('loadAll').onclick = async () => { for (const n of TRACKER_NAMES) await ensureTracker(n); status([...S.loaded].map(([n, l]) => `${TRACKER_LABEL[n]} ${kb(l.bytes)} in ${(l.ms / 1000).toFixed(1)} s`).concat([...S.failed].map(([n, e]) => `${TRACKER_LABEL[n]} failed: ${e}`)).join(' · ')); };
	$('copy').onclick = async () => { try { await navigator.clipboard.writeText(reportText()); status('Report copied.'); } catch { status('Could not copy: select the report text and copy it.'); } };
	$('send').onclick = () => { void sendReport(); };
	$('save').onclick = () => {
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([JSON.stringify(report(), null, 1)], { type: 'application/json' }));
		a.download = `avatar-report-${Date.now()}.json`;
		a.click();
	};
	// A rig typed in by hand (nine hex digits): to look at one drawing.
	$<HTMLInputElement>('type').onchange = (e) => {
		const r = decodeRig((e.target as HTMLInputElement).value.trim().toLowerCase());
		if (r) { S.source = 'demo'; S.rig = r; status('Showing the typed rig. Demo off to go back.'); demoHold = r; } else status('A rig is eleven hex digits, e.g. bb088888888.');
	};
	const last = store.get('lastReport');
	if (last) $('report').textContent = 'Last time:\n' + (() => { try { const r = JSON.parse(last); return `${r.when}, ${r.results.length} runs. Run the comparison again to see it here.`; } catch { return ''; } })();
	ui();
	status('Turn the camera on (or Demo). The tracker loads when the camera starts.');
	next();
}

setup();
// For looking at from the browser's console.
(globalThis as unknown as { avatarTest: unknown }).avatarTest = { S, ensureTracker, report };
