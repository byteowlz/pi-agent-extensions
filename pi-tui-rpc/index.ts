/**
 * pi-tui-rpc: drive one pi session from the TUI and RPC clients simultaneously.
 *
 * Runs inside a TUI-mode pi process, opens a Unix-socket JSONL server, and
 * bridges an external frontend (oqto) onto the SAME live session:
 *
 *   - Outbound: pi extension events are fanned out to every connected client.
 *   - Inbound: prompt/steer/follow_up/abort/get_state/get_messages/lease.
 *   - Input lease: the TUI owns input by default. Remote takeover needs an
 *     explicit TUI confirmation; TUI typing instantly reverts ownership.
 *
 * This is the bridge-era mechanism for dual frontends. pi 2 replaces it with
 * multiple presentation attachments per Session; keep this disposable behind
 * the oqto runner's PiTranslator.
 *
 * Security: the socket is NOT authentication. It shares the trust domain of
 * the pi process (same user); place it in a session-scoped directory.
 */

import os from "node:os";
import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type SessionActionResult = Promise<{ cancelled: boolean }>;

/**
 * Session replacement actions exist on ExtensionCommandContext only. The ctx
 * we hold may be an event context, so resolve the action by name at runtime
 * and return it bound, or undefined when this ctx cannot perform it.
 */
function sessionAction(
	ctx: ExtensionContext | null,
	name: "newSession" | "fork" | "switchSession"
): ((...args: unknown[]) => SessionActionResult) | undefined {
	if (!ctx) return undefined;
	const fn = (ctx as unknown as Record<string, unknown>)[name];
	if (typeof fn !== "function") return undefined;
	return (...args: unknown[]) => (fn as (...a: unknown[]) => SessionActionResult).apply(ctx, args);
}

/** Narrow a pi model object (or anything model-shaped) to the wire summary. */
function toModelSummary(m: unknown): ModelSummary {
	const r = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
	const str = (v: unknown) => (typeof v === "string" ? v : undefined);
	const num = (v: unknown) => (typeof v === "number" ? v : undefined);
	return {
		id: str(r.id) ?? "",
		provider: str(r.provider) ?? "",
		name: str(r.name),
		api: str(r.api),
		reasoning: typeof r.reasoning === "boolean" ? r.reasoning : undefined,
		contextWindow: num(r.contextWindow),
		maxTokens: num(r.maxTokens),
	};
}
import { type ModelSummary, type RpcDeps, dispatchCommand } from "./dispatch.js";
import { type Hub, createHub } from "./hub.js";
import { createLease } from "./lease.js";
import { COMMAND_TYPES, type ClientCommand, type LeaseOwner, eventFrame, responseFrame, validateCommand } from "./protocol.js";

const STATUS_KEY = "pi_tui_rpc";

function detectRpcMode(): boolean {
	const argv = process.argv.join(" ");
	return argv.includes("--mode rpc") || argv.includes("--mode=rpc");
}

function defaultSocketPath(): string {
	return path.join(os.tmpdir(), `pi-tui-rpc-${process.pid}.sock`);
}

interface SessionSnapshot {
	mode: "tui" | "rpc";
	cwd: string;
	sessionFile: string | null;
	sessionId: string | null;
	sessionName: string | null;
	model: ModelSummary | null;
	thinkingLevel: string | null;
	isStreaming: boolean;
	isCompacting: boolean;
	messageCount: number;
	lease: LeaseOwner;
}

export default function (pi: ExtensionAPI) {
	const socketPath = process.env.PI_TUI_RPC_SOCKET?.trim() || defaultSocketPath();
	const isRpcMode = detectRpcMode();

	let currentCtx: ExtensionContext | null = null;
	let hub: Hub | null = null;
	let bashAbort: AbortController | null = null;

	const updateTuiStatus = (): boolean => {
		const ctx = currentCtx;
		if (!ctx || isRpcMode || !ctx.hasUI) {
			return false;
		}
		try {
			ctx.ui.setStatus(STATUS_KEY, lease.owner() === "remote" ? "input: remote RPC client" : undefined);
			return true;
		} catch {
			// The TUI status layer may not be ready yet; lease frames still inform clients.
			return false;
		}
	};

	const lease = createLease({
		confirmTakeover: async () => {
			const ctx = currentCtx;
			if (!ctx || isRpcMode || !ctx.hasUI) {
				// No TUI to ask; the socket shares the process trust domain.
				return true;
			}
			// Same-user socket: the terminal already revokes the lease on any
			// interactive keystroke, so a takeover prompt only adds a round trip
			// through a window the user is not looking at. Auto-grant by default;
			// PI_TUI_RPC_LEASE_CONFIRM=1 restores the prompt for shared terminals.
			if (process.env.PI_TUI_RPC_LEASE_CONFIRM?.trim() !== "1") {
				return true;
			}
			return ctx.ui.confirm("Remote input request", "An RPC client requests input control. Allow?");
		},
		onChange: (owner, reason) => {
			hub?.broadcast({ type: "lease", owner, reason });
			updateTuiStatus();
		},
	});

	const snapshot = (): SessionSnapshot => {
		const ctx = currentCtx;
		if (!ctx) {
			return {
				mode: isRpcMode ? "rpc" : "tui",
				cwd: process.cwd(),
				sessionFile: null,
				sessionId: null,
				sessionName: pi.getSessionName() ?? null,
				model: null,
				thinkingLevel: null,
				isStreaming: false,
				isCompacting: false,
				messageCount: 0,
				lease: lease.owner(),
			};
		}
		return {
			mode: isRpcMode ? "rpc" : "tui",
			cwd: ctx.cwd,
			sessionFile: ctx.sessionManager.getSessionFile() ?? null,
			sessionId: ctx.sessionManager.getSessionId(),
			sessionName: pi.getSessionName() ?? null,
			// pi RPC shape: the full model object.
			model: ctx.model ? toModelSummary(ctx.model) : null,
			thinkingLevel: pi.getThinkingLevel(),
			isStreaming: !ctx.isIdle(),
			isCompacting: false,
			messageCount: ctx.sessionManager.getBranch().length,
			lease: lease.owner(),
		};
	};

	const deps = (): RpcDeps => {
		const ctx = currentCtx;
		return {
			isStreaming: () => (ctx ? !ctx.isIdle() : false),
			sendUserMessage: (message, options) => {
				if (options?.deliverAs) {
					return pi.sendUserMessage(message, { deliverAs: options.deliverAs });
				}
				return pi.sendUserMessage(message);
			},
			abort: () => {
				ctx?.abort();
			},
			getState: () => ({ ...snapshot() }),
			getMessages: () => (ctx ? ctx.sessionManager.getBranch() : []),
			getAvailableModels: () => {
				if (!ctx) return { models: [] };
				// Always the whole catalogue: an RPC client drives its own picker and
				// cannot widen a narrowed list, whereas it can rank or filter a wide
				// one. Session-scoped models come first so they stay prominent.
				const scoped = ((ctx as unknown as { scopedModels?: Array<{ model: unknown }> }).scopedModels ?? []).map((s) => s.model);
				const seen = new Set<string>();
				const models: ModelSummary[] = [];
				for (const m of [...scoped, ...ctx.modelRegistry.getAvailable()]) {
					const summary = toModelSummary(m);
					const key = `${summary.provider}/${summary.id}`;
					if (seen.has(key)) continue;
					seen.add(key);
					models.push(summary);
				}
				return { models };
			},
			setModel: async (provider, modelId) => {
				if (!ctx) return false;
				const model = ctx.modelRegistry.find(provider, modelId);
				if (!model) return false;
				return pi.setModel(model);
			},
			setThinkingLevel: (level) => {
				pi.setThinkingLevel(level as Parameters<typeof pi.setThinkingLevel>[0]);
			},
			currentModel: () => {
				const m = ctx?.model;
				return m ? { id: m.id, name: m.name, provider: m.provider, reasoning: m.reasoning } : undefined;
			},
			getThinkingLevel: () => pi.getThinkingLevel(),
			getAvailableThinkingLevels: () => {
				const model = ctx?.model;
				if (!model) return ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
				if (!model.reasoning) return ["off"];
				// Mirrors @earendil-works/pi-ai's getSupportedThinkingLevels.
				const base = ["off", "minimal", "low", "medium", "high"];
				const map = model.thinkingLevelMap as Record<string, string | null | undefined> | undefined;
				const extended = ["xhigh", "max"].filter((l) => map?.[l] !== undefined);
				const dropped = new Set(
					Object.entries(map ?? {})
						.filter(([, v]) => v === null)
						.map(([k]) => k)
				);
				return [...base.filter((l) => !dropped.has(l)), ...extended];
			},
			getEntries: (since) => {
				const sm = ctx?.sessionManager;
				if (!sm) return { entries: [], leafId: null };
				let entries = sm.getEntries();
				if (since !== undefined) {
					const index = entries.findIndex((e) => e.id === since);
					if (index === -1) throw new Error(`Entry not found: ${since}`);
					entries = entries.slice(index + 1);
				}
				return { entries, leafId: sm.getLeafId() };
			},
			getTree: () => {
				const sm = ctx?.sessionManager;
				return sm ? { tree: sm.getTree(), leafId: sm.getLeafId() } : { tree: [], leafId: null };
			},
			getForkMessages: () => {
				const sm = ctx?.sessionManager;
				if (!sm) return { messages: [] };
				const text = (content: unknown): string => {
					if (typeof content === "string") return content;
					if (Array.isArray(content)) {
						return content
							.filter((c) => (c as { type?: string }).type === "text")
							.map((c) => (c as { text?: string }).text ?? "")
							.join("");
					}
					return "";
				};
				const messages: Array<{ entryId: string; text: string }> = [];
				for (const entry of sm.getEntries()) {
					if (entry.type !== "message") continue;
					const message = (entry as { message?: { role?: string; content?: unknown } }).message;
					if (message?.role !== "user") continue;
					const value = text(message.content).trim();
					if (value) messages.push({ entryId: entry.id, text: value });
				}
				return { messages };
			},
			getLastAssistantText: () => {
				const sm = ctx?.sessionManager;
				if (!sm) return undefined;
				const entries = sm.getBranch();
				for (let i = entries.length - 1; i >= 0; i--) {
					const entry = entries[i] as { type?: string; message?: { role?: string; stopReason?: string; content?: unknown } };
					if (entry.type !== "message" || entry.message?.role !== "assistant") continue;
					if (entry.message.stopReason === "aborted" && !Array.isArray(entry.message.content)) continue;
					if (entry.message.stopReason === "aborted" && (entry.message.content as unknown[]).length === 0) continue;
					const text = (Array.isArray(entry.message.content) ? entry.message.content : [])
						.filter((c) => (c as { type?: string }).type === "text")
						.map((c) => (c as { text?: string }).text ?? "")
						.join("");
					const trimmed = text.trim();
					return trimmed || undefined;
				}
				return undefined;
			},
			getSessionStats: () => {
				const sm = ctx?.sessionManager;
				const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
				const add = (
					usage: { input: number; output: number; cacheRead: number; cacheWrite: number; cost?: { total?: number } } | undefined
				) => {
					if (!usage) return;
					totals.input += usage.input ?? 0;
					totals.output += usage.output ?? 0;
					totals.cacheRead += usage.cacheRead ?? 0;
					totals.cacheWrite += usage.cacheWrite ?? 0;
					totals.cost += usage.cost?.total ?? 0;
				};
				const counts = { userMessages: 0, assistantMessages: 0, toolCalls: 0, toolResults: 0, totalMessages: 0 };
				for (const entry of sm?.getEntries() ?? []) {
					const e = entry as {
						type?: string;
						usage?: never;
						message?: { role?: string; usage?: never; content?: Array<{ type?: string }> };
					};
					if ((e.type === "branch_summary" || e.type === "compaction") && e.usage) {
						add(e.usage);
					}
					if (e.type !== "message") continue;
					counts.totalMessages += 1;
					const message = e.message;
					if (message?.role === "user") counts.userMessages += 1;
					else if (message?.role === "toolResult") {
						counts.toolResults += 1;
						add(message.usage);
					} else if (message?.role === "assistant") {
						counts.assistantMessages += 1;
						counts.toolCalls += Array.isArray(message.content) ? message.content.filter((c) => c.type === "toolCall").length : 0;
						add(message.usage);
					}
				}
				const usage = ctx?.getContextUsage();
				return {
					...counts,
					tokens: {
						input: totals.input,
						output: totals.output,
						cacheRead: totals.cacheRead,
						cacheWrite: totals.cacheWrite,
					},
					cost: totals.cost,
					contextUsage: usage ? { tokens: usage.tokens, contextWindow: usage.contextWindow } : undefined,
				};
			},
			getCommands: () => ({ commands: pi.getCommands() }),
			// newSession/fork/switchSession live on ExtensionCommandContext; the
			// captured ctx may come from an event, so probe at runtime.
			newSession: async (parentSession) => {
				const fn = sessionAction(ctx, "newSession");
				if (!fn) return { cancelled: true };
				const result = await fn(parentSession ? { parentSession } : undefined);
				return { cancelled: result.cancelled };
			},
			switchSession: async (sessionPath) => {
				const fn = sessionAction(ctx, "switchSession");
				if (!fn) return { cancelled: true };
				const result = await fn(sessionPath);
				return { cancelled: result.cancelled };
			},
			fork: async (entryId) => {
				const fn = sessionAction(ctx, "fork");
				if (!fn) return { cancelled: true };
				const result = await fn(entryId);
				return { cancelled: result.cancelled };
			},
			setSessionName: (name) => {
				pi.setSessionName(name);
			},
			exportHtml: async (outputPath) => {
				if (!ctx) return undefined;
				try {
					const pkg = (await import("@earendil-works/pi-coding-agent")) as unknown as {
						exportSessionToHtml?: (sm: unknown, state: unknown, options?: { outputPath?: string }) => Promise<string | undefined>;
					};
					if (!pkg.exportSessionToHtml) return undefined;
					const path = await pkg.exportSessionToHtml(ctx.sessionManager, {}, outputPath ? { outputPath } : undefined);
					return typeof path === "string" ? path : undefined;
				} catch {
					return undefined;
				}
			},
			compact: (customInstructions) => {
				ctx?.compact(customInstructions ? { customInstructions } : undefined);
			},
			bash: async (command) => {
				if (!ctx) return { stdout: "", stderr: "no session", exitCode: null, cancelled: false };
				bashAbort = new AbortController();
				try {
					const result = await pi.exec("bash", ["-lc", command], {
						cwd: ctx.cwd,
						signal: bashAbort.signal,
					});
					const r = result as { stdout?: string; stderr?: string; exitCode?: number | null };
					return {
						stdout: r.stdout ?? "",
						stderr: r.stderr ?? "",
						exitCode: r.exitCode ?? null,
						cancelled: false,
					};
				} catch (error) {
					return {
						stdout: "",
						stderr: String(error),
						exitCode: null,
						cancelled: bashAbort.signal.aborted,
					};
				}
			},
			abortBash: () => {
				const controller = bashAbort;
				if (!controller) return false;
				controller.abort();
				return true;
			},
			leaseRequest: () => lease.requestRemote(),
			leaseRelease: () => {
				lease.release("client_release");
			},
			leaseOwner: () => lease.owner(),
		};
	};

	const handleCommand = (command: ClientCommand, reply: (frame: unknown) => void): void => {
		void dispatchCommand(command, deps())
			.then((result) => {
				reply(responseFrame(command.type, command.id, result));
			})
			.catch((error: unknown) => {
				reply(responseFrame(command.type, command.id, { success: false, error: String(error) }));
			});
	};

	const startHub = async (): Promise<void> => {
		if (hub) {
			return;
		}
		hub = createHub({
			socketPath,
			onConnect: (_clientId, reply) => {
				reply({ type: "hello", v: 1, pid: process.pid, lease: lease.owner(), commands: COMMAND_TYPES });
			},
			onLine: (_clientId, value, reply) => {
				const checked = validateCommand(value);
				if (!checked.ok) {
					reply(responseFrame("unknown", undefined, { success: false, error: checked.error }));
					return;
				}
				handleCommand(checked.command, reply);
			},
		});
		await hub.start();
	};

	const stopHub = async (): Promise<void> => {
		if (!hub) {
			return;
		}
		const current = hub;
		hub = null;
		await current.stop();
	};

	pi.on("session_start", async (event, ctx) => {
		currentCtx = ctx;
		lease.reset("session_reset");
		await startHub();
		hub?.broadcast(eventFrame("session_start", event));
		updateTuiStatus();
	});

	pi.on("session_shutdown", async (event) => {
		hub?.broadcast(eventFrame("session_shutdown", event));
		currentCtx = null;
		await stopHub();
	});

	pi.on("input", async (event, ctx) => {
		currentCtx = ctx;
		if (event.source === "interactive") {
			lease.onTuiInput();
		}
		hub?.broadcast(eventFrame("input", { text: event.text, source: event.source }));
		return undefined;
	});

	type ForwardableEvent =
		| "agent_start"
		| "agent_end"
		| "agent_settled"
		| "turn_start"
		| "turn_end"
		| "message_start"
		| "message_update"
		| "message_end"
		| "tool_execution_start"
		| "tool_execution_update"
		| "tool_execution_end"
		| "model_select"
		| "thinking_level_select"
		| "session_before_compact"
		| "session_compact"
		| "session_compact_failed";

	// pi.on is overloaded per event name; "agent_start" is the narrowest result
	// type of the forwarded set and every handler only returns undefined.
	const forward = (name: ForwardableEvent): void => {
		pi.on(name as "agent_start", async (event, ctx) => {
			currentCtx = ctx;
			hub?.broadcast(eventFrame(name, event));
			return undefined;
		});
	};

	forward("agent_start");
	forward("agent_end");
	// Not in the pinned 0.74 extension API; registered via the same cast so it
	// works at runtime on pi builds that emit it (0.85+).
	forward("agent_settled");
	forward("turn_start");
	forward("turn_end");
	forward("message_start");
	forward("message_update");
	forward("message_end");
	forward("tool_execution_start");
	forward("tool_execution_update");
	forward("tool_execution_end");
	forward("model_select");
	forward("thinking_level_select");
	forward("session_before_compact");
	forward("session_compact");
	forward("session_compact_failed");
}
