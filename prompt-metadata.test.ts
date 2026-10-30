import { expect, test } from "bun:test";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import workflow from "./pi-durable-workflow/index.js";
import history from "./pi-history-search/index.js";
import ssh from "./pi-ssh-key/index.js";

function metadata(factory: (pi: ExtensionAPI) => void): Map<string, ToolDefinition> {
	const tools = new Map<string, ToolDefinition>();
	factory({
		on: () => {},
		registerTool: (tool: ToolDefinition) => tools.set(tool.name, tool),
		registerCommand: () => {},
		registerShortcut: () => {},
	} as unknown as ExtensionAPI);
	return tools;
}

test("SSH describes current approval restrictions, not backend roadmaps", () => {
	const description = metadata(ssh).get("request_ssh_access")?.description ?? "";
	expect(description).toContain("human");
	expect(description).toContain("passphrases");
	expect(description).toContain("TTL");
	expect(description).toContain("proxy sessions");
	expect(description).not.toContain("until");
	expect(description).not.toContain("backend");
});

test("workflow keeps interval syntax in the parameter and authority limits in the description", () => {
	const tool = metadata(workflow).get("workflow");
	expect(tool?.description).toContain("human");
	expect(tool?.description).toContain("does not activate");
	expect(tool?.description).not.toContain("not a Pi builtin");
	expect(tool?.description).not.toContain("weekly=7d");
	expect(JSON.stringify(tool?.parameters)).toContain("weekly=7d");
});

test("history prompt metadata keeps anchors and scope semantics, not search-engine troubleshooting", () => {
	const tools = metadata(history);
	const search = tools.get("HistorySearch");
	const grep = tools.get("HistoryGrep");
	const read = tools.get("HistoryRead");
	const guidance = JSON.stringify(search?.promptGuidelines);
	expect(search?.description).toContain("not proof of absence");
	expect(guidance).toContain("current-branch");
	expect(guidance).toContain("current-tree");
	expect(guidance).toContain("matchPosition");
	expect(guidance).not.toContain("stale indexes");
	expect(grep?.description).toContain("HistorySearch");
	expect(grep?.description).not.toContain("file once");
	expect(grep?.description).not.toContain("tokenization");
	expect(JSON.stringify(search?.parameters)).not.toContain("excludeCurrentSession=false");
	for (const tool of [search, grep, read]) expect(tool?.description.length).toBeLessThan(400);
});
