/**
 * Embeddings client for the kNN prior.
 *
 * One vector per turn, so a labelled turn can be retrieved as *evidence* for the
 * next one. A decision model cannot consume a vector — it reads labels — so the
 * vector's job is retrieval: find the most similar *labelled* turns and hand their
 * answers to the decision model as text.
 *
 * Measured on this box (vqtrs 0.2.0, `google/embeddinggemma-2`, 2026-10-29):
 *   - 768 dims, already L2-normalised;
 *   - the OpenAI `dimensions` field is ignored, so MRL truncation happens here;
 *   - truncating to 128 keeps the ranking but inflates absolute similarity
 *     (0.886 -> 0.934 for the same pair), so thresholds must be per-dimension.
 */

import type { TurnDigest } from "./digest.js";

export interface EmbeddingConfig {
	/** Base URL of the embedding server, e.g. http://127.0.0.1:3010 (with or without /v1). */
	endpoint: string;
	/** Model id as the server knows it. */
	model: string;
	/** Vector length to keep (MRL): 768 keeps everything, 128 is ~6x smaller. */
	dimensions?: number;
	/** Task prefix prepended to every text, e.g. "task: classification | query: ". */
	prefix?: string;
	timeoutMs?: number;
}

export const DEFAULT_DIMENSIONS = 128;
export const DEFAULT_TIMEOUT_MS = 20_000;

export class EmbeddingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EmbeddingError";
	}
}

function baseUrl(endpoint: string): string {
	const trimmed = endpoint.trim().replace(/\/+$/, "");
	return trimmed.endsWith("/v1") ? trimmed.slice(0, -3) : trimmed;
}

/** Keep the leading `dimensions` values (MRL) and renormalise. */
export function truncate(vector: number[], dimensions: number): number[] {
	if (dimensions >= vector.length) return vector;
	const cut = vector.slice(0, dimensions);
	let sum = 0;
	for (const value of cut) sum += value * value;
	const norm = Math.sqrt(sum);
	return norm > 0 ? cut.map((value) => value / norm) : cut;
}

/**
 * The text embedded for a turn.
 *
 * Deliberately the salient facts rather than the whole digest — the same
 * selection the decision model sees, so a neighbour is a neighbour of what was
 * classified.
 */
export function embeddingText(digest: TurnDigest): string {
	const firstLine = (text: string): string => (text.trim().split("\n")[0] ?? "").trim();
	const parts: string[] = [];
	if (digest.error) parts.push(`error: ${firstLine(digest.error.message)}`);
	const ask = firstLine(digest.userText ?? "").slice(0, 300);
	if (ask) parts.push(`asked: ${ask}`);
	const answer = firstLine(digest.assistantText ?? "").slice(0, 300);
	if (answer) parts.push(`done: ${answer}`);
	// Hand-written samples routinely omit collections; never trust the shape.
	const files = digest.filesTouched ?? [];
	const commands = digest.commands ?? [];
	if (files.length > 0) parts.push(`files: ${files.slice(0, 6).join(" ")}`);
	if (commands.length > 0) parts.push(`commands: ${commands.slice(0, 4).join(" ; ")}`);
	parts.push(`dir: ${digest.cwd ?? ""}`);
	return parts.join("\n");
}

/** Embed texts in one request. Throws EmbeddingError. */
export async function embedTexts(
	config: EmbeddingConfig,
	texts: string[],
	options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}
): Promise<number[][]> {
	if (texts.length === 0) return [];
	const fetchImpl = options.fetchImpl ?? fetch;
	const timeout = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
	const prefix = config.prefix ?? "";
	const dimensions = config.dimensions ?? DEFAULT_DIMENSIONS;

	try {
		const response = await fetchImpl(`${baseUrl(config.endpoint)}/v1/embeddings`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ model: config.model, input: texts.map((text) => `${prefix}${text}`) }),
			signal,
		});
		const body = (await response.json()) as {
			data?: Array<{ embedding?: number[]; index?: number }>;
			error?: unknown;
		};
		if (!response.ok) {
			throw new EmbeddingError(`${response.status} ${JSON.stringify(body.error ?? body).slice(0, 200)}`);
		}
		const rows = body.data ?? [];
		if (rows.length !== texts.length) {
			throw new EmbeddingError(`expected ${texts.length} vectors, got ${rows.length}`);
		}
		// The API ignores `dimensions`, so truncate here.
		return rows.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((row) => truncate(row.embedding ?? [], dimensions));
	} catch (error) {
		if (error instanceof EmbeddingError) throw error;
		if (error instanceof Error && error.name === "AbortError") {
			throw new EmbeddingError(`embedding request timed out after ${timeout} ms`);
		}
		throw new EmbeddingError(error instanceof Error ? error.message : String(error));
	} finally {
		clearTimeout(timer);
	}
}

/** Embed one turn digest. */
export async function embedDigest(
	config: EmbeddingConfig,
	digest: TurnDigest,
	options: { fetchImpl?: typeof fetch } = {}
): Promise<number[]> {
	const [vector] = await embedTexts(config, [embeddingText(digest)], options);
	if (!vector) throw new EmbeddingError("no vector returned");
	return vector;
}
