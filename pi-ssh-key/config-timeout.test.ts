import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import extension from "./index.js";

interface Harness {
	notices: string[];
	run(command: string, args: string): Promise<void>;
}

function harness(): Harness {
	const handlers = new Map<string, (args: string, ctx: ExtensionCommandContext) => Promise<void>>();
	extension({
		registerTool: () => {},
		registerCommand: (name: string, options: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }) => {
			handlers.set(name, options.handler);
		},
		on: () => undefined,
	} as unknown as ExtensionAPI);
	const notices: string[] = [];
	const ctx = {
		mode: "tui",
		hasUI: true,
		ui: { notify: (text: string) => notices.push(text) },
	} as unknown as ExtensionCommandContext;
	return {
		notices,
		run: async (command, args) => {
			const handler = handlers.get(command);
			if (!handler) throw new Error(`missing command ${command}`);
			await handler(args, ctx);
		},
	};
}

test("no config and no override means no expiry", async () => {
	const root = mkdtempSync(join(tmpdir(), "ssh-timeout-empty-"));
	const previous = process.cwd();
	try {
		process.chdir(root);
		const h = harness();
		await h.run("ssh-key-timeout", "");
		expect(h.notices.at(-1)).toContain("no expiry");
	} finally {
		process.chdir(previous);
		rmSync(root, { recursive: true, force: true });
	}
});

test("configured defaultTimeout is applied when no timeout is given", async () => {
	const root = mkdtempSync(join(tmpdir(), "ssh-timeout-"));
	const previous = process.cwd();
	try {
		mkdirSync(join(root, ".pi"), { recursive: true });
		writeFileSync(join(root, ".pi", "ssh-key.json"), JSON.stringify({ defaultTimeout: 900 }));
		process.chdir(root);
		const h = harness();
		await h.run("ssh-key-timeout", "");
		expect(h.notices.at(-1)).toContain("900s (config)");
		// An explicit session value takes precedence over the config file.
		await h.run("ssh-key-timeout", "60");
		await h.run("ssh-key-timeout", "");
		expect(h.notices.at(-1)).toContain("60s (session)");
	} finally {
		process.chdir(previous);
		rmSync(root, { recursive: true, force: true });
	}
});

test("rejects a negative timeout", async () => {
	const h = harness();
	await h.run("ssh-key-timeout", "-5");
	expect(h.notices.at(-1)).toContain("non-negative");
});
