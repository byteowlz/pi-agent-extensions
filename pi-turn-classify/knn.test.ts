import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { TurnDigest } from "./digest";
import { DEFAULT_DIMENSIONS, type EmbeddingConfig, embedDigest, embedTexts, embeddingText, truncate } from "./embeddings";
import { VectorStore, cosine, dequantize, neighbourLabel, priorText, quantize } from "./knn";

const embeddingConfig: EmbeddingConfig = { endpoint: "http://127.0.0.1:3010", model: "google/embeddinggemma-2", dimensions: 128 };

function digest(overrides: Partial<TurnDigest> = {}): TurnDigest {
	return {
		userText: "fix the flaky test\nsecond line ignored",
		assistantText: "Fixed it by closing stdin.",
		tools: [{ name: "bash" }],
		filesTouched: ["src/a.test.ts"],
		commands: ["bun test"],
		cwd: "/proj/alpha",
		gitRemotes: [],
		...overrides,
	};
}

function tmp(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "knn-"));
}

/** A fake embedding server: deterministic vectors so ranking is predictable. */
function fakeFetch(table: Record<string, number[]>) {
	const calls: Array<{ url: string; body: { model: string; input: string[] } }> = [];
	const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body ?? "{}")) as { model: string; input: string[] };
		calls.push({ url: String(url), body });
		const data = body.input.map((text, index) => ({
			index,
			embedding: table[text] ?? [0, 0, 1],
		}));
		return new Response(JSON.stringify({ data }), { status: 200, headers: { "content-type": "application/json" } });
	}) as unknown as typeof fetch;
	return { fetchImpl, calls };
}

describe("embedding text", () => {
	test("selects the salient facts, first line only", () => {
		const text = embeddingText(digest());
		expect(text).toContain("asked: fix the flaky test");
		expect(text).not.toContain("second line ignored");
		expect(text).toContain("done: Fixed it by closing stdin.");
		expect(text).toContain("files: src/a.test.ts");
		expect(text).toContain("commands: bun test");
		expect(text).toContain("dir: /proj/alpha");
	});

	test("an error goes first, because it is the story of a failed turn", () => {
		const text = embeddingText(digest({ error: { source: "provider", message: "502 upstream\ntrace" } }));
		expect(text.startsWith("error: 502 upstream")).toBe(true);
	});

	test("survives hand-written digests with missing collections", () => {
		const sparse = { userText: "x", assistantText: "y", cwd: "/p" } as unknown as TurnDigest;
		expect(() => embeddingText(sparse)).not.toThrow();
		expect(embeddingText(sparse)).toContain("dir: /p");
	});
});

describe("MRL truncation", () => {
	test("keeps leading dims and renormalises", () => {
		const truncated = truncate([3, 4, 100, 100], 2);
		expect(truncated).toHaveLength(2);
		expect(Math.hypot(...truncated)).toBeCloseTo(1, 6);
		expect(truncated[0]).toBeCloseTo(0.6, 6);
	});

	test("a no-op when the vector is already short", () => {
		const vector = [1, 0];
		expect(truncate(vector, 128)).toBe(vector);
	});
});

describe("embedding client", () => {
	test("posts to /v1/embeddings and truncates to the configured dimensions", async () => {
		const { fetchImpl, calls } = fakeFetch({ hello: [1, 0, 0, 0] });
		const vectors = await embedTexts({ ...embeddingConfig, dimensions: 2 }, ["hello"], { fetchImpl });
		expect(calls[0]?.url).toBe("http://127.0.0.1:3010/v1/embeddings");
		expect(calls[0]?.body.model).toBe("google/embeddinggemma-2");
		expect(vectors[0]).toHaveLength(2);
	});

	test("a /v1 suffix in the endpoint is not doubled", async () => {
		const { fetchImpl, calls } = fakeFetch({ hello: [1, 0] });
		await embedTexts({ ...embeddingConfig, endpoint: "http://127.0.0.1:3010/v1/" }, ["hello"], { fetchImpl });
		expect(calls[0]?.url).toBe("http://127.0.0.1:3010/v1/embeddings");
	});

	test("applies the task prefix when configured", async () => {
		const { fetchImpl, calls } = fakeFetch({ "task: classification | hello": [1, 0] });
		await embedTexts({ ...embeddingConfig, prefix: "task: classification | " }, ["hello"], { fetchImpl });
		expect(calls[0]?.body.input[0]).toBe("task: classification | hello");
	});

	test("server errors surface as EmbeddingError", async () => {
		const fetchImpl = (async () =>
			new Response(JSON.stringify({ error: { message: "Lock acquisition failed" } }), {
				status: 500,
			})) as unknown as typeof fetch;
		await expect(embedTexts(embeddingConfig, ["x"], { fetchImpl })).rejects.toThrow(/Lock acquisition failed/);
	});

	test("a vector count mismatch is an error, not a silent misalignment", async () => {
		const fetchImpl = (async () =>
			new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 0] }] }), { status: 200 })) as unknown as typeof fetch;
		await expect(embedTexts(embeddingConfig, ["a", "b"], { fetchImpl })).rejects.toThrow(/expected 2 vectors/);
	});

	test("embedDigest embeds the digest text", async () => {
		const { fetchImpl, calls } = fakeFetch({});
		await embedDigest(embeddingConfig, digest(), { fetchImpl });
		expect(calls[0]?.body.input[0]).toContain("asked: fix the flaky test");
	});
});

describe("int8 storage", () => {
	test("round-trips within quantisation error", () => {
		const vector = Array.from({ length: DEFAULT_DIMENSIONS }, (_, index) => Math.sin(index) / 4);
		const { v, s } = quantize(vector);
		const back = dequantize(v, s);
		expect(back).toHaveLength(vector.length);
		for (let index = 0; index < vector.length; index += 1) {
			expect(Math.abs((back[index] ?? 0) - (vector[index] ?? 0))).toBeLessThan(0.01);
		}
	});

	test("keeps ranking after quantisation", () => {
		const a = [1, 0, 0, 0];
		const near = [0.9, 0.1, 0, 0];
		const far = [0, 1, 0, 0];
		const qa = dequantize(quantize(a).v, quantize(a).s);
		const qn = dequantize(quantize(near).v, quantize(near).s);
		const qf = dequantize(quantize(far).v, quantize(far).s);
		expect(cosine(qa, qn)).toBeGreaterThan(cosine(qa, qf));
	});

	test("128 dims cost ~176 bytes per turn in JSONL", () => {
		const vector = Array.from({ length: 128 }, (_, index) => Math.cos(index));
		const { v, s } = quantize(vector);
		expect(v.length + s.length).toBeLessThan(200);
	});
});

describe("vector store", () => {
	test("appends, reloads and keeps labels", () => {
		const dir = tmp();
		try {
			const file = path.join(dir, "vectors.jsonl");
			const store = new VectorStore({ path: file });
			store.add({ id: "t1", vector: [1, 0, 0], labels: { activity: "debug" } });
			store.add({ id: "t2", vector: [0, 1, 0], labels: { activity: "implement" } });

			const reopened = new VectorStore({ path: file });
			expect(reopened.all()).toHaveLength(2);
			expect(reopened.all()[0]?.labels.activity).toBe("debug");
			expect(reopened.has("t2")).toBe(true);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("neighbours are ordered by similarity and skip unlabelled entries", () => {
		const dir = tmp();
		try {
			const store = new VectorStore({ path: path.join(dir, "v.jsonl") });
			store.add({ id: "close", vector: [1, 0, 0], labels: { activity: "debug" } });
			store.add({ id: "mid", vector: [0.7, 0.3, 0], labels: { activity: "review" } });
			store.add({ id: "far", vector: [0, 1, 0], labels: { activity: "ops" } });
			store.add({ id: "unlabelled", vector: [1, 0, 0], labels: {} });

			const neighbours = store.neighbours([1, 0, 0], 2);
			expect(neighbours.map((entry) => entry.id)).toEqual(["close", "mid"]);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("exclusion makes leave-one-out honest", () => {
		const dir = tmp();
		try {
			const store = new VectorStore({ path: path.join(dir, "v.jsonl") });
			store.add({ id: "self", vector: [1, 0, 0], labels: { activity: "debug" } });
			store.add({ id: "other", vector: [0.9, 0.1, 0], labels: { activity: "review" } });
			expect(store.neighbours([1, 0, 0], 1, "self").map((entry) => entry.id)).toEqual(["other"]);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("the prior as text", () => {
	test("renders compact neighbour labels with similarity", () => {
		const text = priorText([
			{ id: "a", vector: [], score: 0.82, labels: { project: "eavs", activity: "debug", blocked: "yes" } },
			{ id: "b", vector: [], score: 0.71, labels: { project: "eavs", activity: "implement", work_done: "yes" } },
		]);
		expect(text).toContain("similar labelled turns:");
		expect(text).toContain("[eavs · debug · blocked] 0.82");
		// work_done: yes prints nothing; only the informative side of a boolean shows
		expect(text).toContain("[eavs · implement] 0.71");
	});

	test("drops weak neighbours and says nothing when nothing is close", () => {
		const weak = priorText([{ id: "x", vector: [], score: 0.2, labels: { activity: "debug" } }]);
		expect(weak).toBe("");
		expect(priorText([])).toBe("");
	});

	test("an entry with only no-signal answers renders nothing", () => {
		expect(neighbourLabel({ labels: { attention: "none", activity: "unclear" } })).toBe("");
	});
});
