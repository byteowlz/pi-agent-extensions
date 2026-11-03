import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createInteractionContinuity, interactionRuntimeMetadata } from "./interaction-continuity.js";

const UUID = "01234567-89ab-4cde-8f01-23456789abcd";

let counter = 0;
function deterministic() {
	return createInteractionContinuity({ mint: () => `ir:${UUID.slice(0, 35)}${(counter++).toString(16)}` });
}

test("the epoch is source-minted, stable while the lifetime is attached and shaped as an opaque token", () => {
	const continuity = deterministic();
	const first = continuity.current();
	expect(first).toBeDefined();
	expect(first).toMatch(/^ir:[0-9a-f-]{36}$/);
	expect(continuity.current()).toBe(first);
	// Not a timestamp, PID or numeric grant; opaque token only.
	expect(first).not.toContain(String(process.pid));
	expect(Number.isNaN(Number(first))).toBe(true);
	expect(first).not.toMatch(/^\d+$/);
});

test("reissue mints a new epoch and clear makes the projection unavailable", () => {
	const continuity = deterministic();
	const first = continuity.current();
	const second = continuity.reissue("session_start");
	expect(second).not.toBe(first);
	expect(continuity.current()).toBe(second);

	continuity.clear("session_shutdown");
	expect(continuity.current()).toBeUndefined();
	expect(interactionRuntimeMetadata(continuity)).toEqual({});

	const third = continuity.reissue("session_start");
	expect(third).not.toBe(second);
	expect(interactionRuntimeMetadata(continuity)).toEqual({ interactionRuntimeGeneration: third });
});

test("independent runtimes never share an epoch (reload/restart boundary)", () => {
	const a = deterministic();
	const b = deterministic();
	expect(a.current()).not.toBe(b.current());
});

test("get_state metadata omits the field when no source epoch exists", () => {
	const continuity = deterministic();
	continuity.clear("ended");
	expect(interactionRuntimeMetadata(continuity)).toEqual({});
	expect(interactionRuntimeMetadata(continuity)).not.toHaveProperty("interactionRuntimeGeneration");
});

test("a mint that violates the token shape is rejected instead of emitted", () => {
	// Construction rejects a timestamp-shaped mint rather than advertising it.
	expect(() => createInteractionContinuity({ mint: () => "1700000000000" })).toThrow();
	expect(() => createInteractionContinuity({ mint: () => "ir:not-a-uuid" })).toThrow();
});

test("get_state lifecycle wiring stays source-owned (reissue on attach, clear on shutdown)", () => {
	const source = readFileSync(join(import.meta.dir, "index.ts"), "utf8");
	// Both snapshot branches expose the field through the one helper.
	expect(source.match(/\.\.\.interactionRuntimeMetadata\(interactionContinuity\)/g) ?? []).toHaveLength(2);
	// Reissued only after a hub actually listens, and cleared before the hub closes.
	expect(source).toContain(
		'await hub.start();\n\t\t// A listening hub is a new interaction attachment lifetime.\n\t\tinteractionContinuity.reissue("session_start");'
	);
	expect(source).toContain('interactionContinuity.clear("session_shutdown");');
	// No identity repurposing: no pid/timestamp/session-derived epoch at the call sites.
	expect(source).not.toMatch(/interactionContinuity\.reissue\([^)]*sessionId/);
	expect(source).not.toContain("interactionRuntimeGeneration: process.pid");
});
