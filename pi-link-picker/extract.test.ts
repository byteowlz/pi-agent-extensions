import { expect, test } from "bun:test";
import { type GrabCategory, extractItems, previewItem } from "./extract.js";

const values = (messages: string[], category?: GrabCategory) =>
	extractItems(messages)
		.filter((item) => !category || item.category === category)
		.map((item) => item.value);

test("URLs are extracted, punctuation-trimmed and not double-reported as paths", () => {
	expect(values(["See https://example.com/a/b?x=1, and (https://pi.dev/docs)."], "url")).toEqual([
		"https://example.com/a/b?x=1",
		"https://pi.dev/docs",
	]);
	expect(values(["See https://example.com/a/b?x=1"], "path")).toEqual([]);
	// Balanced parentheses stay part of the URL.
	expect(values(["http://host/wiki/Foo_(bar)"], "url")).toEqual(["http://host/wiki/Foo_(bar)"]);
});

test("file paths are extracted only when they look like real paths", () => {
	expect(values(["open src/index.ts and ~/.pi/agent/models.json"], "path")).toEqual(["src/index.ts", "~/.pi/agent/models.json"]);
	// Bare prose slashes are not paths.
	expect(values(["either/or and he/she"], "path")).toEqual([]);
});

test("env assignments keep the value and flag secret-looking keys", () => {
	const items = extractItems(["export GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwx and export PORT=8080"]);
	const token = items.find((item) => item.value.startsWith("GITHUB_TOKEN="));
	expect(token?.value).toBe("GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwx");
	expect(token?.secret).toBe(true);
	expect(items.find((item) => item.value === "PORT=8080")?.secret).toBe(false);
	// Quoted values keep their content without the quotes.
	expect(values(['KEY="hello world"'], "env")).toEqual(["KEY=hello world"]);
	// Unquoted values drop trailing sentence punctuation and do not duplicate as tokens.
	const trailing = extractItems(["export API_KEY=sk-abcdefghijklmnopqrstuvwx,"]);
	expect(trailing.map((item) => item.value)).toEqual(["API_KEY=sk-abcdefghijklmnopqrstuvwx"]);
});

test("tokens, JWTs, bearer values and hashes are detected with correct secrecy", () => {
	const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
	const hex = "a".repeat(64);
	const items = extractItems([
		`jwt ${jwt} sk-abcdefghijklmnopqrstuvwx bearer Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345 hex ${hex}`,
	]);
	expect(items.find((item) => item.value === jwt)?.secret).toBe(true);
	expect(items.find((item) => item.value.startsWith("sk-"))?.secret).toBe(true);
	expect(items.find((item) => item.value === "abcdefghijklmnopqrstuvwxyz012345")?.secret).toBe(true);
	const hash = items.find((item) => item.value === hex);
	expect(hash?.category).toBe("secret");
	expect(hash?.secret).toBe(false);
});

test("ids, uuids, shas and network endpoints are categorised separately", () => {
	const uuid = "3f1fee7e-8932-4852-943a-0cbae64f96af";
	const items = extractItems([`piext-9ca8 ${uuid} commit 88b4c7b at 100.64.0.12:4782 and example.com:3033`]);
	expect(items.find((item) => item.value === "piext-9ca8")?.category).toBe("id");
	expect(items.find((item) => item.value === uuid)?.category).toBe("id");
	expect(items.find((item) => item.value === "88b4c7b")?.category).toBe("id");
	expect(items.find((item) => item.value === "100.64.0.12:4782")?.category).toBe("network");
	expect(items.find((item) => item.value === "example.com:3033")?.category).toBe("network");
});

test("results are deduplicated, ordered newest-first and deterministic", () => {
	const items = extractItems(["old https://a.dev", "new https://b.dev", "again https://a.dev"]);
	expect(items.filter((item) => item.category === "url").map((item) => item.value)).toEqual(["https://a.dev", "https://b.dev"]);
	expect(items.find((item) => item.value === "https://a.dev")?.turn).toBe(3);
	// Stable across repeated runs.
	expect(extractItems(["x", "y"])).toEqual(extractItems(["x", "y"]));
});

test("previews redact secrets unless revealed", () => {
	const [item] = extractItems(["sk-abcdefghijklmnopqrstuvwx"]);
	expect(item).toBeDefined();
	const secret = item as NonNullable<typeof item>;
	expect(previewItem(secret)).toBe("sk-a…uvwx");
	expect(previewItem(secret, true)).toBe("sk-abcdefghijklmnopqrstuvwx");
	const short = { category: "secret" as const, value: "sk-abc", secret: true, turn: 1 };
	expect(previewItem(short)).toBe("••••••");
});
