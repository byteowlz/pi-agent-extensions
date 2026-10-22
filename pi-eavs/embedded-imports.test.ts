import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { builtinModules } from "node:module";
import { join } from "node:path";
import { test } from "node:test";

// Bundled Pi runtimes (Bun binary, Node SEA, bundled Node) resolve extension
// imports only from their embedded virtual modules, without filesystem
// fallback. Deployed extensions have no node_modules, so any other package
// specifier fails at first use, e.g. lazy API loading on the first request.
const EMBEDDED = new Set([
	"@earendil-works/pi-agent-core",
	"@earendil-works/pi-ai",
	"@earendil-works/pi-ai/compat",
	"@earendil-works/pi-ai/oauth",
	"@earendil-works/pi-ai/providers/all",
	"@earendil-works/pi-coding-agent",
	"@earendil-works/pi-tui",
]);

async function embeddedFromInstalledRuntime(): Promise<Set<string> | undefined> {
	const sdk = process.env.EAVS_TEST_INSTALLED_SDK;
	if (!sdk) return;
	const chunks = join(sdk, "..", "bundle", "chunks");
	const file = (await readdir(chunks)).find((name) => name.startsWith("virtual-modules-"));
	if (!file) return;
	const source = await readFile(join(chunks, file), "utf8");
	return new Set(source.match(/"@earendil-works\/[^"]+"/g)?.map((s) => s.slice(1, -1)));
}

test("runtime sources import only node builtins, local files and embedded Pi modules", async () => {
	const embedded = (await embeddedFromInstalledRuntime()) ?? EMBEDDED;
	const dir = import.meta.dirname;
	const sources = (await readdir(dir)).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
	assert.ok(sources.includes("provider.ts"));
	const offenders: string[] = [];
	for (const name of sources) {
		const source = await readFile(join(dir, name), "utf8");
		for (const [, spec] of source.matchAll(/(?:from\s+|import\(\s*)["']([^"']+)["']/g)) {
			const builtin = spec.startsWith("node:") || builtinModules.includes(spec);
			if (!builtin && !spec.startsWith("./") && !embedded.has(spec)) offenders.push(`${name}: ${spec}`);
		}
	}
	assert.deepEqual(offenders, []);
});
