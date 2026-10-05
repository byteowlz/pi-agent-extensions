import { beforeAll, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Box, Text, visibleWidth } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import { TodoResultComponent, renderTodoLine, renderTodoList, truncateToWidthBgSafe } from "./index";
import type { TodoItem } from "./index";

// ============================================================================
// Real Pi TUI theme + renderer (NOT an identity mock). We load the actual dark
// theme from the installed pi-coding-agent, build lines with the extension's
// render helpers, then wrap them in a backgrounded Box exactly like the
// tool-result shell does (`theme.bg("toolSuccessBg", ...)`). This reproduces the
// reported "dark strip" bug: before the fix a full `\x1b[0m` reset inside the
// truncated line cleared the tool-success background.
// ============================================================================

let theme: Theme;

beforeAll(async () => {
	const themeMod = await import("../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js");
	const themePath = fileURLToPath(
		new URL("../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/dark.json", import.meta.url)
	);
	theme = themeMod.loadThemeFromPath(themePath, "truecolor");
});

/** Wrap rendered lines in a success-backgrounded Box like `tool-execution.js`. */
function renderWithSuccessBg(lines: string[], width: number): string[] {
	const box = new Box(1, 1, (text) => theme.bg("toolSuccessBg", text));
	const text = new Text(lines.join("\n"), 0, 0);
	box.addChild(text);
	const out = box.render(width);
	return out;
}

const LONG_CONTENT =
	"LATER: measure prompt-cache reuse of the memory block; when is over-kee. This is a really long todo that keeps going far beyond any reasonable panel width to force an ellipsis.";

const todos: TodoItem[] = [
	{ id: "a", content: LONG_CONTENT, status: "pending", priority: "low" },
	{
		id: "b",
		content: "PINNED: Etin for live tool-call descriptions — pilot: DeepSeek labels the free tier",
		status: "pending",
		priority: "low",
	},
	{
		id: "c",
		content: "Post cross-agent GPU coordination proposal for dpty on the agent board",
		status: "in_progress",
		priority: "medium",
	},
	{ id: "d", content: "短い テスト CJK 行", status: "completed", priority: "low" },
	{ id: "e", content: "plain short", status: "pending", priority: "high" },
];

// The success background region we expect to be preserved: it starts with the
// `\x1b[48;...m` code and ends with `\x1b[49m`.
const BG_OPEN = "\u001b[48;";
const BG_CLOSE = "\u001b[49m";

function countFullResetsInsideBg(line: string): number {
	// Extract the portion between the first bg-open code and the final bg-close.
	const start = line.indexOf(BG_OPEN);
	const end = line.lastIndexOf(BG_CLOSE);
	if (start === -1 || end === -1 || end < start) return 0;
	const inside = line.slice(line.indexOf("m", start) + 1, end);
	// Count full resets that are NOT the trailing bg-close itself.
	return inside.split("\u001b[0m").length - 1;
}

describe("truncateToWidthBgSafe", () => {
	test("does not emit a full reset when no truncation is needed", () => {
		const out = truncateToWidthBgSafe("short text", 80);
		expect(out.includes("\u001b[0m")).toBe(false);
		expect(out).toBe("short text");
	});

	test("keeps an ellipsis when truncating long text", () => {
		const out = truncateToWidthBgSafe(LONG_CONTENT, 40);
		expect(out.includes("...")).toBe(true);
		expect(visibleWidth(out)).toBeLessThanOrEqual(40);
	});

	test("never emits a full \\x1b[0m reset even when truncated", () => {
		const out = truncateToWidthBgSafe(LONG_CONTENT, 40);
		expect(out.includes("\u001b[0m")).toBe(false);
	});

	test("plain (no-ANSI) short input is untouched and reset-free", () => {
		expect(truncateToWidthBgSafe("hello", 10)).toBe("hello");
	});
});

describe("renderTodoLine background safety", () => {
	for (const width of [40, 80, 100, 120]) {
		test(`no full reset inside the success region (width=${width})`, () => {
			const line = renderTodoLine(todos[0], theme, width);
			const bgLines = renderWithSuccessBg([line], width);
			for (const l of bgLines) {
				expect(countFullResetsInsideBg(l)).toBe(0);
			}
			expect(line.includes("...")).toBe(true);
		});
	}

	test("line width never exceeds the requested width", () => {
		for (const width of [40, 80, 100]) {
			const line = renderTodoLine(todos[0], theme, width);
			expect(visibleWidth(line)).toBeLessThanOrEqual(width);
		}
	});

	test("priority marker stays present and colored after truncation", () => {
		const low = todos[0]; // priority low -> "v"
		const high = todos[4]; // priority high -> "!"
		const lowLine = renderTodoLine(low, theme, 40);
		const highLine = renderTodoLine(high, theme, 40);
		const strip = (s: string) => {
			// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping escape codes is the point
			const ansiPc = /\u001b\[[0-9;]*m/g;
			return s.replace(ansiPc, "");
		};
		expect(strip(lowLine)).toContain("v");
		expect(strip(highLine)).toContain("!");
	});
});

describe("renderTodoList background safety", () => {
	for (const width of [40, 80, 100, 120]) {
		test(`collapsed list has no full reset inside success region (width=${width})`, () => {
			const text = renderTodoList(todos, theme, false, width);
			const bgLines = renderWithSuccessBg(text.split("\n"), width);
			for (const l of bgLines) {
				expect(countFullResetsInsideBg(l)).toBe(0);
			}
		});

		test(`expanded list has no full reset inside success region (width=${width})`, () => {
			const text = renderTodoList(todos, theme, true, width);
			const bgLines = renderWithSuccessBg(text.split("\n"), width);
			for (const l of bgLines) {
				expect(countFullResetsInsideBg(l)).toBe(0);
			}
		});
	}

	test("long unicode content truncates without a full reset and stays within width", () => {
		const unicodeTodo: TodoItem = {
			id: "u",
			content: "这是一个非常长的中文待办事项用来测试宽字符截断行为，它应该被正确地按列宽截断并且不会破坏背景色。",
			status: "pending",
			priority: "medium",
		};
		for (const width of [40, 60, 80]) {
			const line = renderTodoLine(unicodeTodo, theme, width);
			expect(visibleWidth(line)).toBeLessThanOrEqual(width);
			const bgLines = renderWithSuccessBg([line], width);
			for (const l of bgLines) expect(countFullResetsInsideBg(l)).toBe(0);
		}
	});

	test("embedded ANSI in content does not break the success background", () => {
		const ansiTodo: TodoItem = {
			id: "s",
			content: "colored \u001b[31mred\u001b[0m text with reset",
			status: "pending",
			priority: "medium",
		};
		const line = renderTodoLine(ansiTodo, theme, 60);
		const bgLines = renderWithSuccessBg([line], 60);
		// The renderer must never introduce a full-reset that clears the success
		// background; even the user's own `\u001b[0m` is rewritten to a fg-only one.
		for (const l of bgLines) {
			expect(countFullResetsInsideBg(l)).toBe(0);
		}
		expect(visibleWidth(line)).toBeLessThanOrEqual(60);
	});
});

describe("TodoResultComponent (width-aware renderer)", () => {
	for (const width of [40, 60, 100]) {
		test(`renders at width=${width} with no full reset in success region`, () => {
			const comp: Component = new TodoResultComponent("", todos, theme, false);
			const lines = comp.render(width);
			expect(lines.length).toBeGreaterThan(0);
			const bgLines = renderWithSuccessBg(lines, width);
			for (const l of bgLines) {
				expect(countFullResetsInsideBg(l)).toBe(0);
			}
			// Each rendered line's visible width fits the available width.
			for (const l of lines) {
				expect(visibleWidth(l)).toBeLessThanOrEqual(width);
			}
		});
	}

	test("cache is invalidated when invalidate() is called", () => {
		const comp = new TodoResultComponent("", todos, theme, true);
		const first = comp.render(80);
		comp.invalidate();
		const second = comp.render(80);
		expect(second).toEqual(first);
	});

	test("prefix lines (e.g. 'OK Added: ...') are also background-safe", () => {
		const prefix = `${theme.fg("success", "OK Added: ")}${theme.fg("text", LONG_CONTENT)}\n\n`;
		const comp = new TodoResultComponent(prefix, todos, theme, false);
		const lines = comp.render(60);
		const bgLines = renderWithSuccessBg(lines, 60);
		for (const l of bgLines) {
			expect(countFullResetsInsideBg(l)).toBe(0);
		}
	});
});
