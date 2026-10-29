/**
 * pi-last-question — keep your most recent question visible above the prompt box.
 *
 * Why: on a long session you scroll away from what you actually asked. The widget
 * pins the last question to two lines directly above the editor; the full text is
 * one shortcut away.
 *
 *   ⌥Q / ctrl+alt+q   expand: full question in an overlay, ⏎ inserts it into the editor
 *   ⌥J / ctrl+alt+j   jump: put the full question into the prompt box (edit / re-send)
 *   /last-question    show it in a notification (works without a TUI)
 *
 * This module holds the pure parts: reading the question off the session branch and
 * clamping it to a fixed number of lines. No pi imports, so it is unit-testable.
 */

export const WIDGET_KEY = "last-question";

/** Lines shown above the prompt box. Two is the requested budget. */
export const MAX_LINES = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Text blocks of a message, ignoring images, tool calls and thinking. */
export function messageText(message: unknown): string {
	if (!isRecord(message)) return "";
	const content = message.content;
	if (typeof content === "string") return content.trim();
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const block of content) {
		if (!isRecord(block)) continue;
		if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
	}
	return parts.join("\n").trim();
}

/**
 * The most recent user message on the branch.
 *
 * Only real prompts count: custom messages (extension notes), tool results and
 * compaction summaries are not what the user asked.
 */
export function lastQuestion(entries: readonly unknown[]): { text: string; entryId?: string } | undefined {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (!isRecord(entry) || entry.type !== "message") continue;
		const message = entry.message;
		if (!isRecord(message) || message.role !== "user") continue;
		const text = messageText(message);
		if (!text) continue;
		const result: { text: string; entryId?: string } = { text };
		if (typeof entry.id === "string" && entry.id) result.entryId = entry.id;
		return result;
	}
	return undefined;
}

/** Collapse runs of whitespace so wrapping is predictable in a 1-2 line strip. */
export function flatten(text: string): string {
	return text
		.replace(/\r\n?/g, "\n")
		.replace(/[ \t]+/g, " ")
		.replace(/\s*\n\s*/g, " ")
		.trim();
}

/**
 * Wrap plain text to `width` cells, breaking on spaces where possible.
 *
 * Deliberately simple: this renders inside a TUI strip, so a greedy word wrap is
 * enough and avoids pulling in the renderer's wrapping rules.
 */
export function wrap(text: string, width: number): string[] {
	const limit = Math.max(1, Math.floor(width));
	if (limit <= 1) return [text];
	const words = text.split(" ").filter((word) => word.length > 0);
	if (words.length === 0) return [""];
	const lines: string[] = [];
	let current = "";
	const flush = (): void => {
		if (current !== "") {
			lines.push(current);
			current = "";
		}
	};
	for (const word of words) {
		if (current !== "" && current.length + 1 + word.length <= limit) {
			current = `${current} ${word}`;
			continue;
		}
		flush();
		// A single word longer than the line is hard-split so it cannot overflow.
		let rest = word;
		while (rest.length > limit) {
			lines.push(rest.slice(0, limit));
			rest = rest.slice(limit);
		}
		current = rest;
	}
	flush();
	return lines.length > 0 ? lines : [""];
}

export interface StripLine {
	text: string;
	/** True when this line was cut short and something follows. */
	truncated: boolean;
}

/**
 * Build the two-line strip.
 *
 * Continuation lines carry a half-cell indent so the block reads as one thought;
 * when content is cut, the last line ends with an ellipsis and (if room) the
 * expand hint, so the shortcut is discoverable exactly where it matters.
 */
export function buildStrip(
	text: string,
	width: number,
	options: { hint?: string; prefix?: string; label?: string } = {}
): StripLine[] {
	const hint = options.hint ?? "";
	const label = options.label ?? "";
	const prefix = options.prefix ?? "";
	const flat = flatten(text);
	// Reserve room for the label/prefix on line 1 and the hint on the last line.
	const firstIndent = `${prefix}${label}`;
	const available = Math.max(8, width - firstIndent.length);
	const wrapped = wrap(flat, available);
	const out: StripLine[] = [];
	for (let i = 0; i < Math.min(MAX_LINES, wrapped.length); i++) {
		const lead = i === 0 ? firstIndent : "  ";
		out.push({ text: `${lead}${wrapped[i] as string}`, truncated: false });
	}
	const overflow = wrapped.length > MAX_LINES;
	if (!overflow) return out;

	// Something was cut: make the last line say so, and fit the hint when possible.
	const last = out[out.length - 1] as StripLine;
	const suffix = hint ? `… ${hint}` : "…";
	const room = Math.max(4, width - 2 - suffix.length);
	const body = wrap(flat, available);
	const kept = (body[MAX_LINES - 1] ?? "").slice(0, Math.max(0, room));
	last.text = `  ${kept}${suffix}`;
	last.truncated = true;
	return out;
}

/** "asked 3m ago" style age, from the message timestamp when available. */
export function questionAge(entries: readonly unknown[], now = Date.now()): string | undefined {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (!isRecord(entry) || entry.type !== "message") continue;
		const message = entry.message;
		if (!isRecord(message) || message.role !== "user") continue;
		const stamp = message.timestamp;
		if (typeof stamp !== "number" || !Number.isFinite(stamp)) return undefined;
		const seconds = Math.max(0, Math.round((now - stamp) / 1000));
		if (seconds < 60) return `${seconds}s ago`;
		const minutes = Math.round(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.round(minutes / 60);
		if (hours < 48) return `${hours}h ago`;
		return `${Math.round(hours / 24)}d ago`;
	}
	return undefined;
}
