import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCatalogDigest, loadCatalog, resolveLoadoutKinds, resolveLoadoutModelIds } from "./index";

interface TestModel {
	id: string;
	provider: string;
	label?: string;
	dataResidency?: string;
	zdr?: boolean;
	costType?: string;
	spawnKind?: string;
	tags: string[];
}

function sampleCatalog(): { models: TestModel[]; loadouts: Record<string, { match?: string; tags: string[] }>; policy?: object } {
	return {
		policy: { defaultKind: "pi", defaultLoadout: "local" },
		models: [
			{
				id: "rtx/deepseek",
				provider: "rtx",
				label: "DeepSeek",
				dataResidency: "local",
				zdr: true,
				costType: "free",
				spawnKind: "pi",
				tags: ["local", "data-privacy", "free"],
			},
			{
				id: "fh/deepseek",
				provider: "fh",
				label: "Fraunhofer",
				dataResidency: "internal",
				zdr: true,
				costType: "free",
				spawnKind: "pi",
				tags: ["data-privacy", "internal", "free"],
			},
			{
				id: "az/kimi",
				provider: "az",
				label: "Kimi",
				dataResidency: "azure",
				zdr: true,
				costType: "per-token",
				spawnKind: "pi",
				tags: ["per-token", "azure", "data-privacy"],
			},
			{
				id: "or/kimi",
				provider: "or",
				label: "Kimi",
				dataResidency: "external",
				zdr: false,
				costType: "per-token",
				spawnKind: "pi",
				tags: ["per-token", "external", "non-zdr"],
			},
			{
				id: "zai/glm",
				provider: "zai",
				label: "GLM",
				dataResidency: "external",
				zdr: false,
				costType: "subscription",
				spawnKind: "pi",
				tags: ["fixed-cost", "subscription"],
			},
		],
		loadouts: {
			local: { match: "any", tags: ["local"] },
			"data-privacy": { match: "any", tags: ["data-privacy"] },
			"per-token-zdr": { match: "all", tags: ["per-token", "azure"] },
			"per-token-non-zdr": { match: "all", tags: ["per-token", "non-zdr"] },
		},
	};
}

function tmpdir2(): string {
	return mkdtempSync(join(tmpdir(), "herdr-cat-"));
}

describe("pi-herdr-tools loadout resolution", () => {
	test("local resolves to local models only", () => {
		const cat = sampleCatalog();
		expect(resolveLoadoutModelIds(cat as never, "local")).toEqual(["rtx/deepseek"]);
	});

	test("data-privacy resolves local + internal + azure", () => {
		const cat = sampleCatalog();
		expect(resolveLoadoutModelIds(cat as never, "data-privacy").sort()).toEqual(
			["az/kimi", "fh/deepseek", "rtx/deepseek"].sort()
		);
	});

	test("per-token-zdr (match all) selects azure per-token only", () => {
		const cat = sampleCatalog();
		expect(resolveLoadoutModelIds(cat as never, "per-token-zdr")).toEqual(["az/kimi"]);
	});

	test("per-token-non-zdr selects external per-token only", () => {
		const cat = sampleCatalog();
		expect(resolveLoadoutModelIds(cat as never, "per-token-non-zdr")).toEqual(["or/kimi"]);
	});

	test("unknown loadout returns empty", () => {
		expect(resolveLoadoutModelIds(sampleCatalog() as never, "nope")).toEqual([]);
	});

	test("resolveLoadoutKinds returns spawn kinds of the selected models", () => {
		const cat = sampleCatalog();
		expect(resolveLoadoutKinds(cat as never, "local")).toEqual(["pi"]);
	});
});

describe("pi-herdr-tools catalog digest", () => {
	test("digest mentions residency and loadouts", () => {
		const cat = sampleCatalog();
		const d = buildCatalogDigest(cat as never);
		expect(d).toContain("local:");
		expect(d).toContain("Loadouts:");
	});
});

describe("pi-herdr-tools catalog layering", () => {
	test("project override merges models and loadouts over the global catalog", () => {
		const root = tmpdir2();
		try {
			const globalPath = join(root, "global.json");
			writeFileSync(
				globalPath,
				JSON.stringify({
					policy: { defaultKind: "pi" },
					models: [
						{
							id: "rtx/deepseek",
							provider: "rtx",
							dataResidency: "local",
							zdr: true,
							costType: "free",
							spawnKind: "pi",
							tags: ["local", "data-privacy"],
						},
						{
							id: "rtx/x",
							provider: "rtx",
							dataResidency: "local",
							zdr: true,
							costType: "free",
							spawnKind: "pi",
							tags: ["local", "data-privacy"],
						},
					],
					loadouts: { local: { match: "any", tags: ["local"] } },
				})
			);

			const cwd = join(root, "proj");
			mkdirSync(join(cwd, ".pi"), { recursive: true });
			writeFileSync(
				join(cwd, ".pi", "model-catalog.json"),
				JSON.stringify({
					// override rtx/x by id -> subscription
					models: [
						{
							id: "rtx/x",
							provider: "rtx",
							dataResidency: "local",
							zdr: true,
							costType: "subscription",
							spawnKind: "pi",
							tags: ["local", "data-privacy"],
						},
					],
					loadouts: { "project-only": { match: "any", tags: ["local"] } },
				})
			);

			const cat = loadCatalog(cwd, globalPath);
			const ids = (cat.models ?? []).map((m) => m.id);
			expect(ids).toContain("rtx/deepseek");
			expect(ids).toContain("rtx/x");
			// model override by id applied
			const x = (cat.models ?? []).find((m) => m.id === "rtx/x");
			expect(x?.costType).toBe("subscription");
			// loadouts merged (global + project)
			expect(cat.loadouts?.local).toBeDefined();
			expect(cat.loadouts?.["project-only"]).toBeDefined();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("missing catalog yields an empty catalog", () => {
		const cat = loadCatalog(undefined, "/nonexistent/catalog.json");
		expect(cat.models ?? []).toEqual([]);
	});
});
