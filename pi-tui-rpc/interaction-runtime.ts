/**
 * Placement-neutral runtime interaction contract.
 *
 * One typed dispatcher for both placements:
 * - personal: a device reaches its personal runner, which reaches Pi through the
 *   pi-tui-rpc bridge;
 * - managed: a server-side runner producer satisfies the same ports directly.
 *
 * This module knows nothing about sockets, hubs, pi or leases. It consumes the
 * canonical generated DTOs through `InteractionPorts` and an `InteractionAdmission`
 * supplied by the host, so Oq/oqt/CLI surfaces can speak one dialect. Admission
 * is explicit: absent binding denies, mutating operations require the host's
 * permission, and a binding/permission is re-read after every await.
 */

import { type CoverageOptions, type InteractionPlacement, type RowCoverage, coverageFor } from "./interaction-coverage.js";
import type { InteractionPorts } from "./interaction-port.js";
import type { RuntimeBinding } from "./protocol/runtime-interactions/v1/RuntimeBinding.js";
import type { RuntimeCapability } from "./protocol/runtime-interactions/v1/RuntimeCapability.js";
import type { RuntimeCommandReceipt } from "./protocol/runtime-interactions/v1/RuntimeCommandReceipt.js";
import type { RuntimeEvent } from "./protocol/runtime-interactions/v1/RuntimeEvent.js";
import type { RuntimeOperation } from "./protocol/runtime-interactions/v1/RuntimeOperation.js";
import type { RuntimePermissionReceipt } from "./protocol/runtime-interactions/v1/RuntimePermissionReceipt.js";
import type { RuntimeRejectCode } from "./protocol/runtime-interactions/v1/RuntimeRejectCode.js";
import type { RuntimeRequest } from "./protocol/runtime-interactions/v1/RuntimeRequest.js";
import type { RuntimeResponse } from "./protocol/runtime-interactions/v1/RuntimeResponse.js";
import type { RuntimeResult } from "./protocol/runtime-interactions/v1/RuntimeResult.js";
import { isMutatingOperation, validateCanonicalPiece, validateRuntimeResponse } from "./wire.js";

/** Host-supplied admission. Never derived from request/response payload fields. */
export interface InteractionAdmission {
	/** Current authenticated binding (public session, native session, controller). */
	binding(): RuntimeBinding | undefined;
	/** May this host perform this operation now? Mutating ops must say yes explicitly. */
	permitted(operation: RuntimeOperation["op"]): boolean;
}

export type InteractionExecuteOutcome =
	| { ok: true; response: RuntimeResponse }
	| { ok: false; code: "binding_unavailable" | "authority_denied" | "engine_failure" };

export interface InteractionRuntime {
	execute(request: RuntimeRequest): Promise<InteractionExecuteOutcome>;
	/** Derived from supplied ports only; DTO presence never advertises availability. */
	capabilities(): RuntimeCapability[];
	/** Canonical events from the supplied port; delivery gating stays with the caller. */
	subscribe(listener: (event: RuntimeEvent) => void): () => void;
	/** The ten mandatory placement rows, derived from the supplied ports. */
	coverage(placement: InteractionPlacement, options?: CoverageOptions): RowCoverage[];
}

function validBinding(binding: RuntimeBinding | undefined): binding is RuntimeBinding {
	if (!binding) return false;
	const id = (value: unknown) => typeof value === "string" && value.length > 0;
	const generation = (value: unknown) => id(value) || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
	return (
		id(binding.publicSessionId) &&
		id(binding.nativeSessionId) &&
		generation(binding.runtimeGeneration) &&
		(binding.controllerId === null || id(binding.controllerId)) &&
		(binding.controllerGeneration === null || generation(binding.controllerGeneration))
	);
}

function sameBinding(a: RuntimeBinding, b: RuntimeBinding): boolean {
	return (
		a.publicSessionId === b.publicSessionId &&
		a.nativeSessionId === b.nativeSessionId &&
		a.runtimeGeneration === b.runtimeGeneration &&
		a.controllerId === b.controllerId &&
		a.controllerGeneration === b.controllerGeneration
	);
}

function rejected(code: RuntimeRejectCode): RuntimeResult {
	return { kind: "rejected", code };
}

function unavailable(
	family: Extract<RuntimeResult, { kind: "unavailable" }>["family"],
	reason: Extract<RuntimeResult, { kind: "unavailable" }>["reason"]
): RuntimeResult {
	return { kind: "unavailable", family, reason };
}

export function createInteractionRuntime(ports: InteractionPorts, admission: InteractionAdmission): InteractionRuntime {
	const capabilities = (): RuntimeCapability[] => [
		ports.commands
			? { state: "available", family: "commands" }
			: { state: "unavailable", family: "commands", reason: "sdk_engine_absent" },
		ports.queue
			? { state: "available", family: "queue" }
			: { state: "unavailable", family: "queue", reason: "sdk_engine_absent" },
		ports.permissionRegistry
			? { state: "available", family: "permissions" }
			: { state: "unavailable", family: "permissions", reason: "port_not_configured" },
		// Owner-write policy is a different authority, not a client operation.
		{ state: "unavailable", family: "permission_config", reason: "unsupported_operation" },
		ports.errors
			? { state: "available", family: "errors" }
			: { state: "unavailable", family: "errors", reason: "port_not_configured" },
	];

	async function resultFor(operation: RuntimeOperation): Promise<RuntimeResult> {
		switch (operation.op) {
			case "capabilities":
				return { kind: "capabilities", capabilities: capabilities() };
			case "command_catalog": {
				if (!ports.commands) return unavailable("commands", "sdk_engine_absent");
				const catalog = await ports.commands.catalog();
				if (!validatePiece("catalog", catalog)) return rejected("engine_failure");
				return { kind: "catalog", catalog };
			}
			case "command_dispatch": {
				if (!ports.commands) return unavailable("commands", "sdk_engine_absent");
				const receipt = await ports.commands.dispatch({
					catalogGeneration: operation.catalogGeneration,
					commandId: operation.commandId,
					args: operation.args,
				});
				if (!validatePiece("command_receipt", receipt)) return rejected("engine_failure");
				return { kind: "command_receipt", receipt };
			}
			case "permission_snapshot": {
				if (!ports.permissionRegistry) return unavailable("permissions", "port_not_configured");
				const snapshot = await ports.permissionRegistry.snapshot();
				if (!validatePiece("permissions", snapshot)) return rejected("engine_failure");
				return { kind: "permissions", snapshot };
			}
			case "permission_decide": {
				if (!ports.permissionRegistry) return unavailable("permissions", "port_not_configured");
				const receipt = await ports.permissionRegistry.decide(operation);
				if (!validatePiece("permission_receipt", receipt)) return rejected("engine_failure");
				return { kind: "permission_receipt", receipt };
			}
			case "policy_read":
			case "policy_apply":
				return unavailable("permission_config", "unsupported_operation");
			case "queue_snapshot": {
				if (!ports.queue) return unavailable("queue", "sdk_engine_absent");
				const snapshot = await ports.queue.snapshot();
				if (!validatePiece("queue", snapshot)) return rejected("engine_failure");
				return { kind: "queue", snapshot };
			}
			case "queue_apply": {
				if (!ports.queue?.apply) return unavailable("queue", "sdk_engine_absent");
				const snapshot = await ports.queue.apply(operation);
				if (!validatePiece("queue", snapshot)) return rejected("engine_failure");
				return { kind: "queue", snapshot };
			}
			case "error_list": {
				if (!ports.errors) return unavailable("errors", "port_not_configured");
				const snapshot = await ports.errors.snapshot(operation.afterEventId);
				if (!validatePiece("errors", snapshot)) return rejected("engine_failure");
				return { kind: "errors", snapshot };
			}
			case "receipt_get": {
				if (!ports.permissionRegistry) return unavailable("permissions", "port_not_configured");
				const receipt = await ports.permissionRegistry.receipt(operation.operationId);
				if (!receipt) return unavailable("permissions", "port_not_configured");
				const kind = "operationId" in receipt ? "command_receipt" : "permission_receipt";
				if (!validatePiece(kind, receipt)) return rejected("engine_failure");
				return { kind, receipt } as RuntimeResult;
			}
		}
	}

	return {
		capabilities,
		coverage(placement, options) {
			return coverageFor(placement, ports, options);
		},
		subscribe(listener) {
			return ports.events?.subscribe(listener) ?? (() => {});
		},
		async execute(request) {
			const before = admission.binding();
			if (!validBinding(before)) return { ok: false, code: "binding_unavailable" };
			const mutating = isMutatingOperation(request.operation.op);
			if (mutating && !admission.permitted(request.operation.op)) return { ok: false, code: "authority_denied" };

			let result: RuntimeResult;
			try {
				result = await resultFor(request.operation);
			} catch {
				result = rejected("engine_failure");
			}

			// Authoritative revalidation after the await; never a pre-await snapshot.
			const after = admission.binding();
			if (!validBinding(after) || !sameBinding(before, after)) return { ok: false, code: "binding_unavailable" };
			if (mutating && !admission.permitted(request.operation.op)) return { ok: false, code: "authority_denied" };

			const response: RuntimeResponse = { version: request.version, requestId: request.requestId, binding: after, result };
			if (!validateRuntimeResponse(response)) return { ok: false, code: "engine_failure" };
			return { ok: true, response };
		},
	};
}

function validatePiece(kind: string, value: unknown): boolean {
	switch (kind) {
		case "catalog":
			return validateCanonicalPiece("RuntimeCommandCatalog", value);
		case "command_receipt":
			return validateCanonicalPiece("RuntimeCommandReceipt", value);
		case "permissions":
			return validateCanonicalPiece("RuntimePermissionSnapshot", value);
		case "permission_receipt":
			return validateCanonicalPiece("RuntimePermissionReceipt", value);
		case "queue":
			return validateCanonicalPiece("RuntimeQueueSnapshot", value);
		case "errors":
			return validateCanonicalPiece("RuntimeErrorSnapshot", value);
		default:
			return false;
	}
}

export type { RuntimeCommandReceipt, RuntimePermissionReceipt };
