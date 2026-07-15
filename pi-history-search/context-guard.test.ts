import { describe, expect, test } from "bun:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type ContextGuardConfig, DEFAULT_CONTEXT_GUARD } from "./config";
import { type ContextBudget, applyGuard, computeBudget, estimateTokens, guardText } from "./context-guard";

/** Minimal mock whose only live surface is getContextUsage(). */
function mockCtx(tokens: number | null, contextWindow: number): ExtensionContext {
	return { getContextUsage: () => ({ tokens, contextWindow, percent: null }) } as unknown as ExtensionContext;
}

describe("estimateTokens", () => {
	test("ceils chars / charsPerToken", () => {
		expect(estimateTokens(0, 4)).toBe(0);
		expect(estimateTokens(1, 4)).toBe(1);
		expect(estimateTokens(8, 4)).toBe(2);
		expect(estimateTokens(9, 4)).toBe(3);
	});
});

describe("computeBudget", () => {
	test("uses absolute cap when the window is mostly empty", () => {
		const ctx = mockCtx(1000, 200_000); // 199k free → dynamic cap far above maxResultChars
		const budget = computeBudget(ctx, DEFAULT_CONTEXT_GUARD);
		expect(budget.budgetChars).toBe(DEFAULT_CONTEXT_GUARD.maxResultChars);
		expect(budget.remainingTokens).toBe(199_000);
		expect(budget.contextWindow).toBe(200_000);
	});

	test("shrinks to maxContextFraction of remaining when context is low", () => {
		// 10k tokens free, fraction 0.5, 4 chars/token → 20000 dynamic chars.
		const ctx = mockCtx(190_000, 200_000);
		const budget = computeBudget(ctx, DEFAULT_CONTEXT_GUARD);
		expect(budget.budgetChars).toBe(20_000);
	});

	test("floors at minResultChars when the window is nearly full", () => {
		const ctx = mockCtx(199_999, 200_000);
		const budget = computeBudget(ctx, DEFAULT_CONTEXT_GUARD);
		expect(budget.budgetChars).toBe(DEFAULT_CONTEXT_GUARD.minResultChars);
	});

	test("falls back to absolute cap when usage is unknown", () => {
		const ctx = mockCtx(null, 200_000);
		const budget = computeBudget(ctx, DEFAULT_CONTEXT_GUARD);
		expect(budget.budgetChars).toBe(DEFAULT_CONTEXT_GUARD.maxResultChars);
		expect(budget.remainingTokens).toBeNull();
	});

	test("returns no budget info when getContextUsage is missing", () => {
		const ctx = {} as unknown as ExtensionContext;
		const budget = computeBudget(ctx, DEFAULT_CONTEXT_GUARD);
		expect(budget.budgetChars).toBe(DEFAULT_CONTEXT_GUARD.maxResultChars);
		expect(budget.remainingTokens).toBeNull();
	});
});

describe("guardText", () => {
	const cfg = DEFAULT_CONTEXT_GUARD;
	const budget = (budgetChars: number): ContextBudget => ({ budgetChars, remainingTokens: 5000, contextWindow: 200_000 });

	test("passes text through unchanged when it fits", () => {
		const text = "x".repeat(100);
		const out = guardText(text, budget(1000), cfg, "HistoryRead");
		expect(out.truncated).toBe(false);
		expect(out.text).toBe(text);
		expect(out.origChars).toBe(100);
	});

	test("truncates and prepends a warning when too large", () => {
		const text = "y".repeat(5000);
		const budgetChars = 600; // larger than the warning so the body bound is meaningful
		const out = guardText(text, budget(budgetChars), cfg, "HistoryRead");
		expect(out.truncated).toBe(true);
		expect(out.origChars).toBe(5000);
		expect(out.text).toContain("⚠ HistoryRead result too large");
		expect(out.text).toContain("[truncated");
		// Warning + body together stay within the budget + a small separator slack.
		expect(out.text.length).toBeLessThanOrEqual(budgetChars + 60);
	});

	test("warning reports remaining tokens when known", () => {
		const out = guardText("z".repeat(5000), budget(100), cfg, "HistorySearch");
		expect(out.text).toContain("~5,000 of 200,000 tokens free");
	});

	test("warning reports unknown when remaining tokens null", () => {
		const out = guardText(
			"z".repeat(5000),
			{ budgetChars: 100, remainingTokens: null, contextWindow: null },
			cfg,
			"HistorySearch"
		);
		expect(out.text).toContain("context usage unknown");
	});
});

describe("applyGuard", () => {
	test("is a no-op when disabled", () => {
		const cfg: ContextGuardConfig = { ...DEFAULT_CONTEXT_GUARD, enabled: false };
		const ctx = mockCtx(199_999, 200_000); // would otherwise shrink to the floor
		const text = "a".repeat(10_000);
		const out = applyGuard(text, ctx, cfg, "HistoryRead");
		expect(out.truncated).toBe(false);
		expect(out.text).toBe(text);
	});

	test("guards when enabled and context is low", () => {
		const ctx = mockCtx(199_999, 200_000);
		const text = "b".repeat(10_000);
		const out = applyGuard(text, ctx, DEFAULT_CONTEXT_GUARD, "HistoryRead");
		expect(out.truncated).toBe(true);
	});
});
