import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CONFIG } from "./config";
import { runSearch } from "./index";

const CWD = "/code/myapp";
let base = "";

function setup(): string {
	base = mkdtempSync(join(tmpdir(), "pihs-excl-"));
	return mkdirSync(join(base, "--code-myapp--"), { recursive: true });
}

function writeSession(projDir: string, sessId: string, text: string): void {
	const file = join(projDir, `2026-07-15T10-00-00-000Z_${sessId}.jsonl`);
	const lines = [
		JSON.stringify({ type: "session", id: sessId, timestamp: "2026-07-15T10:00:00.000Z", cwd: CWD }),
		JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text }] } }),
	];
	writeFileSync(file, `${lines.join("\n")}\n`);
}

function ctxWith(sessionId: string | undefined): ExtensionContext {
	return { cwd: CWD, sessionManager: { getSessionId: () => sessionId } } as unknown as ExtensionContext;
}

afterEach(() => {
	rmSync(base, { recursive: true, force: true });
});

describe("runSearch: exclude current session by default", () => {
	test("default config drops the live session but keeps others", async () => {
		const proj = setup();
		writeSession(proj, "currsess", "find the needle here");
		writeSession(proj, "othersess", "another needle match");
		const config = { ...DEFAULT_CONFIG, sessionsDir: base };
		const hits = await runSearch(ctxWith("currsess"), config, { query: "needle", scope: "project" });
		const ids = hits.map((h) => h.sessionId);
		expect(ids).toContain("othersess");
		expect(ids).not.toContain("currsess");
	});

	test("excludeCurrentSession:false includes the live session", async () => {
		const proj = setup();
		writeSession(proj, "currsess", "find the needle here");
		const config = { ...DEFAULT_CONFIG, sessionsDir: base, excludeCurrentSession: false };
		const hits = await runSearch(ctxWith("currsess"), config, { query: "needle", scope: "project" });
		expect(hits.map((h) => h.sessionId)).toContain("currsess");
	});

	test("explicit current-branch scope is not excluded (would otherwise always be empty)", async () => {
		const proj = setup();
		writeSession(proj, "currsess", "find the needle here");
		const config = { ...DEFAULT_CONFIG, sessionsDir: base };
		const hits = await runSearch(ctxWith("currsess"), config, { query: "needle", scope: "current-branch" });
		expect(hits.map((h) => h.sessionId)).toContain("currsess");
	});

	test("no current session id → nothing excluded", async () => {
		const proj = setup();
		writeSession(proj, "sessA", "find the needle here");
		const config = { ...DEFAULT_CONFIG, sessionsDir: base };
		const hits = await runSearch(ctxWith(undefined), config, { query: "needle", scope: "project" });
		expect(hits.map((h) => h.sessionId)).toContain("sessA");
	});
});
