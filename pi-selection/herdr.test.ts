import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { herdrBlocked, herdrRelease } from "./herdr.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("blocked/release are best-effort no-ops outside Herdr", () => {
	const previous = { ...process.env };
	delete process.env.HERDR_ENV;
	delete process.env.HERDR_PANE_ID;
	try {
		expect(() => herdrBlocked("x")).not.toThrow();
		expect(() => herdrRelease()).not.toThrow();
	} finally {
		process.env.HERDR_ENV = previous.HERDR_ENV;
		process.env.HERDR_PANE_ID = previous.HERDR_PANE_ID;
	}
});

test("reports blocked while waiting and releases afterwards", async () => {
	const root = mkdtempSync(join(tmpdir(), "herdr-fake-"));
	const log = join(root, "calls.log");
	// Fake CLI that records argv, then exits.
	const script = join(root, "herdr");
	writeFileSync(script, `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(log)}\n`);
	chmodSync(script, 0o700);
	const previous = { ...process.env };
	process.env.PATH = `${root}:${previous.PATH ?? ""}`;
	process.env.HERDR_ENV = "1";
	process.env.HERDR_PANE_ID = "w1:p1";
	try {
		herdrBlocked("selection: awaiting human answer");
		herdrRelease();
		// Wait until every fire-and-forget call has landed.
		let calls: string[] = [];
		for (let i = 0; i < 60; i++) {
			if (existsSync(log)) {
				calls = readFileSync(log, "utf8").trim().split("\n");
				if (calls.some((line) => line.includes("release-agent"))) break;
			}
			await sleep(25);
		}
		expect(calls.some((line) => line.includes("report-agent") && line.includes("--state blocked"))).toBe(true);
		expect(calls.some((line) => line.includes("selection: awaiting human answer"))).toBe(true);
		expect(calls.some((line) => line.includes("--state working"))).toBe(true);
		expect(calls.some((line) => line.includes("release-agent"))).toBe(true);
		expect(calls.every((line) => line.includes("w1:p1") && line.includes("--source pi-selection"))).toBe(true);
	} finally {
		process.env.PATH = previous.PATH;
		process.env.HERDR_ENV = previous.HERDR_ENV;
		process.env.HERDR_PANE_ID = previous.HERDR_PANE_ID;
		rmSync(root, { recursive: true, force: true });
	}
});
