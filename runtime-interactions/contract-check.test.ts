import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dir, "..");
const bundleSource = join(repo, "runtime-interactions", "protocol", "runtime-interactions", "v1");
const sourceSource = join(repo, "runtime-interactions", "protocol", "runtime-interactions", "SOURCE.json");

function copyBundle() {
	const root = mkdtempSync(join(tmpdir(), "contract-check-"));
	const v1 = join(root, "v1");
	cpSync(bundleSource, v1, { recursive: true });
	cpSync(sourceSource, join(root, "SOURCE.json"));
	return { root, v1, source: join(root, "SOURCE.json") };
}

function verify(v1: string, source: string) {
	return spawnSync(
		process.execPath,
		[join(repo, "scripts", "verify-runtime-interactions.ts"), "--bundle", v1, "--source", source, "--allow-local-only"],
		{ encoding: "utf8", timeout: 120_000 }
	);
}

test("a tampered vendored file fails the contract gate", () => {
	const { root, v1, source } = copyBundle();
	try {
		const target = join(v1, "RuntimeVersion.ts");
		writeFileSync(target, `${readFileSync(target, "utf8")}\n// tampered\n`);
		const result = verify(v1, source);
		expect(result.status).not.toBe(0);
		expect(`${result.stdout}${result.stderr}`).toContain("byte-identity mismatch");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("a stale pin fails the contract gate", () => {
	const { root, v1, source } = copyBundle();
	try {
		const pinned = JSON.parse(readFileSync(source, "utf8"));
		pinned.manifest_sha256 = "0".repeat(64);
		writeFileSync(source, JSON.stringify(pinned, null, "\t"));
		const result = verify(v1, source);
		expect(result.status).not.toBe(0);
		expect(`${result.stdout}${result.stderr}`).toContain("manifest SHA mismatch");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("the untampered bundle passes the local pin + corpus gate", () => {
	const { root, v1, source } = copyBundle();
	try {
		const result = verify(v1, source);
		expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
		expect(result.stdout).toContain("corpus");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("the package is the only TS consumer layer; pi-tui-rpc is a producer adapter", () => {
	const consumerNames = new Set([
		"wire.ts",
		"interaction-port.ts",
		"interaction-runtime.ts",
		"interaction-terminal.ts",
		"interaction-coverage.ts",
	]);
	const duplicates: string[] = [];
	const walk = (dir: string) => {
		for (const name of readdirSync(dir)) {
			if (name === "node_modules" || name === ".git" || name === "archive") continue;
			const full = join(dir, name);
			if (statSync(full).isDirectory()) walk(full);
			else if (consumerNames.has(name) && !full.startsWith(`${join(repo, "runtime-interactions")}/`)) duplicates.push(full);
		}
	};
	walk(repo);
	expect(duplicates).toEqual([]);

	const producer = readFileSync(join(repo, "pi-tui-rpc", "dispatch.ts"), "utf8");
	expect(producer).toContain("../runtime-interactions/interaction-runtime.js");
	const adapter = readFileSync(join(repo, "pi-tui-rpc", "interaction-adapter.ts"), "utf8");
	expect(adapter).toContain("../runtime-interactions/interaction-port.js");
});
