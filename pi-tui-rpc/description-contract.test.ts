/**
 * Cross-extension contract: the pi-tui-rpc reader must accept exactly what
 * pi-auto-rename writes. The entry-type literal is duplicated so each extension
 * stays standalone; this test pins them together.
 */
import { expect, test } from "bun:test";
import {
	DESCRIPTION_ENTRY_TYPE as PRODUCER_ENTRY_TYPE,
	readSessionDescription as readProducer,
} from "../pi-auto-rename/description.js";
import { readSessionDescription as readSnapshot } from "./index.js";

test("snapshot reader accepts the producer entry type and shape", () => {
	const record = {
		version: 1,
		description: "Routing hint for incoming work",
		topics: ["herdr", "pi-agent-extensions"],
		by: "agent",
		revision: 2,
		updatedAt: "2026-10-20T19:00:00.000Z",
		sessionId: "s1",
	};
	const entries = [{ type: "custom", customType: PRODUCER_ENTRY_TYPE, data: record }];
	expect(readProducer(entries)).toMatchObject({ description: record.description, by: "agent" });
	expect(readSnapshot(entries)).toEqual({
		description: record.description,
		topics: record.topics,
		by: "agent",
		updatedAt: record.updatedAt,
		revision: 2,
	});
});

test("snapshot reader ignores clears, malformed data and unrelated entries", () => {
	expect(readSnapshot([])).toBeNull();
	expect(readSnapshot([{ type: "custom", customType: PRODUCER_ENTRY_TYPE, data: { version: 2 } }])).toBeNull();
	expect(readSnapshot([{ type: "custom", customType: "other", data: {} }])).toBeNull();
	expect(
		readSnapshot([
			{
				type: "custom",
				customType: PRODUCER_ENTRY_TYPE,
				data: { version: 1, description: "gone", topics: [], by: "human", revision: 3, updatedAt: "t", cleared: true },
			},
		])
	).toBeNull();
});
