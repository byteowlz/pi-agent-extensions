/**
 * Delegate Extension for Pi
 *
 * Spawns Pi subagents (separate Pi processes) for delegated tasks.
 * Supports single-task, parallel tasks, and async execution with completion events.
 *
 * Subagents are stored as child sessions by writing a session header with parentSession
 * in the same session directory as the current session.
 */

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

const ASYNC_DIR = "/tmp/pi-delegate-runs";
const RESULTS_DIR = "/tmp/pi-delegate-results";

interface DelegateTaskInput {
	agent?: string;
	task: string;
	cwd?: string;
	model?: string;
	tools?: string[];
}

interface DelegateTaskResult {
	id: string;
	agent?: string;
	task: string;
	cwd: string;
	status: "completed" | "failed";
	output: string;
	exitCode: number | null;
	sessionFile?: string;
}

interface AsyncRunState {
	id: string;
	status: "running" | "completed" | "failed";
	createdAt: number;
	updatedAt: number;
	tasks: Array<{
		id: string;
		agent?: string;
		task: string;
		status: "running" | "completed" | "failed";
		exitCode?: number | null;
		output?: string;
		sessionFile?: string;
	}>;
}

const DelegateParams = Type.Object({
	mode: Type.Optional(StringEnum(["single", "parallel"] as const)),
	agent: Type.Optional(Type.String({ description: "Agent label (optional)" })),
	task: Type.Optional(Type.String({ description: "Task for single mode" })),
	tasks: Type.Optional(
		Type.Array(
			Type.Object({
				agent: Type.Optional(Type.String({ description: "Agent label" })),
				task: Type.String({ description: "Task" }),
				cwd: Type.Optional(Type.String({ description: "Working directory" })),
				model: Type.Optional(Type.String({ description: "Model override" })),
				tools: Type.Optional(Type.Array(Type.String({ description: "Tools to enable" }))),
			}),
			{ description: "Parallel tasks" },
		),
	),
	cwd: Type.Optional(Type.String({ description: "Working directory (single mode)" })),
	model: Type.Optional(Type.String({ description: "Model override (single mode)" })),
	tools: Type.Optional(Type.Array(Type.String({ description: "Tools to enable (single mode)" }))),
	async: Type.Optional(Type.Boolean({ description: "Run asynchronously" })),
});

const StatusParams = Type.Object({
	id: Type.Optional(Type.String({ description: "Async run id" })),
	path: Type.Optional(Type.String({ description: "Async run directory" })),
});

function ensureDirs(): void {
	fs.mkdirSync(ASYNC_DIR, { recursive: true });
	fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function createChildSessionFile(
	parentSessionFile: string,
	sessionDir: string,
	cwd: string,
): string | null {
	try {
		fs.mkdirSync(sessionDir, { recursive: true });
		const id = randomUUID();
		const filename = `${Date.now()}_${id.slice(0, 8)}.jsonl`;
		const sessionPath = path.join(sessionDir, filename);
		const header = {
			type: "session",
			version: 3,
			id,
			timestamp: new Date().toISOString(),
			cwd,
			parentSession: parentSessionFile,
		};
		fs.writeFileSync(sessionPath, `${JSON.stringify(header)}\n`, "utf-8");
		return sessionPath;
	} catch {
		return null;
	}
}

function buildPiArgs(task: DelegateTaskInput, sessionDir?: string, sessionFile?: string): string[] {
	const args: string[] = ["-p", "--mode", "text"];
	if (task.model) {
		args.push("--model", task.model);
	}
	if (task.tools?.length) {
		args.push("--tools", task.tools.join(","));
	}
	if (sessionDir) {
		args.push("--session-dir", sessionDir);
	}
	if (sessionFile) {
		args.push("--session", sessionFile);
	}
	args.push(task.task);
	return args;
}

function runPiTask(
	input: DelegateTaskInput,
	parentSessionFile: string | null,
): Promise<DelegateTaskResult> {
	return new Promise((resolve) => {
		const id = randomUUID().slice(0, 8);
		const cwd = input.cwd ?? process.cwd();
		const sessionDir = parentSessionFile ? path.dirname(parentSessionFile) : undefined;
		const sessionFile =
			parentSessionFile && sessionDir
				? createChildSessionFile(parentSessionFile, sessionDir, cwd)
				: null;
		const args = buildPiArgs(input, sessionDir, sessionFile ?? undefined);
		const env = {
			...process.env,
			PI_SUBAGENT: "1",
			PI_SUBAGENT_PREFIX: "subagent",
		};
		const child = spawn("pi", args, {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
			env,
		});
		let output = "";
		child.stdout.on("data", (chunk) => {
			output += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			output += chunk.toString();
		});
		child.on("close", (code) => {
			resolve({
				id,
				agent: input.agent,
				task: input.task,
				cwd,
				status: code === 0 ? "completed" : "failed",
				output: output.trim(),
				exitCode: code,
				sessionFile: sessionFile ?? undefined,
			});
		});
		child.on("error", () => {
			resolve({
				id,
				agent: input.agent,
				task: input.task,
				cwd,
				status: "failed",
				output: output.trim(),
				exitCode: 1,
				sessionFile: sessionFile ?? undefined,
			});
		});
	});
}

function writeAsyncState(state: AsyncRunState): void {
	const dir = path.join(ASYNC_DIR, state.id);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "status.json"), JSON.stringify(state, null, 2), "utf-8");
}

function writeAsyncResult(state: AsyncRunState): void {
	const resultPath = path.join(RESULTS_DIR, `${state.id}.json`);
	fs.writeFileSync(resultPath, JSON.stringify(state, null, 2), "utf-8");
}

function normalizeTasks(params: {
	mode?: "single" | "parallel";
	agent?: string;
	task?: string;
	tasks?: DelegateTaskInput[];
	cwd?: string;
	model?: string;
	tools?: string[];
}): DelegateTaskInput[] {
	if (params.mode === "parallel" || params.tasks?.length) {
		return params.tasks ?? [];
	}
	if (!params.task) return [];
	return [
		{
			agent: params.agent,
			task: params.task,
			cwd: params.cwd,
			model: params.model,
			tools: params.tools,
		},
	];
}

export default function registerDelegateExtension(pi: ExtensionAPI): void {
	ensureDirs();

	const asyncRuns = new Map<string, AsyncRunState>();
	let lastUiContext: ExtensionContext | null = null;

	pi.registerTool({
		name: "Delegate",
		label: "Delegate",
		description:
			"Delegate tasks to Pi subagents (separate Pi processes). Supports single or parallel tasks. " +
			"Use async=true to run in the background and receive completion events.",
		parameters: DelegateParams,
		async execute(_id, params, _onUpdate, ctx) {
			lastUiContext = ctx;
			const parentSessionFile = ctx.sessionManager?.getSessionFile() ?? null;
			const tasks = normalizeTasks(params);
			if (tasks.length === 0) {
				return {
					content: [{ type: "text", text: "No tasks provided." }],
					isError: true,
					details: { error: "missing_tasks" },
				};
			}

			if (params.async) {
				const runId = randomUUID().slice(0, 8);
				const state: AsyncRunState = {
					id: runId,
					status: "running",
					createdAt: Date.now(),
					updatedAt: Date.now(),
					tasks: tasks.map((task) => ({
						id: randomUUID().slice(0, 8),
						agent: task.agent,
						task: task.task,
						status: "running",
					})),
				};
				asyncRuns.set(runId, state);
				writeAsyncState(state);
				pi.events.emit("delegate:started", {
					id: runId,
					status: "running",
					taskCount: tasks.length,
				});
				pi.events.emit("delegate_enhanced:started", {
					id: runId,
					status: "running",
					taskCount: tasks.length,
				});

				Promise.all(
					tasks.map((task, index) =>
						runPiTask(task, parentSessionFile).then((result) => {
							state.tasks[index] = {
								id: state.tasks[index]?.id ?? randomUUID().slice(0, 8),
								agent: result.agent,
								task: result.task,
								status: result.status,
								exitCode: result.exitCode ?? undefined,
								output: result.output,
								sessionFile: result.sessionFile,
							};
						}),
					),
				).then(() => {
					state.status = state.tasks.some((t) => t.status === "failed")
						? "failed"
						: "completed";
					state.updatedAt = Date.now();
					writeAsyncState(state);
					writeAsyncResult(state);
					pi.events.emit("delegate:complete", state);
					pi.events.emit("delegate_enhanced:complete", state);
					if (lastUiContext?.hasUI) {
						lastUiContext.ui.notify(
							`Delegate run ${state.id} ${state.status}.`,
							state.status === "completed" ? "info" : "warning",
						);
					}
				});

				return {
					content: [
						{
							type: "text",
							text: `Started async delegate run ${runId} (${tasks.length} task(s)). Use delegate_status.`,
						},
					],
					details: { id: runId, status: "running" },
				};
			}

			const results = await Promise.all(
				tasks.map((task) => runPiTask(task, parentSessionFile)),
			);
			const successCount = results.filter((r) => r.status === "completed").length;
			return {
				content: [
					{
						type: "text",
						text: `${successCount}/${results.length} completed` +
							(results.length === 1 ? `\n\n${results[0].output}` : ""),
					},
				],
				details: { results },
			};
		},
		renderCall(args, theme) {
			const isParallel = (args.tasks?.length ?? 0) > 0;
			const asyncLabel = args.async ? theme.fg("warning", " [async]") : "";
			if (isParallel) {
				return new Text(
					`${theme.fg("toolTitle", theme.bold("Delegate "))}parallel (${args.tasks.length})${asyncLabel}`,
					0,
					0,
				);
			}
			return new Text(
				`${theme.fg("toolTitle", theme.bold("Delegate "))}${theme.fg("accent", args.agent || "task")}${asyncLabel}`,
				0,
				0,
			);
		},
		renderResult(result, _options, theme) {
			if (result.details?.results) {
				const results = result.details.results as DelegateTaskResult[];
				const lines = results.map((res) => {
					const status = res.status === "completed" ? theme.fg("success", "✓") : theme.fg("error", "✗");
					return `${status} ${res.agent ?? "task"}: ${res.task}`;
				});
				return new Text(lines.join("\n"), 0, 0);
			}
			return new Text(result.content?.[0]?.type === "text" ? result.content[0].text : "", 0, 0);
		},
	});

	pi.registerTool({
		name: "DelegateStatus",
		label: "Delegate Status",
		description: "Inspect async delegate runs",
		parameters: StatusParams,
		async execute(_id, params) {
			const runId = params.id ?? (params.path ? path.basename(params.path) : null);
			const dir = params.path ? path.resolve(params.path) : runId ? path.join(ASYNC_DIR, runId) : null;
			if (!dir || !fs.existsSync(dir)) {
				return {
					content: [{ type: "text", text: "Run not found." }],
					isError: true,
					details: { error: "not_found" },
				};
			}
			const statusPath = path.join(dir, "status.json");
			if (!fs.existsSync(statusPath)) {
				return {
					content: [{ type: "text", text: "Status file missing." }],
					isError: true,
					details: { error: "missing_status" },
				};
			}
			const raw = fs.readFileSync(statusPath, "utf-8");
			return {
				content: [{ type: "text", text: raw }],
				details: JSON.parse(raw) as AsyncRunState,
			};
		},
	});
}
