import { afterAll, beforeAll, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";

/**
 * End-to-end: the real extension, a real HTTP decision server, a real session.
 *
 * The server implements the documented vLLM shapes:
 *   POST /v1/systemone  -> { answers: { <id>: { type, choice|noul|score, probabilities, confidence } } }
 *   POST /v1/decisions  -> { answers: [{ type, name, choice|predicate|score, confidence }] }
 * and, like a D3 checkpoint, rejects `instructions` with 400.
 *
 * Asserts the contract that matters for Octo: a finished turn produces one
 * stored card whose line is composed only from answer ids, and a failing or
 * disabled classifier never breaks the turn.
 */

let server: http.Server;
let port = 0;
const received: Array<{ path: string; body: Record<string, unknown> }> = [];
let failuresRemaining = 0;

beforeAll(async () => {
	server = http.createServer((req, res) => {
		let raw = "";
		req.on("data", (chunk) => {
			raw += chunk;
		});
		req.on("end", () => {
			const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
			received.push({ path: req.url ?? "", body });

			if (failuresRemaining > 0) {
				failuresRemaining -= 1;
				res.writeHead(503, { "content-type": "application/json" });
				res.end(JSON.stringify({ error: "upstream unavailable" }));
				return;
			}

			// D3 behaviour: no instructions allowed.
			const questions = body.questions as Record<string, { instructions?: string }> | undefined;
			if (questions && Object.values(questions).some((question) => question.instructions !== undefined)) {
				res.writeHead(400, { "content-type": "application/json" });
				res.end(JSON.stringify({ error: "instructions are not supported by this model" }));
				return;
			}

			const payload = (body.state ?? {}) as Record<string, unknown>;
			const mentionsEavs = JSON.stringify(payload).toLowerCase().includes("eavs");

			if ((req.url ?? "").endsWith("/v1/decisions")) {
				res.writeHead(200, { "content-type": "application/json" });
				res.end(
					JSON.stringify({
						answers: [
							{ type: "predicate", name: "project_mismatch", predicate: mentionsEavs, confidence: 0.81 },
							{ type: "choice", name: "activity", choice: "implement", confidence: 0.9 },
						],
					})
				);
				return;
			}

			res.writeHead(200, { "content-type": "application/json" });
			res.end(
				JSON.stringify({
					id: "decision-test",
					object: "structured_decision",
					model: "vllm-sr/d3-lite",
					answers: {
						project: { type: "choice", choice: mentionsEavs ? "eavs" : "pi-agent-extensions", confidence: 0.87 },
						// Only sent for failed turns, mirroring the real question set.
						...(payload.error
							? {
									error_kind: { type: "choice", choice: "provider_overloaded", confidence: 0.86 },
									error_transient: { type: "noul", noul: 0.9, confidence: 0.85 },
								}
							: {}),
						project_mismatch: { type: "noul", noul: mentionsEavs ? 0.9 : 0.05, confidence: 0.85 },
						activity: { type: "choice", choice: "implement", confidence: 0.92 },
						work_done: { type: "noul", noul: 0.2, confidence: 0.8 },
						blocked: { type: "noul", noul: 0.1, confidence: 0.8 },
						attention: { type: "choice", choice: "review", confidence: 0.63 },
						artifact: { type: "choice", choice: "code", confidence: 0.8 },
						scope: { type: "choice", choice: "single", confidence: 0.75 },
					},
					usage: { input_tokens: 210, output_tokens: 8 },
				})
			);
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	port = typeof address === "object" && address ? address.port : 0;
});

afterAll(async () => {
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("a finished turn is classified and stored as a card", { timeout: 60_000 }, async () => {
	const extensionPath = path.resolve(import.meta.dir, "index.ts");
	const home = fs.mkdtempSync("/tmp/pi-turn-");
	const datasetPath = path.join(home, "dataset.jsonl");
	fs.mkdirSync(path.join(home, "agent"), { recursive: true });
	fs.writeFileSync(
		path.join(home, "agent", "turn-classify.json"),
		JSON.stringify({
			enabled: true,
			endpoint: `http://127.0.0.1:${port}`,
			model: "vllm-sr/d3-lite",
			api: "systemone",
			statusLine: true,
			dataset: { path: datasetPath },
			cardsDir: path.join(home, "cards"),
		})
	);

	const script = `
import extension from ${JSON.stringify(extensionPath)};
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const events = new Map();
const commands = new Map();
// What the extension actually sent to the decision server, for assertions.
const requests = [];
const appended = [];
const notifications = [];
const statuses = [];
let config;

extension({
  on: (event, handler) => events.set(event, handler),
  registerCommand: (name, value) => commands.set(name, value.handler),
  registerTool: () => {},
  appendEntry: (customType, data) => appended.push({ customType, data }),
  sendUserMessage: () => {},
});

const ctx = {
  cwd: process.env.FIXTURE_CWD,
  mode: 'tui',
  isIdle: () => true,
  ui: {
    notify: (message, level) => notifications.push({ message, level }),
    setStatus: (key, value) => statuses.push({ key, value }),
    select: async () => undefined,
    custom: async () => undefined,
  },
  sessionManager: {
    getSessionId: () => 'fixture-session',
    getSessionFile: () => '/tmp/fixture.jsonl',
    getSessionName: () => 'Classifier work',
    getEntries: () => appended.map((a) => ({ type: 'custom', customType: a.customType, data: a.data })),
    getBranch: () => appended.map((a) => ({ type: 'custom', customType: a.customType, data: a.data })),
  },
};

await events.get('session_start')({ reason: 'startup' }, ctx);

// --- a normal turn -------------------------------------------------------
await events.get('input')({ source: 'interactive', text: 'add a classifier for finished turns' }, ctx);
await events.get('tool_execution_start')({ toolName: 'read', args: { path: 'src/index.ts' } }, ctx);
await events.get('tool_execution_start')({ toolName: 'bash', args: { command: 'bun test' } }, ctx);
await events.get('tool_execution_end')({ toolName: 'bash', isError: false }, ctx);
await events.get('tool_execution_start')({ toolName: 'edit', args: { path: 'src/index.ts' } }, ctx);
await events.get('agent_end')(
  { messages: [{ role: 'assistant', content: [{ type: 'text', text: 'Added the classifier with tests.' }], stopReason: 'stop' }] },
  ctx
);

assert.equal(appended.length, 1, 'one card stored');
const card = appended[0].data;
assert.equal(appended[0].customType, 'pi-turn-classify:card/v1');
assert.equal(card.version, 1);
assert.equal(card.turn, 1);
assert.equal(card.cwd, process.env.FIXTURE_CWD);
assert.equal(card.source.api, 'systemone');
assert.equal(card.source.model, 'vllm-sr/d3-lite');
assert.equal(card.answers.project.value, 'pi-agent-extensions');
assert.equal(card.answers.activity.value, 'implement');
assert.equal(card.answers.work_done.value, 'no');
assert.equal(card.answers.blocked.value, 'no');
assert.equal(card.answers.project_mismatch.value, 'no');
assert.ok(card.line.length > 0, 'line is rendered');
assert.ok(card.line.startsWith('pi-agent-extensions · implement'), 'line starts with project and activity: ' + card.line);
assert.ok(card.line.includes('unfinished'), 'line carries the v2 outcome: ' + card.line);
assert.ok(card.line.includes('needs review'), 'attention shows: ' + card.line);
assert.equal(statuses.at(-1).key, 'turn');
assert.equal(statuses.at(-1).value, card.line);

// --- a turn whose work belongs to another project ------------------------
await events.get('input')({ source: 'interactive', text: 'fix the eavs gateway routing bug' }, ctx);
await events.get('agent_end')(
  { messages: [{ role: 'assistant', content: [{ type: 'text', text: 'Fixed it in the eavs repo.' }], stopReason: 'stop' }] },
  ctx
);
assert.equal(appended.length, 2, 'second card stored');
const second = appended[1].data;
assert.equal(second.turn, 2);
assert.equal(second.answers.project.value, 'eavs');
assert.equal(second.answers.project_mismatch.value, 'yes');
assert.ok(second.line.includes('(cwd differs)'), 'mismatch is visible: ' + second.line);

// --- a failed turn: the error text reaches the model, error questions are asked --
await commands.get('classify')('on', ctx);
notifications.length = 0;
await events.get('input')({ source: 'interactive', text: 'use the glm model for this refactor please' }, ctx);
await events.get('agent_end')(
  {
    messages: [
      {
        role: 'assistant',
        content: [],
        stopReason: 'error',
        errorMessage: 'EAVS request rejected with HTTP 502 by the gateway or upstream.',
      },
    ],
  },
  ctx
);

const failedCard = appended.at(-1).data;
assert.equal(failedCard.answers.error_kind.value, 'provider_overloaded', 'error classified: ' + JSON.stringify(failedCard.answers.error_kind));
assert.equal(failedCard.answers.error_transient.value, 'yes');
assert.ok(failedCard.line.includes('error provider overloaded'), 'line names the error: ' + failedCard.line);
assert.ok(failedCard.line.includes('retryable'), 'line marks retryability: ' + failedCard.line);

// --- the background dataset captured every turn ---------------------------
const datasetText = readFileSync(process.env.FIXTURE_DATASET, 'utf8').trim().split('\\n');
assert.equal(datasetText.length, 3, 'three turns recorded, including the failed one');
const failedRecord = datasetText.map((line) => JSON.parse(line)).find((record) => record.state.error);
assert.ok(failedRecord, 'the failed turn is in the corpus');
assert.equal(failedRecord.state.error.source, 'provider');
assert.ok(failedRecord.classification.answers.error_kind.value, 'the model answer is stored with it');

// --- /classify show and schema ------------------------------------------
notifications.length = 0;
await commands.get('classify')('show', ctx);
// The latest card is the failed turn (its error text even mentions EAVS, which is
// why that project came back), so the show command must surface the error line.
assert.ok(notifications[0].message.includes('error provider overloaded'), 'show prints the failed card: ' + notifications[0].message);
assert.ok(notifications[0].message.includes('error_kind'), 'show lists the per-question answers');

notifications.length = 0;
await commands.get('classify')('schema', ctx);
assert.ok(notifications[0].message.includes('8 questions'), 'schema lists the questions: ' + notifications[0].message.split('\\n')[0]);
assert.ok(notifications[0].message.includes('project_mismatch'), 'schema names the questions');

// --- a resumed session continues the branch numbering, and the sidecar keeps both
// The old behaviour reset the counter on session_start, so the first turn after a
// resume reused turn 1 and overwrote the original card in the sidecar.
await events.get('session_start')({ reason: 'resume' }, ctx);
await events.get('input')({ source: 'interactive', text: 'continue where we left off with this work' }, ctx);
await events.get('agent_end')(
  { messages: [{ role: 'assistant', content: [{ type: 'text', text: 'Continued the work.' }], stopReason: 'stop' }] },
  ctx
);
const resumedCards = appended.filter((entry) => entry.customType === 'pi-turn-classify:card/v1').map((entry) => entry.data);
const lastTurn = resumedCards.at(-1).turn;
assert.ok(lastTurn > 1, 'turn numbers continue after a resume, got ' + lastTurn);
const stored = readFileSync(process.env.FIXTURE_CARDS + '/fixture-session.json', 'utf8');
const storedDoc = JSON.parse(stored);
assert.equal(storedDoc.history.length, resumedCards.length, 'every card has a timeline entry');
assert.equal(new Set(storedDoc.history.map((entry) => entry.at)).size, storedDoc.history.length, 'no timeline entry was overwritten');

// --- /classify off stops classification ---------------------------------
notifications.length = 0;
await commands.get('classify')('off', ctx);
const before = appended.length;
await events.get('input')({ source: 'interactive', text: 'while disabled' }, ctx);
await events.get('agent_end')({ messages: [{ role: 'assistant', content: 'ignored', stopReason: 'stop' }] }, ctx);
assert.equal(appended.length, before, 'no card while disabled');

console.log('turn-classify verified');
`;

	const cwd = path.join(home, "byteowlz", "pi-agent-extensions");
	fs.mkdirSync(cwd, { recursive: true });
	fs.writeFileSync(`${home}/fixture.ts`, script);
	try {
		failuresRemaining = 0;
		// Async spawn, not spawnSync: the decision server lives in THIS process, so
		// blocking the event loop would deadlock the request the child makes.
		const result = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
			const child = spawn(process.execPath, [`${home}/fixture.ts`], {
				env: {
					...process.env,
					HOME: home,
					PI_CODING_AGENT_DIR: path.join(home, "agent"),
					FIXTURE_CWD: cwd,
					FIXTURE_DATASET: datasetPath,
					FIXTURE_CARDS: path.join(home, "cards"),
				},
			});
			let stdout = "";
			let stderr = "";
			child.stdout.on("data", (chunk) => {
				stdout += chunk;
			});
			child.stderr.on("data", (chunk) => {
				stderr += chunk;
			});
			child.on("close", (status) => resolve({ status, stdout, stderr }));
		});

		expect({ status: result.status, error: result.stderr, output: result.stdout }).toEqual({
			status: 0,
			error: "",
			output: "turn-classify verified\n",
		});

		// The failed turn must have sent its verbatim error text and been offered the
		// error taxonomy; a clean turn must not have been asked those questions.
		const failedRequest = received.find((entry) => JSON.stringify(entry.body.state ?? {}).includes("HTTP 502"));
		expect(failedRequest).toBeDefined();
		const failedQuestions = (failedRequest?.body.questions ?? {}) as Record<string, unknown>;
		expect(Object.keys(failedQuestions)).toContain("error_kind");
		expect(Object.keys(failedQuestions)).toContain("error_transient");
		expect(JSON.stringify(failedQuestions.error_kind)).toContain("provider_overloaded");
		const cleanRequest = received.find((entry) => !JSON.stringify(entry.body.state ?? {}).includes("HTTP 502"));
		expect(Object.keys((cleanRequest?.body.questions ?? {}) as Record<string, unknown>)).not.toContain("error_kind");
	} finally {
		fs.rmSync(home, { recursive: true, force: true });
	}
});
