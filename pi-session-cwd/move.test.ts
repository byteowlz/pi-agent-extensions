import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
	MoveError,
	applyMove,
	defaultSessionDir,
	destinationDir,
	encodeCwdSegment,
	isDirectory,
	planMove,
	readLastMove,
	resolveTargetCwd,
	shortenPath,
} from "./move";

function tmp(prefix = "pi-cwd-"): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** A minimal but realistic session file: header + one message entry. */
function writeSession(dir: string, name: string, cwd: string): string {
	fs.mkdirSync(dir, { recursive: true });
	const file = path.join(dir, name);
	const header = { type: "session", version: 3, id: "abc123", timestamp: new Date().toISOString(), cwd };
	const message = {
		type: "message",
		id: "m1",
		parentId: null,
		timestamp: new Date().toISOString(),
		message: { role: "user", content: [{ type: "text", text: "hello" }], timestamp: Date.now() },
	};
	fs.writeFileSync(file, `${JSON.stringify(header)}\n${JSON.stringify(message)}\n`);
	return file;
}

describe("cwd encoding matches pi's session directory naming", () => {
	test("strips the leading separator and replaces separators and colons", () => {
		expect(encodeCwdSegment("/home/wismut/Code/app")).toBe("--home-wismut-Code-app--");
		expect(encodeCwdSegment("/")).toBe("----");
		expect(encodeCwdSegment("C:\\Users\\me\\app")).toBe("--C--Users-me-app--");
	});

	test("default session dir lives under the agent dir", () => {
		expect(defaultSessionDir("/home/wismut/Code/app", "/agent")).toBe("/agent/sessions/--home-wismut-Code-app--");
	});
});

describe("resolveTargetCwd", () => {
	test("resolves relative paths against the current cwd", () => {
		expect(resolveTargetCwd("../sibling", "/home/wismut/Code/app")).toBe("/home/wismut/Code/sibling");
		expect(resolveTargetCwd(".", "/home/wismut/Code/app")).toBe("/home/wismut/Code/app");
	});

	test("expands a leading tilde", () => {
		expect(resolveTargetCwd("~/Code/other", "/tmp")).toBe(path.join(os.homedir(), "Code/other"));
		expect(resolveTargetCwd("~", "/tmp")).toBe(os.homedir());
	});

	test("rejects empty input", () => {
		expect(() => resolveTargetCwd("   ", "/tmp")).toThrow(MoveError);
	});
});

describe("planMove guards", () => {
	test("refuses a session that is not persisted", () => {
		const target = tmp();
		expect(() => planMove({ sessionFile: undefined, currentCwd: target, targetCwd: target })).toThrow(/not persisted/);
	});

	test("refuses a target that does not exist or is a file", () => {
		const home = tmp();
		const file = writeSession(path.join(home, "s"), "s.jsonl", home);
		const missing = path.join(home, "nope");
		expect(() => planMove({ sessionFile: file, currentCwd: home, targetCwd: missing })).toThrow(/does not exist/);

		const plainFile = path.join(home, "plain.txt");
		fs.writeFileSync(plainFile, "x");
		expect(() => planMove({ sessionFile: file, currentCwd: home, targetCwd: plainFile })).toThrow(/not a directory/);
	});

	test("refuses a no-op move to the same directory", () => {
		const home = tmp();
		const file = writeSession(path.join(home, "s"), "s.jsonl", home);
		const target = fs.mkdtempSync(path.join(home, "same-"));
		// currentCwd === target (path spelled differently but identical)
		expect(() => planMove({ sessionFile: file, currentCwd: target, targetCwd: `${target}/` })).toThrow(/already in/);
	});

	test("refuses a session without a header cwd", () => {
		const home = tmp();
		const target = tmp();
		const dir = path.join(home, "s");
		fs.mkdirSync(dir, { recursive: true });
		const file = path.join(dir, "bad.jsonl");
		fs.writeFileSync(file, `${JSON.stringify({ type: "session", version: 3, id: "x" })}\n`);
		expect(() => planMove({ sessionFile: file, currentCwd: home, targetCwd: target })).toThrow(/no cwd/);
	});

	test("refuses a destination collision", () => {
		const home = tmp();
		const target = tmp();
		const agent = path.join(home, "agent");
		const source = writeSession(path.join(agent, "sessions", encodeCwdSegment(home)), "session.jsonl", home);
		const dest = path.join(agent, "sessions", encodeCwdSegment(target), "session.jsonl");
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.writeFileSync(dest, "existing\n");
		process.env.PI_CODING_AGENT_DIR = agent;
		try {
			expect(() => planMove({ sessionFile: source, currentCwd: home, targetCwd: target })).toThrow(/already exists/);
		} finally {
			delete process.env.PI_CODING_AGENT_DIR;
		}
	});
});

describe("planMove and applyMove", () => {
	test("rewrites the header cwd and relocates the file, preserving entries", () => {
		const home = tmp();
		const target = tmp();
		const agent = path.join(home, "agent");
		process.env.PI_CODING_AGENT_DIR = agent;
		try {
			const source = writeSession(path.join(agent, "sessions", encodeCwdSegment(home)), "session.jsonl", home);
			const plan = planMove({ sessionFile: source, currentCwd: home, targetCwd: target });
			expect(plan.toCwd).toBe(path.resolve(target));
			expect(plan.to).toBe(path.join(agent, "sessions", encodeCwdSegment(target), "session.jsonl"));

			const newFile = applyMove(plan);
			expect(newFile).toBe(plan.to);
			expect(fs.existsSync(source)).toBe(false);

			const lines = fs.readFileSync(newFile, "utf-8").trim().split("\n");
			expect(lines).toHaveLength(2);
			const header = JSON.parse(lines[0] as string);
			expect(header.cwd).toBe(path.resolve(target));
			expect(header.type).toBe("session");
			// history is intact
			expect(JSON.parse(lines[1] as string).message.content[0].text).toBe("hello");
		} finally {
			delete process.env.PI_CODING_AGENT_DIR;
		}
	});

	test("a flat custom session dir moves by rewriting the header in place", () => {
		const home = tmp();
		const target = tmp();
		const custom = path.join(home, "custom-sessions");
		const source = writeSession(custom, "session.jsonl", home);
		const plan = planMove({ sessionFile: source, currentCwd: home, targetCwd: target, sessionDir: custom });
		expect(plan.to).toBe(path.join(custom, "session.jsonl"));
		expect(plan.inPlace).toBe(true);

		const newFile = applyMove(plan);
		expect(newFile).toBe(source);
		const lines = fs.readFileSync(newFile, "utf-8").trim().split("\n");
		expect(JSON.parse(lines[0] as string).cwd).toBe(path.resolve(target));
		// history survives the in-place rewrite
		expect(JSON.parse(lines[1] as string).message.content[0].text).toBe("hello");
	});

	test("a sessions-root custom dir still gets a per-cwd subdirectory", () => {
		const home = tmp();
		const target = tmp();
		const root = path.join(home, "sessions");
		const source = writeSession(root, "session.jsonl", home);
		const plan = planMove({ sessionFile: source, currentCwd: home, targetCwd: target, sessionDir: root });
		expect(plan.to).toBe(path.join(root, encodeCwdSegment(target), "session.jsonl"));
		expect(destinationDir(target, root)).toBe(path.join(root, encodeCwdSegment(target)));
	});
});

describe("helpers", () => {
	test("readLastMove takes the newest valid record", () => {
		const entries = [
			{ type: "custom", customType: "pi-session-cwd:move/v1", data: { version: 1, toCwd: "/a", toFile: "/a/f" } },
			{ type: "message", id: "x" },
			{
				type: "custom",
				customType: "pi-session-cwd:move/v1",
				data: { version: 1, toCwd: "/b", toFile: "/b/f", at: "2026-01-01T00:00:00Z" },
			},
			{ type: "custom", customType: "pi-session-cwd:move/v1", data: { version: 2, toCwd: "/ignored", toFile: "/x" } },
		];
		const record = readLastMove(entries);
		expect(record?.toCwd).toBe("/b");
		expect(record?.at).toBe("2026-01-01T00:00:00Z");
		expect(readLastMove([])).toBeUndefined();
	});

	test("shortenPath keeps a readable tail and abbreviates home", () => {
		const home = os.homedir();
		expect(shortenPath("/short")).toBe("/short");
		const long = `${home}/Code/a/very/deep/project/directory/that/keeps/going/and/going`;
		const short = shortenPath(long, 40);
		expect(short.length).toBeLessThanOrEqual(40);
		expect(short.startsWith("…")).toBe(true);
	});

	test("isDirectory is false for missing paths", () => {
		expect(isDirectory("/definitely/not/here-12345")).toBe(false);
		expect(isDirectory(tmp())).toBe(true);
	});
});
