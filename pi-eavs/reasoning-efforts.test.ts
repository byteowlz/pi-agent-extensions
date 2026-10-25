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

test("a declared none/off effort maps Pi's off level to a value the upstream accepts", () => {
	const { models } = projectCatalog(
		origin,
		catalog([
			model("dsv41", { reasoning_efforts: ["none", "low", "high", "xhigh"] }),
			model("sushi", { reasoning_efforts: ["off", "low", "medium", "xhigh"] }),
			model("vllm", { reasoning_efforts: ["xhigh", "medium", "low"] }),
		])
	);
	const [dsv41, sushi, vllm] = models;
	// DeepSeek V4.1 (vLLM): none disables reasoning; minimal and medium are rejected upstream.
	assert.equal(dsv41.thinkingLevelMap?.off, "none");
	assert.deepEqual(getSupportedThinkingLevels(dsv41), ["off", "low", "high", "xhigh"]);
	assert.equal(clampThinkingLevel(dsv41, "medium"), "high");
	// Sushi spells it "off"; keep the upstream's own spelling.
	assert.equal(sushi.thinkingLevelMap?.off, "off");
	// Nothing declared for off: Pi keeps sending nothing (upstream default).
	assert.equal(vllm.thinkingLevelMap?.off, undefined);
	assert.deepEqual(getSupportedThinkingLevels(vllm), ["off", "low", "medium", "xhigh"]);
	// Survives cache restoration.
	assert.deepEqual(restoreCatalog(origin, JSON.parse(JSON.stringify(models))), models);
});
