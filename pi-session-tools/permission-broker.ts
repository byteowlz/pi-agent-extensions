/**
 * Pure permission decision broker for subagent spawning.
 *
 * This module holds no UI, no herdr calls, no wire and no pi imports: it takes
 * a policy view and a request, and returns a terminal decision. The local TUI
 * and the existing `approveSpawn` path are unchanged; nothing is wired to this
 * yet, so no presenter or RPC semantics move.
 *
 * Invariants the callers must be able to rely on:
 * - A request is issued only when local policy says a human/remote decision is
 *   needed. `allowMode: "auto"` authorizes without a request (unchanged).
 * - Remote sources must state an explicit expiry; expiry always denies. It never
 *   falls back to `autoDecision`, so a gone client cannot silently allow.
 * - Every decision is bound to the request id, requesting controller, revision,
 *   source and the policy ceiling evaluated at issue time. Mismatch, staleness,
 *   or a policy that became stricter since issue all deny.
 * - Only an explicit allow option within the ceiling can allow. Absent, malformed
 *   or unknown responses deny.
 */

import { randomUUID } from "node:crypto";
import { allowedBy } from "./policy.js";

export const PERMISSION_VERSION = 1;
export const MAX_REQUEST_TTL_MS = 3_600_000;
export const MAX_OPTIONS = 16;

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_KIND = 64;
const MAX_MODEL = 200;
const MAX_LOADOUT = 64;
const MAX_TITLE = 2000;

export type PermissionSource = "tui" | "rpc" | "adapter";
export type SpawnEffects = "none" | "possible" | "started";
export type AllowMode = "auto" | "confirm" | "timeout";
export type AutoDecision = "allow" | "deny";

export interface SpawnSubject {
	capability: "subagent.spawn";
	kind: string;
	model: string;
	loadout?: string;
	title?: string;
	effects: SpawnEffects;
}

export type PermissionOption = { id: "allow" } | { id: "deny" } | { id: "allow_with_model"; model: string };

/** The policy the session currently enforces; never widened by a client. */
export interface PermissionPolicy {
	allowMode: AllowMode;
	autoDecision: AutoDecision;
	allowedModels: string[];
	allowedKinds: string[];
	maxSubagents: number;
	activeSubagents: number;
	confirmTimeoutMs: number;
}

export interface PolicyCeiling {
	allowedModels: string[];
	allowedKinds: string[];
	maxSubagents: number;
	activeSubagents: number;
}

export interface PermissionRequest {
	version: 1;
	capability: "subagent.spawn";
	requestId: string;
	sessionId: string;
	controllerId: string;
	source: PermissionSource;
	revision: 0;
	subject: SpawnSubject;
	options: PermissionOption[];
	/** Policy as evaluated at issue time; a later decision cannot widen it. */
	ceiling: PolicyCeiling;
	createdAt: number;
	expiresAt: number;
}

export interface PermissionResponse {
	requestId?: unknown;
	controllerId?: unknown;
	revision?: unknown;
	decision?: unknown;
	optionId?: unknown;
	cancelled?: unknown;
}

export type PolicyOutcome = "auto_allow" | "needs_decision" | "deny";

export interface PolicyEvaluation {
	outcome: PolicyOutcome;
	reason: "local_policy_auto" | "needs_decision" | "kind_not_allowed" | "model_not_allowed" | "allowance_exhausted";
}

export type DecisionReason =
	| "explicit_allow"
	| "explicit_deny"
	| "cancelled"
	| "expired"
	| "unknown_request"
	| "session_mismatch"
	| "stale_controller"
	| "stale_revision"
	| "invalid_response"
	| "unknown_option"
	| "policy_ceiling"
	| "policy_denied";

export interface PermissionDecision {
	version: 1;
	requestId: string;
	sessionId: string;
	controllerId: string;
	source: PermissionSource;
	revision: number;
	decision: "allow" | "deny";
	optionId?: string;
	reason: DecisionReason;
	decidedAt: number;
}

export type IssueResult =
	| { ok: true; kind: "authorized"; authorizedBy: "local_policy" }
	| { ok: true; kind: "request"; request: PermissionRequest }
	| { ok: false; reason: "policy_denied"; detail: PolicyEvaluation["reason"] }
	| { ok: false; reason: "invalid_request" | "expiry_required" | "invalid_options"; detail: string };

export interface IssueInput {
	sessionId: string;
	controllerId: string;
	source: PermissionSource;
	subject: SpawnSubject;
	options?: PermissionOption[];
	/** Required for rpc/adapter sources: no unbounded remote wait. */
	ttlMs?: number;
}

export interface DecideContext {
	sessionId: string;
	/** The live controller (lease/connection) that is responding now. */
	controllerId: string;
	policy: PermissionPolicy;
	now?: number;
}

/** Stable identity for dedupe/idempotency checks; never used as a grant. */
export function decisionKey(request: Pick<PermissionRequest, "requestId" | "revision">): string {
	return `${request.requestId}:${request.revision}`;
}

function isIdentifier(value: unknown): value is string {
	return typeof value === "string" && IDENTIFIER.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function boundedString(value: unknown, max: number): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= max;
}

function normalizePolicy(policy: PermissionPolicy): PermissionPolicy | { error: string } {
	if (policy.allowMode !== "auto" && policy.allowMode !== "confirm" && policy.allowMode !== "timeout")
		return { error: "invalid allowMode" };
	if (policy.autoDecision !== "allow" && policy.autoDecision !== "deny") return { error: "invalid autoDecision" };
	if (!Array.isArray(policy.allowedModels) || !policy.allowedModels.every((p) => typeof p === "string" && p.length <= 200))
		return { error: "invalid allowedModels" };
	if (!Array.isArray(policy.allowedKinds) || !policy.allowedKinds.every((k) => typeof k === "string" && k.length <= MAX_KIND))
		return { error: "invalid allowedKinds" };
	if (!isNonNegativeInteger(policy.maxSubagents)) return { error: "invalid maxSubagents" };
	if (!isNonNegativeInteger(policy.activeSubagents)) return { error: "invalid activeSubagents" };
	if (!isNonNegativeInteger(policy.confirmTimeoutMs) || policy.confirmTimeoutMs > MAX_REQUEST_TTL_MS)
		return { error: "invalid confirmTimeoutMs" };
	return policy;
}

function validateSubject(subject: SpawnSubject): string | null {
	if (subject.capability !== "subagent.spawn") return "unsupported capability";
	if (!boundedString(subject.kind, MAX_KIND)) return "invalid kind";
	if (!boundedString(subject.model, MAX_MODEL)) return "invalid model";
	if (subject.loadout !== undefined && !boundedString(subject.loadout, MAX_LOADOUT)) return "invalid loadout";
	if (subject.title !== undefined && (typeof subject.title !== "string" || subject.title.length > MAX_TITLE))
		return "invalid title";
	if (subject.effects !== "none" && subject.effects !== "possible" && subject.effects !== "started") return "invalid effects";
	return null;
}

/** pi kinds: "pi" is always permitted, other kinds must be allowlisted. */
function kindAllowed(policy: Pick<PermissionPolicy, "allowedKinds">, kind: string): boolean {
	return kind === "pi" || policy.allowedKinds.includes(kind);
}

function ceilingAllows(ceiling: PolicyCeiling, subject: SpawnSubject): boolean {
	if (!kindAllowed(ceiling, subject.kind)) return false;
	if (!allowedBy(ceiling.allowedModels, subject.model)) return false;
	return ceiling.maxSubagents === 0 || ceiling.activeSubagents < ceiling.maxSubagents;
}

function snapshotCeiling(policy: PermissionPolicy): PolicyCeiling {
	return {
		allowedModels: [...policy.allowedModels],
		allowedKinds: [...policy.allowedKinds],
		maxSubagents: policy.maxSubagents,
		activeSubagents: policy.activeSubagents,
	};
}

/** Local policy evaluation. `auto` authorizes without any request (unchanged). */
export function evaluatePolicy(policy: PermissionPolicy, subject: SpawnSubject): PolicyEvaluation {
	if (!kindAllowed(policy, subject.kind)) return { outcome: "deny", reason: "kind_not_allowed" };
	if (!allowedBy(policy.allowedModels, subject.model)) return { outcome: "deny", reason: "model_not_allowed" };
	if (policy.maxSubagents > 0 && policy.activeSubagents >= policy.maxSubagents)
		return { outcome: "deny", reason: "allowance_exhausted" };
	if (policy.allowMode === "auto") return { outcome: "auto_allow", reason: "local_policy_auto" };
	return { outcome: "needs_decision", reason: "needs_decision" };
}

function validateOptions(options: PermissionOption[], ceiling: PolicyCeiling): string | null {
	if (options.length === 0 || options.length > MAX_OPTIONS) return "options must contain 1..16 entries";
	const seen = new Set<string>();
	for (const option of options) {
		if (!option || typeof option !== "object") return "invalid option";
		if (option.id !== "allow" && option.id !== "deny" && option.id !== "allow_with_model") return "unknown option id";
		if (seen.has(option.id)) return "duplicate option id";
		seen.add(option.id);
		if (option.id === "allow_with_model") {
			if (!boundedString(option.model, MAX_MODEL)) return "invalid option model";
			if (!allowedBy(ceiling.allowedModels, option.model)) return "option model outside policy ceiling";
		}
	}
	return null;
}

export const DEFAULT_OPTIONS: PermissionOption[] = [{ id: "allow" }, { id: "deny" }];

/**
 * Issue a permission request, or authorize locally, or deny by policy.
 *
 * Remote sources must pass an explicit `ttlMs`; the effective expiry never
 * exceeds the session's own confirmation budget.
 */
export function issuePermissionRequest(
	input: IssueInput,
	policyInput: PermissionPolicy,
	deps: { now?: number; requestId?: string } = {}
): IssueResult {
	const policy = normalizePolicy(policyInput);
	if (!("allowMode" in policy)) return { ok: false, reason: "invalid_request", detail: policy.error };

	if (!isIdentifier(input.sessionId)) return { ok: false, reason: "invalid_request", detail: "invalid sessionId" };
	if (!isIdentifier(input.controllerId)) return { ok: false, reason: "invalid_request", detail: "invalid controllerId" };
	if (input.source !== "tui" && input.source !== "rpc" && input.source !== "adapter")
		return { ok: false, reason: "invalid_request", detail: "invalid source" };
	const subjectError = validateSubject(input.subject);
	if (subjectError) return { ok: false, reason: "invalid_request", detail: subjectError };

	const evaluation = evaluatePolicy(policy, input.subject);
	if (evaluation.outcome === "deny") return { ok: false, reason: "policy_denied", detail: evaluation.reason };
	if (evaluation.outcome === "auto_allow") return { ok: true, kind: "authorized", authorizedBy: "local_policy" };

	const ttl = input.ttlMs;
	if (input.source !== "tui" && ttl === undefined)
		return { ok: false, reason: "expiry_required", detail: "remote requests must state an explicit ttlMs" };
	if (ttl !== undefined && (!isNonNegativeInteger(ttl) || ttl <= 0))
		return { ok: false, reason: "invalid_request", detail: "ttlMs must be a positive integer" };
	const requested = ttl ?? (policy.confirmTimeoutMs > 0 ? policy.confirmTimeoutMs : 60_000);
	const budget = policy.confirmTimeoutMs > 0 ? policy.confirmTimeoutMs : MAX_REQUEST_TTL_MS;
	const effectiveTtl = Math.min(requested, budget, MAX_REQUEST_TTL_MS);
	if (effectiveTtl <= 0) return { ok: false, reason: "invalid_request", detail: "no bounded expiry available" };

	const options = input.options ?? DEFAULT_OPTIONS;
	const ceiling = snapshotCeiling(policy);
	const optionError = validateOptions(options, ceiling);
	if (optionError) return { ok: false, reason: "invalid_options", detail: optionError };

	const requestId = deps.requestId ?? randomUUID();
	if (!isIdentifier(requestId)) return { ok: false, reason: "invalid_request", detail: "invalid requestId" };

	const now = deps.now ?? Date.now();
	return {
		ok: true,
		kind: "request",
		request: {
			version: PERMISSION_VERSION,
			capability: "subagent.spawn",
			requestId,
			sessionId: input.sessionId,
			controllerId: input.controllerId,
			source: input.source,
			revision: 0,
			subject: { ...input.subject },
			options: options.map((option) => ({ ...option })),
			ceiling,
			createdAt: now,
			expiresAt: now + effectiveTtl,
		},
	};
}

function deny(request: PermissionRequest, reason: DecisionReason, now: number, optionId?: string): PermissionDecision {
	return {
		version: PERMISSION_VERSION,
		requestId: request.requestId,
		sessionId: request.sessionId,
		controllerId: request.controllerId,
		source: request.source,
		revision: request.revision,
		decision: "deny",
		...(optionId ? { optionId } : {}),
		reason,
		decidedAt: now,
	};
}

/**
 * Resolve a response into a terminal decision.
 *
 * Expiry always denies, even in `timeout` mode with `autoDecision: allow`: that
 * fallback is a local policy path and never a remote client's silence.
 */
export function decidePermission(
	request: PermissionRequest,
	response: PermissionResponse,
	context: DecideContext
): PermissionDecision {
	const now = context.now ?? Date.now();
	if (response.requestId !== request.requestId) return deny(request, "unknown_request", now);
	if (context.sessionId !== request.sessionId) return deny(request, "session_mismatch", now);
	if (response.controllerId !== request.controllerId || context.controllerId !== request.controllerId)
		return deny(request, "stale_controller", now);
	if (response.revision !== request.revision) return deny(request, "stale_revision", now);
	if (now >= request.expiresAt) return deny(request, "expired", now);
	if (response.cancelled === true) return deny(request, "cancelled", now);
	if (response.decision !== "allow" && response.decision !== "deny") return deny(request, "invalid_response", now);
	if (response.decision === "deny")
		return deny(request, "explicit_deny", now, typeof response.optionId === "string" ? response.optionId : undefined);

	const option = request.options.find((candidate) => candidate.id === response.optionId);
	if (!option) return deny(request, response.optionId === undefined ? "invalid_response" : "unknown_option", now);
	if (option.id === "deny") return deny(request, "explicit_deny", now, option.id);
	if (option.id === "allow_with_model" && !allowedBy(request.ceiling.allowedModels, option.model))
		return deny(request, "policy_ceiling", now, option.id);
	if (!ceilingAllows(request.ceiling, request.subject)) return deny(request, "policy_ceiling", now, option.id);
	if (!ceilingAllows(context.policy, request.subject)) return deny(request, "policy_ceiling", now, option.id);
	return {
		version: PERMISSION_VERSION,
		requestId: request.requestId,
		sessionId: request.sessionId,
		controllerId: request.controllerId,
		source: request.source,
		revision: request.revision,
		decision: "allow",
		optionId: option.id,
		reason: "explicit_allow",
		decidedAt: now,
	};
}
