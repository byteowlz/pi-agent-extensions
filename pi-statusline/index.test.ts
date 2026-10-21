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

describe("buildStatusSegments", () => {
	test("colors only the label by default", async () => {
		const { buildStatusSegments } = await import("./index.ts");
		const theme = { fg: (color: string, text: string) => `<${color}>${text}</>` };
		const segments = buildStatusSegments(
			[{ id: "s", statusKey: "sudo", label: "SUDO", color: "warning" }],
			new Map([["sudo", "4m32s"]]),
			false,
			theme
		);
		expect(segments).toEqual(["<warning>SUDO</> 4m32s"]);
	});

	test("colorValue opts the published value into the same color", async () => {
		const { buildStatusSegments } = await import("./index.ts");
		const theme = { fg: (color: string, text: string) => `<${color}>${text}</>` };
		const segments = buildStatusSegments(
			[{ id: "s", statusKey: "sudo", label: "SUDO", color: "error", colorValue: true }],
			new Map([["sudo", "20s"]]),
			false,
			theme
		);
		expect(segments).toEqual(["<error>SUDO</> <error>20s</>"]);
	});
});

describe("access indicator layout", () => {
	const theme = { fg: (_color: string, text: string) => text };
	const keys = ["other", "sudo-warn", "ssh-key", "sudo", "sudo-crit", "other-sudo"];
	const items = keys.map((statusKey) => ({ id: `custom-${statusKey}`, statusKey, label: statusKey }));

	test("routes by status key, preserving values and relative order without duplicates", async () => {
		const { buildStatusGroups } = await import("./index.ts");
		const statuses = new Map(keys.map((key) => [key, "4m32s"]));
		const groups = buildStatusGroups(items, statuses, false, theme);
		expect(groups.inline).toEqual(["sudo-warn 4m32s", "ssh-key 4m32s", "sudo 4m32s", "sudo-crit 4m32s"]);
		expect(groups.separate).toEqual(["other 4m32s", "other-sudo 4m32s"]);
	});

	test("Kompressor and Xlatch join inline in manifest order without duplicates", async () => {
		const { buildStatusGroups } = await import("./index.ts");
		const ordered = ["kompressor-rolling", "other", "xlatch", "ssh-key"].map((statusKey) => ({
			id: statusKey,
			statusKey,
			label: statusKey,
			color: "accent",
			colorValue: true,
		}));
		const colored = { fg: (color: string, text: string) => `<${color}>${text}</>` };
		const groups = buildStatusGroups(ordered, new Map(ordered.map((item) => [item.statusKey, "active"])), false, colored);
		expect(groups.inline).toEqual(
			["kompressor-rolling", "xlatch", "ssh-key"].map((key) => `<accent>${key}</> <accent>active</>`)
		);
		expect(groups.separate).toEqual(["<accent>other</> <accent>active</>"]);
		expect(buildStatusGroups(ordered, new Map(), false, colored)).toEqual({ inline: [], separate: [] });
	});

	test("missing and empty statuses respect showInactive in their own group", async () => {
		const { buildStatusGroups } = await import("./index.ts");
		const statuses = new Map([["ssh-key", ""]]);
		expect(buildStatusGroups(items, statuses, false, theme)).toEqual({ inline: [], separate: [] });
		expect(buildStatusGroups(items, statuses, true, theme).inline).toEqual(keys.slice(1, 5));
	});

	test("stats keep access immediately after context and fit narrow ANSI widths", async () => {
		const { alignLeftRight, buildStatusGroups } = await import("./index.ts");
		const { visibleWidth } = await import("@earendil-works/pi-tui");
		const groups = buildStatusGroups(items, new Map([["ssh-key", "\x1b[32mloaded 4m32s\x1b[0m"]]), false, theme);
		const left = `12.3%/200k ${groups.inline.join(" ")}`;
		expect(alignLeftRight(left, "model", 80)).toStartWith("12.3%/200k ssh-key ");
		for (const width of [1, 2, 3, 10, 25, 40, 80]) {
			expect(visibleWidth(alignLeftRight(left, "model", width))).toBeLessThanOrEqual(width);
		}
	});
});
