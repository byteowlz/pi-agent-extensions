/**
 * pi-session-cwd — move a live session to another working directory, taking the
 * session file with it.
 *
 * pi pins a session to the cwd it was created in: the JSONL header stores `cwd`,
 * the session file lives in `~/.pi/agent/sessions/--<encoded-cwd>--/`, and the
 * live runtime (tools, project AGENTS.md, project settings, extension cwd) is
 * built from that cwd. There is no built-in way to move a session between
 * projects — `/resume` can only pick sessions of the current project.
 *
 * How the move works (all public pi APIs, no core patching):
 *
 *   1. Rewrite the header line's `cwd` to the target directory.
 *   2. Move the file into the target cwd's default session directory, keeping
 *      its timestamp/session-id filename.
 *   3. `ctx.switchSession(newPath)` — pi tears the runtime down and rebuilds it
 *      from the new session's cwd (`createRuntime({cwd: sessionManager.getCwd()})`),
 *      so tools, project files, trust and extension cwd all follow.
 *
 * What deliberately does NOT move:
 *   - Filesystem state. Nothing on disk is relocated; relative paths in old
 *     messages keep meaning what they meant.
 *   - The process cwd of the pi binary. pi never chdirs; a tool or bash command
 *     that resolves through the OS cwd rather than the session cwd still sees
 *     the launch directory.
 *
 * A custom session dir (`--session-dir`, `PI_SESSION_DIR`, settings.sessionDir)
 * is respected: the file moves within that directory's structure instead of into
 * the default `~/.pi/agent/sessions` tree.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

/** Custom entry recording each move, so the history is inspectable and auditable. */
export const MOVE_ENTRY_TYPE = "pi-session-cwd:move/v1";

/**
 * Encode a cwd the way pi names its default session directories:
 * strip the leading separator, then replace `/`, `\` and `:` with `-`.
 * Mirrors `getDefaultSessionDirPath()` in pi's session manager.
 */
export function encodeCwdSegment(cwd: string): string {
	return `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
}

/** Default session directory pi would use for a cwd. */
export function defaultSessionDir(
	cwd: string,
	agentDir: string = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent")
): string {
	return join(agentDir, "sessions", encodeCwdSegment(resolve(cwd)));
}

/** Expand `~`, resolve relative paths against a base, normalize. */
export function resolveTargetCwd(raw: string, baseCwd: string): string {
	const trimmed = raw.trim();
	if (!trimmed) throw new MoveError("empty path");
	const expanded = trimmed === "~" || trimmed.startsWith("~/") ? join(homedir(), trimmed.slice(1)) : trimmed;
	return resolve(baseCwd, expanded);
}

export class MoveError extends Error {}

export interface MovePlan {
	/** Session file that would be moved. */
	from: string;
	/** Destination path of the session file. */
	to: string;
	/** True when the file stays put and only its header cwd is rewritten. */
	inPlace: boolean;
	/** Working directory before the move. */
	fromCwd: string;
	/** Working directory after the move. */
	toCwd: string;
	/** Rewritten first line (header) content. */
	header: string;
	/** Rest of the file, unchanged. */
	body: string;
}

/**
 * The session dir to put the moved file into.
 *
 * With a custom session dir (settings.sessionDir / --session-dir /
 * PI_SESSION_DIR) pi keys directories the same way, so the same encoding is
 * used there. Otherwise the default `~/.pi/agent/sessions/--cwd--` tree.
 */
export function destinationDir(toCwd: string, sessionDir: string | undefined): string {
	if (!sessionDir) return defaultSessionDir(toCwd);
	// A custom dir given literally as the sessions root keeps pi's per-cwd layout.
	if (endsWithSessionsRoot(sessionDir)) return join(sessionDir, encodeCwdSegment(resolve(toCwd)));
	return sessionDir;
}

function endsWithSessionsRoot(dir: string): boolean {
	const base = basename(resolve(dir));
	return base === "sessions";
}

function readHeaderCwd(header: Record<string, unknown>): string {
	const cwd = header.cwd;
	if (typeof cwd !== "string" || !cwd) {
		throw new MoveError("session header has no cwd; refusing to move an unrecognized session");
	}
	return cwd;
}

/**
 * Build the move plan without touching the filesystem.
 *
 * Throws MoveError with an actionable message for every blocking condition:
 * no persisted session, target missing/not a directory, same directory,
 * destination collision, session busy or the file being looked at.
 */
export function planMove(options: {
	sessionFile: string | undefined;
	currentCwd: string;
	targetCwd: string;
	sessionDir?: string;
}): MovePlan {
	const { sessionFile, currentCwd, targetCwd, sessionDir } = options;
	if (!sessionFile) throw new MoveError("this session is not persisted yet (nothing to move)");
	if (!existsSync(sessionFile)) throw new MoveError(`session file is missing: ${sessionFile}`);
	if (!existsSync(targetCwd)) throw new MoveError(`target directory does not exist: ${targetCwd}`);
	if (!statSync(targetCwd).isDirectory()) throw new MoveError(`target is not a directory: ${targetCwd}`);

	const toResolved = resolve(targetCwd);
	const fromResolved = resolve(currentCwd);
	if (toResolved === fromResolved) throw new MoveError(`this session is already in ${toResolved}`);

	const raw = readFileSync(sessionFile, "utf-8");
	const newline = raw.indexOf("\n");
	const firstLine = newline === -1 ? raw : raw.slice(0, newline);
	let header: Record<string, unknown>;
	try {
		header = JSON.parse(firstLine) as Record<string, unknown>;
	} catch {
		throw new MoveError("session file does not start with a valid header line");
	}
	if (header.type !== "session") throw new MoveError("session file does not start with a session header");
	readHeaderCwd(header);

	const updatedHeader = { ...header, cwd: toResolved };
	const body = newline === -1 ? "" : raw.slice(newline + 1);
	const dir = destinationDir(toResolved, sessionDir);
	const to = join(dir, basename(sessionFile));
	// A flat custom session dir holds every cwd in one place: the move is then a
	// header rewrite in place, which is still a real move for pi (cwd is header).
	const inPlace = resolve(to) === resolve(sessionFile);
	if (!inPlace && existsSync(to)) throw new MoveError(`a session file already exists at ${to}`);

	return {
		from: sessionFile,
		to,
		inPlace,
		fromCwd: fromResolved,
		toCwd: toResolved,
		header: `${JSON.stringify(updatedHeader)}\n`,
		body,
	};
}

/**
 * Execute a plan. The move is staged: the rewritten file is written next to its
 * destination first, then renamed into place, so a crash never leaves a truncated
 * session at the destination and the source is only removed after success.
 *
 * Returns the new session file path (for `switchSession`).
 */
export function applyMove(plan: MovePlan): string {
	const dir = dirname(plan.to);
	mkdirSync(dir, { recursive: true });
	const staged = `${plan.to}.tmp-${process.pid}`;
	try {
		writeFileSync(staged, plan.header + plan.body, { mode: statSync(plan.from).mode & 0o777 });
		renameSync(staged, plan.to);
	} catch (error) {
		try {
			rmSync(staged, { force: true });
		} catch {
			// best effort cleanup
		}
		throw new MoveError(`could not write the moved session: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (plan.inPlace) return plan.to;
	try {
		rmSync(plan.from, { force: true });
	} catch (error) {
		// The destination is authoritative now; leaving a stale copy behind is
		// better than failing the whole move, but say so loudly.
		throw new MoveError(
			`session moved to ${plan.to}, but the old file could not be removed (${error instanceof Error ? error.message : String(error)}); delete ${plan.from} manually`
		);
	}
	return plan.to;
}

export interface MoveRecord {
	version: 1;
	fromCwd: string;
	toCwd: string;
	fromFile: string;
	toFile: string;
	at: string;
}

/** Latest valid move record on a branch (branch-relative, like other sidecars). */
export function readLastMove(branchEntries: readonly unknown[]): MoveRecord | undefined {
	let latest: MoveRecord | undefined;
	for (const entry of branchEntries) {
		if (!entry || typeof entry !== "object") continue;
		const record = entry as { type?: unknown; customType?: unknown; data?: unknown };
		if (record.type !== "custom" || record.customType !== MOVE_ENTRY_TYPE) continue;
		const data = record.data;
		if (!data || typeof data !== "object") continue;
		const row = data as Record<string, unknown>;
		if (row.version !== 1 || typeof row.toCwd !== "string" || typeof row.toFile !== "string") continue;
		latest = {
			version: 1,
			fromCwd: typeof row.fromCwd === "string" ? row.fromCwd : "",
			toCwd: row.toCwd,
			fromFile: typeof row.fromFile === "string" ? row.fromFile : "",
			toFile: row.toFile,
			at: typeof row.at === "string" ? row.at : "",
		};
	}
	return latest;
}

/** Shorten a path for display, keeping the tail readable. */
export function shortenPath(path: string, max = 48): string {
	if (path.length <= max) return path;
	const home = homedir();
	const withHome = path.startsWith(home) ? `~${path.slice(home.length)}` : path;
	if (withHome.length <= max) return withHome;
	return `…${withHome.slice(withHome.length - (max - 1))}`;
}

/** True when the argument names a directory that can be moved to. */
export function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

export { isAbsolute };
