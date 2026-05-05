/**
 * pi-sudo — proper sudo support for pi.
 *
 * Why this exists:
 *   On Arch Linux, pam_faillock is wired into /etc/pam.d/system-auth by
 *   default. When pi (or any agent) shells out to `sudo` from a context
 *   without a controlling TTY, PAM's conversation function fails, faillock
 *   counts that as a failed password, and after 3 strikes the user account
 *   gets locked for 10 minutes — even though no password was ever typed.
 *
 *   This extension gives pi a first-class way to run sudo commands:
 *     - Password is prompted through pi's own masked TUI (never a GUI askpass,
 *       never systemd-ask-password, never a helper script).
 *     - Password is piped on stdin via `sudo -S`, so there is no TTY
 *       requirement and no argv/env exposure.
 *     - Password is cached in-process with a TTL, cleared on shutdown.
 *     - The built-in `bash` tool is guarded so the LLM cannot accidentally
 *       call naked `sudo` and deadlock itself.
 *
 * Tools:
 *   sudo_exec({ command, reason?, timeout? })  — run a command under sudo.
 *
 * Commands:
 *   /sudo-status   — show cache state (has password / TTL remaining).
 *   /sudo-forget   — drop the cached password immediately.
 *   /sudo-test     — verify the cached password still works.
 */

import { spawn } from "node:child_process";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { Key, Text, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Password cache
// ---------------------------------------------------------------------------

const DEFAULT_TTL_MS = 5 * 60 * 1000; // matches sudo default timestamp_timeout
const MAX_PROMPT_ATTEMPTS = 3;

let cachedPassword: string | undefined;
let cacheExpiresAt = 0;

function cacheHasPassword(): boolean {
	return typeof cachedPassword === "string" && Date.now() < cacheExpiresAt;
}

function cacheSet(pw: string, ttlMs = DEFAULT_TTL_MS): void {
	cachedPassword = pw;
	cacheExpiresAt = Date.now() + ttlMs;
}

function cacheClear(): void {
	cachedPassword = undefined;
	cacheExpiresAt = 0;
}

function cacheRemainingMs(): number {
	if (!cacheHasPassword()) return 0;
	return Math.max(0, cacheExpiresAt - Date.now());
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateForDisplay(s: string, max: number): string {
	if (s.length <= max) return s;
	return `${s.slice(0, max - 1)}…`;
}

// ---------------------------------------------------------------------------
// Masked password prompt (custom TUI component)
// ---------------------------------------------------------------------------

async function promptPassword(ctx: ExtensionContext, title: string, subtitle?: string): Promise<string | null> {
	if (!ctx.hasUI) return null;

	return await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
		let buf = "";
		let cachedLines: string[] | undefined;

		const refresh = (): void => {
			cachedLines = undefined;
			tui.requestRender();
		};

		function handleInput(data: string): void {
			if (matchesKey(data, Key.escape)) {
				done(null);
				return;
			}
			if (matchesKey(data, Key.enter)) {
				done(buf);
				return;
			}
			if (matchesKey(data, Key.backspace)) {
				buf = buf.slice(0, -1);
				refresh();
				return;
			}
			// Accept printable characters only. Drop control bytes and escape
			// sequences so paste of garbage cannot poison the buffer.
			for (const ch of data) {
				const code = ch.charCodeAt(0);
				if (code >= 0x20 && code !== 0x7f) buf = `${buf}${ch}`;
			}
			refresh();
		}

		function render(width: number): string[] {
			if (cachedLines) return cachedLines;
			const lines: string[] = [];
			const add = (s: string): void => {
				lines.push(truncateToWidth(s, width));
			};

			add(theme.fg("accent", "─".repeat(width)));
			add(theme.fg("text", ` ${title}`));
			if (subtitle) add(theme.fg("muted", ` ${subtitle}`));
			lines.push("");

			const dots = "•".repeat(buf.length);
			add(` ${theme.fg("muted", "password:")} ${theme.fg("accent", dots)}${theme.fg("dim", "▏")}`);

			lines.push("");
			add(theme.fg("dim", " Enter to submit • Esc to cancel"));
			add(theme.fg("accent", "─".repeat(width)));

			cachedLines = lines;
			return lines;
		}

		return {
			render,
			invalidate: (): void => {
				cachedLines = undefined;
			},
			handleInput,
		};
	});
}

// ---------------------------------------------------------------------------
// sudo runner
// ---------------------------------------------------------------------------

interface SudoRunResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	authFailed: boolean;
	cancelled: boolean;
	timedOut: boolean;
}

// Matches sudo's password-failure output across the locales we care about.
const AUTH_FAIL_RE = /\b(incorrect password|try again|authentication failure|Sorry, try again)\b/i;
const PROMPT_LINE_RE = /^\[sudo\] password for [^\n]*\n?/;

function runSudo(command: string, password: string, signal: AbortSignal | undefined, timeoutMs: number): Promise<SudoRunResult> {
	return new Promise((resolve) => {
		// `-S` reads the password from stdin, `-p ""` suppresses the prompt
		// string, `--` terminates sudo options safely, and the command runs
		// through a login shell so PATH additions in ~/.profile apply.
		const child = spawn("sudo", ["-S", "-p", "", "--", "bash", "-lc", command], {
			stdio: ["pipe", "pipe", "pipe"],
			env: process.env,
		});

		let stdout = "";
		let stderr = "";
		let timedOut = false;
		let cancelled = false;
		let settled = false;

		const killTimer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
			setTimeout(() => {
				if (!child.killed) child.kill("SIGKILL");
			}, 2000).unref();
		}, timeoutMs);

		const onAbort = (): void => {
			cancelled = true;
			child.kill("SIGTERM");
		};
		if (signal) {
			if (signal.aborted) onAbort();
			else signal.addEventListener("abort", onAbort, { once: true });
		}

		// Write the password and close stdin immediately. Never reuse the
		// stream. Never log the written bytes.
		child.stdin.on("error", () => {
			/* swallow EPIPE if sudo exits before writing finishes */
		});
		child.stdin.write(`${password}\n`);
		child.stdin.end();

		child.stdout.on("data", (d: Buffer) => {
			stdout = `${stdout}${d.toString("utf8")}`;
		});
		child.stderr.on("data", (d: Buffer) => {
			stderr = `${stderr}${d.toString("utf8")}`;
		});

		const finish = (code: number): void => {
			if (settled) return;
			settled = true;
			clearTimeout(killTimer);
			if (signal) signal.removeEventListener("abort", onAbort);

			// Strip any leftover "[sudo] password for …" echo.
			const cleanStderr = stderr.replace(PROMPT_LINE_RE, "");
			const authFailed = code !== 0 && AUTH_FAIL_RE.test(cleanStderr);

			resolve({
				stdout,
				stderr: cleanStderr,
				exitCode: code,
				authFailed,
				cancelled,
				timedOut,
			});
		};

		child.on("error", () => finish(-1));
		child.on("close", (code) => finish(code ?? -1));
	});
}

// ---------------------------------------------------------------------------
// Ensure we have a working password, prompting + retrying as needed
// ---------------------------------------------------------------------------

type EnsureOutcome = SudoRunResult | { error: string };

async function ensurePasswordAndRun(
	command: string,
	reason: string | undefined,
	timeoutMs: number,
	signal: AbortSignal | undefined,
	ctx: ExtensionContext
): Promise<EnsureOutcome> {
	let attempts = 0;

	while (attempts < MAX_PROMPT_ATTEMPTS) {
		if (!cacheHasPassword()) {
			const title = "sudo: password required";
			const subtitle = reason
				? `${reason} — will run: ${truncateForDisplay(command, 80)}`
				: `will run: ${truncateForDisplay(command, 80)}`;
			const pw = await promptPassword(ctx, title, subtitle);
			if (pw === null) {
				return { error: "User cancelled password prompt" };
			}
			if (pw.length === 0) {
				attempts = attempts + 1;
				continue;
			}
			cacheSet(pw);
		}

		const pw = cachedPassword;
		if (typeof pw !== "string") {
			// Race: cleared between check and use. Loop to re-prompt.
			attempts = attempts + 1;
			continue;
		}

		const result = await runSudo(command, pw, signal, timeoutMs);

		if (result.cancelled || result.timedOut) return result;

		if (result.authFailed) {
			cacheClear();
			attempts = attempts + 1;
			ctx.ui.notify(`sudo: incorrect password (attempt ${attempts}/${MAX_PROMPT_ATTEMPTS})`, "warning");
			continue;
		}

		// On success, refresh the TTL.
		cacheSet(pw);
		return result;
	}

	return { error: `sudo: too many incorrect password attempts (${MAX_PROMPT_ATTEMPTS})` };
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

interface SudoExecDetails {
	command: string;
	reason?: string;
	exitCode: number;
	stdout: string;
	stderr: string;
	cancelled: boolean;
	timedOut: boolean;
	errorMessage?: string;
}

export type SudoExecInput = {
	command: string;
	reason?: string;
	timeout?: number;
};

export default function pisudo(pi: ExtensionAPI): void {
	// ---- session_shutdown: drop the cached password ---------------------
	pi.on("session_shutdown", async () => {
		cacheClear();
	});

	// ---- Intercept naked `sudo` in the built-in bash tool --------------
	pi.on("tool_call", async (event) => {
		if (!isToolCallEventType("bash", event)) return;
		const cmd = event.input.command ?? "";
		// Allow `sudo -n …` (non-interactive credential check) since it cannot
		// hang. Block any other leading `sudo` token because it would try to
		// prompt and either deadlock or trip pam_faillock.
		const hasNonInteractive = /(^|[\s;&|])sudo\s+-n\b/.test(cmd);
		const hasInteractive = /(^|[\s;&|])sudo(\s+(?!-n\b)|$)/.test(cmd);
		if (hasInteractive && !hasNonInteractive) {
			return {
				block: true,
				reason:
					"Direct `sudo` in the bash tool is disabled by pi-sudo. Use the `sudo_exec` tool instead — it handles password prompting through pi's UI and avoids locking out the user via pam_faillock.",
			};
		}
		return undefined;
	});

	// ---- Tool: sudo_exec -------------------------------------------------
	pi.registerTool({
		name: "sudo_exec",
		label: "sudo",
		description:
			"Run a shell command with sudo. Prompts the user for their password through pi's UI on first use and caches it for the session's sudo timestamp window. Use this whenever you need elevated privileges instead of calling `sudo` directly from the bash tool.",
		promptSnippet: "Run a shell command under sudo with interactive password prompting",
		promptGuidelines: [
			"Use `sudo_exec` for any command that requires root. Never call `sudo` from the `bash` tool — it will be blocked.",
			"Always pass a short human-readable `reason` explaining why root is needed. The reason is shown to the user in the password prompt.",
		],
		parameters: Type.Object({
			command: Type.String({
				description: "The shell command to run under sudo. Executed via `bash -lc`, so pipes, redirects, and env vars work.",
			}),
			reason: Type.Optional(
				Type.String({
					description: "Short human-readable explanation of why root is needed. Shown to the user in the password prompt.",
				})
			),
			timeout: Type.Optional(
				Type.Number({
					description: "Timeout in milliseconds (default 120000 = 2 minutes).",
					minimum: 1000,
					maximum: 30 * 60 * 1000,
				})
			),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const command = params.command;
			const reason = params.reason;
			const timeoutMs = params.timeout ?? 120_000;

			if (!ctx.hasUI) {
				const details: SudoExecDetails = {
					command,
					reason,
					exitCode: -1,
					stdout: "",
					stderr: "",
					cancelled: false,
					timedOut: false,
					errorMessage: "sudo_exec requires an interactive UI to prompt for the password",
				};
				return {
					content: [{ type: "text", text: details.errorMessage ?? "error" }],
					details,
					isError: true,
				};
			}

			const outcome = await ensurePasswordAndRun(command, reason, timeoutMs, signal, ctx);

			if ("error" in outcome) {
				const details: SudoExecDetails = {
					command,
					reason,
					exitCode: -1,
					stdout: "",
					stderr: "",
					cancelled: false,
					timedOut: false,
					errorMessage: outcome.error,
				};
				return {
					content: [{ type: "text", text: outcome.error }],
					details,
					isError: true,
				};
			}

			const details: SudoExecDetails = {
				command,
				reason,
				exitCode: outcome.exitCode,
				stdout: outcome.stdout,
				stderr: outcome.stderr,
				cancelled: outcome.cancelled,
				timedOut: outcome.timedOut,
			};

			const header = outcome.cancelled
				? "sudo: cancelled"
				: outcome.timedOut
					? `sudo: timed out after ${timeoutMs}ms`
					: `sudo: exit ${outcome.exitCode}`;
			const parts: string[] = [];
			if (outcome.stdout) parts.push(`stdout:\n${outcome.stdout}`);
			if (outcome.stderr) parts.push(`stderr:\n${outcome.stderr}`);
			const body = parts.join("\n");
			const text = body ? `${header}\n\n${body}` : header;

			return {
				content: [{ type: "text", text }],
				details,
				isError: outcome.exitCode !== 0 || outcome.cancelled || outcome.timedOut,
			};
		},

		renderCall(args, theme) {
			const cmd = typeof args?.command === "string" ? args.command : "";
			const reason = typeof args?.reason === "string" ? args.reason : undefined;
			const head = `${theme.fg("toolTitle", theme.bold("sudo "))}${theme.fg("muted", truncateForDisplay(cmd, 120))}`;
			const text = reason ? `${head}\n${theme.fg("dim", `  reason: ${reason}`)}` : head;
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as SudoExecDetails | undefined;
			if (!details) return new Text("", 0, 0);
			if (details.errorMessage) {
				return new Text(theme.fg("error", `✗ ${details.errorMessage}`), 0, 0);
			}
			if (details.cancelled) return new Text(theme.fg("warning", "Cancelled"), 0, 0);
			if (details.timedOut) return new Text(theme.fg("error", "Timed out"), 0, 0);
			const color = details.exitCode === 0 ? "success" : "error";
			const mark = details.exitCode === 0 ? "✓" : "✗";
			return new Text(theme.fg(color, `${mark} exit ${details.exitCode}`), 0, 0);
		},
	});

	// ---- Commands --------------------------------------------------------
	pi.registerCommand("sudo-status", {
		description: "Show pi-sudo password cache status",
		handler: async (_args, ctx) => {
			if (cacheHasPassword()) {
				const secs = Math.ceil(cacheRemainingMs() / 1000);
				ctx.ui.notify(`sudo: password cached (${secs}s remaining)`, "info");
			} else {
				ctx.ui.notify("sudo: no cached password", "info");
			}
		},
	});

	pi.registerCommand("sudo-forget", {
		description: "Drop the cached sudo password",
		handler: async (_args, ctx) => {
			cacheClear();
			ctx.ui.notify("sudo: cache cleared", "info");
		},
	});

	pi.registerCommand("sudo-test", {
		description: "Verify the cached sudo password still works (runs `sudo true`)",
		handler: async (_args, ctx) => {
			const outcome = await ensurePasswordAndRun("true", "sudo-test", 15_000, undefined, ctx);
			if ("error" in outcome) {
				ctx.ui.notify(outcome.error, "error");
				return;
			}
			if (outcome.exitCode === 0) {
				ctx.ui.notify("sudo: OK", "info");
			} else {
				ctx.ui.notify(`sudo: test failed (exit ${outcome.exitCode})`, "error");
			}
		},
	});
}
