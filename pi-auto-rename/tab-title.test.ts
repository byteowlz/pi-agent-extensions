import { expect, test } from "bun:test";
import { type TabTitleRequest, TabTitleSync, type TitleCommand, tabTitle } from "./tab-title.js";

const herdr: TabTitleRequest = {
	name: "[sub] Review Selection [mini-okay-soda]",
	readableId: "mini-okay-soda",
	sessionFile: "/synthetic/session.jsonl",
	env: { HERDR_ENV: "1", HERDR_PANE_ID: "owner-pane", HERDR_SOCKET_PATH: "/synthetic/herdr.sock", HERDR_TAB_ID: "stale-tab" },
};
function fixture(options: { count?: number; file?: string; move?: boolean } = {}) {
	const calls: string[][] = [];
	let reads = 0;
	const run: TitleCommand = async (program, args) => {
		calls.push([program, ...args]);
		if (args[0] === "pane")
			return JSON.stringify({
				result: {
					pane: {
						pane_id: "owner-pane",
						tab_id: options.move && ++reads > 1 ? "moved-tab" : "live-owner-tab",
						agent_session: { kind: "path", value: options.file ?? herdr.sessionFile },
					},
				},
			});
		if (args[1] === "get")
			return JSON.stringify({ result: { tab: { tab_id: "live-owner-tab", pane_count: options.count ?? 1 } } });
		return "{}";
	};
	return { calls, sync: new TabTitleSync(run) };
}

test("title strips only known ID and role, preserving original name and meaningful brackets", () => {
	expect(tabTitle(herdr.name, herdr.readableId)).toBe("Review Selection");
	expect(herdr.name).toBe("[sub] Review Selection [mini-okay-soda]");
	expect(tabTitle("[side] Review [draft] [not-a-known-id]", "mini-okay-soda")).toBe("Review [draft] [not-a-known-id]");
	expect(tabTitle("[side] Review [mini-okay-soda]", "mini-okay-soda")).toBe("Review");
});

test("Herdr uses live caller-owned tab, never env/focused tab", async () => {
	const f = fixture();
	await f.sync.update(herdr);
	expect(f.calls.at(-1)).toEqual(["herdr", "tab", "rename", "live-owner-tab", "Review Selection"]);
	expect(f.calls.every((c) => !c.includes("stale-tab"))).toBe(true);
});

for (const options of [{ count: 2 }, { file: "/other/session.jsonl" }, { move: true }]) {
	test(`Herdr refuses ambiguous/stale ownership ${JSON.stringify(options)}`, async () => {
		const f = fixture(options);
		await f.sync.update(herdr);
		expect(f.calls.some((c) => c.includes("rename"))).toBe(false);
	});
}

test("unavailable Herdr never falls through to outer tmux", async () => {
	const calls: string[] = [];
	const sync = new TabTitleSync(async (program) => {
		calls.push(program);
		throw new Error("unavailable");
	});
	await sync.update({ ...herdr, env: { ...herdr.env, TMUX: "/outer", TMUX_PANE: "%1" } });
	expect(calls).toEqual(["herdr"]);
});

test("tmux explicitly renames calling pane's window, not active window", async () => {
	const calls: string[][] = [];
	const sync = new TabTitleSync(async (program, args) => {
		calls.push([program, ...args]);
		return "%7|@4|1\n";
	});
	await sync.update({ ...herdr, env: { TMUX: "/server", TMUX_PANE: "%7" } });
	expect(calls.at(-1)).toEqual(["tmux", "rename-window", "-t", "@4", "Review Selection"]);
});

test("tmux shared windows and missing host claims remain untouched", async () => {
	const calls: string[][] = [];
	const sync = new TabTitleSync(async (program, args) => {
		calls.push([program, ...args]);
		return "%7|@4|2\n";
	});
	await sync.update({ ...herdr, env: { TMUX: "/server", TMUX_PANE: "%7" } });
	expect(calls).toHaveLength(1);
	await sync.update({ ...herdr, env: {} });
	expect(calls).toHaveLength(1);
});

test("session replacement fences in-flight discovery and queued updates", async () => {
	let release: (value: string) => void = () => {
		/* Set by controlled runner. */
	};
	let started: () => void = () => {
		/* Set by start barrier. */
	};
	const ready = new Promise<void>((resolve) => {
		started = resolve;
	});
	const calls: string[][] = [];
	const sync = new TabTitleSync(async (program, args) => {
		calls.push([program, ...args]);
		started();
		return await new Promise<string>((resolve) => {
			release = resolve;
		});
	});
	const running = sync.update(herdr);
	await ready;
	const queued = sync.update({ ...herdr, name: "obsolete" });
	sync.reset();
	release(JSON.stringify({ result: { pane: { pane_id: "owner-pane", tab_id: "live-owner-tab" } } }));
	await Promise.all([running, queued]);
	expect(calls).toHaveLength(1);
});
