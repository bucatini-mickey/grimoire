/**
 * lobbyvoice.ts - talking while the room fills up. In the lobby there is no
 * town yet, so everyone in the room hears everyone at full volume: the same
 * calls as the village's voice (voice.ts), with every phone in earshot.
 * It stops when the game begins and the village's own voice takes over.
 */
import type { Peer } from 'peerjs';
import { audio, startVoice } from './voice.ts';
import type { Voice, VoiceMode } from './voice.ts';
import { btn } from '../ui/ascii.ts';
import type { Button } from '../ui/ascii.ts';

export class LobbyVoice {
	voice: Voice | null = null;
	busy = false;
	/** Everyone in the room by peer id (this phone's own id is skipped). */
	peers: string[] = [];
	private timer: ReturnType<typeof setInterval> | null = null;

	private peer: () => Peer | null;
	private redraw: () => void;

	constructor(peer: () => Peer | null, redraw: () => void) {
		this.peer = peer;
		this.redraw = redraw;
	}

	async start(mode: VoiceMode) {
		const peer = this.peer();
		if (!peer || this.voice || this.busy) return;
		audio();
		this.busy = true;
		this.redraw();
		try {
			this.voice = await startVoice(peer, mode);
			this.timer = setInterval(() => this.update(), 400);
			this.update();
		} catch (e) {
			alert(mode === 'mic' ? 'The microphone could not start. Allow it for this site, or choose Listen to hear the others.' : `Voice could not start: ${e}`);
		}
		this.busy = false;
		this.redraw();
	}

	stop() {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		this.voice?.stop();
		this.voice = null;
		this.redraw();
	}

	setPeers(ids: string[]) {
		this.peers = ids;
		this.update();
	}

	private update() {
		const me = this.peer()?.id;
		this.voice?.update(this.peers.filter((id) => id && id !== me).map((id) => ({ id, loud: 1 })));
	}

	/** How many in the room are talking now (for the line under the buttons). */
	speaking(): number {
		const v = this.voice;
		return v ? this.peers.filter((id) => v.level(id) > 0.15).length + (v.myLevel() > 0.15 ? 1 : 0) : 0;
	}

	buttons(): Button[] {
		const v = this.voice;
		if (this.busy) return [btn('Starting...', () => {}, { disabled: true })];
		if (!v) return [btn('Talk', () => void this.start('mic'), { style: 'primary' }), btn('Listen', () => void this.start('listen'))];
		return [
			...(v.mode === 'mic' ? [btn(v.muted ? 'Unmute' : 'Mute', () => { v.setMuted(!v.muted); this.redraw(); }, { style: v.muted ? 'on' : 'primary' })] : []),
			btn('Voice off', () => this.stop(), { style: 'quiet' })
		];
	}

	line(): string {
		const v = this.voice;
		if (!v) return 'Voice is off. Everyone in the room can talk here before the game.';
		const n = this.speaking();
		return (v.mode === 'mic' ? (v.muted ? 'Muted' : 'Talking') : 'Listening') + ` - everyone in the room hears everyone${n ? `; ${n} speaking` : ''}.`;
	}
}
