/**
 * Native source-result framing, correlation and the read-only source tranche.
 *
 * The native source boundary carries only a native Session id and the source
 * runtime generation (continuity). It never carries a public binding, actor claim
 * or host grant, and a matching source frame is not host admission. The bridge
 * validates source context against its own actual native session and continuity
 * epoch before and after every await; a stale or absent source yields a typed
 * source status, never an invented identity.
 *
 * This module is deliberately read-only: capabilities, command catalog, queue
 * snapshot, error list and an unavailable receipt lookup. Every other operation
 * refuses with the canonical `unsupported_operation` status, regardless of any
 * lease.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { InteractionResult } from "../runtime-interactions/interaction-port.js";
import type { RuntimeOperation } from "../runtime-interactions/protocol/runtime-interactions/v1/RuntimeOperation.js";
import type { RuntimeResult } from "../runtime-interactions/protocol/runtime-interactions/v1/RuntimeResult.js";
import type { RuntimeSourceFrame } from "../runtime-interactions/protocol/runtime-interactions/v1/RuntimeSourceFrame.js";
import type { RuntimeSourceIdentity } from "../runtime-interactions/protocol/runtime-interactions/v1/RuntimeSourceIdentity.js";
import type { RuntimeSourceRequest } from "../runtime-interactions/protocol/runtime-interactions/v1/RuntimeSourceRequest.js";
import type { RuntimeSourceResponse } from "../runtime-interactions/protocol/runtime-interactions/v1/RuntimeSourceResponse.js";
import type { RuntimeSourceStatusCode } from "../runtime-interactions/protocol/runtime-interactions/v1/RuntimeSourceStatusCode.js";
import {
	MAX_RUNTIME_FRAME_BYTES,
	RUNTIME_INTERACTIONS_VERSION,
	validateSourceFrame,
	validateSourceResponse,
} from "../runtime-interactions/wire.js";
import type { InteractionAdapter } from "./interaction-adapter.js";

const CONTRACT_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"runtime-interactions",
	"protocol",
	"runtime-interactions",
	"v1"
);

interface TransportContract {
	version: number;
	sourceCapability: string;
	negotiate: { type: string; versions: number[] };
	negotiatedType: string;
	continuityField: string;
	sourceResultIsHostAdmission: boolean;
	hostBindingOnNativeWire: boolean;
	automaticReplay: boolean;
}

const TRANSPORT = JSON.parse(readFileSync(join(CONTRACT_DIR, "transport.json"), "utf8")) as TransportContract;

if (
	TRANSPORT.version !== RUNTIME_INTERACTIONS_VERSION ||
	TRANSPORT.sourceResultIsHostAdmission ||
	TRANSPORT.hostBindingOnNativeWire ||
	TRANSPORT.automaticReplay
)
	throw new Error("unsupported runtime-interaction transport contract");

/** Advertised separately from engine availability: support, not capability. */
export const RUNTIME_INTERACTIONS_SOURCE_CAPABILITY = TRANSPORT.sourceCapability;
export const RUNTIME_INTERACTIONS_CONTINUITY_FIELD = TRANSPORT.continuityField;

/** Only these operations are served in this source tranche. */
const READ_ONLY_OPS: RuntimeOperation["op"][] = [
	"capabilities",
	"command_catalog",
	"queue_snapshot",
	"error_list",
	"receipt_get",
];

export interface SourceDeps {
	adapter: InteractionAdapter;
	/** Actual bridge context only: native session + owning continuity. */
	currentSource(): RuntimeSourceIdentity | undefined;
	/** Existing interaction_negotiate v1 gate for this connection. */
	negotiated(): boolean;
}

export interface SourceParseResult {
	ok: true;
	frame: RuntimeSourceFrame;
	requestId: string | null;
	request?: RuntimeSourceRequest;
	response?: RuntimeSourceResponse;
}

export interface SourceParseFailure {
	ok: false;
	requestId: string | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestIdOf(value: unknown): string | null {
	if (!isObject(value)) return null;
	const direct = value.requestId;
	if (typeof direct === "string" && direct.length > 0 && direct.length <= 128) return direct;
	const request = value.request;
	if (
		isObject(request) &&
		typeof request.requestId === "string" &&
		request.requestId.length > 0 &&
		request.requestId.length <= 128
	)
		return request.requestId;
	return null;
}

/** Parse one source frame through the generated schema and the codec bound. */
export function parseSourceFrame(value: unknown): SourceParseResult | SourceParseFailure {
	const requestId = requestIdOf(value);
	if (!isObject(value) || typeof value.type !== "string") return { ok: false, requestId };
	if (!["interaction_source", "interaction_source_response", "interaction_source_status"].includes(value.type))
		return { ok: false, requestId };
	try {
		if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_RUNTIME_FRAME_BYTES) return { ok: false, requestId };
	} catch {
		return { ok: false, requestId };
	}
	if (!validateSourceFrame(value)) return { ok: false, requestId };
	const frame = value as unknown as RuntimeSourceFrame;
	if (frame.type === "interaction_source") return { ok: true, frame, requestId: frame.request.requestId, request: frame.request };
	if (frame.type === "interaction_source_response")
		return { ok: true, frame, requestId: frame.response.requestId, response: frame.response };
	return { ok: true, frame, requestId: frame.requestId };
}

/** Exact identity comparison; a numeric epoch never equals its string form. */
export function sameSourceIdentity(a: RuntimeSourceIdentity, b: RuntimeSourceIdentity): boolean {
	return (
		a.nativeSessionId === b.nativeSessionId &&
		typeof a.runtimeGeneration === typeof b.runtimeGeneration &&
		a.runtimeGeneration === b.runtimeGeneration
	);
}

/**
 * `RuntimeSourceResponse::matches_request` in TypeScript.
 *
 * Correlation only: a matching frame is not admission.
 */
export function matchesSourceRequest(response: RuntimeSourceResponse, request: RuntimeSourceRequest): boolean {
	if (response.version !== request.version) return false;
	if (response.requestId !== request.requestId) return false;
	if (!sameSourceIdentity(response.source, request.source)) return false;
	return resultMatchesOperation(response.result, request.operation);
}

function resultMatchesOperation(result: RuntimeResult, operation: RuntimeOperation): boolean {
	if (result.kind === "rejected") return true;
	if (result.kind === "unavailable") {
		switch (result.family) {
			case "commands":
				return operation.op === "command_catalog" || operation.op === "command_dispatch" || operation.op === "receipt_get";
			case "queue":
				return operation.op === "queue_snapshot" || operation.op === "queue_apply";
			case "permissions":
				return operation.op === "permission_snapshot" || operation.op === "permission_decide" || operation.op === "receipt_get";
			case "permission_config":
				return operation.op === "policy_read" || operation.op === "policy_apply";
			case "errors":
				return operation.op === "error_list";
		}
	}
	switch (operation.op) {
		case "capabilities":
			return result.kind === "capabilities";
		case "command_catalog":
			return result.kind === "catalog";
		case "permission_snapshot":
			return result.kind === "permissions";
		case "policy_read":
		case "policy_apply":
			return result.kind === "policy";
		case "queue_snapshot":
		case "queue_apply":
			return result.kind === "queue";
		case "error_list":
			return result.kind === "errors";
		case "command_dispatch":
			return result.kind === "command_receipt" && result.receipt.commandId === operation.commandId;
		case "permission_decide":
			return (
				result.kind === "permission_receipt" &&
				result.receipt.handleId === operation.handleId &&
				result.receipt.requestRevision === operation.requestRevision
			);
		case "receipt_get":
			return result.kind === "command_receipt" && result.receipt.operationId === operation.operationId;
		default:
			return false;
	}
}

function status(requestId: string | null, code: RuntimeSourceStatusCode): RuntimeSourceFrame {
	return { type: "interaction_source_status", requestId, code };
}

function fromAdapter<T>(result: InteractionResult<T>, wrap: (value: T) => RuntimeResult): RuntimeResult {
	if (result.kind === "ok") return wrap(result.value);
	if (result.kind === "rejected") return { kind: "rejected", code: result.code };
	return { kind: "unavailable", family: result.family, reason: result.reason };
}

async function resultFor(operation: RuntimeOperation, deps: SourceDeps): Promise<RuntimeResult> {
	switch (operation.op) {
		case "capabilities":
			return {
				kind: "capabilities",
				capabilities: deps.adapter
					.capabilities()
					.map((report) =>
						report.state === "available"
							? { state: "available" as const, family: report.family }
							: { state: "unavailable" as const, family: report.family, reason: report.reason ?? "port_not_configured" }
					),
			};
		case "command_catalog":
			return fromAdapter(await deps.adapter.catalog(), (catalog) => ({ kind: "catalog", catalog }));
		case "queue_snapshot":
			return fromAdapter(await deps.adapter.queueSnapshot(), (snapshot) => ({ kind: "queue", snapshot }));
		case "error_list":
			return fromAdapter(await deps.adapter.errorSnapshot(operation.afterEventId), (snapshot) => ({ kind: "errors", snapshot }));
		case "receipt_get":
			// Unavailable receipt lookup in this tranche: no producer registry port.
			return { kind: "unavailable", family: "permissions", reason: "port_not_configured" };
		default:
			return { kind: "unavailable", family: "permissions", reason: "unsupported_operation" };
	}
}

/**
 * Handle one inbound source frame.
 *
 * Negotiation is checked before and after the await; the source identity is
 * re-read from the bridge's actual context after the await, so a continuity
 * change or a lost negotiation cannot return a stale result.
 */
export async function handleSourceFrame(value: unknown, deps: SourceDeps): Promise<RuntimeSourceFrame> {
	const parsed = parseSourceFrame(value);
	if (!parsed.ok) return status(parsed.requestId, "invalid_request");
	if (!parsed.request) return status(parsed.requestId, "invalid_request");
	if (!deps.negotiated()) return status(parsed.requestId, "not_negotiated");

	const request = parsed.request;
	const before = deps.currentSource();
	if (!before) return status(request.requestId, "source_unavailable");
	if (!sameSourceIdentity(request.source, before)) return status(request.requestId, "source_changed");
	if (!READ_ONLY_OPS.includes(request.operation.op)) return status(request.requestId, "unsupported_operation");

	const result = await resultFor(request.operation, deps);

	if (!deps.negotiated()) return status(request.requestId, "not_negotiated");
	const after = deps.currentSource();
	if (!after) return status(request.requestId, "source_unavailable");
	if (!sameSourceIdentity(before, after) || !sameSourceIdentity(request.source, after))
		return status(request.requestId, "source_changed");

	const response: RuntimeSourceResponse = {
		version: RUNTIME_INTERACTIONS_VERSION,
		requestId: request.requestId,
		source: after,
		result,
	};
	if (!validateSourceResponse(response) || !matchesSourceRequest(response, request))
		return status(request.requestId, "source_unavailable");
	return { type: "interaction_source_response", response };
}
