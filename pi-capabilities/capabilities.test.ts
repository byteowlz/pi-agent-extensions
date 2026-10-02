import { describe, expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { PresentationBindRequest, PresentationSnapshot } from "./contract.ts";
import extension from "./index.ts";
import { QUERY_EVENT, REPLY_STATUS, parseRequest } from "./protocol.ts";
import { PresentationRegistry } from "./registry.ts";

const bind: PresentationBindRequest = {
	version: 1,
	id: "frontend-1",
	clientKind: "oqto-web",
	capabilities: ["selection.questions.v1"],
};
describe("parser", () => {
	test("strict version, keys, tokens, capability allowlist and leases", () => {
		expect(parseRequest("presentation-bind", JSON.stringify(bind)).ok).toBe(true);
		for (const patch of [
			{ version: 2 },
			{ url: "https://example.org" },
			{ authorized: true },
			{ id: "https://x" },
			{ requestId: "\u001b" },
			{ clientKind: "browser" },
			{ capabilities: ["unknown"] },
			{ capabilities: ["selection.questions.v1", "selection.questions.v1"] },
			{ leaseMs: 4999 },
			{ leaseMs: 600001 },
			{ leaseMs: 5000.5 },
			{ leaseMs: null },
		]) {
			expect(parseRequest("presentation-bind", JSON.stringify({ ...bind, ...patch })).ok).toBe(false);
		}
		for (const leaseMs of [5000, 600000])
			expect(parseRequest("presentation-bind", JSON.stringify({ ...bind, leaseMs })).ok).toBe(true);
		for (const input of ["", "null", "[]", "{", "true", '{"version":1,"scopeId":"other"}'])
			expect(parseRequest("presentation-list", input).ok).toBe(false);
		expect(parseRequest("presentation-unbind", '{"version":1,"id":"a"}').ok).toBe(true);
		expect(parseRequest("presentation-list", '{"version":1,"id":"a"}').ok).toBe(false);
		expect(parseRequest("presentation-bind", '{"version":2,"requestId":"r-1"}')).toEqual({ ok: false, requestId: "r-1" });
	});
});
describe("registry", () => {
	test("scope isolation, renewal, expiry boundary and idempotent removal", () => {
		let now = 1000;
		const registry = new PresentationRegistry(() => now);
		registry.bind("a", bind);
		registry.bind("b", { ...bind, leaseMs: 5000 });
		expect(registry.snapshot("a").bindings[0]?.expiresAt).toBe(61000);
		expect(registry.snapshot("unknown").bindings).toEqual([]);
		now = 6000;
		expect(registry.snapshot("b").bindings).toEqual([]);
		registry.bind("a", { ...bind, capabilities: ["selection.review.v1"] });
		expect(registry.snapshot("a").bindings).toHaveLength(1);
		expect(registry.snapshot("a").bindings[0]?.expiresAt).toBe(66000);
		registry.unbind("b", bind.id);
		expect(registry.snapshot("a").bindings).toHaveLength(1);
		registry.unbind("a", bind.id);
		registry.unbind("a", bind.id);
		expect(registry.snapshot("a").bindings).toEqual([]);
		registry.bind("a", bind);
		registry.clear();
		expect(registry.snapshot("a").bindings).toEqual([]);
	});
	test("input copies and deeply frozen independent snapshots", () => {
		const registry = new PresentationRegistry(() => 0);
		const input = { ...bind, capabilities: [...bind.capabilities] };
		registry.bind("a", input);
		input.capabilities.length = 0;
		const first = registry.snapshot("a");
		const second = registry.snapshot("a");
		expect(first).not.toBe(second);
		expect(first.bindings[0]).not.toBe(second.bindings[0]);
		for (const value of [first, first.bindings, first.bindings[0], first.bindings[0]?.capabilities])
			expect(Object.isFrozen(value)).toBe(true);
		expect(() => (first.bindings as unknown[]).push({})).toThrow();
		expect(second.bindings[0]?.capabilities).toEqual(bind.capabilities);
	});
});

function harness() {
	const commands = new Map<string, { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }>();
	const hooks = new Map<string, () => void>();
	const bus = new Map<string, (data: unknown) => void>();
	const statuses: [string, string | undefined][] = [];
	const notices: string[] = [];
	const forbidden = () => {
		throw new Error("Forbidden model/transcript operation");
	};
	const api = {
		registerCommand: (name: string, command: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }) =>
			commands.set(name, command),
		on: (name: string, hook: () => void) => {
			hooks.set(name, hook);
			return () => hooks.delete(name);
		},
		events: {
			on: (name: string, handler: (data: unknown) => void) => {
				bus.set(name, handler);
				return () => {
					bus.delete(name);
				};
			},
		},
		sendMessage: forbidden,
		sendUserMessage: forbidden,
		appendEntry: forbidden,
	} as unknown as ExtensionAPI;
	extension(api);
	const context = (scopeId = "a", mode = "rpc") =>
		({
			mode,
			sessionManager: { getSessionId: () => scopeId },
			ui: {
				setStatus: (key: string, text: string | undefined) => statuses.push([key, text]),
				notify: (text: string) => notices.push(text),
			},
			modelRegistry: new Proxy({}, { get: forbidden }),
		}) as unknown as ExtensionCommandContext;
	const run = async (name: string, args: unknown, scopeId = "a", mode = "rpc") => {
		const command = commands.get(name);
		if (!command) throw new Error("Missing command");
		await command.handler(typeof args === "string" ? args : JSON.stringify(args), context(scopeId, mode));
	};
	const query = (scopeId: string) => {
		let result: PresentationSnapshot | undefined;
		bus.get(QUERY_EVENT)?.({
			version: 1,
			scopeId,
			reply: (snapshot: PresentationSnapshot) => {
				result = snapshot;
			},
		});
		return result;
	};
	return { commands, hooks, bus, statuses, notices, run, query };
}
describe("factory", () => {
	test("metadata-only commands, correlated status, isolation and safe native summary", async () => {
		const h = harness();
		expect(h.commands.size).toBe(3);
		expect(h.bus.size).toBe(0);
		h.hooks.get("session_start")?.();
		await h.run("presentation-bind", { ...bind, requestId: "r-1" });
		expect(h.statuses[0]?.[0]).toBe(REPLY_STATUS);
		expect(JSON.parse(h.statuses[0]?.[1] ?? "")).toMatchObject({
			version: 1,
			requestId: "r-1",
			ok: true,
			snapshot: { scopeId: "a" },
		});
		expect(h.query("a")?.bindings).toHaveLength(1);
		expect(h.query("b")?.bindings).toEqual([]);
		await h.run("presentation-list", { version: 1 }, "b");
		await h.run("presentation-unbind", { version: 1, id: bind.id }, "b");
		expect(h.query("a")?.bindings).toHaveLength(1);
		await h.run("presentation-bind", { ...bind, url: "secret-url", requestId: "r-2" });
		expect(JSON.parse(h.statuses.at(-1)?.[1] ?? "")).toMatchObject({ requestId: "r-2", ok: false, error: "invalid-request" });
		await h.run("presentation-list", { version: 1 }, "a", "tui");
		await h.run("presentation-bind", "secret-url", "a", "tui");
		expect(h.notices).toEqual(["Presentation metadata: 1 active binding(s).", "Invalid presentation metadata request."]);
		await h.run("presentation-unbind", { version: 1, id: bind.id });
		expect(h.query("a")?.bindings).toEqual([]);
	});
	test("start/tree/reload-equivalent/shutdown cleanup and malformed queries", async () => {
		const h = harness();
		h.hooks.get("session_start")?.();
		for (const hook of ["session_start", "session_tree"]) {
			await h.run("presentation-bind", bind);
			h.hooks.get(hook)?.();
			expect(h.query("a")?.bindings).toEqual([]);
		}
		let called = false;
		for (const data of [
			null,
			{
				version: 2,
				scopeId: "a",
				reply: () => {
					called = true;
				},
			},
			{
				version: 1,
				scopeId: 2,
				reply: () => {
					called = true;
				},
			},
			{ version: 1, scopeId: "a", reply: true },
		])
			h.bus.get(QUERY_EVENT)?.(data);
		expect(called).toBe(false);
		await h.run("presentation-bind", bind);
		h.hooks.get("session_shutdown")?.();
		h.hooks.get("session_shutdown")?.();
		expect(h.bus.size).toBe(0);
		h.hooks.get("session_start")?.();
		expect(h.query("a")?.bindings).toEqual([]);
		const fresh = harness();
		fresh.hooks.get("session_start")?.();
		expect(fresh.query("a")?.bindings).toEqual([]);
	});
});
