import { expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import pisudo from "./index.js";

function registeredTools(): ToolDefinition[] {
	const tools: ToolDefinition[] = [];
	pisudo({
		on: () => {},
		registerCommand: () => {},
		registerTool: (tool: ToolDefinition) => tools.push(tool),
	} as unknown as ExtensionAPI);
	return tools;
}

test("only the unified sudo tool is registered, without deprecated prompt guidance", () => {
	const tools = registeredTools();
	expect(tools.map((tool) => tool.name)).toEqual(["sudo_exec"]);
	const tool = tools[0];
	const prompt = JSON.stringify([tool.description, tool.promptSnippet, tool.promptGuidelines]);
	expect(prompt).not.toContain("remote_sudo_exec");
	expect(prompt).not.toContain("backward compatibility");
	expect(prompt).not.toContain("pi-sudo:allow");
	expect(tool.parameters.properties.host.type).toBe("string");
	expect(tool.parameters.required).toContain("command");
	expect(tool.parameters.required).not.toContain("host");
});

test("sudo_exec preserves local and remote failure receipts without requesting privileges", async () => {
	const tool = registeredTools()[0];
	const ctx = { hasUI: false } as ExtensionContext;
	for (const host of [undefined, "fixture-host"]) {
		const result = await tool.execute("test", { command: "true", ...(host ? { host } : {}) }, undefined, undefined, ctx);
		const receipt = (result as unknown as { structuredContent: Record<string, unknown> }).structuredContent;
		expect(receipt.scope).toBe(host ? "remote" : "local");
		expect(receipt.host).toBe(host);
		expect(receipt.ok).toBe(false);
		expect(receipt.effects).toBe("none");
	}
});
