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
	seedSessionCards,
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
			// the timeline carries the fields a change-over-time view needs
			expect(document?.history[0]).toMatchObject({ turn: 1, at: "2026-10-29T10:00:00.000Z", line: "turn 1" });
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

	test("an ordinary session keeps every turn (the budget only binds pathological ones)", () => {
		const dir = tmp();
		try {
			const options = { cardsDir: dir };
			// 30 turns is the median session here.
			for (let turn = 1; turn <= 30; turn += 1) writeSessionCard(options, card({ turn }));
			const document = readSessionCards(options, "sess-1");
			expect(document?.turns).toHaveLength(30);
			expect(document?.turns.map((entry) => entry.turn)).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("a very long session keeps every turn: the limit is a safety valve, not a budget", () => {
		const dir = tmp();
		try {
			const fat = card({
				...card(),
				answers: Object.fromEntries(
					Array.from({ length: 8 }, (_, index) => [
						`q${index}`,
						{ value: "v", confidence: 0.9, probabilities: { alpha: 0.5, beta: 0.5 } },
					])
				),
			});
			for (let turn = 1; turn <= 400; turn += 1) {
				writeSessionCard({ cardsDir: dir }, { ...fat, turn, line: `t${turn}` });
			}
			const document = readSessionCards({ cardsDir: dir }, "sess-1");
			// 400 fat cards is ~500 kB: kept in full, because a full read is rare and
			// the story is the point.
			expect(document?.turns).toHaveLength(400);
			expect(document?.history).toHaveLength(400);
			expect(fs.statSync(path.join(dir, "sess-1.json")).size).toBeLessThan(8 * 1024 * 1024);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("the safety valve still bounds an absurd explicit budget", () => {
		const dir = tmp();
		try {
			const options = { cardsDir: dir, maxBytes: 8192 };
			for (let turn = 1; turn <= 200; turn += 1) writeSessionCard(options, card({ turn, line: `t${turn}` }));
			const document = readSessionCards(options, "sess-1");
			// full cards are shed down to the floor…
			expect(document?.turns.length).toBeLessThanOrEqual(5);
			expect(document?.latest.turn).toBe(200);
			// …and the timeline is never trimmed by the valve: it is the point of the store
			expect(document?.history).toHaveLength(200);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("timeline entries carry the fields that change over time", () => {
		const dir = tmp();
		try {
			writeSessionCard(
				{ cardsDir: dir },
				card({
					turn: 1,
					line: "eavs · implement · unfinished",
					answers: {
						project: { value: "eavs" },
						activity: { value: "implement" },
						work_done: { value: "no" },
						blocked: { value: "yes" },
					},
				})
			);
			writeSessionCard(
				{ cardsDir: dir },
				card({
					turn: 2,
					line: "eavs · debug · done",
					answers: { project: { value: "eavs" }, activity: { value: "debug" }, work_done: { value: "yes" } },
				})
			);
			const document = readSessionCards({ cardsDir: dir }, "sess-1");
			expect(document?.history[0]).toEqual({
				turn: 1,
				at: "2026-10-29T10:00:00.000Z",
				line: "eavs · implement · unfinished",
				project: "eavs",
				activity: "implement",
				work_done: "no",
				blocked: "yes",
				needs: "answer",
			});
			// a later turn that answers less is still a valid point on the timeline
			expect(document?.history[1]).toMatchObject({ turn: 2, activity: "debug", work_done: "yes" });
			expect(document?.history[1]?.blocked).toBeUndefined();
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("an explicit keep still wins when a caller wants a hard cap", () => {
		const dir = tmp();
		try {
			const options = { cardsDir: dir, keep: 3 };
			for (let turn = 1; turn <= 6; turn += 1) writeSessionCard(options, card({ turn }));
			const document = readSessionCards(options, "sess-1");
			expect(document?.turns.map((entry) => entry.turn)).toEqual([4, 5, 6]);
			expect(document?.history.map((entry) => entry.turn)).toEqual([1, 2, 3, 4, 5, 6]);
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

describe("forking, resuming and branching", () => {
	test("resuming a session does not overwrite earlier turns that share a number", () => {
		const dir = tmp();
		try {
			const options = { cardsDir: dir };
			writeSessionCard(options, card({ turn: 1, at: "2026-10-29T09:00:00.000Z", line: "original first turn" }));
			writeSessionCard(options, card({ turn: 2, at: "2026-10-29T09:05:00.000Z", line: "second turn" }));
			// A resumed process restarts its counter: the next event is "turn 1" again.
			writeSessionCard(options, card({ turn: 1, at: "2026-10-29T11:00:00.000Z", line: "after resume" }));

			const document = readSessionCards(options, "sess-1");
			// both events survive: the identity is the classification, not the counter
			expect(document?.turns.map((entry) => entry.line)).toEqual(["original first turn", "second turn", "after resume"]);
			expect(document?.history.map((entry) => entry.line)).toEqual(["original first turn", "second turn", "after resume"]);
			expect(document?.latest.line).toBe("after resume");
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("re-classifying the same turn and time replaces it instead of duplicating", () => {
		const dir = tmp();
		try {
			const options = { cardsDir: dir };
			writeSessionCard(options, card({ turn: 4, at: "2026-10-29T09:00:00.000Z", line: "first pass" }));
			writeSessionCard(options, card({ turn: 4, at: "2026-10-29T09:00:00.000Z", line: "second pass" }));
			const document = readSessionCards(options, "sess-1");
			expect(document?.turns).toHaveLength(1);
			expect(document?.turns[0]?.line).toBe("second pass");
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("a fork adopts the cards it inherited before writing its own", () => {
		const dir = tmp();
		try {
			const options = { cardsDir: dir };
			// the parent session's two turns
			const inherited = [
				card({ sessionId: "parent", turn: 1, at: "2026-10-29T09:00:00.000Z", line: "inherited 1" }),
				card({ sessionId: "parent", turn: 2, at: "2026-10-29T09:05:00.000Z", line: "inherited 2" }),
			];
			// a fork has a new session id and no sidecar of its own
			expect(readSessionCards(options, "fork")).toBeUndefined();
			const seeded = seedSessionCards(options, "fork", inherited);
			expect(seeded?.sessionId).toBe("fork");
			expect(seeded?.history.map((entry) => entry.line)).toEqual(["inherited 1", "inherited 2"]);

			// its next turn continues from the inherited numbering
			writeSessionCard(options, card({ sessionId: "fork", turn: 3, at: "2026-10-29T10:00:00.000Z", line: "after fork" }));
			const document = readSessionCards(options, "fork");
			expect(document?.history.map((entry) => entry.turn)).toEqual([1, 2, 3]);
			expect(document?.latest.line).toBe("after fork");
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("seeding never duplicates on a resume", () => {
		const dir = tmp();
		try {
			const options = { cardsDir: dir };
			const cards = [card({ turn: 1, at: "2026-10-29T09:00:00.000Z", line: "one" })];
			seedSessionCards(options, "sess-1", cards);
			// resuming calls seed again with the same branch
			seedSessionCards(options, "sess-1", cards);
			expect(readSessionCards(options, "sess-1")?.history).toHaveLength(1);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("a branch navigation can revisit a turn number without losing either path", () => {
		const dir = tmp();
		try {
			const options = { cardsDir: dir };
			writeSessionCard(options, card({ turn: 3, at: "2026-10-29T09:00:00.000Z", branch: "leaf-a", line: "path A turn 3" }));
			// user navigates the tree back and takes a different route
			writeSessionCard(options, card({ turn: 3, at: "2026-10-29T09:30:00.000Z", branch: "leaf-b", line: "path B turn 3" }));

			const document = readSessionCards(options, "sess-1");
			expect(document?.history.map((entry) => entry.branch)).toEqual(["leaf-a", "leaf-b"]);
			expect(document?.history.map((entry) => entry.line)).toEqual(["path A turn 3", "path B turn 3"]);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
