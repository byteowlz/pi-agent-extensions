import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { type RewriteChange, editableMessages, forkRewrite, reviewDiff, validateChanges } from "./core.js";

function assistant(text: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "openai-completions",
		provider: "synthetic",
		model: "fixture",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 0,
	};
}
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "pi-rewrite-test-"));
	const manager = SessionManager.create("/synthetic", root);
	const user = manager.appendMessage({ role: "user", content: "original user", timestamp: 0 });
	manager.appendMessage(assistant("original assistant"));
	const later = manager.appendMessage({ role: "user", content: "later turn", timestamp: 1 });
	manager.appendMessage(assistant("later answer"));
	return { root, manager, user, later, close: () => rmSync(root, { recursive: true, force: true }) };
}
function request(f: ReturnType<typeof fixture>, changes: RewriteChange[], restart = false) {
	return {
		sourceFile: f.manager.getSessionFile()!,
		sourceId: f.manager.getSessionId(),
		leafId: f.manager.getLeafId()!,
		changes,
		restart,
	};
}

test("native fork preserves source bytes/UUID and raw original, replaces only future context, keeps later turns", () => {
	const f = fixture();
	try {
		const before = readFileSync(f.manager.getSessionFile()!, "utf8");
		const message = editableMessages(f.manager)[0];
		const file = forkRewrite(request(f, [{ ...message, replacement: "revised user" }]));
		const fork = SessionManager.open(file);
		expect(readFileSync(f.manager.getSessionFile()!, "utf8")).toBe(before);
		expect(fork.getSessionId()).not.toBe(f.manager.getSessionId());
		expect(statSync(file).mode & 0o777).toBe(0o600);
		expect(readdirSync(f.root).some((name) => name.startsWith(".rewrite-"))).toBe(false);
		expect(fork.getHeader()?.parentSession).toBe(f.manager.getSessionFile());
		expect(fork.getEntry(f.user)).toEqual(f.manager.getEntry(f.user));
		expect(editableMessages(fork).map((message) => message.text)).toEqual([
			"revised user",
			"original assistant",
			"later turn",
			"later answer",
		]);
		expect(fork.getEntries().filter((entry) => entry.type === "context_edit")).toHaveLength(1);
	} finally {
		f.close();
	}
});

test("restart excludes later turns and carries prior overrides", () => {
	const f = fixture();
	try {
		f.manager.appendContextEdit(f.user, { content: "prior override" });
		const last = editableMessages(f.manager).find((message) => message.id === f.later)!;
		const fork = SessionManager.open(forkRewrite(request(f, [{ ...last, replacement: "restart text" }], true)));
		expect(editableMessages(fork).map((message) => message.text)).toEqual([
			"prior override",
			"original assistant",
			"restart text",
		]);
	} finally {
		f.close();
	}
});

test("selection excludes mixed tool/thinking/image blocks, tool results and compacted-away text", () => {
	const f = fixture();
	try {
		f.manager.appendMessage({
			...assistant("tool preamble"),
			content: [
				{ type: "text", text: "tool preamble" },
				{ type: "toolCall", id: "call", name: "bash", arguments: {} },
			],
			stopReason: "toolUse",
		});
		f.manager.appendMessage({
			role: "toolResult",
			toolCallId: "call",
			toolName: "bash",
			content: [{ type: "text", text: "protected result" }],
			isError: false,
			timestamp: 2,
		});
		f.manager.appendMessage({
			...assistant("thinking"),
			content: [
				{ type: "thinking", thinking: "protected" },
				{ type: "text", text: "thinking" },
			],
		});
		f.manager.appendMessage({
			role: "user",
			content: [{ type: "image", data: "synthetic", mimeType: "image/png" }],
			timestamp: 2,
		});
		expect(editableMessages(f.manager)).toHaveLength(4);
		f.manager.appendCompaction("summary", f.later, 100);
		expect(editableMessages(f.manager).map((message) => message.id)).not.toContain(f.user);
	} finally {
		f.close();
	}
});

test("rejects stale text, duplicate IDs, empty and oversized replacements before creating fork", () => {
	const f = fixture();
	try {
		const messages = editableMessages(f.manager);
		const change = { ...messages[0], replacement: "new" };
		expect(() => validateChanges(messages, [{ ...change, text: "stale" }])).toThrow("changed");
		expect(() => validateChanges(messages, [change, change])).toThrow("twice");
		expect(() => validateChanges(messages, [{ ...change, replacement: "" }])).toThrow("Empty");
		expect(() => validateChanges(messages, [{ ...change, replacement: "x".repeat(32769) }])).toThrow("32 KiB");
		expect(() => forkRewrite(request(f, [{ ...change, role: "assistant" }]))).toThrow("protected");
	} finally {
		f.close();
	}
});

test("restart across compaction is explicit failure, not silent context resurrection", () => {
	const f = fixture();
	try {
		f.manager.appendCompaction("summary", f.later, 100);
		const message = editableMessages(f.manager).find((item) => item.id === f.later)!;
		expect(() => forkRewrite(request(f, [{ ...message, replacement: "new" }], true))).toThrow("compaction");
	} finally {
		f.close();
	}
});

test("tool calls and results survive unchanged on the rewritten fork", () => {
	const f = fixture();
	try {
		const tool = {
			...assistant(""),
			stopReason: "toolUse" as const,
			content: [{ type: "toolCall" as const, id: "synthetic-tool", name: "bash", arguments: { command: "exit 99" } }],
		};
		const result = {
			role: "toolResult" as const,
			toolCallId: "synthetic-tool",
			toolName: "bash",
			content: [{ type: "text" as const, text: "synthetic result" }],
			isError: false,
			timestamp: 0,
		};
		f.manager.appendMessage(tool);
		f.manager.appendMessage(result);
		f.manager.appendMessage(assistant("after tool"));
		const change = { ...editableMessages(f.manager)[0], replacement: "rewritten first" };
		const fork = SessionManager.open(forkRewrite(request(f, [change])));
		const raw = fork
			.getBranch()
			.filter((entry) => entry.type === "message")
			.map((entry) => entry.message);
		expect(raw).toContainEqual(tool);
		expect(raw).toContainEqual(result);
		expect(editableMessages(fork).some((message) => message.text === "synthetic result")).toBe(false);
	} finally {
		f.close();
	}
});

test("restart honors the last selected message even when only an earlier message changed", () => {
	const f = fixture();
	try {
		const change = { ...editableMessages(f.manager)[0], replacement: "rewritten first" };
		const fork = SessionManager.open(forkRewrite({ ...request(f, [change], true), restartAfterId: f.later }));
		expect(editableMessages(fork).map((message) => message.text)).toEqual([
			"rewritten first",
			"original assistant",
			"later turn",
		]);
	} finally {
		f.close();
	}
});

test("diff includes removed and replacement text without truncation", () => {
	expect(reviewDiff({ id: "entry", role: "user", text: "same\nold\ntail", replacement: "same\nnew\ntail" })).toBe(
		"--- user entry original\n+++ proposed context\n same\n-old\n+new\n tail"
	);
});
