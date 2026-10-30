import { describe, expect, test } from "bun:test";

import { MAX_STATE_CHARS, type TurnDigest, deriveScope, extractText, localProjectHints, renderState, toolDetail } from "./digest";

function baseDigest(overrides: Partial<TurnDigest> = {}): TurnDigest {
	return {
		userText: "add a classifier extension",
		assistantText: "Added pi-turn-classify with tests.",
		tools: [],
		filesTouched: [],
		commands: [],
		cwd: "/home/wismut/byteowlz/pi-agent-extensions",
		gitRemotes: ["https://github.com/byteowlz/pi-agent-extensions.git"],
		...overrides,
	};
}

describe("extractText", () => {
	test("joins text blocks and ignores thinking/tool blocks", () => {
		expect(
			extractText([
				{ type: "text", text: "hello" },
				{ type: "thinking", thinking: "secret" },
				{ type: "text", text: " world" },
			])
		).toBe("hello\n world");
		expect(extractText("plain")).toBe("plain");
		expect(extractText(null)).toBe("");
		expect(extractText(undefined)).toBe("");
	});
});

describe("toolDetail", () => {
	test("picks the informative argument per tool", () => {
		expect(toolDetail("bash", { command: "bun test" })).toBe("bun test");
		expect(toolDetail("edit", { path: "src/a.ts", oldText: "x" })).toBe("src/a.ts");
		expect(toolDetail("read", { file: "/tmp/x" })).toBe("/tmp/x");
		expect(toolDetail("grep", { pattern: "TODO" })).toBe("TODO");
		expect(toolDetail("unknown_tool", { query: "find me" })).toBe("find me");
		expect(toolDetail("bash", {})).toBeUndefined();
		expect(toolDetail("bash", null)).toBeUndefined();
	});
});

describe("renderState", () => {
	test("keeps facts and compresses repeated tools", () => {
		const state = renderState(
			baseDigest({
				tools: [{ name: "bash" }, { name: "bash" }, { name: "bash" }, { name: "edit" }],
				filesTouched: ["src/index.ts"],
				commands: ["bun test"],
				sessionName: "Classifier work",
			})
		);
		expect(state.cwd).toBe("/home/wismut/byteowlz/pi-agent-extensions");
		expect(state.remotes).toEqual(["https://github.com/byteowlz/pi-agent-extensions.git"]);
		expect(state.session).toBe("Classifier work");
		expect(state.tools).toEqual(["bash×3", "edit"]);
		expect(state.files).toEqual(["src/index.ts"]);
		expect(state.commands).toEqual(["bun test"]);
	});

	test("omits empty sections entirely rather than sending nulls", () => {
		const state = renderState(baseDigest());
		expect("files" in state).toBe(false);
		expect("commands" in state).toBe(false);
		expect("tools" in state).toBe(false);
		expect("remotes" in state).toBe(true);
	});

	test("stays inside the d3-lite budget even for a huge turn", () => {
		const huge = "x".repeat(50_000);
		const state = renderState(
			baseDigest({
				userText: huge,
				assistantText: huge,
				filesTouched: Array.from({ length: 200 }, (_, index) => `/very/long/path/number/${index}/${"y".repeat(80)}.ts`),
				commands: Array.from({ length: 100 }, (_, index) => `command-${index} ${"z".repeat(200)}`),
				tools: Array.from({ length: 300 }, () => ({ name: "bash" })),
			})
		);
		const rendered = JSON.stringify(state);
		expect(rendered.length).toBeLessThanOrEqual(MAX_STATE_CHARS);
		expect(rendered).toContain("cwd");
	});

	test("marks errored turns and rounds duration", () => {
		const state = renderState(baseDigest({ errored: true, durationMs: 65_400 }));
		expect(state.errored).toBe(true);
		expect(state.seconds).toBe(65);
	});
});

describe("localProjectHints", () => {
	test("derives the cwd basename and remote repo names", () => {
		expect(localProjectHints(baseDigest())).toEqual(["pi-agent-extensions"]);
		expect(
			localProjectHints(
				baseDigest({
					cwd: "/tmp/work",
					gitRemotes: ["git@forgejo:wismut/eavs.git", "https://github.com/byteowlz/pi-agent-extensions.git"],
				})
			)
		).toEqual(["work", "eavs", "pi-agent-extensions"]);
	});

	test("handles a non-git directory", () => {
		expect(localProjectHints(baseDigest({ cwd: "/home/wismut/wiki", gitRemotes: [] }))).toEqual(["wiki"]);
	});
});

describe("derived scope", () => {
	const base = (overrides: Partial<TurnDigest> = {}): TurnDigest => ({
		userText: "x",
		assistantText: "y",
		tools: [],
		filesTouched: [],
		commands: [],
		cwd: "/proj/alpha",
		gitRemotes: [],
		...overrides,
	});

	test("paths inside the cwd are one repo", () => {
		expect(deriveScope(base({ filesTouched: ["src/a.ts", "src/b.ts"], gitRemotes: ["https://github.com/x/alpha.git"] }))).toBe(
			"single"
		);
		expect(deriveScope(base({ filesTouched: ["/proj/alpha/src/a.ts"] }))).toBe("single");
	});

	test("a path outside the cwd is another project", () => {
		expect(deriveScope(base({ filesTouched: ["/proj/beta/src/a.ts"] }))).toBe("multi");
		// the measured case: editing a shared tool while working in this repo
		expect(deriveScope(base({ filesTouched: ["/home/x/byteowlz/eavs/src/proxy.rs"] }))).toBe("multi");
	});

	test("scratch paths do not count as another project", () => {
		// real turn: /tmp/probe.mjs + a repo file is still one repo
		expect(deriveScope(base({ filesTouched: ["/tmp/probe4.mjs", "pi-auto-rename/index.ts"] }))).toBe("single");
		expect(deriveScope(base({ filesTouched: ["/var/folders/xy/T/out.txt"] }))).toBe("single");
	});

	test("no file edits falls back to whether a repo is involved", () => {
		expect(deriveScope(base({ gitRemotes: ["https://github.com/x/alpha.git"] }))).toBe("single");
		expect(deriveScope(base())).toBe("noncode");
	});
});
