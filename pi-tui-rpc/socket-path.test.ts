import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { socketDirectory } from "./socket-path";

describe("socket directory", () => {
	const uid = process.getuid?.();
	const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), "tui-rpc-dir-"));

	test("Linux uses a private XDG runtime directory owned by this user", () => {
		const dir = scratch();
		fs.chmodSync(dir, 0o700);
		expect(socketDirectory({ XDG_RUNTIME_DIR: dir }, "linux", uid)).toBe(dir);
		fs.rmSync(dir, { recursive: true });
	});

	test("a shared, foreign, relative or missing runtime directory falls back to tmpdir", () => {
		const dir = scratch();
		fs.chmodSync(dir, 0o755);
		expect(socketDirectory({ XDG_RUNTIME_DIR: dir }, "linux", uid)).toBe(os.tmpdir());
		fs.chmodSync(dir, 0o700);
		expect(socketDirectory({ XDG_RUNTIME_DIR: dir }, "linux", (uid ?? 0) + 1)).toBe(os.tmpdir());
		expect(socketDirectory({ XDG_RUNTIME_DIR: "relative/dir" }, "linux", uid)).toBe(os.tmpdir());
		expect(socketDirectory({ XDG_RUNTIME_DIR: path.join(dir, "missing") }, "linux", uid)).toBe(os.tmpdir());
		expect(socketDirectory({}, "linux", uid)).toBe(os.tmpdir());
		fs.rmSync(dir, { recursive: true });
	});

	test("macOS keeps its private per-user tmpdir", () => {
		const dir = scratch();
		fs.chmodSync(dir, 0o700);
		expect(socketDirectory({ XDG_RUNTIME_DIR: dir }, "darwin", uid)).toBe(os.tmpdir());
		fs.rmSync(dir, { recursive: true });
	});
});
