/**
 * Card store: the classification sidecar that survives without a dataset.
 *
 * The session JSONL already carries every card as a `pi-turn-classify:card/v1`
 * custom entry, but reading it means reading a whole session file — up to tens of
 * megabytes — which is exactly what a list view must avoid for every row it shows.
 * So each card is also written to a small sidecar file keyed by session id.
 *
 * Location: `<agentDir>/turn-classify/cards/<sessionId>.json`
 * (`~/.pi/agent/...` by default, honours PI_CODING_AGENT_DIR).
 *
 * Why here, and not a database or a single append-only log:
 *
 *   - **One file per session** means pi sessions never contend: each instance
 *     writes only its own file, so no locks and no interleaving. A single shared
 *     JSONL grows forever and needs compaction; SQLite would need a schema
 *     migration story and locking discipline across many live sessions.
 *   - **Keyed by session id** so a consumer that already lists sessions (Oqto has
 *     the id from the session filename) reads exactly one small file per row.
 *   - **Beside the sessions** in the agent dir, so anything that finds pi sessions
 *     finds this too, including with a custom PI_CODING_AGENT_DIR.
 *   - **Derived and disposable**: the session file remains the source of truth, so
 *     deleting this directory loses nothing but a re-read.
 *
 * Writes are atomic (temp file + rename) and private (0700 dir, 0600 file): cards
 * contain the working directory and a one-line summary, never prompt text.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { TurnCard } from "./schema.js";

export const CARD_STORE_VERSION = 1;
/**
 * Size budget for one session's sidecar.
 *
 * The cost that matters is not disk (a full card is ~1 kB and the median session
 * has 30 turns, so keeping every turn is ~30 kB) but *per-row read cost* and the
 * full-document rewrite on each turn. Bounding bytes bounds both, while letting
 * every ordinary session keep its complete history.
 *
 * Measured on the 200 largest sessions here: median 30 turns, max 661. So this
 * budget keeps every turn of a normal session (~30 kB) and every line of even the
 * longest one, only shedding the oldest *full* cards of pathological sessions
 * (their lines stay).
 */
export const DEFAULT_MAX_BYTES = 512 * 1024;
/** Always keep at least this many full cards, even under an absurd budget. */
export const MIN_FULL_CARDS = 5;
/** Hard stop for the line history, far above any observed session (max 661). */
export const DEFAULT_HISTORY_LIMIT = 5000;

/** One session's sidecar document. */
export interface SessionCardFile {
	version: typeof CARD_STORE_VERSION;
	sessionId: string;
	/** Session file at classification time; helps consumers find the transcript. */
	sessionFile?: string;
	cwd: string;
	/** Newest card, for a one-read list row. */
	latest: TurnCard;
	/** Recent cards, oldest first, oldest dropped beyond `keep`. */
	turns: TurnCard[];
	/**
	 * Every turn's one-liner (oldest first), so a scrollback stays complete without
	 * storing probabilities for turns nobody will inspect again.
	 */
	history: Array<{ turn: number; at: string; line: string }>;
	updatedAt: string;
}

export interface CardStoreOptions {
	/** Agent dir root (defaults to PI_CODING_AGENT_DIR or ~/.pi/agent). */
	agentDir?: string;
	/** Explicit override for the cards directory. */
	cardsDir?: string;
	/** Explicit cap on full cards; normally the byte budget decides. */
	keep?: number;
	/** Line-only history entries kept per session. */
	historyLimit?: number;
	/** Size budget for the document (default DEFAULT_MAX_BYTES). */
	maxBytes?: number;
}

export function defaultAgentDir(): string {
	return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}

export function cardsDirectory(options: CardStoreOptions = {}): string {
	if (options.cardsDir) return options.cardsDir;
	return join(options.agentDir ?? defaultAgentDir(), "turn-classify", "cards");
}

/** Session ids are used as filenames, so keep them boring. */
export function cardFileName(sessionId: string): string {
	const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, "_");
	return `${safe || "unknown"}.json`;
}

/** Read one session's cards; undefined when absent or unreadable. */
export function readSessionCards(options: CardStoreOptions, sessionId: string): SessionCardFile | undefined {
	const path = join(cardsDirectory(options), cardFileName(sessionId));
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8")) as SessionCardFile;
		if (parsed?.version !== CARD_STORE_VERSION || !Array.isArray(parsed.turns)) return undefined;
		// Older sidecars predate `history`; treat it as empty rather than invalid.
		if (!Array.isArray(parsed.history)) parsed.history = [];
		return parsed;
	} catch {
		return undefined;
	}
}

/**
 * Record a card for its session.
 *
 * Re-classifying the same turn replaces that turn instead of appending, so a
 * `/classify now` does not duplicate rows. Returns the written document, or
 * undefined when the write was impossible (a sidecar is never worth a failure).
 */
export function writeSessionCard(options: CardStoreOptions, card: TurnCard): SessionCardFile | undefined {
	const keep = options.keep ? Math.max(1, options.keep) : Number.POSITIVE_INFINITY;
	const historyLimit = Math.max(1, options.historyLimit ?? DEFAULT_HISTORY_LIMIT);
	const maxBytes = Math.max(4096, options.maxBytes ?? DEFAULT_MAX_BYTES);
	const dir = cardsDirectory(options);
	try {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
		const existing = readSessionCards(options, card.sessionId);
		const previous = existing?.turns ?? [];
		// Same session + same turn = the same row, re-classified.
		const withoutDuplicates = previous.filter((entry) => entry.turn !== card.turn);
		const allTurns = [...withoutDuplicates, card].sort((a, b) => a.turn - b.turn).slice(-keep);

		// The history keeps one line per turn, including turns whose full card has
		// already rolled out of `turns`.
		const history = [
			...(existing?.history ?? []).filter((entry) => entry.turn !== card.turn),
			{ turn: card.turn, at: card.at, line: card.line },
		]
			.sort((a, b) => a.turn - b.turn)
			.slice(-historyLimit);

		// Keep every full card that fits the budget; the oldest ones fall out first
		// (their lines remain in `history`, so nothing about the story is lost).
		let turns = allTurns;
		const makeDocument = (): SessionCardFile => ({
			version: CARD_STORE_VERSION,
			sessionId: card.sessionId,
			...(card.sessionFile ? { sessionFile: card.sessionFile } : {}),
			cwd: card.cwd,
			latest: turns[turns.length - 1] ?? card,
			turns,
			history,
			updatedAt: new Date().toISOString(),
		});
		let document = makeDocument();
		while (turns.length > MIN_FULL_CARDS && JSON.stringify(document, null, 2).length > maxBytes) {
			turns = turns.slice(Math.ceil((turns.length - MIN_FULL_CARDS) / 2) || 1);
			document = makeDocument();
		}

		const path = join(dir, cardFileName(card.sessionId));
		const staged = `${path}.tmp-${process.pid}`;
		writeFileSync(staged, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
		renameSync(staged, path);
		return document;
	} catch {
		return undefined;
	}
}

/** Every session sidecar in the store, newest first (for a global list view). */
export function listSessionCards(options: CardStoreOptions = {}): SessionCardFile[] {
	const dir = cardsDirectory(options);
	let entries: string[];
	try {
		entries = readdirSync(dir).filter((name) => name.endsWith(".json"));
	} catch {
		return [];
	}
	const documents: SessionCardFile[] = [];
	for (const name of entries) {
		try {
			const parsed = JSON.parse(readFileSync(join(dir, name), "utf-8")) as SessionCardFile;
			if (parsed?.version === CARD_STORE_VERSION && parsed.latest) documents.push(parsed);
		} catch {
			// A corrupt sidecar must not break a list view.
		}
	}
	return documents.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/**
 * Drop sidecars whose session file is gone and whose card is older than `maxAgeDays`.
 *
 * The store is derived, so pruning is safe: a session that still exists rebuilds
 * its card on the next turn. Returns how many files were removed.
 */
export function pruneCards(options: CardStoreOptions & { maxAgeDays?: number } = {}): number {
	const maxAgeDays = options.maxAgeDays ?? 30;
	const dir = cardsDirectory(options);
	let entries: string[];
	try {
		entries = readdirSync(dir).filter((name) => name.endsWith(".json"));
	} catch {
		return 0;
	}
	const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
	let removed = 0;
	for (const name of entries) {
		const path = join(dir, name);
		try {
			const document = JSON.parse(readFileSync(path, "utf-8")) as SessionCardFile;
			const updated = Date.parse(document.updatedAt ?? "");
			const transcriptGone = document.sessionFile ? !existsSync(document.sessionFile) : false;
			const stale = Number.isFinite(updated) && updated < cutoff;
			if (transcriptGone && stale) {
				rmSync(path, { force: true });
				removed += 1;
			}
		} catch {
			// Unparseable or vanished between readdir and read: leave it for next time.
		}
	}
	return removed;
}

/** Total size of the store, for status output. */
export function storeStats(options: CardStoreOptions = {}): { files: number; bytes: number; dir: string } {
	const dir = cardsDirectory(options);
	let files = 0;
	let bytes = 0;
	try {
		for (const name of readdirSync(dir)) {
			if (!name.endsWith(".json")) continue;
			try {
				files += 1;
				bytes += statSync(join(dir, name)).size;
			} catch {
				// ignore
			}
		}
	} catch {
		// absent store is an empty store
	}
	return { files, bytes, dir };
}
