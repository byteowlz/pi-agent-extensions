import { expect, test } from "bun:test";
import {
	INTERACTION_ROWS,
	type RowCoverage,
	coverageFor,
	parityViolations,
	sdkGapRows,
	terminalObligations,
} from "./interaction-coverage.js";
import type { InteractionPorts } from "./interaction-port.js";
import { type InteractionAdmission, createInteractionRuntime } from "./interaction-runtime.js";
import type { RuntimeBinding } from "./protocol/runtime-interactions/v1/RuntimeBinding.js";

const BINDING: RuntimeBinding = {
	publicSessionId: "public-1",
	nativeSessionId: "native-1",
	runtimeGeneration: "ir:11111111-1111-4111-8111-111111111111",
	controllerId: null,
	controllerGeneration: null,
};
const admission: InteractionAdmission = { binding: () => BINDING, permitted: () => true };

function fullPorts(): InteractionPorts {
	return {
		commands: {
			catalog: () => ({ generation: "g", coverage: "registered_only", commands: [] }),
			dispatch: () => ({ operationId: "op-1", commandId: "cmd-1", disposition: "started", rejection: null }),
		},
		queue: {
			snapshot: () => ({
				cursor: { generation: 1, revision: 0 },
				completeness: "complete",
				steering: [],
				followUp: [],
				supportedActions: [],
			}),
			apply: () => ({
				cursor: { generation: 1, revision: 1 },
				completeness: "complete",
				steering: [],
				followUp: [],
				supportedActions: [],
			}),
		},
		permissionRegistry: {
			snapshot: () => ({ cursor: { generation: 1, revision: 0 }, active: [], receipts: [] }),
			decide: () => {
				throw new Error("not used");
			},
			receipt: () => null,
		},
		errors: { snapshot: () => ({ cursor: { generation: 1, revision: 0 }, errors: [] }) },
		events: { subscribe: () => () => {} },
	};
}

function byRow(matrix: RowCoverage[]) {
	return Object.fromEntries(matrix.map((entry) => [entry.row, entry]));
}

test("the matrix has exactly the ten required rows in contract order", () => {
	const matrix = coverageFor("personal", {});
	expect(matrix.map((entry) => entry.row)).toEqual([...INTERACTION_ROWS]);
	expect(matrix.map((entry) => entry.label)).toEqual([
		"Command catalog",
		"Genuine command dispatch",
		"Permission menu/snapshot",
		"Explicit decision",
		"Owner configuration",
		"Retained notifications",
		"Errors/outcomes",
		"Queue snapshot",
		"Queue actions",
		"Reconnect/headless",
	]);
});

test("genuine Pi SDK gaps are marked as such, separately from unwired adapters", () => {
	const rows = byRow(coverageFor("personal", {}));
	// Pi has no public extension dispatch or queue operations in the pinned SDK.
	expect(sdkGapRows(Object.values(rows))).toEqual(["catalog", "dispatch", "queue_snapshot", "queue_actions"]);
	for (const row of ["catalog", "dispatch", "queue_snapshot", "queue_actions"] as const) {
		expect(rows[row]).toMatchObject({ state: "unavailable", reason: "sdk_engine_absent", sdkGap: true });
	}
	// Unwired or separate-authority rows must not masquerade as SDK gaps.
	for (const row of ["permission_menu", "explicit_decision", "retained_notifications", "errors_outcomes"] as const) {
		expect(rows[row]).toMatchObject({ state: "unavailable", reason: "port_not_configured", sdkGap: false });
	}
	expect(rows.owner_config).toMatchObject({ state: "unavailable", reason: "owner_authority_pending", sdkGap: false });
	expect(rows.reconnect_headless).toMatchObject({ state: "unavailable", reason: "adapter_unwired", sdkGap: false });
});

test("a fully wired producer reports the servable rows available and the rest honestly unavailable", () => {
	const rows = byRow(coverageFor("managed", fullPorts(), { headless: true }));
	for (const row of [
		"catalog",
		"dispatch",
		"permission_menu",
		"explicit_decision",
		"errors_outcomes",
		"queue_snapshot",
		"queue_actions",
		"reconnect_headless",
	] as const) {
		expect(rows[row]).toMatchObject({ state: "available", sdkGap: false });
	}
	expect(rows.owner_config).toMatchObject({ state: "unavailable", reason: "owner_authority_pending" });
	expect(rows.retained_notifications).toMatchObject({ state: "unavailable", reason: "port_not_configured" });
	// A queue port without apply keeps actions unavailable as a genuine engine gap.
	const noApply = byRow(
		coverageFor("managed", {
			...fullPorts(),
			queue: {
				snapshot: () => ({
					cursor: { generation: 1, revision: 0 },
					completeness: "complete",
					steering: [],
					followUp: [],
					supportedActions: [],
				}),
			},
		})
	);
	expect(noApply.queue_actions).toMatchObject({ state: "unavailable", reason: "sdk_engine_absent", sdkGap: true });
});

test("both placements produce identical semantics for identical capabilities", () => {
	for (const ports of [{}, fullPorts()]) {
		const personal = coverageFor("personal", ports, { headless: true });
		const managed = coverageFor("managed", ports, { headless: true });
		expect(parityViolations(personal, managed)).toEqual([]);
		expect(personal.map(({ placement: _p, ...rest }) => rest)).toEqual(managed.map(({ placement: _m, ...rest }) => rest));
	}
});

test("every row names only canonical operations", () => {
	const canonical = new Set([
		"capabilities",
		"command_catalog",
		"command_dispatch",
		"permission_snapshot",
		"permission_decide",
		"policy_read",
		"policy_apply",
		"queue_snapshot",
		"queue_apply",
		"error_list",
		"receipt_get",
	]);
	for (const entry of coverageFor("personal", fullPorts())) {
		expect(entry.ops.length).toBeGreaterThan(0);
		for (const op of entry.ops) expect(canonical.has(op)).toBe(true);
	}
});

test("terminal obligations cover oqt's mandatory non-GUI surfaces and mark what is missing", () => {
	const obligations = terminalObligations();
	expect(obligations.map((entry) => entry.row)).toEqual([...INTERACTION_ROWS]);
	const rows = Object.fromEntries(obligations.map((entry) => [entry.row, entry]));
	// Native keyboard picker, timed/cancellable prompt, notices, queue actions and headless are mandatory.
	expect(rows.catalog).toMatchObject({ status: "source_helper", helper: "commandPalette" });
	expect(rows.permission_menu).toMatchObject({ status: "source_helper", helper: "permissionPrompt" });
	expect(rows.explicit_decision).toMatchObject({ status: "source_helper", helper: "permissionDecisionRequest" });
	expect(rows.queue_actions).toMatchObject({ status: "source_helper", helper: "queueActionRequest" });
	expect(rows.errors_outcomes).toMatchObject({ status: "source_helper", helper: "errorView" });
	// Renderer/CLI and retention are not closed by builders.
	expect(rows.retained_notifications).toMatchObject({ status: "renderer_missing" });
	expect(rows.reconnect_headless).toMatchObject({ status: "renderer_missing" });
	expect(rows.owner_config).toMatchObject({ status: "unavailable" });
	for (const entry of obligations) expect(entry.required.length).toBeGreaterThan(0);
});

test("the runtime exposes the same matrix for both placements", () => {
	const runtime = createInteractionRuntime(fullPorts(), admission);
	expect(runtime.coverage("personal", { headless: true }).map((entry) => entry.row)).toEqual([...INTERACTION_ROWS]);
	expect(
		parityViolations(runtime.coverage("personal", { headless: true }), runtime.coverage("managed", { headless: true }))
	).toEqual([]);
});
