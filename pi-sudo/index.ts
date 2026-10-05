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
 *   sudo_exec({ command, host?, sshOptions?, reason?, timeout? })
 *     — run a command under sudo, locally or (with `host`) on a remote
 *       machine over ssh. `remote_sudo_exec` remains as a deprecated alias.
 *
 * Commands:
 *   /sudo-status   — show cache state (has password / TTL remaining).
 *   /sudo-ttl      — set the session's cache policy (seconds + turns).
 *   /sudo-forget   — drop the cached password immediately.
 *   /sudo-test     — verify the cached password still works.
 */

import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { Key, Text, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { SUDO_OUTPUT_CHARS, sudoOutputSchema } from "./output.js";

// ---------------------------------------------------------------------------
// Configuration (pi-sudo.json: ./ , ./.pi/ , ~/.pi/agent/ — first match wins)
// ---------------------------------------------------------------------------

interface SudoConfig {
	/** Guard behaviour for interactive `sudo` in the bash tool. */
	bashGuard: "block" | "warn" | "off";
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
	bashGuard: "block",
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
			if (parsed.bashGuard === "block" || parsed.bashGuard === "warn" || parsed.bashGuard === "off")
				cfg.bashGuard = parsed.bashGuard;
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

/**
 * Reduce a bash command to the text that could actually run: command
 * substitutions ($(…), `…`) are preserved because their content executes;
 * quoted spans are data (not command position) and comments are inert, so they
 * are stripped to avoid false positives on `sudo` appearing as plain text
 * (commit messages, docs, grep patterns, …).
 */
export function guardRelevantText(cmd: string): string {
	// Pull out command substitutions first: their content executes.
	let residual = "";
	let substitutions = "";
	let i = 0;
	while (i < cmd.length) {
		const ch = cmd[i];
		if (ch === "$" && cmd[i + 1] === "(") {
			let depth = 1;
			let j = i + 2;
			while (j < cmd.length && depth > 0) {
				if (cmd[j] === "(") depth++;
				else if (cmd[j] === ")") depth--;
				j++;
			}
			substitutions += cmd.slice(i + 2, j - 1);
			residual += "$()";
			i = j;
			continue;
		}
		if (ch === "`") {
			const end = cmd.indexOf("`", i + 1);
			if (end === -1) {
				residual += ch;
				i++;
				continue;
			}
			substitutions += cmd.slice(i + 1, end);
			residual += "``";
			i = end + 1;
			continue;
		}
		residual += ch;
		i++;
	}
	const noSingle = residual.replace(/'(?:[^'\\]|\\.)*'/g, "''");
	const noDouble = noSingle.replace(/"(?:[^"\\]|\\.)*"/g, '""');
	const noComments = noDouble.replace(/(^|\s)#[^\n]*/g, "$1");
	return `${noComments} ${substitutions}`;
}

export type GuardDecision = { block: boolean; remote: boolean; reason: string };

/** Shell-comment token that bypasses the bash guard (for false positives). */
export const GUARD_ALLOW_TOKEN = "pi-sudo:allow";

/**
 * Decide whether a bash command's interactive `sudo` usage should be blocked.
 * A seatbelt against accidental naked sudo (pam_faillock lockouts), not a
 * sandbox: the `# pi-sudo:allow` comment token is the explicit escape hatch
 * for false positives (sudo appearing only as text).
 */
export function sudoGuardDecision(cmd: string): GuardDecision {
	const relevant = guardRelevantText(cmd);
	// `sudo -n` (non-interactive) is allowed: the local regex excludes it via
	// lookahead, the remote branch checks for it on the raw command.
	const hasInteractive = /(^|[\s;&|])sudo(\s+(?!-n\b)|$)/.test(relevant);
	// Remote: quoted text after `ssh` is a remote command that executes, so the
	// sudo check for the remote branch runs against the RAW command; `ssh` must
	// itself be at command position in the stripped text (quoted `ssh` text is
	// just data — e.g. a commit message mentioning it).
	const sshAtCommandPos = /(^|[\s;&|])ssh\s/.test(relevant);
	const hasRemoteInteractive = sshAtCommandPos && /\bsudo\b/.test(cmd) && !/\bsudo\s+-n\b/.test(cmd);
	const hit = hasInteractive || hasRemoteInteractive;
	const remote = hasRemoteInteractive;
	const reason = remote
		? "Direct remote `sudo` through `ssh` is disabled by pi-sudo. Use the `sudo_exec` tool with `host` so pi can prompt for and cache the remote machine's sudo password separately from the local password."
		: "Direct `sudo` in the bash tool is disabled by pi-sudo. Use the `sudo_exec` tool instead - it handles password prompting through pi's UI and avoids locking out the user via pam_faillock. If `sudo` only appears as text in your command (docs, commit messages, grep patterns), append the shell comment `# pi-sudo:allow` to run it anyway.";
	return { block: hit, remote, reason };
}

// ---------------------------------------------------------------------------
// Masked password prompt (custom TUI component)
// ---------------------------------------------------------------------------

type PasswordPromptResult = { kind: "ok"; password: string } | { kind: "cancelled" } | { kind: "timeout" };

async function promptPassword(
	ctx: ExtensionContext,
	title: string,
	subtitle?: string,
	signal?: AbortSignal
): Promise<PasswordPromptResult> {
	if (signal?.aborted || ctx.mode !== "tui") return { kind: "cancelled" };

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

			const cleanup = () => {
				if (timer) clearInterval(timer);
				signal?.removeEventListener("abort", onAbort);
				buf = "";
				cachedLines = undefined;
			};
			const finish = (v: PasswordPromptResult): void => {
				if (settled) return;
				settled = true;
				cleanup();
				done(v);
			};
			function onAbort() {
				finish({ kind: "cancelled" });
			}
			signal?.addEventListener("abort", onAbort, { once: true });

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
				dispose: cleanup,
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
	omittedStdoutChars: number;
	omittedStderrChars: number;
	exitCode: number;
	authFailed: boolean;
	cancelled: boolean;
	timedOut: boolean;
}

// Matches sudo's password-failure output across the locales we care about.
const AUTH_FAIL_RE = /\b(incorrect password|try again|authentication failure|Sorry, try again)\b/i;
const PROMPT_LINE_RE = /^\[sudo\] password for [^\n]*\n?/;

export function runPrivileged(
	program: string,
	args: string[],
	password: string,
	signal: AbortSignal | undefined,
	timeoutMs: number
): Promise<SudoRunResult> {
	if (signal?.aborted)
		return Promise.resolve({
			stdout: "",
			stderr: "",
			omittedStdoutChars: 0,
			omittedStderrChars: 0,
			exitCode: -1,
			authFailed: false,
			cancelled: true,
			timedOut: false,
		});
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
		let omittedStdoutChars = 0;
		let omittedStderrChars = 0;
		let escalation: ReturnType<typeof setTimeout> | undefined;
		const terminate = () => {
			child.kill("SIGTERM");
			if (!escalation)
				escalation = setTimeout(() => {
					if (!settled) child.kill("SIGKILL");
				}, 2000);
		};

		const killTimer = setTimeout(() => {
			timedOut = true;
			terminate();
		}, timeoutMs);

		const onAbort = (): void => {
			cancelled = true;
			terminate();
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
			const text = d.toString("utf8");
			const available = SUDO_OUTPUT_CHARS - stdout.length;
			stdout += text.slice(0, available);
			omittedStdoutChars += Math.max(0, text.length - available);
		});
		child.stderr.on("data", (d: Buffer) => {
			const text = d.toString("utf8");
			const available = SUDO_OUTPUT_CHARS - stderr.length;
			stderr += text.slice(0, available);
			omittedStderrChars += Math.max(0, text.length - available);
		});

		const finish = (code: number): void => {
			if (settled) return;
			settled = true;
			clearTimeout(killTimer);
			if (escalation) clearTimeout(escalation);
			if (signal) signal.removeEventListener("abort", onAbort);

			// Strip any leftover "[sudo] password for …" echo.
			const cleanStderr = stderr.replace(PROMPT_LINE_RE, "");
			const authFailed = code !== 0 && AUTH_FAIL_RE.test(cleanStderr);

			resolve({
				stdout: (password ? stdout.replaceAll(password, "[REDACTED]") : stdout).slice(0, SUDO_OUTPUT_CHARS),
				stderr: (password ? cleanStderr.replaceAll(password, "[REDACTED]") : cleanStderr).slice(0, SUDO_OUTPUT_CHARS),
				omittedStdoutChars:
					omittedStdoutChars +
					Math.max(0, (password ? stdout.replaceAll(password, "[REDACTED]") : stdout).length - SUDO_OUTPUT_CHARS),
				omittedStderrChars:
					omittedStderrChars +
					Math.max(0, (password ? cleanStderr.replaceAll(password, "[REDACTED]") : cleanStderr).length - SUDO_OUTPUT_CHARS),
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

type EnsureOutcome = SudoRunResult | { error: string; code: string; cancelled?: boolean; timedOut?: boolean };

async function ensurePasswordAndRun(
	command: string,
	reason: string | undefined,
	_timeoutMs: number,
	signal: AbortSignal | undefined,
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
			if (signal?.aborted)
				return { error: "Privileged execution aborted before authorization", code: "aborted", cancelled: true };
			const prompted = await promptPassword(ctx, title, subtitle, signal);
			if (prompted.kind === "timeout") {
				return {
					error: `sudo: password prompt timed out after ${Math.round(config.promptTimeoutMs / 1000)}s with no answer`,
					code: "prompt_timeout",
					timedOut: true,
				};
			}
			if (prompted.kind === "cancelled") {
				return { error: "User cancelled password prompt", code: signal?.aborted ? "aborted" : "cancelled", cancelled: true };
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

	return { error: `sudo: too many incorrect password attempts (${config.maxPromptAttempts})`, code: "authentication_failed" };
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

interface SudoExecDetails {
	command: string;
	host?: string;
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
	/** SSH destination (e.g. `server`, `user@host`). Absent = run locally. */
	host?: string;
	sshOptions?: string;
	reason?: string;
	timeout?: number;
};

/** Deprecated: kept for sessions that still reference the old tool name. */
export type RemoteSudoExecInput = SudoExecInput & {
	host: string;
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
	pi.on("tool_call", async (event, ctx) => {
		if (!isToolCallEventType("bash", event)) return;
		const cmd = event.input.command ?? "";
		const decision = sudoGuardDecision(cmd);
		if (!decision.block) return undefined;
		if (config.bashGuard === "off") return undefined;
		// Explicit escape hatch for false positives (sudo appearing only as text).
		if (cmd.includes(GUARD_ALLOW_TOKEN)) {
			try {
				ctx.ui.notify("pi-sudo: bash guard bypassed via # pi-sudo:allow token", "warning");
			} catch {
				// no UI: proceed silently
			}
			return undefined;
		}
		if (config.bashGuard === "warn") {
			try {
				ctx.ui.notify("pi-sudo: interactive sudo detected in bash command; allowed by bashGuard=warn", "warning");
			} catch {
				// no UI: proceed silently
			}
			return undefined;
		}
		return {
			block: true,
			reason: decision.reason,
		};
	});

	// ---- Tool: sudo_exec (local + remote) --------------------------------
	const sudoParams = {
		command: Type.String({
			description:
				"The shell command to run under sudo. Executed via `bash -lc` locally, or remotely via `sudo -S -p '' -- bash -lc <command>` when `host` is given.",
		}),
		host: Type.Optional(
			Type.String({
				description:
					"SSH destination (e.g. `server`, `user@server`, or a Host alias from ~/.ssh/config). Omit to run locally. The remote machine's sudo password is cached separately from the local one.",
			})
		),
		sshOptions: Type.Optional(
			Type.String({
				description:
					"Optional simple ssh flags used with `host`, e.g. `-p 2222 -i ~/.ssh/key`. Shell metacharacters are rejected.",
			})
		),
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
	};

	const sudoPromptGuidelines = [
		"Use `sudo_exec` for any command that requires root, locally or on a remote machine. Never call `sudo` from the `bash` tool — it will be blocked.",
		"Local root: omit `host`. Remote root: pass `host` (e.g. `user@example.com`) and only the remote root command in `command`; the remote password is cached separately from the local one.",
		"Always pass a short human-readable `reason` explaining why root is needed. The reason is shown to the user in the password prompt.",
		"If the bash guard blocks a command where `sudo` appears only as text (commit messages, docs, grep patterns), append the shell comment `# pi-sudo:allow` to that command line. Never use the token to actually run sudo via bash.",
	];

	function renderSudoCall(args: Record<string, unknown> | undefined, theme: Theme, label: string): Text {
		const host = typeof args?.host === "string" ? args.host : "";
		const cmd = typeof args?.command === "string" ? args.command : "";
		const reason = typeof args?.reason === "string" ? args.reason : undefined;
		const target = host ? `${host}: ${truncateForDisplay(cmd, 100)}` : truncateForDisplay(cmd, 120);
		const head = `${theme.fg("toolTitle", theme.bold(`${label} `))}${theme.fg("muted", target)}`;
		return reason ? new Text(`${head}\n${theme.fg("dim", `  reason: ${reason}`)}`, 0, 0) : new Text(head, 0, 0);
	}

	function renderSudoResult(result: { details?: unknown }, theme: Theme): Text {
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
	}

	async function executeSudo(params: SudoExecInput, signal: AbortSignal | undefined, ctx: ExtensionContext) {
		const command = params.command;
		const reason = params.reason;
		const host = params.host;
		const timeoutMs = params.timeout ?? config.defaultTimeoutMs;

		const baseDetails: SudoExecDetails = {
			command,
			host,
			reason,
			exitCode: -1,
			stdout: "",
			stderr: "",
			cancelled: false,
			timedOut: false,
		};
		const errorResult = (errorMessage: string, code = "authorization_failed", cancelled = false, timedOut = false) => {
			const message = errorMessage.slice(0, 1600);
			return {
				content: [{ type: "text" as const, text: message }],
				details: { ...baseDetails, errorMessage: message, cancelled, timedOut },
				isError: true,
				structuredContent: {
					ok: false,
					scope: host ? "remote" : "local",
					...(host ? { host } : {}),
					exitCode: -1,
					stdout: "",
					stderr: "",
					cancelled: cancelled || (signal?.aborted ?? false),
					timedOut,
					truncated: errorMessage.length > 1600,
					omittedStdoutChars: 0,
					omittedStderrChars: 0,
					error: { code: signal?.aborted ? "aborted" : code, message },
					effects: "none",
				},
			};
		};
		if (signal?.aborted) return errorResult("Privileged execution aborted before authorization");

		if (!ctx.hasUI) {
			return errorResult("sudo_exec requires an interactive UI to prompt for the password", "ui_unavailable");
		}

		let sshArgs: string[] = [];
		if (host) {
			try {
				sshArgs = parseSshArgs(params.sshOptions);
			} catch (error) {
				return errorResult(error instanceof Error ? error.message : "invalid sshOptions");
			}
		}

		const scope = host ? `remote:${host}` : "local";
		const outcome = await ensurePasswordAndRun(command, reason, timeoutMs, signal, ctx, scope, (pw) =>
			host
				? runPrivileged("ssh", [...sshArgs, host, `sudo -S -p '' -- bash -lc ${shellQuote(command)}`], pw, signal, timeoutMs)
				: runPrivileged("sudo", ["-S", "-p", "", "--", "bash", "-lc", command], pw, signal, timeoutMs)
		);

		if ("error" in outcome) {
			return errorResult(outcome.error, outcome.code, outcome.cancelled, outcome.timedOut);
		}

		const details: SudoExecDetails = {
			...baseDetails,
			exitCode: outcome.exitCode,
			stdout: outcome.stdout,
			stderr: outcome.stderr,
			cancelled: outcome.cancelled,
			timedOut: outcome.timedOut,
		};

		const where = host ? `remote sudo (${host})` : "sudo";
		const header = outcome.cancelled
			? `${where}: cancelled`
			: outcome.timedOut
				? `${where}: timed out after ${timeoutMs}ms`
				: `${where}: exit ${outcome.exitCode}`;
		const parts: string[] = [];
		if (outcome.stdout) parts.push(`stdout:\n${outcome.stdout}`);
		if (outcome.stderr) parts.push(`stderr:\n${outcome.stderr}`);
		const body = parts.join("\n");
		const truncated = outcome.omittedStdoutChars > 0 || outcome.omittedStderrChars > 0;
		const text =
			(body ? `${header}\n\n${body}` : header) + (truncated ? "\n[Output truncated to 32000 characters per stream.]" : "");

		return {
			content: [{ type: "text" as const, text }],
			details,
			isError: outcome.exitCode !== 0 || outcome.cancelled || outcome.timedOut,
			structuredContent: {
				ok: outcome.exitCode === 0 && !outcome.cancelled && !outcome.timedOut,
				scope: host ? "remote" : "local",
				...(host ? { host } : {}),
				exitCode: outcome.exitCode,
				stdout: outcome.stdout,
				stderr: outcome.stderr,
				cancelled: outcome.cancelled,
				timedOut: outcome.timedOut,
				truncated,
				omittedStdoutChars: outcome.omittedStdoutChars,
				omittedStderrChars: outcome.omittedStderrChars,
				effects: "possible",
			},
		};
	}

	pi.registerTool({
		name: "sudo_exec",
		label: "sudo",
		outputSchema: sudoOutputSchema,
		description:
			"Run a shell command with sudo — locally by default, or on a remote machine over SSH when `host` is given. Prompts the user for the password through pi's UI on first use and caches it per machine for the session's sudo timestamp window. Use this whenever you need elevated privileges instead of calling `sudo` directly from the bash tool.",
		promptSnippet: "Run a shell command under sudo (local, or remote via `host`) with interactive password prompting",
		promptGuidelines: sudoPromptGuidelines,
		parameters: Type.Object(sudoParams),

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			return executeSudo(params as SudoExecInput, signal, ctx);
		},

		renderCall(args, theme) {
			return renderSudoCall(args, theme, "sudo");
		},

		renderResult(result, _options, theme) {
			return renderSudoResult(result, theme);
		},
	});

	// ---- Tool: remote_sudo_exec (deprecated alias) -----------------------
	let warnedRemoteAlias = false;
	pi.registerTool({
		name: "remote_sudo_exec",
		label: "remote sudo",
		outputSchema: sudoOutputSchema,
		description:
			"Deprecated alias of `sudo_exec` with `host`. Use `sudo_exec({ host, command })` instead. Runs a shell command with sudo on a remote machine over ssh; the remote sudo password is cached separately from local sudo.",
		promptSnippet: "Deprecated: use sudo_exec with `host` instead",
		promptGuidelines: ["Prefer `sudo_exec` with `host`. This alias exists only for backward compatibility."],
		parameters: Type.Object({
			...sudoParams,
			host: Type.String({ description: "SSH destination, e.g. `server`, `user@server`, or a Host alias from ~/.ssh/config." }),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (!warnedRemoteAlias) {
				warnedRemoteAlias = true;
				ctx.ui.notify("remote_sudo_exec is deprecated; use sudo_exec with `host` instead.", "info");
			}
			return executeSudo(params as SudoExecInput, signal, ctx);
		},

		renderCall(args, theme) {
			return renderSudoCall(args, theme, "remote sudo");
		},

		renderResult(result, _options, theme) {
			return renderSudoResult(result, theme);
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
