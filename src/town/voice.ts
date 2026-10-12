/**
 * voice.ts - proximity voice. Each phone calls the people it can hear,
 * directly (WebRTC through PeerJS, like the data links), and sets each
 * voice's volume from map.ts's loudness(): full close by, fading with
 * distance, silent through walls. Calls are only open while someone is in
 * earshot, so a phone carries a handful of calls, not the whole town.
 *
 * Modes: 'mic' (talk), 'tone' (hum a test note, to try it without talking),
 * 'listen' (hear only). Test villagers hum on every phone, made locally.
 */
import type { MediaConnection, Peer } from 'peerjs';

export type VoiceMode = 'mic' | 'tone' | 'listen';

/** Someone this phone could hear: who, how loud (0-1), and a hum if they are a test villager. */
export interface Hearing {
	id: string;
	loud: number;
	hum?: number;
}

interface Source {
	call?: MediaConnection;
	el?: HTMLAudioElement;
	stop?: () => void;
	gain: GainNode;
	analyser: AnalyserNode;
	/** When they were last in earshot; calls close a few seconds after. */
	wanted: number;
}

let shared: AudioContext | null = null;
/** One audio context per page, started from a tap (phones insist). */
export function audio(): AudioContext {
	if (!shared) shared = new AudioContext();
	if (shared.state === 'suspended') void shared.resume();
	return shared;
}

/** The clocktower bell: a few inharmonic partials, struck and fading. */
export function bell(times = 3) {
	const ctx = audio();
	for (let k = 0; k < times; k++) {
		const t0 = ctx.currentTime + k * 1.6;
		for (const [ratio, amp] of [[0.5, 0.25], [1, 0.4], [1.19, 0.2], [1.5, 0.15], [2, 0.12], [2.74, 0.06]]) {
			const o = ctx.createOscillator();
			const g = ctx.createGain();
			o.frequency.value = 196 * ratio;
			g.gain.setValueAtTime(0, t0);
			g.gain.linearRampToValueAtTime(amp * 0.5, t0 + 0.01);
			g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.5 / ratio);
			o.connect(g).connect(ctx.destination);
			o.start(t0);
			o.stop(t0 + 4);
		}
	}
}

/** A murmuring hum: a note that comes and goes like speech. */
function hum(ctx: AudioContext, hz: number, out: AudioNode): () => void {
	const o = ctx.createOscillator();
	o.type = 'triangle';
	o.frequency.value = hz;
	const amp = ctx.createGain();
	amp.gain.value = 0.12;
	const lfo = ctx.createOscillator();
	lfo.frequency.value = 2.3 + (hz % 7) / 10;
	const depth = ctx.createGain();
	depth.gain.value = 0.12;
	lfo.connect(depth).connect(amp.gain);
	o.connect(amp).connect(out);
	o.start();
	lfo.start();
	return () => { o.stop(); lfo.stop(); amp.disconnect(); };
}

export const toneFor = (id: string) => 180 + ([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 220);

export interface Voice {
	mode: VoiceMode;
	muted: boolean;
	setMuted(m: boolean): void;
	/** Who is in earshot now; opens and closes calls and sets volumes. */
	update(hear: Hearing[]): void;
	/** How loud someone sounds right now (0-1), for the speaking rings. */
	level(id: string): number;
	myLevel(): number;
	stop(): void;
}

export async function startVoice(peer: Peer, mode: VoiceMode): Promise<Voice> {
	const ctx = audio();
	let local: MediaStream;
	let stopLocal = () => {};
	if (mode === 'mic') {
		local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
		stopLocal = () => local.getTracks().forEach((t) => t.stop());
	} else {
		const dest = ctx.createMediaStreamDestination();
		if (mode === 'tone') stopLocal = hum(ctx, toneFor(peer.id), dest);
		local = dest.stream;
	}
	const mine = ctx.createAnalyser();
	mine.fftSize = 512;
	ctx.createMediaStreamSource(local).connect(mine);

	const sources = new Map<string, Source>();
	const buf = new Float32Array(512);
	const rms = (a: AnalyserNode) => {
		a.getFloatTimeDomainData(buf);
		let s = 0;
		for (const v of buf) s += v * v;
		return Math.min(1, Math.sqrt(s / buf.length) * 6);
	};

	function source(id: string): Source {
		let s = sources.get(id);
		if (s) return s;
		const gain = ctx.createGain();
		gain.gain.value = 0;
		const analyser = ctx.createAnalyser();
		analyser.fftSize = 512;
		gain.connect(ctx.destination);
		s = { gain, analyser, wanted: Date.now() };
		sources.set(id, s);
		return s;
	}
	function attach(id: string, stream: MediaStream) {
		const s = source(id);
		// Chrome only plays a remote stream through Web Audio if an element holds it too.
		const el = new Audio();
		el.muted = true;
		el.srcObject = stream;
		void el.play().catch(() => {});
		s.el = el;
		const src = ctx.createMediaStreamSource(stream);
		src.connect(s.gain);
		src.connect(s.analyser);
	}
	function drop(id: string) {
		const s = sources.get(id);
		if (!s) return;
		s.call?.close();
		s.stop?.();
		if (s.el) s.el.srcObject = null;
		s.gain.disconnect();
		sources.delete(id);
	}
	function wire(call: MediaConnection) {
		const s = source(call.peer);
		s.call = call;
		call.on('stream', (stream) => attach(call.peer, stream));
		call.on('close', () => { if (sources.get(call.peer)?.call === call) drop(call.peer); });
		call.on('error', () => drop(call.peer));
	}
	const onCall = (call: MediaConnection) => {
		if (sources.get(call.peer)?.call) drop(call.peer);
		call.answer(local);
		wire(call);
	};
	peer.on('call', onCall);

	const voice: Voice = {
		mode,
		muted: false,
		setMuted(m) {
			voice.muted = m;
			local.getAudioTracks().forEach((t) => (t.enabled = !m));
		},
		update(hear) {
			const now = Date.now();
			for (const h of hear) {
				if (h.loud <= 0 && !sources.has(h.id)) continue;
				const s = source(h.id);
				if (h.loud > 0) s.wanted = now;
				if (h.hum && !s.stop) {
					// Measured before the volume, like a real voice.
					const pre = ctx.createGain();
					pre.connect(s.gain);
					pre.connect(s.analyser);
					s.stop = hum(ctx, h.hum, pre);
				}
				// Whoever has the smaller id rings, so two phones never call each other at once.
				if (!h.hum && !s.call && peer.id < h.id) wire(peer.call(h.id, local));
				s.gain.gain.setTargetAtTime(h.loud, ctx.currentTime, 0.15);
			}
			const near = new Set(hear.filter((h) => h.loud > 0).map((h) => h.id));
			for (const [id, s] of sources) {
				if (near.has(id)) continue;
				s.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
				if (now - s.wanted > 4000 || !hear.some((h) => h.id === id)) drop(id);
			}
		},
		level(id) {
			const s = sources.get(id);
			return s ? rms(s.analyser) * (s.gain.gain.value > 0.02 ? 1 : 0) : 0;
		},
		myLevel: () => (voice.muted ? 0 : rms(mine)),
		stop() {
			peer.off('call', onCall);
			for (const id of [...sources.keys()]) drop(id);
			stopLocal();
		}
	};
	return voice;
}
