import { type Dirent, createReadStream } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

export interface HistoryPrompt {
	id: string;
	text: string;
	createdAt: string;
	label: string;
	source: { sessionId: string; entryId: string; sessionFile?: string };
	attachmentsOmitted: boolean;
}
export interface HistoryResult {
	items: HistoryPrompt[];
	limited: boolean;
	skipped: number;
}
const MAX_TEXT = 128 * 1024;
function object(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}
export function userPrompts(
	entries: readonly unknown[],
	sessionId: string,
	sessionFile?: string,
	label = "session"
): HistoryPrompt[] {
	const result: HistoryPrompt[] = [];
	for (const raw of entries) {
		const entry = object(raw);
		const message = object(entry?.message);
		if (entry?.type !== "message" || message?.role !== "user" || typeof entry.id !== "string") continue;
		const blocks = Array.isArray(message.content) ? message.content.map(object) : [];
		const text =
			typeof message.content === "string"
				? message.content
				: blocks
						.filter((b) => b?.type === "text" && typeof b.text === "string")
						.map((b) => b?.text)
						.join("\n");
		if (!text.trim() || Buffer.byteLength(text) > MAX_TEXT) continue;
		result.push({
			id: `${sessionId}:${entry.id}`,
			text,
			createdAt: typeof entry.timestamp === "string" ? entry.timestamp : "",
			label,
			source: { sessionId, entryId: entry.id, ...(sessionFile ? { sessionFile } : {}) },
			attachmentsOmitted: blocks.some((b) => b?.type !== "text"),
		});
	}
	return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function canonical(path: string) {
	try {
		return await realpath(path);
	} catch {
		return resolve(path);
	}
}
/** Explicit, bounded, asynchronous local history browsing; no indexing/provider calls.
 * Includes all recorded branches, not compaction summaries or projected model context. */
export async function browseHistory(roots: string[], cwd?: string, signal?: AbortSignal): Promise<HistoryResult> {
	if (signal?.aborted) throw new Error("History browsing cancelled");
	const files: { path: string; mtime: number }[] = [];
	let limited = false;
	let skipped = 0;
	const seen = new Set<string>();
	for (const root of new Set(roots)) {
		let children: Dirent[];
		try {
			children = await readdir(root, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const child of children) {
			if (signal?.aborted) throw new Error("History browsing cancelled");
			const parent = join(root, child.name);
			const candidates = child.isDirectory() ? await readdir(parent, { withFileTypes: true }).catch(() => []) : [child];
			for (const file of candidates) {
				if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
				const path = child.isDirectory() ? join(parent, file.name) : parent;
				if (seen.has(path)) continue;
				seen.add(path);
				const stat = await lstat(path).catch(() => undefined);
				if (stat?.isFile() && stat.size <= 8 * 1024 * 1024) files.push({ path, mtime: stat.mtimeMs });
				else skipped++;
				if (files.length >= 2000) {
					limited = true;
					break;
				}
			}
			if (files.length >= 2000) break;
		}
		if (files.length >= 2000) break;
	}
	files.sort((a, b) => b.mtime - a.mtime);
	if (files.length > 100) limited = true;
	const target = cwd ? await canonical(cwd) : undefined;
	const items: HistoryPrompt[] = [];
	let bytes = 0;
	for (const file of files.slice(0, 100)) {
		if (signal?.aborted) throw new Error("History browsing cancelled");
		const stream = createReadStream(file.path, { encoding: "utf8", signal });
		const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
		const records: unknown[] = [];
		let header: Record<string, unknown> | undefined;
		try {
			for await (const line of lines) {
				bytes += Buffer.byteLength(line);
				if (bytes > 32 * 1024 * 1024 || line.length > 1024 * 1024) {
					limited = true;
					break;
				}
				let entry: unknown;
				try {
					entry = JSON.parse(line);
				} catch {
					skipped++;
					continue;
				}
				const row = object(entry);
				if (!header) {
					if (row?.type !== "session" || typeof row.id !== "string") {
						skipped++;
						break;
					}
					header = row;
					if (target && (typeof row.cwd !== "string" || (await canonical(row.cwd)) !== target)) break;
				} else if (row?.type === "message" && object(row.message)?.role === "user") records.push(entry);
			}
			if (header) items.push(...userPrompts(records, String(header.id), file.path, file.path.split("/").at(-1)));
		} catch {
			skipped++;
		} finally {
			lines.close();
			stream.destroy();
		}
		if (signal?.aborted) throw new Error("History browsing cancelled");
		if (bytes > 32 * 1024 * 1024 || items.length >= 1000) {
			limited = true;
			break;
		}
	}
	return { items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 1000), limited, skipped };
}
