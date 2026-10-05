import { expect, test } from "bun:test";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startBrowserReview, startBrowserReviewForTest } from "./browser.js";
import { SelectionStore } from "./store.js";
import { emptyAnswers, normalizeSpec, validateAnswers } from "./validation.js";
const spec = {
	version: 1,
	mode: "questions",
	title: "<script>bad</script>",
	questions: [
		{
			id: "q",
			title: "Choose",
			kind: "single",
			required: true,
			options: [
				{ id: "unsure", label: "Unsure" },
				{ id: "yes", label: "Yes" },
			],
		},
	],
};
async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "selection-test-"));
	return { root, store: new SelectionStore(root) };
}
test("validation rejects versions, malformed, duplicates, prototype keys and required unanswered", () => {
	for (const value of [
		null,
		{ ...spec, version: 2 },
		{ ...spec, questions: [spec.questions[0], spec.questions[0]] },
		{ ...spec, questions: [{ ...spec.questions[0], id: "constructor" }] },
		JSON.parse('{"__proto__":{}}'),
	])
		expect(() => normalizeSpec(value)).toThrow();
	const n = normalizeSpec(spec);
	expect(() => validateAnswers(n, emptyAnswers(n), true)).toThrow();
	expect(validateAnswers(n, { q: { answered: true, selectedIds: ["unsure"] } }, true).q.answered).toBe(true);
	expect(() => validateAnswers(n, { q: { answered: true, selectedIds: ["unsure", "yes"] } }, false)).toThrow();
});
test("text and minmax constraints", () => {
	const n = normalizeSpec({
		version: 1,
		mode: "questions",
		title: "T",
		questions: [
			{ id: "t", title: "T", kind: "text", maxLength: 3, note: { maxLength: 2 } },
			{
				id: "m",
				title: "M",
				kind: "multiple",
				minSelections: 2,
				maxSelections: 2,
				options: [
					{ id: "a", label: "A" },
					{ id: "b", label: "B" },
				],
			},
		],
	});
	for (const value of [
		{ t: { answered: true, selectedIds: [], text: "long" } },
		{ t: { answered: true, selectedIds: [], text: "a\nb" } },
		{ t: { answered: false, selectedIds: [], note: "long" } },
	])
		expect(() => validateAnswers(n, value, false)).toThrow();
});
test("draft completeness is deferred but bounds and shape are always enforced", () => {
	const n = normalizeSpec({
		version: 1,
		mode: "questions",
		title: "Draft",
		questions: [
			{ id: "t", title: "Text", kind: "text", required: true, maxLength: 3 },
			{
				id: "m",
				title: "Multi",
				kind: "multiple",
				minSelections: 2,
				maxSelections: 2,
				options: [
					{ id: "a", label: "A" },
					{ id: "b", label: "B" },
					{ id: "c", label: "C" },
				],
			},
		],
	});
	const draft = { t: { answered: true, selectedIds: [], text: "" }, m: { answered: true, selectedIds: ["a"] } };
	expect(validateAnswers(n, draft, false)).toEqual(draft);
	expect(() => validateAnswers(n, draft, true)).toThrow();
	for (const selectedIds of [["a", "b", "c"], ["a", "a"], ["unknown"]])
		expect(() => validateAnswers(n, { ...draft, m: { answered: true, selectedIds } }, false)).toThrow();
	expect(() => validateAnswers(n, { ...draft, t: { ...draft.t, text: "long" } }, false)).toThrow();
});
test("private durable store restart CAS scope terminal and read validation", async () => {
	const { root, store } = await fixture();
	try {
		const r = await store.create("scope", spec);
		expect((await stat(root)).mode & 0o777).toBe(0o700);
		expect((await stat(join(root, `${r.id}.json`))).mode & 0o777).toBe(0o600);
		expect((await new SelectionStore(root).get(r.id, "scope")).revision).toBe(0);
		await expect(store.get(r.id, "wrong")).rejects.toThrow();
		const answers = { q: { answered: true, selectedIds: ["yes"] } };
		const results = await Promise.allSettled([
			store.update(r.id, "scope", 0, answers, false),
			new SelectionStore(root).update(r.id, "scope", 0, answers, false),
		]);
		expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
		await expect(store.update(r.id, "scope", 0, answers, false)).rejects.toThrow();
		await expect(store.cancel(r.id, "scope", 0)).rejects.toThrow();
		await store.update(r.id, "scope", 1, answers, true);
		await expect(store.cancel(r.id, "scope")).rejects.toThrow();
		await expect(store.update(r.id, "scope", 2, answers, false)).rejects.toThrow();
		await writeFile(join(root, `${r.id}.json`), "{}", { mode: 0o600 });
		await expect(store.get(r.id, "scope")).rejects.toThrow();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
test("HTTP auth host origin CSRF limits scope and expiry; production LAN guards", async () => {
	const { root, store } = await fixture();
	let server: Awaited<ReturnType<typeof startBrowserReviewForTest>> | undefined;
	try {
		const r = await store.create("s", spec);
		for (const bindAddress of [undefined, "0.0.0.0", "127.0.0.1", "8.8.8.8", "192.168.254.254"])
			await expect(startBrowserReview(store, r, { mode: "lan", bindAddress })).rejects.toThrow();
		await expect(startBrowserReview(store, r, { mode: "tailnet", discoverTailnet: async () => "127.0.0.1" })).rejects.toThrow();
		server = await startBrowserReviewForTest(store, r, { ttlMs: 500 });
		const u = new URL(server.url);
		const base = u.origin;
		const Authorization = `Bearer ${u.hash.slice(1)}`;
		expect((await fetch(`${base}/api/review`)).status).toBe(401);
		expect((await fetch(`${base}/api/review`, { headers: { Authorization, Host: "evil" } })).status).toBe(403);
		const page = await (await fetch(base)).text();
		expect(page).not.toContain(spec.title);
		expect(page).not.toContain("https://");
		const review = await (await fetch(`${base}/api/review`, { headers: { Authorization } })).json();
		const headers = { Authorization, "Content-Type": "application/json", "X-CSRF-Nonce": review.csrf, Origin: base };
		const payload = JSON.stringify({ revision: 0, answers: { q: { answered: true, selectedIds: ["unsure"] } } });
		expect(
			(await fetch(`${base}/api/save`, { method: "POST", headers: { ...headers, Origin: "http://evil" }, body: payload })).status
		).toBe(403);
		expect(
			(await fetch(`${base}/api/save`, { method: "POST", headers: { ...headers, "X-CSRF-Nonce": "wrong" }, body: payload }))
				.status
		).toBe(403);
		expect((await fetch(`${base}/api/save`, { method: "POST", headers, body: "x".repeat(270000) })).status).toBe(413);
		expect((await fetch(`${base}/api/save`, { method: "POST", headers, body: payload })).status).toBe(200);
		expect((await fetch(`${base}/api/submit`, { method: "POST", headers, body: payload })).status).toBe(409);
		await new Promise((resolve) => setTimeout(resolve, 550));
		await expect(fetch(`${base}/api/review`, { headers: { Authorization } })).rejects.toThrow();
	} finally {
		await server?.close();
		await rm(root, { recursive: true, force: true });
	}
});
