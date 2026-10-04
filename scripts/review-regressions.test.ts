import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { subagentResult } from "../pi-herdr-tools/output.js";
import { scrubText } from "../pi-kyz/scrub.js";
import { secretStream } from "../pi-kyz/stream.js";
import { listOutput, readOutput } from "../pi-xlatch-session/src/output.js";

function lifecycle(scenario: string) {
	const home = mkdtempSync(join(tmpdir(), "subagent-test-"));
	try {
		const run = spawnSync(process.execPath, [join(import.meta.dirname, "fixtures/subagent-lifecycle.ts")], {
			env: {
				HOME: home,
				REVIEW_HOME_ROOT: home,
				REVIEW_SCENARIO: scenario,
				PATH: "/usr/bin:/bin",
				...(process.env.REVIEW_NODE_BIN ? { REVIEW_NODE_BIN: process.env.REVIEW_NODE_BIN } : {}),
			},
			encoding: "utf8",
			timeout: 10000,
		});
		expect(run.status).toBe(0);
		const line = run.stdout.split("\n").find((line) => line.startsWith("CALL_RESULT "));
		if (!line) throw new Error(run.stderr || "Missing fixture result");
		const data = JSON.parse(line.slice("CALL_RESULT ".length));
		const trace = JSON.parse(run.stdout.slice(run.stdout.indexOf("\n{") + 1));
		return { ...data, trace };
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
}
describe("review regressions", () => {
	test("abort during retry prevents later agent starts", () => {
		const { result, trace } = lifecycle("abort");
		expect(trace.agentStartsAfterAbort).toBe(0);
		expect(result.error.code).toBe("cancelled");
		expect(result.effects).toBe("possible");
	});
	test("session switch during retry prevents later agent starts", () => {
		const { result, trace } = lifecycle("switch");
		expect(trace.calls.filter((call: { args: string[] }) => call.args[0] === "agent" && call.args[1] === "start")).toHaveLength(
			1
		);
		expect(result.ok).toBe(false);
	});
	test("uncertain dispatched tab effect is never none", () => {
		const { result, tabCreated } = lifecycle("uncertain");
		expect(tabCreated).toBe(true);
		expect(result.effects).toBe("possible");
		expect(result.promptSubmitted).toBe(false);
	});
	test("pre-dispatch cancellation is effects none", () => {
		const { result, trace } = lifecycle("preabort");
		expect(result.effects).toBe("none");
		expect(trace.calls).toHaveLength(0);
	});
	test("xlatch whole list bound counts omissions without changing identities", () => {
		const items = Array.from({ length: 100 }, (_, i) => ({
			id: String(i),
			label: "\\u0000".repeat(2000),
			mime_type: "text/plain",
			created_at: 1,
		}));
		const result = listOutput(items);
		expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(32000);
		expect(result.total).toBe(100);
		expect(result.truncated).toBe(true);
		expect(result.items[0].id).toBe("0");
	});
	test("JSON escaped credentials are scrubbed before accumulation, even byte chunks", () => {
		const value = 'fixture\\password"\n秘密';
		const secrets = [{ name: "fixture", value }];
		const encoded = JSON.stringify(value).slice(1, -1);
		expect(scrubText(encoded, secrets)).toBe("[REDACTED]");
		const parts: Buffer[] = [];
		const stream = secretStream(secrets, (b) => parts.push(b));
		for (const byte of Buffer.from(`prefix ${encoded} suffix`)) stream.write(Buffer.from([byte]));
		stream.end();
		expect(Buffer.concat(parts).toString()).toBe("prefix [REDACTED] suffix");
	});
	test("stream retains unrelated emoji at its moving source boundary", () => {
		const value = "known-password";
		const input = "😀".repeat(100) + value + "😀".repeat(100);
		const parts: Buffer[] = [];
		const stream = secretStream([{ name: "fixture", value }], (b) => parts.push(b));
		for (const byte of Buffer.from(input)) stream.write(Buffer.from([byte]));
		stream.end();
		expect(Buffer.concat(parts).toString()).toBe(input.replace(value, "[REDACTED]"));
	});
	test("nested JSON encodings and malformed Unicode do not bypass or crash scrubbing", () => {
		const value = 'fixture\\password"\n秘密';
		const secrets = [{ name: "fixture", value }];
		let encoded = value;
		for (let depth = 0; depth < 3; depth++) {
			encoded = JSON.stringify(encoded).slice(1, -1);
			expect(scrubText(encoded, secrets)).toBe("[REDACTED]");
		}
		expect(scrubText("bad\ud800", [{ name: "fixture", value: "bad\ud800" }])).toBe("[REDACTED]");
	});
	test("oversized opaque read identity is rejected, never shortened", () => {
		expect(() =>
			readOutput({
				item: { id: "x".repeat(40000), label: "label", mime_type: "text/plain", created_at: 1 },
				input: { text: "short" },
			})
		).toThrow("identity metadata");
	});
	test("catalog fits a whole receipt budget", () => {
		const result = subagentResult("info", {
			content: [{ type: "text", text: "catalog" }],
			details: {
				catalog: {
					models: Array.from({ length: 100 }, (_, i) => ({
						id: String(i),
						provider: "fixture",
						tags: Array.from({ length: 100 }, () => "界".repeat(1000)),
					})),
					loadouts: {},
				},
			},
		});
		expect(Buffer.byteLength(JSON.stringify(result.structuredContent))).toBeLessThanOrEqual(32000);
		expect((result.structuredContent as { truncated: boolean }).truncated).toBe(true);
	});
	test("xlatch metadata clipping is advertised and opaque identity retained", () => {
		const id = "opaque".repeat(200);
		const result = readOutput({
			item: { id, label: "界".repeat(1500), mime_type: "text/plain", created_at: 1 },
			input: { text: "short" },
		});
		expect(result.item.id).toBe(id);
		expect(result.truncated).toBe(true);
		expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(32000);
	});
});
