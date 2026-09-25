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

import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { Key, Text, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Configuration (pi-sudo.json: ./ , ./.pi/ , ~/.pi/agent/ — first match wins)
// ---------------------------------------------------------------------------

interface SudoConfig {
	/** Default command execution timeout in ms (per-call `timeout` overrides). */
	defaultTimeoutMs: number;
	/** Password prompt auto-cancel after this many ms without an answer (0 = wait forever). */
	promptTimeoutMs: number;
	/** Password cache TTL in ms (0 = no time-based expiry). */
	cacheTtlMs: number;
	/** Password cache expires after this many completed agent turns (0 = unlimited turns). */
	cacheTurns: number;
	/** Password prompt attempts before giving up. */
	maxPromptAttempts: number;
}

const DEFAULT_CONFIG: SudoConfig = {
	defaultTimeoutMs: 120_000,
	promptTimeoutMs: 120_000,
	cacheTtlMs: 5 * 60 * 1000,
	cacheTurns: 0,
	maxPromptAttempts: 3,
};

let config: SudoConfig = { ...DEFAULT_CONFIG };

function loadSudoConfig(): SudoConfig {
	const cfg = { ...DEFAULT_CONFIG };
	for (const path of ["pi-sudo.json", joinConfigPath(".pi", "pi-sudo.json"), joinConfigPath("agent", "pi-sudo.json")]) {
		if (!path || !existsSync(path)) continue;
		try {
			const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<SudoConfig>;
			if (typeof parsed.defaultTimeoutMs === "number" && parsed.defaultTimeoutMs >= 1000)
				cfg.defaultTimeoutMs = parsed.defaultTimeoutMs;
			if (typeof parsed.promptTimeoutMs === "number" && parsed.promptTimeoutMs >= 0) cfg.promptTimeoutMs = parsed.promptTimeoutMs;
			if (typeof parsed.cacheTtlMs === "number" && parsed.cacheTtlMs >= 0) cfg.cacheTtlMs = parsed.cacheTtlMs;
			if (typeof parsed.cacheTurns === "number" && parsed.cacheTurns >= 0) cfg.cacheTurns = Math.floor(parsed.cacheTurns);
			if (typeof parsed.maxPromptAttempts === "number" && parsed.maxPromptAttempts >= 1)
				cfg.maxPromptAttempts = Math.floor(parsed.maxPromptAttempts);
			break; // first match wins
		} catch {
			// ignore malformed config, keep defaults
		}
	}
	return cfg;
}

function joinConfigPath(sub: string, file: string): string | undefined {
	const home = process.env.HOME;
	if (!home) return undefined;
	return `${home}/.pi/${sub}/${file}`;
}

// ---------------------------------------------------------------------------
// herdr blocked-state reporting (best-effort; only inside a herdr pane)
// ---------------------------------------------------------------------------

const HERDR_SOURCE = "pi-sudo";
let herdrSeq = 0;

function herdrReport(state: "blocked" | "working", message?: string): void {
	const pane = process.env.HERDR_PANE_ID;
	if (process.env.HERDR_ENV !== "1" || !pane) return;
	herdrSeq += 1;
	const args = [
		"pane",
		"report-agent",
		pane,
		"--source",
		HERDR_SOURCE,
		"--agent",
		"pi",
		"--state",
		state,
		"--seq",
		String(herdrSeq),
	];
	if (message) args.push("--message", message);
	execFile("herdr", args, () => {}); // fire-and-forget
}

/** Hand lifecycle authority back to herdr's own detection after a prompt. */
function herdrRelease(): void {
	const pane = process.env.HERDR_PANE_ID;
	if (process.env.HERDR_ENV !== "1" || !pane) return;
	execFile("herdr", ["pane", "release-agent", pane, "--source", HERDR_SOURCE, "--agent", "pi"], () => {});
}

interface PasswordCacheEntry {
	password: string;
	expiresAt: number;
	/** Agent-turn counter when the password was cached. */
	turnStamp: number;
	/** Turns this entry stays valid for (0 = unlimited). */
	turns: number;
}

const passwordCache = new Map<string, PasswordCacheEntry>();

/** Completed agent turns this session; drives the turn-based cache policy. */
let turnCounter = 0;

function cacheHasPassword(scope = "local"): boolean {
	const entry = passwordCache.get(scope);
	if (!entry || typeof entry.password !== "string") return false;
	if (Date.now() >= entry.expiresAt) return false;
	if (entry.turns > 0 && turnCounter - entry.turnStamp >= entry.turns) return false;
	return true;
}

function cacheGet(scope = "local"): string | undefined {
	if (!cacheHasPassword(scope)) return undefined;
	return passwordCache.get(scope)?.password;
}

function cacheSet(pw: string, scope = "local"): void {
	passwordCache.set(scope, {
		password: pw,
		expiresAt: config.cacheTtlMs > 0 ? Date.now() + config.cacheTtlMs : Number.POSITIVE_INFINITY,
		turnStamp: turnCounter,
		turns: config.cacheTurns,
	});
}

function cacheClear(scope?: string): void {
	if (scope) passwordCache.delete(scope);
	else passwordCache.clear();
}

function cacheRemainingMs(scope = "local"): number {
	if (!cacheHasPassword(scope)) return 0;
	const expiresAt = passwordCache.get(scope)?.expiresAt ?? 0;
	return expiresAt === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Math.max(0, expiresAt - Date.now());
}

function cacheRemainingTurns(scope = "local"): number {
	if (!cacheHasPassword(scope)) return 0;
	const entry = passwordCache.get(scope);
	if (!entry || entry.turns <= 0) return Number.POSITIVE_INFINITY;
	return Math.max(0, entry.turns - (turnCounter - entry.turnStamp));
}

function cacheScopes(): string[] {
	return [...passwordCache.keys()].filter((scope) => cacheHasPassword(scope));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateForDisplay(s: string, max: number): string {
	if (s.length <= max) return s;
	return `${s.slice(0, max - 1)}…`;
}

function shellQuote(s: string): string {
	return `'${s.replaceAll("'", "'\\''")}'`;
}

function parseSshArgs(raw: string | undefined): string[] {
	if (!raw?.trim()) return [];
	// Intentionally conservative: users can pass common ssh flags as one string,
	// but shell metacharacters are rejected because we spawn ssh directly.
	if (/[;&|`$<>\n\r]/.test(raw)) throw new Error("sshOptions contains shell metacharacters");
	return raw.trim().split(/\s+/).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Masked password prompt (custom TUI component)
// ---------------------------------------------------------------------------

type PasswordPromptResult = { kind: "ok"; password: string } | { kind: "cancelled" } | { kind: "timeout" };

async function promptPassword(ctx: ExtensionContext, title: string, subtitle?: string): Promise<PasswordPromptResult> {
	if (!ctx.hasUI) return { kind: "cancelled" };

	// Show the pane as blocked in herdr (detection cannot classify our custom
	// TUI), then hand authority back once the prompt resolves.
	herdrReport("blocked", "sudo password prompt");
	try {
		const deadline = config.promptTimeoutMs > 0 ? Date.now() + config.promptTimeoutMs : null;

		return await ctx.ui.custom<PasswordPromptResult>((tui, theme, _kb, done) => {
			let buf = "";
			let cachedLines: string[] | undefined;
			let settled = false;
			let timer: ReturnType<typeof setInterval> | null = null;

			const finish = (v: PasswordPromptResult): void => {
				if (settled) return;
				settled = true;
				if (timer) clearInterval(timer);
				done(v);
			};

			const refresh = (): void => {
				cachedLines = undefined;
				tui.requestRender();
			};

			if (deadline !== null) {
				timer = setInterval(() => {
					if (settled) return;
					if (Date.now() >= deadline) {
						finish({ kind: "timeout" });
					} else {
						refresh();
					}
				}, 500);
			}

			function handleInput(data: string): void {
				if (matchesKey(data, Key.escape)) {
					finish({ kind: "cancelled" });
					return;
				}
				if (matchesKey(data, Key.enter)) {
					finish({ kind: "ok", password: buf });
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
				const countdown =
					deadline !== null
						? theme.fg("warning", ` • auto-cancel in ${Math.max(0, Math.ceil((deadline - Date.now()) / 1000))}s`)
						: "";
				add(theme.fg("dim", ` Enter to submit • Esc to cancel${countdown}`));
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
	} finally {
		herdrReport("working");
		herdrRelease();
	}
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

function runPrivileged(
	program: string,
	args: string[],
	password: string,
	signal: AbortSignal | undefined,
	timeoutMs: number
): Promise<SudoRunResult> {
	return new Promise((resolve) => {
		const child = spawn(program, args, {
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
	_timeoutMs: number,
	_signal: AbortSignal | undefined,
	ctx: ExtensionContext,
	scope: string,
	runner: (password: string) => Promise<SudoRunResult>
): Promise<EnsureOutcome> {
	let attempts = 0;

	while (attempts < config.maxPromptAttempts) {
		if (!cacheHasPassword(scope)) {
			const title = scope === "local" ? "sudo: local password required" : `sudo: password required for ${scope}`;
			const subtitle = reason
				? `${reason} — will run: ${truncateForDisplay(command, 80)}`
				: `will run: ${truncateForDisplay(command, 80)}`;
			const prompted = await promptPassword(ctx, title, subtitle);
			if (prompted.kind === "timeout") {
				return { error: `sudo: password prompt timed out after ${Math.round(config.promptTimeoutMs / 1000)}s with no answer` };
			}
			if (prompted.kind === "cancelled") {
				return { error: "User cancelled password prompt" };
			}
			if (prompted.password.length === 0) {
				attempts = attempts + 1;
				continue;
			}
			cacheSet(prompted.password, scope);
		}

		const pw = cacheGet(scope);
		if (typeof pw !== "string") {
			attempts = attempts + 1;
			continue;
		}

		const result = await runner(pw);

		if (result.cancelled || result.timedOut) return result;

		if (result.authFailed) {
			cacheClear(scope);
			attempts = attempts + 1;
			ctx.ui.notify(`sudo: incorrect password for ${scope} (attempt ${attempts}/${config.maxPromptAttempts})`, "warning");
			continue;
		}

		cacheSet(pw, scope);
		return result;
	}

	return { error: `sudo: too many incorrect password attempts (${config.maxPromptAttempts})` };
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

export type RemoteSudoExecInput = {
	host: string;
	command: string;
	sshOptions?: string;
	reason?: string;
	timeout?: number;
};

export default function pisudo(pi: ExtensionAPI): void {
	config = loadSudoConfig();

	// Completed agent turns drive the turn-based cache policy.
	pi.on("agent_end", async () => {
		turnCounter = turnCounter + 1;
	});

	// ---- session_shutdown: drop the cached password ---------------------
	pi.on("session_shutdown", async () => {
		cacheClear();
	});

	// ---- Intercept naked `sudo` in the built-in bash tool --------------
	pi.on("tool_call", async (event) => {
		if (!isToolCallEventType("bash", event)) return;
		const cmd = event.input.command ?? "";
		// Allow `sudo -n …` (non-interactive credential check) since it cannot
		// hang. Block any other interactive sudo token locally or inside obvious
		// ssh invocations; the latter needs a remote password cache, not the local one.
		const hasNonInteractive = /(^|[\s;&|])sudo\s+-n\b/.test(cmd);
		const hasInteractive = /(^|[\s;&|])sudo(\s+(?!-n\b)|$)/.test(cmd);
		const hasRemoteInteractive = /(^|[\s;&|])ssh\s+[^\n;&|]+\s+['"]?[^'"\n;&|]*\bsudo\b(?!\s+-n\b)/.test(cmd);
		if ((hasInteractive || hasRemoteInteractive) && !hasNonInteractive) {
			return {
				block: true,
				reason: hasRemoteInteractive
					? "Direct remote `sudo` through `ssh` is disabled by pi-sudo. Use the `remote_sudo_exec` tool so pi can prompt for and cache the remote machine's sudo password separately from the local password."
					: "Direct `sudo` in the bash tool is disabled by pi-sudo. Use the `sudo_exec` tool instead — it handles password prompting through pi's UI and avoids locking out the user via pam_faillock.",
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

			const outcome = await ensurePasswordAndRun(command, reason, timeoutMs, signal, ctx, "local", (pw) =>
				runPrivileged("sudo", ["-S", "-p", "", "--", "bash", "-lc", command], pw, signal, timeoutMs)
			);

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

	// ---- Tool: remote_sudo_exec -----------------------------------------
	pi.registerTool({
		name: "remote_sudo_exec",
		label: "remote sudo",
		description:
			"Run a shell command with sudo on a remote machine over ssh. Use this for `ssh host sudo ...`; it prompts for and caches the remote sudo password separately from local sudo.",
		promptSnippet: "Run a sudo command on a remote host over ssh with remote password prompting",
		promptGuidelines: [
			"Use `remote_sudo_exec` instead of `bash` commands like `ssh host sudo ...`.",
			"Pass the SSH destination in `host` (for example `user@example.com`) and only the remote root command in `command`.",
			"Always pass a short human-readable `reason` explaining why root is needed on the remote machine.",
		],
		parameters: Type.Object({
			host: Type.String({ description: "SSH destination, e.g. `server`, `user@server`, or a Host alias from ~/.ssh/config." }),
			command: Type.String({
				description: "Remote shell command to run under sudo. Executed remotely via `sudo -S -p '' -- bash -lc <command>`.",
			}),
			sshOptions: Type.Optional(
				Type.String({
					description: "Optional simple ssh flags, e.g. `-p 2222 -i ~/.ssh/key`. Shell metacharacters are rejected.",
				})
			),
			reason: Type.Optional(Type.String({ description: "Short explanation shown in the password prompt." })),
			timeout: Type.Optional(
				Type.Number({
					description: "Timeout in milliseconds (default 120000 = 2 minutes).",
					minimum: 1000,
					maximum: 30 * 60 * 1000,
				})
			),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const timeoutMs = params.timeout ?? 120_000;
			if (!ctx.hasUI) {
				return {
					content: [{ type: "text", text: "remote_sudo_exec requires an interactive UI to prompt for the remote sudo password" }],
					details: { host: params.host, command: params.command, errorMessage: "remote_sudo_exec requires an interactive UI" },
					isError: true,
				};
			}

			let sshArgs: string[];
			try {
				sshArgs = parseSshArgs(params.sshOptions);
			} catch (error) {
				const message = error instanceof Error ? error.message : "invalid sshOptions";
				return {
					content: [{ type: "text", text: message }],
					details: { host: params.host, command: params.command, errorMessage: message },
					isError: true,
				};
			}

			const remote = `sudo -S -p '' -- bash -lc ${shellQuote(params.command)}`;
			const scope = `remote:${params.host}`;
			const outcome = await ensurePasswordAndRun(params.command, params.reason, timeoutMs, signal, ctx, scope, (pw) =>
				runPrivileged("ssh", [...sshArgs, params.host, remote], pw, signal, timeoutMs)
			);

			if ("error" in outcome) {
				return {
					content: [{ type: "text", text: outcome.error }],
					isError: true,
					details: { host: params.host, command: params.command, errorMessage: outcome.error },
				};
			}

			const header = outcome.cancelled
				? "remote sudo: cancelled"
				: outcome.timedOut
					? `remote sudo: timed out after ${timeoutMs}ms`
					: `remote sudo: exit ${outcome.exitCode}`;
			const parts: string[] = [];
			if (outcome.stdout) parts.push(`stdout:\n${outcome.stdout}`);
			if (outcome.stderr) parts.push(`stderr:\n${outcome.stderr}`);
			return {
				content: [{ type: "text", text: parts.length > 0 ? `${header}\n\n${parts.join("\n")}` : header }],
				details: {
					host: params.host,
					command: params.command,
					exitCode: outcome.exitCode,
					stdout: outcome.stdout,
					stderr: outcome.stderr,
					cancelled: outcome.cancelled,
					timedOut: outcome.timedOut,
				},
				isError: outcome.exitCode !== 0 || outcome.cancelled || outcome.timedOut,
			};
		},

		renderCall(args, theme) {
			const host = typeof args?.host === "string" ? args.host : "";
			const cmd = typeof args?.command === "string" ? args.command : "";
			return new Text(
				`${theme.fg("toolTitle", theme.bold("remote sudo "))}${theme.fg("muted", `${host}: ${truncateForDisplay(cmd, 100)}`)}`,
				0,
				0
			);
		},
	});

	// ---- Commands --------------------------------------------------------
	const describeCache = (scope: string): string => {
		const ms = cacheRemainingMs(scope);
		const turns = cacheRemainingTurns(scope);
		const time = ms === Number.POSITIVE_INFINITY ? "no expiry" : `${Math.ceil(ms / 1000)}s`;
		const turnPart = turns === Number.POSITIVE_INFINITY ? "unlimited turns" : `${turns} turn(s) left`;
		return `${time}, ${turnPart}`;
	};

	// ---- Commands --------------------------------------------------------
	pi.registerCommand("sudo-status", {
		description: "Show pi-sudo password cache status",
		handler: async (_args, ctx) => {
			const scopes = cacheScopes();
			if (scopes.length > 0) {
				const summary = scopes.map((scope) => `${scope}: ${describeCache(scope)}`).join("\n  ");
				ctx.ui.notify(`sudo: cached passwords\n  ${summary}`, "info");
			} else {
				ctx.ui.notify("sudo: no cached passwords", "info");
			}
			ctx.ui.notify(
				`policy: ttl ${config.cacheTtlMs > 0 ? `${Math.round(config.cacheTtlMs / 1000)}s` : "none"}, turns ${config.cacheTurns > 0 ? config.cacheTurns : "unlimited"}, prompt timeout ${config.promptTimeoutMs > 0 ? `${Math.round(config.promptTimeoutMs / 1000)}s` : "none"}`,
				"info"
			);
		},
	});

	pi.registerCommand("sudo-ttl", {
		description: "Set the session's sudo cache policy: /sudo-ttl <seconds> [turns]. 0 = no expiry / unlimited turns",
		handler: async (args, ctx) => {
			const tokens = args.trim().split(/\s+/).filter(Boolean);
			if (tokens.length === 0) {
				ctx.ui.notify(
					`usage: /sudo-ttl <seconds> [turns] — current: ttl ${config.cacheTtlMs > 0 ? `${Math.round(config.cacheTtlMs / 1000)}s` : "none"}, turns ${config.cacheTurns > 0 ? config.cacheTurns : "unlimited"}`,
					"info"
				);
				return;
			}
			const secs = Number.parseInt(tokens[0], 10);
			if (!Number.isFinite(secs) || secs < 0) {
				ctx.ui.notify("seconds must be a non-negative number (0 = no expiry)", "error");
				return;
			}
			let turns = 0;
			if (tokens[1] !== undefined) {
				turns = Number.parseInt(tokens[1], 10);
				if (!Number.isFinite(turns) || turns < 0) {
					ctx.ui.notify("turns must be a non-negative number (0 = unlimited)", "error");
					return;
				}
			}
			config.cacheTtlMs = secs * 1000;
			if (tokens[1] !== undefined) config.cacheTurns = turns;
			// Re-stamp existing entries so the new policy applies from now.
			for (const scope of passwordCache.keys()) {
				const entry = passwordCache.get(scope);
				if (entry) cacheSet(entry.password, scope);
			}
			ctx.ui.notify(
				`sudo: cache now valid for ${secs > 0 ? `${secs}s` : "no expiry"}${tokens[1] !== undefined ? ` / ${turns > 0 ? `${turns} turns` : "unlimited turns"}` : ""}`,
				"info"
			);
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
			const outcome = await ensurePasswordAndRun("true", "sudo-test", 15_000, undefined, ctx, "local", (pw) =>
				runPrivileged("sudo", ["-S", "-p", "", "--", "bash", "-lc", "true"], pw, undefined, 15_000)
			);
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
