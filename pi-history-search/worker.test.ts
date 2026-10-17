import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CONFIG } from "./config.js";
import historySearch from "./index.js";
import { projectDir } from "./indexer.js";
import { HistoryWorker } from "./worker.js";

async function fixture(text: string) {
	const root = await mkdtemp(join(tmpdir(), "history-worker-"));
	const file = join(root, "2026-01-01T00-00-00-000Z_fixture.jsonl");
	await writeFile(
		file,
		[
			{ type: "session", id: "fixture", cwd: "/synthetic" },
			{ type: "message", message: { role: "user", content: [{ type: "text", text }] } },
		]
			.map((e) => JSON.stringify(e))
			.join("\n")
	);
	return { root, file };
}

test("large UTF-8 read stays exact across worker IPC chunk boundaries", async () => {
	const text = "非ASCII 💡 ä\n".repeat(9000);
	const f = await fixture(text);
	const worker = new HistoryWorker();
	try {
		const result = await worker.call("readSession", [f.file, { maxChars: 200000, maxTotalChars: 200000 }]);
		expect(result.messages[0].text).toBe(text);
	} finally {
		worker.reset();
		await rm(f.root, { recursive: true, force: true });
	}
});

test("CPU-bound regex runs outside the UI event loop and deadline kills it", async () => {
	const f = await fixture(`${"a".repeat(100000)}!`);
	const worker = new HistoryWorker();
	let ticks = 0;
	const timer = setInterval(() => ticks++, 10);
	try {
		await expect(worker.call("grepSession", [f.file, { pattern: "(a+)+$", regex: true }], undefined, 350)).rejects.toThrow(
			"deadline"
		);
		expect(ticks).toBeGreaterThan(5);
		// A terminated worker must not poison later requests.
		const result = await worker.call("readSession", [f.file, { maxChars: 30 }]);
		expect(result.messages.length).toBe(1);
	} finally {
		clearInterval(timer);
		worker.reset();
		await rm(f.root, { recursive: true, force: true });
	}
});

test("abort interrupts active work, reset rejects queued work, and pool remains reusable", async () => {
	const f = await fixture(`${"a".repeat(100000)}!`);
	const worker = new HistoryWorker();
	const controller = new AbortController();
	try {
		const active = worker.call("grepSession", [f.file, { pattern: "(a+)+$", regex: true }], controller.signal);
		const timer = setTimeout(() => controller.abort(), 100);
		try {
			await expect(active).rejects.toThrow("aborted");
		} finally {
			clearTimeout(timer);
		}
		const jobs = Array.from({ length: 4 }, () =>
			worker.call("grepSession", [f.file, { pattern: "(a+)+$", regex: true }]).catch((e: Error) => e.message)
		);
		worker.reset();
		expect((await Promise.all(jobs)).every((m) => /aborted|session changed/.test(m as string))).toBe(true);
		expect((await worker.call("readSession", [f.file, { maxChars: 30 }])).messages.length).toBe(1);
	} finally {
		worker.reset();
		await rm(f.root, { recursive: true, force: true });
	}
});

test("oversized worker results fail explicitly instead of returning partial success", async () => {
	const f = await fixture("x".repeat(2200000));
	const worker = new HistoryWorker();
	try {
		await expect(worker.call("readSession", [f.file, { maxChars: 3000000, maxTotalChars: 3000000 }])).rejects.toThrow(
			"IPC limit"
		);
	} finally {
		worker.reset();
		await rm(f.root, { recursive: true, force: true });
	}
});

test("worker queue is bounded and reset drains every pending request", async () => {
	const f = await fixture(`${"a".repeat(100000)}!`);
	const worker = new HistoryWorker();
	try {
		const jobs = Array.from({ length: 10 }, () =>
			worker.call("grepSession", [f.file, { pattern: "(a+)+$", regex: true }]).catch((e: Error) => e.message)
		);
		await expect(worker.call("getStats", [f.root])).rejects.toThrow("queue is full");
		worker.reset();
		expect((await Promise.all(jobs)).every((value) => typeof value === "string")).toBe(true);
	} finally {
		worker.reset();
		await rm(f.root, { recursive: true, force: true });
	}
});

test("already aborted requests do not start a process", async () => {
	const controller = new AbortController();
	controller.abort();
	await expect(new HistoryWorker().call("getStats", ["/not-opened"], controller.signal)).rejects.toThrow("aborted");
});

test("registered HistorySearch keeps input timers responsive and propagates cancellation", async () => {
	const f = await fixture(`${"a".repeat(100000)}!`);
	const cwd = join(f.root, "project");
	await mkdir(cwd);
	const base = join(f.root, "sessions");
	const dir = projectDir(base, cwd);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, "2026-01-01T00-00-00-000Z_fixture.jsonl"), await readFile(f.file, "utf8"));
	await writeFile(
		join(cwd, "history-search.json"),
		JSON.stringify({ ...DEFAULT_CONFIG, sessionsDir: base, indexOnStart: false })
	);
	const tools = new Map<string, Parameters<ExtensionAPI["registerTool"]>[0]>();
	const handlers = new Map<string, (event: unknown, ctx: unknown) => unknown>();
	historySearch({
		on: (name, fn) => {
			handlers.set(name, fn as never);
		},
		registerTool: (tool) => {
			tools.set(tool.name, tool);
		},
		registerCommand: () => undefined,
		registerShortcut: () => undefined,
	} as unknown as ExtensionAPI);
	const controller = new AbortController();
	let ticks = 0;
	const heartbeat = setInterval(() => ticks++, 10);
	const abort = setTimeout(() => controller.abort(), 150);
	try {
		const ctx = {
			cwd,
			sessionManager: { getSessionId: () => "current" },
			getContextUsage: () => undefined,
		} as unknown as ExtensionContext;
		const result = await tools
			.get("HistorySearch")
			?.execute("test", { query: "(a+)+$", mode: "regex" }, controller.signal, undefined, ctx);
		expect(result?.isError).toBe(true);
		expect(JSON.stringify(result?.structuredContent)).toContain("aborted");
		expect(ticks).toBeGreaterThan(5);
	} finally {
		clearTimeout(abort);
		clearInterval(heartbeat);
		await handlers.get("session_shutdown")?.({}, {});
		await rm(f.root, { recursive: true, force: true });
	}
});
