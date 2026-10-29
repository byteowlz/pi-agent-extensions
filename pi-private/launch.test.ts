import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preflight } from "./age-store.js";
import { archive } from "./archive.js";
import { parsePrivateRequest } from "./index.js";
import { launch, loadConfig, prepare } from "./launch.js";
import { runPrivate } from "./runner-core.js";

const dirs: string[] = [];
function fixture() {
	const dir = mkdtempSync(join(realpathSync(tmpdir()), "pi-private-test-"));
	dirs.push(dir);
	const root = join(dir, "sessions");
	mkdirSync(root, { mode: 0o700 });
	return { dir, root };
}
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const history = join(import.meta.dir, "../pi-history-search/index.ts");

function fakeExecutables(dir: string): string {
	const bin = join(dir, "bin");
	mkdirSync(bin, { mode: 0o700 });
	writeFileSync(
		join(bin, "age"),
		'#!/usr/bin/env bash\nif [[ "$1" == "--version" ]]; then echo age-fixture; exit 0; fi\nif [[ "$1" == "-d" && "${MOCK_FAIL_DECRYPT:-}" == 1 ]]; then printf partial; exit 1; fi\nif [[ "$1" == "-r" && "${MOCK_FAIL_ENCRYPT:-}" == 1 && "${!#}" == *.jsonl ]]; then exit 1; fi\nif [[ "$1" == "-p" ]]; then cat; else last="${!#}"; cat "$last"; fi\n',
		{ mode: 0o700 }
	);
	writeFileSync(
		join(bin, "age-keygen"),
		'#!/usr/bin/env bash\nprintf "Public key: age1fixturekey\\n" >&2\nprintf "AGE-SECRET-KEY-FIXTURE\\n"\n',
		{ mode: 0o700 }
	);
	writeFileSync(
		join(bin, "pi"),
		'#!/usr/bin/env bash\nif [[ "$*" == *--continue* ]]; then printf "continued\\n" >> "$PI_CODING_AGENT_SESSION_DIR/demo.jsonl"; else printf "{\\"type\\":\\"session\\",\\"id\\":\\"fixture\\",\\"cwd\\":\\"/tmp\\",\\"timestamp\\":\\"test\\"}\\n" > "$PI_CODING_AGENT_SESSION_DIR/demo.jsonl"; fi\n',
		{ mode: 0o700 }
	);
	return bin;
}

async function withFakePath<T>(bin: string, run: () => Promise<T>): Promise<T> {
	const old = process.env.PATH;
	try {
		process.env.PATH = `${bin}:${old}`;
		return await run();
	} finally {
		if (old === undefined) Reflect.deleteProperty(process.env, "PATH");
		else process.env.PATH = old;
	}
}

test("standard profile loads only explicit allowlist, with fresh session and no fork", () => {
	const { root } = fixture();
	const first = prepare("private", {
		sessionRoot: root,
		extensions: { "pi-history-search": history, "builtin:codemode": "builtin:codemode" },
	});
	const second = prepare("private", { sessionRoot: root });
	expect(first.sessionDir).not.toBe(second.sessionDir);
	expect(first.args).toContain("--no-extensions");
	expect(first.args).toContain("--no-mcp");
	expect(first.args).not.toContain("--fork");
	expect(first.args).toEqual(
		expect.arrayContaining(["--session-dir", first.sessionDir, "-e", history, "-e", "builtin:codemode"])
	);
	expect(first.env.PI_CODING_AGENT_SESSION_DIR).toBe(first.sessionDir);
	expect(first.env.KOMPRESS_ROLLING).toBe("0");
	expect(first.env.ATUIN_CONFIG_DIR).toBe(join(first.vaultDir, "atuin"));
	expect(readFileSync(join(first.env.ATUIN_CONFIG_DIR, "config.toml"), "utf8")).toContain('history_filter = [".*"]');
	expect(second.args).toContain(history);
	expect(second.args).not.toContain("builtin:codemode");
});

test("nohistory does not load history search, codemode, tool-search or any optional extension", () => {
	const { root } = fixture();
	const plan = prepare("nohistory", {
		sessionRoot: root,
		extensions: { "pi-history-search": history, "builtin:codemode": "builtin:codemode" },
	});
	expect(plan.args).not.toContain(history);
	expect(plan.args).not.toContain("builtin:codemode");
	expect(plan.args).not.toContain("builtin:tool-search");
	expect(plan.args).toEqual(expect.arrayContaining(["--no-extensions", "--no-mcp", "--tools", "read,bash,edit,write"]));
	expect(plan.args.filter((arg) => arg === "-e")).toHaveLength(1);
});

test("real pi RPC option probe exposes history only in standard profile (launcher handles encryption)", () => {
	const { root } = fixture();
	for (const profile of ["private", "nohistory"] as const) {
		const plan = prepare(profile, { sessionRoot: root });
		const boot = spawnSync("pi", ["--mode", "rpc", ...plan.args], {
			input: '{"id":"commands","type":"get_commands"}\n{"id":"state","type":"get_state"}\n',
			env: { ...process.env, ...plan.env },
			encoding: "utf8",
			timeout: 15_000,
		});
		expect(boot.status).toBe(0);
		const records = boot.stdout
			.split("\n")
			.filter((line) => line.startsWith("{"))
			.map((line) => JSON.parse(line));
		const commands = records
			.find((record) => record.id === "commands")
			?.data?.commands?.map((item: { name: string }) => item.name);
		expect(commands).toContain("private");
		expect(commands.includes("history")).toBe(profile === "private");
		const sessionFile = records.find((record) => record.id === "state")?.data?.sessionFile;
		expect(sessionFile?.startsWith(plan.sessionDir)).toBe(true);
		expect(statSync(plan.sessionDir).mode & 0o777).toBe(0o700);
		if (sessionFile && existsSync(sessionFile)) expect(statSync(sessionFile).mode & 0o777).toBe(0o600);
	}
});

test("herdr tab receives private env and agent receives only the isolated pi argv", async () => {
	const { dir, root } = fixture();
	const fakeBin = fakeExecutables(dir);
	const log = join(dir, "herdr.log");
	writeFileSync(
		join(fakeBin, "herdr"),
		'#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$FAKE_HERDR_LOG"\nif [[ "$1" == "tab" ]]; then printf "{\\"result\\":{\\"tab\\":{\\"tab_id\\":\\"w1:t2\\"},\\"root_pane\\":{\\"pane_id\\":\\"w1:p3\\"}}}"; else printf "{\\"result\\":{\\"agent\\":{\\"name\\":\\"private\\"}}}"; fi\n',
		{ mode: 0o700 }
	);
	const saved = { ...process.env };
	try {
		process.env.PATH = `${fakeBin}:${saved.PATH}`;
		process.env.FAKE_HERDR_LOG = log;
		process.env.HERDR_ENV = "1";
		process.env.HERDR_PANE_ID = "w1:p1";
		process.env.HERDR_WORKSPACE_ID = ""; // derived from caller pane, never focused workspace
		const outcome = await launch("nohistory", dir, "auto", { sessionRoot: root, extensions: { "pi-history-search": history } });
		expect(outcome).toContain("w1:p3");
		const [tab, agent] = readFileSync(log, "utf8").trim().split("\n");
		expect(tab).toContain("--env PI_CODING_AGENT_SESSION_DIR=");
		expect(tab).toContain("--env KOMPRESS_ROLLING=0");
		expect(tab).toContain("--env ATUIN_CONFIG_DIR=");
		expect(agent).toContain("pane run w1:p3");
		expect(agent).toContain("runner.ts");
		expect(agent).not.toContain(history);
		expect(agent).not.toContain("--fork");
	} finally {
		for (const key of ["PATH", "FAKE_HERDR_LOG", "HERDR_ENV", "HERDR_PANE_ID", "HERDR_WORKSPACE_ID"]) {
			if (saved[key] === undefined) delete process.env[key];
			else process.env[key] = saved[key];
		}
	}
});

test("slash command parses fresh and deliberate resume", () => {
	expect(parsePrivateRequest("")).toEqual({ profile: "private" });
	expect(parsePrivateRequest("nohistory")).toEqual({ profile: "nohistory" });
	expect(parsePrivateRequest("resume /vault/a b")).toEqual({ profile: "private", resumeDir: "/vault/a b" });
	expect(parsePrivateRequest("nohistory resume /vault/b")).toEqual({ profile: "nohistory", resumeDir: "/vault/b" });
	expect(() => parsePrivateRequest("nohistory resume")).toThrow("Usage");
});

test("resume reuses the matching isolated directory without forking or crossing profiles", () => {
	const { root } = fixture();
	const fresh = prepare("nohistory", { sessionRoot: root });
	const resumed = prepare("nohistory", { sessionRoot: root }, fresh.vaultDir);
	expect(resumed.sessionDir).toBe(fresh.sessionDir);
	expect(resumed.args).toContain("--continue");
	expect(resumed.args).not.toContain("--fork");
	expect(() => prepare("private", { sessionRoot: root }, fresh.vaultDir)).toThrow("resume directory");
});

test("missing age prevents launch before any vault or Pi process is created", async () => {
	const { dir, root } = fixture();
	const oldPath = process.env.PATH;
	try {
		process.env.PATH = join(dir, "empty-bin");
		await expect(launch("nohistory", dir, "plain", { sessionRoot: root })).rejects.toThrow();
		expect(readdirSync(root)).toEqual([]);
	} finally {
		if (oldPath === undefined) Reflect.deleteProperty(process.env, "PATH");
		else process.env.PATH = oldPath;
	}
});

test("individual JSONL files are age-sealed on exit, unlocked to resume, then resealed", async () => {
	const { dir, root } = fixture();
	const plan = prepare("nohistory", { sessionRoot: root });
	await withFakePath(fakeExecutables(dir), async () => {
		await runPrivate(plan, false, dir, { ...process.env, ...plan.env });
		const ciphertext = join(plan.vaultDir, "sealed", "demo.jsonl.age");
		expect(existsSync(ciphertext)).toBe(true);
		expect(statSync(ciphertext).mode & 0o777).toBe(0o600);
		expect(statSync(join(plan.vaultDir, "identity.age")).mode & 0o777).toBe(0o600);
		expect(statSync(join(plan.vaultDir, "recipient.txt")).mode & 0o777).toBe(0o600);
		expect(existsSync(join(plan.sessionDir, "demo.jsonl"))).toBe(false);
		expect(existsSync(join(plan.vaultDir, "active.lock"))).toBe(false);
		const resumed = prepare("nohistory", { sessionRoot: root }, plan.vaultDir);
		await runPrivate(resumed, true, dir, { ...process.env, ...resumed.env });
		expect(readFileSync(ciphertext, "utf8")).toContain("continued");
		expect(existsSync(join(plan.sessionDir, "demo.jsonl"))).toBe(false);
	});
});

test("recipient mode verifies identity before Pi and refuses an unlock-mode or permission change", async () => {
	const { dir, root } = fixture();
	const identityFile = join(dir, "identity.txt");
	writeFileSync(identityFile, "plugin identity fixture", { mode: 0o600 });
	const config = { sessionRoot: root, age: { recipient: "age1fixturekey", identityFile } };
	const plan = prepare("nohistory", config);
	await withFakePath(fakeExecutables(dir), async () => {
		await runPrivate(plan, false, dir, { ...process.env, ...plan.env });
		expect(existsSync(join(plan.vaultDir, "identity.age"))).toBe(false);
		const switched = prepare("nohistory", { sessionRoot: root }, plan.vaultDir);
		await expect(preflight(switched, true)).rejects.toThrow("age mode changed");
		chmodSync(identityFile, 0o644);
		const resumed = prepare("nohistory", config, plan.vaultDir);
		await expect(preflight(resumed, true)).rejects.toThrow("unsafe private session file");
		expect(existsSync(join(plan.sessionDir, "demo.jsonl"))).toBe(false);
	});
});

test("failed age unlock discards partial plaintext and never starts Pi", async () => {
	const { dir, root } = fixture();
	const plan = prepare("nohistory", { sessionRoot: root });
	const bin = fakeExecutables(dir);
	await withFakePath(bin, async () => {
		await runPrivate(plan, false, dir, { ...process.env, ...plan.env });
		process.env.MOCK_FAIL_DECRYPT = "1";
		try {
			const resumed = prepare("nohistory", { sessionRoot: root }, plan.vaultDir);
			await expect(runPrivate(resumed, true, dir, { ...process.env, ...resumed.env })).rejects.toThrow("age -d failed");
			expect(existsSync(join(plan.sessionDir, "demo.jsonl"))).toBe(false);
			expect(existsSync(join(plan.vaultDir, "sealed", "demo.jsonl.age"))).toBe(true);
		} finally {
			Reflect.deleteProperty(process.env, "MOCK_FAIL_DECRYPT");
		}
	});
});

test("failed age sealing leaves plaintext and a lock instead of reporting success", async () => {
	const { dir, root } = fixture();
	const plan = prepare("nohistory", { sessionRoot: root });
	await withFakePath(fakeExecutables(dir), async () => {
		process.env.MOCK_FAIL_ENCRYPT = "1";
		try {
			await expect(runPrivate(plan, false, dir, { ...process.env, ...plan.env })).rejects.toThrow("age -r failed");
			expect(existsSync(join(plan.sessionDir, "demo.jsonl"))).toBe(true);
			expect(existsSync(join(plan.vaultDir, "active.lock"))).toBe(true);
			await expect(preflight(plan, true)).rejects.toThrow("plaintext session files remain");
		} finally {
			Reflect.deleteProperty(process.env, "MOCK_FAIL_ENCRYPT");
		}
	});
});

test("bad extension and insecure directory fail closed", () => {
	const { dir, root } = fixture();
	expect(() => prepare("private", { sessionRoot: root, extensions: { missing: join(dir, "absent.ts") } })).toThrow();
	chmodSync(root, 0o755);
	expect(() => prepare("nohistory", { sessionRoot: root })).toThrow("unsafe private directory");
});

test("config requires private regular file and validates allowlist", () => {
	const { dir } = fixture();
	const config = join(dir, "config.json");
	writeFileSync(config, JSON.stringify({ extensions: { "pi-history-search": history } }), { mode: 0o600 });
	expect(loadConfig(config).extensions?.["pi-history-search"]).toBe(history);
	chmodSync(config, 0o644);
	expect(() => loadConfig(config)).toThrow("private");
	chmodSync(config, 0o600);
	writeFileSync(config, JSON.stringify({ extensions: { other: "relative.ts" } }));
	expect(() => loadConfig(config)).toThrow("allowlist");
	writeFileSync(config, JSON.stringify({ age: { recipient: "age1fixturekey", identityFile: join(dir, "identity.txt") } }));
	expect(loadConfig(config).age?.recipient).toBe("age1fixturekey");
	writeFileSync(config, JSON.stringify({ age: { recipient: "bad", identityFile: "relative" } }));
	expect(() => loadConfig(config)).toThrow("age requires");
	const alias = join(dir, "alias.json");
	symlinkSync(config, alias);
	expect(() => loadConfig(alias)).toThrow("regular file");
});

test("failed age unlock removes partial plaintext and leaves no destination", async () => {
	const { dir } = fixture();
	const source = join(dir, "archive.age");
	const identity = join(dir, "identity.txt");
	const destination = join(dir, "restored.jsonl");
	const fakeAge = join(dir, "age-fail");
	writeFileSync(source, "encrypted", { mode: 0o600 });
	writeFileSync(identity, "private", { mode: 0o600 });
	writeFileSync(fakeAge, "#!/usr/bin/env bash\nprintf partial; exit 1\n", { mode: 0o700 });
	await expect(archive("decrypt", source, identity, destination, fakeAge)).rejects.toThrow("age failed");
	expect(existsSync(destination)).toBe(false);
	expect(readFileSync(source, "utf8")).toBe("encrypted");
});

test("successful age archive uses private destination and never deletes input", async () => {
	const { dir } = fixture();
	const source = join(dir, "session.jsonl");
	const destination = join(dir, "session.age");
	const fakeAge = join(dir, "age-ok");
	writeFileSync(source, "plaintext", { mode: 0o600 });
	writeFileSync(fakeAge, "#!/usr/bin/env bash\nprintf ciphertext\n", { mode: 0o700 });
	await archive("encrypt", source, "age1public", destination, fakeAge);
	expect(statSync(destination).mode & 0o777).toBe(0o600);
	expect(readFileSync(source, "utf8")).toBe("plaintext");
});

test("unsupported backend is not offered as an unguarded fallback", () => {
	const { dir } = fixture();
	const config = join(dir, "config.json");
	writeFileSync(config, '{"encryption":{"backend":"age","identity":"missing"}}', { mode: 0o600 });
	expect(() => loadConfig(config)).toThrow("unknown pi-private config key");
});
