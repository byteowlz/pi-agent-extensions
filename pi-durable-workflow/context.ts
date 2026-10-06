import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WorkflowSource } from "../packages/pi-durable-workflow-core/index.js";
import { clipText } from "../pi-session-tools/output-budget.js";

/** A bounded TEXT PROJECTION, not an importer or a recoverable execution checkpoint. */
export function capturePriming(ctx: ExtensionContext, maxBytes = 24000, maxEntries = 200): WorkflowSource {
	const entries = ctx.sessionManager.buildContextEntries?.() ?? ctx.sessionManager.getBranch();
	const entryIds: string[] = [];
	const chunks: string[] = [];
	let bytes = 0;
	let droppedEntries = 0;
	for (const entry of entries.slice(0, maxEntries)) {
		let text = "";
		if (entry.type === "compaction") text = `Compaction summary:\n${entry.summary}`;
		else if (entry.type === "message" && (entry.message.role === "user" || entry.message.role === "assistant")) {
			const content = entry.message.content;
			const parts = typeof content === "string" ? [{ type: "text" as const, text: content }] : content;
			const plain = parts
				.filter((part) => part.type === "text")
				.map((part) => part.text)
				.join("\n");
			if (parts.some((part) => part.type !== "text")) droppedEntries++;
			if (plain) text = `${entry.message.role}:\n${plain}`;
		} else if (entry.type !== "model_change" && entry.type !== "thinking_level_change" && entry.type !== "session_info") {
			droppedEntries++;
		}
		if (!text) continue;
		const remaining = maxBytes - bytes;
		if (remaining <= 2) {
			droppedEntries++;
			continue;
		}
		const clipped = clipText(text.slice(0, remaining), remaining - 2);
		if (clipped !== text) droppedEntries++;
		chunks.push(clipped);
		entryIds.push(entry.id);
		bytes += Buffer.byteLength(clipped) + 2;
	}
	droppedEntries += Math.max(0, entries.length - maxEntries);
	return {
		sessionId: ctx.sessionManager.getSessionId(),
		cwd: ctx.cwd,
		entryIds,
		context: chunks.join("\n\n"),
		// Ordinary host system sections, attachments and execution state are NOT exported.
		contextComplete: false,
		droppedEntries,
	};
}
