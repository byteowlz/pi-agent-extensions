import { describe, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	MAX_ENTRIES,
	MAX_ITEM_TEXT,
	addItems,
	cwdKey,
	cwdPath,
	list,
	paths,
	readStore,
	removeItems,
	saveCommand,
	sessionPath,
} from "./store.ts";

async function tempDir(): Promise<string> {
	return mkdtemp(join(tmpdir(), "prompt-stash-"));
}

async function readMode(p: string): Promise<number> {
	return (await stat(p)).mode & 0o777;
}

describe("path resolution", () => {
	test("sessionPath appends the sidecar suffix", () => {
		expect(sessionPath("/s/b.jsonl")).toBe("/s/b.jsonl.prompt-stash.json");
	});

	test("sessionPath errors when no session file", () => {
		expect(() => sessionPath("")).toThrow();
		expect(() => sessionPath(undefined as unknown as string)).toThrow();
	});

	test("scope isolation: session/cwd/global produce distinct paths", async () => {
		const dir = await tempDir();
		const agentDir = join(dir, "agent");
		const sessionFile = join(dir, "a.jsonl");
		const cwd = join(dir, "proj");
		await mkdir(cwd, { recursive: true });

		const session = await paths({ scope: "session", sessionFile });
		const cwdP = await paths({ scope: "cwd", agentDir, cwd });
		const global = await paths({ scope: "global", agentDir });

		expect(session).toBe(`${sessionFile}.prompt-stash.json`);
		expect(cwdP).toContain(`${cwdKey(cwd)}.json`);
		expect(global).toBe(join(agentDir, "prompt-stash", "global.json"));
		expect(new Set([session, cwdP, global]).size).toBe(3);
	});

	test("cwd path canonicalizes cwd via realpath", async () => {
		const dir = await tempDir();
		const agentDir = join(dir, "agent");
		const cwd = join(dir, "proj");
		await mkdir(cwd, { recursive: true });
		// resolve the real path (handles any symlinked tmp root)
		const { realpath } = await import("node:fs/promises");
		const canonical = await realpath(cwd);
		const p = await paths({ scope: "cwd", agentDir, cwd });
		expect(p).toBe(cwdPath(agentDir, canonical));
	});
});

describe("scope isolation of stored data", () => {
	test("writes to different scopes do not leak into each other", async () => {
		const dir = await tempDir();
		const agentDir = join(dir, "agent");
		const sessionFile = join(dir, "a.jsonl");
		const cwd = join(dir, "proj");
		await mkdir(cwd, { recursive: true });

		const sessionP = await paths({ scope: "session", sessionFile });
		const cwdP = await paths({ scope: "cwd", agentDir, cwd });
		const globalP = await paths({ scope: "global", agentDir });

		await addItems(sessionP, [{ text: "session-only" }]);
		await addItems(cwdP, [{ text: "cwd-only" }]);
		await addItems(globalP, [{ text: "global-only" }]);

		expect((await list(sessionP)).map((e) => e.text)).toEqual(["session-only"]);
		expect((await list(cwdP)).map((e) => e.text)).toEqual(["cwd-only"]);
		expect((await list(globalP)).map((e) => e.text)).toEqual(["global-only"]);
	});
});

describe("private permissions", () => {
	test("creates private dir (0700) and file (0600)", async () => {
		const dir = await tempDir();
		const agentDir = join(dir, "agent");
		const globalP = await paths({ scope: "global", agentDir });

		await addItems(globalP, [{ text: "hi" }]);

		const parent = join(agentDir, "prompt-stash");
		expect(await readMode(parent)).toBe(0o700);
		expect(await readMode(globalP)).toBe(0o600);
	});
});

describe("malformed documents fail closed", () => {
	test("readStore throws on invalid JSON", async () => {
		const dir = await tempDir();
		const p = join(dir, "bad.json");
		await writeFile(p, "{ not json", "utf8");
		await expect(readStore(p)).rejects.toThrow();
	});

	test("readStore throws on unsupported version", async () => {
		const dir = await tempDir();
		const p = join(dir, "v.json");
		await writeFile(p, JSON.stringify({ version: 99, entries: [], commands: [] }), "utf8");
		await expect(readStore(p)).rejects.toThrow();
	});

	test("writes refuse to overwrite a malformed document", async () => {
		const dir = await tempDir();
		const p = join(dir, "bad.json");
		const original = "{ not json";
		await writeFile(p, original, "utf8");
		await expect(addItems(p, [{ text: "x" }])).rejects.toThrow();
		expect(await readFile(p, "utf8")).toBe(original);
	});

	test("out-of-bounds text is rejected and original preserved", async () => {
		const dir = await tempDir();
		const p = join(dir, "doc.json");
		await addItems(p, [{ text: "keep" }]);
		const before = await readFile(p, "utf8");

		const oversize = "x".repeat(MAX_ITEM_TEXT + 1);
		await expect(addItems(p, [{ text: oversize }])).rejects.toThrow();
		expect(await readFile(p, "utf8")).toBe(before);
		expect((await list(p)).map((e) => e.text)).toEqual(["keep"]);
	});
});

describe("locking / concurrency", () => {
	test("fails fast when another process holds the lock", async () => {
		const dir = await tempDir();
		const p = join(dir, "doc.json");
		await addItems(p, [{ text: "seed" }]);
		// Simulate a held lock by creating the exclusive lock directory.
		await mkdir(`${p}.lock`, { recursive: true });
		try {
			await expect(addItems(p, [{ text: "x" }])).rejects.toThrow(/holds the lock/);
		} finally {
			const { rmdir } = await import("node:fs/promises");
			await rmdir(`${p}.lock`);
		}
	});

	test("the lock is released after a successful write (no stale lock)", async () => {
		const dir = await tempDir();
		const p = join(dir, "doc.json");
		await addItems(p, [{ text: "a" }]);
		// A subsequent write must succeed, proving the lock was released.
		await addItems(p, [{ text: "b" }]);
		expect((await list(p)).map((e) => e.text)).toEqual(["a", "b"]);
		// No lock directory may remain.
		let exists = true;
		try {
			await lstat(`${p}.lock`);
		} catch {
			exists = false;
		}
		expect(exists).toBe(false);
	});
});

describe("failed writes preserve old state", () => {
	test("command name conflict without overwrite aborts and preserves", async () => {
		const dir = await tempDir();
		const p = join(dir, "doc.json");
		await saveCommand(p, "greet", "echo hi");
		const before = await readFile(p, "utf8");

		await expect(saveCommand(p, "greet", "echo yo")).rejects.toThrow(/already exists/);
		expect(await readFile(p, "utf8")).toBe(before);
		expect((await readStore(p)).commands).toHaveLength(1);
	});

	test("clobbering a directory destination is refused", async () => {
		const dir = await tempDir();
		const p = join(dir, "doc.json");
		await mkdir(p, { recursive: true });
		await expect(addItems(p, [{ text: "x" }])).rejects.toThrow(/regular file|directory/);
	});
});

describe("UUID ids are immutable, opaque, and never clipped", () => {
	test("ids are full-length UUIDs and round-trip unchanged", async () => {
		const dir = await tempDir();
		const p = join(dir, "doc.json");
		const created = await addItems(p, [{ text: "alpha" }, { text: "beta" }]);
		const idRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

		expect(created).toHaveLength(2);
		for (const item of created) {
			expect(item.id).toMatch(idRegex);
		}
		// Full-length, not shortened.
		expect(created[0].id.length).toBe(36);
		expect(new Set(created.map((e) => e.id)).size).toBe(2);

		// Remove by exact opaque id.
		const removed = await removeItems(p, [created[0].id]);
		expect(removed).toHaveLength(1);
		expect((await list(p)).map((e) => e.id)).toEqual([created[1].id]);
	});

	test("total entries bound is enforced", async () => {
		const dir = await tempDir();
		const p = join(dir, "doc.json");
		// Seed close to the bound by writing a large doc directly.
		const many = Array.from({ length: MAX_ENTRIES }, (_, i) => ({
			id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
			text: `item-${i}`,
			createdAt: new Date().toISOString(),
		}));
		const { writeFile } = await import("node:fs/promises");
		await writeFile(p, JSON.stringify({ version: 1, entries: many, commands: [] }), "utf8");
		// Adding one more exceeds the bound.
		await expect(addItems(p, [{ text: "overflow" }])).rejects.toThrow(/MAX_ENTRIES/);
	});
});

describe("commands in the same document", () => {
	test("commands and entries coexist; overwrite replaces by name", async () => {
		const dir = await tempDir();
		const p = join(dir, "doc.json");
		await addItems(p, [{ text: "a prompt" }]);
		const cmd = await saveCommand(p, "hi", "echo hello");
		expect(cmd.name).toBe("hi");
		expect(cmd.text).toBe("echo hello");

		const replaced = await saveCommand(p, "hi", "echo goodbye", { overwrite: true });
		expect(replaced.id).not.toBe(cmd.id);
		const doc = await readStore(p);
		expect(doc.commands.filter((c) => c.name === "hi")).toHaveLength(1);
		expect(doc.entries).toHaveLength(1);
	});
});
