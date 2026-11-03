import { expect, test } from "bun:test";
import type { RuntimeRequest } from "./protocol/runtime-interactions/v1/RuntimeRequest.js";
import type { RuntimeResponse } from "./protocol/runtime-interactions/v1/RuntimeResponse.js";
import {
	RUNTIME_INTERACTIONS_VERSION,
	eventFrame,
	isMutatingOperation,
	isObservationOperation,
	negotiateVersion,
	negotiatedFrame,
	parseInteractionRequestFrame,
	parseNegotiationFrame,
	requestFrame,
	responseFrame,
	statusFrame,
} from "./wire.js";

const capabilitiesRequest: RuntimeRequest = { version: 1, requestId: "req-1", operation: { op: "capabilities" } };

function frame(request: unknown) {
	return { type: "interaction", request };
}

test("only exactly v1 is negotiated; nothing is coerced", () => {
	expect(RUNTIME_INTERACTIONS_VERSION).toBe(1);
	expect(negotiateVersion([1])).toBe(1);
	expect(negotiateVersion([1, 2])).toBe(1);
	expect(negotiateVersion([2])).toBeNull();
	expect(negotiateVersion(["1"])).toBeNull();
	expect(negotiateVersion(null)).toBeNull();
	expect(parseNegotiationFrame({ type: "interaction_negotiate", versions: [2] })).toEqual({ ok: true, value: null });
	expect(parseNegotiationFrame({ type: "interaction_negotiate", versions: [1] })).toEqual({ ok: true, value: 1 });
	expect(parseNegotiationFrame({ type: "interaction_negotiate", versions: ["1"] })).toMatchObject({ ok: false });
	expect(negotiatedFrame(1)).toEqual({ type: "interaction_negotiated", version: 1 });
});

test("request frames parse against the canonical envelope", () => {
	expect(parseInteractionRequestFrame(frame(capabilitiesRequest))).toEqual({ ok: true, value: capabilitiesRequest });
	expect(parseInteractionRequestFrame(frame({ ...capabilitiesRequest, version: 2 }))).toEqual({
		ok: false,
		code: "invalid_request",
	});
	expect(parseInteractionRequestFrame(frame({ ...capabilitiesRequest, requestId: "" }))).toMatchObject({ ok: false });
	expect(parseInteractionRequestFrame(frame({ ...capabilitiesRequest, operation: { op: "nope" } }))).toMatchObject({
		ok: false,
	});
	expect(parseInteractionRequestFrame({ type: "interaction" })).toMatchObject({ ok: false });
	expect(parseInteractionRequestFrame(null)).toMatchObject({ ok: false });
});

test("per-operation envelope checks keep ids, generations and raw args intact", () => {
	const dispatch = (operation: unknown) => frame({ version: 1, requestId: "r", operation });
	expect(
		parseInteractionRequestFrame(
			dispatch({ op: "command_dispatch", catalogGeneration: 7, commandId: "cmd", args: " --x='a /name' " })
		)
	).toMatchObject({ ok: true });
	expect(
		parseInteractionRequestFrame(dispatch({ op: "command_dispatch", catalogGeneration: "gen-1", commandId: "cmd", args: "" }))
	).toMatchObject({ ok: true });
	expect(
		parseInteractionRequestFrame(dispatch({ op: "command_dispatch", catalogGeneration: 7, commandId: "", args: "" }))
	).toMatchObject({
		ok: false,
	});
	expect(parseInteractionRequestFrame(dispatch({ op: "command_dispatch", catalogGeneration: 7, commandId: "c" }))).toMatchObject({
		ok: false,
	});
	expect(
		parseInteractionRequestFrame(
			dispatch({
				op: "permission_decide",
				producerGeneration: 1,
				handleId: "h",
				requestRevision: 0,
				controllerId: "c",
				controllerGeneration: 1,
				decision: "allow_once",
				optionId: null,
			})
		)
	).toMatchObject({ ok: true });
	expect(
		parseInteractionRequestFrame(
			dispatch({
				op: "permission_decide",
				producerGeneration: 1,
				handleId: "h",
				requestRevision: 0,
				controllerId: "c",
				controllerGeneration: 1,
				decision: "allow",
				optionId: "allow",
			})
		)
	).toMatchObject({ ok: false });
	expect(parseInteractionRequestFrame(dispatch({ op: "receipt_get", operationId: "" }))).toMatchObject({ ok: false });
	expect(parseInteractionRequestFrame(dispatch({ op: "error_list", afterEventId: 4 }))).toMatchObject({ ok: false });
	expect(
		parseInteractionRequestFrame(
			dispatch({
				op: "queue_apply",
				expected: { generation: "fixture-runtime", revision: 4 },
				action: { action: "cancel_item", itemId: "fixture-q1" },
			})
		)
	).toMatchObject({ ok: true });
	expect(
		parseInteractionRequestFrame(dispatch({ op: "queue_apply", action: { action: "cancel_item", itemId: "q1" } }))
	).toMatchObject({
		ok: false,
	});
	expect(
		parseInteractionRequestFrame(
			dispatch({
				op: "policy_apply",
				expected: { generation: "fixture-runtime", revision: 4 },
				changes: [{ setting: "allowed_models", value: ["fixture/model"] }],
			})
		)
	).toMatchObject({ ok: true });
	expect(parseInteractionRequestFrame(dispatch({ op: "policy_apply", expected: {}, changes: [] }))).toMatchObject({ ok: false });
});

test("forged authority, disguised answers and policy writes are rejected at the boundary", () => {
	const forgedAuthority = frame({
		version: 1,
		requestId: "req-1",
		operation: { op: "capabilities" },
		binding: {
			publicSessionId: "public-1",
			nativeSessionId: "native-1",
			runtimeGeneration: 1,
			controllerId: "controller-1",
			controllerGeneration: 1,
		},
	});
	expect(parseInteractionRequestFrame(forgedAuthority)).toMatchObject({ ok: false });

	const answerChangesModel = frame({
		version: 1,
		requestId: "req-1",
		operation: {
			op: "permission_decide",
			producerGeneration: 1,
			handleId: "handle-1",
			requestRevision: 0,
			controllerId: "controller-1",
			controllerGeneration: 1,
			decision: "allow_once",
			optionId: "allow",
			model: "external/x",
		},
	});
	expect(parseInteractionRequestFrame(answerChangesModel)).toMatchObject({ ok: false });

	const answerWritesPolicy = frame({
		version: 1,
		requestId: "req-1",
		operation: {
			op: "permission_decide",
			producerGeneration: 1,
			handleId: "handle-1",
			requestRevision: 0,
			controllerId: "controller-1",
			controllerGeneration: 1,
			decision: "allow_once",
			optionId: "allow",
			policy: { allow_mode: "auto" },
		},
	});
	expect(parseInteractionRequestFrame(answerWritesPolicy)).toMatchObject({ ok: false });
});

test("oversized frames are rejected before schema validation", () => {
	const base = {
		version: 1,
		requestId: "req-1",
		operation: { op: "command_dispatch", catalogGeneration: 1, commandId: "c", args: "" },
	};
	const big = frame({ ...base, operation: { ...base.operation, args: "x".repeat(300 * 1024) } });
	expect(parseInteractionRequestFrame(big)).toMatchObject({ ok: false, code: "invalid_request" });
	expect(parseInteractionRequestFrame(frame(base))).toMatchObject({ ok: true });
});

test("all canonical operations are classified for admission", () => {
	const observation = [
		"capabilities",
		"command_catalog",
		"permission_snapshot",
		"policy_read",
		"queue_snapshot",
		"error_list",
		"receipt_get",
	];
	const mutating = ["command_dispatch", "permission_decide", "policy_apply", "queue_apply"];
	for (const op of observation) {
		expect(isObservationOperation(op as never)).toBe(true);
		expect(isMutatingOperation(op as never)).toBe(false);
	}
	for (const op of mutating) {
		expect(isMutatingOperation(op as never)).toBe(true);
		expect(isObservationOperation(op as never)).toBe(false);
	}
	expect(observation.length + mutating.length).toBe(11);
});

test("frame builders stay envelopes and add no DTO fields", () => {
	const response: RuntimeResponse = {
		version: 1,
		requestId: "req-1",
		binding: {
			publicSessionId: "public-1",
			nativeSessionId: "native-1",
			runtimeGeneration: 1,
			controllerId: "controller-1",
			controllerGeneration: 1,
		},
		result: { kind: "rejected", code: "invalid_request" },
	};
	expect(requestFrame(capabilitiesRequest)).toEqual({ type: "interaction", request: capabilitiesRequest });
	expect(responseFrame(response)).toEqual({ type: "interaction_response", response });
	expect(statusFrame("binding_unavailable")).toEqual({ type: "interaction_status", ok: false, code: "binding_unavailable" });
	expect(statusFrame("binding_unavailable", "req-1")).toEqual({
		type: "interaction_status",
		ok: false,
		code: "binding_unavailable",
		requestId: "req-1",
	});
	expect(
		eventFrame({
			version: 1,
			eventId: "event-1",
			binding: response.binding,
			payload: {
				kind: "error",
				error: {
					eventId: "event-1",
					operationId: null,
					source: "engine",
					code: "x",
					message: "m",
					phase: "p",
					recoverable: false,
					uncertain: true,
				},
			},
		})
	).toMatchObject({ type: "interaction_event" });
});
