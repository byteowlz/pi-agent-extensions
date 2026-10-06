import { describe, expect, test } from "bun:test";

import {
	InvalidIntervalError,
	MAX_INTERVAL_MS,
	MIN_INTERVAL_MS,
	WorkflowValidationError,
	createProposal,
	createReceipt,
	definitionDigest,
	parseInterval,
	publicSnapshot,
	reviewProposal,
	reviseProposal,
	revokeProposal,
	validateDefinition,
	validateReviewedProposal,
} from "./index.ts";

const NOW = "2026-10-06T10:00:00.000Z";
const ID = "wf-1";

function baseDefinition(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		name: "Daily Context Sweep",
		prompt: "Summarize yesterday's session and draft next steps.",
		intervalMs: 86_400_000,
		source: {
			sessionId: "session-abc",
			cwd: "/home/wismut/work",
			entryIds: ["e1", "e2", "e3"],
			context: "very long transcript...",
			contextComplete: true,
			droppedEntries: 2,
		},
		model: { provider: "anthropic", id: "claude-3-5-sonnet" },
		tools: ["read", "bash"],
		artifacts: [{ path: "out/summary.md", sha256: "a".repeat(64) }],
		allowSubagents: false,
		limits: { maxRuns: 10, maxDurationMs: 3_600_000, maxOutputBytes: 16_000 },
		...overrides,
	};
}

describe("parseInterval", () => {
	test("parses compact units", () => {
		expect(parseInterval("30m")).toBe(30 * 60_000);
		expect(parseInterval("2h")).toBe(2 * 3_600_000);
		expect(parseInterval("1d")).toBe(86_400_000);
		expect(parseInterval("4w")).toBe(4 * 604_800_000);
	});

	test("parses spelled-out human units", () => {
		expect(parseInterval("90 seconds")).toBe(90_000);
		expect(parseInterval("2 hours")).toBe(2 * 3_600_000);
		expect(parseInterval("1 week")).toBe(604_800_000);
		expect(parseInterval("1.5h")).toBe(5_400_000);
		expect(parseInterval("  30 min  ")).toBe(1_800_000);
	});

	test("enforces the 1-minute minimum", () => {
		expect(() => parseInterval("30s")).toThrow(InvalidIntervalError);
		expect(() => parseInterval("1s")).toThrow(InvalidIntervalError);
		expect(() => parseInterval("0m")).toThrow(InvalidIntervalError);
	});

	test("enforces the 365-day maximum", () => {
		expect(() => parseInterval("366d")).toThrow(InvalidIntervalError);
		expect(() => parseInterval("999999d")).toThrow(InvalidIntervalError);
	});

	test("rejects malformed and non-integer results", () => {
		expect(() => parseInterval("abc")).toThrow(InvalidIntervalError);
		expect(() => parseInterval("")).toThrow(InvalidIntervalError);
		expect(() => parseInterval("1m x")).toThrow(InvalidIntervalError);
		expect(() => parseInterval("m")).toThrow(InvalidIntervalError);
		expect(() => parseInterval("-2h")).toThrow(InvalidIntervalError);
		expect(() => parseInterval("32Torr")).toThrow(InvalidIntervalError);
		// 0.5s = 500ms, below min -> invalid
		expect(() => parseInterval("0.5s")).toThrow(InvalidIntervalError);
	});

	test("is bounded at the symbolic endpoints", () => {
		expect(parseInterval("1m")).toBe(MIN_INTERVAL_MS);
		expect(parseInterval("365d")).toBe(MAX_INTERVAL_MS);
	});
});

describe("validateDefinition", () => {
	test("accepts a valid definition and returns normalized value", () => {
		const result = validateDefinition(baseDefinition());
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.intervalMs).toBe(86_400_000);
			expect(result.value.allowSubagents).toBe(false);
			expect(result.value.source.entryIds).toEqual(["e1", "e2", "e3"]);
		}
	});

	test("accepts a definition omitting allowSubagents (defaults to false)", () => {
		const def = baseDefinition();
		(def as { allowSubagents?: boolean }).allowSubagents = undefined;
		const result = validateDefinition(def);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.allowSubagents).toBe(false);
		}
	});

	test.each([
		["null", null],
		["undefined", undefined],
		["array", []],
		["string", "hi"],
		["number", 42],
		["boolean", true],
		["empty object", {}],
	] as const)("rejects hostile non-object input: %s", (_name, input) => {
		const result = validateDefinition(input);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.length).toBeGreaterThan(0);
		}
	});

	test("rejects missing required fields", () => {
		const def = baseDefinition() as Record<string, unknown>;
		def.name = undefined;
		const result = validateDefinition(def);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.join(",")).toContain("name");
		}
	});

	test("rejects wrong types", () => {
		expect(validateDefinition(baseDefinition({ name: 123 })).ok).toBe(false);
		expect(validateDefinition(baseDefinition({ intervalMs: "1d" })).ok).toBe(false);
		expect(validateDefinition(baseDefinition({ prompt: [] })).ok).toBe(false);
		const source = baseDefinition().source as Record<string, unknown>;
		expect(validateDefinition(baseDefinition({ source: { ...source, entryIds: "nope" } })).ok).toBe(false);
		expect(validateDefinition(baseDefinition({ allowSubagents: "yes" })).ok).toBe(false);
	});

	test("rejects unsafe numbers", () => {
		expect(validateDefinition(baseDefinition({ intervalMs: Number.NaN })).ok).toBe(false);
		expect(validateDefinition(baseDefinition({ intervalMs: Number.POSITIVE_INFINITY })).ok).toBe(false);
		expect(validateDefinition(baseDefinition({ intervalMs: 1.5 })).ok).toBe(false);
		expect(validateDefinition(baseDefinition({ intervalMs: -100 })).ok).toBe(false);
		const badLimits = baseDefinition({ limits: { maxRuns: Number.NaN, maxDurationMs: 0, maxOutputBytes: -5 } });
		expect(validateDefinition(badLimits).ok).toBe(false);
	});

	test("rejects out-of-bounds interval and limits", () => {
		expect(validateDefinition(baseDefinition({ intervalMs: 30_000 })).ok).toBe(false);
		expect(validateDefinition(baseDefinition({ intervalMs: 999_999_999_999 })).ok).toBe(false);
		expect(validateDefinition(baseDefinition({ limits: { maxRuns: 0, maxDurationMs: 1, maxOutputBytes: 1 } })).ok).toBe(false);
	});

	test("rejects oversized strings and arrays", () => {
		expect(validateDefinition(baseDefinition({ name: "x".repeat(121) })).ok).toBe(false);
		expect(validateDefinition(baseDefinition({ prompt: "x".repeat(8_001) })).ok).toBe(false);
		expect(validateDefinition(baseDefinition({ tools: Array.from({ length: 65 }, (_, i) => `t${i}`) })).ok).toBe(false);
		expect(
			validateDefinition(
				baseDefinition({
					source: {
						...(baseDefinition().source as Record<string, unknown>),
						entryIds: Array.from({ length: 513 }, (_, i) => `e${i}`),
					},
				})
			).ok
		).toBe(false);
	});

	test("bounds prompt and context by UTF-8 bytes, counting multi-byte chars", () => {
		// 8000 ASCII chars = 8000 bytes (valid); 8001 bytes -> invalid.
		expect(validateDefinition(baseDefinition({ prompt: "x".repeat(8_000) })).ok).toBe(true);
		expect(validateDefinition(baseDefinition({ prompt: "x".repeat(8_001) })).ok).toBe(false);
		// Each '\u20ac' (euro) is 3 UTF-8 bytes. 2667 of them = 8001 bytes -> invalid.
		expect(validateDefinition(baseDefinition({ prompt: "\u20ac".repeat(2_667) })).ok).toBe(false);
		expect(validateDefinition(baseDefinition({ prompt: "\u20ac".repeat(2_666) })).ok).toBe(true);
		// context bound is 64_000 bytes.
		expect(
			validateDefinition(
				baseDefinition({ source: { ...(baseDefinition().source as Record<string, unknown>), context: "x".repeat(64_000) } })
			).ok
		).toBe(true);
		expect(
			validateDefinition(
				baseDefinition({ source: { ...(baseDefinition().source as Record<string, unknown>), context: "x".repeat(64_001) } })
			).ok
		).toBe(false);
	});

	test("enforces tightened limits bounds", () => {
		expect(
			validateDefinition(baseDefinition({ limits: { maxRuns: 1_001, maxDurationMs: 3_600_000, maxOutputBytes: 16_000 } })).ok
		).toBe(false);
		expect(
			validateDefinition(baseDefinition({ limits: { maxRuns: 10, maxDurationMs: 3_600_001, maxOutputBytes: 16_000 } })).ok
		).toBe(false);
		expect(
			validateDefinition(baseDefinition({ limits: { maxRuns: 10, maxDurationMs: 3_600_000, maxOutputBytes: 32_001 } })).ok
		).toBe(false);
		expect(
			validateDefinition(baseDefinition({ limits: { maxRuns: 1_000, maxDurationMs: 3_600_000, maxOutputBytes: 32_000 } })).ok
		).toBe(true);
	});

	test("rejects malformed artifact sha256", () => {
		expect(validateDefinition(baseDefinition({ artifacts: [{ path: "x", sha256: "not-hex" }] })).ok).toBe(false);
		expect(validateDefinition(baseDefinition({ artifacts: [{ path: "x", sha256: "a".repeat(63) }] })).ok).toBe(false);
	});

	test("strips unknown extra fields from the normalized value", () => {
		const def = baseDefinition({ extra: "junk", nested: { evil: true } });
		const result = validateDefinition(def);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect((result.value as unknown as Record<string, unknown>).extra).toBeUndefined();
			expect((result.value as unknown as Record<string, unknown>).nested).toBeUndefined();
		}
	});
});

describe("definitionDigest", () => {
	test("is canonical: same content, different key order -> same digest", async () => {
		const a = baseDefinition();
		const b = baseDefinition();
		// Reorder keys to test canonicalization.
		const reorder = (obj: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(obj).reverse());
		const bReordered = reorder({
			...b,
			source: reorder(b.source as Record<string, unknown>),
			model: reorder(b.model as Record<string, unknown>),
			limits: reorder(b.limits as Record<string, unknown>),
		});
		expect(await definitionDigest(a)).toBe(await definitionDigest(bReordered));
	});

	test("different content -> different digest", async () => {
		const a = baseDefinition();
		const b = baseDefinition({ name: "Different Name" });
		expect(await definitionDigest(a)).not.toBe(await definitionDigest(b));
	});

	test("omitting allowSubagents yields same digest as explicit false", async () => {
		const explicitFalse = baseDefinition({ allowSubagents: false });
		const omitted = baseDefinition();
		(omitted as { allowSubagents?: boolean }).allowSubagents = undefined;
		expect(await definitionDigest(explicitFalse)).toBe(await definitionDigest(omitted));
	});

	test("throws on invalid input", async () => {
		await expect(definitionDigest(null)).rejects.toThrow(WorkflowValidationError);
		await expect(definitionDigest({})).rejects.toThrow(WorkflowValidationError);
	});
});

describe("proposal lifecycle", () => {
	test("createProposal builds a draft at revision 1", async () => {
		const p = await createProposal(baseDefinition(), ID, NOW);
		expect(p.schemaVersion).toBe(1);
		expect(p.id).toBe(ID);
		expect(p.revision).toBe(1);
		expect(p.state).toBe("draft");
		expect(p.digest).toMatch(/^[0-9a-f]{64}$/);
		expect(p.createdAt).toBe(NOW);
		expect(p.review).toBeUndefined();
	});

	test("createProposal rejects invalid definitions", async () => {
		await expect(createProposal({}, ID, NOW)).rejects.toThrow(WorkflowValidationError);
		await expect(createProposal(baseDefinition(), "", NOW)).rejects.toThrow(WorkflowValidationError);
	});

	test("reviewProposal approves with matching digest", async () => {
		const p = await createProposal(baseDefinition(), ID, NOW);
		const approved = reviewProposal(p, "approved", NOW);
		expect(approved.state).toBe("approved");
		expect(approved.review?.decision).toBe("approved");
		expect(approved.review?.digest).toBe(approved.digest);
		expect(approved.review?.reviewedAt).toBe(NOW);
	});

	test("reviewProposal rejects invalid decision", async () => {
		const p = await createProposal(baseDefinition(), ID, NOW);
		expect(() => reviewProposal(p, "maybe" as never, NOW)).toThrow(WorkflowValidationError);
	});

	test("cannot re-review in the same revision", async () => {
		const p = await createProposal(baseDefinition(), ID, NOW);
		const approved = reviewProposal(p, "approved", NOW);
		expect(() => reviewProposal(approved, "rejected", NOW)).toThrow(WorkflowValidationError);
	});

	test("revokeProposal moves to revoked and clears review", async () => {
		const p = await createProposal(baseDefinition(), ID, NOW);
		const approved = reviewProposal(p, "approved", NOW);
		const revoked = revokeProposal(approved);
		expect(revoked.state).toBe("revoked");
		expect(revoked.review).toBeUndefined();
	});
});

describe("mutation / re-approval invalidation", () => {
	test("revise resets state to draft, increments revision, clears review", async () => {
		const p = await createProposal(baseDefinition(), ID, NOW);
		const approved = reviewProposal(p, "approved", NOW);
		expect(approved.review).toBeDefined();
		const revised = await reviseProposal(approved, baseDefinition({ name: "changed" }), NOW);
		expect(revised.revision).toBe(2);
		expect(revised.state).toBe("draft");
		expect(revised.review).toBeUndefined();
	});

	test("revising to the same content still invalidates the review", async () => {
		const p = await createProposal(baseDefinition(), ID, NOW);
		const approved = reviewProposal(p, "approved", NOW);
		const revised = await reviseProposal(approved, baseDefinition(), NOW);
		expect(revised.revision).toBe(2);
		expect(revised.state).toBe("draft");
		expect(revised.review).toBeUndefined();
		// Digest unchanged because definition content is identical.
		expect(revised.digest).toBe(approved.digest);
	});

	test("re-approval flows through revise -> review", async () => {
		const p = await createProposal(baseDefinition(), ID, NOW);
		const approved = reviewProposal(p, "approved", NOW);
		const revised = await reviseProposal(approved, baseDefinition({ name: "changed" }), NOW);
		const reApproved = reviewProposal(revised, "approved", NOW);
		expect(reApproved.revision).toBe(2);
		expect(reApproved.state).toBe("approved");
		expect(reApproved.review?.digest).toBe(reApproved.digest);
	});
});

describe("validateReviewedProposal / authority distinction", () => {
	test("accepts a currently approved, digest-matched proposal", async () => {
		const p = await createProposal(baseDefinition(), ID, NOW);
		const approved = reviewProposal(p, "approved", NOW);
		const result = await validateReviewedProposal(approved);
		expect(result.ok).toBe(true);
	});

	test("draft is not execution authority", async () => {
		const p = await createProposal(baseDefinition(), ID, NOW);
		const result = await validateReviewedProposal(p);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.join(",")).toContain("state");
		}
	});

	test("rejected review is NOT execution authority", async () => {
		const p = await createProposal(baseDefinition(), ID, NOW);
		const rejected = reviewProposal(p, "rejected", NOW);
		const result = await validateReviewedProposal(rejected);
		expect(result.ok).toBe(false);
	});

	test("a mutated definition (tampered) is not authority", async () => {
		const p = await createProposal(baseDefinition(), ID, NOW);
		const approved = reviewProposal(p, "approved", NOW);
		// Tamper with the definition content without going through revise. The
		// cached `digest`/`review.digest` are left unchanged, yet the recomputed
		// definition digest no longer matches -> mutation detected.
		const tampered = { ...approved, definition: { ...approved.definition, name: "HACKED" } };
		const result = await validateReviewedProposal(tampered);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.join(",")).toContain("does not match");
		}
	});

	test("detects definition mutation even when the cached digest is unchanged", async () => {
		const p = await createProposal(baseDefinition(), ID, NOW);
		const approved = reviewProposal(p, "approved", NOW);
		// Mutate a field that is NOT part of the envelope and leave both digests
		// (proposal.digest and review.digest) untouched.
		const mutated = {
			...approved,
			definition: { ...approved.definition, prompt: "mutated prompt" },
		};
		const result = await validateReviewedProposal(mutated);
		expect(result.ok).toBe(false);
	});

	test("validates the envelope before dereferencing nested fields", async () => {
		// A malformed proposal missing `definition` must return an error, not crash.
		const malformed = {
			schemaVersion: 1,
			id: "x",
			revision: 1,
			digest: "a".repeat(64),
			state: "approved",
			createdAt: NOW,
			// no `definition`
		};
		const result = await validateReviewedProposal(malformed);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.join(",")).toContain("definition");
		}
	});

	test("a malformed digest / state envelope is rejected before execution", async () => {
		const malformed = {
			schemaVersion: 1,
			id: "x",
			revision: 1,
			digest: "not-hex",
			state: "approved",
			createdAt: NOW,
			definition: baseDefinition(),
		};
		const result = await validateReviewedProposal(malformed);
		expect(result.ok).toBe(false);
	});

	test("a mismatched review digest (stale approval) is not authority", async () => {
		const p = await createProposal(baseDefinition(), ID, NOW);
		const approved = reviewProposal(p, "approved", NOW);
		const review = approved.review;
		// Simulate a review claiming a different digest.
		const stale = review ? { ...approved, review: { ...review, digest: "f".repeat(64) } } : approved;
		const result = await validateReviewedProposal(stale);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.join(",")).toContain("review digest");
		}
	});

	test("a proposal with no review is not authority", async () => {
		const p = await createProposal(baseDefinition(), ID, NOW);
		const result = await validateReviewedProposal(p);
		expect(result.ok).toBe(false);
	});
});

describe("publicSnapshot (bounded, omits source context)", () => {
	test("omits the full source context string", async () => {
		const longContext = `secret-${"s".repeat(50_000)}`;
		const source = baseDefinition().source as Record<string, unknown>;
		const p = await createProposal(baseDefinition({ source: { ...source, context: longContext } }), ID, NOW);
		const snap = publicSnapshot(p);
		expect(JSON.stringify(snap)).not.toContain("secret-sssss");
	});

	test("omits concrete entryIds and prompt but reports the count", async () => {
		const p = await createProposal(baseDefinition(), ID, NOW);
		const snap = publicSnapshot(p);
		expect(snap.definition.source.entries).toBe(3);
		expect(JSON.stringify(snap)).not.toContain('"e1"');
		expect(JSON.stringify(snap)).not.toContain("Summarize yesterday");
	});

	test("preserves opaque ids/hashes and reports counts, digest and byte sizes", async () => {
		const p = await createProposal(baseDefinition(), ID, NOW);
		const snap = publicSnapshot(p);
		expect(snap.digest).toBe(p.digest);
		expect(snap.id).toBe(ID);
		expect(snap.kind).toBe("workflow-snapshot");
		expect(snap.definition.source.sessionId).toBe("session-abc");
		expect(snap.definition.source.cwd).toBe("/home/wismut/work");
		expect(snap.definition.artifacts.items?.[0]?.sha256).toBe("a".repeat(64));
		expect(snap.counts.entryIds).toBe(3);
		expect(snap.counts.tools).toBe(2);
		expect(snap.counts.artifacts).toBe(1);
		expect(snap.counts.promptBytes).toBe(new TextEncoder().encode("Summarize yesterday's session and draft next steps.").length);
		expect(snap.counts.contextBytes).toBeGreaterThan(0);
		expect(snap.flags.omissions).toEqual({ fullContext: true, prompt: true, entryIds: true });
		expect(snap.flags.truncated).toBe(false);
	});

	test("caps the whole JSON at SNAPSHOT_MAX_JSON_BYTES and truncates nested lists", async () => {
		// 64 artifacts, each with a ~4KB path -> a full snapshot far exceeds the 16KB cap.
		const artifacts = Array.from({ length: 64 }, (_, i) => ({ path: "x".repeat(4_000) + i, sha256: "a".repeat(64) }));
		const p = await createProposal(baseDefinition({ artifacts }), ID, NOW);
		const snap = publicSnapshot(p);
		const serialized = new TextEncoder().encode(JSON.stringify(snap)).length;
		expect(serialized).toBeLessThanOrEqual(16_000);
		expect(snap.flags.truncated).toBe(true);
		expect(snap.definition.artifacts.count).toBe(64);
		// Opaque digest/hashes are preserved even when the items list is dropped.
		expect(snap.digest).toBe(p.digest);
		expect(snap.definition.artifacts.items).toBeUndefined();
	});

	test("does not truncate when the full snapshot already fits the cap", async () => {
		const p = await createProposal(baseDefinition(), ID, NOW);
		const snap = publicSnapshot(p);
		expect(snap.flags.truncated).toBe(false);
		expect(snap.definition.tools.names).toEqual(["read", "bash"]);
		expect(snap.definition.artifacts.items).toHaveLength(1);
	});
});

describe("receipts", () => {
	test("creates a receipt with explicit effect", async () => {
		const p = await createProposal(baseDefinition(), ID, NOW);
		const receipt = createReceipt(p, "no-effects");
		expect(receipt.schemaVersion).toBe(1);
		expect(receipt.kind).toBe("workflow-receipt");
		expect(receipt.proposalId).toBe(ID);
		expect(receipt.revision).toBe(1);
		expect(receipt.digest).toBe(p.digest);
		expect(receipt.effect).toBe("no-effects");
	});

	test("supports unsupported and possible-effects", () => {
		const p = {
			schemaVersion: 1 as const,
			id: "x",
			revision: 1,
			definition: {},
			digest: "d",
			state: "draft" as const,
			createdAt: NOW,
		};
		const unsupported = createReceipt(p as never, "unsupported");
		expect(unsupported.effect).toBe("unsupported");
		const possible = createReceipt(p as never, "possible-effects", "ran it");
		expect(possible.effect).toBe("possible-effects");
		expect(possible.note).toBe("ran it");
	});

	test("rejects unknown effect", () => {
		const p = {
			schemaVersion: 1 as const,
			id: "x",
			revision: 1,
			definition: {},
			digest: "d",
			state: "draft" as const,
			createdAt: NOW,
		};
		expect(() => createReceipt(p as never, "exploded" as never)).toThrow(WorkflowValidationError);
	});

	test("caps the receipt note at RECEIPT_NOTE_MAX_BYTES", () => {
		const p = {
			schemaVersion: 1 as const,
			id: "x",
			revision: 1,
			definition: {},
			digest: "d",
			state: "draft" as const,
			createdAt: NOW,
		};
		expect(() => createReceipt(p as never, "possible-effects", "x".repeat(1_601))).toThrow(WorkflowValidationError);
		expect(() => createReceipt(p as never, "possible-effects", "x".repeat(1_600))).not.toThrow();
	});
});
