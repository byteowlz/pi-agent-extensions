import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { InteractionAdapter } from "./interaction-adapter.js";
import type { CommandEnginePort, ErrorSourcePort, QueueEnginePort } from "./interaction-port.js";
import type { RuntimeCommandCatalog } from "./protocol/runtime-interactions/v1/RuntimeCommandCatalog.js";
import type { RuntimeCommandReceipt } from "./protocol/runtime-interactions/v1/RuntimeCommandReceipt.js";
import type { RuntimeErrorSnapshot } from "./protocol/runtime-interactions/v1/RuntimeErrorSnapshot.js";
import type { RuntimePermissionPresentation } from "./protocol/runtime-interactions/v1/RuntimePermissionPresentation.js";
import type { RuntimeQueueSnapshot } from "./protocol/runtime-interactions/v1/RuntimeQueueSnapshot.js";

const catalog: RuntimeCommandCatalog = {
	generation: "gen-7",
	coverage: "registered_only",
	commands: [
		{
			commandId: "cmd-subagent",
			invocation: "subagent",
			description: "Manage subagent delegation",
			origin: "extension",
			arguments: { kind: "raw_string" },
			availability: { state: "available" },
			requiredInteractions: [],
		},
	],
};

const receipt: RuntimeCommandReceipt = {
	operationId: "op-1",
	commandId: "cmd-subagent",
	disposition: "started",
	rejection: null,
};

const queue: RuntimeQueueSnapshot = {
	cursor: { generation: 7, revision: 3 },
	completeness: "complete",
	steering: [{ itemId: null, text: "focus on the failing test" }],
	followUp: [{ itemId: "item-2", text: "report back" }],
	supportedActions: ["steer", "follow_up"],
};

const DIGEST = "a".repeat(64);

const presentation: RuntimePermissionPresentation = {
	handleId: "handle-1",
	requestId: "req-1",
	requestRevision: 0,
	subject: null,
	subjectDigest: DIGEST,
	operationDigest: DIGEST,
	ceilingDigest: DIGEST,
	expiresAtMs: 1_700_000_060_000,
	options: [
		{ optionId: "allow", model: null, effectDigest: DIGEST },
		{ optionId: "allow_with_model", model: "local/alternate", effectDigest: DIGEST },
		{ optionId: "deny", model: null, effectDigest: DIGEST },
	],
};

const errors: RuntimeErrorSnapshot = {
	cursor: { generation: 1, revision: 4 },
	errors: [
		{
			eventId: "event-1",
			operationId: "op-9",
			source: "command",
			code: "unknown_command",
			message: "No such registered command",
			phase: "dispatch",
			recoverable: true,
			uncertain: false,
		},
	],
};

class FakeCommands implements CommandEnginePort {
	dispatched: unknown[] = [];
	fail = false;
	constructor(private readonly override?: Partial<RuntimeCommandReceipt>) {}
	catalog() {
		return catalog;
	}
	dispatch(operation: { commandId: string; args: string; catalogGeneration: string | number }) {
		if (this.fail) throw new Error("engine down");
		this.dispatched.push(operation);
		return { ...receipt, ...this.override };
	}
}

test("vendored DTOs alone never make a family available", () => {
	const report = new InteractionAdapter().capabilities();
	expect(report).toEqual([
		{ family: "commands", state: "unavailable", reason: "sdk_engine_absent" },
		{ family: "queue", state: "unavailable", reason: "sdk_engine_absent" },
		{ family: "permissions", state: "unavailable", reason: "port_not_configured" },
		{ family: "permission_config", state: "unavailable", reason: "unsupported_operation" },
		{ family: "errors", state: "unavailable", reason: "port_not_configured" },
	]);
});

test("no engine port means unavailable, never a prompt or a fabricated result", async () => {
	const adapter = new InteractionAdapter();
	expect(await adapter.catalog()).toMatchObject({ kind: "unavailable", family: "commands", reason: "sdk_engine_absent" });
	expect(await adapter.dispatch({ commandId: "cmd", args: "", catalogGeneration: "g" })).toMatchObject({
		kind: "unavailable",
		family: "commands",
	});
	expect(await adapter.queueSnapshot()).toMatchObject({ kind: "unavailable", family: "queue" });
	expect(await adapter.errorSnapshot(null)).toMatchObject({ kind: "unavailable", family: "errors" });
	const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(adapter));
	expect(surface.some((name) => /prompt|message|send/i.test(name))).toBe(false);
});

test("bridge modules contain no raw-prompt shim and leave lease/reload read-only", () => {
	const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
	const files = ["interaction-port.ts", "interaction-adapter.ts", "wire.ts"].map((name) =>
		stripComments(readFileSync(join(import.meta.dir, name), "utf8"))
	);
	for (const source of files) {
		for (const forbidden of ["sendUserMessage", "expandPromptTemplates", "dispatchCommand", "lease."]) {
			expect(source).not.toContain(forbidden);
		}
	}
});

test("catalog and dispatch pass canonical results through and never invent an operation id", async () => {
	const commands = new FakeCommands();
	const adapter = new InteractionAdapter({ ports: { commands } });
	expect(adapter.capabilities().find((entry) => entry.family === "commands")).toEqual({
		family: "commands",
		state: "available",
	});
	expect(await adapter.catalog()).toEqual({ kind: "ok", value: catalog });

	const result = await adapter.dispatch({
		commandId: "cmd-subagent",
		args: "  --x='literal /name' ",
		catalogGeneration: "gen-7",
	});
	expect(result).toEqual({ kind: "ok", value: receipt });
	expect(commands.dispatched[0]).toEqual({
		commandId: "cmd-subagent",
		args: "  --x='literal /name' ",
		catalogGeneration: "gen-7",
	});

	const missingId = new InteractionAdapter({ ports: { commands: new FakeCommands({ operationId: "" }) } });
	expect(await missingId.dispatch({ commandId: "cmd", args: "", catalogGeneration: "g" })).toMatchObject({
		kind: "rejected",
		code: "engine_failure",
	});
});

test("malformed canonical outputs are engine failures, not coerced", async () => {
	const badCatalog = new InteractionAdapter({
		ports: {
			commands: {
				catalog: () => ({ ...catalog, generation: undefined as never }),
				dispatch: () => receipt,
			},
		},
	});
	expect(await badCatalog.catalog()).toMatchObject({ kind: "rejected", code: "engine_failure" });

	const failing = new InteractionAdapter({ ports: { commands: new FakeCommands() } });
	expect(await failing.dispatch({ commandId: "", args: "" })).toMatchObject({ kind: "rejected", code: "invalid_request" });

	const throwing: CommandEnginePort = {
		catalog: () => {
			throw new Error("down");
		},
		dispatch: () => receipt,
	};
	expect(await new InteractionAdapter({ ports: { commands: throwing } }).catalog()).toMatchObject({
		kind: "rejected",
		code: "engine_failure",
	});
});

test("queue snapshots are canonical and unavailable without an engine", async () => {
	const port: QueueEnginePort = { snapshot: () => queue };
	expect(await new InteractionAdapter({ ports: { queue: port } }).queueSnapshot()).toEqual({ kind: "ok", value: queue });

	const invalid = new InteractionAdapter({
		ports: { queue: { snapshot: () => ({ ...queue, cursor: { generation: 1, revision: -1 } }) } },
	});
	expect(await invalid.queueSnapshot()).toMatchObject({ kind: "rejected", code: "engine_failure" });
});

test("permission presentation is transport only and requires an explicit canonical decision", async () => {
	const answers: RuntimePermissionPresentation[] = [];
	const adapter = new InteractionAdapter({
		ports: {
			permissions: {
				present: (value) => {
					answers.push(value);
					return { decision: "allow_once", optionId: "allow_with_model" };
				},
			},
		},
		now: () => 1_700_000_000_000,
	});
	expect(adapter.capabilities().find((entry) => entry.family === "permissions")).toEqual({
		family: "permissions",
		state: "available",
	});
	expect(await adapter.presentPermission(presentation)).toEqual({
		kind: "ok",
		value: { decision: "allow_once", optionId: "allow_with_model" },
	});
	expect(answers[0].requestId).toBe("req-1");

	// No port: unavailable, never a default allow.
	expect(await new InteractionAdapter().presentPermission(presentation)).toMatchObject({
		kind: "unavailable",
		family: "permissions",
		reason: "port_not_configured",
	});

	// A non-canonical answer (e.g. generic "allow") is rejected, not mapped.
	const loose = new InteractionAdapter({
		ports: { permissions: { present: () => ({ decision: "allow" as never, optionId: "allow" }) } },
	});
	expect(await loose.presentPermission(presentation)).toMatchObject({ kind: "rejected", code: "invalid_request" });
});

test("port outputs with extra or forged fields are rejected by the canonical schema", async () => {
	const forged = new InteractionAdapter({
		ports: {
			commands: {
				catalog: () => ({ ...catalog, forgedAuthority: true }) as never,
				dispatch: () => ({ ...receipt, task: "private" }) as never,
			},
		},
	});
	expect(await forged.catalog()).toMatchObject({ kind: "rejected", code: "engine_failure" });
	expect(await forged.dispatch({ commandId: "cmd-subagent", args: "", catalogGeneration: "gen-7" })).toMatchObject({
		kind: "rejected",
		code: "engine_failure",
	});

	const queueForged = new InteractionAdapter({
		ports: { queue: { snapshot: () => ({ ...queue, extra: 1 }) as never } },
	});
	expect(await queueForged.queueSnapshot()).toMatchObject({ kind: "rejected", code: "engine_failure" });

	const errorsForged = new InteractionAdapter({
		ports: { errors: { snapshot: () => ({ ...errors, errors: [{ ...errors.errors[0], token: "x" }] }) as never } },
	});
	expect(await errorsForged.errorSnapshot(null)).toMatchObject({ kind: "rejected", code: "engine_failure" });
});

test("error snapshots project retained canonical errors", async () => {
	const port: ErrorSourcePort = { snapshot: (after) => ({ ...errors, cursor: { ...errors.cursor, revision: after ? 5 : 4 } }) };
	const adapter = new InteractionAdapter({ ports: { errors: port } });
	expect(await adapter.errorSnapshot(null)).toEqual({ kind: "ok", value: errors });
	expect(await adapter.errorSnapshot("event-0")).toMatchObject({ kind: "ok", value: { cursor: { revision: 5 } } });

	const invalid = new InteractionAdapter({
		ports: { errors: { snapshot: () => ({ ...errors, errors: [{ ...errors.errors[0], eventId: "" }] }) } },
	});
	expect(await invalid.errorSnapshot(null)).toMatchObject({ kind: "rejected", code: "engine_failure" });
});
