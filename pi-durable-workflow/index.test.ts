import { describe, expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import extension from "./index.js";

type Handler = (_event: unknown, ctx: ExtensionContext) => Promise<unknown>;
function fixture() {
	const hooks = new Map<string, Handler>();
	const entries: unknown[] = [];
	let tool: {
		parameters: unknown;
		description: string;
		execute: (...args: unknown[]) => Promise<{
			structuredContent: {
				ok: boolean;
				recurrenceActive: boolean;
				code?: string;
				message: string;
				proposals: { id: string; revision: number; state: string; allowSubagents: boolean; intervalMs: number }[];
			};
		}>;
	};
	let id = "session-a";
	let answer = "Y — Approve reviewed version";
	let select: (() => Promise<string | undefined>) | undefined;
	const ctx = {
		cwd: "/synthetic",
		mode: "rpc",
		hasUI: true,
		model: { provider: "fixture", id: "model" },
		sessionManager: {
			getSessionId: () => id,
			getBranch: () => entries,
			buildContextEntries: () => [
				{ type: "message", id: "primer", message: { role: "user", content: "Remember the synthetic priming token: garden" } },
			],
		},
		ui: {
			select: async () => (select ? select() : answer),
			editor: async () =>
				JSON.stringify({
					name: "Edited",
					prompt: "Use the priming token",
					interval: "2h",
					tools: [],
					allowSubagents: false,
					limits: { maxRuns: 3, maxDurationMs: 1000, maxOutputBytes: 1000 },
				}),
			notify: () => {},
		},
	} as unknown as ExtensionContext;
	extension({
		on: (name: string, handler: Handler) => hooks.set(name, handler),
		registerTool: (value: typeof tool) => {
			tool = value;
		},
		registerCommand: () => {},
		appendEntry: (customType: string, data: unknown) => entries.push({ type: "custom", customType, data: structuredClone(data) }),
	} as unknown as ExtensionAPI);
	return {
		ctx,
		schema: () => JSON.stringify({ parameters: tool.parameters, description: tool.description }),
		hooks,
		entries,
		setId: (v: string) => {
			id = v;
		},
		setAnswer: (v: string) => {
			answer = v;
		},
		setSelect: (fn: () => Promise<string | undefined>) => {
			select = fn;
		},
		call: async (params: unknown) => tool.execute("fixture", params, undefined, undefined, ctx),
	};
}
const propose = { action: "propose", name: "Test Job", prompt: "Use the priming token", interval: "30m" };

describe("workflow proposal and review without granting execution authority", () => {
	test("model-visible interval hints prevent filesystem discovery; weekly remains approval-gated", async () => {
		const f = fixture();
		expect(f.schema()).toContain("weekly=7d");
		expect(f.schema()).toContain("30m");
		expect(f.schema()).toContain("not a Pi builtin");
		await f.hooks.get("session_start")?.({}, f.ctx);
		f.setAnswer("N — Reject");
		const rejected = await f.call({ ...propose, interval: "weekly" });
		expect(rejected.structuredContent.proposals[0].intervalMs).toBe(604800000);
		expect(rejected.structuredContent.proposals[0].state).toBe("rejected");
		expect(rejected.structuredContent.recurrenceActive).toBe(false);
		const invalid = await f.call({ ...propose, interval: "P7D" });
		expect(invalid.structuredContent.message).toContain("Use an elapsed duration");
		expect(invalid.structuredContent.message).toContain("7d");
	});
	test("Y reviews the exact version, defaults subagents off, activation fails closed", async () => {
		const f = fixture();
		await f.hooks.get("session_start")?.({}, f.ctx);
		const p = await f.call(propose);
		expect(p.structuredContent.proposals[0].state).toBe("approved");
		expect(p.structuredContent.proposals[0].allowSubagents).toBe(false);
		expect(p.structuredContent.recurrenceActive).toBe(false);
		const activated = await f.call({ action: "activate", id: p.structuredContent.proposals[0].id });
		expect(activated.structuredContent.code).toBe("adapter_unavailable");
		expect(activated.structuredContent.ok).toBe(false);
	});
	test("N rejects and headless creation stays draft", async () => {
		const f = fixture();
		await f.hooks.get("session_start")?.({}, f.ctx);
		f.setAnswer("N — Reject");
		expect((await f.call(propose)).structuredContent.proposals[0].state).toBe("rejected");
		(f.ctx as { hasUI: boolean }).hasUI = false;
		expect((await f.call(propose)).structuredContent.proposals[0].state).toBe("draft");
	});
	test("Edit invalidates the first version and final Y approves revision2", async () => {
		const f = fixture();
		await f.hooks.get("session_start")?.({}, f.ctx);
		let calls = 0;
		f.setSelect(async () => (calls++ === 0 ? "Edit" : "Y — Approve reviewed version"));
		const p = await f.call(propose);
		expect(p.structuredContent.proposals[0].revision).toBe(2);
		expect(p.structuredContent.proposals[0].state).toBe("approved");
	});
	test("session changes during dialog cannot append approval to the new session", async () => {
		const f = fixture();
		await f.hooks.get("session_start")?.({}, f.ctx);
		let release: (v: string) => void = () => {};
		f.setSelect(
			() =>
				new Promise((resolve) => {
					release = resolve;
				})
		);
		const pending = f.call(propose);
		for (let i = 0; i < 20 && f.entries.length === 0; i++) await new Promise((r) => setTimeout(r, 1));
		f.setId("session-b");
		await f.hooks.get("session_start")?.({}, f.ctx);
		release("Y — Approve reviewed version");
		expect((await pending).structuredContent.code).toBe("workflow_error");
		expect(f.entries).toHaveLength(1);
		expect((await f.call({ action: "list" })).structuredContent.proposals).toHaveLength(0);
	});
	test("reload restores valid own records but a fork inherits no proposals", async () => {
		const f = fixture();
		await f.hooks.get("session_start")?.({}, f.ctx);
		await f.call(propose);
		await f.hooks.get("session_start")?.({}, f.ctx);
		expect((await f.call({ action: "list" })).structuredContent.proposals).toHaveLength(1);
		f.setId("child");
		await f.hooks.get("session_start")?.({}, f.ctx);
		expect((await f.call({ action: "list" })).structuredContent.proposals).toHaveLength(0);
	});
});
