/**
 * Configuration loading for pi-history-search.
 *
 * Searched in order (first match wins), matching the repo convention:
 *   1. ./history-search.json                 (cwd)
 *   2. ./.pi/history-search.json             (project-local)
 *   3. ~/.pi/agent/history-search.json       (global)
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Context-overflow guard settings. The guard measures how much context window
 * is left and truncates a tool result (with a warning) when it would otherwise
 * blow the budget — so a huge HistoryRead can never silently overflow the turn.
 */
export interface ContextGuardConfig {
	/** Master switch for the guard. When false, results are returned unbounded. */
	enabled: boolean;
	/** Approximate characters per token, for char→token budget math. Default 4. */
	charsPerToken: number;
	/**
	 * Max fraction of the *remaining* context window a single result may consume
	 * (0–1). The other half stays free for the actual conversation. Default 0.5.
	 */
	maxContextFraction: number;
	/** Hard absolute cap on returned chars, regardless of remaining context. Default 60000. */
	maxResultChars: number;
	/** Floor for the per-result char budget, so tiny remaining windows still yield a usable sliver. Default 4000. */
	minResultChars: number;
}

export const DEFAULT_CONTEXT_GUARD: ContextGuardConfig = {
	enabled: true,
	charsPerToken: 4,
	maxContextFraction: 0.5,
	maxResultChars: 60_000,
	minResultChars: 4_000,
};

export interface HistorySearchConfig {
	/** Master switch. When false, the tools return a disabled notice. */
	enabled: boolean;
	/**
	 * Override for pi's sessions base directory. When null, resolves from
	 * `$PI_SESSIONS_DIR` then `~/.pi/agent/sessions`. Supports a leading `~`.
	 */
	sessionsDir: string | null;
	/** Run an incremental index of the current project on session_start. */
	indexOnStart: boolean;
	/** Index tool-result messages too (larger index, more recall). */
	includeToolResults: boolean;
	/** Default number of sessions returned by HistorySearch. */
	maxResults: number;
	/** Snippets returned per matching session. */
	snippetsPerSession: number;
	/**
	 * Exclude the current (live) session from HistorySearch results by default —
	 * it's already in the agent's context, so returning it is noise. Default true.
	 */
	excludeCurrentSession: boolean;
	/** Optional manual aliases keyed by branch/session id. */
	branchAliases: Record<string, string>;
	/** Context-overflow guard: truncate large results to fit the remaining context window. */
	contextGuard: ContextGuardConfig;
}

const CONFIG_FILENAME = "history-search.json";

export const DEFAULT_CONFIG: HistorySearchConfig = {
	enabled: true,
	sessionsDir: null,
	indexOnStart: true,
	includeToolResults: true,
	maxResults: 10,
	snippetsPerSession: 3,
	excludeCurrentSession: true,
	branchAliases: {},
	contextGuard: DEFAULT_CONTEXT_GUARD,
};

/** Merge a partial user config onto the defaults, deep-merging nested objects (contextGuard). */
function mergeConfig(user: Partial<HistorySearchConfig>): HistorySearchConfig {
	return {
		...DEFAULT_CONFIG,
		...user,
		contextGuard: { ...DEFAULT_CONTEXT_GUARD, ...(user.contextGuard ?? {}) },
	};
}

export function loadConfig(cwd: string): HistorySearchConfig {
	const paths = [join(cwd, CONFIG_FILENAME), join(cwd, ".pi", CONFIG_FILENAME), join(homedir(), ".pi", "agent", CONFIG_FILENAME)];

	for (const configPath of paths) {
		if (!existsSync(configPath)) continue;
		try {
			const userConfig = JSON.parse(readFileSync(configPath, "utf-8")) as Partial<HistorySearchConfig>;
			return mergeConfig(userConfig);
		} catch {
			// Invalid JSON — fall through to the next candidate.
		}
	}

	return DEFAULT_CONFIG;
}

/** Expand a leading `~` to the user's home directory. */
export function expandHome(p: string): string {
	if (p === "~") return homedir();
	if (p.startsWith("~/")) return join(homedir(), p.slice(2));
	return p;
}

/**
 * Resolve pi's sessions base directory.
 * Precedence: explicit config → $PI_SESSIONS_DIR → ~/.pi/agent/sessions.
 */
export function resolveSessionsBase(config: HistorySearchConfig): string {
	if (config.sessionsDir) return expandHome(config.sessionsDir);
	const env = process.env.PI_SESSIONS_DIR;
	if (env) return expandHome(env);
	return join(homedir(), ".pi", "agent", "sessions");
}
