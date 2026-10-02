import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export interface WidgetTodo {
	content: string;
	status: "pending" | "in_progress" | "completed" | "cancelled";
	priority: "high" | "medium" | "low";
}

export function renderWidget(todos: WidgetTodo[], theme: Theme, width: number, collapsed: boolean): string[] {
	if (!todos.length) return [];
	const bound = Math.max(0, width);
	const clip = (text: string) => truncateToWidth(text, bound);
	const active = todos.filter((t) => t.status === "in_progress" || t.status === "pending");
	const done = todos.filter((t) => t.status === "completed").length;
	const progress = active.filter((t) => t.status === "in_progress").length;
	const pending = active.length - progress;
	if (collapsed) return [clip(theme.fg("muted", collapsedSummary(todos, active, progress, pending, done, bound)))];
	const lines: string[] = [];
	if (active.length) {
		lines.push(clip(theme.fg("muted", `${todos.length} todos (${progress} in progress, ${pending} pending)`)));
		for (const todo of active.slice(0, 8)) {
			lines.push(clip(activeLine(todo, theme, bound)));
		}
		if (active.length > 8) lines.push(clip(theme.fg("dim", `  ... ${active.length - 8} more`)));
	}
	if (done) lines.push(clip(theme.fg("dim", `  ✓ ${done} todo${done === 1 ? "" : "s"} done`)));
	if (!lines.length) lines.push(clip(theme.fg("muted", `Todos: ${todos.length} cancelled`)));
	return lines;
}

function activeLine(todo: WidgetTodo, theme: Theme, width: number): string {
	const icon = todo.status === "in_progress" ? "[○]" : "[ ]";
	const priority = todo.priority === "high" ? " !" : todo.priority === "low" ? " v" : "";
	const content = truncateToWidth(todo.content.replace(/\s+/g, " ").trim(), Math.max(0, width - 6 - visibleWidth(priority)));
	const line = theme.fg(todo.status === "in_progress" ? "success" : "text", `  ${icon} ${content}`);
	return line + (priority ? theme.fg(todo.priority === "high" ? "error" : "dim", priority) : "");
}

function collapsedSummary(
	todos: WidgetTodo[],
	active: WidgetTodo[],
	progress: number,
	pending: number,
	done: number,
	width: number
): string {
	const current = active.find((t) => t.status === "in_progress") ?? active[0];
	const counts = `${progress} in progress, ${pending} pending, ${done} done`;
	if (!current) return `Todos: ${counts}, ${todos.length - done} cancelled`;
	const summary = `[${progress ? "○" : " "}] ${current.content.replace(/\s+/g, " ").trim()}`;
	const suffix = ` | ${counts}`;
	return visibleWidth(summary + suffix) <= width ? summary + suffix : summary;
}

export function createWidgetMode() {
	let override: boolean | undefined;
	return {
		collapsed: (configured: boolean) => override ?? configured,
		reset: () => {
			override = undefined;
		},
		command: (arg: string, configured: boolean): boolean => {
			if (arg === "expand") override = false;
			else if (arg === "collapse") override = true;
			else if (arg === "toggle") override = !(override ?? configured);
			else return false;
			return true;
		},
	};
}
