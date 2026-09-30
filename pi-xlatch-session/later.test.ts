import { expect, test } from "bun:test";
import { formatParkedContent, formatParkedList } from "./src/later.js";

test("formats parked text and file content for pi", () => {
	expect(
		formatParkedContent({
			item: { id: "one", label: "A link", mime_type: "text/uri-list", created_at: 1 },
			input: { text: "https://example.com", mime_type: "text/uri-list" },
		})
	).toContain("Save for Later (link):\n\nhttps://example.com");
	expect(
		formatParkedContent({
			item: { id: "two", label: "audio.wav", mime_type: "audio/wav", created_at: 2 },
			input: { file: { path: "/tmp/audio.wav", mime_type: "audio/wav", size: 2_000_000 } },
		})
	).toContain("/tmp/audio.wav\n\n(audio/wav, 1.9 MB)");
});

test("lists stable ids and handles an empty inbox", () => {
	expect(formatParkedList([])).toBe("Nothing is saved for later.");
	expect(formatParkedList([{ id: "abc", label: "Read me", mime_type: "text/plain", created_at: 1 }])).toContain(
		"Read me [text/plain] (abc)"
	);
});
