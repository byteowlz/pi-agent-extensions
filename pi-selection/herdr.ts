/**
 * Best-effort Herdr agent-state reporting while an interactive ask blocks.
 *
 * Uses the same `pane report-agent` / `pane release-agent` contract as
 * pi-sudo and pi-ssh-key. Never throws: a missing Herdr, a stale pane or a
 * slow CLI must not break a selection.
 */

import { execFile } from "node:child_process";

const SOURCE = "pi-selection";
let seq = 0;

function enabled(): boolean {
	return process.env.HERDR_ENV === "1" && !!process.env.HERDR_PANE_ID;
}

function run(args: string[]): void {
	try {
		execFile("herdr", args, () => {
			/* fire-and-forget */
		});
	} catch {
		/* ignore */
	}
}

/** Report the pane as blocked while waiting for a human answer. */
export function herdrBlocked(message: string): void {
	const pane = process.env.HERDR_PANE_ID;
	if (!enabled() || !pane) return;
	seq += 1;
	run([
		"pane",
		"report-agent",
		pane,
		"--source",
		SOURCE,
		"--agent",
		"pi",
		"--state",
		"blocked",
		"--seq",
		String(seq),
		"--message",
		message,
	]);
}

/** Hand lifecycle authority back to Herdr's own detection after the prompt. */
export function herdrRelease(): void {
	const pane = process.env.HERDR_PANE_ID;
	if (!enabled() || !pane) return;
	seq += 1;
	run(["pane", "report-agent", pane, "--source", SOURCE, "--agent", "pi", "--state", "working", "--seq", String(seq)]);
	run(["pane", "release-agent", pane, "--source", SOURCE, "--agent", "pi"]);
}
