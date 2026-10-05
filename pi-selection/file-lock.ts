import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { open } from "node:fs/promises";

/** Kernel locks release on crash. Never unlink a lock inode used by waiters. */
export async function withProcessLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
	const file = await open(path, constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
	try {
		const stat = await file.stat();
		if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid?.())
			throw new Error("Invalid private lock file");
	} finally {
		await file.close();
	}
	// Constant shell program; no content or caller-supplied code enters it.
	// cat owns a pipe that closes even when the caller is killed. flock then exits.
	const child = spawn(
		"flock",
		["--exclusive", "--timeout", "5", path, "/bin/sh", "-c", "printf 'LOCKED\\n'; exec cat >/dev/null"],
		{
			env: { PATH: "/usr/bin:/bin" },
			stdio: ["pipe", "pipe", "pipe"],
		}
	);
	let diagnostic = "";
	child.stderr.on("data", (chunk: Buffer) => {
		diagnostic = (diagnostic + chunk.toString()).slice(-1024);
	});
	child.stdin.on("error", () => undefined);
	const closed = new Promise<void>((resolve) => {
		child.once("close", () => resolve());
	});
	try {
		await new Promise<void>((resolve, reject) => {
			let buffer = "";
			const fail = (error: Error) => reject(error);
			child.once("error", fail);
			child.once("close", (code) => reject(new Error(`Cannot acquire selection lock (flock required): ${code}; ${diagnostic}`)));
			child.stdout.on("data", (chunk: Buffer) => {
				buffer += chunk.toString();
				if (buffer.includes("LOCKED\n")) resolve();
			});
		});
		return await operation();
	} finally {
		child.stdin.end();
		await closed;
	}
}
