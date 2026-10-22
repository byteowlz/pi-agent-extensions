import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { InMemoryModelsStore } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { HttpPolicy } from "./http-policy.js";
import { eavsProvider } from "./provider.js";
import { fetchCatalog, secureFetch } from "./transport.js";

test("explicit HTTP uses bounded direct transport; native failures disclose status but never bodies", async () => {
	let origin = "";
	let mode = "catalog";
	let requests = 0;
	let redirected = 0;
	const key = "eavs-synthetic-http";
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
						max_tokens: 128,
						pricing: null,
					},
				],
			},
		],
	};
	const server = createServer((req, res) => {
		requests++;
		assert.equal(req.headers.authorization, `Bearer ${key}`);
		if (req.url === "/v1/eavs/catalog") {
			if (mode === "large") {
				res.end("x".repeat(4 * 1024 * 1024 + 1));
				return;
			}
			if (mode === "stall") {
				res.writeHead(200);
				res.write("{");
				return;
			}
			res.end(JSON.stringify(catalog));
			return;
		}
		if (req.url !== "/local/v1/chat/completions") {
			redirected++;
			res.end();
			return;
		}
		if (mode === "redirect") {
			res.writeHead(302, { Location: `${origin}/target` });
			res.end();
			return;
		}
		res.writeHead(403, { "content-type": "application/json" });
		res.end(JSON.stringify({ error: { message: `private ${key} secret-body`, type: "authentication_error" } }));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	origin = `http://127.0.0.1:${address.port}`;
	const proxyKeys = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"] as const;
	const priorProxy = new Map(proxyKeys.map((key) => [key, process.env[key]]));
	for (const key of proxyKeys) process.env[key] = "http://127.0.0.1:1";
	try {
		await assert.rejects(fetchCatalog(origin, key, new AbortController().signal));
		assert.equal(requests, 0);
		const policy = new HttpPolicy();
		policy.allowOnce(origin);
		assert.deepEqual(await fetchCatalog(origin, key, new AbortController().signal, policy.origins()), catalog);
		await assert.rejects(secureFetch(origin, () => policy.origins())("http://127.0.0.1:1/v1/eavs/catalog"));
		assert.equal(requests, 1);
		const cancelled = new AbortController();
		cancelled.abort();
		await assert.rejects(fetchCatalog(origin, key, cancelled.signal, policy.origins()));
		assert.equal(requests, 1);
		mode = "large";
		await assert.rejects(fetchCatalog(origin, key, new AbortController().signal, policy.origins()));
		mode = "stall";
		const abort = new AbortController();
		const timer = setTimeout(() => abort.abort(), 50);
		try {
			await assert.rejects(fetchCatalog(origin, key, abort.signal, policy.origins()));
		} finally {
			clearTimeout(timer);
		}
		mode = "catalog";
		const sdk: { ModelRuntime: typeof ModelRuntime } = process.env.EAVS_TEST_INSTALLED_SDK
			? await import(process.env.EAVS_TEST_INSTALLED_SDK)
			: { ModelRuntime };
		const credential = { type: "api_key" as const, key, env: { EAVS_SERVER: origin } };
		const runtime = await sdk.ModelRuntime.create({
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
			modelsStore: new InMemoryModelsStore(),
			refreshOnCreate: false,
		});
		runtime.registerNativeProvider(eavsProvider({ httpPolicy: policy, fetchCatalog: async () => catalog }));
		await runtime.refresh({ providers: ["eavs"], allowNetwork: true, force: true });
		const model = (await runtime.getAvailable("eavs"))[0];
		assert.ok(model);
		const result = await runtime
			.streamSimple(
				model,
				{ messages: [{ role: "user", content: "synthetic fixture", timestamp: 0 }] },
				{ maxRetries: 0, maxTokens: 1 }
			)
			.result();
		assert.equal(result.stopReason, "error");
		assert.match(result.errorMessage ?? "", /HTTP 403/);
		assert.ok(!result.errorMessage?.includes(key));
		assert.ok(!result.errorMessage?.includes("secret-body"));
		mode = "redirect";
		await assert.rejects(
			secureFetch(origin, () => policy.origins())(`${origin}/local/v1/chat/completions`, {
				headers: { Authorization: `Bearer ${key}` },
			})
		);
		assert.equal(redirected, 0);
		const count = requests;
		const pending = secureFetch(origin, () => policy.origins());
		policy.clear();
		await assert.rejects(pending(`${origin}/v1/eavs/catalog`, { headers: { Authorization: `Bearer ${key}` } }));
		assert.equal(requests, count);
		assert.equal((await runtime.getAvailable("eavs")).length, 0);
	} finally {
		for (const key of proxyKeys) {
			const value = priorProxy.get(key);
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});
