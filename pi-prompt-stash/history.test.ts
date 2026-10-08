import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Key, visibleWidth } from "@earendil-works/pi-tui";
import { browseHistory, userPrompts } from "./history.js";
import { PromptPicker, displayText } from "./picker.js";

const user = (id: string, text: unknown, time = "2026-01-01T00:00:00.000Z") => ({
	type: "message",
	id,
	timestamp: time,
	message: { role: "user", content: text },
});
test("raw recorded user prompts survive compaction, omitted context edits and alternative branches", () => {
	const entries = [
		user("before", "old prompt"),
		{ type: "compaction", summary: "NOT A USER PROMPT" },
		user("after", [
			{ type: "text", text: "new" },
			{ type: "image", data: "never copied" },
		]),
		{ type: "context_edit", targetId: "before", replacement: null },
		{ type: "custom_message", content: "not user" },
		{ type: "message", id: "assistant", message: { role: "assistant", content: "not user" } },
	];
	const result = userPrompts(entries, "session", "/private/session.jsonl");
	expect(result.map((i) => i.text)).toEqual(["old prompt", "new"]);
	expect(result[1].attachmentsOmitted).toBe(true);
	expect(JSON.stringify(result)).not.toContain("never copied");
	expect(result[0].source.entryId).toBe("before");
});
test("cwd browsing exact-match excludes prefixes and skips malformed lines without losing valid originals", async () => {
	const root = await mkdtemp(join(tmpdir(), "stash-history-"));
	try {
		await mkdir(join(root, "one"));
		await mkdir(join(root, "two"));
		await writeFile(
			join(root, "one", "a.jsonl"),
			[
				JSON.stringify({ type: "session", id: "a", cwd: "/example/cwd" }),
				JSON.stringify(user("one", "included")),
				"malformed",
				JSON.stringify(user("two", "also included")),
			].join("\n")
		);
		await writeFile(
			join(root, "two", "b.jsonl"),
			[JSON.stringify({ type: "session", id: "b", cwd: "/example/cwd-extra" }), JSON.stringify(user("no", "excluded"))].join("\n")
		);
		const result = await browseHistory([root], "/example/cwd");
		expect(result.items.map((i) => i.text)).toEqual(["included", "also included"]);
		expect(result.skipped).toBe(1);
		expect((await browseHistory([root])).items.length).toBe(3);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
test("history cancellation is honored without scanning private unrelated roots", async () => {
	const controller = new AbortController();
	controller.abort();
	await expect(browseHistory(["/tmp"], undefined, controller.signal)).rejects.toThrow("cancelled");
});
test("picker multiselect survives filtering; narrow widths, unicode and preview are safe", () => {
	const items = [
		{ id: "opaque-one", text: "Laundry 🧺\nlong\ntext", createdAt: "2026-01-01" },
		{ id: "opaque-two", text: "Other", createdAt: "2026-01-02" },
	];
	let selected: typeof items | undefined;
	const picker = new PromptPicker(
		items,
		"Prompts",
		() => {},
		(result) => {
			selected = result;
		}
	);
	picker.focused = true;
	picker.handleInput("\t");
	picker.input.setValue("Other");
	picker.handleInput("\t");
	picker.handleInput("\r");
	expect(selected?.length).toBe(2);
	for (const width of [1, 4, 12, 80])
		for (const line of picker.render(width)) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
	expect(displayText("hello\u001b[31m")).not.toContain("\u001b");
	expect(Key.ctrl("v")).toBeTruthy();
});
