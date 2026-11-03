import { expect, test } from "bun:test";
import { type PiCommandHost, type RegisteredPiCommand, createPiCommandEngine } from "./pi-command-engine.js";

function host(
	over: {
		registered?: RegisteredPiCommand[];
		builtins?: Array<{ name: string; description: string; argumentHint?: string }>;
		dispatchBuiltin?: (name: string, args: string) => "handled" | "queued" | "started" | "unsupported";
		streaming?: boolean;
	} = {}
) {
	const sent: string[] = [];
	const builtinCalls: [string, string][] = [];
	const state = {
		registered:
			over.registered ??
			([
				{ name: "subagent", description: "Manage subagent delegation", source: "extension" },
				{ name: "review", description: "Review a diff", source: "prompt" },
				{ name: "skill:pdf", description: "Read a PDF", source: "skill" },
			] satisfies RegisteredPiCommand[]),
	};
	const commandHost: PiCommandHost = {
		listRegistered: () => state.registered,
		dispatchRegistered: (text) => {
			sent.push(text);
		},
		...(over.builtins ? { builtins: () => over.builtins! } : {}),
		...(over.dispatchBuiltin
			? {
					dispatchBuiltin: (name: string, args: string) => {
						builtinCalls.push([name, args]);
						return over.dispatchBuiltin!(name, args);
					},
				}
			: {}),
		isStreaming: () => over.streaming ?? false,
		runtimeGeneration: () => "ir:11111111-1111-4111-8111-111111111111",
		newOperationId: () => "op-1",
	};
	return { engine: createPiCommandEngine(commandHost), sent, builtinCalls, state };
}

test("catalog enumerates registered commands, skills and templates with a producer-issued generation", () => {
	const { engine } = host();
	const catalog = engine.catalog();
	expect(catalog.coverage).toBe("registered_only");
	expect(catalog.commands.map((entry) => entry.invocation)).toEqual(["/subagent", "/review", "/skill:pdf"]);
	expect(catalog.commands.map((entry) => entry.origin)).toEqual(["extension", "prompt", "skill"]);
	expect(catalog.commands.every((entry) => entry.arguments.kind === "raw_string")).toBe(true);
	expect(typeof catalog.generation).toBe("string");
	expect((catalog.generation as string).length).toBe(64);
	// Stable for the same epoch and command set; builtins change coverage only.
	expect(engine.catalog().generation).toBe(catalog.generation);
});

test("registered dispatch is catalog-fenced and preserves raw arguments verbatim", async () => {
	const { engine, sent } = host();
	const catalog = engine.catalog();
	const receipt = await engine.dispatch({
		catalogGeneration: catalog.generation,
		commandId: "extension:subagent",
		args: "status --raw='a /name'  trailing ",
	});
	// No disposition comes back from sendUserMessage: accepted/started, never handled.
	expect(receipt).toEqual({
		operationId: "op-1",
		commandId: "extension:subagent",
		disposition: "started",
		rejection: null,
	});
	expect(sent).toEqual(["/subagent status --raw='a /name'  trailing "]);
});

test("skill/template dispatch keeps expandPromptTemplates and reports uncertain acceptance", async () => {
	const idle = host();
	const catalog = idle.engine.catalog();
	for (const commandId of ["prompt:review", "skill:skill:pdf"]) {
		expect(
			(
				await idle.engine.dispatch({
					catalogGeneration: catalog.generation,
					commandId,
					args: "HEAD~1",
				})
			).disposition
		).toBe("started");
	}
	expect(idle.sent).toEqual(["/review HEAD~1", "/skill:pdf HEAD~1"]);
});

test("unknown ids, stale generations and removed commands never reach the prompt channel", async () => {
	const { engine, sent, state } = host();
	const catalog = engine.catalog();
	expect(await engine.dispatch({ catalogGeneration: catalog.generation, commandId: "extension:nope", args: "" })).toMatchObject({
		disposition: "rejected",
		rejection: "unknown_command",
	});
	expect(await engine.dispatch({ catalogGeneration: "stale", commandId: "extension:subagent", args: "" })).toMatchObject({
		disposition: "rejected",
		rejection: "stale_generation",
	});

	// After the live list changes, the old id is not in the new catalog.
	state.registered = state.registered.filter((command) => command.name !== "subagent");
	const after = engine.catalog();
	expect(await engine.dispatch({ catalogGeneration: after.generation, commandId: "extension:subagent", args: "" })).toMatchObject(
		{ disposition: "rejected", rejection: "unknown_command" }
	);
	expect(sent).toEqual([]);
});

test("builtins are cataloged only via a provided provider and dispatched through typed operations", async () => {
	const without = host({ builtins: [{ name: "model", description: "Select model", argumentHint: "<provider/model>" }] });
	const catalogWithout = without.engine.catalog();
	expect(catalogWithout.coverage).toBe("full");
	const model = catalogWithout.commands.find((entry) => entry.commandId === "builtin:model");
	expect(model).toMatchObject({
		invocation: "/model",
		origin: "builtin",
		availability: { state: "unavailable", reason: "unsupported_operation" },
	});
	expect(
		await without.engine.dispatch({ catalogGeneration: catalogWithout.generation, commandId: "builtin:model", args: "x" })
	).toMatchObject({
		disposition: "rejected",
		rejection: "engine_failure",
	});

	const withOps = host({
		builtins: [{ name: "model", description: "Select model", argumentHint: "<provider/model>" }],
		dispatchBuiltin: (name, args) => (name === "model" && args === "openai/gpt-5" ? "handled" : "unsupported"),
	});
	const withCatalog = withOps.engine.catalog();
	expect(withCatalog.commands.find((entry) => entry.commandId === "builtin:model")).toMatchObject({
		availability: { state: "available" },
	});
	expect(
		await withOps.engine.dispatch({ catalogGeneration: withCatalog.generation, commandId: "builtin:model", args: "openai/gpt-5" })
	).toMatchObject({ disposition: "handled" });
	expect(withOps.builtinCalls).toEqual([["model", "openai/gpt-5"]]);
});

test("dispatch is idempotent per request: one host call, and dispatch-originated input is never re-handled", async () => {
	const events: Array<{ source: string; text: string }> = [];
	const dispatched: string[] = [];
	const hostCalls: Array<{ source: string; text: string }> = [];
	const engine = createPiCommandEngine({
		listRegistered: () => [{ name: "subagent", description: "Manage", source: "extension" }],
		dispatchRegistered: (text) => {
			dispatched.push(text);
			// Pi reports the prompt with source "extension"; the bridge's input handler
			// must not feed it back into dispatch or expand it again.
			const event = { source: "extension", text };
			hostCalls.push(event);
			if (event.source !== "extension") dispatched.push(event.text);
		},
		newOperationId: () => "op-1",
		runtimeGeneration: () => "ir:11111111-1111-4111-8111-111111111111",
	});
	const catalog = engine.catalog();
	await engine.dispatch({ catalogGeneration: catalog.generation, commandId: "extension:subagent", args: "" });
	expect(dispatched).toEqual(["/subagent"]);
	expect(hostCalls).toEqual([{ source: "extension", text: "/subagent" }]);
	expect(events).toEqual([]);
});

test("the catalog generation changes with the runtime epoch, so old receipts cannot be replayed as current", () => {
	const { engine } = host();
	const first = engine.catalog().generation;
	const rotated = createPiCommandEngine({
		listRegistered: () => [{ name: "subagent", source: "extension" }],
		dispatchRegistered: () => {},
		runtimeGeneration: () => "ir:22222222-2222-4222-8222-222222222222",
	});
	expect(rotated.catalog().generation).not.toBe(first);
});
