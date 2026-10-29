import { spawn } from "node:child_process";
import { preflight, sealFiles, unlockFiles, withSessionLock } from "./age-store.js";
import type { prepare } from "./launch.js";

export async function runPrivate(
	plan: ReturnType<typeof prepare>,
	resume: boolean,
	cwd: string,
	env: NodeJS.ProcessEnv
): Promise<void> {
	// Pi creates JSONL with the process umask; require 0600, not the usual 0644.
	const previousUmask = process.umask(0o077);
	try {
		await withSessionLock(plan, async () => {
			await preflight(plan, resume);
			if (resume) await unlockFiles(plan);
			let failure: Error | undefined;
			try {
				const child = spawn("pi", plan.args, { cwd, env, stdio: "inherit" });
				const handlers = (["SIGINT", "SIGTERM", "SIGHUP"] as const).map((signal) => ({
					signal,
					forward: () => {
						child.kill(signal);
					},
				}));
				for (const { signal, forward } of handlers) process.on(signal, forward);
				try {
					const code = await new Promise<number>((resolve, reject) => {
						child.once("error", reject);
						child.once("exit", (status) => resolve(status ?? 1));
					});
					if (code !== 0) failure = new Error(`pi exited with status ${code}`);
				} finally {
					for (const { signal, forward } of handlers) process.off(signal, forward);
				}
			} catch (error) {
				failure = error instanceof Error ? error : new Error(String(error));
			} finally {
				// Even after a Pi error, seal everything it managed to write. A failure
				// leaves plaintext and the lock for explicit recovery; never report sealed.
				await sealFiles(plan);
			}
			if (failure) throw failure;
		});
	} finally {
		process.umask(previousUmask);
	}
}
