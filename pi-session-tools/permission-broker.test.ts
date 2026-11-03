import { expect, test } from "bun:test";
import {
	DEFAULT_OPTIONS,
	type PermissionPolicy,
	type PermissionRequest,
	type PermissionResponse,
	type SpawnSubject,
	decidePermission,
	decisionKey,
	evaluatePolicy,
	issuePermissionRequest,
} from "./permission-broker.js";

const NOW = 1_700_000_000_000;

function policy(over: Partial<PermissionPolicy> = {}): PermissionPolicy {
	return {
		allowMode: "confirm",
		autoDecision: "deny",
		allowedModels: ["local/*"],
		allowedKinds: ["pi"],
		maxSubagents: 3,
		activeSubagents: 0,
		confirmTimeoutMs: 60_000,
		...over,
	};
}

function subject(over: Partial<SpawnSubject> = {}): SpawnSubject {
	return { capability: "subagent.spawn", kind: "pi", model: "local/m1", effects: "possible", ...over };
}

function issued(over: { source?: "tui" | "rpc" | "adapter"; ttlMs?: number; policy?: PermissionPolicy } = {}): PermissionRequest {
	const result = issuePermissionRequest(
		{
			sessionId: "session-a",
			controllerId: "controller-1",
			source: over.source ?? "adapter",
			subject: subject(),
			ttlMs: over.ttlMs ?? 30_000,
		},
		over.policy ?? policy(),
		{ now: NOW, requestId: "req-1" }
	);
	if (!result.ok || result.kind !== "request") throw new Error(`expected request, got ${JSON.stringify(result)}`);
	return result.request;
}

function respond(over: Partial<PermissionResponse> = {}): PermissionResponse {
	return { requestId: "req-1", controllerId: "controller-1", revision: 0, decision: "allow", optionId: "allow", ...over };
}

test("local auto policy authorizes without a request, unchanged", () => {
	const auto = policy({ allowMode: "auto" });
	expect(evaluatePolicy(auto, subject())).toEqual({ outcome: "auto_allow", reason: "local_policy_auto" });
	const result = issuePermissionRequest(
		{ sessionId: "session-a", controllerId: "controller-1", source: "rpc", subject: subject(), ttlMs: 5000 },
		auto,
		{ now: NOW }
	);
	expect(result).toEqual({ ok: true, kind: "authorized", authorizedBy: "local_policy" });
});

test("policy denial happens before any request exists", () => {
	const cases: [Partial<PermissionPolicy>, SpawnSubject][] = [
		[{ allowedKinds: ["claude"] }, subject({ kind: "codex" })],
		[{ allowedModels: ["rtx6000/*"] }, subject()],
		[{ maxSubagents: 2, activeSubagents: 2 }, subject()],
	];
	for (const [over, subj] of cases) {
		const result = issuePermissionRequest(
			{ sessionId: "session-a", controllerId: "controller-1", source: "adapter", subject: subj, ttlMs: 5000 },
			policy(over),
			{ now: NOW }
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("policy_denied");
	}
});

test("remote sources must state an explicit expiry, bounded by the local wait budget", () => {
	const missing = issuePermissionRequest(
		{ sessionId: "session-a", controllerId: "controller-1", source: "adapter", subject: subject() },
		policy(),
		{ now: NOW }
	);
	expect(missing).toMatchObject({ ok: false, reason: "expiry_required" });

	const capped = issued({ ttlMs: 10 * 60_000 });
	expect(capped.expiresAt - capped.createdAt).toBe(60_000);

	const unbounded = issued({ ttlMs: 45_000, policy: policy({ confirmTimeoutMs: 0 }) });
	expect(unbounded.expiresAt - unbounded.createdAt).toBe(45_000);

	const absurd = issued({ ttlMs: 10 * 60 * 60_000, policy: policy({ confirmTimeoutMs: 0 }) });
	expect(absurd.expiresAt - absurd.createdAt).toBe(3_600_000);
});

test("expiry always denies, never the timeout-mode auto decision", () => {
	const request = issued({ policy: policy({ allowMode: "timeout", autoDecision: "allow" }) });
	const decision = decidePermission(request, respond(), {
		sessionId: "session-a",
		controllerId: "controller-1",
		policy: policy({ allowMode: "timeout", autoDecision: "allow" }),
		now: request.expiresAt,
	});
	expect(decision).toMatchObject({ decision: "deny", reason: "expired" });
});

test("identifiers, revision, controller and session are all bound", () => {
	const request = issued();
	const cases: [PermissionResponse, { sessionId: string; controllerId: string }, string][] = [
		[respond({ requestId: "req-2" }), { sessionId: "session-a", controllerId: "controller-1" }, "unknown_request"],
		[respond(), { sessionId: "session-b", controllerId: "controller-1" }, "session_mismatch"],
		[respond({ controllerId: "controller-2" }), { sessionId: "session-a", controllerId: "controller-2" }, "stale_controller"],
		[respond(), { sessionId: "session-a", controllerId: "controller-2" }, "stale_controller"],
		[respond({ revision: 1 }), { sessionId: "session-a", controllerId: "controller-1" }, "stale_revision"],
	];
	for (const [response, context, reason] of cases) {
		const decision = decidePermission(request, response, { ...context, policy: policy(), now: NOW + 1 });
		expect(decision).toMatchObject({ decision: "deny", reason });
	}
	expect(decisionKey(request)).toBe("req-1:0");
});

test("only an explicit allow option allows; cancel, silence and unknown options deny", () => {
	const request = issued();
	const base = { sessionId: "session-a", controllerId: "controller-1", policy: policy(), now: NOW + 1 };
	expect(decidePermission(request, respond(), base)).toMatchObject({ decision: "allow", reason: "explicit_allow" });
	expect(decidePermission(request, respond({ decision: "deny", optionId: "deny" }), base)).toMatchObject({
		decision: "deny",
		reason: "explicit_deny",
	});
	expect(decidePermission(request, respond({ cancelled: true }), base)).toMatchObject({ decision: "deny", reason: "cancelled" });
	expect(decidePermission(request, respond({ decision: undefined }), base)).toMatchObject({
		decision: "deny",
		reason: "invalid_response",
	});
	expect(decidePermission(request, respond({ optionId: "approve-everything" }), base)).toMatchObject({
		decision: "deny",
		reason: "unknown_option",
	});
	expect(decidePermission(request, respond({ optionId: undefined }), base)).toMatchObject({
		decision: "deny",
		reason: "invalid_response",
	});
	expect(DEFAULT_OPTIONS.map((option) => option.id)).toEqual(["allow", "deny"]);
});

test("the policy ceiling bound at issue time cannot be widened by the response", () => {
	const request = issued();
	const widened = decidePermission(request, respond({ optionId: "allow", decision: "allow" }), {
		sessionId: "session-a",
		controllerId: "controller-1",
		policy: policy({ allowedModels: ["other/*"] }),
		now: NOW + 1,
	});
	expect(widened).toMatchObject({ decision: "deny", reason: "policy_ceiling" });

	const allowance = decidePermission(request, respond(), {
		sessionId: "session-a",
		controllerId: "controller-1",
		policy: policy({ maxSubagents: 1, activeSubagents: 1 }),
		now: NOW + 1,
	});
	expect(allowance).toMatchObject({ decision: "deny", reason: "policy_ceiling" });
});

test("an allow_with_model option must stay inside the model ceiling", () => {
	const inside = issuePermissionRequest(
		{
			sessionId: "session-a",
			controllerId: "controller-1",
			source: "adapter",
			subject: subject(),
			options: [{ id: "allow_with_model", model: "local/m2" }, { id: "deny" }],
			ttlMs: 5000,
		},
		policy(),
		{ now: NOW, requestId: "req-2" }
	);
	if (!inside.ok || inside.kind !== "request") throw new Error("expected request");
	const ok = decidePermission(inside.request, respond({ requestId: "req-2", optionId: "allow_with_model" }), {
		sessionId: "session-a",
		controllerId: "controller-1",
		policy: policy(),
		now: NOW + 1,
	});
	expect(ok).toMatchObject({ decision: "allow", optionId: "allow_with_model" });

	const outside = issuePermissionRequest(
		{
			sessionId: "session-a",
			controllerId: "controller-1",
			source: "adapter",
			subject: subject(),
			options: [{ id: "allow_with_model", model: "external/x" }, { id: "deny" }],
			ttlMs: 5000,
		},
		policy(),
		{ now: NOW, requestId: "req-3" }
	);
	expect(outside).toMatchObject({ ok: false, reason: "invalid_options" });
});

test("malformed requests are rejected before they become requests", () => {
	const bad = [
		{ sessionId: "session a", controllerId: "controller-1", source: "adapter" as const, subject: subject(), ttlMs: 5000 },
		{ sessionId: "session-a", controllerId: "c".repeat(129), source: "adapter" as const, subject: subject(), ttlMs: 5000 },
		{
			sessionId: "session-a",
			controllerId: "controller-1",
			source: "carrier-pigeon" as unknown as "adapter",
			subject: subject(),
			ttlMs: 5000,
		},
		{
			sessionId: "session-a",
			controllerId: "controller-1",
			source: "adapter" as const,
			subject: subject({ kind: "" }),
			ttlMs: 5000,
		},
		{
			sessionId: "session-a",
			controllerId: "controller-1",
			source: "adapter" as const,
			subject: subject({ title: "x".repeat(2001) }),
			ttlMs: 5000,
		},
		{
			sessionId: "session-a",
			controllerId: "controller-1",
			source: "adapter" as const,
			subject: subject({ effects: "maybe" as unknown as "possible" }),
			ttlMs: 5000,
		},
		{ sessionId: "session-a", controllerId: "controller-1", source: "adapter" as const, subject: subject(), ttlMs: -1 },
	];
	for (const input of bad) {
		const result = issuePermissionRequest(input, policy(), { now: NOW });
		expect(result.ok).toBe(false);
	}
});

test("allow_with_model re-checks the alternate model against the current ceiling, not the original", () => {
	// Captured policy allows both models; the current policy has been tightened
	// to the original model only. The alternate effect must not slip through by
	// re-checking request.subject.model.
	const issuedPolicy = policy({ allowedModels: ["local/primary", "local/alternate"] });
	const tightened = policy({ allowedModels: ["local/primary"] });
	const result = issuePermissionRequest(
		{
			sessionId: "session-a",
			controllerId: "controller-1",
			source: "adapter",
			subject: subject({ model: "local/primary" }),
			options: [{ id: "allow_with_model", model: "local/alternate" }, { id: "deny" }],
			ttlMs: 5000,
		},
		issuedPolicy,
		{ now: NOW, requestId: "req-alt" }
	);
	if (!result.ok || result.kind !== "request") throw new Error("expected request");
	const denied = decidePermission(result.request, respond({ requestId: "req-alt", optionId: "allow_with_model" }), {
		sessionId: "session-a",
		controllerId: "controller-1",
		policy: tightened,
		now: NOW + 1,
	});
	expect(denied).toMatchObject({ decision: "deny", reason: "policy_ceiling" });
});

test("a bounded alternate allow binds the validated effective model, not just an option id", () => {
	const both = policy({ allowedModels: ["local/primary", "local/alternate"] });
	const result = issuePermissionRequest(
		{
			sessionId: "session-a",
			controllerId: "controller-1",
			source: "adapter",
			subject: subject({ model: "local/primary" }),
			options: [{ id: "allow_with_model", model: "local/alternate" }, { id: "deny" }],
			ttlMs: 5000,
		},
		both,
		{ now: NOW, requestId: "req-alt-ok" }
	);
	if (!result.ok || result.kind !== "request") throw new Error("expected request");
	const allowed = decidePermission(result.request, respond({ requestId: "req-alt-ok", optionId: "allow_with_model" }), {
		sessionId: "session-a",
		controllerId: "controller-1",
		policy: both,
		now: NOW + 1,
	});
	expect(allowed).toMatchObject({ decision: "allow", reason: "explicit_allow", optionId: "allow_with_model" });
	expect(allowed.subject).toEqual({ ...subject({ model: "local/alternate" }) });

	// The plain allow path keeps the requested subject.
	const plain = issued();
	expect(
		decidePermission(plain, respond(), {
			sessionId: "session-a",
			controllerId: "controller-1",
			policy: policy(),
			now: NOW + 1,
		}).subject
	).toEqual(subject());
});
