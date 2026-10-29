import { describe, expect, test } from "bun:test";

import { visibleWidth } from "@earendil-works/pi-tui";
import { MAX_LINES, RULE, joinRow, planCard } from "./last-question";

import { createLastQuestionCard } from "./widget";

/** Identity theme that records which tokens were used. */
function recordingTheme(): { fg: (c: string, t: string) => string; bg: (c: string, t: string) => string; used: string[] } {
	const used: string[] = [];
	return {
		used,
		fg: (color: string, text: string) => {
			used.push(`fg:${color}`);
			return text;
		},
		bg: (color: string, text: string) => {
			used.push(`bg:${color}`);
			return text;
		},
	};
}

const QUESTION =
	"how do I rotate the deploy key without breaking the build for the running pods while the old one is cached in the sidecar container";

describe("card planning", () => {
	test("header carries the timestamp and the expand hint", () => {
		const plan = planCard(`${QUESTION} ${QUESTION}`, 80, { stamp: "10/29/2026, 12:00 PM", hint: "ctrl+q" });
		expect(plan.header.right).toBe("ctrl+q expand");
		expect(plan.header.left).toContain("10/29/2026, 12:00 PM");
		expect(plan.body).toHaveLength(MAX_LINES);
		expect(plan.truncated).toBe(true);
		expect(plan.body[MAX_LINES - 1]?.endsWith("…")).toBe(true);
	});

	test("a question that fits shows no shortcut hint", () => {
		const plan = planCard("what is the cache TTL?", 80, { stamp: "10/29/2026, 9:05 AM", hint: "ctrl+q" });
		expect(plan.truncated).toBe(false);
		expect(plan.header.right).toBe("");
	});

	test("a short question is not marked as truncated", () => {
		const plan = planCard("what is the cache TTL?", 80, { stamp: "10/29/2026, 9:05 AM", hint: "ctrl+q" });
		expect(plan.body).toHaveLength(1);
		expect(plan.truncated).toBe(false);
		expect(plan.body[0]).toBe("what is the cache TTL?");
	});

	test("the hint degrades before the timestamp is cut", () => {
		const stamp = "10/29/2026, 12:00 PM";
		const long = `${QUESTION} ${QUESTION}`; // always overflows two lines
		expect(planCard(long, 90, { stamp, hint: "ctrl+q" }).header.right).toBe("ctrl+q expand");
		expect(planCard(long, 31, { stamp, hint: "ctrl+q" }).header.right).toBe("ctrl+q");
		expect(planCard(long, 20, { stamp, hint: "ctrl+q" }).header.right).toBe("");
	});

	test("every planned row fits the width budget", () => {
		for (const width of [24, 40, 72, 120]) {
			const plan = planCard(QUESTION, width, { stamp: "10/29/2026, 12:00 PM", hint: "ctrl+q" });
			const usable = Math.max(6, width - 2);
			expect(joinRow(plan.header, usable).length).toBeLessThanOrEqual(usable);
			for (const row of plan.body) expect(row.length).toBeLessThanOrEqual(usable);
		}
	});

	test("multi-line input is flattened to one flowing line", () => {
		const plan = planCard("one\ntwo\nthree", 80, { hint: "ctrl+q" });
		expect(plan.body).toEqual(["one two three"]);
	});
});

describe("card component", () => {
	test("renders a full-width background rectangle using pi's message tokens", () => {
		const theme = recordingTheme();
		const card = createLastQuestionCard({
			theme,
			text: `${QUESTION} ${QUESTION}`,
			stamp: "10/29/2026, 12:00 PM",
			hint: "ctrl+q",
		});
		const lines = card.box.render(72);
		// header + two question rows, every row exactly the widget width
		expect(lines).toHaveLength(3);
		expect(new Set(lines.map((line) => line.length))).toEqual(new Set([72]));
		// Blue user-message family, not the violet extension-block family.
		expect(theme.used).toContain("bg:userMessageBg");
		expect(theme.used).toContain("fg:border");
		expect(theme.used).toContain("fg:mdLink");
		expect(theme.used).toContain("fg:userMessageText");
		expect(theme.used).toContain("fg:dim");
		expect(theme.used).not.toContain("bg:customMessageBg");
	});

	test("every row starts with the rule, and the question is fully visible", () => {
		const theme = recordingTheme();
		const card = createLastQuestionCard({ theme, text: "what is the cache TTL?", stamp: "10/29/2026, 9:05 AM", hint: "ctrl+q" });
		const lines = card.box.render(60).map((line) => line.trim());
		expect(lines.every((line) => line.startsWith(RULE))).toBe(true);
		expect(lines[1]).toContain("what is the cache TTL?");
		expect(lines[0]).toContain("10/29/2026, 9:05 AM");
		expect(lines[0].startsWith(RULE)).toBe(true);
	});

	test("narrow widths still produce aligned rows without overflow", () => {
		const theme = recordingTheme();
		for (const width of [20, 30, 50, 100]) {
			const card = createLastQuestionCard({
				theme,
				text: `${QUESTION} ${QUESTION}`,
				stamp: "10/29/2026, 12:00 PM",
				hint: "ctrl+q",
			});
			const lines = card.box.render(width);
			expect(new Set(lines.map((line) => line.length))).toEqual(new Set([width]));
		}
	});

	test("invalidate forces a re-render after the text changes", () => {
		const theme = recordingTheme();
		const card = createLastQuestionCard({ theme, text: "first", hint: "ctrl+q" });
		const before = card.box.render(40);
		expect(before.join("\n")).toContain("first");
		card.component.invalidate();
		card.box.invalidate();
		const after = card.box.render(40);
		expect(after.join("\n")).toContain("first");
	});
});

describe("styled themes (ANSI)", () => {
	/** Theme that wraps text in SGR codes the way a real theme does. */
	const ansiTheme = () => ({
		fg: (color: string, text: string) => `\u001b[38;5;${color.length % 200}m${text}\u001b[0m`,
		bg: (_color: string, text: string) => `\u001b[48;5;17m${text}\u001b[0m`,
	});
	// ESC built at runtime: a literal control character in a regex is a lint error.
	const ESC = String.fromCharCode(27);
	const strip = (line: string): string => line.replace(new RegExp(`${ESC}\\[[0-9;]*m`, "g"), "");
	// pi-tui's own cell width: `⌥` and friends are double-width.
	const visible = (line: string): number => visibleWidth(line);

	test("the shortcut hint survives styling and stays right-aligned", () => {
		// Regression: padding was measured on styled strings, so ANSI bytes collapsed
		// the gap and a byte-wise slice dropped the hint entirely in a real terminal.
		const card = createLastQuestionCard({
			theme: ansiTheme(),
			text: `${QUESTION} ${QUESTION}`,
			stamp: "10/29/2026, 12:20 PM",
			hint: "ctrl+q",
		});
		const lines = card.box.render(98);
		const header = strip(lines[0] as string);
		expect(header).toContain("ctrl+q expand");
		expect(header.trimEnd().endsWith("ctrl+q expand")).toBe(true);
		expect(visible(lines[0] as string)).toBe(98);
	});

	test("every styled row keeps the rectangle width", () => {
		const card = createLastQuestionCard({
			theme: ansiTheme(),
			text: "how do I rotate the deploy key without breaking the build for the running pods?",
			stamp: "10/29/2026, 12:20 PM",
			hint: "ctrl+q",
		});
		for (const width of [40, 60, 98]) {
			const lines = card.box.render(width);
			for (const line of lines) expect(visible(line)).toBe(width);
		}
	});
});
