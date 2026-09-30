import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import piMmry from "./index.ts";
import { ATTACHED_ENTRY, FRAMING, OFF_ENTRY, RECALL_MESSAGE, sha256 } from "./src/core.ts";

const FAKE = join(import.meta.dir, "test", "fake-mmry.ts");
const PREVIEW = readFileSync(join(import.meta.dir, "test", "preview.json"), "utf8");
const RENDERED: string = JSON.parse(PREVIEW).rendered;

type Handler = (event: unknown, ctx: unknown) => unknown;
interface Entry {
	type: string;
	customType: string;
	data: unknown;
}
interface ToolResult {
	content: { type: string; text: string }[];
	isError?: boolean;
}

let root: string;
let fakeDir: string;
let stderr: string[];
const realStderrWrite = process.stderr.write.bind(process.stderr);

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "pi-mmry-"));
	fakeDir = join(root, "fake");
	mkdirSync(fakeDir);
	process.env.FAKE_MMRY_DIR = fakeDir;
	process.env.PI_CODING_AGENT_DIR = join(root, "agent");
	process.env.PI_MMRY_RECALL = "";
	writeFileSync(join(fakeDir, "preview.json"), PREVIEW);
	stderr = [];
	process.stderr.write = ((chunk: string) => {
		stderr.push(String(chunk));
		return true;
	}) as typeof process.stderr.write;
});

afterEach(() => {
	process.stderr.write = realStderrWrite;
	rmSync(root, { recursive: true, force: true });
});

/** A project directory with an enabled pi-mmry config pointing at the fake mmry. */
function project(name: string, config: Record<string, unknown> = {}): string {
	const dir = join(root, name);
	mkdirSync(join(dir, ".pi"), { recursive: true });
	writeFileSync(
		join(dir, ".pi", "mmry-recall.json"),
		JSON.stringify({ enabled: true, mmryBin: FAKE, metricsPath: join(root, "metrics.jsonl"), ...config })
	);
	return dir;
}

function calls(): { args: string[]; cwd: string }[] {
	const path = join(fakeDir, "argv.jsonl");
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
}

function harness(opts: { cwd: string; hasUI?: boolean; entries?: Entry[]; flag?: boolean }) {
	const handlers = new Map<string, Handler>();
	const tools = new Map<string, { execute: (...args: unknown[]) => Promise<ToolResult> }>();
	const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>();
	const entries: Entry[] = opts.entries ?? [];
	const widgets: (string[] | undefined)[] = [];
	const notices: { message: string; type?: string }[] = [];
	let active = ["read", "bash", "memory_search", "memory_create", "memory_supersede", "memory_deprecate"];

	const pi = {
		on: (event: string, handler: Handler) => handlers.set(event, handler),
		registerFlag: () => undefined,
		getFlag: (name: string) => (name === "mmry-recall" ? opts.flag : undefined),
		registerCommand: (name: string, command: { handler: (args: string, ctx: unknown) => Promise<void> }) =>
			commands.set(name, command),
		registerTool: (tool: { name: string; execute: (...args: unknown[]) => Promise<ToolResult> }) => tools.set(tool.name, tool),
		appendEntry: (customType: string, data: unknown) => entries.push({ type: "custom", customType, data }),
		getActiveTools: () => active,
		setActiveTools: (names: string[]) => {
			active = names;
		},
		exec: (command: string, args: string[], options: { cwd: string; timeout: number }) =>
			new Promise((resolve, reject) => {
				execFile(command, args, { cwd: options.cwd, timeout: options.timeout }, (error, stdout, stderrText) => {
					const code = (error as { code?: unknown } | null)?.code;
					if (code === "ENOENT") return reject(error);
					resolve({ stdout, stderr: stderrText, code: typeof code === "number" ? code : 0, killed: false });
				});
			}),
	};
	piMmry(pi as never);

	const ctx = {
		cwd: opts.cwd,
		hasUI: opts.hasUI ?? true,
		ui: {
			setWidget: (_key: string, lines: string[] | undefined) => widgets.push(lines),
			setStatus: () => undefined,
			notify: (message: string, type?: string) => notices.push({ message, type }),
		},
		sessionManager: { getEntries: () => entries, getSessionId: () => "sess_test" },
	};
	const emit = (event: string) => handlers.get(event)?.({ type: event, prompt: "hi" }, ctx) as Promise<unknown>;
	return {
		ctx,
		entries,
		widgets,
		notices,
		tools,
		active: () => active,
		start: () => emit("session_start"),
		prompt: () => emit("before_agent_start") as Promise<{ message: { customType: string; content: string } } | undefined>,
		command: (args: string) => commands.get("memory")?.handler(args, ctx),
		tool: (name: string, params: unknown) =>
			tools.get(name)?.execute("call", params, undefined, undefined, ctx) as Promise<ToolResult>,
	};
}

/** The rendered block exactly as it appears in the widget (header line, then verbatim rendered lines). */
function shownRendered(lines: string[] | undefined): string {
	const body = (lines ?? []).slice(1);
	const end = body.indexOf("</mmry>");
	return `${body.slice(0, end + 1).join("\n")}\n`;
}

describe("session-start recall", () => {
	test("first prompt gets exactly the shown bytes, once", async () => {
		const h = harness({ cwd: project("app") });
		await h.start();
		expect(calls()[0].args).toEqual(["preview", "--json", "--cwd", h.ctx.cwd, "--max-tokens", "400", "--limit", "8"]);
		const shown = shownRendered(h.widgets.at(-1));
		expect(shown).toBe(RENDERED);
		expect(h.widgets.at(-1)?.join("\n")).toContain("contested (withheld; resolve with mmry supersede/rm): mem_withheld");

		const result = await h.prompt();
		expect(result?.message.customType).toBe(RECALL_MESSAGE);
		expect(result?.message.content).toBe(FRAMING + shown);
		const marker = h.entries.find((entry) => entry.customType === ATTACHED_ENTRY)?.data as { sha256: string };
		expect(marker.sha256).toBe(sha256(shown));
		expect(h.widgets.at(-1)).toBeUndefined();

		expect(await h.prompt()).toBeUndefined();
		expect(calls()).toHaveLength(1);
	});

	test("resume does not fetch, show or attach again", async () => {
		const first = harness({ cwd: project("app") });
		await first.start();
		await first.prompt();
		const resumed = harness({ cwd: first.ctx.cwd, entries: first.entries });
		await resumed.start();
		expect(await resumed.prompt()).toBeUndefined();
		expect(resumed.widgets).toEqual([]);
		expect(calls()).toHaveLength(1);
	});

	test("cwd change shows the new selection before it can be attached", async () => {
		const h = harness({ cwd: project("app") });
		await h.start();
		await h.prompt();
		h.ctx.cwd = project("other");
		expect(await h.prompt()).toBeUndefined();
		expect(shownRendered(h.widgets.at(-1))).toBe(RENDERED);
		expect(calls().at(-1)?.args).toContain(h.ctx.cwd);
		const result = await h.prompt();
		expect(result?.message.content).toBe(FRAMING + RENDERED);
		expect(h.entries.filter((entry) => entry.customType === ATTACHED_ENTRY)).toHaveLength(2);
	});

	test("headless defaults to off: nothing shown, nothing attached", async () => {
		const h = harness({ cwd: project("app"), hasUI: false });
		await h.start();
		expect(await h.prompt()).toBeUndefined();
		expect(stderr.join("")).not.toContain("<mmry>");
	});

	test("headless report prints the exact block to stderr, then attaches it", async () => {
		const h = harness({ cwd: project("app", { headless: "report" }), hasUI: false });
		await h.start();
		expect(stderr.join("")).toContain(RENDERED);
		const result = await h.prompt();
		expect(result?.message.content).toBe(FRAMING + RENDERED);
	});

	test("/memory off prevents attaching, persists, and metrics hold no content", async () => {
		const h = harness({ cwd: project("app") });
		await h.start();
		await h.command("off");
		expect(await h.prompt()).toBeUndefined();
		expect(h.entries.at(-1)).toEqual({ type: "custom", customType: OFF_ENTRY, data: { off: true } });

		const resumed = harness({ cwd: h.ctx.cwd, entries: h.entries });
		await resumed.start();
		expect(await resumed.prompt()).toBeUndefined();

		await resumed.command("on");
		expect((await resumed.prompt())?.message.content).toBe(FRAMING + RENDERED);

		const metrics = readFileSync(join(root, "metrics.jsonl"), "utf8");
		expect(metrics).toContain('"event":"off"');
		expect(metrics).toContain('"event":"attached","entries":2,"tokens":95');
		expect(metrics).not.toContain("check-all");
		expect(metrics).not.toContain("mem_");
	});

	test("/memory list shows the same selection with revision, scope, age and machine", async () => {
		const h = harness({ cwd: project("app") });
		await h.start();
		await h.command("list");
		expect(h.widgets.at(-1)).toEqual([
			"mem_86fa41fc-2cb7-4cd5-b171-39c3efd0087e r1 [repo r] 0d: use just check-all",
			"mem_b63affa3-5544-4e8d-9da6-546f0a6b00a3 r1 [general] 0d, machine arch-dev-01: prefer uname -n",
		]);
		expect(calls()).toHaveLength(1);
	});

	test("a contested entry in the preview disables recall", async () => {
		const preview = JSON.parse(PREVIEW);
		preview.entries[1].contested = true;
		writeFileSync(join(fakeDir, "preview.json"), JSON.stringify(preview));
		const h = harness({ cwd: project("app") });
		await h.start();
		expect(await h.prompt()).toBeUndefined();
		expect(h.notices.at(-1)?.message).toContain("contested memories (mem_b63affa3-5544-4e8d-9da6-546f0a6b00a3)");
		expect(h.notices.at(-1)?.type).toBe("warning");
	});

	test("missing mmry disables recall and tools with a notice", async () => {
		const h = harness({ cwd: project("app", { mmryBin: join(root, "no-such-mmry") }) });
		await h.start();
		expect(await h.prompt()).toBeUndefined();
		expect(h.notices.at(-1)?.message).toContain("recall disabled: cannot run");
		expect(h.active()).toEqual(["read", "bash"]);
	});

	test("an mmry without preview disables recall with its own error", async () => {
		writeFileSync(join(fakeDir, "preview.stderr"), "error: unrecognized subcommand 'preview'\n");
		writeFileSync(join(fakeDir, "preview.code"), "2");
		const h = harness({ cwd: project("app") });
		await h.start();
		expect(await h.prompt()).toBeUndefined();
		expect(h.notices.at(-1)?.message).toBe("recall disabled: error: unrecognized subcommand 'preview'");
	});

	test("an unknown preview schema disables recall", async () => {
		writeFileSync(join(fakeDir, "preview.json"), JSON.stringify({ ...JSON.parse(PREVIEW), schema_version: 2 }));
		const h = harness({ cwd: project("app") });
		await h.start();
		expect(await h.prompt()).toBeUndefined();
		expect(h.notices.at(-1)?.message).toContain("unsupported mmry preview schema_version 2");
	});

	test("disabled by default: no mmry call, tools inactive", async () => {
		const dir = project("app", { enabled: false });
		const h = harness({ cwd: dir });
		await h.start();
		expect(await h.prompt()).toBeUndefined();
		expect(calls()).toEqual([]);
		expect(h.active()).toEqual(["read", "bash"]);
	});

	test("--mmry-recall and PI_MMRY_RECALL enable it", async () => {
		const dir = project("app", { enabled: false });
		const flagged = harness({ cwd: dir, flag: true });
		await flagged.start();
		expect((await flagged.prompt())?.message.content).toBe(FRAMING + RENDERED);

		process.env.PI_MMRY_RECALL = "1";
		const env = harness({ cwd: dir });
		await env.start();
		expect((await env.prompt())?.message.content).toBe(FRAMING + RENDERED);
	});
});

describe("memory tools", () => {
	test("each tool maps to the exact mmry argv in the session cwd", async () => {
		const h = harness({ cwd: project("app") });
		await h.start();
		writeFileSync(join(fakeDir, "search.json"), '[{"memory_id":"mem_1"}]\n');
		writeFileSync(join(fakeDir, "add.json"), '{"memory_id":"mem_2"}\n');

		const search = await h.tool("memory_search", { query: "--weird", limit: 3 });
		expect(search.content[0].text).toBe('[{"memory_id":"mem_1"}]');
		await h.tool("memory_search", { query: "vpn" });
		const created = await h.tool("memory_create", {
			content: "-x is gone",
			why: "breaks CI",
			source: "issue 12",
			scope: "general",
			expires: "30d",
		});
		expect(created.content[0].text).toBe('{"memory_id":"mem_2"}');
		await h.tool("memory_create", { content: "repo fact" });
		await h.tool("memory_supersede", { id: "mem_1", replacement: "new", reason: "changed", expected_revision: 2 });
		await h.tool("memory_deprecate", { id: "mem_1", reason: "obsolete", expected_revision: 3 });

		expect(calls().slice(1)).toEqual(
			[
				["search", "--json", "--limit", "3", "--", "--weird"],
				["search", "--json", "--limit", "10", "--", "vpn"],
				["add", "--json", "--general", "--why", "breaks CI", "--source", "issue 12", "--expires", "30d", "--", "-x is gone"],
				["add", "--json", "--", "repo fact"],
				["supersede", "--json", "--reason", "changed", "--expected-revision", "2", "--", "mem_1", "new"],
				["rm", "--json", "--reason", "obsolete", "--expected-revision", "3", "--", "mem_1"],
			].map((args) => ({ args, cwd: h.ctx.cwd }))
		);
	});

	test("mmry errors pass through verbatim", async () => {
		const h = harness({ cwd: project("app") });
		await h.start();
		const message = "error: mem_1 is at revision 3, expected 2 (re-read it with `mmry show mem_1`)";
		writeFileSync(join(fakeDir, "supersede.stderr"), `${message}\n`);
		const result = await h.tool("memory_supersede", { id: "mem_1", replacement: "x", reason: "r", expected_revision: 2 });
		expect(result).toMatchObject({ isError: true, content: [{ type: "text", text: message }] });
	});

	test("the stdin marker is refused as content", async () => {
		const h = harness({ cwd: project("app") });
		await h.start();
		const result = await h.tool("memory_create", { content: "-" });
		expect(result.isError).toBe(true);
		expect(calls()).toHaveLength(1);
	});
});
