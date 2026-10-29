/**
 * pi-schedule — recurring prompts delivered into a live pi session.
 *
 * Two scopes, one engine:
 *
 *   session  (~/.pi/agent/schedule/sessions/<sessionId>.json)
 *     Belongs to this session. Resuming the session re-arms it; a fork gets a
 *     new id and does not inherit it (deliberate: a fork must not double-fire).
 *
 *   project  (~/.pi/agent/schedule/projects/<encoded-cwd>.json)
 *     Belongs to the working directory. Arms in exactly ONE session at a time:
 *     the project captain, when one is claimed. With no claim the schedules are
 *     dormant and say so, rather than firing in every session in the directory.
 *
 * The captain dependency is a READ, not an import: this module reads the claim
 * file that pi-session-tools writes (`~/.pi/agent/captain/<encoded>.json`).
 * A captain extension is therefore optional, and any other ownership mechanism
 * can adopt the same rule.
 *
 * Delivery is a normal user message into the live session (followUp while
 * streaming), so a scheduled check keeps the session's own context — that is
 * the difference from a headless `skdlr`/`pi -p` run, which is offered as an
 * explicit export instead of a silent substitution.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type ScheduleScope = "session" | "project";

export interface ScheduledAction {
	/** Stable id, also usable on the command line. */
	id: string;
	/** Prompt delivered to the session when the action fires. */
	text: string;
	intervalMs: number;
	enabled: boolean;
	createdAt: string;
	lastRunAt?: string;
	/** Optional display label; defaults to the text. */
	label?: string;
	/**
	 * Who fires this action. "session" = this extension's timer (default);
	 * "skdlr" = an external skdlr schedule delivers through the inbox socket.
	 * Exclusive by construction: a linked action never runs its own timer, so a
	 * check can never fire twice.
	 */
	delivery?: "session" | "skdlr";
	/** Set when delivery === "skdlr". */
	skdlr?: { name: string; schedule: string; linkedAt: string };
}

export interface ActionStore {
	version: 1;
	actions: ScheduledAction[];
	updatedAt?: string;
}

/** Shortest interval accepted by the CLI parser, to keep a typo from hammering a session. */
export const MIN_INTERVAL_MS = 10_000;

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

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

/** "30m", "every 2 hours", "hourly", "1d" -> milliseconds. */
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
	if (intervalMs < MIN_INTERVAL_MS) return { error: `interval too short: minimum is ${MIN_INTERVAL_MS / 1000}s` };
	return { intervalMs };
}

export function formatInterval(intervalMs: number): string {
	if (intervalMs < 1000) return `${Math.round(intervalMs)}ms`;
	if (intervalMs % 86_400_000 === 0) return `${intervalMs / 86_400_000}d`;
	if (intervalMs % 3_600_000 === 0) return `${intervalMs / 3_600_000}h`;
	if (intervalMs % 60_000 === 0) return `${intervalMs / 60_000}m`;
	return `${Math.round(intervalMs / 1000)}s`;
}

export function formatDuration(ms: number): string {
	const seconds = Math.max(0, Math.round(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export function agentDirectory(agentDir?: string): string {
	return agentDir ?? process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");
}

export function scheduleDir(agentDir?: string): string {
	return path.join(agentDirectory(agentDir), "schedule");
}

/** Encode a cwd the way pi names session directories (`--<path>--`). */
export function encodeProject(project: string): string {
	const resolved = path.resolve(project);
	return `--${resolved.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
}

/** Where a scope's store lives. Session stores are keyed by session id. */
export function storePath(scope: ScheduleScope, key: string, agentDir?: string): string {
	const safe = key.replace(/[^A-Za-z0-9._-]+/g, "_");
	const file =
		scope === "session"
			? path.join(scheduleDir(agentDir), "sessions", `${safe}.json`)
			: path.join(scheduleDir(agentDir), "projects", `${encodeProject(key).replace(/^-+$/, "--root--")}.json`);
	return file;
}

/** The claim file pi-session-tools writes; read-only here (no import, no coupling). */
export function captainClaimPath(project: string, agentDir?: string): string {
	const encoded = encodeProject(project).replace(/^-+$/, "--root--");
	return path.join(agentDirectory(agentDir), "captain", `${encoded}.json`);
}

/** Session id of the project's captain, when a claim file exists and parses. */
export function readCaptainSessionId(project: string, agentDir?: string): string | undefined {
	try {
		const parsed = JSON.parse(fs.readFileSync(captainClaimPath(project, agentDir), "utf-8")) as unknown;
		if (!isRecord(parsed)) return undefined;
		const sessionId = parsed.sessionId;
		return typeof sessionId === "string" && sessionId ? sessionId : undefined;
	} catch {
		return undefined;
	}
}

export type Ownership = { armed: true; reason: string } | { armed: false; reason: string };

/**
 * Whether project-scoped schedules may run in this session.
 *
 * Armed in the captain session; dormant (not duplicated everywhere) when the
 * project has no captain. Session-scoped schedules are always armed.
 */
export function projectOwnership(project: string, selfSessionId: string, agentDir?: string): Ownership {
	const captain = readCaptainSessionId(project, agentDir);
	if (!captain) return { armed: false, reason: "no captain claimed for this project" };
	if (captain === selfSessionId) return { armed: true, reason: "this session is the project captain" };
	return { armed: false, reason: `captain is another session (${captain.slice(0, 8)})` };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

function parseAction(raw: unknown): ScheduledAction | undefined {
	if (!isRecord(raw)) return undefined;
	const { id, text, intervalMs } = raw;
	if (typeof id !== "string" || !id) return undefined;
	if (typeof text !== "string" || !text.trim()) return undefined;
	if (typeof intervalMs !== "number" || !Number.isFinite(intervalMs) || intervalMs <= 0) return undefined;
	const action: ScheduledAction = {
		id,
		text,
		intervalMs,
		enabled: raw.enabled !== false,
		createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
	};
	if (typeof raw.lastRunAt === "string" && raw.lastRunAt) action.lastRunAt = raw.lastRunAt;
	if (typeof raw.label === "string" && raw.label.trim()) action.label = raw.label.trim();
	if (raw.delivery === "skdlr") action.delivery = "skdlr";
	const linked = raw.skdlr;
	if (isRecord(linked) && typeof linked.name === "string" && linked.name) {
		action.skdlr = {
			name: linked.name,
			schedule: typeof linked.schedule === "string" ? linked.schedule : "",
			linkedAt: typeof linked.linkedAt === "string" ? linked.linkedAt : "",
		};
	}
	return action;
}

export function readActions(scope: ScheduleScope, key: string, agentDir?: string): ScheduledAction[] {
	try {
		const parsed = JSON.parse(fs.readFileSync(storePath(scope, key, agentDir), "utf-8")) as unknown;
		if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.actions)) return [];
		return parsed.actions.map(parseAction).filter((action): action is ScheduledAction => action !== undefined);
	} catch {
		return [];
	}
}

export function writeActions(scope: ScheduleScope, key: string, actions: ScheduledAction[], agentDir?: string): string {
	const file = storePath(scope, key, agentDir);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const store: ActionStore = { version: 1, actions, updatedAt: new Date().toISOString() };
	const staged = `${file}.tmp-${process.pid}`;
	fs.writeFileSync(staged, `${JSON.stringify(store, null, 2)}\n`);
	fs.renameSync(staged, file);
	return file;
}

/** Deterministic, readable id derived from the prompt text. */
export function actionId(text: string, existing: readonly ScheduledAction[]): string {
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
	scope: ScheduleScope,
	key: string,
	input: { text: string; intervalMs: number; label?: string },
	agentDir?: string
): { actions: ScheduledAction[]; action: ScheduledAction } {
	const text = input.text.trim();
	const actions = readActions(scope, key, agentDir);
	const action: ScheduledAction = {
		id: actionId(text, actions),
		text,
		intervalMs: input.intervalMs,
		enabled: true,
		createdAt: new Date().toISOString(),
	};
	if (input.label?.trim()) action.label = input.label.trim();
	const next = [...actions, action];
	writeActions(scope, key, next, agentDir);
	return { actions: next, action };
}

/** Resolve by 1-based index, exact id, or unique id prefix. */
export function findAction(actions: readonly ScheduledAction[], selector: string): ScheduledAction | undefined {
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
	scope: ScheduleScope,
	key: string,
	selector: string,
	agentDir?: string
): { removed?: ScheduledAction; actions: ScheduledAction[] } {
	const actions = readActions(scope, key, agentDir);
	const target = findAction(actions, selector);
	if (!target) return { actions };
	const next = actions.filter((action) => action.id !== target.id);
	writeActions(scope, key, next, agentDir);
	return { removed: target, actions: next };
}

export function setActionEnabled(
	scope: ScheduleScope,
	key: string,
	selector: string,
	enabled: boolean,
	agentDir?: string
): { action?: ScheduledAction; actions: ScheduledAction[] } {
	const actions = readActions(scope, key, agentDir);
	const target = findAction(actions, selector);
	if (!target) return { actions };
	const next = actions.map((action) => (action.id === target.id ? { ...action, enabled } : action));
	writeActions(scope, key, next, agentDir);
	return { action: { ...target, enabled }, actions: next };
}

export function markActionRun(
	scope: ScheduleScope,
	key: string,
	id: string,
	at = new Date().toISOString(),
	agentDir?: string
): void {
	const actions = readActions(scope, key, agentDir);
	if (!actions.some((action) => action.id === id)) return;
	writeActions(
		scope,
		key,
		actions.map((action) => (action.id === id ? { ...action, lastRunAt: at } : action)),
		agentDir
	);
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/** Listing with countdown to the next run. */
export function formatActions(actions: readonly ScheduledAction[], now = Date.now()): string {
	if (actions.length === 0) return 'no scheduled actions\n  add: /schedule hourly "check the board"';
	const lines: string[] = [];
	actions.forEach((action, index) => {
		const paused = action.enabled ? "" : " (paused)";
		const when =
			action.delivery === "skdlr" && action.skdlr ? `skdlr ${action.skdlr.schedule}` : formatInterval(action.intervalMs);
		lines.push(`${index + 1}. [${when}]${paused} ${action.label ?? action.text}`);
		const detail: string[] = [`id ${action.id}`];
		if (action.lastRunAt) {
			const last = Date.parse(action.lastRunAt);
			if (Number.isFinite(last)) {
				const next = last + action.intervalMs;
				detail.push(next > now ? `next in ${formatDuration(next - now)}` : "due now");
			}
		} else {
			detail.push(action.enabled ? "waiting for the first tick" : "paused");
		}
		lines.push(`   ${detail.join(" · ")}`);
	});
	return lines.join("\n");
}

/** One-line status for the footer: "2·14m" or undefined when nothing is armed. */
export function statusSummary(actions: readonly ScheduledAction[], now = Date.now()): string | undefined {
	const active = actions.filter((action) => action.enabled);
	if (active.length === 0) return undefined;
	let soonest = Number.POSITIVE_INFINITY;
	for (const action of active) {
		const last = action.lastRunAt ? Date.parse(action.lastRunAt) : Number.NaN;
		const next = Number.isFinite(last) ? last + action.intervalMs : now + action.intervalMs;
		soonest = Math.min(soonest, next - now);
	}
	return `${active.length}\u00b7${formatDuration(soonest)}`;
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * A skdlr command that reproduces an action headlessly.
 *
 * Runs a separate `pi -p` in the project directory: it cannot see this session's
 * live state (context, compaction, message queue) and writes its own session.
 * Offered as an explicit export, never as a silent replacement.
 */
export function skdlrExportCommand(project: string, action: ScheduledAction): string {
	const name = `schedule-${path.basename(path.resolve(project)) || "project"}-${action.id}`.toLowerCase();
	const prompt = action.text.replace(/"/g, '\\"');
	return `skdlr add ${shellQuote(name)} --schedule ${shellQuote(formatInterval(action.intervalMs))} --workdir ${shellQuote(path.resolve(project))} --description ${shellQuote(`scheduled check: ${action.text.slice(0, 80)}`)} --command ${shellQuote(`pi -p "${prompt}"`)}`;
}

/** Mark an action as delivered by an skdlr schedule (its own timer stops). */
export function setActionSkdlr(
	scope: ScheduleScope,
	key: string,
	selector: string,
	linked: { name: string; schedule: string } | undefined,
	agentDir?: string
): { action?: ScheduledAction; actions: ScheduledAction[] } {
	const actions = readActions(scope, key, agentDir);
	const target = findAction(actions, selector);
	if (!target) return { actions };
	const next = actions.map((action) => {
		if (action.id !== target.id) return action;
		if (!linked) {
			const { skdlr: _dropped, delivery: _delivery, ...rest } = action;
			return { ...rest, delivery: "session" as const };
		}
		return {
			...action,
			delivery: "skdlr" as const,
			skdlr: { name: linked.name, schedule: linked.schedule, linkedAt: new Date().toISOString() },
		};
	});
	writeActions(scope, key, next, agentDir);
	const updated = next.find((action) => action.id === target.id);
	return { action: updated, actions: next };
}

/**
 * Split a command line into arguments, honouring single and double quotes.
 *
 * Required because cron expressions and prompts contain spaces:
 *   /schedule link 1 --schedule "0 9 * * 1-5"
 *   /schedule hourly "check the board"
 * Quotes are removed; escaped quotes inside a double-quoted run are kept.
 */
export function splitArgs(input: string): string[] {
	const args: string[] = [];
	let current = "";
	let quote: '"' | "'" | undefined;
	let dirty = false;
	for (let i = 0; i < input.length; i++) {
		const ch = input[i] as string;
		if (quote) {
			if (ch === "\\" && quote === '"' && i + 1 < input.length) {
				current += input[i + 1];
				i += 1;
				continue;
			}
			if (ch === quote) {
				quote = undefined;
				continue;
			}
			current += ch;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			dirty = true;
			continue;
		}
		if (/\s/.test(ch)) {
			if (dirty) {
				args.push(current);
				current = "";
				dirty = false;
			}
			continue;
		}
		current += ch;
		dirty = true;
	}
	if (dirty) args.push(current);
	return args;
}
