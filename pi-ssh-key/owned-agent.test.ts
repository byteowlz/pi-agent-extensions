import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const realAgent = spawnSync("which", ["ssh-agent"], { encoding: "utf8" }).stdout?.trim();
test.skipIf(!realAgent)("owned agent restart is keyless and shutdown truly restores absent environment", () => {
	const home = mkdtempSync(join(tmpdir(), "ssh-owned-"));
	const bin = join(home, "bin");
	mkdirSync(bin);
	for (const name of ["ssh-agent", "ssh-add", "ssh-keygen"]) {
		const file = join(bin, name);
		writeFileSync(
			file,
			`#!/usr/bin/env node
const name=require('node:path').basename(process.argv[1]);
if(name==='ssh-agent'){const r=require('node:child_process').spawnSync(${JSON.stringify(realAgent)},process.argv.slice(2),{encoding:'utf8'});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);}
console.log(process.argv.includes('-y')?'ssh-ed25519 AAAA synthetic':'256 SHA256:fixture synthetic');
`
		);
		chmodSync(file, 0o700);
	}
	writeFileSync(
		join(home, "fixture.ts"),
		`import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import extension from ${JSON.stringify(resolve("pi-ssh-key/index.ts"))};
const hooks=new Map(),commands=new Map(),notes=[];extension({on:(n,h)=>hooks.set(n,h),registerCommand:(n,c)=>commands.set(n,c.handler)});
const ctx={mode:'rpc',hasUI:true,ui:{notify:(text,kind)=>notes.push({text,kind}),custom:()=>{throw new Error('No passphrase expected')}}};
const key=path.join(process.env.HOME,'fixture.key');fs.writeFileSync(key,'-----BEGIN OPENSSH PRIVATE KEY-----\\nsynthetic\\n');
delete process.env.SSH_AUTH_SOCK;delete process.env.SSH_AGENT_PID;
try{
 await commands.get('ssh-key-load')(key,ctx);assert.equal(notes.at(-1).kind,'info',JSON.stringify(notes));
 const firstSocket=process.env.SSH_AUTH_SOCK;const firstPid=Number(process.env.SSH_AGENT_PID);
 assert(firstSocket);assert(firstPid>0);process.kill(firstPid,'SIGTERM');
 for(let i=0;i<100&&fs.existsSync(firstSocket);i++)await new Promise(r=>setTimeout(r,5));
 await commands.get('ssh-key-load')(key,ctx);assert.equal(notes.at(-1).kind,'info',JSON.stringify(notes));
 assert.notEqual(process.env.SSH_AUTH_SOCK,firstSocket,'Restart gets a fresh private endpoint');
 await hooks.get('session_shutdown')({},ctx);
 assert.equal(process.env.SSH_AUTH_SOCK,undefined);assert.equal(process.env.SSH_AGENT_PID,undefined);
 console.log('owned lifecycle verified');
}finally{await hooks.get('session_shutdown')({},ctx);}
`
	);
	try {
		const result = spawnSync(process.execPath, [join(home, "fixture.ts")], {
			env: { HOME: home, PATH: `${bin}:${process.env.PATH}` },
			encoding: "utf8",
			timeout: 15000,
		});
		expect({ status: result.status, out: result.stdout, error: result.stderr }).toEqual({
			status: 0,
			out: "owned lifecycle verified\n",
			error: "",
		});
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
