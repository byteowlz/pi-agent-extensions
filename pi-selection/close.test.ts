import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SelectionRuntime } from "./runtime.js";

test("close honors the caller-observed revision and preserves newer participant answers", async () => {
	const root = await mkdtemp(join(tmpdir(), "selection-close-cas-"));
	const runtime = new SelectionRuntime({} as ExtensionAPI, { root });
	const context = { sessionManager: { getSessionId: () => "native-scope" } } as ExtensionContext;
	try {
		const record = await runtime.store.create("native-scope", {
			version: 1,
			mode: "questions",
			title: "Fixture",
			questions: [{ id: "one", title: "One", kind: "text" }],
		});
		await runtime.store.update(record.id, record.scopeId, 0, { one: { answered: true, selectedIds: [], text: "newer" } }, false);
		await assert.rejects(runtime.execute(context, { action: "close", id: record.id, revision: 0 }), /Revision conflict/);
		const preserved = await runtime.store.get(record.id, record.scopeId);
		assert.equal(preserved.state, "draft");
		assert.equal(preserved.answers.one.text, "newer");
		const closed = await runtime.execute(context, { action: "close", id: record.id, revision: 1 });
		assert.equal(closed.record.state, "cancelled");
		assert.equal(closed.record.revision, 2);
	} finally {
		await runtime.reset();
		await rm(root, { recursive: true, force: true });
	}
});
