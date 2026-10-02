#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
const binary = process.argv[2];
assert(binary);
assert.equal(execFileSync(binary, ["--version"], { encoding: "utf8" }).trim(), "1.0.0");
const root = resolve(import.meta.dirname, "..");
const temp = await mkdtemp(join(tmpdir(), "selection-tool-"));
const home = join(temp, "home");
const agent = join(home, ".pi/agent");
const project = join(temp, "project");
const store = join(temp, "reviews");
await mkdir(agent, { recursive: true });
await mkdir(project);
let calls = 0;
const server = createServer(async (req, res) => {
	try {
		const chunks = [];
		for await (const chunk of req) chunks.push(chunk);
		const body = JSON.parse(Buffer.concat(chunks).toString());
		calls++;
		res.writeHead(200, { "Content-Type": "text/event-stream" });
		let delta;
		let finish;
		if (calls === 1) {
			const selected = body.tools.find((tool) => tool.function?.name.endsWith("Selection"));
			assert(selected, "Selection must be exposed to the real provider");
			delta = {
				role: "assistant",
				tool_calls: [
					{
						index: 0,
						id: "fixture-selection-call",
						type: "function",
						function: {
							name: selected.function.name,
							arguments: JSON.stringify({
								action: "create",
								presentation: "none",
								spec: {
									version: 1,
									mode: "questions",
									title: "Callback fixture",
									questions: [{ id: "one", title: "One", kind: "text" }],
								},
							}),
						},
					},
				],
			};
			finish = "tool_calls";
		} else {
			delta = { role: "assistant", content: "Fixture done." };
			finish = "stop";
		}
		const chunk = (value) =>
			res.write(
				`data: ${JSON.stringify({
					id: "fixture",
					object: "chat.completion.chunk",
					created: 1,
					model: "fixture",
					choices: [{ index: 0, delta: value, finish_reason: null }],
				})}\n\n`
			);
		chunk(delta);
		res.write(
			`data: ${JSON.stringify({
				id: "fixture",
				object: "chat.completion.chunk",
				choices: [{ index: 0, delta: {}, finish_reason: finish }],
				usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
			})}\n\ndata: [DONE]\n\n`
		);
		res.end();
	} catch (error) {
		console.error("Synthetic fixture failure:", error.message);
		res.destroy(error);
	}
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address === "object");
await writeFile(
	join(agent, "models.json"),
	JSON.stringify({
		providers: {
			fixture: {
				baseUrl: `http://127.0.0.1:${address.port}/v1`,
				api: "openai-completions",
				apiKey: "synthetic",
				models: [{ id: "fixture", input: ["text"], contextWindow: 4096, maxTokens: 256 }],
			},
		},
	})
);
const child = spawn(
	binary,
	[
		"--mode",
		"rpc",
		"--offline",
		"-ne",
		"-ns",
		"-np",
		"-nc",
		"-na",
		"--provider",
		"fixture",
		"--model",
		"fixture",
		"-e",
		join(root, "pi-selection/index.ts"),
		"--selection-state-dir",
		store,
	],
	{
		cwd: project,
		env: {
			PATH: "/usr/bin:/bin",
			HOME: home,
			PI_CODING_AGENT_DIR: agent,
			PI_OFFLINE: "1",
			XDG_CONFIG_HOME: join(home, ".config"),
			XDG_CACHE_HOME: join(home, ".cache"),
			XDG_DATA_HOME: join(home, ".local/share"),
			XDG_STATE_HOME: join(home, ".local/state"),
			XDG_RUNTIME_DIR: temp,
		},
		stdio: ["pipe", "pipe", "pipe"],
	}
);
const decoder = new StringDecoder("utf8");
const rows = [];
let buffer = "";
let stderr = "";
const exited = new Promise((resolve) => child.once("close", resolve));
const timer = setTimeout(() => child.kill("SIGKILL"), 30000);
child.stderr.on("data", (chunk) => {
	stderr += chunk.toString();
});
child.stdout.on("data", (chunk) => {
	buffer += decoder.write(chunk);
	while (buffer.includes("\n")) {
		const n = buffer.indexOf("\n");
		const line = buffer.slice(0, n);
		buffer = buffer.slice(n + 1);
		const row = JSON.parse(line);
		rows.push(row);
		if (row.type === "agent_settled") child.stdin.end();
	}
});
child.stdin.write(`${JSON.stringify({ id: "tool-fixture", type: "prompt", message: "Run the synthetic callback fixture." })}\n`);
try {
	const code = await exited;
	assert.equal(code, 0, stderr);
	assert.equal(calls, 2);
	const result = rows.find((row) => row.type === "tool_execution_end");
	assert(result, `No real tool callback result: ${JSON.stringify(rows)}`);
	assert.equal(result.isError, false, JSON.stringify(result));
	const record = result.result.details.record;
	assert.equal(record.state, "draft");
	const persisted = JSON.parse(await readFile(join(store, `${record.id}.json`), "utf8"));
	assert.equal(persisted.id, record.id);
	assert.equal(persisted.scopeId, record.scopeId);
	assert(rows.some((row) => row.type === "agent_settled"));
	console.log(
		"PASS exact Pi 1 Selection provider/tool callback, structured result and durable record (local synthetic provider, stripped credentials)"
	);
} finally {
	clearTimeout(timer);
	child.kill("SIGKILL");
	await new Promise((resolve) => server.close(resolve));
	await rm(temp, { recursive: true, force: true });
}
