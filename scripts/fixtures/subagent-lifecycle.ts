import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = process.env.REVIEW_HOME_ROOT ?? mkdtempSync(join(tmpdir(), "structured-abort-review-"));
const scenario = process.env.REVIEW_SCENARIO ?? "abort";
const old = { ...process.env };
process.env.HOME = root;
process.env.HERDR_ENV = "1";
process.env.HERDR_PANE_ID = "fixture-pane";
delete process.env.OQTO_SESSION_ID;
delete process.env.AGENT_CTX_PLATFORM;
delete process.env.AGENT_CTX_PLATFORM_SESSION_ID;
process.env.HERDR_SOCKET_PATH = join(root, "synthetic.sock");
mkdirSync(join(root, ".pi/agent"), { recursive: true });
mkdirSync(join(root, "bin"));
process.env.PATH = `${join(root, "bin")}:${process.env.REVIEW_NODE_BIN ?? "/usr/bin"}:/usr/bin:/bin`;
writeFileSync(
	join(root, ".pi/agent/subagent-config.json"),
	JSON.stringify({ enabled: true, allowMode: "auto", allowedModels: ["fixture/model"], maxSubagents: 3 })
);
writeFileSync(
	join(root, "bin/herdr"),
	`#!/usr/bin/env node
const fs=require('fs'),path=require('path');const a=process.argv.slice(2),r=process.env.HOME;
fs.appendFileSync(path.join(r,'calls.jsonl'),JSON.stringify({args:a,time:Date.now(),afterAbort:fs.existsSync(path.join(r,'aborted'))})+'\\n');
if(a[0]==='tab'&&a[1]==='create') {if(process.env.REVIEW_SCENARIO==='uncertain'){fs.writeFileSync(path.join(r,'tab-was-created'),'yes');console.error('lost response');process.exitCode=1;}else console.log(JSON.stringify({result:{root_pane:{pane_id:'fixture-pane'},tab:{tab_id:'fixture-tab'}}}));}
else if(a[0]==='pane'&&a[1]==='get') console.log(JSON.stringify({result:{pane:{pane_id:'fixture-pane',workspace_id:'fixture-workspace'}}}));
else if(a[0]==='agent'&&a[1]==='start') {const p=path.join(r,'first-start');if(!fs.existsSync(p)){fs.writeFileSync(p,'yes');console.error('agent_pane_busy');process.exitCode=1;}else console.log(JSON.stringify({result:{agent:{name:a[2]}}}));}
else console.log('{}');
`,
	{ mode: 0o700 }
);
try {
	const { default: factory } = await import("../../pi-session-tools/index.js");
	const tools = new Map<string, import("@earendil-works/pi-coding-agent").ToolDefinition>();
	const hooks = new Map<string, () => unknown>();
	const api = new Proxy(
		{
			registerTool: (t: import("@earendil-works/pi-coding-agent").ToolDefinition) => tools.set(t.name, t),
			on: (name: string, fn: () => unknown) => hooks.set(name, fn),
		},
		{ get: (t, k) => (k in t ? t[k as keyof typeof t] : () => undefined) }
	);
	factory(api as unknown as import("@earendil-works/pi-coding-agent").ExtensionAPI);
	const ctx = {
		cwd: root,
		mode: "rpc",
		hasUI: false,
		model: { provider: "fixture", id: "model" },
		sessionManager: { getSessionId: () => "review-synthetic" },
		ui: { notify: () => undefined },
	};
	const controller = new AbortController();
	if (scenario === "preabort") controller.abort();
	const timer = setInterval(() => {
		if (existsSync(join(root, "first-start"))) {
			if (scenario === "switch") ctx.sessionManager.getSessionId = () => "other-session";
			else {
				writeFileSync(join(root, "aborted"), "yes");
				controller.abort();
			}
			clearInterval(timer);
		}
	}, 5);
	const tool = tools.get("subagent");
	if (!tool) throw new Error("No subagent registration");
	const result = await tool.execute(
		"review",
		{ task: "synthetic only", model: "fixture/model" },
		controller.signal,
		undefined,
		ctx as unknown as import("@earendil-works/pi-coding-agent").ExtensionContext
	);
	clearInterval(timer);
	console.log(
		"CALL_RESULT",
		JSON.stringify({ result: result.structuredContent, tabCreated: existsSync(join(root, "tab-was-created")) })
	);
	const calls = existsSync(join(root, "calls.jsonl"))
		? readFileSync(join(root, "calls.jsonl"), "utf8")
				.trim()
				.split("\n")
				.map((s) => JSON.parse(s))
		: [];
	console.log(
		JSON.stringify(
			{
				probe: "retry after abort",
				signalAborted: controller.signal.aborted,
				agentStartsAfterAbort: calls.filter((c) => c.afterAbort && c.args[0] === "agent" && c.args[1] === "start").length,
				result: result.structuredContent,
				calls,
			},
			null,
			2
		)
	);
	await hooks.get("session_shutdown")?.();
} finally {
	process.env = old;
	rmSync(root, { recursive: true, force: true });
}
