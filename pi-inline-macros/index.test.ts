import { describe, expect, test } from "bun:test";
import { applyArgs, splitLikePromptArgs } from "./index";

describe("splitLikePromptArgs", () => {
	test("splits plain whitespace args", () => {
		expect(splitLikePromptArgs("a b c")).toEqual(["a", "b", "c"]);
	});

	test("supports double/single quotes", () => {
		expect(splitLikePromptArgs("\"a b\" c 'd e'")).toEqual(["a b", "c", "d e"]);
	});

	test("supports escaping", () => {
		expect(splitLikePromptArgs("foo\\ bar baz")).toEqual(["foo bar", "baz"]);
	});
});

describe("applyArgs", () => {
	test("applies positional and all-args placeholders", () => {
		const args = splitLikePromptArgs('"HEAD~3 file.ts" fast');
		expect(applyArgs("target=$1 mode=$2 all=$@", args)).toBe("target=HEAD~3 file.ts mode=fast all=HEAD~3 file.ts fast");
	});
});

import { readFileSync } from "node:fs";

describe("multi-macro boundaries", () => {
	test("next macro is not consumed as previous macro args", () => {
		const src = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
		expect(src.includes("nextMacroStart")).toBe(true);
		expect(src.includes("rawArgSegment")).toBe(true);
	});
});
