/**
 * pi-tui-rpc wire protocol.
 *
 * Strict JSONL framing over a Unix socket: LF (`\n`) is the only record
 * delimiter. Clients may send CRLF; a single trailing `\r` is stripped.
 *
 * Command names, argument names and response shapes mirror pi's own RPC
 * mode (`docs/rpc.md`), so one client can drive a spawned `pi --mode rpc`
 * and an attached TUI pi with the same code. Commands pi's extension API
 * cannot back are still accepted and answered with an `unsupported:` error,
 * so callers get a deterministic reply instead of a parse failure.
 *
 * Client -> extension commands are validated here so the dispatcher and the
 * socket layer stay independent of pi.
 */

export type StreamingBehavior = "steer" | "followUp";

export type LeaseOwner = "tui" | "remote";

export type ClientCommand =
	// input (lease-gated)
	| { id?: string; type: "prompt"; message: string; streamingBehavior?: StreamingBehavior }
	| { id?: string; type: "steer"; message: string }
	| { id?: string; type: "follow_up"; message: string }
	| { id?: string; type: "abort" }
	| { id?: string; type: "clear_queue" }
	// session
	| { id?: string; type: "new_session"; parentSession?: string }
	| { id?: string; type: "switch_session"; sessionPath: string }
	| { id?: string; type: "fork"; entryId: string }
	| { id?: string; type: "set_session_name"; name: string }
	| { id?: string; type: "export_html"; outputPath?: string }
	// observation
	| { id?: string; type: "get_state" }
	| { id?: string; type: "get_messages" }
	| { id?: string; type: "get_entries"; since?: string }
	| { id?: string; type: "get_tree" }
	| { id?: string; type: "get_fork_messages" }
	| { id?: string; type: "get_last_assistant_text" }
	| { id?: string; type: "get_session_stats" }
	| { id?: string; type: "get_commands" }
	// models & thinking
	| { id?: string; type: "get_available_models" }
	| { id?: string; type: "set_model"; provider: string; modelId: string }
	| { id?: string; type: "cycle_model" }
	| { id?: string; type: "set_thinking_level"; level: string }
	| { id?: string; type: "cycle_thinking_level" }
	| { id?: string; type: "get_available_thinking_levels" }
	// queue / retry / compaction settings
	| { id?: string; type: "set_steering_mode"; mode: string }
	| { id?: string; type: "set_follow_up_mode"; mode: string }
	| { id?: string; type: "set_auto_compaction"; enabled: boolean }
	| { id?: string; type: "set_auto_retry"; enabled: boolean }
	| { id?: string; type: "abort_retry" }
	| { id?: string; type: "compact"; customInstructions?: string }
	// shell
	| { id?: string; type: "bash"; command: string; excludeFromContext?: boolean }
	| { id?: string; type: "abort_bash" }
	// dialogs (owned by the TUI when attached)
	| { id?: string; type: "extension_ui_response"; value?: string; confirmed?: boolean; cancelled?: boolean }
	// bridge-only
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
	v: 1;
	pid: number;
	lease: LeaseOwner;
	/** Every command type this hub answers (including `unsupported:` ones). */
	commands: string[];
};

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string; empty: boolean };

export type CommandResult = { ok: true; command: ClientCommand } | { ok: false; error: string };

/** Every command type this protocol accepts, in pi RPC order. */
export const COMMAND_TYPES: readonly string[] = [
	"prompt",
	"steer",
	"follow_up",
	"abort",
	"clear_queue",
	"new_session",
	"switch_session",
	"fork",
	"set_session_name",
	"export_html",
	"get_state",
	"get_messages",
	"get_entries",
	"get_tree",
	"get_fork_messages",
	"get_last_assistant_text",
	"get_session_stats",
	"get_commands",
	"get_available_models",
	"set_model",
	"cycle_model",
	"set_thinking_level",
	"cycle_thinking_level",
	"get_available_thinking_levels",
	"set_steering_mode",
	"set_follow_up_mode",
	"set_auto_compaction",
	"set_auto_retry",
	"abort_retry",
	"compact",
	"bash",
	"abort_bash",
	"extension_ui_response",
	"lease",
];

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

function requireString(value: Record<string, unknown>, key: string, type: string): string | { error: string } {
	const v = value[key];
	if (typeof v !== "string" || v.length === 0) {
		return { error: `${type} requires a non-empty ${key} string` };
	}
	return v;
}

function optionalString(value: Record<string, unknown>, key: string): string | undefined {
	return typeof value[key] === "string" ? (value[key] as string) : undefined;
}

/** Validate an already-parsed client payload into a typed command. */
export function validateCommand(value: unknown): CommandResult {
	if (typeof value !== "object" || value === null) {
		return { ok: false, error: "command must be a JSON object" };
	}
	const record = value as Record<string, unknown>;
	const id = messageId(record);
	const type = record.type;
	if (typeof type !== "string") {
		return { ok: false, error: "command requires a type string" };
	}
	switch (type) {
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
				return { ok: false, error: `${type} requires a non-empty message string` };
			}
			return { ok: true, command: { id, type, message } };
		}
		case "abort":
		case "clear_queue":
		case "get_state":
		case "get_messages":
		case "get_tree":
		case "get_fork_messages":
		case "get_last_assistant_text":
		case "get_session_stats":
		case "get_commands":
		case "get_available_models":
		case "cycle_model":
		case "cycle_thinking_level":
		case "get_available_thinking_levels":
		case "abort_retry":
		case "abort_bash":
			return { ok: true, command: { id, type } };
		case "new_session":
			return { ok: true, command: { id, type, parentSession: optionalString(record, "parentSession") } };
		case "switch_session": {
			const sessionPath = requireString(record, "sessionPath", type);
			if (typeof sessionPath !== "string") return { ok: false, error: sessionPath.error };
			return { ok: true, command: { id, type, sessionPath } };
		}
		case "fork": {
			const entryId = requireString(record, "entryId", type);
			if (typeof entryId !== "string") return { ok: false, error: entryId.error };
			return { ok: true, command: { id, type, entryId } };
		}
		case "set_session_name": {
			const name = requireString(record, "name", type);
			if (typeof name !== "string") return { ok: false, error: name.error };
			return { ok: true, command: { id, type, name } };
		}
		case "export_html":
			return { ok: true, command: { id, type, outputPath: optionalString(record, "outputPath") } };
		case "get_entries":
			return { ok: true, command: { id, type, since: optionalString(record, "since") } };
		case "set_model": {
			if (typeof record.provider !== "string" || typeof record.modelId !== "string") {
				return { ok: false, error: "set_model requires provider and modelId strings" };
			}
			return { ok: true, command: { id, type, provider: record.provider, modelId: record.modelId } };
		}
		case "set_thinking_level": {
			const level = requireString(record, "level", type);
			if (typeof level !== "string") return { ok: false, error: level.error };
			return { ok: true, command: { id, type, level } };
		}
		case "set_steering_mode":
		case "set_follow_up_mode": {
			const mode = requireString(record, "mode", type);
			if (typeof mode !== "string") return { ok: false, error: mode.error };
			return { ok: true, command: { id, type, mode } };
		}
		case "set_auto_compaction":
		case "set_auto_retry": {
			if (typeof record.enabled !== "boolean") {
				return { ok: false, error: `${type} requires an enabled boolean` };
			}
			return { ok: true, command: { id, type, enabled: record.enabled } };
		}
		case "compact":
			return { ok: true, command: { id, type, customInstructions: optionalString(record, "customInstructions") } };
		case "bash": {
			const command = requireString(record, "command", type);
			if (typeof command !== "string") return { ok: false, error: command.error };
			const excludeFromContext = typeof record.excludeFromContext === "boolean" ? record.excludeFromContext : undefined;
			return { ok: true, command: { id, type, command, excludeFromContext } };
		}
		case "extension_ui_response":
			return {
				ok: true,
				command: {
					id,
					type,
					value: optionalString(record, "value"),
					confirmed: typeof record.confirmed === "boolean" ? record.confirmed : undefined,
					cancelled: typeof record.cancelled === "boolean" ? record.cancelled : undefined,
				},
			};
		case "lease": {
			if (record.action !== "request" && record.action !== "release") {
				return { ok: false, error: 'lease.action must be "request" or "release"' };
			}
			return { ok: true, command: { id, type: "lease", action: record.action } };
		}
		default:
			return { ok: false, error: `unknown command type: ${type}` };
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
