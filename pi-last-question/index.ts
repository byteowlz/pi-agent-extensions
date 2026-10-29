/**
 * pi-last-question — pin your last question above the prompt box.
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ ? how do I rotate the deploy key without breaking the build │
 *   │   … ⌥Q expand                                                │
 *   └─────────────────────────────────────────────────────────────┘
 *   ┌─ prompt box ────────────────────────────────────────────────┐
 *
 * Shortcuts:
 *   ctrl+alt+q  expand the full question in an overlay; ⏎ copies it into the editor
 *   ctrl+alt+j  jump: put the full question straight into the prompt box
 *   /last-question   show it as a notification (non-interactive surfaces too)
 *
 * The widget is two lines by design (see last-question.ts). It updates when you
 * submit a prompt, when the session starts or resumes, and when you switch
 * branches, so it always describes the question the current branch answered.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

import { WIDGET_KEY, formatStamp, lastQuestion, questionStamp } from "./last-question.js";
import { createLastQuestionCard } from "./widget.js";

const SHORTCUT_HINT = "⌥Q";

export default function piLastQuestion(pi: ExtensionAPI): void {
	let widgetCtx: ExtensionContext | undefined;
	/**
	 * The prompt just submitted.
	 *
	 * pi emits `input` (and even `turn_start`) BEFORE the user message lands on the
	 * branch, so reading the branch there shows the PREVIOUS question — the card
	 * then stays one prompt behind because nothing re-renders when the message is
	 * committed. The submitted text is known immediately, so it is used until the
	 * branch agrees, then dropped.
	 */
	let pending: { text: string; stamp: string } | undefined;

	/** What the card should show right now: the submitted prompt, else the branch. */
	const current = (ctx: ExtensionContext): { text: string; stamp?: string } | undefined => {
		if (pending) return pending;
		const question = lastQuestion(ctx.sessionManager.getBranch());
		if (!question) return undefined;
		const stamp = questionStamp(ctx.sessionManager.getBranch());
		return stamp ? { text: question.text, stamp } : { text: question.text };
	};

	/** Drop the optimistic text once the branch carries it (or a different one). */
	const reconcile = (ctx: ExtensionContext): void => {
		if (!pending) return;
		const onBranch = lastQuestion(ctx.sessionManager.getBranch());
		const norm = (value: string): string => value.replace(/\s+/g, " ").trim();
		if (!onBranch || !norm(onBranch.text).startsWith(norm(pending.text).slice(0, 60))) pending = undefined;
	};

	const render = (ctx: ExtensionContext): void => {
		if (!ctx.hasUI) return;
		widgetCtx = ctx;
		const question = current(ctx);
		if (!question) {
			ctx.ui.setWidget(WIDGET_KEY, undefined);
			return;
		}
		const stamp = question.stamp;
		// Component form (not string[]): the card needs pi's theme tokens for its
		// background and colours. Box inside pads every row, so it is a rectangle.
		ctx.ui.setWidget(
			WIDGET_KEY,
			(tui, theme) => {
				const { box } = createLastQuestionCard({
					theme,
					text: question.text,
					...(stamp ? { stamp } : {}),
					hint: SHORTCUT_HINT,
				});
				void tui;
				return box;
			},
			{ placement: "aboveEditor" }
		);
	};

	const clear = (): void => {
		const ctx = widgetCtx;
		if (!ctx) return;
		try {
			ctx.ui.setWidget(WIDGET_KEY, undefined);
		} catch {
			// widget host already torn down
		}
	};

	/** Insert the full question into the prompt box (append to anything already typed). */
	const insertIntoEditor = (ctx: ExtensionContext, text: string): void => {
		const existing = ctx.ui.getEditorText();
		const next = existing.trim() ? `${text}\n\n${existing}` : text;
		ctx.ui.setEditorText(next);
		ctx.ui.notify("Last question inserted into the prompt box.", "info");
	};

	const openExpanded = async (ctx: ExtensionContext): Promise<void> => {
		if (!ctx.hasUI) {
			showInNotification(ctx);
			return;
		}
		const question = current(ctx);
		if (!question) {
			ctx.ui.notify("No question yet in this session.", "info");
			return;
		}
		const choice = await ctx.ui.custom<string | undefined>(
			(tui, theme, _keybindings, done) => {
				let scroll = 0;
				const lines = question.text.split("\n");
				let cached: string[] | undefined;
				const close = (value: string | undefined): void => {
					done(value);
				};
				return {
					render: (width: number) => {
						if (cached) return cached;
						const inner = Math.max(20, width - 4);
						const body: string[] = [];
						for (const raw of lines) {
							for (let i = 0; i < raw.length || i === 0; i += inner) body.push(raw.slice(i, i + inner));
						}
						const visible = Math.max(4, (tui.terminal?.rows ?? 24) - 8);
						const maxScroll = Math.max(0, body.length - visible);
						scroll = Math.min(scroll, maxScroll);
						const window = body.slice(scroll, scroll + visible);
						const out: string[] = [theme.fg("accent", "─".repeat(width))];
						out.push(
							` ${theme.fg("accent", "Your last question")}${theme.fg("muted", scroll > 0 ? `  (${scroll + 1}-${scroll + window.length} of ${body.length})` : "")}`
						);
						out.push("");
						for (const line of window) out.push(` ${line}`);
						out.push("");
						out.push(theme.fg("muted", " ↑/↓ scroll · enter inserts into the prompt box · y copies · esc closes"));
						out.push(theme.fg("accent", "─".repeat(width)));
						cached = out.map((line) => truncateToWidth(line, width));
						return cached;
					},
					invalidate: () => {
						cached = undefined;
					},
					handleInput: (data: string) => {
						if (matchesKey(data, Key.escape) || matchesKey(data, "q")) {
							close(undefined);
							return;
						}
						if (matchesKey(data, Key.enter)) {
							close("insert");
							return;
						}
						if (matchesKey(data, "y")) {
							close("copy");
							return;
						}
						if (matchesKey(data, Key.up)) scroll = Math.max(0, scroll - 1);
						else if (matchesKey(data, Key.down)) scroll += 1;
						else if (matchesKey(data, Key.pageUp)) scroll = Math.max(0, scroll - 10);
						else if (matchesKey(data, Key.pageDown)) scroll += 10;
						else if (matchesKey(data, Key.home)) scroll = 0;
						tui.requestRender();
					},
				};
			},
			{ overlay: true, overlayOptions: { anchor: "center", width: "80%", maxHeight: "80%" } }
		);
		if (choice === "insert") insertIntoEditor(ctx, question.text);
		if (choice === "copy") {
			// Reuse the editor as the clipboard path: it is what the user can act on.
			ctx.ui.setEditorText(question.text);
			ctx.ui.notify("Last question copied into the prompt box.", "info");
		}
	};

	const showInNotification = (ctx: ExtensionContext): void => {
		const question = current(ctx);
		if (!question) {
			ctx.ui.notify("No question yet in this session.", "info");
			return;
		}
		ctx.ui.notify(question.text.slice(0, 900), "info");
	};

	const jump = (ctx: ExtensionContext): void => {
		const question = current(ctx);
		if (!question) {
			ctx.ui.notify("No question yet in this session.", "info");
			return;
		}
		insertIntoEditor(ctx, question.text);
	};

	pi.registerShortcut(Key.ctrlAlt("q"), {
		description: "Expand your last question (enter inserts it into the prompt box)",
		handler: (ctx) => openExpanded(ctx),
	});

	pi.registerShortcut(Key.ctrlAlt("j"), {
		description: "Put your last question into the prompt box",
		handler: (ctx) => jump(ctx),
	});

	pi.registerCommand("last-question", {
		description: "Show your last question (full text) — also available as ctrl+alt+q",
		handler: async (_args, ctx) => {
			if (ctx.mode === "tui") await openExpanded(ctx);
			else showInNotification(ctx);
		},
	});

	// One handler per event, matching real pi and Map-based test doubles.
	//
	// Do NOT re-render on `input`: that event fires before the prompt is submitted,
	// so the branch still holds the previous question and the card would show stale
	// text with nothing to refresh it afterwards (reported as "it never updates").
	// `turn_start` is the prompt being picked up in the agent loop, and
	// `message_end` for a user message fires when that message is committed.
	pi.on("session_start", async (_event, ctx) => {
		pending = undefined;
		render(ctx);
	});

	// The submitted prompt is the only place the new question is known before pi
	// appends it to the branch, so show it optimistically right away.
	pi.on("input", async (event, ctx) => {
		const text = typeof event.text === "string" ? event.text.trim() : "";
		if (!text) return undefined;
		pending = { text, stamp: formatStamp(Date.now()) };
		render(ctx);
		return undefined;
	});

	// Once the message is on the branch, prefer the branch (it survives resume and
	// reflects edits/transforms); turn_end and agent_end always get here.
	pi.on("message_end", async (event, ctx) => {
		const message = event.message as { role?: string } | undefined;
		if (message?.role === "user" || message?.role === "assistant") {
			reconcile(ctx);
			render(ctx);
		}
		return undefined;
	});
	pi.on("turn_end", async (_event, ctx) => {
		reconcile(ctx);
		render(ctx);
		return undefined;
	});
	pi.on("agent_end", async (_event, ctx) => {
		reconcile(ctx);
		render(ctx);
		return undefined;
	});
	pi.on("session_tree", async (_event, ctx) => {
		pending = undefined;
		render(ctx);
	});
	pi.on("session_shutdown", async () => {
		pending = undefined;
		clear();
		widgetCtx = undefined;
	});
}
