import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { InMemoryModelsStore } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { HttpPolicy } from "./http-policy.js";
import { describeFailure, eavsProvider } from "./provider.js";
import { type TransportState, fetchCatalog, secureFetch, upstreamDetail } from "./transport.js";

test("explicit HTTP uses bounded direct transport; native failures show the sanitized upstream message, never keys", async () => {
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
		assert.match(result.errorMessage ?? "", /Upstream said: "private \[redacted\] secret-body"/);
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

test("transport reports a safe stage and network code when the server drops the connection", async () => {
	const server = createServer((req) => req.socket.destroy());
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	const origin = `http://127.0.0.1:${address.port}`;
	const states: TransportState[] = [];
	try {
		const send = secureFetch(
			origin,
			() => [origin],
			(state) => states.push(state)
		);
		await assert.rejects(send(`${origin}/x/v1/chat/completions`, { method: "POST", body: "y".repeat(3000) }));
		const last = states.at(-1);
		assert.equal(last?.stage, "network");
		assert.ok(last?.stage === "network" && last.bodyKiB === 3 && last.code && /^[A-Z_]+$/.test(last.code));
		assert.match(describeFailure(last), /network error E[A-Z]+ after sending 3 KiB/);
		await assert.rejects(
			secureFetch(
				origin,
				() => [origin],
				(state) => states.push(state)
			)("http://127.0.0.1:1/x")
		);
		assert.equal(states.at(-1)?.stage, "refused");
		const cancelled = new AbortController();
		cancelled.abort();
		await assert.rejects(send(`${origin}/x`, { signal: cancelled.signal }));
		assert.equal(states.at(-1)?.stage, "cancelled");
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
	assert.match(describeFailure(undefined), /never sent/);
	assert.match(describeFailure({ stage: "response", status: 200 }), /HTTP 200, but the response stream failed/);
	assert.match(describeFailure({ stage: "response", status: 403 }), /rejected with HTTP 403/);
});

test("upstream error detail is extracted, bounded and redacted", () => {
	const vllm = JSON.stringify({
		error: {
			code: "BadRequestError",
			message: "Unexpected reasoning effort minimal. Supported types are xhigh (default), medium, and low.",
			type: "invalid_request_error",
		},
	});
	assert.equal(
		upstreamDetail(vllm),
		"Unexpected reasoning effort minimal. Supported types are xhigh (default), medium, and low."
	);
	assert.equal(upstreamDetail(JSON.stringify({ message: "plain message" })), "plain message");
	assert.equal(upstreamDetail(JSON.stringify({ detail: "fastapi detail" })), "fastapi detail");
	assert.equal(upstreamDetail(JSON.stringify({ error: "string error" })), "string error");
	assert.equal(upstreamDetail("Bad Gateway\r\n\tupstream down"), "Bad Gateway upstream down");
	assert.equal(upstreamDetail(""), undefined);
	assert.equal(upstreamDetail(JSON.stringify({ ok: false })), undefined);
	const leaky = upstreamDetail(
		JSON.stringify({
			error: {
				message: "bad key eavs-AbC_123-xyz sk-or-v1-synthetic000 Bearer abc.def token=0123456789abcdef0123456789abcdef0123",
			},
		})
	);
	assert.ok(leaky);
	for (const secret of ["eavs-AbC", "sk-or-v1", "abc.def", "0123456789abcdef0123456789abcdef"])
		assert.ok(!leaky.includes(secret), `${secret} leaked: ${leaky}`);
	assert.ok((upstreamDetail("x".repeat(5000)) ?? "").length <= 301);
	assert.match(
		describeFailure({ stage: "response", status: 400, detail: "Unexpected reasoning effort minimal." }),
		/HTTP 400 by the gateway or upstream\. Upstream said: "Unexpected reasoning effort minimal\."/
	);
});
