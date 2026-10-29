import { describe, expect, test } from "bun:test";

import {
	type DecisionClientConfig,
	DecisionError,
	buildBody,
	classify,
	demoteLowConfidence,
	parseDecisionsAnswers,
	parseSystemOneAnswers,
	supportsInstructions,
} from "./decision-client";
import { buildQuestions } from "./schema";

const projects = [{ id: "pi-agent-extensions" }, { id: "eavs" }];
const questions = buildQuestions(projects);

const baseClient: DecisionClientConfig = {
	endpoint: "http://127.0.0.1:9999",
	model: "vllm-sr/d3-lite",
	api: "systemone",
	timeoutMs: 5000,
	instructions: "auto",
};

/** Minimal fake transport: records requests, returns a scripted response. */
function fakeFetch(handler: (url: string, init: RequestInit) => { status?: number; body: unknown }): {
	fetchImpl: typeof fetch;
	calls: Array<{ url: string; body: unknown }>;
} {
	const calls: Array<{ url: string; body: unknown }> = [];
	const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		calls.push({ url: String(url), body });
		const result = handler(String(url), init ?? {});
		const status = result.status ?? 200;
		return new Response(JSON.stringify(result.body), {
			status,
			headers: { "content-type": "application/json" },
		});
	}) as unknown as typeof fetch;
	return { fetchImpl, calls };
}

describe("model capability detection", () => {
	test("D3 checkpoints reject instructions; other decision models accept them", () => {
		expect(supportsInstructions("vllm-sr/d3-lite")).toBe(false);
		expect(supportsInstructions("vllm-sr/d3")).toBe(false);
		expect(supportsInstructions("vllm-sr/d3-mini")).toBe(false);
		expect(supportsInstructions("Cloudflare/clef-flash")).toBe(true);
		expect(supportsInstructions("Qwen/Qwen3-0.6B")).toBe(true);
		// a model merely containing "d3" in a longer word is not a D3 checkpoint
		expect(supportsInstructions("some/d30-model")).toBe(true);
	});
});

describe("request bodies", () => {
	test("systemone body sends state and keyed questions", () => {
		const body = buildBody(baseClient, questions, { cwd: "/x" }, undefined, true) as Record<string, unknown>;
		expect(body.model).toBe("vllm-sr/d3-lite");
		expect(body.state).toEqual({ cwd: "/x" });
		const rendered = body.questions as Record<string, { type: string }>;
		expect(rendered.project_mismatch.type).toBe("noul");
		expect(rendered.risk.type).toBe("score");
	});

	test("decisions body uses input and an array of named questions", () => {
		const body = buildBody({ ...baseClient, api: "decisions" }, questions, { cwd: "/x" }, undefined, true) as Record<
			string,
			unknown
		>;
		expect(typeof body.input).toBe("string");
		expect((body.questions as unknown[]).length).toBe(questions.length);
		// no systemone-only fields leak into the OpenAI shape
		expect(body.state).toBeUndefined();
	});
});

describe("answer parsing — System One", () => {
	test("choice, noul and score answers become ids", () => {
		const answers = parseSystemOneAnswers(
			{
				answers: {
					project: { type: "choice", choice: "eavs", probabilities: { eavs: 0.9, "pi-agent-extensions": 0.1 }, confidence: 0.88 },
					project_mismatch: { type: "noul", noul: 0.93, probabilities: { yes: 0.93, no: 0.07 }, confidence: 0.9 },
					risk: { type: "score", score: 3.2, probabilities: { "3": 0.8 }, confidence: 0.75 },
					activity: { type: "choice", choice: "debug", confidence: 0.6 },
				},
			},
			questions
		);
		expect(answers.project).toEqual({
			value: "eavs",
			confidence: 0.88,
			probabilities: { eavs: 0.9, "pi-agent-extensions": 0.1 },
		});
		expect(answers.project_mismatch?.value).toBe("yes");
		expect(answers.risk?.value).toBe("high");
		expect(answers.activity?.value).toBe("debug");
	});

	test("a 0.5 noul is not an answer (honest unclear)", () => {
		const answers = parseSystemOneAnswers({ answers: { project_mismatch: { noul: 0.5 } } }, questions);
		expect(answers.project_mismatch).toBeUndefined();
	});

	test("missing or malformed answers are skipped, not fabricated", () => {
		expect(parseSystemOneAnswers({}, questions)).toEqual({});
		expect(parseSystemOneAnswers({ answers: { activity: {} } }, questions)).toEqual({});
		expect(parseSystemOneAnswers({ answers: null }, questions)).toEqual({});
		expect(parseSystemOneAnswers("nonsense", questions)).toEqual({});
	});
});

describe("answer parsing — OpenAI Decisions", () => {
	test("matches answers by name, normalizes predicate and score", () => {
		const answers = parseDecisionsAnswers(
			{
				answers: [
					{ type: "choice", name: "activity", choice: "implement", confidence: 0.8 },
					{ type: "predicate", name: "project_mismatch", predicate: false, confidence: 0.7 },
					{ type: "score", name: "risk", score: 1.4, confidence: 0.66 },
					{ type: "choice", name: "project", value: "eavs" },
				],
			},
			questions
		);
		expect(answers.activity?.value).toBe("implement");
		expect(answers.project_mismatch?.value).toBe("no");
		expect(answers.risk?.value).toBe("low");
		expect(answers.project?.value).toBe("eavs");
	});

	test("unnamed answers fall back to question order", () => {
		const answers = parseDecisionsAnswers({ answers: [{ type: "predicate", name: null, predicate: true }] }, questions);
		// first question in this schema is `project` (a choice), so a predicate
		// landing there yields nothing rather than a wrong answer
		expect(answers.project).toBeUndefined();
	});
});

describe("classify — end to end against a fake server", () => {
	test("systemone: omits instructions for D3 and parses answers", async () => {
		const { fetchImpl, calls } = fakeFetch(() => ({
			body: {
				object: "structured_decision",
				answers: {
					activity: { type: "choice", choice: "implement", confidence: 0.9 },
					status: { type: "choice", choice: "implementing", confidence: 0.8 },
				},
				usage: { input_tokens: 120, output_tokens: 7 },
			},
		}));
		const result = await classify({
			client: baseClient,
			questions,
			state: { cwd: "/x" },
			fetchImpl,
		});

		expect(calls[0]?.url).toBe("http://127.0.0.1:9999/v1/systemone");
		const sent = calls[0]?.body as { questions: Record<string, { instructions?: string }> };
		expect(sent.questions.risk.instructions).toBeUndefined();
		expect(result.answers.activity?.value).toBe("implement");
		expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 7 });
		expect(result.ms).toBeGreaterThanOrEqual(0);
	});

	test("retries once without instructions when the model rejects them", async () => {
		let attempt = 0;
		const { fetchImpl, calls } = fakeFetch((_url, init) => {
			attempt += 1;
			const body = JSON.parse(String(init.body)) as { questions: Record<string, { instructions?: string }> };
			const hasInstructions = Object.values(body.questions).some((question) => question.instructions !== undefined);
			if (hasInstructions) return { status: 400, body: { error: "instructions are not supported by this model" } };
			return { body: { answers: { activity: { type: "choice", choice: "review", confidence: 0.9 } } } };
		});

		const result = await classify({
			client: { ...baseClient, model: "Cloudflare/clef-flash", instructions: "always" },
			questions,
			state: "a ticket",
			fetchImpl,
		});

		expect(attempt).toBe(2);
		const retried = calls[1]?.body as { questions: Record<string, { instructions?: string }> };
		expect(retried.questions.activity.instructions).toBeUndefined();
		expect(result.answers.activity?.value).toBe("review");
	});

	test("decisions api: posts to /v1/decisions and normalizes", async () => {
		const { fetchImpl, calls } = fakeFetch(() => ({
			body: { answers: [{ type: "choice", name: "activity", choice: "plan", confidence: 0.77 }] },
		}));
		const result = await classify({
			client: { ...baseClient, api: "decisions" },
			questions,
			state: { user: "let's design the schema" },
			fetchImpl,
		});
		expect(calls[0]?.url).toBe("http://127.0.0.1:9999/v1/decisions");
		expect(result.answers.activity?.value).toBe("plan");
	});

	test("http errors surface status and body, and never throw raw", async () => {
		const { fetchImpl } = fakeFetch(() => ({ status: 501, body: { error: "no read strategy" } }));
		const promise = classify({ client: baseClient, questions, state: {}, fetchImpl });
		await expect(promise).rejects.toBeInstanceOf(DecisionError);
		await expect(promise).rejects.toThrow(/501/);
	});

	test("a /v1 suffix in the endpoint is not doubled", async () => {
		const { fetchImpl, calls } = fakeFetch(() => ({ body: { answers: {} } }));
		await classify({
			client: { ...baseClient, endpoint: "http://127.0.0.1:9999/v1/" },
			questions,
			state: {},
			fetchImpl,
		});
		expect(calls[0]?.url).toBe("http://127.0.0.1:9999/v1/systemone");
	});

	test("sends the API key when configured", async () => {
		let auth: string | undefined;
		const { fetchImpl } = fakeFetch((_url, init) => {
			auth = (init.headers as Record<string, string> | undefined)?.authorization;
			return { body: { answers: {} } };
		});
		await classify({ client: { ...baseClient, apiKey: "eavs-test" }, questions, state: {}, fetchImpl });
		expect(auth).toBe("Bearer eavs-test");
	});

	test("timeouts become a DecisionError, not a hang", async () => {
		const fetchImpl = ((_url: string, init?: RequestInit) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => {
					const error = new Error("aborted");
					error.name = "AbortError";
					reject(error);
				});
			})) as unknown as typeof fetch;
		const promise = classify({ client: { ...baseClient, timeoutMs: 25 }, questions, state: {}, fetchImpl });
		await expect(promise).rejects.toThrow(/timed out/);
	});
});

describe("confidence demotion", () => {
	test("low-confidence choices become unclear; booleans and scores are kept", () => {
		const answers = demoteLowConfidence(
			{
				activity: { value: "debug", confidence: 0.31 },
				status: { value: "done", confidence: 0.85 },
				project_mismatch: { value: "yes", confidence: 0.2 },
				risk: { value: "low", confidence: 0.1 },
			},
			questions,
			0.4
		);
		expect(answers.activity?.value).toBe("unclear");
		expect(answers.status?.value).toBe("done");
		// comparison-type answers keep their value: a low-confidence "yes" is still
		// information about a mismatch, and the raw confidence is stored
		expect(answers.project_mismatch?.value).toBe("yes");
		expect(answers.risk?.value).toBe("low");
		// probabilities/confidence survive demotion for later recalibration
		expect(answers.activity?.confidence).toBe(0.31);
	});
});
