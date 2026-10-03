import { expect, test } from "bun:test";
import { runPrivileged } from "./index.js";

test("privileged runner seam bounds both streams and strips fake password (no privilege used)", async () => {
	const password = "fake-password-fixture";
	const result = await runPrivileged(
		process.execPath,
		[
			"-e",
			`process.stdin.resume();process.stdin.on('end',()=>{process.stdout.write(${JSON.stringify(password)}+'x'.repeat(40000));process.stderr.write('y'.repeat(40000));});`,
		],
		password,
		undefined,
		5000
	);
	expect(result.exitCode).toBe(0);
	expect(result.stdout).not.toContain(password);
	expect(result.stdout.length).toBeLessThanOrEqual(32000);
	expect(result.stderr.length).toBeLessThanOrEqual(32000);
	expect(result.omittedStdoutChars).toBeGreaterThan(0);
	expect(result.omittedStderrChars).toBeGreaterThan(0);
});

test("pre-aborted runner never attempts a process", async () => {
	const controller = new AbortController();
	controller.abort();
	const result = await runPrivileged("must-not-spawn-fixture", [], "fake", controller.signal, 100);
	expect(result.cancelled).toBe(true);
	expect(result.exitCode).toBe(-1);
});

test("timeout settles once and kills a fixture which ignores SIGTERM", async () => {
	const result = await runPrivileged(
		process.execPath,
		["-e", "process.stdin.resume();process.on('SIGTERM',()=>{});setInterval(()=>{},1000);"],
		"fake",
		undefined,
		200
	);
	expect(result.timedOut).toBe(true);
	expect(result.exitCode).toBe(-1);
}, 5000);

test("abort settles a pending nonprivileged fixture", async () => {
	const controller = new AbortController();
	const pending = runPrivileged(
		process.execPath,
		["-e", "process.stdin.resume();setInterval(()=>{},1000);"],
		"fake",
		controller.signal,
		5000
	);
	setTimeout(() => controller.abort(), 100);
	const result = await pending;
	expect(result.cancelled).toBe(true);
}, 5000);
