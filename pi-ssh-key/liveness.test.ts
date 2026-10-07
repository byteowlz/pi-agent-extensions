import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("extension rebinds borrowed agents without PID; stale inherited socket fails closed before key add", () => {
	const home = mkdtempSync(join(tmpdir(), "ssh-agent-cache-"));
	const bin = join(home, "bin");
	mkdirSync(bin);
	for (const program of ["ssh-add", "ssh-keygen", "ssh-agent"]) {
		const path = join(bin, program);
		writeFileSync(
			path,
			`#!/usr/bin/env node
const fs=require('node:fs');const name=require('node:path').basename(process.argv[1]);
fs.appendFileSync(${JSON.stringify(join(home, "calls.jsonl"))},JSON.stringify({name,args:process.argv.slice(2),socket:process.env.SSH_AUTH_SOCK})+'\\n');
if(name==='ssh-agent')process.exit(99);
if(name==='ssh-add'){console.log('256 SHA256:fixture synthetic');process.exit(0);}
if(process.argv.includes('-y'))console.log('ssh-ed25519 AAAA synthetic');else console.log('256 SHA256:fixture synthetic');
`
		);
		chmodSync(path, 0o700);
	}
	const fixture = `import assert from 'node:assert/strict';
import fs from 'node:fs';import net from 'node:net';import path from 'node:path';
import extension from ${JSON.stringify(resolve("pi-ssh-key/index.ts"))};
const commands=new Map(),hooks=new Map(),notes=[];
const pi={on:(name,handler)=>hooks.set(name,handler),registerCommand:(name,command)=>commands.set(name,command.handler)};
const ctx={mode:'rpc',hasUI:true,ui:{notify:(text,kind)=>notes.push({text,kind}),custom:()=>{throw new Error('No passphrase UI expected')}}};
const home=process.env.HOME;const key=path.join(home,'synthetic.key');fs.writeFileSync(key,'-----BEGIN OPENSSH PRIVATE KEY-----\\nsynthetic\\n');
const open=async (name,delay=0)=>{const sock=path.join(home,name);const server=net.createServer(client=>{client.on('error',()=>{});client.once('data',()=>setTimeout(()=>client.end(Buffer.from([0,0,0,5,12,0,0,0,0])),delay))});await new Promise(resolve=>server.listen(sock,resolve));return{sock,server}};
const close=server=>new Promise(resolve=>server.close(()=>resolve()));
const a=await open('a.sock'),b=await open('b.sock');
delete process.env.SSH_AGENT_PID;process.env.SSH_AUTH_SOCK=a.sock;extension(pi);
try{
 await commands.get('ssh-key-load')(key,ctx);assert.equal(notes.at(-1).kind,'info',JSON.stringify(notes));
 process.env.SSH_AUTH_SOCK=b.sock;
 const recorded=()=>fs.readFileSync(path.join(home,'calls.jsonl'),'utf8').trim().split('\\n').map(JSON.parse);
 const beforeSwitch=recorded().filter(row=>row.name==='ssh-add').length;
 await commands.get('ssh-key-timeout')('30',ctx);assert.equal(notes.at(-1).kind,'error');
 await commands.get('ssh-key-unload')(key,ctx);assert.equal(notes.at(-1).kind,'error');
 assert.equal(recorded().filter(row=>row.name==='ssh-add').length,beforeSwitch,'No stale remove or lifetime refresh across inherited authority change');
 await commands.get('ssh-key-load')(key,ctx);
 const calls=()=>fs.readFileSync(path.join(home,'calls.jsonl'),'utf8').trim().split('\\n').map(JSON.parse);
 const adds=calls().filter(row=>row.name==='ssh-add'&&!row.args.includes('-l'));
 assert.equal(adds.at(-1).socket,b.sock,'Cached borrowed endpoint with no PID must follow new inherited socket');
 await close(b.server);
 const before=calls().filter(row=>row.name==='ssh-add').length;
 await commands.get('ssh-key-load')(key,ctx);
 assert.equal(notes.at(-1).kind,'error');assert.match(notes.at(-1).text,/inherited SSH agent.*unavailable/i);
 assert.equal(calls().filter(row=>row.name==='ssh-add').length,before,'Unavailable agent must fail before key/passphrase/add operations');
 assert.equal(calls().filter(row=>row.name==='ssh-agent').length,0,'Never bypass inherited agent with a private one');
 assert.equal(process.env.SSH_AUTH_SOCK,b.sock,'Do not overwrite inherited authority');
 process.env.OQTO_SSH_AGENT='proxy';
 await commands.get('ssh-key-load')(key,ctx);
 assert.match(notes.at(-1).text,/proxy session/);
 assert.equal(calls().filter(row=>row.name==='ssh-add').length,before,'Proxy uses grant path, not local identity add');
 delete process.env.OQTO_SSH_AGENT;
 const c=await open('shutdown.sock',70);process.env.SSH_AUTH_SOCK=c.sock;
 const noteCount=notes.length;const pending=commands.get('ssh-key-load')(key,ctx);
 await new Promise(r=>setTimeout(r,10));await hooks.get('session_shutdown')({},ctx);await pending;
 assert.equal(notes.length,noteCount,'Shutdown cancels pending probes without using disposed UI');
 assert.equal(calls().filter(row=>row.name==='ssh-add').length,before,'Shutdown must prevent late key additions');
 await close(c.server);
}finally{await hooks.get('session_shutdown')({},ctx);await close(a.server);}
console.log('agent lifecycle verified');
`;
	writeFileSync(join(home, "fixture.ts"), fixture);
	try {
		const result = spawnSync(process.execPath, [join(home, "fixture.ts")], {
			env: { HOME: home, PATH: `${bin}:${process.env.PATH}` },
			encoding: "utf8",
			timeout: 15000,
		});
		expect({ status: result.status, out: result.stdout, error: result.stderr }).toEqual({
			status: 0,
			out: "agent lifecycle verified\n",
			error: "",
		});
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
