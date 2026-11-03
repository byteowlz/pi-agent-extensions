import { expect, test } from "bun:test";
import type { InteractionPorts } from "./interaction-port.js";
import { type InteractionAdmission, createInteractionRuntime } from "./interaction-runtime.js";
import {
	commandPalette,
	errorView,
	eventNotice,
	paletteDispatchRequest,
	permissionDecisionRequest,
	permissionPrompt,
	queueActionAvailable,
	queueActionRequest,
	queueView,
	statusNotice,
} from "./interaction-terminal.js";
import type { RuntimeBinding } from "./protocol/runtime-interactions/v1/RuntimeBinding.js";
import type { RuntimeCommandCatalog } from "./protocol/runtime-interactions/v1/RuntimeCommandCatalog.js";
import type { RuntimeCommandReceipt } from "./protocol/runtime-interactions/v1/RuntimeCommandReceipt.js";
import type { RuntimeErrorSnapshot } from "./protocol/runtime-interactions/v1/RuntimeErrorSnapshot.js";
import type { RuntimeEvent } from "./protocol/runtime-interactions/v1/RuntimeEvent.js";
import type { RuntimePermissionPresentation } from "./protocol/runtime-interactions/v1/RuntimePermissionPresentation.js";
import type { RuntimePermissionReceipt } from "./protocol/runtime-interactions/v1/RuntimePermissionReceipt.js";
import type { RuntimeQueueSnapshot } from "./protocol/runtime-interactions/v1/RuntimeQueueSnapshot.js";
import { validateRuntimeRequest } from "./wire.js";

const D = "a".repeat(64);
const BINDING: RuntimeBinding = {
	publicSessionId: "public-1",
	nativeSessionId: "native-1",
	runtimeGeneration: "ir:11111111-1111-4111-8111-111111111111",
	controllerId: null,
	controllerGeneration: null,
};
const admission: InteractionAdmission = { binding: () => BINDING, permitted: () => true };

const catalog: RuntimeCommandCatalog = {
	generation: "gen-7",
	coverage: "registered_only",
	commands: [
		{
			commandId: "cmd-subagent",
			invocation: "/subagent",
			description: "Manage subagent delegation",
			origin: "extension",
			arguments: { kind: "raw_string" },
			availability: { state: "available" },
			requiredInteractions: [],
		},
		{
			commandId: "cmd-model",
			invocation: "/model",
			description: "Select a model",
			origin: "builtin",
			arguments: { kind: "raw_string" },
			availability: { state: "available" },
			requiredInteractions: [],
		},
		{
			commandId: "cmd-hidden",
			invocation: "/hidden",
			description: null,
			origin: "extension",
			arguments: { kind: "raw_string" },
			availability: { state: "unavailable", reason: "sdk_engine_absent" },
			requiredInteractions: [],
		},
	],
};
const commandReceipt: RuntimeCommandReceipt = {
	operationId: "op-1",
	commandId: "cmd-subagent",
	disposition: "started",
	rejection: null,
};
const queue: RuntimeQueueSnapshot = {
	cursor: { generation: 7, revision: 3 },
	completeness: "complete",
	steering: [{ itemId: "item-1", text: "focus on the failing test" }],
	followUp: [{ itemId: null, text: "report back" }],
	supportedActions: ["steer", "follow_up", "cancel_item", "clear"],
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
const presentation: RuntimePermissionPresentation = {
	handleId: "handle-1",
	requestId: "req-perm",
	requestRevision: 0,
	subject: { kind: "pi", model: "local/primary", loadout: null, effectDigest: D },
	subjectDigest: D,
	operationDigest: D,
	ceilingDigest: D,
	expiresAtMs: 1_700_000_060_000,
	options: [
		{ optionId: "allow", model: null, effectDigest: D },
		{ optionId: "allow_with_model", model: "local/alternate", effectDigest: D },
	],
};

function producerPorts(calls = { dispatch: 0, decide: 0, apply: 0 }): InteractionPorts {
	return {
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
			snapshot: () => ({ cursor: { generation: 7, revision: 4 }, active: [], receipts: [] }),
			decide: () => {
				calls.decide += 1;
				return permissionReceipt;
			},
			receipt: () => null,
		},
		errors: { snapshot: () => ({ cursor: { generation: 1, revision: 4 }, errors: [] }) },
	};
}

async function execute(
	runtime: ReturnType<typeof createInteractionRuntime>,
	request: Parameters<typeof validateRuntimeRequest>[0]
) {
	if (!validateRuntimeRequest(request))
		throw new Error(`terminal builder produced an invalid request: ${JSON.stringify(request)}`);
	const outcome = await runtime.execute(request as never);
	if (!outcome.ok) throw new Error(`terminal request refused: ${outcome.code}`);
	return outcome.response;
}

test("the command palette renders available commands and builds canonical dispatch", async () => {
	const palette = commandPalette(catalog);
	expect(palette.entries.map((entry) => entry.label)).toEqual(["/subagent", "/model"]);
	expect(commandPalette(catalog, "model").entries.map((entry) => entry.commandId)).toEqual(["cmd-model"]);

	const calls = { dispatch: 0, decide: 0, apply: 0 };
	const runtime = createInteractionRuntime(producerPorts(calls), admission);
	const request = paletteDispatchRequest(catalog, "cmd-subagent", "status --raw='a /name'", "req-1");
	const response = await execute(runtime, request);
	expect(response.result).toEqual({ kind: "command_receipt", receipt: commandReceipt });
	expect(calls.dispatch).toBe(1);
	// Raw arguments pass through untouched.
	expect((request as never as { operation: { args: string } }).operation.args).toBe("status --raw='a /name'");
});

test("the permission prompt shows expiry, deny and cancel, and never auto-allows on expiry", async () => {
	const fresh = permissionPrompt(presentation, presentation.expiresAtMs - 30_000);
	expect(fresh.expired).toBe(false);
	expect(fresh.secondsRemaining).toBe(30);
	expect(fresh.choices.map((choice) => choice.label)).toEqual([
		"Allow once (allow)",
		"Allow once for local/alternate",
		"Deny",
		"Cancel (deny)",
	]);
	expect(fresh.lines.some((line) => line.text.includes("expires in 30s"))).toBe(true);

	const context = { producerGeneration: 1, controllerId: "controller-1", controllerGeneration: 1 };
	const allow = permissionDecisionRequest(presentation, fresh, context, "option:allow_with_model", "req-1");
	expect(validateRuntimeRequest(allow)).toBe(true);
	expect((allow as never as { operation: { decision: string; optionId: string } }).operation).toMatchObject({
		decision: "allow_once",
		optionId: "allow_with_model",
	});

	const calls = { dispatch: 0, decide: 0, apply: 0 };
	const runtime = createInteractionRuntime(producerPorts(calls), admission);
	expect((await execute(runtime, allow)).result).toMatchObject({ kind: "permission_receipt" });
	expect(calls.decide).toBe(1);

	const expired = permissionPrompt(presentation, presentation.expiresAtMs);
	expect(expired.expired).toBe(true);
	expect(expired.choices.filter((choice) => choice.decision === "allow_once").every((choice) => choice.enabled === false)).toBe(
		true
	);
	const cancel = permissionDecisionRequest(presentation, expired, context, "option:allow", "req-2");
	expect((cancel as never as { operation: { decision: string } }).operation.decision).toBe("cancel");
	expect(validateRuntimeRequest(cancel)).toBe(true);
});

test("an unknown or disabled terminal choice cannot become an allow", () => {
	const context = { producerGeneration: 1, controllerId: "controller-1", controllerGeneration: 1 };
	const fresh = permissionPrompt(presentation, presentation.expiresAtMs - 1000);
	expect(() => permissionDecisionRequest(presentation, fresh, context, "option:nope", "req-1")).toThrow();
	const expired = permissionPrompt(presentation, presentation.expiresAtMs + 1);
	// Even an allow row id resolves to cancel once expired.
	const request = permissionDecisionRequest(presentation, expired, context, "option:allow", "req-2");
	expect((request as never as { operation: { decision: string } }).operation.decision).toBe("cancel");
});

test("the queue view shows state and builds CAS actions the runtime can apply", async () => {
	const view = queueView(queue);
	expect(view.items.map((item) => `${item.list}:${item.itemId ?? "null"}`)).toEqual(["steering:item-1", "followUp:null"]);
	expect(view.lines.some((line) => line.text.includes("cursor: 7:3"))).toBe(true);
	expect(queueActionAvailable(queue, "cancel_item")).toBe(true);
	expect(queueActionAvailable({ ...queue, supportedActions: [] }, "clear")).toBe(false);

	const calls = { dispatch: 0, decide: 0, apply: 0 };
	const runtime = createInteractionRuntime(producerPorts(calls), admission);
	const steer = queueActionRequest(queue, { action: "steer", text: "also check the CI log" }, "req-1");
	expect((steer as never as { operation: { expected: unknown } }).operation.expected).toEqual({ generation: 7, revision: 3 });
	expect((await execute(runtime, steer)).result).toEqual({ kind: "queue", snapshot: queue });
	expect(calls.apply).toBe(1);

	expect(() => queueActionRequest(queue, { action: "reorder", itemIds: ["item-1"] }, "req-2")).toThrow();
});

test("errors and notices are visible terminal text", () => {
	const errors: RuntimeErrorSnapshot = {
		cursor: { generation: 1, revision: 4 },
		errors: [
			{
				eventId: "event-1",
				operationId: "op-9",
				source: "command",
				code: "engine_failure",
				message: "engine unavailable",
				phase: "dispatch",
				recoverable: true,
				uncertain: false,
			},
		],
	};
	const lines = errorView(errors)
		.lines.map((line) => line.text)
		.join("\n");
	expect(lines).toContain("command/engine_failure");
	expect(lines).toContain("(recoverable)");
	expect(lines).toContain("phase: dispatch");
	expect(lines).toContain("event: event-1");

	const notice = (event: RuntimeEvent) => eventNotice(event).line;
	const base = { version: 1 as const, eventId: "event-1", binding: BINDING };
	expect(notice({ ...base, payload: { kind: "queue", snapshot: queue } })).toContain("2 pending");
	expect(
		notice({
			...base,
			payload: { kind: "permissions", snapshot: { cursor: { generation: 1, revision: 0 }, active: [], receipts: [] } },
		})
	).toContain("0 awaiting");
	expect(notice({ ...base, payload: { kind: "error", error: errors.errors[0] } })).toContain("command/engine_failure");
	expect(
		eventNotice({ ...base, payload: { kind: "command_outcome", operationId: "op-1", state: "failed", errorId: "e1" } })
	).toMatchObject({ severity: "error" });

	for (const code of [
		"not_negotiated",
		"source_unavailable",
		"source_changed",
		"binding_unavailable",
		"authority_denied",
		"unsupported_operation",
		"invalid_request",
	] as const) {
		const status = statusNotice(code);
		expect(status.line).not.toContain("success");
		expect(status.line.length).toBeGreaterThan(0);
	}
});
