import { afterAll, beforeAll, test } from "bun:test";
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
						project_mismatch: { type: "noul", noul: mentionsEavs ? 0.9 : 0.05, confidence: 0.85 },
						activity: { type: "choice", choice: "implement", confidence: 0.92 },
						status: { type: "choice", choice: "implementing", confidence: 0.71 },
						attention: { type: "choice", choice: "review", confidence: 0.63 },
						risk: { type: "score", score: 1.1, legend: { 0: "none", 1: "low" }, confidence: 0.7 },
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
	fs.mkdirSync(path.join(home, "agent"), { recursive: true });
	fs.writeFileSync(
		path.join(home, "agent", "turn-classify.json"),
		JSON.stringify({
			enabled: true,
			endpoint: `http://127.0.0.1:${port}`,
			model: "vllm-sr/d3-lite",
			api: "systemone",
			statusLine: true,
		})
	);

	const script = `
import extension from ${JSON.stringify(extensionPath)};
import assert from 'node:assert/strict';

const events = new Map();
const commands = new Map();
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
  { message: { role: 'assistant', content: [{ type: 'text', text: 'Added the classifier with tests.' }], stopReason: 'end_turn' } },
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
assert.equal(card.answers.status.value, 'implementing');
assert.equal(card.answers.risk.value, 'low');
assert.equal(card.answers.project_mismatch.value, 'no');
assert.ok(card.line.length > 0, 'line is rendered');
assert.ok(card.line.startsWith('pi-agent-extensions · implement'), 'line starts with project and activity: ' + card.line);
assert.ok(card.line.includes('needs review'), 'attention shows: ' + card.line);
assert.equal(statuses.at(-1).key, 'turn');
assert.equal(statuses.at(-1).value, card.line);

// --- a turn whose work belongs to another project ------------------------
await events.get('input')({ source: 'interactive', text: 'fix the eavs gateway routing bug' }, ctx);
await events.get('agent_end')(
  { message: { role: 'assistant', content: [{ type: 'text', text: 'Fixed it in the eavs repo.' }], stopReason: 'end_turn' } },
  ctx
);
assert.equal(appended.length, 2, 'second card stored');
const second = appended[1].data;
assert.equal(second.turn, 2);
assert.equal(second.answers.project.value, 'eavs');
assert.equal(second.answers.project_mismatch.value, 'yes');
assert.ok(second.line.includes('(cwd differs)'), 'mismatch is visible: ' + second.line);

// --- the server failing must not break the turn --------------------------
await events.get('input')({ source: 'interactive', text: 'one more thing' }, ctx);
await events.get('agent_end')({ message: { role: 'assistant', content: 'done', stopReason: 'end_turn' } }, ctx);
assert.ok(
  notifications.some((n) => n.level === 'warning' && /turn-classify/.test(n.message)),
  'failure is reported as a warning'
);

// --- /classify show and schema ------------------------------------------
notifications.length = 0;
await commands.get('classify')('show', ctx);
assert.ok(notifications[0].message.includes('pi-agent-extensions · implement'), 'show prints the card');

notifications.length = 0;
await commands.get('classify')('schema', ctx);
assert.ok(notifications[0].message.includes('7 questions'), 'schema lists the questions: ' + notifications[0].message.split('\\n')[0]);
assert.ok(notifications[0].message.includes('project_mismatch'), 'schema names the questions');

// --- /classify off stops classification ---------------------------------
notifications.length = 0;
await commands.get('classify')('off', ctx);
const before = appended.length;
await events.get('input')({ source: 'interactive', text: 'while disabled' }, ctx);
await events.get('agent_end')({ message: { role: 'assistant', content: 'ignored', stopReason: 'end_turn' } }, ctx);
assert.equal(appended.length, before, 'no card while disabled');

console.log('turn-classify verified');
`;

	const cwd = path.join(home, "byteowlz", "pi-agent-extensions");
	fs.mkdirSync(cwd, { recursive: true });
	fs.writeFileSync(`${home}/fixture.ts`, script);
	try {
		// Fail the first classification attempt so the warning path is exercised
		// on the third turn; server returns 503 exactly once.
		failuresRemaining = 1;
		// Async spawn, not spawnSync: the decision server lives in THIS process, so
		// blocking the event loop would deadlock the request the child makes.
		const _result = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
			const child = spawn(process.execPath, [`${home}/fixture.ts`], {
				env: { ...process.env, HOME: home, PI_CODING_AGENT_DIR: path.join(home, "agent"), FIXTURE_CWD: cwd },
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
	} finally {
		fs.rmSync(home, { recursive: true, force: true });
	}
});
