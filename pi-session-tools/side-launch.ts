import { randomUUID } from "node:crypto";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildSubagentSessionName } from "../pi-auto-rename/index.js";

/** Persist one agent-visible boundary per child branch; inherited markers belong to other ids. */
export function forkBoundaryMessage(ctx: ExtensionContext) {
	if (!ctx.sessionManager.getHeader?.()?.parentSession) return undefined;
	const sessionId = ctx.sessionManager.getSessionId();
	const entries = ctx.sessionManager.getBranch?.() ?? ctx.sessionManager.getEntries();
	if (
		entries.some(
			(entry) =>
				entry.type === "custom_message" &&
				entry.customType === "side-session-boundary" &&
				(entry.details as { sessionId?: string } | undefined)?.sessionId === sessionId
		)
	)
		return undefined;
	return {
		customType: "side-session-boundary",
		display: true,
		details: { sessionId },
		content: `Session boundary: you are now in a separate forked session (${sessionId}). Earlier conversation is inherited context, not the same live session. The parent remains separate; its xlatch connection and terminal/resource ownership do not carry over. Working-directory files may still be shared.`,
	};
}

/** One fork identity/notice for both Herdr and tmux; never reuse the parent's file/id. */
export function sideLaunch(
	options: {
		label: string;
		cwd: string;
		sessionFile: string;
		parentSessionId?: string;
		model?: string;
	},
	sessionId = randomUUID()
) {
	const title = options.label.replace(/^(?:\[side\]\s*)+/i, "");
	const name = buildSubagentSessionName(title, sessionId, options.cwd).replace(/^\[sub\]/, "[side]");
	const parent = options.parentSessionId ? ` (parent session ${options.parentSessionId})` : "";
	const hint = `Session boundary: this is a NEW, independently named side session${parent}. Earlier conversation is inherited context, not evidence that you are still the parent session. You have a separate session id/file; do not assume the parent's xlatch connection, terminal identity, or resource ownership carries over. The parent session remains separate. Working-directory files may still be shared.`;
	const argv = ["--fork", options.sessionFile, "--session-id", sessionId, "--name", name, "--append-system-prompt", hint];
	if (options.model) argv.push("--model", options.model);
	return { sessionId, name, hint, argv };
}
