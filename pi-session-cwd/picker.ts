/**
 * Fuzzy single-select picker for `/move` (and the disjoint "which project did
 * you mean?" question). Mirrors the feel of the `/auto-rename model` and `/ctx`
 * pickers: type to filter, arrows to move, enter to choose, escape to cancel.
 */

import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

import type { Project } from "./projects.js";

export interface PickRow extends Project {
	/** Extra context, e.g. "current" or "has sessions". */
	note?: string;
}

export interface PickerOptions {
	title: string;
	rows: PickRow[];
	/** Pre-filled query, so `/move fox` opens already filtered. */
	initialQuery?: string;
	/** Rendered under the list. */
	hint?: string;
}

function scoreQuery(query: string, row: PickRow): number {
	const q = query.trim().toLowerCase();
	if (!q) return 1;
	const name = row.name.toLowerCase();
	if (name.startsWith(q)) return 1000 - name.length;
	const index = name.indexOf(q);
	if (index !== -1) return 800 - index;
	const path = row.path.toLowerCase();
	if (path.includes(q)) return 600;
	// subsequence on the name
	let qi = 0;
	for (let i = 0; i < name.length && qi < q.length; i++) if (name[i] === q[qi]) qi++;
	return qi === q.length ? 400 : 0;
}

/** Printable characters from an input chunk (drops control sequences). */
function printable(data: string): string {
	let out = "";
	for (const ch of data) {
		const code = ch.charCodeAt(0);
		if (code >= 0x20 && code !== 0x7f) out += ch;
	}
	return out;
}

export function visibleRows(rows: PickRow[], query: string): PickRow[] {
	if (!query.trim()) return rows;
	return rows
		.map((row) => ({ row, score: scoreQuery(query, row) }))
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score || a.row.path.localeCompare(b.row.path))
		.map((entry) => entry.row);
}

/** Render the picker's text output for a given width (exported for tests). */
export function renderPicker(
	rows: PickRow[],
	query: string,
	selected: number,
	width: number,
	options: PickerOptions,
	theme: { fg: (color: string, text: string) => string }
): string[] {
	const rw = Math.max(1, width);
	const list = visibleRows(rows, query);
	const lines: string[] = [];
	lines.push(theme.fg("accent", "─".repeat(rw)));
	lines.push(` ${theme.fg("accent", options.title)}`);
	lines.push("");
	lines.push(` ${theme.fg("muted", "filter:")} ${query || theme.fg("dim", "(type to filter)")}`);
	lines.push("");
	if (list.length === 0) {
		lines.push(` ${theme.fg("warning", "no project matches")}`);
	} else {
		const start = Math.max(0, Math.min(selected - 6, list.length - 12));
		const slice = list.slice(start, start + 12);
		for (let i = 0; i < slice.length; i++) {
			const row = slice[i] as PickRow;
			const active = start + i === selected;
			const name = active ? theme.fg("accent", row.name) : row.name;
			const note = row.note ? theme.fg("muted", ` ${row.note}`) : "";
			const path = theme.fg("dim", row.path);
			lines.push(` ${active ? theme.fg("accent", "›") : " "} ${name}${note}  ${path}`);
		}
		if (list.length > slice.length) {
			lines.push(theme.fg("dim", `   … ${list.length - slice.length} more`));
		}
	}
	lines.push("");
	lines.push(theme.fg("muted", options.hint ?? " ↑↓ move · enter select · esc cancel · type to filter"));
	lines.push(theme.fg("accent", "─".repeat(rw)));
	return lines.map((line) => truncateToWidth(line, rw));
}

/**
 * Ask the user to pick one project. Returns undefined when cancelled, so callers
 * can treat "escape" as "do nothing".
 */
export async function pickProject(
	// Structural subset of pi's UI context; keeps this module free of pi internals.
	ui: { custom: <T>(factory: unknown) => Promise<T> },
	options: PickerOptions
): Promise<PickRow | undefined> {
	const factory = (
		tui: { requestRender: () => void },
		theme: { fg: (c: string, t: string) => string },
		_kb: unknown,
		done: (value: PickRow | undefined) => void
	) => {
		let query = options.initialQuery ?? "";
		let selected = 0;
		let cached: string[] | undefined;

		const refresh = (): void => {
			cached = undefined;
			tui.requestRender();
		};
		const clampSelected = (): void => {
			const count = visibleRows(options.rows, query).length;
			if (count === 0) selected = 0;
			else if (selected >= count) selected = count - 1;
		};

		return {
			render: (width: number): string[] => {
				if (cached) return cached;
				clampSelected();
				cached = renderPicker(options.rows, query, selected, width, options, theme);
				return cached;
			},
			invalidate: (): void => {
				cached = undefined;
			},
			handleInput: (data: string): void => {
				const list = (): PickRow[] => visibleRows(options.rows, query);
				if (matchesKey(data, Key.escape)) {
					done(undefined);
					return;
				}
				if (matchesKey(data, Key.enter)) {
					done(list()[selected]);
					return;
				}
				if (matchesKey(data, Key.up) || matchesKey(data, Key.down) || matchesKey(data, Key.tab)) {
					const count = list().length;
					if (count > 0) {
						const step = matchesKey(data, Key.up) ? -1 : 1;
						selected = (selected + step + count) % count;
					}
					refresh();
					return;
				}
				if (matchesKey(data, Key.backspace)) {
					query = query.slice(0, -1);
					selected = 0;
					refresh();
					return;
				}
				const typed = printable(data);
				if (typed) {
					query += typed;
					selected = 0;
					refresh();
				}
			},
		};
	};
	return ui.custom<PickRow | undefined>(factory);
}
