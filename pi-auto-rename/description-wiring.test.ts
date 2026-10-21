import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DESCRIPTION_ENTRY_TYPE, DESCRIPTION_EVENT, readSessionDescription } from "./description.js";
import extension from "./index.js";

type Entry = { type: string; customType?: string; data?: unknown };

function harness() {
	const entries: Entry[] = [];
	const emitted: { name: string; payload: unknown }[] = [];
	const notifications: string[] = [];
	const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => Promise<void>>();
	const tools = new Map<string, { execute: (...args: unknown[]) => Promise<unknown> }>();
	let command: ((args: string, ctx: ExtensionCommandContext) => Promise<void>) | undefined;
	let sessionId = "s1";
	const cwd = mkdtempSync(join(tmpdir(), "describe-"));
	const pi = {
		appendEntry: (customType: string, data: unknown) => {
			entries.push({ type: "custom", customType, data });
		},
		events: { emit: (name: string, payload: unknown) => emitted.push({ name, payload }) },
		getSessionName: () => "",
		setSessionName: () => undefined,
		registerTool: (tool: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) => tools.set(tool.name, tool),
		registerCommand: (_name: string, options: { handler: typeof command }) => {
			command = options.handler;
		},
		on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void>) => handlers.set(name, handler),
		getFlag: () => undefined,
	} as unknown as ExtensionAPI;
	extension(pi);
	const ctx = {
		cwd,
		mode: "tui",
		hasUI: true,
		sessionManager: {
			getBranch: () => entries,
			getSessionId: () => sessionId,
			getSessionFile: () => join(cwd, "session.jsonl"),
		},
		ui: { notify: (text: string) => notifications.push(text), setStatus: () => undefined },
	} as unknown as ExtensionCommandContext;
	return {
		entries,
		emitted,
		notifications,
		ctx,
		cwd,
		handlers,
		describe: (description: string, topics?: string[]) =>
			tools.get("describe_session")?.execute("call", { description, ...(topics ? { topics } : {}) }, undefined, undefined, ctx),
		run: async (args: string) => {
			if (!command) throw new Error("no command");
			await command(args, ctx);
		},
		setSessionId: (value: string) => {
			sessionId = value;
		},
		current: () => readSessionDescription(entries),
		close: () => rmSync(cwd, { recursive: true, force: true }),
	};
}

test("the tool writes a bounded routing entry and emits it", async () => {
	const h = harness();
	try {
		const result = (await h.describe("  Reviewing\nHerdr socket code ", [" Herdr ", "herdr"])) as {
			structuredContent: { ok: boolean; description: string; topics: string[]; revision: number };
		};
		expect(result.structuredContent).toMatchObject({
			ok: true,
			description: "Reviewing Herdr socket code",
			topics: ["herdr"],
			revision: 1,
		});
		expect(h.current()).toMatchObject({ by: "agent", description: "Reviewing Herdr socket code" });
		expect(h.emitted.at(-1)?.name).toBe(DESCRIPTION_EVENT);
		// A later write bumps the revision.
		await h.describe("Next focus");
		expect(h.current()?.revision).toBe(2);
	} finally {
		h.close();
	}
});

test("invalid descriptions are rejected without writing", async () => {
	const h = harness();
	try {
		const secret = (await h.describe("token: abcdef")) as { structuredContent: { ok: boolean } };
		expect(secret.structuredContent.ok).toBe(false);
		const long = (await h.describe("x".repeat(281))) as { structuredContent: { ok: boolean } };
		expect(long.structuredContent.ok).toBe(false);
		const topics = (await h.describe("ok", ["bad topic"])) as { structuredContent: { ok: boolean } };
		expect(topics.structuredContent.ok).toBe(false);
		expect(h.entries).toHaveLength(0);
	} finally {
		h.close();
	}
});

test("human descriptions win over the tool", async () => {
	const h = harness();
	try {
		await h.run("describe Ship the routing description");
		expect(h.current()).toMatchObject({ by: "human", description: "Ship the routing description" });
		const rejected = (await h.describe("Agent override")) as { structuredContent: { ok: boolean; error?: string } };
		expect(rejected.structuredContent).toMatchObject({ ok: false, error: "human-owned" });
		expect(h.current()?.description).toBe("Ship the routing description");
		// The human can clear it; afterwards the agent may write again.
		await h.run("describe --clear");
		expect(h.current()).toBeUndefined();
		const allowed = (await h.describe("Agent after clear")) as { structuredContent: { ok: boolean } };
		expect(allowed.structuredContent.ok).toBe(true);
	} finally {
		h.close();
	}
});

test("a fork re-appends the description with inheritedFrom", async () => {
	const h = harness();
	try {
		await h.describe("Inherited intent");
		const parent = h.current();
		h.setSessionId("s2");
		await h.handlers.get("session_start")?.({ reason: "fork" }, h.ctx);
		const inherited = h.current();
		expect(inherited).toMatchObject({
			description: "Inherited intent",
			inheritedFrom: "s1",
			revision: (parent?.revision ?? 0) + 1,
		});
		// A second fork of the fork chains the marker.
		h.setSessionId("s3");
		await h.handlers.get("session_start")?.({ reason: "fork" }, h.ctx);
		expect(h.current()?.inheritedFrom).toBe("s2");
	} finally {
		h.close();
	}
});

test("unrelated custom entries and cleared records never surface", () => {
	expect(readSessionDescription([{ type: "custom", customType: "other", data: {} }])).toBeUndefined();
	expect(
		readSessionDescription([
			{
				type: "custom",
				customType: DESCRIPTION_ENTRY_TYPE,
				data: { version: 1, description: "x", topics: [], by: "agent", revision: 1, updatedAt: "t", cleared: true },
			},
		])
	).toBeUndefined();
});
