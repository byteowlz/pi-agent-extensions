import { type ChildProcess, spawn } from "node:child_process";
import {
	closeSync,
	existsSync,
	fsyncSync,
	lstatSync,
	mkdtempSync,
	openSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	unlinkSync,
	writeSync,
} from "node:fs";
import { join } from "node:path";
import type { Config } from "./launch.js";

export type Store = { vaultDir: string; sessionDir: string; age?: Config["age"] };
const sealedDir = (store: Store) => join(store.vaultDir, "sealed");
const lockPath = (store: Store) => join(store.vaultDir, "active.lock");
const recipientPath = (store: Store) => join(store.vaultDir, "recipient.txt");
const identityPath = (store: Store) => join(store.vaultDir, "identity.age");

function privateFile(path: string): void {
	const stat = lstatSync(path);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) {
		throw new Error(`unsafe private session file: ${path}`);
	}
}

function names(dir: string, encrypted: boolean): string[] {
	const suffix = encrypted ? ".jsonl.age" : ".jsonl";
	const entries = readdirSync(dir);
	for (const name of entries) {
		if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) || !name.endsWith(suffix)) {
			throw new Error(`unexpected file in private ${encrypted ? "archive" : "session"} directory: ${name}`);
		}
		privateFile(join(dir, name));
	}
	return entries.sort();
}

async function age(args: string[], destination: string): Promise<void> {
	const fd = openSync(destination, "wx", 0o600);
	try {
		const child = spawn("age", args, { stdio: ["inherit", fd, "inherit"] });
		const status = await new Promise<number>((resolve, reject) => {
			child.once("error", reject);
			child.once("close", (code) => resolve(code ?? 1));
		});
		if (status !== 0) throw new Error(`age ${args[0]} failed (${status}); plaintext has not been removed`);
		fsyncSync(fd);
		if (statSync(destination).size === 0) throw new Error("age wrote empty output; refusing to discard plaintext");
	} finally {
		closeSync(fd);
	}
}

export async function requireAge(): Promise<void> {
	const child = spawn("age", ["--version"], { stdio: "ignore" });
	const status = await new Promise<number>((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (code) => resolve(code ?? 1));
	});
	if (status !== 0) throw new Error("age is required; refusing to start an unencrypted session");
}

async function initializeIdentity(store: Store): Promise<string> {
	const temp = join(store.vaultDir, "identity.age.tmp");
	const fd = openSync(temp, "wx", 0o600);
	let keygen: ChildProcess | undefined;
	let encrypt: ChildProcess | undefined;
	try {
		const generated = spawn("age-keygen", [], { stdio: ["ignore", "pipe", "pipe"] });
		keygen = generated;
		const protectedKey = spawn("age", ["-p"], { stdio: ["pipe", fd, "inherit"] });
		encrypt = protectedKey;
		if (!generated.stdout || !generated.stderr || !protectedKey.stdin) throw new Error("age identity pipes unavailable");
		protectedKey.stdin.on("error", () => {
			/* age failure is reported by its exit status */
		});
		generated.stdout.pipe(protectedKey.stdin); // secret identity stays in process pipes; no disk file
		let publicOutput = "";
		generated.stderr.on("data", (chunk: Buffer) => {
			publicOutput += chunk.toString("utf8");
			if (publicOutput.length > 4096) generated.kill();
		});
		const [keyStatus, encryptionStatus] = await Promise.all([
			new Promise<number>((resolve, reject) => {
				generated.once("error", reject);
				generated.once("close", (code) => resolve(code ?? 1));
			}),
			new Promise<number>((resolve, reject) => {
				protectedKey.once("error", reject);
				protectedKey.once("close", (code) => resolve(code ?? 1));
			}),
		]);
		const recipient = /Public key:\s*(age1[a-z0-9]+)/i.exec(publicOutput)?.[1];
		if (keyStatus !== 0 || encryptionStatus !== 0 || !recipient || statSync(temp).size === 0) {
			throw new Error("age identity creation failed; no Pi process was started");
		}
		fsyncSync(fd);
		renameSync(temp, identityPath(store));
		return recipient;
	} catch (error) {
		keygen?.kill();
		encrypt?.kill();
		rmSync(temp, { force: true });
		throw error;
	} finally {
		closeSync(fd);
	}
}

function recipient(store: Store): string {
	privateFile(recipientPath(store));
	const value = readFileSync(recipientPath(store), "utf8").trim();
	if (!/^age1[a-z0-9]+$/.test(value) || (store.age && value !== store.age.recipient))
		throw new Error("vault recipient changed or invalid");
	return value;
}

function ageArgs(store: Store, input: string, decrypt: boolean): string[] {
	if (!decrypt) return ["-r", recipient(store), input];
	const identity = store.age?.identityFile ?? identityPath(store);
	privateFile(identity);
	return ["-d", "-i", identity, input];
}

async function checkMode(store: Store, resume: boolean): Promise<void> {
	const path = join(store.vaultDir, "age-mode");
	const mode = store.age ? "recipient" : "passphrase-identity";
	if (resume) {
		privateFile(path);
		if (readFileSync(path, "utf8") !== `${mode}\n`) throw new Error("vault age mode changed; refusing unlock");
		recipient(store);
		privateFile(store.age?.identityFile ?? identityPath(store));
		return;
	}
	if (store.age) privateFile(store.age.identityFile);
	const publicKey = store.age?.recipient ?? (await initializeIdentity(store));
	const fd = openSync(recipientPath(store), "wx", 0o600);
	try {
		writeSync(fd, `${publicKey}\n`);
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	const marker = openSync(path, "wx", 0o600);
	try {
		writeSync(marker, `${mode}\n`);
		fsyncSync(marker);
	} finally {
		closeSync(marker);
	}
}

export async function preflight(store: Store, resume: boolean): Promise<void> {
	await requireAge();
	if (names(store.sessionDir, false).length)
		throw new Error("plaintext session files remain from a prior run; recover/seal before starting Pi");
	const sealed = names(sealedDir(store), true);
	if (resume && sealed.length === 0) throw new Error("no encrypted session files to resume");
	if (!resume && sealed.length !== 0) throw new Error("vault already contains encrypted sessions; use resume");
	await checkMode(store, resume);
	if (!resume) {
		// Confirm age (and any recipient plugin) can seal before Pi writes plaintext.
		const temp = mkdtempSync(join(store.vaultDir, ".age-probe-"));
		try {
			const source = join(temp, "probe");
			const fd = openSync(source, "wx", 0o600);
			try {
				writeSync(fd, "pi-private preflight");
			} finally {
				closeSync(fd);
			}
			await age(ageArgs(store, source, false), join(temp, "probe.age"));
			if (store.age) {
				await age(ageArgs(store, join(temp, "probe.age"), true), join(temp, "verified"));
				if (readFileSync(join(temp, "verified"), "utf8") !== "pi-private preflight")
					throw new Error("age recipient identity did not decrypt the preflight probe");
			}
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	}
}

export async function unlockFiles(store: Store): Promise<void> {
	const archives = names(sealedDir(store), true);
	if (names(store.sessionDir, false).length) throw new Error("refusing to overwrite plaintext session files");
	const temp = mkdtempSync(join(store.sessionDir, ".unlock-"));
	const created: string[] = [];
	try {
		for (const archive of archives) {
			const name = archive.slice(0, -4);
			await age(ageArgs(store, join(sealedDir(store), archive), true), join(temp, name));
		}
		for (const archive of archives) {
			const name = archive.slice(0, -4);
			const output = join(store.sessionDir, name);
			if (existsSync(output)) throw new Error(`session file already exists: ${name}`);
			renameSync(join(temp, name), output);
			created.push(output);
		}
	} catch (error) {
		for (const path of created) unlinkSync(path);
		throw error;
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
}

export async function sealFiles(store: Store): Promise<void> {
	const files = names(store.sessionDir, false);
	if (!files.length) return;
	const temp = mkdtempSync(join(sealedDir(store), ".seal-"));
	try {
		for (const name of files) await age(ageArgs(store, join(store.sessionDir, name), false), join(temp, `${name}.age`));
		for (const name of files) renameSync(join(temp, `${name}.age`), join(sealedDir(store), `${name}.age`));
		const directory = openSync(sealedDir(store), "r");
		try {
			fsyncSync(directory);
		} finally {
			closeSync(directory);
		}
		for (const name of files) unlinkSync(join(store.sessionDir, name));
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
}

export async function sealLeftovers(store: Store): Promise<void> {
	await withSessionLock(store, async () => {
		await requireAge();
		await checkMode(store, true);
		await sealFiles(store);
	});
}

export async function withSessionLock(store: Store, body: () => Promise<void>): Promise<void> {
	const path = lockPath(store);
	const fd = openSync(path, "wx", 0o600);
	try {
		writeSync(fd, String(process.pid));
	} finally {
		closeSync(fd);
	}
	try {
		await body();
	} finally {
		// Failures leave plaintext and lock for explicit inspection/recovery.
		if (names(store.sessionDir, false).length === 0) unlinkSync(path);
	}
}
