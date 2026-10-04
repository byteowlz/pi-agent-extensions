#!/usr/bin/env node
// Exact Pi 1 pipeline + QuickJS probe. Only temporary synthetic configuration is used.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");

const binary = process.argv[2] ?? "pi";
assert.equal(execFileSync(binary, ["--version"], { encoding: "utf8" }).trim(), "1.0.0");
const temp = await mkdtemp(join(tmpdir(), "pi-structured-host-"));
const agent = join(temp, "agent");
await mkdir(agent);
const fixture = join(temp, "fixture.ts");
await writeFile(fixture, `import { Type } from "typebox";
export default function(pi) {
 const schema = Type.Object({ value: Type.String() });
 for (const name of ["object", "error_data", "throws", "plain", "redacted", "blocked", "wait", "read"]) {
  pi.registerTool({ name, label:name, description:name, parameters:Type.Object({image:Type.Optional(Type.Boolean())}),
   ...(name === "plain" ? {} : {outputSchema:schema}),
   async execute(_id,_args,signal) {
    if(name === "throws") throw new Error("fixture throw");
    if(name === "wait") await new Promise((resolve,reject) => {
      if(signal?.aborted) return reject(new Error("fixture abort"));
      signal?.addEventListener("abort", () => reject(new Error("fixture abort")), {once:true});
    });
    return {content:name === "read" && _args.image ? [{type:"image",mimeType:"image/png",data:"A".repeat(1300000)}] : [{type:"text",text:name === "read" ? "x".repeat(90000) : name === "plain" ? "plain text" : "presentation"}],details:undefined,
      ...(name === "plain" ? {} : {structuredContent:{value:name}}),
      ...(name === "error_data" ? {isError:true} : {})};
   }
  });
 }
 pi.on("tool_call", event => event.toolName === "blocked" ? {block:true,reason:"fixture denied"} : undefined);
 pi.on("tool_result", event => event.toolName === "redacted" ? {content:[{type:"text",text:"safe replacement"}]} : undefined);
}`);
await writeFile(join(temp, "auto-rename.json"), JSON.stringify({ enabled: true, readableId: false, generateOnFirstPrompt: false }));
await writeFile(join(temp, "history-search.json"), JSON.stringify({ sessionsDir: join(temp, "history"), indexOnStart: false }));
await writeFile(join(temp, "oqto-todos.json"), JSON.stringify({ storagePath: join(temp, "todos"), tuiWidget: false }));
const historyDir = join(temp,"history",`--${temp.replace(/^\//,"").replace(/\//g,"-")}--`);
await mkdir(historyDir,{recursive:true});
await writeFile(join(historyDir,"2026-01-01T00-00-00-000Z_historyfixture.jsonl"),[
 {type:"session",id:"historyfixture",cwd:temp},
 {type:"message",message:{role:"toolResult",content:[{type:"text",text:"synthetic other KEY=fixtureValue"}]}}
].map(value=>JSON.stringify(value)).join("\n"));
await mkdir(join(temp, "bin"));
await writeFile(join(temp,"mmry-recall.json"),JSON.stringify({enabled:false,pullOnStart:false}));
const fakeMemory = {memory_id:"mem_fixture",content:"Synthetic fact",revision:2,scope:"repo"};
await writeFile(join(temp,"bin","mmry"),`#!/usr/bin/env node\nconst action=process.argv[2];const entry=${JSON.stringify(fakeMemory)};console.log(JSON.stringify(action==="search"?[entry]:{...entry,...(action==="rm"?{removed:true}:{})}));`,{mode:0o700});
const parkedItem = {id:"parkedfixture",label:"Synthetic",mime_type:"text/plain",created_at:1};
await writeFile(join(temp,"bin","xlatch"),`#!/usr/bin/env node\nconst item=${JSON.stringify(parkedItem)};const action=process.argv[3];console.log(JSON.stringify(action==="list"?[item]:action==="read"?{item,input:{text:"Synthetic parked text"}}:{}));`,{mode:0o700});
const marker = 'fake/SECRET:"quoted\\password\n秘密';
await writeFile(join(temp, "bin", "kyz"), `#!/usr/bin/env node\nconst a=process.argv.slice(2); console.log(JSON.stringify(a[0]==="vault"?{unlocked:true}:a[0]==="list"?{entries:[{key:"fixture",service:"test",tags:[]}]}:{service:"test",key:"fixture",fields:{value:${JSON.stringify(marker)}}}));`, {mode:0o700});
const code = `const good = await tools.object({});
const dataError = await tools.error_data({});
const plain = await tools.plain({});
const redacted = await tools.redacted({});
const failures = await Promise.allSettled([tools.throws({}),tools.blocked({})]);
const renamed = await tools.rename_session({name:"Contract Fixture"});
const reflection = await tools.self_reflection({info:"all"});
await tools.Todo({action:"write",todos:[{id:"fixture",content:"Check contract",status:"pending"}]});
const todo = await tools.Todo({action:"read"});
const history = await Promise.all([tools.HistorySearch({query:"synthetic",mode:"grep"}),tools.HistorySearch({query:"other",mode:"grep"})]);
const anchors = [...new Map(history.flatMap(r=>r.hits.flatMap(h=>h.matches.map(m=>({sessionId:h.sessionId,around:m.msgIndex,matchPosition:m.matchPosition})))).map(a=>[a.sessionId+":"+a.around,a])).values()].slice(0,2);
const evidence = await Promise.all(anchors.map(a=>tools.HistoryRead({...a,before:0,after:0,roleFilter:"tool",maxTotalChars:2000})));
const historyGrep = await tools.HistoryGrep({sessionId:"historyfixture",pattern:"KEY=fixtureValue"});
const historyBranches = await tools.HistoryBranches({scope:"project",limit:5});
const deniedSudo = await tools.sudo_exec({command:"fixture",reason:"No real execution"});
const bash = await tools.bash({command:'printf "%s" "$TEST_FIXTURE"'});
const jsonBash = await tools.bash({command: "node -e 'process.stdout.write(JSON.stringify(process.env.TEST_FIXTURE))'"});
const memory = await tools.memory({action:"search",query:"synthetic"});
const memoryCreate = await tools.memory({action:"create",content:"Synthetic fact"});
const memoryEdit = await tools.memory({action:"supersede",id:"mem_fixture",content:"New fact",reason:"fixture",expected_revision:2});
const memoryRemove = await tools.memory({action:"deprecate",id:"mem_fixture",reason:"fixture",expected_revision:2});
const parked = await tools.xlatch_later({action:"list"});
const parkedRead = await tools.xlatch_later({action:"read",id:"parkedfixture"});
const parkedRemove = await tools.xlatch_later({action:"remove",id:"parkedfixture"});
const catalog = await tools.subagent({action:"info"});
const children = await tools.subagent({action:"list"});
const spawnDenied = await tools.subagent({task:"Must not execute"});
const guardedText = await tools.read({});
const guardedImage = await tools.read({image:true});
const spill = await tools.bash({command: 'node -e \\'process.stdout.write("x".repeat(1100000)+JSON.stringify(process.env.TEST_FIXTURE)+process.env.TEST_FIXTURE)\\''});
text({good,dataError,plain,redacted,renamed,reflectionInfo:reflection.info,todo,history:history.map(r=>({ok:r.ok,hits:r.hits,completeness:r.completeness})),evidence:evidence.map(r=>r.messages),grepMatches:historyGrep.matches,branchIds:historyBranches.branches.map(b=>b.branchId),deniedSudo,bash,jsonBash,memory,memoryCreate,memoryEdit,memoryRemove,parked,parkedRead,parkedRemove,catalog,children,spawnDenied,guardedText,guardedImage,spillPath:spill.full_output_path,failures:failures.map(r => ({status:r.status,message:r.reason?.message}))});`;
let calls = 0;
const server = createServer(async (req, res) => {
 const chunks = []; for await (const c of req) chunks.push(c);
 const body = JSON.parse(Buffer.concat(chunks).toString());
 calls++;
 const source = calls === 1 ? code : '// @options: {"timeout_ms": 100}\nawait tools.wait({});';
 const delta = calls <= 2 ? {role:"assistant",tool_calls:[{index:0,id:`probe-${calls}`,type:"function",function:{name:body.tools.find(t=>t.function?.name === "codemode").function.name,arguments:JSON.stringify({code:source})}}]} : {role:"assistant",content:"Done"};
 res.writeHead(200,{"Content-Type":"text/event-stream"});
 for(const [d,f] of [[delta,null],[{},calls<=2?"tool_calls":"stop"]]) res.write(`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:1,model:"fixture",choices:[{index:0,delta:d,finish_reason:f}]})}\n\n`);
 res.end("data: [DONE]\n\n");
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
await writeFile(join(agent,"models.json"),JSON.stringify({providers:{fixture:{baseUrl:`http://127.0.0.1:${server.address().port}/v1`,api:"openai-completions",apiKey:"synthetic",models:[{id:"fixture",input:["text"],contextWindow:8192,maxTokens:512}]}}}));
const child = spawn(binary,["--mode","rpc","--name","Existing Fixture","--offline","-ne","-ns","-np","-nc","-na","--provider","fixture","--model","fixture","-e","builtin:codemode","-e",fixture,...["pi-auto-rename", "pi-introspection", "pi-todolist", "pi-history-search", "pi-sudo", "pi-kyz", "pi-mmry", "pi-xlatch-session", "pi-herdr-tools", "pi-read-file-guard", "pi-read-image-guard"].flatMap(name=>["-e",join(root,name,"index.ts")]),"--tools","codemode,object,error_data,throws,plain,redacted,blocked,wait,rename_session,self_reflection,Todo,HistorySearch,HistoryRead,HistoryGrep,HistoryBranches,sudo_exec,bash,read,memory,xlatch_later,subagent"],{cwd:temp,env:{PATH:`${join(temp,"bin")}:${process.env.PATH}`,HOME:temp,PI_CODING_AGENT_DIR:agent,PI_OFFLINE:"1"},stdio:["pipe","pipe","pipe"]});
let buffer="", stderr=""; const rows=[];
child.stderr.on("data",c=>{stderr+=c;});
child.stdout.on("data",c=>{
 buffer+=c;
 while(buffer.includes("\n")) {const i=buffer.indexOf("\n"); const line=buffer.slice(0,i);buffer=buffer.slice(i+1); const row=JSON.parse(line);rows.push(row);if(row.type==="agent_settled")child.stdin.end();}
});
const timer=setTimeout(()=>child.kill("SIGKILL"),30000);
child.stdin.write(`${JSON.stringify({type:"prompt",message:"Probe structured contract"})}\n`);
try {
 const status=await new Promise(r=>child.once("close",r));
 assert.equal(status,0,stderr);
 const result=rows.find(r=>r.type==="tool_execution_end" && r.toolName==="codemode");
 assert(result,JSON.stringify(rows));
 assert.equal(result.isError,false,JSON.stringify(result));
 const output=result.result.content.map(c=>c.text??"").join("\n");
 assert.match(output,/Script completed/);
 const data=JSON.parse(output.slice(output.indexOf("{good") >= 0 ? output.indexOf("{good") : output.indexOf('{"good"')));
 assert.deepEqual(data.good,{value:"object"});
 // Pi 1 explicitly resolves isError + structuredContent, rather than rejecting.
 assert.deepEqual(data.dataError,{value:"error_data"});
 assert.equal(data.plain,"plain text");
 assert.equal(data.renamed.ok,true);
 assert.equal(data.reflectionInfo,"all");
 assert.equal(data.todo.todos[0].id,"fixture");
 assert(data.history.every(r=>r.ok && r.completeness === "unknown" && Array.isArray(r.hits)));
 assert.equal(data.evidence.length,1);
 assert.equal(data.evidence[0][0].text,"synthetic other KEY=fixtureValue");
 assert.equal(data.grepMatches[0].msgIndex,0);
 assert.deepEqual(data.branchIds,["historyfixture"]);
 assert.equal(data.deniedSudo.ok,false);
 assert.equal(data.deniedSudo.effects,"none");
 assert.equal(data.bash.output,"[REDACTED]");
 assert.equal(JSON.parse(data.jsonBash.output),"[REDACTED]");
 assert.equal(data.memory.entries[0].memory_id,"mem_fixture");
 assert.equal(data.memoryCreate.entry.revision,2);
 assert.equal(data.memoryEdit.ok,true);
 assert.equal(data.memoryRemove.entry.removed,true);
 assert.equal(data.parked.items[0].id,"parkedfixture");
 assert.equal(data.parkedRead.destructive,false);
 assert.equal(data.parkedRemove.removed,true);
 assert(Array.isArray(data.catalog.models));
 assert(Array.isArray(data.children.subagents));
 assert.equal(data.spawnDenied.spawned,false);
 assert.equal(data.spawnDenied.ok,false);
 assert.equal(typeof data.guardedText,"string");
 assert.match(data.guardedText,/read-file-guard/);
 assert.equal(typeof data.guardedImage,"string");
 assert.match(data.guardedImage,/read-image-guard/);
 const representations = [marker];
 for(let depth=0;depth<3;depth++) representations.push(JSON.stringify(representations.at(-1)).slice(1,-1));
 const containsSecret = text => representations.some(value=>text.includes(value));
 assert(!containsSecret(JSON.stringify(rows)), "Secret must not survive protocol/persistable results");
 assert(data.spillPath, "fixture must exercise host spill file");
 assert(!containsSecret(await readFile(data.spillPath,"utf8")), "Secrets must be scrubbed before host spills output");
 await rm(data.spillPath);
 const sessions = join(agent,"sessions");
 const persisted = await readdir(sessions,{recursive:true});
 for (const file of persisted.filter(name=>name.endsWith(".jsonl"))) assert(!containsSecret(await readFile(join(sessions,file),"utf8")), "Secret in persisted session");
 assert.equal(data.redacted,"safe replacement");
 assert.deepEqual(data.failures.map(r=>r.status),["rejected","rejected"]);
 assert.match(data.failures[0].message,/fixture throw/);
 assert.match(data.failures[1].message,/fixture denied/);
 const timeout = rows.filter(r=>r.type === "tool_execution_end" && r.toolName === "codemode")[1];
 assert(timeout?.isError, "deadline must fail script");
 const aborted = rows.find(r=>r.type === "tool_execution_end" && r.toolName === "wait");
 assert(aborted?.isError, "pending host call must settle as cancelled");
 console.log("PASS exact Pi 1 native codemode: host contracts + rename/reflection/Todo/parallel history/denied sudo/kyz bash");
} finally {
 clearTimeout(timer);child.kill("SIGKILL");await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true});
}
