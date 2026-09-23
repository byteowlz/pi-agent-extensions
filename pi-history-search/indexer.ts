/**
 * History indexer — a SQLite FTS5 index, colocated per project.
 *
 * pi stores sessions at `<base>/--{safe_cwd}--/{ts}_{id}.jsonl`. We place one
 * index database *inside each project's session directory*:
 *
 *   <base>/--{safe_cwd}--/.pi-history/index.db
 *
 * This is the key design decision: the index is reachable exactly when the
 * sessions it indexes are reachable. Under an oqto sandbox that restricts an
 * agent to its own sessions, the matching index is restricted with it — there
 * is no shared global database that could leak other projects' history. With no
 * sandbox at all, the same layout simply gives one index per project.
 *
 * The current project is indexed read-write and incrementally (by mtime). Other
 * projects (reached only via `scope: "all"`) are queried read-only if an index
 * exists, otherwise scanned live — we never write into another project's dir.
 */

import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import { createRequire } from "node:module";
import * as path from "node:path";
import type { HistorySearchConfig } from "./config.js";

const require = createRequire(import.meta.url);

// ── Runtime-agnostic SQLite ──────────────────────────────────────────
//
// pi runs under Node, where `node:sqlite` (Node ≥ 22.5) provides FTS5. Bun
// ships an equivalent `bun:sqlite`. Both expose the same minimal surface we
// need, so we load whichever the host provides and fall back to a live JSONL
// scan when neither exists (older Node). This keeps the extension lean (no
// native dependency to build or version-match) and runtime-agnostic.

interface SqlStatement {
	all(...params: unknown[]): unknown[];
	get(...params: unknown[]): unknown;
	run(...params: unknown[]): unknown;
}
interface SqlDatabase {
	prepare(sql: string): SqlStatement;
	exec(sql: string): void;
	close(): void;
}
type SqlOpener = (dbPath: string, readonly: boolean) => SqlDatabase;

let _opener: SqlOpener | null | undefined;

function loadOpener(): SqlOpener | null {
	const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
	const candidates = isBun ? ["bun:sqlite", "node:sqlite"] : ["node:sqlite", "bun:sqlite"];
	for (const mod of candidates) {
		try {
			const m = require(mod) as Record<string, unknown>;
			if (mod === "node:sqlite" && typeof m.DatabaseSync === "function") {
				const Ctor = m.DatabaseSync as new (p: string, o?: { readOnly?: boolean }) => SqlDatabase;
				return (p, ro) => new Ctor(p, ro ? { readOnly: true } : undefined);
			}
			if (mod === "bun:sqlite" && typeof m.Database === "function") {
				const Ctor = m.Database as new (p: string, o?: { readonly?: boolean }) => SqlDatabase;
				return (p, ro) => (ro ? new Ctor(p, { readonly: true }) : new Ctor(p));
			}
		} catch {
			// Module not available in this runtime — try the next candidate.
		}
	}
	return null;
}

function getOpener(): SqlOpener | null {
	if (_opener !== undefined) return _opener;
	_opener = loadOpener();
	return _opener;
}

/** Whether a SQLite FTS index is available; when false, search uses a live scan. */
export function sqliteAvailable(): boolean {
	return getOpener() !== null;
}

// ── Public shapes ────────────────────────────────────────────────────

export interface ExtractedMessage {
	role: "user" | "assistant" | "toolResult" | string;
	text: string;
}

export interface HistoryMatch {
	role: string;
	/** Ordinal of the message within the session (stable, config-independent). */
	msgIndex: number;
	snippet: string;
}

export interface BranchMeta {
	branchId: string;
	parentBranchId: string | null;
	rootSessionId: string;
	forkMsgIndex: number | null;
	createdAt: string;
	updatedAt: string;
	cwd: string;
	lastCwd: string;
	messageCount: number;
	lastUserPreview: string | null;
	lastAssistantPreview: string | null;
	recentFiles: string[];
	recentCommands: string[];
	alias?: string;
}

export interface HistoryHit {
	sessionId: string;
	project: string;
	timestamp: string;
	title: string | null;
	/** Human display name (from session_info entries), if any. */
	sessionName: string | null;
	matches: HistoryMatch[];
	branch?: BranchMeta;
}

export interface IndexStats {
	indexPath: string;
	totalSessions: number;
	totalChunks: number;
	lastUpdated: string | null;
}

const CHUNK_SIZE = 4000; // characters per FTS row
const INDEX_SUBDIR = ".pi-history";
const SNIPPET_OPEN = "«";
const SNIPPET_CLOSE = "»";

// ── Path helpers ─────────────────────────────────────────────────────

/** Mirror pi's encoding: strip leading `/`, replace `/` with `-`, wrap in `--`. */
export function safeDirFromCwd(cwd: string): string {
	const safe = cwd.replace(/^\//, "").replace(/\//g, "-");
	return `--${safe}--`;
}

/** Human-ish project label from an encoded session directory name. */
export function prettyProject(dirName: string): string {
	return dirName.replace(/^--/, "").replace(/--$/, "") || "unknown";
}

export function projectDir(base: string, cwd: string): string {
	return path.join(base, safeDirFromCwd(cwd));
}

function indexDbPath(projDir: string): string {
	return path.join(projDir, INDEX_SUBDIR, "index.db");
}

/** Session id is the filename suffix: `{ts}_{id}.jsonl`. */
export function sessionIdFromFilename(filename: string): string {
	const m = filename.replace(/\.jsonl$/, "").match(/_([^_]+)$/);
	return m ? m[1] : filename.replace(/\.jsonl$/, "");
}

/** Reconstruct an ISO timestamp from `2026-02-18T16-02-59-202Z_uuid.jsonl`. */
export function timestampFromFilename(filename: string): string {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/.test(filename)) return "";
	return filename
		.replace(/\.jsonl$/, "")
		.replace(/_[^_]+$/, "")
		.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d+)Z/, "T$1:$2:$3.$4Z");
}

export function listSessionFiles(projDir: string): string[] {
	let entries: string[];
	try {
		entries = fs.readdirSync(projDir);
	} catch {
		return [];
	}
	return entries.filter((f) => f.endsWith(".jsonl"));
}

// ── Extraction ───────────────────────────────────────────────────────

function blocksToText(content: unknown, includeTypes: Set<string>): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const block of content as Record<string, unknown>[]) {
		if (block && includeTypes.has(block.type as string) && typeof block.text === "string") {
			parts.push(block.text);
		}
	}
	return parts.join("\n");
}

const TEXT_ONLY = new Set(["text"]);

/**
 * Extract one entry per `message` record, in file order. The ordinal of each
 * entry is the stable `msgIndex` used by HistorySearch and HistoryRead. Assistant
 * thinking blocks and tool calls are dropped from the indexed text but the entry
 * is still emitted so ordinals never shift. Also returns the session display name
 * (from the last `session_info` entry) and the first user message.
 */
export function extractMessages(data: string): {
	messages: ExtractedMessage[];
	firstUserMessage: string | null;
	sessionName: string | null;
} {
	const messages: ExtractedMessage[] = [];
	let firstUserMessage: string | null = null;
	let sessionName: string | null = null;

	for (const line of data.split("\n")) {
		if (!line.trim()) continue;
		let entry: { type?: string; name?: unknown; message?: { role?: string; content?: unknown } };
		try {
			entry = JSON.parse(line);
		} catch {
			continue;
		}
		if (entry.type === "session_info") {
			if (typeof entry.name === "string" && entry.name.trim()) sessionName = entry.name.trim();
			continue;
		}
		if (entry.type !== "message" || !entry.message) continue;

		const role = entry.message.role ?? "unknown";
		const text = blocksToText(entry.message.content, TEXT_ONLY);
		messages.push({ role, text });
		if (role === "user" && !firstUserMessage && text) {
			firstUserMessage = text.slice(0, 200);
		}
	}

	return { messages, firstUserMessage, sessionName };
}

// ── Query sanitization (ported from the reference) ───────────────────

export function sanitizeTokens(query: string): string[] {
	return query
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
}

function buildFtsQuery(tokens: string[]): string {
	if (tokens.length === 0) return "";
	return tokens.map((t, i) => (i === tokens.length - 1 ? `"${t}"*` : `"${t}"`)).join(" ");
}

// ── Role filtering ───────────────────────────────────────────────────
//
// Session content is noisy with tool output (file dumps, docs). Filtering by
// role lets callers focus on the conversation (user + assistant) — far higher
// signal for "what did we do" recall — or target tool output for error/path
// recall.

export type RoleFilter = "all" | "conversation" | "user" | "assistant" | "tool";

/** SQL roles for a filter, or null for "all" (no role clause). */
function rolesFor(filter: RoleFilter): string[] | null {
	switch (filter) {
		case "conversation":
			return ["user", "assistant"];
		case "user":
			return ["user"];
		case "assistant":
			return ["assistant"];
		case "tool":
			return ["toolResult"];
		default:
			return null;
	}
}

export function roleAllowed(role: string, filter: RoleFilter): boolean {
	const roles = rolesFor(filter);
	return roles === null || roles.includes(role);
}

/** `AND role IN ('user','assistant')`-style clause for FTS queries (empty for "all"). */
function roleSqlClause(filter: RoleFilter): string {
	const roles = rolesFor(filter);
	if (!roles) return "";
	return ` AND role IN (${roles.map((r) => `'${r}'`).join(", ")})`;
}

// ── Database lifecycle ───────────────────────────────────────────────

const openDbs = new Map<string, { db: SqlDatabase; writable: boolean }>();

/** Run a function inside a transaction; rolls back on throw. */
function tx(db: SqlDatabase, fn: () => void): void {
	db.exec("BEGIN");
	try {
		fn();
		db.exec("COMMIT");
	} catch (e) {
		try {
			db.exec("ROLLBACK");
		} catch {
			// ignore rollback failure
		}
		throw e;
	}
}

function tableExists(db: SqlDatabase, name: string): boolean {
	try {
		const row = db
			.prepare("SELECT 1 AS x FROM sqlite_master WHERE type IN ('table','virtual') AND name = ?")
			.get(name) as unknown as { x?: number } | undefined;
		return !!row;
	} catch {
		return false;
	}
}

/** Create the FTS5 virtual table, trying progressively simpler tokenizers. */
function createFtsTable(db: SqlDatabase): boolean {
	const variants = [
		"content, session_path UNINDEXED, role UNINDEXED, msg_index UNINDEXED, tokenize='porter unicode61'",
		"content, session_path UNINDEXED, role UNINDEXED, msg_index UNINDEXED, tokenize='unicode61'",
		"content, session_path UNINDEXED, role UNINDEXED, msg_index UNINDEXED",
	];
	for (const cols of variants) {
		try {
			db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(${cols})`);
			if (tableExists(db, "messages_fts")) return true;
		} catch {
			// try the next tokenizer variant
		}
	}
	return false;
}

function initSchema(db: SqlDatabase): void {
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA synchronous = NORMAL");
	db.exec("PRAGMA busy_timeout = 5000");
	db.exec(`
		CREATE TABLE IF NOT EXISTS sessions (
			path TEXT PRIMARY KEY,
			session_id TEXT,
			session_ts TEXT,
			mtime_ms INTEGER NOT NULL,
			first_user_message TEXT
		);
		CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
	`);
	createFtsTable(db);
}

/** Idempotent schema migrations. Safe to call repeatedly; cheap (a PRAGMA probe). */
function migrateSchema(db: SqlDatabase): void {
	const cols = db.prepare("PRAGMA table_info(sessions)").all() as unknown as { name: string }[];
	if (!cols.some((c) => c.name === "session_name")) {
		db.exec("ALTER TABLE sessions ADD COLUMN session_name TEXT");
	}
}

/** Open (and cache) the index for a project dir. Returns null when unavailable. */
function openDb(projDir: string, mode: "rw" | "ro"): SqlDatabase | null {
	const dbPath = indexDbPath(projDir);
	const cached = openDbs.get(dbPath);
	if (cached) {
		// Re-run idempotent migrations on any writable handle, so a schema upgrade
		// applied after the handle was first opened still takes effect.
		if (cached.writable) migrateSchema(cached.db);
		return cached.db;
	}

	const opener = getOpener();
	if (!opener) return null;

	try {
		if (mode === "rw") {
			fs.mkdirSync(path.dirname(dbPath), { recursive: true });
			const db = opener(dbPath, false);
			initSchema(db);
			migrateSchema(db);
			// A DB that lacks the FTS table (partial/broken earlier build) is unusable;
			// fall back to a live scan rather than crash on a query.
			if (!tableExists(db, "messages_fts")) {
				try {
					db.close();
				} catch {
					// ignore
				}
				return null;
			}
			openDbs.set(dbPath, { db, writable: true });
			return db;
		}
		if (!fs.existsSync(dbPath)) return null;
		const db = opener(dbPath, true);
		// Read-only handles must have the FTS table; otherwise treat as unavailable
		// so callers fall back to a live scan instead of hitting "no such table".
		if (!tableExists(db, "messages_fts")) {
			try {
				db.close();
			} catch {
				// ignore
			}
			return null;
		}
		openDbs.set(dbPath, { db, writable: false });
		return db;
	} catch {
		return null;
	}
}

export function closeAll(): void {
	for (const { db } of openDbs.values()) {
		try {
			db.close();
		} catch {
			// ignore
		}
	}
	openDbs.clear();
}

// ── Incremental indexing (current project, read-write) ───────────────

function yieldTick(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

interface PreparedStatements {
	upsert: SqlStatement;
	deleteFts: SqlStatement;
	insertFts: SqlStatement;
}

function indexOneFile(
	stmts: PreparedStatements,
	filePath: string,
	mtime: number,
	config: HistorySearchConfig,
	data: string
): void {
	const filename = path.basename(filePath);
	const { messages, firstUserMessage, sessionName } = extractMessages(data);

	stmts.deleteFts.run(filePath);
	stmts.upsert.run(
		filePath,
		sessionIdFromFilename(filename),
		timestampFromFilename(filename),
		mtime,
		firstUserMessage,
		sessionName
	);

	for (let i = 0; i < messages.length; i++) {
		const m = messages[i];
		if (!m.text) continue;
		if (m.role === "toolResult" && !config.includeToolResults) continue;
		for (let off = 0; off < m.text.length; off += CHUNK_SIZE) {
			stmts.insertFts.run(m.text.slice(off, off + CHUNK_SIZE), filePath, m.role, i);
		}
	}
}

/**
 * Bring the current project's index up to date. Returns the number of session
 * files re-indexed this run. Throws only if the index cannot be opened RW.
 */
export async function updateProjectIndex(projDir: string, config: HistorySearchConfig): Promise<number> {
	const db = openDb(projDir, "rw");
	if (!db) throw new Error(`Cannot open index (read-only?) for ${projDir}`);

	const files = listSessionFiles(projDir);
	const indexed = new Map<string, number>();
	for (const row of db.prepare("SELECT path, mtime_ms FROM sessions").all() as unknown as { path: string; mtime_ms: number }[]) {
		indexed.set(row.path, row.mtime_ms);
	}

	const present = new Set<string>();
	const toIndex: { filePath: string; mtime: number }[] = [];
	for (const filename of files) {
		const filePath = path.join(projDir, filename);
		present.add(filePath);
		let mtime: number;
		try {
			// Floor to integer ms: the mtime_ms column has INTEGER affinity, so a
			// fractional value would be coerced on store and re-trigger indexing.
			mtime = Math.floor((await fsp.stat(filePath)).mtimeMs);
		} catch {
			continue;
		}
		const prev = indexed.get(filePath);
		if (prev === undefined || mtime > prev) toIndex.push({ filePath, mtime });
	}

	// Drop sessions that disappeared.
	const removed = [...indexed.keys()].filter((p) => !present.has(p));
	if (removed.length > 0) {
		const delSession = db.prepare("DELETE FROM sessions WHERE path = ?");
		const delFts = db.prepare("DELETE FROM messages_fts WHERE session_path = ?");
		tx(db, () => {
			for (const p of removed) {
				delSession.run(p);
				delFts.run(p);
			}
		});
	}

	if (toIndex.length === 0) return 0;

	const stmts: PreparedStatements = {
		upsert: db.prepare(
			"INSERT OR REPLACE INTO sessions (path, session_id, session_ts, mtime_ms, first_user_message, session_name) VALUES (?, ?, ?, ?, ?, ?)"
		),
		deleteFts: db.prepare("DELETE FROM messages_fts WHERE session_path = ?"),
		insertFts: db.prepare("INSERT INTO messages_fts (content, session_path, role, msg_index) VALUES (?, ?, ?, ?)"),
	};

	const BATCH = 20;
	for (let start = 0; start < toIndex.length; start += BATCH) {
		const batch = toIndex.slice(start, start + BATCH);
		const loaded = await Promise.all(
			batch.map(async (item) => {
				try {
					return { ...item, data: await fsp.readFile(item.filePath, "utf-8") };
				} catch {
					return null;
				}
			})
		);
		tx(db, () => {
			for (const item of loaded) {
				if (item) indexOneFile(stmts, item.filePath, item.mtime, config, item.data);
			}
		});
		if (start + BATCH < toIndex.length) await yieldTick();
	}

	db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('last_updated', ?)").run(new Date().toISOString());
	return toIndex.length;
}

export async function rebuildProjectIndex(projDir: string, config: HistorySearchConfig): Promise<number> {
	const db = openDb(projDir, "rw");
	if (!db) throw new Error(`Cannot open index (read-only?) for ${projDir}`);
	db.exec("DELETE FROM messages_fts; DELETE FROM sessions; DELETE FROM meta;");
	return updateProjectIndex(projDir, config);
}

// ── Searching one indexed project ────────────────────────────────────

function snippetsForSession(
	db: SqlDatabase,
	ftsQuery: string,
	sessionPath: string,
	limit: number,
	roleFilter: RoleFilter
): HistoryMatch[] {
	const rows = db
		.prepare(
			`SELECT role, msg_index AS msgIndex, snippet(messages_fts, 0, '${SNIPPET_OPEN}', '${SNIPPET_CLOSE}', ' … ', 18) AS snippet
			 FROM messages_fts
			 WHERE messages_fts MATCH ? AND session_path = ?${roleSqlClause(roleFilter)}
			 ORDER BY rank
			 LIMIT ?`
		)
		.all(ftsQuery, sessionPath, limit) as unknown as HistoryMatch[];
	return rows.map((r) => ({ role: r.role, msgIndex: Number(r.msgIndex), snippet: r.snippet }));
}

function searchDb(
	db: SqlDatabase,
	project: string,
	query: string,
	limit: number,
	snippetsPerSession: number,
	roleFilter: RoleFilter,
	allowedSessionIds?: Set<string>
): HistoryHit[] {
	if (allowedSessionIds?.size === 0) return [];
	const tokens = sanitizeTokens(query);
	const ftsQuery = buildFtsQuery(tokens);
	if (!ftsQuery) return [];

	const sessionFilter =
		allowedSessionIds && allowedSessionIds.size > 0
			? ` AND session_path IN (SELECT path FROM sessions WHERE session_id IN (${[...allowedSessionIds]
					.map((id) => `'${id.replace(/'/g, "''")}'`)
					.join(", ")}))`
			: "";
	const best = db
		.prepare(
			`SELECT session_path AS path, MIN(rank) AS br
			 FROM messages_fts WHERE messages_fts MATCH ?${roleSqlClause(roleFilter)}${sessionFilter}
			 GROUP BY session_path ORDER BY br LIMIT ?`
		)
		.all(ftsQuery, limit) as unknown as { path: string; br: number }[];

	const meta = db.prepare("SELECT session_id, session_ts, first_user_message, session_name FROM sessions WHERE path = ?");
	const hits: HistoryHit[] = [];
	for (const row of best) {
		const m = meta.get(row.path) as unknown as
			| { session_id: string; session_ts: string; first_user_message: string | null; session_name: string | null }
			| undefined;
		hits.push({
			sessionId: m?.session_id ?? path.basename(row.path),
			project,
			timestamp: m?.session_ts ?? "",
			title: m?.first_user_message ?? null,
			sessionName: m?.session_name ?? null,
			matches: snippetsForSession(db, ftsQuery, row.path, snippetsPerSession, roleFilter),
		});
	}
	return hits;
}

// ── Live scan fallback (read-only cross-project dirs) ─────────────────

function makeSnippet(text: string, tokens: string[]): string {
	const lower = text.toLowerCase();
	let at = -1;
	for (const t of tokens) {
		const idx = lower.indexOf(t.toLowerCase());
		if (idx >= 0 && (at < 0 || idx < at)) at = idx;
	}
	if (at < 0) at = 0;
	const from = Math.max(0, at - 60);
	const slice = text.slice(from, from + 200);
	return (from > 0 ? "… " : "") + slice + (from + 200 < text.length ? " …" : "");
}

function scanFile(
	filePath: string,
	tokens: string[],
	snippetsPerSession: number,
	roleFilter: RoleFilter
): { score: number; matches: HistoryMatch[]; firstUserMessage: string | null; sessionName: string | null } {
	let data: string;
	try {
		data = fs.readFileSync(filePath, "utf-8");
	} catch {
		return { score: 0, matches: [], firstUserMessage: null, sessionName: null };
	}
	const { messages, firstUserMessage, sessionName } = extractMessages(data);
	const matches: HistoryMatch[] = [];
	let score = 0;
	for (let i = 0; i < messages.length; i++) {
		if (!roleAllowed(messages[i].role, roleFilter)) continue;
		const lower = messages[i].text.toLowerCase();
		if (!lower) continue;
		let hits = 0;
		for (const t of tokens) if (lower.includes(t.toLowerCase())) hits++;
		if (hits !== tokens.length) continue;
		score = Math.max(score, hits);
		if (matches.length < snippetsPerSession) {
			matches.push({ role: messages[i].role, msgIndex: i, snippet: makeSnippet(messages[i].text, tokens) });
		}
	}
	return { score, matches, firstUserMessage, sessionName };
}

function scanProject(
	projDir: string,
	project: string,
	query: string,
	limit: number,
	snippetsPerSession: number,
	roleFilter: RoleFilter,
	allowedSessionIds?: Set<string>
): HistoryHit[] {
	const tokens = sanitizeTokens(query);
	if (tokens.length === 0) return [];
	const scored: { hit: HistoryHit; score: number }[] = [];
	for (const filename of listSessionFiles(projDir)) {
		const sessionId = sessionIdFromFilename(filename);
		if (allowedSessionIds && !allowedSessionIds.has(sessionId)) continue;
		const filePath = path.join(projDir, filename);
		const { score, matches, firstUserMessage, sessionName } = scanFile(filePath, tokens, snippetsPerSession, roleFilter);
		if (score === 0) continue;
		scored.push({
			score,
			hit: {
				sessionId: sessionIdFromFilename(filename),
				project,
				timestamp: timestampFromFilename(filename),
				title: firstUserMessage,
				sessionName,
				matches,
			},
		});
	}
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, limit).map((s) => s.hit);
}

/**
 * Search a single project dir. The current project gets fresh incremental
 * indexing; other dirs use an existing index if present, else a live scan.
 */
export async function searchProject(
	projDir: string,
	query: string,
	config: HistorySearchConfig,
	limit: number,
	isCurrent: boolean,
	roleFilter: RoleFilter = "all",
	allowedSessionIds?: Set<string>
): Promise<HistoryHit[]> {
	const project = prettyProject(path.basename(projDir));
	if (isCurrent) {
		try {
			await updateProjectIndex(projDir, config);
			const db = openDb(projDir, "rw");
			if (db) return searchDb(db, project, query, limit, config.snippetsPerSession, roleFilter, allowedSessionIds);
		} catch {
			// fall through to read-only / scan
		}
	}
	const ro = openDb(projDir, "ro");
	if (ro) {
		try {
			return searchDb(ro, project, query, limit, config.snippetsPerSession, roleFilter, allowedSessionIds);
		} catch {
			// fall through to a live scan if the index is unusable
		}
	}
	return scanProject(projDir, project, query, limit, config.snippetsPerSession, roleFilter, allowedSessionIds);
}

/**
 * Query a project's existing index without re-indexing — for the interactive
 * overlay, which refreshes the index once on open then searches per keystroke.
 * Falls back to a live scan when no index is available.
 */
export function queryProject(
	projDir: string,
	query: string,
	config: HistorySearchConfig,
	limit: number,
	roleFilter: RoleFilter = "all"
): HistoryHit[] {
	const project = prettyProject(path.basename(projDir));
	// Prefer a writable handle so migrations run even on first query; fall back to RO.
	const db = openDb(projDir, "rw") ?? openDb(projDir, "ro");
	if (db) {
		try {
			return searchDb(db, project, query, limit, config.snippetsPerSession, roleFilter);
		} catch {
			// fall through to a live scan if the index is unusable
		}
	}
	return scanProject(projDir, project, query, limit, config.snippetsPerSession, roleFilter);
}

/** Most recent sessions in a project (for the overlay's empty-query view). */
export function listRecent(projDir: string, limit: number, allowedSessionIds?: Set<string>): HistoryHit[] {
	if (allowedSessionIds?.size === 0) return [];
	const project = prettyProject(path.basename(projDir));
	const db = openDb(projDir, "rw") ?? openDb(projDir, "ro");
	if (db) {
		const where =
			allowedSessionIds && allowedSessionIds.size > 0
				? `WHERE session_id IN (${[...allowedSessionIds].map((id) => `'${id.replace(/'/g, "''")}'`).join(", ")})`
				: "";
		const rows = db
			.prepare(
				`SELECT session_id, session_ts, first_user_message, session_name FROM sessions ${where} ORDER BY session_ts DESC LIMIT ?`
			)
			.all(limit) as unknown as {
			session_id: string;
			session_ts: string;
			first_user_message: string | null;
			session_name: string | null;
		}[];
		return rows.map((r) => ({
			sessionId: r.session_id,
			project,
			timestamp: r.session_ts,
			title: r.first_user_message,
			sessionName: r.session_name,
			matches: [],
		}));
	}
	// No index: derive from filenames, newest first.
	const files = listSessionFiles(projDir)
		.filter((f) => !allowedSessionIds || allowedSessionIds.has(sessionIdFromFilename(f)))
		.sort()
		.reverse()
		.slice(0, limit);
	return files.map((filename) => ({
		sessionId: sessionIdFromFilename(filename),
		project,
		timestamp: timestampFromFilename(filename),
		title: null,
		sessionName: null,
		matches: [],
	}));
}

/** All project dirs under the sessions base (each `--cwd--` directory). */
export function listProjectDirs(base: string): string[] {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(base, { withFileTypes: true });
	} catch {
		return [];
	}
	return entries.filter((e) => e.isDirectory()).map((e) => path.join(base, e.name));
}

// ── Branch/session metadata ─────────────────────────────────────────

interface SessionHeader {
	sessionId: string;
	filePath: string;
	parentSessionId: string | null;
	timestamp: string;
	cwd: string;
}

function extractTextBlock(content: unknown): string {
	if (!Array.isArray(content)) return "";
	const text = content
		.map((b) => (b && typeof b === "object" && (b as { type?: string }).type === "text" ? (b as { text?: string }).text : ""))
		.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
	return text;
}

function extractPathLikes(input: unknown, out: Set<string>): void {
	if (!input) return;
	if (typeof input === "string") {
		if (input.includes("/") || input.endsWith(".ts") || input.endsWith(".js") || input.endsWith(".json")) {
			out.add(input);
		}
		return;
	}
	if (Array.isArray(input)) {
		for (const v of input) extractPathLikes(v, out);
		return;
	}
	if (typeof input === "object") {
		for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
			if (["path", "file", "filePath", "target", "cwd", "oldPath", "newPath"].includes(k)) extractPathLikes(v, out);
			else if (typeof v === "object") extractPathLikes(v, out);
		}
	}
}

function parseSessionHeader(filePath: string): SessionHeader | null {
	try {
		const first = fs.readFileSync(filePath, "utf-8").split("\n", 1)[0];
		if (!first) return null;
		const o = JSON.parse(first) as Record<string, unknown>;
		if (o.type !== "session") return null;
		const parentPath = typeof o.parentSession === "string" ? o.parentSession : null;
		return {
			sessionId: String(o.id ?? sessionIdFromFilename(path.basename(filePath))),
			filePath,
			parentSessionId: parentPath ? sessionIdFromFilename(path.basename(parentPath)) : null,
			timestamp: typeof o.timestamp === "string" ? o.timestamp : timestampFromFilename(path.basename(filePath)),
			cwd: typeof o.cwd === "string" ? o.cwd : "",
		};
	} catch {
		return null;
	}
}

function computeForkMsgIndex(parentFilePath: string | null, childFirstParentId: string | null): number | null {
	if (!parentFilePath || !childFirstParentId) return null;
	try {
		const lines = fs.readFileSync(parentFilePath, "utf-8").split("\n");
		let msgIndex = -1;
		for (const line of lines) {
			if (!line.trim()) continue;
			const e = JSON.parse(line) as Record<string, unknown>;
			if (e.type !== "message") continue;
			msgIndex += 1;
			if (e.id === childFirstParentId) return msgIndex;
		}
	} catch {
		// ignore parse failures
	}
	return null;
}

function buildBranchMeta(
	filePath: string,
	headersById: Map<string, SessionHeader>,
	aliases: Record<string, string>
): BranchMeta | null {
	const header = parseSessionHeader(filePath);
	if (!header) return null;
	let data: string;
	try {
		data = fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
	const lines = data.split("\n");
	let messageCount = 0;
	let lastUserPreview: string | null = null;
	let lastAssistantPreview: string | null = null;
	const lastCwd = header.cwd;
	let updatedAt = header.timestamp;
	let childFirstParentId: string | null = null;
	const commands: string[] = [];
	const files = new Set<string>();

	for (const line of lines) {
		if (!line.trim()) continue;
		let e: Record<string, unknown>;
		try {
			e = JSON.parse(line) as Record<string, unknown>;
		} catch {
			continue;
		}
		if (typeof e.timestamp === "string") updatedAt = e.timestamp;
		if (e.type !== "message") continue;
		messageCount += 1;
		if (!childFirstParentId && typeof e.parentId === "string") childFirstParentId = e.parentId;
		const msg = e.message as Record<string, unknown> | undefined;
		if (!msg) continue;
		const role = String(msg.role ?? "");
		const preview = extractTextBlock(msg.content);
		if (role === "user" && preview) lastUserPreview = preview.slice(0, 180);
		if (role === "assistant" && preview) lastAssistantPreview = preview.slice(0, 180);

		if (Array.isArray(msg.content)) {
			for (const block of msg.content as Record<string, unknown>[]) {
				if (block?.type === "toolCall") {
					if (typeof block.name === "string" && block.name === "bash") {
						const cmd = (block.arguments as { command?: unknown })?.command;
						if (typeof cmd === "string") commands.push(cmd);
					}
					extractPathLikes(block.arguments, files);
				}
			}
		}
		if (role === "toolResult") {
			const toolName = (msg.toolName as string | undefined) ?? "";
			const details = msg.details;
			if (toolName === "bash") {
				const cmd = (details as { command?: unknown } | undefined)?.command;
				if (typeof cmd === "string") commands.push(cmd);
			}
			extractPathLikes(details, files);
		}
	}

	const parentBranchId = header.parentSessionId;
	let rootSessionId = header.sessionId;
	const seen = new Set<string>();
	while (true) {
		const cur = headersById.get(rootSessionId);
		if (!cur?.parentSessionId || seen.has(rootSessionId)) break;
		seen.add(rootSessionId);
		rootSessionId = cur.parentSessionId;
	}
	const parentPath = parentBranchId ? (headersById.get(parentBranchId)?.filePath ?? null) : null;

	return {
		branchId: header.sessionId,
		parentBranchId,
		rootSessionId,
		forkMsgIndex: computeForkMsgIndex(parentPath, childFirstParentId),
		createdAt: header.timestamp,
		updatedAt,
		cwd: header.cwd,
		lastCwd,
		messageCount,
		lastUserPreview,
		lastAssistantPreview,
		recentFiles: [...files].slice(-8),
		recentCommands: commands.slice(-8),
		alias: aliases[header.sessionId],
	};
}

export function listBranchesInProject(
	projDir: string,
	currentSessionId: string | null,
	aliases: Record<string, string> = {}
): { currentBranchId: string | null; branches: BranchMeta[] } {
	const headers: SessionHeader[] = [];
	for (const filename of listSessionFiles(projDir)) {
		const parsed = parseSessionHeader(path.join(projDir, filename));
		if (parsed) headers.push(parsed);
	}
	const headersById = new Map(headers.map((h) => [h.sessionId, h]));
	const branches = headers
		.map((h) => buildBranchMeta(h.filePath, headersById, aliases))
		.filter((b): b is BranchMeta => b !== null)
		.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
	return { currentBranchId: currentSessionId, branches };
}

export function branchScopeSessionIds(
	branches: BranchMeta[],
	currentBranchId: string | null,
	scope: "current-branch" | "siblings" | "ancestors" | "descendants" | "current-tree" | "project"
): Set<string> | undefined {
	if (scope === "project") return undefined;
	if (!currentBranchId) return new Set();
	const byId = new Map(branches.map((b) => [b.branchId, b]));
	const current = byId.get(currentBranchId);
	if (!current) return new Set();
	if (scope === "current-branch") return new Set([currentBranchId]);
	if (scope === "siblings") {
		return new Set(
			branches.filter((b) => b.parentBranchId && b.parentBranchId === current.parentBranchId).map((b) => b.branchId)
		);
	}
	if (scope === "ancestors") {
		const out = new Set<string>();
		let p = current.parentBranchId;
		while (p && byId.has(p)) {
			out.add(p);
			p = byId.get(p)?.parentBranchId ?? null;
		}
		return out;
	}
	if (scope === "descendants") {
		const out = new Set<string>();
		const stack = [currentBranchId];
		while (stack.length > 0) {
			const id = stack.pop() as string;
			for (const b of branches) {
				if (b.parentBranchId === id && !out.has(b.branchId)) {
					out.add(b.branchId);
					stack.push(b.branchId);
				}
			}
		}
		out.delete(currentBranchId);
		return out;
	}
	const root = current.rootSessionId;
	return new Set(branches.filter((b) => b.rootSessionId === root).map((b) => b.branchId));
}

// ── Reading a specific session ───────────────────────────────────────

/** Resolve a session id to its JSONL path, scanning project dirs under base. */
export function findSessionPath(base: string, sessionId: string, preferDir?: string): string | null {
	const suffix = `_${sessionId}.jsonl`;
	const dirs = preferDir ? [preferDir, ...listProjectDirs(base).filter((d) => d !== preferDir)] : listProjectDirs(base);
	for (const dir of dirs) {
		for (const filename of listSessionFiles(dir)) {
			if (filename.endsWith(suffix) || filename === `${sessionId}.jsonl`) {
				return path.join(dir, filename);
			}
		}
	}
	return null;
}

export interface ReadResult {
	sessionId: string;
	project: string;
	timestamp: string;
	totalMessages: number;
	mode: "around" | "query" | "transcript" | "outline";
	messages: { role: string; msgIndex: number; text: string }[];
	truncated: boolean;
	omittedMessages?: number;
}

export interface ReadOptions {
	query?: string;
	around?: number;
	/** UTF-16 character position in the anchored message, as returned by search. */
	matchPosition?: number;
	before?: number;
	after?: number;
	maxChars: number;
	/** Maximum messages returned in query / whole-session modes. */
	maxMessages?: number;
	/** Total character budget across returned messages in query / whole-session modes. */
	maxTotalChars?: number;
	/** Restrict which message roles are returned (query / whole-session modes). */
	roleFilter?: RoleFilter;
	/**
	 * Whole-session rendering when neither `query` nor `around` is given:
	 * "outline" = conversation only (user + assistant), tool noise dropped;
	 * "transcript" = every non-empty message. Defaults to "transcript".
	 */
	view?: "outline" | "transcript";
}

function clip(text: string, max: number): { text: string; truncated: boolean } {
	if (text.length <= max) return { text, truncated: false };
	return { text: `${text.slice(0, max)} …`, truncated: true };
}

function readQueryMessages(
	messages: ExtractedMessage[],
	opts: ReadOptions
): Pick<ReadResult, "messages" | "truncated" | "omittedMessages"> {
	const roleFilter = opts.roleFilter ?? "conversation";
	const tokens = sanitizeTokens(opts.query ?? "");
	const maxMessages = opts.maxMessages ?? 40;
	const maxTotalChars = opts.maxTotalChars ?? 16_000;
	const before = opts.before ?? 2;
	const after = opts.after ?? 2;
	const matching = messages
		.map((m, i) => ({ ...m, i }))
		.filter((m) => roleAllowed(m.role, roleFilter) && tokens.some((t) => m.text.toLowerCase().includes(t.toLowerCase())));
	const wanted = new Set<number>();
	for (const match of matching) {
		const from = Math.max(0, match.i - before);
		const to = Math.min(messages.length - 1, match.i + after);
		for (let i = from; i <= to; i++) {
			if (messages[i].text && roleAllowed(messages[i].role, roleFilter)) wanted.add(i);
		}
	}
	const indices = [...wanted].sort((a, b) => a - b);
	const out: ReadResult["messages"] = [];
	let truncated = false;
	let usedChars = 0;
	for (const i of indices) {
		if (out.length >= maxMessages || usedChars >= maxTotalChars) break;
		const remaining = Math.max(0, maxTotalChars - usedChars);
		const c = clip(messages[i].text, Math.min(opts.maxChars, remaining));
		truncated = truncated || c.truncated;
		usedChars += c.text.length;
		out.push({ role: messages[i].role, msgIndex: i, text: c.text });
	}
	return { messages: out, truncated, omittedMessages: Math.max(0, indices.length - out.length) };
}

export function readSession(filePath: string, opts: ReadOptions): ReadResult {
	const filename = path.basename(filePath);
	const data = fs.readFileSync(filePath, "utf-8");
	const { messages } = extractMessages(data);
	// Session files live directly in the `--cwd--` project dir.
	const project = prettyProject(path.basename(path.dirname(filePath)));
	const base = {
		sessionId: sessionIdFromFilename(filename),
		project,
		timestamp: timestampFromFilename(filename),
		totalMessages: messages.length,
	};

	// Context window around a hit — contiguous, so role filtering is not applied.
	if (typeof opts.around === "number") {
		const before = opts.before ?? 3;
		const after = opts.after ?? 3;
		const from = Math.max(0, opts.around - before);
		const to = Math.min(messages.length, opts.around + after + 1);
		const out = messages.slice(from, to).map((m, k) => {
			const start = from + k === opts.around ? Math.max(0, (opts.matchPosition ?? 0) - 60) : 0;
			const c = clip(m.text.slice(start), opts.maxChars);
			return { role: m.role, msgIndex: from + k, text: c.text, _t: c.truncated || start > 0 };
		});
		return {
			...base,
			mode: "around",
			messages: out.map(({ _t, ...m }) => m),
			truncated: out.some((m) => m._t),
		};
	}

	if (opts.query) {
		return { ...base, mode: "query", ...readQueryMessages(messages, opts) };
	}

	// Whole-session. "outline" drops tool noise to a readable conversation thread;
	// "transcript" keeps every non-empty message.
	const view = opts.view ?? "transcript";
	const roleFilter = opts.roleFilter ?? (view === "outline" ? "conversation" : "all");
	const kept = messages.map((m, i) => ({ ...m, i })).filter((m) => m.text && roleAllowed(m.role, roleFilter));
	const maxMessages = opts.maxMessages ?? 80;
	const shown = kept.slice(0, maxMessages);
	const budget = opts.maxTotalChars ?? opts.maxChars;
	const per = Math.max(120, Math.floor(budget / Math.max(1, shown.length)));
	let truncated = kept.length > shown.length;
	const out = shown.map((m) => {
		const c = clip(m.text, per);
		truncated = truncated || c.truncated;
		return { role: m.role, msgIndex: m.i, text: c.text };
	});
	return { ...base, mode: view, messages: out, truncated, omittedMessages: Math.max(0, kept.length - shown.length) };
}

// ── Surgical grep within one session ───────────────────────────────
//
// FTS5 (HistorySearch) is tokenized BM25 — great for ranked recall across many
// sessions, but it loses exact substrings and code identifiers that tokenizers
// split or drop (e.g. camelCase, stack traces, error strings). grepSession is
// the surgical complement: read ONE session file, run a single literal/regex
// pass over its extracted messages, and return pinpoint matches with msgIndex.
// No database, no tokenization, no re-indexing — so it's fast even for large
// older sessions and catches the exact strings FTS can't.

export interface GrepSnippet {
	msgIndex: number;
	role: string;
	/** Match in context, with «» around the matched span. */
	snippet: string;
	matchPosition: number;
}

export interface GrepResult {
	sessionId: string;
	project: string;
	timestamp: string;
	totalMessages: number;
	pattern: string;
	attempts: string[];
	warnings: string[];
	regex: boolean;
	ignoreCase: boolean;
	roleFilter: RoleFilter;
	/** Distinct messages that matched. */
	matchedMessages: number;
	/** Match snippets (capped at maxMatches). */
	matches: GrepSnippet[];
	/** Optional full-text context window when before/after > 0 (deduped, ordered). */
	messages: { role: string; msgIndex: number; text: string }[];
	truncated: boolean;
}

export interface GrepOptions {
	pattern: string;
	/** Treat pattern as a JavaScript regular expression. Default false (literal substring). */
	regex?: boolean;
	/** Disable automatic regex retry after a literal miss. */
	fallback?: boolean;
	/** Case-insensitive match. Default true. */
	ignoreCase?: boolean;
	roleFilter?: RoleFilter;
	/** Max match snippets overall. Default 50. */
	maxMatches?: number;
	/** Max snippets recorded per matching message. Default 3. */
	maxPerMessage?: number;
	/** Include this many full messages before each match. Default 0 (surgical). */
	before?: number;
	/** Include this many full messages after each match. Default 0 (surgical). */
	after?: number;
	/** Per-message char cap for the context window. Default 1000. */
	maxChars?: number;
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build a fresh global RegExp factory; validates the pattern once up front. */
function makeMatcherFactory(pattern: string, regex: boolean, ignoreCase: boolean): () => RegExp {
	const flags = `g${ignoreCase ? "i" : ""}`;
	const source = regex ? pattern : escapeRegex(pattern);
	// Validate once; throws a clean error for the tool to surface.
	new RegExp(source, flags);
	return () => new RegExp(source, flags);
}

const GREP_CTX = 80; // chars of context on each side of a match in a snippet

/** Build a context snippet around a match, highlighting the matched span. */
function snippetAround(text: string, start: number, matched: string): string {
	const end = start + matched.length;
	const from = Math.max(0, start - GREP_CTX);
	const pre = text.slice(from, start);
	const post = text.slice(end, end + GREP_CTX);
	const lead = from > 0 ? "… " : "";
	const tail = end + GREP_CTX < text.length ? " …" : "";
	return `${lead}${pre}«${matched}»${post}${tail}`.slice(0, 300);
}

export interface MessageScan {
	/** Whether the message had at least one match. */
	matched: boolean;
	/** Snippets collected from this message (already capped at maxPerMessage). */
	snippets: GrepSnippet[];
}

/** Run the matcher over a single message. When `collect` is false, stop at the
 * first match and return no snippets — used once the overall cap is reached so
 * the tail scan stays minimal while still counting every matching message. */
function scanMessage(
	re: RegExp,
	text: string,
	msgIndex: number,
	role: string,
	maxPerMessage: number,
	collect: boolean
): MessageScan {
	re.lastIndex = 0;
	const snippets: GrepSnippet[] = [];
	let matched = false;
	let hit = re.exec(text);
	while (hit !== null) {
		if (hit[0].length === 0) {
			// Avoid zero-width-match loops.
			re.lastIndex++;
			hit = re.exec(text);
			continue;
		}
		matched = true;
		if (collect && snippets.length < maxPerMessage) {
			snippets.push({ msgIndex, role, snippet: snippetAround(text, hit.index, hit[0]), matchPosition: hit.index });
		}
		if (!collect || snippets.length >= maxPerMessage) break;
		hit = re.exec(text);
	}
	return { matched, snippets };
}

/** Collect message indices forming the context window around a match index. */
function contextIndicesAround(
	messages: ExtractedMessage[],
	roleFilter: RoleFilter,
	i: number,
	before: number,
	after: number,
	out: Set<number>
): void {
	const from = Math.max(0, i - before);
	const to = Math.min(messages.length - 1, i + after);
	for (let k = from; k <= to; k++) {
		if (messages[k].text && roleAllowed(messages[k].role, roleFilter)) out.add(k);
	}
}

interface ResolvedGrep {
	roleFilter: RoleFilter;
	ignoreCase: boolean;
	isRegex: boolean;
	maxMatches: number;
	maxPerMessage: number;
	before: number;
	after: number;
	maxChars: number;
	wantContext: boolean;
}

function resolveGrepOptions(opts: GrepOptions): ResolvedGrep {
	const before = opts.before ?? 0;
	const after = opts.after ?? 0;
	return {
		roleFilter: opts.roleFilter ?? "all",
		ignoreCase: opts.ignoreCase ?? true,
		isRegex: opts.regex ?? false,
		maxMatches: opts.maxMatches ?? 50,
		maxPerMessage: opts.maxPerMessage ?? 3,
		before,
		after,
		maxChars: opts.maxChars ?? 1000,
		wantContext: before > 0 || after > 0,
	};
}

/** Build the (optionally clipped) context-window messages from a set of indices. */
function buildContextWindow(
	messages: ExtractedMessage[],
	indices: Set<number>,
	maxChars: number
): { messages: GrepResult["messages"]; truncated: boolean } {
	const out: GrepResult["messages"] = [];
	let truncated = false;
	for (const i of [...indices].sort((a, b) => a - b)) {
		const c = clip(messages[i].text, maxChars);
		truncated = truncated || c.truncated;
		out.push({ role: messages[i].role, msgIndex: i, text: c.text });
	}
	return { messages: out, truncated };
}

export function regexShaped(pattern: string): boolean {
	return /[\\[\]()|*+?^$]/.test(pattern);
}

export function grepSession(filePath: string, opts: GrepOptions): GrepResult {
	const { messages } = extractMessages(fs.readFileSync(filePath, "utf-8"));
	const result = grepMessages(filePath, messages, opts);
	if (result.matchedMessages || opts.regex || opts.fallback === false || !regexShaped(opts.pattern)) return result;
	try {
		const retry = grepMessages(filePath, messages, { ...opts, regex: true });
		retry.attempts.unshift("literal");
		return retry;
	} catch {
		result.attempts.push("regex");
		result.warnings.push("Invalid regex fallback; literal pass found no matches.");
		return result;
	}
}

function grepMessages(filePath: string, messages: ExtractedMessage[], opts: GrepOptions): GrepResult {
	const filename = path.basename(filePath);
	const project = prettyProject(path.basename(path.dirname(filePath)));
	const o = resolveGrepOptions(opts);

	const matcher = makeMatcherFactory(opts.pattern, o.isRegex, o.ignoreCase);

	const matches: GrepSnippet[] = [];
	let matchedMessages = 0;
	const ctxIndices = new Set<number>();

	for (let i = 0; i < messages.length; i++) {
		const m = messages[i];
		if (!m.text || !roleAllowed(m.role, o.roleFilter)) continue;
		// Once the snippet cap is hit, keep scanning only to count matches (cheap).
		const collect = matches.length < o.maxMatches;
		const { matched, snippets } = scanMessage(matcher(), m.text, i, m.role, o.maxPerMessage, collect);
		if (!matched) continue;
		matchedMessages++;
		for (const s of snippets) {
			if (matches.length < o.maxMatches) matches.push(s);
		}
		if (o.wantContext) contextIndicesAround(messages, o.roleFilter, i, o.before, o.after, ctxIndices);
	}
	const truncated = matches.length >= o.maxMatches && matchedMessages > 0;

	// Only surface the context window when the caller asked for one.
	const ctx = o.wantContext ? buildContextWindow(messages, ctxIndices, o.maxChars) : { messages: [], truncated: false };

	return {
		sessionId: sessionIdFromFilename(filename),
		project,
		timestamp: timestampFromFilename(filename),
		totalMessages: messages.length,
		pattern: opts.pattern,
		attempts: [o.isRegex ? "regex" : "literal"],
		warnings: [],
		regex: o.isRegex,
		ignoreCase: o.ignoreCase,
		roleFilter: o.roleFilter,
		matchedMessages,
		matches,
		messages: ctx.messages,
		truncated: truncated || ctx.truncated,
	};
}

// ── Stats ────────────────────────────────────────────────────────────

export function getStats(projDir: string): IndexStats {
	const dbPath = indexDbPath(projDir);
	const db = openDb(projDir, fs.existsSync(dbPath) ? "ro" : "rw");
	if (!db) return { indexPath: dbPath, totalSessions: 0, totalChunks: 0, lastUpdated: null };
	const sessions = (db.prepare("SELECT COUNT(*) AS c FROM sessions").get() as unknown as { c: number }).c;
	const chunks = (db.prepare("SELECT COUNT(*) AS c FROM messages_fts").get() as unknown as { c: number }).c;
	const meta = db.prepare("SELECT value FROM meta WHERE key = 'last_updated'").get() as unknown as { value: string } | undefined;
	return { indexPath: dbPath, totalSessions: sessions, totalChunks: chunks, lastUpdated: meta?.value ?? null };
}
