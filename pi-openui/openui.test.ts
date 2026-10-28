process.env.OPENUI_TELEMETRY_DISABLED = "1";
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { visibleWidth } from "@earendil-works/pi-tui";
import extension, { enabledOnBranch, STATE_ENTRY, TOOL } from "./index.js";
import { type Key, evaluateAction, reduce } from "./interact.js";
import { FIXTURES, createOqtoParser } from "./openui-vendor.js";
import { type Paint, type ViewState, emptyState, render } from "./render.js";

const plain: Paint = { fg: (_r, t) => t, bold: (t) => t, inverse: (t) => `<${t}>` };
const parse = (name: string) => createOqtoParser().parse(FIXTURES[name] ?? "");

function drive(name: string, keys: Key[], width = 72) {
	const parsed = parse(name);
	let state: ViewState = emptyState(parsed.stateDeclarations, true);
	let outcome: ReturnType<typeof reduce>["outcome"];
	for (const key of keys) {
		const { controls } = render(parsed.root, width, plain, state);
		const next = reduce(state, controls, key);
		state = next.state;
		outcome = next.outcome ?? outcome;
		if (outcome) break;
	}
	return { state, outcome, screen: render(parsed.root, width, plain, state).lines.join("\n") };
}

describe("cells renderer", () => {
	for (const name of Object.keys(FIXTURES)) {
		test(`${name} renders within width at 40, 72 and 120 columns`, () => {
			const parsed = parse(name);
			for (const width of [40, 72, 120]) {
				const { lines } = render(parsed.root, width, plain, emptyState(parsed.stateDeclarations));
				expect(lines.length).toBeGreaterThan(0);
				for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
			}
		});
	}

	test("dashboard shows KPIs, trend, tabs and a Braille area chart", () => {
		const out = drive("dashboard", []).screen;
		expect(out).toContain("1,284");
		expect(out).toContain("▲12%");
		expect(out).toContain("<");
		expect(out).toMatch(/[\u2801-\u28ff]/);
		expect(out).toContain("Peak on Thursday");
	});

	test("tabs switch with arrow keys", () => {
		const { screen } = drive("dashboard", ["right"]);
		expect(screen).toContain("2 failing in history");
		expect(screen).not.toContain("Peak on Thursday");
		expect(drive("dashboard", ["right", "right"]).screen).toContain("degraded");
	});

	test("unknown components are dropped, the rest renders", () => {
		expect(drive("invalid-unknown", []).screen).toContain("still renders");
	});
});

describe("answers", () => {
	test("plan approval answers through @Answer", () => {
		const parsed = parse("plan-approve");
		const controls = render(parsed.root, 72, plain, emptyState({}, true)).controls;
		const approve = controls.findIndex((c) => c.kind === "button" && c.label === "Approve plan");
		expect(approve).toBeGreaterThan(-1);
		const { outcome } = drive("plan-approve", [...Array(approve).fill("tab"), "enter"]);
		expect(outcome).toEqual({ kind: "answer", value: { approved: true } });
	});

	test("form answers carry the chosen values from state bindings", () => {
		const parsed = parse("compare-options");
		const controls = render(parsed.root, 72, plain, emptyState(parsed.stateDeclarations, true)).controls;
		const submit = controls.findIndex((c) => c.kind === "button" && c.label === "Create workspace");
		const keys: Key[] = [
			"down",
			"tab",
			"right",
			"tab",
			{ char: "x" },
			"enter",
			...Array(Math.max(0, submit - 2)).fill("tab"),
			"enter",
		];
		const { outcome } = drive("compare-options", keys);
		expect(outcome).toEqual({ kind: "answer", value: { profile: "strict", network: "isolated", paths: "x" } });
	});

	test("escape cancels without an answer", () => {
		expect(drive("plan-approve", ["escape"]).outcome).toEqual({ kind: "cancel" });
	});

	test("non-answer actions are reported as events, never as answers", () => {
		const action = { k: "Comp", name: "OpenUrl", args: [], mappedProps: { url: { k: "Str", v: "https://example.invalid" } } };
		expect(evaluateAction(action, {})?.kind).toBe("event");
	});
});

describe("session toggle and tool", () => {
	type Handler = (event: unknown, ctx: unknown) => unknown;
	function host(entries: unknown[] = [], mode = "print") {
		const handlers: Record<string, Handler[]> = {};
		const tools: Record<string, { execute: (...a: unknown[]) => Promise<unknown> }> = {};
		const commands: Record<string, { handler: (args: string, ctx: unknown) => Promise<void> }> = {};
		let active: string[] = ["read", "bash"];
		const appended: unknown[] = [];
		const pi = {
			on: (name: string, h: Handler) => {
				const list = handlers[name] ?? [];
				list.push(h);
				handlers[name] = list;
				return () => undefined;
			},
			registerTool: (t: { name: string; execute: (...a: unknown[]) => Promise<unknown> }) => {
				tools[t.name] = t;
			},
			registerCommand: (n: string, c: { handler: (args: string, ctx: unknown) => Promise<void> }) => {
				commands[n] = c;
			},
			appendEntry: (customType: string, data: unknown) => {
				const e = { type: "custom", customType, data };
				appended.push(e);
				entries.push(e);
			},
			getActiveTools: () => active,
			setActiveTools: (t: string[]) => {
				active = t;
			},
		};
		const ctx = {
			mode,
			hasUI: mode === "tui",
			sessionManager: { getBranch: () => entries },
			ui: { setStatus: () => undefined, notify: () => undefined },
		};
		extension(pi as never);
		const emit = async (name: string, event: unknown) => {
			for (const h of handlers[name] ?? []) await h(event, ctx);
		};
		return { tools, commands, ctx, emit, appended, active: () => active };
	}

	test("off by default: tool inactive, no prompt section, tool refuses", async () => {
		const h = host();
		await h.emit("session_start", {});
		expect(h.active()).not.toContain(TOOL);
		const event = { systemPromptOptions: { sections: {} as Record<string, string> } };
		await h.emit("before_agent_start", event);
		expect(event.systemPromptOptions.sections.openui).toBeUndefined();
		await expect(
			h.tools[TOOL]?.execute("1", { program: 'root = Stack([TextContent("x")])', fallback: "x" }, undefined, undefined, h.ctx)
		).rejects.toThrow("off");
	});

	test("/openui on persists, activates the tool and injects the profile prompt; off removes it", async () => {
		const h = host();
		await h.emit("session_start", {});
		await h.commands.openui?.handler("on", h.ctx);
		expect(h.appended).toEqual([{ type: "custom", customType: STATE_ENTRY, data: { enabled: true } }]);
		expect(h.active()).toContain(TOOL);
		const event = { systemPromptOptions: { sections: {} as Record<string, string> } };
		await h.emit("before_agent_start", event);
		expect(event.systemPromptOptions.sections.openui).toContain("@Answer");
		await h.commands.openui?.handler("off", h.ctx);
		expect(h.active()).not.toContain(TOOL);
		await h.emit("before_agent_start", event);
		expect(event.systemPromptOptions.sections.openui).toBeUndefined();
	});

	test("state survives reload: reconstructed from the active branch", async () => {
		const entries = [{ type: "custom", customType: STATE_ENTRY, data: { enabled: true } }];
		expect(enabledOnBranch(entries)).toBe(true);
		const h = host(entries);
		await h.emit("session_start", {});
		expect(h.active()).toContain(TOOL);
		expect(enabledOnBranch([...entries, { type: "custom", customType: STATE_ENTRY, data: { enabled: false } }])).toBe(false);
	});

	test("outside the TUI a waiting part never fabricates an answer", async () => {
		const h = host([{ type: "custom", customType: STATE_ENTRY, data: { enabled: true } }], "print");
		await h.emit("session_start", {});
		const program = FIXTURES["plan-approve"] ?? "";
		const result = (await h.tools[TOOL]?.execute(
			"1",
			{ program, fallback: "Approve the plan?", wait: true },
			undefined,
			undefined,
			h.ctx
		)) as {
			details: { outcome: string; answer?: unknown };
		};
		expect(result.details.outcome).toBe("unattended");
		expect(result.details.answer).toBeUndefined();
	});

	test("invalid programs fail with a fix-it message instead of rendering nothing", async () => {
		const h = host([{ type: "custom", customType: STATE_ENTRY, data: { enabled: true } }]);
		await h.emit("session_start", {});
		await expect(
			h.tools[TOOL]?.execute("1", { program: "this is not openui", fallback: "x" }, undefined, undefined, h.ctx)
		).rejects.toThrow("did not render");
	});
});

describe("installed layout", () => {
	test("imports nothing outside the folder except Pi-provided packages and node builtins", () => {
		const dir = dirname(new URL(import.meta.url).pathname);
		const allowed = /^(node:|@earendil-works\/pi-|typebox$|\.\/|\.\.\/pi-selection\/)/;
		for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
			for (const m of readFileSync(join(dir, f), "utf8").matchAll(/from "([^"]+)"/g)) expect(m[1]).toMatch(allowed);
		}
		const bundle = readFileSync(join(dir, "openui-vendor.js"), "utf8");
		expect(bundle.match(/^import .* from "[^.][^"]*";$/gm) ?? []).toEqual([]);
	});
});
