import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
	CARD_STORE_VERSION,
	cardFileName,
	cardsDirectory,
	listSessionCards,
	pruneCards,
	readSessionCards,
	storeStats,
	writeSessionCard,
} from "./card-store";
import type { TurnCard } from "./schema";

function tmp(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "cards-"));
}

function card(overrides: Partial<TurnCard> = {}): TurnCard {
	return {
		version: 1,
		at: "2026-10-29T10:00:00.000Z",
		sessionId: "sess-1",
		sessionFile: "/sessions/sess-1.jsonl",
		cwd: "/proj/alpha",
		turn: 1,
		source: { api: "systemone", model: "vllm-sr/d3-lite", endpoint: "http://x", ms: 700 },
		answers: { activity: { value: "implement", confidence: 0.9 }, work_done: { value: "yes" } },
		line: "alpha · implement · done",
		...overrides,
	};
}

describe("location", () => {
	test("sits beside the sessions in the agent dir, so any consumer finds it", () => {
		expect(cardsDirectory({ agentDir: "/agent" })).toBe("/agent/turn-classify/cards");
		expect(cardsDirectory({ agentDir: "/agent", cardsDir: "/elsewhere" })).toBe("/elsewhere");
	});

	test("default agent dir honours PI_CODING_AGENT_DIR", () => {
		const previous = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = "/custom/agent";
		try {
			expect(cardsDirectory()).toBe("/custom/agent/turn-classify/cards");
		} finally {
			if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previous;
		}
	});

	test("session ids are sanitised into filenames", () => {
		expect(cardFileName("abc-123")).toBe("abc-123.json");
		expect(cardFileName("a/../b")).toBe("a_.._b.json");
		expect(cardFileName("")).toBe("unknown.json");
	});
});

describe("writing", () => {
	test("creates the document with latest and turns, private and atomic", () => {
		const dir = tmp();
		try {
			const options = { cardsDir: dir };
			const document = writeSessionCard(options, card({ turn: 1 }));
			expect(document?.version).toBe(CARD_STORE_VERSION);
			expect(document?.latest.turn).toBe(1);
			expect(document?.turns).toHaveLength(1);

			const file = path.join(dir, "sess-1.json");
			expect(fs.existsSync(file)).toBe(true);
			// no temp files left behind
			expect(fs.readdirSync(dir).filter((name) => name.includes(".tmp-"))).toHaveLength(0);
			// 0600: a card names the cwd, so it stays private
			expect(fs.statSync(file).mode & 0o777).toBe(0o600);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("keeps turns ordered and replaces a re-classified turn instead of duplicating", () => {
		const dir = tmp();
		try {
			const options = { cardsDir: dir };
			writeSessionCard(options, card({ turn: 1, line: "first" }));
			writeSessionCard(options, card({ turn: 2, line: "second" }));
			writeSessionCard(options, card({ turn: 1, line: "first, re-run" }));

			const document = readSessionCards(options, "sess-1");
			expect(document?.turns.map((entry) => entry.turn)).toEqual([1, 2]);
			expect(document?.turns[0]?.line).toBe("first, re-run");
			expect(document?.latest.turn).toBe(2);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("history keeps one line per turn even after full cards roll out", () => {
		const dir = tmp();
		try {
			const options = { cardsDir: dir, keep: 3, historyLimit: 50 };
			for (let turn = 1; turn <= 6; turn += 1) {
				writeSessionCard(options, card({ turn, line: `turn ${turn}` }));
			}
			const document = readSessionCards(options, "sess-1");
			// full detail is bounded…
			expect(document?.turns.map((entry) => entry.turn)).toEqual([4, 5, 6]);
			// …but the scrollback is complete, in order, and compact
			expect(document?.history.map((entry) => entry.turn)).toEqual([1, 2, 3, 4, 5, 6]);
			expect(document?.history[0]?.line).toBe("turn 1");
			expect(Object.keys(document?.history[0] ?? {})).toEqual(["turn", "at", "line"]);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("re-classifying a turn updates its history line instead of duplicating it", () => {
		const dir = tmp();
		try {
			const options = { cardsDir: dir };
			writeSessionCard(options, card({ turn: 1, line: "first" }));
			writeSessionCard(options, card({ turn: 2, line: "second" }));
			writeSessionCard(options, card({ turn: 1, line: "first, re-run" }));
			const document = readSessionCards(options, "sess-1");
			expect(document?.history.map((entry) => entry.turn)).toEqual([1, 2]);
			expect(document?.history[0]?.line).toBe("first, re-run");
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("history is capped so a very long session cannot grow the sidecar without bound", () => {
		const dir = tmp();
		try {
			const options = { cardsDir: dir, keep: 2, historyLimit: 5 };
			for (let turn = 1; turn <= 9; turn += 1) writeSessionCard(options, card({ turn, line: `t${turn}` }));
			const document = readSessionCards(options, "sess-1");
			expect(document?.history.map((entry) => entry.turn)).toEqual([5, 6, 7, 8, 9]);
			// and the whole document stays small
			const bytes = fs.statSync(path.join(dir, "sess-1.json")).size;
			expect(bytes).toBeLessThan(6000);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("keeps only the most recent `keep` cards", () => {
		const dir = tmp();
		try {
			const options = { cardsDir: dir, keep: 3 };
			for (let turn = 1; turn <= 6; turn += 1) writeSessionCard(options, card({ turn }));
			const document = readSessionCards(options, "sess-1");
			expect(document?.turns.map((entry) => entry.turn)).toEqual([4, 5, 6]);
			expect(document?.latest.turn).toBe(6);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("sessions do not share a file, so writers never contend", () => {
		const dir = tmp();
		try {
			const options = { cardsDir: dir };
			writeSessionCard(options, card({ sessionId: "a", turn: 1 }));
			writeSessionCard(options, card({ sessionId: "b", turn: 1, line: "other session" }));
			expect(readSessionCards(options, "a")?.latest.line).toBe("alpha · implement · done");
			expect(readSessionCards(options, "b")?.latest.line).toBe("other session");
			expect(storeStats(options).files).toBe(2);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("an unwritable location is refused, never thrown", () => {
		expect(writeSessionCard({ cardsDir: "/proc/nope/cards" }, card())).toBeUndefined();
	});
});

describe("reading", () => {
	test("a missing or corrupt sidecar reads as undefined", () => {
		const dir = tmp();
		try {
			expect(readSessionCards({ cardsDir: dir }, "nope")).toBeUndefined();
			fs.writeFileSync(path.join(dir, "bad.json"), "{not json");
			expect(readSessionCards({ cardsDir: dir }, "bad")).toBeUndefined();
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("lists sessions newest first for a global view, skipping corrupt files", () => {
		const dir = tmp();
		try {
			const options = { cardsDir: dir };
			const older = writeSessionCard(options, card({ sessionId: "old" }));
			const newer = writeSessionCard(options, card({ sessionId: "new" }));
			// force a deterministic order
			const olderFile = path.join(dir, "old.json");
			const parsed = JSON.parse(fs.readFileSync(olderFile, "utf-8"));
			parsed.updatedAt = "2020-01-01T00:00:00.000Z";
			fs.writeFileSync(olderFile, JSON.stringify(parsed));
			fs.writeFileSync(path.join(dir, "broken.json"), "nope");

			const listed = listSessionCards(options);
			expect(listed.map((entry) => entry.sessionId)).toEqual(["new", "old"]);
			expect(older?.sessionId).toBe("old");
			expect(newer?.sessionId).toBe("new");
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("pruning", () => {
	test("removes only sidecars whose transcript is gone AND that are stale", () => {
		const dir = tmp();
		try {
			const options = { cardsDir: dir };
			const liveTranscript = path.join(dir, "live.jsonl");
			fs.writeFileSync(liveTranscript, "{}\n");

			writeSessionCard(options, card({ sessionId: "live", sessionFile: liveTranscript }));
			writeSessionCard(options, card({ sessionId: "gone", sessionFile: path.join(dir, "missing.jsonl") }));
			writeSessionCard(options, card({ sessionId: "no-file-field", sessionFile: undefined }));

			// Make everything look old.
			for (const name of ["live.json", "gone.json", "no-file-field.json"]) {
				const file = path.join(dir, name);
				const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
				parsed.updatedAt = "2020-01-01T00:00:00.000Z";
				fs.writeFileSync(file, JSON.stringify(parsed));
			}

			const removed = pruneCards({ ...options, maxAgeDays: 30 });
			expect(removed).toBe(1);
			expect(readSessionCards(options, "live")).toBeDefined();
			expect(readSessionCards(options, "gone")).toBeUndefined();
			// no transcript recorded: we cannot prove it is dead, so keep it
			expect(readSessionCards(options, "no-file-field")).toBeDefined();
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
