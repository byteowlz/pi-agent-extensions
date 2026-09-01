import { describe, expect, spyOn, test } from "bun:test";
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
