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

/** Drives the TUI custom confirm modal: mounts the factory, resolves on done(). */
function tuiContext(signal?: AbortSignal) {
	let handlers: { render: (w: number) => string[]; handleInput: (data: string) => void; invalidate: () => void } | undefined;
	const settled: unknown[] = [];
	const custom = mock(
		(factory: Parameters<ExtensionContext["ui"]["custom"]>[0]) =>
			new Promise<unknown>((resolve) => {
				const h = factory(
					// biome-ignore lint/suspicious/noExplicitAny: minimal TUI stand-in for tests
					{ requestRender: () => {} } as any,
					// biome-ignore lint/suspicious/noExplicitAny: minimal theme stand-in for tests
					{ fg: (_c: string, s: string) => s } as any,
					undefined as never,
					(v: unknown) => {
						settled.push(v);
						resolve(v);
					}
				);
				handlers = h as typeof handlers;
			})
	);
	const ctx = {
		mode: "tui",
		hasUI: true,
		signal: signal ?? new AbortController().signal,
		ui: { confirm: mock(), custom },
	} as unknown as ExtensionContext;
	return { ctx, handlers: () => handlers, settled };
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

	test("RPC confirm mode now inherits the bounded wait too (auto-deny on expiry)", async () => {
		const { ctx, confirm } = context("rpc", false);
		expect(await approveSpawn(ctx, config("confirm"), "Synthetic spawn", false)).toEqual({ ok: false });
		expect(confirm.mock.calls[0][2]?.timeout).toBe(1234);
	});

	test("RPC confirmTimeoutMs 0 opts out of the bounded wait", async () => {
		const { ctx, confirm } = context("rpc", false);
		const cfg = { ...config("confirm"), confirmTimeoutMs: 0 };
		expect(await approveSpawn(ctx, cfg, "Synthetic spawn", false)).toEqual({ ok: false });
		expect(confirm.mock.calls[0][2]?.timeout).toBeUndefined();
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

describe("TUI spawn confirmation bounds", () => {
	test("confirm mode arms the auto-deny countdown", async () => {
		const { ctx, handlers, settled } = tuiContext();
		const pending = approveSpawn(ctx, config("confirm"), "Synthetic spawn", false);
		await new Promise((r) => setTimeout(r, 5));
		const h = handlers();
		if (!h) throw new Error("custom modal never mounted");
		// The title advertises the auto-deny (never auto-allow) countdown.
		const title = h.render(80).join("\n");
		expect(title).toContain("Spawn subagent?");
		expect(title).toContain("auto-deny in");
		h.handleInput("y");
		expect(await pending).toEqual({ ok: true });
		expect(settled).toEqual([{ ok: true }]);
	});

	test("confirm mode auto-denies when nobody answers", async () => {
		const { ctx } = tuiContext();
		const pending = approveSpawn(ctx, { ...config("confirm"), confirmTimeoutMs: 30 }, "Synthetic spawn", false);
		expect(await pending).toEqual({ ok: false });
	});

	test("timeout mode keeps the configured auto-allow decision", async () => {
		const { ctx, handlers, settled } = tuiContext();
		const pending = approveSpawn(ctx, { ...config("timeout"), confirmTimeoutMs: 30 }, "Synthetic spawn", false);
		await new Promise((r) => setTimeout(r, 5));
		const h = handlers();
		if (!h) throw new Error("custom modal never mounted");
		const title = h.render(80).join("\n");
		expect(title).toContain("auto-allow in");
		expect(await pending).toEqual({ ok: true });
		expect(settled).toEqual([{ ok: true }]);
	});

	test("an aborted tool call denies the confirmation immediately", async () => {
		const controller = new AbortController();
		const { ctx } = tuiContext(controller.signal);
		const pending = approveSpawn(ctx, config("confirm"), "Synthetic spawn", false);
		controller.abort();
		expect(await pending).toEqual({ ok: false });
	});

	test("confirmTimeoutMs 0 keeps the confirm wait unbounded", async () => {
		const { ctx, handlers } = tuiContext();
		const pending = approveSpawn(ctx, { ...config("confirm"), confirmTimeoutMs: 0 }, "Synthetic spawn", false);
		await new Promise((r) => setTimeout(r, 5));
		const h = handlers();
		if (!h) throw new Error("custom modal never mounted");
		const title = h.render(80).join("\n");
		expect(title).not.toContain("auto-deny in");
		h.handleInput("n");
		expect(await pending).toEqual({ ok: false });
	});
});
