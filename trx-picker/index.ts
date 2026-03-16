/**
 * trx-picker -- /trx overlay for browsing, filtering, and dispatching issues
 *
 * Usage: type /trx in any pi session
 *
 * Features:
 * - Lists all open trx issues
 * - Fuzzy search to filter
 * - Multi-select with Space
 * - Enter: ask current session to implement selected issues
 * - Shift+Enter: spawn new tmux session to implement selected issues
 */

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
}

type PickerResult = { action: "current" | "tmux"; issues: TrxIssue[] } | undefined;

function loadIssues(): TrxIssue[] {
	try {
		const output = execSync("trx list --json", { encoding: "utf-8", timeout: 10000 });
		return JSON.parse(output) as TrxIssue[];
	} catch {
		return [];
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

function at<T>(arr: T[], index: number): T {
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

	constructor(theme: Theme, done: (result: PickerResult) => void, issues: TrxIssue[]) {
		this.theme = theme;
		this.done = done;
		this.issues = issues;
		this.filtered = [...issues];
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
		if (this.handleNavigation(data)) return;
		this.handleTextInput(data);
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

		// Header
		lines.push(th.fg("border", `\u256d${"\u2500".repeat(innerW)}\u256e`));
		const title = ` ${th.fg("accent", th.bold("trx issues"))}`;
		const countInfo = th.fg("dim", ` ${this.filtered.length}/${this.issues.length}`);
		const checkedInfo = this.checked.size > 0 ? th.fg("warning", ` (${this.checked.size} selected)`) : "";
		lines.push(row(`${title}${countInfo}${checkedInfo}`));
		lines.push(row(""));

		// Search
		lines.push(...this.renderSearchInput(innerW, row));

		// Issue list
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

		// Footer
		lines.push(row(""));
		const help = [
			`${th.fg("dim", "\u2191\u2193")} navigate`,
			`${th.fg("dim", "Space")} toggle`,
			`${th.fg("dim", "Tab")} toggle+next`,
			`${th.fg("dim", "Enter")} implement here`,
			`${th.fg("dim", "Shift+Enter")} new tmux`,
			`${th.fg("dim", "Esc")} cancel`,
		].join(th.fg("border", " \u2502 "));
		lines.push(row(` ${help}`));
		lines.push(th.fg("border", `\u2570${"\u2500".repeat(innerW)}\u256f`));

		return lines;
	}

	invalidate(): void {
		// No cached state to clear
	}

	dispose(): void {
		// No resources to release
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
