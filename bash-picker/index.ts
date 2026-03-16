import { execSync } from "node:child_process";
import type { ExtensionAPI, ExtensionCommandContext, Theme } from "@mariozechner/pi-coding-agent";
import { type Focusable, matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

interface BashSnippet {
	code: string;
	preview: string;
	turnIndex: number;
}

function stripComments(code: string): string {
	return code
		.split("\n")
		.filter((line) => !/^\s*#/.test(line))
		.join("\n")
		.trim();
}

function extractBashBlocks(text: string): string[] {
	const blocks: string[] = [];
	const regex = /```(?:bash|sh|shell|zsh)\s*\n([\s\S]*?)```/g;
	let match = regex.exec(text);
	while (match) {
		const raw = match[1]?.trim();
		if (raw) {
			const cleaned = stripComments(raw);
			if (cleaned) blocks.push(cleaned);
		}
		match = regex.exec(text);
	}
	return blocks;
}

function getTextFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((c: { type?: string }) => c.type === "text")
		.map((c: { text?: string }) => c.text ?? "")
		.join("\n");
}

function makePreview(code: string, maxLen: number): string {
	const oneLine = code.replace(/\n/g, " \\n ");
	return oneLine.length > maxLen ? `${oneLine.slice(0, maxLen - 1)}\u2026` : oneLine;
}

function copyToClipboard(text: string): boolean {
	const cmds = ["xclip -selection clipboard", "xsel --clipboard --input", "pbcopy", "wl-copy"];
	for (const cmd of cmds) {
		try {
			execSync(cmd, { input: text, timeout: 3000 });
			return true;
		} catch {
			/* next */
		}
	}
	return false;
}

function at<T>(arr: readonly T[], index: number): T {
	return arr[index] as T;
}

class BashPickerOverlay implements Focusable {
	focused = false;

	private theme: Theme;
	private done: (result: BashSnippet | undefined) => void;
	private snippets: BashSnippet[];
	private selected = 0;
	private scrollOffset = 0;
	private showFull = false;

	constructor(theme: Theme, done: (result: BashSnippet | undefined) => void, snippets: BashSnippet[]) {
		this.theme = theme;
		this.done = done;
		this.snippets = snippets;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			if (this.showFull) {
				this.showFull = false;
				return;
			}
			this.done(undefined);
			return;
		}
		if (matchesKey(data, "return")) {
			if (this.snippets.length > 0) {
				this.done(at(this.snippets, this.selected));
			}
			return;
		}
		if (matchesKey(data, "up") || matchesKey(data, "ctrl+p")) {
			if (this.selected > 0) this.selected--;
			this.showFull = false;
			return;
		}
		if (matchesKey(data, "down") || matchesKey(data, "ctrl+n")) {
			if (this.selected < this.snippets.length - 1) this.selected++;
			this.showFull = false;
			return;
		}
		if (matchesKey(data, "tab") || data === "p" || data === " ") {
			this.showFull = !this.showFull;
		}
	}

	private renderCodePreview(innerW: number, row: (s: string) => string): string[] {
		if (!this.showFull || this.snippets.length === 0) return [];
		const th = this.theme;
		const snippet = at(this.snippets, this.selected);
		const lines: string[] = [];
		lines.push(row(""));
		lines.push(row(th.fg("border", ` ${"\u2500".repeat(innerW - 2)} `)));
		const codeLines = snippet.code.split("\n");
		const maxCodeLines = 15;
		const display = codeLines.length > maxCodeLines ? codeLines.slice(0, maxCodeLines) : codeLines;
		for (const codeLine of display) {
			lines.push(row(` ${th.fg("text", truncateToWidth(codeLine, innerW - 2))}`));
		}
		if (codeLines.length > maxCodeLines) {
			lines.push(row(` ${th.fg("dim", `... ${codeLines.length - maxCodeLines} more lines`)}`));
		}
		return lines;
	}

	render(width: number): string[] {
		const th = this.theme;
		const innerW = Math.min(width - 2, 100);
		const lines: string[] = [];
		const row = (content: string) => {
			const vis = visibleWidth(content);
			return `${th.fg("border", "\u2502")}${content}${" ".repeat(Math.max(0, innerW - vis))}${th.fg("border", "\u2502")}`;
		};
		lines.push(th.fg("border", `\u256d${"\u2500".repeat(innerW)}\u256e`));
		const title = ` ${th.fg("accent", th.bold("bash snippets"))}`;
		const countInfo = th.fg("dim", ` ${this.snippets.length} found`);
		lines.push(row(`${title}${countInfo}`));
		lines.push(row(""));
		const maxVisible = 15;
		const total = this.snippets.length;

		if (this.selected < this.scrollOffset) this.scrollOffset = this.selected;
		else if (this.selected >= this.scrollOffset + maxVisible) this.scrollOffset = this.selected - maxVisible + 1;

		const visibleStart = this.scrollOffset;
		const visibleEnd = Math.min(total, visibleStart + maxVisible);

		if (total === 0) {
			lines.push(row(` ${th.fg("warning", "No bash snippets found in recent messages")}`));
		} else {
			for (let i = visibleStart; i < visibleEnd; i++) {
				const snippet = at(this.snippets, i);
				const isSelected = i === this.selected;
				const pointer = isSelected ? th.fg("accent", "\u25b8") : " ";
				const num = th.fg("dim", `#${total - i}`);
				const previewMaxW = innerW - visibleWidth(` ${pointer} ${num}  `) - 1;
				const previewText = isSelected ? th.fg("text", snippet.preview) : th.fg("muted", snippet.preview);
				lines.push(row(` ${pointer} ${num} ${truncateToWidth(previewText, Math.max(10, previewMaxW))}`));
			}
			if (total > maxVisible) {
				lines.push(row(th.fg("dim", ` ${visibleStart + 1}-${visibleEnd} of ${total}`)));
			}
		}
		lines.push(...this.renderCodePreview(innerW, row));
		lines.push(row(""));
		const help = [
			`${th.fg("dim", "\u2191\u2193")} navigate`,
			`${th.fg("dim", "Space")} preview`,
			`${th.fg("dim", "Enter")} copy`,
			`${th.fg("dim", "Esc")} cancel`,
		].join(th.fg("border", " \u2502 "));
		lines.push(row(` ${help}`));
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
	pi.registerCommand("bash", {
		description: "Pick a bash snippet from recent messages and copy to clipboard",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const entries = ctx.sessionManager.getBranch();
			const snippets: BashSnippet[] = [];
			let turnIndex = 0;

			for (const entry of entries) {
				if (entry.type !== "message") continue;
				const msg = entry.message;
				if (msg.role !== "assistant") continue;
				turnIndex++;
				const text = getTextFromContent(msg.content);
				const blocks = extractBashBlocks(text);
				for (const code of blocks) {
					snippets.push({
						code,
						preview: makePreview(code, 120),
						turnIndex,
					});
				}
			}
			snippets.reverse();

			if (snippets.length === 0) {
				ctx.ui.notify("No bash snippets found in this session", "warning");
				return;
			}

			const result = await ctx.ui.custom<BashSnippet | undefined>(
				(tui, theme, _keybindings, done) => {
					const overlay = new BashPickerOverlay(theme, done, snippets);
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

			const copied = copyToClipboard(result.code);
			if (copied) {
				ctx.ui.notify("Copied to clipboard", "info");
			} else {
				ctx.ui.pasteToEditor(result.code);
				ctx.ui.notify("Pasted into editor (no clipboard tool found)", "warning");
			}
		},
	});
}
