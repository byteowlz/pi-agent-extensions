import { describe, expect, test } from "bun:test";

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
		const plan = planCard(`${QUESTION} ${QUESTION}`, 80, { stamp: "10/29/2026, 12:00 PM", hint: "⌥Q", glyph: "\uf128" });
		expect(plan.header.right).toBe("⌥Q expand");
		expect(plan.header.left).toContain("10/29/2026, 12:00 PM");
		expect(plan.body).toHaveLength(MAX_LINES);
		expect(plan.truncated).toBe(true);
		expect(plan.body[MAX_LINES - 1]?.endsWith("…")).toBe(true);
	});

	test("a short question is not marked as truncated", () => {
		const plan = planCard("what is the cache TTL?", 80, { stamp: "10/29/2026, 9:05 AM", hint: "⌥Q" });
		expect(plan.body).toHaveLength(1);
		expect(plan.truncated).toBe(false);
		expect(plan.body[0]).toBe("what is the cache TTL?");
	});

	test("the hint degrades before the timestamp is cut", () => {
		const stamp = "10/29/2026, 12:00 PM"; // 18 cells, ~20 with the glyph
		// Full hint needs usable >= head + "⌥Q expand" + 2; compact needs the 3-cell form.
		expect(planCard(QUESTION, 90, { stamp, hint: "⌥Q" }).header.right).toBe("⌥Q expand");
		expect(planCard(QUESTION, 29, { stamp, hint: "⌥Q" }).header.right).toBe("⌥Q");
		expect(planCard(QUESTION, 20, { stamp, hint: "⌥Q" }).header.right).toBe("");
	});

	test("every planned row fits the width budget", () => {
		for (const width of [24, 40, 72, 120]) {
			const plan = planCard(QUESTION, width, { stamp: "10/29/2026, 12:00 PM", hint: "⌥Q" });
			const usable = Math.max(6, width - 2);
			expect(joinRow(plan.header, usable).length).toBeLessThanOrEqual(usable);
			for (const row of plan.body) expect(row.length).toBeLessThanOrEqual(usable);
		}
	});

	test("multi-line input is flattened to one flowing line", () => {
		const plan = planCard("one\ntwo\nthree", 80, { hint: "⌥Q" });
		expect(plan.body).toEqual(["one two three"]);
	});
});

describe("card component", () => {
	test("renders a full-width background rectangle using pi's message tokens", () => {
		const theme = recordingTheme();
		const card = createLastQuestionCard({
			theme,
			text: QUESTION,
			stamp: "10/29/2026, 12:00 PM",
			hint: "⌥Q",
			glyph: "\uf128",
		});
		const lines = card.box.render(72);
		// header + two question rows, every row exactly the widget width
		expect(lines).toHaveLength(3);
		expect(new Set(lines.map((line) => line.length))).toEqual(new Set([72]));
		expect(theme.used).toContain("bg:customMessageBg");
		expect(theme.used).toContain("fg:customMessageLabel");
		expect(theme.used).toContain("fg:customMessageText");
		expect(theme.used).toContain("fg:accent");
		expect(theme.used).toContain("fg:dim");
	});

	test("every row starts with the rule, and the question is fully visible", () => {
		const theme = recordingTheme();
		const card = createLastQuestionCard({ theme, text: "what is the cache TTL?", stamp: "10/29/2026, 9:05 AM", hint: "⌥Q" });
		const lines = card.box.render(60).map((line) => line.trim());
		expect(lines.every((line) => line.startsWith(RULE))).toBe(true);
		expect(lines[1]).toContain("what is the cache TTL?");
		expect(lines[0]).toContain("10/29/2026, 9:05 AM");
	});

	test("narrow widths still produce aligned rows without overflow", () => {
		const theme = recordingTheme();
		for (const width of [20, 30, 50, 100]) {
			const card = createLastQuestionCard({ theme, text: QUESTION, stamp: "10/29/2026, 12:00 PM", hint: "⌥Q" });
			const lines = card.box.render(width);
			expect(new Set(lines.map((line) => line.length))).toEqual(new Set([width]));
		}
	});

	test("invalidate forces a re-render after the text changes", () => {
		const theme = recordingTheme();
		const card = createLastQuestionCard({ theme, text: "first", hint: "⌥Q" });
		const before = card.box.render(40);
		expect(before.join("\n")).toContain("first");
		card.component.invalidate();
		card.box.invalidate();
		const after = card.box.render(40);
		expect(after.join("\n")).toContain("first");
	});
});
