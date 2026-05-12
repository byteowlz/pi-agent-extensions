// @ts-nocheck
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

type DelegateInput = {
	agent: string;
	prompt: string;
	session?: string;
	cwd?: string;
	mode?: "persistent" | "oneshot";
	timeoutSeconds?: number;
	noWait?: boolean;
	wait?: boolean;
};

type RunRecord = {
	id: string;
	status: "running" | "completed" | "failed" | "cancelled";
	startedAt: string;
	completedAt?: string;
	params: DelegateInput;
	text?: string;
	events?: JsonValue[];
	error?: string;
	child?: ReturnType<typeof spawn>;
};

const RUNS = new Map<string, RunRecord>();

function asText(v: unknown): string {
	return typeof v === "string" ? v : "";
}

function ensureAcpxAvailable(): void {
	const probe = spawnSync("acpx", ["--version"], { stdio: "ignore" });
	if (probe.error || probe.status !== 0) {
		throw new Error("acpx is not installed or not available on PATH. Install with: npm install -g acpx@latest");
	}
}

function parseDelegateInput(input: unknown): DelegateInput {
	if (!input || typeof input !== "object") throw new Error("Input must be an object");
	const obj = input as Record<string, unknown>;
	const agent = asText(obj.agent).trim();
	const prompt = asText(obj.prompt).trim();
	if (!agent) throw new Error("Missing required field: agent");
	if (!prompt) throw new Error("Missing required field: prompt");
	const session = asText(obj.session).trim() || undefined;
	const cwd = asText(obj.cwd).trim() || undefined;
	const mode = asText(obj.mode).trim() === "oneshot" ? "oneshot" : "persistent";
	const timeoutSeconds = typeof obj.timeoutSeconds === "number" ? obj.timeoutSeconds : undefined;
	const noWait = obj.noWait === true;
	const wait = obj.wait !== false;
	return { agent, prompt, session, cwd, mode, timeoutSeconds, noWait, wait };
}

function parseRunIdInput(input: unknown): string {
	if (!input || typeof input !== "object") throw new Error("Input must be an object");
	const runId = asText((input as Record<string, unknown>).runId).trim();
	if (!runId) throw new Error("Missing required field: runId");
	return runId;
}

function buildAcpxArgs(params: DelegateInput): string[] {
	const args: string[] = ["--format", "json"];
	if (params.timeoutSeconds && params.timeoutSeconds > 0) args.push("--timeout", String(params.timeoutSeconds));
	if (params.session) args.push("-s", params.session);

	if (params.mode === "oneshot") {
		args.push(params.agent, "exec", params.prompt);
	} else {
		if (params.noWait) args.push(params.agent, "--no-wait", params.prompt);
		else args.push(params.agent, params.prompt);
	}
	return args;
}

function parseNdjson(stdout: string): { text: string; events: JsonValue[] } {
	const events: JsonValue[] = [];
	let text = "";
	for (const line of stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const evt = JSON.parse(trimmed) as Record<string, unknown>;
			events.push(evt as JsonValue);
			const type = asText(evt.type);
			if (type === "text_delta") text += asText(evt.text);
			if ((type === "message" || type === "assistant_message") && typeof evt.text === "string") {
				text += `${evt.text}\n`;
			}
		} catch {
			// ignore non-json output line
		}
	}
	return { text: text.trim() || "Delegation completed.", events };
}

async function runAcpxBlocking(params: DelegateInput): Promise<{ text: string; events: JsonValue[] }> {
	const args = buildAcpxArgs({ ...params, wait: true });
	return await new Promise((resolve, reject) => {
		const child = spawn("acpx", args, { cwd: params.cwd, stdio: ["ignore", "pipe", "pipe"], env: process.env });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d) => {
			stdout += String(d);
		});
		child.stderr.on("data", (d) => {
			stderr += String(d);
		});
		child.on("error", (err) => reject(err));
		child.on("close", (code) => {
			if (code !== 0) return reject(new Error(`acpx failed (exit ${code}): ${stderr || stdout || "no output"}`));
			resolve(parseNdjson(stdout));
		});
	});
}

function runUsageProbe(provider: "claude" | "codex", cwd?: string): unknown {
	const here = dirname(fileURLToPath(import.meta.url));
	const script = resolve(here, "scripts", "acpx-usage-probe.sh");
	const args = [script, provider];
	if (cwd?.trim()) args.push(cwd.trim());
	const out = spawnSync("bash", args, { encoding: "utf-8" });
	const raw = `${out.stdout || ""}${out.stderr || ""}`.trim();
	if (!raw) return { provider, status: "parse_failed", error: "empty probe output" };
	const line = raw.split("\n").filter(Boolean).slice(-1)[0] ?? "";
	try {
		return JSON.parse(line);
	} catch {
		return { provider, status: "parse_failed", error: line };
	}
}

function listAgents(): { builtin: string[]; available: string[] } {
	const builtin = [
		"pi",
		"openclaw",
		"codex",
		"claude",
		"gemini",
		"cursor",
		"copilot",
		"droid",
		"iflow",
		"kilocode",
		"kimi",
		"kiro",
		"opencode",
		"qoder",
		"qwen",
		"trae",
	];
	const available: string[] = [];
	for (const agent of builtin) {
		const probe = spawnSync("acpx", [agent, "--help"], { stdio: "ignore" });
		if (!probe.error && probe.status === 0) available.push(agent);
	}
	return { builtin, available };
}

function startAcpxAsync(params: DelegateInput): RunRecord {
	const id = randomUUID();
	const record: RunRecord = { id, status: "running", startedAt: new Date().toISOString(), params };
	RUNS.set(id, record);

	const args = buildAcpxArgs({ ...params, wait: false, noWait: true });
	const child = spawn("acpx", args, { cwd: params.cwd, stdio: ["ignore", "pipe", "pipe"], env: process.env });
	record.child = child;

	let stdout = "";
	let stderr = "";
	child.stdout.on("data", (d) => {
		stdout += String(d);
	});
	child.stderr.on("data", (d) => {
		stderr += String(d);
	});
	child.on("close", (code) => {
		record.completedAt = new Date().toISOString();
		if (record.status === "cancelled") return;
		if (code !== 0) {
			record.status = "failed";
			record.error = stderr || stdout || `acpx exited ${code}`;
			return;
		}
		const parsed = parseNdjson(stdout);
		record.status = "completed";
		record.text = parsed.text;
		record.events = parsed.events;
	});
	child.on("error", (err) => {
		record.status = "failed";
		record.error = String(err);
		record.completedAt = new Date().toISOString();
	});

	return record;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "AcpxDelegate",
		description: "Delegate a task via acpx to ACP agents like claude/codex/openclaw.",
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				agent: { type: "string" },
				prompt: { type: "string" },
				session: { type: "string" },
				cwd: { type: "string" },
				mode: { type: "string", enum: ["persistent", "oneshot"] },
				timeoutSeconds: { type: "number" },
				noWait: { type: "boolean" },
				wait: { type: "boolean", description: "When false, returns runId immediately and use AcpxResult later." },
			},
			required: ["agent", "prompt"],
		},
		async execute(_toolCallId, params) {
			ensureAcpxAvailable();
			const input = parseDelegateInput(params);
			if (input.wait === false) {
				const run = startAcpxAsync(input);
				return {
					content: [
						{ type: "text", text: `Started delegated run ${run.id}` },
						{ type: "text", text: "Use AcpxResult with this runId to fetch completion." },
					],
				};
			}

			const result = await runAcpxBlocking(input);
			return {
				content: [
					{ type: "text", text: result.text },
					{ type: "text", text: `acpx events: ${result.events.length}` },
				],
			};
		},
	});

	pi.registerTool({
		name: "AcpxResult",
		description: "Get status/result for an async AcpxDelegate run.",
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: { runId: { type: "string" } },
			required: ["runId"],
		},
		async execute(_toolCallId, params) {
			ensureAcpxAvailable();
			const runId = parseRunIdInput(params);
			const run = RUNS.get(runId);
			if (!run) return { content: [{ type: "text", text: `Unknown runId: ${runId}` }], isError: true };
			if (run.status === "running") return { content: [{ type: "text", text: `Run ${runId} is still running.` }] };
			if (run.status === "failed")
				return { content: [{ type: "text", text: `Run ${runId} failed: ${run.error ?? "unknown error"}` }], isError: true };
			if (run.status === "cancelled") return { content: [{ type: "text", text: `Run ${runId} was cancelled.` }] };
			return {
				content: [
					{ type: "text", text: run.text ?? "Delegation completed." },
					{ type: "text", text: `status=${run.status} events=${run.events?.length ?? 0}` },
				],
			};
		},
	});

	pi.registerTool({
		name: "AcpxAgents",
		description: "List built-in acpx agents and availability on this machine.",
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {},
		},
		async execute() {
			ensureAcpxAvailable();
			const agents = listAgents();
			return {
				content: [
					{ type: "text", text: `available: ${agents.available.join(", ") || "none"}` },
					{ type: "text", text: `builtin: ${agents.builtin.join(", ")}` },
				],
			};
		},
	});

	pi.registerTool({
		name: "AcpxUsage",
		description:
			"Probe Claude/Codex usage status. Uses structured CLI when available and tmux-based TUI fallback via bundled script.",
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				provider: { type: "string", enum: ["claude", "codex"] },
				cwd: { type: "string", description: "Stable trusted workspace to run usage probe in" },
			},
			required: ["provider"],
		},
		async execute(_toolCallId, params) {
			const provider = asText((params as Record<string, unknown>).provider).trim();
			if (provider !== "claude" && provider !== "codex") {
				return { content: [{ type: "text", text: "provider must be 'claude' or 'codex'" }], isError: true };
			}
			const cwd = asText((params as Record<string, unknown>).cwd).trim() || undefined;
			const result = runUsageProbe(provider, cwd);
			return { content: [{ type: "text", text: JSON.stringify(result) }] };
		},
	});

	pi.registerTool({
		name: "AcpxCancel",
		description: "Cancel an async AcpxDelegate run.",
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: { runId: { type: "string" } },
			required: ["runId"],
		},
		async execute(_toolCallId, params) {
			ensureAcpxAvailable();
			const runId = parseRunIdInput(params);
			const run = RUNS.get(runId);
			if (!run) return { content: [{ type: "text", text: `Unknown runId: ${runId}` }], isError: true };
			if (run.status !== "running")
				return { content: [{ type: "text", text: `Run ${runId} is not running (status=${run.status}).` }] };
			run.child?.kill("SIGTERM");
			run.status = "cancelled";
			run.completedAt = new Date().toISOString();
			return { content: [{ type: "text", text: `Cancelled run ${runId}.` }] };
		},
	});
}
