import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseInteractionRequestFrame, validateRuntimeEvent, validateRuntimeResponse } from "./wire.js";

const ROOT = join(import.meta.dir, "protocol", "runtime-interactions");
const V1 = join(ROOT, "v1");

function sha256(file: string): string {
	return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function filesUnder(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) out.push(...filesUnder(full));
		else out.push(full);
	}
	return out;
}

test("the vendored bundle is complete, unchanged and pinned by SOURCE.json", () => {
	const source = JSON.parse(readFileSync(join(ROOT, "SOURCE.json"), "utf8")) as {
		core_commit: string;
		manifest_sha256: string;
		file_count: number;
		core_path: string;
	};
	expect(source.core_commit).toBe("b9fdfee929388dabfdb69cdcb822bfc8a08b6bf2");
	expect(source.manifest_sha256).toBe("1cc56745660ce8700b9864a458826abd41408eb4bde40da289f38e71c9a9f488");
	expect(source.core_path).toBe("backend/crates/oqto-protocol/contracts/runtime-interactions/v1");

	const files = filesUnder(V1);
	expect(files.length).toBe(57);
	expect(source.file_count).toBe(57);
	expect(sha256(join(V1, "manifest.json"))).toBe(source.manifest_sha256);
});

test("every manifest hash matches the vendored byte content", () => {
	const manifest = JSON.parse(readFileSync(join(V1, "manifest.json"), "utf8")) as {
		contract: string;
		version: number;
		normative: boolean;
		scope: string;
		files: Record<string, string>;
		inputs: Record<string, string>;
	};
	expect(manifest.contract).toBe("oqto.runtime-interactions");
	expect(manifest.version).toBe(1);
	expect(manifest.normative).toBe(true);
	expect(manifest.scope).toContain("DTO/codec conformance");

	const names = Object.keys(manifest.files);
	expect(names.length).toBe(56);
	for (const name of names) {
		expect({ name, hash: sha256(join(V1, name)) }).toEqual({ name, hash: manifest.files[name] });
	}
	expect(sha256(join(V1, "LICENSE"))).toBe(manifest.inputs.LICENSE);
	expect(readFileSync(join(V1, "LICENSE"), "utf8")).toStartWith("MIT License");
});

test("cross-codec fixtures and CLI/API obligations are present and contract-only", () => {
	const fixtures = JSON.parse(readFileSync(join(V1, "fixtures.json"), "utf8")) as {
		normative: boolean;
		requests: unknown[];
		responses: unknown[];
		events: unknown[];
		invalid: unknown[];
	};
	expect(fixtures.normative).toBe(true);
	expect(fixtures.requests.length).toBe(11);
	expect(fixtures.responses.length).toBe(11);
	expect(fixtures.events.length).toBe(4);
	expect(fixtures.invalid.length).toBe(20);

	const operations = JSON.parse(readFileSync(join(V1, "operations.json"), "utf8")) as Record<
		string,
		{ implementation: string; requiredAdapters: string[]; cliPath: string[] }
	>;
	const names = Object.keys(operations);
	expect(names.length).toBe(11);
	for (const name of names) {
		const operation = operations[name];
		expect({ name, implementation: operation.implementation }).toEqual({ name, implementation: "contract_only" });
		expect(operation.requiredAdapters).toEqual(["personal_tui", "managed_rpc", "cli_api"]);
		expect(operation.cliPath[0]).toBe("runtime");
	}
});

test("the actual wire boundary accepts every Core positive and rejects every Core negative", () => {
	const fixtures = JSON.parse(readFileSync(join(V1, "fixtures.json"), "utf8")) as {
		requests: Array<{ name: string; value: { requestId: string } }>;
		responses: Array<{ name: string; value: unknown }>;
		events: Array<{ name: string; value: unknown }>;
		invalid: Array<{ name: string; frame: "request" | "response" | "event"; value: unknown }>;
	};
	expect(fixtures.requests.length).toBe(11);
	expect(fixtures.responses.length).toBe(11);
	expect(fixtures.events.length).toBe(4);
	expect(fixtures.invalid.length).toBe(20);

	for (const row of fixtures.requests) {
		expect({ name: row.name, ...parseInteractionRequestFrame({ type: "interaction", request: row.value }) }).toMatchObject({
			name: row.name,
			ok: true,
		});
	}
	for (const row of fixtures.responses) {
		expect({ name: row.name, valid: validateRuntimeResponse(row.value) }).toEqual({ name: row.name, valid: true });
	}
	for (const row of fixtures.events) {
		expect({ name: row.name, valid: validateRuntimeEvent(row.value) }).toEqual({ name: row.name, valid: true });
	}

	const rejected: string[] = [];
	for (const row of fixtures.invalid) {
		const accepted =
			row.frame === "request"
				? parseInteractionRequestFrame({ type: "interaction", request: row.value }).ok
				: row.frame === "response"
					? validateRuntimeResponse(row.value)
					: validateRuntimeEvent(row.value);
		if (!accepted) rejected.push(row.name);
	}
	expect(rejected).toHaveLength(20);
	for (const name of ["forged_authority", "answer_cannot_change_model", "answer_cannot_write_policy"]) {
		expect(rejected).toContain(name);
	}
});

test("the type-resolution shim is outside v1 and generated files stay untouched", () => {
	const shim = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { type: string };
	expect(shim.type).toBe("commonjs");
	const generated = readFileSync(join(V1, "RuntimeRequest.ts"), "utf8");
	expect(generated).toStartWith("// This file was generated by");
});
