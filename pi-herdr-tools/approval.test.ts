import { describe, expect, mock, test } from "bun:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { approveSpawn } from "./index.js";

function config(allowMode: "auto" | "confirm" | "timeout"): Parameters<typeof approveSpawn>[1] {
	return {
		enabled: true,
		requireConfirmation: true,
		allowedModels: [],
		allowedKinds: ["pi"],
		maxSubagents: 1,
		allowMode,
		autoDecision: "allow",
		confirmTimeoutMs: 1234,
		loadouts: {},
	};
}

function context(mode: "rpc" | "print", answer: boolean) {
	const confirm = mock(async (..._args: Parameters<ExtensionContext["ui"]["confirm"]>) => answer);
	const custom = mock(() => {
		throw new Error("RPC must not invoke a terminal component");
	});
	const ctx = {
		mode,
		hasUI: mode === "rpc",
		signal: new AbortController().signal,
		ui: { confirm, custom },
	} as unknown as ExtensionContext;
	return { ctx, confirm, custom };
}

describe("Pi 1.0 subagent approval modes", () => {
	for (const answer of [true, false]) {
		test(`RPC uses a real confirmation dialog and preserves ${answer ? "approval" : "denial"}`, async () => {
			const { ctx, confirm, custom } = context("rpc", answer);
			expect(await approveSpawn(ctx, config("confirm"), "Synthetic spawn", false)).toEqual({ ok: answer });
			expect(confirm).toHaveBeenCalledTimes(1);
			expect(confirm.mock.calls[0][2]?.signal).toBe(ctx.signal);
			expect(custom).not.toHaveBeenCalled();
		});
	}

	test("RPC timeout does not inherit a terminal auto-allow decision", async () => {
		const { ctx, confirm } = context("rpc", false);
		expect(await approveSpawn(ctx, config("timeout"), "Synthetic spawn", false)).toEqual({ ok: false });
		expect(confirm.mock.calls[0][2]?.timeout).toBe(1234);
	});

	test("missing UI fails closed in confirmation mode", async () => {
		const { ctx, confirm, custom } = context("print", true);
		expect(await approveSpawn(ctx, config("confirm"), "Synthetic spawn", false)).toEqual({ ok: false });
		expect(confirm).not.toHaveBeenCalled();
		expect(custom).not.toHaveBeenCalled();
	});

	test("explicit auto policy remains usable headlessly", async () => {
		const { ctx, confirm } = context("print", false);
		expect(await approveSpawn(ctx, config("auto"), "Synthetic spawn", false)).toEqual({ ok: true });
		expect(confirm).not.toHaveBeenCalled();
	});
});
