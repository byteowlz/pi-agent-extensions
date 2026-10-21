import { expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("real command load/unload/reload with inherited and owned agents", async () => {
	const home = mkdtempSync(join(tmpdir(), "pi-ssh-reload-"));
	const socket = join(home, "agent.sock");
	// Allowlist, never inherit the user's SSH socket, proxy flags, or config HOME.
	const env = { HOME: home, PATH: process.env.PATH, SSH_AUTH_SOCK: socket };
	const agent = spawn("ssh-agent", ["-D", "-a", socket], { env, stdio: "ignore" });
	try {
		for (let i = 0; i < 100; i++) {
			if (spawnSync("ssh-add", ["-l"], { env }).status === 1) break;
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		expect(spawnSync("ssh-add", ["-l"], { env }).status).toBe(1);
		expect(spawnSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", join(home, "fixture")], { env }).status).toBe(0);
		expect(
			spawnSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "fixture-passphrase", "-f", join(home, "encrypted")], { env }).status
		).toBe(0);
		for (const key of ["fixture", "encrypted"]) {
			const result = spawnSync(process.execPath, [join(import.meta.dir, "reload.fixture.ts")], {
				env: { ...env, FIXTURE_KEY: key },
				encoding: "utf8",
				timeout: 20000,
			});
			expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
		}
	} finally {
		agent.kill("SIGTERM");
		await new Promise<void>((resolve) => {
			if (agent.exitCode !== null) resolve();
			else agent.once("exit", () => resolve());
		});
		rmSync(home, { recursive: true, force: true });
	}
}, 30000);
