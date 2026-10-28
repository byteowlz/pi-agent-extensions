import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archive } from "./archive.js";
import { launch, loadConfig, prepare } from "./launch.js";

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
	expect(first.env.ATUIN_CONFIG_DIR).toBe(join(first.sessionDir, "atuin"));
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

test("real pi RPC boot exposes history only in standard profile and uses isolated session path", () => {
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
	const fakeBin = join(dir, "bin");
	mkdirSync(fakeBin, { mode: 0o700 });
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
		expect(agent).toContain("--no-extensions --no-mcp");
		expect(agent).not.toContain(history);
		expect(agent).not.toContain("--fork");
	} finally {
		for (const key of ["PATH", "FAKE_HERDR_LOG", "HERDR_ENV", "HERDR_PANE_ID", "HERDR_WORKSPACE_ID"]) {
			if (saved[key] === undefined) delete process.env[key];
			else process.env[key] = saved[key];
		}
	}
});

test("resume reuses the matching isolated directory without forking or crossing profiles", () => {
	const { root } = fixture();
	const fresh = prepare("nohistory", { sessionRoot: root });
	const resumed = prepare("nohistory", { sessionRoot: root }, fresh.sessionDir);
	expect(resumed.sessionDir).toBe(fresh.sessionDir);
	expect(resumed.args).toContain("--continue");
	expect(resumed.args).not.toContain("--fork");
	expect(() => prepare("private", { sessionRoot: root }, fresh.sessionDir)).toThrow("resume directory");
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
