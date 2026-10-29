import { describe, expect, test } from "bun:test";

import { MAX_ERROR_CHARS, MAX_STATE_CHARS, type TurnDigest, renderState } from "./digest";
import { ERROR_KIND, buildQuestions, renderLine } from "./schema";

function digest(overrides: Partial<TurnDigest> = {}): TurnDigest {
	return {
		userText: "use glm-5.3 for this",
		assistantText: "",
		tools: [{ name: "bash" }],
		filesTouched: [],
		commands: ["ls"],
		cwd: "/home/wismut/byteowlz/pi-agent-extensions",
		gitRemotes: [],
		...overrides,
	};
}

const providerError =
	'f hgenie/nvidia/GLM-5.3-NVFP4: upstream returned 529 {"error":{"message":"The model is currently overloaded. Please try again later.","type":"overloaded_error"}}';

describe("errors reach the model", () => {
	test("the error text is in the state, with its source", () => {
		const state = renderState(digest({ error: { source: "provider", message: providerError }, errored: true }));
		expect(state.error).toEqual({ source: "provider", message: providerError });
		expect(state.errored).toBe(true);
	});

	test("a tool error keeps the tool name", () => {
		const state = renderState(digest({ error: { source: "tool", tool: "bash", message: "bash: bun: command not found" } }));
		expect(state.error).toEqual({ source: "tool", tool: "bash", message: "bash: bun: command not found" });
	});

	test("a huge error is bounded but not dropped, and survives trimming", () => {
		const huge = "x".repeat(50_000);
		const state = renderState(
			digest({
				error: { source: "provider", message: huge },
				userText: "y".repeat(20_000),
				assistantText: "z".repeat(20_000),
				filesTouched: Array.from({ length: 50 }, (_, index) => `/p/${index}.ts`),
			})
		);
		expect(state.error).toBeDefined();
		const message = (state.error as { message: string }).message;
		expect(message.length).toBeLessThanOrEqual(MAX_ERROR_CHARS);
		expect(JSON.stringify(state).length).toBeLessThanOrEqual(MAX_STATE_CHARS + MAX_ERROR_CHARS);
	});

	test("no error means no error field at all", () => {
		expect("error" in renderState(digest())).toBe(false);
	});
});

describe("error questions", () => {
	test("only asked when the turn failed", () => {
		const clean = buildQuestions([]).map((question) => question.id);
		expect(clean).not.toContain("error_kind");
		expect(clean).not.toContain("error_transient");

		const failed = buildQuestions([], { hasError: true }).map((question) => question.id);
		expect(failed).toContain("error_kind");
		expect(failed).toContain("error_transient");
	});

	test("the taxonomy covers the failures that actually happen", () => {
		const ids = ERROR_KIND.map((option) => option.id);
		for (const id of [
			"provider_overloaded",
			"rate_limited",
			"auth",
			"context_overflow",
			"network",
			"content_filter",
			"invalid_request",
			"bad_response",
			"tool_failed",
			"cancelled",
			"unclear",
		]) {
			expect(ids).toContain(id);
		}
		// System One caps a choice at 26 options.
		expect(ERROR_KIND.length).toBeLessThanOrEqual(26);
		// ids are persisted
		for (const option of ERROR_KIND) expect(option.id).toMatch(/^[a-z0-9_]+$/);
	});

	test("the line names the error and whether a retry would help", () => {
		const questions = buildQuestions([], { hasError: true });
		const transient = renderLine(
			{ activity: { value: "implement" }, error_kind: { value: "provider_overloaded" }, error_transient: { value: "yes" } },
			questions
		);
		expect(transient).toBe("implement · error provider overloaded (retryable)");

		const permanent = renderLine(
			{ activity: { value: "ops" }, error_kind: { value: "auth" }, error_transient: { value: "no" } },
			questions
		);
		expect(permanent).toBe("ops · error auth");
	});

	test("an unclear error adds nothing to the line", () => {
		expect(
			renderLine({ activity: { value: "debug" }, error_kind: { value: "unclear" } }, buildQuestions([], { hasError: true }))
		).toBe("debug");
	});
});
