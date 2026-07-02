/**
 * Interactive TUI overlay for searching session history.
 *
 * A lean live-search palette: type to filter the current project's history,
 * navigate hits, preview a matched session inline with full provenance, and
 * (from `/history`, which has command context) open it with `switchSession`.
 * From the Ctrl+Shift+F shortcut (plain ExtensionContext) it is view-only.
 *
 * Composed as a single `Component` (per pi-tui's interface) and shown via
 * `ctx.ui.custom({overlay})`. Search is synchronous against the already-built
 * index (the caller refreshes it once before opening), so there is no
 * per-keystroke re-indexing.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Component, type TUI, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { HistorySearchConfig } from "./config.js";
import {
	type BranchMeta,
	type HistoryHit,
	type ReadResult,
	findSessionPath,
	listRecent,
	queryProject,
	readSession,
} from "./indexer.js";

export interface OverlayDeps {
	base: string;
	dir: string;
	config: HistorySearchConfig;
	/** Optional seed query (e.g. from `/history <query>`). */
	initialQuery?: string;
}

/** Called when the user requests to open a session. The opener resolves the
 *  file path and performs `switchSession` (command context). From the shortcut
 *  (plain context) this is undefined → "open" is view-only. */
export type OverlayOpener = (sessionFile: string, hit: HistoryHit) => Promise<void> | void;

const RESULT_ROWS = 9;
const PREVIEW_ROWS = 22;

function shortDate(ts: string): string {
	if (!ts) return "—";
	const d = new Date(ts);
	if (Number.isNaN(d.getTime())) return ts.slice(0, 16);
	return d.toISOString().slice(0, 16).replace("T", " ");
}

function relativeDate(ts: string): string {
	if (!ts) return "";
	const d = new Date(ts);
	if (Number.isNaN(d.getTime())) return "";
	const diffMs = Date.now() - d.getTime();
	const day = 86_400_000;
	if (diffMs < day) {
		const h = Math.floor(diffMs / 3_600_000);
		return h <= 0 ? "just now" : `${h}h ago`;
	}
	const days = Math.floor(diffMs / day);
	if (days === 1) return "yesterday";
	if (days < 7) return `${days}d ago`;
	if (days < 30) return `${Math.floor(days / 7)}w ago`;
	return shortDate(ts).slice(0, 10);
}

function shortProject(project: string, max: number): string {
	if (project.length <= max) return project;
	return `…${project.slice(project.length - max + 1)}`;
}

function shortBranch(b?: BranchMeta): string {
	if (!b) return "";
	if (b.alias) return b.alias;
	const id = b.branchId;
	return id.length > 8 ? id.slice(0, 8) : id;
}

function oneLine(s: string): string {
	return s.replace(/\s+/g, " ").trim();
}

const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

function visibleLength(s: string): number {
	return s.replace(ANSI_ESCAPE, "").length;
}

/** Right-pad to a visible width, accounting for ANSI escape codes. */
function padVisible(s: string, width: number): string {
	return s + " ".repeat(Math.max(0, width - visibleLength(s)));
}

/** Basic greedy word-wrap to a column width. */
function wrap(text: string, width: number): string[] {
	const out: string[] = [];
	for (const para of text.split("\n")) {
		let line = "";
		for (const word of para.split(/\s+/)) {
			if (!word) continue;
			if (line.length === 0) {
				line = word;
			} else if (line.length + 1 + word.length <= width) {
				line += ` ${word}`;
			} else {
				out.push(line);
				line = word;
			}
		}
		out.push(line);
	}
	return out.length ? out : [""];
}

function isPrintable(data: string): boolean {
	if (!data || data.startsWith("\x1b")) return false;
	for (const ch of data) {
		const code = ch.codePointAt(0) ?? 0;
		if (code < 0x20 || code === 0x7f) return false;
	}
	return true;
}

export class HistoryOverlay implements Component {
	private query = "";
	private results: HistoryHit[];
	private selected = 0;
	private mode: "search" | "preview" = "search";
	private preview: { read: ReadResult; lines: string[]; scroll: number } | null = null;
	private closed = false;

	constructor(
		private readonly done: () => void,
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly deps: OverlayDeps,
		private readonly opener?: OverlayOpener
	) {
		this.query = deps.initialQuery?.trim() ?? "";
		this.results = this.query
			? queryProject(deps.dir, this.query, deps.config, deps.config.maxResults)
			: listRecent(deps.dir, deps.config.maxResults);
	}

	invalidate(): void {
		// Stateless render — nothing cached to invalidate.
	}

	// ── Input ─────────────────────────────────────────────────────────

	handleInput(data: string): void {
		if (this.closed) return;
		if (this.mode === "preview") {
			this.handlePreviewInput(data);
		} else {
			this.handleSearchInput(data);
		}
	}

	private runSearch(): void {
		this.results = this.query.trim()
			? queryProject(this.deps.dir, this.query, this.deps.config, this.deps.config.maxResults)
			: listRecent(this.deps.dir, this.deps.config.maxResults);
		this.selected = 0;
	}

	private handleSearchInput(data: string): void {
		if (matchesKey(data, "escape")) {
			this.done();
			return;
		}
		if (matchesKey(data, "return")) {
			if (this.results.length > 0) this.enterPreview();
		} else if (matchesKey(data, "up")) {
			this.selected = Math.max(0, this.selected - 1);
		} else if (matchesKey(data, "down")) {
			this.selected = Math.min(this.results.length - 1, this.selected + 1);
		} else if (matchesKey(data, "pageUp")) {
			this.selected = Math.max(0, this.selected - RESULT_ROWS);
		} else if (matchesKey(data, "pageDown")) {
			this.selected = Math.min(this.results.length - 1, this.selected + RESULT_ROWS);
		} else if (matchesKey(data, "o")) {
			if (this.results.length > 0) this.openSelected();
		} else if (matchesKey(data, "backspace")) {
			if (this.query) {
				this.query = this.query.slice(0, -1);
				this.runSearch();
			}
		} else if (matchesKey(data, "ctrl+u")) {
			this.query = "";
			this.runSearch();
		} else if (isPrintable(data)) {
			this.query += data;
			this.runSearch();
		}
		this.tui.requestRender();
	}

	private handlePreviewInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "left") || matchesKey(data, "return")) {
			this.mode = "search";
			this.preview = null;
		} else if (matchesKey(data, "o")) {
			this.openSelected();
		} else if (this.preview) {
			const maxScroll = Math.max(0, this.preview.lines.length - PREVIEW_ROWS);
			if (matchesKey(data, "up")) this.preview.scroll = Math.max(0, this.preview.scroll - 1);
			else if (matchesKey(data, "down")) this.preview.scroll = Math.min(maxScroll, this.preview.scroll + 1);
			else if (matchesKey(data, "pageUp")) this.preview.scroll = Math.max(0, this.preview.scroll - PREVIEW_ROWS);
			else if (matchesKey(data, "pageDown")) this.preview.scroll = Math.min(maxScroll, this.preview.scroll + PREVIEW_ROWS);
		}
		this.tui.requestRender();
	}

	private enterPreview(): void {
		const hit = this.results[this.selected];
		const path = findSessionPath(this.deps.base, hit.sessionId, this.deps.dir);
		const firstMatch = hit.matches[0]?.msgIndex;
		const read: ReadResult = path
			? readSession(
					path,
					typeof firstMatch === "number" ? { around: firstMatch, before: 4, after: 12, maxChars: 600 } : { maxChars: 8000 }
				)
			: {
					sessionId: hit.sessionId,
					project: hit.project,
					timestamp: hit.timestamp,
					totalMessages: 0,
					mode: "transcript",
					messages: [],
					truncated: false,
				};
		this.preview = { read, lines: [], scroll: 0 };
		this.mode = "preview";
	}

	private openSelected(): void {
		const hit = this.results[this.selected];
		if (!hit) return;
		const path = findSessionPath(this.deps.base, hit.sessionId, this.deps.dir);
		if (!path) {
			this.tui.requestRender();
			return;
		}
		if (!this.opener) {
			// View-only mode (Ctrl+Shift+F shortcut): no switchSession available.
			this.tui.requestRender();
			return;
		}
		this.closed = true;
		// Close the overlay first, then switch. switchSession tears down the
		// extension runtime; running it while the overlay is live can corrupt state.
		this.done();
		void this.opener(path, hit);
	}

	// ── Render ────────────────────────────────────────────────────────

	render(width: number): string[] {
		const w = Math.max(24, width);
		const contentWidth = Math.max(20, w - 2);
		const body = this.mode === "preview" ? this.renderPreview(contentWidth) : this.renderSearch(contentWidth);
		return this.frame(body, contentWidth);
	}

	private frame(lines: string[], innerWidth: number): string[] {
		const t = this.theme;
		const border = t.fg("muted", "─".repeat(innerWidth));
		return [
			t.fg("muted", "┌") + border + t.fg("muted", "┐"),
			...lines.map((line) => t.fg("muted", "│") + padVisible(truncateToWidth(line, innerWidth), innerWidth) + t.fg("muted", "│")),
			t.fg("muted", "└") + border + t.fg("muted", "┘"),
		];
	}

	private renderSearch(w: number): string[] {
		const t = this.theme;
		const lines: string[] = [];
		const openHint = this.opener ? " · o open" : " · o /history to open";
		lines.push(t.fg("accent", t.bold("History search")) + t.fg("muted", `  ↑↓ select · ⏎ preview${openHint} · Esc close`));
		const inputInner = Math.max(10, w - 6);
		const prompt = t.fg("text", truncateToWidth(`> ${this.query}`, Math.max(0, inputInner - 1)));
		const inputText = padVisible(prompt + t.fg("accent", "▏"), inputInner);
		lines.push(t.fg("muted", `  ┌${"─".repeat(inputInner)}┐`));
		lines.push(t.fg("muted", "  │") + inputText + t.fg("muted", "│"));
		lines.push(t.fg("muted", `  └${"─".repeat(inputInner)}┘`));
		lines.push("");

		if (this.results.length === 0) {
			lines.push(t.fg("muted", this.query ? `No sessions match "${this.query}"` : "No sessions yet"));
			return lines;
		}

		// Keep the selection in view.
		const start = Math.max(0, Math.min(this.selected - RESULT_ROWS + 1, this.results.length - RESULT_ROWS));
		const view = this.results.slice(Math.max(0, start), Math.max(0, start) + RESULT_ROWS);
		view.forEach((h, k) => {
			const idx = Math.max(0, start) + k;
			const isSel = idx === this.selected;
			const marker = isSel ? t.fg("success", "▸ ") : "  ";
			lines.push(...this.renderResultRow(h, isSel, w, marker));
			if (isSel && !this.opener) {
				lines.push(t.fg("dim", "      (open sessions via /history — Ctrl+Shift+F is view-only)"));
			}
			lines.push("");
		});

		lines.push(t.fg("muted", `${this.results.length} session(s)${this.query ? "" : " — recent"}`));
		return lines;
	}

	/** Two-line result row: title (+ name) and provenance + snippet. */
	private renderResultRow(h: HistoryHit, isSel: boolean, w: number, marker: string): string[] {
		const t = this.theme;
		const branchLabel = h.branch ? ` · ${shortBranch(h.branch)}` : "";
		const msgCount = h.branch ? ` · ${h.branch.messageCount} msgs` : "";
		const meta = `${shortProject(h.project, 26)} · ${relativeDate(h.timestamp)}${branchLabel}${msgCount}`;
		// Title line: prefer the session name; fall back to first user message; then id.
		const titleRaw = oneLine(h.sessionName ?? h.title ?? h.sessionId);
		const titleLine = `${marker}${isSel ? t.fg("text", t.bold(truncateToWidth(titleRaw, w - 2))) : t.fg("text", truncateToWidth(titleRaw, w - 2))}`;
		const metaLine = `   ${isSel ? t.fg("accent", truncateToWidth(meta, w - 3)) : t.fg("muted", truncateToWidth(meta, w - 3))}`;
		const out = [titleLine, metaLine];
		const snippet = h.matches[0]?.snippet;
		if (snippet) {
			out.push(t.fg("dim", truncateToWidth(`     ${oneLine(snippet)}`, w)));
		}
		return out;
	}

	private renderPreview(w: number): string[] {
		const t = this.theme;
		if (!this.preview) return [t.fg("muted", "…")];
		// Build wrapped lines lazily once we know the width.
		if (this.preview.lines.length === 0) this.preview.lines = this.buildPreviewLines(w);
		const r = this.preview.read;
		const lines: string[] = [];
		// Provenance header block.
		const hit = this.results[this.selected];
		const name = hit?.sessionName ?? r.sessionId;
		lines.push(t.fg("accent", t.bold(truncateToWidth(oneLine(name), w - 2))));
		const branchLabel = hit?.branch ? ` · ${shortBranch(hit.branch)} (parent ${shortBranchId(hit.branch.parentBranchId)})` : "";
		const prov = `${shortProject(r.project, 30)}${branchLabel} · ${shortDate(r.timestamp)} · ${r.totalMessages} msgs`;
		lines.push(t.fg("muted", truncateToWidth(prov, w - 2)));
		if (hit?.branch) {
			const b = hit.branch;
			const extras: string[] = [];
			if (b.lastUserPreview) extras.push(`last user: ${oneLine(b.lastUserPreview).slice(0, 70)}`);
			if (b.lastAssistantPreview) extras.push(`last assistant: ${oneLine(b.lastAssistantPreview).slice(0, 70)}`);
			if (b.recentFiles.length > 0) extras.push(`files: ${b.recentFiles.slice(0, 4).join(", ")}`);
			for (const e of extras.slice(0, 2)) lines.push(t.fg("dim", truncateToWidth(`  ${e}`, w - 2)));
		}
		const openHint = this.opener ? "o open" : "open via /history";
		lines.push(t.fg("muted", truncateToWidth(`↑↓ scroll · Esc/back · ${openHint}`, w - 2)));
		lines.push(t.fg("muted", "─".repeat(Math.max(0, w - 2))));
		const window = this.preview.lines.slice(this.preview.scroll, this.preview.scroll + PREVIEW_ROWS);
		lines.push(...window);
		if (this.preview.lines.length > PREVIEW_ROWS) {
			const shown = Math.min(this.preview.scroll + PREVIEW_ROWS, this.preview.lines.length);
			lines.push("");
			lines.push(t.fg("muted", `lines ${this.preview.scroll + 1}–${shown} / ${this.preview.lines.length}`));
		}
		return lines;
	}

	private buildPreviewLines(w: number): string[] {
		const t = this.theme;
		const r = this.preview?.read;
		if (!r || r.messages.length === 0) return [t.fg("muted", "(no content)")];
		const out: string[] = [];
		for (const m of r.messages) {
			out.push(
				t.fg(m.role === "user" ? "success" : m.role === "assistant" ? "accent" : "muted", t.bold(`[${m.msgIndex}] ${m.role}`))
			);
			for (const ln of wrap(m.text, w)) out.push(t.fg("text", ln));
			out.push("");
		}
		return out;
	}
}

function shortBranchId(id: string | null): string {
	if (!id) return "—";
	return id.length > 8 ? id.slice(0, 8) : id;
}
