/**
 * pi-link-picker — grab URLs, paths, env assignments, tokens, IDs and network
 * endpoints mentioned in the CURRENT session and copy them with OSC 52.
 *
 * Copying is local and sideband: it never writes files, never uploads and never
 * sends anything to a model. Secret-looking values are redacted in previews.
 */

import type { ExtensionAPI, ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { type Focusable, Input, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { CATEGORY_LABEL, CATEGORY_ORDER, type GrabCategory, type GrabItem, extractItems, previewItem } from "./extract.js";
import { emitOsc52 } from "./osc52.js";

type CategoryTab = GrabCategory | "all";
const TABS: readonly CategoryTab[] = ["all", ...CATEGORY_ORDER];

type GrabOutcome = { kind: "copy" | "paste"; item: GrabItem } | undefined;

function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((part: { type?: string }) => part?.type === "text")
		.map((part: { text?: string }) => part.text ?? "")
		.join("\n");
}

/** Collect text from user and assistant messages on the current branch. */
function sessionTexts(ctx: ExtensionCommandContext): string[] {
	const texts: string[] = [];
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "message") continue;
		const role = entry.message.role;
		if (role !== "user" && role !== "assistant") continue;
		const text = messageText(entry.message.content).trim();
		if (text) texts.push(text);
	}
	return texts;
}

function matches(item: GrabItem, query: string): boolean {
	if (!query) return true;
	const needle = query.toLowerCase();
	return (
		item.value.toLowerCase().includes(needle) ||
		item.category.includes(needle) ||
		CATEGORY_LABEL[item.category].toLowerCase().includes(needle)
	);
}

class GrabOverlay implements Focusable {
	focused = false;
	private tab: CategoryTab = "all";
	private selected = 0;
	private scrollOffset = 0;
	private reveal = false;
	private full = false;
	private filtering = false;
	private query = "";
	private readonly search = new Input();

	constructor(
		private readonly theme: Theme,
		private readonly done: (result: GrabOutcome) => void,
		private readonly items: GrabItem[]
	) {
		try {
			this.search.focused = true;
		} catch {
			/* focus is best-effort */
		}
	}

	private visible(): GrabItem[] {
		const query = (this.filtering ? this.search.getValue() : this.query).trim();
		return this.items.filter((item) => (this.tab === "all" || item.category === this.tab) && matches(item, query));
	}

	private counts(): Map<CategoryTab, number> {
		const counts = new Map<CategoryTab, number>();
		for (const item of this.items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
		counts.set("all", this.items.length);
		return counts;
	}

	private cycleTab(delta: number): void {
		const index = TABS.indexOf(this.tab);
		this.tab = TABS[(index + delta + TABS.length) % TABS.length] as CategoryTab;
		this.selected = 0;
		this.full = false;
	}

	private move(delta: number): void {
		const total = this.visible().length;
		if (!total) return;
		this.selected = Math.max(0, Math.min(total - 1, this.selected + delta));
		this.full = false;
	}

	handleInput(data: string): void {
		if (this.filtering) {
			if (matchesKey(data, "escape")) {
				this.search.setValue("");
				this.query = "";
				this.filtering = false;
				this.selected = 0;
				return;
			}
			if (matchesKey(data, "return")) {
				// Keep the filter active after committing the query.
				this.query = this.search.getValue().trim();
				this.filtering = false;
				return;
			}
			this.search.handleInput(data);
			this.selected = 0;
			return;
		}
		if (matchesKey(data, "escape")) {
			if (this.full) {
				this.full = false;
				return;
			}
			this.done(undefined);
			return;
		}
		if (matchesKey(data, "return")) {
			const item = this.visible()[this.selected];
			if (item) this.done({ kind: "copy", item });
			return;
		}
		if (matchesKey(data, "up") || matchesKey(data, "ctrl+p") || data === "k") {
			this.move(-1);
			return;
		}
		if (matchesKey(data, "down") || matchesKey(data, "ctrl+n") || data === "j") {
			this.move(1);
			return;
		}
		if (matchesKey(data, "tab") || matchesKey(data, "right")) {
			this.cycleTab(1);
			return;
		}
		if (matchesKey(data, "shift+tab") || matchesKey(data, "left")) {
			this.cycleTab(-1);
			return;
		}
		if (data === "/") {
			this.filtering = true;
			this.search.setValue(this.query);
			return;
		}
		if (data === "v") {
			this.reveal = !this.reveal;
			return;
		}
		if (data === "p") {
			const item = this.visible()[this.selected];
			if (item) this.done({ kind: "paste", item });
			return;
		}
		if (data === " " || data === "?") this.full = !this.full;
	}

	private renderTabs(theme: Theme): string {
		const counts = this.counts();
		return TABS.map((tab) => {
			const label = tab === "all" ? "All" : CATEGORY_LABEL[tab];
			const count = counts.get(tab) ?? 0;
			const text = `${label} ${count}`;
			return tab === this.tab ? theme.fg("accent", theme.bold(`[${text}]`)) : theme.fg("dim", ` ${text} `);
		}).join("");
	}

	render(width: number): string[] {
		const theme = this.theme;
		const innerWidth = Math.max(20, Math.min(width - 2, 100));
		const row = (content: string): string => {
			const vis = visibleWidth(content);
			return `${theme.fg("border", "\u2502")}${content}${" ".repeat(Math.max(0, innerWidth - vis))}${theme.fg("border", "\u2502")}`;
		};
		const lines: string[] = [];
		lines.push(theme.fg("border", `\u256d${"\u2500".repeat(innerWidth)}\u256e`));
		lines.push(row(` ${theme.fg("accent", theme.bold("grab"))} ${theme.fg("dim", `${this.items.length} found`)}`));
		lines.push(row(` ${this.renderTabs(theme)}`));
		lines.push(row(""));

		const visible = this.visible();
		const maxVisible = 12;
		if (this.selected < this.scrollOffset) this.scrollOffset = this.selected;
		else if (this.selected >= this.scrollOffset + maxVisible) this.scrollOffset = this.selected - maxVisible + 1;
		const end = Math.min(visible.length, this.scrollOffset + maxVisible);
		if (!visible.length) {
			lines.push(row(` ${theme.fg("warning", "Nothing to grab in this category or filter")}`));
		} else {
			for (let i = this.scrollOffset; i < end; i++) {
				const item = visible[i] as GrabItem;
				const isSelected = i === this.selected;
				const pointer = isSelected ? theme.fg("accent", "\u25b8") : " ";
				const badge = theme.fg("dim", CATEGORY_LABEL[item.category].padEnd(7));
				const text = previewItem(item, this.reveal);
				const body = isSelected ? theme.fg("text", text) : theme.fg("muted", text);
				lines.push(row(` ${pointer} ${badge} ${truncateToWidth(body, Math.max(10, innerWidth - 14))}`));
			}
			if (visible.length > maxVisible) lines.push(row(theme.fg("dim", ` ${this.scrollOffset + 1}-${end} of ${visible.length}`)));
		}

		if (this.full && visible.length) {
			const item = visible[this.selected] as GrabItem;
			lines.push(row(""));
			lines.push(row(theme.fg("border", ` ${"\u2500".repeat(innerWidth - 2)}`)));
			for (const line of previewItem(item, true).split("\n").slice(0, 12))
				lines.push(row(` ${theme.fg("text", truncateToWidth(line, innerWidth - 2))}`));
		}

		lines.push(row(""));
		if (this.filtering) {
			lines.push(row(` ${theme.fg("accent", "/")} ${this.search.render(innerWidth - 4)[0] ?? ""}`));
		}
		const help = this.filtering
			? ` ${theme.fg("dim", "type to filter")} ${theme.fg("border", "\u2502")} ${theme.fg("dim", "Enter keep")} ${theme.fg("border", "\u2502")} ${theme.fg("dim", "Esc clear")}`
			: ` ${theme.fg("dim", "\u2191\u2193")} ${theme.fg("dim", "Tab category")} ${theme.fg("dim", "/")} filter ${theme.fg("border", "\u2502")} ${theme.fg("dim", "Enter copy")} ${theme.fg("dim", "p paste")} ${theme.fg("dim", "Space view")} ${theme.fg("dim", "v")} ${theme.fg(this.reveal ? "warning" : "dim", this.reveal ? "hide" : "reveal")}`;
		lines.push(row(help));
		lines.push(theme.fg("border", `\u2570${"\u2500".repeat(innerWidth)}\u256f`));
		return lines;
	}

	invalidate(): void {
		/* Stateless: themed strings are computed per render. */
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("grab", {
		description: "Grab a URL, path, env, token, ID or endpoint mentioned in this session and copy it (OSC 52)",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/grab needs Pi TUI (it is an interactive picker).", "warning");
				return;
			}
			const items = extractItems(sessionTexts(ctx));
			if (!items.length) {
				ctx.ui.notify("Nothing to grab in this session yet.", "warning");
				return;
			}
			const result = await ctx.ui.custom<GrabOutcome>(
				(tui, theme, _kb, done) => {
					const overlay = new GrabOverlay(theme, done, items);
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
						set focused(value: boolean) {
							overlay.focused = value;
						},
					};
				},
				{ overlay: true }
			);
			if (!result) return;
			const { item } = result;
			if (result.kind === "paste") {
				ctx.ui.pasteToEditor(item.value);
				ctx.ui.notify(`Pasted ${CATEGORY_LABEL[item.category]} into the editor.`, "info");
				return;
			}
			const copied = emitOsc52(item.value);
			if (copied.ok) {
				ctx.ui.notify(`Copied ${CATEGORY_LABEL[item.category]} (${copied.bytes} bytes) via OSC 52.`, "info");
			} else {
				ctx.ui.pasteToEditor(item.value);
				ctx.ui.notify(`${copied.error ?? "OSC 52 copy failed"}; pasted into the editor instead.`, "warning");
			}
		},
	});
}
