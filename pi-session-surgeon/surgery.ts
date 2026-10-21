/**
 * Session JSONL surgery: safe, text-only message replacement with verification.
 *
 * The surgeon agent never hand-edits raw JSONL. It calls this module through the
 * `session_surgery` tool, which only ever changes text content and preserves
 * entry ids, parent links, timestamps and non-text blocks (tool calls/results,
 * thinking, images).
 */

import {
	closeSync,
	copyFileSync,
	existsSync,
	fsyncSync,
	openSync,
	readFileSync,
	renameSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export interface SessionEntry {
	id?: string;
	parentId?: string | null;
	type?: string;
	message?: { role?: string; content?: unknown };
	[key: string]: unknown;
}

export interface SurgeryMessage {
	id: string;
	role: string;
	text: string;
	index: number;
	/** False when the message carries non-text blocks; those are never rewritten. */
	editable: boolean;
}

export class SurgeryError extends Error {}

function asEntry(value: unknown): SessionEntry {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new SurgeryError("entry is not an object");
	const entry = value as SessionEntry;
	if (typeof entry.id !== "string" || !entry.id) throw new SurgeryError("entry has no id");
	if (entry.type !== undefined && typeof entry.type !== "string") throw new SurgeryError("entry.type must be a string");
	return entry;
}

/** Parse a session file; any malformed line fails the whole read (no partial surgery). */
export function parseSession(raw: string): SessionEntry[] {
	const entries: SessionEntry[] = [];
	const lines = raw.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string;
		if (!line.trim()) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch (error) {
			throw new SurgeryError(`line ${i + 1} is not valid JSON: ${error instanceof Error ? error.message : "parse error"}`);
		}
		entries.push(asEntry(parsed));
	}
	if (entries.length === 0) throw new SurgeryError("session file has no entries");
	return entries;
}

export function serializeSession(entries: readonly SessionEntry[]): string {
	return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

function textOf(content: unknown): { text: string; editable: boolean } {
	if (typeof content === "string") return { text: content, editable: true };
	if (!Array.isArray(content)) return { text: "", editable: false };
	const blocks = content as Array<{ type?: string; text?: string }>;
	const editable = blocks.every((block) => block?.type === "text" && typeof block.text === "string");
	const text = editable ? blocks.map((block) => block.text ?? "").join("") : "";
	return { text, editable };
}

/** Every message entry the agent may inspect, in file order. */
export function listMessages(entries: readonly SessionEntry[]): SurgeryMessage[] {
	const messages: SurgeryMessage[] = [];
	entries.forEach((entry, index) => {
		if (entry.type !== "message" || !entry.message) return;
		const role = entry.message.role;
		if (role !== "user" && role !== "assistant") return;
		const { text, editable } = textOf(entry.message.content);
		messages.push({ id: entry.id as string, role, text, index, editable });
	});
	return messages;
}

/**
 * Replace the text of one message. Only string content or a single text block
 * per message is rewritten; mixed or multi-block content is refused so tool
 * calls, results and thinking are never dropped by a rewrite.
 */
export function replaceMessageText(entries: readonly SessionEntry[], id: string, text: string): SessionEntry[] {
	if (typeof text !== "string") throw new SurgeryError("replacement must be a string");
	const target = entries.find((entry) => entry.id === id);
	if (!target) throw new SurgeryError(`no entry with id ${id}`);
	if (target.type !== "message" || !target.message) throw new SurgeryError(`${id} is not a message entry`);
	if (target.message.role !== "user" && target.message.role !== "assistant")
		throw new SurgeryError(`${id} is not a user/assistant message`);
	const content = target.message.content;
	let next: unknown;
	if (typeof content === "string") {
		next = text;
	} else if (Array.isArray(content) && content.length === 1) {
		const block = content[0] as { type?: string; text?: string };
		if (block?.type !== "text" || typeof block.text !== "string")
			throw new SurgeryError(`${id} carries non-text content; refusing to rewrite it`);
		next = [{ ...block, text }];
	} else {
		throw new SurgeryError(`${id} has mixed or multi-block content; refusing to rewrite it`);
	}
	return entries.map((entry) => (entry.id === id ? { ...entry, message: { ...entry.message, content: next } } : entry));
}

export interface VerifyResult {
	ok: boolean;
	errors: string[];
	messages: number;
}

/** Structural checks that must hold before the file is trusted. */
export function verifySession(entries: readonly SessionEntry[]): VerifyResult {
	const errors: string[] = [];
	const ids = new Set<string>();
	for (const entry of entries) {
		const id = entry.id as string;
		if (ids.has(id)) errors.push(`duplicate id ${id}`);
		ids.add(id);
	}
	for (const entry of entries) {
		const parentId = entry.parentId;
		if (parentId === undefined || parentId === null) continue;
		if (typeof parentId !== "string" || !ids.has(parentId)) errors.push(`${entry.id}: missing parent ${String(parentId)}`);
	}
	return { ok: errors.length === 0, errors, messages: listMessages(entries).length };
}

/** Atomic write: temp in the same dir, fsync, rename. Keeps one .bak of the original. */
export function writeSessionAtomic(path: string, entries: readonly SessionEntry[]): void {
	const backup = `${path}.bak`;
	if (existsSync(path) && !existsSync(backup)) copyFileSync(path, backup);
	const temp = join(dirname(path), `.${Date.now()}-${process.pid}.tmp`);
	writeFileSync(temp, serializeSession(entries), { mode: 0o600 });
	const fd = openSync(temp, "r+");
	try {
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	renameSync(temp, path);
}

export function readSessionFile(path: string): SessionEntry[] {
	if (!existsSync(path)) throw new SurgeryError(`session file not found: ${path}`);
	if (!statSync(path).isFile()) throw new SurgeryError(`not a regular file: ${path}`);
	return parseSession(readFileSync(path, "utf8"));
}

/** Compact review summary: which messages changed and how. */
export function diffMessages(before: readonly SessionEntry[], after: readonly SessionEntry[]) {
	const a = new Map(listMessages(before).map((message) => [message.id, message]));
	const rows: { id: string; role: string; before: string; after: string }[] = [];
	for (const message of listMessages(after)) {
		const previous = a.get(message.id);
		if (!previous || previous.text === message.text) continue;
		rows.push({ id: message.id, role: message.role, before: previous.text, after: message.text });
	}
	return rows;
}
