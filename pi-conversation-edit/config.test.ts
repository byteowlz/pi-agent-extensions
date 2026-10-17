import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.js";

test("configuration defaults, precedence and malformed first-match denial", () => {
	const cwd = mkdtempSync(join(tmpdir(), "rewrite-config-"));
	const agent = mkdtempSync(join(tmpdir(), "rewrite-agent-"));
	try {
		expect(loadConfig(cwd, agent)).toEqual({ enabled: true, allowAI: true, allowExternalEditor: true });
		writeFileSync(join(agent, "conversation-edit.json"), '{"enabled":false}');
		expect(loadConfig(cwd, agent).enabled).toBe(false);
		writeFileSync(join(cwd, "conversation-edit.json"), '{"allowAI":false}');
		expect(loadConfig(cwd, agent)).toEqual({ enabled: true, allowAI: false, allowExternalEditor: true });
		writeFileSync(join(cwd, "conversation-edit.json"), '{"enabled":"false"}');
		expect(() => loadConfig(cwd, agent)).toThrow("Invalid");
		writeFileSync(join(cwd, "conversation-edit.json"), " ".repeat(4097));
		expect(() => loadConfig(cwd, agent)).toThrow("4 KiB");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
		rmSync(agent, { recursive: true, force: true });
	}
});
