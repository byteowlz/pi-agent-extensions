import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
	CAPTAIN_ENTRY_TYPE,
	type CaptainClaim,
	MIN_INTERVAL_MS,
	actionId,
	actionsPath,
	addAction,
	claimPath,
	clearClaim,
	encodeProject,
	findAction,
	formatActions,
	formatCaptainLine,
	formatCaptainStatus,
	formatDuration,
	formatInterval,
	judgeClaim,
	markActionRun,
	parseAgentList,
	parseClaim,
	parseInterval,
	projectSessions,
	readActions,
	readCaptainEntry,
	readClaim,
	removeAction,
	setActionEnabled,
	skdlrExportCommand,
	summarizeCaptain,
	writeActions,
	writeClaim,
} from "./captain";

function tmp(prefix = "captain-"): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function claim(overrides: Partial<CaptainClaim> = {}): CaptainClaim {
	return {
		version: 1,
		project: "/work/alpha",
		sessionId: "sess-1",
		at: "2026-10-29T10:00:00.000Z",
		...overrides,
	};
}

describe("project keying", () => {
	test("encodes a project like pi's session directories", () => {
		expect(encodeProject("/home/wismut/Code/app")).toBe("--home-wismut-Code-app--");
		expect(encodeProject("/home/wismut/Code/app/")).toBe("--home-wismut-Code-app--");
	});

	test("root never collapses to an empty claim filename", () => {
		const dir = tmp();
		expect(path.basename(claimPath("/", dir))).toBe("--root--.json");
	});

	test("claim path lives under the agent dir and is cwd-specific", () => {
		const dir = tmp();
		const a = claimPath("/work/alpha", dir);
		const b = claimPath("/work/beta", dir);
		expect(a).toContain(path.join(dir, "captain"));
		expect(a).not.toBe(b);
	});
});

describe("claim persistence", () => {
	test("round-trips a claim atomically and clears it", () => {
		const dir = tmp();
		const written = writeClaim(claim({ paneId: "w1:p1", label: "captain", sessionFile: "/s.jsonl" }), dir);
		const read = readClaim("/work/alpha", dir);
		expect(read).toEqual(claim({ paneId: "w1:p1", label: "captain", sessionFile: "/s.jsonl" }));
		expect(fs.readdirSync(path.dirname(written))).toEqual([path.basename(written)]);
		expect(clearClaim("/work/alpha", dir)).toBe(true);
		expect(readClaim("/work/alpha", dir)).toBeUndefined();
	});

	test("malformed or unknown-version files read as no captain", () => {
		const dir = tmp();
		writeClaim(claim(), dir);
		fs.writeFileSync(claimPath("/work/alpha", dir), "{not json");
		expect(readClaim("/work/alpha", dir)).toBeUndefined();

		fs.writeFileSync(claimPath("/work/alpha", dir), JSON.stringify({ version: 2, project: "/work/alpha", sessionId: "x" }));
		expect(readClaim("/work/alpha", dir)).toBeUndefined();
	});

	test("parseClaim keeps required fields and drops unknown ones", () => {
		expect(parseClaim({ version: 1, project: "/p", sessionId: "s", extra: "ignored" })).toEqual({
			version: 1,
			project: "/p",
			sessionId: "s",
			at: "",
		});
		expect(parseClaim({ version: 1, project: "", sessionId: "s" })).toBeUndefined();
		expect(parseClaim({ version: 1, project: "/p" })).toBeUndefined();
		expect(parseClaim(null)).toBeUndefined();
	});
});

describe("liveness verdicts", () => {
	test("a pane that is present is live, a missing pane is stale", () => {
		expect(judgeClaim(claim({ paneId: "w1:p1" }), ["w1:p1", "w1:p2"]).status).toBe("live");
		const stale = judgeClaim(claim({ paneId: "w1:p9" }), ["w1:p1"]);
		expect(stale.status).toBe("stale");
		expect(stale.reason).toContain("w1:p9");
	});

	test("without a pane list a missing session file is stale, an existing one is unverified", () => {
		const dir = tmp();
		const file = path.join(dir, "session.jsonl");
		fs.writeFileSync(file, "{}\n");
		expect(judgeClaim(claim({ sessionFile: file }), undefined).status).toBe("unknown");
		expect(judgeClaim(claim({ sessionFile: path.join(dir, "gone.jsonl") }), undefined).status).toBe("stale");
	});

	test("no evidence at all is unknown, never live", () => {
		expect(judgeClaim(claim(), undefined).status).toBe("unknown");
	});
});

describe("project session discovery", () => {
	const panes = [
		{ paneId: "w1:p1", cwd: "/work/alpha", label: "alpha main", state: "working" },
		{ paneId: "w1:p2", cwd: "/work/alpha/", label: "alpha side" },
		{ paneId: "w1:p3", cwd: "/work/beta", label: "beta" },
		{ paneId: "w1:p4", cwd: "", label: "unknown cwd" },
	];

	test("filters by cwd and excludes the caller's pane", () => {
		expect(projectSessions(panes, "/work/alpha", "w1:p1").map((p) => p.paneId)).toEqual(["w1:p2"]);
		expect(projectSessions(panes, "/work/alpha").map((p) => p.paneId)).toEqual(["w1:p1", "w1:p2"]);
	});

	test("an unrelated project sees none", () => {
		expect(projectSessions(panes, "/work/gamma")).toEqual([]);
	});

	test("parses herdr agent list envelopes, ignoring bad rows", () => {
		const parsed = parseAgentList({
			result: {
				agents: [
					{
						pane_id: "w2:p1",
						cwd: "/work/alpha",
						agent_status: "idle",
						terminal_title_stripped: "π - alpha [x]",
						agent_session: { kind: "path", value: "/sessions/a.jsonl" },
					},
					{ pane_id: "" },
					{ cwd: "/work/alpha" },
					"nonsense",
				],
			},
		});
		expect(parsed).toHaveLength(1);
		expect(parsed[0]).toEqual({
			paneId: "w2:p1",
			cwd: "/work/alpha",
			sessionFile: "/sessions/a.jsonl",
			label: "π - alpha [x]",
			state: "idle",
		});
		expect(parseAgentList({})).toEqual([]);
		expect(parseAgentList(undefined)).toEqual([]);
	});
});

describe("presentation", () => {
	test("one-line status distinguishes none, live, stale and unverified", () => {
		expect(formatCaptainLine("/work/alpha", undefined)).toBe("alpha: no captain");
		expect(formatCaptainLine("/work/alpha", claim({ label: "captain" }), judgeClaim(claim({ paneId: "p1" }), ["p1"]))).toBe(
			"alpha: captain captain"
		);
		expect(formatCaptainLine("/work/alpha", claim({ paneId: "p9" }), judgeClaim(claim({ paneId: "p9" }), []))).toBe(
			"alpha: captain stale (pane p9 is gone)"
		);
		expect(formatCaptainLine("/work/alpha", claim({ sessionId: "abcdef123" }))).toBe("alpha: captain abcdef12 (unverified)");
	});

	test("status block names the captain, a stale claim and other sessions", () => {
		const text = formatCaptainStatus({
			project: "/work/alpha",
			selfSessionId: "sess-1",
			claim: claim({ paneId: "w1:p1", label: "captain" }),
			verdict: judgeClaim(claim({ paneId: "w1:p1" }), ["w1:p1"]),
			sessions: [{ paneId: "w1:p2", cwd: "/work/alpha", label: "alpha side", state: "working" }],
			backend: "herdr",
		});
		expect(text).toContain("project: /work/alpha");
		expect(text).toContain("captain: captain (this session) — live");
		expect(text).toContain("w1:p2  alpha side  [working]");
		expect(text).toContain("/captain claim [label]");

		const none = formatCaptainStatus({
			project: "/work/beta",
			selfSessionId: "sess-2",
			sessions: [],
			backend: "tmux",
		});
		expect(none).toContain("captain: none claimed");
		expect(none).toContain("other sessions in this project: none visible");
	});
});

describe("branch history", () => {
	test("latest claim entry wins and foreign entries are ignored", () => {
		const entries = [
			{ type: "custom", customType: CAPTAIN_ENTRY_TYPE, data: claim({ sessionId: "old" }) },
			{ type: "message", id: "m1" },
			{ type: "custom", customType: "pi-session-tools:captain/other", data: claim({ sessionId: "ignored" }) },
			{ type: "custom", customType: CAPTAIN_ENTRY_TYPE, data: claim({ sessionId: "new" }) },
			{ type: "custom", customType: CAPTAIN_ENTRY_TYPE, data: { version: 1 } },
		];
		expect(readCaptainEntry(entries)?.sessionId).toBe("new");
		expect(readCaptainEntry([])).toBeUndefined();
	});
});

describe("introspection summary", () => {
	test("reports no claim, a foreign claim and a self claim without probing", () => {
		const dir = tmp();
		expect(summarizeCaptain("/work/alpha", "sess-1", dir)).toEqual({
			project: "/work/alpha",
			claimed: false,
			self: false,
		});

		writeClaim(claim({ label: "recon" }), dir);
		expect(summarizeCaptain("/work/alpha", "sess-1", dir)).toEqual({
			project: "/work/alpha",
			claimed: true,
			self: true,
			sessionId: "sess-1",
			label: "recon",
			at: "2026-10-29T10:00:00.000Z",
		});
		expect(summarizeCaptain("/work/alpha", "sess-2", dir).self).toBe(false);
		// a different project never inherits the claim
		expect(summarizeCaptain("/work/beta", "sess-1", dir).claimed).toBe(false);
	});
});

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
		const tooShort = parseInterval("5s");
		expect("error" in tooShort && tooShort.error).toContain("minimum");
		expect(MIN_INTERVAL_MS).toBeGreaterThanOrEqual(10_000);
	});

	test("formats intervals back into the same vocabulary", () => {
		expect(formatInterval(1_800_000)).toBe("30m");
		expect(formatInterval(7_200_000)).toBe("2h");
		expect(formatInterval(86_400_000)).toBe("1d");
		expect(formatDuration(4 * 60_000)).toBe("4m");
		expect(formatDuration(38_000)).toBe("38s");
		expect(formatDuration(2 * 3_600_000)).toBe("2h");
	});
});

describe("action store", () => {
	test("adds, lists, resolves, pauses and removes project actions", () => {
		const dir = tmp();
		const first = addAction("/work/alpha", { text: "check board again", intervalMs: 3_600_000 }, dir);
		expect(first.action.id).toBe("check-board-again");
		expect(readActions("/work/alpha", dir).map((a) => a.id)).toEqual(["check-board-again"]);
		// project-scoped: another project starts empty
		expect(readActions("/work/beta", dir)).toEqual([]);

		const second = addAction("/work/alpha", { text: "check board again", intervalMs: 60_000 }, dir);
		expect(second.action.id).toBe("check-board-again-2");
		expect(actionId("check board again", second.actions)).toBe("check-board-again-3");

		// 1-based index and id prefix both resolve
		expect(findAction(second.actions, "1")?.id).toBe("check-board-again");
		expect(findAction(second.actions, "check-board-again-2")?.id).toBe("check-board-again-2");
		expect(findAction(second.actions, "check-board")?.id).toBeUndefined();

		const paused = setActionEnabled("/work/alpha", "1", false, dir);
		expect(paused.action?.enabled).toBe(false);
		expect(readActions("/work/alpha", dir)[0]?.enabled).toBe(false);

		const { removed } = removeAction("/work/alpha", "check-board-again-2", dir);
		expect(removed?.id).toBe("check-board-again-2");
		expect(readActions("/work/alpha", dir).map((a) => a.id)).toEqual(["check-board-again"]);
	});

	test("marks runs without disturbing other actions or unknown ids", () => {
		const dir = tmp();
		addAction("/work/alpha", { text: "one", intervalMs: 60_000 }, dir);
		addAction("/work/alpha", { text: "two", intervalMs: 60_000 }, dir);
		markActionRun("/work/alpha", "one", "2026-10-29T11:00:00.000Z", dir);
		const actions = readActions("/work/alpha", dir);
		expect(actions[0]?.lastRunAt).toBe("2026-10-29T11:00:00.000Z");
		expect(actions[1]?.lastRunAt).toBeUndefined();
		markActionRun("/work/alpha", "nope", "2026-10-29T11:00:00.000Z", dir);
		expect(readActions("/work/alpha", dir)).toHaveLength(2);
	});

	test("malformed stores read as no actions", () => {
		const dir = tmp();
		const file = actionsPath("/work/alpha", dir);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, JSON.stringify({ version: 2, actions: [{ id: "x", text: "y", intervalMs: 1000 }] }));
		expect(readActions("/work/alpha", dir)).toEqual([]);
		fs.writeFileSync(
			file,
			JSON.stringify({
				version: 1,
				actions: [
					{ id: "", text: "y", intervalMs: 1000 },
					{ id: "ok", text: "t", intervalMs: 0 },
				],
			})
		);
		expect(readActions("/work/alpha", dir)).toEqual([]);
		// a valid round-trip through writeActions keeps unknown fields out
		writeActions("/work/alpha", [], dir);
		expect(readActions("/work/alpha", dir)).toEqual([]);
	});

	test("listing shows interval, pause state, id and next run", () => {
		const dir = tmp();
		addAction("/work/alpha", { text: "check board", intervalMs: 3_600_000 }, dir);
		const actions = readActions("/work/alpha", dir);
		const fresh = formatActions(actions);
		expect(fresh).toContain("1. [1h] check board");
		expect(fresh).toContain("id check-board");

		const ran = [{ ...(actions[0] as (typeof actions)[number]), lastRunAt: new Date(1_000_000).toISOString() }];
		expect(formatActions(ran, 1_000_000 + 15 * 60_000)).toContain("next in 45m");
		expect(formatActions(ran, 1_000_000 + 2 * 3_600_000)).toContain("due now");
		expect(formatActions([{ ...ran[0]!, enabled: false }])).toContain("(paused)");
		expect(formatActions([])).toContain("/captain schedule");
	});
});

describe("skdlr export", () => {
	test("produces an add command with schedule, workdir and a quoted prompt", () => {
		const dir = tmp();
		addAction("/work/alpha", { text: 'check board and say "hi"', intervalMs: 3_600_000 }, dir);
		const [action] = readActions("/work/alpha", dir);
		const command = skdlrExportCommand("/work/alpha", action!);
		expect(command).toStartWith("skdlr add 'captain-alpha-check-board-and-say-hi'");
		expect(command).toContain("--schedule '1h'");
		expect(command).toContain("--workdir '/work/alpha'");
		expect(command).toContain("pi -p");
		expect(command).toContain("--description");
	});
});
