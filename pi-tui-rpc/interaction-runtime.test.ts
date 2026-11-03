import { expect, test } from "bun:test";
import { InteractionAdapter } from "./interaction-adapter.js";
import type { InteractionPorts } from "./interaction-port.js";
import { type InteractionAdmission, createInteractionRuntime } from "./interaction-runtime.js";
import type { RuntimeBinding } from "./protocol/runtime-interactions/v1/RuntimeBinding.js";
import type { RuntimeCommandCatalog } from "./protocol/runtime-interactions/v1/RuntimeCommandCatalog.js";
import type { RuntimeCommandReceipt } from "./protocol/runtime-interactions/v1/RuntimeCommandReceipt.js";
import type { RuntimeErrorSnapshot } from "./protocol/runtime-interactions/v1/RuntimeErrorSnapshot.js";
import type { RuntimeEvent } from "./protocol/runtime-interactions/v1/RuntimeEvent.js";
import type { RuntimePermissionReceipt } from "./protocol/runtime-interactions/v1/RuntimePermissionReceipt.js";
import type { RuntimePermissionSnapshot } from "./protocol/runtime-interactions/v1/RuntimePermissionSnapshot.js";
import type { RuntimeQueueSnapshot } from "./protocol/runtime-interactions/v1/RuntimeQueueSnapshot.js";
import type { RuntimeRequest } from "./protocol/runtime-interactions/v1/RuntimeRequest.js";

const D = "a".repeat(64);
const BINDING: RuntimeBinding = {
	publicSessionId: "public-1",
	nativeSessionId: "native-1",
	runtimeGeneration: "ir:11111111-1111-4111-8111-111111111111",
	controllerId: null,
	controllerGeneration: null,
};

const catalog: RuntimeCommandCatalog = {
	generation: "gen-7",
	coverage: "registered_only",
	commands: [
		{
			commandId: "cmd-1",
			invocation: "/one",
			description: null,
			origin: "extension",
			arguments: { kind: "raw_string" },
			availability: { state: "available" },
			requiredInteractions: [],
		},
	],
};
const commandReceipt: RuntimeCommandReceipt = {
	operationId: "op-1",
	commandId: "cmd-1",
	disposition: "started",
	rejection: null,
};
const queue: RuntimeQueueSnapshot = {
	cursor: { generation: 7, revision: 3 },
	completeness: "complete",
	steering: [{ itemId: null, text: "focus" }],
	followUp: [],
	supportedActions: ["steer"],
};
const errors: RuntimeErrorSnapshot = { cursor: { generation: 1, revision: 4 }, errors: [] };
const permissions: RuntimePermissionSnapshot = {
	cursor: { generation: 7, revision: 4 },
	active: [],
	receipts: [],
};
const permissionReceipt: RuntimePermissionReceipt = {
	cursor: { generation: 7, revision: 5 },
	handleId: "handle-1",
	requestId: "req-perm",
	requestRevision: 0,
	kind: "decision",
	outcome: "allow",
	optionId: "allow",
	reason: "explicit_allow",
	source: "adapter",
	controllerId: "controller-1",
	nativeSessionDigest: D,
	subjectDigest: D,
	operationDigest: D,
	atMs: 1,
	restored: false,
};

function request(operation: RuntimeRequest["operation"], requestId = "req-1"): RuntimeRequest {
	return { version: 1, requestId, operation };
}

function fakeProducerPorts(over: { onDecide?: () => void } = {}) {
	const calls = { decide: 0, dispatch: 0, apply: 0, subscriptions: 0 };
	const listeners = new Set<(event: RuntimeEvent) => void>();
	const ports: InteractionPorts = {
		commands: {
			catalog: () => catalog,
			dispatch: () => {
				calls.dispatch += 1;
				return commandReceipt;
			},
		},
		queue: {
			snapshot: () => queue,
			apply: () => {
				calls.apply += 1;
				return queue;
			},
		},
		permissionRegistry: {
			snapshot: () => permissions,
			decide: () => {
				calls.decide += 1;
				over.onDecide?.();
				return permissionReceipt;
			},
			receipt: (operationId) => (operationId === "op-1" ? commandReceipt : null),
		},
		errors: { snapshot: () => errors },
		events: {
			subscribe(listener) {
				calls.subscriptions += 1;
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		},
	};
	const emit = (event: RuntimeEvent) => {
		for (const listener of listeners) listener(event);
	};
	return { ports, calls, emit };
}

function admission(binding: RuntimeBinding | undefined = BINDING, permitted = () => true): InteractionAdmission {
	return { binding: () => binding, permitted: () => permitted() };
}

async function executeOk(runtime: ReturnType<typeof createInteractionRuntime>, operation: RuntimeRequest["operation"]) {
	const outcome = await runtime.execute(request(operation));
	if (!outcome.ok) throw new Error(`expected response, got ${outcome.code}`);
	return outcome.response;
}

test("a managed producer and the personal bridge adapter satisfy the same typed contract", async () => {
	const managed = fakeProducerPorts();
	const managedRuntime = createInteractionRuntime(managed.ports, admission());

	const personal = new InteractionAdapter({
		ports: {
			commands: managed.ports.commands,
			queue: managed.ports.queue,
			errors: managed.ports.errors,
		},
	});
	const personalRuntime = createInteractionRuntime(personal.enginePorts(), admission());

	for (const operation of [
		{ op: "command_catalog" as const },
		{ op: "command_dispatch" as const, catalogGeneration: "gen-7", commandId: "cmd-1", args: "  --raw='x /name' " },
		{ op: "queue_snapshot" as const },
		{ op: "error_list" as const, afterEventId: null },
	] satisfies RuntimeRequest["operation"][]) {
		const a = await executeOk(managedRuntime, operation);
		const b = await executeOk(personalRuntime, operation);
		expect(b.result).toEqual(a.result);
		expect(b.binding).toEqual(a.binding);
	}
});

test("capabilities come from supplied ports only, never from DTO presence", async () => {
	const noPorts = createInteractionRuntime({}, admission());
	expect(noPorts.capabilities()).toEqual([
		{ state: "unavailable", family: "commands", reason: "sdk_engine_absent" },
		{ state: "unavailable", family: "queue", reason: "sdk_engine_absent" },
		{ state: "unavailable", family: "permissions", reason: "port_not_configured" },
		{ state: "unavailable", family: "permission_config", reason: "unsupported_operation" },
		{ state: "unavailable", family: "errors", reason: "port_not_configured" },
	]);
	const withProducer = createInteractionRuntime(fakeProducerPorts().ports, admission());
	expect(withProducer.capabilities().find((cap) => cap.family === "permissions")).toEqual({
		state: "available",
		family: "permissions",
	});
});

test("no admission means no response; mutating operations are denied by default", async () => {
	const { ports } = fakeProducerPorts();
	const unbound = createInteractionRuntime(ports, { binding: () => undefined, permitted: () => true });
	expect(await unbound.execute(request({ op: "capabilities" }))).toEqual({ ok: false, code: "binding_unavailable" });

	const denied = createInteractionRuntime(ports, { binding: () => BINDING, permitted: () => false });
	expect(await denied.execute(request({ op: "capabilities" }))).toMatchObject({ ok: true });
	expect(await denied.execute(request({ op: "command_dispatch", catalogGeneration: "g", commandId: "cmd-1", args: "" }))).toEqual(
		{ ok: false, code: "authority_denied" }
	);
	expect(
		await denied.execute(
			request({
				op: "permission_decide",
				producerGeneration: 1,
				handleId: "handle-1",
				requestRevision: 0,
				controllerId: "controller-1",
				controllerGeneration: 1,
				decision: "allow_once",
				optionId: "allow",
			})
		)
	).toEqual({ ok: false, code: "authority_denied" });
});

test("a binding or permission revoked during the await cannot return a stale success", async () => {
	let live: RuntimeBinding | undefined = BINDING;
	let allowed = true;
	const ports = fakeProducerPorts();
	const runtime = createInteractionRuntime(ports.ports, {
		binding: () => live,
		permitted: () => allowed,
	});
	const pending = runtime.execute(request({ op: "command_dispatch", catalogGeneration: "g", commandId: "cmd-1", args: "" }));
	live = undefined;
	expect(await pending).toEqual({ ok: false, code: "binding_unavailable" });

	live = BINDING;
	allowed = true;
	const pending2 = runtime.execute(request({ op: "command_dispatch", catalogGeneration: "g", commandId: "cmd-1", args: "" }));
	allowed = false;
	expect(await pending2).toEqual({ ok: false, code: "authority_denied" });

	live = { ...BINDING, runtimeGeneration: "ir:22222222-2222-4222-8222-222222222222" };
	expect(await runtime.execute(request({ op: "command_catalog" }))).toMatchObject({
		ok: true,
		response: { binding: { runtimeGeneration: "ir:22222222-2222-4222-8222-222222222222" } },
	});
});

test("permission decisions go only to the authoritative producer port, never a presenter", async () => {
	const presented: unknown[] = [];
	const presenterOnly: InteractionPorts = {
		permissions: {
			present: (presentation) => {
				presented.push(presentation);
				return { decision: "allow_once", optionId: "allow" };
			},
		},
	};
	const runtime = createInteractionRuntime(presenterOnly, admission());
	const decision = await runtime.execute(
		request({
			op: "permission_decide",
			producerGeneration: 1,
			handleId: "handle-1",
			requestRevision: 0,
			controllerId: "controller-1",
			controllerGeneration: 1,
			decision: "allow_once",
			optionId: "allow",
		})
	);
	if (!decision.ok) throw new Error("expected response");
	expect(decision.response.result).toEqual({ kind: "unavailable", family: "permissions", reason: "port_not_configured" });
	expect(presented).toHaveLength(0);
	expect(runtime.capabilities().find((cap) => cap.family === "permissions")).toMatchObject({ state: "unavailable" });
});

test("receipts are producer-issued: no runtime cache and no replay suppression", async () => {
	const producer = fakeProducerPorts();
	const runtime = createInteractionRuntime(producer.ports, admission());
	const decide = () =>
		runtime.execute(
			request({
				op: "permission_decide",
				producerGeneration: 1,
				handleId: "handle-1",
				requestRevision: 0,
				controllerId: "controller-1",
				controllerGeneration: 1,
				decision: "allow_once",
				optionId: "allow",
			})
		);
	const first = await decide();
	const second = await decide();
	if (!first.ok || !second.ok) throw new Error("expected responses");
	expect(first.response.result).toMatchObject({ kind: "permission_receipt" });
	expect(second.response.result).toEqual(first.response.result);
	// One-shot consumption belongs to the producer; the runtime never caches grants.
	expect(producer.calls.decide).toBe(2);
});

test("queue actions, snapshots and receipt lookup use the same canonical results", async () => {
	const producer = fakeProducerPorts();
	const runtime = createInteractionRuntime(producer.ports, admission());
	expect((await executeOk(runtime, { op: "queue_snapshot" })).result).toEqual({ kind: "queue", snapshot: queue });
	expect(
		(await executeOk(runtime, { op: "queue_apply", expected: { generation: 7, revision: 3 }, action: { action: "clear" } }))
			.result
	).toEqual({ kind: "queue", snapshot: queue });
	expect(producer.calls.apply).toBe(1);
	expect((await executeOk(runtime, { op: "receipt_get", operationId: "op-1" })).result).toEqual({
		kind: "command_receipt",
		receipt: commandReceipt,
	});
	expect((await executeOk(runtime, { op: "receipt_get", operationId: "missing" })).result).toEqual({
		kind: "unavailable",
		family: "permissions",
		reason: "port_not_configured",
	});

	const noEngine = createInteractionRuntime({}, admission());
	expect((await executeOk(noEngine, { op: "queue_snapshot" })).result).toEqual({
		kind: "unavailable",
		family: "queue",
		reason: "sdk_engine_absent",
	});
});

test("policy remains a separate owner-write authority and is unsupported here", async () => {
	const runtime = createInteractionRuntime(fakeProducerPorts().ports, admission());
	for (const operation of [
		{ op: "policy_read" as const },
		{ op: "policy_apply" as const, expected: { generation: 1, revision: 0 }, changes: [] },
	]) {
		expect((await executeOk(runtime, operation)).result).toEqual({
			kind: "unavailable",
			family: "permission_config",
			reason: "unsupported_operation",
		});
	}
});

test("canonical events come from the supplied port with caller-side delivery gating", () => {
	const producer = fakeProducerPorts();
	const runtime = createInteractionRuntime(producer.ports, admission());
	const seen: RuntimeEvent[] = [];
	const off = runtime.subscribe((event) => seen.push(event));
	const event: RuntimeEvent = {
		version: 1,
		eventId: "event-1",
		binding: BINDING,
		payload: { kind: "command_outcome", operationId: "op-1", state: "started", errorId: null },
	};
	producer.emit(event);
	off();
	producer.emit(event);
	expect(seen).toEqual([event]);
	expect(producer.calls.subscriptions).toBe(1);

	// No port: subscribing is a no-op rather than an error.
	const bare = createInteractionRuntime({}, admission());
	expect(() => bare.subscribe(() => {})()).not.toThrow();
});
