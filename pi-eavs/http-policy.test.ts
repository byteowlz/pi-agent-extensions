import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { InMemoryCredentialStore, InMemoryModelsStore } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { projectCatalog, serverOrigin } from "./catalog.js";
import { HttpPolicy } from "./http-policy.js";
import { eavsProvider } from "./provider.js";

const catalog = { schema_version: 1, scope: "key-filtered-chat-candidates", providers: [] };
test("HTTP native login asks consent before secret/network and saves only selected origin", async () => {
	const dir = await mkdtemp(join(tmpdir(), "eavs-http-policy-"));
	try {
		const path = join(dir, "pi-eavs.json");
		for (const choice of ["cancel", "once", "save"]) {
			const policy = new HttpPolicy(path);
			const events: string[] = [];
			const provider = eavsProvider({
				httpPolicy: policy,
				fetchCatalog: async () => {
					events.push("network");
					return catalog;
				},
			});
			const sdk: { ModelRuntime: typeof ModelRuntime } = process.env.EAVS_TEST_INSTALLED_SDK
				? await import(process.env.EAVS_TEST_INSTALLED_SDK)
				: { ModelRuntime };
			const credentials = new InMemoryCredentialStore();
			const runtime = await sdk.ModelRuntime.create({
				credentials,
				modelsStore: new InMemoryModelsStore(),
				modelsPath: null,
				refreshOnCreate: false,
			});
			runtime.registerNativeProvider(provider);
			const action = runtime.login("eavs", "api_key", {
				signal: new AbortController().signal,
				notify: () => undefined,
				prompt: async (p) => {
					events.push(p.type);
					if (p.type === "text") return "http://gateway.example:8123/v1";
					if (p.type === "select") {
						assert.equal(p.options[0].id, "cancel");
						return choice;
					}
					return "eavs-synthetic";
				},
			});
			if (choice === "cancel") {
				await assert.rejects(action);
				assert.deepEqual(events, ["text", "select"]);
			} else {
				await action;
				assert.deepEqual(events, ["text", "select", "secret", "network"]);
				assert.equal(serverOrigin("http://gateway.example:8123", policy.origins()), "http://gateway.example:8123");
			}
			const savedCredential = await credentials.read("eavs");
			assert.equal(savedCredential?.type === "api_key", choice !== "cancel");
			if (savedCredential?.type === "api_key")
				assert.deepEqual(savedCredential.env, { EAVS_SERVER: "http://gateway.example:8123" });
			if (choice !== "save") await assert.rejects(readFile(path));
			policy.clear();
			assert.equal(policy.origins().length, choice === "save" ? 1 : 0);
		}
		assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { allowHttpOrigins: ["http://gateway.example:8123"] });
		assert.deepEqual(new HttpPolicy(path).origins(), ["http://gateway.example:8123"]);
		assert.equal((await stat(path)).mode & 0o777, 0o600);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
test("HTTP scope is exact and catalog alone cannot grant an exception", () => {
	const allowed = ["http://localhost:8123"];
	assert.equal(serverOrigin("http://localhost:8123/v1", allowed), allowed[0]);
	for (const origin of [
		"http://localhost:8124",
		"http://127.0.0.1:8123",
		"http://host.ts.net:8123",
		"http://localhost:8123.evil.example",
	])
		assert.throws(() => serverOrigin(origin, allowed));
	assert.throws(() => projectCatalog(allowed[0], catalog));
	assert.deepEqual(projectCatalog(allowed[0], catalog, allowed).models, []);
	for (const bad of [
		"http://localhost:8123/?",
		"http://localhost:8123/#",
		"http://user@localhost:8123",
		"http://localhost:8123/other",
		"ftp://localhost:8123",
		"http://localhost:8123/\n",
	])
		assert.throws(() => serverOrigin(bad, allowed));
});

test("cancelled consent/key prompt never sends a request or retains one-time permission", async () => {
	for (const stage of ["select", "secret"] as const) {
		const policy = new HttpPolicy();
		let requests = 0;
		const controller = new AbortController();
		const login = eavsProvider({
			httpPolicy: policy,
			fetchCatalog: async () => {
				requests++;
				return catalog;
			},
		}).auth.apiKey?.login;
		assert.ok(login);
		await assert.rejects(
			login({
				signal: controller.signal,
				notify: () => undefined,
				prompt: async (p) => {
					if (p.type === stage) {
						controller.abort();
						return "once";
					}
					return p.type === "text" ? "http://localhost:8123" : "once";
				},
			})
		);
		assert.equal(requests, 0);
		assert.deepEqual(policy.origins(), []);
	}
});

test("malformed/wildcard/non-origin configuration and busy saves fail closed", async () => {
	const dir = await mkdtemp(join(tmpdir(), "eavs-http-invalid-"));
	try {
		const path = join(dir, "pi-eavs.json");
		for (const config of [
			"{",
			JSON.stringify({ allowHttpOrigins: ["http://*.example"] }),
			JSON.stringify({ allowHttpOrigins: ["http://localhost:8123/v1"] }),
			JSON.stringify({ allowHttpOrigins: ["https://localhost:8123"] }),
			JSON.stringify({ allowHttpOrigins: [], command: "never execute" }),
		]) {
			await writeFile(path, config);
			assert.throws(() => new HttpPolicy(path).origins());
		}
		await writeFile(path, JSON.stringify({ allowHttpOrigins: [] }));
		await writeFile(`${path}.lock`, "busy");
		assert.throws(() => new HttpPolicy(path).save("http://localhost:8123", new AbortController().signal));
		assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { allowHttpOrigins: [] });
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
