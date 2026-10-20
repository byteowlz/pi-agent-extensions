import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import extension, { renderTodoList } from "./index.js";
import { type WidgetTodo, renderWidget } from "./widget.js";

const theme = { fg: (_color: string, text: string) => text } as unknown as Theme;
const todos: WidgetTodo[] = [
	{ content: "Waiting", status: "pending", priority: "medium" },
	{ content: "Build 界\nnow", status: "in_progress", priority: "high" },
	{ content: "Finished", status: "completed", priority: "low" },
	{ content: "Abandoned", status: "cancelled", priority: "medium" },
];

test("collapsed renderer is one bounded row at narrow/wide widths and prioritizes progress", () => {
	for (const width of [0, 1, 4, 12, 35, 160]) {
		const lines = renderWidget(todos, theme, width, true);
		expect(lines).toHaveLength(1);
		expect(visibleWidth(lines[0])).toBeLessThanOrEqual(width);
		expect(lines[0]).not.toContain("\n");
	}
	const wide = renderWidget(todos, theme, 160, true)[0];
	expect(wide).toContain("Build 界 now");
	expect(wide).toContain("1 in progress, 1 pending, 1 done");
	expect(renderWidget([], theme, 80, true)).toEqual([]);
	expect(renderWidget([todos[2]], theme, 80, true)[0]).toContain("1 done");
	expect(renderWidget([todos[3]], theme, 80, true)[0]).toContain("1 cancelled");
});

test("expanded renderer preserves active list, done count and overflow", () => {
	const lines = renderWidget(todos, theme, 80, false);
	expect(lines).toHaveLength(4);
	expect(lines.join("\n")).toContain("Waiting");
	expect(lines.join("\n")).toContain("✓ 1 todo done");
	expect(lines.join("\n")).not.toContain("Finished");
	for (const width of [0, 1, 10, 80]) {
		for (const line of renderWidget(todos, theme, width, false)) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
	}
	expect(
		renderWidget(
			Array.from({ length: 10 }, () => todos[0]),
			theme,
			80,
			false
		).join("\n")
	).toContain("2 more");
});

test("mock lifecycle: default/config false, toggle, reset, empty and disabled clear", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "pi-todolist-test-"));
	type Handler = (event: { reason?: string }, ctx: ExtensionContext) => Promise<void>;
	const handlers = new Map<string, Handler>();
	let command: ((args: string, ctx: ExtensionContext) => Promise<void>) | undefined;
	let factory: ((tui: unknown, theme: Theme) => { render: (width: number) => string[] }) | undefined;
	const notifications: string[] = [];
	let renderResult:
		| ((
				result: { details: { todos: WidgetTodo[] } },
				options: { expanded: boolean },
				theme: Theme
		  ) => { render: (width: number) => string[] })
		| undefined;
	const pi = {
		on: (name: string, handler: Handler) => handlers.set(name, handler),
		registerTool: (definition: { renderResult: typeof renderResult }) => {
			renderResult = definition.renderResult;
		},
		registerCommand: (name: string, definition: { handler: typeof command }) => {
			if (name === "todo") command = definition.handler;
			expect(name).not.toBe("todos");
		},
	} as unknown as ExtensionAPI;
	const ctx = {
		cwd,
		hasUI: true,
		sessionManager: { getSessionId: () => "test" },
		ui: {
			setWidget: (_key: string, value: typeof factory) => {
				factory = value;
			},
			notify: (text: string) => notifications.push(text),
		},
	} as unknown as ExtensionContext;
	const configure = (config: object) =>
		writeFileSync(join(cwd, "oqto-todos.json"), JSON.stringify({ storagePath: cwd, ...config }));
	const rows = () => factory?.(undefined, theme).render(100).length;
	try {
		writeFileSync(join(cwd, "test.json"), JSON.stringify({ todos }));
		configure({});
		extension(pi);
		const expandedText = renderResult?.({ details: { todos } }, { expanded: true }, theme).render(160).join("\n") ?? "";
		// Done and cancelled todos are summarized, never listed — expanded included.
		expect(renderResult?.({ details: { todos } }, { expanded: false }, theme).render(160).join("\n")).not.toContain("Finished");
		expect(expandedText).not.toContain("Finished");
		expect(expandedText).not.toContain("Abandoned");
		expect(expandedText).toContain("Waiting");
		expect(expandedText).toContain("1 done");
		expect(expandedText).toContain("1 cancelled");
		await handlers.get("session_start")?.({}, ctx);
		expect(rows()).toBe(1);
		await command?.("list", ctx);
		expect(notifications[0]).toContain("4 todos");
		await command?.("expand", ctx);
		expect(rows()).toBe(4);
		await command?.("toggle", ctx);
		expect(rows()).toBe(1);
		await command?.("expand", ctx);
		await handlers.get("session_tree")?.({}, ctx);
		expect(rows()).toBe(1);
		configure({ tuiWidgetCollapsed: false });
		await handlers.get("session_start")?.({ reason: "switch" }, ctx);
		expect(rows()).toBe(4);
		await command?.("collapse", ctx);
		expect(rows()).toBe(1);
		await handlers.get("session_start")?.({ reason: "switch" }, ctx);
		expect(rows()).toBe(4);
		configure({ tuiWidget: false });
		await handlers.get("session_start")?.({}, ctx);
		expect(factory).toBeUndefined();
		configure({ enabled: false });
		await handlers.get("session_start")?.({}, ctx);
		expect(factory).toBeUndefined();
		configure({});
		writeFileSync(join(cwd, "test.json"), JSON.stringify({ todos: [] }));
		await handlers.get("session_start")?.({}, ctx);
		expect(factory).toBeUndefined();
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("expanded lists only open todos, even with many finished ones", () => {
	const many = [
		...Array.from({ length: 12 }, (_, i) => ({ content: `Done ${i}`, status: "completed" as const, priority: "low" as const })),
		...Array.from({ length: 7 }, (_, i) => ({ content: `Open ${i}`, status: "pending" as const, priority: "medium" as const })),
		{ content: "Working", status: "in_progress" as const, priority: "high" as const },
	];
	const text = renderTodoList(many, theme, true, 100);
	for (let i = 0; i < 12; i++) expect(text).not.toContain(`Done ${i}`);
	// Expanded shows every open todo (no 5-item cap) and summarizes the rest.
	for (let i = 0; i < 7; i++) expect(text).toContain(`Open ${i}`);
	expect(text).toContain("Working");
	expect(text).toContain("12 done");
	expect(text).toContain("✓ 12 todos done");
	// The default view still caps the list.
	expect(renderTodoList(many, theme, false, 100)).toContain("... 3 more");
	// A fully finished list collapses to a single summary line.
	expect(renderTodoList(many.slice(0, 12), theme, true, 100).split("\n")).toHaveLength(1);
});

describe("todo content cap", () => {
	test("clamps on code-point boundaries and honours 0 = unlimited", async () => {
		const { clampTodoContent, normalizeMaxContentLength } = await import("./index.ts");
		expect(clampTodoContent("short", 160)).toBe("short");
		const long = "a".repeat(200);
		const clamped = clampTodoContent(long, 20);
		expect(Array.from(clamped)).toHaveLength(20);
		expect(clamped.endsWith("…")).toBe(true);
		expect(clampTodoContent(long, 0)).toBe(long);
		// Never splits a surrogate pair.
		expect(Array.from(clampTodoContent("🙂".repeat(30), 10)).length).toBeLessThanOrEqual(10);
		// Config bounds.
		expect(normalizeMaxContentLength(undefined)).toBe(160);
		expect(normalizeMaxContentLength(0)).toBe(0);
		expect(normalizeMaxContentLength(5)).toBe(16);
		expect(normalizeMaxContentLength(99999)).toBe(4000);
	});

	test("rendering applies the cap to widget and list", async () => {
		const { renderWidget } = await import("./widget.ts");
		const { renderTodoList } = await import("./index.ts");
		const long = "x".repeat(300);
		const todo = { id: "1", content: long, status: "pending" as const, priority: "medium" as const };
		for (const text of [renderWidget([todo], theme, 200, false, 40).join("\n"), renderTodoList([todo], theme, true, 200, 40)]) {
			expect(text).not.toContain(long);
			expect(text).toContain("…");
		}
	});
});
