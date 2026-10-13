import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FORMAT, decrypt, ensureSecret, parseBundle, writeBackup } from "./backup.js";
import { DEFAULTS, backupDir, parseConfig, xdgHome } from "./config.js";
import { bar, isLocalModel, nymStatus } from "./index.js";
import { type Candidate, type ProgressEvent, apply, findNym, fraction, parseProgress, plan } from "./nym.js";

const noop = () => undefined;
import { RedactionPicker, groupLabel, grouped } from "./picker.js";
import { buildSession, contentStrings, hasUnredactedContent, residuals, sessionFileName, uuidv7 } from "./session.js";

const HEADER =
	'{"type":"session","version":3,"id":"orig","timestamp":"2026-10-13T07:00:00.000Z","cwd":"/Users/zorbaxtester/app"}';
const SESSION = [
	HEADER,
	'{"type":"message","id":"a1","parentId":null,"timestamp":"t","message":{"role":"user","content":[{"type":"text","text":"Mail ada.quill@example.org, key DB_PASSWORD=Sup3rSecretValue1"}]}}',
	'{"type":"message","id":"a2","parentId":"a1","timestamp":"t","message":{"role":"assistant","content":[{"type":"thinking","thinking":"ok","thinkingSignature":"ada.quill@example.org"},{"type":"text","text":"Writing to ada.quill@example.org"}]}}',
	"",
].join("\n");

function candidate(value: string, cls: string, extra: Partial<Candidate> = {}): Candidate {
	return { value, class: cls, source: "detected", credential: false, count: 1, context: value, ...extra };
}

describe("config", () => {
	test("invalid values fall back and XDG requires absolute paths", () => {
		expect(parseConfig({ guard: "nope", ner: "yes", profiles: ["work"], defaultBackup: "keep" })).toEqual({
			...DEFAULTS,
			profiles: ["work"],
			defaultBackup: "keep",
		});
		expect(xdgHome("XDG_DATA_HOME", ".local/share", { HOME: "/h", XDG_DATA_HOME: "rel" })).toBe("/h/.local/share");
		expect(backupDir(DEFAULTS, { HOME: "/h", XDG_DATA_HOME: "/d" })).toBe("/d/pi-nym/backups");
		expect(isLocalModel("Ollama", DEFAULTS)).toBe(true);
		expect(isLocalModel("anthropic", DEFAULTS)).toBe(false);
	});
});

describe("session", () => {
	test("redacted copy keeps the header, gets a new id and a marker after the leaf", () => {
		const redacted = SESSION.replaceAll("ada.quill@example.org", "x@example.com").replace(
			'"cwd":"/Users/zorbaxtester/app"',
			'"cwd":"/Users/someone/app"'
		);
		const id = uuidv7(Date.UTC(2026, 9, 13));
		const out = buildSession(SESSION, redacted, { id, now: new Date(Date.UTC(2026, 9, 13)), leafId: "a2", redacted: 2, kept: 1 });
		const lines = out
			.trimEnd()
			.split("\n")
			.map((l) => JSON.parse(l));
		expect(lines[0]).toEqual({
			type: "session",
			version: 3,
			id,
			timestamp: "2026-10-13T00:00:00.000Z",
			cwd: "/Users/zorbaxtester/app",
		});
		expect(lines.at(-1)).toMatchObject({
			type: "custom",
			customType: "pi-nym",
			parentId: "a2",
			data: { version: 1, redacted: 2, kept: 1 },
		});
		expect(id).toMatch(/^01a1[0-9a-f]{4}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		expect(sessionFileName(id, new Date(Date.UTC(2026, 9, 13)))).toBe(`2026-10-13T00-00-00-000Z_${id}.jsonl`);
		expect(hasUnredactedContent(lines.slice(1))).toBe(false);
		expect(hasUnredactedContent([...lines.slice(1), { type: "message" }])).toBe(true);
		expect(() =>
			buildSession(SESSION, `${redacted}extra\n`, { id, now: new Date(), leafId: null, redacted: 0, kept: 0 })
		).toThrow();
	});

	test("residuals ignore opaque fields, the header and values inside kept values", () => {
		expect(contentStrings(SESSION)).not.toContain("/Users/zorbaxtester/app");
		const text = SESSION.replace("Writing to ada.quill@example.org", "Writing to x@example.com");
		expect(residuals(text, [candidate("ada.quill@example.org", "email")], [])).toEqual([
			{ value: "ada.quill@example.org", class: "email", remaining: 1 },
		]);
		const kept = residuals(text, [candidate("ada", "first_name")], ["ada.quill@example.org"]);
		expect(kept).toEqual([]);
	});
});

describe("picker", () => {
	const items = [
		candidate("Jolanta", "first_name", { count: 4 }),
		candidate("Sup3rSecretValue1", "secret_assignment", { credential: true }),
		candidate("ada.quill@example.org", "email", { count: 3 }),
		candidate("Wierzbicki", "last_name", { count: 2 }),
	];
	test("secrets come first, then groups by occurrences", () => {
		expect(grouped(items).map(groupLabel)).toEqual(["secrets", "first names", "emails", "last names"]);
	});
	test("category rows toggle whole categories; values toggle individually", () => {
		let result: unknown;
		const picker = new RedactionPicker(items, noop, (d) => {
			result = d;
		});
		const DOWN = "\u001b[B";
		picker.handleInput(" "); // row 0: secrets category -> keep all secrets
		expect(picker.render(100).join("\n")).toContain("SECRETS KEPT");
		picker.handleInput(" "); // select them again
		picker.handleInput(DOWN);
		picker.handleInput(DOWN); // row 2: first names category
		picker.handleInput(" "); // keep every first name
		picker.handleInput(DOWN);
		picker.handleInput(DOWN);
		picker.handleInput(DOWN); // row 5: the email value
		picker.handleInput(" ");
		const lines = picker.render(100).join("\n");
		expect(lines).toContain("2/4 values selected");
		expect(lines).toMatch(/\[ \] first names {2}0\/1 values/);
		picker.handleInput("\r");
		expect(result).toEqual({ redact: [items[1], items[3]], keep: [items[0], items[2]] });
	});
	test("long lists open as a collapsed category overview; arrows expand, filter searches inside", () => {
		const many = [
			...Array.from({ length: 10 }, (_, i) => candidate(`user${i}`, "username")),
			...Array.from({ length: 10 }, (_, i) => candidate(`h${i}.example.org`, "url")),
		];
		let result: { keep: Candidate[] } | undefined;
		const picker = new RedactionPicker(many, noop, (d) => {
			result = d;
		});
		const overview = picker.render(100).filter((l) => l.includes("values •"));
		expect(overview).toHaveLength(2);
		expect(picker.render(100).join("\n")).not.toMatch(/\[x\] user3/);
		picker.handleInput("\u001b[C"); // expand accounts
		expect(picker.render(100).join("\n")).toMatch(/\[x\] user3/);
		picker.handleInput("\u001b[B"); // first account value
		picker.handleInput(" ");
		expect(picker.render(100).join("\n")).toMatch(/\[-\] accounts {2}9\/10 values/);
		picker.handleInput("\u001b[D"); // collapse again, cursor back on the category
		picker.handleInput(" "); // partial -> select all accounts
		for (const ch of "h7.") picker.handleInput(ch); // filter reaches into the collapsed URL category
		expect(picker.render(100).join("\n")).toContain("h7.example.org");
		picker.handleInput("\u0001"); // Ctrl+A: unselect every visible match
		picker.handleInput("\r");
		expect(result?.keep.map((c) => c.value)).toEqual(["h7.example.org"]);
		const cancelled = new RedactionPicker(many, noop, (d) => {
			result = d as typeof result;
		});
		cancelled.handleInput("\u001b");
		expect(result).toBeUndefined();
	});
	test("control characters are never written to the terminal", () => {
		const picker = new RedactionPicker([candidate("a\u001b[31mb", "username", { context: "x\na\u001b[31mb" })], noop, noop);
		expect(picker.render(80).join("")).not.toContain("\u001b[31m");
	});
});

describe("progress", () => {
	test("parses nym events, weights phases monotonically and draws a bar", () => {
		expect(parseProgress('{"nym_progress":{"phase":"ner","done":5,"total":10}}')).toEqual({ phase: "ner", done: 5, total: 10 });
		expect(parseProgress("error: something")).toBeUndefined();
		expect(parseProgress('{"nym_progress":broken')).toBeUndefined();
		const steps: ProgressEvent[] = [
			{ phase: "detect", done: 0, total: 100 },
			{ phase: "detect", done: 100, total: 100 },
			{ phase: "ner", done: 0, total: 100 },
			{ phase: "ner", done: 50, total: 100 },
			{ phase: "replace", done: 10, total: 20 },
			{ phase: "done", done: 20, total: 20 },
		];
		const values = steps.map(fraction);
		expect(values).toEqual([...values].sort((a, b) => a - b));
		expect([values[0], values.at(-1)]).toEqual([0, 1]);
		expect(bar(0.5, 10)).toBe("[█████░░░░░] 50%");
		expect(bar(2, 4)).toBe("[████] 100%");
	});
});

describe("nym discovery", () => {
	test("warns when nym is missing from PATH and when it is too old", async () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-nym-path-"));
		const env = { PATH: dir, HOME: dir, XDG_DATA_HOME: join(dir, "data") };
		expect(await nymStatus(DEFAULTS, env)).toContain("nym is not on PATH and no usable local build");
		writeFileSync(join(dir, "nym"), "#!/bin/sh\necho 'old help'\n", { mode: 0o755 });
		expect(await nymStatus(DEFAULTS, env)).toContain("is too old");
		const build = join(dir, "data", "nym", "builds", "b1");
		mkdirSync(build, { recursive: true });
		writeFileSync(join(build, "nym"), "#!/bin/sh\necho '--plan --keep-values-file --progress-json'\n", { mode: 0o755 });
		expect(await nymStatus(DEFAULTS, env)).toContain(`using ${join(build, "nym")}`);
		writeFileSync(join(dir, "nym"), "#!/bin/sh\necho '--plan --keep-values-file --progress-json'\n", { mode: 0o755 });
		expect(await nymStatus(DEFAULTS, env)).toBeUndefined();
		expect(await findNym(DEFAULTS, undefined, env)).toBe(join(dir, "nym"));
		rmSync(dir, { recursive: true, force: true });
	});
});

const realNym = process.env.PI_NYM_TEST_NYM;
describe.skipIf(!realNym)("real nym", () => {
	test("plan, keep and apply produce a valid redacted session", async () => {
		const work = mkdtempSync(join(tmpdir(), "pi-nym-e2e-"));
		const snapshot = join(work, "s.jsonl");
		writeFileSync(snapshot, SESSION);
		const config = { ...DEFAULTS, ner: false, nymBinary: realNym };
		const events: ProgressEvent[] = [];
		const candidates = await plan(realNym as string, { work, snapshot }, config, undefined, undefined, (e) => events.push(e));
		expect(events[0]?.phase).toBe("detect");
		expect(events.at(-1)).toMatchObject({ phase: "done" });
		const values = candidates.map((c) => c.value);
		expect(values).toContain("ada.quill@example.org");
		expect(candidates.find((c) => c.value === "Sup3rSecretValue1")?.credential).toBe(true);
		const applied = await apply(realNym as string, { work, snapshot }, ["Sup3rSecretValue1"], config);
		expect(applied.redacted).not.toContain("Writing to ada.quill@example.org");
		expect(applied.redacted).toContain("Sup3rSecretValue1");
		expect(applied.keys).toContain("ada.quill@example.org");
		const out = buildSession(SESSION, applied.redacted, { id: uuidv7(), now: new Date(), leafId: "a2", redacted: 1, kept: 1 });
		for (const line of out.trimEnd().split("\n")) JSON.parse(line);
		rmSync(work, { recursive: true, force: true });
	});
});

const tools = ["gpg", "kyz"].every((t) => spawnSync("sh", ["-c", `command -v ${t}`]).status === 0);
describe.skipIf(!tools)("encrypted backup", () => {
	test("gpg + kyz round trip with a throwaway vault, nothing plaintext left behind", async () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-nym-backup-"));
		const vault = join(dir, "vault.json");
		const pass = "pi-nym-test-passphrase";
		expect(spawnSync("kyz", ["--vault", vault, "vault", "create"], { input: `${pass}\n` }).status).toBe(0);
		expect(spawnSync("kyz", ["--vault", vault, "vault", "unlock"], { input: `${pass}\n` }).status).toBe(0);
		const secret = { service: "pi-nym-test", key: "backup", vault };
		await ensureSecret(secret);
		await ensureSecret(secret); // idempotent: the existing secret is reused
		const work = join(dir, "work");
		mkdirSync(work, { mode: 0o700 });
		const bundle = {
			format: FORMAT,
			createdAt: "2026-10-13T07:00:00.000Z",
			sessionId: "orig",
			originalPath: "/x/orig.jsonl",
			redactedPath: "/x/new.jsonl",
			session: SESSION,
			keys: '{"original":"ada.quill@example.org"}\n',
		} as const;
		const target = await writeBackup(secret, bundle, join(dir, "backups"), work);
		expect(statSync(target).mode & 0o077).toBe(0);
		expect(readFileSync(target).includes(Buffer.from("ada.quill"))).toBe(false);
		expect(existsSync(join(work, "bundle.json"))).toBe(false);
		expect(parseBundle(await decrypt(secret, target))).toEqual(bundle);
		chmodSync(dir, 0o700);
		spawnSync("kyz", ["--vault", vault, "vault", "lock"]);
		await expect(ensureSecret(secret)).rejects.toThrow("locked");
		rmSync(dir, { recursive: true, force: true });
	});
});
