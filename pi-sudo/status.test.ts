import { expect, test } from "bun:test";
import { describeSshStatus } from "../pi-ssh-key/index.js";
import { describeSudoStatus } from "./index.js";

test("sudo status is absent without a cached password", () => {
	expect(describeSudoStatus(false, 120_000, 0)).toBeUndefined();
});

test("sudo status counts down and escalates color by remaining time", () => {
	expect(describeSudoStatus(true, 5 * 60_000, 0)).toEqual({ key: "sudo", text: "5m00s" });
	expect(describeSudoStatus(true, 90_000, 0)).toEqual({ key: "sudo-warn", text: "1m30s" });
	expect(describeSudoStatus(true, 20_000, 0)).toEqual({ key: "sudo-crit", text: "20s" });
	// No TTL (infinite) renders the infinity glyph and stays on the calm key.
	expect(describeSudoStatus(true, Number.POSITIVE_INFINITY, 0)).toEqual({ key: "sudo", text: "∞" });
});

test("sudo status appends remaining turns when that policy is the binding one", () => {
	expect(describeSudoStatus(true, 60_000, 2)).toEqual({ key: "sudo-warn", text: "1m00s · 2t" });
});

test("ssh status reports the key count and the soonest expiry", () => {
	expect(describeSshStatus([])).toBeUndefined();
	expect(describeSshStatus([{}])).toEqual({ text: "1 key", expiring: false });
	const now = 1_000_000;
	expect(describeSshStatus([{ expiresAt: now + 90_000 }, { expiresAt: now + 30_000 }], now)).toEqual({
		text: "2 keys · 30s",
		expiring: true,
	});
	// Already-expired keys do not produce a negative countdown.
	expect(describeSshStatus([{ expiresAt: now - 1 }], now)).toEqual({ text: "1 key", expiring: false });
});
