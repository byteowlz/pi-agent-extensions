import { describe, expect, test } from "bun:test";

import { MAX_LINES, buildStrip, flatten, formatStamp, lastQuestion, messageText, questionStamp, wrap } from "./last-question";

/** A user message entry as it appears in the session branch. */
function userEntry(text: string, timestamp?: number, id = "u1"): Record<string, unknown> {
	return {
		type: "message",
		id,
		message: {
			role: "user",
			content: [{ type: "text", text }],
			...(timestamp !== undefined ? { timestamp } : {}),
		},
	};
}

describe("reading the last question", () => {
	test("picks the newest user message, skipping other roles and custom entries", () => {
		const entries = [
			userEntry("first question", 1, "a"),
			{ type: "message", id: "b", message: { role: "assistant", content: [{ type: "text", text: "answer" }] } },
			{ type: "custom", customType: "x", data: {} },
			{ type: "message", id: "c", message: { role: "toolResult", content: [{ type: "text", text: "tool output" }] } },
			userEntry("second question", 2, "d"),
		];
		expect(lastQuestion(entries)).toEqual({ text: "second question", entryId: "d" });
	});

	test("ignores user messages with no text (images, tool-only)", () => {
		const entries = [
			userEntry("real question", 1, "a"),
			{ type: "message", id: "b", message: { role: "user", content: [{ type: "image", data: "…" }] } },
		];
		expect(lastQuestion(entries)).toEqual({ text: "real question", entryId: "a" });
	});

	test("returns undefined for empty or unrelated branches", () => {
		expect(lastQuestion([])).toBeUndefined();
		expect(lastQuestion([{ type: "custom", customType: "x" }])).toBeUndefined();
		expect(lastQuestion([{ type: "message", message: { role: "assistant", content: [] } }])).toBeUndefined();
	});

	test("joins multiple text blocks and keeps plain string content", () => {
		expect(
			messageText({
				content: [
					{ type: "text", text: "a" },
					{ type: "text", text: "b" },
				],
			})
		).toBe("a\nb");
		expect(messageText({ content: "plain" })).toBe("plain");
		expect(messageText({ content: [] })).toBe("");
	});
});

describe("absolute timestamp", () => {
	// Date.UTC + explicit zones: the assertion is about our formatting, never the
	// host's timezone (a local-time constructor made this test flaky across hosts).
	const at = Date.UTC(2026, 9, 29, 8, 13);

	test("formats date and time, never a relative age", () => {
		expect(formatStamp(at, "en-US", "UTC")).toBe("10/29/2026, 8:13 AM");
		expect(formatStamp(at, "en-US", "Etc/GMT-2")).toBe("10/29/2026, 10:13 AM");
	});

	test("uses the message timestamp, else the entry's ISO stamp", () => {
		expect(questionStamp([userEntry("q", at)], { locale: "en-US", timeZone: "UTC" })).toBe("10/29/2026, 8:13 AM");

		const isoEntry = {
			type: "message",
			id: "e",
			timestamp: "2026-10-29T07:13:00.000Z",
			message: { role: "user", content: [{ type: "text", text: "q" }] },
		};
		expect(questionStamp([isoEntry], { locale: "en-US", timeZone: "UTC" })).toBe("10/29/2026, 7:13 AM");
	});

	test("has no stamp when the session recorded no time", () => {
		expect(questionStamp([userEntry("q")])).toBeUndefined();
		expect(questionStamp([])).toBeUndefined();
	});
});

describe("wrapping", () => {
	test("flattens newlines and runs of spaces", () => {
		expect(flatten("a\n\n  b\t c ")).toBe("a b c");
	});

	test("wraps on words and hard-splits an overlong word", () => {
		expect(wrap("one two three", 7)).toEqual(["one two", "three"]);
		expect(wrap("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
		expect(wrap("", 10)).toEqual([""]);
	});
});

describe("two-line strip", () => {
	const hint = "⌥Q";

	test("short questions fit without a truncation marker", () => {
		const lines = buildStrip("short question", 60, { hint, label: "? " });
		expect(lines).toHaveLength(1);
		expect(lines[0]).toEqual({ text: "? short question", truncated: false });
	});

	test("a two-line question keeps both lines and no ellipsis", () => {
		const text = "first part of the question that wraps once";
		const lines = buildStrip(text, 30, { hint, label: "? " });
		expect(lines).toHaveLength(MAX_LINES);
		expect(lines[0]?.text.startsWith("? ")).toBe(true);
		expect(lines[1]?.text.startsWith("  ")).toBe(true);
		expect(lines.some((line) => line.truncated)).toBe(false);
	});

	test("a long question clamps to two lines with an ellipsis and the hint", () => {
		const text =
			"this is a very long question that keeps going well past two lines of width so it must be cut with an ellipsis and a hint";
		const lines = buildStrip(text, 40, { hint, label: "? " });
		expect(lines).toHaveLength(MAX_LINES);
		const last = lines[MAX_LINES - 1];
		expect(last?.truncated).toBe(true);
		expect(last?.text).toContain("…");
		expect(last?.text).toContain(hint);
	});

	test("never exceeds the width budget", () => {
		const text = "x".repeat(400);
		for (const width of [20, 40, 80, 120]) {
			for (const line of buildStrip(text, width, { hint, label: "? " })) {
				expect(line.text.length).toBeLessThanOrEqual(width);
			}
		}
	});

	test("multi-line input is flattened into the strip", () => {
		const lines = buildStrip("line one\nline two\nline three", 80, { hint, label: "? " });
		expect(lines).toHaveLength(1);
		expect(lines[0]?.text).toBe("? line one line two line three");
	});
});
