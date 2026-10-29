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
