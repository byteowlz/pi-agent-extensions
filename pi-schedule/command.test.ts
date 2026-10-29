import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * `/schedule` end to end in one process:
 *
 *  1. a session-scoped action fires into this session
 *  2. a project-scoped action is stored but dormant with no captain, and says so
 *  3. claiming the project arms it; it then fires
 *  4. losing the claim stops project actions (session actions keep running)
 *  5. pause/resume/list/remove/export behave
 *
 * Timers are driven by a short interval written straight into the store: the
 * 10s floor belongs to the CLI parser, not the runtime.
 */
test("/schedule fires per scope, gated by the captain claim", () => {
	const extensionPath = path.resolve(import.meta.dir, "index.ts");
	const home = fs.mkdtempSync("/tmp/pi-schedule-e2e-");
	const script = `
import extension from ${JSON.stringify(extensionPath)};
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const home = process.env.HOME;
const agentDir = path.join(home, '.pi/agent');
process.env.PI_CODING_AGENT_DIR = agentDir;
const project = path.join(home, 'alpha');
fs.mkdirSync(project, { recursive: true });

const events = new Map();
const commands = new Map();
const notes = [];
const messages = [];
const statuses = [];
let sessionId = 'sess-1';

function makeCtx(overrides = {}) {
  return {
    cwd: project,
    mode: 'tui',
    hasUI: true,
    isIdle: () => true,
    ui: {
      notify: (message, level) => notes.push({ message, level }),
      setStatus: (key, value) => statuses.push({ key, value }),
      select: async () => undefined,
    },
    sessionManager: {
      getSessionId: () => sessionId,
      getSessionName: () => 'alpha',
      getSessionFile: () => '/sessions/alpha.jsonl',
      getBranch: () => [],
      getEntries: () => [],
    },
    ...overrides,
  };
}

extension({
  on: (event, handler) => events.set(event, handler),
  registerCommand: (name, value) => commands.set(name, value.handler),
  registerTool: () => {},
  registerShortcut: () => {},
  appendEntry: () => {},
  sendUserMessage: (text) => messages.push(text),
  events: { on: () => () => {}, emit: () => {} },
});

const schedule = commands.get('schedule');
assert.ok(schedule, 'schedule command registered');
assert.ok(commands.get('schedules'), 'schedules alias registered');

const ctx = makeCtx();
await events.get('session_start')({ reason: 'startup' }, ctx);

const sessionStore = path.join(agentDir, 'schedule', 'sessions', 'sess-1.json');
const projectStore = path.join(agentDir, 'schedule', 'projects', (() => {
  const resolved = path.resolve(project);
  return '--' + resolved.replace(/^\\//, '').replace(/[\\/:]/g, '-') + '--';
})() + '.json');
const shrink = (file) => {
  const store = JSON.parse(fs.readFileSync(file, 'utf8'));
  store.actions[0].intervalMs = 250;
  fs.writeFileSync(file, JSON.stringify(store));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- 1. session scope ----------------------------------------------------
notes.length = 0;
await schedule('hourly "check board"', ctx);
assert.match(notes.at(-1).message, /Scheduled every 1h \\(session scope\\): check board/);
assert.equal(JSON.parse(fs.readFileSync(sessionStore, 'utf8')).actions[0].intervalMs, 3600000);
shrink(sessionStore);
await events.get('session_start')({ reason: 'reload' }, ctx); // re-arm with the short interval
const sessionBefore = messages.length;
await sleep(900);
assert.ok(messages.length > sessionBefore, 'session action fired');
assert.ok(messages.includes('check board'), 'delivered the session action text');

// --- 2. project scope without a captain is dormant -----------------------
notes.length = 0;
await schedule('30m "review intake" --project', ctx);
assert.match(notes.at(-1).message, /Stored project check every 30m: review intake/);
assert.match(notes.at(-1).message, /dormant — no captain claimed for this project/);
assert.equal(messages.filter((m) => m === 'review intake').length, 0, 'dormant action never fires');

// --- 3. claiming arms it -------------------------------------------------
const claimFile = path.join(agentDir, 'captain', '--' + path.resolve(project).replace(/^\\//, '').replace(/[\\/:]/g, '-') + '--.json');
fs.mkdirSync(path.dirname(claimFile), { recursive: true });
fs.writeFileSync(claimFile, JSON.stringify({ version: 1, project, sessionId: 'sess-1' }));
shrink(projectStore);
await events.get('session_start')({ reason: 'reload' }, ctx);
const projectBefore = messages.filter((m) => m === 'review intake').length;
await sleep(900);
assert.ok(
  messages.filter((m) => m === 'review intake').length > projectBefore,
  'project action fires once the session is captain'
);

// --- 4. losing the claim stops project actions ---------------------------
fs.writeFileSync(claimFile, JSON.stringify({ version: 1, project, sessionId: 'sess-other' }));
await sleep(700); // one tick notices the handover and re-arms
const afterHandover = messages.filter((m) => m === 'review intake').length;
await sleep(700);
assert.equal(
  messages.filter((m) => m === 'review intake').length,
  afterHandover,
  'project action stops after handover'
);
const sessionStillFiring = messages.filter((m) => m === 'check board').length;
await sleep(700);
assert.ok(messages.filter((m) => m === 'check board').length > sessionStillFiring, 'session action keeps firing');

// --- 5. pause / resume / list / remove / export --------------------------
notes.length = 0;
await schedule('list', ctx);
assert.match(notes.at(-1).message, /session scope \\(sess-1\\):/);
assert.match(notes.at(-1).message, /project scope \\(alpha\\) — dormant: captain is another session/);

await schedule('pause "check board"'.replace('"check board"', '1'), ctx);
const pausedAt = messages.filter((m) => m === 'check board').length;
await sleep(700);
assert.equal(messages.filter((m) => m === 'check board').length, pausedAt, 'paused session action stops');

await schedule('resume 1', ctx);
const resumedAt = messages.filter((m) => m === 'check board').length;
await sleep(700);
assert.ok(messages.filter((m) => m === 'check board').length > resumedAt, 'resumed action fires again');

notes.length = 0;
await schedule('export', ctx);
const exported = notes.at(-1).message;
assert.ok(exported.includes('skdlr add'), 'export emits skdlr commands');
assert.ok(exported.includes('check-board'), 'export covers the session action');
assert.ok(exported.includes('review-intake'), 'export covers the project action');

await schedule('remove 1', ctx);
assert.equal(JSON.parse(fs.readFileSync(sessionStore, 'utf8')).actions.length, 0, 'removed from the session store');
await schedule('remove 1 --project', ctx);
assert.equal(JSON.parse(fs.readFileSync(projectStore, 'utf8')).actions.length, 0, 'removed from the project store');

// status badge reports armed actions only
assert.ok(statuses.some((entry) => entry.key === 'schedule'), 'publishes a schedule status');

await events.get('session_shutdown')({ reason: 'quit' }, ctx);
console.log('schedule verified');
`;
	fs.writeFileSync(`${home}/fixture.ts`, script);
	try {
		const result = spawnSync(process.execPath, [`${home}/fixture.ts`], {
			env: { ...process.env, HOME: home, PI_CODING_AGENT_DIR: path.join(home, ".pi/agent") },
			encoding: "utf8",
			timeout: 30000,
		});
		expect({ status: result.status, error: result.stderr, output: result.stdout }).toEqual({
			status: 0,
			error: "",
			output: "schedule verified\n",
		});
	} finally {
		fs.rmSync(home, { recursive: true, force: true });
	}
}, 30000);
