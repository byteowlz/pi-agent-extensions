/**
 * Runtime interaction engine ports.
 *
 * The shapes here are the vendored canonical DTOs from Core
 * (`pi-tui-rpc/protocol/runtime-interactions/v1`, pinned by SOURCE.json). This
 * module only declares the *engine ports* a host supplies and the small internal
 * capability/result envelope the bridge uses around them. It does not add wire
 * fields.
 *
 * Admission is not here: a response needs an authenticated `RuntimeBinding` from
 * the hosting adapter, and DTO presence alone never makes a family available.
 */

import type { RuntimeCommandCatalog } from "./protocol/runtime-interactions/v1/RuntimeCommandCatalog.js";
import type { RuntimeCommandReceipt } from "./protocol/runtime-interactions/v1/RuntimeCommandReceipt.js";
import type { RuntimeErrorSnapshot } from "./protocol/runtime-interactions/v1/RuntimeErrorSnapshot.js";
import type { RuntimeEvent } from "./protocol/runtime-interactions/v1/RuntimeEvent.js";
import type { RuntimeFamily } from "./protocol/runtime-interactions/v1/RuntimeFamily.js";
import type { RuntimeId } from "./protocol/runtime-interactions/v1/RuntimeId.js";
import type { RuntimeOperation } from "./protocol/runtime-interactions/v1/RuntimeOperation.js";
import type { RuntimePermissionDecision } from "./protocol/runtime-interactions/v1/RuntimePermissionDecision.js";
import type { RuntimePermissionPresentation } from "./protocol/runtime-interactions/v1/RuntimePermissionPresentation.js";
import type { RuntimePermissionReceipt } from "./protocol/runtime-interactions/v1/RuntimePermissionReceipt.js";
import type { RuntimePermissionSnapshot } from "./protocol/runtime-interactions/v1/RuntimePermissionSnapshot.js";
import type { RuntimeQueueSnapshot } from "./protocol/runtime-interactions/v1/RuntimeQueueSnapshot.js";
import type { RuntimeRejectCode } from "./protocol/runtime-interactions/v1/RuntimeRejectCode.js";
import type { RuntimeUnavailableReason } from "./protocol/runtime-interactions/v1/RuntimeUnavailableReason.js";

/** Operation families the shared contract covers (generated vocabulary). */
export type InteractionFamily = RuntimeFamily;

/** `command_dispatch` payload without its op tag; `catalogGeneration` may be numeric or string. */
export type DispatchOperation = Omit<Extract<RuntimeOperation, { op: "command_dispatch" }>, "op">;
/** `queue_apply` payload without its op tag. */
export type QueueApplyOperation = Omit<Extract<RuntimeOperation, { op: "queue_apply" }>, "op">;
/** `permission_decide` payload without its op tag. Issued handle/revision are comparisons. */
export type PermissionDecideOperation = Omit<Extract<RuntimeOperation, { op: "permission_decide" }>, "op">;

/** A presenter answer is canonical and explicit; the producer decides, this transports. */
export type PermissionAnswer = { decision: RuntimePermissionDecision; optionId: RuntimeId | null };

export interface CapabilityReport {
	family: RuntimeFamily;
	state: "available" | "unavailable";
	reason?: RuntimeUnavailableReason;
}

export type InteractionResult<T> =
	| { kind: "ok"; value: T }
	| { kind: "unavailable"; family: RuntimeFamily; reason: RuntimeUnavailableReason }
	| { kind: "rejected"; code: RuntimeRejectCode };

/** Engine port for registered-command catalog and explicit dispatch. */
export interface CommandEnginePort {
	catalog(): RuntimeCommandCatalog | Promise<RuntimeCommandCatalog>;
	dispatch(operation: DispatchOperation): RuntimeCommandReceipt | Promise<RuntimeCommandReceipt>;
}

/** Engine port for the authoritative steering/follow-up view and supported actions. */
export interface QueueEnginePort {
	snapshot(): RuntimeQueueSnapshot | Promise<RuntimeQueueSnapshot>;
	/** Optional: only a real engine may apply actions; absent means unsupported. */
	apply?(operation: QueueApplyOperation): RuntimeQueueSnapshot | Promise<RuntimeQueueSnapshot>;
}

/** Presenter port: transport only, never an authority or default allow. */
export interface PermissionPresenterPort {
	present(presentation: RuntimePermissionPresentation): PermissionAnswer | Promise<PermissionAnswer>;
}

/**
 * Authoritative permission producer port: the only place a decision can be made.
 *
 * One-shot consumption is the producer's obligation (validate + consume exactly
 * once, issue immutable receipts). A presenter answer, Selection record or
 * generic input is never this port and never grants anything.
 */
export interface PermissionRegistryPort {
	snapshot(): RuntimePermissionSnapshot | Promise<RuntimePermissionSnapshot>;
	decide(operation: PermissionDecideOperation): RuntimePermissionReceipt | Promise<RuntimePermissionReceipt>;
	/** Issued receipt lookup; null/undefined when no such receipt is retained. */
	receipt(
		operationId: RuntimeId
	): RuntimeCommandReceipt | RuntimePermissionReceipt | null | Promise<RuntimeCommandReceipt | RuntimePermissionReceipt | null>;
}

/** Canonical event source. Consumers must still gate delivery by their own admission. */
export interface InteractionEventPort {
	subscribe(listener: (event: RuntimeEvent) => void): () => void;
}

/** Retained error projection port. */
export interface ErrorSourcePort {
	snapshot(afterEventId: RuntimeId | null): RuntimeErrorSnapshot | Promise<RuntimeErrorSnapshot>;
}

export interface InteractionPorts {
	commands?: CommandEnginePort;
	queue?: QueueEnginePort;
	/** Transport only; never authority and never used for `permission_decide`. */
	permissions?: PermissionPresenterPort;
	/** Authoritative decision/receipt producer (personal or managed placement). */
	permissionRegistry?: PermissionRegistryPort;
	errors?: ErrorSourcePort;
	events?: InteractionEventPort;
}

/**
 * Default capability report before any engine/SDK seam exists.
 *
 * These are concrete unavailability results, not delivery. `permission_config`
 * has no owner-authorized write port in this bridge at all.
 */
export const PROVISIONAL_CAPABILITIES: CapabilityReport[] = [
	{ family: "commands", state: "unavailable", reason: "sdk_engine_absent" },
	{ family: "queue", state: "unavailable", reason: "sdk_engine_absent" },
	{ family: "permissions", state: "unavailable", reason: "port_not_configured" },
	{ family: "permission_config", state: "unavailable", reason: "unsupported_operation" },
	{ family: "errors", state: "unavailable", reason: "port_not_configured" },
];
