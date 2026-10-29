/**
 * Does the retrieval prior actually help?
 *
 * Runs the same labelled turns through a decision model twice — once on the turn
 * alone, once with "similar labelled turns: …" prepended to the state — and reports
 * the accuracy difference per question. Neighbours are built from the corpus with
 * **leave-one-out**, so a turn can never retrieve itself.
 *
 *   bun run pi-turn-classify/bench-knn.ts --samples pi-turn-classify/samples/seed.jsonl \
 *     --endpoint https://eavs.has.skillissues.net/jev --model jev-latest \
 *     --embed-endpoint http://127.0.0.1:3010 --k 5
 */

import { existsSync, readFileSync } from "node:fs";

import { normalizeDigest } from "./bench.js";
import { type DecisionClientConfig, classify } from "./decision-client.js";
import { type TurnDigest, renderState } from "./digest.js";
import { type EmbeddingConfig, embedTexts, embeddingText, truncate } from "./embeddings.js";
import type { Answers } from "./knn-types.js";
import { type VectorEntry, priorText } from "./knn.js";
import { cosine } from "./knn.js";
import { buildQuestions } from "./schema.js";

export interface Labelled {
	id: string;
	vector: number[];
	labels: Answers;
	/** The digest, for rendering the state. */
	state: ReturnType<typeof renderState>;
}

export interface KnnBenchOptions {
	decision: DecisionClientConfig;
	embedding: EmbeddingConfig;
	labelled: Labelled[];
	/** Neighbours to include. */
	k: number;
	/** Minimum cosine for a neighbour to be offered. */
	minScore?: number;
	projects?: Array<{ id: string }>;
	fetchImpl?: typeof fetch;
}

export interface KnnBenchResult {
	samples: number;
	/** Accuracy per question without the prior. */
	plain: Record<string, { scored: number; correct: number }>;
	/** Accuracy per question with the prior. */
	prior: Record<string, { scored: number; correct: number }>;
	/** How often the prior's most similar neighbour agrees with the truth. */
	neighbourAgreement: number;
	/** Per question: how often the closest neighbour already had the right label. */
	neighbourAgreementByQuestion: Record<string, { scored: number; correct: number }>;
	/** Whether the model changed an answer once it saw the prior. */
	changedAnswers: number;
	meanPriorMs: number;
}

function leaveOneOut(labelled: Labelled[], index: number, k: number, minScore: number): Array<VectorEntry & { score: number }> {
	const self = labelled[index];
	if (!self) return [];
	return labelled
		.map((entry, at) => ({ entry, at }))
		.filter(({ at }) => at !== index)
		.map(({ entry }) => ({
			id: entry.id,
			vector: entry.vector,
			labels: entry.labels,
			score: cosine(self.vector, entry.vector),
		}))
		.filter((entry) => entry.score >= minScore)
		.sort((a, b) => b.score - a.score)
		.slice(0, k);
}

function score(
	expect: Answers,
	answers: Record<string, { value: string }>,
	into: Record<string, { scored: number; correct: number }>
): void {
	for (const [question, expected] of Object.entries(expect)) {
		const answer = answers[question]?.value;
		if (answer === undefined) continue;
		const bucket = into[question] ?? { scored: 0, correct: 0 };
		into[question] = bucket;
		bucket.scored += 1;
		if (answer === expected) bucket.correct += 1;
	}
}

/** Run the comparison. */
export async function benchKnn(options: KnnBenchOptions): Promise<KnnBenchResult> {
	const { labelled, k } = options;
	const minScore = options.minScore ?? 0.5;
	const questions = buildQuestions(options.projects ?? []);
	const plain: Record<string, { scored: number; correct: number }> = {};
	const prior: Record<string, { scored: number; correct: number }> = {};
	let neighbourVotes = 0;
	let neighbourHits = 0;
	const neighbourAgreementByQuestion: Record<string, { scored: number; correct: number }> = {};
	let changedAnswers = 0;
	const latencies: number[] = [];

	for (const [index, sample] of labelled.entries()) {
		const neighbours = leaveOneOut(labelled, index, k, minScore);
		const priorLine = priorText(neighbours, { minScore });

		// Does the single closest neighbour agree with the truth? That is the ceiling
		// of what retrieval alone could give us.
		const closest = neighbours[0];
		if (closest) {
			for (const [question, truth] of Object.entries(sample.labels)) {
				const predicted = closest.labels[question];
				if (predicted === undefined) continue;
				const bucket = neighbourAgreementByQuestion[question] ?? { scored: 0, correct: 0 };
				neighbourAgreementByQuestion[question] = bucket;
				bucket.scored += 1;
				if (predicted === truth) bucket.correct += 1;
				if (question === "activity") {
					neighbourVotes += 1;
					if (predicted === truth) neighbourHits += 1;
				}
			}
		}

		const state = sample.state;
		const withoutPrior = await classify({
			client: options.decision,
			questions,
			state,
			...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
		});
		const started = Date.now();
		const withPrior = await classify({
			client: options.decision,
			questions,
			state: priorLine ? { ...state, prior: priorLine } : state,
			...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
		});
		latencies.push(Date.now() - started);

		score(sample.labels, withoutPrior.answers, plain);
		score(sample.labels, withPrior.answers, prior);
		for (const [question, answer] of Object.entries(withPrior.answers)) {
			const before = withoutPrior.answers[question]?.value;
			if (before !== undefined && before !== answer.value) changedAnswers += 1;
		}
	}

	return {
		samples: labelled.length,
		plain,
		prior,
		neighbourAgreement: neighbourVotes > 0 ? neighbourHits / neighbourVotes : 0,
		neighbourAgreementByQuestion,
		changedAnswers,
		meanPriorMs: latencies.length > 0 ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0,
	};
}

/** Build the labelled corpus by embedding each sample (batched) from a JSONL file. */
export async function loadLabelled(samplesPath: string, embedding: EmbeddingConfig): Promise<Labelled[]> {
	const raw = readFileSync(samplesPath, "utf-8")
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line) as { id?: string; state?: unknown; expect?: Answers });
	const usable = raw.filter((row) => row.state && row.expect && Object.keys(row.expect).length > 0);
	// Hand-written samples omit collections; normalise before embedding/rendering.
	const digests = usable.map((row) => normalizeDigest(row.state as Partial<TurnDigest>));
	const texts = digests.map((digest) => embeddingText(digest));
	const vectors = await embedTexts(embedding, texts);
	return usable.map((row, index) => ({
		id: row.id ?? `sample-${index + 1}`,
		// embedTexts already truncates; keep the same length for every vector
		vector: truncate(vectors[index] ?? [], embedding.dimensions ?? 128),
		labels: row.expect ?? {},
		state: renderState(digests[index] as TurnDigest),
	}));
}

/** Human-readable comparison. */
export function formatKnnResult(result: KnnBenchResult): string {
	const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
	const rows = Object.keys(result.plain)
		.concat(Object.keys(result.prior))
		.filter((value, index, all) => all.indexOf(value) === index)
		.map((question) => {
			const before = result.plain[question];
			const after = result.prior[question];
			const accBefore = before && before.scored > 0 ? before.correct / before.scored : 0;
			const accAfter = after && after.scored > 0 ? after.correct / after.scored : 0;
			const delta = (accAfter - accBefore) * 100;
			return { question, accBefore, accAfter, delta, scored: after?.scored ?? before?.scored ?? 0 };
		})
		.sort((a, b) => a.delta - b.delta);

	const sum = (bucket: Record<string, { scored: number; correct: number }>): number => {
		let correct = 0;
		let scored = 0;
		for (const value of Object.values(bucket)) {
			correct += value.correct;
			scored += value.scored;
		}
		return scored > 0 ? correct / scored : 0;
	};
	const overallBefore = sum(result.plain);
	const overallAfter = sum(result.prior);
	const lines = [
		`kNN prior — ${result.samples} labelled turns, leave-one-out neighbours`,
		`  overall accuracy ${pct(overallBefore)} -> ${pct(overallAfter)}  (${(overallAfter - overallBefore) * 100 >= 0 ? "+" : ""}${((overallAfter - overallBefore) * 100).toFixed(1)} pts)`,
		`  closest neighbour agrees with truth: ${pct(result.neighbourAgreement)} (activity)`,
		`  answers changed by the prior: ${result.changedAnswers}`,
		`  decision latency with prior: ${result.meanPriorMs.toFixed(0)} ms mean`,
		"",
		"  per question (worst change first):",
	];
	for (const row of rows) {
		lines.push(
			`    ${row.question.padEnd(18)} ${pct(row.accBefore).padStart(6)} -> ${pct(row.accAfter).padStart(6)}  ` +
				`(${row.delta >= 0 ? "+" : ""}${row.delta.toFixed(0)} pts, n=${row.scored})`
		);
	}
	// The ceiling that bounds what retrieval alone could ever contribute.
	const ceiling = Object.entries(result.neighbourAgreementByQuestion)
		.map(([question, bucket]) => ({
			question,
			accuracy: bucket.scored > 0 ? bucket.correct / bucket.scored : 0,
			scored: bucket.scored,
		}))
		.sort((a, b) => a.accuracy - b.accuracy);
	lines.push("", "  retrieval ceiling (closest neighbour had the right label):");
	for (const row of ceiling) {
		lines.push(`    ${row.question.padEnd(18)} ${pct(row.accuracy).padStart(6)} of ${row.scored}`);
	}
	lines.push(
		"",
		"  reading: the prior can only help where this ceiling is high. A ceiling near chance",
		"  means the corpus is too small or too heterogeneous, not that the model is bad."
	);
	return lines.join("\n");
}

/** CLI. */
export async function main(argv: string[]): Promise<number> {
	const args = new Map<string, string>();
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token?.startsWith("--")) continue;
		const next = argv[index + 1];
		if (next && !next.startsWith("--")) {
			args.set(token.slice(2), next);
			index += 1;
		} else args.set(token.slice(2), "true");
	}
	const samples = args.get("samples");
	const endpoint = args.get("endpoint");
	const model = args.get("model");
	if (!samples || !endpoint || !model) {
		console.error(
			"usage: bun run bench-knn.ts --samples <file.jsonl> --endpoint <url> --model <id> [--api systemone|decisions] [--key <token>] [--embed-endpoint url] [--embed-model id] [--dim 128] [--k 5] [--projects a,b]"
		);
		return 2;
	}
	if (!existsSync(samples)) {
		console.error(`samples not found: ${samples}`);
		return 2;
	}

	const embedding: EmbeddingConfig = {
		endpoint: args.get("embed-endpoint") ?? "http://127.0.0.1:3010",
		model: args.get("embed-model") ?? "google/embeddinggemma-2",
		dimensions: Number(args.get("dim") ?? 128),
		...(args.get("embed-prefix") ? { prefix: args.get("embed-prefix") as string } : {}),
	};
	const decision: DecisionClientConfig = {
		endpoint,
		model,
		api: args.get("api") === "decisions" ? "decisions" : "systemone",
		...(args.get("key") ? { apiKey: args.get("key") } : {}),
		timeoutMs: Number(args.get("timeoutMs") ?? 30_000),
		instructions: "auto",
	};

	const labelled = await loadLabelled(samples, embedding);
	const projects = (args.get("projects") ?? "")
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean)
		.map((id) => ({ id }));
	const result = await benchKnn({ decision, embedding, labelled, k: Number(args.get("k") ?? 5), projects });
	console.log(formatKnnResult(result));
	return 0;
}

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
