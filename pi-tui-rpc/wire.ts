/**
 * Version-negotiated envelope for the canonical runtime interaction DTOs.
 *
 * Only framing and negotiation live here: the request/response/event payloads are
 * the vendored generated types (pinned by SOURCE.json). No field is added, and an
 * unsupported version is never coerced to v1.
 */

import type { RuntimeEvent } from "./protocol/runtime-interactions/v1/RuntimeEvent.js";
import type { RuntimeOperation } from "./protocol/runtime-interactions/v1/RuntimeOperation.js";
import type { RuntimeRejectCode } from "./protocol/runtime-interactions/v1/RuntimeRejectCode.js";
import type { RuntimeRequest } from "./protocol/runtime-interactions/v1/RuntimeRequest.js";
import type { RuntimeResponse } from "./protocol/runtime-interactions/v1/RuntimeResponse.js";
import type { RuntimeVersion } from "./protocol/runtime-interactions/v1/RuntimeVersion.js";

/** The one supported wire version; hello advertises support, not feature delivery. */
export const RUNTIME_INTERACTIONS_VERSION: RuntimeVersion = 1;
export const RUNTIME_INTERACTIONS_CAPABILITY = "runtime_interactions_v1";

type OperationOp = RuntimeOperation["op"];

/** Read-only operations; mutating ones reuse the existing lease admission. */
const OBSERVATION_OPS: OperationOp[] = [
	"capabilities",
	"command_catalog",
	"permission_snapshot",
	"policy_read",
	"queue_snapshot",
	"error_list",
	"receipt_get",
];
const MUTATING_OPS: OperationOp[] = ["command_dispatch", "permission_decide", "policy_apply", "queue_apply"];

const ALL_OPS: OperationOp[] = [...OBSERVATION_OPS, ...MUTATING_OPS];
const OP_SET = new Set<string>(ALL_OPS);
const ID_BOUND = 256;

export type InteractionRequestFrame = { type: "interaction"; request: RuntimeRequest };
export type InteractionResponseFrame = { type: "interaction_response"; response: RuntimeResponse };
export type InteractionEventFrame = { type: "interaction_event"; event: RuntimeEvent };
export type InteractionNegotiateFrame = { type: "interaction_negotiate"; versions: number[] };
export type InteractionNegotiatedFrame = { type: "interaction_negotiated"; version: RuntimeVersion | null };
/**
 * Transport-level status for a request that cannot produce a RuntimeResponse
 * (for example no authenticated RuntimeBinding). It is not a DTO and carries no
 * canonical result.
 */
export type InteractionStatusFrame = {
	type: "interaction_status";
	ok: false;
	code: "binding_unavailable" | "authority_denied";
};

export type WireParse<T> = { ok: true; value: T } | { ok: false; code: RuntimeRejectCode };

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= ID_BOUND;
}

function isGeneration(value: unknown): boolean {
	return isId(value) || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

function isRevision(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Accept only exactly v1; anything else is unsupported, never downgraded. */
export function negotiateVersion(offered: unknown): RuntimeVersion | null {
	if (!Array.isArray(offered)) return null;
	return offered.includes(RUNTIME_INTERACTIONS_VERSION) ? RUNTIME_INTERACTIONS_VERSION : null;
}

export function isObservationOperation(op: OperationOp): boolean {
	return OBSERVATION_OPS.includes(op);
}

export function isMutatingOperation(op: OperationOp): boolean {
	return MUTATING_OPS.includes(op);
}

/** Shallow envelope validation; deep shape authority stays with the generated schema. */
function validateOperation(operation: Record<string, unknown>): RuntimeRejectCode | null {
	if (typeof operation.op !== "string" || !OP_SET.has(operation.op)) return "invalid_request";
	switch (operation.op) {
		case "command_dispatch":
			if (!isId(operation.commandId) || typeof operation.args !== "string" || !isGeneration(operation.catalogGeneration))
				return "invalid_request";
			return null;
		case "permission_decide":
			if (
				!isId(operation.handleId) ||
				!isGeneration(operation.producerGeneration) ||
				!isRevision(operation.requestRevision) ||
				!isId(operation.controllerId) ||
				!isGeneration(operation.controllerGeneration)
			)
				return "invalid_request";
			if (operation.decision !== "allow_once" && operation.decision !== "deny" && operation.decision !== "cancel")
				return "invalid_request";
			if (operation.optionId !== null && !isId(operation.optionId)) return "invalid_request";
			return null;
		case "queue_apply":
			if (!isObject(operation.expected) || !isObject(operation.action)) return "invalid_request";
			return null;
		case "policy_apply":
			if (!isObject(operation.expected) || !Array.isArray(operation.changes)) return "invalid_request";
			return null;
		case "error_list":
			if (operation.afterEventId !== null && !isId(operation.afterEventId)) return "invalid_request";
			return null;
		case "receipt_get":
			if (!isId(operation.operationId)) return "invalid_request";
			return null;
		default:
			return null;
	}
}

/** Parse a client line into a canonical request; framing only. */
export function parseInteractionRequestFrame(value: unknown): WireParse<RuntimeRequest> {
	if (!isObject(value) || value.type !== "interaction") return { ok: false, code: "invalid_request" };
	const request = value.request;
	if (!isObject(request)) return { ok: false, code: "invalid_request" };
	if (request.version !== RUNTIME_INTERACTIONS_VERSION) return { ok: false, code: "invalid_request" };
	if (!isId(request.requestId)) return { ok: false, code: "invalid_request" };
	if (!isObject(request.operation)) return { ok: false, code: "invalid_request" };
	const operationError = validateOperation(request.operation);
	if (operationError) return { ok: false, code: operationError };
	return { ok: true, value: request as unknown as RuntimeRequest };
}

export function parseNegotiationFrame(value: unknown): WireParse<RuntimeVersion | null> {
	if (!isObject(value) || value.type !== "interaction_negotiate") return { ok: false, code: "invalid_request" };
	if (!Array.isArray(value.versions) || value.versions.length > 8) return { ok: false, code: "invalid_request" };
	if (!value.versions.every((version) => typeof version === "number" && Number.isSafeInteger(version)))
		return { ok: false, code: "invalid_request" };
	return { ok: true, value: negotiateVersion(value.versions) };
}

export function requestFrame(request: RuntimeRequest): InteractionRequestFrame {
	return { type: "interaction", request };
}

export function responseFrame(response: RuntimeResponse): InteractionResponseFrame {
	return { type: "interaction_response", response };
}

export function eventFrame(event: RuntimeEvent): InteractionEventFrame {
	return { type: "interaction_event", event };
}

export function negotiatedFrame(version: RuntimeVersion | null): InteractionNegotiatedFrame {
	return { type: "interaction_negotiated", version };
}

export function statusFrame(code: InteractionStatusFrame["code"]): InteractionStatusFrame {
	return { type: "interaction_status", ok: false, code };
}
