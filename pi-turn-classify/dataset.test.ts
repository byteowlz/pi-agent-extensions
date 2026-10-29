import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { DATASET_VERSION, appendRecord, buildRecord, datasetId, datasetToSamples, expandHome, shouldRecord } from "./dataset";
import type { TurnDigest } from "./digest";
import type { TurnCard } from "./schema";

const digest: TurnDigest = {
	userText: "fix the flaky test",
	assistantText: "Fixed it.",
	tools: [{ name: "bash", detail: "bun test" }],
	filesTouched: ["src/a.test.ts"],
	commands: ["bun test"],
	cwd: "/proj/alpha",
	gitRemotes: ["https://github.com/x/alpha.git"],
};

const card: TurnCard = {
	version: 1,
	at: "2026-10-29T09:00:00.000Z",
	sessionId: "s-1",
	cwd: "/proj/alpha",
	turn: 3,
	source: { api: "systemone", model: "vllm-sr/d3-lite", endpoint: "http://x", ms: 700 },
	answers: { activity: { value: "debug", confidence: 0.81 } },
	line: "alpha · debug",
};

function tmp(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "dataset-"));
}

describe("dataset ids and paths", () => {
	test("ids are stable per session and turn", () => {
		expect(datasetId("abc", 2)).toBe("abc:2");
		expect(datasetId("", 1)).toBe("session:1");
	});

	test("~ expands to the home directory", () => {
		expect(expandHome("~/x/dataset.jsonl")).toBe(path.join(os.homedir(), "x/dataset.jsonl"));
		expect(expandHome("/abs/dataset.jsonl")).toBe("/abs/dataset.jsonl");
	});
});

describe("recording decisions", () => {
	test("errors-only keeps just failed turns", () => {
		const options = { path: "/tmp/x.jsonl", errorsOnly: true };
		expect(shouldRecord(options, digest)).toBe(false);
		expect(shouldRecord(options, { ...digest, errored: true })).toBe(true);
		expect(shouldRecord(options, { ...digest, error: { source: "provider", message: "boom" } })).toBe(true);
	});

	test("without the flag every turn is recorded", () => {
		expect(shouldRecord({ path: "/tmp/x.jsonl" }, digest)).toBe(true);
	});
});

describe("appending", () => {
	test("writes one JSONL record per turn, with the digest and the answers", () => {
		const dir = tmp();
		try {
			const file = path.join(dir, "dataset.jsonl");
			const record = buildRecord({
				digest,
				card,
				answers: { activity: { value: "debug", confidence: 0.81, probabilities: { debug: 0.81 } } },
				session: { id: "s-1", file: "/sessions/s-1.jsonl", name: "flaky test" },
				turn: 3,
			});
			expect(record.version).toBe(DATASET_VERSION);
			expect(record.id).toBe("s-1:3");
			expect(record.classification?.model).toBe("vllm-sr/d3-lite");
			expect(record.classification?.answers.activity?.probabilities).toEqual({ debug: 0.81 });
			expect(record.state.userText).toBe("fix the flaky test");

			expect(appendRecord({ path: file }, record)).toBe(true);
			const lines = fs.readFileSync(file, "utf-8").trim().split("\n");
			expect(lines).toHaveLength(1);
			expect(JSON.parse(lines[0] as string).id).toBe("s-1:3");
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("a failed classification still records the digest and the reason", () => {
		const dir = tmp();
		try {
			const file = path.join(dir, "dataset.jsonl");
			const record = buildRecord({
				digest,
				session: { id: "s-1" },
				turn: 4,
				classificationError: "decision API timed out after 20000 ms",
			});
			expect(record.classification).toBeNull();
			expect(record.error).toContain("timed out");
			appendRecord({ path: file }, record);
			const parsed = JSON.parse(fs.readFileSync(file, "utf-8").trim().split("\n")[0] as string);
			// the corpus keeps the turn even when the model was unreachable
			expect(parsed.state.cwd).toBe("/proj/alpha");
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("rotates once the file is over maxBytes and keeps appending", () => {
		const dir = tmp();
		try {
			const file = path.join(dir, "dataset.jsonl");
			const record = buildRecord({ digest, card, session: { id: "s-1" }, turn: 1 });
			// Force rotation with a tiny budget.
			appendRecord({ path: file, maxBytes: 10 }, record);
			appendRecord({ path: file, maxBytes: 10 }, { ...record, id: "s-1:2" });
			appendRecord({ path: file, maxBytes: 10 }, { ...record, id: "s-1:3" });
			expect(fs.existsSync(`${file}.1`)).toBe(true);
			expect(fs.existsSync(file)).toBe(true);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("an unwritable path is refused, never thrown", () => {
		expect(
			appendRecord(
				{ path: "/proc/definitely/not/writable/x.jsonl" },
				buildRecord({ digest, card, session: { id: "s" }, turn: 1 })
			)
		).toBe(false);
	});
});

describe("dataset to bench samples", () => {
	test("only human-labelled records become scoring samples", () => {
		const base = buildRecord({ digest, card, session: { id: "s-1" }, turn: 1 });
		// The model predicted "debug"; the human said "review". The sample must
		// carry the human answer, because a gate labelled by the gate is worthless.
		expect(base.classification?.answers.activity?.value).toBe("debug");
		const samples = datasetToSamples([base, { ...base, id: "s-1:2", labels: { activity: "review", work_done: "yes" } }]);
		expect(samples).toHaveLength(1);
		expect(samples[0]?.expect).toEqual({ activity: "review", work_done: "yes" });
	});
});
