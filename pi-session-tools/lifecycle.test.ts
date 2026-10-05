import { describe, expect, test } from "bun:test";
import { isLiveSession, shouldReconnect } from "./lifecycle";

describe("pi-herdr-tools lifecycle (piext-ge92)", () => {
	describe("isLiveSession", () => {
		test("long-lived TUI/RPC sessions arm the trackers", () => {
			expect(isLiveSession(true, "tui")).toBe(true);
			expect(isLiveSession(true, "rpc")).toBe(true);
			expect(isLiveSession(true, undefined)).toBe(true); // hasUI truthy is authoritative
		});

		test("single-shot print/json modes do NOT arm the trackers", () => {
			expect(isLiveSession(false, "print")).toBe(false);
			expect(isLiveSession(false, "json")).toBe(false);
		});

		test("runtime mode fallback: rpc/tui arm even when hasUI is falsy", () => {
			expect(isLiveSession(false, "rpc")).toBe(true);
			expect(isLiveSession(false, "tui")).toBe(true);
		});
	});

	describe("shouldReconnect", () => {
		test("reconnects while active", () => {
			expect(shouldReconnect(false)).toBe(true);
		});

		test("does NOT reconnect after a deliberate stop (prevents the hang)", () => {
			expect(shouldReconnect(true)).toBe(false);
		});
	});
});
