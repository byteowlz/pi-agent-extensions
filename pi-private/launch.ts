import { execFile as execFileCallback, spawn } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
export type Profile = "private" | "nohistory";
export interface Config {
	sessionRoot?: string;
	// Only explicitly named, trusted extension entry points. No package discovery.
	extensions?: Record<string, string>;
}
const self = fileURLToPath(new URL("./index.ts", import.meta.url));
const builtins = new Set(["builtin:codemode", "builtin:tool-search", "builtin:llama.cpp"]);
const defaultRoot = () => join(process.env.XDG_DATA_HOME || join(homedir(), ".local/share"), "pi-private", "sessions");
const configPath = () => join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "pi-private", "config.json");

export function loadConfig(path = configPath()): Config {
	if (!existsSync(path)) return {};
	const stat = lstatSync(path);
	if (
		!stat.isFile() ||
		stat.isSymbolicLink() ||
		(typeof process.getuid === "function" && stat.uid !== process.getuid()) ||
		(stat.mode & 0o077) !== 0
	) {
		throw new Error("pi-private config must be an owned, private (0600), regular file");
	}
	const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid pi-private config");
	const raw = parsed as Record<string, unknown>;
	if (Object.keys(raw).some((key) => !["sessionRoot", "extensions"].includes(key)))
		throw new Error("unknown pi-private config key");
	if (raw.sessionRoot !== undefined && (typeof raw.sessionRoot !== "string" || !isAbsolute(raw.sessionRoot))) {
		throw new Error("sessionRoot must be absolute");
	}
	if (raw.extensions !== undefined && (!raw.extensions || typeof raw.extensions !== "object" || Array.isArray(raw.extensions))) {
		throw new Error("extensions must be an object");
	}
	const extensions = raw.extensions as Record<string, unknown> | undefined;
	for (const [name, entry] of Object.entries(extensions || {})) {
		if (!/^[a-z][a-z0-9-]*$/.test(name) || typeof entry !== "string" || (entry !== `builtin:${name}` && !isAbsolute(entry))) {
			throw new Error(`invalid extension allowlist entry: ${name}`);
		}
	}
	return raw as Config;
}

function secureDirectory(path: string): void {
	// Existing system/user ancestors may be 0755; only the private root needs 0700.
	// Refuse symlinks anywhere in the path so a preexisting ancestor cannot redirect it.
	let cursor = path;
	while (cursor !== dirname(cursor)) {
		if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`symlink in private path: ${cursor}`);
		cursor = dirname(cursor);
	}
	if (!existsSync(path)) mkdirSync(path, { mode: 0o700, recursive: true });
	const stat = lstatSync(path);
	if (
		!stat.isDirectory() ||
		stat.isSymbolicLink() ||
		(typeof process.getuid === "function" && stat.uid !== process.getuid()) ||
		(stat.mode & 0o077) !== 0
	) {
		throw new Error(`unsafe private directory: ${path}`);
	}
}

function extensionArgs(config: Config): string[] {
	const history = join(dirname(dirname(self)), "pi-history-search", "index.ts");
	const extensions = { "pi-history-search": history, ...config.extensions };
	const args: string[] = [];
	for (const [name, entry] of Object.entries(extensions)) {
		if (name === "pi-private") throw new Error("pi-private is always loaded; do not allowlist it twice");
		if (name.startsWith("pi-history") && name !== "pi-history-search") throw new Error("unrecognized history extension");
		if (entry.startsWith("builtin:")) {
			if (!builtins.has(entry)) throw new Error(`unsupported built-in: ${entry}`);
		} else {
			const stat = lstatSync(entry);
			if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`extension is not a regular file: ${name}`);
			if (!/\.[cm]?[jt]s$/.test(entry)) throw new Error(`invalid extension file: ${name}`);
		}
		args.push("-e", entry);
	}
	return args;
}

function prepareAtuin(sessionDir: string, resume: boolean): string {
	const atuin = join(sessionDir, "atuin");
	const filter = join(atuin, "config.toml");
	if (!resume) {
		mkdirSync(atuin, { mode: 0o700 });
		writeFileSync(filter, 'history_filter = [".*"]\n', { mode: 0o600, flag: "wx" });
	} else {
		secureDirectory(atuin);
		const stat = lstatSync(filter);
		if (
			!stat.isFile() ||
			stat.isSymbolicLink() ||
			(typeof process.getuid === "function" && stat.uid !== process.getuid()) ||
			(stat.mode & 0o077) !== 0 ||
			readFileSync(filter, "utf8") !== 'history_filter = [".*"]\n'
		)
			throw new Error("private Atuin filter missing or unsafe");
	}
	return atuin;
}

export function prepare(
	profile: Profile,
	config: Config = loadConfig(),
	resumeDir?: string
): { args: string[]; env: Record<string, string>; sessionDir: string } {
	if (profile !== "private" && profile !== "nohistory") throw new Error("unknown private profile");
	const root = resolve(config.sessionRoot || defaultRoot());
	const normal = resolve(homedir(), ".pi", "agent");
	if (root === normal || (!relative(normal, root).startsWith("..") && !isAbsolute(relative(normal, root)))) {
		throw new Error("private session root must be outside ~/.pi/agent");
	}
	secureDirectory(root);
	if (
		resumeDir &&
		(dirname(resolve(resumeDir)) !== root || !basename(resumeDir).startsWith(`${profile}-`) || !existsSync(resumeDir))
	) {
		throw new Error("resume directory must be an existing session under this profile's private root");
	}
	const sessionDir = resumeDir ? resolve(resumeDir) : mkdtempSync(join(root, `${profile}-`));
	try {
		if (resumeDir) secureDirectory(sessionDir);
		// Atuin's hook runs in the shell launched by herdr. Give it a private config
		// filtering *all* commands, instead of relying on shell-history settings alone.
		const atuin = prepareAtuin(sessionDir, Boolean(resumeDir));
		const args = [
			"--no-extensions",
			"--no-mcp",
			"--no-skills",
			"--no-prompt-templates",
			"--no-themes",
			"--no-context-files",
			"--session-dir",
			sessionDir,
			"--tools",
			process.platform === "win32" ? "read,powershell,edit,write" : "read,bash,edit,write",
			"-e",
			self,
		];
		if (resumeDir) args.push("--continue");
		if (profile === "private") args.push(...extensionArgs(config));
		return {
			args,
			env: {
				PI_CODING_AGENT_SESSION_DIR: sessionDir,
				KOMPRESS_ROLLING: "0",
				ATUIN_CONFIG_DIR: atuin,
				HISTFILE: process.platform === "win32" ? "NUL" : "/dev/null",
				HISTSIZE: "0",
				HISTFILESIZE: "0",
			},
			sessionDir,
		};
	} catch (error) {
		if (!resumeDir) rmSync(sessionDir, { recursive: true, force: true });
		throw error;
	}
}

function quote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

export async function launch(
	profile: Profile,
	cwd: string,
	mode: "auto" | "plain" = "auto",
	config?: Config,
	resumeDir?: string
): Promise<string> {
	const plan = prepare(profile, config, resumeDir);
	const env = { ...process.env, ...plan.env };
	try {
		if (mode === "auto" && process.env.HERDR_ENV === "1") {
			const workspace = process.env.HERDR_WORKSPACE_ID || process.env.HERDR_PANE_ID?.split(":")[0];
			if (!workspace) throw new Error("Cannot determine herdr workspace; refusing focused-workspace fallback");
			const { stdout } = await execFile("herdr", [
				"tab",
				"create",
				"--workspace",
				workspace,
				"--cwd",
				cwd,
				"--label",
				`pi ${profile}`,
				"--no-focus",
				...Object.entries(plan.env).flatMap(([key, value]) => ["--env", `${key}=${value}`]),
			]);
			const result = JSON.parse(stdout) as {
				error?: unknown;
				result?: { root_pane?: { pane_id?: string }; tab?: { tab_id?: string } };
			};
			if (result.error) throw new Error(`herdr tab create rejected: ${JSON.stringify(result.error)}`);
			const pane = result.result?.root_pane?.pane_id;
			if (!pane) throw new Error("herdr tab created but no pane ID returned; inspect and close the tab before retrying");
			try {
				const started = await execFile("herdr", [
					"agent",
					"start",
					`private-${process.pid}`,
					"--kind",
					"pi",
					"--pane",
					pane,
					"--",
					...plan.args,
				]);
				const response = JSON.parse(started.stdout) as { error?: unknown; result?: { agent?: { name?: string } } };
				if (response.error || !response.result?.agent?.name)
					throw new Error(`herdr agent start rejected: ${JSON.stringify(response)}`);
			} catch (error) {
				if (result.result?.tab?.tab_id)
					await execFile("herdr", ["tab", "close", result.result.tab.tab_id]).catch(() => {
						/* best-effort cleanup; original failure reported */
					});
				throw error;
			}
			return `Started pi ${profile} in herdr pane ${pane} (${plan.sessionDir})`;
		}
		if (mode === "auto" && process.env.TMUX) {
			// tmux invokes its command via a non-interactive shell; no interactive Atuin hook.
			await execFile("tmux", [
				"new-window",
				"-d",
				"-c",
				cwd,
				...Object.entries(plan.env).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
				["exec", "pi", ...plan.args].map(quote).join(" "),
			]);
			return `Started pi ${profile} in a tmux window (${plan.sessionDir})`;
		}
		if (mode !== "plain")
			throw new Error("No herdr/tmux session available; use the standalone bun pi-private/cli.ts launcher for a plain terminal");
		const child = spawn("pi", plan.args, { cwd, env, stdio: "inherit" });
		const code = await new Promise<number>((resolveCode, reject) => {
			child.once("error", reject);
			child.once("exit", (status) => resolveCode(status ?? 1));
		});
		if (code !== 0) throw new Error(`pi exited with status ${code}`);
		return plan.sessionDir;
	} catch (error) {
		// Keep the session directory: a launched child may have written data before failure.
		throw new Error(`Private launch failed (${plan.sessionDir} retained for inspection): ${String(error)}`);
	}
}
