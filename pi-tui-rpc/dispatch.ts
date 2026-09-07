/**
 * Command dispatcher for pi-tui-rpc.
 *
 * Pure logic against injected dependencies so it is testable without a pi
 * process. Lease enforcement happens here: prompt/steer/follow_up/abort are
 * input commands and require the remote lease; get_state/get_messages are
 * observation-only and always allowed.
 */

import type { ClientCommand, LeaseOwner, StreamingBehavior } from "./protocol.js";

export interface RpcDeps {
	isStreaming(): boolean;
	sendUserMessage(message: string, options?: { deliverAs?: StreamingBehavior }): unknown | Promise<unknown>;
	abort(): void;
	getState(): Promise<Record<string, unknown>> | Record<string, unknown>;
	getMessages(): Promise<unknown> | unknown;
	leaseRequest(): Promise<{ granted: boolean; reason: string }>;
	leaseRelease(): void;
	leaseOwner(): LeaseOwner;
}

const INPUT_COMMANDS = new Set(["prompt", "steer", "follow_up", "abort"]);

export type DispatchResult = { success: boolean; data?: unknown; error?: string };

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
		case "get_state":
			return { success: true, data: await deps.getState() };
		case "get_messages":
			return { success: true, data: await deps.getMessages() };
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
