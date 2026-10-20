import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import extension from "./index.js";

const hasKeygen = spawnSync("ssh-keygen", ["-l", "-f", "/nonexistent"]).status !== 127;

test.skipIf(!hasKeygen)(
	"loading a key publishes an ssh-key status with the timeout countdown",
	async () => {
		const root = mkdtempSync(join(tmpdir(), "ssh-status-"));
		const keyPath = join(root, "id_status");
		const generated = spawnSync("ssh-keygen", ["-t", "ed25519", "-N", "", "-q", "-f", keyPath], { encoding: "utf8" });
		if (generated.status !== 0) throw new Error(generated.stderr);
		const previous = process.env.SSH_AUTH_SOCK;
		delete process.env.SSH_AUTH_SOCK;
		const handlers = new Map<string, (args: string, ctx: ExtensionCommandContext) => Promise<void>>();
		const shutdown: Array<() => Promise<void>> = [];
		extension({
			registerCommand: (name: string, options: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }) => {
				handlers.set(name, options.handler);
			},
			on: (event: string, handler: () => Promise<void>) => {
				if (event === "session_shutdown") shutdown.push(handler);
			},
		} as unknown as ExtensionAPI);
		const statuses = new Map<string, string | undefined>();
		const notices: string[] = [];
		const ctx = {
			mode: "tui",
			hasUI: true,
			ui: {
				notify: (text: string) => notices.push(text),
				setStatus: (key: string, value: string | undefined) => statuses.set(key, value),
			},
		} as unknown as ExtensionCommandContext;
		try {
			await handlers.get("ssh-key-load")?.(`"${keyPath}" 60`, ctx);
			expect(notices.join("\n")).toContain("loaded id_status");
			const published = statuses.get("ssh-key");
			expect(published).toContain("1 key");
			expect(published).toMatch(/\d+(m\d+s|s)/);

			// Unloading clears the segment.
			await handlers.get("ssh-key-unload")?.("", ctx);
			expect(statuses.get("ssh-key")).toBeUndefined();
		} finally {
			for (const handler of shutdown) await handler();
			if (previous === undefined) delete process.env.SSH_AUTH_SOCK;
			else process.env.SSH_AUTH_SOCK = previous;
			rmSync(root, { recursive: true, force: true });
		}
	},
	20000
);
