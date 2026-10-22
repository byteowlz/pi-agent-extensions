import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
	type AuthInteraction,
	InMemoryCredentialStore,
	InMemoryModelsStore,
	type Model,
	type ProviderStreams,
	createAssistantMessageEventStream,
	createModels,
	lazyApi,
} from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { type NativeApi, projectCatalog, restoreCatalog, scopedKey, serverOrigin } from "./catalog.js";
import { eavsProvider } from "./provider.js";
import { RefreshLoop } from "./refresh-loop.js";
import { CatalogError } from "./transport.js";

const key = "eavs-synthetic-only-not-a-real-key";
const origin = "https://eavs.example";
const model = () => ({
	id: "model/a",
	name: "Model A",
	reasoning: true,
	input: ["text"],
	context_window: 1000,
	max_tokens: 100,
	pricing: {
		status: "unverified_estimate",
		unit: "USD_per_million_tokens",
		rates: { input: 1, output: 2, cache_read: 0, cache_write: 0 },
	},
});
const catalog = () => ({
	schema_version: 1,
	scope: "key-filtered-chat-candidates",
	providers: [
		{
			id: "chat",
			api: "openai-completions",
			operation: "chat",
			base_path: "/chat/v1",
			request_path: "/chat/v1/chat/completions",
			models: [model()],
		},
		{
			id: "codex",
			api: "openai-codex-responses",
			operation: "chat",
			base_path: "/codex/v1",
			request_path: "/codex/v1/responses",
			models: [model()],
		},
		{
			id: "claude",
			api: "anthropic-messages",
			operation: "chat",
			base_path: "/claude/v1",
			request_path: "/claude/v1/messages",
			models: [model()],
		},
	],
});
const empty = () => ({ ...catalog(), providers: [] });
function interaction(
	server = origin,
	token = key,
	signal?: AbortSignal
): AuthInteraction & { prompts: string[]; notices: string[] } {
	const prompts: string[] = [];
	const notices: string[] = [];
	return {
		signal,
		prompts,
		notices,
		async prompt(p) {
			prompts.push(p.type);
			return p.type === "secret" ? token : server;
		},
		notify(event) {
			if ("message" in event) notices.push(event.message);
		},
	};
}

test("URL handling is explicit; key commands/operator forms refused", () => {
	for (const input of [origin, `${origin}/`, `${origin}/v1`, `${origin}/v1/`]) assert.equal(serverOrigin(input), origin);
	for (const input of [
		"http://127.0.0.1:8080",
		"https://u:p@eavs.example",
		`${origin}/foo/v1`,
		`${origin}/v1/v1`,
		`${origin}/?key=x`,
		`${origin}/#x`,
		"file:///tmp/key",
	])
		assert.throws(() => serverOrigin(input));
	for (const input of ["!touch /tmp/no", "$KEY", "operator-secret", "eavs-a\n", "eavs-a b"])
		assert.throws(() => scopedKey(input));
});

test("projection preserves provider paths, native mappings, limits, skip policy and duplicates", () => {
	const projection = projectCatalog(origin, catalog());
	assert.equal(projection.models.length, 3);
	assert.deepEqual(
		projection.models.map((m) => [m.id, m.api, m.baseUrl]),
		[
			["chat/model/a", "openai-completions", `${origin}/chat/v1`],
			["codex/model/a", "openai-responses", `${origin}/codex/v1`],
			["claude/model/a", "anthropic-messages", `${origin}/claude/v1`],
		]
	);
	assert.deepEqual(restoreCatalog(origin, projection.models), projection.models);
	const mixed = catalog();
	mixed.providers[0].models[0].max_tokens = 0;
	assert.equal(projectCatalog(origin, mixed).skipped, 1);
	assert.deepEqual(projectCatalog(origin, empty()).models, []);
	const bad = catalog();
	bad.providers[0].request_path = "https://evil.example/generate";
	assert.throws(() => projectCatalog(origin, bad));
	const duplicate = catalog();
	duplicate.providers.push(duplicate.providers[0]);
	assert.throws(() => projectCatalog(origin, duplicate));
	const unpriced = catalog();
	for (const p of unpriced.providers) p.models[0].pricing.rates.input = 0;
	assert.equal(projectCatalog(origin, unpriced).models.length, 3);
	assert.throws(() => projectCatalog(origin, { ...catalog(), scope: "all-models" }));
	assert.throws(() => restoreCatalog(origin, [{ ...projection.models[0], baseUrl: "https://evil.example/chat/v1" }]));
});

test("actual SDK login, file persistence, restart cache, refresh, empty/revoked scope and logout", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-eavs-test-"));
	try {
		const authPath = join(dir, "auth.json");
		const modelsStorePath = join(dir, "models-store.json");
		let response: unknown = catalog();
		let reads = 0;
		const fetchMetadata = async (url: string, token: string) => {
			assert.equal(url, origin);
			assert.equal(token, key);
			reads++;
			return response;
		};
		const runtime = await ModelRuntime.create({
			authPath,
			modelsPath: join(dir, "models.json"),
			modelsStorePath,
			refreshOnCreate: false,
		});
		runtime.registerNativeProvider(eavsProvider({ fetchCatalog: fetchMetadata }));
		assert.equal(runtime.getProvider("eavs")?.auth.oauth, undefined);
		assert.ok(runtime.getProvider("eavs")?.auth.apiKey?.login);
		assert.equal((await runtime.getAvailable("eavs")).length, 0);
		const ui = interaction(`${origin}/v1`);
		await runtime.login("eavs", "api_key", ui);
		assert.deepEqual(ui.prompts, ["text", "secret"]);
		assert.match(ui.notices.join(" "), /unencrypted/);
		assert.ok(!ui.notices.join(" ").includes(key));
		assert.equal((await runtime.getAvailable("eavs")).length, 3);
		assert.equal(reads, 1);
		const saved = JSON.parse(await readFile(authPath, "utf8"));
		assert.deepEqual(saved.eavs, { type: "api_key", key, env: { EAVS_SERVER: origin } });
		const cache = await readFile(modelsStorePath, "utf8");
		assert.ok(!cache.includes(key));
		const restored = await ModelRuntime.create({
			authPath,
			modelsPath: join(dir, "models.json"),
			modelsStorePath,
			refreshOnCreate: false,
		});
		restored.registerNativeProvider(eavsProvider({ fetchCatalog: fetchMetadata }));
		await restored.refresh({ providers: ["eavs"], allowNetwork: false });
		// registerNativeProvider starts an unawaited cache refresh; concurrent
		// explicit refresh can be superseded. Verify eventual cache restoration.
		for (let i = 0; i < 200 && restored.getModels("eavs").length === 0; i++) await delay(5);
		assert.equal((await restored.getAvailable("eavs")).length, 3);
		assert.equal(reads, 1);
		const unrelated = restored.getProvider("openai");
		response = empty();
		await restored.refresh({ providers: ["eavs"], allowNetwork: true, force: true });
		assert.equal((await restored.getAvailable("eavs")).length, 0);
		assert.equal(restored.getProvider("openai"), unrelated);
		response = catalog();
		await restored.refresh({ providers: ["eavs"], allowNetwork: true, force: true });
		assert.equal((await restored.getAvailable("eavs")).length, 3);
		response = { error: `revoked ${key}` };
		const failed = await restored.refresh({ providers: ["eavs"], allowNetwork: true });
		assert.equal(failed.errors.size, 1);
		assert.ok(!failed.errors.get("eavs")?.message.includes(key));
		assert.equal((await restored.getAvailable("eavs")).length, 0);
		await restored.logout("eavs");
		assert.equal(await restored.getAuth("eavs"), undefined);
		assert.equal((await restored.getAvailable("eavs")).length, 0);
		assert.ok(!JSON.parse(await readFile(authPath, "utf8")).eavs);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("login cancellation at prompt and metadata read never persists or mutates available catalog", async () => {
	for (const phase of ["prompt", "fetch"]) {
		const credentials = new InMemoryCredentialStore();
		const models = createModels({ credentials });
		const controller = new AbortController();
		let reads = 0;
		models.setProvider(
			eavsProvider({
				fetchCatalog: async (_o, _k, signal) => {
					reads++;
					controller.abort();
					assert.ok(signal.aborted);
					return catalog();
				},
			})
		);
		const ui = interaction(origin, key, controller.signal);
		if (phase === "prompt")
			ui.prompt = async () => {
				controller.abort();
				return origin;
			};
		await assert.rejects(models.login("eavs", "api_key", ui));
		assert.equal(await credentials.read("eavs"), undefined);
		assert.equal(models.getModels("eavs").length, 0);
		assert.equal(reads, phase === "fetch" ? 1 : 0);
	}
});

test("changing servers/keys cannot restore another scope, execute commands or dispatch old models", async () => {
	const credentials = new InMemoryCredentialStore();
	const store = new InMemoryModelsStore();
	const models = createModels({ credentials, modelsStore: store });
	models.setProvider(eavsProvider({ fetchCatalog: async () => catalog() }));
	await models.login("eavs", "api_key", interaction());
	await models.refresh({ allowNetwork: false });
	const old = models.getModels("eavs")[0];
	await credentials.modify("eavs", async () => ({
		type: "api_key",
		key: "eavs-other-synthetic-key",
		env: { EAVS_SERVER: "https://other.example" },
	}));
	assert.equal((await models.getAvailable("eavs")).length, 0);
	const reloaded = createModels({ credentials, modelsStore: store });
	reloaded.setProvider(
		eavsProvider({
			fetchCatalog: async () => {
				throw new Error("private upstream error");
			},
		})
	);
	await reloaded.refresh({ allowNetwork: false });
	assert.equal(reloaded.getModels("eavs").length, 0);
	const result = await models.streamSimple(old, { messages: [] }).result();
	assert.equal(result.stopReason, "error");
	await credentials.modify("eavs", async () => ({ type: "api_key", key: "!false", env: { EAVS_SERVER: origin } }));
	assert.equal(await models.getAuth("eavs"), undefined);
});

test("cancelled refresh cannot publish late scope results over a newer SDK generation", async () => {
	let waiting = false;
	let release: (() => void) | undefined;
	let begin: (() => void) | undefined;
	const started = new Promise<void>((resolve) => {
		begin = resolve;
	});
	const models = createModels();
	models.setProvider(
		eavsProvider({
			fetchCatalog: async () => {
				if (waiting) {
					begin?.();
					await new Promise<void>((resolve) => {
						release = resolve;
					});
					return empty();
				}
				return catalog();
			},
		})
	);
	await models.login("eavs", "api_key", interaction());
	await models.refresh({ allowNetwork: false });
	waiting = true;
	const controller = new AbortController();
	const cancelled = models.refresh({ signal: controller.signal });
	await started;
	controller.abort();
	assert.equal((await cancelled).aborted, true);
	waiting = false;
	await models.refresh();
	release?.();
	await delay(5);
	assert.equal((await models.getAvailable("eavs")).length, 3);
});

test("native API dispatch uses upstream ids and routes, keeps Pi identity and redacts stream errors", async () => {
	const calls: { api: string; id: string; base: string }[] = [];
	function api(name: NativeApi): ProviderStreams {
		const stream = (m: Model<NativeApi>) => {
			calls.push({ api: name, id: m.id, base: m.baseUrl });
			const out = createAssistantMessageEventStream();
			out.push({
				type: "error",
				reason: "error",
				error: {
					role: "assistant",
					api: m.api,
					provider: m.provider,
					model: m.id,
					content: [],
					stopReason: "error",
					timestamp: 0,
					errorMessage: `secret ${key}`,
					usage: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 0,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
				},
			});
			out.end();
			return out;
		};
		return { stream, streamSimple: stream };
	}
	const models = createModels();
	models.setProvider(
		eavsProvider({
			fetchCatalog: async () => catalog(),
			apis: {
				"openai-completions": api("openai-completions"),
				"openai-responses": api("openai-responses"),
				"anthropic-messages": api("anthropic-messages"),
			},
		})
	);
	await models.login("eavs", "api_key", interaction());
	await models.refresh({ allowNetwork: false });
	for (const m of models.getModels("eavs")) {
		const result = await models.streamSimple(m, { messages: [] }).result();
		assert.equal(result.model, m.id);
		assert.ok(!result.errorMessage?.includes(key));
	}
	assert.deepEqual(
		calls.map((c) => c.api),
		["openai-completions", "openai-responses", "anthropic-messages"]
	);
	assert.ok(calls.every((c) => c.id === "model/a" && !c.base.includes("/v1/v1")));
});

test("installed native SDK constructs exact request paths without network or inference", async () => {
	const captured: { path: string; model: string }[] = [];
	const mockFetch: typeof fetch = async (input, init) => {
		const request = new Request(input, init);
		const body = (await request.json()) as { model: string };
		captured.push({ path: new URL(request.url).pathname, model: body.model });
		return new Response(JSON.stringify({ error: { type: "invalid_request_error", message: "offline fixture" } }), {
			status: 400,
			headers: { "content-type": "application/json" },
		});
	};
	const wrap = (real: ProviderStreams): ProviderStreams => ({
		stream: (m, c, o) => real.stream(m, c, { ...o, fetch: mockFetch }),
		streamSimple: (m, c, o) => real.streamSimple(m, c, { ...o, fetch: mockFetch }),
	});
	const models = createModels();
	models.setProvider(
		eavsProvider({
			fetchCatalog: async () => catalog(),
			apis: {
				"openai-completions": wrap(lazyApi(() => import("@earendil-works/pi-ai/api/openai-completions"))),
				"openai-responses": wrap(lazyApi(() => import("@earendil-works/pi-ai/api/openai-responses"))),
				"anthropic-messages": wrap(lazyApi(() => import("@earendil-works/pi-ai/api/anthropic-messages"))),
			},
		})
	);
	await models.login("eavs", "api_key", interaction());
	await models.refresh({ allowNetwork: false });
	for (const m of models.getModels("eavs"))
		await models.streamSimple(m, { messages: [{ role: "user", content: "offline fixture", timestamp: 0 }] }).result();
	assert.deepEqual(captured, [
		{ path: "/chat/v1/chat/completions", model: "model/a" },
		{ path: "/codex/v1/responses", model: "model/a" },
		{ path: "/claude/v1/messages", model: "model/a" },
	]);
});

test("automatic metadata polling observes policy changes, retains transient cache and stops on logout", async () => {
	const credentials = new InMemoryCredentialStore();
	const models = createModels({ credentials });
	let mode = "full";
	let reads = 0;
	let authenticated = false;
	const loop = new RefreshLoop(
		async (signal) => {
			const auth = await models.getAuth("eavs");
			if (!auth) return { failed: false, configured: false };
			const result = await models.refresh({ providers: ["eavs"], signal });
			return { failed: result.errors.size > 0, configured: authenticated };
		},
		10,
		40
	);
	models.setProvider(
		eavsProvider({
			onAuthChange(configured) {
				authenticated = configured;
				if (!configured) loop.stop();
			},
			fetchCatalog: async () => {
				reads++;
				if (mode === "transient") throw new CatalogError("transient");
				if (mode === "revoked") throw new CatalogError("auth");
				return mode === "empty" ? empty() : catalog();
			},
		})
	);
	try {
		await models.login("eavs", "api_key", interaction());
		await models.refresh({ allowNetwork: false });
		assert.equal((await models.getAvailable("eavs")).length, 3);
		mode = "transient";
		await loop.run();
		assert.equal((await models.getAvailable("eavs")).length, 3);
		mode = "empty";
		loop.start();
		await delay(35);
		assert.equal((await models.getAvailable("eavs")).length, 0);
		mode = "full";
		await delay(35);
		assert.equal((await models.getAvailable("eavs")).length, 3);
		mode = "revoked";
		await delay(35);
		assert.equal((await models.getAvailable("eavs")).length, 0);
		await models.logout("eavs");
		await models.getAuth("eavs");
		const afterLogout = reads;
		await delay(60);
		assert.equal(reads, afterLogout);
	} finally {
		loop.stop();
	}
});
