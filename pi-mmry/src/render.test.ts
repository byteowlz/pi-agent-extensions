import { describe, expect, test } from "bun:test";
import { type Style, renderCall, renderResult } from "./render.ts";

const plain: Style = { fg: (_color, text) => text, bold: (text) => text };

const entry = {
	scope: "repo",
	repo: "mmry--3850016627bf",
	memory_id: "mem_b62502e3-fda1-4bb0-b2ee-89f19e609217",
	content: "pi-mmry tool test: the codeword is egret-8",
	revision: 2,
	contested: false,
	why: "verifies the tool",
	expires_at: "2026-10-01T13:51:40.484936599Z",
	agent_ctx: { harness: "pi" },
};

describe("memory tool rendering", () => {
	test("calls", () => {
		expect(renderCall({ action: "search", query: "egret" }, plain)).toBe('memory search "egret"');
		expect(renderCall({ action: "create", content: "use vpn", scope: "general" }, plain)).toBe("memory create general use vpn");
		expect(renderCall({ action: "supersede", id: entry.memory_id, expected_revision: 1 }, plain)).toBe(
			"memory supersede mem_b62502e3 r1"
		);
	});

	test("an edited entry", () => {
		expect(renderResult("supersede", JSON.stringify(entry), plain, false)).toBe(
			[
				"✓ updated",
				"[repo mmry] mem_b62502e3 r2",
				"  pi-mmry tool test: the codeword is egret-8",
				"  why: verifies the tool · expires 2026-10-01 13:51 UTC",
			].join("\n")
		);
	});

	test("search results collapse to five", () => {
		const hits = Array.from({ length: 7 }, (_, i) => ({ ...entry, why: null, expires_at: null, content: `fact ${i}` }));
		const rendered = renderResult("search", JSON.stringify(hits), plain, false) ?? "";
		expect(rendered.split("\n")[0]).toBe("7 memories");
		expect(rendered).toContain("fact 4");
		expect(rendered).not.toContain("fact 5");
		expect(rendered.endsWith("… 2 more (ctrl+o to expand)")).toBe(true);
		expect(renderResult("search", JSON.stringify(hits), plain, true)).toContain("fact 6");
		expect(renderResult("search", "[]", plain, false)).toBe("no matching memories");
	});

	test("general scope, contested, and non-JSON fall back", () => {
		const general = { ...entry, scope: "general", repo: null, contested: true, why: null, expires_at: null };
		expect(renderResult("create", JSON.stringify(general), plain, false)).toBe(
			["✓ created", "[general] mem_b62502e3 r2 CONTESTED", "  pi-mmry tool test: the codeword is egret-8"].join("\n")
		);
		expect(renderResult("search", "not json", plain, false)).toBeUndefined();
	});
});
