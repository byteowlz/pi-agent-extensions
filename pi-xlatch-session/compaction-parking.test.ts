import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Shares that arrive while pi core is compacting its context must not bounce:
 * session.prompt() throws "Cannot submit a prompt while compaction is in
 * progress." and before this fix the share was lost with a raw runtime error.
 *
 * Park-then-flush contract proven end to end over the real slot socket:
 *  1. A share during compaction is acked ok immediately (delivery: "parked"),
 *     not an error, and pi.prompt is NOT called yet.
 *  2. session_compact flushes parked content in order.
 *  3. session_compact_failed (aborted compaction) flushes too.
 *  4. A compaction refusal that slips past the flag (compaction started
 *     without a seen before_compact) still parks and a later end event
 *     delivers it.
 *  5. Beyond PARK_LIMIT deliveries bounce with a clear error instead of
 *     growing without bound; shutdown clears parked state without delivering.
 */
test("shares arriving during compaction park instead of bouncing and flush on compact end", () => {
	const extensionPath = path.resolve(import.meta.dir, "index.ts");
	const home = fs.mkdtempSync("/tmp/xlc-");
	fs.mkdirSync(`${home}/bin`);
	// xlatch stub: register prints JSON the extension can parse.
	fs.writeFileSync(`${home}/bin/xlatch`, '#!/bin/sh\nprintf \'{"id":"pi.send.compact","status":"active","revision":"t"}\\n\'\n', {
		mode: 0o700,
	});
	fs.mkdirSync(`${home}/.pi/agent/xlatch-pi`, { recursive: true });

	const script = `
import extension from ${JSON.stringify(extensionPath)};
import net from 'node:net';
import assert from 'node:assert/strict';

// --- fixture pi emulator --------------------------------------------------
const deliverAttempts = [];
let compactingNow = false;
const events = new Map();
let command;
let status;
const notifications = [];

function sendUserMessage(body) {
  if (compactingNow) throw new Error('Cannot submit a prompt while compaction is in progress. Wait for compaction to finish and retry.');
  deliverAttempts.push(body);
}

const ctx = { cwd: process.env.HOME, isIdle: () => true,
  sessionManager: { getSessionId: () => 'fixture', getSessionName: () => 'fixture', getEntries: () => [] },
  ui: { setStatus: (_, value) => { status = value; }, notify: (value) => notifications.push(value) } };
extension({ on: (event, handler) => events.set(event, handler),
  registerCommand: (_, value) => { command = value.handler; }, registerTool: () => {}, appendEntry: () => {},
  sendUserMessage });
await events.get('session_start')({ reason: 'new' }, ctx);
await command('compact-test', ctx);
assert.equal(status, 'compact-test');

const socket = process.env.HOME + '/.pi/agent/xlatch-pi/slots/compact-test.sock';
function share(payload) {
  return new Promise((resolve, reject) => {
    const c = net.connect(socket); c.once('error', reject);
    c.once('connect', () => c.write(JSON.stringify(payload) + '\\n'));
    c.once('data', data => { resolve(JSON.parse(data)); c.destroy(); });
  });
}
const flushMicrotasks = () => new Promise((r) => setImmediate(r));

// --- 1. share during compaction acks parked, does not touch pi ------------
await events.get('session_before_compact')({ reason: 'threshold' }, ctx);
compactingNow = true;
const parkAck = await share({ kind: 'text', text: 'mid-compaction share' });
assert.equal(parkAck.ok, true);
assert.equal(parkAck.delivery, 'parked');
assert.match(parkAck.text, /compacting/);
assert.equal(deliverAttempts.length, 0, 'pi.prompt must not be called during compaction');

// --- 2. one more parks, then session_compact flushes in order -------------
compactingNow = false;
const second = await share({ kind: 'text', text: 'second while compaction ends' });
assert.equal(second.ok, true);
assert.equal(second.delivery, 'parked');
await events.get('session_compact')({ reason: 'threshold' }, ctx);
await flushMicrotasks();
assert.equal(deliverAttempts.length, 2);
assert.ok(deliverAttempts[0].includes('mid-compaction share'));
assert.ok(deliverAttempts[1].includes('second while compaction ends'));

// --- 3. session_compact_failed (aborted compaction) also flushes -----------
await events.get('session_before_compact')({ reason: 'manual' }, ctx);
compactingNow = true;
const aborted = await share({ kind: 'text', text: 'share before cancel' });
assert.equal(aborted.delivery, 'parked');
compactingNow = false;
await events.get('session_compact_failed')({ reason: 'manual', aborted: true }, ctx);
await flushMicrotasks();
assert.equal(deliverAttempts.length, 3);
assert.ok(deliverAttempts[2].includes('share before cancel'));

// --- 4. refusal slips past the flag: still parks, next end event flushes --
// pi compacted again but this extension instance never saw before_compact,
// so its flag is down while the core refusal is live.
compactingNow = true;
const raced = await share({ kind: 'text', text: 'raced refusal' });
assert.equal(raced.ok, true);
assert.equal(raced.delivery, 'parked');
await flushMicrotasks();
assert.equal(deliverAttempts.length, 3, 'still parked until an end event arrives');
compactingNow = false;
await events.get('session_compact')({ reason: 'manual' }, ctx);
await flushMicrotasks();
assert.equal(deliverAttempts.length, 4);
assert.ok(deliverAttempts[3].includes('raced refusal'));

// --- 5. cap: PARK_LIMIT (50) bounds the queue -------------------------------
await events.get('session_before_compact')({ reason: 'overflow' }, ctx);
compactingNow = true;
let parkedCount = 0;
for (let n = 0; n < 50; n++) {
  const r = await share({ kind: 'text', text: 'filler ' + n });
  if (!r.ok) { break; }
  parkedCount += 1;
}
assert.equal(parkedCount, 50);
const overflow = await share({ kind: 'text', text: 'one over the cap' });
assert.equal(overflow.ok, false);
assert.match(overflow.error, /Too many messages/);

// shutdown clears parked state without delivering anything
const beforeShutdown = deliverAttempts.length;
await events.get('session_shutdown')({ reason: 'quit' }, ctx);
await flushMicrotasks();
assert.equal(deliverAttempts.length, beforeShutdown);
console.log('compaction-parking verified');
`;

	fs.writeFileSync(`${home}/fixture.ts`, script);
	try {
		const result = spawnSync(process.execPath, [`${home}/fixture.ts`], {
			env: { ...process.env, HOME: home, PATH: `${home}/bin:${process.env.PATH}` },
			encoding: "utf8",
			timeout: 15000,
		});
		expect({ status: result.status, error: result.stderr, output: result.stdout }).toEqual({
			status: 0,
			error: "",
			output: "compaction-parking verified\n",
		});
	} finally {
		fs.rmSync(home, { recursive: true, force: true });
	}
});
