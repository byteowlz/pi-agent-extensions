import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
	DEFAULT_SLEEP_CONFIG,
	NOTE_MAX_CHARS,
	type Wake,
	addWake,
	clampNote,
	clearWake,
	findWake,
	formatWakes,
	loadSleepConfig,
	nextWakeId,
	readWakes,
	removeWake,
	resolveDuration,
	sleepNotice,
	sleepStatus,
	wakeDetails,
	wakeMessage,
	wakeStorePath,
	wakeSummary,
} from "./sleep";

function tmp(prefix = "sleep-"): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const CONFIG = { ...DEFAULT_SLEEP_CONFIG };

describe("duration resolution", () => {
	test("accepts the shared interval vocabulary", () => {
		expect(resolveDuration("20m", CONFIG)).toEqual({ durationMs: 1_200_000 });
		expect(resolveDuration("90s", CONFIG)).toEqual({ durationMs: 90_000 });
		expect(resolveDuration("1h", CONFIG)).toEqual({ durationMs: 3_600_000 });
	});

	test("rejects parse errors with the shared messages", () => {
		for (const bad of ["", "soon", "0m", "2 fortnights"]) {
			expect(resolveDuration(bad, CONFIG)).toHaveProperty("error");
		}
	});

	test("enforces the configured bounds", () => {
		const tight = { ...CONFIG, minDurationMs: 60_000, maxDurationMs: 3_600_000 };
		expect(resolveDuration("30s", tight).error).toContain("minimum is 1m");
		expect(resolveDuration("2h", tight).error).toContain("maximum is 1h");
		expect(resolveDuration("30m", tight)).toEqual({ durationMs: 1_800_000 });
	});
});

describe("wake store", () => {
	test("adds wakes with sequential ids and computes fireAt", () => {
		const dir = tmp();
		const now = Date.parse("2026-10-29T10:00:00.000Z");
		const first = addWake("s", { note: "check the build", durationMs: 1_200_000, now }, dir);
		expect(first.wake.id).toBe("sleep-1");
		expect(first.wake.fireAt).toBe("2026-10-29T10:20:00.000Z");
		const second = addWake("s", { note: "", durationMs: 60_000, now }, dir);
		expect(second.wake.id).toBe("sleep-2");
		expect(readWakes("s", dir).map((w) => w.id)).toEqual(["sleep-1", "sleep-2"]);
		// a different session sees nothing
		expect(readWakes("other", dir)).toEqual([]);
		expect(wakeStorePath("s", dir)).toContain(path.join("wakes", "s.json"));
	});

	test("resolves by index, exact id and unique prefix", () => {
		const dir = tmp();
		addWake("s", { note: "one", durationMs: 60_000 }, dir);
		addWake("s", { note: "two", durationMs: 60_000 }, dir);
		const wakes = readWakes("s", dir);
		expect(findWake(wakes, "2")?.id).toBe("sleep-2");
		expect(findWake(wakes, "sleep-1")?.note).toBe("one");
		// ambiguous prefixes refuse to guess
		expect(findWake(wakes, "sl")).toBeUndefined();
		expect(findWake(wakes, "nope")).toBeUndefined();
		expect(findWake(wakes, "")).toBeUndefined();
	});

	test("removes and clears; firing leaves no entry behind", () => {
		const dir = tmp();
		addWake("s", { note: "one", durationMs: 60_000 }, dir);
		addWake("s", { note: "two", durationMs: 60_000 }, dir);
		expect(removeWake("s", "sleep-1", dir).removed?.note).toBe("one");
		expect(readWakes("s", dir).map((w) => w.id)).toEqual(["sleep-2"]);
		expect(removeWake("s", "sleep-9", dir).removed).toBeUndefined();
		clearWake("s", "sleep-2", dir);
		expect(readWakes("s", dir)).toEqual([]);
		clearWake("s", "sleep-2", dir); // no-op, must not throw
	});

	test("malformed stores read as empty", () => {
		const dir = tmp();
		const file = wakeStorePath("s", dir);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, JSON.stringify({ version: 2, wakes: [{ id: "sleep-1", note: "", durationMs: 1000 }] }));
		expect(readWakes("s", dir)).toEqual([]);
		fs.writeFileSync(
			file,
			JSON.stringify({
				version: 1,
				wakes: [
					{ id: "", note: "", durationMs: 1000 },
					{ id: "sleep-2", note: "ok", durationMs: 1000, fireAt: "2026-10-29T10:00:00.000Z" },
				],
			})
		);
		expect(readWakes("s", dir).map((w) => w.id)).toEqual(["sleep-2"]);
	});

	test("nextWakeId skips taken ids and reuses freed ones", () => {
		expect(nextWakeId([])).toBe("sleep-1");
		expect(nextWakeId([{ id: "sleep-1" } as never, { id: "sleep-2" } as never])).toBe("sleep-3");
		expect(nextWakeId([{ id: "sleep-2" } as never])).toBe("sleep-1");
	});
});

describe("wake messages and presentation", () => {
	test("on-time delivery is a structured header plus an indented note", () => {
		const now = Date.parse("2026-10-29T10:20:00.000Z");
		const wake = {
			id: "sleep-1",
			note: "check the build",
			durationMs: 1_200_000,
			createdAt: "",
			fireAt: "2026-10-29T10:20:00.000Z",
		};
		const text = wakeMessage(wake, now);
		const lines = text.split("\n");
		expect(lines[0]).toBe("[wake-up] sleep-1 · your 20m sleep is over.");
		expect(lines[1]).toMatch(/^Due \d\d:\d\d, woke \d\d:\d\d\.$/);
		expect(text).toContain("Your note (what to check or continue):\n  check the build");
	});

	test("multi-line notes stay indented instead of collapsing into prose", () => {
		const now = Date.parse("2026-10-29T10:20:00.000Z");
		const wake = {
			id: "sleep-1",
			note: "check run B\nQA v3 ETA 18:35",
			durationMs: 60_000,
			createdAt: "",
			fireAt: "2026-10-29T10:20:00.000Z",
		};
		expect(wakeMessage(wake, now)).toContain("  check run B\n  QA v3 ETA 18:35");
	});

	test("late delivery says how late and why", () => {
		const now = Date.parse("2026-10-29T11:35:00.000Z");
		const wake = {
			id: "sleep-1",
			note: "resume",
			durationMs: 3_600_000,
			createdAt: "",
			fireAt: "2026-10-29T11:00:00.000Z",
		};
		const text = wakeMessage(wake, now);
		expect(text.split("\n")[0]).toBe("[wake-up] sleep-1 · your 1h sleep ended 35m ago (the session was not running).");
		expect(wakeDetails(wake, now).lateMs).toBe(2_100_000);
	});

	test("no note says so explicitly", () => {
		const now = Date.parse("2026-10-29T10:20:00.000Z");
		const wake = { id: "sleep-1", note: "", durationMs: 60_000, createdAt: "", fireAt: "2026-10-29T10:20:00.000Z" };
		expect(wakeMessage(wake, now)).toContain("No note was set — resume from the conversation above.");
	});

	test("pending wakes are named in the header line, not the note", () => {
		const now = Date.parse("2026-10-29T10:20:00.000Z");
		const fired = { id: "sleep-1", note: "", durationMs: 1_200_000, createdAt: "", fireAt: "2026-10-29T10:20:00.000Z" };
		const later = { id: "sleep-2", note: "", durationMs: 3_600_000, createdAt: "", fireAt: "2026-10-29T10:55:00.000Z" };
		const text = wakeMessage(fired, now, [later]);
		expect(text.split("\n")[1]).toContain("Next wake");
		const details = wakeDetails(fired, now, [later, fired]);
		expect(details.pending).toBe(1);
		expect(details.nextFireAt).toBe(later.fireAt);
		expect(wakeSummary(details)).toContain("next wake");
	});

	test("wakeSummary reports the timings and catch-up latency", () => {
		const wake = { id: "sleep-3", note: "x", durationMs: 60_000, createdAt: "", fireAt: "2026-10-29T11:00:00.000Z" };
		const onTime = wakeSummary(wakeDetails(wake, Date.parse("2026-10-29T11:00:00.000Z")));
		expect(onTime).toContain("1m · due");
		expect(onTime).toContain("woke");
		expect(onTime).not.toContain("late");
		const late = wakeSummary(wakeDetails(wake, Date.parse("2026-10-29T11:35:00.000Z")));
		expect(late).toContain("late 35m");
	});
});

describe("note cue budget", () => {
	test("short notes pass unchanged", () => {
		expect(clampNote("  check the build  ")).toEqual({ note: "check the build", truncated: false });
		const exact = "x".repeat(NOTE_MAX_CHARS);
		expect(clampNote(exact)).toEqual({ note: exact, truncated: false });
	});

	test("long notes are trimmed to the budget with an ellipsis", () => {
		const long = `${"status dump ".repeat(60)}`.trim();
		const { note, truncated } = clampNote(long);
		expect(truncated).toBe(true);
		expect(note.length).toBeLessThanOrEqual(NOTE_MAX_CHARS);
		expect(note.endsWith("…")).toBe(true);
	});

	test("trimming prefers a clause boundary over a mid-word cut", () => {
		const long = `${"a".repeat(200)}; ${"b".repeat(200)}`;
		const { note } = clampNote(long);
		expect(note.endsWith(";…")).toBe(true);
	});
});

describe("wake status and listings", () => {
	test("formatWakes lists countdowns or a hint", () => {
		const now = Date.parse("2026-10-29T10:00:00.000Z");
		expect(formatWakes([], now)).toContain("no pending wake-ups");
		const listing = formatWakes(
			[
				{
					id: "sleep-1",
					note: "check the build",
					durationMs: 1_200_000,
					createdAt: "2026-10-29T09:46:00.000Z",
					fireAt: "2026-10-29T10:14:00.000Z",
				},
				{ id: "sleep-2", note: "", durationMs: 60_000, createdAt: "", fireAt: "2026-10-29T09:00:00.000Z" },
			],
			now
		);
		expect(listing).toMatch(/1\. sleep-1 · in 14m · set \d{2}:\d{2} · 20m sleep — check the build/);
		expect(listing).toContain("2. sleep-2 · in 0s · set ??:?? · 1m sleep");
	});

	test("sleepStatus reports the soonest wake or undefined", () => {
		const now = Date.parse("2026-10-29T10:00:00.000Z");
		expect(sleepStatus([], now)).toBeUndefined();
		const soonest = sleepStatus(
			[
				{ id: "sleep-1", note: "", durationMs: 3_600_000, createdAt: "", fireAt: "2026-10-29T10:30:00.000Z" },
				{ id: "sleep-2", note: "", durationMs: 60_000, createdAt: "", fireAt: "2026-10-29T10:05:00.000Z" },
			],
			now
		);
		expect(soonest).toBe("zzz 5m/1m");
		expect(
			sleepStatus([{ id: "sleep-1", note: "", durationMs: 60_000, createdAt: "", fireAt: "2026-10-29T09:00:00.000Z" }], now)
		).toBe("zzz 0s/1m");
	});
});

describe("sleepNotice (herdr message)", () => {
	const now = Date.parse("2026-10-29T10:00:00.000Z");
	const wake = (over: Partial<Wake>): Wake => ({
		id: "sleep-1",
		note: "",
		durationMs: 1_200_000,
		createdAt: "",
		fireAt: "2026-10-29T10:14:00.000Z",
		...over,
	});

	test("empty set says so", () => {
		expect(sleepNotice([])).toBe("no pending wake-ups");
	});

	test("single wake carries duration, id, clock and note", () => {
		const notice = sleepNotice([wake({ note: "check the build" })]);
		expect(notice).toMatch(/^sleeping 20m — sleep-1 wakes \d{2}:\d{2} · check the build$/);
		expect(sleepNotice([wake()])).not.toContain("·");
	});

	test("long notes are truncated", () => {
		const notice = sleepNotice([wake({ note: "x".repeat(60) })]);
		expect(notice).toContain("…");
		expect(notice.length).toBeLessThan(90);
	});

	test("single wake reports when it was set", () => {
		const notice = sleepNotice([wake({ createdAt: "2026-10-29T09:46:00.000Z" })]);
		expect(notice).toMatch(/^sleeping 20m \(started \d{2}:\d{2}\) — sleep-1 wakes \d{2}:\d{2}$/);
	});

	test("multiple wakes report the soonest", () => {
		const notice = sleepNotice(
			[wake({ id: "sleep-2", fireAt: "2026-10-29T10:30:00.000Z" }), wake({ id: "sleep-1", fireAt: "2026-10-29T10:14:00.000Z" })],
			now
		);
		expect(notice).toMatch(/^2 wake-ups pending — next sleep-1 wakes \d{2}:\d{2}$/);
	});
});

describe("config loading", () => {
	test("defaults apply without any config file", () => {
		expect(loadSleepConfig(tmp())).toEqual(DEFAULT_SLEEP_CONFIG);
	});

	test("reads ./pi-schedule.json", () => {
		const dir = tmp();
		fs.writeFileSync(path.join(dir, "pi-schedule.json"), JSON.stringify({ sleep: { mode: "ask", maxPending: 5 } }));
		const cfg = loadSleepConfig(dir);
		expect(cfg.mode).toBe("ask");
		expect(cfg.maxPending).toBe(5);
		expect(cfg.maxDurationMs).toBe(DEFAULT_SLEEP_CONFIG.maxDurationMs);
	});

	test("search order: ./pi-schedule.json wins over ./.pi/, first match only", () => {
		const dir = tmp();
		fs.mkdirSync(path.join(dir, ".pi"));
		fs.writeFileSync(path.join(dir, ".pi", "pi-schedule.json"), JSON.stringify({ sleep: { mode: "off" } }));
		fs.writeFileSync(path.join(dir, "pi-schedule.json"), JSON.stringify({ sleep: { mode: "ask" } }));
		expect(loadSleepConfig(dir).mode).toBe("ask");
		// without the root file, .pi applies
		fs.rmSync(path.join(dir, "pi-schedule.json"));
		expect(loadSleepConfig(dir).mode).toBe("off");
	});

	test("invalid and malformed values keep defaults", () => {
		const dir = tmp();
		fs.writeFileSync(
			path.join(dir, "pi-schedule.json"),
			JSON.stringify({ sleep: { mode: "yolo", minDurationMs: -5, maxPending: 0 } })
		);
		expect(loadSleepConfig(dir)).toEqual(DEFAULT_SLEEP_CONFIG);
		fs.writeFileSync(path.join(dir, "pi-schedule.json"), "{not json");
		expect(loadSleepConfig(dir)).toEqual(DEFAULT_SLEEP_CONFIG);
		fs.writeFileSync(path.join(dir, "pi-schedule.json"), JSON.stringify({ other: true }));
		expect(loadSleepConfig(dir)).toEqual(DEFAULT_SLEEP_CONFIG);
	});

	test("maxDurationMs below minDurationMs is ignored", () => {
		const dir = tmp();
		fs.writeFileSync(
			path.join(dir, "pi-schedule.json"),
			JSON.stringify({ sleep: { minDurationMs: 60_000, maxDurationMs: 30_000 } })
		);
		const cfg = loadSleepConfig(dir);
		expect(cfg.minDurationMs).toBe(60_000);
		expect(cfg.maxDurationMs).toBe(DEFAULT_SLEEP_CONFIG.maxDurationMs);
	});
});
