/**
 * Turn digest: the compact, factual description of one finished turn that the
 * decision model reads as its `state`.
 *
 * The model gets no tools and no transcript replay — only this digest — so the
 * digest decides classification quality. Rules:
 *
 *   - **Facts, not narration.** Paths, commands, filenames, the user's ask and the
 *     assistant's closing claim. No "the agent then decided to".
 *   - **Bounded.** d3-lite serves 8,192 tokens total; the digest is capped by
 *     characters so a long turn still classifies instead of erroring.
 *   - **cwd is evidence, not truth.** The cwd is included precisely so the model
 *     can disagree with it (`project_mismatch`).
 */

export const MAX_STATE_CHARS = 6000;
/** Error text is the most information-dense part of a failed turn; keep it long. */
export const MAX_ERROR_CHARS = 1200;

/** Where an error came from. */
export type ErrorSource = "provider" | "tool" | "aborted";

export interface TurnError {
	/** `provider` = model/API failure, `tool` = a tool returned an error, `aborted` = cancelled. */
	source: ErrorSource;
	/** Verbatim message, bounded by MAX_ERROR_CHARS. */
	message: string;
	/** Tool name when source is `tool`. */
	tool?: string;
}

export interface ToolUse {
	name: string;
	/** One-line detail: file path, command, query, url. */
	detail?: string;
	/** True when the tool failed. */
	failed?: boolean;
}

export interface TurnDigest {
	/** The user's request that started this turn. */
	userText: string;
	/** The assistant's final visible text. */
	assistantText: string;
	/** Tools used, in order. */
	tools: ToolUse[];
	/** Files read or written (paths as seen by the tools). */
	filesTouched: string[];
	/** Shell commands run. */
	commands: string[];
	/** Session cwd. */
	cwd: string;
	/** Git remotes of cwd, when it is a repo. */
	gitRemotes: string[];
	/** Session display name, when set. */
	sessionName?: string;
	/** True when the turn ended in an error/abort. */
	errored?: boolean;
	/**
	 * The actual error text, verbatim.
	 *
	 * Provider error strings are diverse and change constantly ("529 overloaded",
	 * "stream ended without finish_reason", "invalid_api_key"), so the classifier
	 * reads them rather than a flag: mapping a moving surface to a stable set of
	 * categories is exactly what a decision model is good at.
	 */
	error?: TurnError;
	/** Wall-clock duration of the turn. */
	durationMs?: number;
}

function clip(text: string, max: number): string {
	const trimmed = text.trim().replace(/\s+/g, " ");
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max - 1)}…`;
}

/** Flatten an assistant message's content blocks into visible text. */
export function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		const typed = block as { type?: unknown; text?: unknown };
		if (typed.type === "text" && typeof typed.text === "string") parts.push(typed.text);
	}
	return parts.join("\n");
}

/** Pull the interesting bit out of a tool call's arguments. */
export function toolDetail(toolName: string, args: unknown): string | undefined {
	if (!args || typeof args !== "object") return undefined;
	const record = args as Record<string, unknown>;
	const firstString = (...keys: string[]): string | undefined => {
		for (const key of keys) {
			const value = record[key];
			if (typeof value === "string" && value.trim()) return value.trim();
		}
		return undefined;
	};
	if (toolName === "bash" || toolName === "shell") return firstString("command", "cmd");
	if (toolName === "read" || toolName === "write" || toolName === "edit") return firstString("path", "file", "file_path");
	if (toolName === "grep" || toolName === "find") return firstString("pattern", "query");
	if (toolName === "ls") return firstString("path");
	// Unknown tool: show the first short string argument, if any.
	for (const value of Object.values(record)) {
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return undefined;
}

/**
 * Render the digest as the `state` value. JSON (not prose) so the model reads
 * fields rather than parsing sentences; keys are short to save tokens.
 */
export function renderState(digest: TurnDigest): Record<string, unknown> {
	const state: Record<string, unknown> = { cwd: digest.cwd };
	// An error is the whole story of the turn: it goes first so nothing can
	// truncate it away, and it keeps its own (large) budget.
	if (digest.error) {
		state.error = {
			source: digest.error.source,
			...(digest.error.tool ? { tool: digest.error.tool } : {}),
			message: clip(digest.error.message, MAX_ERROR_CHARS),
		};
	}
	state.user = clip(digest.userText, 1200);
	state.assistant = clip(digest.assistantText, 1600);

	if (digest.gitRemotes.length > 0) state.remotes = digest.gitRemotes.slice(0, 4);
	if (digest.sessionName) state.session = digest.sessionName;

	if (digest.filesTouched.length > 0) {
		state.files = digest.filesTouched.slice(0, 25).map((file) => clip(file, 120));
	}
	if (digest.commands.length > 0) {
		state.commands = digest.commands.slice(0, 15).map((command) => clip(command, 160));
	}
	if (digest.tools.length > 0) {
		// Compress runs of the same tool: "bash×5" instead of five rows.
		const counts = new Map<string, number>();
		for (const tool of digest.tools) counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1);
		state.tools = [...counts.entries()].map(([name, count]) => (count > 1 ? `${name}×${count}` : name));
	}
	if (digest.errored) state.errored = true;
	if (digest.durationMs !== undefined) state.seconds = Math.round(digest.durationMs / 1000);

	// Last resort: if the payload is still too large, drop detail until it fits.
	let rendered = JSON.stringify(state);
	if (rendered.length > MAX_STATE_CHARS) {
		state.files = (state.files as string[] | undefined)?.slice(0, 8);
		state.commands = (state.commands as string[] | undefined)?.slice(0, 6);
		state.assistant = clip(String(state.assistant), 700);
		state.user = clip(String(state.user), 600);
		rendered = JSON.stringify(state);
	}
	if (rendered.length > MAX_STATE_CHARS) {
		state.files = undefined;
		state.commands = undefined;
		state.tools = undefined;
		state.assistant = clip(String(state.assistant), 400);
	}
	return state;
}

/** Derived project candidates from a digest (cwd name + remote repo names). */
export function localProjectHints(digest: TurnDigest): string[] {
	const hints = new Set<string>();
	const base = digest.cwd.split("/").filter(Boolean).pop();
	if (base) hints.add(base);
	for (const remote of digest.gitRemotes) {
		const cleaned = remote.replace(/\/+$/, "").replace(/\.git$/, "");
		const name = cleaned.split(/[/:]/).filter(Boolean).pop();
		if (name) hints.add(name);
	}
	return [...hints];
}
