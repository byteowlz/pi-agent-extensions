#!/usr/bin/env node
import { execFileSync } from "node:child_process";
/**
 * Verify the deployed extension layout without touching ~/.pi.
 *
 * The personal bridge (pi-tui-rpc) imports the host-neutral consumer package at
 * ../runtime-interactions plus `ajv`. Copying only the extension directory
 * breaks Pi at load time (Cannot find module '../runtime-interactions/wire.js'),
 * so this simulates the install and checks that every relative import, the ajv
 * runtime dependency and the pinned vendor hash resolve from the deployed tree.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AJV_DEPS = ["ajv", "fast-deep-equal", "fast-uri", "json-schema-traverse", "require-from-string"];

function walk(dir) {
	const out = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) {
			if (name === "node_modules") continue;
			out.push(...walk(full));
		} else if (name.endsWith(".ts")) out.push(full);
	}
	return out;
}

function check() {
	const root = mkdtempSync(join(tmpdir(), "pi-ext-layout-"));
	const dest = join(root, "extensions");
	mkdirSync(dest, { recursive: true });
	try {
		// Use the real installer so the verification cannot drift from it.
		cpSync(join(repo, "pi-tui-rpc"), join(dest, "pi-tui-rpc"), { recursive: true });
		execFileSync("bash", [join(repo, "scripts/install-runtime-interactions.sh"), repo, dest], { stdio: "pipe" });
		const pkgModules = join(dest, "runtime-interactions", "node_modules");
		for (const pkg of AJV_DEPS) {
			if (!existsSync(join(pkgModules, pkg))) throw new Error(`installer did not copy ${pkg}`);
		}

		const errors = [];
		for (const file of [...walk(join(dest, "pi-tui-rpc")), ...walk(join(dest, "runtime-interactions"))]) {
			// Tests are not deployed; vendored generated files are hash-checked and
			// intentionally use extensionless imports under the package.json shim.
			if (file.endsWith(".test.ts")) continue;
			if (file.includes(`${join("runtime-interactions", "protocol")}`)) continue;
			const source = readFileSync(file, "utf8");
			for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
				const specifier = match[1];
				if (!specifier.startsWith(".")) continue;
				const base = resolve(dirname(file), specifier);
				const candidates = specifier.endsWith(".js")
					? [base.replace(/\.js$/, ".ts")]
					: [base, `${base}.ts`, join(base, "index.ts")];
				if (!candidates.some((candidate) => existsSync(candidate))) errors.push(`${file.slice(dest.length + 1)} -> ${specifier}`);
			}
		}
		if (errors.length) throw new Error(`unresolved relative imports:\n  ${errors.join("\n  ")}`);

		const requireFromDeployed = createRequire(join(dest, "runtime-interactions", "mod.ts"));
		const ajvPath = realpathSync(requireFromDeployed.resolve("ajv"));
		if (!ajvPath.startsWith(realpathSync(pkgModules))) throw new Error(`ajv resolved outside the deployed package: ${ajvPath}`);

		const source = JSON.parse(
			readFileSync(join(dest, "runtime-interactions", "protocol", "runtime-interactions", "SOURCE.json"), "utf8")
		);
		const manifest = join(dest, "runtime-interactions", "protocol", "runtime-interactions", "v1", "manifest.json");
		const hash = createHash("sha256").update(readFileSync(manifest)).digest("hex");
		if (hash !== source.manifest_sha256) throw new Error(`manifest hash mismatch: ${hash} != ${source.manifest_sha256}`);

		// The deployed package must not carry test files.
		const stray = walk(join(dest, "runtime-interactions")).filter((file) => file.endsWith(".test.ts"));
		if (stray.length) throw new Error(`test files copied to deploy: ${stray.join(", ")}`);

		console.log("install layout OK: relative imports, ajv and pinned manifest resolve from the deployed tree");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

check();
