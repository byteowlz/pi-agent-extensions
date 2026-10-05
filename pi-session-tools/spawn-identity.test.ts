import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildSubagentSessionName } from "../pi-auto-rename/index.js";

test("spawn names have exactly one sub prefix and a child-specific readable suffix", () => {
	const home = mkdtempSync(join(tmpdir(), "child-name-"));
	try {
		const first = buildSubagentSessionName("[sub] Review Tests [old-parent-suffix]", "child-a", home);
		expect(first).toMatch(/^\[sub\] Review Tests \[[a-z0-9-]+\]$/);
		expect(first).not.toContain("old-parent-suffix");
		expect(first).toBe(buildSubagentSessionName("Review Tests", "child-a", home));
		expect(first).not.toBe(buildSubagentSessionName("Review Tests", "child-b", home));
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("real spawn path targets the caller's live workspace and passes the assigned Pi session name/id", () => {
	const home = mkdtempSync(join(tmpdir(), "child-spawn-"));
	mkdirSync(join(home, "bin"));
	const fake = `#!${process.execPath}
const fs=require('node:fs');const a=process.argv.slice(2);
fs.appendFileSync(process.env.HOME+'/calls.jsonl',JSON.stringify(a)+'\\n');
let result={};
if(a[0]==='pane'&&a[1]==='get') result={pane:{pane_id:'wParent:p1',...(!fs.existsSync(process.env.HOME+'/missing-workspace')?{workspace_id:'wParent'}:{})}};
if(a[0]==='agent'&&a[1]==='list') result={agents:[]};
if(a[0]==='tab'&&a[1]==='create') result={root_pane:{pane_id:'wParent:p2'},tab:{tab_id:'wParent:t2',workspace_id:'wParent'}};
if(a[0]==='agent'&&a[1]==='start') result={agent:{name:a[2]}};
console.log(JSON.stringify({result}));
`;
	writeFileSync(join(home, "bin/herdr"), fake);
	chmodSync(join(home, "bin/herdr"), 0o755);
	const fixture = `
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import extension from ${JSON.stringify(resolve("pi-session-tools/index.ts"))};
import {buildSubagentSessionName} from ${JSON.stringify(resolve("pi-auto-rename/index.ts"))};
const handlers=new Map(),tools=new Map();
const pi={on:(n,h)=>handlers.set(n,h),registerTool:t=>tools.set(t.name,t),registerCommand:()=>{},registerShortcut:()=>{},sendMessage:()=>{},events:{on:()=>()=>{}}};
fs.mkdirSync(path.join(process.env.HOME,'.pi/agent'),{recursive:true});
fs.writeFileSync(path.join(process.env.HOME,'.pi/agent/subagent-config.json'),JSON.stringify({enabled:true,allowMode:'auto',maxSubagents:0}));
const ctx={mode:'print',hasUI:false,cwd:process.env.HOME,signal:new AbortController().signal,
sessionManager:{getSessionId:()=> 'parent-session',getSessionFile:()=>null,getEntries:()=>[]},
modelRegistry:{getAvailable:()=>[{provider:'local',id:'m1',name:'One'}]},ui:{notify:()=>{},setStatus:()=>{}}};
extension(pi);await handlers.get('session_start')({},ctx);
const result=await tools.get('subagent').execute('spawn-call',{task:'Review the tests',model:'local/m1',tabLabel:'Review Tests'},ctx.signal,undefined,ctx);
await handlers.get('session_shutdown')({},ctx);
assert.equal(result.structuredContent.spawned,true,JSON.stringify(result));
const calls=fs.readFileSync(process.env.HOME+'/calls.jsonl','utf8').trim().split('\\n').map(JSON.parse);
const tab=calls.find(a=>a[0]==='tab'&&a[1]==='create');
assert.equal(tab[tab.indexOf('--workspace')+1],'wParent','Must ignore UI-focused/stale inherited workspace');
assert(tab.includes('--no-focus'));
const start=calls.find(a=>a[0]==='agent'&&a[1]==='start');
const id=start[start.indexOf('--session-id')+1],name=start[start.indexOf('--name')+1];
assert.match(id,/^[a-f0-9-]{36}$/);assert.notEqual(id,'parent-session');
assert.equal(name,buildSubagentSessionName('Review Tests',id,process.env.HOME));
assert.equal(name,tab[tab.indexOf('--label')+1]);
assert.equal(result.structuredContent.child.label,name);
fs.writeFileSync(process.env.HOME+'/missing-workspace','1');
const failed=await tools.get('subagent').execute('missing-call',{task:'Must not spawn',model:'local/m1'},ctx.signal,undefined,ctx);
assert.equal(failed.structuredContent.spawned,false);
assert.equal(failed.structuredContent.effects,'none');
const after=fs.readFileSync(process.env.HOME+'/calls.jsonl','utf8').trim().split('\\n').map(JSON.parse);
assert.equal(after.filter(a=>a[0]==='tab'&&a[1]==='create').length,1,'Missing caller workspace must never target focus');
await handlers.get('session_shutdown')({},ctx);
console.log('identity and workspace verified');
`;
	writeFileSync(join(home, "fixture.ts"), fixture);
	try {
		const result = spawnSync(process.execPath, [join(home, "fixture.ts")], {
			env: {
				HOME: home,
				PATH: `${join(home, "bin")}:${process.env.PATH}`,
				PI_CODING_AGENT_DIR: join(home, ".pi/agent"),
				HERDR_ENV: "1",
				HERDR_PANE_ID: "wParent:p1",
				HERDR_WORKSPACE_ID: "wFocused",
				HERDR_SOCKET_PATH: join(home, "absent.sock"),
			},
			encoding: "utf8",
			timeout: 15000,
		});
		expect({ status: result.status, stderr: result.stderr, stdout: result.stdout }).toEqual({
			status: 0,
			stderr: "",
			stdout: "identity and workspace verified\n",
		});
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
