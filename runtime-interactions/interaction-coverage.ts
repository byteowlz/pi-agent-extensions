/**
 * Placement-parity coverage for the ten mandatory runtime-interaction rows.
 *
 * The rows and their order come from Core's placement-neutral contract
 * (`mobile-command-interactions.md`, ADR-0078). A row is `available` only when the
 * supplied ports can actually serve it. Absence of a port is NOT evidence that Pi
 * lacks an SDK operation: callers pass explicit engine evidence for that, so an
 * unwired managed adapter and a known stock-Pi gap are distinguishable.
 *
 * Composite rows stay unavailable until every required path exists; their detail
 * names the partial inputs. A boolean "headless" flag is not evidence, and equal
 * matrices (both placements) are diagnostic, not proof of two real producers.
 */

import type { InteractionPorts } from "./interaction-port.js";
import type { RuntimeOperation } from "./protocol/runtime-interactions/v1/RuntimeOperation.js";
import type { RuntimeUnavailableReason } from "./protocol/runtime-interactions/v1/RuntimeUnavailableReason.js";

export type InteractionPlacement = "personal" | "managed";

export const INTERACTION_ROWS = [
	"catalog",
	"dispatch",
	"permission_menu",
	"explicit_decision",
	"owner_config",
	"retained_notifications",
	"errors_outcomes",
	"queue_snapshot",
	"queue_actions",
	"reconnect_headless",
] as const;

export type InteractionRow = (typeof INTERACTION_ROWS)[number];

/** Why a row is unavailable; `sdk_engine_absent` requires explicit evidence. */
export type CoverageReason = RuntimeUnavailableReason | "adapter_unwired" | "renderer_missing" | "owner_authority_pending";

/** Caller-supplied engine knowledge. Never inferred from a missing port. */
export type EngineEvidence = "supported" | "partial" | "sdk_absent" | "unknown";

export interface CoverageEvidence {
	catalog?: EngineEvidence;
	dispatch?: EngineEvidence;
	queueSnapshot?: EngineEvidence;
	queueActions?: EngineEvidence;
}

export interface RowCoverage {
	row: InteractionRow;
	label: string;
	placement: InteractionPlacement;
	state: "available" | "unavailable";
	reason?: CoverageReason;
	/** Canonical operations that serve the row; never a parallel dialect. */
	ops: RuntimeOperation["op"][];
	/** True only with explicit `sdk_absent` evidence, not merely a missing port. */
	sdkGap: boolean;
	detail: string;
}

const ROW_LABEL: Record<InteractionRow, string> = {
	catalog: "Command catalog",
	dispatch: "Genuine command dispatch",
	permission_menu: "Permission menu/snapshot",
	explicit_decision: "Explicit decision",
	owner_config: "Owner configuration",
	retained_notifications: "Retained notifications",
	errors_outcomes: "Errors/outcomes",
	queue_snapshot: "Queue snapshot",
	queue_actions: "Queue actions",
	reconnect_headless: "Reconnect/headless",
};

function row(
	placement: InteractionPlacement,
	name: InteractionRow,
	state: "available" | "unavailable",
	ops: RuntimeOperation["op"][],
	detail: string,
	init: { reason?: CoverageReason; sdkGap?: boolean } = {}
): RowCoverage {
	return {
		row: name,
		label: ROW_LABEL[name],
		placement,
		state,
		...(state === "unavailable" && init.reason ? { reason: init.reason } : {}),
		ops,
		sdkGap: state === "unavailable" && init.sdkGap === true,
		detail,
	};
}

/** Describe an engine-backed row from an actual port or explicit evidence. */
function engineRow(
	placement: InteractionPlacement,
	name: InteractionRow,
	op: RuntimeOperation["op"],
	present: boolean,
	evidence: EngineEvidence | undefined,
	details: { supported: string; partial: string; unwired: string }
): RowCoverage {
	if (present) return row(placement, name, "available", [op], details.supported);
	if (evidence === "sdk_absent")
		return row(placement, name, "unavailable", [op], "reported Pi engine/SDK absence", {
			reason: "sdk_engine_absent",
			sdkGap: true,
		});
	if (evidence === "partial") return row(placement, name, "unavailable", [op], details.partial, { reason: "adapter_unwired" });
	return row(placement, name, "unavailable", [op], details.unwired, { reason: "adapter_unwired" });
}

/**
 * Derive the ten-row matrix for one placement from ports plus explicit evidence.
 *
 * Both placements must report the same semantics for the same capabilities, but
 * equality alone is diagnostic: unavailable rows are still unavailable.
 */
export function coverageFor(
	placement: InteractionPlacement,
	ports: InteractionPorts,
	evidence: CoverageEvidence = {}
): RowCoverage[] {
	const errors = Boolean(ports.errors);
	const events = Boolean(ports.events);
	return [
		engineRow(placement, "catalog", "command_catalog", Boolean(ports.commands), evidence.catalog, {
			supported: "canonical catalog from the engine port",
			partial: "registered-resource discovery exists, but no engine-issued generation/args schema and no catalog port is wired",
			unwired: "no catalog port wired; absence alone is not evidence that Pi lacks an SDK operation",
		}),
		engineRow(placement, "dispatch", "command_dispatch", Boolean(ports.commands), evidence.dispatch, {
			supported: "real engine dispatch with correlated receipt",
			partial: "no public dispatch primitive yet; a literal prompt is not dispatch",
			unwired: "no dispatch port wired; absence alone is not evidence that Pi lacks an SDK operation",
		}),
		row(
			placement,
			"permission_menu",
			ports.permissionRegistry ? "available" : "unavailable",
			["permission_snapshot"],
			ports.permissionRegistry ? "producer snapshot with revision/expiry" : "no permission producer registry port wired",
			{ reason: "port_not_configured" }
		),
		row(
			placement,
			"explicit_decision",
			ports.permissionRegistry ? "available" : "unavailable",
			["permission_decide"],
			ports.permissionRegistry
				? "one-shot allow_once/deny/cancel on issued options"
				: "no authoritative decision producer; a presenter cannot decide",
			{ reason: "port_not_configured" }
		),
		row(
			placement,
			"owner_config",
			"unavailable",
			["policy_read", "policy_apply"],
			"owner-write policy is a separate authorized authority; not implemented here",
			{ reason: "owner_authority_pending" }
		),
		row(
			placement,
			"retained_notifications",
			"unavailable",
			["error_list"],
			"live events only; no retained-notification DTO/port exists before Core qualification",
			{ reason: "port_not_configured" }
		),
		// Composite row: retained errors alone are not retained outcomes.
		row(
			placement,
			"errors_outcomes",
			"unavailable",
			["error_list"],
			`retained errors ${errors ? "present" : "missing"}; outcome events ${events ? "live only (not retained)" : "missing"}; the composite row requires retained outcomes`,
			{ reason: "port_not_configured" }
		),
		engineRow(placement, "queue_snapshot", "queue_snapshot", Boolean(ports.queue), evidence.queueSnapshot, {
			supported: "engine-owned queue facts with cursor/ids",
			partial: "Pi emits queue updates, but no public snapshot operation with ids/cursor is wired",
			unwired: "no queue snapshot port wired; absence alone is not evidence that Pi lacks an SDK operation",
		}),
		engineRow(placement, "queue_actions", "queue_apply", Boolean(ports.queue?.apply), evidence.queueActions, {
			supported: "declared actions with atomic expected cursor",
			partial: "no public queue action/CAS operation yet",
			unwired: "no queue action port wired; absence alone is not evidence that Pi lacks an SDK operation",
		}),
		// Composite row: no recovery/CLI implementation exists; a transport flag is not evidence.
		row(
			placement,
			"reconnect_headless",
			"unavailable",
			["capabilities", "queue_snapshot", "error_list"],
			"typed snapshots/receipts exist in the contract, but no recovery/CLI path is implemented; a flag is not evidence",
			{ reason: "adapter_unwired" }
		),
	];
}

export interface TerminalObligation {
	row: InteractionRow;
	required: string;
	status: "source_helper" | "renderer_missing" | "unavailable";
	helper?: string;
	note?: string;
}

/**
 * What a terminal consumer (oqt TUI/CLI) must still provide per row.
 *
 * `source_helper` means a renderable view/request builder exists here; the actual
 * renderer, keymap and headless command belong to oqt and remain
 * `renderer_missing` until implemented and natively exercised.
 */
export function terminalObligations(): TerminalObligation[] {
	return [
		{
			row: "catalog",
			required: "keyboard picker over available commands",
			status: "source_helper",
			helper: "commandPalette",
			note: "renderer/keymap still required in oqt",
		},
		{
			row: "dispatch",
			required: "explicit invoke with raw args and issued generation",
			status: "source_helper",
			helper: "paletteDispatchRequest",
		},
		{
			row: "permission_menu",
			required: "timed, cancellable typed prompt with options and expiry",
			status: "source_helper",
			helper: "permissionPrompt",
		},
		{
			row: "explicit_decision",
			required: "allow_once/deny/cancel answer; expiry -> cancel",
			status: "source_helper",
			helper: "permissionDecisionRequest",
		},
		{
			row: "owner_config",
			required: "authorized revisioned read/diff/apply",
			status: "unavailable",
			note: "no owner-write operation before Core qualification",
		},
		{
			row: "retained_notifications",
			required: "visible and reopenable notices with source identity",
			status: "renderer_missing",
			note: "no retained-notification DTO/port or oqt store integration yet",
		},
		{
			row: "errors_outcomes",
			required: "visible/reopenable retained errors and outcomes",
			status: "renderer_missing",
			note: "errorView exists, but retained outcome events are not implemented",
		},
		{
			row: "queue_snapshot",
			required: "queued-prompt state with ids, completeness and cursor",
			status: "source_helper",
			helper: "queueView",
		},
		{
			row: "queue_actions",
			required: "supported actions with CAS; unsupported actions not offered",
			status: "source_helper",
			helper: "queueActionRequest",
		},
		{
			row: "reconnect_headless",
			required: "headless CLI/API equivalents for every operation incl recovery",
			status: "renderer_missing",
			note: "no CLI or recovery path implemented",
		},
	];
}

/** Rows whose absence is backed by explicit `sdk_absent` evidence. */
export function sdkGapRows(matrix: readonly RowCoverage[]): InteractionRow[] {
	return matrix.filter((entry) => entry.sdkGap).map((entry) => entry.row);
}

/** Placement parity: diagnostic only. Equal matrices may be equally unavailable. */
export function parityViolations(
	personal: readonly RowCoverage[],
	managed: readonly RowCoverage[]
): Array<{ row: InteractionRow; detail: string }> {
	const violations: Array<{ row: InteractionRow; detail: string }> = [];
	for (const left of personal) {
		const right = managed.find((entry) => entry.row === left.row);
		if (!right) {
			violations.push({ row: left.row, detail: "row missing in managed placement" });
			continue;
		}
		if (left.state !== right.state || left.reason !== right.reason || left.sdkGap !== right.sdkGap) {
			violations.push({
				row: left.row,
				detail: `personal=${left.state}/${left.reason ?? "ok"} managed=${right.state}/${right.reason ?? "ok"}`,
			});
		}
	}
	return violations;
}
