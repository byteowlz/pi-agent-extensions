import { readFile } from "node:fs/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type MacroMeta = { description?: string; argumentHint?: string; compact?: boolean };
type MacroDef = { name: string; content: string; path: string; meta: MacroMeta };
type PromptCommand = {
	name: string;
	source: "prompt" | "extension" | "skill";
	sourceInfo?: { path?: string };
	description?: string;
};

const WIDGET_KEY = "inline-macros.widget";
const MACRO_RE = /(?:^|\s)::([a-zA-Z][-\w]*)\b/g;

function parseFrontmatter(md: string): { body: string; meta: MacroMeta } {
	const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
	if (!m) return { body: md.trim(), meta: {} };
	const raw = m[1] ?? "";
	const meta: MacroMeta = {};
	for (const line of raw.split("\n")) {
		const [k, ...rest] = line.split(":");
		if (!k || rest.length === 0) continue;
		const value = rest
			.join(":")
			.trim()
			.replace(/^['"]|['"]$/g, "");
		if (k.trim() === "description") meta.description = value;
		if (k.trim() === "argument-hint") meta.argumentHint = value;
		if (k.trim() === "compact") meta.compact = value === "true";
	}
	return { body: md.slice(m[0].length).trim(), meta };
}

export function splitLikePromptArgs(input: string): string[] {
	const out: string[] = [];
	let cur = "";
	let quote: '"' | "'" | null = null;
	let esc = false;
	for (const ch of input) {
		if (esc) {
			cur += ch;
			esc = false;
			continue;
		}
		if (ch === "\\") {
			esc = true;
			continue;
		}
		if (quote) {
			if (ch === quote) quote = null;
			else cur += ch;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			continue;
		}
		if (/\s/.test(ch)) {
			if (cur.length > 0) {
				out.push(cur);
				cur = "";
			}
			continue;
		}
		cur += ch;
	}
	if (cur.length > 0) out.push(cur);
	return out;
}

export function applyArgs(template: string, args: string[]): string {
	const joined = args.join(" ");
	return template.replace(/\$@/g, joined).replace(/\$([1-9]\d*)/g, (_m, d: string) => args[Number(d) - 1] ?? "");
}

async function loadMacros(pi: ExtensionAPI): Promise<Map<string, MacroDef>> {
	const out = new Map<string, MacroDef>();
	const cmds = pi.getCommands() as PromptCommand[];
	for (const c of cmds) {
		if (c.source !== "prompt" || !c.sourceInfo?.path) continue;
		try {
			const text = await readFile(c.sourceInfo.path, "utf8");
			const { body, meta } = parseFrontmatter(text);
			out.set(c.name, { name: c.name, content: body, path: c.sourceInfo.path, meta });
		} catch {
			// ignored
		}
	}
	return out;
}

function expandText(
	input: string,
	macros: Map<string, MacroDef>,
	stack: string[] = []
): { text: string; warnings: string[]; errors: string[] } {
	const warnings: string[] = [];
	const errors: string[] = [];
	const hits = [...input.matchAll(MACRO_RE)]
		.map((m) => ({ index: m.index ?? -1, full: m[0] ?? "", name: m[1] ?? "" }))
		.filter((h) => h.index >= 0);
	if (hits.length === 0) return { text: input, warnings, errors };

	let out = "";
	let cursor = 0;
	for (let i = 0; i < hits.length; i++) {
		const hit = hits[i];
		const macroStart = hit.index + hit.full.indexOf("::");
		out += input.slice(cursor, macroStart);
		const macroTokenEnd = macroStart + `::${hit.name}`.length;
		const nextMacroStart = i + 1 < hits.length ? hits[i + 1].index + hits[i + 1].full.indexOf("::") : input.length;
		const rawArgSegment = input.slice(macroTokenEnd, nextMacroStart);
		const leadingWs = rawArgSegment.match(/^\s*/)?.[0] ?? "";
		const trailingWs = rawArgSegment.match(/\s*$/)?.[0] ?? "";
		const argCore = rawArgSegment.slice(leadingWs.length, rawArgSegment.length - trailingWs.length);
		const args = argCore.trim() ? splitLikePromptArgs(argCore.trim()) : [];

		const def = macros.get(hit.name);
		if (!def) {
			warnings.push(`Unknown macro ::${hit.name}`);
			out += `::${hit.name}${rawArgSegment}`;
			cursor = nextMacroStart;
			continue;
		}
		if (stack.includes(hit.name)) {
			errors.push(`Recursive macro cycle detected: ${[...stack, hit.name].join(" -> ")}`);
			out += `::${hit.name}${rawArgSegment}`;
			cursor = nextMacroStart;
			continue;
		}

		const substituted = applyArgs(def.content, args);
		const nested = expandText(substituted, macros, [...stack, hit.name]);
		warnings.push(...nested.warnings);
		errors.push(...nested.errors);
		let expandedText = nested.text;
		if (i + 1 < hits.length) {
			expandedText += "\n\n";
		}
		out += expandedText;
		cursor = nextMacroStart;
	}
	out += input.slice(cursor);
	return { text: out, warnings, errors };
}

export default function inlineMacros(pi: ExtensionAPI) {
	let macroCache: Map<string, MacroDef> | null = null;
	const maxExpandedLength = 8000;

	const getMacros = async () => {
		if (!macroCache) macroCache = await loadMacros(pi);
		return macroCache;
	};

	pi.on("resources_discover", (event) => {
		if (event.reason === "reload") macroCache = null;
	});

	pi.on("session_start", async (_event, ctx) => {
		void getMacros(); // warm cache early to reduce first-send latency
		if (!ctx.hasUI) return;
		ctx.ui.addAutocompleteProvider((current) => ({
			async getSuggestions(lines, cursorLine, cursorCol, options) {
				const line = lines[cursorLine] ?? "";
				const before = line.slice(0, cursorCol);
				const mm = before.match(/(?:^|\s)::([a-zA-Z0-9._-]*)$/);
				if (!mm) return current.getSuggestions(lines, cursorLine, cursorCol, options);
				const prefix = mm[1] ?? "";
				const macros = await getMacros();
				const items = [...macros.values()]
					.filter((m) => m.name.startsWith(prefix))
					.slice(0, 40)
					.map((m) => ({
						value: `::${m.name}`,
						label: `::${m.name}`,
						description: [m.meta.description, m.meta.argumentHint].filter(Boolean).join(" • "),
					}));
				return { prefix: `::${prefix}`, items };
			},
			applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
				return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
			},
		}));
	});

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") return { action: "continue" as const };
		const hasMacroSyntax = event.text.includes("::");
		if (!hasMacroSyntax) {
			if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined);
			return { action: "continue" as const };
		}
		const found = [...event.text.matchAll(MACRO_RE)].map((m) => m[1]);
		const macros = await getMacros();
		if (ctx.hasUI) {
			if (found.length === 0) ctx.ui.setWidget(WIDGET_KEY, undefined);
			else {
				const lines = found.map((n) => {
					const d = macros.get(n ?? "");
					return d
						? ctx.ui.theme.fg("accent", ctx.ui.theme.bold(`::${n}`)) +
								(d.meta.description ? ` ${ctx.ui.theme.fg("dim", d.meta.description)}` : "")
						: ctx.ui.theme.fg("warning", `::${n} ?`);
				});
				ctx.ui.setWidget(WIDGET_KEY, () => ({
					render: () => [ctx.ui.theme.fg("dim", "Macros:"), ...lines],
					invalidate: () => {
						// no-op: widget is re-created from input updates
					},
				}));
			}
		}
		const expanded = expandText(event.text, macros);
		if (expanded.text.length > maxExpandedLength) {
			if (event.source === "rpc") throw new Error(`Expanded macro text exceeds max length (${maxExpandedLength})`);
			if (ctx.hasUI) ctx.ui.notify(`Expanded macro text exceeds ${maxExpandedLength} chars`, "warning");
		}
		for (const w of expanded.warnings) if (ctx.hasUI) ctx.ui.notify(w, "warning");
		for (const e of expanded.errors) if (ctx.hasUI) ctx.ui.notify(e, "error");
		if (expanded.text === event.text) return { action: "continue" as const };
		return { action: "transform" as const, text: expanded.text };
	});

	pi.registerCommand("macro", {
		description: "List macros or insert ::macroName(s)",
		handler: async (args, ctx) => {
			const macros = await getMacros();
			const names = [...macros.keys()].sort();
			if (!args.trim()) {
				ctx.ui.notify(`Macros: ${names.join(", ") || "none"}`, "info");
				return;
			}
			const q = args.trim().split(/\s+/);
			const picks = q.map((token) => names.find((n) => n.includes(token))).filter((v): v is string => Boolean(v));
			const insert = picks.map((p) => `::${p}`).join(" ");
			if (ctx.hasUI && insert) ctx.ui.setEditorText(insert);
			else ctx.ui.notify(insert || "No matches", "info");
		},
		getArgumentCompletions: async (prefix) => {
			const macros = await getMacros();
			return [...macros.values()]
				.filter((m) => m.name.startsWith(prefix))
				.map((m) => ({ value: m.name, label: m.name, description: m.meta.description }));
		},
	});

	pi.registerCommand("m", {
		description: "Alias for /macro",
		handler: async (args, ctx) => {
			const macros = await getMacros();
			const names = [...macros.keys()].sort();
			if (!args.trim()) {
				ctx.ui.notify(`Macros: ${names.join(", ") || "none"}`, "info");
				return;
			}
			const q = args.trim().split(/\s+/);
			const picks = q.map((token) => names.find((n) => n.includes(token))).filter((v): v is string => Boolean(v));
			const insert = picks.map((p) => `::${p}`).join(" ");
			if (ctx.hasUI && insert) ctx.ui.setEditorText(insert);
			else ctx.ui.notify(insert || "No matches", "info");
		},
	});
}
