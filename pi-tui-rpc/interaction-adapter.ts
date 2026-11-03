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
import { validateCanonicalPiece } from "./wire.js";

const PERMISSION_DECISIONS = new Set(["allow_once", "deny", "cancel"]);
const ID = /^[A-Za-z0-9._:-]{1,128}$/;

function isId(value: unknown): value is string {
	return typeof value === "string" && ID.test(value);
}

function isGeneration(value: unknown): boolean {
	return isId(value) || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

/** Port output is shaped by the canonical generated schema, not a handwritten subset. */
function validQueueSnapshot(value: RuntimeQueueSnapshot | undefined): boolean {
	return validateCanonicalPiece("RuntimeQueueSnapshot", value);
}

function validCatalog(value: RuntimeCommandCatalog | undefined): boolean {
	return validateCanonicalPiece("RuntimeCommandCatalog", value);
}

function validReceipt(value: RuntimeCommandReceipt | undefined): boolean {
	return validateCanonicalPiece("RuntimeCommandReceipt", value);
}

function validPresentation(value: RuntimePermissionPresentation): boolean {
	return validateCanonicalPiece("RuntimePermissionPresentation", value);
}

/** The answer is a decision vocabulary plus an option reference; it is not a standalone DTO. */
function validAnswer(value: PermissionAnswer | undefined): boolean {
	if (!value || !PERMISSION_DECISIONS.has(value.decision)) return false;
	return value.optionId === null || (typeof value.optionId === "string" && value.optionId.length > 0);
}

function validErrors(value: RuntimeErrorSnapshot | undefined): boolean {
	return validateCanonicalPiece("RuntimeErrorSnapshot", value);
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

	/** Engine ports for the placement-neutral runtime (never the presenter port). */
	enginePorts(): InteractionPorts {
		return {
			...(this.ports.commands ? { commands: this.ports.commands } : {}),
			...(this.ports.queue ? { queue: this.ports.queue } : {}),
			...(this.ports.errors ? { errors: this.ports.errors } : {}),
			...(this.ports.permissionRegistry ? { permissionRegistry: this.ports.permissionRegistry } : {}),
			...(this.ports.events ? { events: this.ports.events } : {}),
		};
	}

	/** Server clock for a presentation; clients compare, never decide by it. */
	serverNow(): number {
		return this.now();
	}
}
