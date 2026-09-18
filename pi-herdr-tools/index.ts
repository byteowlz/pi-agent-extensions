/**
 * pi-herdr-tools — herdr-flavored tools: delegate a task to a new pi subagent
 * in a fresh herdr tab, and fork the current session into its own named tab.
 *
 * The current agent calls the `delegate_subagent` tool; the user stays in
 * control through a config file (kill switch, model allowlist, allowance):
 *
 *   ~/.pi/agent/subagent-config.json
 *
 *   {
 *     "enabled": true,              // kill switch: false = model cannot spawn at all
 *     "requireConfirmation": true,  // always ask the user before spawning
 *     "allowedModels": [],          // glob patterns (e.g. "openai/*", "archvm/*"); [] = all allowed
 *     "maxSubagents": 3             // max concurrent subagents per session (finished ones do not count); 0 = unlimited
 *   }
 *
 * Commands:
 *   /subagent status              show config + active subagents
 *   /subagent on|off              enable/disable model-initiated spawning
 *   /subagent confirm|noconfirm   require (or skip) user confirmation
 *   /subagent models add <glob>   allow a model pattern (repeatable)
 *   /subagent models remove <glob>
 *   /subagent models list         show allowlist
 *   /subagent max <n>             set concurrent allowance (0 = unlimited)
 *   /side [label] [--model M] txt Fork the CURRENT session into a new named
 *                                 tab (like Claude /btw or Codex /side, own tab)
 *   /btw ...                      alias for /side
 *
 * Session semantics: pi is single-writer per session file (loaded once at
 * startup; appended to; no reload/lock). Two TUIs on the SAME file do NOT
 * auto-branch — they diverge and collide. To steer a copy in a new direction
 * in its own tab, /side forks the current session into a NEW file
 * (pi --fork <file>) whose header records the parent, then opens pi there.
 *
 * Spawns via the herdr CLI (the documented automation path; herdr itself is
 * socket-backed via HERDR_SOCKET_PATH): tab create -> agent start -> prompt.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	Input,
	Key,
	fuzzyFilter,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";

const execFileAsync = promisify(execFile);

const CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "subagent-config.json");
const NAME_PREFIX = "sub-"; // agent names must match [a-z][a-z0-9_-]{0,31}

interface SubagentConfig {
	enabled: boolean;
	requireConfirmation: boolean;
	allowedModels: string[];
	maxSubagents: number;
}

const DEFAULT_CONFIG: SubagentConfig = {
	enabled: true,
	requireConfirmation: true,
	allowedModels: [],
	maxSubagents: 3,
};

function loadConfig(): SubagentConfig {
	try {
		if (fs.existsSync(CONFIG_PATH)) {
			const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as Partial<SubagentConfig>;
			return {
				enabled: raw.enabled ?? DEFAULT_CONFIG.enabled,
				requireConfirmation: raw.requireConfirmation ?? DEFAULT_CONFIG.requireConfirmation,
				allowedModels: Array.isArray(raw.allowedModels) ? raw.allowedModels : [],
				maxSubagents: typeof raw.maxSubagents === "number" ? raw.maxSubagents : DEFAULT_CONFIG.maxSubagents,
			};
		}
	} catch {
		// fall through to defaults on a corrupt file
	}
	return { ...DEFAULT_CONFIG };
}

function saveConfig(config: SubagentConfig): void {
	try {
		fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
		fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
	} catch {
		// non-fatal: config still applies for this process
	}
}

function isInHerdr(): boolean {
	return process.env.HERDR_ENV === "1" && !!process.env.HERDR_SOCKET_PATH;
}

async function herdr(args: string[]): Promise<any> {
	const { stdout } = await execFileAsync("herdr", args, { maxBuffer: 8 * 1024 * 1024 });
	const text = stdout.trim();
	if (!text) return {};
	try {
		return JSON.parse(text);
	} catch {
		return { result: undefined, raw: text };
	}
}

/** Run `herdr <args>` and return the raw stdout as a string, without JSON parsing. */
async function herdrRaw(args: string[]): Promise<string> {
	const { stdout } = await execFileAsync("herdr", args, { maxBuffer: 16 * 1024 * 1024 });
	return stdout;
}

/** Convert a simple glob (e.g. "openai/*") to a RegExp. */
function globToRegExp(pattern: string): RegExp {
	const escaped = pattern
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replace(/\*/g, ".*")
		.replace(/\?/g, ".");
	return new RegExp(`^${escaped}$`);
}

function modelAllowed(config: SubagentConfig, model: string): boolean {
	if (config.allowedModels.length === 0) return true;
	const full = model;
	const bare = model.split("/").pop() ?? model;
	return config.allowedModels.some((p) => {
		const re = globToRegExp(p);
		return re.test(full) || re.test(bare) || re.test(`${full.split("/")[0]}/*`);
	});
}

/**
 * Names of the subagents spawned by THIS pi session (this extension instance).
 * The allowance is per session: agents spawned by other sessions, or by an
 * earlier process of this session, never count against it. Names are pruned
 * once herdr no longer lists them.
 */
const spawnedBySession = new Set<string>();

/**
 * Count subagents this session spawned that are still alive and not finished.
 * An agent whose status is `done` has completed its task and no longer
 * occupies the concurrency allowance, even though its tab may still exist.
 */
async function countSubagents(): Promise<number> {
	if (spawnedBySession.size === 0) return 0;
	const res = await herdr(["agent", "list"]);
	const agents: unknown[] = Array.isArray(res?.result?.agents) ? res.result.agents : [];
	const listed = new Map<string, string>();
	for (const a of agents) {
		if (!a || typeof a !== "object") continue;
		const { name, agent_status } = a as { name?: unknown; agent_status?: unknown };
		if (typeof name === "string") listed.set(name, typeof agent_status === "string" ? agent_status : "");
	}
	let active = 0;
	for (const name of [...spawnedBySession]) {
		const status = listed.get(name);
		if (status === undefined) {
			spawnedBySession.delete(name);
			continue;
		}
		if (status !== "done") active += 1;
	}
	return active;
}

function randomName(): string {
	return `${NAME_PREFIX}${Math.random().toString(36).slice(2, 8)}`;
}

function randomSideName(): string {
	return `side-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Fork the current session into a brand-new session FILE, then open pi in a
 * new named herdr tab from that fork.
 *
 * We do NOT point two TUIs at the same session file (pi is single-writer;
 * two writers would diverge/collide without auto-branching). Instead we fork
 * to a fresh file via `pi --fork`, whose header records the parent session.
 */
async function openSideTab(opts: {
	ctx: ExtensionContext;
	label: string;
	cwd?: string;
	model?: string;
	instruction?: string;
}) {
	const sessionFile = opts.ctx.sessionManager.getSessionFile();
	if (!sessionFile) {
		throw new Error("No current session file to fork (ephemeral --no-session?).");
	}

	const name = randomSideName();
	const cwd = opts.cwd ?? opts.ctx.sessionManager.getCwd() ?? opts.ctx.cwd;

	const tabRes = await herdr(["tab", "create", "--label", opts.label, "--cwd", cwd, "--no-focus"]);
	const paneId = tabRes?.result?.root_pane?.pane_id;
	const tabId = tabRes?.result?.tab?.tab_id;
	if (!paneId) {
		throw new Error(`herdr tab create failed: ${JSON.stringify(tabRes).slice(0, 400)}`);
	}

	const piArgs: string[] = ["--fork", sessionFile];
	if (opts.model) piArgs.push("--model", opts.model);
	const startRes = await herdr(["agent", "start", name, "--kind", "pi", "--pane", paneId, "--", ...piArgs]);
	if (startRes?.error || !startRes?.result?.agent?.name) {
		throw new Error(`herdr agent start failed: ${JSON.stringify(startRes).slice(0, 400)}`);
	}

	if (opts.instruction) {
		await herdr(["agent", "prompt", name, opts.instruction]);
	}

	return { name, tabId, paneId };
}

interface DelegateParams {
	task: string;
	model?: string;
	tabLabel?: string;
	cwd?: string;
}

const DelegateParamsSchema = Type.Object({
	task: Type.String({ description: "The task/instruction to delegate to the new subagent." }),
	model: Type.Optional(
		Type.String({
			description: "pi model pattern, e.g. 'openai/gpt-5' or 'archvm/gemma-4-E4B-it'. Defaults to the current model.",
		})
	),
	tabLabel: Type.Optional(Type.String({ description: "Label for the new herdr tab. Defaults to a short slug of the task." })),
	cwd: Type.Optional(Type.String({ description: "Working directory for the subagent. Defaults to the current directory." })),
});

// --- Relay (send last output to another tab) ---

interface SessionMessageLike {
	type: string;
	message?: { role?: string; content?: unknown };
}

interface RelayTarget {
	paneId: string;
	label: string;
}

function contentToText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((c) => {
				if (
					c &&
					typeof c === "object" &&
					(c as { type?: string }).type === "text" &&
					typeof (c as { text?: unknown }).text === "string"
				) {
					return (c as { text: string }).text;
				}
				return "";
			})
			.filter(Boolean)
			.join("\n")
			.trim();
	}
	return "";
}

function getLastAgentOutput(ctx: ExtensionContext): string {
	const entries = ctx.sessionManager.getEntries?.() ?? [];
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i] as SessionMessageLike | undefined;
		if (!entry || entry.type !== "message") continue;
		if (entry.message?.role !== "assistant") continue;
		const text = contentToText(entry.message.content);
		if (text) return text;
	}
	return "";
}

async function listRelayTargets(): Promise<RelayTarget[]> {
	const res = (await herdr(["agent", "list"])) as
		| { result?: { agents?: Array<{ pane_id?: unknown; terminal_title_stripped?: unknown; cwd?: unknown }> } }
		| undefined;
	const agents = res?.result?.agents ?? [];
	const selfPane = process.env.HERDR_PANE_ID;
	const seen = new Set<string>();
	const targets: RelayTarget[] = [];
	for (const a of agents) {
		const paneId = a?.pane_id;
		if (typeof paneId !== "string" || !paneId) continue;
		if (selfPane && paneId === selfPane) continue;
		const raw = a?.terminal_title_stripped || a?.cwd;
		let label = typeof raw === "string" && raw.trim() ? raw.trim() : paneId;
		if (seen.has(label)) label = `${label} (${paneId})`;
		seen.add(label);
		targets.push({ paneId, label });
	}
	return targets;
}

function composeRelayMessage(note: string, output: string): string {
	const clean = note.trim();
	return clean ? `${clean}\n\n${output}` : output;
}

/**
 * Fuzzy target picker: a search box + fuzzy-filtered list.
 * Search matches characters in order (case-insensitive) against the target's
 * terminal title and pane id, scored and ranked.
 * Returns the chosen pane id, or null on cancel.
 */
async function fuzzyTargetPicker(ctx: ExtensionContext, targets: RelayTarget[]): Promise<string | null> {
	interface Row {
		value: string;
		label: string;
		match: string;
	}
	const all: Row[] = targets.map((t) => ({ value: t.paneId, label: t.label, match: `${t.label} ${t.paneId}` }));

	return ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
		const search = new Input();
		try {
			search.focused = true;
		} catch {
			// focus is best-effort; input still works without it
		}
		let visible: Row[] = all;
		let selected = 0;
		const maxVisible = Math.max(1, Math.min(all.length, 10));
		let cachedLines: string[] | undefined;

		function recompute(query: string): void {
			const trimmed = query.trim();
			visible = trimmed ? fuzzyFilter(all, trimmed, (it) => it.match) : all;
			if (selected >= visible.length) selected = Math.max(0, visible.length - 1);
			if (selected < 0) selected = 0;
		}

		function refresh(): void {
			cachedLines = undefined;
			tui.requestRender();
		}

		function handleNavigation(data: string): boolean {
			if (matchesKey(data, Key.up)) {
				if (visible.length > 0) selected = (selected - 1 + visible.length) % visible.length;
				return true;
			}
			if (matchesKey(data, Key.down)) {
				if (visible.length > 0) selected = (selected + 1) % visible.length;
				return true;
			}
			if (matchesKey(data, Key.pageUp)) {
				selected = Math.max(0, selected - maxVisible);
				return true;
			}
			if (matchesKey(data, Key.pageDown)) {
				selected = Math.min(visible.length - 1, selected + maxVisible);
				return true;
			}
			if (matchesKey(data, Key.enter)) {
				const row = visible[selected];
				if (row) {
					done(row.value);
					return true;
				}
			}
			return false;
		}

		function handleInput(data: string): void {
			if (matchesKey(data, Key.escape)) {
				done(null);
				return;
			}
			if (handleNavigation(data)) {
				refresh();
				return;
			}
			search.handleInput(data);
			recompute(search.getValue());
			refresh();
		}

		function renderRow(row: Row, isSelected: boolean, width: number): string {
			const prefix = isSelected ? theme.fg("accent", "→ ") : "  ";
			const pane = theme.fg("muted", `  [${row.value}]`);
			const labelWidth = Math.max(1, width - visibleWidth(prefix) - visibleWidth(pane));
			const label = truncateToWidth(row.label, labelWidth, "…");
			return isSelected ? theme.fg("accent", `${prefix}${label}`) + pane : prefix + label + pane;
		}

		function render(width: number): string[] {
			if (cachedLines) return cachedLines;
			const rw = Math.max(1, width);
			const lines: string[] = [];
			lines.push(theme.fg("accent", "─".repeat(rw)));
			lines.push(...wrapTextWithAnsi(theme.fg("accent", "Send last output to:"), rw));
			lines.push("");
			lines.push(...search.render(Math.max(1, rw - 2)).map((l) => ` ${l}`));
			lines.push("");
			if (visible.length === 0) {
				lines.push(theme.fg("warning", "  No matching agents"));
			} else {
				const start = Math.max(0, Math.min(selected - Math.floor(maxVisible / 2), visible.length - maxVisible));
				const end = Math.min(start + maxVisible, visible.length);
				for (let i = start; i < end; i++) lines.push(renderRow(visible[i], i === selected, rw));
				if (start > 0 || end < visible.length) lines.push(theme.fg("dim", `  (${selected + 1}/${visible.length})`));
			}
			lines.push("");
			lines.push(...wrapTextWithAnsi(theme.fg("dim", "Type to fuzzy-filter • ↑↓ navigate • Enter select • Esc cancel"), rw));
			lines.push(theme.fg("accent", "─".repeat(rw)));
			cachedLines = lines;
			return lines;
		}

		return {
			render,
			handleInput,
			invalidate: () => {
				cachedLines = undefined;
			},
		};
	});
}

async function relayModal(
	ctx: ExtensionContext,
	target: RelayTarget,
	output: string
): Promise<{ note: string; inject: boolean } | null> {
	const previewLines = output.split("\n");

	return ctx.ui.custom<{ note: string; inject: boolean } | null>((tui, theme, _kb, done) => {
		const editorTheme: EditorTheme = {
			borderColor: (s) => theme.fg("accent", s),
			selectList: {
				selectedPrefix: (t) => theme.fg("accent", t),
				selectedText: (t) => theme.fg("accent", t),
				description: (t) => theme.fg("muted", t),
				scrollInfo: (t) => theme.fg("dim", t),
				noMatch: (t) => theme.fg("warning", t),
			},
		};
		const editor = new Editor(tui, editorTheme);
		let cachedLines: string[] | undefined;

		editor.onSubmit = (value) => {
			done({ note: value, inject: false });
		};

		function refresh(): void {
			cachedLines = undefined;
			tui.requestRender();
		}

		function handleInput(data: string): void {
			if (matchesKey(data, Key.escape)) {
				done(null);
				return;
			}
			if (matchesKey(data, "ctrl+j") || matchesKey(data, "ctrl+enter")) {
				done({ note: editor.getText(), inject: true });
				return;
			}
			editor.handleInput(data);
			refresh();
		}

		function render(width: number): string[] {
			if (cachedLines) return cachedLines;
			const rw = Math.max(1, width);
			const lines: string[] = [];
			function pushWrapped(text: string): void {
				lines.push(...wrapTextWithAnsi(text, rw));
			}
			lines.push(theme.fg("accent", "─".repeat(rw)));
			pushWrapped(theme.fg("accent", `Send last output to: ${target.label}`));
			lines.push("");
			pushWrapped(theme.fg("muted", `Last output (${previewLines.length} lines):`));
			const shown = previewLines.length > 15 ? [...previewLines.slice(previewLines.length - 15), "…"] : previewLines;
			for (const line of shown) pushWrapped(theme.fg("text", line));
			lines.push("");
			pushWrapped(theme.fg("muted", "Note / instruction (Enter to send):"));
			for (const line of editor.render(Math.max(1, rw - 2))) {
				lines.push(` ${line}`);
			}
			lines.push("");
			pushWrapped(
				theme.fg("dim", "Enter = send • Ctrl+j = send + bring back other tab's reply into this session • Esc = cancel")
			);
			lines.push(theme.fg("accent", "─".repeat(rw)));
			cachedLines = lines;
			return lines;
		}

		return {
			render,
			handleInput,
			invalidate: () => {
				cachedLines = undefined;
			},
		};
	});
}

async function runSend(ctx: ExtensionContext, pi: ExtensionAPI): Promise<void> {
	if (!isInHerdr()) {
		ctx.ui.notify("Not running inside a herdr-managed pane (HERDR_ENV=1 + HERDR_SOCKET_PATH required).", "error");
		return;
	}
	const output = getLastAgentOutput(ctx);
	if (!output) {
		ctx.ui.notify("No recent assistant output found to send.", "warning");
		return;
	}
	const targets = await listRelayTargets();
	if (targets.length === 0) {
		ctx.ui.notify("No other herdr agents found to send to.", "warning");
		return;
	}
	const chosen = await fuzzyTargetPicker(ctx, targets);
	if (!chosen) return;
	const target = targets.find((t) => t.paneId === chosen);
	if (!target) return;

	const result = await relayModal(ctx, target, output);
	if (!result) {
		ctx.ui.notify("Cancelled.", "info");
		return;
	}

	const message = composeRelayMessage(result.note, output);
	try {
		if (result.inject) {
			await injectResponseBack(ctx, pi, target, message);
		} else {
			await herdr(["agent", "prompt", target.paneId, message]);
			ctx.ui.notify(`Sent to ${target.label}.`, "info");
		}
	} catch (err) {
		ctx.ui.notify(`Send failed: ${(err as Error)?.message ?? err}`, "error");
	}
}

/**
 * Send a prompt to the target, wait for it to settle, read its recent output,
 * and feed that response back into the *sending* session as a steer/follow-up.
 */
async function injectResponseBack(ctx: ExtensionContext, pi: ExtensionAPI, target: RelayTarget, message: string): Promise<void> {
	ctx.ui.notify(`Sent to ${target.label}; waiting for its response…`, "info");
	try {
		await herdr(["agent", "prompt", target.paneId, message, "--wait", "--timeout", "600000"]);
	} catch (err) {
		ctx.ui.notify(
			`Prompt delivered to ${target.label} but waiting failed: ${(err as Error)?.message ?? err}. Still reading its output.`,
			"warning"
		);
	}

	const raw = await herdrRaw(["agent", "read", target.paneId, "--source", "recent", "--lines", "300", "--format", "text"]);
	const response = raw.trim();
	if (!response) {
		ctx.ui.notify(`Could not read a response from ${target.label}.`, "warning");
		return;
	}
	const responseTail = response.length > 6000 ? `${response.slice(-6000)}\n…(truncated)` : response;
	pi.sendUserMessage(`Response from ${target.label} (relayed from this tab's last output):\n\n${responseTail}`);
	ctx.ui.notify(`Injected ${target.label}'s response into this session.`, "info");
}

export default function herdrTools(pi: ExtensionAPI) {
	pi.registerTool({
		name: "delegate_subagent",
		label: "Delegate to subagent",
		description:
			"Delegate a task to a NEW pi subagent running in a fresh herdr tab with a chosen model. The user stays in control: spawning is gated by config (enabled/confirm/model-allowlist/max), and confirmation is shown before spawning unless disabled. Use for parallel or background work that needs an isolated context.",
		parameters: DelegateParamsSchema,
		executionMode: "sequential",

		async execute(_toolCallId, params: DelegateParams, _signal, _onUpdate, ctx) {
			if (!isInHerdr()) {
				return {
					content: [
						{ type: "text", text: "Error: not running inside a herdr-managed pane (HERDR_ENV=1 + HERDR_SOCKET_PATH required)." },
					],
					details: { spawned: false },
				};
			}

			const config = loadConfig();
			if (!config.enabled) {
				return {
					content: [
						{
							type: "text",
							text: "Error: subagent spawning is DISABLED (config 'enabled' is false). Run /subagent on to allow it.",
						},
					],
					details: { spawned: false },
				};
			}

			const model = params.model ?? `${ctx.model?.provider ?? ""}/${ctx.model?.id ?? ""}`;
			if (!modelAllowed(config, model)) {
				return {
					content: [
						{
							type: "text",
							text: `Error: model "${model}" is not in the allowlist. Allowed: ${config.allowedModels.join(", ") || "(none)"}. Run /subagent models add <glob> to allow it.`,
						},
					],
					details: { spawned: false },
				};
			}

			const active = await countSubagents();
			if (config.maxSubagents > 0 && active >= config.maxSubagents) {
				return {
					content: [
						{
							type: "text",
							text: `Error: subagent allowance reached (${active}/${config.maxSubagents}). Run /subagent max <n> to raise it.`,
						},
					],
					details: { spawned: false },
				};
			}

			const cwd = params.cwd ?? ctx.cwd;
			const label = params.tabLabel ?? (params.task.replace(/\s+/g, " ").slice(0, 28).trim() || "subagent");

			if (config.requireConfirmation && ctx.hasUI) {
				const ok = await ctx.ui.confirm(
					"Spawn subagent?",
					`Tab: ${label}\nModel: ${model}\nCwd: ${cwd}\n\nTask:\n${params.task.slice(0, 400)}${params.task.length > 400 ? "\n…" : ""}`
				);
				if (!ok) {
					return {
						content: [{ type: "text", text: "Spawn cancelled by the user." }],
						details: { spawned: false },
					};
				}
			}

			const name = randomName();

			// 1. create the tab (no focus; keep the user's context)
			const tabRes = await herdr(["tab", "create", "--label", label, "--cwd", cwd, "--no-focus"]);
			const paneId = tabRes?.result?.root_pane?.pane_id;
			const tabId = tabRes?.result?.tab?.tab_id;
			if (!paneId) {
				return {
					content: [
						{
							type: "text",
							text: `Error: herdr tab create failed. Response: ${JSON.stringify(tabRes).slice(0, 500)}`,
						},
					],
					details: { spawned: false },
				};
			}

			// 2. start the pi agent with the chosen model
			const startRes = await herdr(["agent", "start", name, "--kind", "pi", "--pane", paneId, "--", "--model", model]);
			if (startRes?.error || !startRes?.result?.agent?.name) {
				return {
					content: [
						{
							type: "text",
							text: `Error: herdr agent start failed. Response: ${JSON.stringify(startRes).slice(0, 500)}`,
						},
					],
					details: { spawned: false },
				};
			}

			spawnedBySession.add(name);

			// 3. submit the task asynchronously (no --wait)
			const promptRes = await herdr(["agent", "prompt", name, params.task]);
			const promptOk = !promptRes?.error;
			if (!promptOk) {
				return {
					content: [
						{
							type: "text",
							text: `Subagent started but prompt submit reported an error (${JSON.stringify(promptRes).slice(0, 300)}). It may still be idle; read it via: herdr agent read ${name}`,
						},
					],
					details: { spawned: true, name, tabId, paneId, model },
				};
			}

			return {
				content: [
					{
						type: "text",
						text: `Subagent spawned and task submitted.\n\n  agent: ${name}\n  tab:  ${tabId}\n  pane: ${paneId}\n  model: ${model}\n  cwd:  ${cwd}\n\nMonitor: herdr agent read ${name} --source recent-unwrapped --format text\nWait:   herdr agent wait ${name} --until idle`,
					},
				],
				details: { spawned: true, name, tabId, paneId, model },
			};
		},
	});

	// ---- /subagent command: config + status ----
	pi.registerCommand("subagent", {
		description: "Manage subagent delegation: on/off, confirm, model allowlist, allowance, status.",
		handler: async (args, ctx) => {
			const argv = (args ?? "").trim().split(/\s+/).filter(Boolean);
			const config = loadConfig();

			if (argv[0] === "on") {
				config.enabled = true;
				saveConfig(config);
				ctx.ui.notify("Subagent spawning enabled.", "info");
				return;
			}
			if (argv[0] === "off") {
				config.enabled = false;
				saveConfig(config);
				ctx.ui.notify("Subagent spawning disabled.", "info");
				return;
			}
			if (argv[0] === "confirm") {
				config.requireConfirmation = true;
				saveConfig(config);
				ctx.ui.notify("User confirmation required before spawning.", "info");
				return;
			}
			if (argv[0] === "noconfirm") {
				config.requireConfirmation = false;
				saveConfig(config);
				ctx.ui.notify("User confirmation skipped (auto-spawn).", "info");
				return;
			}
			if (argv[0] === "models" && argv[1] === "add" && argv[2]) {
				config.allowedModels.push(argv[2]);
				saveConfig(config);
				ctx.ui.notify(`Allowlisted model pattern: ${argv[2]}`, "info");
				return;
			}
			if (argv[0] === "models" && argv[1] === "remove" && argv[2]) {
				config.allowedModels = config.allowedModels.filter((p) => p !== argv[2]);
				saveConfig(config);
				ctx.ui.notify(`Removed allowlist pattern: ${argv[2]}`, "info");
				return;
			}
			if (argv[0] === "models" && argv[1] === "list") {
				ctx.ui.notify(
					`Allowlist (empty = all allowed): ${config.allowedModels.length ? config.allowedModels.join(", ") : "(all)"}`,
					"info"
				);
				return;
			}
			if (argv[0] === "max") {
				const n = Number.parseInt(argv[1] ?? "", 10);
				if (!Number.isFinite(n) || n < 0) {
					ctx.ui.notify("Usage: /subagent max <n> (0 = unlimited)", "error");
					return;
				}
				config.maxSubagents = n;
				saveConfig(config);
				ctx.ui.notify(`Subagent allowance set to ${n}${n === 0 ? " (unlimited)" : ""}.`, "info");
				return;
			}

			// default: status
			const active = await countSubagents();
			ctx.ui.notify(
				`Subagent config: enabled=${config.enabled}, confirm=${config.requireConfirmation}, max=${config.maxSubagents}${config.maxSubagents === 0 ? " (unlimited)" : ""}, active=${active}\nAllowlist: ${config.allowedModels.length ? config.allowedModels.join(", ") : "(all)"}`,
				"info"
			);
		},
	});

	// ---- /side and /btw: open the current session in its own new tab ----
	const registerSide = (name: string) => {
		pi.registerCommand(name, {
			description: `Fork the CURRENT session into a new named herdr tab and open pi there, so you can steer it in a different direction (like Claude /btw or Codex /side, but in its own tab). Usage: /${name} [label] [--model M] [instruction...].`,
			handler: async (args, ctx) => {
				// parse: optional --model M, first bare token = label, rest = instruction
				const tokens = (args ?? "").trim().split(/\s+/).filter(Boolean);
				let model: string | undefined;
				let label: string;
				let instruction: string | undefined;

				const rest: string[] = [];
				let i = 0;
				while (i < tokens.length) {
					if (tokens[i] === "--model" && i + 1 < tokens.length) {
						model = tokens[i + 1];
						i += 2;
					} else {
						rest.push(tokens[i]);
						i++;
					}
				}

				if (rest.length === 0) {
					ctx.ui.notify(
						`Usage: /side [label] [--model M] [instruction...] — e.g. /side fix-bugs --model openai/gpt-5 "Fix the tests then report."`,
						"error"
					);
					return;
				}

				label = rest[0].replace(/[^a-zA-Z0-9 _\-.]/g, "-").slice(0, 40) || "side";
				instruction = rest.slice(1).join(" ") || undefined;

				try {
					const result = await openSideTab({ ctx, label, model, instruction });
					ctx.ui.notify(
						`Opened side session in its own tab.\n  agent: ${result.name}\n  tab: ${result.tabId}\n  pane: ${result.paneId}\nIt is forked from the current session (pi --fork); steer it any direction.`,
						"info"
					);
				} catch (err: any) {
					ctx.ui.notify(`Side tab failed: ${err?.message ?? err}`, "error");
				}
			},
		});
	};
	registerSide("side");
	registerSide("btw");

	pi.registerCommand("send", {
		description:
			"Send this agent's last response to another herdr tab, optionally with a note. Fuzzy-pick the target, type a note; Enter sends, Ctrl+j sends and brings back that tab's reply into this session as a follow-up (Esc cancels).",
		handler: async (_args, ctx) => {
			await runSend(ctx, pi);
		},
	});
	pi.registerCommand("relay", {
		description: "Alias of /send: copy this agent's last response and forward it to another herdr tab with an optional note.",
		handler: async (_args, ctx) => {
			await runSend(ctx, pi);
		},
	});
}
