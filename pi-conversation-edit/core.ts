import { chmodSync, linkSync, mkdtempSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { type ExtensionContext, SessionManager } from "@earendil-works/pi-coding-agent";
type ReadonlySessionManager = ExtensionContext["sessionManager"];

export const MAX_TEXT_BYTES = 32 * 1024;
export const MAX_SELECTED = 20;
export const MAX_TOTAL_BYTES = 128 * 1024;
export interface EditableMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
}
export interface RewriteChange extends EditableMessage {
	replacement: string;
}

export function validateText(text: string): void {
	if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) throw new Error("Message exceeds 32 KiB; no text was truncated.");
	if (Buffer.from(text, "utf8").toString("utf8") !== text) throw new Error("Text contains invalid Unicode.");
	for (const char of text) {
		const code = char.charCodeAt(0);
		if ((code < 32 && ![9, 10, 13].includes(code)) || (code >= 127 && code <= 159))
			throw new Error("Terminal control characters are protected; plain text only.");
	}
}

/** Only active, projected, wholly text messages; never discard hidden blocks. */
export function editableMessages(manager: ReadonlySessionManager): EditableMessage[] {
	const eligible: EditableMessage[] = [];
	for (const entry of manager.buildSessionProjection().entries) {
		if (entry.sourceEntry.type !== "message" || entry.messages.length !== 1) continue;
		const raw = entry.sourceEntry.message;
		const message = entry.messages[0];
		if (raw.role !== "user" && raw.role !== "assistant") continue;
		if (message.role !== raw.role) continue;
		if (Array.isArray(raw.content) && raw.content.some((part) => part.type !== "text")) continue;
		const content = message.content;
		if (Array.isArray(content) && content.some((part) => part.type !== "text")) continue;
		const text =
			typeof content === "string" ? content : content.map((part) => (part.type === "text" ? part.text : "")).join("\n");
		try {
			validateText(text);
			eligible.push({ id: entry.sourceEntry.id, role: raw.role, text });
		} catch {
			/* Oversized, invalid Unicode and terminal-control content are protected. */
		}
	}
	return eligible;
}

export function validateChanges(messages: EditableMessage[], changes: RewriteChange[]): void {
	if (!changes.length || changes.length > MAX_SELECTED) throw new Error("Select between 1 and 20 messages.");
	const seen = new Set<string>();
	let bytes = 0;
	for (const change of changes) {
		const source = messages.find((item) => item.id === change.id);
		if (!source || source.role !== change.role || source.text !== change.text || seen.has(change.id))
			throw new Error("Selected message changed, is protected, or was selected twice.");
		seen.add(change.id);
		validateText(change.replacement);
		if (!change.replacement.trim()) throw new Error("Empty replacements are unsupported; skip the message instead.");
		bytes += Buffer.byteLength(change.text) + Buffer.byteLength(change.replacement);
	}
	if (bytes > MAX_TOTAL_BYTES) throw new Error("Selected original and replacement text exceeds 128 KiB.");
}

/** Coarse unified diff: unchanged prefix/suffix remain as context; nothing is truncated. */
export function reviewDiff(change: RewriteChange): string {
	const before = change.text.split("\n");
	const after = change.replacement.split("\n");
	let start = 0;
	while (start < before.length && start < after.length && before[start] === after[start]) start++;
	let end = 0;
	while (
		end < before.length - start &&
		end < after.length - start &&
		before[before.length - 1 - end] === after[after.length - 1 - end]
	)
		end++;
	return [
		`--- ${change.role} ${change.id} original`,
		"+++ proposed context",
		...before.slice(Math.max(0, start - 3), start).map((line) => ` ${line}`),
		...before.slice(start, before.length - end).map((line) => `-${line}`),
		...after.slice(start, after.length - end).map((line) => `+${line}`),
		...before.slice(before.length - end, before.length - end + 3).map((line) => ` ${line}`),
	].join("\n");
}

export interface ForkRequest {
	sourceFile: string;
	sourceId: string;
	leafId: string;
	changes: RewriteChange[];
	restart?: boolean;
	restartAfterId?: string;
}

/** Fork through the native SDK, then append context edits to the independent file. */
function buildFork(request: ForkRequest, staging: string): string {
	const source = SessionManager.open(request.sourceFile, staging);
	if (source.getSessionId() !== request.sourceId) throw new Error("Source session changed.");
	const path = source.getBranch(request.leafId);
	if (!path.length || path.at(-1)?.id !== request.leafId) throw new Error("Source branch is unavailable.");
	// Project precisely the caller's branch, not whichever branch was last written.
	source.branch(request.leafId);
	const eligible = editableMessages(source);
	validateChanges(eligible, request.changes);
	const selected = new Set(request.changes.map((change) => change.id));
	const lastSelected = path.reduce((last, entry, index) => (selected.has(entry.id) ? index : last), -1);
	const restartIndex = request.restartAfterId ? path.findIndex((entry) => entry.id === request.restartAfterId) : lastSelected;
	if (request.restart && (restartIndex < lastSelected || !eligible.some((message) => message.id === path[restartIndex]?.id)))
		throw new Error("Restart boundary must include every accepted edit and be an editable message.");
	const cut = request.restart ? path[restartIndex].id : request.leafId;
	if (request.restart && path.slice(restartIndex + 1).some((entry) => entry.type === "compaction"))
		throw new Error("Restart point precedes a compaction boundary. Use keep later context instead.");
	const branchFile = source.createBranchedSession(cut);
	if (!branchFile) throw new Error("An independent branch could not be saved.");
	const branch = SessionManager.open(branchFile);
	// Carry existing branch-local overrides across a restart cut as well.
	if (request.restart)
		for (const entry of path) {
			if (entry.type === "context_edit" && branch.getEntry(entry.targetId))
				branch.appendContextEdit(entry.targetId, entry.replacement);
		}
	for (const change of request.changes) branch.appendContextEdit(change.id, { content: change.replacement });
	branch.appendCustomEntry("conversation-rewrite", {
		version: 1,
		sourceId: request.sourceId,
		sourceLeaf: request.leafId,
		mode: request.restart ? "restart" : "keep",
		targetIds: request.changes.map((change) => change.id),
	});
	branch.appendSessionInfo("Rewritten Conversation");
	return branchFile;
}

/** Publish only a completely prepared fork; never overwrite another session. */
export function forkRewrite(request: ForkRequest): string {
	const dir = dirname(request.sourceFile);
	const staging = mkdtempSync(join(dir, ".rewrite-"));
	try {
		const file = buildFork(request, staging);
		chmodSync(file, 0o600);
		const target = join(dir, basename(file));
		linkSync(file, target);
		return target;
	} finally {
		rmSync(staging, { recursive: true, force: true });
	}
}
