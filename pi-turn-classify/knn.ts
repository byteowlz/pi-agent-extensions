/**
 * kNN prior: retrieve the most similar *labelled* turns and hand their answers to
 * the decision model as text.
 *
 * Why this shape. A decision model can only read labels, so a vector cannot be
 * fed to it — but the *answers of nearby labelled turns* can:
 *
 *   similar past turns:
 *     [debug · blocked · eavs]  [debug · done · eavs]  [implement · done · pi-agent-extensions]
 *
 * That is retrieval doing the job a bigger model would otherwise need: the prior
 * carries knowledge of your own traffic that a 0.8B label-reader cannot have.
 *
 * Storage is int8 per vector with one scale factor, base64-encoded. At 128 MRL dims
 * that is ~176 B per turn in JSONL — small enough to keep the whole history as one
 * file and to score neighbours with a plain dot product (no vector database).
 *
 * Everything here is label-source agnostic: human labels only. Retrieving the
 * model's own past prediction would feed the model its own bias.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { Answers } from "./knn-types.js";

export const VECTOR_STORE_VERSION = 1;

/** One indexed turn: a vector plus the human labels for it. */
export interface VectorEntry {
	id: string;
	/** MRL-truncated, renormalised vector. */
	vector: number[];
	/** Human labels, keyed by question id. */
	labels: Answers;
	/** Where it came from, for debugging. */
	meta?: { sessionId?: string; turn?: number; at?: string; model?: string };
}

interface StoredEntry {
	version: number;
	id: string;
	/** int8 values, base64. */
	v: string;
	/** Dequantisation scale: value = int8 * scale. */
	s: string;
	labels: Answers;
	meta?: VectorEntry["meta"];
}

// --------------------------------------------------------------------------
// int8 quantisation
// --------------------------------------------------------------------------

/** Quantise to int8 with a single per-vector scale (max-abs). */
export function quantize(vector: number[]): { v: string; s: string } {
	let maxAbs = 0;
	for (const value of vector) maxAbs = Math.max(maxAbs, Math.abs(value));
	const scale = maxAbs > 0 ? maxAbs / 127 : 0;
	const bytes = new Uint8Array(vector.length);
	for (let index = 0; index < vector.length; index += 1) {
		const quantised = scale > 0 ? Math.round((vector[index] ?? 0) / scale) : 0;
		// store as two's complement in a byte
		bytes[index] = (Math.max(-127, Math.min(127, quantised)) + 256) % 256;
	}
	return { v: Buffer.from(bytes).toString("base64"), s: String(scale) };
}

/** Reconstruct a float vector from its quantised form. */
export function dequantize(v: string, s: string): number[] {
	const bytes = Buffer.from(v, "base64");
	const scale = Number(s) || 0;
	const vector: number[] = new Array(bytes.length);
	for (let index = 0; index < bytes.length; index += 1) {
		const signed = (bytes[index] ?? 0) > 127 ? (bytes[index] ?? 0) - 256 : (bytes[index] ?? 0);
		vector[index] = signed * scale;
	}
	return vector;
}

/** Cosine similarity; inputs are expected to be near-normalised already. */
export function cosine(a: number[], b: number[]): number {
	const length = Math.min(a.length, b.length);
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let index = 0; index < length; index += 1) {
		const x = a[index] ?? 0;
		const y = b[index] ?? 0;
		dot += x * y;
		na += x * x;
		nb += y * y;
	}
	if (na === 0 || nb === 0) return 0;
	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// --------------------------------------------------------------------------
// store
// --------------------------------------------------------------------------

export interface VectorStoreOptions {
	/** JSONL file. Defaults to <agentDir>/turn-classify/vectors.jsonl. */
	path?: string;
}

export function defaultVectorPath(): string {
	const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
	return join(agentDir, "turn-classify", "vectors.jsonl");
}

export class VectorStore {
	readonly path: string;
	private entries: VectorEntry[] | undefined;

	constructor(options: VectorStoreOptions = {}) {
		this.path = options.path ? options.path : defaultVectorPath();
	}

	/** Loaded lazily and cached; returns [] when the file does not exist. */
	all(): VectorEntry[] {
		if (this.entries) return this.entries;
		this.entries = readStore(this.path);
		return this.entries;
	}

	/** Append one entry (memory + file). Returns the entry. */
	add(entry: VectorEntry): VectorEntry {
		// Load the cache BEFORE writing: loading afterwards would read the entry we
		// just appended and then push it a second time.
		this.all();
		const quantised = quantize(entry.vector);
		const stored: StoredEntry = {
			version: VECTOR_STORE_VERSION,
			id: entry.id,
			v: quantised.v,
			s: quantised.s,
			labels: entry.labels,
			...(entry.meta ? { meta: entry.meta } : {}),
		};
		mkdirSync(dirname(this.path), { recursive: true });
		appendFileSync(this.path, `${JSON.stringify(stored)}\n`);
		this.entries?.push(entry);
		return entry;
	}

	/** True when this id is already indexed (keeps append-only safe to re-run). */
	has(id: string): boolean {
		return this.all().some((entry) => entry.id === id);
	}

	/**
	 * k nearest labelled neighbours by cosine.
	 *
	 * `exclude` is what makes leave-one-out evaluation honest: the turn being
	 * classified must never be its own neighbour.
	 */
	neighbours(vector: number[], k: number, exclude?: string): Array<VectorEntry & { score: number }> {
		const scored: Array<VectorEntry & { score: number }> = [];
		for (const entry of this.all()) {
			if (exclude && entry.id === exclude) continue;
			if (Object.keys(entry.labels).length === 0) continue;
			scored.push({ ...entry, score: cosine(vector, entry.vector) });
		}
		return scored.sort((a, b) => b.score - a.score).slice(0, Math.max(0, k));
	}
}

function readStore(path: string): VectorEntry[] {
	if (!existsSync(path)) return [];
	const entries: VectorEntry[] = [];
	for (const line of readFileSync(path, "utf-8").split("\n")) {
		if (!line.trim()) continue;
		try {
			const stored = JSON.parse(line) as StoredEntry;
			if (stored.version !== VECTOR_STORE_VERSION || !stored.id) continue;
			entries.push({
				id: stored.id,
				vector: dequantize(stored.v, stored.s),
				labels: stored.labels ?? {},
				...(stored.meta ? { meta: stored.meta } : {}),
			});
		} catch {
			// a corrupt line must not break retrieval
		}
	}
	return entries;
}

// --------------------------------------------------------------------------
// the prior, as text for the decision model
// --------------------------------------------------------------------------

/**
 * Compactly render one neighbour's labels: "[eavs · debug · blocked]".
 *
 * Booleans carry their own name, because a bare "yes" cannot say whether the turn
 * was done or blocked. Only the informative side is printed: `blocked: yes` ->
 * "blocked", `work_done: no` -> "unfinished".
 */
export function neighbourLabel(entry: { labels: Answers; score?: number }): string {
	const parts: string[] = [];
	const add = (value: string | undefined): void => {
		if (value && value !== "unclear" && value !== "none") parts.push(value);
	};
	const project = entry.labels.project;
	if (project && project !== "other") parts.push(project);
	add(entry.labels.activity);
	if (entry.labels.blocked === "yes") parts.push("blocked");
	if (entry.labels.work_done === "no") parts.push("unfinished");
	if (entry.labels.needs && entry.labels.needs !== "none") parts.push(entry.labels.needs);
	if (entry.labels.error_kind) parts.push(entry.labels.error_kind);
	return parts.length > 0 ? `[${parts.join(" · ")}]` : "";
}

/**
 * Render the retrieval prior for the state.
 *
 * Kept to one short line: the decision model reads it as evidence, and a wall of
 * neighbours would compete with the actual turn. Similarity is included so the
 * model can weigh a close match over a loose one.
 */
export function priorText(neighbours: Array<VectorEntry & { score: number }>, options: { minScore?: number } = {}): string {
	const minScore = options.minScore ?? 0.5;
	const lines = neighbours
		.filter((neighbour) => neighbour.score >= minScore)
		.map((neighbour) => `${neighbourLabel(neighbour)} ${neighbour.score.toFixed(2)}`)
		.filter((line) => line.trim() !== "");
	if (lines.length === 0) return "";
	return `similar labelled turns: ${lines.join("  ")}`;
}

/** Index a labelled turn (idempotent by id). */
export function indexLabelledTurn(
	store: VectorStore,
	input: { id: string; vector: number[]; labels: Answers; meta?: VectorEntry["meta"] }
): boolean {
	if (Object.keys(input.labels).length === 0) return false;
	if (store.has(input.id)) return false;
	store.add(input);
	return true;
}
