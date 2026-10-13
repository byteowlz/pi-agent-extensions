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

/**
 * Checklist of values nym would replace. Everything starts selected; the user
 * unticks what may stay. Space toggles one value, Ctrl+G its group, Ctrl+A all.
 */
export class RedactionPicker implements Component, Focusable {
	readonly input = new Input();
	private readonly items: Candidate[];
	private readonly redact: Set<Candidate>;
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

	private toggle(items: Candidate[]) {
		const on = items.some((c) => !this.redact.has(c));
		for (const c of items) {
			if (on) this.redact.add(c);
			else this.redact.delete(c);
		}
	}

	handleInput(data: string) {
		const list = this.visible();
		const current = list[this.index];
		if (matchesKey(data, Key.escape)) this.done(undefined);
		else if (matchesKey(data, Key.enter))
			this.done({
				redact: this.items.filter((c) => this.redact.has(c)),
				keep: this.items.filter((c) => !this.redact.has(c)),
			});
		else if (matchesKey(data, Key.up)) this.index = Math.max(0, this.index - 1);
		else if (matchesKey(data, Key.down)) this.index = Math.min(list.length - 1, this.index + 1);
		else if (matchesKey(data, Key.pageUp)) this.index = Math.max(0, this.index - this.rows);
		else if (matchesKey(data, Key.pageDown)) this.index = Math.min(list.length - 1, this.index + this.rows);
		else if (matchesKey(data, Key.tab) || (data === " " && !this.input.getValue())) {
			if (current) this.toggle([current]);
		} else if (matchesKey(data, Key.ctrl("g"))) {
			if (current) this.toggle(list.filter((c) => groupLabel(c) === groupLabel(current)));
		} else if (matchesKey(data, Key.ctrl("a"))) this.toggle(list);
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

	private row(c: Candidate, active: boolean, width: number): string {
		const on = this.redact.has(c);
		const box = on ? this.style.accent("[x]") : "[ ]";
		const tags = [`×${c.count}`, c.source === "listed" ? "listed" : "", c.credential && !on ? "SECRET KEPT" : ""]
			.filter(Boolean)
			.join("  ");
		const value = printable(c.value);
		const text = `${active ? "›" : " "} ${box} ${on ? value : this.style.dim(value)}  ${this.style.dim(tags)}`;
		return truncateToWidth(c.credential && !on ? this.style.warn(text) : text, width);
	}

	private contextLines(c: Candidate, width: number): string[] {
		const text = printable(c.context);
		const at = text.indexOf(printable(c.value));
		const marked =
			at < 0 ? text : `${text.slice(0, at)}${this.style.mark(printable(c.value))}${text.slice(at + printable(c.value).length)}`;
		return wrapTextWithAnsi(marked, Math.max(1, width - 2))
			.slice(0, 3)
			.map((l) => truncateToWidth(`  ${l}`, width));
	}

	render(width: number): string[] {
		const w = Math.max(20, width);
		const fit = (s: string) => truncateToWidth(s, w);
		const list = this.visible();
		this.index = Math.max(0, Math.min(this.index, list.length - 1));
		const lines = [
			fit(this.style.accent("Redact this session before it leaves the machine")),
			fit(this.style.dim("Space toggle • Ctrl+G group • Ctrl+A all • type to filter • Enter continue • Esc cancel")),
			...this.input.render(Math.max(1, w - 8)).map((line, i) => (i === 0 ? `Filter: ${line}` : line)),
			fit(this.summary()),
		];
		const start = Math.max(0, Math.min(this.index - Math.floor(this.rows / 2), list.length - this.rows));
		let group = "";
		for (let i = start; i < Math.min(list.length, start + this.rows); i++) {
			const c = list[i];
			if (groupLabel(c) !== group) {
				group = groupLabel(c);
				const members = list.filter((m) => groupLabel(m) === group);
				const on = members.filter((m) => this.redact.has(m)).length;
				lines.push(fit(this.style.dim(`── ${group} (${on}/${members.length})`)));
			}
			lines.push(this.row(c, i === this.index, w));
		}
		if (!list.length) lines.push(fit("No matching values"));
		const current = list[this.index];
		if (current) {
			lines.push(fit(this.style.dim(`${current.class} • ${current.source} • first occurrence:`)));
			lines.push(...this.contextLines(current, w));
		}
		return lines;
	}
}
