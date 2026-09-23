import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import autoRename from "./index";

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
} {
	const handlers = {
		before_agent_start: [] as ((event: { prompt?: string }, ctx: ExtensionContext) => Promise<void>)[],
		agent_end: [] as ((event: unknown, ctx: ExtensionContext) => Promise<void>)[],
		session_start: [] as ((event: { reason?: string }, ctx: ExtensionContext) => Promise<void>)[],
		session_tree: [] as ((ctx: ExtensionContext) => Promise<void>)[],
	};

	const tools: Record<string, ToolDefinition> = {};
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
		registerCommand: () => {
			// no-op for test
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
