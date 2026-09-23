/**
 * pi-herdr-tools — herdr-flavored tools: delegate a task to a new pi subagent
 * in a fresh herdr tab, and fork the current session into its own named tab.
 *
 * The current agent calls the `subagent` tool (action=spawn); the user stays in
 * control through a config file (kill switch, model allowlist, allowance) plus
 * per-session settings (allow mode, auto decision, timeout, allowance):
 *
 *   ~/.pi/agent/subagent-config.json
 *
 *   {
 *     "enabled": true,              // kill switch: false = model cannot spawn at all
 *     "requireConfirmation": true,  // legacy: true = confirm (mapped to allowMode confirm)
 *     "allowedModels": [],          // glob patterns (e.g. "openai/*", "archvm/*"); [] = all allowed
 *     "maxSubagents": 3             // default max concurrent subagents per session; 0 = unlimited
 *     "allowMode": "confirm",       // per-session default: "confirm" | "auto" | "timeout"
 *     "autoDecision": "deny",       // when allowMode=timeout and nobody answers: "allow" | "deny"
 *     "confirmTimeoutMs": 60000,    // how long the timed prompt waits before auto-deciding
 *     "loadouts": {}                // named model-presets: { "cheap": ["archvm/*"] }
 *   }
 *
 * Per-session settings (allow mode, auto decision, timeout, allowance and the
 * list of spawned subagents) live in a state file keyed by the pi session id:
 *
 *   ~/.pi/agent/subagent-state/<sessionId>.json
 *
 * A session's allowlist / subagent allowance is scoped to that session only:
 * other sessions never count against it, and settings survive a resume/reload.
 *
 * Commands:
 *   /subagent status                  show config + per-session state + active subagents
 *   /subagent on|off                  enable/disable model-initiated spawning
 *   /subagent mode <auto|confirm|timeout>   set this session's allow mode
 *   /subagent decide <allow|deny>     set what a timed prompt does when it times out
 *   /subagent timeout <ms>            set the timed prompt's auto-decide delay
 *   /subagent max <n>                 set this session's concurrent allowance (0 = unlimited)
 *   /subagent list                    list subagents this session spawned + status
 *   /subagent close <name>            close a subagent's tab (kills it)
 *   /subagent reset <name> [task]     interrupt a subagent and (optionally) re-prompt it
 *   /subagent models                  open the interactive provider/model picker
 *   /subagent models add <glob>       allow a model pattern (repeatable)
 *   /subagent models remove <glob>    remove an allowlisted pattern
 *   /subagent models list             show allowlist + loadouts
 *   /subagent models clear            empty the allowlist (allow all)
 *   /subagent models loadout save <name>   save current allowlist as a named loadout
 *   /subagent models loadout load <name>   apply a loadout to the allowlist
 *   /subagent models loadout delete <name>
 *   /subagent models loadout list
 *   /side [label] [--model M] txt     Fork the CURRENT session into a new named
 *                                     tab (like Claude /btw or Codex /side, own tab)
 *   /btw ...                          alias for /side
 *
 * Session semantics: pi is single-writer per session file (loaded once at
 * startup; appended to; no reload/lock). Two TUIs on the SAME file do NOT
 * auto-branch — they diverge and collide. To steer a copy in a new direction
 * in its own tab, /side forks the current session into a NEW file
 * (pi --fork <file>) whose header records the parent, then opens pi there.
 *
 * Spawns via the herdr CLI (the documented automation path; herdr itself is
 * socket-backed via HERDR_SOCKET_PATH): tab create -> agent start -> prompt.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	Input,
	Key,
	fuzzyFilter,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";

const execFileAsync = promisify(execFile);

const CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "subagent-config.json");
const STATE_DIR = path.join(os.homedir(), ".pi", "agent", "subagent-state");
const HISTORY_PATH = path.join(os.homedir(), ".pi", "agent", "subagent-history.jsonl"); // durable, append-only ledger
const NAME_PREFIX = "sub-"; // agent names must match [a-z][a-z0-9_-]{0,31}
const POLL_INTERVAL_MS = 4000;

// gvnr event-log emission (best-effort, non-fatal). Set GVNR_EVENT_URL + GVNR_TOKEN
// to forward closure/completion records to the gvnr fleet-intake audit log.
const GVNR_EVENT_URL = process.env.GVNR_EVENT_URL ?? "";
const GVNR_TOKEN = process.env.GVNR_TOKEN ?? "";

type SubagentOutcome = "done" | "closed" | "error" | "unknown";

type AllowMode = "confirm" | "auto" | "timeout";
type AutoDecision = "allow" | "deny";

interface SubagentConfig {
	enabled: boolean;
	requireConfirmation: boolean;
	allowedModels: string[];
	allowedKinds: string[];
	maxSubagents: number;
	allowMode: AllowMode;
	autoDecision: AutoDecision;
	confirmTimeoutMs: number;
	loadouts: Record<string, string[]>;
	/** Path to the byteowlz model catalog (metadata + loadouts + policy). */
	catalogPath?: string;
}

const DEFAULT_CONFIG: SubagentConfig = {
	enabled: true,
	requireConfirmation: true,
	allowedModels: [],
	allowedKinds: ["pi"],
	maxSubagents: 3,
	allowMode: "confirm",
	autoDecision: "deny",
	confirmTimeoutMs: 60_000,
	loadouts: {},
	catalogPath: path.join(os.homedir(), ".pi", "agent", "model-catalog.json"),
};

function asAllowMode(v: unknown): AllowMode | undefined {
	return v === "confirm" || v === "auto" || v === "timeout" ? v : undefined;
}

function asAutoDecision(v: unknown): AutoDecision | undefined {
	return v === "allow" || v === "deny" ? v : undefined;
}

function loadConfig(): SubagentConfig {
	try {
		if (fs.existsSync(CONFIG_PATH)) {
			const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as Partial<SubagentConfig>;
			const allowMode = asAllowMode(raw.allowMode) ?? (raw.requireConfirmation === false ? "auto" : "confirm");
			const loadouts: Record<string, string[]> = {};
			if (raw.loadouts && typeof raw.loadouts === "object") {
				for (const [k, v] of Object.entries(raw.loadouts)) {
					if (Array.isArray(v)) loadouts[k] = v.filter((p) => typeof p === "string");
				}
			}
			return {
				enabled: raw.enabled ?? DEFAULT_CONFIG.enabled,
				requireConfirmation: raw.requireConfirmation ?? DEFAULT_CONFIG.requireConfirmation,
				allowedModels: Array.isArray(raw.allowedModels) ? raw.allowedModels.filter((p) => typeof p === "string") : [],
				allowedKinds: Array.isArray(raw.allowedKinds)
					? raw.allowedKinds.filter((p) => typeof p === "string")
					: DEFAULT_CONFIG.allowedKinds,
				maxSubagents: typeof raw.maxSubagents === "number" ? raw.maxSubagents : DEFAULT_CONFIG.maxSubagents,
				allowMode,
				autoDecision: asAutoDecision(raw.autoDecision) ?? DEFAULT_CONFIG.autoDecision,
				confirmTimeoutMs: typeof raw.confirmTimeoutMs === "number" ? raw.confirmTimeoutMs : DEFAULT_CONFIG.confirmTimeoutMs,
				loadouts,
				catalogPath: typeof raw.catalogPath === "string" ? raw.catalogPath : DEFAULT_CONFIG.catalogPath,
			};
		}
	} catch {
		// fall through to defaults on a corrupt file
	}
	return { ...DEFAULT_CONFIG };
}

function saveConfig(config: SubagentConfig): void {
	try {
		fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
		fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
	} catch {
		// non-fatal: config still applies for this process
	}
}

// --- Model catalog (byteowlz metadata + loadouts + policy) ------------

interface CatalogModelEntry {
	id: string;
	provider: string;
	label?: string;
	dataResidency?: "local" | "internal" | "azure" | "external";
	zdr?: boolean;
	costType?: "free" | "subscription" | "per-token";
	spawnKind?: string;
	tags: string[];
}

interface CatalogLoadout {
	match?: "any" | "all";
	tags: string[];
	excludeTags?: string[];
	description?: string;
}

interface ModelCatalog {
	version?: number;
	policy?: { defaultKind?: string; defaultLoadout?: string; defaultAllowMode?: string };
	providers?: Record<string, { dataResidency?: string; note?: string }>;
	models?: CatalogModelEntry[];
	loadouts?: Record<string, CatalogLoadout>;
}

const CATALOG_LOCAL_NAMES = ["model-catalog.json"];

function resolveCatalogPath(catalogPath: string | undefined): string {
	if (!catalogPath) return DEFAULT_CONFIG.catalogPath!;
	if (catalogPath.startsWith("~")) return path.join(os.homedir(), catalogPath.slice(1));
	return catalogPath;
}

function loadCatalogFile(p: string): ModelCatalog | null {
	try {
		if (!p || !fs.existsSync(p)) return null;
		return JSON.parse(fs.readFileSync(p, "utf8")) as ModelCatalog;
	} catch {
		return null;
	}
}

/**
 * Load the model catalog with layering (most-specific wins):
 * global catalogPath -> <cwd>/.pi/model-catalog.json -> <cwd>/model-catalog.json.
 * "models" merge by id; "loadouts"/"policy"/"providers" override by key.
 */
export function loadCatalog(cwd: string | undefined, basePath?: string): ModelCatalog {
	const merged: ModelCatalog = { version: 1, models: [], providers: {}, loadouts: {} };
	const apply = (c: ModelCatalog | null) => {
		if (!c) return;
		merged.version = c.version ?? merged.version;
		if (c.policy) merged.policy = { ...merged.policy, ...c.policy };
		if (c.providers) merged.providers = { ...merged.providers, ...c.providers };
		if (c.loadouts) merged.loadouts = { ...merged.loadouts, ...c.loadouts };
		if (Array.isArray(c.models)) {
			const byId = new Map((merged.models ?? []).map((m) => [m.id, m]));
			for (const m of c.models) byId.set(m.id, m);
			merged.models = [...byId.values()];
		}
	};

	apply(loadCatalogFile(basePath ?? resolveCatalogPath(loadConfig().catalogPath)));
	if (cwd) {
		for (const name of CATALOG_LOCAL_NAMES) {
			apply(loadCatalogFile(path.join(cwd, ".pi", name)));
			apply(loadCatalogFile(path.join(cwd, name)));
		}
	}
	return merged;
}

/** Resolve a loadout to the set of model ids it selects. */
export function resolveLoadoutModelIds(catalog: ModelCatalog, loadoutName: string): string[] {
	const loadout = catalog.loadouts?.[loadoutName];
	if (!loadout) return [];
	const tags = loadout.tags ?? [];
	const exclude = loadout.excludeTags ?? [];
	const matchAll = loadout.match === "all";
	return (catalog.models ?? [])
		.filter((m) => (matchAll ? tags.every((t) => m.tags?.includes(t)) : tags.some((t) => m.tags?.includes(t))))
		.filter((m) => !exclude.some((t) => m.tags?.includes(t)))
		.map((m) => m.id);
}

/** Return the spawn kinds a loadout allows (from its models' spawnKind). */
export function resolveLoadoutKinds(catalog: ModelCatalog, loadoutName: string): string[] {
	const ids = new Set(resolveLoadoutModelIds(catalog, loadoutName));
	const kinds = new Set<string>();
	for (const m of catalog.models ?? []) {
		if (ids.has(m.id) && m.spawnKind) kinds.add(m.spawnKind);
	}
	return [...kinds];
}

/** Build a compact, agent-facing compute/cost/privacy digest. */
export function buildCatalogDigest(catalog: ModelCatalog): string {
	if (!catalog.models?.length) return "";
	const lines: string[] = [];
	const byResidency = new Map<string, CatalogModelEntry[]>();
	for (const m of catalog.models) {
		const r = m.dataResidency ?? "unknown";
		byResidency.set(r, [...(byResidency.get(r) ?? []), m]);
	}
	for (const [res, ms] of byResidency) {
		const labels = ms.map((m) => m.label ?? m.id).join(", ");
		lines.push(`- ${res}: ${labels}`);
	}
	if (catalog.loadouts) {
		const lo = Object.keys(catalog.loadouts);
		if (lo.length) lines.push(`Loadouts: ${lo.join(", ")}`);
	}
	return lines.join("\n");
}

// --- Per-session state ------------------------------------------------

interface TrackedSubagent {
	name: string;
	paneId: string;
	tabId: string;
	model: string;
	kind?: string;
	label: string;
	cwd: string;
	spawnedAt: number;
	status?: string; // last observed herdr status (idle/working/blocked/done/unknown)
	done?: boolean; // observed done; completion notification sent
	notified?: boolean; // completion notification dispatched
	gone?: boolean; // tab closed / agent no longer listed
	endedAt?: number; // when the agent finished or was closed
	outcome?: SubagentOutcome; // durable terminal state (done/closed/error/unknown)
}

interface SubagentHistoryEntry {
	name: string;
	label: string;
	paneId?: string;
	tabId?: string;
	model: string;
	cwd: string;
	spawnedAt: number;
	endedAt: number;
	outcome: SubagentOutcome;
	statusFinal?: string;
	workspaceId?: string;
	agentAddress?: string; // AGENT_CTX_AGENT_ADDRESS provenance
}

interface SessionState {
	sessionId: string;
	allowMode?: AllowMode;
	autoDecision?: AutoDecision;
	confirmTimeoutMs?: number;
	maxSubagents?: number;
	subagents: Record<string, TrackedSubagent>;
	/** Durable append-only ledger of finished/closed subagents this session spawned. */
	history?: SubagentHistoryEntry[];
	/** This session's active model allowlist (overrides the global default while set). */
	allowlist?: string[];
	/** Local (per-session) named loadouts. */
	loadouts?: Record<string, string[]>;
	/** Whether this session may use global loadouts. Default true. */
	allowGlobalLoadouts?: boolean;
	/** Loadout name this session is pinned to (resolved local-first, then global if allowed). */
	forceLoadout?: string;
}

let currentSessionId: string | null = null;
let currentState: SessionState | null = null;
let notifyTimer: ReturnType<typeof setInterval> | null = null;

function sessionIdOf(ctx: ExtensionContext): string | null {
	try {
		return ctx.sessionManager.getSessionId() ?? null;
	} catch {
		return null;
	}
}

function stateFilePath(sessionId: string): string {
	const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, "-");
	return path.join(STATE_DIR, `${safe}.json`);
}

function loadSessionState(ctx: ExtensionContext): void {
	const id = sessionIdOf(ctx);
	currentSessionId = id;
	if (!id) {
		currentState = { sessionId: "ephemeral", subagents: {} };
		return;
	}
	try {
		if (fs.existsSync(stateFilePath(id))) {
			const raw = JSON.parse(fs.readFileSync(stateFilePath(id), "utf8")) as Partial<SessionState>;
			currentState = {
				sessionId: id,
				...(raw as object),
				subagents: (raw.subagents as Record<string, TrackedSubagent>) ?? {},
			};
			return;
		}
	} catch {
		// fall through
	}
	currentState = { sessionId: id, subagents: {} };
}

function persistState(): void {
	if (!currentState || !currentSessionId) return; // ephemeral: in-memory only
	try {
		fs.mkdirSync(STATE_DIR, { recursive: true });
		fs.writeFileSync(stateFilePath(currentSessionId), JSON.stringify(currentState, null, 2));
	} catch {
		// non-fatal
	}
}

function ensureSessionState(ctx: ExtensionContext): void {
	const id = sessionIdOf(ctx);
	if (!currentState || currentSessionId !== id) loadSessionState(ctx);
}

function trackSubagent(ctx: ExtensionContext, t: TrackedSubagent): void {
	ensureSessionState(ctx);
	if (currentState) currentState.subagents[t.name] = t;
	persistState();
}

function sessionAllowMode(config: SubagentConfig): AllowMode {
	return currentState?.allowMode ?? config.allowMode;
}
function sessionAutoDecision(config: SubagentConfig): AutoDecision {
	return currentState?.autoDecision ?? config.autoDecision;
}
function sessionConfirmTimeout(config: SubagentConfig): number {
	return currentState?.confirmTimeoutMs ?? config.confirmTimeoutMs;
}
function sessionMaxSubagents(config: SubagentConfig): number {
	return currentState?.maxSubagents ?? config.maxSubagents;
}

function isInHerdr(): boolean {
	return process.env.HERDR_ENV === "1" && !!process.env.HERDR_SOCKET_PATH;
}

async function herdr(args: string[]): Promise<any> {
	const { stdout } = await execFileAsync("herdr", args, { maxBuffer: 8 * 1024 * 1024 });
	const text = stdout.trim();
	if (!text) return {};
	try {
		return JSON.parse(text);
	} catch {
		return { result: undefined, raw: text };
	}
}

/** Run `herdr <args>` and return the raw stdout as a string, without JSON parsing. */
async function herdrRaw(args: string[]): Promise<string> {
	const { stdout } = await execFileAsync("herdr", args, { maxBuffer: 16 * 1024 * 1024 });
	return stdout;
}

/** Convert a simple glob (e.g. "openai/*") to a RegExp. */
function globToRegExp(pattern: string): RegExp {
	const escaped = pattern
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replace(/\*/g, ".*")
		.replace(/\?/g, ".");
	return new RegExp(`^${escaped}$`);
}

/** Does `full` (e.g. "openai/gpt-5") match any of the given patterns? Empty = all allowed. */
function allowedBy(patterns: string[], full: string): boolean {
	if (patterns.length === 0) return true;
	const provider = full.split("/")[0] ?? "";
	const bare = full.split("/").pop() ?? full;
	return patterns.some((p) => {
		const re = globToRegExp(p);
		return re.test(full) || re.test(bare) || re.test(`${provider}/*`);
	});
}

// --- Loadouts (global + per-session) & effective allowlist ------------

function sessionAllowGlobalLoadouts(): boolean {
	return currentState?.allowGlobalLoadouts !== false;
}

/** Resolve a loadout name: local (per-session) first, then global if allowed. */
function resolveLoadout(name: string, config: SubagentConfig): string[] | undefined {
	const local = currentState?.loadouts?.[name];
	if (local && local.length > 0) return local;
	if (sessionAllowGlobalLoadouts() && config.loadouts?.[name] && config.loadouts[name].length > 0) {
		return config.loadouts[name];
	}
	return undefined;
}

/** The effective allowlist this session uses for spawning, plus where it came from. */
function effectiveAllowlist(config: SubagentConfig): { patterns: string[]; source: string } {
	const force = currentState?.forceLoadout;
	if (force) {
		const pats = resolveLoadout(force, config);
		if (pats) return { patterns: pats, source: `loadout:${force}` };
	}
	if (currentState?.allowlist !== undefined) return { patterns: currentState.allowlist, source: "session" };
	return { patterns: config.allowedModels, source: "global" };
}

/** Drop any force pin so an explicit edit takes effect. */
function clearForceLoadout(): void {
	if (currentState) currentState.forceLoadout = undefined;
}

/** Return this session's mutable allowlist, initialised from the effective one if not set. */
function ensureSessionAllowlist(config: SubagentConfig): string[] {
	if (!currentState) currentState = { sessionId: "ephemeral", subagents: {} };
	if (currentState.allowlist === undefined) {
		currentState.allowlist = effectiveAllowlist(config).patterns;
		currentState.forceLoadout = undefined;
		persistState();
	}
	return currentState.allowlist;
}

// --- Subagent lifecycle (count, monitor, notify) -----------------------

async function fetchAgentStatusMap(): Promise<Map<string, string>> {
	const res = await herdr(["agent", "list"]);
	const agents: unknown[] = Array.isArray(res?.result?.agents) ? res.result.agents : [];
	const map = new Map<string, string>();
	for (const a of agents) {
		if (!a || typeof a !== "object") continue;
		const { name, agent_status } = a as { name?: unknown; agent_status?: unknown };
		if (typeof name === "string") map.set(name, typeof agent_status === "string" ? agent_status : "");
	}
	return map;
}

/**
 * Count subagents THIS session spawned that are still live and not finished.
 * Persisted per-session, so the allowance survives a resume/reload and is
 * never polluted by subagents another session (or another workspace) spawned.
 */
async function countSubagents(): Promise<number> {
	if (!currentState) return 0;
	const names = Object.keys(currentState.subagents);
	if (names.length === 0) return 0;
	const statuses = await fetchAgentStatusMap();
	let active = 0;
	for (const name of names) {
		const t = currentState.subagents[name];
		if (t.gone) continue;
		const status = statuses.get(name);
		if (status === undefined) continue; // not listed -> not occupying the cap
		if (status !== "done") active += 1;
	}
	return active;
}

function hasPendingSubagents(): boolean {
	if (!currentState) return false;
	return Object.values(currentState.subagents).some((t) => !t.done && !t.gone);
}

function stopNotifyTimer(): void {
	if (notifyTimer) {
		clearInterval(notifyTimer);
		notifyTimer = null;
	}
}

function startNotifyTimer(pi: ExtensionAPI, ctx: ExtensionContext): void {
	if (notifyTimer) return;
	if (!hasPendingSubagents()) return;
	notifyTimer = setInterval(() => {
		void pollSubagents(pi, ctx);
	}, POLL_INTERVAL_MS);
}

function notifyFinished(pi: ExtensionAPI, ctx: ExtensionContext, t: TrackedSubagent): void {
	const detail = [
		`Subagent ${t.name} (${t.label}) has FINISHED its task.`,
		"",
		`  model: ${t.model}`,
		`  cwd:   ${t.cwd}`,
		"",
		`Read its output: herdr agent read ${t.name} --source recent-unwrapped --format text`,
		`Or just ask for it: herdr agent read ${t.name} --source recent-unwrapped --format text`,
	].join("\n");
	try {
		pi.sendUserMessage(detail);
	} catch {
		// no session to inject into (print/RPC mode)
	}
	try {
		ctx.ui.notify(`Subagent ${t.name} finished its task.`, "info");
	} catch {
		// ignore
	}
}

async function pollSubagents(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
	if (!isInHerdr()) return;
	if (!currentState) return;
	let statuses: Map<string, string>;
	try {
		statuses = await fetchAgentStatusMap();
	} catch {
		return; // transient: herdr unavailable
	}
	let changed = false;
	for (const name of Object.keys(currentState.subagents)) {
		const t = currentState.subagents[name];
		if (t.done || t.gone) continue;
		const status = statuses.get(name);
		if (status === undefined) {
			t.gone = true;
			changed = true;
			recordOutcome(t, "closed", { statusFinal: t.status });
			continue;
		}
		if (status !== t.status) {
			t.status = status;
			changed = true;
		}
		if (status === "done") {
			t.done = true;
			t.notified = true;
			changed = true;
			notifyFinished(pi, ctx, t);
			recordOutcome(t, "done", { statusFinal: status });
		}
	}
	if (changed) persistState();
	if (!hasPendingSubagents()) stopNotifyTimer();
}

// --- Durable subagent outcome: record, retain, emit -------------------

/** Best-effort provenance from the AGENT_CTX / herdr environment. */
function provenance(): { agentAddress?: string; machine?: string } {
	const agentAddress = process.env.AGENT_CTX_AGENT_ADDRESS ?? process.env.HERDR_AGENT_ADDRESS;
	const machine = process.env.AGENT_CTX_MACHINE_ID ?? process.env.HOSTNAME;
	return { agentAddress, machine };
}

function ensureSessionHistory(): SubagentHistoryEntry[] {
	if (!currentState) currentState = { sessionId: "ephemeral", subagents: {} };
	if (!currentState.history) currentState.history = [];
	return currentState.history;
}

/** Append one closure/completion entry to the node-local durable ledger. */
function appendDurableHistory(entry: SubagentHistoryEntry): void {
	try {
		fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
		fs.appendFileSync(HISTORY_PATH, `${JSON.stringify(entry)}\n`, "utf8");
	} catch {
		// non-fatal: per-session history still holds the record
	}
}

/** Best-effort POST to the gvnr fleet-intake audit log (never blocks the session). */
async function emitGvnrEvent(entry: SubagentHistoryEntry): Promise<void> {
	if (!GVNR_EVENT_URL) return; // not wired up: durable ledger + session history still apply
	const causation = provenance();
	const body = {
		proto: "gvnr-dpty",
		version: "0.1.0",
		kind: "event",
		causation: {
			origin: causation.agentAddress ?? "pi-herdr-tools",
			machine: causation.machine ?? "",
			purpose: "subagent-closure",
		},
		payload: {
			ts: new Date(entry.endedAt).toISOString(),
			type: "subagent.closed",
			runner_id: entry.name,
			payload: {
				outcome: entry.outcome,
				label: entry.label,
				model: entry.model,
				cwd: entry.cwd,
				statusFinal: entry.statusFinal,
			},
		},
	};
	try {
		await fetch(`${GVNR_EVENT_URL.replace(/\/$/, "")}/events`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(GVNR_TOKEN ? { authorization: `Bearer ${GVNR_TOKEN}` } : {}),
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(5000),
		});
	} catch {
		// best-effort: never fail the session over an event emit
	}
}

/** Record a terminal outcome for a subagent exactly once: durable ledger + session history + gvnr. */
function recordOutcome(
	t: TrackedSubagent,
	outcome: SubagentOutcome,
	extra: { statusFinal?: string; workspaceId?: string } = {}
): void {
	if (t.endedAt) return; // already recorded
	t.outcome = outcome;
	t.endedAt = Date.now();
	const entry: SubagentHistoryEntry = {
		name: t.name,
		label: t.label,
		paneId: t.paneId,
		tabId: t.tabId,
		model: t.model,
		cwd: t.cwd,
		spawnedAt: t.spawnedAt,
		endedAt: t.endedAt,
		outcome,
		statusFinal: extra.statusFinal ?? t.status,
		workspaceId: extra.workspaceId,
		agentAddress: provenance().agentAddress,
	};
	appendDurableHistory(entry);
	const hist = ensureSessionHistory();
	hist.push(entry);
	persistState();
	void emitGvnrEvent(entry);
}

// --- herdr socket event subscription (push close/exit detection) ------

const EVENT_SUB_TYPES = ["tab.closed", "pane.closed", "pane.exited"];
let eventSocket: net.Socket | null = null;
let eventReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let eventBuf = "";

function stopEventSubscriber(): void {
	if (eventReconnectTimer) {
		clearTimeout(eventReconnectTimer);
		eventReconnectTimer = null;
	}
	if (eventSocket) {
		try {
			eventSocket.destroy();
		} catch {
			// ignore
		}
		eventSocket = null;
	}
}

/** Correlate a herdr lifecycle event to a tracked subagent and record a closure. */
function handleEventEnvelope(env: { event?: unknown; data?: unknown }): void {
	if (!currentState) return;
	const kind = env.event;
	const data = (env.data ?? {}) as Record<string, unknown>;
	const paneId = typeof data.pane_id === "string" ? data.pane_id : undefined;
	const tabId = typeof data.tab_id === "string" ? data.tab_id : undefined;
	const workspaceId = typeof data.workspace_id === "string" ? data.workspace_id : undefined;
	const matched = Object.values(currentState.subagents).filter((t) => {
		if (t.done || t.gone) return false;
		if (kind === "tab_closed" && tabId && t.tabId === tabId) return true;
		if ((kind === "pane_closed" || kind === "pane_exited") && paneId && t.paneId === paneId) return true;
		return false;
	});
	for (const t of matched) {
		t.gone = true;
		recordOutcome(t, "closed", { workspaceId });
	}
	if (matched.length > 0) persistState();
}

function handleEventLine(line: string): void {
	const trimmed = line.trim();
	if (!trimmed) return;
	let msg: unknown;
	try {
		msg = JSON.parse(trimmed);
	} catch {
		return;
	}
	if (!msg || typeof msg !== "object") return;
	const m = msg as Record<string, unknown>;
	// subscription confirmed
	if (m.id && (m as { result?: unknown }).result && typeof (m as { result?: unknown }).result === "object") {
		const r = (m as { result?: { type?: string } }).result;
		void r; // subscription_started confirmation; nothing further to mark
		return;
	}
	// pushed lifecycle event envelope
	if (typeof m.event === "string" && m.data) handleEventEnvelope(m);
}

/** Open a best-effort NDJSON event subscription to herdr over HERDR_SOCKET_PATH. */
function startEventSubscriber(pi: ExtensionAPI): void {
	if (!isInHerdr()) return;
	if (eventSocket) return; // already connected/reconnecting
	const sockPath = process.env.HERDR_SOCKET_PATH;
	if (!sockPath) return;
	try {
		eventSocket = net.createConnection(sockPath);
	} catch {
		eventSocket = null;
		return;
	}
	const sock = eventSocket;
	eventBuf = "";
	sock.on("connect", () => {
		sock.write(
			`${JSON.stringify({
				id: `sub-${Date.now()}`,
				method: "events.subscribe",
				params: { subscriptions: EVENT_SUB_TYPES.map((type) => ({ type })) },
			})}\n`
		);
	});
	sock.on("data", (chunk) => {
		eventBuf += chunk.toString();
		while (true) {
			const idx = eventBuf.indexOf("\n");
			if (idx < 0) break;
			const line = eventBuf.slice(0, idx);
			eventBuf = eventBuf.slice(idx + 1);
			handleEventLine(line);
		}
	});
	const teardown = () => {
		if (eventSocket === sock) eventSocket = null;
		if (!eventReconnectTimer) {
			eventReconnectTimer = setTimeout(() => {
				eventReconnectTimer = null;
				startEventSubscriber(pi);
			}, 5000);
		}
	};
	sock.on("close", teardown);
	sock.on("error", () => teardown());
}

function randomName(): string {
	return `${NAME_PREFIX}${Math.random().toString(36).slice(2, 8)}`;
}

function randomSideName(): string {
	return `side-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Fork the current session into a brand-new session FILE, then open pi in a
 * new named herdr tab from that fork.
 *
 * We do NOT point two TUIs at the same session file (pi is single-writer;
 * two writers would diverge/collide without auto-branching). Instead we fork
 * to a fresh file via `pi --fork`, whose header records the parent session.
 */
async function openSideTab(opts: {
	ctx: ExtensionContext;
	label: string;
	cwd?: string;
	model?: string;
	instruction?: string;
}) {
	const sessionFile = opts.ctx.sessionManager.getSessionFile();
	if (!sessionFile) {
		throw new Error("No current session file to fork (ephemeral --no-session?).");
	}

	const name = randomSideName();
	const cwd = opts.cwd ?? opts.ctx.sessionManager.getCwd() ?? opts.ctx.cwd;

	const tabRes = await herdr(["tab", "create", "--label", opts.label, "--cwd", cwd, "--no-focus"]);
	const paneId = tabRes?.result?.root_pane?.pane_id;
	const tabId = tabRes?.result?.tab?.tab_id;
	if (!paneId) {
		throw new Error(`herdr tab create failed: ${JSON.stringify(tabRes).slice(0, 400)}`);
	}

	const piArgs: string[] = ["--fork", sessionFile];
	if (opts.model) piArgs.push("--model", opts.model);
	const startRes = await herdr(["agent", "start", name, "--kind", "pi", "--pane", paneId, "--", ...piArgs]);
	if (startRes?.error || !startRes?.result?.agent?.name) {
		throw new Error(`herdr agent start failed: ${JSON.stringify(startRes).slice(0, 400)}`);
	}

	if (opts.instruction) {
		await herdr(["agent", "prompt", name, opts.instruction]);
	}

	return { name, tabId, paneId };
}

const SUBAGENT_ACTIONS = ["spawn", "list", "info"] as const;
type SubagentAction = (typeof SUBAGENT_ACTIONS)[number];

interface SubagentToolParams {
	action?: SubagentAction;
	task?: string;
	model?: string;
	kind?: string;
	loadout?: string;
	tabLabel?: string;
	cwd?: string;
}

const SubagentToolParamsSchema = Type.Object({
	action: Type.Optional(
		Type.Union(
			SUBAGENT_ACTIONS.map((a) => Type.Literal(a)),
			{
				description:
					"What to do: 'spawn' (default) delegate a task, 'list' this session's subagents, 'info' available compute/cost/privacy.",
			}
		)
	),
	task: Type.Optional(Type.String({ description: "Task to delegate to a new subagent (action=spawn)." })),
	model: Type.Optional(Type.String({ description: "Model id to spawn (action=spawn). Defaults to the loadout/current model." })),
	kind: Type.Optional(Type.String({ description: "herdr agent kind (action=spawn). Default 'pi'; e.g. 'claude', 'codex'." })),
	loadout: Type.Optional(
		Type.String({ description: "Named loadout to gate/choose the model (action=spawn), e.g. 'local', 'data-privacy'." })
	),
	tabLabel: Type.Optional(Type.String({ description: "Label for the new herdr tab (action=spawn)." })),
	cwd: Type.Optional(Type.String({ description: "Working directory for the subagent (action=spawn)." })),
});

// --- Confirmation with per-session allow mode -------------------------

/**
 * Timed confirmation modal: shows the spawn detail + a live countdown and
 * auto-decides to `onTimeoutAllow` when the timeout elapses without input.
 */
function timedConfirm(ctx: ExtensionContext, detail: string, timeoutMs: number, onTimeoutAllow: boolean): Promise<boolean> {
	return ctx.ui.custom<boolean>((tui, theme, _kb, done) => {
		let settled = false;
		const start = Date.now();
		let cachedLines: string[] | undefined;
		let timer: ReturnType<typeof setInterval> | null = null;

		function finish(v: boolean): void {
			if (settled) return;
			settled = true;
			if (timer) clearInterval(timer);
			done(v);
		}

		function refresh(): void {
			cachedLines = undefined;
			tui.requestRender();
		}

		timer = setInterval(() => {
			if (settled) return;
			if (Date.now() - start >= timeoutMs) {
				finish(onTimeoutAllow);
			} else {
				refresh();
			}
		}, 500);

		function handleInput(data: string): void {
			if (matchesKey(data, Key.escape) || data === "n" || data === "N") {
				finish(false);
				return;
			}
			if (matchesKey(data, Key.enter) || data === "y" || data === "Y") {
				finish(true);
				return;
			}
		}

		function render(width: number): string[] {
			if (cachedLines) return cachedLines;
			const rw = Math.max(1, width);
			const rem = Math.max(0, Math.ceil((timeoutMs - (Date.now() - start)) / 1000));
			const lines: string[] = [];
			lines.push(theme.fg("accent", "─".repeat(rw)));
			lines.push(
				...wrapTextWithAnsi(theme.fg("accent", `Spawn subagent?  (auto-${onTimeoutAllow ? "allow" : "deny"} in ${rem}s)`), rw)
			);
			lines.push("");
			lines.push(...wrapTextWithAnsi(theme.fg("muted", detail), rw));
			lines.push("");
			lines.push(...wrapTextWithAnsi(theme.fg("dim", "[y] allow • [n] deny • Esc deny • Enter allow"), rw));
			lines.push(theme.fg("accent", "─".repeat(rw)));
			cachedLines = lines;
			return lines;
		}

		return { render, handleInput, invalidate: refresh };
	});
}

/** Decide whether a spawn is allowed, honouring the session's allow mode. */
async function approveSpawn(ctx: ExtensionContext, config: SubagentConfig, detail: string): Promise<boolean> {
	if (!ctx.hasUI) return true; // print/RPC mode: cannot prompt, so allow
	const mode = sessionAllowMode(config);
	if (mode === "auto") return true;
	if (mode === "confirm") return ctx.ui.confirm("Spawn subagent?", detail);
	const timeout = sessionConfirmTimeout(config);
	const decision = sessionAutoDecision(config);
	return timedConfirm(ctx, detail, timeout, decision === "allow");
}

// --- Model / provider picker with loadouts ----------------------------

interface ModelInfo {
	provider: string;
	id: string;
	name: string;
}

function collectModels(ctx: ExtensionContext): ModelInfo[] {
	const models = ctx.modelRegistry.getAvailable?.() ?? [];
	const out: ModelInfo[] = [];
	for (const m of models) {
		const provider = String(m?.provider ?? "");
		const id = String(m?.id ?? "");
		if (!provider || !id) continue;
		out.push({ provider, id, name: String(m?.name ?? id) });
	}
	out.sort((a, b) => (a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : a.name < b.name ? -1 : 1));
	return out;
}

interface PickerRow {
	kind: "provider" | "model";
	provider: string;
	modelId?: string;
	pattern: string;
	label: string;
}

/** Interactive provider/model picker. Returns the new allowlist, or null on cancel. */
function runModelPicker(ctx: ExtensionContext, models: ModelInfo[], initial: string[]): Promise<string[] | null> {
	const providers = [...new Set(models.map((m) => m.provider))].sort();
	const rows: PickerRow[] = [];
	for (const p of providers) {
		rows.push({ kind: "provider", provider: p, pattern: `${p}/*`, label: `${p} (provider)` });
		for (const m of models.filter((x) => x.provider === p)) {
			rows.push({ kind: "model", provider: p, modelId: m.id, pattern: `${p}/${m.id}`, label: m.name });
		}
	}

	const sel = new Set(initial);
	const providerModels = new Map<string, string[]>();
	for (const m of models) {
		if (!providerModels.has(m.provider)) providerModels.set(m.provider, []);
		providerModels.get(m.provider)?.push(m.id);
	}

	const isModelAllowed = (provider: string, id: string): boolean => allowedBy([...sel], `${provider}/${id}`);
	const providerAllSelected = (provider: string): boolean => {
		const ids = providerModels.get(provider) ?? [];
		return ids.length > 0 && ids.every((id) => isModelAllowed(provider, id));
	};
	const providerSelected = (provider: string): boolean => sel.has(`${provider}/*`) || providerAllSelected(provider);

	function toggleProvider(provider: string): void {
		const pattern = `${provider}/*`;
		const ids = providerModels.get(provider) ?? [];
		if (sel.has(pattern) || providerAllSelected(provider)) {
			sel.delete(pattern);
			for (const id of ids) sel.delete(`${provider}/${id}`);
		} else {
			for (const id of ids) sel.delete(`${provider}/${id}`);
			sel.add(pattern);
		}
	}

	function toggleModel(provider: string, id: string): void {
		const full = `${provider}/${id}`;
		const providerPattern = `${provider}/*`;
		const ids = providerModels.get(provider) ?? [];
		if (isModelAllowed(provider, id)) {
			// turn this model off
			if (sel.has(providerPattern)) {
				sel.delete(providerPattern);
				for (const other of ids) {
					if (other !== id) sel.add(`${provider}/${other}`);
				}
			} else {
				sel.delete(full);
			}
		} else {
			sel.add(full);
		}
	}

	return ctx.ui.custom<string[] | null>((tui, theme, _kb, done) => {
		let filter = "";
		let visible: PickerRow[] = rows;
		let selected = 0;
		const maxVisible = Math.max(1, Math.min(rows.length, 18));
		let cachedLines: string[] | undefined;

		function recompute(): void {
			const q = filter.trim().toLowerCase();
			visible = q ? rows.filter((r) => r.label.toLowerCase().includes(q) || r.pattern.toLowerCase().includes(q)) : rows;
			if (selected >= visible.length) selected = Math.max(0, visible.length - 1);
			if (selected < 0) selected = 0;
		}

		function refresh(): void {
			cachedLines = undefined;
			tui.requestRender();
		}

		function checkboxFor(row: PickerRow): string {
			const on = row.kind === "provider" ? providerSelected(row.provider) : isModelAllowed(row.provider, row.modelId ?? "");
			return on ? "☑" : "☐";
		}

		function handleNav(data: string): boolean {
			if (visible.length === 0) return false;
			if (matchesKey(data, Key.up)) {
				selected = (selected - 1 + visible.length) % visible.length;
				return true;
			}
			if (matchesKey(data, Key.down)) {
				selected = (selected + 1) % visible.length;
				return true;
			}
			if (matchesKey(data, Key.pageUp)) {
				selected = Math.max(0, selected - maxVisible);
				return true;
			}
			if (matchesKey(data, Key.pageDown)) {
				selected = Math.min(visible.length - 1, selected + maxVisible);
				return true;
			}
			return false;
		}

		function handleInput(data: string): void {
			if (matchesKey(data, Key.escape)) {
				done(null);
				return;
			}
			if (matchesKey(data, Key.enter)) {
				done([...sel]);
				return;
			}
			if (matchesKey(data, "backspace") || data === "\u007f") {
				filter = filter.slice(0, -1);
				recompute();
				refresh();
				return;
			}
			if (data === " ") {
				const row = visible[selected];
				if (row) {
					if (row.kind === "provider") toggleProvider(row.provider);
					else toggleModel(row.provider, row.modelId ?? "");
				}
				refresh();
				return;
			}
			if (handleNav(data)) {
				refresh();
				return;
			}
			const trimmed = data.length === 1 && data.charCodeAt(0) >= 32 ? data : "";
			if (trimmed) {
				filter += trimmed;
				recompute();
				refresh();
			}
		}

		function renderRow(row: PickerRow, i: number, width: number): string {
			const isSel = i === selected;
			const prefix = isSel ? theme.fg("accent", "→ ") : "  ";
			const box = theme.fg(isSel ? "accent" : "muted", checkboxFor(row));
			const depth = row.kind === "provider" ? "" : "   ";
			const label = `${depth}${row.label}`;
			const meta = row.kind === "model" ? theme.fg("muted", ` (${row.provider})`) : theme.fg("dim", " ⌘");
			const total = visibleWidth(prefix) + visibleWidth(box) + 2;
			const labWidth = Math.max(1, width - total - visibleWidth(meta));
			const trimmedLabel = truncateToWidth(label, labWidth, "…");
			return `${prefix}${box} ${trimmedLabel}${meta}`;
		}

		function render(width: number): string[] {
			if (cachedLines) return cachedLines;
			const rw = Math.max(1, width);
			const lines: string[] = [];
			lines.push(theme.fg("accent", "─".repeat(rw)));
			lines.push(
				...wrapTextWithAnsi(
					theme.fg("accent", `Allowed models for subagents  (${sel.size} pattern${sel.size === 1 ? "" : "s"} active)`),
					rw
				)
			);
			lines.push("");
			lines.push(theme.fg("muted", `  search: ${filter || ""}`));
			lines.push("");
			if (visible.length === 0) {
				lines.push(theme.fg("warning", "  No matching models"));
			} else {
				const start = Math.max(0, Math.min(selected - Math.floor(maxVisible / 2), visible.length - maxVisible));
				const end = Math.min(start + maxVisible, visible.length);
				for (let i = start; i < end; i++) lines.push(renderRow(visible[i], i, rw));
				if (start > 0 || end < visible.length) lines.push(theme.fg("dim", `  (${selected + 1}/${visible.length})`));
			}
			lines.push("");
			lines.push(
				...wrapTextWithAnsi(theme.fg("dim", "Type to filter • Space toggle • ↑↓ navigate • Enter save • Esc cancel"), rw)
			);
			lines.push(theme.fg("accent", "─".repeat(rw)));
			cachedLines = lines;
			return lines;
		}

		return { render, handleInput, invalidate: refresh };
	});
}

async function openModelPicker(ctx: ExtensionContext, config: SubagentConfig): Promise<boolean> {
	const models = collectModels(ctx);
	if (models.length === 0) {
		ctx.ui.notify("No models found in the registry (ctx.modelRegistry.getAvailable()).", "warning");
		return false;
	}
	const eff = effectiveAllowlist(config);
	const result = await runModelPicker(ctx, models, eff.patterns);
	if (!result) {
		ctx.ui.notify("Model picker cancelled.", "info");
		return false;
	}
	// Save into this session's own allowlist, clearing any force pin so the
	// explicit selection takes effect.
	ensureSessionState(ctx);
	if (currentState) currentState.allowlist = result;
	if (currentState) currentState.forceLoadout = undefined;
	persistState();
	const n = result.length;
	ctx.ui.notify(
		`Session allowlist updated${eff.source === "global" ? " (was using global default)" : ""}: ${n === 0 ? "all models allowed (set is empty)" : `${n} pattern(s): ${result.join(", ")}`}`,
		"info"
	);
	return true;
}

// --- Relay (send last output to another tab) --------------------------

interface SessionMessageLike {
	type: string;
	message?: { role?: string; content?: unknown };
}

interface RelayTarget {
	paneId: string;
	label: string;
}

function contentToText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((c) => {
				if (
					c &&
					typeof c === "object" &&
					(c as { type?: string }).type === "text" &&
					typeof (c as { text?: unknown }).text === "string"
				) {
					return (c as { text: string }).text;
				}
				return "";
			})
			.filter(Boolean)
			.join("\n")
			.trim();
	}
	return "";
}

function getLastAgentOutput(ctx: ExtensionContext): string {
	const entries = ctx.sessionManager.getEntries?.() ?? [];
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i] as SessionMessageLike | undefined;
		if (!entry || entry.type !== "message") continue;
		if (entry.message?.role !== "assistant") continue;
		const text = contentToText(entry.message.content);
		if (text) return text;
	}
	return "";
}

async function listRelayTargets(): Promise<RelayTarget[]> {
	const res = (await herdr(["agent", "list"])) as
		| { result?: { agents?: Array<{ pane_id?: unknown; terminal_title_stripped?: unknown; cwd?: unknown }> } }
		| undefined;
	const agents = res?.result?.agents ?? [];
	const selfPane = process.env.HERDR_PANE_ID;
	const seen = new Set<string>();
	const targets: RelayTarget[] = [];
	for (const a of agents) {
		const paneId = a?.pane_id;
		if (typeof paneId !== "string" || !paneId) continue;
		if (selfPane && paneId === selfPane) continue;
		const raw = a?.terminal_title_stripped || a?.cwd;
		let label = typeof raw === "string" && raw.trim() ? raw.trim() : paneId;
		if (seen.has(label)) label = `${label} (${paneId})`;
		seen.add(label);
		targets.push({ paneId, label });
	}
	return targets;
}

function composeRelayMessage(note: string, output: string): string {
	const clean = note.trim();
	return clean ? `${clean}\n\n${output}` : output;
}

/**
 * Fuzzy target picker: a search box + fuzzy-filtered list.
 * Search matches characters in order (case-insensitive) against the target's
 * terminal title and pane id, scored and ranked.
 * Returns the chosen pane id, or null on cancel.
 */
async function fuzzyTargetPicker(ctx: ExtensionContext, targets: RelayTarget[]): Promise<string | null> {
	interface Row {
		value: string;
		label: string;
		match: string;
	}
	const all: Row[] = targets.map((t) => ({ value: t.paneId, label: t.label, match: `${t.label} ${t.paneId}` }));

	return ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
		const search = new Input();
		try {
			search.focused = true;
		} catch {
			// focus is best-effort; input still works without it
		}
		let visible: Row[] = all;
		let selected = 0;
		const maxVisible = Math.max(1, Math.min(all.length, 10));
		let cachedLines: string[] | undefined;

		function recompute(query: string): void {
			const trimmed = query.trim();
			visible = trimmed ? fuzzyFilter(all, trimmed, (it) => it.match) : all;
			if (selected >= visible.length) selected = Math.max(0, visible.length - 1);
			if (selected < 0) selected = 0;
		}

		function refresh(): void {
			cachedLines = undefined;
			tui.requestRender();
		}

		function handleNavigation(data: string): boolean {
			if (matchesKey(data, Key.up)) {
				if (visible.length > 0) selected = (selected - 1 + visible.length) % visible.length;
				return true;
			}
			if (matchesKey(data, Key.down)) {
				if (visible.length > 0) selected = (selected + 1) % visible.length;
				return true;
			}
			if (matchesKey(data, Key.pageUp)) {
				selected = Math.max(0, selected - maxVisible);
				return true;
			}
			if (matchesKey(data, Key.pageDown)) {
				selected = Math.min(visible.length - 1, selected + maxVisible);
				return true;
			}
			if (matchesKey(data, Key.enter)) {
				const row = visible[selected];
				if (row) {
					done(row.value);
					return true;
				}
			}
			return false;
		}

		function handleInput(data: string): void {
			if (matchesKey(data, Key.escape)) {
				done(null);
				return;
			}
			if (handleNavigation(data)) {
				refresh();
				return;
			}
			search.handleInput(data);
			recompute(search.getValue());
			refresh();
		}

		function renderRow(row: Row, isSelected: boolean, width: number): string {
			const prefix = isSelected ? theme.fg("accent", "→ ") : "  ";
			const pane = theme.fg("muted", `  [${row.value}]`);
			const labelWidth = Math.max(1, width - visibleWidth(prefix) - visibleWidth(pane));
			const label = truncateToWidth(row.label, labelWidth, "…");
			return isSelected ? theme.fg("accent", `${prefix}${label}`) + pane : prefix + label + pane;
		}

		function render(width: number): string[] {
			if (cachedLines) return cachedLines;
			const rw = Math.max(1, width);
			const lines: string[] = [];
			lines.push(theme.fg("accent", "─".repeat(rw)));
			lines.push(...wrapTextWithAnsi(theme.fg("accent", "Send last output to:"), rw));
			lines.push("");
			lines.push(...search.render(Math.max(1, rw - 2)).map((l) => ` ${l}`));
			lines.push("");
			if (visible.length === 0) {
				lines.push(theme.fg("warning", "  No matching agents"));
			} else {
				const start = Math.max(0, Math.min(selected - Math.floor(maxVisible / 2), visible.length - maxVisible));
				const end = Math.min(start + maxVisible, visible.length);
				for (let i = start; i < end; i++) lines.push(renderRow(visible[i], i === selected, rw));
				if (start > 0 || end < visible.length) lines.push(theme.fg("dim", `  (${selected + 1}/${visible.length})`));
			}
			lines.push("");
			lines.push(...wrapTextWithAnsi(theme.fg("dim", "Type to fuzzy-filter • ↑↓ navigate • Enter select • Esc cancel"), rw));
			lines.push(theme.fg("accent", "─".repeat(rw)));
			cachedLines = lines;
			return lines;
		}

		return {
			render,
			handleInput,
			invalidate: () => {
				cachedLines = undefined;
			},
		};
	});
}

async function relayModal(
	ctx: ExtensionContext,
	target: RelayTarget,
	output: string
): Promise<{ note: string; inject: boolean } | null> {
	const previewLines = output.split("\n");

	return ctx.ui.custom<{ note: string; inject: boolean } | null>((tui, theme, _kb, done) => {
		const editorTheme: EditorTheme = {
			borderColor: (s) => theme.fg("accent", s),
			selectList: {
				selectedPrefix: (t) => theme.fg("accent", t),
				selectedText: (t) => theme.fg("accent", t),
				description: (t) => theme.fg("muted", t),
				scrollInfo: (t) => theme.fg("dim", t),
				noMatch: (t) => theme.fg("warning", t),
			},
		};
		const editor = new Editor(tui, editorTheme);
		let cachedLines: string[] | undefined;

		editor.onSubmit = (value) => {
			done({ note: value, inject: false });
		};

		function refresh(): void {
			cachedLines = undefined;
			tui.requestRender();
		}

		function handleInput(data: string): void {
			if (matchesKey(data, Key.escape)) {
				done(null);
				return;
			}
			if (matchesKey(data, "ctrl+j") || matchesKey(data, "ctrl+enter")) {
				done({ note: editor.getText(), inject: true });
				return;
			}
			editor.handleInput(data);
			refresh();
		}

		function render(width: number): string[] {
			if (cachedLines) return cachedLines;
			const rw = Math.max(1, width);
			const lines: string[] = [];
			function pushWrapped(text: string): void {
				lines.push(...wrapTextWithAnsi(text, rw));
			}
			lines.push(theme.fg("accent", "─".repeat(rw)));
			pushWrapped(theme.fg("accent", `Send last output to: ${target.label}`));
			lines.push("");
			pushWrapped(theme.fg("muted", `Last output (${previewLines.length} lines):`));
			const shown = previewLines.length > 15 ? [...previewLines.slice(previewLines.length - 15), "…"] : previewLines;
			for (const line of shown) pushWrapped(theme.fg("text", line));
			lines.push("");
			pushWrapped(theme.fg("muted", "Note / instruction (Enter to send):"));
			for (const line of editor.render(Math.max(1, rw - 2))) {
				lines.push(` ${line}`);
			}
			lines.push("");
			pushWrapped(
				theme.fg("dim", "Enter = send • Ctrl+j = send + bring back other tab's reply into this session • Esc = cancel")
			);
			lines.push(theme.fg("accent", "─".repeat(rw)));
			cachedLines = lines;
			return lines;
		}

		return {
			render,
			handleInput,
			invalidate: () => {
				cachedLines = undefined;
			},
		};
	});
}

async function runSend(ctx: ExtensionContext, pi: ExtensionAPI): Promise<void> {
	if (!isInHerdr()) {
		ctx.ui.notify("Not running inside a herdr-managed pane (HERDR_ENV=1 + HERDR_SOCKET_PATH required).", "error");
		return;
	}
	const output = getLastAgentOutput(ctx);
	if (!output) {
		ctx.ui.notify("No recent assistant output found to send.", "warning");
		return;
	}
	const targets = await listRelayTargets();
	if (targets.length === 0) {
		ctx.ui.notify("No other herdr agents found to send to.", "warning");
		return;
	}
	const chosen = await fuzzyTargetPicker(ctx, targets);
	if (!chosen) return;
	const target = targets.find((t) => t.paneId === chosen);
	if (!target) return;

	const result = await relayModal(ctx, target, output);
	if (!result) {
		ctx.ui.notify("Cancelled.", "info");
		return;
	}

	const message = composeRelayMessage(result.note, output);
	try {
		if (result.inject) {
			await injectResponseBack(ctx, pi, target, message);
		} else {
			await herdr(["agent", "prompt", target.paneId, message]);
			ctx.ui.notify(`Sent to ${target.label}.`, "info");
		}
	} catch (err) {
		ctx.ui.notify(`Send failed: ${(err as Error)?.message ?? err}`, "error");
	}
}

/**
 * Send a prompt to the target, wait for it to settle, read its recent output,
 * and feed that response back into the *sending* session as a steer/follow-up.
 */
async function injectResponseBack(ctx: ExtensionContext, pi: ExtensionAPI, target: RelayTarget, message: string): Promise<void> {
	ctx.ui.notify(`Sent to ${target.label}; waiting for its response…`, "info");
	try {
		await herdr(["agent", "prompt", target.paneId, message, "--wait", "--timeout", "600000"]);
	} catch (err) {
		ctx.ui.notify(
			`Prompt delivered to ${target.label} but waiting failed: ${(err as Error)?.message ?? err}. Still reading its output.`,
			"warning"
		);
	}

	const raw = await herdrRaw(["agent", "read", target.paneId, "--source", "recent", "--lines", "300", "--format", "text"]);
	const response = raw.trim();
	if (!response) {
		ctx.ui.notify(`Could not read a response from ${target.label}.`, "warning");
		return;
	}
	const responseTail = response.length > 6000 ? `${response.slice(-6000)}\n…(truncated)` : response;
	pi.sendUserMessage(`Response from ${target.label} (relayed from this tab's last output):\n\n${responseTail}`);
	ctx.ui.notify(`Injected ${target.label}'s response into this session.`, "info");
}

// --- subagent close / reset helpers -----------------------------------

function resolveTracked(token: string): TrackedSubagent | undefined {
	if (!currentState) return undefined;
	const t = currentState.subagents[token];
	if (t) return t;
	return Object.values(currentState.subagents).find((x) => x.name.endsWith(token));
}

async function closeSubagent(ctx: ExtensionContext, token: string): Promise<void> {
	const t = resolveTracked(token);
	if (!t) {
		ctx.ui.notify(`No subagent "${token}" is tracked by this session. See /subagent list.`, "error");
		return;
	}
	let tabId = t.tabId;
	try {
		if (!tabId) {
			const res = await herdr(["agent", "get", t.name]);
			tabId = res?.result?.tab_id ?? res?.tab_id ?? tabId;
		}
	} catch {
		// fall through: tabId may still be tracked
	}
	if (!tabId) {
		ctx.ui.notify(`Could not resolve a tab id for ${t.name} to close.`, "error");
		return;
	}
	await herdr(["tab", "close", tabId]);
	t.gone = true;
	recordOutcome(t, "closed");
	persistState();
	try {
		piNotify(ctx, `Subagent ${t.name} (${t.label}) was closed by the user.`);
	} catch {
		// ignore
	}
	ctx.ui.notify(`Closed subagent ${t.name} (tab ${tabId}).`, "info");
	stopNotifyTimer();
}

async function resetSubagent(ctx: ExtensionContext, token: string, instruction?: string): Promise<void> {
	const t = resolveTracked(token);
	if (!t) {
		ctx.ui.notify(`No subagent "${token}" is tracked by this session. See /subagent list.`, "error");
		return;
	}
	try {
		// interrupt current work if busy
		const status = t.status ?? (await fetchAgentStatusMap()).get(t.name);
		if (status === "working" || status === "blocked" || status === "unknown") {
			await herdr(["agent", "send-keys", t.name, "ctrl+c"]);
		}
		await herdr(["agent", "wait", t.name, "--until", "idle", "--timeout", "120000"]);
	} catch {
		// ignore; still mark reset
	}
	t.status = "idle";
	t.done = false;
	t.notified = false;
	t.gone = false;
	persistState();
	if (instruction) {
		await herdr(["agent", "prompt", t.name, instruction]);
		t.status = "working";
		persistState();
		startNotifyTimer(piRef, ctx);
		ctx.ui.notify(`Reset ${t.name} and re-prompted it.`, "info");
	} else {
		ctx.ui.notify(`Reset ${t.name} to idle; it can take a new task.`, "info");
	}
}

function piNotify(ctx: ExtensionContext, text: string): void {
	// attempt to feed a user message so the agent knows what happened
	try {
		piRef.sendUserMessage(text);
	} catch {
		// print/RPC mode: nothing to inject into
		ctx.ui.notify(text, "info");
	}
}

let piRef: ExtensionAPI;

export default function herdrTools(pi: ExtensionAPI) {
	piRef = pi;

	pi.on("session_start", async (_event, ctx) => {
		stopNotifyTimer();
		try {
			loadSessionState(ctx);
		} catch {
			// ignore
		}
		startNotifyTimer(pi, ctx);
		startEventSubscriber(pi);
	});

	pi.on("session_shutdown", async () => {
		stopNotifyTimer();
		stopEventSubscriber();
	});

	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description:
			"Manage subagents. Default action 'spawn' delegates a task to a NEW subagent in a fresh herdr tab (kind + model + optional loadout). 'list' shows this session's subagents. 'info' returns the available compute/cost/privacy catalog. Spawning is gated by config (enabled/model/kind/allowance) and per-session settings (allow mode).",
		promptSnippet: "subagent: spawn a subagent (default), list this session's subagents, or get available compute/cost/privacy.",
		parameters: SubagentToolParamsSchema,
		executionMode: "sequential",

		async execute(_toolCallId, params: SubagentToolParams, _signal, _onUpdate, ctx) {
			const action = params.action ?? "spawn";
			ensureSessionState(ctx);
			const config = loadConfig();
			const catalog = loadCatalog(ctx.cwd);

			if (action === "info") {
				const digest = buildCatalogDigest(catalog);
				const names = Object.keys(catalog.loadouts ?? {}).join(", ");
				return {
					content: [
						{
							type: "text",
							text: digest
								? `Available compute:\n${digest}${names ? `\n\nLoadouts: ${names}` : ""}`
								: "No model catalog configured.",
						},
					],
					details: { action },
				};
			}

			if (action === "list") {
				const subs = currentState ? Object.values(currentState.subagents) : [];
				const lines = subs.length
					? subs.map((t) => `  ${t.name} — ${t.status ?? "unknown"}${t.model ? ` (${t.model})` : ""}`).join("\n")
					: "No subagents spawned by this session.";
				return {
					content: [{ type: "text", text: `Subagents (${subs.length}):\n${lines}` }],
					details: { action, subagents: subs },
				};
			}

			// ---- spawn ----
			if (!isInHerdr()) {
				return {
					content: [
						{ type: "text", text: "Error: not running inside a herdr-managed pane (HERDR_ENV=1 + HERDR_SOCKET_PATH required)." },
					],
					details: { spawned: false },
				};
			}
			if (!config.enabled) {
				return {
					content: [
						{
							type: "text",
							text: "Error: subagent spawning is DISABLED (config 'enabled' is false). Run /subagent on to allow it.",
						},
					],
					details: { spawned: false },
				};
			}
			if (!params.task) {
				return { content: [{ type: "text", text: "Error: 'task' is required to spawn." }], details: { spawned: false } };
			}

			const kind = params.kind ?? catalog.policy?.defaultKind ?? "pi";
			let model = params.model;

			if (params.loadout) {
				const ids = new Set(resolveLoadoutModelIds(catalog, params.loadout));
				const kinds = new Set(resolveLoadoutKinds(catalog, params.loadout));
				if (!model) model = `${ctx.model?.provider ?? ""}/${ctx.model?.id ?? ""}`;
				const allowed = kind === "pi" ? ids.has(model) : ids.size === 0 ? kinds.has(kind) : false;
				if (!allowed) {
					return {
						content: [
							{
								type: "text",
								text: `Error: (model "${model}", kind "${kind}") not allowed by loadout "${params.loadout}". Allowed models: ${[...ids].join(", ") || "(none)"}; kinds: ${[...kinds].join(", ") || "(none)"}.`,
							},
						],
						details: { spawned: false },
					};
				}
			} else {
				if (!model) model = `${ctx.model?.provider ?? ""}/${ctx.model?.id ?? ""}`;
				const eff = effectiveAllowlist(config);
				if (!allowedBy(eff.patterns, model)) {
					return {
						content: [
							{
								type: "text",
								text: `Error: model "${model}" is not in the allowlist (${eff.source}). Allowed: ${eff.patterns.join(", ") || "(none)"}.`,
							},
						],
						details: { spawned: false },
					};
				}
				if (kind !== "pi" && !config.allowedKinds.includes(kind)) {
					return {
						content: [
							{
								type: "text",
								text: `Error: kind "${kind}" is not allowed (allowedKinds: ${config.allowedKinds.join(", ")}). Add it to subagent-config.json or pick a loadout.`,
							},
						],
						details: { spawned: false },
					};
				}
			}

			const maxN = sessionMaxSubagents(config);
			const active = await countSubagents();
			if (maxN > 0 && active >= maxN) {
				return {
					content: [
						{
							type: "text",
							text: `Error: subagent allowance reached (${active}/${maxN}). Run /subagent max <n> to raise it, or /subagent close <name> to free a slot.`,
						},
					],
					details: { spawned: false },
				};
			}

			const cwd = params.cwd ?? ctx.cwd;
			const label = params.tabLabel ?? (params.task.replace(/\s+/g, " ").slice(0, 28).trim() || "subagent");
			const detail = `Tab: ${label}\nKind: ${kind}\nModel: ${model}\nCwd: ${cwd}\n\nTask:\n${params.task.slice(0, 400)}${params.task.length > 400 ? "\n…" : ""}`;
			const ok = await approveSpawn(ctx, config, detail);
			if (!ok) return { content: [{ type: "text", text: "Spawn cancelled by the user." }], details: { spawned: false } };

			const name = randomName();
			const tabRes = await herdr(["tab", "create", "--label", label, "--cwd", cwd, "--no-focus"]);
			const paneId = tabRes?.result?.root_pane?.pane_id;
			const tabId = tabRes?.result?.tab?.tab_id;
			if (!paneId) {
				return {
					content: [{ type: "text", text: `Error: herdr tab create failed. Response: ${JSON.stringify(tabRes).slice(0, 500)}` }],
					details: { spawned: false },
				};
			}

			const startArgs = kind === "pi" ? ["--", "--model", model] : [];
			const startRes = await herdr(["agent", "start", name, "--kind", kind, "--pane", paneId, ...startArgs]);
			if (startRes?.error || !startRes?.result?.agent?.name) {
				return {
					content: [
						{ type: "text", text: `Error: herdr agent start failed. Response: ${JSON.stringify(startRes).slice(0, 500)}` },
					],
					details: { spawned: false },
				};
			}

			trackSubagent(ctx, { name, paneId, tabId, model, kind, label, cwd, spawnedAt: Date.now(), status: "idle" });

			const promptRes = await herdr(["agent", "prompt", name, params.task]);
			const promptOk = !promptRes?.error;
			startNotifyTimer(pi, ctx);
			if (!promptOk) {
				return {
					content: [
						{
							type: "text",
							text: `Subagent started but prompt submit reported an error (${JSON.stringify(promptRes).slice(0, 300)}). It may still be idle; read it via: herdr agent read ${name}`,
						},
					],
					details: { spawned: true, name, tabId, paneId, kind, model },
				};
			}

			return {
				content: [
					{
						type: "text",
						text: `Subagent spawned and task submitted.\n\n  agent: ${name}\n  kind: ${kind}\n  model: ${model}\n  tab:  ${tabId}\n  pane: ${paneId}\n  cwd:  ${cwd}\n\nYou will be notified here automatically when it finishes.\nMonitor: herdr agent read ${name} --format text\nWait:   herdr agent wait ${name} --until idle`,
					},
				],
				details: { spawned: true, name, tabId, paneId, kind, model },
			};
		},
	});

	// ---- /subagent command: config + per-session settings + status ----
	pi.registerCommand("subagent", {
		description:
			"Manage subagent delegation: on/off, per-session allow mode (auto/confirm/timeout), auto decision, allowance, close/reset, model picker + loadouts, status.",
		handler: async (args, ctx) => {
			ensureSessionState(ctx);
			const argv = (args ?? "").trim().split(/\s+/).filter(Boolean);
			const config = loadConfig();

			if (argv[0] === "on") {
				config.enabled = true;
				saveConfig(config);
				ctx.ui.notify("Subagent spawning enabled.", "info");
				return;
			}
			if (argv[0] === "off") {
				config.enabled = false;
				saveConfig(config);
				ctx.ui.notify("Subagent spawning disabled.", "info");
				return;
			}
			if (argv[0] === "mode") {
				const mode = asAllowMode(argv[1]);
				if (!mode) {
					ctx.ui.notify("Usage: /subagent mode <auto|confirm|timeout>", "error");
					return;
				}
				if (currentState) currentState.allowMode = mode;
				persistState();
				ctx.ui.notify(`This session's allow mode: ${mode}`, "info");
				return;
			}
			if (argv[0] === "confirm" || argv[0] === "noconfirm") {
				const mode: AllowMode = argv[0] === "confirm" ? "confirm" : "auto";
				if (currentState) currentState.allowMode = mode;
				persistState();
				ctx.ui.notify(`This session's allow mode: ${mode}`, "info");
				return;
			}
			if (argv[0] === "decide") {
				const d = asAutoDecision(argv[1]);
				if (!d) {
					ctx.ui.notify("Usage: /subagent decide <allow|deny>", "error");
					return;
				}
				if (currentState) currentState.autoDecision = d;
				persistState();
				ctx.ui.notify(`On timeout, this session will auto-${d}.`, "info");
				return;
			}
			if (argv[0] === "timeout") {
				const ms = Number.parseInt(argv[1] ?? "", 10);
				if (!Number.isFinite(ms) || ms <= 0) {
					ctx.ui.notify("Usage: /subagent timeout <ms> (e.g. 30000)", "error");
					return;
				}
				if (currentState) currentState.confirmTimeoutMs = ms;
				persistState();
				ctx.ui.notify(`Timed confirm waits ${ms}ms before auto-deciding.`, "info");
				return;
			}
			if (argv[0] === "max") {
				if (argv[1] === "default") {
					if (currentState) currentState.maxSubagents = undefined;
					persistState();
					ctx.ui.notify(`This session falls back to the default allowance (${config.maxSubagents}).`, "info");
					return;
				}
				const n = Number.parseInt(argv[1] ?? "", 10);
				if (!Number.isFinite(n) || n < 0) {
					ctx.ui.notify("Usage: /subagent max <n> (0 = unlimited) or /subagent max default", "error");
					return;
				}
				if (currentState) currentState.maxSubagents = n;
				persistState();
				ctx.ui.notify(`This session's allowance: ${n}${n === 0 ? " (unlimited)" : ""}.`, "info");
				return;
			}
			if (argv[0] === "list") {
				await listSubagents(ctx);
				return;
			}
			if (argv[0] === "history") {
				await showSubagentHistory(ctx);
				return;
			}
			if (argv[0] === "close") {
				if (!argv[1]) {
					ctx.ui.notify("Usage: /subagent close <name>", "error");
					return;
				}
				await closeSubagent(ctx, argv[1]);
				return;
			}
			if (argv[0] === "reset") {
				if (!argv[1]) {
					ctx.ui.notify("Usage: /subagent reset <name> [task]", "error");
					return;
				}
				await resetSubagent(ctx, argv[1], argv.slice(2).join(" ") || undefined);
				return;
			}
			if (argv[0] === "models") {
				await handleModelsCommand(ctx, config, argv.slice(1));
				return;
			}

			// default: status
			const active = await countSubagents();
			const mode = sessionAllowMode(config);
			const decision = sessionAutoDecision(config);
			const timeout = sessionConfirmTimeout(config);
			const maxN = sessionMaxSubagents(config);
			const tracked = currentState ? Object.keys(currentState.subagents).length : 0;
			const eff = effectiveAllowlist(config);
			ctx.ui.notify(
				[
					`Subagent config: enabled=${config.enabled}`,
					`allowMode=${mode}${mode === "timeout" ? ` (auto-${decision} after ${timeout}ms)` : ""}`,
					`max=${maxN}${maxN === 0 ? " (unlimited)" : ""}`,
					`active=${active}`,
					`tracked=${tracked}`,
					`Allowlist [${eff.source}]: ${eff.patterns.length ? eff.patterns.join(", ") : "(all)"}`,
					`Loadouts: local=${Object.keys(currentState?.loadouts ?? {}).join(", ") || "(none)"} | global=${Object.keys(config.loadouts).join(", ") || "(none)"}${sessionAllowGlobalLoadouts() ? "" : " [global off]"}${currentState?.forceLoadout ? ` | force=${currentState.forceLoadout}` : ""}`,
				].join("\n"),
				"info"
			);
		},
	});

	// ---- model allowlist + loadouts ----
	function handleModelsCommand(ctx: ExtensionContext, config: SubagentConfig, rest: string[]): Promise<void> {
		return (async () => {
			if (rest.length === 0 || rest[0] === "picker" || rest[0] === "select") {
				await openModelPicker(ctx, config);
				return;
			}
			if (rest[0] === "add" && rest[1]) {
				const list = ensureSessionAllowlist(config);
				list.push(rest[1]);
				clearForceLoadout();
				persistState();
				ctx.ui.notify(`Session allowlist pattern added: ${rest[1]}`, "info");
				return;
			}
			if (rest[0] === "remove" && rest[1]) {
				const list = ensureSessionAllowlist(config);
				if (currentState) currentState.allowlist = list.filter((p) => p !== rest[1]);
				clearForceLoadout();
				persistState();
				ctx.ui.notify(`Removed session allowlist pattern: ${rest[1]}`, "info");
				return;
			}
			if (rest[0] === "clear") {
				if (currentState) currentState.allowlist = [];
				clearForceLoadout();
				persistState();
				ctx.ui.notify("Session allowlist cleared (all models allowed).", "info");
				return;
			}
			if (rest[0] === "allow-global") {
				const v = rest[1];
				if (v !== "on" && v !== "off") {
					ctx.ui.notify("Usage: /subagent models allow-global <on|off>", "error");
					return;
				}
				if (currentState) currentState.allowGlobalLoadouts = v === "on";
				persistState();
				ctx.ui.notify(`Global loadouts ${v === "on" ? "allowed" : "disallowed"} for this session.`, "info");
				return;
			}
			if (rest[0] === "force") {
				const name = rest[1];
				if (!name || name === "off" || name === "none") {
					clearForceLoadout();
					persistState();
					ctx.ui.notify("Force cleared; the session uses its own allowlist.", "info");
					return;
				}
				const pats = resolveLoadout(name, config);
				if (!pats) {
					ctx.ui.notify(`Loadout "${name}" is not resolvable (local first, then global if allowed).`, "error");
					return;
				}
				if (currentState) currentState.forceLoadout = name;
				persistState();
				ctx.ui.notify(
					`This session is pinned to loadout "${name}" (${pats.length} pattern(s)). Open the picker to override.`,
					"info"
				);
				return;
			}
			if (rest[0] === "list") {
				const eff = effectiveAllowlist(config);
				const local = currentState?.loadouts ?? {};
				const global = config.loadouts ?? {};
				const force = currentState?.forceLoadout;
				const allowGlobal = sessionAllowGlobalLoadouts();
				ctx.ui.notify(
					[
						`Effective allowlist [${eff.source}]${eff.source === `loadout:${force}` ? " (forced)" : ""}: ${eff.patterns.length ? eff.patterns.join(", ") : "(all)"}`,
						`allow-global: ${allowGlobal ? "yes" : "no"}${force ? ` • force: ${force}` : ""}`,
						`Local loadouts: ${Object.keys(local).length ? Object.keys(local).join(", ") : "(none)"}`,
						`Global loadouts${allowGlobal ? "" : " [disabled]"}: ${Object.keys(global).length ? Object.keys(global).join(", ") : "(none)"}`,
					].join("\n"),
					"info"
				);
				return;
			}
			if (rest[0] === "loadout") {
				const action = rest[1];
				const name = rest[2];
				const scope = rest[3] === "global" ? "global" : "local";
				if (action === "save" && name) {
					const pats = effectiveAllowlist(config).patterns;
					if (scope === "global") {
						config.loadouts[name] = [...pats];
						saveConfig(config);
						ctx.ui.notify(`Saved global loadout "${name}" (${pats.length} pattern(s)).`, "info");
					} else {
						if (!currentState) currentState = { sessionId: "ephemeral", subagents: {} };
						if (!currentState.loadouts) currentState.loadouts = {};
						currentState.loadouts[name] = [...pats];
						persistState();
						ctx.ui.notify(`Saved local loadout "${name}" (${pats.length} pattern(s)).`, "info");
					}
					return;
				}
				if (action === "load" && name) {
					const pats = resolveLoadout(name, config);
					if (!pats) {
						ctx.ui.notify(
							`No loadout named "${name}" (local first, then global if allowed). See /subagent models list.`,
							"error"
						);
						return;
					}
					if (!currentState) currentState = { sessionId: "ephemeral", subagents: {} };
					currentState.allowlist = [...pats];
					clearForceLoadout();
					persistState();
					ctx.ui.notify(`Applied loadout "${name}" (${pats.length} pattern(s)) to this session.`, "info");
					return;
				}
				if (action === "delete" && name) {
					if (scope === "global") {
						delete config.loadouts[name];
						saveConfig(config);
						ctx.ui.notify(`Deleted global loadout "${name}".`, "info");
					} else {
						if (currentState?.loadouts) delete currentState.loadouts[name];
						persistState();
						ctx.ui.notify(`Deleted local loadout "${name}".`, "info");
					}
					return;
				}
				if (action === "list") {
					const local = currentState?.loadouts ?? {};
					const global = config.loadouts ?? {};
					const localStr = Object.keys(local).length
						? Object.entries(local)
								.map(([k, v]) => `  ${k}: ${v.join(", ")}`)
								.join("\n")
						: "  (none)";
					const globalStr = Object.keys(global).length
						? Object.entries(global)
								.map(([k, v]) => `  ${k}: ${v.join(", ")}`)
								.join("\n")
						: "  (none)";
					ctx.ui.notify(`Local loadouts:\n${localStr}\n\nGlobal loadouts\n${globalStr}`, "info");
					return;
				}
				ctx.ui.notify("Usage: /subagent models loadout <save|load|delete|list> [name] [local|global]", "error");
				return;
			}
			ctx.ui.notify(
				"Usage: /subagent models [picker|add <glob>|remove <glob>|list|clear|allow-global <on|off>|force <name>|off|loadout <save|load|delete|list> [name] [local|global]]",
				"error"
			);
		})();
	}

	async function listSubagents(ctx: ExtensionContext): Promise<void> {
		const tracked = currentState ? Object.values(currentState.subagents) : [];
		if (tracked.length === 0) {
			ctx.ui.notify("This session has not spawned any subagents.", "info");
			return;
		}
		const lines = tracked.map((t) => {
			const state = t.gone ? "closed" : t.done ? "done" : (t.status ?? "unknown");
			const ended = t.endedAt ? ` · ended ${new Date(t.endedAt).toISOString().slice(0, 19).replace("T", " ")}` : "";
			return `${t.name}  [${state}]  ${t.label}  (${t.model})${ended}`;
		});
		ctx.ui.notify(`Subagents spawned by this session:\n${lines.join("\n")}`, "info");
	}

	// ---- /subagent history: durable record of finished/closed subagents ----
	async function showSubagentHistory(ctx: ExtensionContext): Promise<void> {
		const hist = (currentState?.history ?? []).slice().sort((a, b) => b.endedAt - a.endedAt);
		if (hist.length === 0) {
			ctx.ui.notify("No finished/closed subagents recorded yet.", "info");
			return;
		}
		const lines = hist.map((h) => {
			const end = new Date(h.endedAt).toISOString().slice(0, 19).replace("T", " ");
			return `${h.name}  [${h.outcome}]  ${h.label}  (${h.model})  ended ${end}`;
		});
		ctx.ui.notify(`Finished/closed subagents (${hist.length}):\n${lines.join("\n")}`, "info");
	}

	// ---- /side and /btw: open the current session in its own new tab ----
	const registerSide = (name: string) => {
		pi.registerCommand(name, {
			description: `Fork the CURRENT session into a new named herdr tab and open pi there, so you can steer it in a different direction (like Claude /btw or Codex /side, but in its own tab). Usage: /${name} [label] [--model M] [instruction...].`,
			handler: async (args, ctx) => {
				// parse: optional --model M, first bare token = label, rest = instruction
				const tokens = (args ?? "").trim().split(/\s+/).filter(Boolean);
				let model: string | undefined;
				let label: string;
				let instruction: string | undefined;

				const rest: string[] = [];
				let i = 0;
				while (i < tokens.length) {
					if (tokens[i] === "--model" && i + 1 < tokens.length) {
						model = tokens[i + 1];
						i += 2;
					} else {
						rest.push(tokens[i]);
						i++;
					}
				}

				if (rest.length === 0) {
					ctx.ui.notify(
						`Usage: /side [label] [--model M] [instruction...] — e.g. /side fix-bugs --model openai/gpt-5 "Fix the tests then report."`,
						"error"
					);
					return;
				}

				label = rest[0].replace(/[^a-zA-Z0-9 _\-.]/g, "-").slice(0, 40) || "side";
				instruction = rest.slice(1).join(" ") || undefined;

				try {
					const result = await openSideTab({ ctx, label, model, instruction });
					ctx.ui.notify(
						`Opened side session in its own tab.\n  agent: ${result.name}\n  tab: ${result.tabId}\n  pane: ${result.paneId}\nIt is forked from the current session (pi --fork); steer it any direction.`,
						"info"
					);
				} catch (err: any) {
					ctx.ui.notify(`Side tab failed: ${err?.message ?? err}`, "error");
				}
			},
		});
	};
	registerSide("side");
	registerSide("btw");

	pi.registerCommand("send", {
		description:
			"Send this agent's last response to another herdr tab, optionally with a note. Fuzzy-pick the target, type a note; Enter sends, Ctrl+j sends and brings back that tab's reply into this session as a follow-up (Esc cancels).",
		handler: async (_args, ctx) => {
			await runSend(ctx, pi);
		},
	});
	pi.registerCommand("relay", {
		description: "Alias of /send: copy this agent's last response and forward it to another herdr tab with an optional note.",
		handler: async (_args, ctx) => {
			await runSend(ctx, pi);
		},
	});
}
