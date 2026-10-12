/**
 * link.ts - phone-to-phone connections, by WebRTC through PeerJS.
 *
 * The Storyteller's phone registers as "grimoire-<ROOM>" with PeerJS's free
 * public broker; players connect to that name. After the handshake the
 * phones talk directly. Everything else in the app only sees HostLink and
 * PlayerLink below, so this file is the one to replace if a different
 * transport is ever needed (a hosted relay, say).
 */
import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { HostMsg, PlayerMsg } from './protocol.ts';

const PREFIX = 'grimoire-';

/**
 * Keeping the line alive. Phones sleep, switch networks and drop out of range, and a
 * WebRTC channel can die without ever saying so. Both ends send a small beat every
 * few seconds (never seen by the app); a phone that hears nothing for a while starts
 * a fresh connection, and the host lets go of one that has gone quiet.
 */
const BEAT = { __beat: 1 };
const BEAT_MS = 3000, QUIET_MS = 10000, GONE_MS = 30000;
const isBeat = (d: unknown) => !!d && typeof d === 'object' && (d as { __beat?: number }).__beat === 1;
/** Letters that cannot be misread for one another when spoken across a room. */
const LETTERS = 'ACDEFHJKLMNPRTVWXY';

export function newRoomCode(): string {
	return Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
}

export type LinkStatus = 'connecting' | 'open' | 'closed' | 'error';

// ---- the Storyteller's side -------------------------------------------------------------

export interface HostLink<Out = HostMsg> {
	room: string;
	/** The PeerJS peer, for voice calls. */
	peer: Peer;
	status: LinkStatus;
	/** Connected phones, by connection id. */
	peers: Map<string, DataConnection>;
	/** False if that phone is not connected just now. */
	send(peerId: string, msg: Out): boolean;
	close(): void;
}

/** `prefix` keeps different kinds of room apart (the grimoire, the village). */
export function hostRoom<In = PlayerMsg, Out = HostMsg>(
	room: string,
	on: {
		message: (peerId: string, msg: In) => void;
		joined: (peerId: string) => void;
		left: (peerId: string) => void;
		status: (s: LinkStatus, detail?: string) => void;
	},
	prefix = PREFIX
): HostLink<Out> {
	const peer = new Peer(prefix + room);
	const link: HostLink<Out> = {
		room,
		peer,
		status: 'connecting',
		peers: new Map(),
		send(peerId, msg) {
			const c = link.peers.get(peerId);
			if (!c?.open) return false;
			c.send(msg);
			return true;
		},
		close() {
			clearInterval(beat);
			peer.destroy();
		}
	};
	const heard = new Map<DataConnection, number>();
	const beat = setInterval(() => {
		const now = Date.now();
		for (const c of link.peers.values()) {
			if (now - (heard.get(c) ?? now) > GONE_MS) { c.close(); continue; }
			if (c.open) c.send(BEAT);
		}
	}, BEAT_MS);
	const set = (s: LinkStatus, detail?: string) => { link.status = s; on.status(s, detail); };
	peer.on('open', () => set('open'));
	peer.on('error', (err) => set('error', String((err as { type?: string }).type ?? err)));
	peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
	peer.on('close', () => set('closed'));
	peer.on('connection', (conn) => {
		conn.on('open', () => {
			heard.set(conn, Date.now());
			// The same phone back on a new connection (it slept, or lost signal): this one
			// replaces the old, and the old one's late goodbye must not take the phone away.
			const old = link.peers.get(conn.peer);
			link.peers.set(conn.peer, conn);
			if (old && old !== conn) old.close();
			else on.joined(conn.peer);
		});
		conn.on('data', (data) => {
			heard.set(conn, Date.now());
			if (!isBeat(data)) on.message(conn.peer, data as In);
		});
		conn.on('close', () => {
			heard.delete(conn);
			if (link.peers.get(conn.peer) !== conn) return;
			link.peers.delete(conn.peer);
			on.left(conn.peer);
		});
	});
	return link;
}

// ---- a player's side -----------------------------------------------------------------------

export interface PlayerLink<Out = PlayerMsg> {
	peer: Peer;
	status: LinkStatus;
	/** False if not connected just now (it is reconnecting). */
	send(msg: Out): boolean;
	close(): void;
}

export function joinRoom<In = HostMsg, Out = PlayerMsg>(
	room: string,
	on: { message: (msg: In) => void; status: (s: LinkStatus, detail?: string) => void },
	prefix = PREFIX
): PlayerLink<Out> {
	const peer = new Peer();
	let conn: DataConnection | null = null;
	let closing = false;
	let heard = Date.now();
	let retry: ReturnType<typeof setTimeout> | null = null;
	const link: PlayerLink<Out> = {
		peer,
		status: 'connecting',
		send(msg) {
			if (!conn?.open || link.status !== 'open') return false;
			conn.send(msg);
			return true;
		},
		close() {
			closing = true;
			clearInterval(beat);
			peer.destroy();
		}
	};
	// Beat to the host; if the host has gone quiet, start again.
	const beat = setInterval(() => {
		if (closing || !conn) return;
		if (link.status === 'open' && Date.now() - heard > QUIET_MS) return again();
		if (conn.open) conn.send(BEAT);
	}, BEAT_MS);
	const set = (s: LinkStatus, detail?: string) => { link.status = s; on.status(s, detail); };
	const connect = () => {
		retry = null;
		if (closing) return;
		if (peer.disconnected) { peer.reconnect(); return; } // 'open' fires again, and connects
		const c = peer.connect(prefix + room.toUpperCase(), { reliable: true });
		conn = c;
		heard = Date.now();
		c.on('open', () => { if (c === conn) { heard = Date.now(); set('open'); } });
		c.on('data', (data) => {
			if (c !== conn) return;
			heard = Date.now();
			if (!isBeat(data)) on.message(data as In);
		});
		c.on('close', () => { if (c === conn) again(); });
		c.on('error', () => { if (c === conn) again(); });
	};
	/** Drop this connection and make a new one, gently (the Storyteller's phone may have slept). */
	const again = (wait = 1500) => {
		if (closing || retry) return;
		const old = conn;
		conn = null;
		set('connecting');
		try { old?.close(); } catch { /* already gone */ }
		retry = setTimeout(connect, wait);
	};
	// Back from the background: check the line straight away rather than waiting for the beat.
	if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible' && !closing && (!conn?.open || Date.now() - heard > BEAT_MS * 2)) again(0);
	});
	peer.on('open', () => { if (!conn?.open) connect(); });
	peer.on('error', (err) => {
		const type = String((err as { type?: string }).type ?? err);
		set('error', type === 'peer-unavailable' ? 'No game with that code. Check it with the Storyteller.' : type);
		if (closing) return;
		conn = null;
		if (!retry) retry = setTimeout(connect, type === 'peer-unavailable' ? 3000 : 2000);
	});
	peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
	return link;
}
