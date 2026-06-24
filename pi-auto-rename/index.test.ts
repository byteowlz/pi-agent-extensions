import { describe, expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import autoRename from "./index";

function buildMockExtensionAPI(staleAfterSetCalls = Number.MAX_SAFE_INTEGER): {
	pi: ExtensionAPI;
	fireBeforeAgentStart: (event: { prompt?: string }, ctx: ExtensionContext) => Promise<void>;
	fireAgentEnd: (event: unknown, ctx: ExtensionContext) => Promise<void>;
	fireSessionStart: () => Promise<void>;
	getSessionName: () => string;
} {
	const handlers = {
		before_agent_start: [] as ((event: { prompt?: string }, ctx: ExtensionContext) => Promise<void>)[],
		agent_end: [] as ((event: unknown, ctx: ExtensionContext) => Promise<void>)[],
		session_start: [] as (() => Promise<void>)[],
		session_tree: [] as (() => Promise<void>)[],
	};

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
		on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void>) => {
			if (event === "before_agent_start") {
				handlers.before_agent_start.push(handler as (event: { prompt?: string }, ctx: ExtensionContext) => Promise<void>);
			} else if (event === "agent_end") {
				handlers.agent_end.push(handler as (event: unknown, ctx: ExtensionContext) => Promise<void>);
			} else if (event === "session_start") {
				handlers.session_start.push(handler as () => Promise<void>);
			} else if (event === "session_tree") {
				handlers.session_tree.push(handler as () => Promise<void>);
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
		fireSessionStart: async () => {
			for (const h of handlers.session_start) {
				await h();
			}
		},
		getSessionName: () => sessionName,
	};
}

function buildMockCtx(): ExtensionContext {
	return {
		hasUI: true,
		cwd: "/tmp",
		sessionManager: {
			getBranch: () => [
				{
					type: "message",
					message: { role: "user", content: "hello world" },
				},
			],
			getSessionId: () => "test-session-id",
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

describe("pi-auto-rename stale-context guard", () => {
	test("before_agent_start with prefixOnly does not crash when ctx goes stale", async () => {
		const { pi, fireBeforeAgentStart, fireSessionStart } = buildMockExtensionAPI(0);
		autoRename(pi);
		await fireSessionStart();

		const ctx = buildMockCtx();
		// With staleAfterSetCalls=0, the first setSessionName call throws a stale ctx error.
		// The extension must swallow this rather than letting it bubble up and crash.
		await expect(fireBeforeAgentStart({ prompt: "hello" }, ctx)).resolves.toBeUndefined();
	});

	test("agent_end with prefixOnly does not crash when ctx goes stale", async () => {
		const { pi, fireAgentEnd, fireSessionStart } = buildMockExtensionAPI(0);
		autoRename(pi);
		await fireSessionStart();

		const ctx = buildMockCtx();
		await expect(fireAgentEnd({}, ctx)).resolves.toBeUndefined();
	});

	test("rename still succeeds when context remains active", async () => {
		const { pi, fireBeforeAgentStart, fireSessionStart, getSessionName } = buildMockExtensionAPI(Number.MAX_SAFE_INTEGER);
		autoRename(pi);
		await fireSessionStart();

		const ctx = buildMockCtx();
		await fireBeforeAgentStart({ prompt: "hello" }, ctx);

		// Allow any queued micro-tasks to finish (prefixOnly path is sync inside the async fn)
		await new Promise((r) => setTimeout(r, 10));
		// With no models available, deterministic fallback kicks in using the query text.
		// The cwd is "/tmp" so prefixCommand "basename $(git rev-parse --show-toplevel 2>/dev/null || pwd)" produces "tmp".
		expect(getSessionName().startsWith("tmp: Hello ")).toBe(true);
	});
});
