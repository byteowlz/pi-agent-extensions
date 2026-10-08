/**
 * Regression guard for the "/side tmux copies only last conversation part" bug.
 *
 * `/side` (and `/btw`) fork the current session into an independent file via
 * `pi --fork <sessionFile>` (see `sideLaunch`/`openTmuxSide` in this package).
 * Pi's `--fork` is implemented by `SessionManager.forkFrom`, which writes a new
 * header (fresh UUID + `parentSession`) and copies every non-header entry.
 *
 * A session that has been through compaction still holds the whole available
 * branch on disk: the pre-compaction messages, the `compaction` entry (with its
 * honest summary), the retained range starting at `firstKeptEntryId`, and every
 * post-compaction entry. The fork must carry all of them so the side session
 * keeps the whole available branch (and can navigate it via `/tree`) rather than
 * only the "last conversation part". The compacted portion is represented by the
 * existing `compaction` summary — we never fabricate a reconstruction of it.
 *
 * These tests drive the real fork primitive (`SessionManager.forkFrom`), the
 * same one `pi --fork` calls, so they are native evidence for the fork's
 * preservation contract, and assert the fork's own context still exposes the
 * whole available branch (summary + retained + post-compaction).
 */
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { sideLaunch } from "./side-launch.js";

interface Entry {
	type: string;
	id: string;
	parentId: string | null;
	timestamp: string;
	message?: { role: string; content: unknown; timestamp: number };
	summary?: string;
	firstKeptEntryId?: string;
	[key: string]: unknown;
}

/** Build a long, compacted session fixture: pre-compaction msgs + compaction + retained + post. */
function compactedSession(dir: string, cwd: string) {
	const sessDir = join(dir, "sessions");
	mkdirSync(sessDir, { recursive: true });
	const entries: Entry[] = [];
	entries.push({
		type: "message",
		id: "sys0001",
		parentId: null,
		timestamp: new Date(1000).toISOString(),
		message: { role: "system", content: "PREAMBLE", sections: { preamble: "You are the assistant." }, timestamp: 1000 },
	} as unknown as Entry);
	let parent = "sys0001";
	// long pre-compaction conversation (12 turns)
	for (let i = 0; i < 12; i++) {
		const u = `user${String(i).padStart(4, "0")}`;
		const a = `astr${String(i).padStart(4, "0")}`;
		entries.push({
			type: "message",
			id: u,
			parentId: parent,
			timestamp: new Date(2000 + i * 1000).toISOString(),
			message: { role: "user", content: `pre question ${i}`, timestamp: 2000 + i * 1000 },
		});
		entries.push({
			type: "message",
			id: a,
			parentId: u,
			timestamp: new Date(2500 + i * 1000).toISOString(),
			message: { role: "assistant", content: [{ type: "text", text: `pre answer ${i}` }], timestamp: 2500 + i * 1000 },
		});
		parent = a;
	}
	// compaction: everything before user0009 was summarized.
	const ci = "cmpctn1";
	entries.push({
		type: "compaction",
		id: ci,
		parentId: parent,
		timestamp: new Date(30000).toISOString(),
		summary: "Earlier we discussed architecture A, B, C. Decision X.",
		firstKeptEntryId: "user0009",
		tokensBefore: 50000,
		systemMessage: { role: "system", content: "PREAMBLE", sections: { preamble: "You are the assistant." }, timestamp: 30000 },
	});
	parent = ci;
	// retained + post-compaction ("last conversation part")
	for (let i = 9; i < 12; i++) {
		const u = `kept${String(i).padStart(4, "0")}`;
		const a = `kast${String(i).padStart(4, "0")}`;
		entries.push({
			type: "message",
			id: u,
			parentId: parent,
			timestamp: new Date(31000 + (i - 9) * 1000).toISOString(),
			message: { role: "user", content: `kept question ${i}`, timestamp: 31000 + (i - 9) * 1000 },
		});
		entries.push({
			type: "message",
			id: a,
			parentId: u,
			timestamp: new Date(31500 + (i - 9) * 1000).toISOString(),
			message: { role: "assistant", content: [{ type: "text", text: `kept answer ${i}` }], timestamp: 31500 + (i - 9) * 1000 },
		});
		parent = a;
	}
	const header = { type: "session", version: 3, id: "parent-uuid", timestamp: new Date().toISOString(), cwd };
	const srcFile = join(sessDir, "parent.jsonl");
	writeFileSync(srcFile, [JSON.stringify(header), ...entries.map((e) => JSON.stringify(e))].join("\n"));
	return { srcFile, sessDir };
}

function readEntries(file: string): Entry[] {
	return readFileSync(file, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((l: string) => JSON.parse(l) as Entry);
}

function messageText(e: Entry): string {
	const content = e.message?.content;
	if (Array.isArray(content)) return content.map((b) => String((b as { text?: string }).text ?? "")).join("");
	return typeof content === "string" ? content : "";
}

test("side fork (pi --fork / SessionManager.forkFrom) preserves the whole available branch after compaction", () => {
	const dir = mkdtempSync(join(tmpdir(), "side-fork-preserve-"));
	try {
		const cwd = join(dir, "proj");
		const { srcFile, sessDir } = compactedSession(dir, cwd);

		const sourceEntries = readEntries(srcFile);
		const sourceIds = new Set(sourceEntries.map((e) => e.id));

		// pi --fork calls forkFrom with a fresh id.
		const fork = SessionManager.forkFrom(srcFile, cwd, sessDir, { id: "child-uuid" });
		const forkFile = fork.getSessionFile();
		expect(forkFile).toBeDefined();
		const forkEntries = readEntries(forkFile as string);
		const forkIds = new Set(forkEntries.map((e) => e.id));

		// Independent fork identity + file, and parentSession records the source.
		const header = forkEntries[0];
		expect(header.type).toBe("session");
		expect(header.id).toBe("child-uuid");
		expect(header.parentSession).toBe(srcFile);
		expect(forkFile).not.toBe(srcFile);
		expect(fork.getSessionId()).toBe("child-uuid");

		// Every source entry (except the header) is carried into the fork.
		for (const entry of sourceEntries) {
			if (entry.type === "session") continue;
			expect(forkIds.has(entry.id)).toBe(true);
		}
		// Explicitly: the whole available branch, not only the last part.
		expect(forkEntries.some((e) => messageText(e) === "pre question 0")).toBe(true);
		expect(
			forkEntries.some((e) => e.type === "compaction" && typeof e.summary === "string" && e.summary.includes("architecture A"))
		).toBe(true);
		expect(forkEntries.some((e) => messageText(e) === "kept question 11")).toBe(true);
		// Fork must not invent entries beyond the source (plus the fresh id).
		for (const id of forkIds) expect(sourceIds.has(id) || id === "child-uuid").toBe(true);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("forked side session context exposes the whole available branch (summary + retained + post), not just the tail", () => {
	const dir = mkdtempSync(join(tmpdir(), "side-fork-context-"));
	try {
		const cwd = join(dir, "proj");
		const { srcFile, sessDir } = compactedSession(dir, cwd);
		const fork = SessionManager.forkFrom(srcFile, cwd, sessDir, { id: "child-uuid" });
		const ctx = fork.buildSessionContext();
		const cm = ctx.messages ?? ctx;
		const summary = cm.find((m: { role: string }) => m.role === "compactionSummary") as { summary?: string } | undefined;
		// The compacted portion is represented by the honest existing summary, not fabricated.
		expect(summary?.summary).toContain("architecture A, B, C");
		// Retained + post-compaction conversation is present as context.
		const texts = cm
			.map((m: unknown) => {
				const msg = m as { content?: unknown };
				if (Array.isArray(msg.content)) return msg.content.map((b) => String((b as { text?: string }).text ?? "")).join("");
				return typeof msg.content === "string" ? msg.content : "";
			})
			.join("\n");
		expect(texts).toContain("kept question 11");
		expect(texts).toContain("pre question 9"); // retained, per firstKeptEntryId
		// The summarized-away part is NOT reconstructed (no fabrication).
		expect(texts).not.toContain("pre question 0");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("sideLaunch argv points --fork at the full persisted session file and carries an independent session id", () => {
	const launch = sideLaunch(
		{ label: "Investigate Tests", cwd: "/tmp/proj", sessionFile: "/sessions/parent.jsonl", parentSessionId: "parent-uuid" },
		"child-uuid"
	);
	const forkIdx = launch.argv.indexOf("--fork");
	expect(forkIdx).toBe(0);
	expect(launch.argv[forkIdx + 1]).toBe("/sessions/parent.jsonl");
	expect(launch.argv[launch.argv.indexOf("--session-id") + 1]).toBe("child-uuid");
	// The side must never point at the parent file directly; it always forks.
	expect(launch.argv).not.toContain("--session");
	expect(launch.argv).toContain("--fork");
});
