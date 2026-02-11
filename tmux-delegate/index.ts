/**
 * TmuxDelegate Extension for Pi
 *
 * Spawns Pi subagents in tmux windows for delegated tasks.
 * Each task runs in its own tmux window so the user can watch progress live.
 *
 * Key design:
 * - Each subagent gets a child session file in the same session directory,
 *   with parentSession pointing to the current session. This makes Octo
 *   render them nested under the parent in the sidebar.
 * - Uses `pi -p --mode text --session <child-session-file>` in a tmux window
 *   so progress is visible in real-time via `tmux select-window`.
 * - Output is also captured to a file via `tee` for retrieval through
 *   TmuxDelegateStatus.
 * - Agent discovery uses markdown files with frontmatter (same as subagent).
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { type Theme, parseFrontmatter } from "@mariozechner/pi-coding-agent";
import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

// =============================================================================
// Agent Discovery
// =============================================================================

type AgentScope = "user" | "project" | "both";

interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
	source: "user" | "project";
	filePath: string;
}

interface AgentDiscoveryResult {
	agents: AgentConfig[];
	projectAgentsDir: string | null;
}

function loadAgentsFromDir(dir: string, source: "user" | "project"): AgentConfig[] {
	if (!fs.existsSync(dir)) return [];
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	const agents: AgentConfig[] = [];
	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;
		const filePath = path.join(dir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);
		if (!frontmatter.name || !frontmatter.description) continue;
		const tools = frontmatter.tools
			?.split(",")
			.map((t: string) => t.trim())
			.filter(Boolean);
		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			tools: tools && tools.length > 0 ? tools : undefined,
			model: frontmatter.model,
			systemPrompt: body,
			source,
			filePath,
		});
	}
	return agents;
}

function findNearestProjectAgentsDir(cwd: string): string | null {
	let dir = cwd;
	for (;;) {
		const candidate = path.join(dir, ".pi", "agents");
		try {
			if (fs.statSync(candidate).isDirectory()) return candidate;
		} catch {
			// not found
		}
		const parent = path.dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
	const userDir = path.join(os.homedir(), ".pi", "agent", "agents");
	const projectAgentsDir = findNearestProjectAgentsDir(cwd);
	const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
	const projectAgents = scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project");
	const agentMap = new Map<string, AgentConfig>();
	if (scope === "both") {
		for (const a of userAgents) agentMap.set(a.name, a);
		for (const a of projectAgents) agentMap.set(a.name, a);
	} else if (scope === "user") {
		for (const a of userAgents) agentMap.set(a.name, a);
	} else {
		for (const a of projectAgents) agentMap.set(a.name, a);
	}
	return { agents: Array.from(agentMap.values()), projectAgentsDir };
}

// =============================================================================
// Tmux Helpers
// =============================================================================

function isTmuxAvailable(): boolean {
	try {
		execSync("tmux -V", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function isInsideTmux(): boolean {
	return Boolean(process.env.TMUX);
}

function isTmuxPaneAlive(paneId: string): boolean {
	try {
		const output = execSync("tmux list-panes -a -F '#{pane_id}'", { encoding: "utf-8" });
		return output.split("\n").some((line) => line.trim() === paneId);
	} catch {
		return false;
	}
}

function shellEscape(s: string): string {
	return `'${s.replace(/'/g, "'\\''")}'`;
}

// =============================================================================
// Child Session Creation
// =============================================================================

/**
 * Creates a child session file linked to the parent session.
 * The `parentSession` field in the header is what makes Octo render it nested.
 * Only used when the parent session dir is known (same-project delegation).
 */
function createChildSessionFile(parentSessionFile: string, sessionDir: string, cwd: string): string {
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
}

// =============================================================================
// Run State
// =============================================================================

const RUNS_BASE_DIR = path.join(os.tmpdir(), "pi-tmux-delegate");

interface TaskState {
	id: string;
	agent: string;
	task: string;
	cwd: string;
	status: "running" | "completed" | "failed";
	windowName: string;
	paneId: string;
	outputFile: string;
	exitCodeFile: string;
	sessionFile: string;
	startedAt: number;
	finishedAt?: number;
	exitCode?: number;
	model?: string;
}

interface RunState {
	id: string;
	status: "running" | "completed" | "failed";
	createdAt: number;
	updatedAt: number;
	tasks: TaskState[];
	runDir: string;
}

interface DelegateDetails {
	runId: string;
	state: RunState;
}

interface StatusDetails {
	state: RunState;
}

function ensureRunsDir(): void {
	fs.mkdirSync(RUNS_BASE_DIR, { recursive: true });
}

function createRunDir(runId: string): string {
	const dir = path.join(RUNS_BASE_DIR, runId);
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

function writeRunState(state: RunState): void {
	fs.writeFileSync(path.join(state.runDir, "state.json"), JSON.stringify(state, null, 2), "utf-8");
}

function readRunState(runDir: string): RunState | null {
	const stateFile = path.join(runDir, "state.json");
	if (!fs.existsSync(stateFile)) return null;
	try {
		return JSON.parse(fs.readFileSync(stateFile, "utf-8")) as RunState;
	} catch {
		return null;
	}
}

function readTaskOutput(task: TaskState, tail?: number): string {
	if (!fs.existsSync(task.outputFile)) return "(no output yet)";
	try {
		const content = fs.readFileSync(task.outputFile, "utf-8");
		if (!content) return "(empty output)";
		if (tail && tail > 0) {
			const lines = content.split("\n");
			if (lines.length > tail) {
				return `... (${lines.length - tail} lines omitted)\n${lines.slice(-tail).join("\n")}`;
			}
		}
		return content;
	} catch {
		return "(error reading output)";
	}
}

function refreshTaskStatus(task: TaskState): void {
	if (task.status !== "running") return;

	if (fs.existsSync(task.exitCodeFile)) {
		try {
			const raw = fs.readFileSync(task.exitCodeFile, "utf-8").trim();
			const code = Number.parseInt(raw.split(/\s+/)[0], 10);
			task.exitCode = Number.isNaN(code) ? 1 : code;
			task.status = task.exitCode === 0 ? "completed" : "failed";
			task.finishedAt = Date.now();
			return;
		} catch {
			// fall through
		}
	}

	if (task.paneId && !isTmuxPaneAlive(task.paneId)) {
		task.status = "failed";
		task.exitCode = 1;
		task.finishedAt = Date.now();
	}
}

function refreshRunState(state: RunState): void {
	for (const task of state.tasks) refreshTaskStatus(task);
	const allDone = state.tasks.every((t) => t.status !== "running");
	if (allDone) {
		state.status = state.tasks.some((t) => t.status === "failed") ? "failed" : "completed";
	}
	state.updatedAt = Date.now();
}

// =============================================================================
// Spawn Task in Tmux
// =============================================================================

function spawnTaskInTmux(
	taskIndex: number,
	task: string,
	agent: AgentConfig | undefined,
	agentName: string,
	cwd: string,
	runDir: string,
	childSessionFile?: string
): TaskState {
	const taskId = randomUUID().slice(0, 8);
	const windowName = `delegate:${agentName}:${taskId}`;
	const outputFile = path.join(runDir, `task-${taskIndex}-output.txt`);
	const exitCodeFile = path.join(runDir, `task-${taskIndex}-exitcode.txt`);

	let promptFile: string | undefined;
	if (agent?.systemPrompt.trim()) {
		promptFile = path.join(runDir, `task-${taskIndex}-prompt.md`);
		fs.writeFileSync(promptFile, agent.systemPrompt, { encoding: "utf-8", mode: 0o600 });
	}

	const piArgs: string[] = ["-p", "--mode", "text"];
	if (agent?.model) piArgs.push("--model", agent.model);
	if (agent?.tools && agent.tools.length > 0) piArgs.push("--tools", agent.tools.join(","));
	if (childSessionFile) {
		piArgs.push("--session-dir", path.dirname(childSessionFile));
		piArgs.push("--session", childSessionFile);
	}
	if (promptFile) piArgs.push("--append-system-prompt", promptFile);
	piArgs.push(`Task: ${task}`);

	const piCmd = `pi ${piArgs.map(shellEscape).join(" ")}`;
	const shellCmd = [
		`cd ${shellEscape(cwd)}`,
		`${piCmd} 2>&1 | tee ${shellEscape(outputFile)}`,
		`echo $PIPESTATUS > ${shellEscape(exitCodeFile)}`,
	].join(" && ");

	let paneId: string;
	try {
		paneId = execSync(`tmux new-window -d -n ${shellEscape(windowName)} -P -F "#{pane_id}" ${shellEscape(shellCmd)}`, {
			encoding: "utf-8",
		}).trim();
	} catch {
		try {
			paneId = execSync(`tmux new-session -d -s ${shellEscape(windowName)} -P -F "#{pane_id}" ${shellEscape(shellCmd)}`, {
				encoding: "utf-8",
			}).trim();
		} catch (err) {
			throw new Error(`Failed to create tmux window: ${err}`);
		}
	}

	return {
		id: taskId,
		agent: agentName,
		task,
		cwd,
		status: "running",
		windowName,
		paneId,
		outputFile,
		exitCodeFile,
		sessionFile: childSessionFile ?? "",
		startedAt: Date.now(),
		model: agent?.model,
	};
}

// =============================================================================
// Polling
// =============================================================================

function waitForCompletion(state: RunState, intervalMs: number, signal?: AbortSignal): Promise<void> {
	return new Promise<void>((resolve) => {
		const check = () => {
			if (signal?.aborted) {
				resolve();
				return;
			}
			refreshRunState(state);
			writeRunState(state);
			if (state.status !== "running") {
				resolve();
				return;
			}
			setTimeout(check, intervalMs);
		};
		check();
	});
}

// =============================================================================
// Tool Schemas
// =============================================================================

const TaskItem = Type.Object({
	agent: Type.Optional(Type.String({ description: "Agent name" })),
	task: Type.String({ description: "Task description" }),
	cwd: Type.Optional(Type.String({ description: "Working directory" })),
});

const TmuxDelegateParams = Type.Object({
	task: Type.Optional(Type.String({ description: "Task description (single mode)" })),
	agent: Type.Optional(Type.String({ description: "Agent name from ~/.pi/agent/agents/" })),
	cwd: Type.Optional(Type.String({ description: "Working directory (single mode)" })),
	tasks: Type.Optional(
		Type.Array(TaskItem, {
			description: "Multiple tasks to run in parallel, each in its own tmux window",
		})
	),
	agentScope: Type.Optional(
		StringEnum(["user", "project", "both"] as const, {
			description: 'Agent discovery scope. Default: "user"',
		})
	),
	wait: Type.Optional(
		Type.Boolean({
			description: "Wait for all tasks to complete before returning. Default: false (async)",
		})
	),
});

const TmuxDelegateStatusParams = Type.Object({
	id: Type.String({ description: "Run ID from a previous TmuxDelegate call" }),
	tail: Type.Optional(Type.Number({ description: "Number of output lines to show per task. Default: 50" })),
	output: Type.Optional(Type.Boolean({ description: "Include full task output in response. Default: false" })),
});

// =============================================================================
// Rendering Helpers
// =============================================================================

function formatDuration(startedAt: number, finishedAt?: number): string {
	const elapsed = (finishedAt ?? Date.now()) - startedAt;
	const seconds = elapsed / 1000;
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const mins = Math.floor(seconds / 60);
	const secs = Math.round(seconds % 60);
	return `${mins}m${secs}s`;
}

function taskStatusIcon(status: "running" | "completed" | "failed", theme: Theme): string {
	if (status === "running") return theme.fg("warning", "...");
	if (status === "completed") return theme.fg("success", "ok");
	return theme.fg("error", "x");
}

function renderCollapsed(state: RunState, theme: Theme): Text {
	const running = state.tasks.filter((t) => t.status === "running").length;
	const completed = state.tasks.filter((t) => t.status === "completed").length;
	const failed = state.tasks.filter((t) => t.status === "failed").length;

	let text = `${taskStatusIcon(state.status, theme)} ${theme.fg("toolTitle", theme.bold("Run "))}${theme.fg("accent", state.id)}`;
	text += ` ${theme.fg("muted", `(${completed}/${state.tasks.length} done`)}`;
	if (failed > 0) text += theme.fg("error", `, ${failed} failed`);
	if (running > 0) text += theme.fg("warning", `, ${running} running`);
	text += theme.fg("muted", ")");

	for (const task of state.tasks) {
		const icon = taskStatusIcon(task.status, theme);
		const dur = formatDuration(task.startedAt, task.finishedAt);
		const preview = task.task.length > 50 ? `${task.task.slice(0, 50)}...` : task.task;
		text += `\n  ${icon} ${theme.fg("accent", task.agent)} ${theme.fg("dim", `(${dur})`)} ${theme.fg("muted", preview)}`;
		text += `\n    ${theme.fg("dim", `tmux: ${task.windowName}`)}`;
	}

	return new Text(text, 0, 0);
}

function renderExpanded(state: RunState, theme: Theme): Container {
	const container = new Container();

	const running = state.tasks.filter((t) => t.status === "running").length;
	const completed = state.tasks.filter((t) => t.status === "completed").length;
	const failed = state.tasks.filter((t) => t.status === "failed").length;

	let header = theme.fg("toolTitle", theme.bold(`Run ${state.id}`));
	header += ` ${theme.fg("muted", `${completed}/${state.tasks.length} done`)}`;
	if (failed > 0) header += theme.fg("error", ` ${failed} failed`);
	if (running > 0) header += theme.fg("warning", ` ${running} running`);
	container.addChild(new Text(header, 0, 0));

	for (const task of state.tasks) {
		container.addChild(new Spacer(1));

		const icon = taskStatusIcon(task.status, theme);
		const dur = formatDuration(task.startedAt, task.finishedAt);

		container.addChild(
			new Text(`${theme.fg("muted", "--- ")}${icon} ${theme.fg("accent", task.agent)} ${theme.fg("dim", `(${dur})`)}`, 0, 0)
		);
		container.addChild(new Text(`${theme.fg("muted", "Task: ")}${theme.fg("dim", task.task)}`, 0, 0));
		container.addChild(new Text(`${theme.fg("muted", "Window: ")}${theme.fg("dim", task.windowName)}`, 0, 0));
		if (task.sessionFile) {
			container.addChild(new Text(`${theme.fg("muted", "Session: ")}${theme.fg("dim", task.sessionFile)}`, 0, 0));
		}

		if (task.exitCode !== undefined) {
			const color = task.exitCode === 0 ? "success" : "error";
			container.addChild(new Text(`${theme.fg("muted", "Exit: ")}${theme.fg(color, String(task.exitCode))}`, 0, 0));
		}

		const output = readTaskOutput(task, 20);
		if (output !== "(no output yet)" && output !== "(empty output)") {
			container.addChild(new Text(theme.fg("muted", "Output (tail):"), 0, 0));
			container.addChild(new Text(theme.fg("dim", output), 0, 0));
		}
	}

	return container;
}

// =============================================================================
// Extension Entry Point
// =============================================================================

const MAX_PARALLEL_TASKS = 8;

export default function registerTmuxDelegate(pi: ExtensionAPI): void {
	ensureRunsDir();

	const activeRuns = new Map<string, RunState>();

	pi.registerTool({
		name: "TmuxDelegate",
		label: "Tmux Delegate",
		description: [
			"Delegate tasks to Pi subagents running in visible tmux windows.",
			"Each task spawns a separate pi process in its own tmux window for live observation.",
			"Child sessions are created in the same session directory with parentSession set,",
			"so Octo renders them nested under the current session.",
			"Tasks delegated to a different cwd get their own independent session.",
			"By default returns immediately (async). Set wait=true to block until completion.",
			"Use TmuxDelegateStatus to check progress and retrieve output.",
			"Requires running inside a tmux session.",
		].join(" "),
		parameters: TmuxDelegateParams,

		async execute(_toolCallId, params, _onUpdate, ctx, signal) {
			if (!isTmuxAvailable()) {
				return { content: [{ type: "text", text: "Error: tmux is not installed." }], isError: true, details: {} };
			}
			if (!isInsideTmux()) {
				return { content: [{ type: "text", text: "Error: not running inside tmux." }], isError: true, details: {} };
			}

			// Session linking: only link child sessions to parent when both the
			// parent session file exists AND the task runs in the same cwd.
			// Cross-project delegations get their own independent sessions.
			const parentSessionDir = ctx.sessionManager?.getSessionDir();
			const parentSessionFile = ctx.sessionManager?.getSessionFile();

			const scope: AgentScope = params.agentScope ?? "user";
			const discovery = discoverAgents(ctx.cwd, scope);

			const taskList = normalizeTasks(params);
			if (taskList.length === 0) {
				const available = discovery.agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
				return {
					content: [{ type: "text", text: `No tasks provided. Available agents: ${available}` }],
					isError: true,
					details: {},
				};
			}
			if (taskList.length > MAX_PARALLEL_TASKS) {
				return {
					content: [{ type: "text", text: `Too many tasks (${taskList.length}). Max: ${MAX_PARALLEL_TASKS}.` }],
					isError: true,
					details: {},
				};
			}

			const runId = randomUUID().slice(0, 8);
			const runDir = createRunDir(runId);

			const state: RunState = {
				id: runId,
				status: "running",
				createdAt: Date.now(),
				updatedAt: Date.now(),
				tasks: [],
				runDir,
			};

			for (let i = 0; i < taskList.length; i++) {
				const t = taskList[i];
				const agent = t.agentName ? discovery.agents.find((a) => a.name === t.agentName) : undefined;
				const agentName = t.agentName ?? "task";
				const taskCwd = t.cwd ?? ctx.cwd;

				// Only create a linked child session when we have a parent session
				// file and the task runs in the same working directory (same project).
				const sameProject = taskCwd === ctx.cwd;
				const childSessionFile =
					parentSessionFile && parentSessionDir && sameProject
						? createChildSessionFile(parentSessionFile, parentSessionDir, taskCwd)
						: undefined;

				try {
					const taskState = spawnTaskInTmux(i, t.task, agent, agentName, taskCwd, runDir, childSessionFile);
					state.tasks.push(taskState);
				} catch {
					state.tasks.push({
						id: randomUUID().slice(0, 8),
						agent: agentName,
						task: t.task,
						cwd: taskCwd,
						status: "failed",
						windowName: "",
						paneId: "",
						outputFile: "",
						exitCodeFile: "",
						sessionFile: childSessionFile ?? "",
						startedAt: Date.now(),
						finishedAt: Date.now(),
						exitCode: 1,
					});
				}
			}

			writeRunState(state);
			activeRuns.set(runId, state);
			pi.events.emit("tmux-delegate:started", { id: runId, taskCount: state.tasks.length });

			if (params.wait) {
				await waitForCompletion(state, 2000, signal);
				writeRunState(state);

				const successCount = state.tasks.filter((t) => t.status === "completed").length;
				const summaries = state.tasks.map((t) => {
					const output = readTaskOutput(t, 30);
					return `[${t.agent}] ${t.status} (exit ${t.exitCode ?? "?"})\n${output}`;
				});

				return {
					content: [
						{
							type: "text",
							text: `Run ${runId}: ${successCount}/${state.tasks.length} completed\n\n${summaries.join("\n\n---\n\n")}`,
						},
					],
					details: { runId, state },
				};
			}

			const windowList = state.tasks.map((t) => `  ${t.agent}: ${t.windowName}`).join("\n");
			const linkedTasks = state.tasks.filter((t) => t.sessionFile);
			const lines = [
				`Spawned ${state.tasks.length} task(s) in tmux windows.`,
				`Run ID: ${runId}`,
				"",
				"Tmux windows:",
				windowList,
			];
			if (linkedTasks.length > 0) {
				const sessionList = linkedTasks.map((t) => `  ${t.agent}: ${t.sessionFile}`).join("\n");
				lines.push("", "Child sessions:", sessionList);
			}
			lines.push(
				"",
				"Use TmuxDelegateStatus to check progress and retrieve output.",
				"Switch to a tmux window to watch live: tmux select-window -t <name>"
			);
			return {
				content: [
					{
						type: "text",
						text: lines.join("\n"),
					},
				],
				details: { runId, state },
			};
		},

		renderCall(args, theme) {
			const tasks = args.tasks;
			const isParallel = tasks !== undefined && tasks.length > 0;
			const waitLabel = args.wait ? theme.fg("warning", " [sync]") : theme.fg("muted", " [async]");

			if (isParallel) {
				let text = `${theme.fg("toolTitle", theme.bold("TmuxDelegate "))}${theme.fg("accent", `parallel (${tasks.length})`)}${waitLabel}`;
				for (const t of tasks.slice(0, 3)) {
					const preview = t.task.length > 50 ? `${t.task.slice(0, 50)}...` : t.task;
					text += `\n  ${theme.fg("accent", t.agent ?? "task")} ${theme.fg("dim", preview)}`;
				}
				if (tasks.length > 3) {
					text += `\n  ${theme.fg("muted", `... +${tasks.length - 3} more`)}`;
				}
				return new Text(text, 0, 0);
			}

			const agentName = args.agent ?? "task";
			const preview = args.task ? (args.task.length > 60 ? `${args.task.slice(0, 60)}...` : args.task) : "...";
			return new Text(
				`${theme.fg("toolTitle", theme.bold("TmuxDelegate "))}${theme.fg("accent", agentName)}${waitLabel}\n  ${theme.fg("dim", preview)}`,
				0,
				0
			);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as DelegateDetails | undefined;
			if (!details?.state) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
			}
			return expanded ? renderExpanded(details.state, theme) : renderCollapsed(details.state, theme);
		},
	});

	pi.registerTool({
		name: "TmuxDelegateStatus",
		label: "Tmux Delegate Status",
		description: [
			"Check status and retrieve output from tmux delegate runs.",
			"Provide the run ID from a previous TmuxDelegate call.",
			"Set output=true to include task output. Use tail=N to limit lines.",
		].join(" "),
		parameters: TmuxDelegateStatusParams,

		async execute(_toolCallId, params, _onUpdate, _ctx, _signal) {
			const runDir = path.join(RUNS_BASE_DIR, params.id);

			let state = readRunState(runDir);
			if (!state) {
				const active = activeRuns.get(params.id);
				if (!active) {
					return {
						content: [{ type: "text", text: `Run ${params.id} not found.` }],
						isError: true,
						details: {},
					};
				}
				state = active;
			}

			refreshRunState(state);
			writeRunState(state);
			activeRuns.set(state.id, state);

			const tail = params.tail ?? 50;
			const includeOutput = params.output ?? false;

			const lines: string[] = [];
			lines.push(`Run: ${state.id} | Status: ${state.status}`);
			lines.push(`Tasks: ${state.tasks.length}`);
			lines.push("");

			for (const task of state.tasks) {
				const dur = formatDuration(task.startedAt, task.finishedAt);
				lines.push(`--- ${task.agent} [${task.status}] (${dur}) ---`);
				lines.push(`  Window: ${task.windowName}`);
				if (task.sessionFile) lines.push(`  Session: ${task.sessionFile}`);
				lines.push(`  Task: ${task.task}`);
				if (task.exitCode !== undefined) lines.push(`  Exit: ${task.exitCode}`);
				if (includeOutput) {
					lines.push(`  Output:\n${readTaskOutput(task, tail)}`);
				}
				lines.push("");
			}

			return {
				content: [{ type: "text", text: lines.join("\n") }],
				details: { state },
			};
		},

		renderCall(args, theme) {
			return new Text(`${theme.fg("toolTitle", theme.bold("TmuxDelegateStatus "))}${theme.fg("accent", args.id)}`, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as StatusDetails | undefined;
			if (!details?.state) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
			}
			return expanded ? renderExpanded(details.state, theme) : renderCollapsed(details.state, theme);
		},
	});

	// Background poll: notify on completion
	const pollTimer = setInterval(() => {
		for (const [id, state] of activeRuns) {
			if (state.status !== "running") continue;
			refreshRunState(state);
			writeRunState(state);
			if (state.status !== "running") {
				pi.events.emit("tmux-delegate:complete", state);
				activeRuns.delete(id);
			}
		}
	}, 5000);

	pi.on("session_shutdown", async () => {
		clearInterval(pollTimer);
	});
}

// =============================================================================
// Helpers
// =============================================================================

interface NormalizedTask {
	agentName?: string;
	task: string;
	cwd?: string;
}

function normalizeTasks(params: {
	task?: string;
	agent?: string;
	cwd?: string;
	tasks?: Array<{ agent?: string; task: string; cwd?: string }>;
}): NormalizedTask[] {
	if (params.tasks && params.tasks.length > 0) {
		return params.tasks.map((t) => ({ agentName: t.agent, task: t.task, cwd: t.cwd }));
	}
	if (params.task) {
		return [{ agentName: params.agent, task: params.task, cwd: params.cwd }];
	}
	return [];
}
