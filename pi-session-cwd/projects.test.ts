import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { renderPicker, visibleRows } from "./picker";
import {
	DEFAULT_CONFIG,
	type MoveConfig,
	discoverProjects,
	expandHome,
	loadConfig,
	nearest,
	normalizeConfig,
	resolveMoveQuery,
	scoreProject,
} from "./projects";

function tmp(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "pi-move-"));
}

function mk(root: string, ...names: string[]): string[] {
	const out: string[] = [];
	for (const name of names) {
		const dir = path.join(root, name);
		fs.mkdirSync(dir, { recursive: true });
		out.push(path.resolve(dir));
	}
	return out;
}

describe("config", () => {
	test("defaults list work and byteowlz roots", () => {
		expect(DEFAULT_CONFIG.roots).toEqual(["~/work", "~/byteowlz"]);
		expect(DEFAULT_CONFIG.depth).toBe(1);
	});

	test("malformed config never breaks the command", () => {
		expect(normalizeConfig(null).roots).toEqual(DEFAULT_CONFIG.roots);
		expect(normalizeConfig({ roots: [] }).roots).toEqual(DEFAULT_CONFIG.roots);
		expect(normalizeConfig({ roots: "nope" }).roots).toEqual(DEFAULT_CONFIG.roots);
		expect(normalizeConfig({ depth: 0 }).depth).toBe(1);
		expect(normalizeConfig({ depth: 99 }).depth).toBe(4);
		expect(normalizeConfig({ includeSessionDirs: false }).includeSessionDirs).toBe(false);
	});

	test("loadConfig prefers the project file over the global one", () => {
		const home = tmp();
		const cwd = path.join(home, "proj");
		fs.mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		fs.writeFileSync(path.join(cwd, ".pi", "session-cwd.json"), JSON.stringify({ roots: ["/from-project"], depth: 2 }));
		fs.mkdirSync(path.join(home, "agent"), { recursive: true });
		fs.writeFileSync(path.join(home, "agent", "session-cwd.json"), JSON.stringify({ roots: ["/from-global"] }));

		const project = loadConfig({ cwd, agentDir: path.join(home, "agent") });
		expect(project.roots).toEqual(["/from-project"]);
		expect(project.depth).toBe(2);

		const globalOnly = loadConfig({ cwd: path.join(home, "elsewhere"), agentDir: path.join(home, "agent") });
		expect(globalOnly.roots).toEqual(["/from-global"]);
	});

	test("expandHome handles ~ and ~/", () => {
		expect(expandHome("~")).toBe(os.homedir());
		expect(expandHome("~/x")).toBe(path.join(os.homedir(), "x"));
		expect(expandHome("/abs")).toBe("/abs");
	});
});

describe("discovery", () => {
	test("lists direct children, skipping hidden and build directories", () => {
		const root = tmp();
		mk(root, "alpha", "beta", "node_modules", ".git", "target");
		const projects = discoverProjects({ roots: [root], depth: 1, includeSessionDirs: false });
		expect(projects.map((p) => p.name).sort()).toEqual(["alpha", "beta"]);
		expect(projects.every((p) => p.root === path.resolve(root))).toBe(true);
	});

	test("depth 2 includes grandchildren", () => {
		const root = tmp();
		mk(root, "outer/inner");
		const shallow = discoverProjects({ roots: [root], depth: 1, includeSessionDirs: false });
		expect(shallow.map((p) => p.name)).toEqual(["outer"]);
		const deep = discoverProjects({ roots: [root], depth: 2, includeSessionDirs: false });
		expect(deep.map((p) => p.name).sort()).toEqual(["inner", "outer"]);
	});

	test("missing roots are ignored", () => {
		const projects = discoverProjects({
			roots: [path.join(tmp(), "nope")],
			depth: 1,
			includeSessionDirs: false,
		});
		expect(projects).toEqual([]);
	});
});

describe("fuzzy scoring and resolution", () => {
	const root = tmp();
	const [foxline, , other] = mk(root, "foxline", "foxhole", "unrelated");
	const projects = discoverProjects({ roots: [root], depth: 1, includeSessionDirs: false });

	test("exact, prefix, substring and subsequence all match", () => {
		expect(scoreProject("foxline", { name: "foxline", path: foxline as string, root })).toBe(1000);
		expect(scoreProject("fox", { name: "foxline", path: foxline as string, root })).toBeGreaterThan(800);
		expect(scoreProject("xli", { name: "foxline", path: foxline as string, root })).toBeGreaterThan(0);
		expect(scoreProject("fxl", { name: "foxline", path: foxline as string, root })).toBeGreaterThan(0);
		expect(scoreProject("zzz", { name: "foxline", path: foxline as string, root })).toBe(0);
	});

	test("an exact name is a unique match", () => {
		const resolved = resolveMoveQuery("foxline", projects);
		expect(resolved.kind).toBe("unique");
		if (resolved.kind === "unique") expect(resolved.match.path).toBe(foxline as string);
	});

	test("a shared prefix is ambiguous and asks", () => {
		const resolved = resolveMoveQuery("fox", projects);
		expect(resolved.kind).toBe("ambiguous");
		if (resolved.kind === "ambiguous") {
			expect(resolved.candidates.map((c) => c.name).sort()).toEqual(["foxhole", "foxline"]);
		}
	});

	test("a clear prefix still wins when the other names are far off", () => {
		const r = tmp();
		mk(r, "ocloud", "octopus", "zzz");
		const list = discoverProjects({ roots: [r], depth: 1, includeSessionDirs: false });
		expect(resolveMoveQuery("ocloud", list).kind).toBe("unique");
		expect(resolveMoveQuery("zzz", list).kind).toBe("unique");
	});

	test("nothing matching returns suggestions", () => {
		const resolved = resolveMoveQuery("foxlina", projects);
		expect(resolved.kind).toBe("none");
		if (resolved.kind === "none") expect(resolved.suggestions[0]?.name).toBe("foxline");
	});

	test("nearest tolerates a typo at the tail", () => {
		const suggestions = nearest("unrelatd", projects);
		expect(suggestions[0]?.name).toBe("unrelated");
		// A tail typo still subsequence-matches ("unrelatd" is a subsequence of
		// "unrelated"), so scoring is lenient by design; a real miss scores 0.
		expect(scoreProject("unrelatd", { name: "unrelated", path: other as string, root })).toBeGreaterThan(0);
		expect(scoreProject("qqqqq", { name: "unrelated", path: other as string, root })).toBe(0);
	});

	test("empty query matches everything (picker mode)", () => {
		expect(scoreProject("", { name: "anything", path: "/x", root: "/" })).toBe(1);
	});
});

describe("picker filtering and rendering", () => {
	const rows = [
		{ name: "foxline", path: "/w/foxline", root: "/w" },
		{ name: "foxhole", path: "/w/foxhole", root: "/w", note: "current" },
		{ name: "other", path: "/w/other", root: "/w" },
	];

	test("visibleRows filters and ranks by query", () => {
		expect(visibleRows(rows, "").length).toBe(3);
		// foxhole/foxline score identically (same length, same prefix), so the
		// tie is broken by path; the set is what matters.
		expect(
			visibleRows(rows, "fox")
				.map((r) => r.name)
				.sort()
		).toEqual(["foxhole", "foxline"]);
		expect(visibleRows(rows, "zzz")).toEqual([]);
	});

	test("renderPicker shows the title, query and matches, truncated to width", () => {
		const theme = { fg: (_color: string, text: string) => text };
		const lines = renderPicker(rows, "fox", 0, 40, { title: "Move this session to…" }, theme);
		const text = lines.join("\n");
		expect(text).toContain("Move this session to…");
		expect(text).toContain("foxline");
		expect(text).toContain("filter:");
		const esc = String.fromCharCode(27);
		const strip = (line: string): string =>
			line
				.split(`${esc}[`)
				.map((part, index) => (index === 0 ? part : part.replace(/^[0-9;]*m/, "")))
				.join("");
		expect(lines.every((line) => strip(line).length <= 40)).toBe(true);
	});

	test("an empty result set renders a helpful line instead of crashing", () => {
		const theme = { fg: (_color: string, text: string) => text };
		const lines = renderPicker(rows, "zzzz", 0, 40, { title: "t" }, theme);
		expect(lines.join("\n")).toContain("no project matches");
	});
});

describe("config shape used by /move", () => {
	test("a config with two roots discovers across both", () => {
		const a = tmp();
		const b = tmp();
		mk(a, "one");
		mk(b, "two");
		const config: MoveConfig = { roots: [a, b], depth: 1, includeSessionDirs: false };
		expect(
			discoverProjects(config)
				.map((p) => p.name)
				.sort()
		).toEqual(["one", "two"]);
	});
});
