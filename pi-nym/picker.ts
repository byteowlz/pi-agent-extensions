import {
	type Component,
	type Focusable,
	Input,
	Key,
	matchesKey,
	truncateToWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { Candidate } from "./nym.js";

export interface Styler {
	accent(text: string): string;
	dim(text: string): string;
	warn(text: string): string;
	mark(text: string): string;
}

export const plain: Styler = { accent: (t) => t, dim: (t) => t, warn: (t) => t, mark: (t) => t };

export interface Decision {
	redact: Candidate[];
	keep: Candidate[];
}

const LABELS: Record<string, string> = {
	username: "accounts",
	first_name: "first names",
	last_name: "last names",
	person: "names",
	email: "emails",
	street_address: "addresses",
	city: "cities",
	postcode: "postcodes",
	phone_us: "phone numbers",
	phone_intl: "phone numbers",
	phone_ner: "phone numbers",
	url: "URLs",
	ipv4: "IP addresses",
	ipv6: "IP addresses",
	hostname: "host names",
};

export function groupLabel(c: Candidate): string {
	return c.credential ? "secrets" : (LABELS[c.class] ?? c.class.replace(/_/g, " "));
}

/** Control characters would corrupt the terminal; show them as visible marks. */
export function printable(text: string): string {
	return Array.from(text, (ch) => {
		const code = ch.codePointAt(0) ?? 0;
		if (ch === "\n") return "⏎";
		if (ch === "\t") return " ";
		return code < 32 || code === 127 ? "�" : ch;
	}).join("");
}

/** Group order: secrets first, then by total occurrences. */
export function grouped(candidates: Candidate[]): Candidate[] {
	const totals = new Map<string, number>();
	for (const c of candidates) totals.set(groupLabel(c), (totals.get(groupLabel(c)) ?? 0) + c.count);
	const rank = (label: string) => (label === "secrets" ? Number.POSITIVE_INFINITY : (totals.get(label) ?? 0));
	return [...candidates].sort(
		(a, b) =>
			rank(groupLabel(b)) - rank(groupLabel(a)) ||
			groupLabel(a).localeCompare(groupLabel(b)) ||
			b.count - a.count ||
			a.value.localeCompare(b.value)
	);
}

type Row = { kind: "group"; label: string; members: Candidate[] } | { kind: "item"; candidate: Candidate };

/**
 * Checklist of values nym would replace, grouped into categories. Everything
 * starts selected; the user unticks what may stay. Space toggles the value or,
 * on a category row, the whole category; ←/→ collapse and expand categories.
 */
export class RedactionPicker implements Component, Focusable {
	readonly input = new Input();
	private readonly items: Candidate[];
	private readonly redact: Set<Candidate>;
	private readonly collapsed = new Set<string>();
	private index = 0;

	constructor(
		candidates: Candidate[],
		private readonly renderAgain: () => void,
		private readonly done: (decision: Decision | undefined) => void,
		private readonly style: Styler = plain,
		private readonly rows = 12
	) {
		this.items = grouped(candidates);
		this.redact = new Set(this.items);
		// Long lists open as a category overview.
		if (this.items.length > rows) for (const c of this.items) this.collapsed.add(groupLabel(c));
	}

	get focused() {
		return this.input.focused;
	}
	set focused(value: boolean) {
		this.input.focused = value;
	}
	invalidate() {
		this.input.invalidate();
	}

	private visible(): Candidate[] {
		const q = this.input.getValue().toLocaleLowerCase();
		if (!q) return this.items;
		return this.items.filter((c) => `${c.value}\n${groupLabel(c)}`.toLocaleLowerCase().includes(q));
	}

	/** Category rows, each followed by its values unless collapsed (a filter shows all matches). */
	private visibleRows(): Row[] {
		const filtering = !!this.input.getValue();
		const rows: Row[] = [];
		let group: Extract<Row, { kind: "group" }> | undefined;
		for (const c of this.visible()) {
			const label = groupLabel(c);
			if (group?.label !== label) {
				group = { kind: "group", label, members: [] };
				rows.push(group);
			}
			group.members.push(c);
			if (filtering || !this.collapsed.has(label)) rows.push({ kind: "item", candidate: c });
		}
		return rows;
	}

	private toggle(items: Candidate[]) {
		const on = items.some((c) => !this.redact.has(c));
		for (const c of items) {
			if (on) this.redact.add(c);
			else this.redact.delete(c);
		}
	}

	private groupOf(rows: Row[], index: number): Extract<Row, { kind: "group" }> | undefined {
		for (let i = index; i >= 0; i--) {
			const row = rows[i];
			if (row?.kind === "group") return row;
		}
		return undefined;
	}

	private setCollapsed(rows: Row[], collapse: boolean) {
		const group = this.groupOf(rows, this.index);
		if (!group) return;
		if (collapse) this.collapsed.add(group.label);
		else this.collapsed.delete(group.label);
		// Keep the cursor on the category row it acted on.
		this.index = this.visibleRows().findIndex((r) => r.kind === "group" && r.label === group.label);
	}

	private move(rows: Row[], data: string): boolean {
		const last = rows.length - 1;
		if (matchesKey(data, Key.up)) this.index = Math.max(0, this.index - 1);
		else if (matchesKey(data, Key.down)) this.index = Math.min(last, this.index + 1);
		else if (matchesKey(data, Key.pageUp)) this.index = Math.max(0, this.index - this.rows);
		else if (matchesKey(data, Key.pageDown)) this.index = Math.min(last, this.index + this.rows);
		else if (matchesKey(data, Key.left)) this.setCollapsed(rows, true);
		else if (matchesKey(data, Key.right)) this.setCollapsed(rows, false);
		else return false;
		return true;
	}

	handleInput(data: string) {
		const rows = this.visibleRows();
		const current = rows[this.index];
		if (matchesKey(data, Key.escape)) this.done(undefined);
		else if (matchesKey(data, Key.enter))
			this.done({
				redact: this.items.filter((c) => this.redact.has(c)),
				keep: this.items.filter((c) => !this.redact.has(c)),
			});
		else if (this.move(rows, data)) {
			// handled
		} else if (matchesKey(data, Key.tab) || (data === " " && !this.input.getValue())) {
			if (current) this.toggle(current.kind === "group" ? current.members : [current.candidate]);
		} else if (matchesKey(data, Key.ctrl("g"))) {
			const group = this.groupOf(rows, this.index);
			if (group) this.toggle(group.members);
		} else if (matchesKey(data, Key.ctrl("a"))) this.toggle(this.visible());
		else {
			this.input.handleInput(data);
			this.index = 0;
		}
		this.renderAgain();
	}

	private summary(): string {
		const redact = [...this.redact];
		const occurrences = redact.reduce((n, c) => n + c.count, 0);
		const kept = this.items.length - redact.length;
		return `${redact.length}/${this.items.length} values selected (${occurrences} occurrences)${kept ? `, ${kept} kept` : ""}`;
	}

	private box(on: number, total: number): string {
		if (on === total) return this.style.accent("[x]");
		return on === 0 ? "[ ]" : this.style.accent("[-]");
	}

	private groupRow(row: Extract<Row, { kind: "group" }>, active: boolean, width: number): string {
		const on = row.members.filter((m) => this.redact.has(m)).length;
		const occurrences = row.members.reduce((n, m) => n + m.count, 0);
		const open = this.input.getValue() || !this.collapsed.has(row.label) ? "▾" : "▸";
		const keptSecret = row.label === "secrets" && on < row.members.length;
		const text = `${active ? "›" : " "} ${open} ${this.box(on, row.members.length)} ${this.style.accent(row.label)}  ${this.style.dim(`${on}/${row.members.length} values • ×${occurrences}`)}${keptSecret ? "  SECRETS KEPT" : ""}`;
		return truncateToWidth(keptSecret ? this.style.warn(text) : text, width);
	}

	private row(c: Candidate, active: boolean, width: number): string {
		const on = this.redact.has(c);
		const box = on ? this.style.accent("[x]") : "[ ]";
		const tags = [`×${c.count}`, c.source === "listed" ? "listed" : "", c.credential && !on ? "SECRET KEPT" : ""]
			.filter(Boolean)
			.join("  ");
		const value = printable(c.value);
		const text = `${active ? "›" : " "}     ${box} ${on ? value : this.style.dim(value)}  ${this.style.dim(tags)}`;
		return truncateToWidth(c.credential && !on ? this.style.warn(text) : text, width);
	}

	private contextLines(c: Candidate, width: number): string[] {
		const text = printable(c.context);
		const value = printable(c.value);
		const at = text.indexOf(value);
		const marked = at < 0 ? text : `${text.slice(0, at)}${this.style.mark(value)}${text.slice(at + value.length)}`;
		return wrapTextWithAnsi(marked, Math.max(1, width - 2))
			.slice(0, 3)
			.map((l) => truncateToWidth(`  ${l}`, width));
	}

	private preview(row: Row | undefined, width: number): string[] {
		if (!row) return [];
		if (row.kind === "item") {
			const c = row.candidate;
			return [
				truncateToWidth(this.style.dim(`${c.class} • ${c.source} • first occurrence:`), width),
				...this.contextLines(c, width),
			];
		}
		const sample = row.members
			.slice(0, 6)
			.map((m) => printable(m.value))
			.join(", ");
		return [
			truncateToWidth(this.style.dim(`${row.label}: Space toggles all ${row.members.length} • → show values`), width),
			truncateToWidth(`  ${sample}${row.members.length > 6 ? ", …" : ""}`, width),
		];
	}

	render(width: number): string[] {
		const w = Math.max(20, width);
		const fit = (s: string) => truncateToWidth(s, w);
		const rows = this.visibleRows();
		this.index = Math.max(0, Math.min(this.index, rows.length - 1));
		const lines = [
			fit(this.style.accent("Redact this session before it leaves the machine")),
			fit(this.style.dim("Space toggle • ←/→ fold • Ctrl+A all • type to filter • Enter go • Esc cancel")),
			...this.input.render(Math.max(1, w - 8)).map((line, i) => (i === 0 ? `Filter: ${line}` : line)),
			fit(this.summary()),
		];
		const start = Math.max(0, Math.min(this.index - Math.floor(this.rows / 2), rows.length - this.rows));
		for (let i = start; i < Math.min(rows.length, start + this.rows); i++) {
			const row = rows[i];
			lines.push(row.kind === "group" ? this.groupRow(row, i === this.index, w) : this.row(row.candidate, i === this.index, w));
		}
		if (!rows.length) lines.push(fit("No matching values"));
		lines.push(...this.preview(rows[this.index], w));
		return lines;
	}
}
