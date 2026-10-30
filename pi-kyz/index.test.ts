import { describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import kyzExtension from "./index";

function buildMockExtensionAPI(): {
	pi: ExtensionAPI;
	fireToolExecutionStart: (toolName: string) => Promise<void>;
} {
	const toolStartHandlers: Array<(event: { toolName: string }, ctx: ExtensionContext) => Promise<void>> = [];

	const pi = {
		on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void>) => {
			if (event === "tool_execution_start") {
				toolStartHandlers.push(handler as (event: { toolName: string }, ctx: ExtensionContext) => Promise<void>);
			}
		},
		registerTool: () => {
			// Registration is outside this test's scope.
		},
		registerCommand: () => {
			// Registration is outside this test's scope.
		},
	} as unknown as ExtensionAPI;

	return {
		pi,
		fireToolExecutionStart: async (toolName) => {
			for (const handler of toolStartHandlers) {
				await handler({ toolName }, {} as ExtensionContext);
			}
		},
	};
}

test("secret context exposes names and safe usage, not values or human command help", async () => {
	const dir = mkdtempSync(join(tmpdir(), "kyz-prompt-"));
	const oldPath = process.env.PATH;
	type Hook = (event: unknown, ctx: ExtensionContext) => Promise<{ systemPrompt?: string } | undefined>;
	const hooks = new Map<string, Hook>();
	const commands = new Map<string, { handler: (args: string, ctx: ExtensionContext) => Promise<void> }>();
	const ctx = { ui: { notify: () => {} } } as unknown as ExtensionContext;
	try {
		writeFileSync(
			join(dir, "kyz"),
			`#!/usr/bin/env bash
case "$1" in
vault) printf '%s' '{"unlocked":true}' ;;
list) printf '%s' '{"entries":[{"service":"fixture","key":"token","tags":["review"]}]}' ;;
get) printf '%s' '{"service":"fixture","key":"token","fields":{"value":"synthetic-fixture-value"}}' ;;
esac
`,
			{ mode: 0o700 }
		);
		process.env.PATH = `${dir}:${oldPath ?? ""}`;
		kyzExtension({
			on: (name: string, hook: Hook) => hooks.set(name, hook),
			registerTool: () => {},
			registerCommand: (name: string, command: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) =>
				commands.set(name, command),
		} as unknown as ExtensionAPI);
		await commands.get("kyz-scope")?.handler("tag:review", ctx);
		await commands.get("kyz-reload")?.handler("", ctx);
		const prompt = (await hooks.get("before_agent_start")?.({ systemPrompt: "Base prompt" }, ctx))?.systemPrompt ?? "";
		expect(prompt).toContain("$FIXTURE_TOKEN");
		expect(prompt).toContain("Active tag scope: review");
		expect(prompt).toContain("Never ask the user for secret values");
		expect(prompt).not.toContain("synthetic-fixture-value");
		expect(prompt).not.toContain("Use /kyz");
	} finally {
		await commands.get("kyz-scope")?.handler("clear", ctx);
		if (oldPath === undefined) Reflect.deleteProperty(process.env, "PATH");
		else process.env.PATH = oldPath;
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("pi-kyz TUI output isolation", () => {
	test("tool lifecycle hooks do not write status messages to process stderr", async () => {
		const stderrWrite = spyOn(process.stderr, "write").mockImplementation(() => true);
		try {
			const { pi, fireToolExecutionStart } = buildMockExtensionAPI();
			kyzExtension(pi);

			await fireToolExecutionStart("read");

			expect(stderrWrite).not.toHaveBeenCalled();
		} finally {
			stderrWrite.mockRestore();
		}
	});
});
