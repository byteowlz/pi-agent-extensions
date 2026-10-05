import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("headless CLI uses durable store, scoped restart, CAS and terminal records", async () => {
	const root = await mkdtemp(join(tmpdir(), "selection-cli-"));
	const cli = join(import.meta.dir, "cli.ts");
	const run = (args: string[], input?: unknown) =>
		spawnSync(process.execPath, [cli, ...args, "--root", root, "--scope", "fixture"], {
			input: input === undefined ? undefined : JSON.stringify(input),
			encoding: "utf8",
			timeout: 10000,
		});
	try {
		const created = run(["create"], {
			version: 1,
			mode: "questions",
			title: "Fixture",
			questions: [{ id: "one", title: "One", kind: "text" }],
		});
		expect(created.status).toBe(0);
		const id: string = JSON.parse(created.stdout).record.id;
		const saved = run(["save", "--id", id, "--revision", "0"], {
			one: { answered: false, selectedIds: [], disposition: "skipped" },
		});
		expect(saved.status).toBe(0);
		const fetched = run(["get", "--id", id]);
		expect(JSON.parse(fetched.stdout).record.answers.one.disposition).toBe("skipped");
		const stale = run(["save", "--id", id, "--revision", "0"], { one: { answered: true, selectedIds: [], text: "" } });
		expect(stale.status).toBe(1);
		expect(stale.stderr).toContain("Revision conflict");
		expect(run(["close", "--id", id]).status).toBe(0);
		expect(JSON.parse(run(["get", "--id", id]).stdout).record.state).toBe("cancelled");
		expect(run(["unknown"]).status).toBe(1);
		expect(run(["get", "--id", id, "--presentation", "public"]).status).toBe(1);
		const wrong = spawnSync(process.execPath, [cli, "get", "--root", root, "--scope", "other", "--id", id], {
			encoding: "utf8",
			timeout: 10000,
		});
		expect(wrong.status).toBe(1);
		expect(wrong.stdout).toBe("");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
