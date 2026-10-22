import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryModelsStore } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { projectCatalog, restoreCatalog } from "./catalog.js";
import { eavsProvider } from "./provider.js";

const origin = "https://eavs.example";
const catalog = {
	schema_version: 1,
	scope: "key-filtered-chat-candidates",
	providers: [
		{
			id: "local",
			api: "openai-completions",
			operation: "chat",
			base_path: "/local/v1",
			request_path: "/local/v1/chat/completions",
			models: [
				{
					id: "fixture",
					name: "Fixture",
					input: ["text"],
					reasoning: false,
					context_window: 4096,
					max_tokens: 512,
					pricing: null,
				},
			],
		},
	],
};
test("null pricing remains discoverable, visibly unknown, and survives cache restoration", () => {
	const projection = projectCatalog(origin, catalog);
	assert.equal(projection.models.length, 1);
	assert.equal(projection.skipped, 0);
	assert.match(projection.models[0].name, /price unknown/);
	assert.equal(Reflect.get(projection.models[0], "eavsPricing"), "unknown");
	assert.deepEqual(restoreCatalog(origin, JSON.parse(JSON.stringify(projection.models))), projection.models);
	const missing = structuredClone(catalog);
	Reflect.deleteProperty(missing.providers[0].models[0], "pricing");
	assert.deepEqual(projectCatalog(origin, missing), projection);
	const tampered = structuredClone(projection.models);
	tampered[0].cost.input = 1;
	assert.throws(() => restoreCatalog(origin, tampered));
	const explicitZero = structuredClone(catalog);
	Reflect.set(explicitZero.providers[0].models[0], "pricing", {
		status: "unverified_estimate",
		unit: "USD_per_million_tokens",
		rates: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
	});
	const zeroProjection = projectCatalog(origin, explicitZero);
	assert.equal(zeroProjection.models[0].eavsPricing, undefined);
	assert.doesNotMatch(zeroProjection.models[0].name, /price unknown/);
	assert.deepEqual(restoreCatalog(origin, zeroProjection.models), zeroProjection.models);
	const malformed = structuredClone(catalog);
	Reflect.set(malformed.providers[0].models[0], "pricing", {
		status: "unverified_estimate",
		unit: "USD_per_million_tokens",
		rates: { input: -1, output: 1, cache_read: 0, cache_write: 0 },
	});
	assert.throws(() => projectCatalog(origin, malformed));
	const incomplete = structuredClone(catalog);
	incomplete.providers[0].models[0].context_window = 0;
	assert.throws(() => projectCatalog(origin, incomplete));
});
test("real SDK publishes null-priced candidates without inference or file stores", async () => {
	const sdk: { ModelRuntime: typeof ModelRuntime } = process.env.EAVS_TEST_INSTALLED_SDK
		? await import(process.env.EAVS_TEST_INSTALLED_SDK)
		: { ModelRuntime };
	const credential = { type: "api_key" as const, key: "eavs-synthetic", env: { EAVS_SERVER: origin } };
	const modelsStore = new InMemoryModelsStore();
	const createRuntime = () =>
		sdk.ModelRuntime.create({
			credentials: {
				read: async (id) => (id === "eavs" ? credential : undefined),
				list: async () => [{ providerId: "eavs", type: "api_key" }],
				modify: async () => {
					throw new Error("read only");
				},
				delete: async () => {
					throw new Error("read only");
				},
			},
			modelsPath: null,
			modelsStore,
			refreshOnCreate: false,
		});
	const runtime = await createRuntime();
	runtime.registerNativeProvider(eavsProvider({ fetchCatalog: async () => catalog }));
	const result = await runtime.refresh({ providers: ["eavs"], allowNetwork: true, force: true });
	assert.equal(result.errors.size, 0);
	const available = await runtime.getAvailable("eavs");
	assert.equal(available.length, 1);
	assert.match(available[0].name, /price unknown/);
	assert.equal(Reflect.get(available[0], "eavsPricing"), "unknown");
	const restored = await createRuntime();
	restored.registerNativeProvider(
		eavsProvider({
			fetchCatalog: async () => {
				throw new Error("network forbidden");
			},
		})
	);
	await restored.refresh({ providers: ["eavs"], allowNetwork: false, force: true });
	for (let i = 0; i < 100 && restored.getModels("eavs").length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 5));
	const cached = await restored.getAvailable("eavs");
	assert.deepEqual(cached, available);
});
