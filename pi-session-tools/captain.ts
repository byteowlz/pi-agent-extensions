/**
 * Project captain: one designated session per project (= working directory) that
 * owns intake and leads board/routing work for that project.
 *
 * Design rules
 *  - Advisory, not enforced. A claim is a visible designation with liveness
 *    evidence; nothing is locked. (Exclusive ownership already exists for input
 *    in pi-tui-rpc's lease; duplicating that here would fight it.)
 *  - Project identity is the session cwd, the same key pi uses for its session
 *    directories, so a claim survives resume/reload and follows `/cwd`.
 *  - Stale claims are detected, never trusted: a claim naming a dead pane or a
 *    session file that no longer exists is reported as stale, not as captain.
 *  - This module is pure/filesystem-only (no pi imports) so it is unit-testable.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** Branch entry recording a claim handover, so history is inspectable. */
export const CAPTAIN_ENTRY_TYPE = "pi-session-tools:captain/v1";

export interface CaptainClaim {
	version: 1;
	/** Project working directory (the claim key). */
	project: string;
	/** Session that holds the captain designation. */
	sessionId: string;
	sessionFile?: string;
	/** herdr pane that hosts the captain, when known (liveness evidence). */
	paneId?: string;
	/** Optional human label ("captain"). */
	label?: string;
	at: string;
}

/** A session visible in the current project, as discovered from herdr. */
export interface ProjectSession {
	paneId: string;
	cwd: string;
	/** Session file path when herdr knows it. */
	sessionFile?: string;
	label?: string;
	state?: string;
}

/**
 * Encode a project cwd the way pi names its session directories
 * (`--<path-with-separators-as-dashes>--`), so claim files sort next to
 * sessions and the same encoding rules apply.
 */
export function encodeProject(project: string): string {
	const resolved = path.resolve(project);
	return `--${resolved.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
}

export function captainDir(
	agentDir: string = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent")
): string {
	return path.join(agentDir, "captain");
}

export function claimPath(project: string, agentDir?: string): string {
	// A cwd that encodes to nothing (root "/") still needs a filename.
	const encoded = encodeProject(project).replace(/^-+$/, "--root--");
	return path.join(captainDir(agentDir), `${encoded}.json`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Parse a claim file's JSON into a claim, or undefined when malformed. */
export function parseClaim(raw: unknown): CaptainClaim | undefined {
	if (!isRecord(raw)) return undefined;
	const { version, project, sessionId } = raw;
	if (version !== 1 || typeof project !== "string" || !project) return undefined;
	if (typeof sessionId !== "string" || !sessionId) return undefined;
	const claim: CaptainClaim = {
		version: 1,
		project,
		sessionId,
		at: typeof raw.at === "string" ? raw.at : "",
	};
	if (typeof raw.sessionFile === "string" && raw.sessionFile) claim.sessionFile = raw.sessionFile;
	if (typeof raw.paneId === "string" && raw.paneId) claim.paneId = raw.paneId;
	if (typeof raw.label === "string" && raw.label) claim.label = raw.label;
	return claim;
}

/** Read the claim for a project. Missing/malformed files read as "no captain". */
export function readClaim(project: string, agentDir?: string): CaptainClaim | undefined {
	try {
		return parseClaim(JSON.parse(fs.readFileSync(claimPath(project, agentDir), "utf-8")));
	} catch {
		return undefined;
	}
}

/** Write a claim atomically (tmp + rename) so a crash cannot leave half a claim. */
export function writeClaim(claim: CaptainClaim, agentDir?: string): string {
	const file = claimPath(claim.project, agentDir);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const staged = `${file}.tmp-${process.pid}`;
	fs.writeFileSync(staged, `${JSON.stringify(claim, null, 2)}\n`);
	fs.renameSync(staged, file);
	return file;
}

/** Remove the claim for a project; returns true when a file was removed. */
export function clearClaim(project: string, agentDir?: string): boolean {
	try {
		fs.rmSync(claimPath(project, agentDir), { force: false });
		return true;
	} catch {
		return false;
	}
}

export interface ClaimVerdict {
	claim: CaptainClaim;
	/** "live" only with positive liveness evidence. */
	status: "live" | "stale" | "unknown";
	reason: string;
}

/**
 * Judge a claim's liveness from evidence the caller already has (herdr panes and
 * the filesystem). A claim is:
 *  - live    when its pane is in the live pane list, or (no pane id) its session
 *            file exists and is not clearly abandoned;
 *  - stale   when its pane id is set but missing from the list, or its session
 *            file is named and absent;
 *  - unknown when there is no evidence either way (e.g. herdr not available).
 */
export function judgeClaim(claim: CaptainClaim, livePanes: string[] | undefined): ClaimVerdict {
	if (livePanes && claim.paneId) {
		return livePanes.includes(claim.paneId)
			? { claim, status: "live", reason: `pane ${claim.paneId} is running` }
			: { claim, status: "stale", reason: `pane ${claim.paneId} is gone` };
	}
	if (claim.sessionFile) {
		return fs.existsSync(claim.sessionFile)
			? { claim, status: livePanes ? "live" : "unknown", reason: "session file exists" }
			: { claim, status: "stale", reason: "session file is gone" };
	}
	return { claim, status: "unknown", reason: "no pane or session file to verify" };
}

/** Sessions herdr reports inside a project, excluding the caller's own pane. */
export function projectSessions(panes: ProjectSession[], project: string, selfPane?: string): ProjectSession[] {
	const resolved = path.resolve(project);
	return panes
		.filter((pane) => pane.paneId && pane.paneId !== selfPane)
		.filter((pane) => typeof pane.cwd === "string" && path.resolve(pane.cwd) === resolved)
		.sort((a, b) => (a.label ?? a.paneId).localeCompare(b.label ?? b.paneId));
}

/** Normalize a `herdr agent list` envelope into ProjectSession records. */
export function parseAgentList(envelope: unknown): ProjectSession[] {
	const agents = isRecord(envelope) && isRecord(envelope.result) ? envelope.result.agents : undefined;
	if (!Array.isArray(agents)) return [];
	const out: ProjectSession[] = [];
	for (const agent of agents) {
		if (!isRecord(agent)) continue;
		const paneId = agent.pane_id;
		if (typeof paneId !== "string" || !paneId) continue;
		const session = agent.agent_session;
		const sessionFile =
			isRecord(session) && session.kind === "path" && typeof session.value === "string" ? session.value : undefined;
		const raw = agent.tab_label ?? agent.terminal_title_stripped ?? agent.cwd;
		const label = typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
		const record: ProjectSession = {
			paneId,
			cwd: typeof agent.cwd === "string" ? agent.cwd : "",
		};
		if (sessionFile) record.sessionFile = sessionFile;
		if (label) record.label = label;
		if (typeof agent.agent_status === "string") record.state = agent.agent_status;
		out.push(record);
	}
	return out;
}

/** One-line status line, used for the footer and for `/captain` output. */
export function formatCaptainLine(project: string, claim: CaptainClaim | undefined, verdict?: ClaimVerdict): string {
	const base = path.basename(path.resolve(project)) || project;
	if (!claim) return `${base}: no captain`;
	if (verdict?.status === "stale") return `${base}: captain stale (${verdict.reason})`;
	if (!verdict || verdict.status === "unknown")
		return `${base}: captain ${claim.label ?? claim.sessionId.slice(0, 8)} (unverified)`;
	return `${base}: captain ${claim.label ?? claim.sessionId.slice(0, 8)}`;
}

/** Human-readable `/captain` status block. */
export function formatCaptainStatus(options: {
	project: string;
	selfSessionId: string;
	claim?: CaptainClaim;
	verdict?: ClaimVerdict;
	sessions: ProjectSession[];
	backend: string;
}): string {
	const { project, selfSessionId, claim, verdict, sessions, backend } = options;
	const lines = [`project: ${path.resolve(project)}`, `backend: ${backend}`];
	if (!claim) {
		lines.push("captain: none claimed");
	} else {
		const who = claim.sessionId === selfSessionId ? "this session" : claim.sessionId.slice(0, 8);
		lines.push(
			`captain: ${claim.label ?? "unlabelled"} (${who}) — ${verdict?.status ?? "unknown"}${verdict ? `: ${verdict.reason}` : ""}`
		);
		if (claim.at) lines.push(`claimed: ${claim.at.slice(0, 16).replace("T", " ")}`);
		if (claim.paneId) lines.push(`pane: ${claim.paneId}`);
	}
	if (sessions.length === 0) {
		lines.push("other sessions in this project: none visible");
	} else {
		lines.push("other sessions in this project:");
		for (const session of sessions) {
			const who = session.paneId === claim?.paneId ? " ← captain" : "";
			const label = session.label ?? "(unlabelled)";
			lines.push(`  ${session.paneId}  ${label}${session.state ? `  [${session.state}]` : ""}${who}`);
		}
	}
	lines.push("", "claim: /captain claim [label] · release: /captain release · intake: /captain route <text>");
	return lines.join("\n");
}

/** Latest claim entry on a branch (branch-relative, survives resume and /cwd). */
export function readCaptainEntry(branchEntries: readonly unknown[]): CaptainClaim | undefined {
	let latest: CaptainClaim | undefined;
	for (const entry of branchEntries) {
		if (!isRecord(entry) || entry.type !== "custom" || entry.customType !== CAPTAIN_ENTRY_TYPE) continue;
		const claim = parseClaim(entry.data);
		if (claim) latest = claim;
	}
	return latest;
}

/** Compact, probe-free captain summary for introspection/status consumers. */
export interface CaptainSummary {
	project: string;
	claimed: boolean;
	/** True when this session holds the claim. */
	self: boolean;
	label?: string;
	sessionId?: string;
	at?: string;
}

export function summarizeCaptain(project: string, selfSessionId: string, agentDir?: string): CaptainSummary {
	const claim = readClaim(project, agentDir);
	if (!claim) return { project: path.resolve(project), claimed: false, self: false };
	const summary: CaptainSummary = {
		project: path.resolve(project),
		claimed: true,
		self: claim.sessionId === selfSessionId,
		sessionId: claim.sessionId,
	};
	if (claim.label) summary.label = claim.label;
	if (claim.at) summary.at = claim.at;
	return summary;
}

// ---------------------------------------------------------------------------
// Captain actions: scheduled prompts the captain runs in its own session.
//
// Actions are stored PER PROJECT, not per session, so they survive a captain
// handover: whoever holds the claim adopts the project's standing actions.
// The standalone scheduler below is intentionally small (in-session timers).
// `skdlrExportCommand` is the seam for headless scheduling: a skdlr run is a
// separate `pi -p` invocation, which cannot share this session's live state
// (compaction, queue) — so delegation is opt-in per action, never implicit.
// ---------------------------------------------------------------------------

export interface CaptainAction {
	/** Stable id, also usable on the command line. */
	id: string;
	/** Prompt delivered to the captain session when the action fires. */
	text: string;
	intervalMs: number;
	enabled: boolean;
	createdAt: string;
	lastRunAt?: string;
	/** Optional display label; defaults to the text. */
	label?: string;
}

export interface ActionStore {
	version: 1;
	actions: CaptainAction[];
	updatedAt?: string;
}

const INTERVAL_UNITS: Record<string, number> = {
	ms: 1,
	s: 1000,
	sec: 1000,
	secs: 1000,
	second: 1000,
	seconds: 1000,
	m: 60_000,
	min: 60_000,
	mins: 60_000,
	minute: 60_000,
	minutes: 60_000,
	h: 3_600_000,
	hr: 3_600_000,
	hrs: 3_600_000,
	hour: 3_600_000,
	hours: 3_600_000,
	d: 86_400_000,
	day: 86_400_000,
	days: 86_400_000,
	w: 604_800_000,
	week: 604_800_000,
	weeks: 604_800_000,
};

const INTERVAL_ALIASES: Record<string, number> = {
	hourly: 3_600_000,
	daily: 86_400_000,
	weekly: 604_800_000,
};

/** Shortest interval accepted, to keep a stray "1s" from hammering a session. */
export const MIN_INTERVAL_MS = 10_000;

/**
 * Parse "30m", "every 2 hours", "hourly", "1d" into milliseconds.
 * Returns undefined for anything unrecognized, and rejects sub-minimum values
 * with a distinct error marker so the caller can explain the limit.
 */
export function parseInterval(raw: string): { intervalMs: number } | { error: string } {
	const cleaned = raw
		.trim()
		.toLowerCase()
		.replace(/^every\s+/, "");
	if (!cleaned) return { error: "empty interval" };
	const alias = INTERVAL_ALIASES[cleaned];
	if (alias) return { intervalMs: alias };
	const match = /^(\d+(?:\.\d+)?)\s*([a-z]+)$/.exec(cleaned);
	if (!match) return { error: `unrecognized interval "${raw.trim()}" (use e.g. 30m, 2h, 1d, hourly, daily)` };
	const amount = Number.parseFloat(match[1] as string);
	const unit = INTERVAL_UNITS[match[2] as string];
	if (!Number.isFinite(amount) || amount <= 0 || unit === undefined)
		return { error: `unrecognized interval "${raw.trim()}" (use e.g. 30m, 2h, 1d, hourly, daily)` };
	const intervalMs = Math.round(amount * unit);
	if (intervalMs < MIN_INTERVAL_MS) return { error: `interval too short: minimum is ${Math.round(MIN_INTERVAL_MS / 1000)}s` };
	return { intervalMs };
}

/** Compact interval rendering for listings ("30m", "2h", "1d"). */
export function formatInterval(intervalMs: number): string {
	if (intervalMs % 86_400_000 === 0) return `${intervalMs / 86_400_000}d`;
	if (intervalMs % 3_600_000 === 0) return `${intervalMs / 3_600_000}h`;
	if (intervalMs % 60_000 === 0) return `${intervalMs / 60_000}m`;
	return `${Math.round(intervalMs / 1000)}s`;
}

export function actionsPath(project: string, agentDir?: string): string {
	const encoded = encodeProject(project).replace(/^-+$/, "--root--");
	return path.join(captainDir(agentDir), `${encoded}.actions.json`);
}

function parseAction(raw: unknown): CaptainAction | undefined {
	if (!isRecord(raw)) return undefined;
	const { id, text, intervalMs } = raw;
	if (typeof id !== "string" || !id) return undefined;
	if (typeof text !== "string" || !text.trim()) return undefined;
	if (typeof intervalMs !== "number" || !Number.isFinite(intervalMs) || intervalMs <= 0) return undefined;
	const action: CaptainAction = {
		id,
		text,
		intervalMs,
		enabled: raw.enabled !== false,
		createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
	};
	if (typeof raw.lastRunAt === "string" && raw.lastRunAt) action.lastRunAt = raw.lastRunAt;
	if (typeof raw.label === "string" && raw.label.trim()) action.label = raw.label.trim();
	return action;
}

export function readActions(project: string, agentDir?: string): CaptainAction[] {
	try {
		const parsed = JSON.parse(fs.readFileSync(actionsPath(project, agentDir), "utf-8")) as unknown;
		if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.actions)) return [];
		return parsed.actions.map(parseAction).filter((action): action is CaptainAction => action !== undefined);
	} catch {
		return [];
	}
}

export function writeActions(project: string, actions: CaptainAction[], agentDir?: string): string {
	const file = actionsPath(project, agentDir);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const store: ActionStore = { version: 1, actions, updatedAt: new Date().toISOString() };
	const staged = `${file}.tmp-${process.pid}`;
	fs.writeFileSync(staged, `${JSON.stringify(store, null, 2)}\n`);
	fs.renameSync(staged, file);
	return file;
}

/** Deterministic, readable id derived from the action text. */
export function actionId(text: string, existing: readonly CaptainAction[]): string {
	const base =
		text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 24) || "action";
	let id = base;
	let n = 2;
	const taken = new Set(existing.map((action) => action.id));
	while (taken.has(id)) {
		id = `${base}-${n}`;
		n += 1;
	}
	return id;
}

export function addAction(
	project: string,
	input: { text: string; intervalMs: number; label?: string },
	agentDir?: string
): { actions: CaptainAction[]; action: CaptainAction } {
	const text = input.text.trim();
	const actions = readActions(project, agentDir);
	const action: CaptainAction = {
		id: actionId(text, actions),
		text,
		intervalMs: input.intervalMs,
		enabled: true,
		createdAt: new Date().toISOString(),
	};
	if (input.label?.trim()) action.label = input.label.trim();
	const next = [...actions, action];
	writeActions(project, next, agentDir);
	return { actions: next, action };
}

/** Resolve an action by 1-based index, id, or unique prefix. */
export function findAction(actions: readonly CaptainAction[], selector: string): CaptainAction | undefined {
	const value = selector.trim();
	if (!value) return undefined;
	const index = Number.parseInt(value, 10);
	if (Number.isInteger(index) && String(index) === value) return actions[index - 1];
	const exact = actions.find((action) => action.id === value);
	if (exact) return exact;
	const matches = actions.filter((action) => action.id.startsWith(value));
	return matches.length === 1 ? matches[0] : undefined;
}

export function removeAction(
	project: string,
	selector: string,
	agentDir?: string
): { removed?: CaptainAction; actions: CaptainAction[] } {
	const actions = readActions(project, agentDir);
	const target = findAction(actions, selector);
	if (!target) return { actions };
	const next = actions.filter((action) => action.id !== target.id);
	writeActions(project, next, agentDir);
	return { removed: target, actions: next };
}

export function setActionEnabled(
	project: string,
	selector: string,
	enabled: boolean,
	agentDir?: string
): { action?: CaptainAction; actions: CaptainAction[] } {
	const actions = readActions(project, agentDir);
	const target = findAction(actions, selector);
	if (!target) return { actions };
	const next = actions.map((action) => (action.id === target.id ? { ...action, enabled } : action));
	writeActions(project, next, agentDir);
	return { action: { ...target, enabled }, actions: next };
}

/** Record a run on an action (kept in the store so /captain actions shows it). */
export function markActionRun(project: string, actionIdValue: string, at = new Date().toISOString(), agentDir?: string): void {
	const actions = readActions(project, agentDir);
	if (!actions.some((action) => action.id === actionIdValue)) return;
	writeActions(
		project,
		actions.map((action) => (action.id === actionIdValue ? { ...action, lastRunAt: at } : action)),
		agentDir
	);
}

/** Listing for `/captain actions`, with countdown to the next run. */
export function formatActions(actions: readonly CaptainAction[], now = Date.now()): string {
	if (actions.length === 0) return 'no scheduled actions\n  add: /captain schedule hourly "check board"';
	const lines: string[] = [];
	actions.forEach((action, index) => {
		const state = action.enabled ? "" : " (paused)";
		const label = action.label ?? action.text;
		lines.push(`${index + 1}. [${formatInterval(action.intervalMs)}]${state} ${label}`);
		const detail: string[] = [`id ${action.id}`];
		if (action.lastRunAt) {
			const last = Date.parse(action.lastRunAt);
			if (Number.isFinite(last)) {
				const next = last + action.intervalMs;
				if (next > now) detail.push(`next in ${formatDuration(next - now)}`);
				else detail.push("due now");
			}
		} else {
			detail.push(action.enabled ? "starts after claim" : "paused since creation");
		}
		lines.push(`   ${detail.join(" · ")}`);
	});
	return lines.join("\n");
}

/** "4m", "38s", "in 2h" style duration for human display. */
export function formatDuration(ms: number): string {
	const seconds = Math.max(0, Math.round(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
}

/**
 * A skdlr command that reproduces an action headlessly.
 *
 * This spawns a separate `pi -p` run in the project directory: it cannot see
 * this session's live state (compaction, streaming, queued messages) and writes
 * its own session. Use it for work that belongs headless, not as a transparent
 * replacement for the in-session timer.
 */
export function skdlrExportCommand(project: string, action: CaptainAction): string {
	const name = `captain-${path.basename(path.resolve(project)) || "project"}-${action.id}`.toLowerCase();
	const prompt = action.text.replace(/"/g, '\\"');
	return `skdlr add ${shellQuote(name)} --schedule ${shellQuote(formatInterval(action.intervalMs))} --workdir ${shellQuote(path.resolve(project))} --description ${shellQuote(`captain action: ${action.text.slice(0, 80)}`)} --command ${shellQuote(`pi -p "${prompt}"`)}`;
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}
