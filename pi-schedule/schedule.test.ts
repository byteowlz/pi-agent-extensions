import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
	MIN_INTERVAL_MS,
	actionId,
	addAction,
	captainClaimPath,
	encodeProject,
	findAction,
	formatActions,
	formatDuration,
	formatInterval,
	markActionRun,
	parseInterval,
	projectOwnership,
	readActions,
	readCaptainSessionId,
	removeAction,
	setActionEnabled,
	skdlrExportCommand,
	statusSummary,
	storePath,
	writeActions,
} from "./schedule";

function tmp(prefix = "schedule-"): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Write a captain claim exactly as pi-session-tools does. */
function claimCaptain(dir: string, project: string, sessionId: string): void {
	const file = captainClaimPath(project, dir);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify({ version: 1, project, sessionId, at: "2026-10-29T10:00:00.000Z" }));
}

describe("interval parsing", () => {
	test("accepts compact units, words and aliases", () => {
		expect(parseInterval("30m")).toEqual({ intervalMs: 1_800_000 });
		expect(parseInterval("2h")).toEqual({ intervalMs: 7_200_000 });
		expect(parseInterval("1d")).toEqual({ intervalMs: 86_400_000 });
		expect(parseInterval("every 15 minutes")).toEqual({ intervalMs: 900_000 });
		expect(parseInterval("hourly")).toEqual({ intervalMs: 3_600_000 });
		expect(parseInterval("Daily")).toEqual({ intervalMs: 86_400_000 });
		expect(parseInterval("  45s ")).toEqual({ intervalMs: 45_000 });
	});

	test("rejects nonsense, zero and dangerously short intervals", () => {
		for (const bad of ["", "soon", "hourlyish", "0m", "-5m", "2 fortnights"]) {
			expect(parseInterval(bad)).toHaveProperty("error");
		}
		const short = parseInterval("5s");
		expect("error" in short && short.error).toContain("minimum");
		expect(MIN_INTERVAL_MS).toBeGreaterThanOrEqual(10_000);
	});

	test("round-trips into the same vocabulary", () => {
		expect(formatInterval(1_800_000)).toBe("30m");
		expect(formatInterval(7_200_000)).toBe("2h");
		expect(formatInterval(86_400_000)).toBe("1d");
		expect(formatDuration(4 * 60_000)).toBe("4m");
		expect(formatDuration(38_000)).toBe("38s");
		expect(formatDuration(2 * 3_600_000)).toBe("2h");
		expect(formatInterval(250)).toBe("250ms");
	});
});

describe("scoped stores", () => {
	test("session and project stores are separate and project-keyed", () => {
		const dir = tmp();
		addAction("session", "sess-1", { text: "session check", intervalMs: 60_000 }, dir);
		addAction("project", "/work/alpha", { text: "project check", intervalMs: 60_000 }, dir);
		expect(readActions("session", "sess-1", dir).map((a) => a.text)).toEqual(["session check"]);
		expect(readActions("project", "/work/alpha", dir).map((a) => a.text)).toEqual(["project check"]);
		// a different session/project sees nothing
		expect(readActions("session", "sess-2", dir)).toEqual([]);
		expect(readActions("project", "/work/beta", dir)).toEqual([]);
		expect(storePath("project", "/work/alpha", dir)).toContain(encodeProject("/work/alpha"));
		expect(storePath("session", "sess-1", dir)).toContain(path.join("sessions", "sess-1.json"));
	});

	test("adds, resolves, pauses, marks and removes", () => {
		const dir = tmp();
		const first = addAction("session", "s", { text: "check board again", intervalMs: 3_600_000 }, dir);
		expect(first.action.id).toBe("check-board-again");
		const second = addAction("session", "s", { text: "check board again", intervalMs: 60_000 }, dir);
		expect(second.action.id).toBe("check-board-again-2");
		expect(actionId("check board again", second.actions)).toBe("check-board-again-3");

		expect(findAction(second.actions, "1")?.id).toBe("check-board-again");
		expect(findAction(second.actions, "check-board-again-2")?.id).toBe("check-board-again-2");
		expect(findAction(second.actions, "check-board")).toBeUndefined();

		expect(setActionEnabled("session", "s", "1", false, dir).action?.enabled).toBe(false);
		expect(readActions("session", "s", dir)[0]?.enabled).toBe(false);

		markActionRun("session", "s", "check-board-again", "2026-10-29T11:00:00.000Z", dir);
		const marked = readActions("session", "s", dir);
		expect(marked[0]?.lastRunAt).toBe("2026-10-29T11:00:00.000Z");
		expect(marked[1]?.lastRunAt).toBeUndefined();

		expect(removeAction("session", "s", "check-board-again-2", dir).removed?.id).toBe("check-board-again-2");
		expect(readActions("session", "s", dir).map((a) => a.id)).toEqual(["check-board-again"]);
	});

	test("malformed stores read as empty", () => {
		const dir = tmp();
		const file = storePath("session", "s", dir);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, JSON.stringify({ version: 2, actions: [{ id: "x", text: "y", intervalMs: 1000 }] }));
		expect(readActions("session", "s", dir)).toEqual([]);
		fs.writeFileSync(file, JSON.stringify({ version: 1, actions: [{ id: "", text: "y", intervalMs: 1000 }] }));
		expect(readActions("session", "s", dir)).toEqual([]);
		writeActions("session", "s", [], dir);
		expect(readActions("session", "s", dir)).toEqual([]);
	});
});

describe("captain ownership rule", () => {
	test("project schedules arm only in the claiming session", () => {
		const dir = tmp();
		expect(projectOwnership("/work/alpha", "sess-1", dir)).toEqual({
			armed: false,
			reason: "no captain claimed for this project",
		});

		claimCaptain(dir, "/work/alpha", "sess-2");
		expect(readCaptainSessionId("/work/alpha", dir)).toBe("sess-2");
		expect(projectOwnership("/work/alpha", "sess-1", dir).armed).toBe(false);
		const mine = projectOwnership("/work/alpha", "sess-2", dir);
		expect(mine).toEqual({ armed: true, reason: "this session is the project captain" });
	});

	test("a different project's claim does not arm this project", () => {
		const dir = tmp();
		claimCaptain(dir, "/work/beta", "sess-1");
		expect(projectOwnership("/work/alpha", "sess-1", dir).armed).toBe(false);
	});

	test("a malformed claim file means no captain, never an armed project", () => {
		const dir = tmp();
		const file = captainClaimPath("/work/alpha", dir);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, "{not json");
		expect(readCaptainSessionId("/work/alpha", dir)).toBeUndefined();
		expect(projectOwnership("/work/alpha", "sess-1", dir).armed).toBe(false);
	});
});

describe("presentation", () => {
	test("listing shows interval, pause state, id and next run", () => {
		const dir = tmp();
		addAction("session", "s", { text: "check board", intervalMs: 3_600_000 }, dir);
		const actions = readActions("session", "s", dir);
		const fresh = formatActions(actions);
		expect(fresh).toContain("1. [1h] check board");
		expect(fresh).toContain("id check-board");

		const ran = [{ ...(actions[0] as (typeof actions)[number]), lastRunAt: new Date(1_000_000).toISOString() }];
		expect(formatActions(ran, 1_000_000 + 15 * 60_000)).toContain("next in 45m");
		expect(formatActions(ran, 1_000_000 + 2 * 3_600_000)).toContain("due now");
		expect(formatActions([{ ...ran[0]!, enabled: false }])).toContain("(paused)");
		expect(formatActions([])).toContain("/schedule");
	});

	test("status summary counts enabled actions and shows the soonest run", () => {
		const now = 1_000_000;
		const base = { text: "x", enabled: true, createdAt: "" };
		expect(statusSummary([], now)).toBeUndefined();
		expect(statusSummary([{ ...base, id: "a", intervalMs: 60_000, enabled: false }], now)).toBeUndefined();
		expect(
			statusSummary(
				[
					{ ...base, id: "a", intervalMs: 60_000, lastRunAt: new Date(now).toISOString() },
					{ ...base, id: "b", intervalMs: 3_600_000, lastRunAt: new Date(now).toISOString() },
				],
				now
			)
		).toBe("2·1m");
	});
});

describe("skdlr export", () => {
	test("produces an add command with schedule, workdir and a quoted prompt", () => {
		const dir = tmp();
		addAction("session", "s", { text: 'check board and say "hi"', intervalMs: 3_600_000 }, dir);
		const [action] = readActions("session", "s", dir);
		const command = skdlrExportCommand("/work/alpha", action!);
		expect(command).toStartWith("skdlr add 'schedule-alpha-check-board-and-say-hi'");
		expect(command).toContain("--schedule '1h'");
		expect(command).toContain("--workdir '/work/alpha'");
		expect(command).toContain("pi -p");
		expect(command).toContain("--description");
	});
});
