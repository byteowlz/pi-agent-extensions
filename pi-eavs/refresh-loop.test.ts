import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { RefreshLoop } from "./refresh-loop.js";

test("polling joins manual refresh, never overlaps, backs off, prunes on logout and aborts on shutdown", async () => {
	let calls = 0;
	let active = 0;
	let peak = 0;
	const times: number[] = [];
	const loop = new RefreshLoop(
		async (signal) => {
			calls++;
			active++;
			peak = Math.max(peak, active);
			times.push(Date.now());
			try {
				await delay(10, undefined, { signal });
			} catch {
				/* Stop cancellation is expected. */
			} finally {
				active--;
			}
			return { failed: true, configured: calls < 3 };
		},
		20,
		80
	);
	loop.start();
	await delay(5);
	const pending = loop.run();
	assert.equal(loop.run(), pending);
	await delay(190);
	assert.equal(calls, 3);
	assert.equal(peak, 1);
	assert.ok(times[1] - times[0] >= 40);
	assert.ok(times[2] - times[1] >= 80);
	await delay(100);
	assert.equal(calls, 3);
	loop.stop();
	let aborted = false;
	const shutdown = new RefreshLoop(
		async (signal) => {
			await new Promise<void>((resolve) =>
				signal.addEventListener(
					"abort",
					() => {
						aborted = true;
						resolve();
					},
					{ once: true }
				)
			);
			return { failed: true, configured: true };
		},
		5,
		10
	);
	shutdown.start();
	await delay(5);
	shutdown.stop();
	await delay(15);
	assert.equal(aborted, true);
});
