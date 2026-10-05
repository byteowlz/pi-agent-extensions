import { describe, expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import bridge from "./index.js";

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;

function harness(mode: "rpc" | "tui") {
	const handlers = new Map<string, Handler>();
	const statuses: Array<{ key: string; value?: string }> = [];
	const pi = {
		on: (event: string, handler: Handler) => {
			handlers.set(event, handler);
			return () => handlers.delete(event);
		},
	} as unknown as ExtensionAPI;
	const ctx = {
		mode,
		hasUI: true, // This is true in BOTH modes in Pi 1.0.
		sessionManager: { getSessionId: () => "synthetic-native-id" },
		ui: { setStatus: (key: string, value?: string) => statuses.push({ key, value }) },
	} as unknown as ExtensionContext;
	bridge(pi);
	return {
		statuses,
		fire: (name: string, event: unknown = {}) => {
			const handler = handlers.get(name);
			if (!handler) throw new Error(`Missing ${name} handler`);
			return handler(event, ctx);
		},
	};
}

describe("Pi 1.0 Oqto bridge mode and settlement", () => {
	test("RPC telemetry is emitted even when RPC has UI and argv is not a CLI invocation", () => {
		const { fire, statuses } = harness("rpc");
		fire("input", { source: "rpc", text: 'Synthetic input [[oqto_meta:{"clientId":"input-1"}]]' });
		const queue = statuses.find(({ key }) => key === "oqto_queue_event");
		expect(queue).toBeDefined();
		expect(JSON.parse(queue?.value ?? "null")).toMatchObject({ type: "enqueued", clientId: "input-1" });
	});

	test("queue telemetry is not painted into the native TUI", () => {
		const { fire, statuses } = harness("tui");
		fire("input", { source: "rpc", text: 'Synthetic input [[oqto_meta:{"clientId":"input-1"}]]' });
		expect(statuses.some(({ key }) => key === "oqto_queue_event")).toBe(false);
	});

	test("low-level agent_end does not clear phase before final settlement", () => {
		const { fire, statuses } = harness("rpc");
		fire("agent_start");
		fire("agent_end", { messages: [], willRetry: true });
		expect(statuses.at(-1)).toEqual({ key: "oqto_phase", value: "generating" });
		fire("tool_call", { toolName: "synthetic-tool" });
		expect(statuses.at(-1)).toEqual({ key: "oqto_phase", value: "tool_running:synthetic-tool" });
		fire("agent_settled");
		expect(statuses.at(-1)).toEqual({ key: "oqto_phase", value: undefined });
	});
});
