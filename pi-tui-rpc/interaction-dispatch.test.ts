import { expect, test } from "bun:test";
import { dispatchInteractionRequest } from "./dispatch.js";
import { InteractionAdapter } from "./interaction-adapter.js";
import type { RuntimeBinding } from "./protocol/runtime-interactions/v1/RuntimeBinding.js";
import type { RuntimeCommandCatalog } from "./protocol/runtime-interactions/v1/RuntimeCommandCatalog.js";
import type { RuntimeCommandReceipt } from "./protocol/runtime-interactions/v1/RuntimeCommandReceipt.js";
import type { RuntimeRequest } from "./protocol/runtime-interactions/v1/RuntimeRequest.js";

const binding: RuntimeBinding = {
	publicSessionId: "public-1",
	nativeSessionId: "native-1",
	runtimeGeneration: 1,
	controllerId: "controller-1",
	controllerGeneration: 1,
};

const catalog: RuntimeCommandCatalog = {
	generation: "gen-7",
	coverage: "registered_only",
	commands: [
		{
			commandId: "cmd-1",
			invocation: "subagent",
			description: null,
			origin: "extension",
			arguments: { kind: "raw_string" },
			availability: { state: "available" },
			requiredInteractions: [],
		},
	],
};

const receipt: RuntimeCommandReceipt = { operationId: "op-1", commandId: "cmd-1", disposition: "started", rejection: null };

function request(operation: RuntimeRequest["operation"]): RuntimeRequest {
	return { version: 1, requestId: "req-1", operation };
}

function commandsAdapter() {
	return new InteractionAdapter({
		ports: {
			commands: {
				catalog: () => catalog,
				dispatch: () => receipt,
			},
		},
	});
}

test("no authenticated binding means no response is fabricated", async () => {
	const outcome = await dispatchInteractionRequest(request({ op: "capabilities" }), {
		adapter: new InteractionAdapter(),
		leaseHeld: () => true,
	});
	expect(outcome).toEqual({ ok: false, code: "binding_unavailable" });

	const invalid = await dispatchInteractionRequest(request({ op: "capabilities" }), {
		adapter: new InteractionAdapter(),
		binding: () => ({ ...binding, nativeSessionId: "" }),
		leaseHeld: () => true,
	});
	expect(invalid).toEqual({ ok: false, code: "binding_unavailable" });
});

test("mutating operations reuse the existing lease admission", async () => {
	const adapter = commandsAdapter();
	const denied = await dispatchInteractionRequest(
		request({ op: "command_dispatch", catalogGeneration: "gen-7", commandId: "cmd-1", args: "" }),
		{ adapter, binding: () => binding, leaseHeld: () => false }
	);
	expect(denied).toEqual({ ok: false, code: "authority_denied" });

	const observed = await dispatchInteractionRequest(request({ op: "command_catalog" }), {
		adapter,
		binding: () => binding,
		leaseHeld: () => false,
	});
	expect(observed.ok).toBe(true);
});

test("capabilities are reported concretely, never advertised by DTO presence", async () => {
	const outcome = await dispatchInteractionRequest(request({ op: "capabilities" }), {
		adapter: new InteractionAdapter(),
		binding: () => binding,
		leaseHeld: () => true,
	});
	if (!outcome.ok) throw new Error("expected response");
	expect(outcome.response).toMatchObject({ version: 1, requestId: "req-1", binding });
	expect(outcome.response.result).toEqual({
		kind: "capabilities",
		capabilities: [
			{ state: "unavailable", family: "commands", reason: "sdk_engine_absent" },
			{ state: "unavailable", family: "queue", reason: "sdk_engine_absent" },
			{ state: "unavailable", family: "permissions", reason: "port_not_configured" },
			{ state: "unavailable", family: "permission_config", reason: "unsupported_operation" },
			{ state: "unavailable", family: "errors", reason: "port_not_configured" },
		],
	});
});

test("catalog and dispatch demux into canonical results", async () => {
	const adapter = commandsAdapter();
	const catalogued = await dispatchInteractionRequest(request({ op: "command_catalog" }), {
		adapter,
		binding: () => binding,
		leaseHeld: () => true,
	});
	if (!catalogued.ok) throw new Error("expected response");
	expect(catalogued.response.result).toEqual({ kind: "catalog", catalog });

	const dispatched = await dispatchInteractionRequest(
		request({ op: "command_dispatch", catalogGeneration: "gen-7", commandId: "cmd-1", args: " --x=1 " }),
		{ adapter, binding: () => binding, leaseHeld: () => true }
	);
	if (!dispatched.ok) throw new Error("expected response");
	expect(dispatched.response.result).toEqual({ kind: "command_receipt", receipt });
});

test("families without a real port map to concrete unavailability", async () => {
	const cases: [RuntimeRequest["operation"], unknown][] = [
		[{ op: "permission_snapshot" }, { kind: "unavailable", family: "permissions", reason: "port_not_configured" }],
		[
			{ op: "receipt_get", operationId: "op-1" },
			{ kind: "unavailable", family: "permissions", reason: "port_not_configured" },
		],
		[{ op: "policy_read" }, { kind: "unavailable", family: "permission_config", reason: "unsupported_operation" }],
		[
			{ op: "policy_apply", expected: { generation: 1, revision: 0 }, changes: [] },
			{ kind: "unavailable", family: "permission_config", reason: "unsupported_operation" },
		],
		[
			{ op: "queue_apply", expected: { generation: 1, revision: 0 }, action: { action: "clear" } },
			{ kind: "unavailable", family: "queue", reason: "sdk_engine_absent" },
		],
		[{ op: "queue_snapshot" }, { kind: "unavailable", family: "queue", reason: "sdk_engine_absent" }],
		[
			{ op: "error_list", afterEventId: null },
			{ kind: "unavailable", family: "errors", reason: "port_not_configured" },
		],
	];
	for (const [operation, result] of cases) {
		const outcome = await dispatchInteractionRequest(request(operation), {
			adapter: new InteractionAdapter(),
			binding: () => binding,
			leaseHeld: () => true,
		});
		if (!outcome.ok) throw new Error(`expected response for ${operation.op}: ${outcome.code}`);
		expect(outcome.response.result).toEqual(result as never);
	}
});

test("permission_decide requires the lease and still reports no producer port", async () => {
	const operation: RuntimeRequest["operation"] = {
		op: "permission_decide",
		producerGeneration: 1,
		handleId: "handle-1",
		requestRevision: 0,
		controllerId: "controller-1",
		controllerGeneration: 1,
		decision: "allow_once",
		optionId: "allow",
	};
	const denied = await dispatchInteractionRequest(request(operation), {
		adapter: new InteractionAdapter(),
		binding: () => binding,
		leaseHeld: () => false,
	});
	expect(denied).toEqual({ ok: false, code: "authority_denied" });

	const outcome = await dispatchInteractionRequest(request(operation), {
		adapter: new InteractionAdapter(),
		binding: () => binding,
		leaseHeld: () => true,
	});
	if (!outcome.ok) throw new Error("expected response");
	expect(outcome.response.result).toEqual({ kind: "unavailable", family: "permissions", reason: "port_not_configured" });
});
