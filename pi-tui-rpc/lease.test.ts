import { describe, expect, test } from "bun:test";
import { createLease } from "./lease";
import type { LeaseOwner } from "./protocol";

interface Harness {
	owner(): LeaseOwner;
	requestRemote(): Promise<{ granted: boolean; reason: string }>;
	release(reason?: string): boolean;
	onTuiInput(): boolean;
	reset(reason?: string): boolean;
	confirmCalls(): number;
	setConfirmResult(result: boolean): void;
	changes(): Array<{ owner: LeaseOwner; reason: string }>;
}

function createHarness(): Harness {
	let confirmResult = true;
	let confirmCalls = 0;
	const changes: Array<{ owner: LeaseOwner; reason: string }> = [];
	const lease = createLease({
		confirmTakeover: async () => {
			confirmCalls += 1;
			return confirmResult;
		},
		onChange: (owner, reason) => {
			changes.push({ owner, reason });
		},
	});
	return {
		owner: lease.owner,
		requestRemote: lease.requestRemote,
		release: lease.release,
		onTuiInput: lease.onTuiInput,
		reset: lease.reset,
		confirmCalls: () => confirmCalls,
		setConfirmResult: (result) => {
			confirmResult = result;
		},
		changes: () => changes,
	};
}

describe("pi-tui-rpc lease", () => {
	test("starts owned by the TUI", () => {
		const h = createHarness();
		expect(h.owner()).toBe("tui");
		expect(h.changes()).toEqual([]);
	});

	test("remote takeover requires TUI confirmation", async () => {
		const h = createHarness();
		h.setConfirmResult(false);
		const denied = await h.requestRemote();
		expect(denied.granted).toBe(false);
		expect(denied.reason).toBe("tui_denied");
		expect(h.owner()).toBe("tui");
		expect(h.confirmCalls()).toBe(1);
		expect(h.changes()).toEqual([]);

		h.setConfirmResult(true);
		const granted = await h.requestRemote();
		expect(granted).toEqual({ granted: true, reason: "tui_confirmed" });
		expect(h.owner()).toBe("remote");
		expect(h.changes()).toEqual([{ owner: "remote", reason: "tui_confirmed" }]);
	});

	test("requesting while already remote does not re-confirm", async () => {
		const h = createHarness();
		await h.requestRemote();
		expect(h.confirmCalls()).toBe(1);
		const again = await h.requestRemote();
		expect(again).toEqual({ granted: true, reason: "already_remote" });
		expect(h.confirmCalls()).toBe(1);
	});

	test("TUI typing instantly reverts ownership", async () => {
		const h = createHarness();
		await h.requestRemote();
		const reverted = h.onTuiInput();
		expect(reverted).toBe(true);
		expect(h.owner()).toBe("tui");
		expect(h.changes()).toEqual([
			{ owner: "remote", reason: "tui_confirmed" },
			{ owner: "tui", reason: "tui_input" },
		]);
	});

	test("TUI typing while TUI owns is a no-op", () => {
		const h = createHarness();
		expect(h.onTuiInput()).toBe(false);
		expect(h.changes()).toEqual([]);
	});

	test("release only transitions from remote", async () => {
		const h = createHarness();
		expect(h.release()).toBe(false);
		await h.requestRemote();
		expect(h.release("explicit")).toBe(true);
		expect(h.owner()).toBe("tui");
		expect(h.changes()).toEqual([
			{ owner: "remote", reason: "tui_confirmed" },
			{ owner: "tui", reason: "explicit" },
		]);
	});

	test("reset returns ownership to the TUI", async () => {
		const h = createHarness();
		await h.requestRemote();
		expect(h.reset("session_reset")).toBe(true);
		expect(h.owner()).toBe("tui");
	});
});
