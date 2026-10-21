import { expect, test } from "bun:test";
import { join } from "node:path";
import { SandboxError, assertEffective, effectiveReportArgs, launchArgs, parseReport, resolveSandboxCli } from "./sandbox.js";
import type { Staging } from "./staging.js";

const staging = {
	root: "/tmp/pi-surgeon-x",
	work: "/tmp/pi-surgeon-x/work",
	agentDir: "/tmp/pi-surgeon-x/work/agent",
	sessionsDir: "/tmp/pi-surgeon-x/work/sessions",
	homeDir: "/tmp/pi-surgeon-x/work/home",
	extDir: "/tmp/pi-surgeon-x/work/ext/pi-session-surgeon",
	extEntry: "/tmp/pi-surgeon-x/work/ext/pi-session-surgeon/index.ts",
	policyPath: "/tmp/pi-surgeon-x/policy.toml",
	targetFile: "/tmp/pi-surgeon-x/work/session.jsonl",
	originalFile: "/tmp/original.jsonl",
	cleanup: () => undefined,
} as Staging;

const report = (overrides: Record<string, unknown> = {}) => ({
	profile: "development",
	workspace: "/tmp/pi-surgeon-x/work",
	allow_write: ["/tmp/pi-surgeon-x/work", "/tmp", "/var/tmp"],
	deny_read: ["/home/u/.pi", "/home/u/.ssh"],
	deny_write: ["/home/u/.pi", "/home/u/.ssh"],
	resolved_config: { home_access: "none", profile: "development" },
	enforcement_verified: true,
	...overrides,
});

test("accepts a report whose only non-temp write grant is the workspace", () => {
	expect(() => assertEffective(report(), staging)).not.toThrow();
});

test("rejects a widening write, a missing denial, a different workspace and a readable home", () => {
	expect(() => assertEffective(report({ allow_write: ["/tmp/pi-surgeon-x/work", "/home/u/.pi"] }), staging)).toThrow(
		/outside the workspace/
	);
	expect(() => assertEffective(report({ allow_write: ["/tmp"] }), staging)).toThrow(/does not grant the staging workspace/);
	expect(() => assertEffective(report({ deny_read: ["/home/u/.ssh"] }), staging)).toThrow(/does not deny ~\/.pi/);
	expect(() => assertEffective(report({ workspace: "/home/u/repo" }), staging)).toThrow(/not the staging workspace/);
	expect(() => assertEffective(report({ resolved_config: { home_access: "read" } }), staging)).toThrow(/home_access/);
});

test("report args are restriction-only and never select a profile or config", () => {
	const args = effectiveReportArgs(staging);
	expect(args).toEqual(["--overlay", staging.policyPath, "--workspace", staging.work, "--print-effective", "--json"]);
	expect(args).not.toContain("--config");
	expect(args).not.toContain("--profile");
	const launch = launchArgs(staging, ["/usr/bin/node", "/pi/cli.js", "-p", "hi"]);
	expect(launch.slice(0, 5)).toEqual(["--overlay", staging.policyPath, "--workspace", staging.work, "--"]);
});

test("an empty launch command is refused", () => {
	expect(() => launchArgs(staging, [])).toThrow(SandboxError);
});

test("report parsing fails closed on non-JSON and non-zero exit", () => {
	expect(() => parseReport({ code: 1, stdout: "{}", stderr: "denied", timedOut: false })).toThrow(/exit 1/);
	expect(() => parseReport({ code: 0, stdout: "not json", stderr: "", timedOut: false })).toThrow(/not JSON/);
	expect(parseReport({ code: 0, stdout: JSON.stringify(report()), stderr: "", timedOut: false }).profile).toBe("development");
});

test("missing oqto-sandbox resolves to undefined (caller must fail closed)", () => {
	expect(resolveSandboxCli({ PATH: join("/definitely", "missing") })).toBeUndefined();
});
