import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SelectionStore } from "./store.js";
import { normalizeSpec, validateAnswers } from "./validation.js";
const spec = {
	version: 1,
	mode: "review",
	title: "Inventory",
	groups: [{ id: "g", title: "Group" }],
	items: [{ id: "a", label: "Item", groupId: "g" }],
	choices: [{ id: "yes", label: "Yes" }],
	allowOther: true,
};
test("normalized review, Other, duplicate choices and unsafe nested keys", () => {
	const n = normalizeSpec(spec);
	expect(n.mode).toBe("review");
	expect(n.questions[0].kind).toBe("single");
	expect(validateAnswers(n, { a: { answered: true, selectedIds: [], text: "Other value" } }, true).a.text).toBe("Other value");
	expect(() => normalizeSpec({ ...spec, choices: [spec.choices[0], spec.choices[0]] })).toThrow();
	expect(() => normalizeSpec({ ...spec, note: JSON.parse('{"prototype":1}') })).toThrow();
	expect(() => validateAnswers(n, JSON.parse('{"constructor":{}}'), false)).toThrow();
});
test("blank optional text, confirmed empty multi and distinct dispositions survive cancel CAS", async () => {
	const root = await mkdtemp(join(tmpdir(), "selection-values-"));
	try {
		const store = new SelectionStore(root);
		const r = await store.create("s", {
			version: 1,
			mode: "questions",
			title: "Values",
			questions: [
				{ id: "t", title: "Text", kind: "text" },
				...["m", "skip", "unsure"].map((id) => ({ id, title: id, kind: "multiple", options: [{ id: "a", label: "A" }] })),
			],
		});
		const answers = {
			t: { answered: true, selectedIds: [], text: "" },
			m: { answered: true, selectedIds: [] },
			skip: { answered: false, selectedIds: [], disposition: "skipped" },
			unsure: { answered: false, selectedIds: [], disposition: "unsure" },
		};
		await store.update(r.id, "s", 0, answers, false);
		await expect(store.cancel(r.id, "s", 0, r.answers)).rejects.toThrow("Revision conflict");
		expect((await store.get(r.id, "s")).answers).toEqual(answers);
		await store.cancel(r.id, "s", 1, answers);
		expect((await new SelectionStore(root).get(r.id, "s")).answers).toEqual(answers);
		expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
test("incomplete required text and minimum selection draft reopen and cancel but cannot submit", async () => {
	const root = await mkdtemp(join(tmpdir(), "selection-incomplete-"));
	try {
		const store = new SelectionStore(root);
		const r = await store.create("s", {
			version: 1,
			mode: "questions",
			title: "Incomplete",
			questions: [
				{ id: "t", title: "Text", kind: "text", required: true },
				{ id: "m", title: "Multi", kind: "multiple", minSelections: 1, options: [{ id: "a", label: "A" }] },
			],
		});
		const answers = { t: { answered: true, selectedIds: [], text: "" }, m: { answered: true, selectedIds: [] } };
		await store.update(r.id, "s", 0, answers, false);
		expect((await new SelectionStore(root).get(r.id, "s")).answers).toEqual(answers);
		await expect(store.update(r.id, "s", 1, answers, true)).rejects.toThrow("Empty answer");
		expect((await store.get(r.id, "s")).revision).toBe(1);
		await store.cancel(r.id, "s", 1, answers);
		expect((await store.get(r.id, "s")).answers).toEqual(answers);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
test("atomic rename failure cleans its temporary file", async () => {
	const root = await mkdtemp(join(tmpdir(), "selection-atomic-"));
	try {
		const store = new SelectionStore(root);
		const r = await store.create("s", spec);
		await rm(join(root, `${r.id}.json`));
		await mkdir(join(root, `${r.id}.json`));
		// Exercise the actual writer after a valid read, with rename guaranteed to fail.
		const writer = store as unknown as { write(record: typeof r): Promise<void> };
		await expect(writer.write(r)).rejects.toThrow();
		expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
test("cancelled state immutable, private root and file symlink guards", async () => {
	const root = await mkdtemp(join(tmpdir(), "selection-storage-test-"));
	try {
		const store = new SelectionStore(root);
		const r = await store.create("s", spec);
		await store.cancel(r.id, "s");
		await expect(store.cancel(r.id, "s")).rejects.toThrow();
		await expect(store.update(r.id, "s", 1, r.answers, false)).rejects.toThrow();
		const path = join(root, `${r.id}.json`);
		await chmod(path, 0o644);
		await expect(store.get(r.id, "s")).rejects.toThrow();
		await rm(path);
		await symlink("/dev/null", path);
		await expect(store.get(r.id, "s")).rejects.toThrow();
		await chmod(root, 0o755);
		await expect(store.create("s", spec)).rejects.toThrow();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
