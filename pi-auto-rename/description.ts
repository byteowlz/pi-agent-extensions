/**
 * Routing description for a session.
 *
 * Stored as an append-only custom session entry (`CustomEntry`), which Pi keeps
 * in the session JSONL but excludes from LLM context. The entry is routing
 * *metadata*, never authority: consumers must treat it as an untrusted hint and
 * must not derive permissions from it.
 */

export const DESCRIPTION_ENTRY_TYPE = "pi-auto-rename:description/v1";
export const DESCRIPTION_EVENT = "pi-auto-rename:described/v1";
export const MAX_DESCRIPTION_LENGTH = 280;
export const MAX_TOPICS = 8;
export const MAX_TOPIC_LENGTH = 32;

export interface SessionDescription {
	version: 1;
	description: string;
	topics: string[];
	by: "agent" | "human";
	revision: number;
	updatedAt: string;
	/** Session that authored the record; used to detect fork inheritance. */
	sessionId?: string;
	/** Parent session id when this record was inherited by a fork. */
	inheritedFrom?: string;
	/** Explicit human clear; readers treat it as "no description". */
	cleared?: true;
}

export type Normalized<T> = { ok: true; value: T } | { ok: false; error: string };

const SECRET_PATTERNS: readonly RegExp[] = [
	/-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
	/\b(password|passwd|secret|token|api[_-]?key|access[_-]?key)\s*[:=]/i,
	/\b(sk|pk|rk|ghp|gho|ghu|ghs|glpat|xox[baprs]|AKIA|ASIA)[-_A-Za-z0-9]{8,}\b/,
	/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./,
	/\b[0-9a-f]{32,}\b/i,
];

/** One line, bounded, control-free, and free of secret-shaped text. */
export function normalizeDescription(raw: unknown): Normalized<string> {
	if (typeof raw !== "string") return { ok: false, error: "description must be a string" };
	const value = raw
		.replace(/\p{Cc}/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (!value) return { ok: false, error: "description must not be empty" };
	if (Array.from(value).length > MAX_DESCRIPTION_LENGTH)
		return { ok: false, error: `description exceeds ${MAX_DESCRIPTION_LENGTH} characters; keep it to one short line` };
	if (SECRET_PATTERNS.some((pattern) => pattern.test(value)))
		return { ok: false, error: "description looks like it contains a secret; describe the work, not credentials" };
	return { ok: true, value };
}

/** Optional routing tags: lower-case slugs, deduplicated and bounded. */
export function normalizeTopics(raw: unknown): Normalized<string[]> {
	if (raw === undefined || raw === null) return { ok: true, value: [] };
	if (!Array.isArray(raw)) return { ok: false, error: "topics must be an array of short slugs" };
	const value: string[] = [];
	for (const entry of raw) {
		if (typeof entry !== "string") return { ok: false, error: "topics must be strings" };
		const topic = entry.trim().toLowerCase();
		if (!/^[a-z0-9][a-z0-9._-]*$/.test(topic) || topic.length > MAX_TOPIC_LENGTH)
			return { ok: false, error: `invalid topic "${entry}"; use lower-case slugs up to ${MAX_TOPIC_LENGTH} characters` };
		if (!value.includes(topic)) value.push(topic);
	}
	if (value.length > MAX_TOPICS) return { ok: false, error: `at most ${MAX_TOPICS} topics` };
	return { ok: true, value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseEntry(data: unknown): SessionDescription | undefined {
	if (!isRecord(data)) return undefined;
	const { version, description, topics, by, revision, updatedAt, sessionId, inheritedFrom, cleared } = data;
	if (version !== 1 || typeof description !== "string") return undefined;
	if (by !== "agent" && by !== "human") return undefined;
	if (typeof revision !== "number" || !Number.isFinite(revision)) return undefined;
	if (typeof updatedAt !== "string") return undefined;
	const list = Array.isArray(topics) ? topics.filter((topic): topic is string => typeof topic === "string") : [];
	const record: SessionDescription = {
		version: 1,
		description,
		topics: list,
		by,
		revision: Math.floor(revision),
		updatedAt,
	};
	if (typeof sessionId === "string") record.sessionId = sessionId;
	if (typeof inheritedFrom === "string") record.inheritedFrom = inheritedFrom;
	if (cleared === true) record.cleared = true;
	return record;
}

/**
 * Latest valid description on a branch, or undefined when absent/cleared.
 * Callers pass `sessionManager.getBranch()`; custom entries are ignored by the
 * model context but remain available here.
 */
export function readSessionDescription(entries: readonly unknown[]): SessionDescription | undefined {
	let latest: SessionDescription | undefined;
	for (const entry of entries) {
		if (!isRecord(entry) || entry.type !== "custom" || entry.customType !== DESCRIPTION_ENTRY_TYPE) continue;
		const record = parseEntry(entry.data);
		if (record) latest = record;
	}
	return latest && !latest.cleared ? latest : undefined;
}

/** Compact payload for status/event consumers. */
export function describePayload(record: SessionDescription): {
	description: string;
	topics: string[];
	by: "agent" | "human";
	updatedAt: string;
	revision: number;
} {
	return {
		description: record.description,
		topics: record.topics,
		by: record.by,
		updatedAt: record.updatedAt,
		revision: record.revision,
	};
}
