/**
 * Client for decision APIs — "one forward pass, a probability per option".
 *
 * Two wire formats, same semantics:
 *
 *   systemone  POST /v1/systemone   (TypeSafe / Jeff, vLLM structured decisions)
 *              { model, state, questions: { id: { type, instructions?, criteria } } }
 *              -> { answers: { id: { choice|noul|score, probabilities, confidence } } }
 *
 *   decisions  POST /v1/decisions   (OpenAI Decisions API, vLLM MVP)
 *              { model, input, questions: [{ type, name, choices|levels }] }
 *              -> { answers: [{ type, name, value|..., probabilities, confidence }] }
 *
 * Both are plain HTTP; this module owns the shape translation so the rest of the
 * extension only ever sees `AnswerMap`.
 *
 * Model quirks encoded here (learned from vLLM's structured-decisions docs):
 *   - D3 checkpoints (`vllm-sr/d3*`) reject `instructions` with 400 — their prompt
 *     is fixed by the checkpoint. `supportsInstructions(model)` decides, and a 400
 *     that mentions instructions triggers one automatic retry without them.
 *   - System One `choice` caps at 26 options; the schema caps below that already.
 *   - `score` answers are expected level indices (0-based), not ids.
 */

import {
	type AnswerMap,
	type AnswerValue,
	type QuestionSpec,
	UNCLEAR,
	scoreLevelId,
	toDecisionsQuestions,
	toSystemOneQuestions,
} from "./schema.js";

export type DecisionApi = "systemone" | "decisions";

export interface DecisionClientConfig {
	/** Base URL, e.g. http://100.64.0.9:8010 or http://localhost:8000. Trailing /v1 is stripped. */
	endpoint: string;
	/** Model id as the server knows it, e.g. vllm-sr/d3-lite. */
	model: string;
	/** Which wire format to speak. */
	api: DecisionApi;
	/** Optional bearer token (EAVS virtual key, etc.). */
	apiKey?: string;
	/** Per-request timeout in ms. */
	timeoutMs?: number;
	/**
	 * Whether to send `instructions`. "auto" omits them for D3 checkpoints,
	 * which reject them.
	 */
	instructions?: "auto" | "always" | "never";
}

export class DecisionError extends Error {
	readonly status?: number;
	constructor(message: string, status?: number) {
		super(message);
		this.name = "DecisionError";
		this.status = status;
	}
}

/** D3 checkpoints never accept `instructions`: the prompt is fixed. */
export function supportsInstructions(model: string): boolean {
	return !/(^|\/)d3(-|$|\/)/i.test(model.trim());
}

function baseUrl(endpoint: string): string {
	const trimmed = endpoint.trim().replace(/\/+$/, "");
	return trimmed.endsWith("/v1") ? trimmed.slice(0, -3) : trimmed;
}

export interface DecisionRequest {
	client: DecisionClientConfig;
	questions: QuestionSpec[];
	/** Free-form state: string, or JSON sent as its text. */
	state: unknown;
	/** Optional shared preamble (systemone only; decisions uses `input`). */
	instructions?: string;
	fetchImpl?: typeof fetch;
	signal?: AbortSignal;
}

export interface DecisionResult {
	answers: AnswerMap;
	api: DecisionApi;
	model: string;
	endpoint: string;
	ms: number;
	usage?: { inputTokens?: number; outputTokens?: number };
	/** Raw body, for debugging and for storing diagnostics. */
	raw?: unknown;
}

/** True when an error looks like "this model refuses instructions". */
function isInstructionsRejection(status: number | undefined, body: string): boolean {
	return status === 400 && /instruction/i.test(body);
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeProbabilities(value: unknown): Record<string, number> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const out: Record<string, number> = {};
	for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
		const num = asNumber(raw);
		if (num !== undefined) out[key] = num;
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Read the answer value for one question out of a System One answer entry:
 * `choice` names the option, `noul` is the probability of yes, `score` is the
 * expected level index.
 */
function systemOneValue(question: QuestionSpec, entry: Record<string, unknown>): string | undefined {
	if (question.kind === "choice") {
		const chosen = entry.choice;
		return typeof chosen === "string" ? chosen : undefined;
	}
	if (question.kind === "boolean") {
		const yes = asNumber(entry.noul);
		// noul is the probability of yes; 0.5 is not an answer, so call it unclear.
		if (yes === undefined || yes === 0.5) return undefined;
		return yes > 0.5 ? "yes" : "no";
	}
	const score = asNumber(entry.score);
	return score === undefined ? undefined : scoreLevelId(question, score);
}

/** Read the answer value for one question out of an OpenAI Decisions entry. */
function decisionsValue(question: QuestionSpec, entry: Record<string, unknown>): string | undefined {
	if (question.kind === "choice") {
		const choice = entry.choice ?? entry.value;
		if (typeof choice === "string") return choice;
		return typeof choice === "boolean" ? String(choice) : undefined;
	}
	if (question.kind === "boolean") {
		const predicate = entry.predicate ?? entry.value;
		return typeof predicate === "boolean" ? (predicate ? "yes" : "no") : undefined;
	}
	const score = asNumber(entry.score ?? entry.value);
	return score === undefined ? undefined : scoreLevelId(question, score);
}

/** Attach confidence and probabilities, when the server reported them. */
function toAnswer(value: string, entry: Record<string, unknown>): AnswerValue {
	const answer: AnswerValue = { value };
	const confidence = asNumber(entry.confidence);
	if (confidence !== undefined) answer.confidence = confidence;
	const probabilities = normalizeProbabilities(entry.probabilities);
	if (probabilities) answer.probabilities = probabilities;
	return answer;
}

/**
 * Parse a System One response. Answers are keyed by question id; a `choice`
 * reports `choice`, `noul` reports `noul` (probability of yes), `score` reports
 * the expected level index.
 */
export function parseSystemOneAnswers(raw: unknown, questions: QuestionSpec[]): AnswerMap {
	const answers: AnswerMap = {};
	const body = raw as { answers?: Record<string, Record<string, unknown>> } | undefined;
	const reported = body?.answers;
	if (!reported || typeof reported !== "object") return answers;

	for (const question of questions) {
		const entry = reported[question.id];
		if (!entry || typeof entry !== "object") continue;
		const value = systemOneValue(question, entry);
		if (value !== undefined) answers[question.id] = toAnswer(value, entry);
	}
	return answers;
}

/**
 * Parse an OpenAI Decisions response. `answers` is an array in question order,
 * each echoing `name` (null for unnamed) plus a type-specific field:
 * `choice` (string/boolean value), `predicate` (boolean), `score` (number).
 */
export function parseDecisionsAnswers(raw: unknown, questions: QuestionSpec[]): AnswerMap {
	const answers: AnswerMap = {};
	const body = raw as { answers?: unknown } | undefined;
	const reported = Array.isArray(body?.answers) ? (body.answers as Record<string, unknown>[]) : [];
	if (reported.length === 0) return answers;

	// Prefer name matching; fall back to positional order for unnamed answers.
	const byName = new Map<string, Record<string, unknown>>();
	reported.forEach((entry, index) => {
		const name = entry?.name;
		if (typeof name === "string") byName.set(name, entry);
		else {
			const positional = questions[index];
			if (positional) byName.set(positional.id, entry);
		}
	});

	for (const question of questions) {
		const entry = byName.get(question.id);
		if (!entry) continue;
		const value = decisionsValue(question, entry);
		if (value !== undefined) answers[question.id] = toAnswer(value, entry);
	}
	return answers;
}

/**
 * Downgrade low-confidence choices to `unclear`.
 *
 * A 0.8B decision model is often confidently wrong (ECE is the known weakness),
 * so a card should say "unclear" rather than present a coin flip as a fact. The
 * raw probabilities stay in the stored card either way.
 */
function shouldIncludeInstructions(client: DecisionClientConfig): boolean {
	if (client.instructions === "always") return true;
	if (client.instructions === "never") return false;
	return supportsInstructions(client.model);
}

/** Build the JSON body for the configured API (exported for contract tests). */
export function buildBody(
	client: DecisionClientConfig,
	questions: QuestionSpec[],
	state: unknown,
	instructions: string | undefined,
	includeInstructions: boolean
): unknown {
	if (client.api === "systemone") {
		const body: Record<string, unknown> = {
			model: client.model,
			state: typeof state === "string" ? state : state,
			questions: toSystemOneQuestions(questions, { includeInstructions }),
		};
		if (includeInstructions && instructions) body.instructions = instructions;
		return body;
	}
	const body: Record<string, unknown> = {
		model: client.model,
		input: typeof state === "string" ? state : JSON.stringify(state),
		questions: toDecisionsQuestions(questions, { includeInstructions }),
	};
	return body;
}

async function post(
	path: string,
	client: DecisionClientConfig,
	body: unknown,
	fetchImpl: typeof fetch,
	signal?: AbortSignal
): Promise<{ json: unknown }> {
	const headers: Record<string, string> = { "content-type": "application/json" };
	if (client.apiKey) headers.authorization = `Bearer ${client.apiKey}`;
	const response = await fetchImpl(`${baseUrl(client.endpoint)}${path}`, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
		signal,
	});
	const text = await response.text();
	if (!response.ok) {
		throw new DecisionError(`${response.status} ${text.slice(0, 300) || response.statusText}`, response.status);
	}
	try {
		return { json: JSON.parse(text) as unknown };
	} catch {
		throw new DecisionError(`decision API returned non-JSON: ${text.slice(0, 200)}`, response.status);
	}
}

/**
 * Ask the decision model. One HTTP request, all questions; never throws for a
 * "model cannot answer" case — that yields an empty `answers` map instead.
 */
export async function classify(request: DecisionRequest): Promise<DecisionResult> {
	const { client, questions, state } = request;
	const fetchImpl = request.fetchImpl ?? fetch;
	let includeInstructions = shouldIncludeInstructions(client);
	const path = client.api === "systemone" ? "/v1/systemone" : "/v1/decisions";
	const started = Date.now();

	const timeout = client.timeoutMs ?? 20_000;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	const signals = [request.signal, controller.signal].filter(Boolean) as AbortSignal[];
	const signal = signals.length === 1 ? signals[0] : AbortSignal.any(signals);

	try {
		let response: { json: unknown };
		try {
			response = await post(
				path,
				client,
				buildBody(client, questions, state, request.instructions, includeInstructions),
				fetchImpl,
				signal
			);
		} catch (error) {
			// Some checkpoints (D3) reject `instructions`; retry once without them.
			if (error instanceof DecisionError && includeInstructions && isInstructionsRejection(error.status, error.message)) {
				includeInstructions = false;
				response = await post(path, client, buildBody(client, questions, state, request.instructions, false), fetchImpl, signal);
			} else {
				throw error;
			}
		}

		const answers =
			client.api === "systemone"
				? parseSystemOneAnswers(response.json, questions)
				: parseDecisionsAnswers(response.json, questions);
		const usage = (response.json as { usage?: Record<string, number> } | undefined)?.usage;

		return {
			answers,
			api: client.api,
			model: client.model,
			endpoint: client.endpoint,
			ms: Date.now() - started,
			usage: usage ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens } : undefined,
			raw: response.json,
		};
	} catch (error) {
		if (error instanceof DecisionError) throw error;
		if (error instanceof Error && error.name === "AbortError") {
			throw new DecisionError(`decision API timed out after ${timeout} ms`);
		}
		throw new DecisionError(error instanceof Error ? error.message : String(error));
	} finally {
		clearTimeout(timer);
	}
}

export function demoteLowConfidence(answers: AnswerMap, questions: QuestionSpec[], floor = 0.4): AnswerMap {
	const out: AnswerMap = { ...answers };
	for (const question of questions) {
		const answer = out[question.id];
		if (!answer || question.kind !== "choice") continue;
		if (answer.confidence !== undefined && answer.confidence < floor) {
			out[question.id] = { ...answer, value: UNCLEAR };
		}
	}
	return out;
}
