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
	send(peerId: string, msg: Out): void;
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
			if (c?.open) c.send(msg);
		},
		close() {
			peer.destroy();
		}
	};
	const set = (s: LinkStatus, detail?: string) => { link.status = s; on.status(s, detail); };
	peer.on('open', () => set('open'));
	peer.on('error', (err) => set('error', String((err as { type?: string }).type ?? err)));
	peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
	peer.on('close', () => set('closed'));
	peer.on('connection', (conn) => {
		conn.on('open', () => {
			link.peers.set(conn.peer, conn);
			on.joined(conn.peer);
		});
		conn.on('data', (data) => on.message(conn.peer, data as In));
		conn.on('close', () => {
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
	send(msg: Out): void;
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
	const link: PlayerLink<Out> = {
		peer,
		status: 'connecting',
		send(msg) {
			if (conn?.open) conn.send(msg);
		},
		close() {
			closing = true;
			peer.destroy();
		}
	};
	const set = (s: LinkStatus, detail?: string) => { link.status = s; on.status(s, detail); };
	const connect = () => {
		const c = peer.connect(prefix + room.toUpperCase(), { reliable: true });
		conn = c;
		c.on('open', () => set('open'));
		c.on('data', (data) => on.message(data as In));
		c.on('close', () => {
			if (closing) return;
			set('connecting');
			// The Storyteller's phone may have slept: keep trying, gently.
			setTimeout(connect, 2000);
		});
	};
	peer.on('open', connect);
	peer.on('error', (err) => {
		const type = String((err as { type?: string }).type ?? err);
		set('error', type === 'peer-unavailable' ? 'No game with that code. Check it with the Storyteller.' : type);
		if (type === 'peer-unavailable' && !closing) setTimeout(connect, 3000);
	});
	peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
	return link;
}
