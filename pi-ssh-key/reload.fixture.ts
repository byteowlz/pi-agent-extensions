import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import extension from "./index.js";

const commands = new Map<string, (args: string, ctx: ExtensionContext) => Promise<void>>();
let shutdown: (() => Promise<void>) | undefined;
const notes: { text: string; kind?: string }[] = [];
extension({
	registerTool() {},
	registerCommand(name, command) {
		commands.set(name, command.handler as (args: string, ctx: ExtensionContext) => Promise<void>);
	},
	on(name, handler) {
		if (name === "session_shutdown") shutdown = handler as () => Promise<void>;
	},
} as ExtensionAPI);
const ctx = {
	mode: "tui",
	hasUI: true,
	ui: {
		notify(text: string, kind?: string) {
			notes.push({ text, kind });
		},
		setStatus() {},
		custom(
			factory: (tui: unknown, theme: unknown, kb: unknown, done: (value: string) => void) => { handleInput(data: string): void }
		) {
			return new Promise<string>((resolve) => {
				const component = factory({ requestRender() {} }, {}, {}, resolve);
				component.handleInput("fixture-passphrase");
				component.handleInput("\r");
			});
		},
	},
} as unknown as ExtensionContext;
function ssh(args: string[]) {
	const result = spawnSync("ssh-add", args, { env: process.env, encoding: "utf8" });
	return result;
}
async function command(name: string, args: string) {
	await commands.get(name)?.(args, ctx);
	assert.equal(notes.at(-1)?.kind, "info", JSON.stringify(notes.at(-1)));
}
const key = join(process.env.HOME as string, process.env.FIXTURE_KEY ?? "fixture");
try {
	for (const individual of [false, true]) {
		// Existing identity masks an unsuccessful add: reproduce the reported sequence.
		if (process.env.FIXTURE_KEY !== "encrypted") assert.equal(ssh([key]).status, 0);
		await command("ssh-key-load", key);
		await command("ssh-key-unload", individual ? key : "");
		assert.equal(ssh(["-l"]).status, 1, "unload actually removes the identity");
		await command("ssh-key-load", key);
		assert.equal(ssh(["-l"]).status, 0, "reload actually restores the identity");
		await command("ssh-key-unload", "");
	}
	// Also cover fresh loads and last-key teardown of a pi-owned real agent.
	delete process.env.SSH_AUTH_SOCK;
	delete process.env.SSH_AGENT_PID;
	for (const individual of [false, true]) {
		await command("ssh-key-load", key);
		await command("ssh-key-unload", individual ? key : "");
		assert.equal(process.env.SSH_AUTH_SOCK, undefined);
		await command("ssh-key-load", key);
		assert.equal(ssh(["-l"]).status, 0);
		await command("ssh-key-unload", "");
	}
} finally {
	await shutdown?.();
}
