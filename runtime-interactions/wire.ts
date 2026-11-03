/**
 * Version-negotiated envelope for the canonical runtime interaction DTOs.
 *
 * Only framing and negotiation live here: the request/response/event payloads are
 * the vendored generated types (pinned by SOURCE.json). No field is added, and an
 * unsupported version is never coerced to v1.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import AjvDefault, { type ValidateFunction } from "ajv";
import type { RuntimeEvent } from "./protocol/runtime-interactions/v1/RuntimeEvent.js";
import type { RuntimeOperation } from "./protocol/runtime-interactions/v1/RuntimeOperation.js";
import type { RuntimeRejectCode } from "./protocol/runtime-interactions/v1/RuntimeRejectCode.js";
import type { RuntimeRequest } from "./protocol/runtime-interactions/v1/RuntimeRequest.js";
import type { RuntimeResponse } from "./protocol/runtime-interactions/v1/RuntimeResponse.js";
import type { RuntimeVersion } from "./protocol/runtime-interactions/v1/RuntimeVersion.js";

/** The one supported wire version; hello advertises support, not feature delivery. */
export const RUNTIME_INTERACTIONS_VERSION: RuntimeVersion = 1;
export const RUNTIME_INTERACTIONS_CAPABILITY = "runtime_interactions_v1";

type AjvConstructor = new (options?: Record<string, unknown>) => { compile(schema: unknown): ValidateFunction };
// ajv v8 is CommonJS; the default export shape depends on the loader.
const Ajv = (AjvDefault as unknown as { default?: AjvConstructor }).default ?? (AjvDefault as unknown as AjvConstructor);

export type WireParse<T> = { ok: true; value: T } | { ok: false; code: RuntimeRejectCode };

export type InteractionRequestFrame = { type: "interaction"; request: RuntimeRequest };
export type InteractionResponseFrame = { type: "interaction_response"; response: RuntimeResponse };
export type InteractionEventFrame = { type: "interaction_event"; event: RuntimeEvent };
export type InteractionNegotiateFrame = { type: "interaction_negotiate"; versions: number[] };
export type InteractionNegotiatedFrame = { type: "interaction_negotiated"; version: RuntimeVersion | null };

export type InteractionStatusCode =
	| "binding_unavailable"
	| "authority_denied"
	| "not_negotiated"
	| "engine_failure"
	| "invalid_request";

/**
 * Transport-level status for a request that cannot produce a RuntimeResponse
 * (for example no authenticated RuntimeBinding). It is not a DTO and carries no
 * canonical result; requestId is correlation only.
 */
export type InteractionStatusFrame = {
	type: "interaction_status";
	ok: false;
	code: InteractionStatusCode;
	requestId?: string;
};

type OperationOp = RuntimeOperation["op"];

/** Read-only operations; mutating ones reuse the connection input lease (NOT host admission). */
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

/** Core runtime-frame bound; larger frames are rejected before schema validation. */
export const MAX_RUNTIME_FRAME_BYTES = 256 * 1024;

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), "protocol", "runtime-interactions", "v1");

export type CanonicalSchemaName =
	| "RuntimeCommandCatalog"
	| "RuntimeCommandReceipt"
	| "RuntimeQueueSnapshot"
	| "RuntimeErrorSnapshot"
	| "RuntimePermissionPresentation"
	| "RuntimePermissionSnapshot"
	| "RuntimePermissionReceipt"
	| "RuntimeBinding";

interface Schemas {
	request: ValidateFunction;
	response: ValidateFunction;
	event: ValidateFunction;
	sourceRequest: ValidateFunction;
	sourceResponse: ValidateFunction;
	sourceFrame: ValidateFunction;
	pieces: Record<CanonicalSchemaName, ValidateFunction>;
}

let schemas: Schemas | null = null;

function readSchema(name: string): Record<string, unknown> {
	return JSON.parse(readFileSync(join(SCHEMA_DIR, name), "utf8")) as Record<string, unknown>;
}

function pieceSchema(responseSchema: Record<string, unknown>, name: CanonicalSchemaName) {
	// Only definitions + the $ref: copying the response root would re-require its
	// properties (binding/result/version) on a standalone piece.
	return {
		$schema: responseSchema.$schema,
		$ref: `#/definitions/${name}`,
		definitions: responseSchema.definitions,
	};
}

/** Compiled once, from the vendored schemas; the generated schema is authoritative. */
function compiled(): Schemas {
	if (schemas) return schemas;
	const ajv = new Ajv({ allErrors: true, strict: false, logger: false });
	const requestSchema = readSchema("request.schema.json");
	const responseSchema = readSchema("response.schema.json");
	const eventSchema = readSchema("event.schema.json");
	const sourceRequestSchema = readSchema("source-request.schema.json");
	const sourceResponseSchema = readSchema("source-response.schema.json");
	const sourceFrameSchema = readSchema("source-frame.schema.json");
	const names: CanonicalSchemaName[] = [
		"RuntimeCommandCatalog",
		"RuntimeCommandReceipt",
		"RuntimeQueueSnapshot",
		"RuntimeErrorSnapshot",
		"RuntimePermissionPresentation",
		"RuntimePermissionSnapshot",
		"RuntimePermissionReceipt",
		"RuntimeBinding",
	];
	const pieces = {} as Record<CanonicalSchemaName, ValidateFunction>;
	for (const name of names) pieces[name] = ajv.compile(pieceSchema(responseSchema, name));
	schemas = {
		request: ajv.compile(requestSchema),
		response: ajv.compile(responseSchema),
		event: ajv.compile(eventSchema),
		sourceRequest: ajv.compile(sourceRequestSchema),
		sourceResponse: ajv.compile(sourceResponseSchema),
		sourceFrame: ajv.compile(sourceFrameSchema),
		pieces,
	};
	return schemas;
}

export function validateRuntimeRequest(value: unknown): boolean {
	return compiled().request(value) === true;
}
export function validateRuntimeResponse(value: unknown): boolean {
	return compiled().response(value) === true;
}
export function validateRuntimeEvent(value: unknown): boolean {
	return compiled().event(value) === true;
}
export function validateSourceRequest(value: unknown): boolean {
	return compiled().sourceRequest(value) === true;
}
export function validateSourceResponse(value: unknown): boolean {
	return compiled().sourceResponse(value) === true;
}
export function validateSourceFrame(value: unknown): boolean {
	return compiled().sourceFrame(value) === true;
}
/** Validate one canonical piece (port output) against the generated response schema. */
export function validateCanonicalPiece(name: CanonicalSchemaName, value: unknown): boolean {
	return compiled().pieces[name](value) === true;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function frameBytes(value: unknown): number {
	try {
		return Buffer.byteLength(JSON.stringify(value), "utf8");
	} catch {
		return Number.POSITIVE_INFINITY;
	}
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

/**
 * Parse a client line into a canonical request.
 *
 * Schema validation is the generated Core schema, not a handwritten subset: it is
 * what rejects forged bindings, answer fields disguised as decisions, and policy
 * writes smuggled into an answer.
 */
export function parseInteractionRequestFrame(value: unknown): WireParse<RuntimeRequest> {
	if (!isObject(value) || !("type" in value) || value.type !== "interaction") return { ok: false, code: "invalid_request" };
	if (!("request" in value) || !isObject(value.request)) return { ok: false, code: "invalid_request" };
	if (frameBytes(value) > MAX_RUNTIME_FRAME_BYTES) return { ok: false, code: "invalid_request" };
	if (!validateRuntimeRequest(value.request)) return { ok: false, code: "invalid_request" };
	return { ok: true, value: value.request as unknown as RuntimeRequest };
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

export function statusFrame(code: InteractionStatusCode, requestId?: string): InteractionStatusFrame {
	return { type: "interaction_status", ok: false, code, ...(requestId ? { requestId } : {}) };
}
