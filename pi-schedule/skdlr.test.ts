import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * skdlr integration end to end, with a fake `skdlr` on PATH and the REAL
 * deliverer script:
 *
 *  1. the inbox socket receives a delivery and it reaches the session
 *  2. the generated deliverer script delivers into the live socket (exit 0)
 *  3. with no live session it fails (exit 1), and with --queue it parks the text
 *  4. a queued delivery is drained on the next start and labelled with its age
 *  5. `/schedule link` creates the skdlr schedule, turns the local timer off,
 *     and `/schedule unlink` removes it and turns the timer back on
 */
test("skdlr delivers into the live session through the inbox", () => {
	const extensionPath = path.resolve(import.meta.dir, "index.ts");
	const home = fs.mkdtempSync("/tmp/pi-schedule-skdlr-");
	const bin = path.join(home, "bin");
	fs.mkdirSync(bin);
	const calls = path.join(home, "skdlr-calls.log");
	// Fake skdlr with state, so `list` reflects add/remove like the real CLI.
	const state = path.join(home, "skdlr-state.txt");
	fs.writeFileSync(
		path.join(bin, "skdlr"),
		`#!/bin/sh
printf '%s\\n' "$*" >> '${calls}'
STATE='${state}'
case "$1" in
  list)
    printf 'NAME                 STATUS     TYPE   SCHEDULE                 COMMAND\\n'
    if [ -f "$STATE" ]; then
      while IFS='|' read -r name sched; do
        [ -n "$name" ] && printf '%s enabled cron %s node deliver.mjs\\n' "$name" "$sched"
      done < "$STATE"
    fi
    printf 'other-thing enabled cron 0 * * * *  true\\n'
    ;;
  add) printf '%s|%s\\n' "$2" "$4" >> "$STATE"; printf 'Created recurring schedule\\n' ;;
  remove) grep -v "^$2|" "$STATE" > "$STATE.tmp" 2>/dev/null; mv "$STATE.tmp" "$STATE" 2>/dev/null; printf 'Removed schedule\\n' ;;
  *) printf 'ok\\n' ;;
esac
`,
		{ mode: 0o700 }
	);

	const script = `
import extension from ${JSON.stringify(extensionPath)};
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const home = process.env.HOME;
const agentDir = path.join(home, '.pi/agent');
process.env.PI_CODING_AGENT_DIR = agentDir;
const project = path.join(home, 'alpha');
fs.mkdirSync(project, { recursive: true });

const events = new Map();
const commands = new Map();
const notes = [];
const messages = [];
const sessionId = 'sess-live';

const ctx = () => ({
  cwd: project,
  mode: 'tui',
  hasUI: true,
  isIdle: () => true,
  ui: { notify: (message) => notes.push(message), setStatus: () => {}, select: async () => undefined },
  sessionManager: { getSessionId: () => sessionId, getBranch: () => [], getEntries: () => [] },
});

extension({
  on: (event, handler) => events.set(event, handler),
  registerCommand: (name, value) => commands.set(name, value.handler),
  registerTool: () => {}, registerShortcut: () => {}, appendEntry: () => {},
  sendUserMessage: (text) => messages.push(text),
  events: { on: () => () => {}, emit: () => {} },
});

const schedule = commands.get('schedule');
const c = ctx();
await events.get('session_start')({ reason: 'startup' }, c);

const socket = path.join(agentDir, 'schedule', 'inbox', sessionId + '.sock');
const deliverer = path.join(agentDir, 'schedule', 'bin', 'deliver.mjs');
assert.equal(fs.existsSync(deliverer), true, 'deliverer script written at startup');
assert.equal(fs.statSync(path.dirname(socket)).mode & 0o777, 0o700, 'inbox dir is private');
assert.equal(fs.statSync(socket).isSocket(), true, 'inbox socket exists');

// --- 1. raw delivery over the socket -------------------------------------
const raw = await new Promise((resolve, reject) => {
  const c2 = net.connect(socket); c2.once('error', reject);
  c2.once('connect', () => c2.write(JSON.stringify({ text: 'check the board', source: 'test' }) + '\\n'));
  c2.once('data', (d) => { resolve(JSON.parse(String(d).split('\\n')[0])); c2.destroy(); });
});
assert.deepEqual(raw, { ok: true });
assert.ok(messages.includes('check the board'), 'socket delivery reached the session');

// a malformed payload is rejected, not delivered
const bad = await new Promise((resolve, reject) => {
  const c3 = net.connect(socket); c3.once('error', reject);
  c3.once('connect', () => c3.write('{not json}\\n'));
  c3.once('data', (d) => { resolve(JSON.parse(String(d).split('\\n')[0])); c3.destroy(); });
});
assert.equal(bad.ok, false);

// --- 2. the real deliverer script delivers -------------------------------
// async: the parent hosts the socket and must stay free to accept it
const out = await run(process.execPath, [deliverer, '--session', sessionId, '--text', 'from skdlr']);
assert.match(String(out.stdout).trim(), /delivered/);
assert.ok(messages.includes('from skdlr'), 'deliverer delivered into the live session');

// --- 3. no live session: fail, or queue with --queue ---------------------
await events.get('session_shutdown')({ reason: 'quit' }, c);
const closed = await run(process.execPath, [deliverer, '--session', sessionId, '--text', 'missed check']).catch((e) => e);
assert.equal(closed.code, 1, 'deliverer fails when the session is gone');
assert.equal(fs.existsSync(path.join(agentDir, 'schedule', 'queue', sessionId + '.jsonl')), false, 'no queue without --queue');

await run(process.execPath, [deliverer, '--session', sessionId, '--text', 'queued check', '--queue']);
const queueFile = path.join(agentDir, 'schedule', 'queue', sessionId + '.jsonl');
assert.equal(fs.existsSync(queueFile), true, '--queue parks the delivery');
// backdate it so the age label is exercised
const queued = JSON.parse(fs.readFileSync(queueFile, 'utf8').trim());
queued.at = new Date(Date.now() - 5 * 60_000).toISOString();
fs.writeFileSync(queueFile, JSON.stringify(queued) + '\\n');

// --- 4. next start drains the queue with an age label --------------------
messages.length = 0;
const c4 = ctx();
await events.get('session_start')({ reason: 'resume' }, c4);
assert.ok(messages.some((m) => m.includes('queued check')), 'queued delivery was drained');
assert.ok(messages.some((m) => m.startsWith('[scheduled 5m ago]')), 'drained delivery is labelled with its age');
assert.equal(fs.existsSync(queueFile), false, 'queue is cleared after draining');

// --- 5. link / unlink with skdlr -----------------------------------------
await schedule('hourly "check board"', c4);
assert.match(notes.at(-1), /Scheduled every 1h/);

notes.length = 0;
await schedule('link 1 --schedule "0 9 * * 1-5" --queue', c4);
const linkedMessage = notes.at(-1);
assert.match(linkedMessage, /Linked "check board" to skdlr/);
assert.match(linkedMessage, /pi-sched-session-alpha-check-board/);
assert.match(linkedMessage, /cannot fire twice/);

const storeFile = path.join(agentDir, 'schedule', 'sessions', sessionId + '.json');
const linked = JSON.parse(fs.readFileSync(storeFile, 'utf8')).actions[0];
assert.equal(linked.delivery, 'skdlr');
assert.equal(linked.skdlr.name, 'pi-sched-session-alpha-check-board');
assert.equal(linked.skdlr.schedule, '0 9 * * 1-5');

// the skdlr command must call the deliverer with absolute paths and --queue
const skdlrCalls = fs.readFileSync(path.join(home, 'skdlr-calls.log'), 'utf8');
assert.ok(skdlrCalls.includes('add pi-sched-session-alpha-check-board'), 'skdlr add was invoked');
assert.ok(skdlrCalls.includes('--schedule 0 9 * * 1-5'), 'cron expression passed through');
assert.ok(skdlrCalls.includes('deliver.mjs'), 'command uses the deliverer');
assert.ok(skdlrCalls.includes("--session 'sess-live'"), 'command targets this session');
assert.ok(skdlrCalls.includes('--queue'), 'queue flag propagated');
assert.ok(skdlrCalls.includes('--agent-dir'), 'agent dir is baked in (systemd has no PI_CODING_AGENT_DIR)');
assert.ok(skdlrCalls.includes('/alpha'), 'workdir is the project');

// a linked action never fires on its own timer
const beforeLinked = messages.length;
await new Promise((r) => setTimeout(r, 1200));
assert.equal(messages.length, beforeLinked, 'linked action does not use the in-session timer');

// listing shows skdlr as the timing authority
notes.length = 0;
await schedule('list', c4);
assert.match(notes.at(-1), /skdlr 0 9 \\* \\* 1-5/);

notes.length = 0;
await schedule('skdlr', c4);
assert.ok(notes.at(-1).includes("linked actions (session scope):"), "skdlr view lists linked actions");
assert.ok(notes.at(-1).includes("pi-sched-session-alpha-check-board"), "skdlr view names the schedule");
assert.match(notes.at(-1), /pi-sched-session-alpha-check-board/);

notes.length = 0;
await schedule('unlink 1', c4);
assert.match(notes.at(-1), /Unlinked pi-sched-session-alpha-check-board/);
const unlinked = JSON.parse(fs.readFileSync(storeFile, 'utf8')).actions[0];
assert.equal(unlinked.delivery, 'session');
assert.equal(unlinked.skdlr, undefined);
const afterCalls = fs.readFileSync(path.join(home, 'skdlr-calls.log'), 'utf8');
assert.ok(afterCalls.includes('remove pi-sched-session-alpha-check-board --yes'), 'skdlr remove --yes was invoked');
assert.equal(fs.readFileSync(path.join(home, 'skdlr-state.txt'), 'utf8').includes('pi-sched-session-alpha-check-board'), false, 'skdlr no longer lists it');

await events.get('session_shutdown')({ reason: 'quit' }, c4);
assert.equal(fs.existsSync(socket), false, 'inbox socket is removed on shutdown');
console.log('skdlr integration verified');
`;
	fs.writeFileSync(`${home}/fixture.ts`, script);
	try {
		const result = spawnSync(process.execPath, [`${home}/fixture.ts`], {
			env: {
				...process.env,
				HOME: home,
				PI_CODING_AGENT_DIR: path.join(home, ".pi/agent"),
				PATH: `${bin}:${process.env.PATH}`,
			},
			encoding: "utf8",
			timeout: 40000,
		});
		expect({ status: result.status, error: result.stderr, output: result.stdout }).toEqual({
			status: 0,
			error: "",
			output: "skdlr integration verified\n",
		});
	} finally {
		fs.rmSync(home, { recursive: true, force: true });
	}
}, 40000);
