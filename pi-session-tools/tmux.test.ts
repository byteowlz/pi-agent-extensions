import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { type Run, openTmuxSide } from "./backend.js";
const exec = promisify(execFile);
test("isolated tmux server: side window forks safely and preserves parent focus", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-tmux-route-"));
	const socket = join(dir, "socket");
	const argsFile = join(dir, "argv");
	await writeFile(join(dir, "pi"), `#!/bin/sh\nprintf '%s\\n' "$@" > '${argsFile}'\nsleep 30\n`, { mode: 0o700 });
	const execute: Run = async (_command, args) =>
		(await exec("tmux", ["-S", socket, ...args], { timeout: 5000, env: { PATH: `${dir}:${process.env.PATH}`, HOME: dir } }))
			.stdout;
	try {
		const parent = (await execute("tmux", ["new-session", "-d", "-P", "-F", "#{pane_id}", "-s", "fixture", "sleep 30"])).trim();
		const before = await execute("tmux", ["display-message", "-p", "-t", parent, "#{window_id}"]);
		const receipt = await openTmuxSide(
			{
				pane: parent,
				label: "side",
				cwd: dir,
				sessionFile: "/synthetic session.jsonl",
				instruction: "$(touch /never) ' literal",
			},
			execute
		);
		for (let i = 0; i < 100; i++) {
			try {
				await readFile(argsFile);
				break;
			} catch {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
		}
		expect((await readFile(argsFile, "utf8")).split("\n")).toEqual([
			"--fork",
			"/synthetic session.jsonl",
			"--",
			"$(touch /never) ' literal",
			"",
		]);
		expect(await execute("tmux", ["display-message", "-p", "-t", "fixture", "#{window_id}"])).toBe(before);
		expect(receipt.paneId).not.toBe(parent);
	} finally {
		try {
			await execute("tmux", ["kill-server"]);
		} catch {
			/* own isolated server only */
		}
		await rm(dir, { recursive: true, force: true });
	}
}, 10000);
