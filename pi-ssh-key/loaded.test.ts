import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { pickKeys } from "./index.js";

const hasAgent = spawnSync("ssh-agent", ["-h"]).status !== 127;
const hasKeygen = spawnSync("ssh-keygen", ["-l", "-f", "/nonexistent"]).status !== 127;

type Picker = { handleInput(data: string): void; render(width: number): string[] };

/** Mount the picker, replay `inputs`, and return the screen after each one. */
async function pickerScreens(dir: string, inputs: string[]): Promise<string[]> {
	const screens: string[] = [];
	const ctx = {
		ui: {
			custom: async (factory: (...args: unknown[]) => Picker) => {
				let result: unknown;
				const picker = factory({ requestRender() {} }, { fg: (_color: string, text: string) => text }, {}, (value: unknown) => {
					result = value;
				});
				for (const input of inputs) {
					picker.handleInput(input);
					screens.push(picker.render(200).join("\n"));
				}
				picker.handleInput("\u001b");
				return result;
			},
		},
	} as unknown as ExtensionCommandContext;
	await pickKeys(ctx, dir);
	return screens;
}

test.skipIf(!hasAgent || !hasKeygen)(
	"picker marks keys already present in the agent as loaded",
	async () => {
		const root = mkdtempSync(join(tmpdir(), "ssh-badge-"));
		const socket = join(root, "agent.sock");
		const loadedKey = join(root, "loaded_key");
		const otherKey = join(root, "other_key");
		const started = spawnSync("ssh-agent", ["-a", socket], { encoding: "utf8" });
		const pid = Number(/SSH_AGENT_PID=(\d+)/.exec(`${started.stdout}${started.stderr}`)?.[1] ?? 0);
		const previous = process.env.SSH_AUTH_SOCK;
		try {
			for (const key of [loadedKey, otherKey]) {
				const generated = spawnSync("ssh-keygen", ["-t", "ed25519", "-N", "", "-q", "-f", key], { encoding: "utf8" });
				if (generated.status !== 0) throw new Error(generated.stderr);
			}
			const added = spawnSync("ssh-add", [loadedKey], { encoding: "utf8", env: { ...process.env, SSH_AUTH_SOCK: socket } });
			if (added.status !== 0) throw new Error(added.stderr);
			process.env.SSH_AUTH_SOCK = socket;

			// Screen after typing the full "loaded" query.
			const queryScreen = (await pickerScreens(root, Array.from("loaded"))).at(-1) ?? "";
			expect(queryScreen).toContain("1 loaded");
			const loadedLine = queryScreen.split("\n").find((line) => line.includes("loaded_key")) ?? "";
			expect(loadedLine).toContain("[loaded]");
			// Typing "loaded" filters to the loaded key only.
			expect(queryScreen).toContain("loaded_key");
			expect(queryScreen).not.toContain("other_key");

			// Unfiltered: the other key is visible and has no badge.
			const plain = (await pickerScreens(root, ["\u007f"])).at(-1) ?? "";
			const otherLine = plain.split("\n").find((line) => line.includes("other_key")) ?? "";
			expect(otherLine).toBeTruthy();
			expect(otherLine).not.toContain("[loaded]");
		} finally {
			if (previous === undefined) delete process.env.SSH_AUTH_SOCK;
			else process.env.SSH_AUTH_SOCK = previous;
			if (pid) process.kill(pid);
			rmSync(root, { recursive: true, force: true });
		}
	},
	20000
);
