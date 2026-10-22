import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { initializeEavs } from "./index.js";
import { CatalogError } from "./transport.js";

test("manual refresh emits allowlisted categories, never raw SDK/transport errors", async () => {
	for (const [error, category] of [
		[new CatalogError("auth"), /Authorization denied/],
		[new CatalogError("transient"), /Network\/TLS/],
		[new CatalogError("invalid"), /Catalog schema invalid/],
		[new SyntaxError("secret-key raw cache fragment"), /Local state\/publication failure/],
	] as const) {
		let run: ((args: string, ctx: ExtensionContext) => Promise<void>) | undefined;
		let shutdown: (() => Promise<void>) | undefined;
		const messages: string[] = [];
		const api = {
			registerProvider() {
				/* registration is irrelevant to category mapping */
			},
			registerCommand(_name: string, spec: { handler: typeof run }) {
				run = spec.handler;
			},
			on(name: string, handler: typeof shutdown) {
				if (name === "session_shutdown") shutdown = handler;
			},
		} as unknown as ExtensionAPI;
		await initializeEavs(api, {}, () => undefined);
		const ctx = {
			modelRegistry: {
				getProviderAuth: async () => ({ auth: { apiKey: "synthetic" } }),
				refresh: async () => ({ aborted: false, errors: new Map([["eavs", error]]) }),
			},
			ui: {
				notify(message: string) {
					messages.push(message);
				},
			},
		} as unknown as ExtensionContext;
		try {
			await run?.("", ctx);
			assert.match(messages.join(" "), category);
			assert.ok(!messages.join(" ").includes("secret-key"));
			assert.ok(!messages.join(" ").includes("SyntaxError"));
			// Compatibility failures must not be mistaken for denied authorization.
			Reflect.deleteProperty(ctx.modelRegistry, "getProviderAuth");
			await run?.("", ctx);
			assert.match(messages.at(-1) ?? "", /SDK compatibility/);
		} finally {
			await shutdown?.();
		}
	}
});
