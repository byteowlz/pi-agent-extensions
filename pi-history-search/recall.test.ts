import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CONFIG } from "./config";
import historySearch, { formatGrep, runSearchReport } from "./index";
import { closeAll, extractMessages, grepSession, projectDir, readSession, searchProject } from "./indexer";
import { bestEvidence, formatRecall, isNeedle } from "./recall";

let base = "";
function setup() {
	base = mkdtempSync(join(tmpdir(), "pi-recall-"));
	const cwd = join(base, "project");
	mkdirSync(cwd);
	const config = { ...DEFAULT_CONFIG, sessionsDir: join(base, "sessions"), includeToolResults: false };
	const dir = projectDir(config.sessionsDir, cwd);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(cwd, "history-search.json"), JSON.stringify(config));
	const ctx = {
		cwd,
		sessionManager: { getSessionId: () => "current" },
		getContextUsage: () => undefined,
	} as unknown as ExtensionContext;
	return { config, dir, ctx };
}
function session(dir: string, id: string, messages: { role: string; text: string }[]) {
	const file = join(dir, `2026-01-01T00-00-00-000Z_${id}.jsonl`);
	writeFileSync(
		file,
		[
			{ type: "session", id, cwd: "/fixture" },
			...messages.map((m) => ({ type: "message", message: { role: m.role, content: [{ type: "text", text: m.text }] } })),
		]
			.map((e) => JSON.stringify(e))
			.join("\n")
	);
	return file;
}
afterEach(() => {
	closeAll();
	if (base) rmSync(base, { recursive: true, force: true });
});

describe("recall contract", () => {
	test("needle classification", () => {
		expect(
			[
				"admin@fixture.local",
				"/srv/app.env",
				"parseHeader",
				"KEY=value",
				"ERROR",
				"host-name",
				String.raw`admin@fixture\.local`,
				'"two words"',
			].map(isNeedle)
		).toEqual(Array(8).fill(true));
		expect(["allocation policy registry", "what did we decide about bb", ""].map(isNeedle)).toEqual([false, false, false]);
	});
	test("all-role evidence selection finds a late field value beyond repeated topic mentions", () => {
		const noise = "The service password will be configured later. ".repeat(200);
		const text = `${noise}\nSERVICE_PASSWORD=fixtureValue\n`;
		const messages = [
			{ role: "user", text: "what password did we set for service" },
			{ role: "toolResult", text },
		];
		const best = bestEvidence(messages, "service password", "all");
		expect(best).toEqual({
			role: "toolResult",
			msgIndex: 1,
			snippet: text.slice(text.indexOf("SERVICE_PASSWORD") - 60),
			matchPosition: text.indexOf("SERVICE_PASSWORD"),
			score: 5.2,
		});
	});
	test("FTS ranking includes tool evidence even with tool indexing disabled in config", async () => {
		const { config, dir, ctx } = setup();
		const file = session(dir, "answer", [
			{ role: "user", text: "service password setup" },
			{ role: "toolResult", text: `${"noise ".repeat(2000)}SERVICE_PASSWORD=fixtureValue` },
		]);
		const report = await runSearchReport(ctx, config, { query: "what password did we set for service" });
		expect(report.attempts).toEqual(["fts"]);
		expect(report.hits.map((h) => ({ id: h.sessionId, role: h.matches[0].role, msgIndex: h.matches[0].msgIndex }))).toEqual([
			{ id: "answer", role: "toolResult", msgIndex: 1 },
		]);
		const match = report.hits[0].matches[0];
		expect(
			readSession(file, { around: match.msgIndex, matchPosition: match.matchPosition, before: 0, after: 0, maxChars: 300 })
				.messages[0].text
		).toContain("SERVICE_PASSWORD=fixtureValue");
	});
	test("exact preserves whitespace/case and never falls back", async () => {
		const { config, dir, ctx } = setup();
		session(dir, "answer", [{ role: "toolResult", text: "before\nExact  Value\nafter" }]);
		const report = await runSearchReport(ctx, config, { query: "Exact  Value", mode: "exact" });
		expect(report.hits[0].matches).toEqual([
			{ role: "toolResult", msgIndex: 0, snippet: "before\nExact  Value\nafter", matchPosition: 7 },
		]);
		const miss = await runSearchReport(ctx, config, { query: "exact value", mode: "exact" });
		expect({
			hits: miss.hits,
			attempts: miss.attempts,
			completeness: miss.completeness,
			absence: miss.absence_is_global,
		}).toEqual({ hits: [], attempts: ["literal"], completeness: "unknown", absence: false });
	});
	test("grep regex fallback is explicit, optional, and reads unnormalized text", () => {
		const { dir } = setup();
		const file = session(dir, "answer", [{ role: "toolResult", text: "mail: admin@fixture.local\nnext line" }]);
		const pattern = String.raw`admin@fixture\.local`;
		const r = grepSession(file, { pattern });
		expect({ attempts: r.attempts, regex: r.regex, indices: r.matches.map((m) => [m.msgIndex, m.matchPosition]) }).toEqual({
			attempts: ["literal", "regex"],
			regex: true,
			indices: [[0, 6]],
		});
		expect(grepSession(file, { pattern, fallback: false }).attempts).toEqual(["literal"]);
		expect(grepSession(file, { pattern: "local\nnext" }).matchedMessages).toBe(1);
		const invalid = grepSession(file, { pattern: "(unclosed" });
		expect({ attempts: invalid.attempts, warnings: invalid.warnings }).toEqual({
			attempts: ["literal", "regex"],
			warnings: ["Invalid regex fallback; literal pass found no matches."],
		});
		expect(formatGrep(invalid)).toContain('"attempts":["literal","regex"]');
	});
	test("needle scan falls back globally, not in projects with only token matches", async () => {
		const { config, dir, ctx } = setup();
		session(dir, "literal", [{ role: "toolResult", text: "admin@fixture.local" }]);
		const other = projectDir(config.sessionsDir, "/other");
		mkdirSync(other, { recursive: true });
		session(other, "token", [{ role: "user", text: "admin fixture local" }]);
		const report = await runSearchReport(ctx, config, { query: "admin@fixture.local", scope: "all" });
		expect({ attempts: report.attempts, ids: report.hits.map((h) => h.sessionId) }).toEqual({
			attempts: ["literal"],
			ids: ["literal"],
		});
		const regex = await runSearchReport(ctx, config, { query: String.raw`admin@fixture\.local`, scope: "all" });
		expect(regex.attempts).toEqual(["literal", "regex"]);
	});
	test("empty branch scope cannot escape into project results, even with an existing index", async () => {
		const { config, dir, ctx } = setup();
		session(dir, "current", [{ role: "user", text: "word" }]);
		await searchProject(dir, "word", config, 10, true);
		expect((await runSearchReport(ctx, config, { query: "word", scope: "descendants" })).hits).toEqual([]);
		expect(await searchProject(dir, "word", config, 10, true, "all", new Set())).toEqual([]);
	});
	test("serialized budgets include escaped text and metadata; strict roles stay strict", async () => {
		const { config, dir, ctx } = setup();
		for (let i = 0; i < 15; i++) session(dir, `s${i}`, [{ role: "toolResult", text: `KEY=value ${'\n"\\'.repeat(400)}` }]);
		const report = await runSearchReport(ctx, config, { query: "KEY=value" });
		for (const budget of [1000, 3000, 6000]) {
			const text = formatRecall(report, budget);
			expect(text.length).toBeLessThanOrEqual(budget);
			const output = JSON.parse(text);
			expect(output.truncated).toBe(true);
			expect(output.hits.every((h: { matches: { snippet: string }[] }) => h.matches[0].snippet.length <= 300)).toBe(true);
		}
		expect((await runSearchReport(ctx, config, { query: "KEY=value", roleFilter: "user" })).hits).toEqual([]);
	});
	test("registered search response and single anchored read use the same evidence", async () => {
		const { dir, ctx } = setup();
		session(dir, "answer", [{ role: "toolResult", text: `${"noise ".repeat(3000)}KEY=fixtureValue` }]);
		const tools = new Map<string, Parameters<ExtensionAPI["registerTool"]>[0]>();
		historySearch({
			registerTool: (t) => tools.set(t.name, t),
			on: () => undefined,
			registerCommand: () => undefined,
			registerShortcut: () => undefined,
		} as unknown as ExtensionAPI);
		expect(tools.get("HistorySearch")?.promptGuidelines).toEqual([
			"After compaction, use HistorySearch with scope='current-branch' to recover details missing from the summary before re-deriving them.",
			"Use HistorySearch with scope='current-tree' for related branches. It excludes the active session by default; also search scope='current-branch' when both are relevant.",
			"Expand HistorySearch evidence with HistoryRead{sessionId, around: msgIndex, matchPosition}, preserving both anchors to reach details deep inside long messages.",
			"A HistorySearch miss is not proof of absence: check scope, filters, and attempts; use mode='grep' for a literal-first scan that bypasses stale indexes.",
		]);
		expect(tools.get("HistorySearch")?.parameters.properties.scope.description).toContain("excludeCurrentSession=false");
		expect(tools.get("HistoryGrep")?.description).not.toContain("tokenized BM25");
		const r = await tools.get("HistorySearch")?.execute("test", { query: "KEY=fixtureValue" }, undefined, undefined, ctx);
		const text = r?.content[0];
		if (text?.type !== "text") throw new Error("missing text");
		expect(text.text.length).toBeLessThanOrEqual(3000);
		const h = JSON.parse(text.text).hits[0];
		const read = await tools
			.get("HistoryRead")
			?.execute(
				"test",
				{ sessionId: h.sessionId, around: h.matches[0].msgIndex, matchPosition: h.matches[0].matchPosition, before: 0, after: 0 },
				undefined,
				undefined,
				ctx
			);
		expect(JSON.stringify(read?.content)).toContain("KEY=fixtureValue");
	});
	test("structured field evidence beats prose instructions mentioning more query words", () => {
		const best = bestEvidence(
			[
				{ role: "toolResult", text: "ADMIN_PASSWORD=fixtureValue" },
				{ role: "assistant", text: "service admin password: cat admin.env" },
			],
			"service admin password",
			"all"
		);
		expect(best).toEqual({
			role: "toolResult",
			msgIndex: 0,
			snippet: "ADMIN_PASSWORD=fixtureValue",
			matchPosition: 0,
			score: 5.2,
		});
	});
	test("regex zero-width prefixes do not hide later nonempty matches", async () => {
		const { config, dir, ctx } = setup();
		session(dir, "answer", [{ role: "toolResult", text: "abc KEY=value" }]);
		const report = await runSearchReport(ctx, config, { query: "^|KEY=value", mode: "regex" });
		expect(report.hits[0].matches[0].matchPosition).toBe(4);
	});
	test("recent listing is anchored and bounded", async () => {
		const { config, dir, ctx } = setup();
		session(dir, "answer", [{ role: "toolResult", text: "first evidence" }]);
		const report = await runSearchReport(ctx, config, {});
		expect({ attempts: report.attempts, match: report.hits[0].matches[0] }).toEqual({
			attempts: ["recent"],
			match: { role: "toolResult", msgIndex: 0, snippet: "first evidence", matchPosition: 0 },
		});
	});
	test("an explicit missing project is not widened to all projects", async () => {
		const { config, dir, ctx } = setup();
		session(dir, "answer", [{ role: "toolResult", text: "KEY=value" }]);
		const report = await runSearchReport(ctx, config, { query: "KEY=value", scope: "all", project: "sessions" });
		expect(report.hits).toEqual([]);
	});
	test("message ordinals stay stable for empty entries", () => {
		expect(
			extractMessages(
				'{"type":"message","message":{"role":"assistant","content":[]}}\n{"type":"message","message":{"role":"toolResult","content":"a\\nb"}}'
			).messages
		).toEqual([
			{ role: "assistant", text: "" },
			{ role: "toolResult", text: "a\nb" },
		]);
	});
});
