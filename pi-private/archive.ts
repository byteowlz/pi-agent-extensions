// Optional, offline archive helper. Never called for a live session; does not delete plaintext.
import { spawn } from "node:child_process";
import { closeSync, existsSync, lstatSync, mkdtempSync, openSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function privateFile(path: string): void {
	const stat = lstatSync(path);
	if (
		!stat.isFile() ||
		stat.isSymbolicLink() ||
		(typeof process.getuid === "function" && stat.uid !== process.getuid()) ||
		(stat.mode & 0o077) !== 0
	) {
		throw new Error("archive input must be an owned 0600 regular file");
	}
}

async function runAge(binary: string, args: string[], outputFd: number): Promise<void> {
	// The output descriptor is created 0600 before age starts.
	const child = spawn(binary, args, { stdio: ["inherit", outputFd, "inherit"] });
	const code = await new Promise<number>((ok, fail) => {
		child.once("error", fail);
		child.once("exit", (status) => ok(status ?? 1));
	});
	if (code !== 0) throw new Error(`age failed (${code}); output discarded`);
}

export async function archive(
	action: "encrypt" | "decrypt",
	input: string,
	key: string,
	output: string,
	binary = "age"
): Promise<void> {
	if (!key || resolve(input) === resolve(output)) throw new Error("invalid archive arguments");
	privateFile(input);
	if (action === "decrypt") privateFile(key); // identity contents never passed as argv or env
	if (existsSync(output)) throw new Error("archive destination already exists");
	const parent = dirname(resolve(output));
	const stat = lstatSync(parent);
	if (
		!stat.isDirectory() ||
		stat.isSymbolicLink() ||
		(typeof process.getuid === "function" && stat.uid !== process.getuid()) ||
		(stat.mode & 0o077) !== 0
	) {
		throw new Error("archive destination directory must be owned and 0700");
	}
	const scratch = mkdtempSync(join(parent, ".pi-private-age-"));
	const temp = join(scratch, "output");
	try {
		const fd = openSync(temp, "wx", 0o600);
		try {
			await runAge(binary, action === "encrypt" ? ["-r", key, input] : ["-d", "-i", key, input], fd);
		} finally {
			closeSync(fd);
		}
		privateFile(temp);
		// Exclusive destination reservation prevents a concurrent overwrite.
		const destinationFd = openSync(output, "wx", 0o600);
		closeSync(destinationFd);
		try {
			renameSync(temp, output);
		} catch (error) {
			rmSync(output);
			throw error;
		}
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	const [action, input, key, output] = process.argv.slice(2);
	if ((action !== "encrypt" && action !== "decrypt") || !input || !key || !output) {
		console.error(
			"Usage: bun pi-private/archive.ts encrypt SESSION_FILE PUBLIC_RECIPIENT OUTPUT.age | decrypt ARCHIVE.age IDENTITY_FILE OUTPUT"
		);
		process.exitCode = 2;
	} else {
		try {
			await archive(action, input, key, output);
		} catch (error) {
			console.error(String(error));
			process.exitCode = 1;
		}
	}
}
