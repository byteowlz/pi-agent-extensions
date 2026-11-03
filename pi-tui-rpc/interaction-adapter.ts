/**
 * Capability-gated adapter between engine ports and the canonical runtime
 * interaction DTOs (vendored, pinned by `protocol/runtime-interactions/SOURCE.json`).
 *
 * Deliberately inert: not imported by `index.ts` routing, the hub, dispatch or
 * lease code until the integration scope says so. It converts and gates; it never
 * dispatches through a prompt, never decides a permission, never mirrors a queue,
 * and never invents an ID, generation or cursor the engine did not issue.
 *
 * Availability is derived from a *real* port only. Vendored DTOs do not make a
 * family available.
 */

import {
	type CapabilityReport,
	type DispatchOperation,
	type InteractionFamily,
	type InteractionPorts,
	type InteractionResult,
	PROVISIONAL_CAPABILITIES,
	type PermissionAnswer,
} from "./interaction-port.js";
import type { RuntimeCommandCatalog } from "./protocol/runtime-interactions/v1/RuntimeCommandCatalog.js";
import type { RuntimeCommandReceipt } from "./protocol/runtime-interactions/v1/RuntimeCommandReceipt.js";
import type { RuntimeErrorSnapshot } from "./protocol/runtime-interactions/v1/RuntimeErrorSnapshot.js";
import type { RuntimePermissionPresentation } from "./protocol/runtime-interactions/v1/RuntimePermissionPresentation.js";
import type { RuntimeQueueSnapshot } from "./protocol/runtime-interactions/v1/RuntimeQueueSnapshot.js";
import type { RuntimeRejectCode } from "./protocol/runtime-interactions/v1/RuntimeRejectCode.js";
import type { RuntimeUnavailableReason } from "./protocol/runtime-interactions/v1/RuntimeUnavailableReason.js";

const COVERAGE = new Set(["full", "registered_only", "partial"]);
const ORIGINS = new Set(["builtin", "extension", "prompt", "skill"]);
const DISPOSITIONS = new Set(["rejected", "handled", "queued", "started"]);
const REJECT_CODES = new Set([
	"invalid_request",
	"unknown_command",
	"ambiguous_command",
	"stale_generation",
	"stale_revision",
	"unknown_request",
	"already_consumed",
	"expired",
	"cancelled",
	"authority_denied",
	"policy_denied",
	"subject_mismatch",
	"journal_unavailable",
	"engine_failure",
]);
const PERMISSION_DECISIONS = new Set(["allow_once", "deny", "cancel"]);
const COMPLETENESS = new Set(["complete", "partial", "unknown"]);

function isId(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function isGeneration(value: unknown): boolean {
	return isId(value) || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

function isRevision(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Structural gate for a port-supplied snapshot; the canonical schema is authoritative. */
function validQueueSnapshot(value: RuntimeQueueSnapshot | undefined): boolean {
	if (!value || !value.cursor || !isGeneration(value.cursor.generation) || !isRevision(value.cursor.revision)) return false;
	if (!COMPLETENESS.has(value.completeness)) return false;
	if (!Array.isArray(value.steering) || !Array.isArray(value.followUp)) return false;
	for (const item of [...value.steering, ...value.followUp]) {
		if (!item || typeof item.text !== "string") return false;
		if (item.itemId !== null && !isId(item.itemId)) return false;
	}
	return Array.isArray(value.supportedActions);
}

function validCatalog(value: RuntimeCommandCatalog | undefined): boolean {
	if (!value || !isGeneration(value.generation) || !COVERAGE.has(value.coverage)) return false;
	if (!Array.isArray(value.commands)) return false;
	for (const command of value.commands) {
		if (!command || !isId(command.commandId) || typeof command.invocation !== "string") return false;
		if (!ORIGINS.has(command.origin)) return false;
		if (!command.arguments || (command.arguments.kind !== "raw_string" && command.arguments.kind !== "json_schema")) return false;
		if (!command.availability || !["available", "unavailable"].includes(command.availability.state)) return false;
		if (!Array.isArray(command.requiredInteractions)) return false;
	}
	return true;
}

function validReceipt(value: RuntimeCommandReceipt | undefined): boolean {
	if (!value || !isId(value.operationId) || !isId(value.commandId)) return false;
	if (!DISPOSITIONS.has(value.disposition)) return false;
	if (value.rejection !== null && !REJECT_CODES.has(value.rejection)) return false;
	return true;
}

function validPresentation(value: RuntimePermissionPresentation): boolean {
	if (!isId(value.handleId) || !isId(value.requestId) || !isRevision(value.requestRevision)) return false;
	if (!isRevision(value.expiresAtMs)) return false;
	if (!Array.isArray(value.options) || value.options.length === 0) return false;
	return value.options.every(
		(option) => option && isId(option.optionId) && (option.model === null || typeof option.model === "string")
	);
}

function validAnswer(value: PermissionAnswer | undefined): boolean {
	if (!value || !PERMISSION_DECISIONS.has(value.decision)) return false;
	return value.optionId === null || isId(value.optionId);
}

function validErrors(value: RuntimeErrorSnapshot | undefined): boolean {
	if (!value || !value.cursor || !isGeneration(value.cursor.generation) || !isRevision(value.cursor.revision)) return false;
	if (!Array.isArray(value.errors)) return false;
	for (const error of value.errors) {
		if (!error || !isId(error.eventId)) return false;
		if (typeof error.code !== "string" || typeof error.message !== "string" || typeof error.phase !== "string") return false;
		if (typeof error.recoverable !== "boolean" || typeof error.uncertain !== "boolean") return false;
	}
	return true;
}

export interface InteractionAdapterOptions {
	ports?: InteractionPorts;
	now?: () => number;
}

export class InteractionAdapter {
	private readonly ports: InteractionPorts;
	private readonly now: () => number;

	constructor(options: InteractionAdapterOptions = {}) {
		this.ports = options.ports ?? {};
		this.now = options.now ?? (() => Date.now());
	}

	/** Honest per-family state derived only from provided ports. */
	capabilities(): CapabilityReport[] {
		return PROVISIONAL_CAPABILITIES.map((base) => {
			// Without a port the default already names the concrete blocker; do not
			// weaken an SDK gap into a generic configuration message.
			if (!this.portPresent(base.family)) return { ...base };
			if (base.family === "permission_config")
				return { family: base.family, state: "unavailable", reason: "unsupported_operation" };
			return { family: base.family, state: "available" };
		});
	}

	private portPresent(family: InteractionFamily): boolean {
		if (family === "commands") return Boolean(this.ports.commands);
		if (family === "queue") return Boolean(this.ports.queue);
		if (family === "permissions") return Boolean(this.ports.permissions);
		if (family === "errors") return Boolean(this.ports.errors);
		return false;
	}

	private unavailable<T>(family: InteractionFamily, reason: RuntimeUnavailableReason): InteractionResult<T> {
		return { kind: "unavailable", family, reason };
	}

	private rejected<T>(code: RuntimeRejectCode): InteractionResult<T> {
		return { kind: "rejected", code };
	}

	async catalog(): Promise<InteractionResult<RuntimeCommandCatalog>> {
		const port = this.ports.commands;
		if (!port) return this.unavailable("commands", "sdk_engine_absent");
		try {
			const catalog = await port.catalog();
			if (!validCatalog(catalog)) return this.rejected("engine_failure");
			return { kind: "ok", value: catalog };
		} catch {
			return this.rejected("engine_failure");
		}
	}

	/** Explicit dispatch through a real engine; the receipt is copied, never completed. */
	async dispatch(operation: DispatchOperation): Promise<InteractionResult<RuntimeCommandReceipt>> {
		if (!isId(operation.commandId) || typeof operation.args !== "string" || !isGeneration(operation.catalogGeneration))
			return this.rejected("invalid_request");
		const port = this.ports.commands;
		if (!port) return this.unavailable("commands", "sdk_engine_absent");
		try {
			const receipt = await port.dispatch({
				commandId: operation.commandId,
				args: operation.args,
				catalogGeneration: operation.catalogGeneration,
			});
			// No ID is invented: an engine receipt without a real operation ID is unusable.
			if (!validReceipt(receipt)) return this.rejected("engine_failure");
			return { kind: "ok", value: receipt };
		} catch {
			return this.rejected("engine_failure");
		}
	}

	async queueSnapshot(): Promise<InteractionResult<RuntimeQueueSnapshot>> {
		const port = this.ports.queue;
		if (!port) return this.unavailable("queue", "sdk_engine_absent");
		try {
			const snapshot = await port.snapshot();
			if (!validQueueSnapshot(snapshot)) return this.rejected("engine_failure");
			return { kind: "ok", value: snapshot };
		} catch {
			return this.rejected("engine_failure");
		}
	}

	/** Transport only: no presenter, no answer, or an explicit cancel never becomes allow. */
	async presentPermission(presentation: RuntimePermissionPresentation): Promise<InteractionResult<PermissionAnswer>> {
		if (!validPresentation(presentation)) return this.rejected("invalid_request");
		const port = this.ports.permissions;
		if (!port) return this.unavailable("permissions", "port_not_configured");
		try {
			const answer = await port.present({
				handleId: presentation.handleId,
				requestId: presentation.requestId,
				requestRevision: presentation.requestRevision,
				subject: presentation.subject,
				subjectDigest: presentation.subjectDigest,
				operationDigest: presentation.operationDigest,
				ceilingDigest: presentation.ceilingDigest,
				expiresAtMs: presentation.expiresAtMs,
				options: presentation.options,
			});
			if (!validAnswer(answer)) return this.rejected("invalid_request");
			return { kind: "ok", value: answer };
		} catch {
			return this.rejected("engine_failure");
		}
	}

	async errorSnapshot(afterEventId: string | null): Promise<InteractionResult<RuntimeErrorSnapshot>> {
		if (afterEventId !== null && !isId(afterEventId)) return this.rejected("invalid_request");
		const port = this.ports.errors;
		if (!port) return this.unavailable("errors", "port_not_configured");
		try {
			const snapshot = await port.snapshot(afterEventId);
			if (!validErrors(snapshot)) return this.rejected("engine_failure");
			return { kind: "ok", value: snapshot };
		} catch {
			return this.rejected("engine_failure");
		}
	}

	/** Server clock for a presentation; clients compare, never decide by it. */
	serverNow(): number {
		return this.now();
	}
}
