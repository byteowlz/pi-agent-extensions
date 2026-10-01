/**
 * pi-mmry — visible session-start recall from mmry, plus scoped memory tools.
 *
 * Off by default. When enabled (--mmry-recall, PI_MMRY_RECALL=1, or
 * `"enabled": true` in mmry-recall.json):
 *   1. session_start runs `mmry preview --json` for the session cwd and shows
 *      the exact `rendered` text to the user (widget, or stderr in headless
 *      "report" mode).
 *   2. The first prompt afterwards gets those same bytes attached once as a
 *      custom message framed as untrusted observations. The system prompt is
 *      never modified and nothing is re-injected on later turns or on resume.
 *   3. A cwd change produces a new preview, shown before it can be attached.
 *
 * Only the mmry CLI JSON contract is used; ledger files are never touched.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	ATTACHED_ENTRY,
	DEFAULT_CONFIG,
	type Exec,
	type MemoryParams,
	type MetricEvent,
	OFF_ENTRY,
	type Preview,
	RECALL_MESSAGE,
	type RecallConfig,
	envEnabled,
	fetchPreview,
	listLines,
	loadConfig,
	memoryArgs,
	previewLines,
	recallContent,
	recordMetric,
	runMmry,
	sha256,
} from "./src/core.js";

const WIDGET = "mmry";
const TOOL_NAME = "memory";

interface State {
	config: RecallConfig;
	enabled: boolean;
	available: boolean;
	off: boolean;
	preview?: Preview;
	/** cwd the preview was made for. */
	cwd?: string;
	/** The preview was displayed to the user (widget or stderr report). */
	shown: boolean;
	/** cwds already attached in this session (mirrors ATTACHED_ENTRY entries). */
	attached: Set<string>;
}

interface AttachedMarker {
	cwd: string;
	selection_hash: string;
	sha256: string;
}

function customEntries<T>(ctx: ExtensionContext, customType: string): T[] {
	return ctx.sessionManager
		.getEntries()
		.filter((entry) => entry.type === "custom" && entry.customType === customType)
		.map((entry) => (entry as { data?: T }).data)
		.filter((data): data is T => data !== undefined);
}

export default function piMmry(pi: ExtensionAPI) {
	const state: State = {
		config: DEFAULT_CONFIG,
		enabled: false,
		available: false,
		off: false,
		shown: false,
		attached: new Set(),
	};
	const exec: Exec = (command, args, options) => pi.exec(command, args, options);
	const metric = (ctx: ExtensionContext, event: MetricEvent) =>
		recordMetric(state.config, ctx.sessionManager.getSessionId(), event);

	const notify = (ctx: ExtensionContext, message: string, type: "info" | "warning" | "error" = "info") => {
		if (ctx.hasUI) ctx.ui.notify(message, type);
		else process.stderr.write(`pi-mmry: ${message}\n`);
	};

	const setTools = (active: boolean) => {
		const others = pi.getActiveTools().filter((name) => name !== TOOL_NAME);
		pi.setActiveTools(active ? [...others, TOOL_NAME] : others);
	};

	/** Display the frozen preview; returns whether the user can see it. */
	const show = (ctx: ExtensionContext, preview: Preview): boolean => {
		const note = state.off
			? "Recall is off for this session (/memory on)."
			: state.enabled
				? "Attached once to your next prompt; /memory off to skip."
				: "Recall is not enabled; nothing is attached.";
		const lines = previewLines(preview, note);
		if (ctx.hasUI) {
			ctx.ui.setWidget(WIDGET, lines);
			return true;
		}
		if (state.config.headless === "report") {
			process.stderr.write(`${lines.join("\n")}\n`);
			return true;
		}
		return false;
	};

	/** Fetch a fresh preview for ctx.cwd and show it. */
	const refresh = async (ctx: ExtensionContext): Promise<boolean> => {
		state.cwd = ctx.cwd;
		state.shown = false;
		state.preview = undefined;
		try {
			state.preview = await fetchPreview(exec, state.config, ctx.cwd);
			state.available = true;
		} catch (error) {
			state.available = false;
			if (state.enabled) setTools(false);
			notify(ctx, `recall disabled: ${(error as Error).message}`, "warning");
			metric(ctx, { event: "disabled", reason: "unavailable" });
			return false;
		}
		state.shown = show(ctx, state.preview);
		if (state.shown) {
			const { entries, estimated_tokens: tokens, omitted } = state.preview;
			metric(ctx, { event: "shown", entries: entries.length, tokens, omitted });
		} else if (state.enabled) {
			metric(ctx, { event: "disabled", reason: "headless" });
		}
		return true;
	};

	pi.registerFlag("mmry-recall", {
		description: "Show mmry memories at session start and attach them to the first prompt",
		type: "boolean",
		default: false,
	});

	pi.on("session_start", async (_event, ctx) => {
		state.preview = undefined;
		state.shown = false;
		state.available = false;
		try {
			state.config = loadConfig(ctx.cwd);
		} catch (error) {
			state.config = DEFAULT_CONFIG;
			notify(ctx, (error as Error).message, "warning");
		}
		state.enabled = pi.getFlag("mmry-recall") === true || envEnabled() || state.config.enabled;
		state.off = customEntries<{ off: boolean }>(ctx, OFF_ENTRY).at(-1)?.off ?? false;
		state.attached = new Set(customEntries<AttachedMarker>(ctx, ATTACHED_ENTRY).map((marker) => marker.cwd));
		setTools(state.enabled && state.config.tools);
		if (!state.enabled) return;
		// Resumed sessions already carry their recall; do not fetch or show again.
		if (state.attached.has(ctx.cwd)) {
			state.cwd = ctx.cwd;
			return;
		}
		await refresh(ctx);
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		if (!state.enabled || state.off) return;
		if (state.attached.has(ctx.cwd)) return;
		if (state.cwd !== ctx.cwd) {
			// Scope changed: the user must see the new selection before it is used.
			await refresh(ctx);
			return;
		}
		const preview = state.preview;
		if (!state.available || !state.shown || !preview) return;

		const marker: AttachedMarker = { cwd: ctx.cwd, selection_hash: preview.selection_hash, sha256: sha256(preview.rendered) };
		state.attached.add(ctx.cwd);
		pi.appendEntry(ATTACHED_ENTRY, marker);
		metric(ctx, { event: "attached", entries: preview.entries.length, tokens: preview.estimated_tokens });
		if (ctx.hasUI) {
			ctx.ui.setWidget(WIDGET, undefined);
			ctx.ui.setStatus(WIDGET, `mmry: ${preview.entries.length} attached`);
		}
		return {
			message: {
				customType: RECALL_MESSAGE,
				content: recallContent(preview),
				display: true,
				details: { ...marker, memory_ids: preview.entries.map((entry) => entry.memory_id) },
			},
		};
	});

	pi.registerCommand("memory", {
		description: "mmry recall: /memory preview | list | on | off",
		handler: async (args, ctx) => {
			const action = args.trim() || "preview";
			switch (action) {
				case "preview":
					await refresh(ctx);
					return;
				case "list": {
					if (!state.preview && !(await refresh(ctx))) return;
					const lines = listLines(state.preview as Preview);
					if (ctx.hasUI) ctx.ui.setWidget(WIDGET, lines);
					else process.stderr.write(`${lines.join("\n")}\n`);
					return;
				}
				case "off":
					state.off = true;
					pi.appendEntry(OFF_ENTRY, { off: true });
					metric(ctx, { event: "off" });
					if (ctx.hasUI) ctx.ui.setWidget(WIDGET, undefined);
					notify(ctx, "mmry recall off for this session; nothing will be attached");
					return;
				case "on":
					state.enabled = true;
					state.off = false;
					pi.appendEntry(OFF_ENTRY, { off: false });
					setTools(state.config.tools);
					if (state.attached.has(ctx.cwd)) notify(ctx, "mmry recall on (already attached in this session)");
					else await refresh(ctx);
					return;
				default:
					notify(ctx, `unknown /memory action "${action}" (use preview, list, on or off)`, "warning");
			}
		},
	});

	const tool = async (name: string, args: string[], ctx: ExtensionContext) => {
		try {
			const stdout = await runMmry(exec, state.config, ctx.cwd, args);
			metric(ctx, { event: "tool", tool: name, ok: true });
			return { content: [{ type: "text" as const, text: stdout.trim() }], details: { args } };
		} catch (error) {
			metric(ctx, { event: "tool", tool: name, ok: false });
			const message = (error as Error).message;
			return { content: [{ type: "text" as const, text: message }], isError: true, details: { args, error: message } };
		}
	};

	pi.registerTool({
		name: TOOL_NAME,
		label: "Memory",
		description:
			"The user's mmry memories for the current repository and general scope. " +
			"search: find memories (query, limit?). " +
			"create: record a durable, operative fact for future sessions such as a working command, a gotcha, or a stated " +
			"preference; not session notes (content, why?, source?, scope? repo|general, default repo; expires?). " +
			"supersede: replace a memory's text (id, content, reason, expected_revision). " +
			"deprecate: remove a wrong or obsolete memory (id, reason, expected_revision). " +
			"Edits keep history and fail if the memory changed since expected_revision. Returns mmry's JSON.",
		parameters: Type.Object({
			action: Type.Union([Type.Literal("search"), Type.Literal("create"), Type.Literal("supersede"), Type.Literal("deprecate")]),
			query: Type.Optional(Type.String({ description: "search: text to find" })),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, description: "search: max results (default 10)" })),
			id: Type.Optional(Type.String({ description: "supersede/deprecate: memory_id" })),
			content: Type.Optional(Type.String({ description: "create: the memory; supersede: the replacement text" })),
			reason: Type.Optional(Type.String({ description: "supersede/deprecate: why it changed" })),
			expected_revision: Type.Optional(
				Type.Integer({ minimum: 1, description: "supersede/deprecate: revision you last saw (from search or the recall list)" })
			),
			why: Type.Optional(Type.String({ description: "create: why it matters / how to apply it" })),
			source: Type.Optional(Type.String({ description: "create: where it was observed (command, issue, URL)" })),
			scope: Type.Optional(Type.Union([Type.Literal("repo"), Type.Literal("general")], { description: "create: default repo" })),
			expires: Type.Optional(Type.String({ description: "create: RFC 3339 timestamp or duration like 30d" })),
		}),
		execute: (_id, params, _signal, _onUpdate, ctx) => {
			const args = memoryArgs(params as MemoryParams);
			if (typeof args === "string") {
				return Promise.resolve({ content: [{ type: "text" as const, text: args }], isError: true, details: {} });
			}
			return tool(params.action, args, ctx);
		},
	});
}
