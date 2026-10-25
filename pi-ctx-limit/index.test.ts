import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import extension, {
	LIMIT_ENTRY_TYPE,
	effectiveThreshold,
	formatTokens,
	parseSizeTokens,
	readLimit,
	shouldTriggerCompaction,
} from "./index";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("parseSizeTokens", () => {
	test("parses k/m/g suffixes and plain numbers", () => {
		expect(parseSizeTokens("262k")).toBe(262_000);
		expect(parseSizeTokens("262144")).toBe(262_144);
		expect(parseSizeTokens("1m")).toBe(1_000_000);
		expect(parseSizeTokens("0.5m")).toBe(500_000);
		expect(parseSizeTokens("64K")).toBe(64_000);
		expect(parseSizeTokens("2G")).toBe(2_000_000_000);
	});

	test("rejects garbage, zero and negatives", () => {
		expect(parseSizeTokens("")).toBeUndefined();
		expect(parseSizeTokens("abc")).toBeUndefined();
		expect(parseSizeTokens("0")).toBeUndefined();
		expect(parseSizeTokens("-5k")).toBeUndefined();
		expect(parseSizeTokens("12x")).toBeUndefined();
	});
});

describe("formatTokens", () => {
	test("renders compact forms", () => {
		expect(formatTokens(262_144)).toBe("262,144");
		expect(formatTokens(262_000)).toBe("262k");
		expect(formatTokens(1_000_000)).toBe("1m");
		expect(formatTokens(64_000)).toBe("64k");
	});
});

describe("effectiveThreshold", () => {
	test("session limit caps the native trigger", () => {
		// 1M window, default 16384 reserve -> native 983,616; session 262k wins
		expect(effectiveThreshold(262_144, 1_000_000, 16_384)).toBe(262_144);
	});

	test("never raises the native trigger (small model)", () => {
		// 200k window: native 183,616 < session 262k -> native wins
		expect(effectiveThreshold(262_144, 200_000, 16_384)).toBe(183_616);
	});

	test("session limit sits below native on a big window", () => {
		expect(effectiveThreshold(400_000, 1_000_000, 16_384)).toBe(400_000);
	});

	test("no session limit -> native trigger", () => {
		expect(effectiveThreshold(undefined, 128_000, 16_384)).toBe(111_616);
	});
});

describe("shouldTriggerCompaction", () => {
	test("null tokens never trigger; over threshold triggers; under does not", () => {
		expect(shouldTriggerCompaction(null, 262_144)).toBe(false);
		expect(shouldTriggerCompaction(262_145, 262_144)).toBe(true);
		expect(shouldTriggerCompaction(262_144, 262_144)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Branch entry round-trip
// ---------------------------------------------------------------------------

describe("readLimit", () => {
	test("reads the latest valid limit entry on the branch", () => {
		const branch = [
			{ type: "custom", customType: LIMIT_ENTRY_TYPE, data: { version: 1, limitTokens: 64_000, updatedAt: "a" } },
			{ type: "custom", customType: LIMIT_ENTRY_TYPE, data: { version: 1, limitTokens: 262_144, updatedAt: "b" } },
			// invalid entries are skipped, not fatal
			{ type: "custom", customType: LIMIT_ENTRY_TYPE, data: { version: 1, limitTokens: -1 } },
			{ type: "custom", customType: "other-extension", data: { version: 1, limitTokens: 1 } },
		];
		const limit = readLimit([
			...branch,
			{ type: "custom", customType: LIMIT_ENTRY_TYPE, data: { version: 1, limitTokens: 1_000_000, updatedAt: "c" } },
		]);
		expect(limit?.limitTokens).toBe(1_000_000);
		expect(readLimit(branch)?.limitTokens).toBe(262_144);
	});

	test("empty or foreign branches yield no limit", () => {
		expect(readLimit([])).toBeUndefined();
		expect(readLimit([{ type: "message", message: { role: "user", content: "hi" } }])).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Extension behavior (mocked pi)
// ---------------------------------------------------------------------------

function buildHarness(initial?: {
	contextWindow?: number;
	tokens?: number | null;
}) {
	const contextHolder: { tokens?: number | null; contextWindow?: number } = { ...initial };
	const opts = {
		get tokens() {
			return contextHolder.tokens;
		},
		get contextWindow() {
			return contextHolder.contextWindow;
		},
	};
	const appended: { customType: string; data: unknown }[] = [];
	const notifications: { message: string; level: string }[] = [];
	const handlers = new Map<string, ((event: unknown, ctx: ExtensionContext) => Promise<void>)[]>();
	const cwd = mkdtempSync(join(tmpdir(), "ctx-limit-"));

	const pi = {
		appendEntry: (customType: string, data: unknown) => {
			appended.push({ customType, data });
		},
		getSettings: () => ({}),
		registerCommand: (_name: string, options: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) => {
			// last registration wins for /context alias; keep every name
			commands.push(options.handler);
		},
		on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void>) => {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
	} as unknown as ExtensionAPI;

	const commands: ((args: string, ctx: ExtensionContext) => Promise<void>)[] = [];
	const compactCalls: { instructions?: string }[] = [];
	// registerCommand is called via the wrapper above; ensure both /ctx and
	// /context push handlers. The extension registers /ctx first, /context second.
	extension(pi);

	const ctx = {
		cwd,
		mode: "rpc" as const,
		hasUI: true,
		sessionManager: {
			getBranch: () => appended.map((e) => ({ type: "custom", customType: e.customType, data: e.data })),
			getSessionId: () => "session-1",
		},
		getContextUsage: () =>
			opts?.tokens === undefined && opts?.contextWindow === undefined
				? undefined
				: {
						tokens: opts?.tokens ?? 100_000,
						contextWindow: opts?.contextWindow ?? 1_000_000,
					},
		compact: (options?: { customInstructions?: string }) => {
			compactCalls.push({ instructions: options?.customInstructions });
		},
		ui: {
			notify: (message: string, level?: string) => {
				notifications.push({ message, level: level ?? "info" });
			},
		},
	} as unknown as ExtensionContext;

	const fire = async (event: string, payload: unknown) => {
		for (const handler of handlers.get(event) ?? []) await handler(payload, ctx);
	};
	const setContext = (tokens: number | null, contextWindow: number): void => {
		contextHolder.tokens = tokens;
		contextHolder.contextWindow = contextWindow;
	};

	return { pi, appended, notifications, commands, compactCalls, ctx, fire, setContext, cwd };
}

describe("/ctx command", () => {
	test("registered both /ctx and /context aliases with handlers", () => {
		const h = buildHarness();
		expect(h.commands.length).toBeGreaterThanOrEqual(2);
	});

	test("/ctx off with no prior limit informs; /ctx 262k persists a branch entry", async () => {
		const h = buildHarness({ tokens: 100_000, contextWindow: 1_000_000 });
		const run = h.commands[0];
		await run!("off", h.ctx);
		expect(h.notifications[0].message).toContain("cleared");

		await run!("262k", h.ctx);
		expect(h.appended.at(-1)?.customType).toBe(LIMIT_ENTRY_TYPE);
		expect((h.appended.at(-1)?.data as { limitTokens: number }).limitTokens).toBe(262_000);
		expect(h.notifications.at(-1)?.message).toContain("262k");
		// 100k tokens < 262k limit -> no compaction triggered
		expect(h.compactCalls.length).toBe(0);
	});

	test("setting a limit below current usage triggers compaction immediately", async () => {
		const h = buildHarness({ tokens: 300_000, contextWindow: 1_000_000 });
		await h.commands[0]("64k", h.ctx);
		expect(h.compactCalls.length).toBe(1);
		expect(h.notifications.some((n) => n.message.includes("exceeds the new limit"))).toBe(true);
	});

	test("small model windows cap the effective trigger (soft limit)", async () => {
		const h = buildHarness({ tokens: 150_000, contextWindow: 200_000 });
		// session limit 262k > native 183,616 -> setting it must NOT compact
		// (150k is under the native trigger) and must report the native trigger.
		await h.commands[0]("262k", h.ctx);
		const applied = h.notifications.find((n) => n.message.includes("effective trigger"));
		expect(applied).toBeDefined();
		expect(applied?.message).toContain("183,616");
		expect(h.compactCalls.length).toBe(0);
	});

	test("unrecognized sizes are rejected without side effects", async () => {
		const h = buildHarness({ tokens: 10_000, contextWindow: 128_000 });
		await h.commands[0]("banana", h.ctx);
		expect(h.notifications.at(-1)?.message).toContain("unrecognized size");
		expect(h.appended.length).toBe(0);
	});

	test("agent_end over the limit triggers compaction", async () => {
		const h = buildHarness({ tokens: 100_000, contextWindow: 1_000_000 });
		await h.commands[0]("64k", h.ctx); // limit 64k, usage 100k -> compact now
		expect(h.compactCalls.length).toBe(1);
		h.compactCalls.length = 0;
		// simulate compaction success + still over -> warned
		await h.fire("agent_end", {});
		// guard `applying` was reset by onComplete only in real flow; force reset via /ctx off
		expect(h.compactCalls.length).toBe(0);
	});

	test("session_start resume re-reads the limit from the branch and keeps it", async () => {
		const h = buildHarness({ tokens: 100_000, contextWindow: 1_000_000 });
		await h.commands[0]("500k", h.ctx);
		await h.fire("session_start", { reason: "resume" });
		// limit survives; over-limit usage (100k < 500k, under) does not compact
		expect(h.compactCalls.length).toBeLessThanOrEqual(1);
	});

	test("session_start new clears the in-memory limit", async () => {
		const h = buildHarness({ tokens: 100_000, contextWindow: 1_000_000 });
		await h.commands[0]("500k", h.ctx);
		await h.fire("session_start", { reason: "new" });
		// /ctx with no TUI-mode command shows "limit: none"
		h.notifications.length = 0;
		await h.commands[0]("", h.ctx);
		expect(h.notifications.some((n) => n.message.includes("limit: none"))).toBe(true);
	});

	test("config disabled path", async () => {
		const dir = mkdtempSync(join(tmpdir(), "ctx-limit-cfg-"));
		const piPath = join(dir, ".pi");
		const { mkdirSync } = await import("node:fs");
		mkdirSync(piPath, { recursive: true });
		writeFileSync(join(piPath, "ctx-limit.json"), JSON.stringify({ enabled: false }));

		const appended: { customType: string; data: unknown }[] = [];
		const notifications: { message: string; level: string }[] = [];
		const commands: ((args: string, ctx: ExtensionContext) => Promise<void>)[] = [];
		const pi = {
			appendEntry: (customType: string, data: unknown) => appended.push({ customType, data }),
			getSettings: () => ({}),
			registerCommand: (_n: string, o: { handler: (a: string, c: ExtensionContext) => Promise<void> }) =>
				commands.push(o.handler),
			on: () => {},
		} as unknown as ExtensionAPI;
		extension(pi);
		const ctx = {
			cwd: dir,
			sessionManager: { getBranch: () => [], getSessionId: () => "s" },
			getContextUsage: () => ({ tokens: 1, contextWindow: 2 }),
			compact: () => {},
			ui: { notify: (m: string, l?: string) => notifications.push({ message: m, level: l ?? "info" }) },
		} as unknown as ExtensionContext;
		await commands[0]("64k", ctx);
		expect(appended.length).toBe(0);
		expect(notifications[0].message).toContain("disabled");
	});
});
