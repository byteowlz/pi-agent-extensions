import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findProjectIcon, insideMultiplexer } from "./index";

const roots: string[] = [];

/** A temp git repo with the given files (paths relative to the repo root). */
function makeRepo(files: string[]): string {
	const root = mkdtempSync(join(tmpdir(), "statusline-icon-"));
	roots.push(root);
	mkdirSync(join(root, ".git"));
	for (const file of files) {
		mkdirSync(join(root, file, ".."), { recursive: true });
		writeFileSync(join(root, file), "x");
	}
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("findProjectIcon", () => {
	test("finds the repo-root icon from a nested cwd", () => {
		const root = makeRepo(["icon/icon_on_dark.svg", "src/deep/file.ts"]);
		expect(findProjectIcon(join(root, "src", "deep"), "on_dark")).toBe(join(root, "icon", "icon_on_dark.svg"));
	});

	test("prefers the PNG over the SVG", () => {
		const root = makeRepo(["icon/icon_on_dark.svg", "icon/icon_on_dark.png"]);
		expect(findProjectIcon(root, "on_dark")).toBe(join(root, "icon", "icon_on_dark.png"));
	});

	test("returns only the requested variant", () => {
		const root = makeRepo(["icon/icon_on_dark.png"]);
		expect(findProjectIcon(root, "on_light")).toBeUndefined();
	});

	test("the nearest icon wins inside a monorepo", () => {
		const root = makeRepo(["icon/icon_on_dark.png", "apps/mobile/icon/icon_on_dark.png"]);
		const app = join(root, "apps", "mobile");
		expect(findProjectIcon(join(app, "src"), "on_dark")).toBe(join(app, "icon", "icon_on_dark.png"));
	});

	test("does not look above the git root", () => {
		const outer = makeRepo(["icon/icon_on_dark.png"]);
		const inner = join(outer, "nested");
		mkdirSync(join(inner, ".git"), { recursive: true });
		expect(findProjectIcon(inner, "on_dark")).toBeUndefined();
	});

	test("ignores unrelated files in icon/", () => {
		const root = makeRepo(["icon/favicon.png", "logo/x_logo_white.svg"]);
		expect(findProjectIcon(root, "on_dark")).toBeUndefined();
	});
});

describe("insideMultiplexer", () => {
	test("herdr, tmux, zellij and screen count as multiplexers", () => {
		for (const key of ["HERDR_ENV", "TMUX", "ZELLIJ", "STY"]) {
			expect(insideMultiplexer({ [key]: "1" })).toBe(true);
		}
	});

	test("a bare terminal does not", () => {
		expect(insideMultiplexer({ TERM: "xterm-ghostty", TERM_PROGRAM: "ghostty" })).toBe(false);
	});
});
