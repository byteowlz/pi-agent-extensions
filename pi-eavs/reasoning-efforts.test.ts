import assert from "node:assert/strict";
import { test } from "node:test";
import { clampThinkingLevel, getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { projectCatalog, restoreCatalog } from "./catalog.js";

const origin = "https://eavs.example";
const model = (id: string, extra: Record<string, unknown> = {}) => ({
	id,
	name: id,
	input: ["text"],
	reasoning: true,
	context_window: 4096,
	max_tokens: 512,
	pricing: null,
	...extra,
});
const catalog = (models: unknown[]) => ({
	schema_version: 1,
	scope: "key-filtered-chat-candidates",
	providers: [
		{
			id: "local",
			api: "openai-completions",
			operation: "chat",
			base_path: "/local/v1",
			request_path: "/local/v1/chat/completions",
			models,
		},
	],
});

test("catalog reasoning_efforts limit Pi thinking levels to what the upstream accepts", () => {
	const { models } = projectCatalog(
		origin,
		catalog([
			model("vllm", { reasoning_efforts: ["xhigh", "medium", "low"] }),
			model("sushi", { reasoning_efforts: ["off", "low", "medium", "xhigh"] }),
			model("unknown"),
		])
	);
	const [vllm, sushi, unknown] = models;
	assert.deepEqual(getSupportedThinkingLevels(vllm), ["off", "low", "medium", "xhigh"]);
	assert.deepEqual(getSupportedThinkingLevels(sushi), ["off", "low", "medium", "xhigh"]);
	// Selecting a hidden level clamps upward, matching the gateway rewrite.
	assert.equal(clampThinkingLevel(vllm, "high"), "xhigh");
	assert.equal(clampThinkingLevel(vllm, "minimal"), "low");
	// Undeclared models keep Pi's defaults; the gateway still normalizes.
	assert.equal(unknown.thinkingLevelMap, undefined);
	assert.deepEqual(getSupportedThinkingLevels(unknown), ["off", "minimal", "low", "medium", "high"]);
	// Cache restoration preserves the projection.
	assert.deepEqual(restoreCatalog(origin, JSON.parse(JSON.stringify(models))), models);
});

test("malformed or unusable reasoning_efforts are ignored, never fatal", () => {
	for (const value of ["low", [1, 2], ["turbo"], [], Array(17).fill("low")]) {
		const { models } = projectCatalog(origin, catalog([model("m", { reasoning_efforts: value })]));
		assert.equal(models.length, 1);
		assert.equal(models[0].thinkingLevelMap, undefined, JSON.stringify(value));
	}
	const nonReasoning = projectCatalog(origin, catalog([model("m", { reasoning: false, reasoning_efforts: ["low"] })])).models[0];
	assert.equal(nonReasoning.thinkingLevelMap, undefined);
});

test("anthropic forceAdaptiveThinking from the catalog reaches Pi, other compat stays OpenAI-only", () => {
	const anthropic = {
		schema_version: 1,
		scope: "key-filtered-chat-candidates",
		providers: [
			{
				id: "anthropic",
				api: "anthropic-messages",
				operation: "chat",
				base_path: "/anthropic/v1",
				request_path: "/anthropic/v1/messages",
				models: [
					model("claude-sonnet-5-5", { compat: { forceAdaptiveThinking: true, supportsStore: false } }),
					model("claude-old"),
				],
			},
		],
	};
	const { models } = projectCatalog(origin, anthropic);
	assert.deepEqual(models[0].compat, { forceAdaptiveThinking: true });
	assert.equal(models[1].compat, undefined);
	assert.deepEqual(restoreCatalog(origin, JSON.parse(JSON.stringify(models))), models);
});
