import assert from "node:assert/strict";
import { test } from "node:test";
import type { Provider } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { initializeEavs } from "./index.js";

test("invalid capability omissions are disclosed on successful manual refresh", async () => {
	let provider: Provider | undefined;
	let run: ((args: string, ctx: ExtensionContext) => Promise<void>) | undefined;
	let shutdown: (() => Promise<void>) | undefined;
	const notices: { message: string; level: string }[] = [];
	const api = {
		registerProvider(value: Provider) {
			provider = value;
		},
		registerCommand(_name: string, spec: { handler: typeof run }) {
			run = spec.handler;
		},
		on(name: string, handler: typeof shutdown) {
			if (name === "session_shutdown") shutdown = handler;
		},
	} as unknown as ExtensionAPI;
	const model = { id: "fixture", name: "Fixture", reasoning: false, input: ["text"], context_window: 4096, max_tokens: 256 };
	const providers = [
		{
			id: "priced",
			models: [
				{
					...model,
					pricing: {
						status: "unverified_estimate",
						unit: "USD_per_million_tokens",
						rates: { input: 1, output: 2, cache_read: 0, cache_write: 0 },
					},
				},
			],
		},
		{ id: "unpriced", models: [{ ...model, context_window: 0, pricing: null }] },
	].map((p) => ({
		...p,
		api: "openai-completions",
		operation: "chat",
		base_path: `/${p.id}/v1`,
		request_path: `/${p.id}/v1/chat/completions`,
	}));
	await initializeEavs(
		api,
		{ fetchCatalog: async () => ({ schema_version: 1, scope: "key-filtered-chat-candidates", providers }) },
		() => undefined
	);
	const ctx = {
		modelRegistry: {
			getProviderAuth: async () => ({ auth: { apiKey: "synthetic" } }),
			refresh: async () => {
				assert.ok(provider);
				await provider.refreshModels?.({
					credential: { type: "api_key", key: "eavs-synthetic", env: { EAVS_SERVER: "https://eavs.example" } },
					allowNetwork: true,
					signal: new AbortController().signal,
					publish: async (publication) => {
						publication.update?.();
						return true;
					},
				});
				return { aborted: false, errors: new Map() };
			},
		},
		ui: {
			notify(message: string, level: string) {
				notices.push({ message, level });
			},
		},
	} as unknown as ExtensionContext;
	try {
		assert.ok(run);
		assert.ok(provider);
		await run("", ctx);
		assert.equal(provider.getModels().length, 1, "missing pricing must not bypass capability validation");
		assert.match(notices.at(-1)?.message ?? "", /1 models; omitted 1.*pricing/);
		assert.equal(notices.at(-1)?.level, "warning");
	} finally {
		await shutdown?.();
	}
});
