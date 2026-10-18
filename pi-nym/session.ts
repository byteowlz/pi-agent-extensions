/**
 * Turning nym's redacted copy into a native pi session file, and verifying
 * that the selected values are gone from everything pi sends to a model.
 */

import { randomBytes } from "node:crypto";

export const MARKER = "pi-nym";

/** Fields nym never rewrites (identifiers, enums, opaque signatures). Mirrors nym's trace mode. */
const OPAQUE = new Set([
	"id",
	"parentId",
	"timestamp",
	"type",
	"role",
	"toolCallId",
	"toolName",
	"model",
	"modelId",
	"provider",
	"api",
	"stopReason",
	"mimeType",
	"version",
	"customType",
	"responseId",
	"thinkingLevel",
	"thinkingSignature",
	"signature",
	"encrypted_content",
	"textSignature",
]);

/** RFC 9562 UUIDv7, matching pi's session ids. */
export function uuidv7(now = Date.now()): string {
	const bytes = randomBytes(16);
	bytes.writeUIntBE(now, 0, 6);
	bytes[6] = (bytes[6] & 0x0f) | 0x70;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = bytes.toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** `<ISO time with - for :>_<uuid>.jsonl`, like pi's own session files. */
export function sessionFileName(id: string, now = new Date()): string {
	return `${now.toISOString().replace(/[:.]/g, "-")}_${id}.jsonl`;
}

export interface BuildOptions {
	id: string;
	now: Date;
	leafId: string | null;
	redacted: number;
	kept: number;
}

/**
 * Keep the original header (its cwd is local metadata, never model context)
 * with a fresh id, and record a marker entry after the active leaf.
 */
export function buildSession(originalText: string, redactedText: string, options: BuildOptions): string {
	const original = originalText.split("\n");
	const lines = redactedText.split("\n");
	if (original.length !== lines.length) throw new Error("redacted session has a different record count");
	const header = JSON.parse(original[0]) as Record<string, unknown>;
	if (header.type !== "session") throw new Error("session file has no header");
	header.id = options.id;
	header.timestamp = options.now.toISOString();
	header.parentSession = undefined;
	lines[0] = JSON.stringify(header);
	const marker = {
		type: "custom",
		id: randomBytes(4).toString("hex"),
		parentId: options.leafId,
		timestamp: options.now.toISOString(),
		customType: MARKER,
		data: { version: 1, redacted: options.redacted, kept: options.kept },
	};
	const body = lines.join("\n").replace(/\n*$/, "\n");
	return `${body}${JSON.stringify(marker)}\n`;
}

function leaves(value: unknown, key: string, out: string[]): void {
	if (typeof value === "string") {
		if (!OPAQUE.has(key)) out.push(value);
	} else if (Array.isArray(value)) {
		for (const item of value) leaves(item, key, out);
	} else if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		const image = record.type === "image" || "mimeType" in record;
		for (const [k, v] of Object.entries(record)) {
			if (!(image && k === "data")) leaves(v, k, out);
		}
	}
}

/** Every string pi may send to a model; the header (local metadata) is excluded. */
export function contentStrings(sessionText: string): string[] {
	const out: string[] = [];
	for (const line of sessionText.split("\n").slice(1)) {
		if (line.trim()) leaves(JSON.parse(line), "", out);
	}
	return out;
}

const WORD = /[\p{L}\p{N}]/u;

/**
 * Occurrences nym would treat as the value: not continuing a longer word on
 * an alphanumeric edge (digits inside a longer number are not the value).
 */
export function occurrences(text: string, value: string): number {
	if (!value) return 0;
	const first = WORD.test(Array.from(value)[0] ?? "");
	const last = WORD.test(Array.from(value).at(-1) ?? "");
	let count = 0;
	for (let i = text.indexOf(value); i !== -1; i = text.indexOf(value, i + 1)) {
		const before = Array.from(text.slice(Math.max(0, i - 2), i)).at(-1) ?? "";
		const after = Array.from(text.slice(i + value.length, i + value.length + 2))[0] ?? "";
		if (!(first && WORD.test(before)) && !(last && WORD.test(after))) {
			count++;
			i += value.length - 1;
		}
	}
	return count;
}

export interface Residual {
	value: string;
	class: string;
	remaining: number;
}

/**
 * Selected values still present outside values the user kept. nym propagates
 * names, accounts and secrets everywhere, but only replaces short numbers,
 * dates and URLs where it detected them, so those can legitimately remain.
 */
export function residuals(sessionText: string, selected: { value: string; class: string }[], kept: string[]): Residual[] {
	const strings = contentStrings(sessionText);
	const result: Residual[] = [];
	for (const item of selected) {
		let remaining = 0;
		for (const s of strings) {
			let n = occurrences(s, item.value);
			for (const k of kept) {
				if (k !== item.value && k.includes(item.value)) n -= occurrences(s, k) * occurrences(k, item.value);
			}
			remaining += Math.max(0, n);
		}
		if (remaining > 0) result.push({ value: item.value, class: item.class, remaining });
	}
	return result.sort((a, b) => b.remaining - a.remaining);
}

interface Entry {
	type?: string;
	customType?: string;
}

/** True when message content was added after the last pi-nym marker (or there is no marker). */
export function hasUnredactedContent(entries: Entry[]): boolean {
	let sinceMarker = false;
	for (const entry of entries) {
		if (entry.type === "custom" && entry.customType === MARKER) sinceMarker = false;
		else if (entry.type === "message" || entry.type === "custom_message" || entry.type === "compaction") sinceMarker = true;
	}
	return sinceMarker;
}
