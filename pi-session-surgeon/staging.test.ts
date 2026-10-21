import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_DENY_PATHS, createStaging, overlayToml } from "./staging.js";

test("overlay is restriction-only: denies plus a lowered home_access, no grants", () => {
	const toml = overlayToml();
	expect(toml).toContain('home_access = "none"');
	for (const path of DEFAULT_DENY_PATHS) expect(toml).toContain(JSON.stringify(path));
	for (const forbidden of ["allow_write", "extra_ro_bind", "extra_rw_bind", "profile", "network", "[profiles"]) {
		expect(toml).not.toContain(forbidden);
	}
});

test("staging puts the writable surface inside one workspace and keeps policy outside it", () => {
	const root = mkdtempSync(join(tmpdir(), "surgeon-test-"));
	const sourceDir = mkdtempSync(join(tmpdir(), "surgeon-src-"));
	try {
		const source = join(sourceDir, "session.jsonl");
		writeFileSync(source, '{"type":"session","id":"h"}\n{"type":"message","id":"m","parentId":"h"}\n');
		chmodSync(source, 0o600);
		const agent = join(sourceDir, "agent");
		mkdirSync(agent);
		writeFileSync(join(agent, "models.json"), "{}");
		writeFileSync(join(agent, "auth.json"), "{}");
		const ext = join(sourceDir, "ext-src");
		mkdirSync(ext);
		writeFileSync(join(ext, "index.ts"), "export default () => {};");

		const staging = createStaging({ sourceFile: source, agentDir: agent, extensionDir: ext, root: join(root, "run") });
		expect(staging.root.startsWith(join(root, "run"))).toBe(true);
		// Policy lives outside the workspace grant.
		expect(staging.policyPath.startsWith(staging.work)).toBe(false);
		expect(statSync(staging.policyPath).mode & 0o777).toBe(0o600);
		// The session copy is the only session file, inside the workspace, private.
		expect(staging.targetFile.startsWith(staging.work)).toBe(true);
		expect(statSync(staging.targetFile).mode & 0o777).toBe(0o600);
		expect(readFileSync(staging.targetFile, "utf8")).toContain('"id":"m"');
		// Private agent dir copied with secrets, never from the real ~/.pi.
		expect(statSync(join(staging.agentDir, "auth.json")).mode & 0o777).toBe(0o600);
		expect(existsSync(join(staging.agentDir, "models.json"))).toBe(true);
		expect(existsSync(staging.extEntry)).toBe(true);
		expect(readFileSync(staging.policyPath, "utf8")).toContain('home_access = "none"');
		// Everything writable is under the workspace.
		for (const path of [staging.agentDir, staging.sessionsDir, staging.homeDir, staging.extDir]) {
			expect(path.startsWith(staging.work)).toBe(true);
		}
		staging.cleanup();
		expect(existsSync(staging.root)).toBe(false);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(sourceDir, { recursive: true, force: true });
	}
});
