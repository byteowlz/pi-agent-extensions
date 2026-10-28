/**
 * Pure terminal renderer for the Oqto OpenUI profile (cells level).
 * tree + width + theme + interaction state -> lines and focusable controls.
 * Colours come only from Pi theme roles, so it follows Pi's theme (system theme
 * follows the terminal: tinty, Omarchy, ...). No terminal I/O happens here.
 */
import { renderFallback } from "@byteowlz/oqto-openui";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

/** Minimal theme surface used here; Pi's Theme satisfies it. */
export interface Paint {
	fg(role: string, text: string): string;
	bold(text: string): string;
	inverse?(text: string): string;
}

export type Element = { type: "element"; typeName: string; props: Record<string, unknown> };
export const isElement = (v: unknown): v is Element =>
	!!v && typeof v === "object" && (v as Element).type === "element" && typeof (v as Element).typeName === "string";
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string =>
	typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "";
const props = (v: unknown): Record<string, unknown> => (isElement(v) ? v.props : {});

/** A focusable control produced during rendering, in reading order. */
export type Control =
	| { kind: "button"; id: string; label: string; action: unknown }
	| { kind: "tabs"; id: string; count: number }
	| { kind: "accordion"; id: string; count: number }
	| { kind: "choice"; id: string; state: string; options: { value: string; label: string }[]; multiple: boolean }
	| { kind: "toggle"; id: string; state: string; key: string }
	| { kind: "text"; id: string; state: string; placeholder: string }
	| { kind: "slider"; id: string; state: string; min: number; max: number; step: number }
	| { kind: "cell"; id: string; table: string; row: number; col: number; options?: { value: string; label: string }[] };

export interface ViewState {
	/** Form state, keyed "$name" like OpenUI state variables. */
	values: Record<string, unknown>;
	/** Selected tab / open accordion item per control id. */
	selected: Record<string, number>;
	/** Editable table rows per table id. */
	tables: Record<string, unknown[][]>;
	focus: number;
	/** Control id currently in text-edit mode. */
	editing?: string;
	interactive: boolean;
}

export const emptyState = (initial: Record<string, unknown> = {}, interactive = false): ViewState => ({
	values: { ...initial },
	selected: {},
	tables: {},
	focus: 0,
	interactive,
});

export interface Rendered {
	lines: string[];
	controls: Control[];
}

const SPARK = "▁▂▃▄▅▆▇█";
const BRAILLE_DOTS = [
	[0x01, 0x08],
	[0x02, 0x10],
	[0x04, 0x20],
	[0x40, 0x80],
];

export function render(root: unknown, width: number, paint: Paint, state: ViewState): Rendered {
	const controls: Control[] = [];
	const w = Math.max(20, width);
	const r = new Renderer(paint, state, controls);
	const lines = r.node(root, w);
	return { lines: lines.map((l) => truncateToWidth(l, w)), controls };
}

class Renderer {
	private auto = 0;
	constructor(
		private readonly p: Paint,
		private readonly s: ViewState,
		private readonly controls: Control[]
	) {}

	private inv(text: string): string {
		return this.p.inverse ? this.p.inverse(text) : this.p.bold(this.p.fg("accent", `[${text}]`));
	}

	private control<T extends Control>(c: T): { control: T; focused: boolean } {
		const index = this.controls.push(c) - 1;
		return { control: c, focused: this.s.interactive && index === this.s.focus };
	}

	private id(prefix: string): string {
		this.auto += 1;
		return `${prefix}${this.auto}`;
	}

	private wrap(text: string, width: number, role?: string): string[] {
		const lines = wrapTextWithAnsi(text, Math.max(1, width));
		return role ? lines.map((l) => this.p.fg(role, l)) : lines;
	}

	private value(name: string): unknown {
		return this.s.values[`$${name}`];
	}

	node(n: unknown, w: number): string[] {
		if (Array.isArray(n)) return n.flatMap((c) => this.node(c, w));
		if (!isElement(n)) return [];
		const p = n.props;
		switch (n.typeName) {
			case "Stack":
				return this.stack(arr(p.children), w, p.direction === "row");
			case "Card":
				return this.card(arr(p.children), w);
			case "CardHeader":
				return [this.p.bold(str(p.title)), ...(p.subtitle ? this.wrap(str(p.subtitle), w, "muted") : []), ""];
			case "InlineHeader":
				return [this.p.bold(str(p.heading)), ...(p.description ? this.wrap(str(p.description), w, "muted") : [])];
			case "TextContent":
				return this.wrap(str(p.text), w, String(p.size ?? "").startsWith("small") ? "muted" : undefined);
			case "MarkDownRenderer":
				return this.wrap(
					str(p.textMarkdown).replace(/\*\*(.+?)\*\*/g, (_m, t: string) => this.p.bold(this.p.fg("accent", t))),
					w
				);
			case "Callout":
			case "TextCallout": {
				const role = { warning: "warning", error: "error", danger: "error", success: "success" }[str(p.variant)] ?? "accent";
				const bar = this.p.fg(role, "▌");
				return [
					`${bar} ${this.p.bold(this.p.fg(role, str(p.title)))}`,
					...this.wrap(str(p.description), w - 2).map((l) => `${bar} ${this.p.fg("muted", l)}`),
				];
			}
			case "CodeBlock":
				return [
					this.p.fg("muted", `┄ ${str(p.language)}`),
					...str(p.codeString)
						.split("\n")
						.map((l) => this.p.fg("toolOutput", truncateToWidth(l, w))),
				];
			case "Separator":
				return [this.p.fg("borderMuted", "─".repeat(w))];
			case "Tabs":
				return this.tabs(arr(p.items), w);
			case "Accordion":
				return this.accordion(arr(p.items), w);
			case "Steps":
				return arr(p.items).flatMap((it, i) => [
					`${this.p.fg("accent", String(i + 1))} ${this.p.bold(str(props(it).title))}`,
					...this.wrap(str(props(it).details), w - 2, "muted").map((l) => `${this.p.fg("borderMuted", "│")} ${l}`),
				]);
			case "Table":
				return this.table(arr(p.columns), w);
			case "EditableTable":
				return this.editable(p, w);
			case "AreaChart":
			case "LineChart":
				return this.area(arr(p.labels).map(str), arr(p.series), w);
			case "BarChart":
			case "HorizontalBarChart":
				return this.bars(arr(p.labels).map(str), arr(p.series), w);
			case "PieChart":
			case "RadialChart":
			case "SingleStackedBarChart":
				return this.share(p, w);
			case "OverviewCardBlock":
				return this.kpis(arr(p.items), w);
			case "EntityList":
				return this.entities(p, w);
			case "ListBlock":
				return this.list(p, w);
			case "TagBlock":
				return [
					arr(p.tags)
						.map((t) => `${this.p.fg("muted", "[")}${str(t)}${this.p.fg("muted", "]")}`)
						.join(" "),
				];
			case "Tag":
				return [`${this.p.fg("muted", "[")}${str(p.text)}${this.p.fg("muted", "]")}`];
			case "ImageGallery":
				return arr(p.images).flatMap((im) => {
					const o = (im ?? {}) as Record<string, unknown>;
					return [`${this.p.fg("accent", "▣")} ${str(o.alt)}`, ...(o.details ? [`  ${this.p.fg("muted", str(o.details))}`] : [])];
				});
			case "ImageBlock":
			case "Image":
				return [`${this.p.fg("accent", "▣")} ${str(p.alt)}`];
			case "Buttons":
				return ["", this.buttons(arr(p.buttons), w)];
			case "Button":
				return [this.buttons([n], w)];
			case "Form":
				return [...this.node(arr(p.fields), w), ...this.node(p.buttons, w)];
			case "FormControl":
				return [
					this.p.fg("muted", str(p.label)),
					...this.node(p.input, w - 2).map((l) => `  ${l}`),
					...(p.hint ? this.wrap(str(p.hint), w - 2, "dim").map((l) => `  ${l}`) : []),
				];
			case "Input":
			case "TextArea":
			case "DatePicker":
				return [this.textInput(str(p.name), str(p.placeholder || (n.typeName === "DatePicker" ? "YYYY-MM-DD" : "")), w)];
			case "Select":
			case "RadioGroup":
			case "OptionCards":
			case "Chips":
			case "CheckBoxGroup":
				return this.choice(n.typeName, p, w);
			case "SwitchGroup":
				return this.switches(p);
			case "Slider":
				return [this.slider(p, w)];
			default: {
				// Every remaining catalog component still yields readable text.
				const text = renderFallback(n);
				return text ? text.split("\n").flatMap((l) => this.wrap(l, w)) : [];
			}
		}
	}

	private stack(children: unknown[], w: number, row: boolean): string[] {
		if (!row || children.length < 2) {
			const out: string[] = [];
			for (const c of children) {
				const lines = this.node(c, w);
				if (lines.length && out.length && isElement(c) && c.typeName === "Card") out.push("");
				out.push(...lines);
			}
			return out;
		}
		const cw = Math.max(10, Math.floor((w - 2 * (children.length - 1)) / children.length));
		const cols = children.map((c) => this.node(c, cw));
		const height = Math.max(...cols.map((c) => c.length));
		return Array.from({ length: height }, (_, i) => cols.map((c) => pad(c[i] ?? "", cw)).join("  "));
	}

	private card(children: unknown[], w: number): string[] {
		const inner = Math.max(10, w - 4);
		let title = "";
		const rest: unknown[] = [];
		for (const c of children)
			if (!title && isElement(c) && c.typeName === "CardHeader") {
				title = str(c.props.title);
				if (c.props.subtitle)
					rest.push(
						{ type: "element", typeName: "TextContent", props: { text: c.props.subtitle, size: "small" } },
						{ type: "element", typeName: "Spacer", props: {} }
					);
			} else rest.push(c);
		const body = this.node(
			rest.filter((c) => !(isElement(c) && c.typeName === "Spacer")),
			inner
		);
		const b = (s: string) => this.p.fg("border", s);
		const head = title
			? `${b("╭─ ")}${this.p.bold(truncateToWidth(title, inner - 2))}${b(` ${"─".repeat(Math.max(0, inner - 1 - visibleWidth(truncateToWidth(title, inner - 2))))}╮`)}`
			: b(`╭${"─".repeat(w - 2)}╮`);
		return [
			head,
			...body.map((l) => `${b("│")} ${pad(truncateToWidth(l, inner), inner)} ${b("│")}`),
			b(`╰${"─".repeat(w - 2)}╯`),
		];
	}

	private tabs(items: unknown[], w: number): string[] {
		const { control, focused } = this.control({ kind: "tabs", id: this.id("tabs"), count: items.length });
		const sel = Math.min(this.s.selected[control.id] ?? 0, Math.max(0, items.length - 1));
		const bar = items
			.map((it, i) => (i === sel ? this.inv(` ${str(props(it).trigger)} `) : ` ${this.p.fg("muted", str(props(it).trigger))} `))
			.join(" ");
		const hint = focused ? this.p.fg("accent", " ◂ ←/→") : this.p.fg("dim", " ←/→");
		return [bar + hint, this.p.fg("borderMuted", "─".repeat(w)), ...this.node(arr(props(items[sel]).content), w)];
	}

	private accordion(items: unknown[], w: number): string[] {
		const { control, focused } = this.control({ kind: "accordion", id: this.id("acc"), count: items.length });
		const open = this.s.selected[control.id] ?? -1;
		return items.flatMap((it, i) => {
			const head = `${i === open ? "▾" : "▸"} ${str(props(it).trigger)}`;
			const line = focused && i === Math.max(0, open) ? this.p.fg("accent", head) : head;
			return i === open ? [line, ...this.node(arr(props(it).content), w - 2).map((l) => `  ${l}`)] : [line];
		});
	}

	private table(columns: unknown[], w: number): string[] {
		const cols = columns.map(props);
		const data = cols.map((c) => arr(c.data).map(str));
		const n = Math.max(0, ...data.map((d) => d.length));
		const numeric = cols.map(
			(c, i) => c.type === "number" || (data[i]?.length ? data[i].every((v) => /^-?[\d.,]+%?$/.test(v)) : false)
		);
		const width = cols.map((c, i) => Math.max(visibleWidth(str(c.label)), ...(data[i] ?? []).map((v) => visibleWidth(v))));
		const cell = (v: string, i: number) => (numeric[i] ? v.padStart(width[i] ?? 0) : pad(v, width[i] ?? 0));
		const status = (v: string, text: string) =>
			/^(healthy|ok|passed|done|success)$/i.test(v)
				? this.p.fg("success", text)
				: /^(degraded|warning|pending)$/i.test(v)
					? this.p.fg("warning", text)
					: /^(failed|error|down)$/i.test(v)
						? this.p.fg("error", text)
						: text;
		return [
			this.p.fg("muted", cols.map((c, i) => cell(str(c.label), i)).join("  ")),
			...Array.from({ length: n }, (_, r) =>
				cols.map((_, i) => status(data[i]?.[r] ?? "", cell(data[i]?.[r] ?? "", i))).join("  ")
			),
		].map((l) => truncateToWidth(l, w));
	}

	private editable(p: Record<string, unknown>, w: number): string[] {
		const id = str(p.name) || this.id("table");
		const cols = arr(p.columns) as Record<string, unknown>[];
		const initial = arr(p.data).map((row) => arr((row as { values?: unknown }).values));
		if (!this.s.tables[id]) this.s.tables[id] = initial.map((r) => [...r]);
		const rows = this.s.tables[id] ?? [];
		const label = (c: Record<string, unknown>, v: unknown) =>
			c.type === "select"
				? str((arr(c.options) as { value: string; label: string }[]).find((o) => o.value === v)?.label ?? v)
				: str(v);
		const width = cols.map((c, i) =>
			Math.max(visibleWidth(str(c.header ?? c.key)), ...rows.map((r) => visibleWidth(label(c, r[i]))), 4)
		);
		const out = [this.p.fg("muted", cols.map((c, i) => pad(str(c.header ?? c.key), width[i] ?? 0)).join("  "))];
		rows.forEach((row, r) => {
			const cells = cols.map((c, i) => {
				const { control, focused } = this.control({
					kind: "cell",
					id: `${id}:${r}:${i}`,
					table: id,
					row: r,
					col: i,
					options: c.type === "select" ? (arr(c.options) as { value: string; label: string }[]) : undefined,
				});
				const text = this.s.editing === control.id ? `${str(row[i])}▏` : label(c, row[i]);
				const cell = pad(text, width[i] ?? 0);
				return focused ? this.inv(cell) : cell;
			});
			out.push(cells.join("  "));
		});
		if (this.s.interactive) out.push(this.p.fg("dim", "tab next · enter edit · ←/→ option"));
		return out.map((l) => truncateToWidth(l, w));
	}

	private area(labels: string[], series: unknown[], w: number): string[] {
		const cols = Math.max(8, w - 6);
		const height = 6;
		const values = series.map((s) => arr(props(s).values).map((v) => Number(v) || 0));
		const max = Math.max(1, ...values.flat());
		const grid = new DotGrid(cols * 2, height * 4);
		values.forEach((v, k) => plotSeries(grid, v, max, k === 0));
		const lines: string[] = [];
		for (let cy = 0; cy < height; cy++) {
			const axis = cy === 0 ? this.p.fg("dim", String(max).padStart(4)) : "    ";
			let cells = "";
			for (let cx = 0; cx < cols; cx++) {
				const { dots, second } = grid.cell(cx, cy);
				cells += dots ? this.p.fg(second ? "error" : "accent", String.fromCharCode(0x2800 + dots)) : " ";
			}
			lines.push(`${axis} ${cells}`);
		}
		const step = Math.max(1, Math.floor(cols / Math.max(1, labels.length)));
		lines.push(
			`     ${this.p.fg(
				"dim",
				labels
					.map((l) => pad(l.slice(0, step - 1), step))
					.join("")
					.slice(0, cols)
			)}`
		);
		lines.push(this.legend(series, true));
		return lines;
	}

	private legend(series: unknown[], spark: boolean): string {
		return series
			.map((s, k) => {
				const v = arr(props(s).values).map((x) => Number(x) || 0);
				const m = Math.max(1, ...v);
				const mark = this.p.fg(k ? "error" : "accent", spark && k ? "·" : "█");
				const sp = spark ? ` ${this.p.fg("dim", v.map((x) => SPARK[Math.min(7, Math.floor((x / m) * 7))]).join(""))}` : "";
				return `${mark} ${str(props(s).category)}${sp}`;
			})
			.join("   ");
	}

	private bars(labels: string[], series: unknown[], w: number): string[] {
		const values = series.map((s) => arr(props(s).values).map((v) => Number(v) || 0));
		const totals = labels.map((_, i) => values.reduce((a, v) => a + (v[i] ?? 0), 0));
		const max = Math.max(1, ...totals);
		const lw = Math.min(14, Math.max(...labels.map((l) => visibleWidth(l)), 4));
		const bw = Math.max(4, w - lw - 8);
		const out = labels.map((l, i) => {
			let bar = "";
			values.forEach((v, k) => {
				bar += this.p.fg(k ? "error" : "accent", "█".repeat(Math.round(((v[i] ?? 0) / max) * bw)));
			});
			return `${pad(truncateToWidth(l, lw), lw)} ${bar} ${this.p.fg("dim", String(totals[i]))}`;
		});
		return [...out, this.legend(series, false)];
	}

	private share(p: Record<string, unknown>, w: number): string[] {
		const labels = arr(p.labels).map(str);
		const values = arr(p.values).map((v) => Number(v) || 0);
		const total = Math.max(
			1e-9,
			values.reduce((a, b) => a + b, 0)
		);
		const roles = ["accent", "success", "warning", "error", "muted"];
		const bw = Math.max(10, w - 2);
		const bar = values
			.map((v, i) => this.p.fg(roles[i % roles.length] ?? "accent", "█".repeat(Math.max(1, Math.round((v / total) * bw)))))
			.join("");
		return [
			truncateToWidth(bar, w),
			labels
				.map(
					(l, i) => `${this.p.fg(roles[i % roles.length] ?? "accent", "█")} ${l} ${Math.round(((values[i] ?? 0) / total) * 100)}%`
				)
				.join("  "),
		];
	}

	private kpis(items: unknown[], w: number): string[] {
		const per = w >= 72 ? 4 : w >= 44 ? 2 : 1;
		const cw = Math.floor((w - 2 * (per - 1)) / per);
		const out: string[] = [];
		for (let i = 0; i < items.length; i += per) {
			const group = items.slice(i, i + per).map(props);
			out.push(
				group
					.map((g) => pad(this.p.fg("muted", truncateToWidth(str(props(g.top).value ?? props(g.top).title), cw)), cw))
					.join("  ")
			);
			out.push(
				group
					.map((g) => {
						const b = props(g.bottom);
						const t = b.trend as { direction?: string; value?: number } | undefined;
						const trend = t
							? ` ${this.p.fg(t.direction === "up" ? "success" : "error", `${t.direction === "up" ? "▲" : "▼"}${str(t.value)}%`)}`
							: "";
						return pad(`${this.p.bold(str(b.value))}${trend}`, cw);
					})
					.join("  ")
			);
			out.push(group.map((g) => pad(this.p.fg("dim", truncateToWidth(str(props(g.bottom).subtext), cw)), cw)).join("  "));
		}
		return [...out, ""];
	}

	private entities(p: Record<string, unknown>, w: number): string[] {
		const rows = arr(p.rows) as Record<string, unknown>[];
		const lw = Math.max(...rows.map((r) => visibleWidth(str(r.left))), 4);
		const line = (r: Record<string, unknown> | undefined, role?: string) =>
			r ? truncateToWidth(`${pad(str(r.left), lw)}  ${role ? this.p.fg(role, str(r.right)) : str(r.right)}`, w) : "";
		return [
			line(p.header as Record<string, unknown>, "muted"),
			...rows.map((r) => line(r)),
			line(p.footer as Record<string, unknown>, "accent"),
		].filter(Boolean);
	}

	private list(p: Record<string, unknown>, w: number): string[] {
		return arr(p.items).flatMap((it, i) => {
			const q = props(it);
			const head = `${p.variant === "number" ? `${i + 1}.` : "•"} ${str(q.title)}`;
			let line = head;
			if (q.action) {
				const { focused } = this.control({
					kind: "button",
					id: this.id("li"),
					label: str(q.actionLabel || q.title),
					action: q.action,
				});
				line = focused
					? `${this.p.fg("accent", "❯")} ${this.p.bold(head)}  ${this.inv(` ${str(q.actionLabel || "Go")} `)}`
					: `  ${head}  ${this.p.fg("dim", str(q.actionLabel || ""))}`;
			}
			return [
				truncateToWidth(line, w),
				...(q.subtitle ? [`    ${this.p.fg("muted", truncateToWidth(str(q.subtitle), w - 4))}`] : []),
			];
		});
	}

	private buttons(buttons: unknown[], w: number): string {
		const parts = buttons.map((b, i) => {
			const q = props(b);
			const { focused } = this.control({ kind: "button", id: this.id("btn"), label: str(q.label), action: q.action });
			const label = ` ${str(q.label)} `;
			if (focused) return this.inv(label);
			const role = q.type === "destructive" ? "error" : i === 0 && (q.variant ?? "primary") === "primary" ? "accent" : "muted";
			return this.p.fg(role, `[${label}]`);
		});
		const hint = this.s.interactive ? this.p.fg("dim", "  tab · enter") : "";
		return truncateToWidth(parts.join("  ") + hint, w);
	}

	private textInput(name: string, placeholder: string, w: number): string {
		const { control, focused } = this.control({ kind: "text", id: this.id("in"), state: `$${name}`, placeholder });
		const v = str(this.value(name));
		const editing = this.s.editing === control.id;
		const shown = v ? v : this.p.fg("dim", placeholder);
		const field = `${focused ? this.p.fg("accent", "▏") : this.p.fg("borderMuted", "▏")}${shown}${editing ? "█" : ""}`;
		return truncateToWidth(pad(field, Math.min(w, 40)) + (focused && !editing ? this.p.fg("dim", "  enter to type") : ""), w);
	}

	private choice(kind: string, p: Record<string, unknown>, w: number): string[] {
		const name = str(p.name);
		const options = arr(p.items).map((it) => {
			const q = props(it);
			return { value: str(q.value), label: str(q.label ?? q.title), sub: str(q.subtitle ?? q.description) };
		});
		const multiple = p.type === "multiple" || kind === "CheckBoxGroup";
		const key = `$${name}`;
		if (this.s.values[key] == null && p.defaultValue != null) this.s.values[key] = p.defaultValue;
		const current = this.s.values[key];
		const isOn = (v: string) => (Array.isArray(current) ? current.includes(v) : current === v);
		const { focused } = this.control({ kind: "choice", id: this.id("ch"), state: key, options, multiple });
		const mark = (on: boolean) => (multiple ? (on ? "▣" : "□") : on ? "◉" : "○");
		if (kind === "Chips") {
			const line = options
				.map((o) => (isOn(o.value) ? this.inv(` ${o.label} `) : `${this.p.fg("muted", "(")}${o.label}${this.p.fg("muted", ")")}`))
				.join(" ");
			return [truncateToWidth(line + (focused ? this.p.fg("accent", " ◂ ←/→") : ""), w)];
		}
		return options.flatMap((o) => {
			const on = isOn(o.value);
			const head = `${on ? this.p.fg("accent", mark(true)) : mark(false)} ${on ? this.p.bold(o.label) : o.label}`;
			return [
				truncateToWidth(head + (focused && on ? this.p.fg("accent", " ◂ ↑/↓") : ""), w),
				...(o.sub && kind === "OptionCards" ? [`  ${this.p.fg("muted", truncateToWidth(o.sub, w - 2))}`] : []),
			];
		});
	}

	private switches(p: Record<string, unknown>): string[] {
		const group = str(p.name);
		return arr(p.items).map((it) => {
			const q = props(it);
			const key = `$${group}.${str(q.name)}`;
			if (this.s.values[key] == null) this.s.values[key] = q.defaultChecked === true;
			const { focused } = this.control({ kind: "toggle", id: this.id("sw"), state: key, key: str(q.name) });
			const on = this.s.values[key] === true;
			const box = on ? this.p.fg("accent", "[x]") : "[ ]";
			return `${focused ? this.p.fg("accent", "❯") : " "} ${box} ${str(q.label ?? q.name)}${q.description ? `  ${this.p.fg("muted", str(q.description))}` : ""}`;
		});
	}

	private slider(p: Record<string, unknown>, w: number): string {
		const name = str(p.name);
		const min = Number(p.min) || 0;
		const max = Number(p.max) || 100;
		const key = `$${name}`;
		if (this.s.values[key] == null) this.s.values[key] = arr(p.defaultValue)[0] ?? min;
		const { focused } = this.control({ kind: "slider", id: this.id("sl"), state: key, min, max, step: Number(p.step) || 1 });
		const v = Number(this.s.values[key]);
		const bw = Math.max(10, Math.min(30, w - 16));
		const pos = Math.round(((v - min) / Math.max(1e-9, max - min)) * bw);
		const track =
			this.p.fg("accent", "━".repeat(pos)) +
			(focused ? this.p.fg("accent", "●") : "●") +
			this.p.fg("borderMuted", "─".repeat(Math.max(0, bw - pos)));
		return `${str(p.label)} ${track} ${v}`;
	}
}

/** 2x4 Braille dot raster: bit 1 = first series (area), bit 2 = other series (line). */
class DotGrid {
	private readonly bits: Uint8Array;
	constructor(
		private readonly width: number,
		private readonly height: number
	) {
		this.bits = new Uint8Array(width * height);
	}
	set(x: number, y: number, bit: number): void {
		if (x >= 0 && x < this.width && y >= 0 && y < this.height)
			this.bits[y * this.width + x] = (this.bits[y * this.width + x] ?? 0) | bit;
	}
	get(x: number, y: number): number {
		return this.bits[y * this.width + x] ?? 0;
	}
	cell(cx: number, cy: number): { dots: number; second: boolean } {
		let dots = 0;
		let second = false;
		BRAILLE_DOTS.forEach((row, dy) => {
			row.forEach((mask, dx) => {
				const g = this.get(cx * 2 + dx, cy * 4 + dy);
				if (g) dots |= mask;
				if (g & 2) second = true;
			});
		});
		return { dots, second };
	}
	get rows(): number {
		return this.height;
	}
	get columns(): number {
		return this.width;
	}
}

function plotSeries(grid: DotGrid, v: number[], max: number, fill: boolean): void {
	if (!v.length) return;
	const top = grid.rows - 1;
	for (let x = 0; x < grid.columns; x++) {
		const f = (x / Math.max(1, grid.columns - 1)) * (v.length - 1);
		const i = Math.floor(f);
		const a = v[i] ?? 0;
		const val = a + ((v[i + 1] ?? a) - a) * (f - i);
		const y = Math.round((val / max) * top);
		if (fill) for (let yy = 0; yy <= y; yy++) grid.set(x, top - yy, 1);
		else grid.set(x, top - y, 2);
	}
}

function pad(text: string, width: number): string {
	const v = visibleWidth(text);
	return v >= width ? text : text + " ".repeat(width - v);
}
