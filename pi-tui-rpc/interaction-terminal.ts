/**
 * Terminal rendering contract for the shared runtime interactions.
 *
 * oqt is a standalone terminal agent, not just a programmatic client, so every
 * user-facing operation must be renderable as plain text and answerable from a
 * terminal. These helpers turn canonical DTOs into terminal views and turn a
 * terminal choice back into the canonical request - the same dialect Oq and the
 * personal/managed runtime use. No ANSI, DOM or pi-tui dependency: a TUI or CLI
 * owns key handling and layout and only consumes these strings/choices.
 *
 * Semantics preserved here:
 * - deny/cancel are explicit; an expired prompt never auto-allows;
 * - a command palette only dispatches registered ids, with raw args preserved;
 * - queue actions use the snapshot cursor (CAS) and only supported actions;
 * - errors/notices are visible text, and receipts are acceptance, not completion.
 */

import type { RuntimeCommandCatalog } from "./protocol/runtime-interactions/v1/RuntimeCommandCatalog.js";
import type { RuntimeErrorSnapshot } from "./protocol/runtime-interactions/v1/RuntimeErrorSnapshot.js";
import type { RuntimeEvent } from "./protocol/runtime-interactions/v1/RuntimeEvent.js";
import type { RuntimeOperation } from "./protocol/runtime-interactions/v1/RuntimeOperation.js";
import type { RuntimePermissionDecision } from "./protocol/runtime-interactions/v1/RuntimePermissionDecision.js";
import type { RuntimePermissionOption } from "./protocol/runtime-interactions/v1/RuntimePermissionOption.js";
import type { RuntimePermissionPresentation } from "./protocol/runtime-interactions/v1/RuntimePermissionPresentation.js";
import type { RuntimeQueueAction } from "./protocol/runtime-interactions/v1/RuntimeQueueAction.js";
import type { RuntimeQueueSnapshot } from "./protocol/runtime-interactions/v1/RuntimeQueueSnapshot.js";
import type { RuntimeRequest } from "./protocol/runtime-interactions/v1/RuntimeRequest.js";
import type { RuntimeSourceStatusCode } from "./protocol/runtime-interactions/v1/RuntimeSourceStatusCode.js";

export interface TerminalLine {
	text: string;
	/** Selectable rows only; renderers draw them as choices, not plain text. */
	choiceId?: string;
	enabled?: boolean;
}

/** Filtering a catalog is presentation; ids and raw args are not rewritten. */
export interface TerminalCommandPalette {
	title: string;
	entries: Array<{ commandId: string; label: string; detail?: string; enabled: boolean }>;
}

const PALETTE_LIMIT = 200;

export function commandPalette(catalog: RuntimeCommandCatalog, query = ""): TerminalCommandPalette {
	const needle = query.trim().toLowerCase();
	const entries = catalog.commands
		.filter((command) => command.availability.state === "available")
		.filter((command) => {
			if (!needle) return true;
			const haystack = `${command.invocation} ${command.commandId} ${command.description ?? ""}`.toLowerCase();
			return haystack.includes(needle);
		})
		.slice(0, PALETTE_LIMIT)
		.map((command) => ({
			commandId: command.commandId,
			label: command.invocation,
			...(command.description ? { detail: command.description } : {}),
			enabled: true,
		}));
	return { title: "Commands", entries };
}

/**
 * Canonical dispatch request for a palette selection.
 *
 * `catalogGeneration` must be the generation the catalog was issued with; the
 * client does not mint one. Arguments are passed through verbatim.
 */
export function paletteDispatchRequest(
	catalog: RuntimeCommandCatalog,
	commandId: string,
	args: string,
	requestId: string
): RuntimeRequest {
	return {
		version: 1,
		requestId,
		operation: { op: "command_dispatch", catalogGeneration: catalog.generation, commandId, args },
	};
}

export interface TerminalPermissionPrompt {
	title: string;
	lines: TerminalLine[];
	choices: Array<{
		choiceId: string;
		label: string;
		decision: RuntimePermissionDecision;
		optionId: string | null;
		enabled: boolean;
	}>;
	expiresAtMs: number;
	expired: boolean;
	/** Remaining seconds for a countdown; 0 once expired. */
	secondsRemaining: number;
}

const OPTION_LABEL = (option: RuntimePermissionOption): string =>
	option.model ? `Allow once for ${option.model}` : `Allow once (${option.optionId})`;

/**
 * Render an issued permission request as a terminal prompt.
 *
 * Options are producer-issued; "deny" and "cancel" are always offered and no row
 * silently changes the subject model. Expiry is display only: the producer
 * decides, and an expired prompt yields a cancel, never an allow.
 */
export function permissionPrompt(presentation: RuntimePermissionPresentation, now: number): TerminalPermissionPrompt {
	const remaining = Math.max(0, Math.ceil((presentation.expiresAtMs - now) / 1000));
	const expired = presentation.expiresAtMs <= now;
	const lines: TerminalLine[] = [];
	const subject = presentation.subject;
	if (subject) {
		lines.push({ text: `kind: ${subject.kind}` });
		lines.push({ text: `model: ${subject.model}` });
		if (subject.loadout) lines.push({ text: `loadout: ${subject.loadout}` });
		lines.push({ text: `effect: ${subject.effectDigest.slice(0, 12)}…` });
	}
	lines.push({ text: expired ? "EXPIRED - cancel to close" : `expires in ${remaining}s` });
	const choices = presentation.options.map((option) => ({
		choiceId: `option:${option.optionId}`,
		label: OPTION_LABEL(option),
		decision: "allow_once" as const,
		optionId: option.optionId,
		enabled: !expired,
	}));
	choices.push({ choiceId: "deny", label: "Deny", decision: "deny", optionId: null, enabled: true });
	choices.push({ choiceId: "cancel", label: "Cancel (deny)", decision: "cancel", optionId: null, enabled: true });
	for (const choice of choices) lines.push({ text: choice.label, choiceId: choice.choiceId, enabled: choice.enabled });
	return {
		title: "Subagent permission",
		lines,
		choices,
		expiresAtMs: presentation.expiresAtMs,
		expired,
		secondsRemaining: remaining,
	};
}

/** Producer/attachment identity the terminal cannot invent; supplied by its host. */
export interface PermissionDecisionContext {
	producerGeneration: string | number;
	controllerId: string;
	controllerGeneration: string | number;
}

/** Canonical decide request for a terminal choice; expiry resolves to cancel. */
export function permissionDecisionRequest(
	presentation: RuntimePermissionPresentation,
	prompt: TerminalPermissionPrompt,
	context: PermissionDecisionContext,
	choiceId: string,
	requestId: string
): RuntimeRequest {
	if (prompt.expired) {
		return {
			version: 1,
			requestId,
			operation: {
				op: "permission_decide",
				producerGeneration: context.producerGeneration,
				handleId: presentation.handleId,
				requestRevision: presentation.requestRevision,
				controllerId: context.controllerId,
				controllerGeneration: context.controllerGeneration,
				decision: "cancel",
				optionId: null,
			},
		};
	}
	const choice = prompt.choices.find((row) => row.choiceId === choiceId && row.enabled);
	if (!choice) throw new Error("unknown or disabled terminal permission choice");
	return {
		version: 1,
		requestId,
		operation: {
			op: "permission_decide",
			producerGeneration: context.producerGeneration,
			handleId: presentation.handleId,
			requestRevision: presentation.requestRevision,
			controllerId: context.controllerId,
			controllerGeneration: context.controllerGeneration,
			decision: choice.decision,
			optionId: choice.optionId,
		},
	};
}

export interface TerminalQueueView {
	lines: TerminalLine[];
	items: Array<{ itemId: string | null; index: number; text: string; list: "steering" | "followUp" }>;
	supportedActions: string[];
}

export function queueView(snapshot: RuntimeQueueSnapshot): TerminalQueueView {
	const items = [
		...snapshot.steering.map((item, index) => ({ itemId: item.itemId, index, text: item.text, list: "steering" as const })),
		...snapshot.followUp.map((item, index) => ({ itemId: item.itemId, index, text: item.text, list: "followUp" as const })),
	];
	const lines: TerminalLine[] = [];
	if (items.length === 0) lines.push({ text: "Queue empty" });
	for (const item of items) {
		const id = item.itemId ?? "(no id)";
		lines.push({ text: `${item.list}: ${id} ${item.text}` });
	}
	lines.push({ text: `cursor: ${snapshot.cursor.generation}:${snapshot.cursor.revision}` });
	if (snapshot.supportedActions.length > 0) lines.push({ text: `actions: ${snapshot.supportedActions.join(", ")}` });
	return { lines, items, supportedActions: [...snapshot.supportedActions] };
}

/**
 * Canonical queue action request using the snapshot cursor (CAS).
 *
 * Only actions the engine listed are buildable; identity-free text actions and
 * item-id actions keep their own shapes. A rejected CAS is the server's answer.
 */
export function queueActionRequest(
	snapshot: RuntimeQueueSnapshot,
	action: RuntimeQueueAction,
	requestId: string
): RuntimeRequest {
	const kind = action.action;
	if (!snapshot.supportedActions.includes(kind)) throw new Error(`queue action ${kind} is not supported by this engine`);
	// Engine-supplied item ids are authoritative; nothing is derived from text.
	return { version: 1, requestId, operation: { op: "queue_apply", expected: snapshot.cursor, action } };
}

/** Can the terminal build this action from the current snapshot without inventing ids? */
export function queueActionAvailable(snapshot: RuntimeQueueSnapshot, kind: RuntimeQueueAction["action"]): boolean {
	if (!snapshot.supportedActions.includes(kind)) return false;
	if (kind === "steer" || kind === "follow_up" || kind === "clear") return true;
	return [...snapshot.steering, ...snapshot.followUp].some((item) => item.itemId !== null);
}

export interface TerminalErrorList {
	lines: TerminalLine[];
}

export function errorView(snapshot: RuntimeErrorSnapshot): TerminalErrorList {
	const lines: TerminalLine[] = [];
	if (snapshot.errors.length === 0) lines.push({ text: "No retained errors" });
	for (const error of snapshot.errors) {
		const uncertain = error.uncertain ? " [uncertain]" : "";
		const recovery = error.recoverable ? " (recoverable)" : "";
		lines.push({ text: `${error.source}/${error.code}${uncertain}${recovery}` });
		lines.push({ text: `  ${error.message}` });
		lines.push({ text: `  phase: ${error.phase} event: ${error.eventId}` });
	}
	lines.push({ text: `cursor: ${snapshot.cursor.generation}:${snapshot.cursor.revision}` });
	return { lines };
}

export interface TerminalNotice {
	severity: "info" | "warning" | "error";
	line: string;
}

/** Visible notice for a canonical event; receipts remain acceptance, not completion. */
export function eventNotice(event: RuntimeEvent): TerminalNotice {
	const payload = event.payload;
	switch (payload.kind) {
		case "queue": {
			const view = queueView(payload.snapshot);
			return { severity: "info", line: `queue: ${view.items.length} pending` };
		}
		case "permissions": {
			const active = payload.snapshot.active.length;
			return { severity: "info", line: `permissions: ${active} awaiting a decision` };
		}
		case "error":
			return {
				severity: "error",
				line: `${payload.error.source}/${payload.error.code}: ${payload.error.message}`,
			};
		case "command_outcome":
			return {
				severity: payload.state === "failed" ? "error" : "info",
				line: `command ${payload.operationId}: ${payload.state}${payload.errorId ? ` (error ${payload.errorId})` : ""}`,
			};
	}
}

export type TerminalStatus =
	| RuntimeSourceStatusCode
	| "binding_unavailable"
	| "authority_denied"
	| "engine_failure"
	| "invalid_request";

/** Human-readable refusal; never disguised as a successful result. */
export function statusNotice(code: TerminalStatus): TerminalNotice {
	switch (code) {
		case "not_negotiated":
			return { severity: "warning", line: "runtime interactions not negotiated for this attachment" };
		case "source_unavailable":
			return { severity: "warning", line: "native source continuity unavailable" };
		case "source_changed":
			return { severity: "warning", line: "native source changed; fresh attachment required" };
		case "binding_unavailable":
			return { severity: "error", line: "no authenticated binding for this operation" };
		case "authority_denied":
			return { severity: "error", line: "operation not permitted by current admission" };
		case "unsupported_operation":
			return { severity: "warning", line: "operation unsupported in this placement" };
		case "invalid_request":
			return { severity: "error", line: "invalid runtime request" };
		case "engine_failure":
			return { severity: "error", line: "runtime engine failure" };
	}
}

/** Every terminal answer is a canonical request the shared runtime can execute. */
export function isTerminalBuildable(
	operation: RuntimeOperation["op"]
): operation is "command_dispatch" | "permission_decide" | "queue_apply" {
	return operation === "command_dispatch" || operation === "permission_decide" || operation === "queue_apply";
}
