/** Terminal-confirmed input ownership, bound to one live socket connection.
 * No token/owner is accepted from a client payload. A pending confirmation is
 * generation-fenced against disconnect, terminal input and session changes.
 */
import type { LeaseOwner } from "./protocol.js";

export interface LeaseCallbacks {
	confirmTakeover(): Promise<boolean>;
	onChange(owner: LeaseOwner, reason: string): void;
	/** Trusted embedding/test setting; never more than one minute. */
	leaseDurationMs?: number;
}
export type LeaseRequestResult = { granted: boolean; reason: string };
export interface Lease {
	owner(): LeaseOwner;
	heldBy(clientId: string): boolean;
	requestRemote(clientId: string): Promise<LeaseRequestResult>;
	release(clientId: string, reason?: string): boolean;
	disconnect(clientId: string): void;
	onTuiInput(): boolean;
	reset(reason?: string): boolean;
}
export function createLease(callbacks: LeaseCallbacks): Lease {
	const duration = callbacks.leaseDurationMs ?? 60_000;
	if (!Number.isInteger(duration) || duration < 1 || duration > 60_000) throw new Error("Invalid input lease duration");
	let holder: string | undefined;
	let pending: string | undefined;
	let generation = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const reset = (reason = "session_reset"): boolean => {
		generation += 1;
		pending = undefined;
		clearTimeout(timer);
		timer = undefined;
		const changed = holder !== undefined;
		holder = undefined;
		if (changed) callbacks.onChange("tui", reason);
		return changed;
	};
	return {
		owner: () => (holder === undefined ? "tui" : "remote"),
		heldBy: (clientId) => holder === clientId,
		async requestRemote(clientId) {
			if (!clientId) return { granted: false, reason: "invalid_connection" };
			if (holder !== undefined)
				return { granted: holder === clientId, reason: holder === clientId ? "already_remote" : "other_connection" };
			if (pending !== undefined) return { granted: false, reason: "confirmation_pending" };
			pending = clientId;
			const admittedGeneration = generation;
			let approved = false;
			try {
				approved = await callbacks.confirmTakeover();
			} catch {
				/* denial */
			}
			if (admittedGeneration !== generation || pending !== clientId)
				return { granted: false, reason: "confirmation_invalidated" };
			pending = undefined;
			if (!approved) return { granted: false, reason: "tui_denied" };
			holder = clientId;
			timer = setTimeout(() => reset("expired"), duration);
			timer.unref();
			callbacks.onChange("remote", "tui_confirmed");
			return { granted: true, reason: "tui_confirmed" };
		},
		release(clientId, reason = "client_release") {
			if (holder !== clientId) return false;
			return reset(reason);
		},
		disconnect(clientId) {
			if (holder === clientId || pending === clientId) reset("client_disconnect");
		},
		onTuiInput: () => reset("tui_input"),
		reset,
	};
}
