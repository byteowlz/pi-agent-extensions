import { expect, test } from "bun:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { forkBoundaryMessage, sideLaunch } from "./side-launch.js";

test("side launches carry a new named identity and bootstrap hint independently of the initial task", () => {
	const launch = sideLaunch(
		{ label: "Investigate Tests", cwd: "/tmp", sessionFile: "/parent.jsonl", parentSessionId: "parent" },
		"child"
	);
	expect(launch.name).toMatch(/^\[side\] Investigate Tests \[[a-z0-9-]+\]$/);
	expect(launch.argv[launch.argv.indexOf("--session-id") + 1]).toBe("child");
	expect(launch.argv[launch.argv.indexOf("--name") + 1]).toBe(launch.name);
	expect(launch.argv[launch.argv.indexOf("--append-system-prompt") + 1]).toContain("parent session parent");
	expect(launch.hint).toContain("Working-directory files may still be shared");
});

test("fork boundary is durable and child-owned, not suppressed by an inherited parent marker", () => {
	let entries: unknown[] = [{ type: "custom_message", customType: "side-session-boundary", details: { sessionId: "parent" } }];
	const ctx = {
		sessionManager: {
			getSessionId: () => "child",
			getHeader: () => ({ parentSession: "/parent.jsonl" }),
			getBranch: () => entries,
		},
	} as unknown as ExtensionContext;
	const message = forkBoundaryMessage(ctx);
	expect(message?.details.sessionId).toBe("child");
	expect(message?.content).toContain("separate forked session");
	entries.push({ type: "custom_message", customType: message?.customType, details: message?.details });
	expect(forkBoundaryMessage(ctx)).toBeUndefined();
	entries = [];
	expect(forkBoundaryMessage(ctx)).toBeDefined();
	expect(forkBoundaryMessage({ sessionManager: { getHeader: () => null } } as unknown as ExtensionContext)).toBeUndefined();
});
