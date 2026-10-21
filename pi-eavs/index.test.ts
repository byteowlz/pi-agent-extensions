import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { Provider } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import extension from "./index.js";

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
