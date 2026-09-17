/**
 * pi-tui-rpc wire protocol (spike v0).
 *
 * Strict JSONL framing over a Unix socket: LF (`\n`) is the only record
 * delimiter. Clients may send CRLF; a single trailing `\r` is stripped.
 *
 * Client -> extension commands are validated here so the dispatcher and the
 * socket layer stay independent of pi.
 */

export type StreamingBehavior = "steer" | "followUp";

export type LeaseOwner = "tui" | "remote";

export type ClientCommand =
	| { id?: string; type: "prompt"; message: string; streamingBehavior?: StreamingBehavior }
	| { id?: string; type: "steer"; message: string }
	| { id?: string; type: "follow_up"; message: string }
	| { id?: string; type: "abort" }
	| { id?: string; type: "get_state" }
	| { id?: string; type: "get_messages" }
	| { id?: string; type: "get_available_models" }
	| { id?: string; type: "set_model"; provider: string; modelId: string }
	| { id?: string; type: "set_thinking_level"; level: string }
	| { id?: string; type: "lease"; action: "request" | "release" };

export type ResponseFrame = {
	type: "response";
	id?: string;
	command: string;
	success: boolean;
	data?: unknown;
	error?: string;
};

export type EventFrame = {
	type: "event";
	event: string;
	data: unknown;
	ts: number;
};

export type LeaseFrame = {
	type: "lease";
	owner: LeaseOwner;
	reason: string;
};

export type HelloFrame = {
	type: "hello";
	v: 0;
	pid: number;
	lease: LeaseOwner;
};

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string; empty: boolean };

export type CommandResult = { ok: true; command: ClientCommand } | { ok: false; error: string };

/** Parse one received line. Empty/whitespace-only lines report `empty: true`. */
export function safeParseLine(line: string): ParseResult {
	const trimmed = line.endsWith("\r") ? line.slice(0, -1) : line;
	if (trimmed.trim().length === 0) {
		return { ok: false, error: "empty line", empty: true };
	}
	try {
		return { ok: true, value: JSON.parse(trimmed) };
	} catch (error) {
		return { ok: false, error: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`, empty: false };
	}
}

function messageId(value: Record<string, unknown>): string | undefined {
	return typeof value.id === "string" ? value.id : undefined;
}

function messageText(value: Record<string, unknown>): string | undefined {
	return typeof value.message === "string" && value.message.length > 0 ? value.message : undefined;
}

/** Validate an already-parsed client payload into a typed command. */
export function validateCommand(value: unknown): CommandResult {
	if (typeof value !== "object" || value === null) {
		return { ok: false, error: "command must be a JSON object" };
	}
	const record = value as Record<string, unknown>;
	const id = messageId(record);
	switch (record.type) {
		case "prompt": {
			const message = messageText(record);
			if (message === undefined) {
				return { ok: false, error: "prompt requires a non-empty message string" };
			}
			let streamingBehavior: StreamingBehavior | undefined;
			if (record.streamingBehavior !== undefined) {
				if (record.streamingBehavior !== "steer" && record.streamingBehavior !== "followUp") {
					return { ok: false, error: 'streamingBehavior must be "steer" or "followUp"' };
				}
				streamingBehavior = record.streamingBehavior;
			}
			return { ok: true, command: { id, type: "prompt", message, streamingBehavior } };
		}
		case "steer":
		case "follow_up": {
			const message = messageText(record);
			if (message === undefined) {
				return { ok: false, error: `${record.type} requires a non-empty message string` };
			}
			return { ok: true, command: { id, type: record.type, message } };
		}
		case "abort":
		case "get_state":
		case "get_messages":
		case "get_available_models":
			return { ok: true, command: { id, type: record.type } };
		case "set_model": {
			if (typeof record.provider !== "string" || typeof record.modelId !== "string") {
				return { ok: false, error: "set_model requires provider and modelId strings" };
			}
			return { ok: true, command: { id, type: "set_model", provider: record.provider, modelId: record.modelId } };
		}
		case "set_thinking_level": {
			if (typeof record.level !== "string") {
				return { ok: false, error: "set_thinking_level requires a level string" };
			}
			return { ok: true, command: { id, type: "set_thinking_level", level: record.level } };
		}
		case "lease": {
			if (record.action !== "request" && record.action !== "release") {
				return { ok: false, error: 'lease.action must be "request" or "release"' };
			}
			return { ok: true, command: { id, type: "lease", action: record.action } };
		}
		default:
			return { ok: false, error: `unknown command type: ${String(record.type)}` };
	}
}

export function responseFrame(
	command: string,
	id: string | undefined,
	result: { success: boolean; data?: unknown; error?: string }
): ResponseFrame {
	if (result.success) {
		return { type: "response", id, command, success: true, data: result.data };
	}
	return { type: "response", id, command, success: false, error: result.error };
}

export function eventFrame(event: string, data: unknown, now: () => number = Date.now): EventFrame {
	return { type: "event", event, data, ts: now() };
}
