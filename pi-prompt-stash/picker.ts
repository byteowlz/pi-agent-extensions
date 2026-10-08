import {
	type Component,
	type Focusable,
	Input,
	Key,
	matchesKey,
	truncateToWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

export interface PickItem {
	id: string;
	text: string;
	label?: string;
	createdAt: string;
	attachmentsOmitted?: boolean;
}
export function displayText(text: string): string {
	return Array.from(text, (char) => {
		const code = char.codePointAt(0) ?? 0;
		return (code < 32 && code !== 9 && code !== 10) || code === 127 ? "�" : char;
	}).join("");
}
export class PromptPicker<T extends PickItem> implements Component, Focusable {
	readonly input = new Input({ prompt: "Search: " });
	private index = 0;
	private selected = new Set<string>();
	private preview = false;
	private previewOffset = 0;
	constructor(
		private items: T[],
		private title: string,
		private renderAgain: () => void,
		private done: (items: T[] | undefined) => void
	) {}
	get focused() {
		return this.input.focused;
	}
	set focused(value: boolean) {
		this.input.focused = value;
	}
	invalidate() {
		this.input.invalidate();
	}
	private filtered() {
		const q = this.input.getValue().toLocaleLowerCase();
		return this.items.filter((item) => `${item.label ?? ""}\n${item.text}`.toLocaleLowerCase().includes(q));
	}
	handleInput(data: string) {
		const list = this.filtered();
		if (matchesKey(data, Key.escape)) {
			if (this.preview) this.preview = false;
			else this.done(undefined);
		} else if (matchesKey(data, Key.ctrl("v"))) {
			this.preview = !this.preview;
			this.previewOffset = 0;
		} else if (this.preview) {
			if (matchesKey(data, Key.down) || matchesKey(data, Key.pageDown)) this.previewOffset += 10;
			else if (matchesKey(data, Key.up) || matchesKey(data, Key.pageUp))
				this.previewOffset = Math.max(0, this.previewOffset - 10);
		} else if (matchesKey(data, Key.up)) this.index = Math.max(0, this.index - 1);
		else if (matchesKey(data, Key.down)) this.index = Math.min(list.length - 1, this.index + 1);
		else if (matchesKey(data, Key.tab) || (data === " " && !this.input.getValue())) {
			const item = list[this.index];
			if (item) {
				if (this.selected.has(item.id)) this.selected.delete(item.id);
				else this.selected.add(item.id);
			}
		} else if (matchesKey(data, Key.enter)) {
			const items = this.selected.size
				? this.items.filter((i) => this.selected.has(i.id))
				: list[this.index]
					? [list[this.index]]
					: [];
			if (items.length) this.done(items);
		} else {
			this.input.handleInput(data);
			this.index = 0;
		}
		this.renderAgain();
	}
	render(width: number): string[] {
		const fit = (s: string) => truncateToWidth(s, Math.max(1, width));
		const list = this.filtered();
		this.index = Math.max(0, Math.min(this.index, list.length - 1));
		const current = list[this.index];
		const lines = [
			fit(this.title),
			...this.input.render(Math.max(1, width)),
			fit(`${this.selected.size} selected • Tab select • Enter actions • Ctrl+V full preview • Esc cancel`),
		];
		if (this.preview && current) {
			const wrapped = displayText(current.text)
				.split("\n")
				.flatMap((line) => wrapTextWithAnsi(line, Math.max(1, width)));
			this.previewOffset = Math.min(this.previewOffset, Math.max(0, wrapped.length - 12));
			lines.push(
				fit(`Preview ${this.previewOffset + 1}/${wrapped.length} • ↑/↓ scroll • Esc back`),
				...wrapped.slice(this.previewOffset, this.previewOffset + 12).map(fit)
			);
		} else {
			const start = Math.max(0, this.index - 5);
			for (let i = start; i < Math.min(list.length, start + 10); i++) {
				const item = list[i];
				lines.push(
					fit(
						`${i === this.index ? "›" : " "} ${this.selected.has(item.id) ? "[x]" : "[ ]"} ${item.createdAt.slice(0, 16)} ${displayText(item.label ?? "")} ${displayText(item.text).replace(/\s+/g, " ")}${item.attachmentsOmitted ? " [TEXT ONLY]" : ""}`
					)
				);
			}
			if (!list.length) lines.push(fit("No matching prompts"));
		}
		return lines;
	}
}
