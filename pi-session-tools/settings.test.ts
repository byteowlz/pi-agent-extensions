import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("auto enables spawning; introspection exposes eligible models; changes reach the agent once", () => {
	const home = mkdtempSync(join(tmpdir(), "session-settings-"));
	const source = `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import extension from ${JSON.stringify(resolve("pi-session-tools/index.ts"))};
import {collectContributions} from ${JSON.stringify(resolve("pi-introspection/contributions.ts"))};
const handlers=new Map(), commands=new Map(), listeners=new Map(), messages=[];
const pi={
 on:(name,handler)=>handlers.set(name,handler),
 registerCommand:(name,command)=>commands.set(name,command.handler),
 registerTool:()=>{}, registerShortcut:()=>{},
 sendMessage:(message,options)=>messages.push({message,options}),
 events:{on:(name,handler)=>{listeners.set(name,handler);return()=>listeners.delete(name)},emit:(name,data)=>listeners.get(name)?.(data)},
};
fs.mkdirSync(path.join(process.env.HOME,'.pi/agent'),{recursive:true});
const configPath=path.join(process.env.HOME,'.pi/agent/subagent-config.json');
fs.writeFileSync(configPath,JSON.stringify({enabled:false,allowedModels:['local/*'],loadouts:{automatic:{models:['other/m2'],mode:'auto'}}}));
let id='session-a';
const ctx={mode:'print',hasUI:false,cwd:process.env.HOME,
 sessionManager:{getSessionId:()=>id,getSessionFile:()=>null,getEntries:()=>[]},
 modelRegistry:{getAvailable:()=>[{provider:'local',id:'m1',name:'One'},{provider:'other',id:'m2',name:'Two'}]},
 ui:{notify:()=>{},setStatus:()=>{}},
};
extension(pi);
await handlers.get('session_start')({},ctx);
const snapshot=async()=> (await collectContributions(pi,id))[0].details;
assert.deepEqual((await snapshot()).availableSubagentModels,['local/m1']);
assert.equal((await snapshot()).spawnEnabled,false);
await commands.get('subagent')('mode auto',ctx);
assert.equal(JSON.parse(fs.readFileSync(configPath)).enabled,true);
assert.equal((await snapshot()).allowMode,'auto');
assert.equal((await snapshot()).spawnEnabled,true);
assert.equal(messages.length,1);
assert.equal(messages[0].options.triggerTurn,false);
assert.equal(messages[0].message.customType,'subagent-settings-changed');
assert.match(messages[0].message.content,/"spawnEnabled":true/);
assert.equal(await handlers.get('before_agent_start')({},ctx),undefined);
await commands.get('subagent')('mode auto',ctx);
assert.equal(messages.length,1,'No duplicate notice for unchanged settings');
await commands.get('subagent')('mode invalid',ctx);
assert.equal(messages.length,1,'Invalid command must not announce a change');
await commands.get('subagent')('off',ctx);
assert.equal((await snapshot()).spawnEnabled,false,'Explicit off is respected even while mode remains auto');
await commands.get('subagent')('noconfirm',ctx);
assert.equal((await snapshot()).spawnEnabled,true);
await commands.get('subagent')('models add other/m2',ctx);
assert.deepEqual((await snapshot()).availableSubagentModels,['local/m1','other/m2']);
await commands.get('subagent')('off',ctx);
await commands.get('subagent')('models loadout load automatic',ctx);
assert.equal((await snapshot()).spawnEnabled,true,'An explicitly applied auto loadout enables spawning');
assert.deepEqual((await snapshot()).availableSubagentModels,['other/m2']);
await commands.get('subagent')('max 3',ctx);
assert.equal((await snapshot()).maxSubagents,3);
// Out-of-band config changes are exposed on the next model request, not silently swallowed.
const raw=JSON.parse(fs.readFileSync(configPath));raw.enabled=false;fs.writeFileSync(configPath,JSON.stringify(raw));
const changed=await handlers.get('before_agent_start')({},ctx);
assert.match(changed.message.content,/"spawnEnabled":false/);
assert.equal(await handlers.get('before_agent_start')({},ctx),undefined);
await handlers.get('session_shutdown')({},ctx);
id='session-b';
await handlers.get('session_start')({},ctx);
assert.equal(await handlers.get('before_agent_start')({},ctx),undefined,'No cross-session setting notice');
await handlers.get('session_shutdown')({},ctx);
assert.deepEqual(await collectContributions(pi,id),[],'Contributor unregisters at shutdown');
console.log('settings verified');
`;
	writeFileSync(join(home, "fixture.ts"), source);
	try {
		const result = spawnSync(process.execPath, [join(home, "fixture.ts")], {
			env: { HOME: home, PATH: process.env.PATH, PI_CODING_AGENT_DIR: join(home, ".pi/agent") },
			encoding: "utf8",
			timeout: 10000,
		});
		expect({ status: result.status, error: result.stderr, output: result.stdout }).toEqual({
			status: 0,
			error: "",
			output: "settings verified\n",
		});
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
