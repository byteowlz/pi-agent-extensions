import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildCatalogDigest,
	deriveCatalogEntries,
	isPaneBusyError,
	loadCatalog,
	loadoutHasContent,
	normalizeLoadout,
	resolveLoadoutKinds,
	resolveLoadoutModelIds,
} from "./index";

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

describe("pi-herdr-tools preset loadouts", () => {
	test("normalizes a legacy pattern array to a models-only preset", () => {
		expect(normalizeLoadout(["rtx6000/deepseek"])).toEqual({ models: ["rtx6000/deepseek"] });
	});

	test("normalizes a preset object, carrying mode/max/kinds", () => {
		const def = normalizeLoadout({ models: ["a/*"], mode: "auto", max: 3, kinds: ["claude"] });
		expect(def.models).toEqual(["a/*"]);
		expect(def.mode).toBe("auto");
		expect(def.max).toBe(3);
		expect(def.kinds).toEqual(["claude"]);
	});

	test("loadoutHasContent is true when any field is present", () => {
		expect(loadoutHasContent(normalizeLoadout(["x/*"]))).toBe(true);
		expect(loadoutHasContent(normalizeLoadout({ models: [], kinds: ["claude"] }))).toBe(true);
		expect(loadoutHasContent(normalizeLoadout({ models: [] }))).toBe(false);
	});
});

describe("pi-herdr-tools catalog derive", () => {
	const catalog = {
		models: [
			{ id: "deepseek", provider: "rtx6000", tags: ["local"] },
			{ id: "kimi", provider: "az", tags: ["azure"] },
		],
	};
	const registry = [
		{ provider: "rtx6000", id: "deepseek", name: "DeepSeek" },
		{ provider: "rtx6000", id: "glm", name: "GLM" },
		{ provider: "fh", id: "deepseek", name: "Fraunhofer DeepSeek" },
		{ provider: "az", id: "kimi", name: "Kimi" },
		{ provider: "openai", id: "gpt-5", name: "GPT-5" },
	];

	test("derives stubs for scoped models missing from the catalog", () => {
		const r = deriveCatalogEntries(catalog, registry, ["rtx6000/*"], ["local"]);
		expect(r.added).toEqual([{ id: "glm", provider: "rtx6000", label: "GLM", tags: ["local"] }]);
		expect(r.existingCount).toBe(1);
		expect(r.unmatched).toEqual([]);
	});

	test("reports patterns that match nothing and keeps existing entries untouched", () => {
		const r = deriveCatalogEntries(catalog, registry, ["az/kimi", "ghost/*"], []);
		expect(r.added).toEqual([]);
		expect(r.existingCount).toBe(1);
		expect(r.unmatched).toEqual(["ghost/*"]);
	});

	test("exact-pattern scoping only derives what is allowed", () => {
		const r = deriveCatalogEntries(catalog, registry, ["fh/deepseek"], []);
		expect(r.added.map((m) => `${m.provider}/${m.id}`)).toEqual(["fh/deepseek"]);
		expect(r.added[0]?.tags).toEqual([]);
	});
});

describe("pi-herdr-tools pane-busy detection", () => {
	test("detects agent_pane_busy in the error message", () => {
		expect(isPaneBusyError(new Error('herdr failed: {"error":{"code":"agent_pane_busy"}}'))).toBe(true);
	});

	test("detects agent_pane_busy in stderr JSON", () => {
		const err = Object.assign(new Error("Command failed: herdr agent start"), {
			stderr:
				'{"id":"cli:agent:start","error":{"code":"agent_pane_busy","message":"agent target pane w21:p2 is not an available shell"}}',
		});
		expect(isPaneBusyError(err)).toBe(true);
	});

	test("does not match other herdr errors", () => {
		const notReady = Object.assign(new Error("failed"), {
			stderr: '{"error":{"code":"agent_not_ready","message":"agent blocked during startup"}}',
		});
		expect(isPaneBusyError(notReady)).toBe(false);
		expect(isPaneBusyError(new Error("network unreachable"))).toBe(false);
		expect(isPaneBusyError(undefined)).toBe(false);
	});
});

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
