/**
 * Encrypted backups of original sessions.
 *
 * A bundle (original session + nym key file) is encrypted with GnuPG
 * (symmetric AES-256). The passphrase is a random secret kept in kyz and only
 * ever passed to gpg through `kyz pipe` (never argv, env or disk). Manual
 * recovery anywhere: `kyz pipe pi-nym/backup -- gpg --batch --pinentry-mode
 * loopback --passphrase-fd 0 --decrypt FILE`.
 */

import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Runner, run } from "./nym.js";

export const FORMAT = "pi-nym-backup/v1";

export interface Bundle {
	format: typeof FORMAT;
	createdAt: string;
	sessionId: string;
	sessionName?: string;
	cwd?: string;
	originalPath: string;
	redactedPath: string;
	/** Original session JSONL. */
	session: string;
	/** nym key file mapping originals to pseudonyms (for `nym deanon`). */
	keys: string;
}

export interface Secret {
	service: string;
	key: string;
	/** Explicit kyz vault; default kyz discovery. */
	vault?: string;
}

function kyzArgs(secret: Secret, args: string[]): string[] {
	return secret.vault ? ["--vault", secret.vault, ...args] : args;
}

const GPG = ["--batch", "--quiet", "--yes", "--pinentry-mode", "loopback", "--passphrase-fd", "0"];

/** Make sure the vault is unlocked and the backup secret exists (creating it once). */
export async function ensureSecret(secret: Secret, runner: Runner = run, gpg = "gpg"): Promise<void> {
	const version = await runner(gpg, ["--version"], { timeoutMs: 10000 }).catch(() => undefined);
	if (version?.code !== 0) throw new Error("gpg is not installed; encrypted backups need GnuPG");
	const status = await runner("kyz", kyzArgs(secret, ["vault", "status", "--json"]), { timeoutMs: 10000 }).catch(() => undefined);
	if (!status || status.code !== 0) throw new Error("kyz is not available; encrypted backups need kyz");
	const parsed = JSON.parse(status.stdout) as { exists?: boolean; unlocked?: boolean };
	if (!parsed.exists) throw new Error("no kyz vault; create one with `kyz vault create`");
	if (!parsed.unlocked) throw new Error("the kyz vault is locked; run `kyz vault unlock` in a terminal");
	const existing = await runner("kyz", kyzArgs(secret, ["get", secret.key, "--service", secret.service, "--json"]), {
		timeoutMs: 10000,
	});
	if (existing.code === 0) return;
	const created = await setSecret(secret, randomBytes(32).toString("base64url"));
	if (!created) throw new Error("could not store the backup passphrase in kyz");
}

/** `kyz set` reads the value from stdin, so the passphrase never appears in argv. */
async function setSecret(secret: Secret, value: string): Promise<boolean> {
	const { spawn } = await import("node:child_process");
	return new Promise((resolve) => {
		const child = spawn("kyz", kyzArgs(secret, ["set", secret.key, "--service", secret.service]), {
			stdio: ["pipe", "ignore", "ignore"],
		});
		child.on("error", () => resolve(false));
		child.on("close", (code) => resolve(code === 0));
		child.stdin.end(value);
	});
}

function pipe(secret: Secret, command: string[]): string[] {
	return kyzArgs(secret, ["pipe", `${secret.service}/${secret.key}`, "--", ...command]);
}

export function sha256(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

/** Decrypt a backup file to its bundle text. */
export async function decrypt(secret: Secret, file: string, runner: Runner = run, gpg = "gpg"): Promise<string> {
	const result = await runner("kyz", pipe(secret, [gpg, ...GPG, "--decrypt", file]), { timeoutMs: 60000 });
	if (result.code !== 0) throw new Error("could not decrypt the backup (wrong vault or passphrase?)");
	return result.stdout;
}

/**
 * Encrypt the bundle into `dir` and prove it decrypts to the same bytes
 * before returning; the plaintext staging file lives only in `work`.
 */
export async function writeBackup(
	secret: Secret,
	bundle: Bundle,
	dir: string,
	work: string,
	runner: Runner = run,
	gpg = "gpg"
): Promise<string> {
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const text = JSON.stringify(bundle);
	const staged = join(work, "bundle.json");
	writeFileSync(staged, text, { mode: 0o600 });
	const stamp = bundle.createdAt.replace(/[:.]/g, "-");
	const target = join(dir, `${stamp}_${bundle.sessionId}.json.gpg`);
	const partial = `${target}.partial`;
	try {
		const result = await runner(
			"kyz",
			pipe(secret, [gpg, ...GPG, "--symmetric", "--cipher-algo", "AES256", "--output", partial, staged]),
			{
				timeoutMs: 60000,
			}
		);
		if (result.code !== 0 || !existsSync(partial)) throw new Error("gpg encryption failed");
		chmodSync(partial, 0o600);
		const roundTrip = await decrypt(secret, partial, runner, gpg);
		if (sha256(roundTrip) !== sha256(text)) throw new Error("backup verification failed");
		renameSync(partial, target);
		return target;
	} finally {
		rmSync(staged, { force: true });
		rmSync(partial, { force: true });
	}
}

export function parseBundle(text: string): Bundle {
	const bundle = JSON.parse(text) as Bundle;
	if (bundle.format !== FORMAT || typeof bundle.session !== "string") throw new Error("not a pi-nym backup");
	return bundle;
}

export function listBackups(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => name.endsWith(".json.gpg"))
		.sort()
		.reverse()
		.map((name) => join(dir, name));
}
