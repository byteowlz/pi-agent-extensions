import { expect, test } from "bun:test";
import { execFile, spawnSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EchoSuppressor, TmuxInboundTarget } from "./tab-title-inbound.js";

const available = spawnSync("tmux", ["-V"]).status === 0;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readInbox(path: string, from: number): { text: string; offset: number } {
	const size = statSync(path).size;
	if (size <= from) return { text: "", offset: size };
	const length = Math.min(size - from, 32 * 1024);
	const fd = openSync(path, "r");
	try {
		const buffer = Buffer.alloc(length);
		const read = readSync(fd, buffer, 0, length, from);
		return { text: buffer.subarray(0, read).toString("utf8"), offset: from + read };
	} finally {
		closeSync(fd);
	}
}

test.skipIf(!available)(
	"real isolated tmux: sidebar rename propagates, echo ignored, foreign window ignored",
	async () => {
		const root = mkdtempSync(join(tmpdir(), "pi-inbound-tmux-"));
		const socket = join(root, "tmux.sock");
		const inbox = join(root, "inbox");
		writeFileSync(inbox, "", { mode: 0o600 });
		const tmux = (...args: string[]) => {
			const result = spawnSync("tmux", ["-S", socket, ...args], { encoding: "utf8", timeout: 3000 });
			if (result.status !== 0) throw new Error(result.stderr);
			return result.stdout.trim();
		};
		const tmuxRun = (args: string[]) =>
			new Promise<string>((resolve, reject) => {
				execFile("tmux", ["-S", socket, ...args], { timeout: 2000 }, (error, stdout) => {
					if (error) reject(error);
					else resolve(stdout);
				});
			});
		try {
			tmux("-f", "/dev/null", "new-session", "-d", "-s", "test", "-n", "caller");
			const [pane, pid] = tmux("display-message", "-p", "#{pane_id}|#{pid}").split("|");
			const caller = tmux("display-message", "-p", "#{window_id}");
			// A second, foreign window we must never touch.
			tmux("new-window", "-n", "foreign");
			const foreign = tmux("display-message", "-p", "#{window_id}");
			tmux("select-window", "-t", caller);

			const applied: string[] = [];
			const target = new TmuxInboundTarget(
				{
					readableId: "mini-okay-soda",
					env: { TMUX: `${socket},${pid},0`, TMUX_PANE: pane },
					apply: (base) => {
						applied.push(base);
					},
				},
				new EchoSuppressor(300),
				tmuxRun,
				inbox,
				readInbox
			);
			target.start();
			await sleep(400);
			expect(tmux("show-hooks", "-w", "-t", caller)).toContain("window-renamed");

			// A genuine user rename of the caller's window.
			tmux("rename-window", "-t", caller, "User Chose This");
			await sleep(600);
			expect(applied).toEqual(["User Chose This"]);

			// Echo of a title this process just pushed is ignored.
			target.notePushed("Pushed Title");
			tmux("rename-window", "-t", caller, "Pushed Title");
			tmux("rename-window", "-t", foreign, "Foreign Rename");
			await sleep(600);
			expect(applied).toEqual(["User Chose This"]);
			expect(tmux("display-message", "-p", "-t", foreign, "#{window_name}")).toBe("Foreign Rename");

			target.stop();
			await sleep(300);
			expect(tmux("show-hooks", "-w", "-t", caller).includes("window-renamed")).toBe(false);
		} finally {
			spawnSync("tmux", ["-S", socket, "kill-server"], { timeout: 3000 });
			rmSync(root, { recursive: true, force: true });
		}
	},
	20000
);

test.skipIf(!available)(
	"tmux inbound refuses shared windows and missing host claims",
	async () => {
		const root = mkdtempSync(join(tmpdir(), "pi-inbound-tmux2-"));
		const socket = join(root, "tmux.sock");
		const inbox = join(root, "inbox");
		writeFileSync(inbox, "", { mode: 0o600 });
		const tmux = (...args: string[]) => {
			const result = spawnSync("tmux", ["-S", socket, ...args], { encoding: "utf8", timeout: 3000 });
			if (result.status !== 0) throw new Error(result.stderr);
			return result.stdout.trim();
		};
		const tmuxRun = (args: string[]) =>
			new Promise<string>((resolve, reject) => {
				execFile("tmux", ["-S", socket, ...args], { timeout: 2000 }, (error, stdout) => {
					if (error) reject(error);
					else resolve(stdout);
				});
			});
		try {
			tmux("-f", "/dev/null", "new-session", "-d", "-s", "test", "-n", "caller");
			const [pane, pid] = tmux("display-message", "-p", "#{pane_id}|#{pid}").split("|");
			const caller = tmux("display-message", "-p", "#{window_id}");
			tmux("split-window", "-d", "-t", caller); // shared window: 2 panes
			const applied: string[] = [];
			const target = new TmuxInboundTarget(
				{ env: { TMUX: `${socket},${pid},0`, TMUX_PANE: pane }, apply: (base) => applied.push(base) },
				new EchoSuppressor(300),
				tmuxRun,
				inbox,
				readInbox
			);
			target.start();
			await sleep(400);
			expect(tmux("show-hooks", "-w", "-t", caller).includes("window-renamed")).toBe(false);
			tmux("rename-window", "-t", caller, "Should Not Apply");
			await sleep(400);
			expect(applied).toEqual([]);
			target.stop();
		} finally {
			spawnSync("tmux", ["-S", socket, "kill-server"], { timeout: 3000 });
			rmSync(root, { recursive: true, force: true });
		}
	},
	20000
);
