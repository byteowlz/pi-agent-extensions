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
 *     "maxSubagents": 3             // max concurrent subagents; 0 = unlimited
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
import { Editor, type EditorTheme, Key, matchesKey, wrapTextWithAnsi } from "@earendil-works/pi-tui";
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

/** Count currently-live subagents we spawned (by name prefix). */
async function countSubagents(): Promise<number> {
	const res = await herdr(["agent", "list"]);
	const agents = res?.result?.agents ?? [];
	return agents.filter((a: any) => typeof a.name === "string" && a.name.startsWith(NAME_PREFIX)).length;
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
			pushWrapped(theme.fg("dim", "Enter = send to tab • Ctrl+j = send + paste into this tab • Esc = cancel"));
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

async function runSend(ctx: ExtensionContext): Promise<void> {
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
	const options = targets.map((t) => t.label);
	const chosen = await ctx.ui.select("Send last output to…", options);
	if (!chosen) return;
	const target = targets.find((t) => t.label === chosen);
	if (!target) return;

	const result = await relayModal(ctx, target, output);
	if (!result) {
		ctx.ui.notify("Cancelled.", "info");
		return;
	}

	const message = composeRelayMessage(result.note, output);
	try {
		await herdr(["agent", "prompt", target.paneId, message]);
		let msg = `Sent to ${target.label}.`;
		if (result.inject) {
			ctx.ui.pasteToEditor(message);
			msg += " Also pasted into this tab's editor.";
		}
		ctx.ui.notify(msg, "info");
	} catch (err) {
		ctx.ui.notify(`Send failed: ${(err as Error)?.message ?? err}`, "error");
	}
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
			"Send this agent's last response to another herdr tab, optionally with a note. Pick the target tab, type a note; Enter sends to the tab, Ctrl+j also pastes the message into this tab's editor (Esc cancels).",
		handler: async (_args, ctx) => {
			await runSend(ctx);
		},
	});
	pi.registerCommand("relay", {
		description: "Alias of /send: copy this agent's last response and forward it to another herdr tab with an optional note.",
		handler: async (_args, ctx) => {
			await runSend(ctx);
		},
	});
}
