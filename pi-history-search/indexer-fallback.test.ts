import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchProject } from "./indexer";

const SESSION_ID = "aaa11111-2222-4333-8444-555566667777";
const sessionFilename = `2026-07-15T10-00-00-000Z_${SESSION_ID}.jsonl`;

function writeSession(proj: string): string {
	const file = join(proj, sessionFilename);
	writeFileSync(
		file,
		`${[
			JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text: "needle phrase here" }] } }),
			JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "the response" }] } }),
		].join("\n")}\n`
	);
	return file;
}

/** Simulate a partially-built index DB that has sessions/meta but no FTS table. */
function writeBrokenIndex(proj: string, sessionPath: string): void {
	const dir = join(proj, ".pi-history");
	mkdirSync(dir, { recursive: true });
	const db = new Database(join(dir, "index.db"));
	db.exec(
		"CREATE TABLE sessions (path TEXT PRIMARY KEY, session_id TEXT, session_ts TEXT, mtime_ms INTEGER NOT NULL, first_user_message TEXT)"
	);
	db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)");
	db.run("INSERT INTO sessions VALUES (?, ?, ?, ?, ?)", [
		sessionPath,
		SESSION_ID,
		"2026-07-15T10-00-00-000Z",
		0,
		"needle phrase",
	]);
	db.close();
}

describe("pi-history-search FTS fallback", () => {
	test("searchProject falls back to a live scan when the index DB lacks messages_fts (no 'no such table')", async () => {
		const tmp = mkdtempSync(join(tmpdir(), "pihs-fts-"));
		try {
			const proj = join(tmp, "--code-x--");
			mkdirSync(proj, { recursive: true });
			const sessionPath = writeSession(proj);
			writeBrokenIndex(proj, sessionPath);

			// Non-current project → read-only open. The broken DB must be treated as
			// unavailable so search falls back to scanning the JSONL instead of
			// throwing "no such table: messages_fts".
			const hits = await searchProject(proj, "needle", { snippetsPerSession: 3 } as never, 10, false, "all");
			expect(Array.isArray(hits)).toBe(true);
			expect(hits.some((h) => (h.sessionId ?? "").includes(SESSION_ID))).toBe(true);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});
});
