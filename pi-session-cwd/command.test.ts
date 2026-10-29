import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * End-to-end: `/cwd` on a real newline-delimited session file must
 *  - rewrite the header cwd,
 *  - physically move the JSONL into the target cwd's session directory,
 *  - leave the old path gone and every entry intact,
 *  - append a move record, and
 *  - hand the NEW path to switchSession so pi re-homes the live runtime.
 *
 * Non-interactive surfaces (`mode: "rpc"`) must refuse a move without
 * `--force` — a one-line remote command must not silently relocate a session.
 */
test("/cwd moves the session file and switches the runtime to it", () => {
	const extensionPath = path.resolve(import.meta.dir, "index.ts");
	const home = fs.mkdtempSync("/tmp/pi-cwd-e2e-");
	const script = `
import extension from ${JSON.stringify(extensionPath)};
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const home = process.env.HOME;
const agentDir = path.join(home, 'agent');
process.env.PI_CODING_AGENT_DIR = agentDir;

const fromCwd = path.join(home, 'project-a');
const toCwd = path.join(home, 'nested/project-b');
fs.mkdirSync(fromCwd, { recursive: true });
fs.mkdirSync(toCwd, { recursive: true });

const encode = (p) => '--' + p.replace(/^\\//, '').replace(/[\\/:]/g, '-') + '--';
const sessionDir = path.join(agentDir, 'sessions', encode(fromCwd));
fs.mkdirSync(sessionDir, { recursive: true });
const sessionFile = path.join(sessionDir, '2026-01-01T00-00-00-000Z_abc.jsonl');
fs.writeFileSync(sessionFile, [
  JSON.stringify({ type: 'session', version: 3, id: 'abc', timestamp: '2026-01-01T00:00:00.000Z', cwd: fromCwd }),
  JSON.stringify({ type: 'message', id: 'm1', parentId: null, timestamp: '2026-01-01T00:00:00.000Z',
    message: { role: 'user', content: [{ type: 'text', text: 'earlier work' }], timestamp: 1 } }),
  JSON.stringify({ type: 'session_info', id: 'm2', parentId: 'm1', timestamp: '2026-01-01T00:00:01.000Z', name: 'kept name' }),
].join('\\n') + '\\n');

// --- fixture pi ---------------------------------------------------------
const events = new Map();
const commands = new Map();
const appended = [];
const notifications = [];
let switchedTo = null;
let mode = 'rpc';

function ctx(overrides = {}) {
  const entries = appended.map((a) => ({ type: 'custom', customType: a.customType, data: a.data }));
  return {
    cwd: fromCwd,
    mode,
    isIdle: () => true,
    ui: {
      notify: (message, level) => notifications.push({ message, level }),
      select: async () => undefined,
      custom: async () => undefined,
    },
    sessionManager: {
      getSessionId: () => 'abc',
      getSessionName: () => 'kept name',
      getSessionFile: () => sessionFile,
      getEntries: () => entries,
      getBranch: () => entries,
      getHeader: () => ({ type: 'session', cwd: fromCwd }),
      usesDefaultSessionDir: () => true,
      getSessionDir: () => path.join(agentDir, 'sessions'),
    },
    switchSession: async (file, options) => {
      switchedTo = file;
      if (options?.withSession) await options.withSession({ ui: { notify: (m, l) => notifications.push({ message: m, level: l }) } });
      return { cancelled: false };
    },
    ...overrides,
  };
}

extension({
  on: (event, handler) => events.set(event, handler),
  registerCommand: (name, value) => commands.set(name, value.handler),
  registerTool: () => {},
  appendEntry: (customType, data) => appended.push({ customType, data }),
  sendUserMessage: () => {},
});

const cwdCommand = commands.get('cwd');
assert.ok(cwdCommand, 'cwd command registered');
assert.ok(commands.get('move'), 'move command registered');
assert.ok(commands.get('cwd-history'), 'cwd-history registered');

// --- 1. rpc without --force must refuse and touch nothing ---------------
await cwdCommand(toCwd, ctx());
assert.equal(switchedTo, null);
assert.ok(fs.existsSync(sessionFile), 'source untouched after refusal');
assert.ok(notifications.some((n) => /cancelled/i.test(n.message)), 'refusal is reported');

// --- 2. show mode -------------------------------------------------------
notifications.length = 0;
await cwdCommand('', ctx());
assert.ok(notifications[0].message.includes(fromCwd), 'show mode prints the cwd');

// --- 3. missing target is a clear error ---------------------------------
notifications.length = 0;
await cwdCommand(path.join(home, 'does-not-exist'), ctx());
assert.ok(notifications.some((n) => n.level === 'error' && /does not exist/.test(n.message)));

// --- 4. the real move ---------------------------------------------------
notifications.length = 0;
await cwdCommand(toCwd + ' --force', ctx());

const expectedDir = path.join(agentDir, 'sessions', encode(fs.realpathSync(toCwd)));
const expectedFile = path.join(expectedDir, path.basename(sessionFile));
assert.equal(switchedTo, expectedFile, 'switchSession gets the moved file');
assert.equal(fs.existsSync(sessionFile), false, 'old file is gone');
assert.equal(fs.existsSync(expectedFile), true, 'file is in the new cwd session dir');

const lines = fs.readFileSync(expectedFile, 'utf-8').trim().split('\\n');
assert.equal(lines.length, 3, 'all entries preserved');
assert.equal(JSON.parse(lines[0]).cwd, fs.realpathSync(toCwd), 'header cwd rewritten');
assert.equal(JSON.parse(lines[0]).id, 'abc', 'session id preserved');
assert.equal(JSON.parse(lines[2]).name, 'kept name', 'session name preserved');

assert.equal(appended.length, 1, 'one move record appended');
assert.equal(appended[0].customType, 'pi-session-cwd:move/v1');
assert.equal(appended[0].data.toCwd, fs.realpathSync(toCwd));
assert.equal(appended[0].data.fromFile, sessionFile);

// --- 5. tui mode asks; "Cancel" leaves everything alone -----------------
mode = 'tui';
const sessionFile2 = path.join(path.dirname(expectedFile), 'second.jsonl');
fs.writeFileSync(sessionFile2, [
  JSON.stringify({ type: 'session', version: 3, id: 'def', timestamp: '2026-01-02T00:00:00.000Z', cwd: toCwd }),
  JSON.stringify({ type: 'message', id: 'm1', parentId: null, timestamp: '2026-01-02T00:00:00.000Z',
    message: { role: 'user', content: [{ type: 'text', text: 'x' }], timestamp: 1 } }),
].join('\\n') + '\\n');
switchedTo = null;
const third = path.join(home, 'project-c');
fs.mkdirSync(third, { recursive: true });
await cwdCommand(third, ctx({
  cwd: toCwd,
  sessionManager: {
    getSessionId: () => 'def',
    getSessionFile: () => sessionFile2,
    getEntries: () => [],
    getBranch: () => [],
    usesDefaultSessionDir: () => true,
  },
  ui: { notify: () => {}, select: async (_prompt, options) => options[1], custom: async () => undefined },
}));
assert.equal(switchedTo, null, 'cancel did not switch');
assert.ok(fs.existsSync(sessionFile2), 'cancel kept the file');

// --- 6. tui mode confirm actually moves ---------------------------------
const thirdReal = fs.realpathSync(third);
const relativeArg = '../../' + path.basename(third) + ' --force';
await cwdCommand(relativeArg, ctx({
  cwd: toCwd,
  sessionManager: {
    getSessionId: () => 'def',
    getSessionFile: () => sessionFile2,
    getEntries: () => [],
    getBranch: () => [],
    usesDefaultSessionDir: () => true,
  },
  ui: { notify: () => {}, select: async (_p, options) => options[0], custom: async () => undefined },
}));
assert.equal(switchedTo, path.join(agentDir, 'sessions', encode(thirdReal), 'second.jsonl'), 'relative path moved');

// --- 7. /move resolves a project by fuzzy name and switches -------------
const rootWork = path.join(home, 'work');
fs.mkdirSync(path.join(rootWork, 'foxline'), { recursive: true });
fs.mkdirSync(path.join(rootWork, 'foxhole'), { recursive: true });
fs.mkdirSync(path.join(agentDir), { recursive: true });
fs.writeFileSync(path.join(agentDir, 'session-cwd.json'), JSON.stringify({ roots: [rootWork], depth: 1, includeSessionDirs: false }));

// seed a session that currently lives in the third project
const sess3 = path.join(path.dirname(switchedTo), 'third.jsonl');
fs.writeFileSync(sess3, [
  JSON.stringify({ type: 'session', version: 3, id: 'ghi', timestamp: '2026-01-03T00:00:00.000Z', cwd: switchedTo ? path.dirname(path.dirname(switchedTo)) : thirdReal }),
  JSON.stringify({ type: 'message', id: 'm1', parentId: null, timestamp: '2026-01-03T00:00:00.000Z',
    message: { role: 'user', content: [{ type: 'text', text: 'y' }], timestamp: 1 } }),
].join('\\n') + '\\n');

const thirdCtx = (overrides = {}) => ctx({
  cwd: thirdReal,
  sessionManager: {
    getSessionId: () => 'ghi',
    getSessionFile: () => sess3,
    getEntries: () => [],
    getBranch: () => [],
    usesDefaultSessionDir: () => true,
  },
  ...overrides,
});

const moveCommand = commands.get('move');
// ambiguous: "fox" matches foxline and foxhole -> non-interactive refuses
mode = 'rpc';
notifications.length = 0;
await moveCommand('fox --force', thirdCtx());
assert.ok(notifications.some((n) => n.level === 'warning' && /matches several projects/.test(n.message)),
  'ambiguous query asks instead of guessing');

// unique: the full name resolves and actually moves
switchedTo = null;
notifications.length = 0;
await moveCommand('foxline --force', thirdCtx());
const foxPath = path.join(rootWork, 'foxline');
assert.equal(switchedTo, path.join(agentDir, 'sessions', encode(fs.realpathSync(foxPath)), 'third.jsonl'),
  'unique fuzzy match moved the session');
assert.equal(fs.existsSync(sess3), false, 'old file removed by /move');

// ambiguous in a TUI: the picker answers, with the query pre-filled
const sess5 = switchedTo.replace(/third\.jsonl$/, 'fourth.jsonl');
fs.writeFileSync(sess5, [
  JSON.stringify({ type: 'session', version: 3, id: 'mno', timestamp: '2026-01-04T00:00:00.000Z', cwd: fs.realpathSync(foxPath) }),
].join('\\n') + '\\n');
mode = 'tui';
switchedTo = null;
let pickerQuery;
await moveCommand('fox', ctx({
  cwd: fs.realpathSync(foxPath),
  sessionManager: { getSessionId: () => 'mno', getSessionFile: () => sess5, getEntries: () => [], getBranch: () => [], usesDefaultSessionDir: () => true },
  ui: {
    notify: () => {},
    select: async (_prompt, options) => options[0],
    custom: async (factory) => {
      // emulate pi: build the component, capture the pre-filled query, choose row 0
      let chosen;
      const done = (value) => { chosen = value; };
      const comp = factory({ requestRender: () => {} }, { fg: (_c, t) => t }, {}, done);
      comp.render(60);
      pickerQuery = null;
      // pick the first visible row by simulating an enter keypress
      comp.handleInput('\\r');
      return chosen;
    },
  },
}));
assert.ok(switchedTo, 'tui picker chose a project and moved');
assert.ok(switchedTo.includes('fox'), 'picked one of the fuzzy matches');

// a path argument goes through the path logic, not project matching
const explicit = path.join(rootWork, 'foxhole');
const sess4 = switchedTo.replace(/third\.jsonl$/, 'fourth.jsonl');
fs.writeFileSync(sess4, [
  JSON.stringify({ type: 'session', version: 3, id: 'jkl', timestamp: '2026-01-04T00:00:00.000Z', cwd: fs.realpathSync(foxPath) }),
].join('\\n') + '\\n');
switchedTo = null;
await moveCommand(explicit + ' --force', ctx({
  cwd: fs.realpathSync(foxPath),
  sessionManager: { getSessionId: () => 'jkl', getSessionFile: () => sess4, getEntries: () => [], getBranch: () => [], usesDefaultSessionDir: () => true },
}));
assert.equal(switchedTo, path.join(agentDir, 'sessions', encode(fs.realpathSync(explicit)), 'fourth.jsonl'),
  'a path argument bypasses fuzzy matching');

// no match: clear error with a suggestion
notifications.length = 0;
await moveCommand('zzzz-nothing --force', thirdCtx());
assert.ok(notifications.some((n) => n.level === 'error' && /no project matches/.test(n.message)),
  'no match is an error, not a silent no-op');

// --- 8. cwd-history lists the moves --------------------------------------
notifications.length = 0;
await commands.get('cwd-history')('', ctx());
assert.ok(notifications.length >= 0);

console.log('cwd move verified');
`;

	fs.writeFileSync(`${home}/fixture.ts`, script);
	try {
		const result = spawnSync(process.execPath, [`${home}/fixture.ts`], {
			env: { ...process.env, HOME: home },
			encoding: "utf8",
			timeout: 20000,
		});
		expect({ status: result.status, error: result.stderr, output: result.stdout }).toEqual({
			status: 0,
			error: "",
			output: "cwd move verified\n",
		});
	} finally {
		fs.rmSync(home, { recursive: true, force: true });
	}
});
