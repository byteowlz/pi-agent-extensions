import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Directory for the default socket. On Linux `os.tmpdir()` is the shared `/tmp`,
 * which an Oqto Runner rightly refuses as a socket root (anyone can plant a socket
 * there), so a private per-user `XDG_RUNTIME_DIR` (systemd: `/run/user/<uid>`,
 * mode 0700, owned by this user) is used when present. macOS `os.tmpdir()` is
 * already a private per-user directory.
 */
export function socketDirectory(
	env: NodeJS.ProcessEnv = process.env,
	platform: NodeJS.Platform = process.platform,
	uid: number | undefined = process.getuid?.()
): string {
	const runtime = env.XDG_RUNTIME_DIR?.trim();
	if (platform === "linux" && runtime && path.isAbsolute(runtime)) {
		try {
			const stat = fs.statSync(runtime);
			if (stat.isDirectory() && stat.uid === uid && (stat.mode & 0o077) === 0) return runtime;
		} catch {
			// Missing or unreadable: fall back below.
		}
	}
	return os.tmpdir();
}

export function defaultSocketPath(pid: number = process.pid): string {
	return path.join(socketDirectory(), `pi-tui-rpc-${pid}.sock`);
}
