import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	SurgeryError,
	diffMessages,
	listMessages,
	parseSession,
	replaceMessageText,
	serializeSession,
	verifySession,
	writeSessionAtomic,
} from "./surgery.js";

const entries = () => [
	{ type: "session", version: 3, id: "h", timestamp: "t" },
	{ type: "message", id: "u1", parentId: "h", timestamp: "t1", message: { role: "user", content: "mention Pulp Fiction" } },
	{
		type: "message",
		id: "a1",
		parentId: "u1",
		timestamp: "t2",
		message: { role: "assistant", content: [{ type: "text", text: "ok" }] },
	},
	{
		type: "message",
		id: "a2",
		parentId: "a1",
		timestamp: "t3",
		message: { role: "assistant", content: [{ type: "toolCall", id: "c", name: "bash", arguments: {} }] },
	},
];

test("parses, lists and never touches non-text blocks", () => {
	const parsed = parseSession(serializeSession(entries()));
	const messages = listMessages(parsed);
	expect(messages.map((m) => m.id)).toEqual(["u1", "a1", "a2"]);
	expect(messages.find((m) => m.id === "a2")?.editable).toBe(false);
	expect(() => replaceMessageText(parsed, "a2", "rewritten")).toThrow(SurgeryError);
	// Multi-block content is also refused.
	const multi = [
		{
			type: "message",
			id: "m",
			message: {
				role: "user",
				content: [
					{ type: "text", text: "a" },
					{ type: "text", text: "b" },
				],
			},
		},
	];
	expect(() => replaceMessageText(multi, "m", "x")).toThrow(/mixed or multi-block/);
});

test("replacement preserves id, parent, timestamp and block shape", () => {
	const next = replaceMessageText(entries(), "u1", "redacted");
	const entry = next.find((e) => e.id === "u1") as Record<string, unknown>;
	expect(entry.parentId).toBe("h");
	expect(entry.timestamp).toBe("t1");
	expect((entry.message as { content: string }).content).toBe("redacted");
	const block = replaceMessageText(entries(), "a1", "new text");
	const a1 = block.find((e) => e.id === "a1") as { message: { content: unknown[] } };
	expect(a1.message.content).toEqual([{ type: "text", text: "new text" }]);
});

test("verification catches duplicate ids and dangling parents", () => {
	expect(verifySession(entries())).toMatchObject({ ok: true, messages: 3 });
	expect(verifySession([{ id: "x", parentId: "missing" }]).errors[0]).toContain("missing parent");
	expect(verifySession([{ id: "x" }, { id: "x" }]).errors[0]).toContain("duplicate id");
});

test("malformed JSON fails the whole read", () => {
	expect(() => parseSession('{"id":"a"}\nnot json\n')).toThrow(/line 2/);
	expect(() => parseSession("")).toThrow(/no entries/);
});

test("atomic write keeps a backup, 0600 mode, and a changed diff", () => {
	const dir = mkdtempSync(join(tmpdir(), "surgery-"));
	try {
		const file = join(dir, "session.jsonl");
		const original = entries();
		writeSessionAtomic(file, original);
		expect(statSync(file).mode & 0o777).toBe(0o600);
		const rewritten = replaceMessageText(original, "u1", "nothing to see");
		writeSessionAtomic(file, rewritten);
		expect(statSync(`${file}.bak`).isFile()).toBe(true);
		expect(readFileSync(`${file}.bak`, "utf8")).toContain("Pulp Fiction");
		expect(readFileSync(file, "utf8")).not.toContain("Pulp Fiction");
		expect(diffMessages(parseSession(readFileSync(`${file}.bak`, "utf8")), parseSession(readFileSync(file, "utf8")))).toEqual([
			{ id: "u1", role: "user", before: "mention Pulp Fiction", after: "nothing to see" },
		]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
