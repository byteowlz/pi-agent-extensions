/**
 * Capability-gated adapter between engine ports and the runtime interaction
 * surface (provisional, non-normative).
 *
 * This module is deliberately inert: it is not imported by `index.ts`, the hub,
 * dispatch or lease code, so no active routing changes. It converts and gates; it
 * never dispatches through a prompt, never decides a permission, never mirrors a
 * queue, and never fabricates a canonical DTO.
 *
 * When Core publishes the generated `runtime-interactions` DTOs, this adapter maps
 * to them; until then its shapes stay internal and every unavailable result is an
 * honest intermediate capability state rather than feature delivery.
 */

import type { Receipt } from "../pi-session-tools/permission-producer.js";
import {
	type CapabilityReason,
	type CapabilityReport,
	type CatalogEntry,
	type CommandDispatchRequest,
	type CommandReceipt,
	type ErrorSourcePort,
	type InteractionCapability,
	type InteractionErrorView,
	type InteractionPorts,
	type InteractionRejectCode,
	type InteractionResult,
	PROVISIONAL_CAPABILITIES,
	type PermissionAnswerView,
	type PermissionPresentation,
	type PermissionReceiptView,
	type QueueSnapshotView,
} from "./interaction-port.js";

const DISPOSITIONS = new Set(["rejected", "handled", "queued", "started"]);
const SOURCES = new Set(["extension", "prompt", "skill"]);

export interface InteractionAdapterOptions {
	ports?: InteractionPorts;
	/**
	 * True only when the canonical DTOs were vendored from the Core generated
	 * commit. Governs permission presentation, which must not invent a schema.
	 */
	dtoVendored?: boolean;
	now?: () => number;
}

export class InteractionAdapter {
	private readonly ports: InteractionPorts;
	private readonly dtoVendored: boolean;
	private readonly now: () => number;

	constructor(options: InteractionAdapterOptions = {}) {
		this.ports = options.ports ?? {};
		this.dtoVendored = options.dtoVendored === true;
		this.now = options.now ?? (() => Date.now());
	}

	/** Honest per-family state; `unavailable` is not delivery. */
	capabilities(): CapabilityReport[] {
		return PROVISIONAL_CAPABILITIES.map((base) => this.reportFor(base.capability));
	}

	private reportFor(capability: InteractionCapability): CapabilityReport {
		if (!this.portPresent(capability)) return { capability, state: "unavailable", reason: "port_not_configured" };
		if (capability === "permissions" && !this.dtoVendored)
			return { capability, state: "unavailable", reason: "generated_dto_not_vendored" };
		return { capability, state: "available" };
	}

	private portPresent(capability: InteractionCapability): boolean {
		if (capability === "commands") return Boolean(this.ports.commands);
		if (capability === "queue") return Boolean(this.ports.queue);
		if (capability === "permissions") return Boolean(this.ports.permissions);
		return Boolean(this.ports.errors);
	}

	private unavailable<T>(capability: InteractionCapability, reason: CapabilityReason): InteractionResult<T> {
		return { kind: "unavailable", capability, reason };
	}

	private rejected<T>(capability: InteractionCapability, code: InteractionRejectCode, detail?: string): InteractionResult<T> {
		return { kind: "rejected", capability, code, ...(detail ? { detail } : {}) };
	}

	async catalog(): Promise<InteractionResult<CatalogEntry[]>> {
		const port = this.ports.commands;
		if (!port) return this.unavailable("commands", "sdk_engine_absent");
		try {
			const catalog = await port.catalog();
			if (!catalog || !Array.isArray(catalog.entries)) return this.rejected("commands", "engine_failure");
			for (const entry of catalog.entries) {
				if (!entry || typeof entry.name !== "string" || entry.name.length === 0)
					return this.rejected("commands", "invalid_request");
				if (!SOURCES.has(entry.source)) return this.rejected("commands", "invalid_request");
				if (!entry.argumentContract || entry.argumentContract.kind !== "raw_string")
					return this.rejected("commands", "invalid_request");
			}
			if (catalog.generation !== undefined && typeof catalog.generation !== "string")
				return this.rejected("commands", "invalid_request");
			return { kind: "ok", value: catalog.entries.map((entry) => ({ ...entry })) };
		} catch {
			return this.rejected("commands", "engine_failure");
		}
	}

	/**
	 * Explicit dispatch. Never falls back to a prompt: without a real engine port
	 * the answer is `unavailable`, and a generation request it cannot verify is
	 * rejected rather than silently ignored.
	 */
	async dispatch(request: CommandDispatchRequest): Promise<InteractionResult<CommandReceipt>> {
		if (!request || typeof request.name !== "string" || request.name.length === 0 || typeof request.args !== "string")
			return this.rejected("commands", "invalid_request");
		const port = this.ports.commands;
		if (!port) return this.unavailable("commands", "sdk_engine_absent");
		if (request.generation !== undefined) {
			const catalog = await this.catalog();
			if (catalog.kind !== "ok") return this.unavailable("commands", "sdk_engine_absent");
			const current = await port.catalog();
			if (!current.generation) return this.unavailable("commands", "sdk_engine_absent");
			if (current.generation !== request.generation)
				return this.rejected("commands", "catalog_generation_unavailable", "expected generation is not current");
		}
		try {
			const receipt = await port.dispatch({
				name: request.name,
				args: request.args,
				...(request.generation ? { generation: request.generation } : {}),
			});
			if (!receipt || typeof receipt.name !== "string" || !DISPOSITIONS.has(receipt.disposition))
				return this.rejected("commands", "engine_failure");
			// Acceptance, not completion: only the receipt vocabulary is copied.
			return {
				kind: "ok",
				value: {
					name: receipt.name,
					disposition: receipt.disposition,
					...(typeof receipt.operationId === "string" ? { operationId: receipt.operationId } : {}),
				},
			};
		} catch {
			return this.rejected("commands", "engine_failure");
		}
	}

	async queueSnapshot(): Promise<InteractionResult<QueueSnapshotView>> {
		const port = this.ports.queue;
		if (!port) return this.unavailable("queue", "sdk_engine_absent");
		try {
			const snapshot = await port.snapshot();
			if (!snapshot || !Array.isArray(snapshot.steering) || !Array.isArray(snapshot.followUp))
				return this.rejected("queue", "engine_failure");
			for (const entry of [...snapshot.steering, ...snapshot.followUp]) {
				if (!entry || typeof entry.text !== "string") return this.rejected("queue", "invalid_request");
				if (entry.id !== undefined && typeof entry.id !== "string") return this.rejected("queue", "invalid_request");
			}
			return {
				kind: "ok",
				value: {
					steering: snapshot.steering.map((entry) => ({ ...entry })),
					followUp: snapshot.followUp.map((entry) => ({ ...entry })),
					...(typeof snapshot.continuity === "string" ? { continuity: snapshot.continuity } : {}),
				},
			};
		} catch {
			return this.rejected("queue", "engine_failure");
		}
	}

	/** Projection of sanitized producer receipts; identity and reason only. */
	permissionReceipt(receipt: Receipt): PermissionReceiptView {
		return {
			handleId: receipt.handleId,
			requestId: receipt.requestId,
			kind: receipt.kind,
			outcome: receipt.outcome,
			reason: receipt.reason,
			at: receipt.at,
		};
	}

	/**
	 * Transport an already-issued permission request to a presenter.
	 *
	 * The adapter cannot allow: with no presenter, a missing answer, or unvendored
	 * DTOs the result is unavailable. The producer decides; this only carries an
	 * explicit answer back.
	 */
	async presentPermission(request: PermissionPresentation): Promise<InteractionResult<PermissionAnswerView>> {
		if (!request || typeof request.requestId !== "string" || !Number.isSafeInteger(request.revision))
			return this.rejected("permissions", "invalid_request");
		if (!Array.isArray(request.options) || request.options.length === 0) return this.rejected("permissions", "invalid_request");
		for (const option of request.options) {
			if (!option || typeof option.id !== "string" || option.id.length === 0)
				return this.rejected("permissions", "invalid_request");
		}
		const port = this.ports.permissions;
		if (!port) return this.unavailable("permissions", "sdk_engine_absent");
		if (!this.dtoVendored) return this.unavailable("permissions", "generated_dto_not_vendored");
		try {
			const answer = await port.present({
				requestId: request.requestId,
				revision: request.revision,
				serverNow: this.now(),
				expiresAt: request.expiresAt,
				options: request.options.map((option) => ({ ...option })),
			});
			if (!answer || (answer.decision !== "allow" && answer.decision !== "deny"))
				return this.rejected("permissions", "invalid_request");
			return {
				kind: "ok",
				value: {
					decision: answer.decision,
					...(typeof answer.optionId === "string" ? { optionId: answer.optionId } : {}),
					...(answer.cancelled === true ? { cancelled: true } : {}),
				},
			};
		} catch {
			return this.rejected("permissions", "engine_failure");
		}
	}

	async recentErrors(): Promise<InteractionResult<InteractionErrorView[]>> {
		const port: ErrorSourcePort | undefined = this.ports.errors;
		if (!port) return this.unavailable("errors", "port_not_configured");
		try {
			const errors = await port.recent();
			if (!Array.isArray(errors)) return this.rejected("errors", "engine_failure");
			return { kind: "ok", value: errors.map((error) => ({ ...error })) };
		} catch {
			return this.rejected("errors", "engine_failure");
		}
	}
}
