import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryCredentialStore, InMemoryModelsStore, type ProviderStreams, lazyApi } from "@earendil-works/pi-ai";
import { type ExtensionAPI, type ExtensionContext, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { directGatewayProviders, initializeEavs } from "./index.js";
import { eavsProvider } from "./provider.js";

const origin = "https://eavs.example";
const key = "eavs-synthetic-routing";
const model = {
	id: "deepseek-ai/DeepSeek-V4.1-Flash",
	name: "Flash",
	reasoning: false,
	input: ["text"],
	context_window: 4096,
	max_tokens: 128,
	pricing: null,
};
const catalog = {
	schema_version: 1,
	scope: "key-filtered-chat-candidates",
	providers: [
		["fhgenie", "openai-completions", "/chat/completions"],
		["codex", "openai-responses", "/responses"],
		["claude", "anthropic-messages", "/messages"],
	].map(([id, api, suffix]) => ({
		id,
		api,
		operation: "chat",
		base_path: `/${id}/v1`,
		request_path: `/${id}/v1${suffix}`,
		models: [model],
	})),
};

test("projected native requests pin the gateway provider by path AND X-Provider", async () => {
	const captured: { path: string; provider: string | null; model: string }[] = [];
	const mockFetch: typeof fetch = async (input, init) => {
		const request = new Request(input, init);
		captured.push({
			path: new URL(request.url).pathname,
			provider: request.headers.get("x-provider"),
			model: ((await request.json()) as { model: string }).model,
		});
		return new Response(JSON.stringify({ error: { type: "invalid_request_error", message: "offline" } }), {
			status: 400,
			headers: { "content-type": "application/json" },
		});
	};
	const wrap = (real: ProviderStreams): ProviderStreams => ({
		stream: (m, c, o) => real.stream(m, c, { ...o, fetch: mockFetch }),
		streamSimple: (m, c, o) => real.streamSimple(m, c, { ...o, fetch: mockFetch }),
	});
	const sdk: { ModelRuntime: typeof ModelRuntime } = process.env.EAVS_TEST_INSTALLED_SDK
		? await import(process.env.EAVS_TEST_INSTALLED_SDK)
		: { ModelRuntime };
	const credentials = new InMemoryCredentialStore();
	await credentials.modify("eavs", async () => ({ type: "api_key", key, env: { EAVS_SERVER: origin } }));
	const runtime = await sdk.ModelRuntime.create({
		credentials,
		modelsPath: null,
		modelsStore: new InMemoryModelsStore(),
		refreshOnCreate: false,
	});
	runtime.registerNativeProvider(
		eavsProvider({
			fetchCatalog: async () => catalog,
			apis: {
				"openai-completions": wrap(lazyApi(() => import("@earendil-works/pi-ai/api/openai-completions"))),
				"openai-responses": wrap(lazyApi(() => import("@earendil-works/pi-ai/api/openai-responses"))),
				"anthropic-messages": wrap(lazyApi(() => import("@earendil-works/pi-ai/api/anthropic-messages"))),
			},
		})
	);
	await runtime.refresh({ providers: ["eavs"], allowNetwork: true, force: true });
	const models = await runtime.getAvailable("eavs");
	assert.equal(models.length, 3);
	for (const m of models)
		await runtime
			.streamSimple(
				m,
				{ messages: [{ role: "user", content: "offline", timestamp: 0 }] },
				{ maxRetries: 0, headers: { "X-Provider": "spoofed" } }
			)
			.result();
	assert.deepEqual(
		captured.map(({ path, provider, model: id }) => [path, provider, id]),
		[
			["/fhgenie/v1/chat/completions", "fhgenie", model.id],
			["/codex/v1/responses", "codex", model.id],
			["/claude/v1/messages", "claude", model.id],
		]
	);
});

test("hand-written models.json entries aimed at the EAVS origin are named with the remedy", async () => {
	const all = [
		{ provider: "eavs", baseUrl: `${origin}/fhgenie/v1` },
		{ provider: "eavs-fhgenie", baseUrl: origin },
		{ provider: "eavs-fhgenie", baseUrl: `${origin}/v1` },
		{ provider: "other", baseUrl: "https://api.example/v1" },
		{ provider: "broken", baseUrl: "not a url" },
	];
	assert.deepEqual(directGatewayProviders(all, origin), ["eavs-fhgenie"]);
	const notices: { message: string; level: string }[] = [];
	const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => Promise<void>>();
	const api = {
		registerProvider() {
			/* registration irrelevant here */
		},
		registerCommand() {
			/* commands irrelevant here */
		},
		on(name: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void>) {
			handlers.set(name, handler);
		},
	} as unknown as ExtensionAPI;
	const previous = process.env.PI_OFFLINE;
	process.env.PI_OFFLINE = "1";
	try {
		await initializeEavs(api, {}, () => ({ type: "api_key", key, env: { EAVS_SERVER: origin } }));
		await handlers.get("session_start")?.({}, {
			modelRegistry: { getAll: () => all },
			ui: { notify: (message: string, level: string) => notices.push({ message, level }) },
		} as unknown as ExtensionContext);
	} finally {
		if (previous === undefined) Reflect.deleteProperty(process.env, "PI_OFFLINE");
		else process.env.PI_OFFLINE = previous;
		await handlers.get("session_shutdown")?.({}, {} as ExtensionContext);
	}
	assert.equal(notices.length, 1);
	assert.equal(notices[0].level, "warning");
	assert.match(notices[0].message, /eavs-fhgenie/);
	assert.match(notices[0].message, /\/login/);
	assert.ok(!notices[0].message.includes(key));
});
