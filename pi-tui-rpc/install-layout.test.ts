import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

test("deployed layout resolves the consumer package, ajv and the pinned manifest", () => {
	const repo = join(import.meta.dir, "..");
	const result = spawnSync(process.execPath, [join(repo, "scripts", "verify-install-layout.mjs")], {
		encoding: "utf8",
		timeout: 60_000,
	});
	expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
	expect(result.stdout).toContain("install layout OK");
});
