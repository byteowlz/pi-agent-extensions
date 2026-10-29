import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * `/captain` end to end with a fake herdr binary and two simulated sessions in
 * the same project directory:
 *
 *  1. status with no claim
 *  2. claim advertises itself (claim file + branch entry + pane rename) and is live
 *  3. a second session in the same project sees the captain and does not steal it
 *  4. route delivers through `herdr agent prompt <pane>`
 *  5. a claim whose pane died reads stale and route refuses
 *  6. only the owning session can release; release renames the pane back
 */
test("/captain claims, discovers, routes and releases per project", () => {
	const extensionPath = path.resolve(import.meta.dir, "index.ts");
	const home = fs.mkdtempSync("/tmp/pi-captain-e2e-");
	const bin = path.join(home, "bin");
	fs.mkdirSync(bin);
	const callsFile = path.join(home, "herdr-calls.log");
	// Fake herdr: records argv, answers agent list with two panes in one project
	// plus one elsewhere, and pane get for identity validation.
	fs.writeFileSync(
		path.join(bin, "herdr"),
		`#!/bin/sh
printf '%s\\n' "$*" >> '${callsFile}'
case "$1 $2" in
  "agent list")
    printf '%s\\n' '{"result":{"agents":[{"pane_id":"w1:p1","cwd":"/work/alpha","terminal_title_stripped":"alpha main","agent_status":"working"},{"pane_id":"w1:p2","cwd":"/work/alpha","terminal_title_stripped":"alpha side"},{"pane_id":"w1:p9","cwd":"/work/beta","terminal_title_stripped":"beta"}]}}'
    ;;
  "pane get")
    printf '%s\\n' '{"result":{"pane":{"pane_id":"w1:p1","workspace_id":"w1","cwd":"/work/alpha"}}}'
    ;;
  *)
    printf '%s\\n' '{"result":{"ok":true}}'
    ;;
esac
`,
		{ mode: 0o700 }
	);

	const script = `
import extension from ${JSON.stringify(extensionPath)};
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const home = process.env.HOME;
const events = new Map();
const commands = new Map();
const notes = [];
const entries = [];
const messages = [];

function makeCtx(overrides = {}) {
  return {
    cwd: '/work/alpha',
    mode: 'tui',
    isIdle: () => true,
    ui: { notify: (message, level) => notes.push({ message, level }), select: async () => undefined },
    sessionManager: {
      getSessionId: () => 'sess-captain',
      getSessionName: () => 'alpha-main',
      getSessionFile: () => '/sessions/alpha-main.jsonl',
      getBranch: () => entries.slice(),
      getEntries: () => entries.slice(),
      getHeader: () => ({ type: 'session', cwd: '/work/alpha' }),
    },
    ...overrides,
  };
}

extension({
  on: (event, handler) => events.set(event, handler),
  registerCommand: (name, value) => commands.set(name, value.handler),
  registerTool: () => {},
  registerShortcut: () => {},
  appendEntry: (customType, data) => entries.push({ type: 'custom', customType, data }),
  sendUserMessage: (text) => messages.push({ text }),
  events: { on: () => () => {}, emit: () => {} },
  sendMessage: () => {},
});

const captain = commands.get('captain');
assert.ok(captain, 'captain command registered');

const claimPath = path.join(home, '.pi/agent/captain', '--work-alpha--.json');

// --- 1. no claim yet -----------------------------------------------------
notes.length = 0;
await captain('', makeCtx());
assert.match(notes.at(-1).message, /captain: none claimed/);
assert.equal(fs.existsSync(claimPath), false);

// --- 2. claim -------------------------------------------------------------
notes.length = 0;
await captain('claim recon', makeCtx());
const claim = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
assert.equal(claim.sessionId, 'sess-captain');
assert.equal(claim.project, '/work/alpha');
assert.equal(claim.paneId, 'w1:p1');
assert.equal(claim.label, 'recon');
assert.match(notes.at(-1).message, /You are the captain for \\/work\\/alpha/);
assert.equal(entries.length, 1);
assert.equal(entries[0].customType, 'pi-session-tools:captain/v1');
// pane renamed for visibility (fire-and-forget)
await new Promise((r) => setTimeout(r, 300));
const calls = fs.readFileSync(path.join(home, 'herdr-calls.log'), 'utf8');
assert.match(calls, /pane rename w1:p1/);

// --- 3. live status + other sessions in the same project ------------------
notes.length = 0;
await captain('', makeCtx());
const status = notes.at(-1).message;
assert.match(status, /captain: recon \\(this session\\) — live/);
assert.match(status, /w1:p2  alpha side/);
assert.ok(!status.includes('w1:p9'), 'other project session must not appear');

// a second session in the same project sees the captain, cannot release it
const other = makeCtx({
  sessionManager: {
    getSessionId: () => 'sess-other',
    getSessionName: () => 'alpha-side',
    getSessionFile: () => '/sessions/alpha-side.jsonl',
    getBranch: () => [],
    getEntries: () => [],
    getHeader: () => ({ type: 'session', cwd: '/work/alpha' }),
  },
});
notes.length = 0;
await captain('release', other);
assert.match(notes.at(-1).message, /only it can release/);
assert.equal(fs.existsSync(claimPath), true, 'claim survives a foreign release attempt');

// --- 4. route to the captain ---------------------------------------------
notes.length = 0;
await captain('route please review the intake queue', makeCtx());
assert.match(notes.at(-1).message, /Routed to captain in w1:p1/);
const routed = fs.readFileSync(path.join(home, 'herdr-calls.log'), 'utf8');
assert.match(routed, /agent prompt w1:p1 please review the intake queue/);

// --- 5. a dead captain pane reads stale and refuses routing ---------------
const dead = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
dead.paneId = 'w1:gone';
fs.writeFileSync(claimPath, JSON.stringify(dead));
notes.length = 0;
await captain('route work for the dead captain', makeCtx());
assert.match(notes.at(-1).message, /stale .*pane w1:gone is gone/);
notes.length = 0;
await captain('', makeCtx());
assert.match(notes.at(-1).message, /captain: recon \\(this session\\) — stale/);

// --- 6. owner releases ----------------------------------------------------
fs.writeFileSync(claimPath, JSON.stringify({ ...dead, paneId: 'w1:p1' }));
notes.length = 0;
await captain('release', makeCtx());
assert.match(notes.at(-1).message, /Released captain/);
assert.equal(fs.existsSync(claimPath), false);
await new Promise((r) => setTimeout(r, 300));
const finalCalls = fs.readFileSync(path.join(home, 'herdr-calls.log'), 'utf8');
assert.match(finalCalls, /pane rename w1:p1 \\n/);

// --- 7. scheduled actions: claim, schedule, fire, pause ----------------
notes.length = 0;
await captain('claim recon', makeCtx());
notes.length = 0;
await captain('schedule 10s "check board again"', makeCtx());
assert.match(notes.at(-1).message, /Scheduled every 10s: check board again/);
const storePath = path.join(home, '.pi/agent/captain', '--work-alpha--.actions.json');
const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
assert.equal(store.actions.length, 1);
assert.equal(store.actions[0].id, 'check-board-again');
assert.equal(store.actions[0].intervalMs, 10000);

notes.length = 0;
await captain('actions', makeCtx());
assert.ok(notes.at(-1).message.includes("1. [10s] check board again"), 'listing shows the action');

// Drive the timer with a short interval written straight into the store: the
// 10s floor is a CLI guard (parseInterval), the runtime honours the store.
store.actions[0].intervalMs = 250;
fs.writeFileSync(storePath, JSON.stringify(store));
await captain('claim recon', makeCtx()); // re-arm with the new interval

const before = messages.length;
await new Promise((r) => setTimeout(r, 900));
assert.ok(messages.length > before, 'scheduled action delivered a prompt');
assert.ok(messages.some((m) => m.text === 'check board again'), 'delivered the action text');
assert.ok(JSON.parse(fs.readFileSync(storePath, 'utf8')).actions[0].lastRunAt, 'run recorded');

// pause stops it
await captain('pause', makeCtx());
const pausedCount = messages.length;
await new Promise((r) => setTimeout(r, 700));
assert.equal(messages.length, pausedCount, 'paused action does not fire');

// resume fires again; handover then disarms this session
await captain('resume', makeCtx());
const resumedFrom = messages.length;
await new Promise((r) => setTimeout(r, 700));
assert.ok(messages.length > resumedFrom, 'resumed action fires again');

const claimNow = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
fs.writeFileSync(claimPath, JSON.stringify({ ...claimNow, sessionId: 'sess-other' }));
await new Promise((r) => setTimeout(r, 600));
const handedOver = messages.length;
await new Promise((r) => setTimeout(r, 700));
assert.equal(messages.length, handedOver, 'former captain stops firing after handover');

// unschedule removes it
await captain('unschedule 1', makeCtx());
assert.equal(JSON.parse(fs.readFileSync(storePath, 'utf8')).actions.length, 0);

// export offers the headless skdlr equivalent instead of silently replacing it
await captain('schedule hourly "check board"', makeCtx());
notes.length = 0;
await captain('export', makeCtx());
const exportText = notes.at(-1).message;
assert.ok(exportText.includes("skdlr add"), 'export emits a skdlr command');
assert.ok(exportText.includes("--schedule '1h'"), 'export carries the interval');
assert.ok(exportText.includes("--workdir '/work/alpha'"), 'export carries the project dir');
assert.ok(exportText.includes('cannot share this session'), 'export warns about state');

console.log('captain verified');
`;
	fs.writeFileSync(`${home}/fixture.ts`, script);
	try {
		const result = spawnSync(process.execPath, [`${home}/fixture.ts`], {
			env: {
				...process.env,
				HOME: home,
				PATH: `${bin}:${process.env.PATH}`,
				HERDR_ENV: "1",
				HERDR_SOCKET_PATH: path.join(home, "fake.sock"),
				HERDR_PANE_ID: "w1:p1",
			},
			encoding: "utf8",
			timeout: 30000,
		});
		expect({ status: result.status, error: result.stderr, output: result.stdout }).toEqual({
			status: 0,
			error: "",
			output: "captain verified\n",
		});
	} finally {
		fs.rmSync(home, { recursive: true, force: true });
	}
}, 30000);
