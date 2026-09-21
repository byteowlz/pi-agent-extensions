import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

test("session status checks the actual route; lost routes recover and conflicting routes show offline", () => {
	const home = fs.mkdtempSync("/tmp/xlh-");
	fs.mkdirSync(`${home}/bin`);
	fs.writeFileSync(`${home}/bin/xlatch`, '#!/bin/sh\nprintf \'{"id":"pi.send.test","status":"active","revision":"test"}\\n\'\n', {
		mode: 0o700,
	});
	fs.mkdirSync(`${home}/.pi/agent/xlatch-pi`, { recursive: true });
	fs.writeFileSync(`${home}/.pi/agent/xlatch-pi/adapter.py`, "fixture");
	const script = `
import extension from ${JSON.stringify(path.resolve("pi-xlatch-session/index.ts"))};
import fs from 'node:fs';
import net from 'node:net';
import assert from 'node:assert/strict';
const events = new Map(); let command; let status; const notifications = []; const messages = [];
const ctx = { cwd: process.env.HOME, isIdle: () => true,
 sessionManager: { getSessionId: () => 'fixture', getSessionName: () => 'fixture', getEntries: () => [] },
 ui: { setStatus: (_, value) => { status = value; }, notify: (value) => notifications.push(value) } };
extension({ on: (event, handler) => events.set(event, handler), registerCommand: (_, value) => { command = value.handler; }, appendEntry: () => {}, sendUserMessage: (message) => messages.push(message) });
await events.get('session_start')({ reason: 'new' }, ctx);
await command('test', ctx);
const socket = process.env.HOME + '/.pi/agent/xlatch-pi/slots/test.sock';
assert.equal(status, 'xlatch:test');
fs.unlinkSync(socket);
await command('status', ctx);
assert.equal(status, 'xlatch:test');
assert.equal(fs.lstatSync(socket).isSymbolicLink(), true);
const reply = await new Promise((resolve, reject) => {
 const c = net.connect(socket); c.once('error', reject);
 c.once('connect', () => c.write(JSON.stringify({kind:'text',text:'fixture delivery'}) + '\\n'));
 c.once('data', data => { resolve(JSON.parse(data)); c.destroy(); });
});
assert.equal(reply.ok, true); assert.equal(messages.length, 1);
fs.unlinkSync(socket); fs.symlinkSync('/tmp/not-the-owned-session.sock', socket);
await command('status', ctx);
assert.ok(status.includes('(offline)'));
assert.ok(notifications.some(value => value.includes('connection lost')));
await events.get('session_shutdown')({},ctx);
assert.equal(fs.readlinkSync(socket), '/tmp/not-the-owned-session.sock');
assert.equal(status, undefined);
console.log('lifecycle verified');
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
			output: "lifecycle verified\n",
		});
	} finally {
		fs.rmSync(home, { recursive: true, force: true });
	}
});
