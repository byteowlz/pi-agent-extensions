import { describe, expect, test } from "bun:test";
import { type RpcDeps, dispatchCommand } from "./dispatch";
import type { ClientCommand } from "./protocol";

interface DepsHarness extends RpcDeps {
	sent: Array<{ message: string; deliverAs?: string }>;
	aborts: number;
}

function createDeps(options: { streaming?: boolean; owner?: "tui" | "remote" } = {}): DepsHarness {
	const sent: Array<{ message: string; deliverAs?: string }> = [];
	return {
		sent,
		aborts: 0,
		isStreaming: () => options.streaming ?? false,
		sendUserMessage: (message, opts) => {
			sent.push({ message, deliverAs: opts?.deliverAs });
		},
		abort: () => undefined,
		getState: () => ({ ok: true }),
		getAvailableModels: () => ({ models: [] }),
		setModel: async () => true,
		setThinkingLevel: () => {},
		getMessages: () => [{ role: "user" }],
		leaseRequest: async () => ({ granted: (options.owner ?? "tui") === "remote" || true, reason: "test" }),
		leaseRelease: () => undefined,
		leaseOwner: () => options.owner ?? "tui",
	};
}

function abortDeps(options: { streaming?: boolean; owner?: "tui" | "remote" } = {}): DepsHarness {
	const h = createDeps(options);
	h.abort = () => {
		h.aborts += 1;
	};
	return h;
}

describe("pi-tui-rpc dispatch", () => {
	test("input commands are rejected while the TUI owns the lease", async () => {
		const deps = createDeps({ owner: "tui" });
		for (const type of ["prompt", "steer", "follow_up", "abort"] as const) {
			const command = { type, message: "hi" } as unknown as ClientCommand;
			const result = await dispatchCommand(command, deps);
			expect(result.success).toBe(false);
			expect(result.error).toBe("lease_denied:tui_owns_input");
		}
		expect(deps.sent).toEqual([]);
	});

	test("observation commands are allowed without the lease", async () => {
		const deps = createDeps({ owner: "tui" });
		const state = await dispatchCommand({ type: "get_state" }, deps);
		expect(state.success).toBe(true);
		const messages = await dispatchCommand({ type: "get_messages" }, deps);
		expect(messages.success).toBe(true);
		expect(messages.data).toEqual([{ role: "user" }]);
	});

	test("idle prompt delivers immediately", async () => {
		const deps = createDeps({ owner: "remote", streaming: false });
		const result = await dispatchCommand({ type: "prompt", message: "hello" }, deps);
		expect(result.success).toBe(true);
		expect(result.data).toEqual({ delivered: "immediately" });
		expect(deps.sent).toEqual([{ message: "hello", deliverAs: undefined }]);
	});

	test("streaming prompt without behavior is an error", async () => {
		const deps = createDeps({ owner: "remote", streaming: true });
		const result = await dispatchCommand({ type: "prompt", message: "hello" }, deps);
		expect(result.success).toBe(false);
		expect(result.error).toContain("streamingBehavior");
		expect(deps.sent).toEqual([]);
	});

	test("streaming prompt maps steer and followUp delivery", async () => {
		const deps = createDeps({ owner: "remote", streaming: true });
		const steer = await dispatchCommand({ type: "prompt", message: "a", streamingBehavior: "steer" }, deps);
		expect(steer.data).toEqual({ delivered: "steer" });
		const followUp = await dispatchCommand({ type: "prompt", message: "b", streamingBehavior: "followUp" }, deps);
		expect(followUp.data).toEqual({ delivered: "followUp" });
		expect(deps.sent).toEqual([
			{ message: "a", deliverAs: "steer" },
			{ message: "b", deliverAs: "followUp" },
		]);
	});

	test("idle steer/follow_up are errors", async () => {
		const deps = createDeps({ owner: "remote", streaming: false });
		const steer = await dispatchCommand({ type: "steer", message: "x" }, deps);
		expect(steer.success).toBe(false);
		expect(steer.error).toContain("idle");
		const followUp = await dispatchCommand({ type: "follow_up", message: "y" }, deps);
		expect(followUp.success).toBe(false);
	});

	test("streaming steer/follow_up deliver with mapped modes", async () => {
		const deps = createDeps({ owner: "remote", streaming: true });
		await dispatchCommand({ type: "steer", message: "s" }, deps);
		await dispatchCommand({ type: "follow_up", message: "f" }, deps);
		expect(deps.sent).toEqual([
			{ message: "s", deliverAs: "steer" },
			{ message: "f", deliverAs: "followUp" },
		]);
	});

	test("abort requires the lease and aborts exactly once", async () => {
		const denied = abortDeps({ owner: "tui" });
		const refused = await dispatchCommand({ type: "abort" }, denied);
		expect(refused.success).toBe(false);
		expect(denied.aborts).toBe(0);

		const granted = abortDeps({ owner: "remote" });
		const ok = await dispatchCommand({ type: "abort" }, granted);
		expect(ok.success).toBe(true);
		expect(granted.aborts).toBe(1);
	});

	test("lease request flows through deps and release reports tui", async () => {
		const deps = createDeps({ owner: "tui" });
		deps.leaseRequest = async () => ({ granted: true, reason: "tui_confirmed" });
		deps.leaseOwner = () => "remote";
		const request = await dispatchCommand({ type: "lease", action: "request" }, deps);
		expect(request.success).toBe(true);
		expect(request.data).toEqual({ owner: "remote", reason: "tui_confirmed" });

		deps.leaseOwner = () => "tui";
		const release = await dispatchCommand({ type: "lease", action: "release" }, deps);
		expect(release.data).toEqual({ owner: "tui" });
	});
});
