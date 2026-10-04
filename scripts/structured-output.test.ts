import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionToolContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import rename from "../pi-auto-rename/index.js";
import reflect from "../pi-introspection/index.js";
import todos from "../pi-todolist/index.js";
import { DEFAULT_CONFIG } from "../pi-history-search/config.js";
import { historyOutputSchemas, historyResult } from "../pi-history-search/output.js";
import { memoryOutputSchema, parseMemoryOutput } from "../pi-mmry/src/output.js";
import { checkedContent, checkedItems, laterOutputSchema, readOutput } from "../pi-xlatch-session/src/output.js";
import { subagentOutputSchema, subagentResult } from "../pi-session-tools/output.js";
import { scrubText, scrubValue } from "../pi-kyz/scrub.js";
import manifest from "../docs/structured-output-manifest.json";

test("canonical maintained-tool manifest covers every registration and schema classification", () => {
	const root = join(import.meta.dir, "..");
	const extensions = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name.startsWith("pi-")).map(entry => entry.name).sort();
	expect(Object.keys(manifest.extensions).sort()).toEqual(extensions);
	for (const extension of extensions) {
		const source = readFileSync(join(root, extension, "index.ts"), "utf8");
		const contracts = manifest.extensions[extension as keyof typeof manifest.extensions];
		const registrations = source.match(/\.registerTool\s*\(/g) ?? [];
		expect(registrations.length).toBe(Object.keys(contracts).length);
		if (!registrations.length) continue;
		if (extension === "pi-kyz") expect(source).toContain("...bashTool");
		else if (extension !== "pi-selection") expect((source.match(/outputSchema:/g) ?? []).length).toBe(registrations.length);
	}
});

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function capture(factory: (pi: ExtensionAPI) => void) {
	const cwd = mkdtempSync(join(tmpdir(), "structured-unit-")); dirs.push(cwd);
	const tools = new Map<string, ToolDefinition>();
	let name = "Previous";
	const api = new Proxy({
		registerTool: (tool: ToolDefinition) => tools.set(tool.name, tool),
		getSessionName: () => name, setSessionName: (next: string) => { name = next; },
		getThinkingLevel: () => "off", getAllTools: () => [], getActiveTools: () => [], getCommands: () => [],
	}, { get: (target, key) => key in target ? target[key as keyof typeof target] : () => undefined }) as unknown as ExtensionAPI;
	factory(api);
	const ctx = {
		cwd, hasUI: false, mode: "print", ui: new Proxy({}, { get: () => () => undefined }),
		modelRegistry: { getAll: () => [] }, getContextUsage: () => ({ tokens: null, percent: null, contextWindow: 8192 }),
		sessionManager: { getSessionId: () => "fixture", getSessionName: () => name, getSessionFile: () => undefined, getEntries: () => [], getBranch: () => [], getLeafId: () => null, getCwd: () => cwd },
	} as unknown as ExtensionToolContext;
	return { tools, cwd, ctx, async call(toolName: string, params: Record<string, unknown>, signal?: AbortSignal) {
		const tool = tools.get(toolName); if (!tool) throw new Error(toolName);
		const result = await tool.execute("fixture", params, signal, undefined, ctx);
		expect(tool.outputSchema).toBeDefined();
		expect(Value.Check(tool.outputSchema as Parameters<typeof Value.Check>[0], result.structuredContent)).toBe(true);
		expect(JSON.parse(JSON.stringify(result.structuredContent))).toEqual(result.structuredContent);
		return result;
	} };
}

test("rename emits previous/name and explicit disabled error", async () => {
	const h = capture(rename);
	writeFileSync(join(h.cwd, "auto-rename.json"), JSON.stringify({ readableId: false, enabled: true }));
	const result = await h.call("rename_session", { name: "Fixture Title" });
	expect(result.structuredContent).toMatchObject({ ok: true, action: "rename", previous: "Previous" });
	writeFileSync(join(h.cwd, "auto-rename.json"), JSON.stringify({ enabled: false }));
	expect((await h.call("rename_session", { name: "No" })).isError).toBe(true);
});

test("reflection validates all info choices, absent model and nullable usage", async () => {
	const h = capture(reflect);
	for (const info of ["model", "session", "context", "all"]) await h.call("self_reflection", { info });
});

test("Todo all actions validate, filtered read preserves stored list and bounded views", async () => {
	const h = capture(todos);
	writeFileSync(join(h.cwd, "oqto-todos.json"), JSON.stringify({ storagePath: join(h.cwd, "todos"), tuiWidget: false }));
	await h.call("Todo", { action: "write", todos: [{ id: "a", content: "A", status: "pending" }, { id: "b", content: "B", status: "completed" }] });
	await h.call("Todo", { action: "read", filter: { status: "pending" } });
	const read = await h.call("Todo", { action: "read" });
	expect(read.structuredContent).toMatchObject({ total: 2 });
	await h.call("Todo", { action: "add", content: "C" });
	await h.call("Todo", { action: "update", id: "a", content: "A updated" });
	await h.call("Todo", { action: "remove", id: "b" });
	expect((await h.call("Todo", { action: "update", id: "missing" })).isError).toBe(true);
	await h.call("Todo", { action: "write", todos: Array.from({ length: 201 }, (_, i) => ({ id: `${i}`, content: "x".repeat(5000) })) });
	expect((await h.call("Todo", { action: "read" })).structuredContent).toMatchObject({ total: 201, truncated: true });
	await h.call("Todo", { action: "clear" });
});

test("mmry action contracts allowlist data, bound content, reject malformed JSON", () => {
	const entry = { memory_id: "mem_fixture", content: "Fact", revision: 2, scope: "repo", debug: "must not escape", agent_ctx: { private: true } };
	for (const action of ["search", "create", "supersede", "deprecate"]) {
		const result = parseMemoryOutput(action, JSON.stringify(action === "search" ? [entry] : { ...entry, removed: action === "deprecate" }));
		expect(Value.Check(memoryOutputSchema, result)).toBe(true);
		expect(JSON.stringify(result)).not.toContain("must not escape");
	}
	expect(parseMemoryOutput("search", "[]")).toMatchObject({ entries: [], total: 0 });
	expect(parseMemoryOutput("create", JSON.stringify({ ...entry, content: "a".repeat(5000) }))).toMatchObject({ truncated: true });
	for (const malformed of ["not json", "null", '{"memory_id":"only"}']) expect(() => parseMemoryOutput("create", malformed)).toThrow();
});

test("xlatch validates CLI shapes and non-destructive bounded read", () => {
	const item = { id: "fixture", label: "Text", mime_type: "text/plain", created_at: 1 };
	expect(checkedItems([item])).toHaveLength(1);
	const output = readOutput(checkedContent({ item, input: { text: "a".repeat(20000) } }));
	expect(Value.Check(laterOutputSchema, output)).toBe(true);
	expect(output).toMatchObject({ destructive: false, truncated: true });
	expect(() => checkedItems([{ id: "only" }])).toThrow();
	expect(() => checkedContent(null)).toThrow();
});

test("subagent receipts distinguish spawn, prompt failure and partial effects", () => {
	const child = { name: "agent", paneId: "pane", model: "fixture/model" };
	for (const details of [{ spawned: true, promptSubmitted: true, ...child }, { spawned: true, promptSubmitted: false, ...child }, { spawned: false, partialEffects: true, partialChild: child }, { spawned: false }]) {
		const result = subagentResult("spawn", { content: [{ type: "text", text: "fixture" }], details });
		expect(Value.Check(subagentOutputSchema, result.structuredContent)).toBe(true);
		expect(result.structuredContent).toMatchObject({ completed: false });
	}
	for (const action of ["list", "info"]) expect(Value.Check(subagentOutputSchema, subagentResult(action, { content: [{ type: "text", text: "fixture" }], details: {} }).structuredContent)).toBe(true);
});

test("history structured output respects context budget at evidence boundaries", () => {
	const ctx = { getContextUsage: () => ({ tokens: 8100, contextWindow: 8192 }) } as unknown as ExtensionToolContext;
	const result = historyResult("read", { sessionId: "fixture", project: "synthetic", timestamp: "2026-01-01", totalMessages: 20, mode: "outline", roleFilter: "conversation", truncated: false, messages: Array.from({ length: 20 }, (_, msgIndex) => ({ msgIndex, role: "user", text: "x".repeat(1000) })) }, ctx, DEFAULT_CONFIG);
	expect(Value.Check(historyOutputSchemas.read, result.structuredContent)).toBe(true);
	expect(JSON.stringify(result.structuredContent).length).toBeLessThanOrEqual(4000);
	expect(result.structuredContent).toMatchObject({ completeness: "unknown", absence_is_global: false, truncated: true });
});

test("secret redaction covers text, nested values/keys, encodings, error fields and cycles", () => {
	const marker = "fake/SECRET:structured-fixture";
	const secrets = [{ name: "TEST", value: marker }];
	const object = { content: marker, details: { [marker]: [marker, { error: encodeURIComponent(marker) }] }, structuredContent: { output: Buffer.from(marker).toString("base64") } };
	const scrubbed = scrubValue(object, secrets);
	const serialized = JSON.stringify(scrubbed);
	for (const secret of [marker, encodeURIComponent(marker), Buffer.from(marker).toString("base64")]) expect(serialized).not.toContain(secret);
	expect(scrubText(marker, secrets)).toBe("[REDACTED]");
	const cyclic: { self?: unknown } = {}; cyclic.self = cyclic;
	expect(JSON.stringify(scrubValue(cyclic, secrets))).toContain("non-json");
});
