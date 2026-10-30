import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { type BenchSample, expectedCalibrationError, formatReport, loadSamples, runBench, scoreSample, summarize } from "./bench";
import { buildQuestions } from "./schema";

const questions = buildQuestions([{ id: "pi-agent-extensions" }, { id: "eavs" }]);

function sample(expectations: Record<string, string>): BenchSample {
	return {
		id: "s",
		digest: {
			userText: "do the thing",
			assistantText: "did it",
			tools: [],
			filesTouched: [],
			commands: [],
			cwd: "/home/wismut/byteowlz/pi-agent-extensions",
			gitRemotes: [],
		},
		expect: expectations,
	};
}

describe("expected calibration error", () => {
	test("a perfectly calibrated set scores ECE ≈ 0", () => {
		// 10 answers at confidence 0.9, exactly 9 correct -> bin 9: acc .9, conf .9
		const pairs = [...Array.from({ length: 9 }, () => ({ confidence: 0.9, correct: true })), { confidence: 0.9, correct: false }];
		expect(expectedCalibrationError(pairs)).toBeLessThan(0.001);
	});

	test("over-confidence shows up as a positive gap", () => {
		// 10 answers at 0.9 confidence, only 5 correct -> |0.5 - 0.9| = 0.4
		const pairs = [
			...Array.from({ length: 5 }, () => ({ confidence: 0.9, correct: true })),
			...Array.from({ length: 5 }, () => ({ confidence: 0.9, correct: false })),
		];
		expect(expectedCalibrationError(pairs)).toBeCloseTo(0.4, 5);
	});

	test("empty input is zero, not NaN", () => {
		expect(expectedCalibrationError([])).toBe(0);
	});

	test("confidence 1.0 lands in the last bin", () => {
		const pairs = Array.from({ length: 4 }, () => ({ confidence: 1, correct: true }));
		expect(expectedCalibrationError(pairs)).toBe(0);
	});
});

describe("scoring", () => {
	test("only expected questions are scored", () => {
		const result = scoreSample(
			sample({ activity: "implement" }),
			{ activity: { value: "implement", confidence: 0.9 }, status: { value: "done", confidence: 0.9 } },
			questions
		);
		expect([...result.perQuestion.keys()]).toEqual(["activity"]);
		expect(result.perQuestion.get("activity")?.correct).toBe(true);
		expect(result.pairs).toEqual([{ confidence: 0.9, correct: true }]);
	});

	test("a missing answer is not counted as wrong (it is absent)", () => {
		const result = scoreSample(
			sample({ activity: "implement", status: "done" }),
			{ activity: { value: "implement" } },
			questions
		);
		expect(result.perQuestion.size).toBe(1);
	});

	test("wrong answers are counted, with their confidence", () => {
		const result = scoreSample(sample({ activity: "debug" }), { activity: { value: "implement", confidence: 0.95 } }, questions);
		expect(result.perQuestion.get("activity")).toEqual({ correct: false, confidence: 0.95 });
	});
});

describe("summary", () => {
	test("aggregates per question, high-confidence slice and latency", () => {
		const results = [
			{ question: "activity", correct: true, confidence: 0.9 },
			{ question: "activity", correct: false, confidence: 0.9 },
			{ question: "status", correct: true, confidence: 0.5 },
			{ question: "risk", correct: true },
		];
		const report = summarize(results, [100, 200, 300, 400], 4, 0);
		expect(report.accuracy).toBeCloseTo(0.75, 5);
		expect(report.questions[0]?.question).toBe("activity"); // worst first
		expect(report.questions[0]?.accuracy).toBe(0.5);
		// high-confidence slice only sees the two 0.9 answers: 1 of 2 correct
		expect(report.highConfidenceShare).toBe(0.5);
		expect(report.highConfidenceAccuracy).toBe(0.5);
		expect(report.meanMs).toBe(250);
		expect(report.p95Ms).toBe(400);
	});

	test("unconfident answers are excluded from the high-confidence slice", () => {
		const report = summarize([{ question: "activity", correct: true, confidence: 0.79 }], [10], 1, 0);
		expect(report.highConfidenceShare).toBe(0);
	});
});

describe("sample loading", () => {
	test("reads the bundled seed set", () => {
		const samples = loadSamples(path.join(import.meta.dir, "samples", "seed.jsonl"));
		expect(samples.length).toBeGreaterThanOrEqual(12);
		// The project question only exists when candidates are supplied, so build the
		// schema from the projects the seed itself expects.
		const candidates = [
			...new Set(
				samples.map((entry) => entry.expect.project).filter((id): id is string => typeof id === "string" && id !== "other")
			),
		].map((id) => ({ id }));
		for (const entry of samples) {
			const questions = buildQuestions(candidates, { hasError: Boolean(entry.digest.error) });
			expect(entry.id).toBeTruthy();
			expect(typeof entry.digest.cwd).toBe("string");
			// every expectation must name a real answer id in the schema
			for (const [questionId, expected] of Object.entries(entry.expect)) {
				// `needs` is a human label kept to validate the derived action; it is
				// deliberately not a question the model is asked.
				if (questionId === "needs" || questionId === "scope") {
					expect(typeof expected).toBe("string");
					continue;
				}
				const question = questions.find((candidate) => candidate.id === questionId);
				expect(question).toBeDefined();
				const pool = question?.options ?? question?.levels;
				if (pool) expect(pool.map((option) => option.id)).toContain(expected);
				else expect(["yes", "no"]).toContain(expected);
			}
		}
	});

	test("reports the offending line for bad JSON", () => {
		const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bench-")), "bad.jsonl");
		fs.writeFileSync(file, `${JSON.stringify({ id: "ok", state: { cwd: "/x" }, expect: {} })}\n{not json}\n`);
		expect(() => loadSamples(file)).toThrow(/line 2/);
	});

	test("requires state and expect", () => {
		const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bench-")), "missing.jsonl");
		fs.writeFileSync(file, `${JSON.stringify({ id: "x", state: { cwd: "/x" } })}\n`);
		expect(() => loadSamples(file)).toThrow(/state/);
	});

	test("missing file is a clear error", () => {
		expect(() => loadSamples("/definitely/not/here.jsonl")).toThrow(/not found/);
	});
});

describe("runBench", () => {
	test("scores successes, counts failures, and reports latency", async () => {
		// Injected transport: the HTTP wire format is covered by classify.test.ts;
		// this test is about scoring and failure accounting.
		const seen: string[] = [];
		const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body ?? "{}")) as { state?: { user?: string } };
			seen.push(String(body.state?.user));
			if (body.state?.user === "boom") {
				return new Response(JSON.stringify({ error: "upstream down" }), { status: 500 });
			}
			return new Response(
				JSON.stringify({
					answers: {
						activity: { type: "choice", choice: "implement", confidence: 0.9 },
						status: { type: "choice", choice: "done", confidence: 0.85 },
					},
				}),
				{ status: 200, headers: { "content-type": "application/json" } }
			);
		}) as unknown as typeof fetch;

		const samples: BenchSample[] = [
			{ ...sample({ activity: "implement", status: "done" }), id: "hit" },
			{ ...sample({ activity: "implement" }), id: "miss", digest: { ...sample({}).digest, userText: "boom" } },
		];
		const report = await runBench({
			client: { endpoint: "http://127.0.0.1:1", model: "vllm-sr/d3-lite", api: "systemone" },
			samples,
			fetchImpl: fakeFetch,
		});

		expect(report.samples).toBe(2);
		expect(report.failures).toBe(1);
		expect(seen).toEqual(["do the thing", "boom"]);
		// only the successful sample contributes accuracy rows
		expect(report.questions.find((question) => question.question === "activity")?.correct).toBe(1);
		expect(report.questions.find((question) => question.question === "activity")?.scored).toBe(1);
		expect(formatReport(report)).toContain("turn-classify bench");
		expect(formatReport(report)).toContain("ECE");
	});
});
