/**
 * skdlr integration: skdlr owns the *timing* (cron, "weekdays at 09:00"), this
 * extension owns the *delivery* (into the running session with its context).
 *
 * Why not let skdlr run `pi -p`: that is a separate process with its own session
 * file and no access to this session's context, compaction state or queue — the
 * check would mean something different. Instead the skdlr command is the small
 * deliverer script shipped by this extension, which hands the text to the live
 * session over its inbox socket.
 *
 * Linking is exclusive: an action linked to skdlr stops using its in-session
 * timer, so a check can never fire twice. Unlinking restores the timer.
 */

import { execFile } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";

import type { ScheduleScope, ScheduledAction } from "./schedule.js";

const exec = promisify(execFile);

/** How a scheduled action reaches the session. */
export type Delivery = "session" | "skdlr";

export interface DeliveredBySkdlr {
	/** skdlr schedule name (deterministic, so unlink can find it). */
	name: string;
	/** skdlr's own schedule expression. */
	schedule: string;
	linkedAt: string;
}

/**
 * Deterministic skdlr schedule name. Kept stable so `/schedule unlink` works
 * even after the action's text is edited, and greppable in `skdlr list`.
 */
export function skdlrName(project: string, actionId: string, scope: ScheduleScope): string {
	const projectSlug = (path.basename(path.resolve(project)) || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-");
	const prefix = scope === "project" ? "pi-sched" : "pi-sched-session";
	return `${prefix}-${projectSlug}-${actionId}`.replace(/-+/g, "-").slice(0, 64);
}

/**
 * The skdlr command that delivers into the session.
 *
 * Absolute paths only: a scheduler runs with its own environment (systemd user
 * unit), not this shell, so `node` must be the current executable and the paths
 * must be fully resolved.
 */
export function delivererCommand(options: {
	nodePath: string;
	deliverer: string;
	sessionId: string;
	text: string;
	/** Absolute agent dir, so a systemd unit does not depend on the caller's env. */
	agentDir?: string;
	queue?: boolean;
}): string {
	const quote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;
	const parts = [
		quote(options.nodePath),
		quote(options.deliverer),
		"--session",
		quote(options.sessionId),
		"--text",
		quote(options.text),
	];
	if (options.agentDir) parts.push("--agent-dir", quote(options.agentDir));
	if (options.queue) parts.push("--queue");
	return parts.join(" ");
}

/** `skdlr add <name> --schedule <when> --workdir <dir> --command <cmd>` argv. */
export function skdlrAddArgs(options: {
	name: string;
	schedule: string;
	workdir: string;
	command: string;
	description: string;
}): string[] {
	return [
		"add",
		options.name,
		"--schedule",
		options.schedule,
		"--workdir",
		options.workdir,
		"--description",
		options.description.slice(0, 200),
		"--command",
		options.command,
	];
}

/** Human-readable form of the same command, for previews. */
export function skdlrAddPreview(options: {
	name: string;
	schedule: string;
	workdir: string;
	command: string;
}): string {
	const quote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;
	return `skdlr add ${quote(options.name)} --schedule ${quote(options.schedule)} --workdir ${quote(options.workdir)} --command ${quote(options.command)}`;
}

/**
 * Build the link descriptor for an action without touching skdlr, so the caller
 * can preview it and tests can assert the exact command.
 */
export function buildLink(options: {
	scope: ScheduleScope;
	project: string;
	action: ScheduledAction;
	sessionId: string;
	schedule: string;
	nodePath: string;
	deliverer: string;
	agentDir?: string;
	queue?: boolean;
}): { name: string; schedule: string; command: string; args: string[]; preview: string } {
	const name = skdlrName(options.project, options.action.id, options.scope);
	const command = delivererCommand({
		nodePath: options.nodePath,
		deliverer: options.deliverer,
		sessionId: options.sessionId,
		text: options.action.text,
		agentDir: options.agentDir,
		queue: options.queue,
	});
	const args = skdlrAddArgs({
		name,
		schedule: options.schedule,
		workdir: path.resolve(options.project),
		command,
		description: `pi-schedule: ${options.action.text.slice(0, 120)}`,
	});
	return {
		name,
		schedule: options.schedule,
		command,
		args,
		preview: skdlrAddPreview({ name, schedule: options.schedule, workdir: path.resolve(options.project), command }),
	};
}

export interface SkdlrResult {
	ok: boolean;
	stdout?: string;
	stderr?: string;
}

/** Run skdlr. Failures are returned, never thrown: skdlr is optional. */
export async function runSkdlr(args: string[]): Promise<SkdlrResult> {
	try {
		const { stdout, stderr } = await exec("skdlr", args, { timeout: 20_000, maxBuffer: 1024 * 1024 });
		return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
	} catch (error) {
		const failure = error as { stdout?: string; stderr?: string; message?: string };
		return { ok: false, stdout: failure.stdout?.trim(), stderr: failure.stderr?.trim() ?? failure.message };
	}
}

/**
 * Extract the schedules this extension owns from `skdlr list` output.
 *
 * skdlr's `--json` flag is not honoured by every build, so this parses the table
 * defensively: a line belongs to us when it starts with our prefix, and the
 * remaining columns are optional.
 */
export function parseOwnedSchedules(listOutput: string): Array<{ name: string; status?: string; schedule?: string }> {
	const owned: Array<{ name: string; status?: string; schedule?: string }> = [];
	for (const raw of listOutput.split("\n")) {
		const line = raw.trim();
		if (!line.startsWith("pi-sched")) continue;
		const columns = line.split(/\s{2,}/).filter(Boolean);
		const name = columns[0];
		if (!name) continue;
		const entry: { name: string; status?: string; schedule?: string } = { name };
		if (columns[1]) entry.status = columns[1];
		if (columns[3]) entry.schedule = columns[3];
		owned.push(entry);
	}
	return owned;
}

/**
 * Remove an owned schedule. `--yes` is required: without a TTY, skdlr's
 * confirmation prompt cancels and the schedule silently stays.
 */
export async function removeSchedule(name: string): Promise<SkdlrResult & { removed: boolean }> {
	const result = await runSkdlr(["remove", name, "--yes"]);
	if (!result.ok) return { ...result, removed: false };
	// skdlr exits 0 even when the prompt is cancelled; verify by listing.
	const list = await runSkdlr(["list"]);
	const stillThere = list.ok ? (list.stdout ?? "").includes(name) : true;
	return { ...result, removed: !stillThere };
}
