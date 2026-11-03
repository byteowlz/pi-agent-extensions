/**
 * Runtime interaction ports (provisional, non-normative).
 *
 * These are the extension-side *engine ports* and neutral result shapes that the
 * pi-tui-rpc interaction adapter consumes. They are NOT the canonical wire
 * contract: Core owns the versioned DTOs, generated schema/types and golden
 * fixtures in `oqto-protocol` (`runtime_interactions`). This module is scaffolding
 * so the bridge can be capability-gated and tested before those generated types
 * are vendored.
 *
 * Rules this file is built to keep:
 * - No private Pi SDK access. A real engine port is only supplied once the public
 *   SDK seam exists; until then the adapter reports an honest `unavailable`.
 * - No raw-prompt fallback. There is deliberately no `sendUserMessage`-like method
 *   in any port: a command that cannot be dispatched by a real engine is
 *   unavailable, never a model prompt.
 * - No wire field invention. Internal names below are provisional and must be
 *   replaced by generated DTO field names once Core publishes them.
 */

/** Interaction families the shared contract must eventually cover. */
export type InteractionCapability = "commands" | "queue" | "permissions" | "errors";

/**
 * Internal, non-normative capability states.
 *
 * `sdk_engine_absent`: the public SDK/engine operation does not exist yet.
 * `generated_dto_not_vendored`: canonical DTOs are not vendored in this repo yet.
 * `port_not_configured`: the host supplied no adapter for this family.
 * `engine_failure`: the supplied port threw or returned an unusable result.
 */
export type CapabilityState = "available" | "unavailable";

export type CapabilityReason = "sdk_engine_absent" | "generated_dto_not_vendored" | "port_not_configured" | "engine_failure";

export interface CapabilityReport {
	capability: InteractionCapability;
	state: CapabilityState;
	reason?: CapabilityReason;
	/** Human-facing note. Never a promise that the feature works. */
	note?: string;
}

/** Result envelope: `unavailable` is an intermediate capability result, not delivery. */
export type InteractionResult<T> =
	| { kind: "ok"; value: T }
	| { kind: "unavailable"; capability: InteractionCapability; reason: CapabilityReason }
	| { kind: "rejected"; capability: InteractionCapability; code: InteractionRejectCode; detail?: string };

export type InteractionRejectCode =
	| "invalid_request"
	| "engine_failure"
	| "unknown_command"
	| "catalog_generation_unavailable"
	| "unknown_request";

/**
 * Catalog entry as the bridge can honestly describe it today.
 *
 * Pi's `getCommands()` exposes name, optional description, source and sourceInfo
 * only: there is no argument schema and no catalog generation. The argument
 * contract is therefore explicitly a raw string (preserve, never infer), and a
 * real generation appears only when the SDK supplies one.
 */
export interface CatalogEntry {
	name: string;
	description?: string;
	source: "extension" | "prompt" | "skill";
	argumentContract: { kind: "raw_string" };
}

export interface EngineCatalog {
	entries: CatalogEntry[];
	/** Present only when the engine issues one. Never synthesized here. */
	generation?: string;
}

export interface CommandDispatchRequest {
	name: string;
	/** Passed through verbatim; the bridge does not parse or infer options. */
	args: string;
	/** Optional expected catalog generation; a mismatch is rejected, never ignored. */
	generation?: string;
}

/** Receipt vocabulary only. Acceptance is not completion; outcomes arrive as events. */
export type CommandDisposition = "rejected" | "handled" | "queued" | "started";

export interface CommandReceipt {
	name: string;
	disposition: CommandDisposition;
	/** Correlation only; the operation's later outcome is an event, not this field. */
	operationId?: string;
}

/** Queue entries: ids exist only when the owning engine supplies them. */
export interface QueueEntry {
	id?: string;
	text: string;
}

export interface QueueSnapshotView {
	steering: QueueEntry[];
	followUp: QueueEntry[];
	/** Engine continuity marker; absent when the engine cannot issue one. */
	continuity?: string;
}

export type ErrorSource = "command" | "permission" | "queue" | "engine" | "transport";

/** Safe, correlated error projection. No secrets, no invented assistant message. */
export interface InteractionErrorView {
	source: ErrorSource;
	code: string;
	message: string;
	operationId?: string;
	eventId?: string;
	phase?: string;
	recovery?: string;
	uncertain?: boolean;
}

/** A permission request as a presenter may see it: no policy, no authority. */
export interface PermissionPresentation {
	requestId: string;
	revision: number;
	/** Host clock at presentation; clients compare, never decide by it. */
	serverNow: number;
	expiresAt: number;
	options: Array<{ id: string; model?: string }>;
}

/** A presenter's answer. The producer decides; this is only transport. */
export interface PermissionAnswerView {
	decision: "allow" | "deny";
	optionId?: string;
	cancelled?: boolean;
}

/** Receipt projection carried to presenters: sanitized, no task/policy text. */
export interface PermissionReceiptView {
	handleId: string;
	requestId: string;
	kind: "decision" | "start_intent" | "result" | "cancelled" | "expired";
	outcome: string;
	reason: string;
	at: number;
}

/** Engine ports. Each is optional; the adapter reports what is missing. */
export interface CommandEnginePort {
	catalog(): Promise<EngineCatalog> | EngineCatalog;
	dispatch(request: CommandDispatchRequest): Promise<CommandReceipt> | CommandReceipt;
}

export interface QueueEnginePort {
	snapshot(): Promise<QueueSnapshotView> | QueueSnapshotView;
}

export interface PermissionPresenterPort {
	present(request: PermissionPresentation): Promise<PermissionAnswerView> | PermissionAnswerView;
}

export interface ErrorSourcePort {
	recent(): Promise<InteractionErrorView[]> | InteractionErrorView[];
}

export interface InteractionPorts {
	commands?: CommandEnginePort;
	queue?: QueueEnginePort;
	permissions?: PermissionPresenterPort;
	errors?: ErrorSourcePort;
}

/**
 * Capability defaults before any SDK seam exists.
 *
 * These are intermediate states, never a claim that the requested feature is
 * delivered. Do not replace them with text dispatch.
 */
export const PROVISIONAL_CAPABILITIES: CapabilityReport[] = [
	{
		capability: "commands",
		state: "unavailable",
		reason: "sdk_engine_absent",
		note: "No public Pi dispatch primitive; a literal /name prompt is not dispatch.",
	},
	{
		capability: "queue",
		state: "unavailable",
		reason: "sdk_engine_absent",
		note: "Pi emits queue_update, but no public extension queue snapshot port exists.",
	},
	{
		capability: "permissions",
		state: "unavailable",
		reason: "generated_dto_not_vendored",
		note: "Producer and presenter work locally; canonical DTOs are not vendored yet.",
	},
	{
		capability: "errors",
		state: "unavailable",
		reason: "port_not_configured",
		note: "No retained error source is wired into this adapter.",
	},
];
