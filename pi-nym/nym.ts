/**
 * Thin wrapper around `nym traces anon`: plan (report candidates) and apply
 * (redact with explicit keep decisions). nym does all detection locally.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, delimiter, join } from "node:path";
import { type PiNymConfig, xdgHome } from "./config.js";

export interface Candidate {
	value: string;
	class: string;
	source: "detected" | "listed" | "propagated";
	credential: boolean;
	count: number;
	context: string;
}

export interface RunResult {
	code: number | null;
	stdout: string;
	stderr: string;
}

export interface RunOptions {
	signal?: AbortSignal;
	timeoutMs: number;
	/** Called with each complete stderr line as it arrives. */
	onStderrLine?: (line: string) => void;
}

export type Runner = (binary: string, args: string[], options: RunOptions) => Promise<RunResult>;

export const run: Runner = (binary, args, { signal, timeoutMs, onStderrLine }) =>
	new Promise((resolve, reject) => {
		const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"], signal });
		const out: Buffer[] = [];
		const err: Buffer[] = [];
		const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
		child.stdout.on("data", (b: Buffer) => out.push(b));
		let pending = "";
		child.stderr.on("data", (b: Buffer) => {
			err.push(b);
			if (!onStderrLine) return;
			const lines = (pending + b.toString("utf8")).split("\n");
			pending = lines.pop() ?? "";
			for (const line of lines) onStderrLine(line);
		});
		child.on("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolve({ code, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") });
		});
	});

export async function isCapable(binary: string, runner: Runner = run): Promise<boolean> {
	try {
		const result = await runner(binary, ["traces", "anon", "--help"], { timeoutMs: 15000 });
		return result.code === 0 && ["--plan", "--keep-values-file", "--progress-json"].every((flag) => result.stdout.includes(flag));
	} catch {
		return false;
	}
}

/** First executable named `name` on PATH. */
export function findOnPath(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
	return onPath(name, env)[0];
}

function onPath(name: string, env: NodeJS.ProcessEnv): string[] {
	return (env.PATH ?? "")
		.split(delimiter)
		.filter(Boolean)
		.map((dir) => join(dir, name))
		.filter((path) => existsSync(path));
}

function localBuilds(env: NodeJS.ProcessEnv): string[] {
	const root = join(xdgHome("XDG_DATA_HOME", ".local/share", env), "nym", "builds");
	if (!existsSync(root)) return [];
	return readdirSync(root)
		.map((dir) => join(root, dir, "nym"))
		.filter((path) => existsSync(path))
		.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

/** First nym that supports trace plans: configured, then PATH, then newest local build. */
export async function findNym(config: PiNymConfig, runner: Runner = run, env: NodeJS.ProcessEnv = process.env): Promise<string> {
	const candidates = config.nymBinary ? [config.nymBinary] : [...onPath("nym", env), ...localBuilds(env)];
	for (const binary of candidates) {
		if (await isCapable(binary, runner)) return binary;
	}
	throw new Error(
		config.nymBinary
			? "the configured nymBinary does not support `traces anon --plan --progress-json`; update nym"
			: "no nym with `traces anon --plan --progress-json` found; install a current nym or set nymBinary in pi-nym.json"
	);
}

export interface ProgressEvent {
	phase: "detect" | "ner" | "replace" | "done";
	done: number;
	total: number;
}

/** Parse one `--progress-json` stderr line; undefined for anything else. */
export function parseProgress(line: string): ProgressEvent | undefined {
	if (!line.startsWith('{"nym_progress"')) return undefined;
	try {
		const event = (JSON.parse(line) as { nym_progress?: ProgressEvent }).nym_progress;
		return event && typeof event.done === "number" && typeof event.total === "number" ? event : undefined;
	} catch {
		return undefined;
	}
}

/** Phase weights from measured runs: NER dominates whenever it runs. */
const WEIGHTS: Record<ProgressEvent["phase"], [number, number]> = {
	detect: [0, 0.15],
	ner: [0.15, 0.9],
	replace: [0.9, 1],
	done: [1, 1],
};

/** Overall fraction 0..1 across nym's phases. */
export function fraction(event: ProgressEvent): number {
	const [from, to] = WEIGHTS[event.phase] ?? [0, 0];
	const part = event.total > 0 ? Math.min(1, event.done / event.total) : 1;
	return from + (to - from) * part;
}

export type OnProgress = (event: ProgressEvent) => void;

function withProgress(runner: Runner, onProgress?: OnProgress): Runner {
	return (binary, args, options) =>
		runner(binary, args, {
			...options,
			onStderrLine: (line) => {
				const event = parseProgress(line);
				if (event) onProgress?.(event);
			},
		});
}

function commonArgs(config: PiNymConfig): string[] {
	const args = ["--no-progress", "--progress-json"];
	if (!config.ner) args.push("--no-ner");
	else args.push("--ner-scope", config.nerScope);
	for (const profile of config.profiles) args.push("--redaction-profile", profile);
	return args;
}

function failure(step: string, result: RunResult): Error {
	const detail =
		result.stderr
			.trim()
			.split("\n")
			.filter((line) => !parseProgress(line))
			.pop() ?? "";
	return new Error(`nym ${step} failed${detail ? `: ${detail}` : ""}`);
}

export interface Paths {
	work: string;
	snapshot: string;
}

/** Report what nym would replace in the snapshot, without writing outputs. */
export async function plan(
	binary: string,
	paths: Paths,
	config: PiNymConfig,
	signal?: AbortSignal,
	runner: Runner = run,
	onProgress?: OnProgress
): Promise<Candidate[]> {
	const planPath = join(paths.work, "plan.json");
	const result = await withProgress(runner, onProgress)(
		binary,
		["traces", "anon", paths.snapshot, "--plan", planPath, ...commonArgs(config)],
		{
			signal,
			timeoutMs: config.timeoutMs,
		}
	);
	if (result.code !== 0) throw failure("scan", result);
	const parsed = JSON.parse(readFileSync(planPath, "utf8")) as { sessions: { candidates: Candidate[] }[] };
	return parsed.sessions[0]?.candidates ?? [];
}

export interface Applied {
	redacted: string;
	keys: string;
}

/** Redact the snapshot, never replacing the explicitly kept values. */
export async function apply(
	binary: string,
	paths: Paths,
	keep: string[],
	config: PiNymConfig,
	signal?: AbortSignal,
	runner: Runner = run,
	onProgress?: OnProgress
): Promise<Applied> {
	const keepPath = join(paths.work, "keep.txt");
	writeFileSync(keepPath, keep.map((v) => `${v}\n`).join(""), { mode: 0o600 });
	const out = join(paths.work, "out");
	const keys = join(paths.work, "keys");
	const result = await withProgress(runner, onProgress)(
		binary,
		["traces", "anon", paths.snapshot, "-o", out, "--keys", keys, "--keep-values-file", keepPath, ...commonArgs(config)],
		{ signal, timeoutMs: config.timeoutMs }
	);
	if (result.code !== 0) throw failure("redaction", result);
	const name = basename(paths.snapshot);
	return {
		redacted: readFileSync(join(out, name), "utf8"),
		keys: readFileSync(join(keys, name.replace(/\.jsonl$/, ".keys.jsonl")), "utf8"),
	};
}
