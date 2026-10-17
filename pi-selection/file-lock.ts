import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, open } from "node:fs/promises";

// Constant interpreter program. Paths are argv, never interpolated into code.
// POSIX flock uses the same kernel lock as util-linux flock. EOF releases it
// even if the Pi parent is killed; the persistent lock inode is never removed.
const PYTHON_LOCK = `import errno, fcntl, os, stat, sys, time
fd = os.open(sys.argv[1], os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
s = os.fstat(fd)
if not stat.S_ISREG(s.st_mode) or stat.S_IMODE(s.st_mode) != 0o600 or s.st_uid != os.getuid():
    raise RuntimeError("Invalid private lock file")
deadline = time.monotonic() + 5
while True:
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        break
    except OSError as e:
        if e.errno not in (errno.EACCES, errno.EAGAIN) or time.monotonic() >= deadline:
            raise
        time.sleep(0.025)
print("LOCKED", flush=True)
sys.stdin.buffer.read()
os.close(fd)
`;

type Backend = "flock" | "python";
/** Backend override for qualification; not an agent-facing setting. */
export interface LockOptions {
	backend?: Backend;
	program?: string;
}

async function executable(candidates: string[]): Promise<string | undefined> {
	for (const candidate of candidates) {
		try {
			await access(candidate, constants.X_OK);
			return candidate;
		} catch {
			// Try the next known installation location, not the UI's focused context.
		}
	}
	return undefined;
}

async function resolveHelper(options: LockOptions): Promise<{ backend: Backend; program: string }> {
	if (options.backend && options.program) return { backend: options.backend, program: options.program };
	if (process.platform === "win32") throw new Error("Selection requires a qualified POSIX kernel-lock backend.");
	if (options.backend !== "python" && process.platform === "linux") {
		const program = await executable(["/usr/bin/flock", "/bin/flock"]);
		if (program) return { backend: "flock", program };
	}
	if (options.backend === "flock") throw new Error("Selection lock unavailable: install util-linux flock.");
	const program = await executable(["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3", "/bin/python3"]);
	if (program) return { backend: "python", program };
	throw new Error(
		"Selection lock unavailable: install Python 3 with the standard-library fcntl module, then retry. No unlocked writes were performed."
	);
}

function acquire(child: ReturnType<typeof spawn>, backend: Backend): Promise<void> {
	return new Promise((resolve, reject) => {
		let diagnostic = "";
		let buffer = "";
		const fail = (reason: string) =>
			reject(
				new Error(
					`Selection ${backend} lock unavailable: ${reason}. ${backend === "python" ? "Python 3 with fcntl is required." : "util-linux flock is required."} No unlocked writes were performed.`
				)
			);
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			fail("helper startup/acquisition exceeded 8 seconds");
		}, 8000);
		const cleanup = () => clearTimeout(timer);
		child.stderr?.on("data", (chunk: Buffer) => {
			diagnostic = (diagnostic + chunk.toString()).slice(-1024);
		});
		child.once("error", (error) => {
			cleanup();
			fail(error.message);
		});
		child.once("close", (code) => {
			cleanup();
			fail(`exit ${code}; ${diagnostic}`);
		});
		child.stdout?.on("data", (chunk: Buffer) => {
			buffer = (buffer + chunk.toString()).slice(-1024);
			if (buffer.includes("LOCKED\n")) {
				cleanup();
				resolve();
			}
		});
	});
}

/** Kernel locks release on crash. Never unlink a lock inode used by waiters. */
export async function withProcessLock<T>(path: string, operation: () => Promise<T>, options: LockOptions = {}): Promise<T> {
	const helper = await resolveHelper(options);
	const file = await open(path, constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
	try {
		const stat = await file.stat();
		if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid?.())
			throw new Error("Invalid private lock file");
	} finally {
		await file.close();
	}
	const args =
		helper.backend === "python"
			? ["-I", "-c", PYTHON_LOCK, path]
			: ["--exclusive", "--timeout", "5", path, "/bin/sh", "-c", "printf 'LOCKED\\n'; exec cat >/dev/null"];
	const child = spawn(helper.program, args, { env: { PATH: "/usr/bin:/bin" }, stdio: ["pipe", "pipe", "pipe"] });
	child.stdin.on("error", () => {
		/* A failed helper may already have closed stdin. */
	});
	const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
	try {
		await acquire(child, helper.backend);
		return await operation();
	} finally {
		child.stdin.end();
		await closed;
	}
}
