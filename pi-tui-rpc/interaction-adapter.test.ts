import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Receipt } from "../pi-session-tools/permission-producer.js";
import { InteractionAdapter } from "./interaction-adapter.js";
import type {
	CatalogEntry,
	CommandDispatchRequest,
	CommandEnginePort,
	InteractionErrorView,
	PermissionPresentation,
	QueueSnapshotView,
} from "./interaction-port.js";

const FIXTURES = join(import.meta.dir, "fixtures", "runtime-interactions");
function fixture<T>(name: string): T {
	return JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;
}

const catalogEntry = () => fixture<{ entry: CatalogEntry }>("catalog-entry.json").entry;
const dispatchFixture = () =>
	fixture<{ request: CommandDispatchRequest; receipt: { name: string; disposition: string } }>("dispatch-receipt.json");

class FakeCommands implements CommandEnginePort {
	calls: CommandDispatchRequest[] = [];
	generation?: string;
	fail = false;
	constructor(generation?: string) {
		this.generation = generation;
	}
	catalog() {
		return { entries: [catalogEntry()], ...(this.generation ? { generation: this.generation } : {}) };
	}
	dispatch(request: CommandDispatchRequest) {
		if (this.fail) throw new Error("engine down");
		this.calls.push(request);
		return { name: request.name, disposition: "started" as const, operationId: "op-1" };
	}
}

test("with no ports every capability is honestly unavailable", () => {
	const adapter = new InteractionAdapter();
	const expected = fixture<{ capabilities: unknown }>("provisional-capabilities.json").capabilities;
	expect(adapter.capabilities()).toEqual(expected);
	expect(adapter.capabilities().every((report) => report.state === "unavailable")).toBe(true);
});

test("dispatch never falls back to a prompt and is unavailable without an engine", async () => {
	const adapter = new InteractionAdapter();
	const { request } = dispatchFixture();
	expect(await adapter.dispatch(request)).toEqual({
		kind: "unavailable",
		capability: "commands",
		reason: "sdk_engine_absent",
	});
	// The adapter exposes no prompt/send method at all: the only command paths are
	// catalog/dispatch through a real engine port.
	const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(adapter)).filter((name) => name !== "constructor");
	expect(surface.some((name) => /prompt|message|send/i.test(name))).toBe(false);
});

test("source files contain no raw-prompt shim and are not wired into active routing", () => {
	// Scan code only: the doc comments deliberately *name* the rejected shim.
	const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
	const source = ["interaction-port.ts", "interaction-adapter.ts"]
		.map((name) => stripComments(readFileSync(join(import.meta.dir, name), "utf8")))
		.join("\n");
	for (const forbidden of ["sendUserMessage", "expandPromptTemplates", "hub.", "dispatchCommand", "lease."]) {
		expect(source).not.toContain(forbidden);
	}
	const index = readFileSync(join(import.meta.dir, "index.ts"), "utf8");
	expect(index).not.toContain("interaction-adapter");
	expect(index).not.toContain("interaction-port");
});

test("a real engine port provides catalog and dispatch receipts without inventing completion", async () => {
	const commands = new FakeCommands();
	const adapter = new InteractionAdapter({ ports: { commands } });
	expect(adapter.capabilities().find((report) => report.capability === "commands")).toEqual({
		capability: "commands",
		state: "available",
	});
	const catalog = await adapter.catalog();
	expect(catalog).toEqual({ kind: "ok", value: [catalogEntry()] });

	const { request } = dispatchFixture();
	const receipt = await adapter.dispatch(request);
	expect(receipt.kind).toBe("ok");
	if (receipt.kind !== "ok") throw new Error("expected receipt");
	expect(receipt.value.disposition).toBe("started");
	expect(Object.keys(receipt.value).sort()).toEqual(["disposition", "name", "operationId"]);
	expect(commands.calls[0]).toEqual({ name: "subagent", args: "status" });
});

test("catalog generation is compared, never ignored or synthesized", async () => {
	const stale = new InteractionAdapter({ ports: { commands: new FakeCommands("gen-1") } });
	const rejected = await stale.dispatch({ name: "subagent", args: "", generation: "gen-0" });
	expect(rejected).toMatchObject({ kind: "rejected", code: "catalog_generation_unavailable" });

	const noGeneration = new InteractionAdapter({ ports: { commands: new FakeCommands() } });
	const unavailable = await noGeneration.dispatch({ name: "subagent", args: "", generation: "gen-1" });
	expect(unavailable).toMatchObject({ kind: "unavailable", capability: "commands" });

	const current = new InteractionAdapter({ ports: { commands: new FakeCommands("gen-1") } });
	expect(await current.dispatch({ name: "subagent", args: "", generation: "gen-1" })).toMatchObject({ kind: "ok" });
});

test("engine failure and malformed catalog entries are rejected, not guessed", async () => {
	const failing = new FakeCommands();
	failing.fail = true;
	const adapter = new InteractionAdapter({ ports: { commands: failing } });
	expect(await adapter.dispatch({ name: "subagent", args: "" })).toMatchObject({
		kind: "rejected",
		code: "engine_failure",
	});

	const bad = new InteractionAdapter({
		ports: {
			commands: {
				catalog: () => ({ entries: [{ ...catalogEntry(), source: "builtin" as never }] }),
				dispatch: () => ({ name: "x", disposition: "started" as const }),
			},
		},
	});
	expect(await bad.catalog()).toMatchObject({ kind: "rejected", code: "invalid_request" });
});

test("queue snapshots are authoritative views, unavailable without an engine", async () => {
	const snapshot = fixture<{ snapshot: QueueSnapshotView }>("queue-snapshot.json").snapshot;
	const adapter = new InteractionAdapter({ ports: { queue: { snapshot: () => snapshot } } });
	expect(await adapter.queueSnapshot()).toEqual({ kind: "ok", value: snapshot });
	expect(new InteractionAdapter().queueSnapshot()).resolves.toMatchObject({
		kind: "unavailable",
		capability: "queue",
	});

	const invalid = new InteractionAdapter({
		ports: { queue: { snapshot: () => ({ steering: [{ text: 1 as never }], followUp: [] }) } },
	});
	expect(await invalid.queueSnapshot()).toMatchObject({ kind: "rejected", code: "invalid_request" });
});

test("permission presentation is gated on vendored DTOs and never decides", async () => {
	const { presentation, answer } = fixture<{
		presentation: PermissionPresentation;
		answer: { decision: "allow"; optionId: string };
	}>("permission-presentation.json");
	const calls: PermissionPresentation[] = [];
	const permissions = {
		present: (request: PermissionPresentation) => {
			calls.push(request);
			return answer;
		},
	};

	// Port present but DTOs not vendored: no presentation, no default allow.
	const notVendored = new InteractionAdapter({ ports: { permissions } });
	expect(await notVendored.presentPermission(presentation)).toEqual({
		kind: "unavailable",
		capability: "permissions",
		reason: "generated_dto_not_vendored",
	});
	expect(calls).toHaveLength(0);

	// No presenter at all: unavailable, still no fabricated answer.
	const noPort = new InteractionAdapter({ dtoVendored: true });
	expect(await noPort.presentPermission(presentation)).toMatchObject({ kind: "unavailable", reason: "sdk_engine_absent" });

	const adapter = new InteractionAdapter({ ports: { permissions }, dtoVendored: true, now: () => 1_700_000_000_000 });
	expect(await adapter.presentPermission(presentation)).toEqual({ kind: "ok", value: answer });
	expect(calls[0].serverNow).toBe(1_700_000_000_000);
	expect(calls[0].options.map((option) => option.id)).toEqual(["allow", "allow_with_model", "deny"]);
});

test("a presenter answer must be explicit allow or deny", async () => {
	const { presentation } = fixture<{ presentation: PermissionPresentation }>("permission-presentation.json");
	const adapter = new InteractionAdapter({
		dtoVendored: true,
		ports: { permissions: { present: () => ({ decision: "maybe" as never }) } },
	});
	expect(await adapter.presentPermission(presentation)).toMatchObject({ kind: "rejected", code: "invalid_request" });
});

test("receipt projection keeps identity and reason and drops private detail", () => {
	const receipt = {
		version: 1,
		runtimeGeneration: 1,
		producerRevision: 7,
		handleId: "handle-1",
		requestId: "req-1",
		revision: 0,
		kind: "decision",
		outcome: "allow",
		optionId: "allow",
		reason: "explicit_allow",
		source: "adapter",
		controllerId: "controller-1",
		nativeSessionDigest: "digest",
		subjectDigest: "subject",
		operationDigest: "operation",
		at: 1_700_000_000_000,
		task: "PRIVATE TASK",
	} as unknown as Receipt;
	const view = new InteractionAdapter().permissionReceipt(receipt);
	expect(view).toEqual({
		handleId: "handle-1",
		requestId: "req-1",
		kind: "decision",
		outcome: "allow",
		reason: "explicit_allow",
		at: 1_700_000_000_000,
	});
	expect(JSON.stringify(view)).not.toContain("PRIVATE TASK");
});

test("errors are a retained projection, not an invented journal", async () => {
	const errors = fixture<{ errors: InteractionErrorView[] }>("errors.json").errors;
	const adapter = new InteractionAdapter({ ports: { errors: { recent: () => errors } } });
	expect(await adapter.recentErrors()).toEqual({ kind: "ok", value: errors });
	expect(await new InteractionAdapter().recentErrors()).toMatchObject({
		kind: "unavailable",
		capability: "errors",
		reason: "port_not_configured",
	});
	const failing = new InteractionAdapter({
		ports: {
			errors: {
				recent: () => {
					throw new Error("boom");
				},
			},
		},
	});
	expect(await failing.recentErrors()).toMatchObject({ kind: "rejected", code: "engine_failure" });
});

test("fixtures are explicitly provisional, never normative wire material", () => {
	for (const name of [
		"provisional-capabilities.json",
		"dispatch-receipt.json",
		"catalog-entry.json",
		"queue-snapshot.json",
		"permission-presentation.json",
		"errors.json",
	]) {
		const body = fixture<{ provisional: boolean; normative: boolean }>(name);
		expect(body.provisional).toBe(true);
		expect(body.normative).toBe(false);
	}
});
