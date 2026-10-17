import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TabTitleSync } from "./tab-title.js";

const available = spawnSync("tmux", ["-V"]).status === 0;
test.skipIf(!available)(
	"real isolated tmux renames caller window without moving focus",
	async () => {
		const root = mkdtempSync(join(tmpdir(), "pi-title-"));
		const socket = join(root, "tmux.sock");
		const tmux = (...args: string[]) => {
			const result = spawnSync("tmux", ["-S", socket, ...args], { encoding: "utf8", timeout: 3000 });
			if (result.status !== 0) throw new Error(result.stderr);
			return result.stdout.trim();
		};
		try {
			tmux("-f", "/dev/null", "new-session", "-d", "-s", "test", "-n", "caller");
			const [pane, window, pid] = tmux("display-message", "-p", "#{pane_id}|#{window_id}|#{pid}").split("|");
			tmux("new-window", "-n", "focused");
			const before = tmux("display-message", "-p", "#{window_id}");
			const name = "[side] Review Selection [mini-okay-soda]";
			await new TabTitleSync().update({
				name,
				readableId: "mini-okay-soda",
				env: {
					...process.env,
					HERDR_ENV: undefined,
					TMUX: `${socket},${pid},0`,
					TMUX_PANE: pane,
				},
			});
			expect(tmux("display-message", "-p", "-t", window, "#{window_name}")).toBe("Review Selection");
			expect(tmux("display-message", "-p", "#{window_id}")).toBe(before);
			expect(name).toBe("[side] Review Selection [mini-okay-soda]");
		} finally {
			spawnSync("tmux", ["-S", socket, "kill-server"], { timeout: 3000 });
			rmSync(root, { recursive: true, force: true });
		}
	},
	15000
);
