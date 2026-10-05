import { describe, expect, test } from "bun:test";
import { type Run, openTmuxSide, resolveRoute, shellArg } from "./backend.js";

describe("owner-aware routing", () => {
	test("plain Pi does not discover installed multiplexers", async () => {
		expect(
			(
				await resolveRoute({}, async () => {
					throw new Error("must not execute");
				})
			).owner
		).toBe("plain");
	});
	test("Herdr inside tmux validates Herdr only", async () => {
		const calls: string[] = [];
		const route = await resolveRoute(
			{ HERDR_ENV: "1", HERDR_SOCKET_PATH: "/fixture", HERDR_PANE_ID: "w1:p1", TMUX: "/outer", TMUX_PANE: "%1" },
			async (command) => {
				calls.push(command);
				return JSON.stringify({ result: { pane: { pane_id: "w1:p1" } } });
			}
		);
		expect(route.ready).toBe(true);
		expect(route.owner).toBe("herdr");
		expect(calls).toEqual(["herdr"]);
	});
	test("stale Herdr never falls through to outer tmux", async () => {
		const route = await resolveRoute(
			{ HERDR_ENV: "1", HERDR_SOCKET_PATH: "/fixture", HERDR_PANE_ID: "w1:p1", TMUX: "/outer" },
			async () => {
				throw new Error("offline");
			}
		);
		expect(route.owner).toBe("herdr");
		expect(route.ready).toBe(false);
	});
	test("runner claim blocks local spawning even inside Herdr in tmux", async () => {
		const route = await resolveRoute({ OQTO_SESSION_ID: "managed", HERDR_ENV: "1", TMUX: "/outer" }, async () => {
			throw new Error("must not execute");
		});
		expect(route).toMatchObject({ owner: "oqto-runner", presentation: "herdr", ready: false });
	});
	test("plain tmux validates calling pane; mismatch refuses launch", async () => {
		expect(await resolveRoute({ TMUX: "/fixture", TMUX_PANE: "%12" }, async () => "%12\n")).toMatchObject({
			owner: "tmux",
			ready: true,
		});
		expect(await resolveRoute({ TMUX: "/fixture", TMUX_PANE: "%12" }, async () => "%13\n")).toMatchObject({
			owner: "tmux",
			ready: false,
		});
	});
	test("abort propagates instead of becoming a backend fallback", async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(resolveRoute({}, undefined, controller.signal)).rejects.toThrow();
	});
});

test("tmux launch targets calling session, keeps focus, forks and quotes hostile arguments", async () => {
	const calls: string[][] = [];
	const execute: Run = async (_command, args) => {
		calls.push(args);
		return calls.length === 1 ? "$9\n" : "@2|%3\n";
	};
	const result = await openTmuxSide(
		{
			pane: "%1",
			label: "side",
			cwd: "/work dir",
			sessionFile: "/session ' quoted",
			model: "provider/model",
			instruction: "$(touch /never); ' hi",
		},
		execute
	);
	expect(result).toMatchObject({ tabId: "@2", paneId: "%3" });
	expect(result.name).toMatch(/^\[side\] side \[[a-z0-9-]+\]$/);
	expect(calls[1].at(-1)).toContain("'--name'");
	expect(calls[1].at(-1)).toContain("Session boundary:");
	expect(calls[1]).toContain("$9:");
	expect(calls[1]).toContain("-d");
	expect(calls[1].at(-1)).toContain("'--fork'");
	expect(calls[1].at(-1)).not.toContain("send-keys");
	expect(shellArg("a'b")).toBe("'a'\\''b'");
	expect(() => shellArg("x\0y")).toThrow();
});
