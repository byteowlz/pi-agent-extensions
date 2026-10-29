/**
 * Build a labelling queue from real pi sessions.
 *
 * The bench can only be trusted if the corpus is real turns, not turns written to
 * fit the schema. This walks the session store, splits each session into turns
 * (a user message and everything up to the next user message) and writes the same
 * digest shape the extension classifies.
 *
 * Output is the bench sample format, so labels recorded in the web UI can be fed
 * straight back into `bench.ts` and into calibration with no conversion.
 *
 *   bun run labeler/extract.ts --limit 60 --per-session 6 --out candidates.jsonl
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

import { type ToolUse, type TurnError, extractText, toolDetail } from "../digest.js";

export interface Candidate {
	id: string;
	/** Digest handed to the model. */
	state: {
		userText: string;
		assistantText: string;
		tools: ToolUse[];
		filesTouched: string[];
		commands: string[];
		cwd: string;
		gitRemotes: string[];
		sessionName?: string;
		errored?: boolean;
		error?: TurnError;
		durationMs?: number;
	};
	/** Provenance for the UI (never sent to the model). */
	meta: { sessionFile: string; sessionId: string; turn: number; startedAt?: string; model?: string };
}

const SESSIONS_ROOT = process.env.PI_SESSION_DIR ?? join(homedir(), ".pi", "agent", "sessions");

interface Entry {
	type?: string;
	message?: { role?: string; content?: unknown; timestamp?: number; stopReason?: string; model?: string };
	cwd?: string;
	name?: string;
	timestamp?: string;
}

/** All session files under the sessions root, newest first. */
export function listSessionFiles(root = SESSIONS_ROOT): string[] {
	const files: string[] = [];
	const walk = (dir: string): void => {
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const entry of entries) {
			const path = join(dir, entry);
			let stats: ReturnType<typeof statSync>;
			try {
				stats = statSync(path);
			} catch {
				continue;
			}
			if (stats.isDirectory()) walk(path);
			else if (entry.endsWith(".jsonl")) files.push(path);
		}
	};
	walk(root);
	return files
		.map((path) => {
			try {
				return { path, mtime: statSync(path).mtimeMs };
			} catch {
				return { path, mtime: 0 };
			}
		})
		.sort((a, b) => b.mtime - a.mtime)
		.map((entry) => entry.path);
}

/** Derive git remotes for a cwd from the session itself when possible, else skip. */
function gitRemotesFor(cwd: string): string[] {
	// Cheap sync read; the labeler is not hot.
	try {
		const config = readFileSync(join(cwd, ".git", "config"), "utf-8");
		const remotes = new Set<string>();
		for (const match of config.matchAll(/url\s*=\s*(\S+)/g)) {
			if (match[1]) remotes.add(match[1]);
		}
		return [...remotes];
	} catch {
		return [];
	}
}

/** Split one session file into turn candidates. */
export function turnsFromSession(path: string, perSession: number): Candidate[] {
	let entries: Entry[];
	try {
		entries = readFileSync(path, "utf-8")
			.split("\n")
			.filter((line) => line.trim())
			.map((line) => JSON.parse(line) as Entry);
	} catch {
		return [];
	}

	const header = entries.find((entry) => entry.type === "session");
	const cwd = typeof header?.cwd === "string" ? header.cwd : "";
	const sessionId =
		basename(path)
			.replace(/\.jsonl$/, "")
			.split("_")
			.pop() ?? basename(path);
	const sessionName = [...entries].reverse().find((entry) => entry.type === "session_info")?.name;

	// Keep the active branch: entries are a tree, but a linear pass is enough for
	// labelling because we only need user-visible turns in file order.
	const turns: Candidate[] = [];
	let current: {
		user: string;
		tools: ToolUse[];
		files: Set<string>;
		commands: string[];
		/** Text of the turn's closing assistant message (not the narration). */
		finalText: string;
		/** Verbatim provider error text, when the turn failed. */
		error?: TurnError;
		/** Last tool failure seen; only fails the turn if nothing answered. */
		toolError?: TurnError;
		startedAt?: number;
		errored: boolean;
		model?: string;
	} | null = null;
	let index = 0;

	const flush = (): void => {
		if (!current) return;
		index += 1;
		const assistantText = current.finalText.trim();
		// A tool hiccup in a turn that still answered is not a failed turn.
		if (!current.error && current.toolError && !assistantText) current.error = current.toolError;
		// A turn is skip only when there is nothing at all to judge: no ask, or an
		// ask with neither an answer nor any tool activity. Short answers are real
		// turns ("Fixed the lint error.") — pleasantries are filtered later, by the
		// trivial-turn rule in extract().
		if (!current.user.trim() || (!assistantText && current.tools.length === 0)) {
			current = null;
			return;
		}
		turns.push({
			id: `${sessionId}:${index}`,
			state: {
				userText: current.user,
				assistantText,
				tools: current.tools,
				filesTouched: [...current.files],
				commands: current.commands,
				cwd,
				gitRemotes: gitRemotesFor(cwd),
				...(sessionName ? { sessionName } : {}),
				...(current.errored || current.error ? { errored: true } : {}),
				...(current.error ? { error: current.error } : {}),
				...(current.startedAt ? { durationMs: Date.now() - current.startedAt } : {}),
			},
			meta: {
				sessionFile: path,
				sessionId,
				turn: index,
				...(header?.timestamp ? { startedAt: header.timestamp } : {}),
				...(current.model ? { model: current.model } : {}),
			},
		});
		current = null;
	};

	for (const entry of entries) {
		if (entry.type !== "message" || !entry.message) continue;
		const role = entry.message.role;
		const timestamp = entry.message.timestamp;

		if (role === "user") {
			flush();
			const text = extractText(entry.message.content).trim();
			// Tool results are custom messages, not user turns; skip empties.
			if (!text) continue;
			current = { user: text, tools: [], files: new Set(), commands: [], finalText: "", startedAt: timestamp, errored: false };
			continue;
		}
		if (!current) continue;

		if (role === "assistant") {
			if (entry.message.model) current.model = entry.message.model;
			const content = entry.message.content;
			if (Array.isArray(content)) {
				const messageText: string[] = [];
				for (const block of content) {
					if (!block || typeof block !== "object") continue;
					const typed = block as { type?: string; text?: string; name?: string; arguments?: unknown };
					if (typed.type === "text" && typed.text) messageText.push(typed.text);
					if (typed.type === "toolCall" && typed.name) {
						const detail = toolDetail(typed.name, typed.arguments);
						current.tools.push({ name: typed.name, ...(detail ? { detail } : {}) });
						if (detail && typed.name === "bash") current.commands.push(detail);
						else if (detail && ["read", "write", "edit"].includes(typed.name)) current.files.add(detail);
					}
				}
				// Keep the latest message that actually said something: that is the
				// turn's closing answer, which is what a reader (and the model) needs.
				if (messageText.join(" ").trim()) current.finalText = messageText.join("\n");
			}
			const stop = entry.message.stopReason;
			const errorMessage = (entry.message as { errorMessage?: string }).errorMessage;
			if (stop === "error") {
				current.errored = true;
				if (errorMessage) current.error = { source: "provider", message: errorMessage };
			} else if (stop === "aborted") {
				current.errored = true;
				current.error ??= { source: "aborted", message: "the turn was interrupted (user abort or session switch)" };
			}
			continue;
		}
		if (role === "toolResult") {
			// The message itself is what makes an error labelable, so keep the text.
			const content = extractText(entry.message.content).trim();
			const toolName = (entry.message as { toolName?: string }).toolName;
			// Recorded as the turn's error candidate, but not as a failed turn yet:
			// only flush() decides that, and only when nothing answered.
			if (/^error|command not found|permission denied|no such file/i.test(content)) {
				current.toolError ??= { source: "tool", ...(toolName ? { tool: toolName } : {}), message: content.slice(0, 1200) };
			}
		}
	}
	flush();

	return turns.slice(0, perSession);
}

export interface ExtractOptions {
	root?: string;
	/** How many sessions to walk, newest first. */
	limit?: number;
	/** Max turns taken per session, so one long session cannot dominate. */
	perSession?: number;
}

/** Build the candidate set. */
export function extract(options: ExtractOptions = {}): Candidate[] {
	const limit = options.limit ?? 60;
	const perSession = options.perSession ?? 6;
	const files = listSessionFiles(options.root ?? SESSIONS_ROOT).slice(0, limit);
	const candidates: Candidate[] = [];
	const seen = new Set<string>();
	for (const file of files) {
		for (const candidate of turnsFromSession(file, perSession)) {
			// Forks and resumed sessions repeat turns; label each once.
			const fingerprint = `${candidate.state.userText}\u0000${candidate.state.assistantText}`;
			if (seen.has(fingerprint)) continue;
			// Pure pleasantries ("commit", "ok") teach nothing about the schema.
			const trivial =
				candidate.state.userText.trim().length < 8 &&
				candidate.state.filesTouched.length === 0 &&
				candidate.state.commands.length <= 1;
			if (trivial) continue;
			seen.add(fingerprint);
			candidates.push(candidate);
		}
	}
	return candidates;
}

/**
 * Read a background dataset (`dataset.path` in the extension config) as the queue.
 *
 * The records already carry the digest, so the labeler can label exactly the
 * traffic that was classified — including the error text.
 */
export function candidatesFromDataset(path: string): Candidate[] {
	const text = readFileSync(path, "utf-8");
	const candidates: Candidate[] = [];
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		let record: { id?: unknown; state?: unknown; session?: unknown; turn?: unknown };
		try {
			record = JSON.parse(line) as typeof record;
		} catch {
			continue;
		}
		if (!record.state || typeof record.state !== "object") continue;
		const session = (record.session ?? {}) as { id?: string; file?: string };
		candidates.push({
			id: typeof record.id === "string" ? record.id : `dataset-${candidates.length + 1}`,
			state: record.state as Candidate["state"],
			meta: {
				sessionFile: typeof session.file === "string" ? session.file : path,
				sessionId: typeof session.id === "string" ? session.id : "",
				turn: typeof record.turn === "number" ? record.turn : 0,
			},
		});
	}
	return candidates;
}

function parseArgs(argv: string[]): { limit: number; perSession: number; out: string; dataset?: string } {
	const map = new Map<string, string>();
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token?.startsWith("--")) continue;
		const next = argv[index + 1];
		if (next && !next.startsWith("--")) {
			map.set(token.slice(2), next);
			index += 1;
		} else map.set(token.slice(2), "true");
	}
	return {
		limit: Number(map.get("limit") ?? 60),
		perSession: Number(map.get("per-session") ?? 6),
		out:
			map.get("out") ??
			join(process.env.TURN_LABELER_DATA ?? join(homedir(), ".local", "share", "pi-turn-classify-labeler"), "candidates.jsonl"),
	};
}

if (import.meta.main) {
	const args = parseArgs(process.argv.slice(2));
	const candidates = args.dataset
		? candidatesFromDataset(args.dataset)
		: extract({ limit: args.limit, perSession: args.perSession });
	mkdirSync(dirname(args.out), { recursive: true });
	// Keep it JSONL and stable so the UI can stream it.
	writeFileSync(args.out, `${candidates.map((candidate) => JSON.stringify(candidate)).join("\n")}\n`);
	console.log(
		`${candidates.length} turns from ${new Set(candidates.map((c) => c.meta.sessionFile)).size} sessions -> ${args.out}`
	);
	if (!existsSync(args.out)) process.exit(1);
}
