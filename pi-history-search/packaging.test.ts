import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("generated history worker matches its maintained sources", () => {
	const result = spawnSync(process.execPath, ["scripts/sync-history-worker.mjs", "--check"], { encoding: "utf8", timeout: 5000 });
	expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
});

test("copied worker artifact reads synthetic history with no source tree or runtime dependencies", () => {
	const root = mkdtempSync(join(tmpdir(), "history-copy-"));
	try {
		const artifact = join(root, "worker-runtime.mjs");
		copyFileSync("pi-history-search/worker-runtime.mjs", artifact);
		const file = join(root, "2026-01-01T00-00-00-000Z_fixture.jsonl");
		writeFileSync(
			file,
			`${JSON.stringify({ type: "session", id: "fixture", cwd: "/fixture" })}\n${JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text: "synthetic copied worker" }] } })}\n`
		);
		const result = spawnSync(process.execPath, [artifact], {
			input: JSON.stringify({ method: "readSession", args: [file, { maxChars: 2000 }] }),
			encoding: "utf8",
			timeout: 5000,
			cwd: root,
		});
		expect(result.status).toBe(0);
		const reply = JSON.parse(result.stdout);
		expect(reply.ok).toBe(true);
		expect(reply.value.messages[0].text).toBe("synthetic copied worker");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
