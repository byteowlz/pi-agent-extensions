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
import { type RpcDeps, dispatchCommand } from "./dispatch.js";
import { type Hub, createHub } from "./hub.js";
import { createLease } from "./lease.js";
import { type ClientCommand, type LeaseOwner, eventFrame, responseFrame, validateCommand } from "./protocol.js";

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
	model: string | null;
	thinkingLevel: string | null;
	isStreaming: boolean;
	lease: LeaseOwner;
}

export default function (pi: ExtensionAPI) {
	const socketPath = process.env.PI_TUI_RPC_SOCKET?.trim() || defaultSocketPath();
	const isRpcMode = detectRpcMode();

	let currentCtx: ExtensionContext | null = null;
	let hub: Hub | null = null;

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
				lease: lease.owner(),
			};
		}
		const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : null;
		return {
			mode: isRpcMode ? "rpc" : "tui",
			cwd: ctx.cwd,
			sessionFile: ctx.sessionManager.getSessionFile() ?? null,
			sessionId: ctx.sessionManager.getSessionId(),
			sessionName: pi.getSessionName() ?? null,
			model,
			thinkingLevel: pi.getThinkingLevel(),
			isStreaming: !ctx.isIdle(),
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
				reply({ type: "hello", v: 0, pid: process.pid, lease: lease.owner() });
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
