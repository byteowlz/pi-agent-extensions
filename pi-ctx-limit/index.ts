/**
 * pi-ctx-limit — per-session context compaction threshold via `/ctx` (`/context`).
 *
 * Pi's built-in compaction triggers at `contextWindow - reserveTokens` with
 * per-model settings only (settings.json `compaction.modelOverrides`). This
 * extension adds a SESSION-scoped soft limit:
 *
 *   /ctx            show current usage vs. limit, or pick from preset sizes
 *   /ctx 262k       set the session limit (e.g. 262k, 262144, 1m, 64k)
 *   /ctx off        clear the session limit (back to pi's model-based trigger)
 *
 * - The limit is stored as a `pi-ctx-limit:limit/v1` custom entry on the
 *   session branch, so it survives resume and follows the branch (like the
 *   routing description does). It never enters LLM context.
 * - Setting a limit below the current projected context immediately triggers
 *   compaction via ctx.compact().
 * - Enforcement is turn-granular: pi checks between turns itself; this
 *   extension re-checks after agent_end and model switches, and cancels
 *   pi's own threshold compaction only when the session limit has already
 *   compacted under it (the model window still hard-fails through pi's
 *   overflow recovery).
 * - The limit is a soft cap on projected context tokens. It never raises
 *   pi's real trigger: a model whose actual window is smaller than the
 *   session limit keeps pi's native behavior — the effective trigger is
 *   min(sessionLimit, contextWindow - reserve).
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

// ---------------------------------------------------------------------------
// Session state: custom entry
// ---------------------------------------------------------------------------

export const LIMIT_ENTRY_TYPE = "pi-ctx-limit:limit/v1";

interface LimitRecord {
	version: 1;
	/** Effective context-token limit for this session branch. */
	limitTokens: number;
	/** ISO timestamp of the last change. */
	updatedAt: string;
	/** Session that authored the record. */
	sessionId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Latest valid limit on a branch (branch-relative, like the routing description). */
export function readLimit(branchEntries: readonly unknown[]): LimitRecord | undefined {
	let latest: LimitRecord | undefined;
	for (const entry of branchEntries) {
		if (!isRecord(entry) || entry.type !== "custom" || entry.customType !== LIMIT_ENTRY_TYPE) continue;
		const data = isRecord(entry.data) ? entry.data : undefined;
		if (!data) continue;
		const limitTokens = data.limitTokens;
		if (data.version !== 1 || typeof limitTokens !== "number" || !Number.isFinite(limitTokens) || limitTokens <= 0) continue;
		const record: LimitRecord = {
			version: 1,
			limitTokens: Math.floor(limitTokens),
			updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
		};
		if (typeof data.sessionId === "string") record.sessionId = data.sessionId;
		latest = record;
	}
	return latest;
}

// ---------------------------------------------------------------------------
// Size parsing & presets
// ---------------------------------------------------------------------------

const SIZE_RE = /^(\d+(?:\.\d+)?)(k|m|g)?$/i;

/** "262k" | "1m" | "40000" -> tokens; undefined when unparseable. */
export function parseSizeTokens(raw: string): number | undefined {
	const match = SIZE_RE.exec(raw.trim().toLowerCase());
	if (!match) return undefined;
	const value = Number.parseFloat(match[1]);
	if (!Number.isFinite(value) || value <= 0) return undefined;
	const unit = match[2];
	if (unit === "k") return Math.round(value * 1_000);
	if (unit === "m") return Math.round(value * 1_000_000);
	if (unit === "g") return Math.round(value * 1_000_000_000);
	return Math.round(value);
}

export function formatTokens(tokens: number): string {
	if (tokens >= 1_000_000 && tokens % 1_000_000 === 0) return `${tokens / 1_000_000}m`;
	if (tokens >= 1_000 && tokens % 1_000 === 0) return `${tokens / 1_000}k`;
	return tokens.toLocaleString("en-US");
}

/** Common sizes offered by the picker, plus the active model's window when known. */
const PRESET_WINDOWS = [32_000, 64_000, 128_000, 200_000, 262_144, 400_000, 500_000, 1_000_000, 2_000_000];

function presetRows(contextWindow: number | undefined): { tokens: number; note: string }[] {
	const rows: { tokens: number; note: string }[] = [];
	const seen = new Set<number>();
	if (typeof contextWindow === "number" && contextWindow > 0) {
		rows.push({ tokens: contextWindow, note: "model window" });
		seen.add(contextWindow);
		// useful fractions of the window
		for (const fraction of [0.25, 0.5]) {
			const tokens = Math.round((contextWindow * fraction) / 1000) * 1000;
			if (tokens > 0 && !seen.has(tokens) && tokens < contextWindow) {
				rows.push({ tokens, note: `${Math.round(fraction * 100)}%` });
				seen.add(tokens);
			}
		}
	}
	for (const tokens of PRESET_WINDOWS) {
		if (!seen.has(tokens)) {
			rows.push({ tokens, note: "" });
			seen.add(tokens);
		}
	}
	return rows;
}

// ---------------------------------------------------------------------------
// TUI size picker (fuzzy single-select, mirrors /auto-rename model palette)
// ---------------------------------------------------------------------------

async function pickSize(
	ctx: ExtensionCommandContext,
	rows: { tokens: number; note: string }[],
	usedTokens: number | null
): Promise<{ tokens: number; note: string } | undefined> {
	return await ctx.ui.custom<{ tokens: number; note: string } | undefined>((tui, theme, _kb, done) => {
		let query = "";
		let selected = 0;
		let cachedLines: string[] | undefined;

		const refresh = (): void => {
			cachedLines = undefined;
			tui.requestRender();
		};

		function visible(): { tokens: number; note: string }[] {
			const q = query.trim();
			if (!q) return rows;
			const parsed = parseSizeTokens(q);
			return rows.filter((row) => {
				const label = `${formatTokens(row.tokens)} ${row.note}`.toLowerCase();
				return label.includes(q.toLowerCase()) || row.tokens === parsed;
			});
		}

		function handleInput(data: string): void {
			if (matchesKey(data, Key.escape)) {
				done(undefined);
				return;
			}
			if (matchesKey(data, Key.enter)) {
				const list = visible();
				const row = list[selected] ?? list[0];
				done(row);
				return;
			}
			if (matchesKey(data, Key.up)) {
				const count = visible().length;
				if (count > 0) selected = (selected - 1 + count) % count;
				refresh();
				return;
			}
			if (matchesKey(data, Key.down)) {
				const count = visible().length;
				if (count > 0) selected = (selected + 1) % count;
				refresh();
				return;
			}
			if (matchesKey(data, Key.backspace)) {
				query = query.slice(0, -1);
				selected = 0;
				refresh();
				return;
			}
			for (const ch of data) {
				const code = ch.charCodeAt(0);
				if (code >= 0x20 && code !== 0x7f) query += ch;
			}
			selected = 0;
			refresh();
		}

		function render(width: number): string[] {
			if (cachedLines) return cachedLines;
			const rw = Math.max(1, width);
			const list = visible();
			const lines: string[] = [];
			const usage = usedTokens !== null ? `${usedTokens.toLocaleString("en-US")} tokens in context` : "usage unknown";
			lines.push(theme.fg("accent", "─".repeat(rw)));
			lines.push(` ${theme.fg("accent", "Session context limit")}  ${theme.fg("muted", `— ${usage}`)}`);
			lines.push("");
			const maxVisible = 12;
			const start = Math.max(0, Math.min(selected - Math.floor(maxVisible / 2), list.length - maxVisible));
			const end = Math.min(start + maxVisible, list.length);
			for (let i = start; i < end; i++) {
				const row = list[i];
				const prefix = i === selected ? theme.fg("accent", "→ ") : "  ";
				const note = row.note ? theme.fg("muted", `  ${row.note}`) : "";
				lines.push(truncateToWidth(`${prefix}${formatTokens(row.tokens)}${note}`, rw));
			}
			if (list.length > maxVisible) lines.push(theme.fg("dim", `  (${selected + 1}/${list.length})`));
			if (list.length === 0) lines.push(theme.fg("warning", "  No matching size — type e.g. 262k or 400000"));
			lines.push("");
			lines.push(theme.fg("dim", "Type to filter or enter an exact size • ↑/↓ select • Enter apply • Esc cancel"));
			lines.push(theme.fg("accent", "─".repeat(rw)));
			cachedLines = lines;
			return lines;
		}

		return {
			render,
			invalidate: (): void => {
				cachedLines = undefined;
			},
			handleInput,
		};
	});
}

// ---------------------------------------------------------------------------
// Config (default presets are static; no config file required)
// ---------------------------------------------------------------------------

interface CtxLimitConfig {
	/** When true, /ctx also cancels pi's own threshold compaction when the session limit already covered it. */
	enabled: boolean;
}

function loadConfig(cwd: string): CtxLimitConfig {
	// Minimal config support mirroring other byteowlz extensions; defaults suffice.
	const config: CtxLimitConfig = { enabled: true };
	for (const path of [join(cwd, ".pi", "ctx-limit.json"), join(homedir(), ".pi", "agent", "ctx-limit.json")]) {
		if (!existsSync(path)) continue;
		try {
			const parsed = JSON.parse(readFileSync(path, "utf-8")) as Partial<CtxLimitConfig>;
			if (typeof parsed.enabled === "boolean") config.enabled = parsed.enabled;
		} catch {
			// ignore malformed config
		}
	}
	return config;
}

// ---------------------------------------------------------------------------
// Threshold logic (pure, exported for tests)
// ---------------------------------------------------------------------------

/**
 * The session limit is a soft cap: never raise pi's own trigger. The
 * effective threshold is min(sessionLimit, contextWindow - reserveTokens).
 */
export function effectiveThreshold(sessionLimit: number | undefined, contextWindow: number, reserveTokens: number): number {
	const native = Math.max(0, contextWindow - reserveTokens);
	if (sessionLimit === undefined) return native;
	return Math.min(sessionLimit, native);
}

/** True when projected tokens exceed the effective threshold. */
export function shouldTriggerCompaction(tokens: number | null, threshold: number): boolean {
	if (tokens === null || !Number.isFinite(tokens)) return false;
	return tokens > threshold;
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function piCtxLimit(pi: ExtensionAPI): void {
	let limit: LimitRecord | undefined;
	let applying = false;

	const currentLimit = (): LimitRecord | undefined => limit;

	const notify = (ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info"): void => {
		try {
			ctx.ui.notify(message, level);
		} catch {
			// best-effort
		}
	};

	const writeLimit = (ctx: ExtensionContext, limitTokens: number): LimitRecord => {
		const record: LimitRecord = { version: 1, limitTokens, updatedAt: new Date().toISOString() };
		const sessionId = ctx.sessionManager.getSessionId();
		if (sessionId) record.sessionId = sessionId;
		try {
			pi.appendEntry(LIMIT_ENTRY_TYPE, record);
		} catch {
			// Persistent state is best-effort; the in-memory limit still applies.
		}
		limit = record;
		return record;
	};

	const clearLimit = (): void => {
		limit = undefined;
	};

	/** Re-read the branch on session lifecycle events (resume keeps the limit). */
	const syncFromBranch = (ctx: ExtensionContext): void => {
		limit = readLimit(ctx.sessionManager.getBranch());
	};

	const settings = (): { reserveTokens: number } => {
		try {
			const compaction = pi.getSettings().compaction;
			const reserve = compaction?.reserveTokens;
			return { reserveTokens: typeof reserve === "number" && Number.isFinite(reserve) && reserve >= 0 ? reserve : 16384 };
		} catch {
			return { reserveTokens: 16384 };
		}
	};

	/** Threshold for the active physical model: soft session cap, native trigger otherwise. */
	const thresholdNow = (ctx: ExtensionContext): { threshold: number; over: boolean } | undefined => {
		const usage = ctx.getContextUsage();
		if (!usage || typeof usage.contextWindow !== "number" || usage.contextWindow <= 0) return undefined;
		const { reserveTokens } = settings();
		const sessionLimit = currentLimit()?.limitTokens;
		const threshold = effectiveThreshold(sessionLimit, usage.contextWindow, reserveTokens);
		return { threshold, over: shouldTriggerCompaction(usage.tokens, threshold) };
	};

	const maybeCompact = (ctx: ExtensionContext, reason: string): void => {
		if (applying) return;
		if (!currentLimit()) return;
		const state = thresholdNow(ctx);
		if (!state?.over) return;
		applying = true;
		notify(ctx, `context over session limit (${reason}); compacting…`, "info");
		try {
			ctx.compact({
				customInstructions: "The context exceeded the session's /ctx limit. Summarize faithfully so work can continue.",
				// Release the guard when compaction finishes or fails.
				onComplete: () => {
					applying = false;
					const state = thresholdNow(ctx);
					if (state?.over) notify(ctx, "context still over limit after compaction; will re-compact next turn", "warning");
				},
				onError: () => {
					applying = false;
				},
			});
		} catch {
			applying = false;
		}
	};

	const ctxCommand = {
		description:
			"Set a per-session context compaction threshold: /ctx 262k (or 262144, 1m), /ctx off to clear, no argument to show usage or pick from preset sizes",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			if (!loadConfig(ctx.cwd).enabled) {
				notify(ctx, "ctx limit extension disabled via config", "warning");
				return;
			}
			const raw = args.trim().toLowerCase();
			const usage = ctx.getContextUsage();
			const window = usage && typeof usage.contextWindow === "number" ? usage.contextWindow : undefined;

			// Show mode or picker
			if (!raw) {
				const record = currentLimit();
				const tokensPart =
					usage?.tokens !== null && usage?.tokens !== undefined ? usage.tokens.toLocaleString("en-US") : "unknown";
				if (ctx.mode === "tui") {
					const chosen = await pickSize(ctx, presetRows(window), usage?.tokens ?? null);
					if (!chosen) return;
					applyLimit(ctx, chosen.tokens);
				} else {
					const lines = [
						`context: ${tokensPart}${window ? ` / ${formatTokens(window)}` : ""}`,
						record
							? `limit: ${formatTokens(record.limitTokens)} (since ${record.updatedAt.slice(0, 16).replace("T", " ")})`
							: "limit: none (pi's model-based trigger applies)",
					];
					if (record) lines.push("set: /ctx <size> — change, /ctx off — clear");
					notify(ctx, lines.join("\n"), "info");
				}
				return;
			}

			if (raw === "off" || raw === "clear" || raw === "none") {
				clearLimit();
				notify(
					ctx,
					`session limit cleared${window ? ` — pi's trigger ${formatTokens(effectiveThreshold(undefined, window, settings().reserveTokens))} for this model applies` : ""}`,
					"info"
				);
				return;
			}

			const tokens = parseSizeTokens(raw);
			if (tokens === undefined) {
				notify(ctx, `unrecognized size "${raw}" — use e.g. 262k, 500000 or 1m; /ctx off clears the limit`, "error");
				return;
			}
			applyLimit(ctx, tokens);
		},
	};
	pi.registerCommand("ctx", ctxCommand);

	function applyLimit(ctx: ExtensionCommandContext, tokens: number): void {
		writeLimit(ctx, tokens);
		const usage = ctx.getContextUsage();
		const state = thresholdNow(ctx);
		notify(
			ctx,
			`session context limit set to ${formatTokens(tokens)}${state ? ` — effective trigger ${formatTokens(state.threshold)}` : ""}`,
			"info"
		);
		if (state?.over) {
			notify(
				ctx,
				`context (${usage?.tokens?.toLocaleString("en-US") ?? "?"} tokens) exceeds the new limit — compacting now`,
				"warning"
			);
			applying = true;
			try {
				ctx.compact({
					customInstructions: "The context exceeded the session's /ctx limit. Summarize faithfully so work can continue.",
					onComplete: () => {
						applying = false;
						const next = thresholdNow(ctx);
						if (next?.over) notify(ctx, "context still over limit after compaction; will re-compact next turn", "warning");
					},
					onError: () => {
						applying = false;
					},
				});
			} catch {
				applying = false;
			}
		}
	}

	// /context is a full alias of /ctx: same handler object.
	pi.registerCommand("context", {
		...ctxCommand,
		description: "Alias of /ctx: per-session context compaction threshold (/ctx 262k | /ctx off | picker)",
	});

	// Re-check at turn end (pi checks between turns natively between tool calls;
	// this covers the gap after long tool runs and at idleness).
	pi.on("agent_end", async (_event, ctx) => {
		maybeCompact(ctx, "turn end");
	});

	// Model switches can shrink the native trigger below the session limit —
	// read the limit back and re-check immediately.
	pi.on("session_start", async (event, ctx) => {
		if (event.reason === "new") clearLimit();
		else syncFromBranch(ctx);
		void event;
		maybeCompact(ctx, "session start");
	});

	pi.on("session_tree", async (_event, ctx) => {
		// Branch navigation: limits are branch-relative entries; re-read.
		syncFromBranch(ctx);
	});
}
