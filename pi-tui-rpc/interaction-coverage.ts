/**
 * Placement-parity coverage for the ten mandatory runtime-interaction rows.
 *
 * The rows and their order come from Core's placement-neutral contract
 * (`mobile-command-interactions.md`, ADR-0078): catalog; dispatch; permission
 * menu/snapshot; explicit decision; owner configuration; retained notifications;
 * errors/outcomes; queue snapshot; queue actions; reconnect/headless.
 *
 * This module reports what the current ports can actually serve in a placement,
 * and marks rows that are unavailable because Pi genuinely lacks a public SDK
 * operation (dispatch, queue snapshot/actions) separately from rows that are
 * merely unwired (permissions producer, retention, owner authority, headless CLI).
 * It adds no wire fields and no second dialect: every row names canonical
 * operations only.
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

/** Why a row is unavailable; `sdk_engine_absent` is the genuine Pi gap. */
export type CoverageReason = RuntimeUnavailableReason | "adapter_unwired" | "renderer_missing" | "owner_authority_pending";

export interface RowCoverage {
	row: InteractionRow;
	label: string;
	placement: InteractionPlacement;
	state: "available" | "unavailable";
	reason?: CoverageReason;
	/** Canonical operations that serve the row; never a parallel dialect. */
	ops: RuntimeOperation["op"][];
	/** True only when absence is a genuine Pi SDK/engine gap, not wiring. */
	sdkGap: boolean;
	detail: string;
}

export interface CoverageOptions {
	/** A typed headless transport exists for this placement (not a GUI-only path). */
	headless?: boolean;
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

/**
 * Derive the ten-row matrix for one placement from the supplied ports.
 *
 * Personal and managed placements must produce identical rows/reasons for the
 * same port set; only routing/auth/queue ownership/transport differ outside this
 * view. Rows stay `unavailable` until a real producer satisfies them.
 */
export function coverageFor(
	placement: InteractionPlacement,
	ports: InteractionPorts,
	options: CoverageOptions = {}
): RowCoverage[] {
	const commands = Boolean(ports.commands);
	const queue = ports.queue;
	const registry = Boolean(ports.permissionRegistry);
	const errors = Boolean(ports.errors);
	const events = Boolean(ports.events);
	const headless = options.headless === true;

	return [
		row(
			placement,
			"catalog",
			commands ? "available" : "unavailable",
			["command_catalog"],
			commands ? "canonical catalog from the engine port" : "Pi exposes no public catalog/dispatch engine operation yet",
			{ reason: "sdk_engine_absent", sdkGap: true }
		),
		row(
			placement,
			"dispatch",
			commands ? "available" : "unavailable",
			["command_dispatch"],
			commands
				? "real engine dispatch with correlated receipt"
				: "no public SDK dispatch primitive; literal prompt is not dispatch",
			{ reason: "sdk_engine_absent", sdkGap: true }
		),
		row(
			placement,
			"permission_menu",
			registry ? "available" : "unavailable",
			["permission_snapshot"],
			registry ? "producer snapshot with revision/expiry" : "no permission producer registry port wired in this build",
			{ reason: "port_not_configured" }
		),
		row(
			placement,
			"explicit_decision",
			registry ? "available" : "unavailable",
			["permission_decide"],
			registry
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
		row(
			placement,
			"errors_outcomes",
			errors ? "available" : "unavailable",
			["error_list"],
			errors
				? `retained errors${events ? " with canonical outcome events" : "; outcome events not supplied"}`
				: "no retained error source port wired",
			{ reason: "port_not_configured" }
		),
		row(
			placement,
			"queue_snapshot",
			queue ? "available" : "unavailable",
			["queue_snapshot"],
			queue ? "engine-owned queue facts with cursor/ids" : "no public extension queue snapshot operation yet",
			{ reason: "sdk_engine_absent", sdkGap: true }
		),
		row(
			placement,
			"queue_actions",
			queue?.apply ? "available" : "unavailable",
			["queue_apply"],
			queue?.apply
				? "declared actions with atomic expected cursor"
				: "no public queue action/CAS operation yet; no client mirror",
			{ reason: "sdk_engine_absent", sdkGap: true }
		),
		row(
			placement,
			"reconnect_headless",
			headless ? "available" : "unavailable",
			["capabilities", "queue_snapshot", "error_list"],
			headless
				? "typed snapshots/receipts over a non-GUI transport; no uncertain replay"
				: "typed headless CLI/API surface not implemented for this placement",
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
 * What a terminal consumer (oqt TUI/CLI) must provide for each row.
 *
 * `source_helper` means this repository has a renderable view/request builder but
 * the actual renderer, keymap and headless command still belong to oqt; those
 * remain `renderer_missing` until implemented and exercised natively.
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
			required: "visible/reopenable error list with phase/recovery/uncertainty",
			status: "source_helper",
			helper: "errorView",
			note: "oqt persistence/UI still required",
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
			required: "headless CLI/API equivalents for every operation",
			status: "renderer_missing",
			note: "no CLI commands implemented; snapshots/receipts exist",
		},
	];
}

/** Rows whose absence is a genuine Pi SDK gap rather than local wiring. */
export function sdkGapRows(matrix: readonly RowCoverage[]): InteractionRow[] {
	return matrix.filter((entry) => entry.sdkGap).map((entry) => entry.row);
}

/** Placement parity for the same capabilities: states/reasons must match. */
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
