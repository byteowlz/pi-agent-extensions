/**
 * pi-openui: agent-generated UI (OpenUI Lang, Oqto profile) in the Pi TUI.
 *
 * - `/openui on|off|status`, persisted per session. Off: no prompt, tool inactive.
 * - Model-only `openui` tool: one UI part per call. With an answer schema it
 *   waits for the user and resolves with the @Answer value.
 * - Cells-level rendering through Pi theme roles; text fallback outside the TUI.
 * Telemetry: install scripts are blocked and OPENUI_TELEMETRY_DISABLED is forced.
 */
process.env.OPENUI_TELEMETRY_DISABLED = "1";
process.env.DO_NOT_TRACK = "1";
Reflect.deleteProperty(process.env, "OPENUI_RUNTIME_TELEMETRY_ENABLED");

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key as K, Text, matchesKey } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { herdrBlocked, herdrRelease } from "../pi-selection/herdr.js";
import { type Key, type Outcome, answerPayload, reduce } from "./interact.js";
import { FIXTURES, PROFILE_VERSION, createOqtoParser, renderFallback } from "./openui-vendor.js";
import { OPENUI_GUIDANCE, PROGRAM_REFERENCE } from "./reference.js";
import { type Control, type Paint, type ViewState, emptyState, render } from "./render.js";

export const STATE_ENTRY = "pi-openui/state";
export const TOOL = "openui";
export const REFERENCE_TOOL = "openui_reference";

export interface PartDetails {
	profile: string;
	body: string;
	fallback: string;
	errors: string[];
	answer?: unknown;
	outcome?: "answered" | "cancelled" | "unattended" | "displayed";
}

/** Latest persisted on/off decision on the active branch (default off). */
export function enabledOnBranch(entries: readonly unknown[]): boolean {
	let on = false;
	for (const e of entries) {
		const x = e as { type?: string; customType?: string; data?: { enabled?: unknown } };
		if (x.type === "custom" && x.customType === STATE_ENTRY && typeof x.data?.enabled === "boolean") on = x.data.enabled;
	}
	return on;
}

function parse(body: string) {
	const result = createOqtoParser().parse(body);
	return {
		root: result.root,
		state: result.stateDeclarations,
		errors: result.meta.errors.map((e: { code: string; message?: string }) => `${e.code}: ${e.message ?? ""}`.slice(0, 200)),
	};
}

function keyOf(data: string): Key | undefined {
	if (matchesKey(data, K.tab)) return "tab";
	if (matchesKey(data, K.shift("tab"))) return "shift-tab";
	if (matchesKey(data, K.up)) return "up";
	if (matchesKey(data, K.down)) return "down";
	if (matchesKey(data, K.left)) return "left";
	if (matchesKey(data, K.right)) return "right";
	if (matchesKey(data, K.enter)) return "enter";
	if (matchesKey(data, K.escape)) return "escape";
	if (matchesKey(data, K.backspace)) return "backspace";
	if (data === " ") return "space";
	if (data.length === 1 && data >= " ") return { char: data };
	return undefined;
}

/** Interactive TUI: render the part, route keys, resolve with the outcome. */
async function interact(
	ctx: ExtensionContext,
	root: unknown,
	initial: Record<string, unknown>,
	signal?: AbortSignal
): Promise<{ outcome: Outcome; state: ViewState }> {
	let state = emptyState(initial, true);
	return ctx.ui.custom<{ outcome: Outcome; state: ViewState }>((tui, theme, _kb, done) => {
		let controls: Control[] = [];
		let finished = false;
		const finish = (outcome: Outcome) => {
			if (finished) return;
			finished = true;
			done({ outcome, state });
		};
		signal?.addEventListener("abort", () => finish({ kind: "cancel" }), { once: true });
		const paint: Paint = {
			fg: (role, text) => theme.fg(role as never, text),
			bold: (text) => theme.bold(text),
			inverse: (text) => theme.inverse(theme.fg("accent", text)),
		};
		return {
			render(width: number) {
				const out = render(root, width, paint, state);
				controls = out.controls;
				return [...out.lines, theme.fg("dim", "↑↓ move · enter choose · space toggle · 1-9 pick · ←/→ tabs · esc cancel")];
			},
			invalidate() {
				// stateless: rendered fresh from state on every call
			},
			handleInput(data: string) {
				const key = keyOf(data);
				if (!key) return;
				const next = reduce(state, controls, key);
				state = next.state;
				if (next.outcome) finish(next.outcome);
				else tui.requestRender();
			},
		};
	});
}

/** Preview a profile fixture locally in the real TUI. No model call; answers are only shown. */
async function demo(ctx: ExtensionContext, name?: string): Promise<void> {
	const fixtures = FIXTURES as Record<string, string>;
	const names = Object.keys(fixtures).sort();
	const pick = name && names.includes(name) ? name : ctx.hasUI ? await ctx.ui.select("OpenUI demo", names) : undefined;
	if (!pick) return;
	if (ctx.mode !== "tui" || !ctx.hasUI) return;
	const { root, state, errors } = parse(fixtures[pick] ?? "");
	const { outcome, state: final } = await interact(ctx, root, state);
	const shown = outcome.kind === "answer" ? `answered ${JSON.stringify(answerPayload(outcome, final))}` : outcome.kind;
	ctx.ui.notify(`OpenUI demo ${pick}: ${shown}${errors.length ? ` (parser: ${errors.length} warning)` : ""}`, "info");
}

export default function (pi: ExtensionAPI) {
	let enabled = false;

	const sync = (ctx: ExtensionContext) => {
		enabled = enabledOnBranch(ctx.sessionManager.getBranch());
		const active = new Set(pi.getActiveTools());
		for (const name of [TOOL, REFERENCE_TOOL]) {
			if (enabled) active.add(name);
			else active.delete(name);
		}
		pi.setActiveTools([...active]);
		if (ctx.hasUI) ctx.ui.setStatus("pi-openui", enabled ? "openui" : undefined);
	};
	pi.on("session_start", async (_e, ctx) => sync(ctx));
	pi.on("session_tree", async (_e, ctx) => sync(ctx));

	pi.on("before_agent_start", async (event) => {
		if (!enabled) {
			const { openui: _off, ...rest } = event.systemPromptOptions.sections ?? {};
			event.systemPromptOptions.sections = rest;
			return;
		}
		event.systemPromptOptions.sections = {
			...event.systemPromptOptions.sections,
			openui: OPENUI_GUIDANCE,
		};
	});

	pi.registerCommand("openui", {
		description: "Agent-generated UI for this session: /openui on | off | status | demo [fixture]",
		handler: async (args, ctx) => {
			const [verb, name] = (args ?? "").trim().split(/\s+/);
			if (verb === "demo") return demo(ctx, name);
			const arg = (verb ?? "").toLowerCase();
			if (arg === "on" || arg === "off") {
				pi.appendEntry(STATE_ENTRY, { enabled: arg === "on" });
				sync(ctx);
			}
			ctx.ui.notify(
				`OpenUI ${enabled ? "on" : "off"} for this session (profile ${PROFILE_VERSION})${arg === "" || arg === "status" ? "" : "."}`,
				"info"
			);
		},
	});

	pi.registerTool({
		name: REFERENCE_TOOL,
		label: "OpenUI reference",
		description:
			"Read the OpenUI program syntax and component reference on demand. Applies only to the openui tool's program argument.",
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		parameters: Type.Object({
			offset: Type.Optional(Type.Integer({ minimum: 0, description: "Character offset; default 0." })),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 12000, description: "Maximum characters; default 6000." })),
		}),
		outputSchema: Type.Object({
			text: Type.String(),
			offset: Type.Integer(),
			nextOffset: Type.Union([Type.Integer(), Type.Null()]),
			totalChars: Type.Integer(),
		}),
		async execute(_id, params) {
			if (!enabled) throw new Error("OpenUI is off for this session; the user can enable it with /openui on.");
			const offset = params.offset ?? 0;
			const end = Math.min(offset + (params.limit ?? 6000), PROGRAM_REFERENCE.length);
			if (offset > PROGRAM_REFERENCE.length) throw new Error("OpenUI reference offset exceeds its length");
			const page = {
				text: PROGRAM_REFERENCE.slice(offset, end),
				offset,
				nextOffset: end < PROGRAM_REFERENCE.length ? end : null,
				totalChars: PROGRAM_REFERENCE.length,
			};
			return { content: [{ type: "text", text: JSON.stringify(page) }], details: page, structuredContent: page };
		},
	});

	pi.registerTool({
		name: TOOL,
		label: "OpenUI",
		exposure: "model-only",
		description:
			"Show an OpenUI Lang program to the user. Use openui_reference for syntax. Include a plain-text fallback. Set wait: true to return the user's @Answer; otherwise display without waiting.",
		annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
		parameters: Type.Object(
			{
				program: Type.String({ description: "OpenUI Lang program (one statement per line, entry statement `root`)" }),
				fallback: Type.String({ description: "Plain-text rendering for hosts without UI", maxLength: 4000 }),
				wait: Type.Optional(Type.Boolean({ description: "Wait for the user's @Answer (default false)" })),
			},
			{ additionalProperties: false }
		),
		renderCall(args, theme) {
			const first = String(args.program ?? "")
				.split("\n")
				.find((l) => /CardHeader\(|InlineHeader\(/.test(l));
			const title = first?.match(/\(\s*"([^"]*)"/)?.[1];
			return new Text(
				theme.fg("accent", `OpenUI${title ? ` · ${title}` : ""}${args.wait ? theme.fg("dim", " · waiting for you") : ""}`),
				0,
				0
			);
		},
		renderResult(result, _opts, theme) {
			const d = result.details as PartDetails | undefined;
			if (!d) return new Text("", 0, 0);
			const parsed = parse(d.body);
			const paint: Paint = { fg: (r, t) => theme.fg(r as never, t), bold: (t) => theme.bold(t) };
			return {
				render: (width: number) => {
					const lines = parsed.root ? render(parsed.root, width, paint, emptyState(parsed.state)).lines : d.fallback.split("\n");
					const tail =
						d.outcome === "answered"
							? [theme.fg("success", `✓ answered: ${JSON.stringify(d.answer).slice(0, Math.max(10, width - 14))}`)]
							: d.outcome === "cancelled"
								? [theme.fg("warning", "✗ cancelled")]
								: [];
					return [...lines, ...tail];
				},
				invalidate() {
					// stateless: rendered fresh from state on every call
				},
			};
		},
		async execute(_id, params, signal, _onUpdate, ctx) {
			if (!enabled) throw new Error("OpenUI is off for this session; the user can enable it with /openui on.");
			const { root, state, errors } = parse(params.program);
			const base: PartDetails = { profile: `oqto@${PROFILE_VERSION}`, body: params.program, fallback: params.fallback, errors };
			if (!root)
				throw new Error(`OpenUI program did not render: ${errors.join("; ") || "no root"}. Fix the program and call again.`);
			const note = errors.length ? `\nRender warnings (fix next time): ${errors.join("; ")}` : "";
			if (!params.wait) {
				return { content: [{ type: "text", text: `Displayed to the user.${note}` }], details: { ...base, outcome: "displayed" } };
			}
			if (ctx.mode !== "tui" || !ctx.hasUI) {
				// Never answer on the user's behalf: report that nobody could answer here.
				return {
					content: [
						{
							type: "text",
							text: `No interactive UI in this mode; the user saw the fallback and could not answer. Ask in plain text instead.${note}`,
						},
					],
					details: { ...base, outcome: "unattended" },
				};
			}
			herdrBlocked("openui: waiting for your answer");
			try {
				const { outcome, state: final } = await interact(ctx, root, state, signal);
				if (outcome.kind === "answer") {
					const answer = answerPayload(outcome, final);
					return {
						content: [{ type: "text", text: `User answered: ${JSON.stringify(answer)}` }],
						details: { ...base, outcome: "answered", answer },
					};
				}
				if (outcome.kind === "event") {
					return {
						content: [{ type: "text", text: `User triggered ${outcome.type} ${JSON.stringify(outcome.params)}; not an answer.` }],
						details: { ...base, outcome: "displayed" },
					};
				}
				return {
					content: [{ type: "text", text: "User cancelled without answering." }],
					details: { ...base, outcome: "cancelled" },
				};
			} finally {
				herdrRelease();
			}
		},
	});
}

export { renderFallback };
