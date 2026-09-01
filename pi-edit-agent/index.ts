/**
 * pi-edit-agent — edit an assistant (agent) message and continue from there.
 *
 * Adds the `/edit-agent` command. Think of it as `/tree` (pick a point in the
 * conversation) plus the ability to actually EDIT the agent message at that
 * point, then let the agent continue from the edited message.
 *
 * Flow:
 *   1. Pick an assistant message on the current branch (default = last one).
 *      Pass `last` or an assistant-message number (e.g. `2`) to skip the picker.
 *   2. Edit its text in the editor.
 *   3. A new branch is created from the message's parent with the edited text.
 *      The original branch is preserved in history (nothing is destroyed).
 *   4. Optionally have the agent continue from the edited message.
 *
 * Implementation note: pi's session tree is append-only, so a message can't be
 * mutated in place. `ctx.sessionManager` is read-only, so we open a second,
 * writable `SessionManager` on the same file (via SessionManager.open), branch
 * off the target message's parent and append the edited message, then re-read
 * the session file (via switchSession to the same path) so the live agent state
 * + TUI refresh from disk.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AssistantMessage, TextContent, Usage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";

// ── Config ───────────────────────────────────────────────────────────

interface EditAgentConfig {
	/** User message sent to trigger the continuation turn after an edit. */
	continuePrompt: string;
	/** What happens when you press Esc on the "what next?" prompt. */
	defaultAction: "continue" | "editOnly";
}

const DEFAULTS: EditAgentConfig = {
	continuePrompt: "I edited your previous message. Continue from there.",
	defaultAction: "continue",
};

function loadConfig(cwd: string): EditAgentConfig {
	const candidates = [
		join(cwd, "edit-agent.json"),
		join(cwd, ".pi", "edit-agent.json"),
		join(homedir(), ".pi", "agent", "edit-agent.json"),
	];
	for (const path of candidates) {
		if (!existsSync(path)) continue;
		try {
			const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<EditAgentConfig>;
			return {
				continuePrompt: typeof raw.continuePrompt === "string" ? raw.continuePrompt : DEFAULTS.continuePrompt,
				defaultAction: raw.defaultAction === "editOnly" ? "editOnly" : "continue",
			};
		} catch {
			// ignore malformed config, try next candidate
		}
	}
	return { ...DEFAULTS };
}

// ── Helpers ──────────────────────────────────────────────────────────

interface AssistantPick {
	entryId: string;
	parentId: string | null;
	text: string;
	preview: string;
	number: number; // 1-based, oldest assistant message on the branch = 1
	model: string;
	provider: string;
	api: string;
}

const ZERO_USAGE: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

type ReadOnlySM = Pick<SessionManager, "getBranch">;
type SelectorUI = Pick<ExtensionUIContext, "select">;

function extractAssistantText(msg: AssistantMessage): string {
	return (msg.content ?? [])
		.filter((c): c is TextContent => c.type === "text")
		.map((c) => c.text)
		.join("\n");
}

function makePreview(text: string, max = 60): string {
	const oneLine = text.replace(/\s+/g, " ").trim();
	return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function shortModel(model: string, max = 30): string {
	return model.length > max ? `${model.slice(0, max - 1)}…` : model;
}

/** Gather editable assistant messages on the current branch (chronological). */
function gatherAssistantPicks(sm: ReadOnlySM): AssistantPick[] {
	const branch = sm.getBranch(); // root → leaf
	const picks: AssistantPick[] = [];
	let assistantNo = 0;
	for (const entry of branch) {
		if (entry.type !== "message" || entry.message.role !== "assistant") continue;
		assistantNo++;
		const msg = entry.message as AssistantMessage;
		const text = extractAssistantText(msg);
		if (!text.trim()) continue; // skip aborted / empty messages
		picks.push({
			entryId: entry.id,
			parentId: entry.parentId,
			text,
			preview: makePreview(text),
			number: assistantNo,
			model: msg.model,
			provider: msg.provider,
			api: msg.api,
		});
	}
	return picks;
}

/** Resolve the target pick from args (picker, "last", or explicit number). */
async function resolveTarget(
	args: string,
	picks: AssistantPick[],
	ui: SelectorUI
): Promise<{ pick: AssistantPick; badArg: false } | { pick: undefined; badArg: boolean }> {
	const arg = args.trim().toLowerCase();
	if (arg === "" || arg === "pick" || arg === "select") {
		const pick = await pickViaSelector(picks, ui);
		return { pick, badArg: false };
	}
	if (arg === "last" || arg === "latest" || arg === "0") {
		return { pick: picks[picks.length - 1], badArg: false };
	}
	const n = Number.parseInt(arg, 10);
	if (Number.isInteger(n) && n >= 1 && n <= picks.length) {
		return { pick: picks[n - 1], badArg: false };
	}
	return { pick: undefined, badArg: args.trim() !== "" };
}

async function pickViaSelector(picks: AssistantPick[], ui: SelectorUI): Promise<AssistantPick | undefined> {
	// newest first so the last assistant message is the default (first) option
	const newestFirst = [...picks].reverse();
	const labels = newestFirst.map((p) => `#${p.number}  ${p.provider}/${shortModel(p.model)}  ${p.preview}`);
	const choice = await ui.select("Edit which assistant message?", labels);
	if (choice === undefined) return undefined; // cancelled
	const idx = labels.indexOf(choice);
	return idx >= 0 ? newestFirst[idx] : undefined;
}

/** Branch off the target message's parent and append the edited message. */
function appendEditedBranch(sm: SessionManager, pick: AssistantPick, editedText: string): void {
	if (pick.parentId === null) {
		sm.resetLeaf();
	} else {
		sm.branch(pick.parentId);
	}
	const editedMessage: AssistantMessage = {
		role: "assistant",
		content: [{ type: "text", text: editedText }],
		api: pick.api,
		provider: pick.provider,
		model: pick.model,
		usage: ZERO_USAGE,
		stopReason: "stop",
		timestamp: Date.now(),
	};
	sm.appendMessage(editedMessage);
}

// ── Extension ────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	pi.registerCommand("edit-agent", {
		description: "Edit an assistant message and continue from there",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("edit-agent needs an interactive UI", "warning");
				return;
			}
			await ctx.waitForIdle();

			const picks = gatherAssistantPicks(ctx.sessionManager);
			if (picks.length === 0) {
				ctx.ui.notify("No editable assistant messages on this branch", "warning");
				return;
			}

			const { pick, badArg } = await resolveTarget(args, picks, ctx.ui);
			if (!pick) {
				if (badArg) {
					ctx.ui.notify(`Unknown argument "${args}". Use: last | <number> | (picker)`, "warning");
				}
				return;
			}

			const edited = await ctx.ui.editor("Edit assistant message:", pick.text);
			if (edited === undefined) return; // cancelled
			const trimmed = edited.replace(/\s+$/, "");
			if (!trimmed.trim()) {
				ctx.ui.notify("Empty message — nothing changed", "warning");
				return;
			}
			if (trimmed === pick.text) {
				ctx.ui.notify("No changes — nothing to do", "info");
				return;
			}

			await applyAndRefresh(ctx, pick, trimmed);
		},
	});
}

/** Apply the edit, refresh the live view, and optionally continue the agent. */
async function applyAndRefresh(ctx: ExtensionCommandContext, target: AssistantPick, editedText: string): Promise<void> {
	const config = loadConfig(ctx.cwd);
	const sessionFile = ctx.sessionManager.getSessionFile();

	if (!sessionFile) {
		// Nothing to re-read from disk; can't refresh a non-persisted session.
		ctx.ui.notify("edit-agent needs a persisted session", "warning");
		return;
	}

	// Open a writable handle to the same file, branch off the target's parent,
	// and append the edited message. The original branch is preserved.
	const sm = SessionManager.open(sessionFile);
	appendEditedBranch(sm, target, editedText);

	// Re-read the same session file so the live agent state + TUI refresh.
	// The edited message is the last file entry, so the leaf lands on it and
	// agent.state.messages is rebuilt with the edited content.
	const result = await ctx.switchSession(sessionFile, {
		withSession: async (sctx) => {
			const opts = ["▶  Continue from edit", "✎  Keep edit only (no auto-continue)"];
			const choice = await sctx.ui.select("Agent message edited. What next?", opts);
			const shouldContinue = choice === undefined ? config.defaultAction === "continue" : choice === opts[0];
			if (shouldContinue) {
				await sctx.sendUserMessage(config.continuePrompt);
			}
		},
	});

	if (result.cancelled) {
		ctx.ui.notify("Edit saved, but session refresh was cancelled. Run /resume to see it.", "warning");
	}
}
