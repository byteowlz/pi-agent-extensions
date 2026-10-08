/**
 * pi-prompt-stash - portable, dependency-free JSON sidecar store.
 *
 * This module is intentionally self-contained (node builtins only) so it can
 * live next to a session file, inside cwd state, or under the agent dir, and
 * be shared between the extension and tests without pulling in pi APIs.
 *
 * Design notes:
 *   - Sidecars are versioned JSON documents (`version: 1`).
 *   - Small files: each item text is bounded, total entries bounded, and the
 *     on-disk JSON is capped. Malformed or out-of-bounds documents are refused
 *     (fail closed) and are never overwritten by a write.
 *   - Writes are read-modify-write under a cross-process exclusive lock
 *     (`.lock` directory), atomic (temp file + fsync + rename), and private
 *     (dir 0700, file 0600).
 *   - The lock is fail-fast: if the lock directory already exists we refuse
 *     immediately. We never break or take over an existing (possibly stale)
 *     lock — callers retry or surface the conflict.
 *   - Symlinked final paths (the data file or its immediate parent directory)
 *     are rejected, so we never follow, clobber, or delete through a link.
 */

import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, rmdir, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** Storage scope of a stash sidecar. */
export type Scope = "session" | "cwd" | "global";

/** Provenance of a stash item (used by the extension for labels/history). */
export interface StashSource {
	/** Session id the item came from, if any. */
	sessionId?: string;
	/** Session entry id the item came from, if any. */
	entryId?: string;
	/** Session file path the item came from, if any. */
	sessionFile?: string;
}

/** A stashed prompt entry. */
export interface StashItem {
	/** Immutable, opaque id (UUID v4). Never truncated or reused. */
	id: string;
	/** The prompt text. Bounded to {@link MAX_ITEM_TEXT} characters. */
	text: string;
	/** ISO-8601 creation timestamp. */
	createdAt: string;
	/** Optional user-supplied label. */
	label?: string;
	/** Optional provenance. */
	source?: StashSource;
}

/** A saved prompt command (promotable to a reusable pi command). */
export interface StashCommand {
	/** Immutable, opaque id (UUID v4). */
	id: string;
	/** Command name (must be unique unless overwriting). */
	name: string;
	/** Command body. Bounded to {@link MAX_ITEM_TEXT} characters. */
	text: string;
	/** ISO-8601 creation timestamp. */
	createdAt: string;
}

/** The on-disk sidecar document. */
export interface StashDocument {
	/** Document schema version. Only `1` is supported. */
	version: 1;
	/** Stashed prompt entries. */
	entries: StashItem[];
	/** Saved command records. */
	commands: StashCommand[];
}

export const DOCUMENT_VERSION = 1 as const;

/** Hard cap on a serialized document (bytes). */
export const MAX_DOC_BYTES = 8 * 1024 * 1024; // 8 MiB

/** Hard cap on a single item / command text length. */
export const MAX_ITEM_TEXT = 128 * 1024; // 128 KiB

/** Hard cap on the total number of entries + commands in a document. */
export const MAX_ENTRIES = 2000;

export const STASH_DIR = "prompt-stash";

/** Default base directory for cwd/global scopes. */
export function defaultAgentDir(): string {
	return join(homedir(), ".pi", "agent");
}

/** Options for {@link paths}. */
export interface PathsOptions {
	scope: Scope;
	/** Required for `scope: "session"` — the session file path. */
	sessionFile?: string;
	/** Base dir for `cwd`/`global` scopes. Defaults to {@link defaultAgentDir}. */
	agentDir?: string;
	/** Cwd to key on for `scope: "cwd"`. Defaults to `process.cwd()`. */
	cwd?: string;
}

/**
 * Pure path function for a session-scoped sidecar.
 *
 * The sidecar lives beside the session file as `<sessionFile>.prompt-stash.json`.
 * @throws if no session file is provided.
 */
export function sessionPath(sessionFile: string): string {
	if (!sessionFile || typeof sessionFile !== "string") {
		throw new Error("sessionPath: a session file path is required");
	}
	return `${sessionFile}.prompt-stash.json`;
}

/** SHA-256 hex digest of a canonical (realpath-resolved) cwd. */
export function cwdKey(cwd: string): string {
	return createHash("sha256").update(cwd, "utf8").digest("hex");
}

/** Path of the cwd-scoped sidecar under `agentDir/prompt-stash/cwd/`. */
export function cwdPath(agentDir: string, canonicalCwd: string): string {
	return join(agentDir, STASH_DIR, "cwd", `${cwdKey(canonicalCwd)}.json`);
}

/** Path of the global sidecar `agentDir/prompt-stash/global.json`. */
export function globalPath(agentDir: string): string {
	return join(agentDir, STASH_DIR, "global.json");
}

/**
 * Resolve the sidecar path for a given scope.
 *
 * cwd is canonicalized with `fs.realpath` before keying, so this is async.
 */
export async function paths(options: PathsOptions): Promise<string> {
	const scope = options.scope;
	switch (scope) {
		case "session": {
			return sessionPath(options.sessionFile ?? "");
		}
		case "cwd": {
			const agentDir = options.agentDir ?? defaultAgentDir();
			const cwd = options.cwd ?? process.cwd();
			return cwdPath(agentDir, await realpathSafe(cwd));
		}
		case "global": {
			return globalPath(options.agentDir ?? defaultAgentDir());
		}
		default: {
			throw new Error(`paths: unknown scope "${String(scope)}"`);
		}
	}
}

/** Resolve aliases before deriving the cwd scope key. */
async function realpathSafe(p: string): Promise<string> {
	// The cwd is only hashed, never written into. Aliases share its canonical scope.
	return resolve(await realpath(p));
}

/* ------------------------------------------------------------------ */
/* Path safety                                                        */
/* ------------------------------------------------------------------ */

/**
 * Assert the final path (and its immediate parent) are not symlinks, so we
 * never write through, clobber, or delete via a link. Throws on violation.
 */
async function assertNotSymlink(path: string, purpose: string): Promise<void> {
	try {
		const st = await lstat(path);
		if (st.isSymbolicLink()) {
			throw new Error(`${purpose}: refusing to use a symlink path: ${path}`);
		}
	} catch (err) {
		const e = err as NodeJS.ErrnoException;
		if (e.code !== "ENOENT") throw err;
	}
	const parent = dirname(path);
	try {
		const st = await lstat(parent);
		if (st.isSymbolicLink()) {
			throw new Error(`${purpose}: refusing to use a symlinked parent directory: ${parent}`);
		}
	} catch (err) {
		const e = err as NodeJS.ErrnoException;
		if (e.code !== "ENOENT") throw err;
	}
}

/** Create the parent directory tree with private (0700) permissions. */
async function ensurePrivateDir(dir: string): Promise<void> {
	await mkdir(dir, { recursive: true, mode: 0o700 });
}

/** A lock held on the data file (an exclusive `<path>.lock` directory). */
class Lock {
	#lockPath: string;
	#held = false;

	constructor(dataPath: string) {
		this.#lockPath = `${dataPath}.lock`;
	}

	get held(): boolean {
		return this.#held;
	}

	/** Acquire the lock. Fails fast (throws) if the lock is already held. */
	async acquire(): Promise<void> {
		await assertNotSymlink(this.#lockPath, "stash:lock");
		await ensurePrivateDir(dirname(this.#lockPath));
		try {
			await mkdir(this.#lockPath, { mode: 0o700 });
		} catch (err) {
			const e = err as NodeJS.ErrnoException;
			if (e.code === "EEXIST") {
				throw new Error(`stash: another process holds the lock for ${dirname(this.#lockPath)}`);
			}
			throw err;
		}
		this.#held = true;
	}

	/** Release the lock. Best-effort; safe to call when not held. */
	async release(): Promise<void> {
		if (!this.#held) return;
		this.#held = false;
		await rmdir(this.#lockPath).catch(() => {});
	}
}

/** Run `fn` while holding an exclusive lock on `dataPath`; release afterwards. */
async function withLock<T>(dataPath: string, fn: () => Promise<T>): Promise<T> {
	const lock = new Lock(dataPath);
	await lock.acquire();
	try {
		return await fn();
	} finally {
		await lock.release();
	}
}

/* ------------------------------------------------------------------ */
/* Read                                                               */
/* ------------------------------------------------------------------ */

/** An empty, valid document. */
export function emptyDocument(): StashDocument {
	return { version: DOCUMENT_VERSION, entries: [], commands: [] };
}

/** Serialize a document to a JSON string (pretty for stable sidecars). */
export function serialize(doc: StashDocument): string {
	return JSON.stringify(doc, null, 2);
}

/**
 * Validate a parsed document shape and bounds. Throws on any violation
 * (fail closed). Returns the document when valid.
 */
export function validateDocument(doc: unknown): StashDocument {
	if (typeof doc !== "object" || doc === null) {
		throw new Error("stash: document is not an object");
	}
	const d = doc as Record<string, unknown>;
	if (d.version !== DOCUMENT_VERSION) {
		throw new Error(`stash: unsupported document version ${String(d.version)}`);
	}
	const entries = d.entries;
	const commands = d.commands;
	if (!Array.isArray(entries) || !Array.isArray(commands)) {
		throw new Error("stash: document must have entries[] and commands[] arrays");
	}
	if (entries.length + commands.length > MAX_ENTRIES) throw new Error("stash: document exceeds MAX_ENTRIES");
	const ids = new Set<string>();
	const names = new Set<string>();
	for (const raw of entries) {
		if (typeof raw !== "object" || raw === null) {
			throw new Error("stash: non-object entry");
		}
		const item = raw as StashItem;
		if (typeof item.id !== "string" || item.id.length === 0) {
			throw new Error("stash: entry missing opaque id");
		}
		if (ids.has(item.id)) throw new Error("stash: duplicate id");
		ids.add(item.id);
		if (typeof item.text !== "string") {
			throw new Error("stash: entry text must be a string");
		}
		if (Buffer.byteLength(item.text, "utf8") > MAX_ITEM_TEXT) {
			throw new Error("stash: entry text exceeds MAX_ITEM_TEXT");
		}
		if (typeof item.createdAt !== "string") {
			throw new Error("stash: entry missing createdAt");
		}
		if (item.label !== undefined && typeof item.label !== "string") {
			throw new Error("stash: entry label must be a string");
		}
		if (item.source !== undefined) {
			if (typeof item.source !== "object" || item.source === null) {
				throw new Error("stash: entry source must be an object");
			}
			const s = item.source as Record<string, unknown>;
			for (const k of ["sessionId", "entryId", "sessionFile"] as const) {
				if (s[k] !== undefined && typeof s[k] !== "string") {
					throw new Error(`stash: entry source.${k} must be a string`);
				}
			}
		}
	}
	for (const raw of commands) {
		if (typeof raw !== "object" || raw === null) {
			throw new Error("stash: non-object command");
		}
		const cmd = raw as StashCommand;
		if (typeof cmd.id !== "string" || cmd.id.length === 0) {
			throw new Error("stash: command missing opaque id");
		}
		if (ids.has(cmd.id)) throw new Error("stash: duplicate id");
		ids.add(cmd.id);
		if (typeof cmd.name !== "string" || cmd.name.trim().length === 0) {
			throw new Error("stash: command missing name");
		}
		if (names.has(cmd.name)) throw new Error("stash: duplicate command name");
		names.add(cmd.name);
		if (typeof cmd.text !== "string") {
			throw new Error("stash: command text must be a string");
		}
		if (Buffer.byteLength(cmd.text, "utf8") > MAX_ITEM_TEXT) {
			throw new Error("stash: command text exceeds MAX_ITEM_TEXT");
		}
		if (typeof cmd.createdAt !== "string") {
			throw new Error("stash: command missing createdAt");
		}
	}
	if (entries.length + commands.length > MAX_ENTRIES) {
		throw new Error("stash: document exceeds MAX_ENTRIES");
	}
	return d as unknown as StashDocument;
}

/**
 * Read and validate a document from disk.
 *
 * Fail closed: a missing file yields an empty document; a malformed or
 * out-of-bounds document throws (it is never returned partial and never
 * overwritten by subsequent writes).
 */
export async function readStore(path: string): Promise<StashDocument> {
	await assertNotSymlink(path, "stash:read");
	let raw: string;
	try {
		const fh = await open(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
		try {
			const st = await fh.stat();
			if (!st.isFile()) throw new Error("stash: document must be a regular file");
			if (st.size > MAX_DOC_BYTES) throw new Error("stash: document exceeds MAX_DOC_BYTES");
			const buffer = Buffer.alloc(MAX_DOC_BYTES + 1);
			let offset = 0;
			while (offset < buffer.length) {
				const { bytesRead } = await fh.read(buffer, offset, buffer.length - offset, null);
				if (!bytesRead) break;
				offset += bytesRead;
			}
			if (offset > MAX_DOC_BYTES) throw new Error("stash: document exceeds MAX_DOC_BYTES");
			raw = buffer.subarray(0, offset).toString("utf8");
		} finally {
			await fh.close();
		}
	} catch (err) {
		const e = err as NodeJS.ErrnoException;
		if (e.code === "ENOENT") return emptyDocument();
		throw err;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("stash: document is not valid JSON");
	}
	return validateDocument(parsed);
}

/** Convenience: list only the stash entries of a sidecar. */
export async function list(path: string): Promise<StashItem[]> {
	return (await readStore(path)).entries;
}

/** Convenience: list only the command records of a sidecar. */
export async function listCommands(path: string): Promise<StashCommand[]> {
	return (await readStore(path)).commands;
}

/* ------------------------------------------------------------------ */
/* Write                                                              */
/* ------------------------------------------------------------------ */

/** Atomically write `doc` to `path` (temp file + fsync + rename, 0600). */
async function writeDoc(path: string, doc: StashDocument): Promise<void> {
	// Fail closed: refuse to persist an invalid or over-bounds document.
	validateDocument(doc);
	const serialized = serialize(doc);
	if (Buffer.byteLength(serialized, "utf8") > MAX_DOC_BYTES) {
		throw new Error("stash: document exceeds MAX_DOC_BYTES");
	}
	await assertNotSymlink(path, "stash:write");
	const dir = dirname(path);
	await ensurePrivateDir(dir);
	// If the destination already exists it must be a regular file (not a
	// directory or symlink), otherwise an atomic rename would clobber it.
	try {
		const st = await lstat(path);
		if (st.isSymbolicLink()) {
			throw new Error("stash:write: refusing to clobber a symlink");
		}
		if (st.isDirectory()) {
			throw new Error("stash:write: refusing to clobber a directory");
		}
	} catch (err) {
		const e = err as NodeJS.ErrnoException;
		if (e.code !== "ENOENT") throw err;
	}

	const tmp = join(dir, `.${randomUUID()}.tmp`);
	try {
		const fh = await open(tmp, "wx", 0o600);
		try {
			await fh.writeFile(serialized, "utf8");
			await fh.sync();
		} finally {
			await fh.close();
		}
		await rename(tmp, path);
		// fsync the parent directory so the rename is durable.
		const dirFh = await open(dir, "r");
		try {
			await dirFh.sync();
		} finally {
			await dirFh.close();
		}
	} catch (err) {
		// Clean up the temp file on any rename failure.
		await unlink(tmp).catch(() => {});
		throw err;
	}
}

/** Input for {@link addItems}. */
export interface AddInput {
	text: string;
	label?: string;
	source?: StashSource;
}

/**
 * Append stash items to the sidecar at `path`. Returns the created items.
 *
 * Fails closed: if the existing document is malformed or over-bounds, the
 * write aborts and the original file is left untouched.
 */
export async function addItems(path: string, inputs: AddInput[]): Promise<StashItem[]> {
	return withLock(path, async () => {
		const doc = await readStore(path);
		const created: StashItem[] = [];
		for (const input of inputs) {
			if (Buffer.byteLength(input.text, "utf8") > MAX_ITEM_TEXT) {
				throw new Error("stash: item text exceeds MAX_ITEM_TEXT");
			}
			const item: StashItem = { id: randomUUID(), text: input.text, createdAt: new Date().toISOString() };
			if (input.label !== undefined) item.label = input.label;
			if (input.source !== undefined) item.source = input.source;
			created.push(item);
		}
		const entries = [...doc.entries, ...created];
		await writeDoc(path, { version: DOCUMENT_VERSION, entries, commands: doc.commands });
		return created;
	});
}

/**
 * Remove stash items by id. Returns the removed items. Unknown ids are
 * ignored. Fails closed on malformed documents.
 */
export async function removeItems(path: string, ids: string[]): Promise<StashItem[]> {
	return withLock(path, async () => {
		const doc = await readStore(path);
		const drop = new Set(ids);
		const removed = doc.entries.filter((e) => drop.has(e.id));
		const entries = doc.entries.filter((e) => !drop.has(e.id));
		await writeDoc(path, { version: DOCUMENT_VERSION, entries, commands: doc.commands });
		return removed;
	});
}

/** Options for {@link saveCommand}. */
export interface SaveCommandOptions {
	/** When true, replace any existing command with the same name. */
	overwrite?: boolean;
}

/**
 * Save (or, with `overwrite`, replace) a command record in the sidecar.
 * Returns the saved record. Fails closed on malformed documents or a name
 * conflict when `overwrite` is not set.
 */
export async function saveCommand(
	path: string,
	name: string,
	text: string,
	options: SaveCommandOptions = {}
): Promise<StashCommand> {
	return withLock(path, async () => {
		const doc = await readStore(path);
		if (Buffer.byteLength(text, "utf8") > MAX_ITEM_TEXT) {
			throw new Error("stash: command text exceeds MAX_ITEM_TEXT");
		}
		if (!name || name.trim().length === 0) {
			throw new Error("stash: command name is required");
		}
		const existing = doc.commands.some((c) => c.name === name);
		if (existing && !options.overwrite) {
			throw new Error(`stash: command "${name}" already exists`);
		}
		const created: StashCommand = { id: randomUUID(), name, text, createdAt: new Date().toISOString() };
		const commands = existing ? [...doc.commands.filter((c) => c.name !== name), created] : [...doc.commands, created];
		await writeDoc(path, { version: DOCUMENT_VERSION, entries: doc.entries, commands });
		return created;
	});
}
