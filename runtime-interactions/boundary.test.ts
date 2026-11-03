import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as api from "./mod.js";

const DIR = import.meta.dir;

function sourceFiles(): string[] {
	return readdirSync(DIR)
		.filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
		.map((name) => join(DIR, name));
}

test("the consumer package has zero pi, pi-tui, socket, hub or extension imports", () => {
	const forbidden = [
		"@earendil-works/pi",
		"@mariozechner/",
		"pi-coding-agent",
		"pi-tui",
		"node:net",
		"node:http",
		"node:https",
		"node:child_process",
		"node:dgram",
		"herdr",
		"pi-session-tools",
		"pi-tui-rpc",
		"../",
	];
	for (const file of sourceFiles()) {
		const source = readFileSync(file, "utf8");
		// Only import specifiers are inspected; prose may mention these names.
		const specifiers = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
		const violations = specifiers.flatMap((specifier) =>
			forbidden
				.filter((token) => specifier.includes(token))
				.map((token) => ({ file: file.slice(DIR.length + 1), specifier, token }))
		);
		expect(violations).toEqual([]);
	}
});

test("the package entry exposes the contract consumers need", () => {
	expect(typeof api.createInteractionRuntime).toBe("function");
	expect(typeof api.coverageFor).toBe("function");
	expect(typeof api.commandPalette).toBe("function");
	expect(typeof api.permissionPrompt).toBe("function");
	expect(typeof api.queueActionRequest).toBe("function");
	expect(typeof api.validateRuntimeRequest).toBe("function");
	expect(typeof api.validateSourceFrame).toBe("function");
	expect(Array.isArray(api.INTERACTION_ROWS)).toBe(true);
	expect(api.INTERACTION_ROWS).toHaveLength(10);
});

test("only pi engine access is marked as a genuine SDK gap for oqt", () => {
	// A missing port alone is not evidence of an SDK gap.
	expect(api.sdkGapRows(api.coverageFor("personal", {}))).toEqual([]);
	const rows = api.coverageFor(
		"personal",
		{},
		{
			catalog: "sdk_absent",
			dispatch: "sdk_absent",
			queueSnapshot: "sdk_absent",
			queueActions: "sdk_absent",
		}
	);
	expect(api.sdkGapRows(rows)).toEqual(["catalog", "dispatch", "queue_snapshot", "queue_actions"]);
	// Permission/owner/retention/headless are blocked by producer wiring, owner
	// authority, Core-qualified DTOs or renderer work — not by the Pi SDK.
	for (const row of ["permission_menu", "explicit_decision", "owner_config", "retained_notifications", "reconnect_headless"]) {
		expect(rows.find((entry) => entry.row === row)?.sdkGap).toBe(false);
	}
});
