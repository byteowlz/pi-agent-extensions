/**
 * Owning-Pi runtime producer for semantic subagent permissions.
 *
 * The pure validator in `permission-broker.ts` decides one response. This module
 * owns the runtime responsibilities: an in-memory registry of active handles,
 * one-shot consumption, expiry/cancel/shutdown, and sanitized receipts through an
 * injected owning-Pi append-entry port.
 *
 * Source-only: no tool, command, presenter, socket, herdr or Core wiring. Ports
 * are injected so every fixture is fake; nothing here performs a real effect,
 * writes a file, or claims fsync/exactly-once beyond the port's acknowledgement.
 */

import { createHash, randomUUID } from "node:crypto";
import {
	DEFAULT_OPTIONS,
	type PermissionDecision,
	type PermissionOption,
	type PermissionPolicy,
	type PermissionResponse,
	type PermissionSource,
	type PolicyCeiling,
	type SpawnSubject,
	decidePermission,
	evaluatePolicy,
	validatePermissionOptions,
} from "./permission-broker.js";

export const PRODUCER_VERSION = 1;
const MAX_TASK = 8000;
const MAX_WORKDIR = 1024;
const MAX_OPERATION = 128;
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;
const RECEIPT_KINDS: ReceiptKind[] = ["decision", "start_intent", "result", "cancelled", "expired"];

/** Canonical JSON with sorted keys, so digests are stable across call sites. */
function canonical(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	const record = value as Record<string, unknown>;
	const keys = Object.keys(record).sort();
	return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

/** SHA-256 over canonical JSON. Digests bind; they never authorize. */
export function digestOf(value: unknown): string {
	return createHash("sha256").update(canonical(value)).digest("hex");
}

/** Trusted producer context: authenticated fences plus the real operation. */
export interface TrustedContext {
	nativeSessionId: string;
	publicSessionId: string;
	controllerId: string;
	controllerGeneration: number;
	source: PermissionSource;
	sourceGeneration: number;
	/** The subject being acted on; compared by digest, never trusted from a reply. */
	subject: SpawnSubject;
	task: string;
	workdir: string;
	targetOperation: string;
}

export interface OptionEffect {
	id: PermissionOption["id"];
	model?: string;
	effectDigest: string;
}

export type ReceiptKind = "decision" | "start_intent" | "result" | "cancelled" | "expired";
export type ReceiptOutcome = "allow" | "deny" | "started" | "completed" | "failed" | "cancelled" | "expired" | "uncertain";

/** Sanitized receipt: no task, title, workdir or ceiling text. */
export interface Receipt {
	version: 1;
	runtimeGeneration: number;
	producerRevision: number;
	handleId: string;
	requestId: string;
	revision: number;
	kind: ReceiptKind;
	outcome: ReceiptOutcome;
	optionId?: string;
	reason: string;
	source: PermissionSource;
	controllerId: string;
	nativeSessionDigest: string;
	subjectDigest: string;
	operationDigest: string;
	at: number;
	restored?: true;
}

export interface JournalAck {
	acknowledged?: boolean;
}

/** Injected owning-Pi append-entry port. No fsync or exactly-once promise. */
export interface JournalPort {
	append(receipt: Receipt): Promise<JournalAck> | JournalAck;
}

export interface StartIntent {
	handleId: string;
	runtimeGeneration: number;
	producerRevision: number;
	requestId: string;
	/** The validated effective subject, never the request/captured original. */
	subject: SpawnSubject;
	task: string;
	workdir: string;
	targetOperation: string;
}

export interface ContinuationResult {
	ok: boolean;
	detail?: string;
}

/** Injected effect port. Called at most once per handle. */
export interface ContinuationPort {
	start(intent: StartIntent): Promise<ContinuationResult> | ContinuationResult;
}

export type HandleState = "active" | "consuming" | "denied" | "completed" | "failed" | "cancelled" | "expired";

export interface HandleView {
	handleId: string;
	requestId: string;
	revision: number;
	state: HandleState;
	source: PermissionSource;
	controllerId: string;
	createdAt: number;
	expiresAt: number;
	subjectDigest: string;
	operationDigest: string;
	ceilingDigest: string;
	options: OptionEffect[];
}

export interface Snapshot {
	runtimeGeneration: number;
	producerRevision: number;
	active: HandleView[];
	receipts: Receipt[];
}

export type ConsumeCode =
	| "unknown_handle"
	| "already_consumed"
	| "not_active"
	| "expired"
	| "cancelled"
	| "fence_mismatch"
	| "digest_mismatch"
	| "policy_denied"
	| "denied"
	| "invalid_response";

export type ConsumeOutcome =
	| {
			ok: true;
			handleId: string;
			runtimeGeneration: number;
			producerRevision: number;
			decision: PermissionDecision;
	  }
	| { ok: false; code: ConsumeCode; receipt?: Receipt; decision?: PermissionDecision };

export type RunOutcome =
	| { ok: true; kind: "started"; subject: SpawnSubject; receipt: Receipt; receiptPersisted: boolean }
	| {
			ok: false;
			kind: "no_effect" | "continuation_failed";
			code: ConsumeCode | "journal_unacknowledged" | "effect_failed";
			receipt?: Receipt;
	  };

export type IssueOutcome =
	| { ok: true; kind: "authorized"; authorizedBy: "local_policy" }
	| { ok: true; kind: "handle"; handle: HandleView }
	| { ok: false; reason: "policy_denied" | "invalid_request" | "expiry_required" | "invalid_options"; detail: string };

interface Handle {
	handleId: string;
	requestId: string;
	revision: 0;
	runtimeGeneration: number;
	nativeSessionId: string;
	publicSessionId: string;
	controllerId: string;
	controllerGeneration: number;
	source: PermissionSource;
	sourceGeneration: number;
	subject: SpawnSubject;
	task: string;
	workdir: string;
	targetOperation: string;
	operationDigest: string;
	subjectDigest: string;
	ceilingDigest: string;
	ceiling: PolicyCeiling;
	options: PermissionOption[];
	optionEffects: OptionEffect[];
	createdAt: number;
	expiresAt: number;
	state: HandleState;
	decision?: PermissionDecision;
}

function isIdentifier(value: unknown): value is string {
	return typeof value === "string" && IDENTIFIER.test(value);
}

function isGeneration(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function bounded(value: unknown, max: number): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= max;
}

function subjectDigest(subject: SpawnSubject): string {
	const { capability, kind, model, loadout, title, effects } = subject;
	return digestOf({ capability, kind, model, loadout, title, effects });
}

function operationDigest(subject: SpawnSubject, task: string, workdir: string, targetOperation: string): string {
	return digestOf({ subject: { ...subject }, task, workdir, targetOperation });
}

function nativeSessionDigest(nativeSessionId: string, publicSessionId: string): string {
	return digestOf({ nativeSessionId, publicSessionId });
}

export interface ProducerOptions {
	nativeSessionId: string;
	publicSessionId: string;
	runtimeGeneration: number;
	policy: () => PermissionPolicy;
	journal: JournalPort;
	continuation: ContinuationPort;
	now?: () => number;
	newHandleId?: () => string;
}

export class PermissionProducer {
	private readonly journalPort: JournalPort;
	private readonly continuationPort: ContinuationPort;
	private readonly policyProvider: () => PermissionPolicy;
	private readonly nowFn: () => number;
	private readonly newHandleId: () => string;
	private readonly nativeSessionId: string;
	private readonly publicSessionId: string;
	private generation: number;
	private revisionCounter = 0;
	private readonly handles = new Map<string, Handle>();
	private readonly receipts = new Map<string, Receipt[]>();

	constructor(options: ProducerOptions) {
		if (!isIdentifier(options.nativeSessionId)) throw new Error("invalid nativeSessionId");
		if (typeof options.publicSessionId !== "string" || options.publicSessionId.length > 128)
			throw new Error("invalid publicSessionId");
		if (!isGeneration(options.runtimeGeneration)) throw new Error("invalid runtimeGeneration");
		this.nativeSessionId = options.nativeSessionId;
		this.publicSessionId = options.publicSessionId;
		this.generation = options.runtimeGeneration;
		this.policyProvider = options.policy;
		this.journalPort = options.journal;
		this.continuationPort = options.continuation;
		this.nowFn = options.now ?? (() => Date.now());
		this.newHandleId = options.newHandleId ?? (() => randomUUID());
	}

	get runtimeGeneration(): number {
		return this.generation;
	}

	get producerRevision(): number {
		return this.revisionCounter;
	}

	private nextRevision(): number {
		this.revisionCounter += 1;
		return this.revisionCounter;
	}

	private receiptKey(handleId: string): string {
		return `${this.generation}:${handleId}`;
	}

	private record(receipt: Receipt): void {
		const key = this.receiptKey(receipt.handleId);
		const list = this.receipts.get(key);
		if (list) list.push(receipt);
		else this.receipts.set(key, [receipt]);
	}

	private lastReceipt(handleId: string): Receipt | undefined {
		return this.receipts.get(this.receiptKey(handleId))?.at(-1);
	}

	/** Journal an already-recorded receipt. Never records twice. */
	private async appendReceipt(receipt: Receipt): Promise<boolean> {
		try {
			const ack = await this.journalPort.append(receipt);
			return ack === true || (!!ack && ack.acknowledged === true);
		} catch {
			return false;
		}
	}

	private view(handle: Handle): HandleView {
		return {
			handleId: handle.handleId,
			requestId: handle.requestId,
			revision: handle.revision,
			state: handle.state,
			source: handle.source,
			controllerId: handle.controllerId,
			createdAt: handle.createdAt,
			expiresAt: handle.expiresAt,
			subjectDigest: handle.subjectDigest,
			operationDigest: handle.operationDigest,
			ceilingDigest: handle.ceilingDigest,
			options: handle.optionEffects.map((option) => ({ ...option })),
		};
	}

	private makeReceipt(
		handle: Handle,
		kind: ReceiptKind,
		outcome: ReceiptOutcome,
		reason: string,
		optionId?: string,
		at = this.nowFn()
	): Receipt {
		return {
			version: PRODUCER_VERSION,
			runtimeGeneration: this.generation,
			producerRevision: this.nextRevision(),
			handleId: handle.handleId,
			requestId: handle.requestId,
			revision: handle.revision,
			kind,
			outcome,
			...(optionId ? { optionId } : {}),
			reason,
			source: handle.source,
			controllerId: handle.controllerId,
			nativeSessionDigest: nativeSessionDigest(handle.nativeSessionId, handle.publicSessionId),
			subjectDigest: handle.subjectDigest,
			operationDigest: handle.operationDigest,
			at,
		};
	}

	private optionEffects(subject: SpawnSubject, options: PermissionOption[]): OptionEffect[] {
		return options.map((option) => {
			if (option.id === "allow") return { id: option.id, model: subject.model, effectDigest: subjectDigest(subject) };
			if (option.id === "allow_with_model") {
				return { id: option.id, model: option.model, effectDigest: subjectDigest({ ...subject, model: option.model }) };
			}
			return { id: option.id, effectDigest: digestOf({ deny: true }) };
		});
	}

	private matchSession(trusted: TrustedContext): boolean {
		return trusted.nativeSessionId === this.nativeSessionId && trusted.publicSessionId === this.publicSessionId;
	}

	/**
	 * Issue a handle, authorize locally, or deny.
	 *
	 * Local `allowMode: auto` stays outside the remote-handle path: no handle, no
	 * journal, no continuation. The caller proceeds as before.
	 */
	issue(
		input: {
			source: PermissionSource;
			subject: SpawnSubject;
			options?: PermissionOption[];
			ttlMs?: number;
			trusted: TrustedContext;
		},
		deps: { now?: number } = {}
	): IssueOutcome {
		const now = deps.now ?? this.nowFn();
		const trusted = input.trusted;
		if (!this.matchSession(trusted)) return { ok: false, reason: "invalid_request", detail: "session mismatch" };
		if (!isIdentifier(trusted.controllerId)) return { ok: false, reason: "invalid_request", detail: "invalid controllerId" };
		if (!isGeneration(trusted.controllerGeneration) || !isGeneration(trusted.sourceGeneration))
			return { ok: false, reason: "invalid_request", detail: "invalid generation" };
		if (trusted.source !== input.source) return { ok: false, reason: "invalid_request", detail: "source mismatch" };
		if (!bounded(trusted.task, MAX_TASK)) return { ok: false, reason: "invalid_request", detail: "invalid task" };
		if (!bounded(trusted.workdir, MAX_WORKDIR)) return { ok: false, reason: "invalid_request", detail: "invalid workdir" };
		if (!bounded(trusted.targetOperation, MAX_OPERATION))
			return { ok: false, reason: "invalid_request", detail: "invalid targetOperation" };

		if (subjectDigest(trusted.subject) !== subjectDigest(input.subject))
			return { ok: false, reason: "invalid_request", detail: "trusted subject mismatch" };

		const policy = this.policyProvider();
		const evaluation = evaluatePolicy(policy, input.subject);
		if (evaluation.outcome === "deny") return { ok: false, reason: "policy_denied", detail: evaluation.reason };
		if (evaluation.outcome === "auto_allow") return { ok: true, kind: "authorized", authorizedBy: "local_policy" };

		const ttl = input.ttlMs;
		if (trusted.source !== "tui" && ttl === undefined)
			return { ok: false, reason: "expiry_required", detail: "remote requests must state an explicit ttlMs" };
		if (ttl !== undefined && (!Number.isSafeInteger(ttl) || ttl <= 0))
			return { ok: false, reason: "invalid_request", detail: "ttlMs must be a positive integer" };

		const handleId = this.newHandleId();
		if (!isIdentifier(handleId)) return { ok: false, reason: "invalid_request", detail: "invalid handleId" };
		const options = input.options ?? DEFAULT_OPTIONS;
		const ceiling: PolicyCeiling = {
			allowedModels: [...policy.allowedModels],
			allowedKinds: [...policy.allowedKinds],
			maxSubagents: policy.maxSubagents,
			activeSubagents: policy.activeSubagents,
		};
		const optionError = validatePermissionOptions(options, ceiling);
		if (optionError) return { ok: false, reason: "invalid_options", detail: optionError };

		const budget = policy.confirmTimeoutMs > 0 ? policy.confirmTimeoutMs : 3_600_000;
		const requested = ttl ?? (policy.confirmTimeoutMs > 0 ? policy.confirmTimeoutMs : 60_000);
		const expiresAt = now + Math.min(requested, budget);
		const handle: Handle = {
			handleId,
			requestId: randomUUID(),
			revision: 0,
			runtimeGeneration: this.generation,
			nativeSessionId: trusted.nativeSessionId,
			publicSessionId: trusted.publicSessionId,
			controllerId: trusted.controllerId,
			controllerGeneration: trusted.controllerGeneration,
			source: trusted.source,
			sourceGeneration: trusted.sourceGeneration,
			subject: { ...input.subject },
			task: trusted.task,
			workdir: trusted.workdir,
			targetOperation: trusted.targetOperation,
			operationDigest: operationDigest(input.subject, trusted.task, trusted.workdir, trusted.targetOperation),
			subjectDigest: subjectDigest(input.subject),
			ceilingDigest: digestOf(ceiling),
			ceiling,
			options: [...options],
			optionEffects: this.optionEffects(input.subject, options),
			createdAt: now,
			expiresAt,
			state: "active",
		};
		this.handles.set(handleId, handle);
		this.nextRevision();
		return { ok: true, kind: "handle", handle: this.view(handle) };
	}

	private checkFences(handle: Handle, trusted: TrustedContext): { ok: true } | { ok: false; code: ConsumeCode } {
		if (!this.matchSession(trusted)) return { ok: false, code: "fence_mismatch" };
		if (trusted.controllerId !== handle.controllerId) return { ok: false, code: "fence_mismatch" };
		if (trusted.controllerGeneration !== handle.controllerGeneration) return { ok: false, code: "fence_mismatch" };
		if (trusted.source !== handle.source) return { ok: false, code: "fence_mismatch" };
		if (trusted.sourceGeneration !== handle.sourceGeneration) return { ok: false, code: "fence_mismatch" };
		if (subjectDigest(trusted.subject) !== handle.subjectDigest) return { ok: false, code: "digest_mismatch" };
		if (operationDigest(trusted.subject, trusted.task, trusted.workdir, trusted.targetOperation) !== handle.operationDigest)
			return { ok: false, code: "digest_mismatch" };
		return { ok: true };
	}

	private terminate(handle: Handle, state: HandleState, reason: string): Receipt {
		handle.state = state;
		const kind: ReceiptKind = state === "expired" ? "expired" : "cancelled";
		const outcome: ReceiptOutcome = state === "expired" ? "expired" : "cancelled";
		const receipt = this.makeReceipt(handle, kind, outcome, reason);
		this.record(receipt);
		return receipt;
	}

	/**
	 * Mark expired handles terminal at trusted host time.
	 *
	 * Synchronous and journal-independent: a failing adapter cannot suppress
	 * expiry. Journal afterwards with `expireDue` when a durable receipt matters.
	 */
	sweepExpired(now = this.nowFn()): Receipt[] {
		const receipts: Receipt[] = [];
		for (const handle of this.handles.values()) {
			if (handle.state !== "active") continue;
			if (now < handle.expiresAt) continue;
			receipts.push(this.terminate(handle, "expired", "expired"));
		}
		return receipts;
	}

	/** Sweep and best-effort journal expiry receipts; failures are ignored. */
	async expireDue(now = this.nowFn()): Promise<Receipt[]> {
		const receipts = this.sweepExpired(now);
		for (const receipt of receipts) await this.appendReceipt(receipt);
		return receipts;
	}

	/**
	 * Validate and check-and-set in one tick. No await occurs in this method, so
	 * two concurrent replies cannot both consume the handle.
	 */
	tryConsume(handleId: string, response: PermissionResponse, trustedCurrent: TrustedContext): ConsumeOutcome {
		const now = this.nowFn();
		this.sweepExpired(now);
		const handle = this.handles.get(handleId);
		if (!handle) return { ok: false, code: "unknown_handle" };
		if (handle.state === "consuming") return { ok: false, code: "already_consumed", receipt: this.lastReceipt(handleId) };
		if (handle.state !== "active") {
			const code: ConsumeCode =
				handle.state === "expired" ? "expired" : handle.state === "cancelled" ? "cancelled" : "not_active";
			return { ok: false, code, receipt: this.lastReceipt(handleId) };
		}
		const fence = this.checkFences(handle, trustedCurrent);
		if (!fence.ok) {
			const receipt = this.terminate(handle, "cancelled", "fence_mismatch");
			return { ok: false, code: fence.code, receipt };
		}
		const decision = decidePermission(
			{
				version: 1,
				capability: "subagent.spawn",
				requestId: handle.requestId,
				sessionId: handle.nativeSessionId,
				controllerId: handle.controllerId,
				source: handle.source,
				revision: handle.revision,
				subject: handle.subject,
				options: handle.options,
				ceiling: handle.ceiling,
				createdAt: handle.createdAt,
				expiresAt: handle.expiresAt,
			},
			response,
			{ sessionId: handle.nativeSessionId, controllerId: handle.controllerId, policy: this.policyProvider(), now }
		);
		if (decision.decision !== "allow") {
			// A decision is terminal: a deny answer cannot be retried into an allow.
			const code: ConsumeCode =
				decision.reason === "expired"
					? "expired"
					: decision.reason === "cancelled"
						? "cancelled"
						: decision.reason === "policy_ceiling"
							? "policy_denied"
							: decision.reason === "explicit_deny"
								? "denied"
								: "invalid_response";
			const state: HandleState = decision.reason === "expired" ? "expired" : "denied";
			handle.state = state;
			const receipt = this.makeReceipt(handle, "decision", "deny", decision.reason, decision.optionId);
			this.record(receipt);
			return { ok: false, code, receipt, decision };
		}
		// Check-and-set in the same tick, before the caller awaits anything.
		handle.state = "consuming";
		handle.decision = decision;
		this.nextRevision();
		return { ok: true, handleId, runtimeGeneration: this.generation, producerRevision: this.revisionCounter, decision };
	}

	private startIntent(handle: Handle, decision: PermissionDecision): StartIntent {
		return {
			handleId: handle.handleId,
			runtimeGeneration: this.generation,
			producerRevision: this.revisionCounter,
			requestId: handle.requestId,
			subject: { ...decision.subject },
			task: handle.task,
			workdir: handle.workdir,
			targetOperation: handle.targetOperation,
		};
	}

	/**
	 * Consume one handle and run the effect at most once.
	 *
	 * Journal acknowledgement precedes the effect: a failed decision or
	 * start-intent append leaves no effect. A failed continuation is reported as a
	 * failed result, never retried or replayed.
	 */
	async run(handleId: string, response: PermissionResponse, trustedCurrent: TrustedContext): Promise<RunOutcome> {
		const consumed = this.tryConsume(handleId, response, trustedCurrent);
		if (!consumed.ok) {
			if (consumed.receipt) await this.appendReceipt(consumed.receipt);
			return { ok: false, kind: "no_effect", code: consumed.code, receipt: consumed.receipt };
		}
		const handle = this.handles.get(handleId);
		if (!handle) return { ok: false, kind: "no_effect", code: "unknown_handle" };
		const decision = consumed.decision;
		const decisionReceipt = this.makeReceipt(handle, "decision", "allow", "explicit_allow", decision.optionId);
		this.record(decisionReceipt);
		if (!(await this.appendReceipt(decisionReceipt))) {
			handle.state = "failed";
			return { ok: false, kind: "no_effect", code: "journal_unacknowledged", receipt: decisionReceipt };
		}
		const fence = this.checkFences(handle, trustedCurrent);
		if (!fence.ok) {
			const receipt = this.terminate(handle, "cancelled", "fence_mismatch_before_effect");
			await this.appendReceipt(receipt);
			return { ok: false, kind: "no_effect", code: fence.code, receipt };
		}
		const startReceipt = this.makeReceipt(handle, "start_intent", "started", "effect_start", decision.optionId);
		this.record(startReceipt);
		if (!(await this.appendReceipt(startReceipt))) {
			handle.state = "failed";
			return { ok: false, kind: "no_effect", code: "journal_unacknowledged", receipt: startReceipt };
		}
		let result: ContinuationResult;
		try {
			result = await this.continuationPort.start(this.startIntent(handle, decision));
		} catch (error) {
			result = { ok: false, detail: String(error) };
		}
		const resultReceipt = this.makeReceipt(
			handle,
			"result",
			result.ok ? "completed" : "failed",
			result.ok ? "effect_completed" : "effect_failed",
			decision.optionId
		);
		this.record(resultReceipt);
		const persisted = await this.appendReceipt(resultReceipt);
		handle.state = result.ok ? "completed" : "failed";
		if (!result.ok) return { ok: false, kind: "continuation_failed", code: "effect_failed", receipt: resultReceipt };
		return { ok: true, kind: "started", subject: { ...decision.subject }, receipt: resultReceipt, receiptPersisted: persisted };
	}

	/** Cancel one active handle. A started child is never claimed as cancelled. */
	async cancel(handleId: string, reason = "cancelled"): Promise<{ ok: boolean; receipt?: Receipt }> {
		const handle = this.handles.get(handleId);
		if (!handle) return { ok: false };
		if (handle.state !== "active") return { ok: false, receipt: this.lastReceipt(handleId) };
		const receipt = this.terminate(handle, "cancelled", reason);
		await this.appendReceipt(receipt);
		return { ok: true, receipt };
	}

	/** Cancel every active handle (controller/session/source loss, shutdown). */
	async cancelAll(reason: string): Promise<Receipt[]> {
		const receipts: Receipt[] = [];
		for (const handle of this.handles.values()) {
			if (handle.state !== "active") continue;
			receipts.push(this.terminate(handle, "cancelled", reason));
		}
		for (const receipt of receipts) await this.appendReceipt(receipt);
		return receipts;
	}

	/** Cancel handles whose current policy no longer allows the subject. */
	async reconcile(): Promise<Receipt[]> {
		const policy = this.policyProvider();
		const receipts: Receipt[] = [];
		for (const handle of this.handles.values()) {
			if (handle.state !== "active") continue;
			if (evaluatePolicy(policy, handle.subject).outcome !== "deny") continue;
			receipts.push(this.terminate(handle, "cancelled", "policy_changed"));
		}
		for (const receipt of receipts) await this.appendReceipt(receipt);
		return receipts;
	}

	/** Provider-neutral snapshot: no task, title, workdir or ceiling text. */
	snapshot(deps: { now?: number } = {}): Snapshot {
		this.sweepExpired(deps.now ?? this.nowFn());
		const active: HandleView[] = [];
		for (const handle of this.handles.values()) if (handle.state === "active") active.push(this.view(handle));
		const receipts = [...this.receipts.values()]
			.flat()
			.filter((receipt) => receipt.runtimeGeneration === this.generation)
			.map((receipt) => ({ ...receipt }));
		receipts.sort((a, b) => a.producerRevision - b.producerRevision);
		return { runtimeGeneration: this.generation, producerRevision: this.revisionCounter, active, receipts };
	}

	/**
	 * Restore sanitized receipts under a NEW runtime generation. Never creates
	 * handles and never restores a pending allow as an active decision.
	 */
	restoreReceipts(
		receipts: Receipt[],
		runtimeGeneration: number
	): { ok: true; restored: number; uncertain: number } | { ok: false; reason: string } {
		if (!isGeneration(runtimeGeneration) || runtimeGeneration <= this.generation)
			return { ok: false, reason: "runtime_generation_must_advance" };
		if (this.handles.size > 0) return { ok: false, reason: "restore_requires_no_active_handles" };
		for (const receipt of receipts) {
			if (!receipt || receipt.version !== PRODUCER_VERSION) return { ok: false, reason: "invalid_receipt" };
			if (!RECEIPT_KINDS.includes(receipt.kind)) return { ok: false, reason: "invalid_receipt_kind" };
			if (receipt.runtimeGeneration >= runtimeGeneration) return { ok: false, reason: "receipt_generation_not_older" };
			if (!isIdentifier(receipt.handleId) || !isIdentifier(receipt.requestId))
				return { ok: false, reason: "invalid_receipt_identity" };
		}
		const groups = new Map<string, Receipt[]>();
		for (const receipt of receipts) {
			const key = `${receipt.runtimeGeneration}:${receipt.handleId}`;
			const list = groups.get(key);
			if (list) list.push(receipt);
			else groups.set(key, [receipt]);
		}
		let restored = 0;
		let uncertain = 0;
		this.generation = runtimeGeneration;
		for (const list of groups.values()) {
			const hasResult = list.some((receipt) => receipt.kind === "result");
			for (const receipt of list) {
				const copy: Receipt = { ...receipt, runtimeGeneration };
				if (!hasResult && receipt.kind === "decision" && receipt.outcome === "allow") {
					copy.outcome = "uncertain";
					copy.restored = true;
					copy.reason = "restored_incomplete_effect";
					uncertain += 1;
				}
				this.record(copy);
				restored += 1;
			}
		}
		this.nextRevision();
		return { ok: true, restored, uncertain };
	}
}
