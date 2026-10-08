import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import extension, { commandName } from "./index.js";
import { addItems, paths, readStore, saveCommand } from "./store.js";

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "stash-ui-"));
	await mkdir(join(root, "sessions"));
	const previousDir = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = join(root, "agent");
	const commands = new Map<string, (args: string, ctx: ExtensionContext) => Promise<void>>();
	const events = new Map<string, (event: unknown, ctx: ExtensionContext) => Promise<void> | void>();
	let shortcut: ((ctx: ExtensionContext) => Promise<void>) | undefined;
	let editor = "";
	const notes: string[] = [];
	const choices: (string | undefined)[] = [];
	const confirms: boolean[] = [];
	let customResult: unknown;
	let sessionFile = join(root, "sessions", "one.jsonl");
	const ctx = {
		cwd: root,
		mode: "tui",
		hasUI: true,
		sessionManager: {
			getSessionFile: () => sessionFile,
			getSessionId: () => "session-id",
			getSessionDir: () => join(root, "sessions"),
			getSessionName: () => "test",
			getEntries: () => [],
		},
		ui: {
			notify: (message: string) => notes.push(message),
			getEditorText: () => editor,
			setEditorText: (text: string) => {
				editor = text;
			},
			select: async () => choices.shift(),
			confirm: async () => confirms.shift() ?? false,
			input: async () => choices.shift(),
			editor: async (_title: string, text: string) => text,
			custom: async () => customResult,
		},
	} as unknown as ExtensionContext;
	const pi = {
		registerCommand: (name: string, options: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) =>
			commands.set(name, options.handler),
		registerShortcut: (_key: string, options: { handler: (ctx: ExtensionContext) => Promise<void> }) => {
			shortcut = options.handler;
		},
		on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void) => events.set(name, handler),
		getCommands: () => Array.from(commands.keys()).map((name) => ({ name })),
	} as unknown as ExtensionAPI;
	extension(pi);
	return {
		root,
		ctx,
		commands,
		events,
		choices,
		confirms,
		notes,
		setEditor: (s: string) => {
			editor = s;
		},
		getEditor: () => editor,
		shortcut: () => shortcut?.(ctx),
		setCustom: (r: unknown) => {
			customResult = r;
		},
		switchFile: (file: string) => {
			sessionFile = file;
		},
		cleanup: () => {
			if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previousDir;
			return rm(root, { recursive: true, force: true });
		},
	};
}
test("park via shortcut saves expanded text before clearing; pop restores without submitting", async () => {
	const f = await fixture();
	try {
		f.setEditor("my multiline\nprompt 🧺");
		f.choices.push("Park current draft", "session");
		await f.shortcut();
		expect(f.getEditor()).toBe("");
		const path = await paths({ scope: "session", sessionFile: f.ctx.sessionManager.getSessionFile() });
		expect((await readStore(path)).entries[0].text).toBe("my multiline\nprompt 🧺");
		await f.commands.get("pop")?.("session", f.ctx);
		expect(f.getEditor()).toBe("my multiline\nprompt 🧺");
		expect((await readStore(path)).entries.length).toBe(0);
	} finally {
		await f.cleanup();
	}
});
test("nonempty editor cannot be silently overwritten and cancelled pop retains stash", async () => {
	const f = await fixture();
	try {
		const path = await paths({ scope: "session", sessionFile: f.ctx.sessionManager.getSessionFile() });
		await addItems(path, [{ text: "saved" }]);
		f.setEditor("new draft");
		f.choices.push("Cancel");
		await f.commands.get("pop")?.("", f.ctx);
		expect(f.getEditor()).toBe("new draft");
		expect((await readStore(path)).entries.length).toBe(1);
		f.choices.push("Append");
		await f.commands.get("pop")?.("", f.ctx);
		expect(f.getEditor()).toBe("new draft\n\nsaved");
	} finally {
		await f.cleanup();
	}
});
test("saved commands fill editor only, obey session scope and refuse name collisions", async () => {
	const f = await fixture();
	try {
		const path = await paths({ scope: "session", sessionFile: f.ctx.sessionManager.getSessionFile() });
		await saveCommand(path, "p-laundry", "safe prompt");
		await f.events.get("session_start")?.({}, f.ctx);
		await f.commands.get("p-laundry")?.("", f.ctx);
		expect(f.getEditor()).toBe("safe prompt");
		f.setEditor("");
		f.switchFile(join(f.root, "sessions", "two.jsonl"));
		await f.events.get("session_start")?.({}, f.ctx);
		await f.commands.get("p-laundry")?.("", f.ctx);
		expect(f.getEditor()).toBe("");
		expect(f.notes.at(-1)).toContain("unavailable");
		expect(() => commandName("model")).toThrow();
		expect(() => commandName("p-../../oops")).toThrow();
		expect(commandName("/p-laundry")).toBe("p-laundry");
	} finally {
		await f.cleanup();
	}
});
test("history-style multiselection can stash and promote both; overwrite review is honored", async () => {
	const f = await fixture();
	try {
		const path = await paths({ scope: "session", sessionFile: f.ctx.sessionManager.getSessionFile() });
		const selected = await addItems(path, [{ text: "one" }, { text: "two" }]);
		f.setCustom(selected);
		f.choices.push("Stash & promote", "session", "session", "p-one", "p-two");
		await f.commands.get("stash")?.("list session", f.ctx);
		const doc = await readStore(path);
		expect(doc.entries.length).toBe(4);
		expect(doc.commands.map((c) => c.name)).toEqual(["p-one", "p-two"]);
		await f.commands.get("p-one")?.("", f.ctx);
		expect(f.getEditor()).toBe("one");
		f.setCustom([selected[0]]);
		f.ctx.ui.editor = async () => "must not overwrite";
		f.choices.push("Promote to commands", "session", "p-one");
		f.confirms.push(false);
		await f.commands.get("stash")?.("list session", f.ctx);
		expect((await readStore(path)).commands.find((c) => c.name === "p-one")?.text).toBe("one");
	} finally {
		await f.cleanup();
	}
});

test("failed sidecar write keeps draft; session generation invalidates pending dialog", async () => {
	const f = await fixture();
	try {
		f.switchFile("");
		f.setEditor("must survive");
		await f.commands.get("park")?.("session", f.ctx);
		expect(f.getEditor()).toBe("must survive");
		let resume: ((value: string) => void) | undefined;
		f.ctx.ui.select = () =>
			new Promise((resolve) => {
				resume = resolve;
			});
		const pending = f.shortcut();
		await f.events.get("session_shutdown")?.({}, f.ctx);
		resume?.("Park current draft");
		await pending;
		expect(f.getEditor()).toBe("must survive");
	} finally {
		await f.cleanup();
	}
});
