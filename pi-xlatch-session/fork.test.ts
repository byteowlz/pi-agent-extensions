import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("forks stay detached without disconnecting the parent; child-owned claims resume and session switches release", () => {
	const home = mkdtempSync(join(tmpdir(), "xlatch-fork-"));
	mkdirSync(join(home, "bin"));
	writeFileSync(join(home, "bin/xlatch"), '#!/bin/sh\nprintf \'{"id":"fixture","status":"active"}\\n\'\n');
	chmodSync(join(home, "bin/xlatch"), 0o755);
	const script = `
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import extension from ${JSON.stringify(resolve("pi-xlatch-session/index.ts"))};
const make=(id,parent,entries=[])=>{
 const events=new Map();let command,status;
 const ctx={cwd:process.env.HOME,isIdle:()=>true,sessionManager:{getSessionId:()=>id,getSessionName:()=>id,getEntries:()=>entries,getHeader:()=>({parentSession:parent})},ui:{notify:()=>{},setStatus:(_,v)=>{status=v}}};
 extension({on:(e,h)=>events.set(e,h),registerCommand:(_,v)=>{command=v.handler},registerTool:()=>{},appendEntry:(type,data)=>entries.push({type:'custom',customType:type,data}),sendUserMessage:()=>{}});
 return {ctx,events,entries,command:(text)=>command(text,ctx),status:()=>status};
};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const socket=slot=>path.join(process.env.HOME,'.pi/agent/xlatch-pi/slots',slot+'.sock');
const parent=make('parent');await parent.events.get('session_start')({reason:'new'},parent.ctx);await parent.command('parent-slot');
assert.equal(parent.entries.at(-1).data.sessionId,'parent');
const child=make('child','/parent.jsonl',structuredClone(parent.entries));
await child.events.get('session_start')({reason:'startup'},child.ctx);await delay(80);
assert.equal(child.status(),undefined);assert(fs.existsSync(socket('parent-slot')),'Fork must not disconnect original parent');
await parent.events.get('session_shutdown')({},parent.ctx);
await child.events.get('session_start')({reason:'startup'},child.ctx);await delay(80);
assert.equal(child.status(),undefined);assert(!fs.existsSync(socket('parent-slot')),'Fork must not steal freed parent slot');
child.entries.push({type:'custom',customType:'xlatch-session-slot',data:{slot:'legacy'}});
await child.events.get('session_start')({reason:'startup'},child.ctx);await delay(80);assert(!fs.existsSync(socket('legacy')));
await child.command('child-slot');assert.equal(child.entries.at(-1).data.sessionId,'child');
await child.events.get('session_shutdown')({},child.ctx);
await child.events.get('session_start')({reason:'resume'},child.ctx);
for(let i=0;i<100&&child.status()!=='child-slot';i++)await delay(10);
assert.equal(child.status(),'child-slot','A fork must resume its own explicitly established connection');
const nextCtx={...child.ctx,sessionManager:{...child.ctx.sessionManager,getSessionId:()=> 'next-child'}};
await child.events.get('session_start')({reason:'fork'},nextCtx);await delay(80);
assert.equal(child.status(),undefined);assert(!fs.existsSync(socket('child-slot')),'Same-process session switch must release prior listener');
await child.events.get('session_shutdown')({},nextCtx);
console.log('fork ownership verified');
`;
	writeFileSync(join(home, "fixture.ts"), script);
	try {
		const result = spawnSync(process.execPath, [join(home, "fixture.ts")], {
			env: { HOME: home, PATH: `${join(home, "bin")}:${process.env.PATH}` },
			encoding: "utf8",
			timeout: 10000,
		});
		expect({ status: result.status, stderr: result.stderr, stdout: result.stdout }).toEqual({
			status: 0,
			stderr: "",
			stdout: "fork ownership verified\n",
		});
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
