#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
/**
 * Automatic contract-adherence gate for the vendored runtime interaction bundle.
 *
 * 1. SOURCE.json pin: full Core commit, manifest SHA-256, file/input counts.
 * 2. Byte identity: every manifest file hash (and the LICENSE input) must match;
 *    no missing or extra files.
 * 3. Full shared corpus through the real boundary: 11 requests / 11 responses /
 *    4 events / 20 invalid; 11 source pairs / 28 frames / 12 invalid / 9
 *    schema-valid correlation mismatches.
 * 4. Core's reusable consumer verifier when a Core checkout is available
 *    (OQTO_CORE_DIR or sibling ../oqto), invoked with the pinned commit.
 *
 * Exits non-zero on any failure. `--allow-local-only` is an explicit escape hatch
 * for machines without a Core checkout; it is never the default.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { matchesSourceRequest, parseSourceFrame } from "../pi-tui-rpc/interaction-source.js";
import {
	parseInteractionRequestFrame,
	validateRuntimeEvent,
	validateRuntimeRequest,
	validateRuntimeResponse,
	validateSourceFrame,
	validateSourceResponse,
} from "../runtime-interactions/mod.js";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function args(argv: string[]) {
	const opts = {
		bundle: join(repo, "runtime-interactions", "protocol", "runtime-interactions", "v1"),
		source: join(repo, "runtime-interactions", "protocol", "runtime-interactions", "SOURCE.json"),
		coreDir: process.env.OQTO_CORE_DIR ?? join(repo, "..", "oqto"),
		allowLocalOnly: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--bundle") opts.bundle = resolve(argv[++i]);
		else if (arg === "--source") opts.source = resolve(argv[++i]);
		else if (arg === "--core-dir") opts.coreDir = resolve(argv[++i]);
		else if (arg === "--allow-local-only") opts.allowLocalOnly = true;
		else if (arg === "--help") {
			console.log(
				"usage: bun scripts/verify-runtime-interactions.ts [--bundle DIR] [--source FILE] [--core-dir DIR] [--allow-local-only]"
			);
			process.exit(0);
		}
	}
	return opts;
}

function sha256(file: string): string {
	return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function filesUnder(root: string, dir = root): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) out.push(...filesUnder(root, full));
		else out.push(relative(root, full));
	}
	return out;
}

function fail(message: string): never {
	console.error(`FAIL: ${message}`);
	process.exit(1);
}

function pass(message: string): void {
	console.log(`PASS: ${message}`);
}

function checkPin(opts: ReturnType<typeof args>) {
	const source = JSON.parse(readFileSync(opts.source, "utf8")) as {
		core_commit?: string;
		manifest_sha256?: string;
		file_count?: number;
		input_count?: number;
	};
	if (!/^[a-f0-9]{40}$/.test(source.core_commit ?? "")) fail("SOURCE.json core_commit is not a full 40-hex commit");
	if (!/^[a-f0-9]{64}$/.test(source.manifest_sha256 ?? "")) fail("SOURCE.json manifest_sha256 is missing or malformed");
	const manifestFile = join(opts.bundle, "manifest.json");
	const manifestHash = sha256(manifestFile);
	if (manifestHash !== source.manifest_sha256) fail(`manifest SHA mismatch: ${manifestHash} != ${source.manifest_sha256}`);
	const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as {
		contract: string;
		version: number;
		normative: boolean;
		files: Record<string, string>;
		inputs: Record<string, string>;
	};
	if (manifest.contract !== "oqto.runtime-interactions" || manifest.version !== 1 || manifest.normative !== true)
		fail(`unexpected manifest identity/version: ${manifest.contract} v${manifest.version}`);
	const entries = filesUnder(opts.bundle).sort();
	const expected = [...Object.keys(manifest.files), "manifest.json"].sort();
	if (JSON.stringify(entries) !== JSON.stringify(expected)) fail("bundle has missing or extra files");
	for (const [name, hash] of Object.entries(manifest.files)) {
		const actual = sha256(join(opts.bundle, name));
		if (actual !== hash) fail(`byte-identity mismatch for ${name}: ${actual} != ${hash}`);
	}
	if (source.file_count !== undefined && source.file_count !== entries.length)
		fail(`SOURCE.json file_count ${source.file_count} != actual ${entries.length}`);
	if (source.input_count !== undefined && source.input_count !== Object.keys(manifest.inputs).length)
		fail(`SOURCE.json input_count ${source.input_count} != manifest ${Object.keys(manifest.inputs).length}`);
	const license = manifest.inputs.LICENSE;
	if (license && sha256(join(opts.bundle, "LICENSE")) !== license) fail("LICENSE does not match the manifest input hash");
	pass(
		`pin ${source.core_commit} + manifest ${source.manifest_sha256} + ${entries.length} files / ${Object.keys(manifest.inputs).length} inputs`
	);
}

function checkCorpus(opts: ReturnType<typeof args>) {
	const fixtures = JSON.parse(readFileSync(join(opts.bundle, "fixtures.json"), "utf8"));
	const source = JSON.parse(readFileSync(join(opts.bundle, "source-fixtures.json"), "utf8"));
	const errors: string[] = [];
	for (const row of fixtures.requests ?? []) {
		if (!validateRuntimeRequest(row.value)) errors.push(`request fixture not schema-valid: ${row.name}`);
		if (!parseInteractionRequestFrame({ type: "interaction", request: row.value }).ok)
			errors.push(`request fixture rejected at boundary: ${row.name}`);
	}
	for (const row of fixtures.responses ?? []) {
		if (!validateRuntimeResponse(row.value)) errors.push(`response fixture not schema-valid: ${row.name}`);
	}
	for (const row of fixtures.events ?? []) {
		if (!validateRuntimeEvent(row.value)) errors.push(`event fixture not schema-valid: ${row.name}`);
	}
	for (const row of fixtures.invalid ?? []) {
		const accepted =
			row.frame === "request"
				? parseInteractionRequestFrame({ type: "interaction", request: row.value }).ok
				: row.frame === "response"
					? validateRuntimeResponse(row.value)
					: validateRuntimeEvent(row.value);
		if (accepted) errors.push(`invalid fixture accepted: ${row.name}`);
	}
	for (const pair of source.pairs ?? []) {
		if (!validateSourceFrame({ type: "interaction_source", request: pair.request }))
			errors.push(`source pair request invalid: ${pair.name}`);
		if (!validateSourceResponse(pair.response)) errors.push(`source pair response invalid: ${pair.name}`);
		if (!matchesSourceRequest(pair.response, pair.request)) errors.push(`source pair mismatch: ${pair.name}`);
	}
	for (const row of source.frames ?? []) {
		if (!validateSourceFrame(row.value)) errors.push(`source frame invalid: ${row.name}`);
	}
	for (const row of source.invalid ?? []) {
		if (parseSourceFrame(row.value).ok) errors.push(`source invalid accepted: ${row.name}`);
	}
	for (const row of source.mismatches ?? []) {
		if (!validateSourceResponse(row.response)) errors.push(`source mismatch response invalid: ${row.name}`);
		if (matchesSourceRequest(row.response, row.request)) errors.push(`source mismatch accepted: ${row.name}`);
	}
	const counts = {
		request: fixtures.requests?.length ?? 0,
		response: fixtures.responses?.length ?? 0,
		event: fixtures.events?.length ?? 0,
		invalid: fixtures.invalid?.length ?? 0,
		source_pairs: source.pairs?.length ?? 0,
		source_frames: source.frames?.length ?? 0,
		source_invalid: source.invalid?.length ?? 0,
		source_mismatches: source.mismatches?.length ?? 0,
	};
	const expectedCounts = {
		request: 11,
		response: 11,
		event: 4,
		invalid: 20,
		source_pairs: 11,
		source_frames: 28,
		source_invalid: 12,
		source_mismatches: 9,
	};
	for (const [key, expected] of Object.entries(expectedCounts)) {
		if ((counts as Record<string, number>)[key] !== expected)
			errors.push(`corpus count ${key}=${(counts as Record<string, number>)[key]} != ${expected}`);
	}
	if (errors.length) {
		for (const error of errors) console.error(`FAIL: ${error}`);
		process.exit(1);
	}
	pass(`corpus ${JSON.stringify(counts)}`);
}

function checkCoreVerifier(opts: ReturnType<typeof args>, sourceCommit: string) {
	const script = join(opts.coreDir, "scripts", "lint", "runtime_interactions_contract.py");
	if (!existsSync(script)) {
		if (opts.allowLocalOnly) {
			console.log(`SKIP: Core consumer verifier not found under ${opts.coreDir} (--allow-local-only)`);
			return;
		}
		fail(
			`Core consumer verifier not found at ${script}. Set OQTO_CORE_DIR or pass --core-dir; use --allow-local-only only for machines without a Core checkout.`
		);
	}
	const result = spawnSync(
		"uv",
		[
			"run",
			"--no-project",
			"--with",
			"jsonschema==4.26.0",
			"python",
			"-B",
			script,
			"--bundle",
			opts.bundle,
			"--source-ref",
			sourceCommit,
		],
		{ cwd: opts.coreDir, encoding: "utf8", timeout: 300_000 }
	);
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	if (result.status !== 0)
		fail(`Core consumer verifier failed (status ${result.status}${result.error ? `: ${result.error.message}` : ""})`);
	pass("Core consumer verifier");
}

const opts = args(process.argv.slice(2));
const source = JSON.parse(readFileSync(opts.source, "utf8")) as { core_commit: string };
checkPin(opts);
checkCorpus(opts);
checkCoreVerifier(opts, source.core_commit);
console.log("runtime interaction contract: ALL CHECKS PASSED");
