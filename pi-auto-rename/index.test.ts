import { describe, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import autoRename, { formatContextWindow } from "./index";

const CONFIG_FILENAME = "auto-rename.json";
const createdDirs: string[] = [];

function buildMockExtensionAPI(staleAfterSetCalls = Number.MAX_SAFE_INTEGER): {
	pi: ExtensionAPI;
	fireBeforeAgentStart: (event: { prompt?: string }, ctx: ExtensionContext) => Promise<void>;
	fireAgentEnd: (event: unknown, ctx: ExtensionContext) => Promise<void>;
	fireSessionStart: (event?: { reason?: string }, ctx?: ExtensionContext) => Promise<void>;
	fireSessionTree: (ctx?: ExtensionContext) => Promise<void>;
	getSessionName: () => string;
	getTool: (name: string) => ToolDefinition | undefined;
	runCommand: (args: string, ctx: ExtensionContext) => Promise<void>;
} {
	const handlers = {
		before_agent_start: [] as ((event: { prompt?: string }, ctx: ExtensionContext) => Promise<void>)[],
		agent_end: [] as ((event: unknown, ctx: ExtensionContext) => Promise<void>)[],
		session_start: [] as ((event: { reason?: string }, ctx: ExtensionContext) => Promise<void>)[],
		session_tree: [] as ((ctx: ExtensionContext) => Promise<void>)[],
	};

	const tools: Record<string, ToolDefinition> = {};
	let commandHandler: ((args: string, ctx: ExtensionContext) => Promise<void>) | undefined;
	let sessionName = "";
	let setCallCount = 0;

	const pi: ExtensionAPI = {
		getSessionName: () => sessionName,
		setSessionName: (name: string) => {
			setCallCount++;
			if (setCallCount > staleAfterSetCalls) {
				throw new Error(
					"This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload()."
				);
			}
			sessionName = name;
		},
		registerTool: (tool: ToolDefinition) => {
			tools[tool.name] = tool;
		},
		on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void>) => {
			if (event === "before_agent_start") {
				handlers.before_agent_start.push(handler as (event: { prompt?: string }, ctx: ExtensionContext) => Promise<void>);
			} else if (event === "agent_end") {
				handlers.agent_end.push(handler as (event: unknown, ctx: ExtensionContext) => Promise<void>);
			} else if (event === "session_start") {
				handlers.session_start.push(handler as (event: { reason?: string }, ctx: ExtensionContext) => Promise<void>);
			} else if (event === "session_tree") {
				handlers.session_tree.push(handler as (ctx: ExtensionContext) => Promise<void>);
			}
		},
		registerCommand: (_name: string, options: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) => {
			commandHandler = options.handler;
		},
	} as unknown as ExtensionAPI;

	return {
		pi,
		fireBeforeAgentStart: async (event, ctx) => {
			for (const h of handlers.before_agent_start) {
				await h(event, ctx);
			}
		},
		fireAgentEnd: async (event, ctx) => {
			for (const h of handlers.agent_end) {
				await h(event, ctx);
			}
		},
		fireSessionStart: async (event = {}, ctx = buildMockCtx("/tmp", "test-session-id")) => {
			for (const h of handlers.session_start) {
				await h(event, ctx);
			}
		},
		fireSessionTree: async (ctx = buildMockCtx("/tmp", "test-session-id")) => {
			for (const h of handlers.session_tree) {
				await h(ctx);
			}
		},
		getSessionName: () => sessionName,
		getTool: (name) => tools[name],
		runCommand: async (args, ctx) => {
			if (!commandHandler) throw new Error("No command registered");
			await commandHandler(args, ctx);
		},
	};
}

function buildMockCtx(cwd: string, sessionId: string, config?: Record<string, unknown>): ExtensionContext {
	if (config) {
		writeConfig(cwd, config);
	}
	return {
		hasUI: true,
		cwd,
		sessionManager: {
			getBranch: () => [
				{
					type: "message",
					message: { role: "user", content: "hello world" },
				},
			],
			getSessionId: () => sessionId,
			getSessionName: () => "",
			getSessionFile: () => `/synthetic/${sessionId}.jsonl`,
		},
		modelRegistry: {
			getAll: () => [],
			find: () => undefined,
			getApiKeyAndHeaders: async () => ({ ok: false, error: "no key" }),
		},
		model: undefined,
		ui: {
			notify: () => {
				// no-op for test
			},
			setStatus: () => {
				// no-op for test
			},
		},
	} as unknown as ExtensionContext;
}

function writeConfig(cwd: string, config: Record<string, unknown>): void {
	writeFileSync(join(cwd, CONFIG_FILENAME), JSON.stringify(config));
}

function tmpCwd(): string {
	const dir = mkdtempSync(join(tmpdir(), "auto-rename-test-"));
	createdDirs.push(dir);
	return dir;
}

const READABLE_ID_RE = /\s\[[a-z][a-z0-9-]*-[a-z][a-z0-9-]*-[a-z][a-z0-9-]*\]$/i;

describe("pi-auto-rename TUI sync toggles", () => {
	test("generated defaults disable both directions of tab-title sync", async () => {
		const { pi, runCommand } = buildMockExtensionAPI();
		autoRename(pi);
		const cwd = tmpCwd();
		await runCommand("init", buildMockCtx(cwd, "test-session-id"));
		const saved = JSON.parse(readFileSync(join(cwd, CONFIG_FILENAME), "utf-8"));
		expect(saved.syncTabTitle).toBe(false);
		expect(saved.syncTabTitleInbound).toBe(false);
	});

	test("sync toggles inbound config and preserves unrelated keys", async () => {
		const { pi, fireSessionStart, runCommand } = buildMockExtensionAPI();
		autoRename(pi);
		const cwd = tmpCwd();
		writeConfig(cwd, { enabled: true, readableIdSuffix: true, prompt: "keep me" });
		const ctx = buildMockCtx(cwd, "test-session-id");
		await fireSessionStart({}, ctx);

		await runCommand("sync", ctx);
		let saved = JSON.parse(readFileSync(join(cwd, CONFIG_FILENAME), "utf-8"));
		expect(saved.syncTabTitleInbound).toBe(true);
		expect(saved.prompt).toBe("keep me");
		expect(saved.readableIdSuffix).toBe(true);

		await runCommand("sync", ctx);
		saved = JSON.parse(readFileSync(join(cwd, CONFIG_FILENAME), "utf-8"));
		expect(saved.syncTabTitleInbound).toBe(false);
	});

	test("outbound toggle opts in and writes syncTabTitle only", async () => {
		const { pi, fireSessionStart, runCommand } = buildMockExtensionAPI();
		autoRename(pi);
		const cwd = tmpCwd();
		writeConfig(cwd, { syncTabTitleInbound: true });
		const ctx = buildMockCtx(cwd, "test-session-id");
		await fireSessionStart({}, ctx);
		await runCommand("outbound", ctx);
		const saved = JSON.parse(readFileSync(join(cwd, CONFIG_FILENAME), "utf-8"));
		expect(saved.syncTabTitle).toBe(true);
		expect(saved.syncTabTitleInbound).toBe(true);
	});

	test("invalid config JSON is not clobbered by a toggle", async () => {
		const { pi, fireSessionStart, runCommand } = buildMockExtensionAPI();
		autoRename(pi);
		const cwd = tmpCwd();
		const original = "{ this is not json";
		writeFileSync(join(cwd, CONFIG_FILENAME), original);
		const ctx = buildMockCtx(cwd, "test-session-id");
		await fireSessionStart({}, ctx);
		await runCommand("sync", ctx);
		expect(readFileSync(join(cwd, CONFIG_FILENAME), "utf-8")).toBe(original);
	});
});

describe("pi-auto-rename stale-context guard", () => {
	test("before_agent_start with prefixOnly does not crash when ctx goes stale", async () => {
		const { pi, fireBeforeAgentStart, fireSessionStart } = buildMockExtensionAPI(0);
		autoRename(pi);
		await fireSessionStart();

		const ctx = buildMockCtx("/tmp", "test-session-id");
		// With staleAfterSetCalls=0, the first setSessionName call throws a stale ctx error.
		// The extension must swallow this rather than letting it bubble up and crash.
		await expect(fireBeforeAgentStart({ prompt: "hello" }, ctx)).resolves.toBeUndefined();
	});

	test("agent_end with prefixOnly does not crash when ctx goes stale", async () => {
		const { pi, fireAgentEnd, fireSessionStart } = buildMockExtensionAPI(0);
		autoRename(pi);
		await fireSessionStart();

		const ctx = buildMockCtx("/tmp", "test-session-id");
		await expect(fireAgentEnd({}, ctx)).resolves.toBeUndefined();
	});

	test("rename still succeeds when context remains active", async () => {
		const { pi, fireBeforeAgentStart, fireSessionStart, getSessionName } = buildMockExtensionAPI(Number.MAX_SAFE_INTEGER);
		autoRename(pi);
		await fireSessionStart();

		// Deterministic config: static prefix + deterministic "words" fallback so the
		// result is independent of any ambient/git config or host cwd.
		const cwd = tmpCwd();
		const ctx = buildMockCtx(cwd, "test-session-id", {
			enabled: true,
			prefix: "ws",
			prefixOnly: false,
			readableIdSuffix: false,
			fallbackDeterministic: "words",
		});
		await fireBeforeAgentStart({ prompt: "hello world" }, ctx);

		// Allow any queued micro-tasks to finish (prefixOnly path is sync inside the async fn)
		await new Promise((r) => setTimeout(r, 10));
		expect(getSessionName().startsWith("ws: Hello ")).toBe(true);
	});
});

describe("pi-auto-rename rename_session tool", () => {
	test("registers a rename_session tool", async () => {
		const { pi, fireSessionStart, getTool } = buildMockExtensionAPI();
		autoRename(pi);
		await fireSessionStart();
		expect(getTool("rename_session")).toBeDefined();
	});

	test("sets session name from agent title without a readable id when readableIdSuffix is off", async () => {
		const { pi, fireSessionStart, getTool, getSessionName } = buildMockExtensionAPI();
		autoRename(pi);
		await fireSessionStart();

		const tool = getTool("rename_session");
		expect(tool).toBeDefined();

		const cwd = tmpCwd();
		// Explicitly disable readableIdSuffix so the result is independent of any global config.
		const ctx = buildMockCtx(cwd, "test-session-id", { enabled: true, readableIdSuffix: false });
		await tool!.execute("tc1", { name: "Fix Auth Bug" }, undefined, undefined, ctx);

		expect(getSessionName()).toBe("Fix Auth Bug");
	});

	test("appends the readable id when readableIdSuffix is enabled", async () => {
		const { pi, fireSessionStart, getTool, getSessionName } = buildMockExtensionAPI();
		autoRename(pi);
		await fireSessionStart();

		const tool = getTool("rename_session");
		expect(tool).toBeDefined();

		const cwd = tmpCwd();
		const ctx = buildMockCtx(cwd, "test-session-id", { enabled: true, readableIdSuffix: true });
		await tool!.execute("tc2", { name: "Fix Auth Bug" }, undefined, undefined, ctx);

		const name = getSessionName();
		expect(name.startsWith("Fix Auth Bug [")).toBe(true);
		expect(READABLE_ID_RE.test(name)).toBe(true);
	});

	test("does not duplicate a readable id the agent included", async () => {
		const { pi, fireSessionStart, getTool, getSessionName } = buildMockExtensionAPI();
		autoRename(pi);
		await fireSessionStart();

		const tool = getTool("rename_session");
		expect(tool).toBeDefined();

		const cwd = tmpCwd();
		const ctx = buildMockCtx(cwd, "test-session-id", { enabled: true, readableIdSuffix: true });
		await tool!.execute("tc3", { name: "Fix Auth Bug [brisk-sunflower-river]" }, undefined, undefined, ctx);

		const name = getSessionName();
		const suffixCount = (name.match(/\[[a-z][a-z0-9-]*-[a-z][a-z0-9-]*-[a-z][a-z0-9-]*\]/gi) || []).length;
		// The agent-supplied suffix is stripped/regenerated, never duplicated.
		expect(suffixCount).toBe(1);
		expect(name.startsWith("Fix Auth Bug")).toBe(true);
	});
});

describe("Pi 1.0 auto-rename registry authentication", () => {
	for (const modelSelection of ["current", "cheapest"]) {
		test(`${modelSelection} selection accepts header-only auth and delegates completion to the registry`, async () => {
			const { pi, runCommand, getSessionName } = buildMockExtensionAPI();
			autoRename(pi);
			const base = buildMockCtx(tmpCwd(), "synthetic-session", { enabled: true, modelSelection });
			const model = { provider: "fixture", id: "fixture", api: "openai-completions" };
			const complete = mock(async (_model: unknown, _context: unknown, _options?: unknown) => ({
				stopReason: "stop",
				content: [{ type: "text", text: "Registry Title" }],
			}));
			const ctx = {
				...base,
				model,
				modelRegistry: {
					...base.modelRegistry,
					getAll: () => [model],
					getApiKeyAndHeaders: async () => ({ ok: true, headers: { Authorization: "synthetic" } }),
					complete,
				},
			} as unknown as ExtensionContext;
			await runCommand("regen", ctx);
			expect(complete).toHaveBeenCalledTimes(1);
			expect(complete.mock.calls[0][2]).not.toHaveProperty("apiKey");
			expect(getSessionName()).toContain("Registry Title");
		});
	}
});

describe("pi-auto-rename fork readable-id regeneration", () => {
	test("regenerates the readable id from the new session id on fork", async () => {
		const { pi, fireSessionStart, getSessionName } = buildMockExtensionAPI();
		autoRename(pi);

		const cwd = tmpCwd();
		// Enable readableIdSuffix so the fork path runs.
		buildMockCtx(cwd, "old-session-id", { enabled: true, readableIdSuffix: true });
		pi.setSessionName("Fix Auth Bug [brisk-sunflower-river]");

		// Fork into a new session id.
		const newCtx = buildMockCtx(cwd, "new-session-id");
		await fireSessionStart({ reason: "fork" }, newCtx);

		const name = getSessionName();
		expect(name.startsWith("Fix Auth Bug [")).toBe(true);
		expect(READABLE_ID_RE.test(name)).toBe(true);
		// The readable id must differ from the inherited (parent) suffix.
		expect(name).not.toContain("[brisk-sunflower-river]");
	});

	test("does nothing on fork when readableIdSuffix is disabled", async () => {
		const { pi, fireSessionStart, getSessionName } = buildMockExtensionAPI();
		autoRename(pi);

		const cwd = tmpCwd();
		buildMockCtx(cwd, "old-session-id"); // no config => readableIdSuffix off
		pi.setSessionName("Fix Auth Bug");

		const newCtx = buildMockCtx(cwd, "new-session-id");
		await fireSessionStart({ reason: "fork" }, newCtx);

		expect(getSessionName()).toBe("Fix Auth Bug");
	});
});

describe("pi-auto-rename /auto-rename readable id", () => {
	test("keeps a readable id when renaming a session that already has one", async () => {
		const { pi, fireSessionStart, getSessionName, runCommand } = buildMockExtensionAPI();
		autoRename(pi);
		await fireSessionStart();

		const cwd = tmpCwd();
		const ctx = buildMockCtx(cwd, "session-abc", { enabled: true, readableIdSuffix: true });
		pi.setSessionName("Fix Auth Bug [brisk-sunflower-river]");

		await runCommand("new title", ctx);

		const name = getSessionName();
		expect(name.startsWith("new title [")).toBe(true);
		expect(READABLE_ID_RE.test(name)).toBe(true);
		expect(name).not.toBe("new title");
	});
});

describe("pi-auto-rename inbound tab-title sync", () => {
	test("is inert unless explicitly enabled", async () => {
		const { pi, fireSessionStart } = buildMockExtensionAPI();
		autoRename(pi);
		const cwd = tmpCwd();
		const previous = { ...process.env };
		process.env.HERDR_ENV = "1";
		process.env.HERDR_SOCKET_PATH = join(cwd, "does-not-exist.sock");
		process.env.HERDR_PANE_ID = "w1:p1";
		try {
			// syncTabTitleInbound defaults to false: no socket is opened, no crash.
			await fireSessionStart({}, buildMockCtx(cwd, "test-session-id"));
			expect(process.env.HERDR_ENV).toBe("1");
		} finally {
			process.env.HERDR_ENV = previous.HERDR_ENV;
			process.env.HERDR_SOCKET_PATH = previous.HERDR_SOCKET_PATH;
			process.env.HERDR_PANE_ID = previous.HERDR_PANE_ID;
		}
	});
});

// Sweep up temp dirs created during tests.
process.on("exit", () => {
	for (const dir of createdDirs) {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	}
});

// ============================================================================
// rename_session: configurable maxNameLength advertised and enforced
// ============================================================================

describe("rename_session tool limit", () => {
	test("tool description shows the config-file maxNameLength", async () => {
		// Registration-time limit follows the real config precedence around
		// process.cwd(), so derive the expected value the same way.
		const candidates = [
			join(process.cwd(), CONFIG_FILENAME),
			join(process.cwd(), ".pi", CONFIG_FILENAME),
			join(homedir(), ".pi", "agent", CONFIG_FILENAME),
		];
		let expected = 80;
		for (const path of candidates) {
			try {
				const parsed = JSON.parse(readFileSync(path, "utf-8")) as { maxNameLength?: number };
				if (Number.isFinite(parsed.maxNameLength)) {
					expected = parsed.maxNameLength as number;
					break;
				}
			} catch {
				// absent/invalid: try next candidate
			}
		}
		const { pi, fireSessionStart, getTool } = buildMockExtensionAPI();
		autoRename(pi);
		await fireSessionStart();
		const tool = getTool("rename_session");
		expect(tool).toBeDefined();
		// Registered descriptions embed the limit loaded from config at
		// registration time.
		const description = String(tool!.description ?? "");
		expect(description.includes(`within ${expected} characters`)).toBe(true);
		const paramDescription = String(
			(tool!.parameters as { properties?: { name?: { description?: string } } })?.properties?.name?.description ?? ""
		);
		expect(paramDescription.includes(`within ${expected} characters`)).toBe(true);
	});

	test("execute enforces maxNameLength from the session cwd config", async () => {
		const { pi, fireSessionStart, getTool, getSessionName } = buildMockExtensionAPI();
		autoRename(pi);
		await fireSessionStart();
		const tool = getTool("rename_session");
		expect(tool).toBeDefined();

		const cwd = tmpCwd();
		const ctx = buildMockCtx(cwd, "test-session-id", { enabled: true, readableIdSuffix: false, maxNameLength: 20 });
		await tool!.execute(
			"tc4",
			{ name: "A Very Long Session Title That Exceeds The Configured Limit" },
			undefined,
			undefined,
			ctx
		);

		const name = getSessionName();
		// capped at 20 chars (word-boundary ellipsis allowed)
		expect(name.length).toBeLessThanOrEqual(20);
	});

	test("execute allows names within maxNameLength", async () => {
		const { pi, fireSessionStart, getTool, getSessionName } = buildMockExtensionAPI();
		autoRename(pi);
		await fireSessionStart();
		const tool = getTool("rename_session");
		expect(tool).toBeDefined();

		const cwd = tmpCwd();
		const ctx = buildMockCtx(cwd, "test-session-id", { enabled: true, readableIdSuffix: false, maxNameLength: 80 });
		await tool!.execute("tc5", { name: "Short Title" }, undefined, undefined, ctx);
		expect(getSessionName()).toBe("Short Title");
	});
});

// ============================================================================
// /auto-rename model command
// ============================================================================

describe("/auto-rename model", () => {
	test("model off clears the model override in the config file", async () => {
		const { pi, fireSessionStart, runCommand } = buildMockExtensionAPI();
		autoRename(pi);
		await fireSessionStart();

		const cwd = tmpCwd();
		const ctx = buildMockCtx(cwd, "test-session-id", { enabled: true, model: { provider: "anthropic", id: "claude-x" } });
		await runCommand("model off", ctx);

		const saved = JSON.parse(readFileSync(join(cwd, CONFIG_FILENAME), "utf-8"));
		expect(saved.model).toBeNull();
	});

	test("model list lists registry models and marks the current one", async () => {
		const { pi, fireSessionStart, runCommand } = buildMockExtensionAPI();
		autoRename(pi);
		await fireSessionStart();

		const cwd = tmpCwd();
		const notifications: string[] = [];
		const ctx = {
			...buildMockCtx(cwd, "test-session-id", { enabled: true, model: { provider: "anthropic", id: "claude-x" } }),
			ui: { notify: (msg: string) => notifications.push(msg), setStatus: () => {} },
		} as unknown as ExtensionContext;
		// modelRegistry.getAvailable drives the list
		(ctx as { modelRegistry?: unknown }).modelRegistry = {
			getAll: () => [],
			find: () => undefined,
			getApiKeyAndHeaders: async () => ({ ok: false, error: "no key" }),
			getAvailable: () => [
				{ provider: "anthropic", id: "claude-x", name: "Claude X" },
				{ provider: "openai", id: "gpt-y", name: "GPT Y" },
			],
		};
		await runCommand("model list", ctx);
		expect(notifications.some((n) => n.includes("openai/gpt-y"))).toBe(true);
	});

	test("model picker requires TUI mode", async () => {
		const { pi, fireSessionStart, runCommand } = buildMockExtensionAPI();
		autoRename(pi);
		await fireSessionStart();

		const notifications: string[] = [];
		const ctx = {
			...buildMockCtx(tmpCwd(), "test-session-id", { enabled: true }),
			mode: "rpc",
			ui: { notify: (msg: string) => notifications.push(msg), setStatus: () => {} },
		} as unknown as ExtensionContext;
		await runCommand("model", ctx);
		expect(notifications.some((n) => n.includes("requires Pi TUI"))).toBe(true);
	});
});

// ============================================================================
// Context-window indicator in the model picker/list
// ============================================================================

describe("context window indicator", () => {
	test("formatContextWindow renders compact badges", () => {
		expect(formatContextWindow(128_000)).toBe("ctx 128k");
		expect(formatContextWindow(8192)).toBe("ctx 8.2k");
		expect(formatContextWindow(1_000_000)).toBe("ctx 1M");
		expect(formatContextWindow(2_500_000)).toBe("ctx 2.5M");
		expect(formatContextWindow(undefined)).toBe("ctx —");
		expect(formatContextWindow(0)).toBe("ctx —");
		expect(formatContextWindow(Number.NaN)).toBe("ctx —");
	});

	test("model list shows the context window per model", async () => {
		const { pi, fireSessionStart, runCommand } = buildMockExtensionAPI();
		autoRename(pi);
		await fireSessionStart();

		const cwd = tmpCwd();
		const notifications: string[] = [];
		const ctx = {
			...buildMockCtx(cwd, "test-session-id", { enabled: true }),
			ui: { notify: (msg: string) => notifications.push(msg), setStatus: () => {} },
		} as unknown as ExtensionContext;
		(ctx as { modelRegistry?: unknown }).modelRegistry = {
			getAll: () => [],
			find: () => undefined,
			getApiKeyAndHeaders: async () => ({ ok: false, error: "no key" }),
			getAvailable: () => [
				{ provider: "anthropic", id: "claude-x", name: "Claude X", contextWindow: 200_000 },
				{ provider: "openai", id: "gpt-y", name: "GPT Y", contextWindow: 128_000 },
				{ provider: "local", id: "tiny", name: "Tiny" }, // legacy entry without contextWindow
			],
		};
		await runCommand("model list", ctx);
		const listing = notifications.find((n) => n.includes("anthropic/claude-x")) ?? "";
		expect(listing.includes("ctx 200k")).toBe(true);
		expect(listing.includes("ctx 128k")).toBe(true);
		expect(listing.includes("ctx —")).toBe(true);
	});
});

// ============================================================================
// Name history: provenance sidecar + /auto-rename history + sync on/off
// ============================================================================

import { formatNameHistoryRow, mergeNameHistory, normalizeNameRecord, readNameHistory } from "./name-history";

describe("name history provenance", () => {
	test("records store who/via/model and round-trip through the entry log", () => {
		expect(normalizeNameRecord({ version: 1, name: "N", by: "agent", via: "agent-tool", model: "a/b", timestamp: "t" }).ok).toBe(
			true
		);
		expect(normalizeNameRecord({ version: 1, name: "N", by: "nobody" }).ok).toBe(false);
		expect(normalizeNameRecord("nope").ok).toBe(false);

		const branch = [
			{
				type: "custom",
				customType: "pi-auto-rename:name-history/v1",
				data: { version: 1, name: "Old Name", by: "user", via: "manual", timestamp: "2026-10-22T08:00:00Z" },
			},
			{
				type: "custom",
				customType: "pi-auto-rename:name-history/v1",
				data: {
					version: 1,
					name: "New Name",
					by: "agent",
					via: "agent-tool",
					model: "anthropic/claude-x",
					timestamp: "2026-10-22T09:00:00Z",
				},
			},
			{
				type: "custom",
				customType: "other-extension",
				data: { version: 1, name: "ignored", by: "user", timestamp: "2026-10-22T07:00:00Z" },
			},
		];
		const records = readNameHistory(branch);
		expect(records.length).toBe(2);
		expect(records[0].name).toBe("Old Name");
		expect(records[1].model).toBe("anthropic/claude-x");
	});

	test("raw session_info entries without sidecar records show as unknown user renames", () => {
		const merged = mergeNameHistory(
			[
				{
					version: 1,
					name: "Annotated",
					by: "extension",
					via: "auto-llm",
					model: "endpoint/gemma",
					timestamp: "2026-10-22T10:00:00.000Z",
				},
			],
			[
				{ timestamp: "2026-10-22T09:30:00.000Z", name: "Legacy Name" },
				{ timestamp: "2026-10-22T10:00:00.050Z", name: "Annotated" },
			]
		);
		expect(merged.length).toBe(2);
		expect(merged[0].name).toBe("Legacy Name");
		expect((merged[0] as { raw: boolean }).raw).toBe(true);
		expect(merged[1].name).toBe("Annotated");
		expect((merged[1] as { raw: boolean }).raw).toBe(false);
	});

	test("formatNameHistoryRow lines up columns", () => {
		const line = formatNameHistoryRow({
			timestamp: "2026-10-22T09:00:00Z",
			by: "agent",
			via: "agent-tool",
			model: "a/b",
			name: "X",
		});
		expect(line.includes("agent/agent-tool (a/b)")).toBe(true);
	});
});

describe("/auto-rename sync on|off", () => {
	async function runSyncCommand(args: string) {
		const { pi, fireSessionStart, runCommand } = buildMockExtensionAPI();
		autoRename(pi);
		await fireSessionStart();
		const cwd = tmpCwd();
		const config = { enabled: true, syncTabTitle: false, syncTabTitleInbound: false };
		await runCommand(args, buildMockCtx(cwd, "test-session-id", config));
		return JSON.parse(readFileSync(join(cwd, CONFIG_FILENAME), "utf-8")) as Record<string, unknown>;
	}

	test("sync on turns inbound sync on and persists", async () => {
		const saved = await runSyncCommand("sync on");
		expect(saved.syncTabTitleInbound).toBe(true);
	});

	test("sync off keeps it off and persists", async () => {
		const saved = await runSyncCommand("sync off");
		expect(saved.syncTabTitleInbound).toBe(false);
	});

	test("outbound on/off toggles syncTabTitle", async () => {
		expect((await runSyncCommand("outbound on")).syncTabTitle).toBe(true);
		expect((await runSyncCommand("outbound off")).syncTabTitle).toBe(false);
	});
});

describe("/auto-rename history", () => {
	test("renders annotated + raw renames with provenance", async () => {
		const { pi, fireSessionStart, runCommand } = buildMockExtensionAPI();
		autoRename(pi);
		await fireSessionStart();
		const cwd = tmpCwd();
		const notifications: string[] = [];
		const branch = [
			{
				type: "custom",
				customType: "pi-auto-rename:name-history/v1",
				data: {
					version: 1,
					name: "First Title [a-b-c]",
					by: "extension",
					via: "auto-llm",
					model: "endpoint/gemma",
					timestamp: "2026-10-22T09:00:00.000Z",
				},
			},
			{ type: "session_info", name: "First Title [a-b-c]", timestamp: "2026-10-22T09:00:00.010Z" },
			{ type: "session_info", name: "User Rename", timestamp: "2026-10-22T09:10:00.000Z" },
		];
		const ctx = {
			...buildMockCtx(cwd, "test-session-id", { enabled: true }),
			sessionManager: {
				...buildMockCtx(cwd, "test-session-id").sessionManager,
				getBranch: () => branch,
				getSessionName: () => "User Rename",
			},
			ui: { notify: (msg: string) => notifications.push(msg), setStatus: () => {} },
		} as unknown as ExtensionContext;
		await runCommand("history", ctx);
		const out = notifications.join("\n");
		expect(out.includes("extension/auto-llm (endpoint/gemma)")).toBe(true);
		expect(out.includes("First Title [a-b-c]")).toBe(true);
		expect(out.includes("User Rename")).toBe(true);
		expect(out.includes("current:")).toBe(true);
	});
});
