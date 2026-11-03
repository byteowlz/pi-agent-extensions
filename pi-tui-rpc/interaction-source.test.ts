import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CommandEnginePort } from "../runtime-interactions/interaction-port.js";
import type { RuntimeSourceFrame } from "../runtime-interactions/protocol/runtime-interactions/v1/RuntimeSourceFrame.js";
import type { RuntimeSourceRequest } from "../runtime-interactions/protocol/runtime-interactions/v1/RuntimeSourceRequest.js";
import type { RuntimeSourceResponse } from "../runtime-interactions/protocol/runtime-interactions/v1/RuntimeSourceResponse.js";
import { validateSourceFrame, validateSourceResponse } from "../runtime-interactions/wire.js";
import { InteractionAdapter } from "./interaction-adapter.js";
import {
	RUNTIME_INTERACTIONS_CONTINUITY_FIELD,
	RUNTIME_INTERACTIONS_SOURCE_CAPABILITY,
	handleSourceFrame,
	matchesSourceRequest,
	parseSourceFrame,
	sameSourceIdentity,
} from "./interaction-source.js";

const V1 = join(import.meta.dir, "..", "runtime-interactions", "protocol", "runtime-interactions", "v1");
const TRANSPORT = JSON.parse(readFileSync(join(V1, "transport.json"), "utf8"));

interface SourceFixtures {
	pairs: Array<{ name: string; request: RuntimeSourceRequest; response: RuntimeSourceResponse }>;
	frames: Array<{ name: string; value: RuntimeSourceFrame }>;
	invalid: Array<{ name: string; value: unknown }>;
	mismatches: Array<{ name: string; request: RuntimeSourceRequest; response: RuntimeSourceResponse }>;
}
const fixtures = JSON.parse(readFileSync(join(V1, "source-fixtures.json"), "utf8")) as SourceFixtures;

function pair(name: string) {
	const found = fixtures.pairs.find((entry) => entry.name === name);
	if (!found) throw new Error(`missing pair ${name}`);
	return found;
}

function frameOf(name: string): unknown {
	const found = fixtures.frames.find((entry) => entry.name === name);
	if (!found) throw new Error(`missing frame ${name}`);
	return found.value;
}

const IDENTITY = { nativeSessionId: "native-fixture", runtimeGeneration: "ir:11111111-1111-4111-8111-111111111111" };

function sourceDeps(
	over: {
		adapter?: InteractionAdapter;
		source?: () => typeof IDENTITY | undefined;
		negotiated?: () => boolean;
	} = {}
) {
	return {
		adapter: over.adapter ?? new InteractionAdapter(),
		currentSource: over.source ?? (() => IDENTITY),
		negotiated: over.negotiated ?? (() => true),
	};
}

test("the generated source corpus is schema-valid and correlation-checked", () => {
	expect(fixtures.pairs).toHaveLength(11);
	expect(fixtures.frames).toHaveLength(28);
	expect(fixtures.invalid).toHaveLength(12);
	expect(fixtures.mismatches).toHaveLength(9);

	for (const entry of fixtures.frames) {
		expect({ name: entry.name, valid: validateSourceFrame(entry.value) }).toEqual({ name: entry.name, valid: true });
	}
	for (const entry of fixtures.pairs) {
		expect({ name: entry.name, request: validateSourceFrame({ type: "interaction_source", request: entry.request }) }).toEqual({
			name: entry.name,
			request: true,
		});
		expect({ name: entry.name, response: validateSourceResponse(entry.response) }).toEqual({ name: entry.name, response: true });
		expect({ name: entry.name, matches: matchesSourceRequest(entry.response, entry.request) }).toEqual({
			name: entry.name,
			matches: true,
		});
	}
	// Schema-valid does not mean correlated: every typed mismatch must be rejected.
	for (const entry of fixtures.mismatches) {
		expect(validateSourceResponse(entry.response)).toBe(true);
		expect({ name: entry.name, matches: matchesSourceRequest(entry.response, entry.request) }).toEqual({
			name: entry.name,
			matches: false,
		});
	}
	// Malformed frames, host claims and forged identities never parse.
	for (const entry of fixtures.invalid) {
		expect({ name: entry.name, ok: parseSourceFrame(entry.value).ok }).toEqual({ name: entry.name, ok: false });
	}
});

test("correlation keeps exact identity representation and operation/result identity", () => {
	const catalog = pair("catalog");
	expect(sameSourceIdentity({ nativeSessionId: "n", runtimeGeneration: 5 }, { nativeSessionId: "n", runtimeGeneration: 5 })).toBe(
		true
	);
	expect(
		sameSourceIdentity({ nativeSessionId: "n", runtimeGeneration: 5 }, { nativeSessionId: "n", runtimeGeneration: "5" })
	).toBe(false);
	expect(matchesSourceRequest(catalog.response, catalog.request)).toBe(true);
	expect(matchesSourceRequest({ ...catalog.response, requestId: "other" }, catalog.request)).toBe(false);
});

test("the transport advertises source support separately from engine availability", () => {
	expect(RUNTIME_INTERACTIONS_SOURCE_CAPABILITY).toBe("runtime_interactions_source_v1");
	expect(RUNTIME_INTERACTIONS_SOURCE_CAPABILITY).toBe(TRANSPORT.sourceCapability);
	expect(RUNTIME_INTERACTIONS_CONTINUITY_FIELD).toBe("interactionRuntimeGeneration");
	expect(TRANSPORT.hostBindingOnNativeWire).toBe(false);
	expect(TRANSPORT.sourceResultIsHostAdmission).toBe(false);
	expect(TRANSPORT.automaticReplay).toBe(false);
});

test("read-only operations return canonical source responses", async () => {
	const capabilities = await handleSourceFrame(frameOf("capabilities_request"), sourceDeps());
	expect(capabilities.type).toBe("interaction_source_response");
	if (capabilities.type !== "interaction_source_response") throw new Error("expected response");
	expect(capabilities.response.requestId).toBe("source-request-0");
	expect(capabilities.response.source).toEqual(IDENTITY);
	expect(validateSourceResponse(capabilities.response)).toBe(true);

	const receipt = await handleSourceFrame(frameOf("receipt_request"), sourceDeps());
	if (receipt.type !== "interaction_source_response") throw new Error("expected receipt response");
	expect(receipt.response.result).toEqual({ kind: "unavailable", family: "permissions", reason: "port_not_configured" });
	expect(validateSourceResponse(receipt.response)).toBe(true);
});

test("catalog, queue and error sources pass through canonical results", async () => {
	const catalog = pair("catalog").response.result;
	const queue = pair("queue").response.result;
	const errors = pair("errors").response.result;
	if (catalog.kind !== "catalog" || queue.kind !== "queue" || errors.kind !== "errors")
		throw new Error("unexpected corpus shape");
	const adapter = new InteractionAdapter({
		ports: {
			commands: { catalog: () => catalog.catalog, dispatch: () => pair("dispatch_raw").response.result as never },
			queue: { snapshot: () => queue.snapshot },
			errors: { snapshot: () => errors.snapshot },
		},
	});
	for (const [name, kind] of [
		["catalog_request", "catalog"],
		["queue_request", "queue"],
		["errors_request", "errors"],
	] as const) {
		const result = await handleSourceFrame(frameOf(name), sourceDeps({ adapter }));
		if (result.type !== "interaction_source_response") throw new Error(`expected response for ${name}: ${result.code}`);
		expect(result.response.result.kind).toBe(kind);
		expect(validateSourceResponse(result.response)).toBe(true);
	}
});

test("every non-read-only source operation is refused with unsupported_operation and runs nothing", async () => {
	let dispatches = 0;
	const commands: CommandEnginePort = {
		catalog: () => pair("catalog").response.result as never,
		dispatch: () => {
			dispatches += 1;
			return pair("dispatch_raw").response.result as never;
		},
	};
	const adapter = new InteractionAdapter({ ports: { commands } });
	for (const name of ["dispatch_raw_request", "decide_request", "policy_apply_request", "queue_apply_request"]) {
		const result = await handleSourceFrame(frameOf(name), sourceDeps({ adapter }));
		expect({ name, type: result.type }).toEqual({ name, type: "interaction_source_status" });
		if (result.type !== "interaction_source_status") continue;
		expect({ name, code: result.code }).toEqual({ name, code: "unsupported_operation" });
	}
	expect(dispatches).toBe(0);
});

test("absent, stale and representation-mismatched sources use typed statuses", async () => {
	const request = frameOf("capabilities_request");
	const absent = await handleSourceFrame(request, sourceDeps({ source: () => undefined }));
	expect(absent).toMatchObject({ type: "interaction_source_status", requestId: "source-request-0", code: "source_unavailable" });

	const stale = await handleSourceFrame(
		request,
		sourceDeps({ source: () => ({ ...IDENTITY, runtimeGeneration: "ir:22222222-2222-4222-8222-222222222222" }) })
	);
	expect(stale).toMatchObject({ code: "source_changed" });

	const numeric: RuntimeSourceRequest = {
		...pair("capabilities").request,
		source: { nativeSessionId: "native-fixture", runtimeGeneration: 5 },
	};
	const represented = await handleSourceFrame(
		{ type: "interaction_source", request: numeric },
		sourceDeps({ source: () => ({ nativeSessionId: "native-fixture", runtimeGeneration: "5" }) })
	);
	expect(represented).toMatchObject({ code: "source_changed" });
});

test("negotiation gates the request and the direct reply", async () => {
	const denied = await handleSourceFrame(frameOf("capabilities_request"), sourceDeps({ negotiated: () => false }));
	expect(denied).toMatchObject({ type: "interaction_source_status", requestId: "source-request-0", code: "not_negotiated" });

	// Negotiation lost during the await must not deliver a result.
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const queue = pair("queue").response.result;
	if (queue.kind !== "queue") throw new Error("unexpected corpus shape");
	let negotiated = true;
	const adapter = new InteractionAdapter({
		ports: {
			queue: {
				snapshot: async () => {
					await gate;
					return queue.snapshot;
				},
			},
		},
	});
	const pending = handleSourceFrame(frameOf("queue_request"), sourceDeps({ adapter, negotiated: () => negotiated }));
	negotiated = false;
	release();
	expect(await pending).toMatchObject({ type: "interaction_source_status", code: "not_negotiated" });
});

test("a continuity change during the await yields source_changed, not a stale result", async () => {
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const queue = pair("queue").response.result;
	if (queue.kind !== "queue") throw new Error("unexpected corpus shape");
	const adapter = new InteractionAdapter({
		ports: {
			queue: {
				snapshot: async () => {
					await gate;
					return queue.snapshot;
				},
			},
		},
	});
	let source: typeof IDENTITY = IDENTITY;
	const pending = handleSourceFrame(frameOf("queue_request"), sourceDeps({ adapter, source: () => source }));
	source = { ...IDENTITY, runtimeGeneration: "ir:33333333-3333-4333-8333-333333333333" };
	release();
	expect(await pending).toMatchObject({ type: "interaction_source_status", code: "source_changed" });
});

test("forged bindings, host claims and malformed frames are status errors with correlation only", async () => {
	const forged = fixtures.invalid.find((entry) => entry.name === "caller_binding_on_request");
	if (!forged) throw new Error("missing forged fixture");
	const result = await handleSourceFrame(forged.value, sourceDeps());
	expect(result).toMatchObject({ type: "interaction_source_status", requestId: "source-request-0", code: "invalid_request" });

	const malformed = await handleSourceFrame({ type: "interaction_source", request: { version: 1 } }, sourceDeps());
	expect(malformed).toMatchObject({ type: "interaction_source_status", requestId: null, code: "invalid_request" });

	const huge = {
		type: "interaction_source",
		request: {
			...pair("capabilities").request,
			operation: { op: "command_dispatch", catalogGeneration: "g", commandId: "c", args: "x".repeat(300 * 1024) },
		},
	};
	expect(await handleSourceFrame(huge, sourceDeps())).toMatchObject({ code: "invalid_request" });
});
