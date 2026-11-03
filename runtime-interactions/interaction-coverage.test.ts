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

test("missing ports alone never claim an SDK gap or a headless capability", () => {
	const rows = byRow(coverageFor("managed", {}));
	// Red regression 1: an empty matrix plus a transport flag is not recovery/headless.
	const flagged = byRow(coverageFor("managed", {}, { headless: true } as never));
	expect(flagged.reconnect_headless).toMatchObject({ state: "unavailable", reason: "adapter_unwired", sdkGap: false });

	// Red regression 3: absence alone cannot distinguish stock-Pi gaps from unwired adapters.
	expect(sdkGapRows(Object.values(rows))).toEqual([]);
	for (const row of ["catalog", "dispatch", "queue_snapshot", "queue_actions"] as const) {
		expect(rows[row]).toMatchObject({ state: "unavailable", reason: "adapter_unwired", sdkGap: false });
	}
	expect(rows.permission_menu).toMatchObject({ state: "unavailable", reason: "port_not_configured", sdkGap: false });
	expect(rows.owner_config).toMatchObject({ state: "unavailable", reason: "owner_authority_pending" });
	expect(rows.reconnect_headless).toMatchObject({ state: "unavailable", reason: "adapter_unwired" });
});

test("explicit engine evidence distinguishes known SDK absence from unwired adapters", () => {
	const absent = coverageFor(
		"managed",
		{},
		{ catalog: "sdk_absent", dispatch: "sdk_absent", queueSnapshot: "sdk_absent", queueActions: "sdk_absent" }
	);
	expect(sdkGapRows(absent)).toEqual(["catalog", "dispatch", "queue_snapshot", "queue_actions"]);
	for (const row of ["catalog", "dispatch", "queue_snapshot", "queue_actions"] as const) {
		expect(byRow(absent)[row]).toMatchObject({ state: "unavailable", reason: "sdk_engine_absent", sdkGap: true });
	}

	const supportedButUnwired = byRow(
		coverageFor(
			"managed",
			{},
			{ catalog: "supported", dispatch: "supported", queueSnapshot: "supported", queueActions: "supported" }
		)
	);
	for (const row of ["catalog", "dispatch", "queue_snapshot", "queue_actions"] as const) {
		expect(supportedButUnwired[row]).toMatchObject({ state: "unavailable", reason: "adapter_unwired", sdkGap: false });
	}

	const partial = byRow(coverageFor("managed", {}, { catalog: "partial", queueSnapshot: "partial" }));
	expect(partial.catalog).toMatchObject({ state: "unavailable", reason: "adapter_unwired" });
	expect(partial.catalog.detail).toContain("enumerable");
	expect(partial.queue_snapshot.detail).toContain("hasPendingMessages");
});

test("retained errors alone do not implement the combined errors/outcomes row", () => {
	// Red regression 2: a throwing error port must not satisfy the composite row.
	const errorsOnly = byRow(
		coverageFor("managed", {
			errors: {
				snapshot: () => {
					throw new Error("never invoked");
				},
			},
		})
	);
	expect(errorsOnly.errors_outcomes).toMatchObject({ state: "unavailable", reason: "port_not_configured" });
	expect(errorsOnly.errors_outcomes.detail).toContain("retained errors present");
	expect(errorsOnly.errors_outcomes.detail).toContain("missing");

	const withEvents = byRow(coverageFor("managed", { ...fullPorts() }));
	expect(withEvents.errors_outcomes).toMatchObject({ state: "unavailable", reason: "port_not_configured" });
	expect(withEvents.errors_outcomes.detail).toContain("live only (not retained)");
});

test("a fully wired producer serves only the rows it can actually serve", () => {
	const rows = byRow(coverageFor("managed", fullPorts()));
	for (const row of ["catalog", "dispatch", "permission_menu", "explicit_decision", "queue_snapshot", "queue_actions"] as const) {
		expect(rows[row]).toMatchObject({ state: "available", sdkGap: false });
	}
	expect(rows.owner_config).toMatchObject({ state: "unavailable", reason: "owner_authority_pending" });
	expect(rows.retained_notifications).toMatchObject({ state: "unavailable", reason: "port_not_configured" });
	expect(rows.errors_outcomes).toMatchObject({ state: "unavailable", reason: "port_not_configured" });
	expect(rows.reconnect_headless).toMatchObject({ state: "unavailable", reason: "adapter_unwired" });

	// A queue port without apply does not become an SDK gap by itself.
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
	expect(noApply.queue_actions).toMatchObject({ state: "unavailable", reason: "adapter_unwired", sdkGap: false });
});

test("placement parity is diagnostic only; equal matrices can be equally unavailable", () => {
	for (const [ports, evidence] of [
		[{}, {}],
		[fullPorts(), { catalog: "sdk_absent" as const }],
	] as const) {
		const personal = coverageFor("personal", ports, evidence);
		const managed = coverageFor("managed", ports, evidence);
		expect(parityViolations(personal, managed)).toEqual([]);
		expect(personal.map(({ placement: _p, ...rest }) => rest)).toEqual(managed.map(({ placement: _m, ...rest }) => rest));
	}
	const empty = coverageFor("personal", {});
	expect(empty.every((entry) => entry.state === "unavailable")).toBe(true);
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
	expect(rows.catalog).toMatchObject({ status: "source_helper", helper: "commandPalette" });
	expect(rows.permission_menu).toMatchObject({ status: "source_helper", helper: "permissionPrompt" });
	expect(rows.explicit_decision).toMatchObject({ status: "source_helper", helper: "permissionDecisionRequest" });
	expect(rows.queue_actions).toMatchObject({ status: "source_helper", helper: "queueActionRequest" });
	// Errors are visible via errorView, but retained outcomes are still missing.
	expect(rows.errors_outcomes).toMatchObject({ status: "renderer_missing" });
	expect(rows.retained_notifications).toMatchObject({ status: "renderer_missing" });
	expect(rows.reconnect_headless).toMatchObject({ status: "renderer_missing" });
	expect(rows.owner_config).toMatchObject({ status: "unavailable" });
	for (const entry of obligations) expect(entry.required.length).toBeGreaterThan(0);
});

test("the runtime exposes the same matrix for both placements", () => {
	const runtime = createInteractionRuntime(fullPorts(), admission);
	expect(runtime.coverage("personal").map((entry) => entry.row)).toEqual([...INTERACTION_ROWS]);
	expect(parityViolations(runtime.coverage("personal"), runtime.coverage("managed"))).toEqual([]);
	const emptyRuntime = createInteractionRuntime({}, admission);
	expect(emptyRuntime.coverage("managed", { catalog: "sdk_absent" }).find((entry) => entry.row === "catalog")).toMatchObject({
		sdkGap: true,
		reason: "sdk_engine_absent",
	});
});
