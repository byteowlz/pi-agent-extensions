import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

test("session status checks the actual route; lost routes recover and conflicting routes show offline", () => {
	const home = fs.mkdtempSync("/tmp/xlh-");
	fs.mkdirSync(`${home}/bin`);
	fs.writeFileSync(
		`${home}/bin/xlatch`,
		'#!/bin/sh\ncase " $* " in *" --icon "*"pi-coding-agent.svg"*" --icon-dark "*"pi-coding-agent-dark.svg"*) ;; *) echo "missing pi icon variants" >&2; exit 2;; esac\nprintf \'{"id":"pi.send.test","status":"active","revision":"test"}\\n\'\n',
		{
			mode: 0o700,
		}
	);
	fs.mkdirSync(`${home}/.pi/agent/xlatch-pi`, { recursive: true });
	const script = `
import extension from ${JSON.stringify(path.resolve("pi-xlatch-session/index.ts"))};
import fs from 'node:fs';
import net from 'node:net';
import assert from 'node:assert/strict';
const events = new Map(); let command; let status; const notifications = []; const messages = [];
const ctx = { cwd: process.env.HOME, isIdle: () => true,
 sessionManager: { getSessionId: () => 'fixture', getSessionName: () => 'fixture', getEntries: () => [] },
 ui: { setStatus: (_, value) => { status = value; }, notify: (value) => notifications.push(value) } };
extension({ on: (event, handler) => events.set(event, handler), registerCommand: (_, value) => { command = value.handler; }, registerTool: () => {}, appendEntry: () => {}, sendUserMessage: (message) => messages.push(message) });
assert.equal(fs.readFileSync(process.env.HOME + '/.pi/agent/xlatch-pi/adapter.py', 'utf8').includes('xlatch -> pi session adapter'), true);
await events.get('session_start')({ reason: 'new' }, ctx);
await command('test', ctx);
const socket = process.env.HOME + '/.pi/agent/xlatch-pi/slots/test.sock';
assert.equal(status, 'test');
const manifest = JSON.parse(fs.readFileSync(process.env.HOME + '/.pi/agent/xlatch-pi/manifests/test.json', 'utf8'));
assert.deepEqual(manifest.accepts, ['*/*']);
assert.equal(manifest.file_input, 'path');
fs.unlinkSync(socket);
await command('status', ctx);
assert.equal(status, 'test');
assert.equal(fs.lstatSync(socket).isSymbolicLink(), true);
const reply = await new Promise((resolve, reject) => {
 const c = net.connect(socket); c.once('error', reject);
 c.once('connect', () => c.write(JSON.stringify({kind:'text',text:'fixture delivery'}) + '\\n'));
 c.once('data', data => { resolve(JSON.parse(data)); c.destroy(); });
});
assert.equal(reply.ok, true); assert.equal(messages.length, 1);
async function shareFile(payload) {
 return await new Promise((resolve, reject) => {
  const c = net.connect(socket); c.once('error', reject);
  c.once('connect', () => c.write(JSON.stringify(payload) + '\\n'));
  c.once('data', data => { resolve(JSON.parse(data)); c.destroy(); });
 });
}
assert.equal((await shareFile({kind:'file', path:'/incoming/one.png', bytes:1024, file_mime_type:'image/png', note:'Compare these photos'})).ok, true);
assert.equal((await shareFile({kind:'file', path:'/incoming/two.png', bytes:2048, file_mime_type:'image/png'})).ok, true);
const files = messages.slice(1).join('\\n');
assert.equal(files.includes('Shared from phone via xlatch (file), saved to disk:'), false);
assert.equal(files.split('Compare these photos').length - 1, 1);
assert.ok(files.includes('/incoming/one.png')); assert.ok(files.includes('/incoming/two.png'));

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
