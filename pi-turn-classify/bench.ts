/**
 * Benchmark harness for turn classification with a decision model.
 *
 * The known weakness of small decision models is not speed but **calibration**:
 * a 0.8B model can claim 0.9 and be right ~0.75 of the time. So the report is
 * built around what you need to trust a card:
 *
 *   - per-question accuracy (is the taxonomy learnable at all?)
 *   - mean confidence vs accuracy (over/under-confidence per question)
 *   - ECE (expected calibration error, 10 bins) — the number to drive down
 *   - coverage-at-error: accuracy restricted to the most confident X%
 *   - latency per request
 *
 * Run it as a CLI:
 *   bun run pi-turn-classify/bench.ts --samples samples.jsonl \
 *     --endpoint http://100.64.0.9:8010 --model vllm-sr/d3-lite [--api systemone] [--json]
 *
 * Sample format (one JSON object per line):
 *   { "id": "turn-1", "state": { ...TurnDigest... }, "expect": { "activity": "debug", ... } }
 */

import { existsSync, readFileSync } from "node:fs";
import { type DecisionClientConfig, classify } from "./decision-client.js";
import type { TurnDigest } from "./digest.js";
import { renderState } from "./digest.js";
import type { AnswerMap, QuestionSpec } from "./schema.js";
import { buildQuestions } from "./schema.js";

export interface BenchSample {
	id: string;
	digest: TurnDigest;
	/** Expected answer id per question. Questions omitted from `expect` are not scored. */
	expect: Record<string, string>;
}

export interface QuestionReport {
	question: string;
	scored: number;
	correct: number;
	accuracy: number;
	meanConfidence: number;
	/** How many answers actually reported a confidence (0 means bias is unknown). */
	confidenceScored: number;
	/** Accuracy minus mean confidence: positive means under-confident. */
	bias: number;
}

export interface BenchReport {
	samples: number;
	requests: number;
	failures: number;
	questions: QuestionReport[];
	/** Expected calibration error over all scored choice answers (10 bins). */
	ece: number;
	meanConfidence: number;
	accuracy: number;
	/** Accuracy among answers whose confidence was >= 0.8. */
	highConfidenceAccuracy: number;
	highConfidenceShare: number;
	meanMs: number;
	p95Ms: number;
	/** First few failure messages, so a failing run explains itself. */
	failureReasons?: string[];
}

function bins(): number[] {
	return Array.from({ length: 10 }, () => 0);
}

/**
 * Expected calibration error: bin predictions by confidence, then average
 * |accuracy − confidence| weighted by bin population.
 */
export function expectedCalibrationError(pairs: Array<{ confidence: number; correct: boolean }>, binCount = 10): number {
	if (pairs.length === 0) return 0;
	const counts = bins();
	const correctCounts = bins();
	const confidenceSums = bins();
	for (const pair of pairs) {
		const index = Math.min(binCount - 1, Math.max(0, Math.floor(pair.confidence * binCount)));
		counts[index] = (counts[index] ?? 0) + 1;
		confidenceSums[index] = (confidenceSums[index] ?? 0) + pair.confidence;
		if (pair.correct) correctCounts[index] = (correctCounts[index] ?? 0) + 1;
	}
	let ece = 0;
	for (let index = 0; index < binCount; index += 1) {
		const count = counts[index] ?? 0;
		if (count === 0) continue;
		const accuracy = (correctCounts[index] ?? 0) / count;
		const confidence = (confidenceSums[index] ?? 0) / count;
		ece += (count / pairs.length) * Math.abs(accuracy - confidence);
	}
	return ece;
}

function percentile(values: number[], fraction: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
	return sorted[index] ?? 0;
}

/** Score one sample's answers against its expectations. */
export function scoreSample(
	sample: BenchSample,
	answers: AnswerMap,
	_questions: QuestionSpec[]
): {
	perQuestion: Map<string, { correct: boolean; confidence?: number }>;
	pairs: Array<{ confidence: number; correct: boolean }>;
} {
	const perQuestion = new Map<string, { correct: boolean; confidence?: number }>();
	const pairs: Array<{ confidence: number; correct: boolean }> = [];
	for (const [questionId, expected] of Object.entries(sample.expect)) {
		const answer = answers[questionId];
		if (!answer) continue;
		const correct = answer.value === expected;
		perQuestion.set(questionId, {
			correct,
			...(answer.confidence !== undefined ? { confidence: answer.confidence } : {}),
		});
		if (answer.confidence !== undefined) pairs.push({ confidence: answer.confidence, correct });
	}
	return { perQuestion, pairs };
}

/** Aggregate per-sample scores into the report. */
export function summarize(
	results: Array<{ question: string; correct: boolean; confidence?: number }>,
	latencies: number[],
	requests: number,
	failures: number
): BenchReport {
	const byQuestion = new Map<string, { scored: number; correct: number; confidenceSum: number; confidenceCount: number }>();
	const pairs: Array<{ confidence: number; correct: boolean }> = [];
	for (const result of results) {
		const entry = byQuestion.get(result.question) ?? { scored: 0, correct: 0, confidenceSum: 0, confidenceCount: 0 };
		entry.scored += 1;
		if (result.correct) entry.correct += 1;
		if (result.confidence !== undefined) {
			entry.confidenceSum += result.confidence;
			entry.confidenceCount += 1;
			pairs.push({ confidence: result.confidence, correct: result.correct });
		}
		byQuestion.set(result.question, entry);
	}

	const questions: QuestionReport[] = [...byQuestion.entries()]
		.map(([question, entry]) => {
			const accuracy = entry.scored > 0 ? entry.correct / entry.scored : 0;
			const meanConfidence = entry.confidenceCount > 0 ? entry.confidenceSum / entry.confidenceCount : 0;
			return {
				question,
				scored: entry.scored,
				correct: entry.correct,
				accuracy,
				meanConfidence,
				confidenceScored: entry.confidenceCount,
				bias: accuracy - meanConfidence,
			};
		})
		.sort((a, b) => a.accuracy - b.accuracy);

	const totalScored = results.length;
	const totalCorrect = results.filter((result) => result.correct).length;
	const high = results.filter((result) => (result.confidence ?? 0) >= 0.8);
	const highCorrect = high.filter((result) => result.correct).length;

	return {
		samples: 0,
		requests,
		failures,
		questions,
		ece: expectedCalibrationError(pairs),
		meanConfidence: pairs.length > 0 ? pairs.reduce((sum, pair) => sum + pair.confidence, 0) / pairs.length : 0,
		accuracy: totalScored > 0 ? totalCorrect / totalScored : 0,
		highConfidenceAccuracy: high.length > 0 ? highCorrect / high.length : 0,
		highConfidenceShare: totalScored > 0 ? high.length / totalScored : 0,
		meanMs: latencies.length > 0 ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0,
		p95Ms: percentile(latencies, 0.95),
	};
}

export interface RunBenchOptions {
	client: DecisionClientConfig;
	samples: BenchSample[];
	/** Extra project candidates to expose in the schema. */
	projects?: Array<{ id: string; hint?: string }>;
	fetchImpl?: typeof fetch;
}

/** Run the whole bench, one request per sample. */
export async function runBench(options: RunBenchOptions): Promise<BenchReport> {
	const projectCandidates = options.projects ?? [];
	const results: Array<{ question: string; correct: boolean; confidence?: number }> = [];
	const latencies: number[] = [];
	const failureReasons: string[] = [];
	let failures = 0;

	for (const sample of options.samples) {
		try {
			// Error questions exist only for failed turns, matching the runtime.
			const questions = buildQuestions(projectCandidates, { hasError: Boolean(sample.digest.error) });
			const state = renderState(sample.digest);
			const outcome = await classify({
				client: options.client,
				questions,
				state,
				...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
			});
			latencies.push(outcome.ms);
			const scored = scoreSample(sample, outcome.answers, questions);
			for (const [question, value] of scored.perQuestion) {
				results.push({
					question,
					correct: value.correct,
					...(value.confidence !== undefined ? { confidence: value.confidence } : {}),
				});
			}
		} catch (error) {
			// A failed request is data, not a crash: it is counted and reported.
			failures += 1;
			if (failureReasons.length < 3) {
				failureReasons.push(`${sample.id}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}

	return {
		...summarize(results, latencies, options.samples.length, failures),
		samples: options.samples.length,
		...(failureReasons.length > 0 ? { failureReasons } : {}),
	};
}

/**
 * Hand-written samples routinely omit fields ("this turn ran commands, no file
 * edits"), so missing collections become empty rather than crashing the run.
 */
export function normalizeDigest(raw: Partial<TurnDigest>): TurnDigest {
	const list = <T>(value: T[] | undefined): T[] => (Array.isArray(value) ? value : []);
	return {
		userText: typeof raw.userText === "string" ? raw.userText : "",
		assistantText: typeof raw.assistantText === "string" ? raw.assistantText : "",
		tools: list(raw.tools),
		filesTouched: list(raw.filesTouched),
		commands: list(raw.commands),
		cwd: typeof raw.cwd === "string" ? raw.cwd : process.cwd(),
		gitRemotes: list(raw.gitRemotes),
		...(typeof raw.sessionName === "string" ? { sessionName: raw.sessionName } : {}),
		...(raw.errored ? { errored: true } : {}),
		// The error text drives the error questions: dropping it here silently
		// disabled them for every hand-written sample.
		...(raw.error && typeof raw.error === "object" && typeof raw.error.message === "string"
			? {
					error: {
						source: raw.error.source ?? "provider",
						message: raw.error.message,
						...(typeof raw.error.tool === "string" ? { tool: raw.error.tool } : {}),
					},
				}
			: {}),
		...(typeof raw.durationMs === "number" ? { durationMs: raw.durationMs } : {}),
	};
}

/** Load samples from JSONL. Throws with the offending line number. */
export function loadSamples(path: string): BenchSample[] {
	if (!existsSync(path)) throw new Error(`samples file not found: ${path}`);
	const samples: BenchSample[] = [];
	const lines = readFileSync(path, "utf-8").split("\n");
	lines.forEach((line, index) => {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) return;
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			throw new Error(`invalid JSON on line ${index + 1} of ${path}`);
		}
		const record = parsed as { id?: unknown; state?: unknown; expect?: unknown };
		if (!record || typeof record !== "object" || !record.state || !record.expect) {
			throw new Error(`sample on line ${index + 1} needs "state" and "expect"`);
		}
		samples.push({
			id: typeof record.id === "string" ? record.id : `line-${index + 1}`,
			digest: normalizeDigest(record.state as Partial<TurnDigest>),
			expect: record.expect as Record<string, string>,
		});
	});
	return samples;
}

/** Render the report for a terminal. */
export function formatReport(report: BenchReport): string {
	const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
	const lines = [
		`turn-classify bench — ${report.samples} samples, ${report.failures} failed requests`,
		`  accuracy ${pct(report.accuracy)} · mean confidence ${pct(report.meanConfidence)} · ECE ${report.ece.toFixed(3)}`,
		`  high-confidence (>=0.80): ${pct(report.highConfidenceShare)} of answers at ${pct(report.highConfidenceAccuracy)} accuracy`,
		`  latency mean ${report.meanMs.toFixed(0)} ms · p95 ${report.p95Ms.toFixed(0)} ms`,
		"",
		"  per question (worst first):",
	];
	for (const question of report.questions) {
		const confidence =
			question.confidenceScored > 0
				? `conf ${pct(question.meanConfidence).padStart(6)} · bias ${question.bias >= 0 ? "+" : ""}${question.bias.toFixed(2)}`
				: "conf n/a (model reports none)";
		lines.push(
			`    ${question.question.padEnd(18)} ${pct(question.accuracy).padStart(6)} of ${String(question.scored).padStart(3)} · ${confidence}`
		);
	}
	if (report.failureReasons?.length) {
		lines.push("", "  failed requests:");
		for (const reason of report.failureReasons) lines.push(`    ${reason.slice(0, 160)}`);
	}
	lines.push("", "  reading: bias > 0 means the model is under-confident; ECE is the number to drive down.");
	return lines.join("\n");
}

/** CLI entry: bun run bench.ts --samples ... --endpoint ... --model ... */
export async function main(argv: string[]): Promise<number> {
	const args = new Map<string, string>();
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token?.startsWith("--")) continue;
		const key = token.slice(2);
		const next = argv[index + 1];
		if (next && !next.startsWith("--")) {
			args.set(key, next);
			index += 1;
		} else {
			args.set(key, "true");
		}
	}

	const samplesPath = args.get("samples");
	const endpoint = args.get("endpoint");
	const model = args.get("model");
	if (!samplesPath || !endpoint || !model) {
		console.error(
			"usage: bun run bench.ts --samples <file.jsonl> --endpoint <url> --model <id> [--api systemone|decisions] [--key <token>] [--projects a,b,c] [--json]"
		);
		return 2;
	}

	const api = args.get("api") === "decisions" ? "decisions" : "systemone";
	const client: DecisionClientConfig = {
		endpoint,
		model,
		api,
		...(args.get("key") ? { apiKey: args.get("key") } : {}),
		timeoutMs: Number(args.get("timeoutMs") ?? 20_000),
		instructions: "auto",
	};

	const samples = loadSamples(samplesPath);
	const projects = (args.get("projects") ?? "")
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean)
		.map((id) => ({ id }));
	const report = await runBench({ client, samples, projects });
	if (args.get("json") === "true") console.log(JSON.stringify(report, null, 2));
	else console.log(formatReport(report));
	return 0;
}

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
