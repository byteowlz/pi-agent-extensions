import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grepSession } from "./indexer";

const TMP = mkdtempSync(join(tmpdir(), "pihs-grep-"));
// One project dir so prettyProject/timestamp derive cleanly.
const PROJ = mkdirSync(join(TMP, "--code-myapp--"), { recursive: true });

afterEach(() => {
	// keep the dir for reuse across tests; clean at process exit implicitly
});

const SESSION_ID = "abc12345-6789-4def-a0b1-c2d3e4f5a6b7";
const SESSION_FILE = join(PROJ, `2026-07-15T10-00-00-000Z_${SESSION_ID}.jsonl`);

function msg(role: string, text: string): string {
	return JSON.stringify({ type: "message", message: { role, content: [{ type: "text", text }] } });
}

const fixture = [
	msg("user", "How do I call getConnectionTimeout in the client?"),
	msg("assistant", "Use client.getConnectionTimeout() to read the configured value."),
	msg("toolResult", "Error: getConnectionTimeout returned undefined at client.ts:42"),
	msg("user", "Also check CamelCaseHelper and foo_bar identifiers."),
	msg("assistant", "Done."),
].join("\n");

writeFileSync(SESSION_FILE, `${fixture}\n`);

describe("grepSession", () => {
	test("literal substring matches with msgIndex + highlighted snippet", () => {
		const r = grepSession(SESSION_FILE, { pattern: "getConnectionTimeout" });
		expect(r.matchedMessages).toBe(3);
		expect(r.matches.length).toBe(3);
		expect(r.matches.every((m) => m.snippet.includes("«getConnectionTimeout»"))).toBe(true);
		expect(r.matches.map((m) => m.msgIndex).sort((a, b) => a - b)).toEqual([0, 1, 2]);
		expect(r.regex).toBe(false);
		expect(r.ignoreCase).toBe(true);
	});

	test("ignoreCase false excludes case-mismatched hits", () => {
		const r = grepSession(SESSION_FILE, { pattern: "getconnectiontimeout", ignoreCase: false });
		// Only the lowercase form exists nowhere verbatim → no matches.
		expect(r.matchedMessages).toBe(0);
		expect(r.matches.length).toBe(0);
	});

	test("regex pattern matches across identifiers", () => {
		const r = grepSession(SESSION_FILE, { pattern: "getC\\w+Timeout", regex: true });
		expect(r.matchedMessages).toBe(3);
		expect(r.matches.length).toBe(3);
		expect(r.regex).toBe(true);
	});

	test("regex matches snake_case and camelCase together", () => {
		const r = grepSession(SESSION_FILE, { pattern: "[A-Za-z]+_[A-Za-z]+", regex: true, ignoreCase: false });
		// foo_bar (msg 3) matches; camelCase does not (no underscore).
		expect(r.matches.some((m) => m.snippet.includes("«foo_bar»"))).toBe(true);
		expect(r.matches.some((m) => m.msgIndex === 3)).toBe(true);
	});

	test("roleFilter restricts scanned messages", () => {
		const r = grepSession(SESSION_FILE, { pattern: "getConnectionTimeout", roleFilter: "user" });
		// Only msg 0 is a user message containing the term.
		expect(r.matchedMessages).toBe(1);
		expect(r.matches[0].role).toBe("user");
		expect(r.matches[0].msgIndex).toBe(0);
	});

	test("maxMatches caps total snippets and marks truncated", () => {
		const r = grepSession(SESSION_FILE, { pattern: "getConnectionTimeout", maxMatches: 2 });
		expect(r.matches.length).toBe(2);
		expect(r.truncated).toBe(true);
		expect(r.matchedMessages).toBe(3);
	});

	test("before/after yields a full-text context window", () => {
		const r = grepSession(SESSION_FILE, { pattern: "getConnectionTimeout", before: 1, after: 1, maxMatches: 1 });
		expect(r.messages.length).toBeGreaterThan(0);
		// Every context entry has role + msgIndex + non-empty text.
		expect(r.messages.every((m) => m.role && typeof m.msgIndex === "number" && m.text.length > 0)).toBe(true);
	});

	test("invalid regex throws", () => {
		expect(() => grepSession(SESSION_FILE, { pattern: "(unclosed", regex: true })).toThrow();
	});

	test("no matches returns empty result without error", () => {
		const r = grepSession(SESSION_FILE, { pattern: "absolutely-no-such-string" });
		expect(r.matches.length).toBe(0);
		expect(r.matchedMessages).toBe(0);
		expect(r.totalMessages).toBe(5);
	});

	test("zero-width regex does not loop forever", () => {
		// A pattern that can match empty strings; must terminate, not hang.
		const r = grepSession(SESSION_FILE, { pattern: "x*", regex: true });
		expect(r.matches.length).toBeGreaterThanOrEqual(0);
	});
});

// Ensure the temp tree is removed when tests are done by bun's lifecycle.
test("cleanup temp dir", () => {
	rmSync(TMP, { recursive: true, force: true });
	expect(true).toBe(true);
});
