import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { Provider } from "@earendil-works/pi-ai";
import { type ExtensionAPI, type ExtensionContext, ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import extension, { initializeEavs } from "./index.js";

test("extension session lifecycle honors PI_OFFLINE, stops on logout/shutdown and never selects models", async () => {
	const previous = process.env.PI_OFFLINE;
	let provider: Provider | undefined;
	let refreshes = 0;
	let reads = 0;
	const events = new Map<string, (event: unknown, context: ExtensionContext) => Promise<void>>();
	const api = {
		registerProvider(p: Provider) {
			provider = p;
		},
		registerCommand() {
			/* Command UI is outside this lifecycle fixture. */
		},
		on(name: string, handler: (event: unknown, context: ExtensionContext) => Promise<void>) {
			events.set(name, handler);
		},
		setModel() {
			assert.fail("must not auto-select models");
		},
	} as unknown as ExtensionAPI;
	const context = {
		modelRegistry: {
			async getProviderAuth() {
				reads++;
				return { auth: { apiKey: "eavs-synthetic" } };
			},
			async refresh(options: { signal: AbortSignal }) {
				refreshes++;
				assert.ok(options.signal);
				return { aborted: false, errors: new Map() };
			},
		},
	} as unknown as ExtensionContext;
	try {
		process.env.PI_OFFLINE = "1";
		await extension(api);
		await events.get("session_start")?.({}, context);
		await delay(15);
		assert.equal(reads, 0);
		assert.equal(refreshes, 0);
		Reflect.deleteProperty(process.env, "PI_OFFLINE");
		await events.get("session_start")?.({}, context);
		await delay(15);
		assert.equal(refreshes, 1);
		assert.ok(provider?.auth.apiKey);
		const ctx = { env: async () => undefined, fileExists: async () => false };
		await provider.auth.apiKey.resolve({ ctx, signal: new AbortController().signal });
		await events.get("session_shutdown")?.({}, context);
		await delay(15);
		assert.equal(refreshes, 1);
		// Auth lookups made by an old runtime after shutdown cannot restart it.
		await provider.auth.apiKey.resolve({
			ctx,
			credential: { type: "api_key", key: "eavs-synthetic", env: { EAVS_SERVER: "https://eavs.example" } },
			signal: new AbortController().signal,
		});
		await delay(15);
		assert.equal(refreshes, 1);
	} finally {
		await events.get("session_shutdown")?.({}, context);
		if (previous === undefined) Reflect.deleteProperty(process.env, "PI_OFFLINE");
		else process.env.PI_OFFLINE = previous;
	}
});

// All state is synthetic and isolated; never open the user's SDK cache.
test("truncated SDK cache fails native login and manual refresh with actionable local-state diagnostics", async () => {
	const dir = await mkdtemp(join(tmpdir(), "eavs-corrupt-cache-"));
	const previous = process.env.PI_OFFLINE;
	const events = new Map<string, (e: unknown, c: ExtensionContext) => Promise<void>>();
	let command: ((args: string, c: ExtensionContext) => Promise<void>) | undefined;
	const notices: string[] = [];
	try {
		Reflect.deleteProperty(process.env, "PI_OFFLINE");
		const broken = '{"eavs":{"models":[';
		await writeFile(join(dir, "cache.json"), broken);
		const sdk: { ModelRuntime: typeof ModelRuntime; ModelRegistry: typeof ModelRegistry } = process.env.EAVS_TEST_INSTALLED_SDK
			? await import(process.env.EAVS_TEST_INSTALLED_SDK)
			: { ModelRuntime, ModelRegistry };
		const runtime = await sdk.ModelRuntime.create({
			authPath: join(dir, "auth.json"),
			modelsPath: join(dir, "models.json"),
			modelsStorePath: join(dir, "cache.json"),
			refreshOnCreate: false,
		});
		const api = {
			registerProvider(p: Provider) {
				runtime.registerNativeProvider(p);
			},
			registerCommand(_name: string, spec: { handler: typeof command }) {
				command = spec.handler;
			},
			on(name: string, handler: (e: unknown, c: ExtensionContext) => Promise<void>) {
				events.set(name, handler);
			},
		} as unknown as ExtensionAPI;
		await initializeEavs(
			api,
			{
				fetchCatalog: async () => ({ schema_version: 1, scope: "key-filtered-chat-candidates", providers: [] }),
			},
			() => undefined
		);
		const context = {
			modelRegistry: new sdk.ModelRegistry(runtime),
			ui: {
				notify(message: string) {
					notices.push(message);
				},
			},
		} as unknown as ExtensionContext;
		await assert.rejects(
			runtime.login("eavs", "api_key", {
				prompt: async (p) => (p.type === "secret" ? "eavs-synthetic" : "https://eavs.example"),
				notify() {
					/* synthetic interaction */
				},
			}),
			(error) => {
				assert.equal((error as Error).name, "CredentialSynchronizationError");
				assert.ok((error as Error).cause instanceof SyntaxError);
				return true;
			}
		);
		assert.deepEqual(JSON.parse(await readFile(join(dir, "auth.json"), "utf8")).eavs.env, {
			EAVS_SERVER: "https://eavs.example",
		});
		await command?.("", context);
		assert.match(notices.at(-1) ?? "", /Local state\/publication failure/);
		assert.match(notices.at(-1) ?? "", /models-store.json/);
		assert.ok(!notices.join(" ").includes("eavs-synthetic"));
		assert.ok(!notices.join(" ").includes("SyntaxError"));
		assert.equal(await readFile(join(dir, "cache.json"), "utf8"), broken);
		assert.equal(await readFile(join(dir, "models.json"), "utf8").catch(() => "absent"), "absent");
	} finally {
		await events.get("session_shutdown")?.({}, {} as ExtensionContext);
		if (previous === undefined) Reflect.deleteProperty(process.env, "PI_OFFLINE");
		else process.env.PI_OFFLINE = previous;
		await rm(dir, { recursive: true, force: true });
	}
});
