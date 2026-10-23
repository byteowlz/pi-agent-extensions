import { expect, test } from "bun:test";
import { createLease, takeoverDecision } from "./lease";

function pending() {
	let approve: (approved: boolean) => void = () => {
		throw new Error("uninitialized");
	};
	const answer = new Promise<boolean>((resolve) => {
		approve = resolve;
	});
	const changes: string[] = [];
	const lease = createLease({ confirmTakeover: () => answer, onChange: (owner) => changes.push(owner) });
	return { lease, approve, changes };
}

test("a second connection cannot borrow, renew or release the holder's input", async () => {
	const { lease, approve } = pending();
	const request = lease.requestRemote("a");
	approve(true);
	expect((await request).granted).toBe(true);
	expect(lease.heldBy("a")).toBe(true);
	expect(lease.heldBy("b")).toBe(false);
	expect((await lease.requestRemote("b")).granted).toBe(false);
	expect(lease.release("b")).toBe(false);
	lease.disconnect("b");
	expect(lease.heldBy("a")).toBe(true);
	lease.disconnect("a");
	expect(lease.owner()).toBe("tui");
});

test("terminal input, disconnect and session reset invalidate late confirmation", async () => {
	for (const reason of ["typing", "disconnect", "session"] as const) {
		const { lease, approve, changes } = pending();
		const request = lease.requestRemote("a");
		if (reason === "typing") lease.onTuiInput();
		else if (reason === "disconnect") lease.disconnect("a");
		else lease.reset();
		approve(true);
		expect((await request).granted).toBe(false);
		expect(lease.owner()).toBe("tui");
		expect(changes).toEqual([]);
	}
});

test("parallel takeover is refused instead of sharing a confirmation", async () => {
	const { lease, approve } = pending();
	const request = lease.requestRemote("a");
	expect((await lease.requestRemote("b")).reason).toBe("confirmation_pending");
	approve(true);
	await request;
	lease.reset();
});

test("confirmation exceptions deny and allow a later fresh request", async () => {
	const lease = createLease({
		confirmTakeover: async () => {
			throw new Error("gone");
		},
		onChange: () => {},
	});
	expect((await lease.requestRemote("a")).granted).toBe(false);
	expect((await lease.requestRemote("b")).reason).toBe("tui_denied");
});

test("input leases expire without a client message", async () => {
	const lease = createLease({ confirmTakeover: async () => true, onChange: () => {}, leaseDurationMs: 5 });
	await lease.requestRemote("a");
	await Bun.sleep(20);
	expect(lease.owner()).toBe("tui");
	expect(lease.heldBy("a")).toBe(false);
});

test("a granted lease lasts while the connection does", async () => {
	const lease = createLease({ confirmTakeover: async () => true, onChange: () => {} });
	expect((await lease.requestRemote("a")).granted).toBe(true);
	await Bun.sleep(20);
	expect(lease.heldBy("a")).toBe(true);
	lease.onTuiInput();
	expect(lease.owner()).toBe("tui");
});

test("remote input is granted by default; confirmation is opt-in", () => {
	expect(takeoverDecision({}, true)).toBe("grant");
	expect(takeoverDecision({}, false)).toBe("grant");
	expect(takeoverDecision({ PI_TUI_RPC_LEASE_CONFIRM: "1" }, true)).toBe("ask");
	expect(takeoverDecision({ PI_TUI_RPC_LEASE_CONFIRM: " 1 " }, false)).toBe("refuse");
	expect(takeoverDecision({ PI_TUI_RPC_LEASE_CONFIRM: "0" }, true)).toBe("grant");
});
