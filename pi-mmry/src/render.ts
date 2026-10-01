/**
 * Human rendering of `memory` tool calls and results. The model still gets
 * mmry's JSON; this only changes what the user sees.
 */

export interface Style {
	fg(color: "accent" | "muted" | "dim" | "success" | "error" | "warning" | "text" | "toolTitle", text: string): string;
	bold(text: string): string;
}

export interface Entry {
	memory_id: string;
	content: string;
	scope?: string;
	repo?: string | null;
	revision?: number;
	contested?: boolean;
	why?: string | null;
	source?: string | null;
	machine?: string | null;
	expires_at?: string | null;
	removed?: boolean;
}

export interface CallArgs {
	action?: string;
	query?: string;
	id?: string;
	content?: string;
	expected_revision?: number;
	scope?: string;
}

const PAST: Record<string, string> = {
	create: "created",
	supersede: "updated",
	deprecate: "removed",
};

/** `mem_b62502e3-fda1-…` -> `mem_b62502e3`. */
export function shortId(id: string): string {
	return id.replace(/^(mem_[0-9a-f]{8})[0-9a-f-]*$/, "$1");
}

function oneLine(text: string, max: number): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function scopeLabel(entry: Entry): string {
	if (entry.scope === "repo" && entry.repo) return `repo ${entry.repo.replace(/--[0-9a-f]+$/, "")}`;
	return entry.scope ?? "general";
}

function minute(timestamp: string): string {
	return timestamp.slice(0, 16).replace("T", " ");
}

export function renderCall(args: CallArgs, style: Style): string {
	const head = `${style.fg("toolTitle", style.bold("memory "))}${style.fg("accent", args.action ?? "?")}`;
	switch (args.action) {
		case "search":
			return `${head} ${style.fg("muted", `"${oneLine(args.query ?? "", 60)}"`)}`;
		case "create":
			return `${head}${args.scope === "general" ? style.fg("dim", " general") : ""} ${style.fg("muted", oneLine(args.content ?? "", 60))}`;
		default:
			return `${head} ${style.fg("dim", `${shortId(args.id ?? "")} r${args.expected_revision ?? "?"}`)}`;
	}
}

function entryLines(entry: Entry, style: Style, expanded: boolean): string[] {
	const tag = `${style.fg("dim", `[${scopeLabel(entry)}]`)} ${style.fg("muted", `${shortId(entry.memory_id)} r${entry.revision ?? "?"}`)}`;
	const contested = entry.contested ? ` ${style.fg("warning", "CONTESTED")}` : "";
	const text = entry.removed ? style.fg("dim", entry.content) : style.fg("text", entry.content);
	const lines = [`${tag}${contested}`, `  ${expanded ? text : oneLine(text, 160)}`];
	const meta = [
		entry.why ? `why: ${entry.why}` : "",
		entry.source ? `source: ${entry.source}` : "",
		entry.machine ? `machine: ${entry.machine}` : "",
		entry.expires_at ? `expires ${minute(entry.expires_at)} UTC` : "",
	].filter(Boolean);
	if (meta.length > 0) lines.push(style.fg("dim", `  ${meta.join(" · ")}`));
	return lines;
}

const COLLAPSED_HITS = 5;

/** Render mmry's stdout for `action`, or undefined if it is not the expected JSON. */
export function renderResult(action: string, stdout: string, style: Style, expanded: boolean): string | undefined {
	let value: unknown;
	try {
		value = JSON.parse(stdout);
	} catch {
		return undefined;
	}
	if (action === "search" && Array.isArray(value)) {
		const hits = value as Entry[];
		if (hits.length === 0) return style.fg("muted", "no matching memories");
		const shown = expanded ? hits : hits.slice(0, COLLAPSED_HITS);
		const lines = [style.fg("success", `${hits.length} ${hits.length === 1 ? "memory" : "memories"}`)];
		for (const hit of shown) lines.push(...entryLines(hit, style, expanded));
		if (shown.length < hits.length) lines.push(style.fg("dim", `… ${hits.length - shown.length} more (ctrl+o to expand)`));
		return lines.join("\n");
	}
	if (value && typeof value === "object" && "memory_id" in value) {
		return [style.fg("success", `✓ ${PAST[action] ?? action}`), ...entryLines(value as Entry, style, expanded)].join("\n");
	}
	return undefined;
}
