import { describe, expect, test } from "bun:test";
import { type ReloadRuntime, createReloader } from "./reload";

/** A fake Pi: `finishRun()` resolves waitForIdle; `reload()` reports to the reloader. */
function fakePi(options: { streaming?: boolean; refuseFirst?: boolean } = {}) {
	let streaming = options.streaming ?? false;
	let idleWaiters: Array<() => void> = [];
	const pi = {
		reloads: 0,
		refusals: 0,
		onReload: (_ok: boolean): void => undefined,
		finishRun() {
			streaming = false;
			const waiters = idleWaiters;
			idleWaiters = [];
			for (const resolve of waiters) resolve();
		},
		startRun() {
			streaming = true;
		},
		runtime: {
			isIdle: () => !streaming,
			waitForIdle: () => (streaming ? new Promise<void>((resolve) => idleWaiters.push(resolve)) : Promise.resolve()),
			reload: async () => {
				if (options.refuseFirst && pi.refusals === 0) {
					pi.refusals++;
					pi.onReload(false);
					return;
				}
				pi.reloads++;
				pi.onReload(true);
			},
		} satisfies ReloadRuntime,
	};
	return pi;
}

const noSleep = async (): Promise<void> => undefined;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("reload when idle", () => {
	test("an idle Pi reloads at once", async () => {
		const pi = fakePi();
		const reloader = createReloader({ isCompacting: () => false, sleep: noSleep });
		pi.onReload = (ok) => ok && reloader.shutdown("reload");
		expect(reloader.request(pi.runtime)).toBe("reloading");
		await tick();
		expect(pi.reloads).toBe(1);
	});

	test("a working Pi is queued and reloads only after its run ends", async () => {
		const pi = fakePi({ streaming: true });
		const states: string[] = [];
		const reloader = createReloader({ isCompacting: () => false, sleep: noSleep, onState: (s) => states.push(s) });
		pi.onReload = (ok) => ok && reloader.shutdown("reload");
		expect(reloader.request(pi.runtime)).toBe("queued");
		await tick();
		expect(pi.reloads).toBe(0);
		// Asking again while queued does not stack a second reload.
		expect(reloader.request(pi.runtime)).toBe("already_pending");
		pi.finishRun();
		await tick();
		await tick();
		expect(pi.reloads).toBe(1);
		expect(states).toEqual(["queued", "reloading"]);
	});

	test("compaction holds the reload even when the agent is idle", async () => {
		const pi = fakePi();
		let compacting = true;
		let sleeps = 0;
		const reloader = createReloader({
			isCompacting: () => compacting,
			sleep: async () => {
				sleeps++;
				if (sleeps === 3) compacting = false;
			},
		});
		pi.onReload = (ok) => ok && reloader.shutdown("reload");
		expect(reloader.request(pi.runtime)).toBe("queued");
		for (let i = 0; i < 10; i++) await tick();
		expect(sleeps).toBeGreaterThanOrEqual(3);
		expect(pi.reloads).toBe(1);
	});

	test("a refused reload (a queued run started) is retried, not dropped", async () => {
		const pi = fakePi({ refuseFirst: true });
		const reloader = createReloader({ isCompacting: () => false, sleep: noSleep });
		pi.onReload = (ok) => ok && reloader.shutdown("reload");
		reloader.request(pi.runtime);
		for (let i = 0; i < 10; i++) await tick();
		expect(pi.refusals).toBe(1);
		expect(pi.reloads).toBe(1);
	});

	test("quitting or replacing the session cancels a queued reload", async () => {
		const pi = fakePi({ streaming: true });
		const reloader = createReloader({ isCompacting: () => false, sleep: noSleep });
		reloader.request(pi.runtime);
		reloader.shutdown("quit");
		pi.finishRun();
		for (let i = 0; i < 5; i++) await tick();
		expect(pi.reloads).toBe(0);
		expect(reloader.pending()).toBe(false);
	});

	test("a failing reload is reported and can be asked again", async () => {
		const reloader = createReloader({ isCompacting: () => false, sleep: noSleep });
		const failures: string[] = [];
		const broken: ReloadRuntime = {
			isIdle: () => true,
			waitForIdle: async () => undefined,
			reload: async () => {
				throw new Error("stale ctx");
			},
		};
		const watched = createReloader({ isCompacting: () => false, onState: (s, d) => s === "failed" && failures.push(d ?? "") });
		watched.request(broken);
		await tick();
		expect(failures).toEqual(["stale ctx"]);
		expect(watched.pending()).toBe(false);
		expect(reloader.preview(true)).toBe("queued");
	});
});
