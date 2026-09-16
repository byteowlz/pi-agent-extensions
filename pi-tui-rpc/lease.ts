/**
 * Input lease state machine for pi-tui-rpc.
 *
 * Exactly one side owns input at a time:
 *   - `tui`    the person at the terminal (default owner)
 *   - `remote` a connected RPC client
 *
 * Remote takeover requires an explicit TUI confirmation. Any TUI-typed input
 * (pi `input` event with source "interactive") instantly reverts ownership to
 * the TUI. Ownership changes are announced through `onChange` so the host can
 * broadcast lease frames and update TUI status.
 */

import type { LeaseOwner } from "./protocol.js";

export interface LeaseCallbacks {
	/** Ask the TUI user to approve remote takeover. Resolve false to deny. */
	confirmTakeover(): Promise<boolean>;
	/** Called after every ownership change. */
	onChange(owner: LeaseOwner, reason: string): void;
}

export type LeaseRequestResult = { granted: boolean; reason: string };

export interface Lease {
	owner(): LeaseOwner;
	requestRemote(): Promise<LeaseRequestResult>;
	release(reason?: string): boolean;
	onTuiInput(): boolean;
	reset(reason?: string): boolean;
}

export function createLease(callbacks: LeaseCallbacks): Lease {
	let owner: LeaseOwner = "tui";

	const setOwner = (next: LeaseOwner, reason: string): boolean => {
		if (owner === next) {
			return false;
		}
		owner = next;
		callbacks.onChange(owner, reason);
		return true;
	};

	return {
		owner: () => owner,
		async requestRemote(): Promise<LeaseRequestResult> {
			if (owner === "remote") {
				return { granted: true, reason: "already_remote" };
			}
			const approved = await callbacks.confirmTakeover();
			if (!approved) {
				return { granted: false, reason: "tui_denied" };
			}
			setOwner("remote", "tui_confirmed");
			return { granted: true, reason: "tui_confirmed" };
		},
		release(reason = "client_release"): boolean {
			return setOwner("tui", reason);
		},
		onTuiInput(): boolean {
			return setOwner("tui", "tui_input");
		},
		reset(reason = "session_reset"): boolean {
			return setOwner("tui", reason);
		},
	};
}
