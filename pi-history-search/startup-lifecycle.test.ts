import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import historySearch from "./index.js";

test("deferred startup captures cwd once and shutdown never accesses disposed context", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "history-startup-"));
	writeFileSync(join(cwd, "history-search.json"), JSON.stringify({ enabled: false }));
	const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<unknown>>();
	historySearch({
		on: (name: string, handler: (event: unknown, ctx: unknown) => Promise<unknown>) => handlers.set(name, handler),
		registerShortcut: () => undefined,
		registerTool: () => undefined,
		registerCommand: () => undefined,
	} as never);
	let disposed = false;
	let reads = 0;
	const ctx = {
		mode: "tui",
		get cwd() {
			if (disposed) throw new Error("disposed context accessed");
			reads++;
			return cwd;
		},
	};
	try {
		await handlers.get("session_start")?.({}, ctx);
		expect(reads).toBe(1);
		await handlers.get("session_shutdown")?.({}, ctx);
		disposed = true;
		await new Promise((resolve) => setTimeout(resolve, 150));
		expect(reads).toBe(1);
		// Single-shot sessions do not even capture cwd or schedule indexing.
		await handlers.get("session_start")?.(
			{},
			{
				mode: "print",
				get cwd() {
					throw new Error("print cwd accessed");
				},
			}
		);
	} finally {
		await handlers.get("session_shutdown")?.({}, {});
		rmSync(cwd, { recursive: true, force: true });
	}
});
