import { expect, test } from "bun:test";
import type { PermissionPolicy, SpawnSubject } from "./permission-broker.js";
import {
	type ContinuationPort,
	type JournalPort,
	PermissionProducer,
	type Receipt,
	type StartIntent,
	type TrustedContext,
} from "./permission-producer.js";

const NOW = 1_700_000_000_000;
const NATIVE = "session-native-a";
const PUBLIC = "public-a";
const CONTROLLER = "controller-1";

function policy(over: Partial<PermissionPolicy> = {}): PermissionPolicy {
	return {
		allowMode: "confirm",
		autoDecision: "deny",
		allowedModels: ["local/primary", "local/alternate"],
		allowedKinds: ["pi"],
		maxSubagents: 3,
		activeSubagents: 0,
		confirmTimeoutMs: 60_000,
		...over,
	};
}

function subject(over: Partial<SpawnSubject> = {}): SpawnSubject {
	return { capability: "subagent.spawn", kind: "pi", model: "local/primary", effects: "possible", ...over };
}

function trusted(over: Partial<TrustedContext> = {}): TrustedContext {
	return {
		nativeSessionId: NATIVE,
		publicSessionId: PUBLIC,
		controllerId: CONTROLLER,
		controllerGeneration: 1,
		source: "adapter",
		sourceGeneration: 1,
		subject: subject(),
		task: "Review the intake queue",
		workdir: "/tmp/work",
		targetOperation: "subagent.spawn",
		...over,
	};
}

class FakeJournal implements JournalPort {
	receipts: Receipt[] = [];
	failFrom = Number.POSITIVE_INFINITY;
	throwFrom = Number.POSITIVE_INFINITY;
	onAppend?: (count: number) => void;
	async append(receipt: Receipt) {
		if (this.receipts.length >= this.throwFrom) throw new Error("journal down");
		this.receipts.push(receipt);
		this.onAppend?.(this.receipts.length);
		return { acknowledged: this.receipts.length - 1 < this.failFrom };
	}
}

class FakeContinuation implements ContinuationPort {
	intents: StartIntent[] = [];
	result: { ok: boolean; detail?: string } = { ok: true };
	async start(intent: StartIntent) {
		this.intents.push(intent);
		return this.result;
	}
}

function producer(
	over: {
		policy?: Partial<PermissionPolicy>;
		trusted?: Partial<TrustedContext>;
		continuation?: FakeContinuation;
		journal?: FakeJournal;
		generation?: number;
		now?: () => number;
		policyFn?: () => PermissionPolicy;
	} = {}
) {
	const journal = over.journal ?? new FakeJournal();
	const continuation = over.continuation ?? new FakeContinuation();
	let counter = 0;
	const instance = new PermissionProducer({
		nativeSessionId: NATIVE,
		publicSessionId: PUBLIC,
		runtimeGeneration: over.generation ?? 1,
		policy: over.policyFn ?? (() => policy(over.policy)),
		journal,
		continuation,
		now: over.now ?? (() => NOW),
		newHandleId: () => `handle-${++counter}`,
	});
	return { instance, journal, continuation };
}

function issue(
	instance: PermissionProducer,
	over: {
		options?: Parameters<PermissionProducer["issue"]>[0]["options"];
		ttlMs?: number;
		subject?: SpawnSubject;
		trusted?: Partial<TrustedContext>;
	} = {}
) {
	const result = instance.issue({
		source: "adapter",
		subject: over.subject ?? subject(),
		options: over.options,
		ttlMs: over.ttlMs ?? 30_000,
		trusted: trusted({ subject: over.subject ?? subject(), ...over.trusted }),
	});
	if (!result.ok || result.kind !== "handle") throw new Error(`expected handle, got ${JSON.stringify(result)}`);
	return result.handle.handleId;
}

function allowResponse(optionId = "allow", revision = 0) {
	return { requestId: undefined as string | undefined, controllerId: CONTROLLER, revision, decision: "allow" as const, optionId };
}

function responseFor(instance: PermissionProducer, handleId: string, over: Record<string, unknown> = {}) {
	const view = instance.snapshot().active.find((entry) => entry.handleId === handleId);
	if (!view) throw new Error("handle not active");
	return {
		requestId: view.requestId,
		controllerId: CONTROLLER,
		revision: 0,
		decision: "allow" as const,
		optionId: "allow",
		...over,
	};
}

test("local auto policy stays outside the remote-handle path", () => {
	const { instance, continuation, journal } = producer({ policy: { allowMode: "auto" } });
	const result = instance.issue({ source: "adapter", subject: subject(), ttlMs: 5000, trusted: trusted() });
	expect(result).toEqual({ ok: true, kind: "authorized", authorizedBy: "local_policy" });
	expect(instance.snapshot().active).toHaveLength(0);
	expect(continuation.intents).toHaveLength(0);
	expect(journal.receipts).toHaveLength(0);
});

test("remote requests require an explicit expiry and bind an opaque handle", () => {
	const { instance } = producer();
	const missing = instance.issue({ source: "adapter", subject: subject(), trusted: trusted() });
	expect(missing).toMatchObject({ ok: false, reason: "expiry_required" });
	const handleId = issue(instance);
	expect(handleId).toBe("handle-1");
	const view = instance.snapshot().active[0];
	expect(view.handleId).not.toBe(view.requestId);
	expect(view.subjectDigest).toHaveLength(64);
	expect(view.options.map((option) => option.id)).toEqual(["allow", "deny"]);
});

test("one allow runs exactly one continuation with the effective model and journaled receipts", async () => {
	const { instance, continuation, journal } = producer();
	const handleId = issue(instance, {
		options: [{ id: "allow_with_model", model: "local/alternate" }, { id: "deny" }],
	});
	const outcome = await instance.run(handleId, responseFor(instance, handleId, { optionId: "allow_with_model" }), trusted());
	expect(outcome.ok).toBe(true);
	if (outcome.ok) expect(outcome.subject.model).toBe("local/alternate");
	expect(continuation.intents).toHaveLength(1);
	expect(continuation.intents[0].subject.model).toBe("local/alternate");
	expect(continuation.intents[0].task).toBe("Review the intake queue");
	expect(journal.receipts.map((receipt) => receipt.kind)).toEqual(["decision", "start_intent", "result"]);
	expect(journal.receipts.every((receipt) => receipt.outcome !== "uncertain")).toBe(true);
});

test("two concurrent replies start at most one continuation", async () => {
	const { instance, continuation } = producer();
	const handleId = issue(instance);
	const response = responseFor(instance, handleId);
	const [first, second] = await Promise.all([
		instance.run(handleId, response, trusted()),
		instance.run(handleId, response, trusted()),
	]);
	expect(continuation.intents).toHaveLength(1);
	expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
	expect([first, second].find((outcome) => !outcome.ok)).toMatchObject({ code: "already_consumed" });
	// Replay after completion returns a receipt, never another effect.
	const replay = await instance.run(handleId, response, trusted());
	expect(replay).toMatchObject({ ok: false, code: "not_active" });
	expect(continuation.intents).toHaveLength(1);
});

test("unknown, cancelled and expired handles never start an effect", async () => {
	const { instance, continuation } = producer();
	expect(await instance.run("missing", allowResponse() as never, trusted())).toMatchObject({ code: "unknown_handle" });
	const cancelled = issue(instance);
	const cancelledResponse = responseFor(instance, cancelled);
	await instance.cancel(cancelled, "controller_lost");
	expect(await instance.run(cancelled, cancelledResponse, trusted())).toMatchObject({ code: "cancelled" });

	const expired = issue(instance, { ttlMs: 1000 });
	const expiredResponse = responseFor(instance, expired);
	await instance.expireDue(NOW + 1000);
	expect(await instance.run(expired, expiredResponse, trusted())).toMatchObject({ code: "expired" });
	expect(continuation.intents).toHaveLength(0);
});

test("controller/session/source generation, subject and operation digest are bound", async () => {
	const { instance, continuation } = producer();
	const cases: Partial<TrustedContext>[] = [
		{ controllerId: "controller-2" },
		{ controllerGeneration: 2 },
		{ nativeSessionId: "session-native-b" },
		{ sourceGeneration: 2 },
		{ source: "tui" },
		{ subject: subject({ model: "local/alternate" }) },
		{ task: "Some other task" },
		{ workdir: "/tmp/other" },
		{ targetOperation: "subagent.spawn.with-model" },
	];
	for (const change of cases) {
		const handleId = issue(instance);
		const outcome = await instance.run(handleId, responseFor(instance, handleId), trusted(change));
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) expect(["fence_mismatch", "digest_mismatch"]).toContain(outcome.code);
	}
	expect(continuation.intents).toHaveLength(0);
});

test("a tightened policy denies the alternate model on the live handle and starts nothing", async () => {
	let current = policy();
	const { instance, continuation } = producer({ policyFn: () => current });
	const handleId = issue(instance, { options: [{ id: "allow_with_model", model: "local/alternate" }, { id: "deny" }] });
	const response = responseFor(instance, handleId, { optionId: "allow_with_model" });
	current = policy({ allowedModels: ["local/primary"] });
	const outcome = await instance.run(handleId, response, trusted());
	expect(outcome).toMatchObject({ ok: false, kind: "no_effect", code: "policy_denied" });
	expect(continuation.intents).toHaveLength(0);
});

test("cancel never claims a consuming handle was cancelled", async () => {
	const { instance } = producer();
	const handleId = issue(instance);
	const response = responseFor(instance, handleId);
	expect(instance.tryConsume(handleId, response, trusted()).ok).toBe(true);
	const cancelled = await instance.cancel(handleId, "shutdown");
	expect(cancelled.ok).toBe(false);
	expect(instance.snapshot().active).toHaveLength(0);
});

test("an issue rejects a trusted subject that differs from the requested subject", () => {
	const { instance } = producer();
	const result = instance.issue({
		source: "adapter",
		subject: subject(),
		ttlMs: 5000,
		trusted: trusted({ subject: subject({ model: "local/alternate" }) }),
	});
	expect(result).toMatchObject({ ok: false, reason: "invalid_request", detail: "trusted subject mismatch" });
});

test("a fence change between consumption and the effect cancels without starting it", async () => {
	const journal = new FakeJournal();
	const { instance, continuation } = producer({ journal });
	const handleId = issue(instance);
	const response = responseFor(instance, handleId);
	const current = trusted();
	// The controller generation advances after the decision receipt is journaled.
	journal.onAppend = (count) => {
		if (count === 1) current.controllerGeneration = 2;
	};
	const outcome = await instance.run(handleId, response, current);
	expect(outcome).toMatchObject({ ok: false, kind: "no_effect", code: "fence_mismatch" });
	expect(continuation.intents).toHaveLength(0);
});

test("journal failure before the effect prevents it; a start-intent failure also prevents it", async () => {
	const journal = new FakeJournal();
	journal.failFrom = 0;
	const { instance, continuation } = producer({ journal });
	const handleId = issue(instance);
	const denied = await instance.run(handleId, responseFor(instance, handleId), trusted());
	expect(denied).toMatchObject({ ok: false, code: "journal_unacknowledged" });
	expect(continuation.intents).toHaveLength(0);

	const journal2 = new FakeJournal();
	journal2.failFrom = 1;
	const second = producer({ journal: journal2 });
	const handle2 = issue(second.instance);
	const blocked = await second.instance.run(handle2, responseFor(second.instance, handle2), trusted());
	expect(blocked).toMatchObject({ ok: false, code: "journal_unacknowledged" });
	expect(second.continuation.intents).toHaveLength(0);
});

test("a failed continuation is a failed result receipt, not a retry", async () => {
	const continuation = new FakeContinuation();
	continuation.result = { ok: false, detail: "spawn refused" };
	const { instance } = producer({ continuation });
	const handleId = issue(instance);
	const response = responseFor(instance, handleId);
	const outcome = await instance.run(handleId, response, trusted());
	expect(outcome).toMatchObject({ ok: false, kind: "continuation_failed", code: "effect_failed" });
	expect(continuation.intents).toHaveLength(1);
	const replay = await instance.run(handleId, response, trusted());
	expect(replay).toMatchObject({ ok: false, code: "not_active" });
	expect(continuation.intents).toHaveLength(1);
});

test("expiry survives a throwing journal and deny answers are terminal", async () => {
	const journal = new FakeJournal();
	journal.throwFrom = 0;
	const { instance, continuation } = producer({ journal });
	issue(instance, { ttlMs: 1000 });
	await instance.expireDue(NOW + 1000);
	expect(instance.snapshot().active).toHaveLength(0);
	expect(instance.snapshot().receipts.some((receipt) => receipt.kind === "expired")).toBe(true);

	const denying = issue(instance);
	const denyResponse = responseFor(instance, denying, { decision: "deny", optionId: "deny" });
	const allowRetry = responseFor(instance, denying);
	const denied = await instance.run(denying, denyResponse, trusted());
	expect(denied).toMatchObject({ ok: false, kind: "no_effect" });
	const retry = await instance.run(denying, allowRetry, trusted());
	expect(retry).toMatchObject({ ok: false, code: "not_active" });
	expect(continuation.intents).toHaveLength(0);
});

test("snapshot omits private task, title and ceiling text and advances revision monotonically", async () => {
	const { instance } = producer();
	const handleId = issue(instance, { subject: subject({ title: "Private title" }) });
	const snapshot = instance.snapshot();
	const serialized = JSON.stringify(snapshot);
	expect(serialized).not.toContain("Review the intake queue");
	expect(serialized).not.toContain("Private title");
	expect(serialized).not.toContain("/tmp/work");
	expect(serialized).not.toContain("allowedModels");
	const before = snapshot.producerRevision;
	await instance.run(handleId, responseFor(instance, handleId), trusted());
	expect(instance.producerRevision).toBeGreaterThan(before);
});

test("restore keeps receipts only, advances the runtime generation and marks incomplete allows uncertain", async () => {
	const first = producer({ generation: 1 });
	const handleId = issue(first.instance);
	const response = responseFor(first.instance, handleId);
	await first.instance.run(handleId, response, trusted());
	const completed = first.instance.snapshot().receipts;
	const decision = completed.find((receipt) => receipt.kind === "decision");
	const started = completed.find((receipt) => receipt.kind === "start_intent");
	if (!decision || !started) throw new Error("expected decision and start receipts");
	const incomplete = [decision, started].map((receipt) => ({ ...receipt }));

	const second = producer({ generation: 1 });
	const restored = second.instance.restoreReceipts(incomplete, 2);
	expect(restored).toMatchObject({ ok: true, uncertain: 1 });
	expect(second.instance.runtimeGeneration).toBe(2);
	expect(second.instance.snapshot().active).toHaveLength(0);
	expect(second.instance.snapshot().receipts.find((receipt) => receipt.restored)?.outcome).toBe("uncertain");
	expect(second.instance.snapshot().receipts.every((receipt) => receipt.runtimeGeneration === 2)).toBe(true);
	expect(second.instance.restoreReceipts([], 1)).toMatchObject({ ok: false });

	// A complete allow restores without being downgraded.
	const third = producer({ generation: 1 });
	const complete = third.instance.restoreReceipts(completed, 2);
	expect(complete).toMatchObject({ ok: true, uncertain: 0 });
});

test("reconcile cancels handles the current policy no longer allows", async () => {
	let current = policy();
	const journal = new FakeJournal();
	const instance = new PermissionProducer({
		nativeSessionId: NATIVE,
		publicSessionId: PUBLIC,
		runtimeGeneration: 1,
		policy: () => current,
		journal,
		continuation: new FakeContinuation(),
		now: () => NOW,
		newHandleId: () => "handle-reconcile",
	});
	issue(instance);
	expect(instance.snapshot().active).toHaveLength(1);
	current = policy({ allowedModels: ["external/*"] });
	const receipts = await instance.reconcile();
	expect(receipts).toHaveLength(1);
	expect(receipts[0].reason).toBe("policy_changed");
	expect(instance.snapshot().active).toHaveLength(0);
});
