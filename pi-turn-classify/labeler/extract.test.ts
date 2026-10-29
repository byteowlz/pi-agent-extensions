import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { extract, listSessionFiles, turnsFromSession } from "./extract";

/** Build a minimal session file with a header and message entries. */
function writeSession(dir: string, name: string, entries: unknown[]): string {
	fs.mkdirSync(dir, { recursive: true });
	const file = path.join(dir, name);
	fs.writeFileSync(file, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
	return file;
}

const header = { type: "session", version: 3, id: "abc", timestamp: "2026-01-01T00:00:00.000Z", cwd: "/proj/alpha" };

function user(text: string) {
	return { type: "message", timestamp: "2026-01-01T00:00:01.000Z", message: { role: "user", content: [{ type: "text", text }] } };
}

function assistant(content: unknown[], extra: Record<string, unknown> = {}) {
	return {
		type: "message",
		timestamp: "2026-01-01T00:00:02.000Z",
		message: { role: "assistant", content, model: "some-model", stopReason: "end_turn", ...extra },
	};
}

const text = (value: string) => ({ type: "text", text: value });
const call = (name: string, args: unknown) => ({ type: "toolCall", id: `c-${name}`, name, arguments: args });

describe("session listing", () => {
	test("walks nested directories newest first", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "labeler-"));
		try {
			writeSession(path.join(root, "a"), "one.jsonl", [header]);
			writeSession(path.join(root, "b", "c"), "two.jsonl", [header]);
			fs.writeFileSync(path.join(root, "b", "notes.txt"), "ignore me");
			const files = listSessionFiles(root);
			expect(files).toHaveLength(2);
			expect(files.every((file) => file.endsWith(".jsonl"))).toBe(true);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("turn splitting", () => {
	test("splits on user messages and keeps the tool trail", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "labeler-"));
		try {
			const file = writeSession(path.join(root, "s"), "session.jsonl", [
				header,
				user("please add a feature to the parser with tests"),
				assistant([text("Reading the parser."), call("read", { path: "/proj/alpha/src/parser.ts" })]),
				assistant([call("bash", { command: "bun test" })]),
				assistant([text("Added the feature and tests pass.")]),
				user("now fix the failing lint in the same module"),
				assistant([text("Fixed the lint error.")]),
			]);
			const turns = turnsFromSession(file, 10);
			expect(turns).toHaveLength(2);
			expect(turns[0]?.state.userText).toContain("add a feature");
			// Final text is the turn's visible answer, not the first message.
			expect(turns[0]?.state.assistantText).toBe("Added the feature and tests pass.");
			expect(turns[0]?.state.tools.map((tool) => tool.name)).toEqual(["read", "bash"]);
			expect(turns[0]?.state.filesTouched).toEqual(["/proj/alpha/src/parser.ts"]);
			expect(turns[0]?.state.commands).toEqual(["bun test"]);
			expect(turns[0]?.state.cwd).toBe("/proj/alpha");
			expect(turns[0]?.state.sessionName).toBeUndefined();
			expect(turns[1]?.state.userText).toContain("fix the failing lint");
			// Provenance, not model input.
			expect(turns[0]?.meta.turn).toBe(1);
			expect(turns[1]?.meta.turn).toBe(2);
			expect(turns[0]?.meta.model).toBe("some-model");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test("respects the per-session cap", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "labeler-"));
		try {
			const entries: unknown[] = [header];
			for (let index = 0; index < 8; index += 1) {
				entries.push(user(`request number ${index} with enough words to count`));
				entries.push(assistant([text(`did the work for request ${index}`)]));
			}
			const file = writeSession(path.join(root, "s"), "session.jsonl", entries);
			expect(turnsFromSession(file, 3)).toHaveLength(3);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test("drops turns with no answer, and records errors", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "labeler-"));
		try {
			const file = writeSession(path.join(root, "s"), "session.jsonl", [
				header,
				user("a question that never got answered at all"),
				user("a second question that did get answered properly"),
				assistant([text("Here is a proper answer that is long enough to keep.")]),
				user("one that failed"),
				assistant([], { stopReason: "error" }),
			]);
			const turns = turnsFromSession(file, 10);
			expect(turns).toHaveLength(1);
			expect(turns[0]?.state.userText).toContain("second question");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test("uses the newest session_info as the session name", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "labeler-"));
		try {
			const file = writeSession(path.join(root, "s"), "session.jsonl", [
				header,
				{ type: "session_info", name: "first name" },
				{ type: "session_info", name: "final name" },
				user("do a thing that takes long enough to be real"),
				assistant([text("Done, and here is what changed in the code.")]),
			]);
			expect(turnsFromSession(file, 5)[0]?.state.sessionName).toBe("final name");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test("a malformed file yields nothing instead of throwing", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "labeler-"));
		try {
			const file = path.join(root, "broken.jsonl");
			fs.writeFileSync(file, "{not json}\n");
			expect(turnsFromSession(file, 5)).toEqual([]);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("extract", () => {
	test("deduplicates repeated turns and drops pure pleasantries", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "labeler-"));
		try {
			const repeated = [
				header,
				user("implement the same thing twice because this session was forked"),
				assistant([text("Implemented the same thing and it works fine now.")]),
			];
			writeSession(path.join(root, "a"), "one.jsonl", repeated);
			writeSession(path.join(root, "b"), "two.jsonl", repeated);
			writeSession(path.join(root, "c"), "three.jsonl", [header, user("ok"), assistant([text("Sure.")])]);
			const candidates = extract({ root, limit: 10, perSession: 5 });
			expect(candidates).toHaveLength(1);
			expect(candidates[0]?.state.userText).toContain("implement the same thing");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
