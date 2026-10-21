import { spawn } from "node:child_process";
import { constants, access } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { editorArgs } from "./editor-args.js";

/** Only list authoritative loaded context, never guess by walking directories. */
export function loadedAgentsPaths(files: readonly { path: string }[]): string[] {
	return [...new Set(files.map((file) => file.path).filter((path) => isAbsolute(path) && basename(path) === "AGENTS.md"))];
}

export async function openEditor(path: string, command: string): Promise<void> {
	const [program, ...args] = editorArgs(command);
	await new Promise<void>((resolve, reject) => {
		const child = spawn(program, [...args, path], { stdio: "inherit" });
		child.once("error", reject);
		child.once("exit", (code, signal) => {
			if (code === 0) resolve();
			else reject(new Error(`Editor exited with ${signal ?? code}.`));
		});
	});
}

export default function (pi: ExtensionAPI): void {
	let editing = false;
	pi.registerCommand("agents-edit", {
		description: "Pick a loaded AGENTS.md and open it in VISUAL or EDITOR",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/agents-edit requires the native Pi TUI and a local editor.", "error");
				return;
			}
			if (editing) return;
			editing = true;
			try {
				const command = process.env.VISUAL || process.env.EDITOR;
				if (!command) throw new Error("Set VISUAL or EDITOR first (for example: nvim or code --wait).");
				editorArgs(command);
				const paths = loadedAgentsPaths(ctx.getSystemPromptOptions().contextFiles ?? []);
				if (!paths.length) {
					ctx.ui.notify("No loaded AGENTS.md files were reported by this Pi runtime.", "info");
					return;
				}
				const path = await ctx.ui.select("Edit loaded AGENTS.md", paths);
				if (!path || !paths.includes(path)) return;
				await access(path, constants.R_OK | constants.W_OK);
				const error = await ctx.ui.custom<Error | undefined>((tui, _theme, _keys, done) => {
					tui.stop();
					void (async () => {
						let failure: Error | undefined;
						try {
							await openEditor(path, command);
						} catch (error) {
							failure = error instanceof Error ? error : new Error(String(error));
						} finally {
							tui.start();
							tui.requestRender(true);
						}
						done(failure);
					})();
					return {
						render: () => [],
						invalidate() {
							// The external editor owns the screen until it exits.
						},
					};
				});
				if (error) throw error;
				ctx.ui.notify("Editor closed. Saved changes are on disk; run /reload to refresh loaded instructions.", "info");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			} finally {
				editing = false;
			}
		},
	});
}
