/**
 * Context-overflow guard.
 *
 * A history result can be huge (a full transcript, dozens of branch listings).
 * Returning it verbatim risks blowing the turn's context window. The guard
 * measures how much of the context window is still free (`ctx.getContextUsage`)
 * and, when a formatted result would exceed the budget, truncates it and
 * prepends an actionable warning telling the agent how to fetch less.
 *
 * Only the tool result's `content` text is guarded — `details` is structured
 * data for UI/logs and never reaches the model, so it can stay rich.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ContextGuardConfig } from "./config.js";

export interface ContextBudget {
	/** Max chars this result may consume after accounting for live context. */
	budgetChars: number;
	/** Tokens still free in the window, or null when usage is unknown. */
	remainingTokens: number | null;
	/** Total window size in tokens, or null when unknown. */
	contextWindow: number | null;
}

export interface GuardOutcome extends ContextBudget {
	/** The (possibly truncated) text. */
	text: string;
	/** Whether truncation was applied. */
	truncated: boolean;
	/** Original length before truncation. */
	origChars: number;
}

/**
 * Approximate token cost of a string. Deliberately rough (chars / charsPerToken);
 * we only need a conservative ceiling, not a precise tokenizer.
 */
export function estimateTokens(chars: number, charsPerToken: number): number {
	return Math.ceil(chars / charsPerToken);
}

/**
 * Compute the per-result char budget from live context usage.
 *
 * The budget is the smaller of:
 *   - the absolute `maxResultChars` cap, and
 *   - the dynamic cap = remaining_tokens × maxContextFraction × charsPerToken,
 *     i.e. a result may consume at most `maxContextFraction` of what's left.
 *
 * It is floored at `minResultChars` so that even a nearly-full window returns a
 * usable sliver rather than nothing. When context usage is unknown (e.g. right
 * after compaction, or print/rpc mode), only the absolute cap applies.
 */
export function computeBudget(ctx: ExtensionContext, cfg: ContextGuardConfig): ContextBudget {
	const usage = ctx.getContextUsage?.();
	const contextWindow = usage?.contextWindow ?? null;
	const used = usage?.tokens ?? null;

	let remainingTokens: number | null = null;
	if (contextWindow != null && used != null) {
		remainingTokens = Math.max(0, contextWindow - used);
	}

	let budgetChars = cfg.maxResultChars;
	if (remainingTokens != null) {
		const dynamic = Math.floor(remainingTokens * cfg.maxContextFraction * cfg.charsPerToken);
		budgetChars = Math.min(budgetChars, dynamic);
	}
	budgetChars = Math.max(cfg.minResultChars, budgetChars);

	return { budgetChars, remainingTokens, contextWindow };
}

/**
 * Truncate a tool-result string to the context budget, prepending an actionable
 * warning when it doesn't fit. Returns the text unchanged when it already fits.
 */
export function guardText(text: string, budget: ContextBudget, cfg: ContextGuardConfig, tool: string): GuardOutcome {
	const origChars = text.length;
	const { budgetChars } = budget;
	if (origChars <= budgetChars) {
		return { ...budget, text, truncated: false, origChars };
	}

	const ctxLabel =
		budget.remainingTokens != null
			? `~${budget.remainingTokens.toLocaleString()} of ${budget.contextWindow?.toLocaleString() ?? "?"} tokens free`
			: "context usage unknown";
	const estTokens = estimateTokens(origChars, cfg.charsPerToken);
	const warning = `⚠ ${tool} result too large for the remaining context window (${ctxLabel}; full result ≈ ${origChars.toLocaleString()} chars / ~${estTokens.toLocaleString()} tokens). Showing the first ${budgetChars.toLocaleString()} chars only. To see the rest without overflow, narrow the call (smaller limit/maxMessages, a tighter query, around:<msgIndex>, or HistoryGrep for one session).`;

	// The warning is part of the result, so reserve its length (+ separators) and
	// never let the body exceed the budget. Clamped to 0 for tiny budgets.
	const bodyBudget = Math.max(0, budgetChars - warning.length - 40);
	const truncatedBody = `${text.slice(0, bodyBudget)}\n… [truncated — see warning above]`;
	return {
		...budget,
		text: `${warning}\n\n${truncatedBody}`,
		truncated: true,
		origChars,
	};
}

/** Convenience: compute budget + guard in one call. No-op when the guard is disabled. */
export function applyGuard(text: string, ctx: ExtensionContext, cfg: ContextGuardConfig, tool: string): GuardOutcome {
	if (!cfg.enabled) {
		return {
			text,
			truncated: false,
			origChars: text.length,
			budgetChars: text.length,
			remainingTokens: null,
			contextWindow: null,
		};
	}
	return guardText(text, computeBudget(ctx, cfg), cfg, tool);
}
