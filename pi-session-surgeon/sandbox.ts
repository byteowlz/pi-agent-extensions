/**
 * oqto-sandbox integration: resolve the CLI, inspect the effective policy, and
 * build the sandboxed launch.
 *
 * The extension never authors policy. It supplies a restriction-only overlay
 * (ADR 0070) and refuses to launch unless the resolved policy proves the
 * workspace is the only writable grant.
 */

import { spawn } from "node:child_process";
import { constants, accessSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve, sep } from "node:path";
import type { Staging } from "./staging.js";

export class SandboxError extends Error {}

/** Resolve `oqto-sandbox` from PATH (no shell, no guessing). */
export function resolveSandboxCli(env: NodeJS.ProcessEnv = process.env): string | undefined {
	for (const dir of (env.PATH ?? "").split(delimiter)) {
		if (!dir) continue;
		const candidate = join(dir, "oqto-sandbox");
		try {
			accessSync(candidate, constants.X_OK);
			return candidate;
		} catch {
			/* keep looking */
		}
	}
	return undefined;
}

/** Args for the no-launch inspection used to prove the policy before launching. */
export function effectiveReportArgs(staging: Staging): string[] {
	return ["--overlay", staging.policyPath, "--workspace", staging.work, "--print-effective", "--json"];
}

/** Args for a compile-only dry run (used where no effective report exists yet). */
export function dryRunArgs(staging: Staging, command: readonly string[] = ["/bin/true"]): string[] {
	return ["--overlay", staging.policyPath, "--workspace", staging.work, "--dry-run", "--", ...command];
}

/** Args for the sandboxed launch around an explicit command vector. */
export function launchArgs(staging: Staging, command: readonly string[]): string[] {
	if (command.length === 0) throw new SandboxError("empty launch command");
	return ["--overlay", staging.policyPath, "--workspace", staging.work, "--", ...command];
}

export interface EffectiveReport {
	profile?: string;
	workspace?: string;
	cwd?: string;
	allow_write?: string[];
	deny_read?: string[];
	deny_write?: string[];
	resolved_config?: { home_access?: string; profile?: string };
	enforcement_verified?: boolean;
}

const TEMP_ROOTS = ["/tmp", "/var/tmp", "/dev/shm"];

function inside(child: string, parent: string): boolean {
	const rel = resolve(child);
	const base = resolve(parent);
	return rel === base || rel.startsWith(`${base}${sep}`);
}

function underTemp(path: string): boolean {
	return TEMP_ROOTS.some((root) => inside(path, root));
}

/**
 * Prove the launch is restricted to the staging workspace.
 * Throws instead of launching on any widening, missing denial or wrong workspace.
 */
export function assertEffective(report: EffectiveReport, staging: Staging): void {
	if (!report || typeof report !== "object") throw new SandboxError("effective policy report is not an object");
	if (!report.workspace) throw new SandboxError("effective policy report has no workspace");
	if (!inside(staging.work, report.workspace) || !inside(report.workspace, staging.work))
		throw new SandboxError(`effective workspace ${report.workspace} is not the staging workspace ${staging.work}`);
	const access = report.resolved_config?.home_access;
	if (access !== "none") throw new SandboxError(`home_access must be "none", got ${String(access)}`);
	for (const path of report.allow_write ?? []) {
		if (inside(path, staging.work) || underTemp(path)) continue;
		throw new SandboxError(`unexpected writable path outside the workspace: ${path}`);
	}
	if (!(report.allow_write ?? []).some((path) => inside(path, staging.work)))
		throw new SandboxError("effective policy does not grant the staging workspace");
	for (const denied of ["~/.pi", "~/.ssh"]) {
		const suffix = denied.replace(/^~/, "");
		const present = (report.deny_read ?? []).some((path) => path.endsWith(suffix));
		if (!present) throw new SandboxError(`effective policy does not deny ${denied}`);
	}
}

export interface RunResult {
	code: number | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
}

export interface RunOptions {
	timeoutMs: number;
	signal?: AbortSignal;
	env?: NodeJS.ProcessEnv;
	maxBytes?: number;
}

/** Run a command with a bounded output and a hard deadline. */
export function run(program: string, args: readonly string[], options: RunOptions): Promise<RunResult> {
	const limit = options.maxBytes ?? 1_000_000;
	return new Promise((resolvePromise, reject) => {
		const child = spawn(program, [...args], {
			env: options.env ?? process.env,
			stdio: ["ignore", "pipe", "pipe"],
			detached: process.platform !== "win32",
		});
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		let settled = false;
		const append = (current: string, chunk: Buffer) =>
			current.length >= limit ? current : (current + chunk.toString("utf8")).slice(0, limit);
		child.stdout.on("data", (chunk: Buffer) => {
			stdout = append(stdout, chunk);
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr = append(stderr, chunk);
		});
		const kill = () => {
			try {
				if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
				else child.kill("SIGKILL");
			} catch {
				/* already gone */
			}
		};
		const timer = setTimeout(() => {
			timedOut = true;
			kill();
		}, options.timeoutMs);
		const abort = () => {
			kill();
		};
		options.signal?.addEventListener("abort", abort, { once: true });
		const finish = (code: number | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			options.signal?.removeEventListener("abort", abort);
			resolvePromise({ code, stdout, stderr, timedOut });
		};
		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			options.signal?.removeEventListener("abort", abort);
			reject(error);
		});
		child.on("close", finish);
	});
}

/** Parse the JSON report, failing closed on non-JSON or a non-zero exit. */
export function parseReport(result: RunResult): EffectiveReport {
	if (result.timedOut) throw new SandboxError("effective-policy inspection timed out");
	if (result.code !== 0)
		throw new SandboxError(
			`effective-policy inspection failed (exit ${String(result.code)}): ${result.stderr.trim().slice(0, 400)}`
		);
	try {
		return JSON.parse(result.stdout) as EffectiveReport;
	} catch (error) {
		throw new SandboxError(`effective-policy report is not JSON: ${error instanceof Error ? error.message : "parse error"}`);
	}
}

/** The Pi command vector, resolved to absolute paths so it survives the sandbox. */
export function piCommand(): string[] {
	const script = process.argv[1];
	if (!script || !isAbsolute(script)) throw new SandboxError("cannot resolve the pi entry point (argv[1] is not absolute)");
	return [process.execPath, script];
}
