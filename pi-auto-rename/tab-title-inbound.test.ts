import { expect, test } from "bun:test";
import { EchoSuppressor, inboundBaseName, normalizeInboundLabel } from "./tab-title-inbound.js";

test("incoming label is sanitized and bounded, empty labels rejected", () => {
	expect(normalizeInboundLabel("  Deploy\u0007  Fix  ")).toBe("Deploy Fix");
	expect(normalizeInboundLabel("")).toBeNull();
	expect(normalizeInboundLabel("   ")).toBeNull();
	expect(normalizeInboundLabel(undefined)).toBeNull();
	expect(normalizeInboundLabel("x".repeat(400))?.length).toBe(200);
});

test("incoming label replaces the base but never drops or spoofs the readable id", () => {
	expect(inboundBaseName("Renamed Tab", "mini-okay-soda")).toBe("Renamed Tab");
	// Host label carrying our own canonical id: strip it, canonical is re-appended later.
	expect(inboundBaseName("Renamed Tab [mini-okay-soda]", "mini-okay-soda")).toBe("Renamed Tab");
	// Host label carrying a *different* readable-id-shaped suffix: strip it (anti-spoof).
	expect(inboundBaseName("Renamed Tab [evil-cat-dog]", "mini-okay-soda")).toBe("Renamed Tab");
	// Meaningful brackets are preserved.
	expect(inboundBaseName("Review [draft] notes", "mini-okay-soda")).toBe("Review [draft] notes");
	expect(inboundBaseName("   ", "mini-okay-soda")).toBeNull();
	// No readable id configured: still strip id-shaped suffixes to avoid injection.
	expect(inboundBaseName("Tab [evil-cat-dog]", undefined)).toBe("Tab");
});

test("echo suppression ignores recently pushed titles and expires", async () => {
	const suppressor = new EchoSuppressor(40);
	suppressor.note("Pushed Title");
	expect(suppressor.matches("Pushed Title")).toBe(true);
	expect(suppressor.matches("Something Else")).toBe(false);
	await new Promise((resolve) => setTimeout(resolve, 70));
	expect(suppressor.matches("Pushed Title")).toBe(false);
});
