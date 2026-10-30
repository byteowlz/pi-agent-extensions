/**
 * Best-effort herdr agent-state reporting while wake-ups are pending.
 *
 * Same `pane report-agent` / `pane release-agent` contract as pi-sudo,
 * pi-selection and pi-ssh-key. The state is IDLE, not blocked: herdr's
 * `blocked` means "needs you" (its orchestration waits for it), and a sleeping
 * session does not need anyone — nothing is running and the message carries
 * the schedule. The claim is released the moment any run starts (the wake
 * itself, or a user prompt), so a stale idle report can never mask real work.
 *
 * Never throws: a missing herdr, a stale pane or a slow CLI must not break a
 * sleep.
 */

import { execFile } from "node:child_process";

const SOURCE = "pi-schedule";
let seq = 0;
let claimed = false;
let claimedMessage = "";

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

/** Report idle + the sleep notice; re-sends only when the notice changes. */
export function herdrSleeping(message: string): void {
	const pane = process.env.HERDR_PANE_ID;
	if (!enabled() || !pane || !message) return;
	if (claimed && claimedMessage === message) return;
	seq += 1;
	claimed = true;
	claimedMessage = message;
	run([
		"pane",
		"report-agent",
		pane,
		"--source",
		SOURCE,
		"--agent",
		"pi",
		"--state",
		"idle",
		"--seq",
		String(seq),
		"--message",
		message,
	]);
}

/** Any run start supersedes the sleep claim: report working, then release. */
export function herdrResume(): void {
	const pane = process.env.HERDR_PANE_ID;
	if (!enabled() || !pane || !claimed) return;
	claimed = false;
	claimedMessage = "";
	seq += 1;
	run(["pane", "report-agent", pane, "--source", SOURCE, "--agent", "pi", "--state", "working", "--seq", String(seq)]);
	run(["pane", "release-agent", pane, "--source", SOURCE, "--agent", "pi"]);
}

/** Drop the claim without a replacement state (session shutting down). */
export function herdrDrop(): void {
	const pane = process.env.HERDR_PANE_ID;
	if (!enabled() || !pane || !claimed) return;
	claimed = false;
	claimedMessage = "";
	run(["pane", "release-agent", pane, "--source", SOURCE, "--agent", "pi"]);
}
