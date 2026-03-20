import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, Theme } from "@mariozechner/pi-coding-agent";
import { CURSOR_MARKER, type Focusable, matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

interface TrxIssue {
	id: string;
	title: string;
	status: string;
	priority: number;
	issue_type: string;
	created_at: string;
	updated_at: string;
}

interface TrxIssueDetail {
	id: string;
	title: string;
	status: string;
	priority: number;
	issue_type: string;
	description?: string;
	created_at: string;
	updated_at: string;
	labels?: string[];
	assignees?: string[];
	comments?: { author: string; body: string; created_at: string }[];
}

type PickerResult = { action: "current" | "tmux"; issues: TrxIssue[] } | undefined;

const SORT_MODES = ["priority", "newest", "oldest", "updated", "type"] as const;
type SortMode = (typeof SORT_MODES)[number];

const SORT_LABELS: Record<SortMode, string> = {
	priority: "Priority",
	newest: "Newest first",
	oldest: "Oldest first",
	updated: "Recently updated",
	type: "Type",
};

function sortIssues(issues: TrxIssue[], mode: SortMode): TrxIssue[] {
	const sorted = [...issues];
	switch (mode) {
		case "priority":
			sorted.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
			break;
		case "newest":
			sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
			break;
		case "oldest":
			sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
			break;
		case "updated":
			sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
			break;
		case "type":
			sorted.sort((a, b) => a.issue_type.localeCompare(b.issue_type) || a.priority - b.priority);
			break;
	}
	return sorted;
}

function loadIssues(): TrxIssue[] {
	try {
		const output = execSync("trx list --json", { encoding: "utf-8", timeout: 10000 });
		return JSON.parse(output) as TrxIssue[];
	} catch {
		return [];
	}
}

function loadIssueDetail(id: string): TrxIssueDetail | null {
	try {
		const output = execSync(`trx show ${id} --json`, { encoding: "utf-8", timeout: 10000 });
		return JSON.parse(output) as TrxIssueDetail;
	} catch {
		return null;
	}
}

function fuzzyMatch(needle: string, haystack: string): boolean {
	const lower = haystack.toLowerCase();
	const terms = needle.toLowerCase().split(/\s+/).filter(Boolean);
	return terms.every((term) => lower.includes(term));
}

function priorityLabel(p: number): string {
	return `P${p}`;
}

function typeLabel(t: string): string {
	const map: Record<string, string> = { bug: "bug", feature: "feat", task: "task", epic: "epic", chore: "chore" };
	return map[t] ?? t;
}

function buildPrompt(issues: TrxIssue[]): string {
	const list = issues.map((i) => `- ${i.id}: ${i.title} [${i.issue_type}, ${priorityLabel(i.priority)}, ${i.status}]`).join("\n");
	return [
		"Implement the following trx issues:",
		"",
		list,
		"",
		"For each issue, read the full details with `trx show <id>`, then implement the required changes.",
		'Update issue status to in_progress when you start and close them when done with `trx close <id> -r "reason"`.',
	].join("\n");
}

function at<T>(arr: readonly T[], index: number): T {
	return arr[index] as T;
}

class TrxPickerOverlay implements Focusable {
	focused = false;

	private theme: Theme;
	private done: (result: PickerResult) => void;
	private issues: TrxIssue[];
	private filtered: TrxIssue[];
	private selected = 0;
	private checked = new Set<string>();
	private query = "";
	private cursor = 0;
	private scrollOffset = 0;
	private sortMode: SortMode = "priority";
	private detailCache = new Map<string, TrxIssueDetail | null>();
	private showDetail = false;

	constructor(theme: Theme, done: (result: PickerResult) => void, issues: TrxIssue[]) {
		this.theme = theme;
		this.done = done;
		this.issues = sortIssues(issues, this.sortMode);
		this.filtered = [...this.issues];
	}

	private getCurrentDetail(): TrxIssueDetail | null {
		if (this.filtered.length === 0) return null;
		const issue = at(this.filtered, this.selected);
		if (!this.detailCache.has(issue.id)) {
			this.detailCache.set(issue.id, loadIssueDetail(issue.id));
		}
		return this.detailCache.get(issue.id) ?? null;
	}

	private toggleDetail(): void {
		this.showDetail = !this.showDetail;
	}

	private cycleSort(): void {
		const idx = SORT_MODES.indexOf(this.sortMode);
		this.sortMode = at(SORT_MODES, (idx + 1) % SORT_MODES.length);
		this.issues = sortIssues(this.issues, this.sortMode);
		this.refilter();
	}

	private refilter(): void {
		if (this.query) {
			this.filtered = this.issues.filter((i) =>
				fuzzyMatch(this.query, `${i.id} ${i.title} ${i.issue_type} ${priorityLabel(i.priority)} ${i.status}`)
			);
		} else {
			this.filtered = [...this.issues];
		}
		this.selected = Math.min(this.selected, Math.max(0, this.filtered.length - 1));
		this.scrollOffset = 0;
	}

	private getSelected(): TrxIssue[] {
		if (this.checked.size > 0) {
			return this.issues.filter((i) => this.checked.has(i.id));
		}
		if (this.filtered.length > 0) {
			return [at(this.filtered, this.selected)];
		}
		return [];
	}

	private toggleCurrent(): void {
		if (this.filtered.length === 0) return;
		const item = at(this.filtered, this.selected);
		if (this.checked.has(item.id)) {
			this.checked.delete(item.id);
		} else {
			this.checked.add(item.id);
		}
	}

	private handleNavigation(data: string): boolean {
		if (matchesKey(data, "up") || matchesKey(data, "ctrl+p")) {
			if (this.selected > 0) this.selected--;
			return true;
		}
		if (matchesKey(data, "down") || matchesKey(data, "ctrl+n")) {
			if (this.selected < this.filtered.length - 1) this.selected++;
			return true;
		}
		return false;
	}

	private handleTextInput(data: string): boolean {
		if (matchesKey(data, "backspace")) {
			if (this.cursor > 0) {
				this.query = this.query.slice(0, this.cursor - 1) + this.query.slice(this.cursor);
				this.cursor--;
				this.refilter();
			}
			return true;
		}
		if (matchesKey(data, "ctrl+u")) {
			this.query = "";
			this.cursor = 0;
			this.refilter();
			return true;
		}
		if (data.length === 1 && data.charCodeAt(0) >= 33) {
			this.query = this.query.slice(0, this.cursor) + data + this.query.slice(this.cursor);
			this.cursor++;
			this.refilter();
			return true;
		}
		return false;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			this.done(undefined);
			return;
		}
		if (matchesKey(data, "shift+return") || data === "\x1b[13;2u") {
			const issues = this.getSelected();
			if (issues.length > 0) this.done({ action: "tmux", issues });
			return;
		}
		if (matchesKey(data, "return")) {
			const issues = this.getSelected();
			if (issues.length > 0) this.done({ action: "current", issues });
			return;
		}
		if (data === " ") {
			this.toggleCurrent();
			return;
		}
		if (matchesKey(data, "tab")) {
			this.toggleCurrent();
			if (this.selected < this.filtered.length - 1) this.selected++;
			return;
		}
		if (matchesKey(data, "ctrl+s")) {
			this.cycleSort();
			return;
		}
		if (matchesKey(data, "ctrl+d")) {
			this.toggleDetail();
			return;
		}
		if (this.handleNavigation(data)) return;
		this.handleTextInput(data);
	}

	private renderDetailPanel(innerW: number, row: (s: string) => string): string[] {
		const th = this.theme;
		const detail = this.getCurrentDetail();
		const detailLines: string[] = [];
		detailLines.push(row(th.fg("border", ` ${"\u2500".repeat(innerW - 2)} `)));

		if (!detail) {
			detailLines.push(row(` ${th.fg("warning", "No details available")}`));
			return detailLines;
		}

		detailLines.push(row(` ${th.fg("accent", th.bold(detail.title))}`));
		const meta = [
			`${th.fg("dim", "ID:")} ${detail.id}`,
			`${th.fg("dim", "Status:")} ${detail.status}`,
			`${th.fg("dim", "Priority:")} ${priorityLabel(detail.priority)}`,
			`${th.fg("dim", "Type:")} ${typeLabel(detail.issue_type)}`,
		].join("  ");
		detailLines.push(row(` ${meta}`));

		if (detail.labels && detail.labels.length > 0) {
			detailLines.push(row(` ${th.fg("dim", "Labels:")} ${detail.labels.join(", ")}`));
		}
		if (detail.assignees && detail.assignees.length > 0) {
			detailLines.push(row(` ${th.fg("dim", "Assignees:")} ${detail.assignees.join(", ")}`));
		}

		if (detail.description) {
			detailLines.push(row(""));
			const descLines = detail.description.split("\n");
			const maxDescLines = 8;
			const displayLines = descLines.slice(0, maxDescLines);
			for (const line of displayLines) {
				detailLines.push(row(` ${truncateToWidth(th.fg("text", line), innerW - 2)}`));
			}
			if (descLines.length > maxDescLines) {
				detailLines.push(row(` ${th.fg("dim", `... ${descLines.length - maxDescLines} more lines`)}`));
			}
		}

		return detailLines;
	}

	private renderSearchInput(innerW: number, row: (s: string) => string): string[] {
		const th = this.theme;
		let inputDisplay = this.query;
		if (this.focused) {
			const before = inputDisplay.slice(0, this.cursor);
			const cursorChar = this.cursor < inputDisplay.length ? (inputDisplay[this.cursor] as string) : " ";
			const after = inputDisplay.slice(this.cursor + 1);
			inputDisplay = `${before}${CURSOR_MARKER}\x1b[7m${cursorChar}\x1b[27m${after}`;
		}
		return [row(` ${th.fg("dim", "/")} ${inputDisplay}`), row(th.fg("border", ` ${"\u2500".repeat(innerW - 2)} `))];
	}

	private renderIssueRow(issue: TrxIssue, isSelected: boolean, innerW: number, row: (s: string) => string): string {
		const th = this.theme;
		const isChecked = this.checked.has(issue.id);
		const checkbox = isChecked ? th.fg("success", "\u25c9") : th.fg("dim", "\u25cb");
		const pointer = isSelected ? th.fg("accent", "\u25b8") : " ";
		const prioColor = issue.priority === 0 ? "error" : issue.priority === 1 ? "warning" : "dim";
		const prio = th.fg(prioColor, priorityLabel(issue.priority));
		const typ = th.fg("muted", typeLabel(issue.issue_type));
		const id = isSelected ? th.fg("accent", issue.id) : th.fg("dim", issue.id);
		const status = th.fg("dim", issue.status);

		const prefix = `${pointer} ${checkbox} ${prio} ${typ} ${id} ${status} `;
		const prefixW = visibleWidth(prefix);
		const titleMaxW = innerW - prefixW - 1;
		const titleText = isSelected ? th.fg("text", issue.title) : th.fg("muted", issue.title);
		return row(`${prefix}${truncateToWidth(titleText, Math.max(10, titleMaxW))}`);
	}

	render(width: number): string[] {
		const th = this.theme;
		const innerW = Math.min(width - 2, 120);
		const lines: string[] = [];
		const row = (content: string) => {
			const vis = visibleWidth(content);
			return `${th.fg("border", "\u2502")}${content}${" ".repeat(Math.max(0, innerW - vis))}${th.fg("border", "\u2502")}`;
		};
		lines.push(th.fg("border", `\u256d${"\u2500".repeat(innerW)}\u256e`));
		const title = ` ${th.fg("accent", th.bold("trx issues"))}`;
		const countInfo = th.fg("dim", ` ${this.filtered.length}/${this.issues.length}`);
		const sortInfo = th.fg("muted", ` [${SORT_LABELS[this.sortMode]}]`);
		const checkedInfo = this.checked.size > 0 ? th.fg("warning", ` (${this.checked.size} selected)`) : "";
		lines.push(row(`${title}${countInfo}${sortInfo}${checkedInfo}`));
		lines.push(row(""));
		lines.push(...this.renderSearchInput(innerW, row));
		const maxVisible = 20;
		const total = this.filtered.length;

		if (this.selected < this.scrollOffset) this.scrollOffset = this.selected;
		else if (this.selected >= this.scrollOffset + maxVisible) this.scrollOffset = this.selected - maxVisible + 1;

		const visibleStart = this.scrollOffset;
		const visibleEnd = Math.min(total, visibleStart + maxVisible);

		if (total === 0) {
			lines.push(row(` ${th.fg("warning", "No matching issues")}`));
		} else {
			for (let i = visibleStart; i < visibleEnd; i++) {
				lines.push(this.renderIssueRow(at(this.filtered, i), i === this.selected, innerW, row));
			}
			if (total > maxVisible) {
				lines.push(row(th.fg("dim", ` ${visibleStart + 1}-${visibleEnd} of ${total}`)));
			}
		}
		if (this.showDetail) {
			lines.push(...this.renderDetailPanel(innerW, row));
		}
		lines.push(row(""));
		const sep = th.fg("border", " \u2502 ");
		const helpRow1 = [
			`${th.fg("dim", "\u2191\u2193")} navigate`,
			`${th.fg("dim", "Space")} toggle`,
			`${th.fg("dim", "Tab")} toggle+next`,
			`${th.fg("dim", "Ctrl+S")} sort`,
			`${th.fg("dim", "Ctrl+D")} details`,
		].join(sep);
		const helpRow2 = [
			`${th.fg("dim", "Enter")} implement here`,
			`${th.fg("dim", "Shift+Enter")} new tmux`,
			`${th.fg("dim", "Esc")} cancel`,
		].join(sep);
		lines.push(row(` ${helpRow1}`));
		lines.push(row(` ${helpRow2}`));
		lines.push(th.fg("border", `\u2570${"\u2500".repeat(innerW)}\u256f`));

		return lines;
	}

	invalidate(): void {
		/* noop */
	}

	dispose(): void {
		/* noop */
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("trx", {
		description: "Browse and select trx issues to implement",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			ctx.ui.setStatus("trx", "Loading issues...");
			const issues = loadIssues();
			ctx.ui.setStatus("trx", undefined);

			if (issues.length === 0) {
				ctx.ui.notify("No trx issues found", "warning");
				return;
			}

			const result = await ctx.ui.custom<PickerResult>(
				(tui, theme, _keybindings, done) => {
					const overlay = new TrxPickerOverlay(theme, done, issues);
					return {
						render: (w: number) => overlay.render(w),
						invalidate: () => overlay.invalidate(),
						handleInput: (data: string) => {
							overlay.handleInput(data);
							tui.requestRender();
						},
						get focused() {
							return overlay.focused;
						},
						set focused(v: boolean) {
							overlay.focused = v;
						},
					};
				},
				{ overlay: true }
			);

			if (!result) return;

			const prompt = buildPrompt(result.issues);

			if (result.action === "current") {
				pi.sendUserMessage(prompt);
			} else {
				const cwd = ctx.cwd;
				const tmpFile = join(tmpdir(), `trx-prompt-${Date.now()}.txt`);
				writeFileSync(tmpFile, prompt, "utf-8");
				try {
					execSync(`tmux new-window -c '${cwd}' 'pi @${tmpFile}'`, { encoding: "utf-8", timeout: 5000 });
					ctx.ui.notify(`Spawned new tmux session for ${result.issues.length} issue(s)`, "info");
				} catch (e) {
					const msg = e instanceof Error ? e.message : String(e);
					ctx.ui.notify(`Failed to spawn tmux: ${msg}`, "error");
				}
			}
		},
	});
}
