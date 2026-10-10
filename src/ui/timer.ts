/**
 * timer.ts - pausable countdowns, as plain data so they can be saved.
 *
 * A timer is never "ticking" in memory: it records when it was last started
 * and how much had elapsed before that. So it survives a page reload, and a
 * phone that sleeps mid-defence wakes up with the right time left.
 */

export interface Timer {
	durationMs: number;
	/** Wall-clock ms when last started; null while paused. */
	startedAt: number | null;
	/** Time used before the current run. */
	usedMs: number;
}

export const newTimer = (durationMs: number): Timer => ({ durationMs, startedAt: null, usedMs: 0 });

export const used = (t: Timer, now: number) => t.usedMs + (t.startedAt === null ? 0 : now - t.startedAt);
export const remaining = (t: Timer, now: number) => Math.max(0, t.durationMs - used(t, now));
export const running = (t: Timer) => t.startedAt !== null;
export const expired = (t: Timer, now: number) => remaining(t, now) === 0;

export function start(t: Timer, now: number): Timer {
	return t.startedAt === null && !expired(t, now) ? { ...t, startedAt: now } : t;
}

export function pause(t: Timer, now: number): Timer {
	return t.startedAt === null ? t : { ...t, startedAt: null, usedMs: used(t, now) };
}

export function toggle(t: Timer, now: number): Timer {
	return running(t) ? pause(t, now) : start(t, now);
}

/** Back to full time, keeping whether it was running. */
export function restart(t: Timer, now: number): Timer {
	return { durationMs: t.durationMs, usedMs: 0, startedAt: running(t) ? now : null };
}

/** Add (or take away) time; never below what is already used. */
export function extend(t: Timer, deltaMs: number, now: number): Timer {
	return { ...t, durationMs: Math.max(used(t, now), t.durationMs + deltaMs) };
}

export function clock(ms: number): string {
	const s = Math.ceil(ms / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
