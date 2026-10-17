import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, AssistantMessage, Model } from "@earendil-works/pi-ai";
import { type ExtensionAPI, type ExtensionCommandContext, SessionManager } from "@earendil-works/pi-coding-agent";
import { editableMessages } from "./core.js";
import extension, { aiRewrite } from "./index.js";

function answer(text: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "openai-completions",
		provider: "synthetic",
		model: "fixture",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 0,
	};
}
function fixture(
	options: { decline?: boolean; cancel?: boolean; stale?: boolean; draft?: string; headless?: boolean; replace?: boolean } = {}
) {
	const root = mkdtempSync(join(tmpdir(), "pi-rewrite-ui-"));
	const manager = SessionManager.create("/synthetic", root);
	const user = manager.appendMessage({ role: "user", content: "original", timestamp: 0 });
	manager.appendMessage(answer("later answer"));
	let handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> = async () => {
		/* Registered below. */
	};
	const hooks = new Map<string, () => void>();
	extension({
		on: (name: string, fn: () => void) => hooks.set(name, fn),
		registerCommand: (_name: string, command: { handler: typeof handler }) => {
			handler = command.handler;
		},
	} as unknown as ExtensionAPI);
	let selections = 0;
	let edits = 0;
	let switched: string | undefined;
	const notes: string[] = [];
	const choices: string[] = [];
	const ctx = {
		cwd: root,
		hasUI: !options.headless,
		mode: "rpc",
		sessionManager: manager,
		waitForIdle: async () => undefined,
		ui: {
			getEditorText: () => options.draft ?? "",
			notify: (text: string) => notes.push(text),
			select: async (_title: string, rows: string[]) => {
				selections++;
				if (options.cancel && selections === 1) return undefined;
				const choice =
					selections === 1
						? rows.find((row) => row.includes(user))
						: rows.find((row) =>
								row.startsWith(
									selections === 2
										? "Continue"
										: selections === 3
											? "Edit manually"
											: selections === 4
												? "View diff"
												: selections === 5
													? "Accept replacement"
													: "Keep later"
								)
							);
				if (!choice) throw new Error(`Unexpected choices: ${rows.join("|")}`);
				choices.push(choice);
				return choice;
			},
			editor: async (_title: string, text: string) => {
				edits++;
				if (options.stale) manager.appendSessionInfo("Concurrent change");
				if (options.replace) hooks.get("session_start")?.();
				return edits === 1 ? "revised" : text;
			},
			confirm: async () => !options.decline,
		},
		switchSession: async (file: string, opts: { withSession: (fresh: ExtensionCommandContext) => Promise<void> }) => {
			switched = file;
			await opts.withSession(ctx as unknown as ExtensionCommandContext);
			return { cancelled: false };
		},
	} as unknown as ExtensionCommandContext;
	return {
		manager,
		root,
		notes,
		choices,
		hooks,
		run: () => handler("", ctx),
		get switched() {
			return switched;
		},
		close: () => rmSync(root, { recursive: true, force: true }),
	};
}

test("human command reviews before switching to independent edited fork, without changing original", async () => {
	const f = fixture();
	try {
		const file = f.manager.getSessionFile();
		if (!file) throw new Error("Fixture not saved");
		const before = readFileSync(file, "utf8");
		await f.run();
		expect(f.switched).toBeDefined();
		expect(f.choices.indexOf("View diff")).toBeLessThan(f.choices.indexOf("Accept replacement"));
		expect(readFileSync(file, "utf8")).toBe(before);
		expect(editableMessages(SessionManager.open(f.switched ?? "missing")).map((item) => item.text)).toEqual([
			"revised",
			"later answer",
		]);
	} finally {
		f.close();
	}
});

for (const options of [
	{ cancel: true },
	{ decline: true },
	{ stale: true },
	{ draft: "unsent draft" },
	{ headless: true },
	{ replace: true },
]) {
	test(`cancel/decline/stale/draft cannot create or switch a session: ${JSON.stringify(options)}`, async () => {
		const f = fixture(options);
		try {
			await f.run();
			expect(f.switched).toBeUndefined();
			expect(readdirSync(f.root).filter((name) => name.endsWith(".jsonl"))).toHaveLength(1);
		} finally {
			f.close();
		}
	});
}

test("AI receives only selected text/instruction, no tools or unrelated history", async () => {
	const f = fixture();
	try {
		let observed = "";
		const invoke: ExtensionCommandContext["modelRegistry"]["complete"] = async (_model, context) => {
			observed = JSON.stringify(context);
			return answer("proposed rewrite");
		};
		const ctx = { cwd: f.root, modelRegistry: {} } as unknown as ExtensionCommandContext;
		const text = await aiRewrite(
			{ ctx, signal: new AbortController().signal, check: () => undefined },
			{ id: "user", role: "user", text: "selected text" },
			{ id: "fixture", provider: "synthetic" } as Model<Api>,
			"shorten",
			invoke
		);
		expect(text).toBe("proposed rewrite");
		expect(observed).toContain("selected text");
		expect(observed).not.toContain("later answer");
		expect(JSON.parse(observed).tools).toBeUndefined();
	} finally {
		f.close();
	}
});

test("truncated AI response is not an applicable rewrite", async () => {
	const invoke: ExtensionCommandContext["modelRegistry"]["complete"] = async () => ({
		...answer("partial"),
		stopReason: "length",
	});
	const ctx = { cwd: "/synthetic", modelRegistry: {} } as unknown as ExtensionCommandContext;
	await expect(
		aiRewrite(
			{ ctx, signal: new AbortController().signal, check: () => undefined },
			{ id: "m", role: "user", text: "old" },
			{} as Model<Api>,
			"shorten",
			invoke
		)
	).rejects.toThrow("did not finish");
});
