/**
 * pi-ssh-key — load an SSH private key into an ssh-agent scoped to the pi
 * process, so every command the agent shells out to (bash tool, git, scp,
 * sub-agents) can authenticate with it.
 *
 * What this does:
 *   - `/ssh-key-load [path] [timeout]`  pick a private key from ~/.ssh (or a
 *     given path) and add it to a running ssh-agent. If the key is
 *     passphrase-protected, the passphrase is prompted through pi's masked TUI
 *     (never a GUI askpass). An optional `timeout` (seconds) bounds the key's
 *     lifetime in the agent (0 = never expires).
 *   - `/ssh-key-unload [path]`  remove one key, or (with no argument) remove all
 *     loaded keys and tear down the agent + restore the env.
 *   - `/ssh-key-timeout [seconds]`  set the lifetime of the currently loaded
 *     key(s) (0 = no expiry) and remember it as the default for future loads.
 *   - `/ssh-key-status`  show the agent socket, ownership, and loaded keys.
 *
 * Agent strategy:
 *   - If pi's process already has a live `SSH_AUTH_SOCK` (e.g. the user's own
 *     agent), we add the key to it and track only the keys we added, so unload
 *     removes just ours — the user's other identities stay untouched.
 *   - Otherwise we start a dedicated, pi-owned `ssh-agent -a <sock>` with a
 *     private socket, set `SSH_AUTH_SOCK` / `SSH_AGENT_PID` into `process.env`,
 *     and restore the previous values on unload/shutdown.
 *
 * Passphrases are held only in module memory (never written to disk), cached
 * while a protected key is loaded so timeout refreshes don't re-prompt, and
 * cleared on unload and on session shutdown.
 */

import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmdirSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Key, fuzzyFilter, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

// ---------------------------------------------------------------------------
// herdr blocked-state reporting (best-effort; only inside a herdr pane)
// ---------------------------------------------------------------------------

const HERDR_SOURCE = "pi-ssh-key";
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

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface LoadedKey {
	keyPath: string;
	name: string;
	fingerprint?: string;
	protected: boolean;
	passphrase?: string; // in-memory only, cleared on unload/shutdown
}

interface PiAgent {
	/** Socket path we tell ssh/client programs to use. */
	authSock: string;
	/** The ssh-agent process pid (undefined when reusing the user's agent). */
	pid?: number;
	/** True when we started this agent and therefore own its lifetime. */
	owned: boolean;
	loadedKeys: Map<string, LoadedKey>; // keyed by absolute key path
	// Only set when `owned`: the env values to restore on teardown.
	prevAuthSock?: string;
	prevAgentPid?: string;
}

const DEFAULT_TIMEOUT_SECS = 0; // no expiry by default

let agent: PiAgent | undefined;
/** Default timeout (seconds) applied to future `/ssh-key-load` calls. */
let defaultTimeoutSecs = DEFAULT_TIMEOUT_SECS;
const MAX_PROMPT_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface SshKeyConfig {
	keyDir: string;
	defaultTimeout: number; // seconds
}

function loadConfig(cwd: string): SshKeyConfig {
	const config: SshKeyConfig = {
		keyDir: join(homedir(), ".ssh"),
		defaultTimeout: DEFAULT_TIMEOUT_SECS,
	};
	for (const path of [join(homedir(), ".pi", "agent", "ssh-key.json"), join(cwd, ".pi", "ssh-key.json")]) {
		if (!existsSync(path)) continue;
		try {
			const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<SshKeyConfig>;
			if (typeof parsed.keyDir === "string") config.keyDir = parsed.keyDir;
			if (typeof parsed.defaultTimeout === "number") config.defaultTimeout = parsed.defaultTimeout;
		} catch {
			// ignore malformed config, fall back to defaults
		}
	}
	return config;
}

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------

interface RunResult {
	code: number;
	stdout: string;
	stderr: string;
	timedOut?: boolean;
}

function runProcess(program: string, args: string[], env?: NodeJS.ProcessEnv): Promise<RunResult> {
	return new Promise((resolve) => {
		const child = spawn(program, args, {
			stdio: ["pipe", "pipe", "pipe"],
			env: env ?? process.env,
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d: Buffer) => {
			stdout += d.toString("utf8");
		});
		child.stderr.on("data", (d: Buffer) => {
			stderr += d.toString("utf8");
		});
		child.on("error", () => resolve({ code: -1, stdout, stderr }));
		child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
	});
}

/** Like `runProcess`, but writes `input` to the child's stdin, and (when
 * `timeoutMs` is given) kills the child and reports `timedOut` if it does not
 * exit within that window. */
function runProcessInput(
	program: string,
	args: string[],
	input: string,
	env?: NodeJS.ProcessEnv,
	timeoutMs?: number
): Promise<RunResult> {
	return new Promise((resolve) => {
		const child = spawn(program, args, {
			stdio: ["pipe", "pipe", "pipe"],
			env: env ?? process.env,
		});
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		let settled = false;
		child.stdout.on("data", (d: Buffer) => {
			stdout += d.toString("utf8");
		});
		child.stderr.on("data", (d: Buffer) => {
			stderr += d.toString("utf8");
		});
		child.stdin.on("error", () => {
			/* swallow EPIPE if the child exits before reading stdin */
		});
		const killTimer = timeoutMs
			? setTimeout(() => {
					timedOut = true;
					child.kill("SIGTERM");
					setTimeout(() => {
						if (!child.killed) child.kill("SIGKILL");
					}, 2000).unref();
				}, timeoutMs)
			: undefined;
		const finish = (code: number): void => {
			if (settled) return;
			settled = true;
			if (killTimer) clearTimeout(killTimer);
			resolve({ code: code ?? -1, stdout, stderr, timedOut });
		};
		child.stdin.write(input);
		child.stdin.end();
		child.on("error", () => finish(-1));
		child.on("close", (code) => finish(code ?? -1));
	});
}

function execResult(program: string, args: string[]): Promise<RunResult> {
	return new Promise((resolve) => {
		execFile(program, args, (error, stdout, stderr) => {
			resolve({
				code: error ? ((error as NodeJS.ErrnoException & { code?: number }).code ?? -1) : 0,
				stdout: stdout ?? "",
				stderr: stderr ?? "",
			});
		});
	});
}

function expandPath(p: string, cwd: string): string {
	const expanded = p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
	return resolve(cwd, expanded);
}

// ---------------------------------------------------------------------------
// Key discovery & inspection
// ---------------------------------------------------------------------------

const PRIVATE_KEY_HEADER = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;

function isPrivateKeyFile(path: string): boolean {
	try {
		const st = statSync(path);
		if (!st.isFile()) return false;
		const head = readFileSync(path, "utf8").slice(0, 256);
		return PRIVATE_KEY_HEADER.test(head);
	} catch {
		return false;
	}
}

function discoverKeys(dir: string): string[] {
	const skip = new Set(["known_hosts", "known_hosts.old", "config", "authorized_keys", "authorized_keys2", "authorized_keys"]);
	const paths: string[] = [];
	if (!existsSync(dir)) return paths;
	for (const name of readdirSync(dir)) {
		if (name.endsWith(".pub")) continue;
		if (name.startsWith(".")) continue;
		if (skip.has(name)) continue;
		const full = join(dir, name);
		if (isPrivateKeyFile(full)) paths.push(full);
	}
	return paths;
}

function readComment(keyPath: string): string | undefined {
	const pubPath = `${keyPath}.pub`;
	if (!existsSync(pubPath)) return undefined;
	try {
		const line = readFileSync(pubPath, "utf8").trim().split("\n")[0] ?? "";
		const parts = line.split(/\s+/);
		if (parts.length >= 3) return parts.slice(2).join(" ");
		return undefined;
	} catch {
		return undefined;
	}
}

/** True if the key requires a passphrase. Uses `ssh-keygen -y -P ""` which fails
 * only with a "wrong passphrase" error for an encrypted key. */
async function isPassphraseProtected(keyPath: string): Promise<boolean> {
	const res = await runProcess("ssh-keygen", ["-y", "-P", "", "-f", keyPath]);
	if (res.code === 0) return false;
	return /incorrect passphrase|decrypt private key/i.test(res.stderr);
}

async function fingerprint(keyPath: string): Promise<string | undefined> {
	const res = await execResult("ssh-keygen", ["-lf", keyPath]);
	if (res.code !== 0) return undefined;
	const match = /SHA256:[A-Za-z0-9+/=]+/.exec(res.stdout);
	return match?.[0];
}

// ---------------------------------------------------------------------------
// oqto SSH proxy integration
//
// The env vars below are OWNED by oqto-runner. pi-ssh-key only CONSUMES them
// (the pi-env-ctx ownership pattern):
//   OQTO_SSH_AGENT="proxy"     signals an oqto proxy-gated session, in which
//                             the agent socket is NOT a real ssh-agent (it
//                             blocks add-identity) and keys stay on the host.
//   OQTO_SSH_GRANT_CMD=<path>  optional trusted executable to request a key
//                             grant (blocking with opt-in async polling).
//
// Grant command contract
//   Reads one JSON object on stdin, writes one JSON object on stdout.
//   Input:
//     { "op": "request", "key_path", "fingerprint", "comment", "timeout_secs" }
//     { "op": "status", "request_id" }        // poll a pending request
//   Output (always a JSON object; exit code 0 means the responder processed it):
//     { "ok": true, "status": "granted|denied|pending|timed_out|error",
//       "message": "...", "request_id": "..." }
//   Semantics:
//     - The command should block only as long as it takes to reach a status.
//       Return quickly with "pending" + request_id for genuinely async
//       approval (e.g. a phone prompt); an unknown period must not block.
//     - "pending" is non-terminal: pi-ssh-key re-polls `op:"status"` until a
//       terminal status (granted/denied/timed_out/error) or its budget runs out.
//     - Non-zero exit code = the grant pipeline itself failed, NOT a denial.
//       The decision lives in `status`; the exit code is pipeline health.
//     - If the call does not return within timeout_secs, pi-ssh-key kills it and
//       reports "timed_out" (also kills the poll loop after its own budget).
// ---------------------------------------------------------------------------

const OQ_GRANT_CALL_TIMEOUT_MS = 60_000; // per-call wait before we kill it
const OQ_GRANT_POLL_INTERVAL_MS = 2_000;
const OQ_GRANT_POLL_BUDGET_MS = 120_000; // total async wait before giving up

function isOqtoProxySession(): boolean {
	return process.env.OQTO_SSH_AGENT === "proxy";
}

interface GrantOutcome {
	status: string;
	message: string;
	requestId?: string;
}

async function requestGrant(cmd: string, input: string, timeoutMs: number): Promise<GrantOutcome> {
	const res = await runProcessInput(cmd, [], input, { ...process.env }, timeoutMs);
	if (res.timedOut) {
		return { status: "timed_out", message: `no response from the grant command within ${Math.round(timeoutMs / 1000)}s` };
	}
	if (res.code !== 0) {
		return {
			status: "error",
			message: res.stderr.trim() || res.stdout.trim() || `grant command exited ${res.code}`,
		};
	}
	let parsed: { status?: string; granted?: boolean; message?: string; request_id?: string };
	try {
		parsed = JSON.parse(res.stdout || "{}");
	} catch {
		return { status: "error", message: res.stdout.trim() || "grant command returned invalid JSON" };
	}
	const status = typeof parsed.status === "string" ? parsed.status : parsed.granted ? "granted" : "denied";
	return {
		status,
		message: typeof parsed.message === "string" ? parsed.message : "",
		requestId: typeof parsed.request_id === "string" ? parsed.request_id : undefined,
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function oqtoProxyLoad(keyPath: string, ctx: ExtensionCommandContext): Promise<void> {
	const name = basename(keyPath);
	const fp = await fingerprint(keyPath);
	const comment = readComment(keyPath);
	const grantCmd = process.env.OQTO_SSH_GRANT_CMD;
	const grantLine = `[ssh]\nallowed_keys = ["${keyPath}"]`;

	if (!grantCmd) {
		ctx.ui.notify(
			`this is an oqto SSH proxy session: keys stay in your host agent and only granted keys are usable. Load ${name} on the host, then grant it in the workdir's sandbox.toml:\n${grantLine}`,
			"warning"
		);
		return;
	}

	const requestInput = JSON.stringify({
		op: "request",
		key_path: keyPath,
		fingerprint: fp ?? null,
		comment: comment ?? null,
		timeout_secs: Math.round(OQ_GRANT_CALL_TIMEOUT_MS / 1000),
	});
	let outcome = await requestGrant(grantCmd, requestInput, OQ_GRANT_CALL_TIMEOUT_MS);

	// Async completion signal: a "pending" status + request_id is re-polled until
	// a terminal status or the poll budget runs out.
	if (outcome.status === "pending" && outcome.requestId) {
		const deadline = Date.now() + OQ_GRANT_POLL_BUDGET_MS;
		while (Date.now() < deadline && outcome.status === "pending") {
			await sleep(OQ_GRANT_POLL_INTERVAL_MS);
			const pollInput = JSON.stringify({ op: "status", request_id: outcome.requestId });
			outcome = await requestGrant(grantCmd, pollInput, OQ_GRANT_CALL_TIMEOUT_MS);
		}
		if (outcome.status === "pending") {
			outcome = { ...outcome, status: "timed_out", message: outcome.message || "approval did not resolve in time" };
		}
	}

	switch (outcome.status) {
		case "granted":
			ctx.ui.notify(`granted ssh key ${name}${outcome.message ? ` — ${outcome.message}` : ""}`, "info");
			break;
		case "denied":
			ctx.ui.notify(outcome.message ? `grant for ${name} denied: ${outcome.message}` : `grant for ${name} denied`, "warning");
			break;
		case "timed_out":
			ctx.ui.notify(`grant for ${name} did not resolve in time${outcome.message ? `: ${outcome.message}` : ""}`, "warning");
			break;
		case "error":
			ctx.ui.notify(`grant request failed for ${name} (${outcome.message || "error"})`, "error");
			break;
		default:
			ctx.ui.notify(`grant requested for ${name}${outcome.message ? `: ${outcome.message}` : ""}`, "warning");
	}
}

// ---------------------------------------------------------------------------
// ssh-agent lifecycle
// ---------------------------------------------------------------------------

function socketAlive(sock: string): boolean {
	return existsSync(sock) && statSync(sock).isSocket();
}

async function ensureAgent(): Promise<PiAgent> {
	if (agent && (!agent.pid || socketAlive(agent.authSock))) return agent;

	const existingSock = process.env.SSH_AUTH_SOCK;
	if (existingSock && socketAlive(existingSock)) {
		agent = {
			authSock: existingSock,
			pid: Number.parseInt(process.env.SSH_AGENT_PID ?? "", 10) || undefined,
			owned: false,
			loadedKeys: new Map(),
		};
		return agent;
	}

	// Start a dedicated, pi-owned agent with a private socket.
	const sock = join(tmpdir(), `pi-ssh-agent-${process.pid}-${randomUUID().slice(0, 8)}.sock`);
	const res = await runProcess("ssh-agent", ["-a", sock]);
	if (res.code !== 0 || !socketAlive(sock)) {
		throw new Error(`failed to start ssh-agent: ${res.stderr.trim() || res.stdout.trim()}`);
	}

	const parsedSock = /SSH_AUTH_SOCK=([^;]+)/.exec(res.stdout)?.[1]?.trim() ?? sock;
	const parsedPid = Number.parseInt(/SSH_AGENT_PID=(\d+)/.exec(res.stdout)?.[1] ?? "", 10) || undefined;

	agent = {
		authSock: parsedSock,
		pid: parsedPid,
		owned: true,
		loadedKeys: new Map(),
		prevAuthSock: existingSock,
		prevAgentPid: process.env.SSH_AGENT_PID,
	};

	process.env.SSH_AUTH_SOCK = parsedSock;
	if (parsedPid) process.env.SSH_AGENT_PID = String(parsedPid);
	else process.env.SSH_AGENT_PID = undefined;

	return agent;
}

function restoreEnv(): void {
	if (!agent?.owned) return;
	if (agent.prevAuthSock) process.env.SSH_AUTH_SOCK = agent.prevAuthSock;
	else process.env.SSH_AUTH_SOCK = undefined;
	if (agent.prevAgentPid) process.env.SSH_AGENT_PID = agent.prevAgentPid;
	else process.env.SSH_AGENT_PID = undefined;
}

async function stopOwnedAgent(): Promise<void> {
	if (!agent?.owned) return;
	if (agent.pid) {
		try {
			process.kill(agent.pid, "SIGTERM");
		} catch {
			// already gone
		}
	}
	if (existsSync(agent.authSock)) {
		try {
			unlinkSync(agent.authSock);
		} catch {
			// ignore
		}
	}
}

function clearPassphrases(): void {
	for (const key of agent?.loadedKeys.values() ?? []) {
		key.passphrase = undefined;
	}
}

// ---------------------------------------------------------------------------
// Askpass (feed the passphrase to ssh-add without a TTY)
// ---------------------------------------------------------------------------

function writeAskPass(): { path: string; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), "pi-ssh-key-"));
	const askPath = join(dir, "askpass.sh");
	// One-liner; the passphrase is read from the process env at call time so it
	// is never written to disk. The script itself carries no secret.
	writeFileSync(askPath, "#!/bin/sh\nprintf '%s' \"$PI_SSH_KEY_PASS\"\n");
	chmodSync(askPath, 0o700);
	const cleanup = (): void => {
		try {
			unlinkSync(askPath);
			rmdirSync(dir);
		} catch {
			// best effort
		}
	};
	return { path: askPath, cleanup };
}

async function addKeyToAgent(
	a: PiAgent,
	keyPath: string,
	passphrase: string | undefined,
	timeoutSecs: number
): Promise<RunResult> {
	const args = ["ssh-add"];
	if (timeoutSecs > 0) args.push("-t", String(Math.floor(timeoutSecs)));
	args.push(keyPath);

	const env: NodeJS.ProcessEnv = {
		...process.env,
		SSH_AUTH_SOCK: a.authSock,
	};
	if (a.pid) env.SSH_AGENT_PID = String(a.pid);

	let askPass: ReturnType<typeof writeAskPass> | undefined;
	if (passphrase) {
		askPass = writeAskPass();
		env.SSH_ASKPASS = askPass.path;
		env.SSH_ASKPASS_REQUIRE = "force";
		env.DISPLAY = env.DISPLAY || ":0";
		env.PI_SSH_KEY_PASS = passphrase;
	}

	const res = await runProcess("ssh-add", args, env);
	if (askPass) askPass.cleanup();
	return res;
}

async function removeKeyFromAgent(a: PiAgent, keyPath: string): Promise<RunResult> {
	const env: NodeJS.ProcessEnv = { ...process.env, SSH_AUTH_SOCK: a.authSock };
	if (a.pid) env.SSH_AGENT_PID = String(a.pid);
	return runProcess("ssh-add", ["-d", keyPath], env);
}

/** macOS `ssh-add` exits 1 ("No such file or directory") yet still adds the
 * key; treat an add as successful when it reports the identity as present. */
function addSucceeded(res: RunResult): boolean {
	return res.code === 0 || /identity added|identity already/i.test(`${res.stdout}\n${res.stderr}`);
}

// ---------------------------------------------------------------------------
// Masked passphrase prompt (adapted from pi-sudo)
// ---------------------------------------------------------------------------

async function promptPassphrase(ctx: ExtensionCommandContext, title: string, subtitle?: string): Promise<string | null> {
	if (!ctx.hasUI) return null;

	// Show the pane as blocked in herdr (detection cannot classify our custom
	// TUI), then hand authority back once the prompt resolves.
	herdrReport("blocked", "ssh key passphrase prompt");
	try {
		return await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
			let buf = "";
			let cachedLines: string[] | undefined;

			const refresh = (): void => {
				cachedLines = undefined;
				tui.requestRender();
			};

			const handle = (data: string): void => {
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
				for (const ch of data) {
					const code = ch.charCodeAt(0);
					if (code >= 0x20 && code !== 0x7f) buf += ch;
				}
				refresh();
			};

			const render = (width: number): string[] => {
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
				add(` ${theme.fg("muted", "passphrase:")} ${theme.fg("accent", dots)}${theme.fg("dim", "▏")}`);
				lines.push("");
				add(theme.fg("dim", " Enter to submit • Esc to cancel"));
				add(theme.fg("accent", "─".repeat(width)));
				cachedLines = lines;
				return lines;
			};

			return {
				render,
				invalidate: (): void => {
					cachedLines = undefined;
				},
				handleInput: handle,
			};
		});
	} finally {
		herdrReport("working");
		herdrRelease();
	}
}

// ---------------------------------------------------------------------------
// Load / unload logic
// ---------------------------------------------------------------------------

async function getPassphraseForKey(keyPath: string, keyName: string, ctx: ExtensionCommandContext): Promise<string | undefined> {
	const cached = agent?.loadedKeys.get(keyPath)?.passphrase;
	if (cached) return cached;

	const protectedKey = await isPassphraseProtected(keyPath);
	if (!protectedKey) return undefined;

	if (!ctx.hasUI) {
		throw new Error(`key ${keyName} is passphrase-protected but there is no interactive UI to prompt for it`);
	}

	for (let attempt = 0; attempt < MAX_PROMPT_ATTEMPTS; attempt++) {
		const pass = await promptPassphrase(
			ctx,
			`ssh key: ${keyName} is passphrase-protected`,
			"Enter passphrase to load it into the agent"
		);
		if (pass === null) throw new Error("cancelled passphrase prompt");
		if (pass.length > 0) return pass;
	}
	throw new Error("empty passphrase supplied");
}

async function agentIdentities(a: PiAgent): Promise<string> {
	const env: NodeJS.ProcessEnv = { ...process.env, SSH_AUTH_SOCK: a.authSock };
	if (a.pid) env.SSH_AGENT_PID = String(a.pid);
	const res = await runProcess("ssh-add", ["-l"], env);
	return `${res.stdout}\n${res.stderr}`;
}

async function loadKey(keyPath: string, timeoutSecs: number, ctx: ExtensionCommandContext): Promise<LoadedKey> {
	const name = basename(keyPath);
	const a = await ensureAgent();
	const passphrase = await getPassphraseForKey(keyPath, name, ctx);
	const fp = await fingerprint(keyPath);

	const res = await addKeyToAgent(a, keyPath, passphrase, timeoutSecs);

	// macOS `ssh-add` can exit 1 (printing "No such file or directory") yet still
	// add the key, so verify the identity is actually present in the agent
	// instead of trusting the exit code. When we have no fingerprint (e.g. the
	// key file could not be read), fall back to the add tool's own success text.
	const listed = await agentIdentities(a);
	const present = fp ? listed.includes(fp) : /identity added|identity already/i.test(`${res.stdout}\n${res.stderr}`);
	if (!present) {
		const msg = res.stderr.trim() || res.stdout.trim() || "ssh-add failed";
		if (/incorrect passphrase/i.test(msg)) {
			// cached passphrase was wrong; clear it so a next load re-prompts
			const cached = a.loadedKeys.get(keyPath);
			if (cached) cached.passphrase = undefined;
		}
		throw new Error(`failed to add key ${name}: ${msg}`);
	}

	const loaded: LoadedKey = { keyPath, name, fingerprint: fp, protected: Boolean(passphrase), passphrase };
	a.loadedKeys.set(keyPath, loaded);
	return loaded;
}

async function unloadKey(keyPath: string): Promise<string> {
	const a = agent;
	if (!a) return "no ssh key is loaded";
	if (!a.loadedKeys.has(keyPath)) return `key ${basename(keyPath)} is not loaded`;
	const res = await removeKeyFromAgent(a, keyPath);
	a.loadedKeys.delete(keyPath);
	if (res.code !== 0) {
		const msg = res.stderr.trim() || "ssh-add -d failed";
		throw new Error(`failed to unload ${basename(keyPath)}: ${msg}`);
	}
	// If that was the last key and we own the agent, tear it down too.
	if (a.loadedKeys.size === 0 && a.owned) {
		await stopOwnedAgent();
		restoreEnv();
		agent = undefined;
	}
	return `unloaded ${basename(keyPath)}`;
}

async function unloadAll(): Promise<string> {
	const a = agent;
	if (!a) return "no ssh key is loaded";
	const removed: string[] = [];
	for (const path of [...a.loadedKeys.keys()]) {
		const res = await runProcess("ssh-add", ["-d", path], { ...process.env, SSH_AUTH_SOCK: a.authSock });
		a.loadedKeys.delete(path);
		if (res.code === 0) removed.push(basename(path));
	}
	clearPassphrases();
	if (a.owned) {
		await stopOwnedAgent();
		restoreEnv();
		agent = undefined;
		return `unloaded ${removed.length} key(s) and stopped the agent`;
	}
	return `unloaded ${removed.length} key(s) from the existing agent`;
}

async function setTimeouts(timeoutSecs: number): Promise<string> {
	const a = agent;
	if (!a || a.loadedKeys.size === 0) {
		defaultTimeoutSecs = timeoutSecs;
		return `no keys loaded; default timeout set to ${timeoutSecs > 0 ? `${timeoutSecs}s` : "no expiry"}`;
	}
	const results: string[] = [];
	for (const [path, key] of a.loadedKeys) {
		const res = await addKeyToAgent(a, path, key.passphrase, timeoutSecs);
		if (addSucceeded(res)) {
			results.push(`${key.name} → ${timeoutSecs > 0 ? `${timeoutSecs}s` : "no expiry"}`);
		} else {
			results.push(`${key.name} → failed (${res.stderr.trim() || "error"})`);
		}
	}
	defaultTimeoutSecs = timeoutSecs;
	return results.join("\n");
}

// ---------------------------------------------------------------------------
// Key picker overlay (fuzzy search + multi-select)
// ---------------------------------------------------------------------------

interface KeyItem {
	path: string;
	name: string;
	protected: boolean;
	comment?: string;
}

async function pickKeys(ctx: ExtensionCommandContext, keyDir: string): Promise<KeyItem[] | undefined> {
	const paths = discoverKeys(keyDir);
	const items: KeyItem[] = [];
	for (const path of paths) {
		const protectedKey = await isPassphraseProtected(path);
		items.push({ path, name: basename(path), protected: protectedKey, comment: readComment(path) });
	}
	if (items.length === 0) {
		ctx.ui.notify(`no private keys found in ${keyDir}`, "warning");
		return undefined;
	}

	interface Row {
		item: KeyItem;
		match: string;
	}
	const all: Row[] = items.map((item) => ({
		item,
		match: `${item.name} ${item.comment ?? ""} ${item.path}`,
	}));

	return await ctx.ui.custom<KeyItem[] | undefined>((tui, theme, _kb, done) => {
		let query = "";
		let visible: Row[] = all;
		let selected = 0;
		const chosen = new Set<string>(); // key paths
		const maxVisible = 14;
		let cachedLines: string[] | undefined;

		const finish = (result: KeyItem[] | undefined): void => {
			if (chosen.size > 0) {
				done(items.filter((it) => chosen.has(it.path)));
				return;
			}
			done(result);
		};

		const refresh = (): void => {
			cachedLines = undefined;
			tui.requestRender();
		};

		function recompute(): void {
			const q = query.trim();
			visible = q ? fuzzyFilter(all, q, (r) => r.match) : all;
			if (selected >= visible.length) selected = Math.max(0, visible.length - 1);
			if (selected < 0) selected = 0;
		}

		function toggleSelected(): void {
			const row = visible[selected];
			if (!row) return;
			if (chosen.has(row.item.path)) chosen.delete(row.item.path);
			else chosen.add(row.item.path);
		}

		function toggleAll(): void {
			if (visible.every((r) => chosen.has(r.item.path))) {
				for (const r of visible) chosen.delete(r.item.path);
			} else {
				for (const r of visible) chosen.add(r.item.path);
			}
		}

		function handleInput(data: string): void {
			if (matchesKey(data, Key.escape)) {
				finish(undefined);
				return;
			}
			if (matchesKey(data, Key.enter) || matchesKey(data, "return")) {
				if (chosen.size === 0) {
					const row = visible[selected];
					if (row) chosen.add(row.item.path);
				}
				if (chosen.size > 0) finish(items.filter((it) => chosen.has(it.path)));
				return;
			}
			if (matchesKey(data, Key.space)) {
				toggleSelected();
				refresh();
				return;
			}
			if (data === "a" || data === "A" || matchesKey(data, "ctrl+a")) {
				toggleAll();
				refresh();
				return;
			}
			if (matchesKey(data, Key.up)) {
				if (visible.length > 0) selected = (selected - 1 + visible.length) % visible.length;
				refresh();
				return;
			}
			if (matchesKey(data, Key.down)) {
				if (visible.length > 0) selected = (selected + 1) % visible.length;
				refresh();
				return;
			}
			if (matchesKey(data, Key.backspace)) {
				query = query.slice(0, -1);
				recompute();
				refresh();
				return;
			}
			for (const ch of data) {
				const code = ch.charCodeAt(0);
				if (code >= 0x20 && code !== 0x7f) query += ch;
			}
			recompute();
			refresh();
		}

		function render(width: number): string[] {
			if (cachedLines) return cachedLines;
			const rw = Math.max(1, width);
			const lines: string[] = [];
			lines.push(theme.fg("accent", "─".repeat(rw)));
			lines.push(...wrapTextWithAnsi(theme.fg("accent", `Load ssh key(s): ${chosen.size} selected • ${all.length} found`), rw));
			lines.push("");
			lines.push(` ${theme.fg("muted", "filter:")} ${theme.fg("text", query)}${theme.fg("dim", "▏")}`);
			lines.push("");
			if (visible.length === 0) {
				lines.push(theme.fg("warning", "  No matching keys"));
			} else {
				const start = Math.max(0, Math.min(selected - Math.floor(maxVisible / 2), visible.length - maxVisible));
				const end = Math.min(start + maxVisible, visible.length);
				for (let i = start; i < end; i++) {
					const row = visible[i];
					const isSelectedRow = i === selected;
					const checked = chosen.has(row.item.path);
					const prefix = isSelectedRow ? theme.fg("accent", "→ ") : "  ";
					const box = theme.fg(checked ? "success" : "muted", checked ? "☑ " : "☐ ");
					const lock = row.item.protected ? theme.fg("dim", "[locked] ") : "";
					const comment = row.item.comment ? theme.fg("dim", `  ${row.item.comment}`) : "";
					const label = `${prefix}${box}${lock}${row.item.name}${comment}`;
					lines.push(truncateToWidth(label, rw));
				}
				if (start > 0 || end < visible.length) lines.push(theme.fg("dim", `  (${selected + 1}/${visible.length})`));
			}
			lines.push("");
			lines.push(
				...wrapTextWithAnsi(
					theme.fg("dim", "Type to filter • space select • a select all • Enter load selected (or highlighted) • Esc cancel"),
					rw
				)
			);
			lines.push(theme.fg("accent", "─".repeat(rw)));
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
// Arg parsing helpers
// ---------------------------------------------------------------------------

function stripQuotes(s: string): string {
	if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
		return s.slice(1, -1);
	}
	return s;
}

function parseArgs(args: string): { path?: string; timeout?: number } {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	const path = tokens[0] ? stripQuotes(tokens[0]) : undefined;
	const timeout = tokens[1] !== undefined ? Number.parseInt(tokens[1], 10) : undefined;
	return { path, timeout: Number.isFinite(timeout as number) ? timeout : undefined };
}

function formatTimeout(secs: number): string {
	return secs > 0 ? `${secs}s` : "no expiry";
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function piSshKey(pi: ExtensionAPI): void {
	pi.on("session_shutdown", async () => {
		const a = agent;
		if (a?.owned) {
			await stopOwnedAgent();
			restoreEnv();
		}
		clearPassphrases();
		agent = undefined;
	});

	pi.registerCommand("ssh-key-load", {
		description:
			"Pick one or more SSH private keys (fuzzy search, multi-select) and load them into an ssh-agent for this process",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const cwd = process.cwd();
			const config = loadConfig(cwd);
			const { path: argPath, timeout } = parseArgs(args);
			const timeoutSecs = timeout ?? defaultTimeoutSecs;

			let keyPaths: string[] | undefined;
			const oqto = isOqtoProxySession();
			if (argPath) {
				const resolved = expandPath(argPath, cwd);
				if (!oqto && !isPrivateKeyFile(resolved)) {
					ctx.ui.notify(`not a recognized private key: ${resolved}`, "error");
					return;
				}
				keyPaths = [resolved];
			} else {
				if (!ctx.hasUI) {
					ctx.ui.notify("ssh-key-load without a path requires an interactive UI for the picker", "error");
					return;
				}
				const picked = await pickKeys(ctx, config.keyDir);
				if (!picked || picked.length === 0) return;
				keyPaths = picked.map((k) => k.path);
			}

			// Keys are loaded one at a time so passphrase prompts appear
			// sequentially, one per key, in picker order.
			const results: string[] = [];
			let loadedAny = false;
			for (const keyPath of keyPaths) {
				const keyName = basename(keyPath);
				// In an oqto proxy session the agent socket is not a real ssh-agent
				// (it blocks add-identity) and keys live on the host, so a load
				// becomes a grant request rather than an add.
				if (oqto) {
					await oqtoProxyLoad(keyPath, ctx);
					continue;
				}
				try {
					const loaded = await loadKey(keyPath, timeoutSecs, ctx);
					loadedAny = true;
					const fp = loaded.fingerprint ? ` ${loaded.fingerprint}` : "";
					const lock = loaded.protected ? " (passphrase-protected)" : "";
					results.push(`loaded ${loaded.name}${fp}${lock}`);
				} catch (error) {
					results.push(`failed ${keyName}: ${error instanceof Error ? error.message : "error"}`);
				}
			}
			if (loadedAny) defaultTimeoutSecs = timeoutSecs;
			if (results.length > 0) ctx.ui.notify(results.join("\n"), "info");
		},
	});

	pi.registerCommand("ssh-key-unload", {
		description: "Remove a loaded SSH key (or all keys and the agent) from this process",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			try {
				if (!agent) {
					ctx.ui.notify("no ssh key is loaded", "info");
					return;
				}
				const { path: argPath } = parseArgs(args);
				if (argPath) {
					const msg = await unloadKey(expandPath(argPath, process.cwd()));
					ctx.ui.notify(msg, "info");
				} else {
					const msg = await unloadAll();
					ctx.ui.notify(msg, "info");
				}
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : "failed to unload", "error");
			}
		},
	});

	pi.registerCommand("ssh-key-timeout", {
		description: "Set the lifetime (seconds) of the loaded SSH key(s); 0 means no expiry",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const tokens = args.trim().split(/\s+/).filter(Boolean);
			if (tokens.length === 0) {
				ctx.ui.notify(`current default timeout: ${formatTimeout(defaultTimeoutSecs)}`, "info");
				return;
			}
			const secs = Number.parseInt(tokens[0], 10);
			if (!Number.isFinite(secs) || secs < 0) {
				ctx.ui.notify("timeout must be a non-negative number of seconds", "error");
				return;
			}
			try {
				const msg = await setTimeouts(secs);
				ctx.ui.notify(msg, "info");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : "failed to set timeout", "error");
			}
		},
	});

	pi.registerCommand("ssh-key-status", {
		description: "Show the loaded SSH key(s) and agent state",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const a = agent;
			if (!a) {
				ctx.ui.notify("ssh-key: no agent / no keys loaded", "info");
				return;
			}
			const lines = [`agent: ${a.authSock}${a.owned ? " (owned by pi)" : " (reused existing)"}`];
			if (a.loadedKeys.size === 0) {
				lines.push("no keys loaded");
			} else {
				for (const key of a.loadedKeys.values()) {
					const fp = key.fingerprint ? ` ${key.fingerprint}` : "";
					const lock = key.protected ? " 🔒" : "";
					lines.push(`  ${key.name}${fp}${lock}`);
				}
			}
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
