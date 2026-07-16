/**
 * pi-history-search — let the agent search its own session history.
 *
 * Registers two LLM-callable tools:
 *   - HistorySearch: full-text search over past sessions (FTS5, BM25-ranked).
 *   - HistoryRead:   pull fuller context from a specific past session.
 *
 * The index is a SQLite FTS5 database colocated inside each project's session
 * directory (`<base>/--{cwd}--/.pi-history/index.db`), so it is reachable
 * exactly when the sessions it indexes are — which keeps an oqto sandbox's
 * "own sessions only" restriction intact, and works identically with no
 * sandbox at all. See indexer.ts for the rationale.
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { AgentToolResult, ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { type HistorySearchConfig, loadConfig, resolveSessionsBase } from "./config.js";
import { type GuardOutcome, applyGuard, computeBudget } from "./context-guard.js";
import {
	type GrepResult,
	type HistoryHit,
	type ReadResult,
	type RoleFilter,
	branchScopeSessionIds,
	closeAll,
	findSessionPath,
	getStats,
	grepSession,
	listBranchesInProject,
	listProjectDirs,
	listRecent,
	projectDir,
	readSession,
	rebuildProjectIndex,
	searchProject,
	updateProjectIndex,
} from "./indexer.js";
import { HistoryOverlay } from "./overlay.js";

// ── Tool parameter schemas ───────────────────────────────────────────

const HistorySearchParams = Type.Object({
	query: Type.Optional(
		Type.String({
			description:
				"Search terms, matched full-text (BM25-ranked). Omit or leave empty to list the most recent sessions (use this for 'what did we do here / recently').",
		})
	),
	scope: Type.Optional(
		StringEnum(["project", "all", "current-tree", "current-branch", "siblings", "ancestors", "descendants"] as const, {
			description:
				"'project' (default) searches current project history. 'all' spans accessible projects. Branch-aware scopes: 'current-tree', 'current-branch', 'siblings', 'ancestors', 'descendants'.",
		})
	),
	project: Type.Optional(
		Type.String({ description: "When scope='all', only return sessions whose project label contains this string." })
	),
	roleFilter: Type.Optional(
		StringEnum(["all", "conversation", "user", "assistant", "tool"] as const, {
			description:
				"Which message roles to search. Default 'conversation' (user+assistant) — best signal for 'what did we do'. Use 'all' to also search tool output (error messages, file paths, command output), or 'tool' for only that.",
		})
	),
	limit: Type.Optional(Type.Number({ description: "Max sessions to return (default from config, usually 10)." })),
});

const HistoryBranchesParams = Type.Object({
	scope: Type.Optional(
		StringEnum(["current-tree", "project"] as const, {
			description: "Branch listing scope. 'current-tree' default limits to current session tree, 'project' lists all in project.",
		})
	),
	grep: Type.Optional(Type.String({ description: "Optional text filter across branch id/alias/previews/files/commands." })),
	limit: Type.Optional(Type.Number({ description: "Maximum branches to return (default 50)." })),
});

const HistoryReadParams = Type.Object({
	sessionId: Type.Optional(Type.String({ description: "Session id from a HistorySearch result." })),
	branchId: Type.Optional(Type.String({ description: "Read by branch id (same as session id for branches)." })),
	query: Type.Optional(
		Type.String({ description: "Return only messages in this session matching these terms (with the message text)." })
	),
	around: Type.Optional(
		Type.Number({ description: "Return a window of messages centered on this msgIndex (from a HistorySearch match)." })
	),
	before: Type.Optional(
		Type.Number({ description: "Messages before `around`, or context before each query match (default 3 around, 2 query)." })
	),
	after: Type.Optional(
		Type.Number({ description: "Messages after `around`, or context after each query match (default 3 around, 2 query)." })
	),
	view: Type.Optional(
		StringEnum(["outline", "transcript"] as const, {
			description:
				"Whole-session rendering (ignored with `around`/`query`). Default 'outline' = conversation only (user+assistant), tool noise dropped — compact recall. 'transcript' = every non-empty message.",
		})
	),
	roleFilter: Type.Optional(
		StringEnum(["all", "conversation", "user", "assistant", "tool"] as const, {
			description:
				"Restrict returned roles (query mode, or override the outline/transcript default). E.g. 'tool' to inspect only tool output.",
		})
	),
	maxChars: Type.Optional(Type.Number({ description: "Per-message character cap. Default 2000." })),
	maxMessages: Type.Optional(
		Type.Number({ description: "Maximum messages returned. Default 40 for query, 80 for whole-session reads." })
	),
	maxTotalChars: Type.Optional(
		Type.Number({ description: "Total character budget across all returned messages. Default 16000 for query reads." })
	),
});

const HistoryGrepParams = Type.Object({
	sessionId: Type.Optional(
		Type.String({ description: "Session id from a HistorySearch result (the session to search inside)." })
	),
	branchId: Type.Optional(Type.String({ description: "Read by branch id (same as session id for branches)." })),
	pattern: Type.String({
		description:
			"Substring or regular expression to search for within the session. Exact and case-aware, so it catches code identifiers, stack traces, and error strings that tokenized search (HistorySearch) may miss.",
	}),
	regex: Type.Optional(
		Type.Boolean({ description: "Treat `pattern` as a JavaScript regular expression. Default false (literal substring)." })
	),
	ignoreCase: Type.Optional(Type.Boolean({ description: "Case-insensitive match. Default true." })),
	roleFilter: Type.Optional(
		StringEnum(["all", "conversation", "user", "assistant", "tool"] as const, {
			description: "Restrict which message roles are scanned. Default 'all'.",
		})
	),
	before: Type.Optional(
		Type.Number({
			description: "Include this many full messages before each match (for context). Default 0 (surgical: matches only).",
		})
	),
	after: Type.Optional(
		Type.Number({ description: "Include this many full messages after each match (for context). Default 0 (surgical)." })
	),
	maxMatches: Type.Optional(Type.Number({ description: "Maximum match snippets returned. Default 50." })),
	maxChars: Type.Optional(
		Type.Number({ description: "Per-message character cap for context messages (when before/after > 0). Default 1000." })
	),
});

// ── Formatting helpers ───────────────────────────────────────────────

function formatTs(ts: string): string {
	if (!ts) return "unknown time";
	const d = new Date(ts);
	if (Number.isNaN(d.getTime())) return ts.slice(0, 16);
	return d.toISOString().slice(0, 16).replace("T", " ");
}

function shortId(id: string): string {
	return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function formatHits(query: string | undefined, scope: string, hits: HistoryHit[]): string {
	const q = query?.trim() ?? "";
	if (hits.length === 0) {
		return q ? `No past sessions matched "${q}" (scope: ${scope}).` : `No sessions found (scope: ${scope}).`;
	}
	const header = q
		? `Found ${hits.length} session(s) for "${q}" (scope: ${scope}):`
		: `${hits.length} most recent session(s) (scope: ${scope}):`;
	const lines: string[] = [header, ""];
	hits.forEach((h, i) => {
		lines.push(`[${i + 1}] ${h.project} · ${formatTs(h.timestamp)} · sessionId=${h.sessionId}`);
		if (h.branch) {
			lines.push(
				`    branch=${h.branch.alias ? `${h.branch.alias} (${h.branch.branchId})` : h.branch.branchId} parent=${h.branch.parentBranchId ?? "-"} root=${h.branch.rootSessionId} forkMsg=${h.branch.forkMsgIndex ?? "-"}`
			);
			lines.push(
				`    created=${formatTs(h.branch.createdAt)} updated=${formatTs(h.branch.updatedAt)} cwd=${h.branch.cwd} lastCwd=${h.branch.lastCwd} messages=${h.branch.messageCount}`
			);
			if (h.branch.lastUserPreview) lines.push(`    last user: ${h.branch.lastUserPreview}`);
			if (h.branch.lastAssistantPreview) lines.push(`    last assistant: ${h.branch.lastAssistantPreview}`);
			if (h.branch.recentFiles.length > 0) lines.push(`    files: ${h.branch.recentFiles.join(", ")}`);
			if (h.branch.recentCommands.length > 0) lines.push(`    commands: ${h.branch.recentCommands.join(" | ")}`);
		}
		if (h.sessionName) lines.push(`    name: ${h.sessionName.slice(0, 120)}`);
		if (h.title) lines.push(`    title: ${h.title.slice(0, 120)}`);
		for (const m of h.matches) {
			lines.push(`    ${m.role} (msg ${m.msgIndex}): ${m.snippet}`);
		}
		lines.push("");
	});
	lines.push(
		"Use HistoryRead{sessionId, around: <msg>} to expand a hit, or HistoryRead{sessionId, query} to pull all matches from a session."
	);
	return lines.join("\n").trimEnd();
}

function formatBranches(
	branches: ReturnType<typeof listBranchesInProject>["branches"],
	scope: "current-tree" | "project"
): string {
	if (branches.length === 0) return `No branches found (scope: ${scope}).`;
	const lines = [`${branches.length} branch(es) (scope: ${scope}):`, ""];
	for (const b of branches) {
		lines.push(
			`- ${b.alias ? `${b.alias} (${b.branchId})` : b.branchId} parent=${b.parentBranchId ?? "-"} root=${b.rootSessionId} forkMsg=${b.forkMsgIndex ?? "-"}`
		);
		lines.push(`  updated=${formatTs(b.updatedAt)} messages=${b.messageCount} cwd=${b.cwd}`);
		if (b.lastUserPreview) lines.push(`  last user: ${b.lastUserPreview}`);
		if (b.lastAssistantPreview) lines.push(`  last assistant: ${b.lastAssistantPreview}`);
		if (b.recentFiles.length > 0) lines.push(`  files: ${b.recentFiles.join(", ")}`);
		if (b.recentCommands.length > 0) lines.push(`  commands: ${b.recentCommands.join(" | ")}`);
		lines.push("");
	}
	return lines.join("\n").trimEnd();
}

function formatRead(r: ReadResult): string {
	const head = `Session ${shortId(r.sessionId)} · ${r.project} · ${formatTs(r.timestamp)} · ${r.totalMessages} messages · mode=${r.mode}`;
	if (r.messages.length === 0) {
		return `${head}\n(no matching messages)`;
	}
	const body = r.messages.map((m) => `[msg ${m.msgIndex}] ${m.role}:\n${m.text}`).join("\n\n");
	const notes: string[] = [];
	if (r.truncated) notes.push("some messages truncated — raise maxChars/maxTotalChars or narrow with roleFilter");
	if (r.omittedMessages)
		notes.push(
			`${r.omittedMessages} additional matching/eligible message(s) omitted — use around:<msgIndex> or raise maxMessages`
		);
	const tail = notes.length ? `\n\n(${notes.join("; ")})` : "";
	return `${head}\n\n${body}${tail}`;
}

function formatGrep(r: GrepResult): string {
	const mode = `${r.regex ? "regex" : "literal"} / ${r.ignoreCase ? "i" : "exact"} / roles=${r.roleFilter}`;
	const head = `Session ${shortId(r.sessionId)} · ${r.project} · ${formatTs(r.timestamp)} · ${r.totalMessages} messages · grep "${r.pattern}" (${mode})`;
	if (r.matches.length === 0) {
		return `${head}\n(no matches)`;
	}
	const lines = [head, `${r.matches.length} snippet(s) across ${r.matchedMessages} matching message(s):`, ""];
	for (const m of r.matches) {
		lines.push(`[msg ${m.msgIndex}] ${m.role}: ${m.snippet}`);
	}
	if (r.messages.length > 0) {
		lines.push("", "context window:");
		for (const m of r.messages) lines.push(`[msg ${m.msgIndex}] ${m.role}:\n${m.text}`);
	}
	const notes: string[] = [];
	if (r.truncated) notes.push("some matches omitted — raise maxMatches, or narrow with roleFilter");
	const tail = notes.length ? `\n\n(${notes.join("; ")})` : "";
	return lines.join("\n").trimEnd() + tail;
}

/** Compact, stable summary of a guard outcome for tool `details`. */
function guardMeta(g: GuardOutcome): Record<string, unknown> {
	return {
		truncated: g.truncated,
		origChars: g.origChars,
		budgetChars: g.budgetChars,
		remainingTokens: g.remainingTokens,
		contextWindow: g.contextWindow,
	};
}

function disabled(action: string): AgentToolResult<unknown> {
	return {
		content: [{ type: "text", text: "pi-history-search is disabled (set enabled=true in history-search.json)." }],
		details: { action, error: "disabled" },
	};
}

// ── Search execution ─────────────────────────────────────────────────

export async function runSearch(
	ctx: ExtensionContext,
	config: HistorySearchConfig,
	params: { query?: string; scope?: string; project?: string; limit?: number; roleFilter?: RoleFilter }
): Promise<HistoryHit[]> {
	const base = resolveSessionsBase(config);
	const limit = params.limit ?? config.maxResults;
	const currentDir = projectDir(base, ctx.cwd);
	const scope = params.scope ?? "project";
	const query = params.query?.trim() ?? "";
	const roleFilter: RoleFilter = params.roleFilter ?? "conversation";
	const currentSessionId = (ctx.sessionManager.getSessionId?.() as string | undefined) ?? null;
	// The live session is already in the agent's context, so exclude it by default.
	// Skip for the explicit `current-branch` scope (that would otherwise always be empty).
	const exclude = config.excludeCurrentSession && currentSessionId !== null && scope !== "current-branch";
	// Over-fetch by one when excluding so dropping the current session doesn't cost a result slot.
	const fetchLimit = exclude ? limit + 1 : limit;
	const stripCurrent = (hits: HistoryHit[]): HistoryHit[] =>
		exclude ? hits.filter((h) => h.sessionId !== currentSessionId) : hits;
	const branchListing = listBranchesInProject(currentDir, currentSessionId, config.branchAliases);

	if (scope !== "all") {
		const branchScope =
			scope === "project" ? "project" : (scope as "current-tree" | "current-branch" | "siblings" | "ancestors" | "descendants");
		const scopedIds = branchScopeSessionIds(branchListing.branches, branchListing.currentBranchId, branchScope);
		const baseHits = query
			? await searchProject(currentDir, query, config, fetchLimit, true, roleFilter, scopedIds)
			: listRecent(currentDir, fetchLimit, scopedIds);
		const metaById = new Map(branchListing.branches.map((b) => [b.branchId, b]));
		return stripCurrent(baseHits)
			.map((h) => ({ ...h, branch: metaById.get(h.sessionId) }))
			.slice(0, limit);
	}

	const dirs = listProjectDirs(base);
	const all: HistoryHit[] = [];
	for (const dir of dirs) {
		const isCurrent = dir === currentDir;
		const hits = query ? await searchProject(dir, query, config, fetchLimit, isCurrent, roleFilter) : listRecent(dir, fetchLimit);
		all.push(...hits);
	}
	const projFilter = params.project?.toLowerCase();
	const filtered = projFilter ? all.filter((h) => h.project.toLowerCase().includes(projFilter)) : all;
	// Sessions already come back per-project-ranked; order by recency across projects.
	filtered.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
	return stripCurrent(filtered).slice(0, limit);
}

// ── Extension entry point ────────────────────────────────────────────

export default function historySearch(pi: ExtensionAPI): void {
	let indexing = false;

	async function ensureCurrentIndex(ctx: ExtensionContext): Promise<void> {
		if (indexing) return;
		const config = loadConfig(ctx.cwd);
		if (!config.enabled || !config.indexOnStart) return;
		indexing = true;
		try {
			const base = resolveSessionsBase(config);
			await updateProjectIndex(projectDir(base, ctx.cwd), config);
		} catch {
			// Index not writable here (e.g. read-only mount) — tools fall back at query time.
		} finally {
			indexing = false;
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		// Defer slightly so startup isn't blocked by a first-run full index.
		setTimeout(() => {
			void ensureCurrentIndex(ctx);
		}, 100);
	});

	pi.on("session_shutdown", async () => {
		closeAll();
	});

	// ── Interactive overlay (humans) ──────────────────────────────────
	async function openOverlay(
		ctx: ExtensionContext,
		initialQuery?: string,
		opener?: (sessionFile: string) => Promise<void> | void
	): Promise<void> {
		if (!ctx.hasUI) {
			ctx.ui.notify("History overlay needs an interactive TUI", "warning");
			return;
		}
		const config = loadConfig(ctx.cwd);
		if (!config.enabled) {
			ctx.ui.notify("pi-history-search is disabled", "warning");
			return;
		}
		const base = resolveSessionsBase(config);
		const dir = projectDir(base, ctx.cwd);
		// Refresh the index once up front so per-keystroke search stays instant.
		ctx.ui.setStatus("history-search", "🔍 indexing…");
		try {
			await updateProjectIndex(dir, config);
		} catch {
			// Read-only: the overlay falls back to an existing index or live scan.
		} finally {
			ctx.ui.setStatus("history-search", undefined);
		}
		await ctx.ui.custom<void>(
			(tui, theme, _kb, done) =>
				new HistoryOverlay(done, tui, theme, { base, dir, config, initialQuery }, opener ? (file) => opener(file) : undefined),
			{
				overlay: true,
				overlayOptions: { anchor: "center", width: "80%", maxHeight: "80%" },
			}
		);
	}

	pi.registerShortcut("ctrl+shift+f", {
		description: "Search session history (view-only; use /history to open sessions)",
		handler: (ctx) => openOverlay(ctx as ExtensionContext),
	});

	// ── HistorySearch ────────────────────────────────────────────────
	pi.registerTool({
		name: "HistorySearch",
		label: "History Search",
		description:
			"Search your own past session history (previous conversations and tool activity) with full-text ranked search. " +
			"Use this to recall earlier decisions, prior solutions, file paths, error messages, or what was already tried — " +
			"before re-deriving them. Returns matching sessions with snippets and a sessionId + msgIndex for each hit; " +
			"follow up with HistoryRead to expand any hit. Defaults to the current project; pass scope='all' to search " +
			"other projects the environment exposes.",
		promptSnippet: "HistorySearch — full-text search over your own past sessions (recall prior work).",
		parameters: HistorySearchParams,

		async execute(_id, params, _signal, _onUpdate, ctx): Promise<AgentToolResult<unknown>> {
			const config = loadConfig(ctx.cwd);
			if (!config.enabled) return disabled("search");
			try {
				const hits = await runSearch(ctx, config, params);
				const scope = params.scope ?? "project";
				const outcome = applyGuard(formatHits(params.query, scope, hits), ctx, config.contextGuard, "HistorySearch");
				return {
					content: [{ type: "text", text: outcome.text }],
					details: { action: "search", query: params.query, scope, count: hits.length, hits, contextGuard: guardMeta(outcome) },
				};
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				return {
					content: [{ type: "text", text: `History search failed: ${msg}` }],
					details: { action: "search", error: msg },
				};
			}
		},

		renderCall(args, theme: Theme) {
			const q = (args.query as string) ?? "";
			const scope = (args.scope as string) ?? "project";
			return new Text(theme.fg("toolTitle", theme.bold("HistorySearch ")) + theme.fg("muted", `"${q}" (${scope})`), 0, 0);
		},

		renderResult(result, _opts, theme: Theme) {
			const d = result.details as { count?: number; error?: string } | undefined;
			if (d?.error) return new Text(theme.fg("error", `Error: ${d.error}`), 0, 0);
			const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
			return new Text(theme.fg("muted", `${d?.count ?? 0} session(s)\n`) + text, 0, 0);
		},
	});

	// ── HistoryBranches ─────────────────────────────────────────────
	pi.registerTool({
		name: "HistoryBranches",
		label: "History Branches",
		description:
			"List branches in the current session tree (or whole project) with mechanical metadata only: ids, parent/root, fork msg, previews, files, and commands.",
		parameters: HistoryBranchesParams,
		async execute(_id, params, _signal, _onUpdate, ctx): Promise<AgentToolResult<unknown>> {
			const config = loadConfig(ctx.cwd);
			if (!config.enabled) return disabled("branches");
			const base = resolveSessionsBase(config);
			const dir = projectDir(base, ctx.cwd);
			const currentSessionId = (ctx.sessionManager.getSessionId?.() as string | undefined) ?? null;
			const listing = listBranchesInProject(dir, currentSessionId, config.branchAliases);
			const scope = params.scope ?? "current-tree";
			const allowed = branchScopeSessionIds(
				listing.branches,
				listing.currentBranchId,
				scope === "project" ? "project" : "current-tree"
			);
			const grep = params.grep?.trim().toLowerCase();
			let branches = listing.branches.filter((b) => !allowed || allowed.has(b.branchId));
			if (grep) {
				branches = branches.filter((b) =>
					[
						b.branchId,
						b.alias ?? "",
						b.parentBranchId ?? "",
						b.rootSessionId,
						b.lastUserPreview ?? "",
						b.lastAssistantPreview ?? "",
						...b.recentFiles,
						...b.recentCommands,
					]
						.join("\n")
						.toLowerCase()
						.includes(grep)
				);
			}
			const limit = params.limit ?? 50;
			branches = branches.slice(0, limit);
			const outcome = applyGuard(formatBranches(branches, scope), ctx, config.contextGuard, "HistoryBranches");
			return {
				content: [{ type: "text", text: outcome.text }],
				details: { action: "branches", scope, count: branches.length, branches, contextGuard: guardMeta(outcome) },
			};
		},
	});

	// ── HistoryRead ──────────────────────────────────────────────────
	pi.registerTool({
		name: "HistoryRead",
		label: "History Read",
		description:
			"Read fuller context from one past session returned by HistorySearch. Modes: pass `around` (a msgIndex) for a " +
			"window of surrounding messages; pass `query` to return every message matching terms; pass neither for the whole " +
			"session, which defaults to a compact `outline` (user+assistant only, tool noise dropped) — set view='transcript' " +
			"for everything. Identify the session with `sessionId` from a HistorySearch result.",
		parameters: HistoryReadParams,

		async execute(_id, params, _signal, _onUpdate, ctx): Promise<AgentToolResult<unknown>> {
			const config = loadConfig(ctx.cwd);
			if (!config.enabled) return disabled("read");
			try {
				const id = params.branchId ?? params.sessionId;
				if (!id) {
					return {
						content: [{ type: "text", text: "Provide either sessionId or branchId." }],
						details: { action: "read", error: "missing id" },
					};
				}
				const base = resolveSessionsBase(config);
				const filePath = findSessionPath(base, id, projectDir(base, ctx.cwd));
				if (!filePath) {
					return {
						content: [{ type: "text", text: `No accessible session/branch found with id "${id}".` }],
						details: { action: "read", error: "not found" },
					};
				}
				const r = readSession(filePath, {
					query: params.query,
					around: params.around,
					before: params.before,
					after: params.after,
					roleFilter: params.roleFilter,
					view: params.view ?? "outline",
					maxChars: params.maxChars ?? 2000,
					maxMessages: params.maxMessages,
					// When the caller didn't set an explicit budget, bound the read at the live
					// context budget so a huge session clips at message boundaries, not mid-stream.
					maxTotalChars: params.maxTotalChars ?? computeBudget(ctx, config.contextGuard).budgetChars,
				});
				const outcome = applyGuard(formatRead(r), ctx, config.contextGuard, "HistoryRead");
				return {
					content: [{ type: "text", text: outcome.text }],
					details: {
						action: "read",
						sessionId: r.sessionId,
						mode: r.mode,
						returned: r.messages.length,
						contextGuard: guardMeta(outcome),
					},
				};
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				return {
					content: [{ type: "text", text: `History read failed: ${msg}` }],
					details: { action: "read", error: msg },
				};
			}
		},

		renderCall(args, theme: Theme) {
			const rawId = ((args.branchId as string) ?? (args.sessionId as string) ?? "") as string;
			const id = shortId(rawId);
			const mode = args.around !== undefined ? `around ${args.around}` : args.query ? `query "${args.query}"` : "outline";
			return new Text(theme.fg("toolTitle", theme.bold("HistoryRead ")) + theme.fg("muted", `${id} · ${mode}`), 0, 0);
		},

		renderResult(result, _opts, theme: Theme) {
			const d = result.details as { error?: string; returned?: number } | undefined;
			if (d?.error) return new Text(theme.fg("error", `Error: ${d.error}`), 0, 0);
			const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
			return new Text(text, 0, 0);
		},
	});

	// ── HistoryGrep ────────────────────────────────────────────────
	pi.registerTool({
		name: "HistoryGrep",
		label: "History Grep",
		description:
			"Surgically and fast-search ONE past session for an exact substring or regular expression, returning pinpoint matches (msgIndex + snippet). " +
			"Use this when HistorySearch (tokenized BM25) misses the thing you need: code identifiers, camelCase names, stack traces, exact error strings, or file paths. " +
			"It reads a single session file once and runs one regex pass — no index, no tokenization — so it's fast even for large older sessions. " +
			"Typical flow: HistorySearch finds the session, then HistoryGrep extracts the exact lines. Identify the session with sessionId from a HistorySearch result.",
		promptSnippet: "HistoryGrep — fast exact/regex search inside one past session (msgIndex-precise).",
		parameters: HistoryGrepParams,

		async execute(_id, params, _signal, _onUpdate, ctx): Promise<AgentToolResult<unknown>> {
			const config = loadConfig(ctx.cwd);
			if (!config.enabled) return disabled("grep");
			const id = params.branchId ?? params.sessionId;
			if (!id) {
				return {
					content: [{ type: "text", text: "Provide either sessionId or branchId." }],
					details: { action: "grep", error: "missing id" },
				};
			}
			const base = resolveSessionsBase(config);
			const filePath = findSessionPath(base, id, projectDir(base, ctx.cwd));
			if (!filePath) {
				return {
					content: [{ type: "text", text: `No accessible session/branch found with id "${id}".` }],
					details: { action: "grep", error: "not found" },
				};
			}
			try {
				const r = grepSession(filePath, {
					pattern: params.pattern,
					regex: params.regex,
					ignoreCase: params.ignoreCase,
					roleFilter: params.roleFilter,
					before: params.before,
					after: params.after,
					maxMatches: params.maxMatches,
					maxChars: params.maxChars,
				});
				const outcome = applyGuard(formatGrep(r), ctx, config.contextGuard, "HistoryGrep");
				return {
					content: [{ type: "text", text: outcome.text }],
					details: {
						action: "grep",
						sessionId: r.sessionId,
						pattern: r.pattern,
						matchedMessages: r.matchedMessages,
						matches: r.matches.length,
						contextGuard: guardMeta(outcome),
					},
				};
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				return {
					content: [{ type: "text", text: `History grep failed: ${msg}` }],
					details: { action: "grep", error: msg },
				};
			}
		},

		renderCall(args, theme: Theme) {
			const rawId = ((args.branchId as string) ?? (args.sessionId as string) ?? "") as string;
			const id = shortId(rawId);
			const pattern = (args.pattern as string) ?? "";
			const flag = `${args.regex ? "regex" : "lit"}/${args.ignoreCase === false ? "exact" : "i"}`;
			return new Text(
				theme.fg("toolTitle", theme.bold("HistoryGrep ")) + theme.fg("muted", `${id} · "${pattern}" (${flag})`),
				0,
				0
			);
		},

		renderResult(result, _opts, theme: Theme) {
			const d = result.details as { error?: string; matchedMessages?: number; matches?: number } | undefined;
			if (d?.error) return new Text(theme.fg("error", `Error: ${d.error}`), 0, 0);
			const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
			return new Text(theme.fg("muted", `${d?.matches ?? 0} match(es) in ${d?.matchedMessages ?? 0} msg(s)\n`) + text, 0, 0);
		},
	});

	// ── /history command (humans: stats / reindex / quick search) ─────
	pi.registerCommand("history", {
		description: "Search session history, manage index, or inspect branches: /history [stats|reindex|branches|<query>]",
		handler: async (args, ctx) => {
			const config = loadConfig(ctx.cwd);
			const base = resolveSessionsBase(config);
			const dir = projectDir(base, ctx.cwd);
			const arg = args?.trim() ?? "";

			if (arg === "stats") {
				const s = getStats(dir);
				ctx.ui.notify(
					`History index: ${s.totalSessions} sessions, ${s.totalChunks} chunks · updated ${s.lastUpdated ?? "never"} · ${s.indexPath}`,
					"info"
				);
				return;
			}

			if (arg === "reindex") {
				ctx.ui.notify("Rebuilding history index…", "info");
				try {
					const n = await rebuildProjectIndex(dir, config);
					ctx.ui.notify(`Rebuilt history index: ${n} sessions`, "info");
				} catch (e) {
					ctx.ui.notify(`Reindex failed: ${e instanceof Error ? e.message : String(e)}`, "error");
				}
				return;
			}

			if (arg.startsWith("branches")) {
				const currentSessionId = (ctx.sessionManager.getSessionId?.() as string | undefined) ?? null;
				const listing = listBranchesInProject(dir, currentSessionId, config.branchAliases);
				const branches = branchScopeSessionIds(listing.branches, listing.currentBranchId, "current-tree");
				const filtered = listing.branches.filter((b) => !branches || branches.has(b.branchId));
				if (ctx.hasUI) ctx.ui.notify(`Found ${filtered.length} branches in current tree`, "info");
				else console.log(formatBranches(filtered, "current-tree"));
				return;
			}

			// Interactive TUI: open the live overlay (optionally seeded with the query).
			// Command context has switchSession, so 'o' can open the selected session.
			if (ctx.hasUI) {
				await openOverlay(ctx, arg || undefined, async (sessionFile) => {
					await ctx.switchSession(sessionFile);
				});
				return;
			}

			if (!arg) {
				console.log("Usage: /history [stats|reindex|branches|<query>] — agents use HistorySearch/HistoryBranches tools");
				return;
			}

			// Headless (rpc/print): fall back to printing ranked results.
			try {
				const hits = await runSearch(ctx, config, { query: arg, scope: "project" });
				console.log(formatHits(arg, "project", hits));
			} catch (e) {
				ctx.ui.notify(`Search failed: ${e instanceof Error ? e.message : String(e)}`, "error");
			}
		},
	});
}
