/**
 * Lifecycle helpers for pi-herdr-tools (and the print-mode fix).
 *
 * These are pure decisions extracted so they can be unit-tested without a
 * live socket or session. See piext-ge92: single-shot `pi -p` must exit
 * promptly after answering, so long-lived trackers (the herdr socket event
 * subscriber and the subagent poll timer) must only be armed for long-lived
 * TUI/RPC sessions, and must not reconnect after a deliberate stop.
 */

/** True for long-lived (TUI/RPC) sessions where subagent tracking is useful. */
export function isLiveSession(hasUI: boolean, mode: string | undefined): boolean {
	// hasUI is false in single-shot print/json mode and true for TUI/RPC, so it
	// is the type-safe signal; the runtime `mode` is consulted when present.
	if (hasUI) return true;
	return mode === "rpc" || mode === "tui";
}

/**
 * Decide whether the event subscriber should attempt a reconnect after a
 * socket close/error. A deliberate stop (`stopEventSubscriber`) must suppress
 * reconnection forever, otherwise the reconnect timer keeps the process's
 * event loop alive after session_shutdown and `pi -p` never exits.
 */
export function shouldReconnect(stopped: boolean): boolean {
	return !stopped;
}
