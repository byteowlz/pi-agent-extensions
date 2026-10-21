import { expect, test } from "bun:test";
import {
	DESCRIPTION_ENTRY_TYPE,
	MAX_TOPICS,
	normalizeDescription,
	normalizeTopics,
	readSessionDescription,
} from "./description.js";

const entry = (data: unknown) => ({ type: "custom", customType: DESCRIPTION_ENTRY_TYPE, data });

test("descriptions are single-line, bounded and secret-free", () => {
	expect(normalizeDescription("  Reviewing\n\tHerdr  socket code\u0007 ")).toEqual({
		ok: true,
		value: "Reviewing Herdr socket code",
	});
	expect(normalizeDescription("")).toMatchObject({ ok: false });
	expect(normalizeDescription("   ")).toMatchObject({ ok: false });
	expect(normalizeDescription(42)).toMatchObject({ ok: false });
	expect(normalizeDescription("x".repeat(281))).toMatchObject({ ok: false });
	expect(normalizeDescription("x".repeat(280))).toMatchObject({ ok: true });
	for (const secret of [
		"token: abc",
		"password=hunter2",
		"sk-abcdefghijklmnop",
		"-----BEGIN OPENSSH PRIVATE KEY-----",
		"deadbeef".repeat(5),
	]) {
		expect(normalizeDescription(secret)).toMatchObject({ ok: false });
	}
});

test("topics are lower-case slugs, deduplicated and capped", () => {
	expect(normalizeTopics(undefined)).toEqual({ ok: true, value: [] });
	expect(normalizeTopics(["Herdr", "pi-agent-extensions", "herdr"])).toEqual({
		ok: true,
		value: ["herdr", "pi-agent-extensions"],
	});
	expect(normalizeTopics(["bad topic"])).toMatchObject({ ok: false });
	expect(normalizeTopics(["x".repeat(33)])).toMatchObject({ ok: false });
	expect(normalizeTopics(Array.from({ length: MAX_TOPICS + 1 }, (_, i) => `t${i}`))).toMatchObject({ ok: false });
	expect(normalizeTopics("herdr")).toMatchObject({ ok: false });
});

test("reads the latest valid entry and treats a clear as absent", () => {
	const base = { version: 1, description: "first", topics: [], by: "agent", revision: 1, updatedAt: "t1" };
	expect(readSessionDescription([])).toBeUndefined();
	expect(readSessionDescription([entry(base)])).toMatchObject({ description: "first", by: "agent" });
	// Ignores malformed and unrelated entries.
	expect(readSessionDescription([entry({ ...base, version: 2 })])).toBeUndefined();
	expect(readSessionDescription([{ type: "custom", customType: "other", data: base }])).toBeUndefined();
	// Last valid wins.
	const second = { ...base, description: "second", by: "human", revision: 2 };
	expect(readSessionDescription([entry(base), entry(second)])).toMatchObject({ description: "second", by: "human" });
	// Explicit clear reads as no description.
	expect(readSessionDescription([entry(base), entry({ ...second, cleared: true })])).toBeUndefined();
});
