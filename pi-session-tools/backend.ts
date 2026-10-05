import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sideLaunch } from "./side-launch.js";

export type Backend = "herdr" | "tmux" | "plain" | "oqto-runner";
export interface Route {
	owner: Backend;
	presentation: "herdr" | "tmux" | "none";
	ready: boolean;
	reason: string;
	/** Live calling-pane workspace, never the UI-focused workspace. */
	workspaceId?: string;
}
export type Run = (command: string, args: string[], signal?: AbortSignal) => Promise<string>;
const exec = promisify(execFile);
export const run: Run = async (command, args, signal) => {
	const result = await exec(command, args, { timeout: 5000, maxBuffer: 65536, signal });
	return result.stdout;
};

/** Claims determine priority; a failed claim never downgrades to an outer backend. */
export async function resolveRoute(env: NodeJS.ProcessEnv, execute: Run = run, signal?: AbortSignal): Promise<Route> {
	signal?.throwIfAborted();
	const runner =
		Boolean(env.OQTO_SESSION_ID) || (env.AGENT_CTX_PLATFORM === "oqto" && Boolean(env.AGENT_CTX_PLATFORM_SESSION_ID));
	const herdr = env.HERDR_ENV === "1";
	const tmux = Boolean(env.TMUX);
	const presentation = herdr ? "herdr" : tmux ? "tmux" : "none";
	if (runner)
		return {
			owner: "oqto-runner",
			presentation,
			ready: false,
			reason: "Runner owns this session; authorized runner adapter is not bound. Local spawning is blocked.",
		};
	if (herdr) {
		if (!env.HERDR_SOCKET_PATH || !env.HERDR_PANE_ID)
			return { owner: "herdr", presentation, ready: false, reason: "Incomplete Herdr context; refusing outer tmux fallback." };
		try {
			const response = JSON.parse(await execute("herdr", ["pane", "get", env.HERDR_PANE_ID], signal));
			if (response?.error || response?.result?.pane?.pane_id !== env.HERDR_PANE_ID) throw new Error("identity mismatch");
			return {
				owner: "herdr",
				presentation,
				ready: true,
				workspaceId: typeof response.result.pane.workspace_id === "string" ? response.result.pane.workspace_id : undefined,
				reason: "Validated current Herdr pane; takes precedence over outer tmux.",
			};
		} catch {
			signal?.throwIfAborted();
			return {
				owner: "herdr",
				presentation,
				ready: false,
				reason: "Herdr endpoint or pane identity unavailable; refusing outer tmux fallback.",
			};
		}
	}
	if (tmux) {
		if (!env.TMUX_PANE) return { owner: "tmux", presentation, ready: false, reason: "Missing calling tmux pane identity." };
		try {
			const pane = (await execute("tmux", ["display-message", "-p", "-t", env.TMUX_PANE, "#{pane_id}"], signal)).trim();
			if (pane !== env.TMUX_PANE) throw new Error("identity mismatch");
			return { owner: "tmux", presentation, ready: true, reason: "Validated calling tmux pane." };
		} catch {
			signal?.throwIfAborted();
			return { owner: "tmux", presentation, ready: false, reason: "tmux endpoint or calling pane unavailable." };
		}
	}
	return {
		owner: "plain",
		presentation: "none",
		ready: true,
		reason: "Standalone Pi; no terminal backend available for side windows.",
	};
}

/** tmux executes window commands through a shell; quote every argv element. */
export function shellArg(value: string): string {
	if (value.includes("\0")) throw new Error("NUL in launch argument");
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function openTmuxSide(
	options: {
		pane: string;
		label: string;
		cwd: string;
		sessionFile: string;
		parentSessionId?: string;
		model?: string;
		instruction?: string;
	},
	execute: Run = run
): Promise<{ name: string; tabId: string; paneId: string }> {
	if (!/^%\d+$/.test(options.pane)) throw new Error("Invalid tmux pane identity");
	if (!options.sessionFile) throw new Error("No persistent session to fork");
	const session = (await execute("tmux", ["display-message", "-p", "-t", options.pane, "#{session_id}"])).trim();
	if (!/^\$\d+$/.test(session)) throw new Error("Invalid tmux session identity");
	const launch = sideLaunch(options);
	const argv = ["pi", ...launch.argv];
	if (options.instruction) argv.push("--", options.instruction);
	// tmux supplies the new TMUX_PANE; do not erase it. Pi owns its new session id.
	const command = ["env", "-u", "AGENT_CTX_HARNESS_SESSION_ID", ...argv].map(shellArg).join(" ");
	const output = await execute("tmux", [
		"new-window",
		"-d",
		"-P",
		"-F",
		"#{window_id}|#{pane_id}",
		"-t",
		`${session}:`,
		"-n",
		launch.name,
		"-c",
		options.cwd,
		command,
	]);
	const [tabId, paneId] = output.trim().split("|");
	if (!/^@\d+$/.test(tabId ?? "") || !/^%\d+$/.test(paneId ?? ""))
		throw new Error(`Invalid tmux launch receipt ${JSON.stringify(output.slice(0, 100))}; window may have been created.`);
	return { name: launch.name, tabId, paneId };
}
