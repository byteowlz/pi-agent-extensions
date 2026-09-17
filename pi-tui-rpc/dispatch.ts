/**
 * Command dispatcher for pi-tui-rpc.
 *
 * Pure logic against injected dependencies so it is testable without a pi
 * process. Lease enforcement happens here: prompt/steer/follow_up/abort are
 * input commands and require the remote lease; everything else is allowed
 * for any connected client.
 *
 * Response `data` shapes mirror pi's RPC mode. Commands the extension API
 * cannot back return `success: false` with an `unsupported:` error.
 */

import type { ClientCommand, LeaseOwner, StreamingBehavior } from "./protocol.js";

export interface ModelSummary {
	id: string;
	name?: string;
	provider: string;
	api?: string;
	reasoning?: boolean;
	contextWindow?: number;
	maxTokens?: number;
}

export interface RpcDeps {
	isStreaming(): boolean;
	sendUserMessage(message: string, options?: { deliverAs?: StreamingBehavior }): unknown | Promise<unknown>;
	abort(): void;
	getState(): Promise<Record<string, unknown>> | Record<string, unknown>;
	/** pi RPC shape: `{ messages: AgentMessage[] }` for the current branch. */
	getMessages(): Promise<unknown> | unknown;
	getEntries(since?: string): Promise<unknown> | unknown;
	getTree(): Promise<unknown> | unknown;
	getForkMessages(): Promise<unknown> | unknown;
	getLastAssistantText(): Promise<string | undefined> | string | undefined;
	getSessionStats(): Promise<unknown> | unknown;
	getCommands(): Promise<unknown> | unknown;
	/** Same shape as pi RPC `get_available_models`: `{ models: [...] }`. */
	getAvailableModels(): Promise<{ models: ModelSummary[] }> | { models: ModelSummary[] };
	currentModel(): ModelSummary | undefined;
	/** Resolve `provider/modelId` and switch; false when unknown or unauthenticated. */
	setModel(provider: string, modelId: string): Promise<boolean> | boolean;
	getThinkingLevel(): string;
	setThinkingLevel(level: string): void;
	getAvailableThinkingLevels(): string[];
	newSession(parentSession?: string): Promise<{ cancelled: boolean }> | { cancelled: boolean };
	switchSession(sessionPath: string): Promise<{ cancelled: boolean }> | { cancelled: boolean };
	fork(entryId: string): Promise<{ cancelled: boolean }> | { cancelled: boolean };
	setSessionName(name: string): void;
	exportHtml(outputPath?: string): Promise<string | undefined> | string | undefined;
	compact(customInstructions?: string): void;
	bash(command: string): Promise<{ stdout: string; stderr: string; exitCode: number | null; cancelled: boolean }>;
	abortBash(): boolean;
	leaseRequest(): Promise<{ granted: boolean; reason: string }>;
	leaseRelease(): void;
	leaseOwner(): LeaseOwner;
}

const INPUT_COMMANDS = new Set(["prompt", "steer", "follow_up", "abort"]);

export type DispatchResult = { success: boolean; data?: unknown; error?: string };

function unsupported(what: string): DispatchResult {
	return { success: false, error: `unsupported:${what}` };
}

export async function dispatchCommand(command: ClientCommand, deps: RpcDeps): Promise<DispatchResult> {
	if (INPUT_COMMANDS.has(command.type) && deps.leaseOwner() !== "remote") {
		return { success: false, error: "lease_denied:tui_owns_input" };
	}

	switch (command.type) {
		case "prompt":
			return dispatchPrompt(command.message, command.streamingBehavior, deps);
		case "steer":
			return dispatchSteer(command.message, deps);
		case "follow_up":
			return dispatchFollowUp(command.message, deps);
		case "abort":
			deps.abort();
			return { success: true, data: { aborted: true } };
		case "clear_queue":
			return unsupported("clear_queue: pi's extension API exposes no message queue access");

		case "new_session": {
			const result = await deps.newSession(command.parentSession);
			return { success: true, data: { cancelled: result.cancelled } };
		}
		case "switch_session": {
			const result = await deps.switchSession(command.sessionPath);
			return { success: true, data: { cancelled: result.cancelled } };
		}
		case "fork": {
			const result = await deps.fork(command.entryId);
			return { success: true, data: { cancelled: result.cancelled } };
		}
		case "set_session_name": {
			const name = command.name.trim();
			if (!name) return { success: false, error: "session name must not be empty" };
			deps.setSessionName(name);
			return { success: true, data: { name } };
		}
		case "export_html": {
			const path = await deps.exportHtml(command.outputPath);
			if (!path) return unsupported("export_html: pi's HTML exporter is not reachable from this extension");
			return { success: true, data: { path } };
		}

		case "get_state":
			return { success: true, data: await deps.getState() };
		case "get_messages":
			return { success: true, data: await deps.getMessages() };
		case "get_entries":
			return { success: true, data: await deps.getEntries(command.since) };
		case "get_tree":
			return { success: true, data: await deps.getTree() };
		case "get_fork_messages":
			return { success: true, data: await deps.getForkMessages() };
		case "get_last_assistant_text":
			return { success: true, data: { text: await deps.getLastAssistantText() } };
		case "get_session_stats":
			return { success: true, data: await deps.getSessionStats() };
		case "get_commands":
			return { success: true, data: await deps.getCommands() };

		case "get_available_models":
			return { success: true, data: await deps.getAvailableModels() };
		case "set_model": {
			const ok = await deps.setModel(command.provider, command.modelId);
			if (!ok) return { success: false, error: `unknown or unavailable model ${command.provider}/${command.modelId}` };
			return { success: true, data: { model: deps.currentModel() ?? { provider: command.provider, id: command.modelId } } };
		}
		case "cycle_model": {
			const { models } = await deps.getAvailableModels();
			if (models.length <= 1) return { success: true, data: null };
			const current = deps.currentModel();
			let index = current ? models.findIndex((m) => m.provider === current.provider && m.id === current.id) : -1;
			if (index === -1) index = 0;
			const next = models[(index + 1) % models.length];
			const ok = await deps.setModel(next.provider, next.id);
			if (!ok) return { success: false, error: `could not switch to ${next.provider}/${next.id}` };
			return { success: true, data: { model: deps.currentModel() ?? next, thinkingLevel: deps.getThinkingLevel() } };
		}
		case "set_thinking_level": {
			const levels = deps.getAvailableThinkingLevels();
			if (levels.length > 0 && !levels.includes(command.level)) {
				return { success: false, error: `thinking level must be one of ${levels.join(", ")}` };
			}
			deps.setThinkingLevel(command.level);
			return { success: true, data: { level: deps.getThinkingLevel() } };
		}
		case "cycle_thinking_level": {
			const levels = deps.getAvailableThinkingLevels();
			if (levels.length <= 1) return { success: true, data: null };
			const index = levels.indexOf(deps.getThinkingLevel());
			const next = levels[(index + 1) % levels.length];
			deps.setThinkingLevel(next);
			return { success: true, data: { level: deps.getThinkingLevel() } };
		}
		case "get_available_thinking_levels":
			return { success: true, data: { levels: deps.getAvailableThinkingLevels() } };

		case "set_steering_mode":
			return unsupported("set_steering_mode: queue modes are not exposed to extensions");
		case "set_follow_up_mode":
			return unsupported("set_follow_up_mode: queue modes are not exposed to extensions");
		case "set_auto_compaction":
			return unsupported("set_auto_compaction: settings are not exposed to extensions");
		case "set_auto_retry":
			return unsupported("set_auto_retry: settings are not exposed to extensions");
		case "abort_retry":
			return unsupported("abort_retry: retry state is not exposed to extensions (use abort)");
		case "compact":
			deps.compact(command.customInstructions);
			return { success: true, data: { started: true } };

		case "bash": {
			const result = await deps.bash(command.command);
			return { success: true, data: result };
		}
		case "abort_bash":
			return { success: true, data: { aborted: deps.abortBash() } };

		case "extension_ui_response":
			return unsupported("extension_ui_response: dialogs belong to the terminal when attached");

		case "lease": {
			if (command.action === "release") {
				deps.leaseRelease();
				return { success: true, data: { owner: deps.leaseOwner() } };
			}
			const request = await deps.leaseRequest();
			if (!request.granted) {
				return { success: false, error: `lease_denied:${request.reason}` };
			}
			return { success: true, data: { owner: deps.leaseOwner(), reason: request.reason } };
		}
	}
}

async function dispatchPrompt(
	message: string,
	streamingBehavior: StreamingBehavior | undefined,
	deps: RpcDeps
): Promise<DispatchResult> {
	if (deps.isStreaming()) {
		if (!streamingBehavior) {
			return { success: false, error: 'agent is streaming; provide streamingBehavior "steer" or "followUp"' };
		}
		await deps.sendUserMessage(message, { deliverAs: streamingBehavior });
		return { success: true, data: { delivered: streamingBehavior } };
	}
	if (streamingBehavior) {
		return { success: false, error: "agent is idle; streamingBehavior is not applicable" };
	}
	await deps.sendUserMessage(message);
	return { success: true, data: { delivered: "immediately" } };
}

async function dispatchSteer(message: string, deps: RpcDeps): Promise<DispatchResult> {
	if (!deps.isStreaming()) {
		return { success: false, error: "agent is idle; nothing to steer" };
	}
	await deps.sendUserMessage(message, { deliverAs: "steer" });
	return { success: true, data: { delivered: "steer" } };
}

async function dispatchFollowUp(message: string, deps: RpcDeps): Promise<DispatchResult> {
	if (!deps.isStreaming()) {
		return { success: false, error: "agent is idle; use prompt instead of follow_up" };
	}
	await deps.sendUserMessage(message, { deliverAs: "followUp" });
	return { success: true, data: { delivered: "followUp" } };
}
