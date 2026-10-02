#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
const binary = process.argv[2];
assert(binary, "Pass exact Pi binary");
assert.equal(execFileSync(binary, ["--version"], { encoding: "utf8" }).trim(), "1.0.0");
const root = resolve(import.meta.dirname, "..");
const temp = await mkdtemp(join(tmpdir(), "selection-rpc-"));
const home = join(temp, "home");
const agent = join(home, ".pi", "agent");
const project = join(temp, "project");
await mkdir(agent, { recursive: true });
await mkdir(project);
await writeFile(
	join(agent, "models.json"),
	JSON.stringify({
		providers: {
			fixture: {
				baseUrl: "http://127.0.0.1:9/v1",
				api: "openai-completions",
				apiKey: "synthetic",
				models: [{ id: "fixture", input: ["text"], contextWindow: 4096, maxTokens: 256 }],
			},
		},
	})
);
async function run(withCapabilities) {
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
			"--no-tools",
			"--provider",
			"fixture",
			"--model",
			"fixture",
			"-e",
			join(root, "pi-selection/index.ts"),
			...(withCapabilities ? ["-e", join(root, "pi-capabilities/index.ts")] : []),
			"--selection-state-dir",
			join(temp, withCapabilities ? "with" : "without"),
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
	const rows = [];
	const waiters = new Map();
	const decoder = new StringDecoder("utf8");
	let buffer = "";
	let stderr = "";
	let sequence = 0;
	const exit = new Promise((resolve) => child.once("close", resolve));
	const deadline = setTimeout(() => child.kill("SIGKILL"), 30000);
	child.stderr.on("data", (chunk) => {
		stderr += chunk.toString();
	});
	child.stdout.on("data", (chunk) => {
		buffer += decoder.write(chunk);
		while (buffer.includes("\n")) {
			const end = buffer.indexOf("\n");
			const line = buffer.slice(0, end);
			buffer = buffer.slice(end + 1);
			const row = JSON.parse(line);
			rows.push(row);
			if (row.type === "response") {
				const waiter = waiters.get(row.id);
				if (waiter) {
					waiters.delete(row.id);
					waiter.resolve(row);
				}
			}
		}
	});
	const request = (command) =>
		new Promise((resolve, reject) => {
			const id = `rpc-${sequence++}`;
			waiters.set(id, { resolve, reject });
			child.stdin.write(`${JSON.stringify({ ...command, id })}\n`);
		});
	async function control(name, body, statusKey) {
		const begin = rows.length;
		const response = await request({ type: "prompt", message: `/${name} ${JSON.stringify(body)}` });
		assert.equal(response.success, true);
		assert.equal(response.data.disposition, "handled");
		const frame = rows.slice(begin).find((row) => row.statusKey === statusKey);
		assert(frame, `Missing status for ${name}`);
		return JSON.parse(frame.statusText);
	}
	try {
		const commands = await request({ type: "get_commands" });
		assert.equal(commands.success, true);
		if (withCapabilities) {
			const bound = await control(
				"presentation-bind",
				{
					version: 1,
					requestId: "bind",
					id: "fixture-web",
					clientKind: "oqto-web",
					capabilities: ["selection.questions.v1"],
					leaseMs: 60000,
				},
				"pi-capabilities:reply/v1"
			);
			assert.equal(bound.ok, true);
			const listed = await control("presentation-list", { version: 1, requestId: "list" }, "pi-capabilities:reply/v1");
			assert.equal(listed.snapshot.bindings.length, 1);
		}
		const created = await control(
			"selection-create",
			{
				version: 1,
				requestId: "create",
				presentation: withCapabilities ? "host" : "none",
				spec: {
					version: 1,
					mode: "questions",
					title: "Disposable Unicode ✓",
					questions: [{ id: "choice", title: "Choose", kind: "single", options: [{ id: "yes", label: "Yes" }] }],
				},
			},
			"pi-selection:reply/v1"
		);
		if (withCapabilities) {
			assert.equal(created.result.presentation.kind, "host");
			assert.deepEqual(created.result.presentation.bindingIds, ["fixture-web"]);
			await control(
				"selection-ack",
				{ version: 1, requestId: "ack", id: created.result.record.id, bindingId: "fixture-web" },
				"pi-selection:reply/v1"
			);
		}
		const record = created.result.record;
		assert.equal(record.state, "draft");
		assert(record.scopeId);
		const saved = await control(
			"selection-save",
			{
				version: 1,
				requestId: "save",
				id: record.id,
				revision: record.revision,
				answers: { choice: { answered: false, selectedIds: [], disposition: "unsure" } },
			},
			"pi-selection:reply/v1"
		);
		assert.equal(saved.result.answers.choice.disposition, "unsure");
		const fetched = await control("selection-get", { version: 1, requestId: "get", id: record.id }, "pi-selection:reply/v1");
		assert.equal(fetched.result.record.revision, 1);
		const closed = await control("selection-close", { version: 1, requestId: "close", id: record.id }, "pi-selection:reply/v1");
		assert.equal(closed.result.record.state, "cancelled");
		if (withCapabilities) {
			await control("presentation-unbind", { version: 1, requestId: "unbind", id: "fixture-web" }, "pi-capabilities:reply/v1");
			const empty = await control("presentation-list", { version: 1, requestId: "empty" }, "pi-capabilities:reply/v1");
			assert.deepEqual(empty.snapshot.bindings, []);
		}
		const messages = await request({ type: "get_messages" });
		assert.deepEqual(messages.data.messages, []);
		const state = await request({ type: "get_state" });
		assert.equal(state.data.messageCount, 0);
		assert.equal(state.data.pendingMessageCount, 0);
		if (state.data.sessionFile) {
			const history = await readFile(state.data.sessionFile, "utf8").catch((error) => {
				if (error.code === "ENOENT") return "";
				throw error;
			});
			for (const line of history.split("\n").filter(Boolean)) {
				const event = JSON.parse(line);
				assert.notEqual(event.type, "message", "Control path appended a message");
			}
		}
		assert.equal(rows.filter((row) => row.type === "extension_error").length, 0);
		assert(!/Failed to load|SyntaxError|TypeError/.test(stderr), stderr);
		console.log(
			`PASS exact Pi 1 RPC controls, durable answers, zero model/chat/history messages (capabilities=${withCapabilities})`
		);
	} finally {
		child.stdin.end();
		await exit;
		clearTimeout(deadline);
	}
}
try {
	await run(false);
	await run(true);
} finally {
	await rm(temp, { recursive: true, force: true });
}
