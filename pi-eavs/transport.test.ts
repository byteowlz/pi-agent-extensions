import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { CatalogError, fetchCatalog, secureFetch } from "./transport.js";

const exec = promisify(execFile);
const key = "eavs-synthetic-transport-test";

test("transport refuses unsafe destinations and pre-aborted requests without network", async () => {
	assert.throws(() => secureFetch("http://localhost"));
	await assert.rejects(secureFetch("https://eavs.example")("https://evil.example/", { headers: { Authorization: key } }));
	const abort = new AbortController();
	abort.abort();
	await assert.rejects(
		fetchCatalog("https://eavs.example", key, abort.signal),
		(error) => error instanceof CatalogError && error.kind === "transient" && !error.message.includes(key)
	);
});

test(
	"actual Node HTTPS: metadata-only, TLS, proxy isolation, redirects, auth errors, response bounds and cancellation",
	{ timeout: 30_000 },
	async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-eavs-tls-"));
		let mode = "ok";
		let requests = 0;
		let redirected = 0;
		const methods: string[] = [];
		try {
			await exec("openssl", [
				"req",
				"-x509",
				"-newkey",
				"rsa:2048",
				"-nodes",
				"-keyout",
				join(dir, "key.pem"),
				"-out",
				join(dir, "cert.pem"),
				"-days",
				"1",
				"-subj",
				"/CN=localhost",
				"-addext",
				"subjectAltName=DNS:localhost",
			]);
			const server = createServer(
				{ key: await readFile(join(dir, "key.pem")), cert: await readFile(join(dir, "cert.pem")) },
				(req, res) => {
					requests++;
					methods.push(`${req.method} ${req.url}`);
					if (req.url !== "/v1/eavs/catalog") {
						redirected++;
						res.end("wrong");
						return;
					}
					assert.equal(req.headers.authorization, `Bearer ${key}`);
					if (mode === "redirect") {
						res.writeHead(302, { Location: "/target" });
						res.end();
					} else if (mode === "auth" || mode === "unauthenticated") {
						res.writeHead(mode === "auth" ? 403 : 401);
						res.end(`private ${key}`);
					} else if (mode === "transient") {
						res.writeHead(503);
						res.end(`private ${key}`);
					} else if (mode === "large") {
						res.end("x".repeat(4 * 1024 * 1024 + 1));
					} else if (mode === "malformed") {
						res.end(`private ${key}`);
					} else if (mode === "stall" || mode === "timeout") {
						res.writeHead(200);
						res.write("{");
					} else if (mode === "startup")
						res.end(
							JSON.stringify({
								schema_version: 1,
								scope: "key-filtered-chat-candidates",
								providers: [
									{
										id: "fixture",
										api: "openai-completions",
										operation: "chat",
										base_path: "/fixture/v1",
										request_path: "/fixture/v1/chat/completions",
										models: [
											{
												id: "startup-model",
												name: "Startup Model",
												reasoning: false,
												input: ["text"],
												context_window: 1000,
												max_tokens: 100,
												pricing: {
													status: "unverified_estimate",
													unit: "USD_per_million_tokens",
													rates: { input: 1, output: 2, cache_read: 0, cache_write: 0 },
												},
											},
										],
									},
								],
							})
						);
					else res.end(JSON.stringify({ providers: [] }));
				}
			);
			await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
			const address = server.address();
			assert.ok(address && typeof address !== "string");
			const origin = `https://localhost:${address.port}`;
			// The CA is trusted only by these isolated child processes. Production
			// transport has no insecure/test trust switch. No global CA install.
			const run = async (trusted: boolean, abort = false) => {
				const source = `import {createJiti} from 'jiti'; const {fetchCatalog}=await createJiti(import.meta.url).import(${JSON.stringify(resolve("pi-eavs/transport.ts"))}); const c=new AbortController(); ${abort ? "setTimeout(()=>c.abort(),100);" : ""} try {const v=await fetchCatalog(${JSON.stringify(origin)},${JSON.stringify(key)},c.signal); console.log(JSON.stringify({ok:true,value:v}));} catch(e) {console.log(JSON.stringify({ok:false,kind:e.kind,message:e.message}));}`;
				const { stdout } = await exec("node", ["--import", "jiti/register", "--input-type=module", "-e", source], {
					cwd: process.cwd(),
					env: {
						...process.env,
						NODE_EXTRA_CA_CERTS: trusted ? join(dir, "cert.pem") : "",
						NODE_TLS_REJECT_UNAUTHORIZED: "0",
						HTTPS_PROXY: "http://127.0.0.1:1",
						HTTP_PROXY: "http://127.0.0.1:1",
					},
					timeout: 15_000,
				});
				assert.ok(!stdout.includes(key));
				return JSON.parse(stdout);
			};
			try {
				assert.equal((await run(false)).ok, false);
				assert.equal(requests, 0);
				assert.equal((await run(true)).ok, true);
				for (const scenario of ["redirect", "auth", "unauthenticated", "transient", "large", "malformed", "stall", "timeout"]) {
					mode = scenario;
					const result = await run(true, scenario === "stall");
					assert.equal(result.ok, false, scenario);
					assert.equal(
						result.kind,
						["auth", "unauthenticated"].includes(scenario)
							? "auth"
							: ["large", "malformed"].includes(scenario)
								? "invalid"
								: "transient",
						scenario
					);
				}
				mode = "startup";
				await writeFile(
					join(dir, "auth.json"),
					JSON.stringify({ eavs: { type: "api_key", key, env: { EAVS_SERVER: origin } } }),
					{
						mode: 0o600,
					}
				);
				const startup = await exec(
					"node",
					[
						resolve("node_modules/@earendil-works/pi-coding-agent/dist/cli.js"),
						"--extension",
						resolve("pi-eavs/index.ts"),
						"--list-models",
					],
					{
						cwd: dir,
						env: { PATH: process.env.PATH, HOME: dir, PI_CODING_AGENT_DIR: dir, NODE_EXTRA_CA_CERTS: join(dir, "cert.pem") },
						timeout: 15_000,
					}
				);
				assert.match(startup.stdout, /fixture\/startup-model/);
				assert.ok(!startup.stdout.includes(key));
				assert.equal(redirected, 0);
				assert.ok(methods.every((m) => m === "GET /v1/eavs/catalog"));
			} finally {
				server.closeAllConnections();
				await new Promise<void>((resolve) => server.close(() => resolve()));
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	}
);
