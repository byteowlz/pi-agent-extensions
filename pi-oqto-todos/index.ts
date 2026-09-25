/**
 * Oqto Todos Extension for Pi
 *
 * Provides a single unified `Todo` tool that integrates with Oqto's frontend
 * todo panel. It supports write/read/add/update/remove/clear actions so the
 * whole todo lifecycle lives under one tool.
 *
 * The tool outputs todos in a format that Oqto's frontend parses and displays
 * in the right sidebar panel, matching the expected TodoItem structure.
 *
 * Todo format:
 * {
 *   id: string,
 *   content: string,
 *   status: "pending" | "in_progress" | "completed" | "cancelled",
 *   priority: "high" | "medium" | "low"
 * }
 */

import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

// ============================================================================
// Types
// ============================================================================

type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";
type TodoPriority = "high" | "medium" | "low";

interface TodoItem {
	id: string;
	content: string;
	status: TodoStatus;
	priority: TodoPriority;
}

interface TodoStore {
	todos: TodoItem[];
	updated_at: string;
}

interface OqtoTodosConfig {
	enabled: boolean;
	debug: boolean;
	storagePath?: string;
	sessionScoped: boolean;
	tuiWidget: boolean;
	/** After context compaction, inject the current todo list into the LLM context so the model keeps using it. */
	preserveInCompaction: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const CONFIG_FILENAME = "oqto-todos.json";
const TODOS_FILENAME = "todos.json";

const DEFAULT_CONFIG: OqtoTodosConfig = {
	enabled: true,
	debug: false,
	sessionScoped: true,
	tuiWidget: true,
	preserveInCompaction: true,
};

const TODO_STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;
const TODO_PRIORITIES = ["high", "medium", "low"] as const;

// ============================================================================
// Tool Parameters
// ============================================================================

const TodoParams = Type.Object({
	action: StringEnum(["write", "read", "add", "update", "remove", "clear"] as const),

	// write: complete list replacement
	todos: Type.Optional(
		Type.Array(
			Type.Object({
				id: Type.Optional(Type.String({ description: "Unique identifier (auto-generated if not provided)" })),
				content: Type.String({ description: "Task description" }),
				status: Type.Optional(StringEnum(TODO_STATUSES, { description: "Task status (default: pending)" })),
				priority: Type.Optional(StringEnum(TODO_PRIORITIES, { description: "Task priority (default: medium)" })),
			}),
			{ description: "Complete list of todos (replaces existing list, for action 'write')" }
		)
	),

	// read: optional filtering
	filter: Type.Optional(
		Type.Object({
			status: Type.Optional(StringEnum(TODO_STATUSES, { description: "Filter by status" })),
			priority: Type.Optional(StringEnum(TODO_PRIORITIES, { description: "Filter by priority" })),
		})
	),

	// add: new todo content
	content: Type.Optional(Type.String({ description: "Task description (for add)" })),

	// add/update
	status: Type.Optional(StringEnum(TODO_STATUSES)),
	priority: Type.Optional(StringEnum(TODO_PRIORITIES)),

	// update/remove
	id: Type.Optional(Type.String({ description: "Todo ID (for update/remove)" })),
});

// ============================================================================
// Config Loading
// ============================================================================

function loadConfig(cwd: string): OqtoTodosConfig {
	const paths = [join(cwd, CONFIG_FILENAME), join(cwd, ".pi", CONFIG_FILENAME), join(homedir(), ".pi", "agent", CONFIG_FILENAME)];

	for (const configPath of paths) {
		if (existsSync(configPath)) {
			try {
				const content = readFileSync(configPath, "utf-8");
				const userConfig = JSON.parse(content) as Partial<OqtoTodosConfig>;
				return { ...DEFAULT_CONFIG, ...userConfig };
			} catch {
				// Invalid JSON, continue to next path
			}
		}
	}

	return DEFAULT_CONFIG;
}

// ============================================================================
// Todo Storage
// ============================================================================

function getTodosDir(cwd: string, config: OqtoTodosConfig): string {
	if (config.storagePath) {
		if (config.storagePath.startsWith("~")) {
			return join(homedir(), config.storagePath.slice(1));
		}
		return config.storagePath;
	}
	return join(cwd, ".pi", "todos");
}

function getTodosPath(cwd: string, config: OqtoTodosConfig, sessionId?: string): string {
	const dir = getTodosDir(cwd, config);
	if (config.sessionScoped && sessionId) {
		return join(dir, `${sessionId}.json`);
	}
	return join(dir, TODOS_FILENAME);
}

function ensureTodosDir(cwd: string, config: OqtoTodosConfig): void {
	const dir = getTodosDir(cwd, config);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

function loadTodos(cwd: string, config: OqtoTodosConfig, sessionId?: string): TodoStore {
	const path = getTodosPath(cwd, config, sessionId);

	if (!existsSync(path)) {
		return { todos: [], updated_at: new Date().toISOString() };
	}

	try {
		const content = readFileSync(path, "utf-8");
		const store = JSON.parse(content) as TodoStore;
		return store;
	} catch {
		return { todos: [], updated_at: new Date().toISOString() };
	}
}

function saveTodos(cwd: string, config: OqtoTodosConfig, todos: TodoItem[], sessionId?: string): void {
	ensureTodosDir(cwd, config);
	const path = getTodosPath(cwd, config, sessionId);
	const store: TodoStore = {
		todos,
		updated_at: new Date().toISOString(),
	};
	writeFileSync(path, JSON.stringify(store, null, 2), "utf-8");
}

function generateTodoId(): string {
	return crypto.randomBytes(4).toString("hex");
}

function normalizeTodo(todo: Partial<TodoItem> & { content: string }): TodoItem {
	return {
		id: todo.id || generateTodoId(),
		content: todo.content,
		status: todo.status || "pending",
		priority: todo.priority || "medium",
	};
}

// ============================================================================
// Session ID Helper
// ============================================================================

function getSessionId(ctx: ExtensionContext): string | undefined {
	const manager = ctx.sessionManager as { getSessionId?: () => string };
	return manager.getSessionId?.();
}

// ============================================================================
// Rendering
// ============================================================================

// RenderContext removed - not used

function getStatusIcon(status: TodoStatus): string {
	switch (status) {
		case "completed":
			return "[x]";
		case "in_progress":
			return "[○]";
		case "cancelled":
			return "[-]";
		default:
			return "[ ]";
	}
}

function getPriorityLabel(priority: TodoPriority): string {
	switch (priority) {
		case "high":
			return "!";
		case "low":
			return "v";
		default:
			return "";
	}
}

function normalizeTodoText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function buildSummaryLine(todos: TodoItem[], theme: Theme): string {
	const counts: Record<string, number> = {};
	for (const t of todos) {
		counts[t.status] = (counts[t.status] || 0) + 1;
	}
	const labels: [string, string][] = [
		["in_progress", "in progress"],
		["pending", "pending"],
		["completed", "done"],
		["cancelled", "cancelled"],
	];
	const parts = labels.filter(([key]) => counts[key] > 0).map(([key, label]) => `${counts[key]} ${label}`);
	return theme.fg("muted", `${todos.length} todos (${parts.join(", ")})`);
}

function getStatusColor(status: TodoStatus): ThemeColor {
	if (status === "in_progress") return "success";
	if (status === "completed" || status === "cancelled") return "dim";
	return "text";
}

function renderTodoLine(todo: TodoItem, theme: Theme, maxWidth: number): string {
	const icon = getStatusIcon(todo.status);
	const priorityLabel = getPriorityLabel(todo.priority);
	const contentPreview = truncateToWidth(normalizeTodoText(todo.content), maxWidth);
	let line = theme.fg(getStatusColor(todo.status), `${icon} ${contentPreview}`);
	if (priorityLabel) {
		const priorityColor = todo.priority === "high" ? "error" : "dim";
		line += ` ${theme.fg(priorityColor, priorityLabel)}`;
	}
	return line;
}

function orderTodos(todos: TodoItem[]): TodoItem[] {
	const inProgress = todos.filter((t) => t.status === "in_progress");
	const pending = todos.filter((t) => t.status === "pending");
	const completed = todos.filter((t) => t.status === "completed");
	const cancelled = todos.filter((t) => t.status === "cancelled");
	return [...inProgress, ...pending, ...completed, ...cancelled];
}

/**
 * Render the todo list as plain text for embedding in the LLM context after compaction.
 * Ordered by status so the model sees the most actionable items first.
 */
function formatTodosForSummary(todos: TodoItem[]): string {
	if (todos.length === 0) return "(no todos)";

	const lines = orderTodos(todos).map((t) => {
		const marker =
			t.status === "in_progress" ? "[->]" : t.status === "completed" ? "[x]" : t.status === "cancelled" ? "[-]" : "[ ]";
		const priority = t.priority !== "medium" ? ` (${t.priority} priority)` : "";
		return `- ${marker} ${t.content}${priority}`;
	});

	return lines.join("\n");
}

function renderTodoList(todos: TodoItem[], theme: Theme, expanded: boolean): string {
	if (todos.length === 0) {
		return theme.fg("muted", "No todos");
	}

	const lines: string[] = [];
	const maxItems = expanded ? 20 : 5;
	const maxWidth = expanded ? 120 : 80;

	lines.push(buildSummaryLine(todos, theme));
	lines.push("");

	const allOrdered = orderTodos(todos);
	const displayTodos = expanded ? allOrdered : allOrdered.slice(0, maxItems);

	for (const todo of displayTodos) {
		lines.push(renderTodoLine(todo, theme, maxWidth));
	}

	if (!expanded && allOrdered.length > maxItems) {
		lines.push(theme.fg("dim", `  ... ${allOrdered.length - maxItems} more`));
	}

	return lines.join("\n");
}

// ============================================================================
// Extension Entry Point
// ============================================================================

export default function oqtoTodosExtension(pi: ExtensionAPI) {
	// Store reference to current todos for rendering and the TUI widget
	let _currentTodos: TodoItem[] = [];

	// ==========================================================================
	// TUI Widget - persistent todo display above the editor
	// ==========================================================================

	const WIDGET_KEY = "oqto-todos";

	/**
	 * Build the widget lines for the current todos.
	 */
	function renderWidgetTodoLine(todo: TodoItem, theme: Theme, effectiveWidth: number): string {
		const icon = getStatusIcon(todo.status);
		const priorityLabel = getPriorityLabel(todo.priority);
		const reservedSuffix = priorityLabel ? 8 : 6;
		const contentWidth = Math.max(8, effectiveWidth - reservedSuffix);
		const contentPreview = truncateToWidth(normalizeTodoText(todo.content), contentWidth);

		let line = theme.fg(getStatusColor(todo.status), `  ${icon} ${contentPreview}`);
		if (priorityLabel) {
			const priorityColor = todo.priority === "high" ? "error" : "dim";
			line += ` ${theme.fg(priorityColor, priorityLabel)}`;
		}
		return truncateToWidth(line, effectiveWidth);
	}

	function buildWidgetLines(todos: TodoItem[], theme: Theme, width?: number): string[] {
		// In rare cases width may be undefined/0 during render transitions.
		const effectiveWidth = width && width > 0 ? width : 35;
		const maxWidgetItems = 8;

		const lines: string[] = [];
		lines.push(truncateToWidth(buildSummaryLine(todos, theme).replace(/^\d+ todos/, "Todos:"), effectiveWidth));

		const active = todos.filter((t) => t.status === "in_progress" || t.status === "pending");
		const displayItems = active.slice(0, maxWidgetItems);
		for (const todo of displayItems) {
			lines.push(renderWidgetTodoLine(todo, theme, effectiveWidth));
		}
		if (active.length > maxWidgetItems) {
			lines.push(truncateToWidth(theme.fg("dim", `  ... ${active.length - maxWidgetItems} more`), effectiveWidth));
		}

		return lines;
	}

	/**
	 * Update the persistent TUI widget showing current todos.
	 * Called after every tool execution and session event.
	 *
	 * Wrapped in try/catch to prevent TUI errors (e.g. when Pi runs in
	 * --mode rpc with no real TUI backend) from crashing the process.
	 */
	function updateWidget(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;

		try {
			const config = loadConfig(ctx.cwd);
			if (!config.enabled || !config.tuiWidget || _currentTodos.length === 0) {
				ctx.ui.setWidget(WIDGET_KEY, undefined);
				return;
			}

			ctx.ui.setWidget(WIDGET_KEY, (_tui, theme) => {
				try {
					return {
						render: (width: number) => {
							try {
								return buildWidgetLines(_currentTodos, theme, width);
							} catch {
								return ["[todo render error]"];
							}
						},
						// biome-ignore lint/suspicious/noEmptyBlockStatements: widget is rebuilt on each update
						invalidate: () => {},
					};
				} catch {
					// Return a safe fallback widget if building lines fails
					return {
						render: () => ["[todo widget error]"],
						// biome-ignore lint/suspicious/noEmptyBlockStatements: fallback widget
						invalidate: () => {},
					};
				}
			});
		} catch {
			// setWidget itself failed -- TUI not available or in bad state.
			// Silently ignore; the extension continues to work for tool I/O.
		}
	}

	/**
	 * Reconstruct todos from file storage on session events.
	 * Fully wrapped in try/catch -- a failure here must never crash Pi.
	 */
	function reconstructTodos(ctx: ExtensionContext): void {
		try {
			const config = loadConfig(ctx.cwd);
			if (!config.enabled) {
				_currentTodos = [];
				updateWidget(ctx);
				return;
			}

			const sessionId = getSessionId(ctx);
			const store = loadTodos(ctx.cwd, config, sessionId);
			_currentTodos = store.todos;
			updateWidget(ctx);
		} catch (e) {
			// Log but never propagate -- extension errors must not crash the host.
			console.error("[oqto-todos] reconstructTodos failed:", e);
		}
	}

	// ==========================================================================
	// Session event handlers - reconstruct state and update widget
	// ==========================================================================

	// Session event handlers are individually wrapped so one failure does not
	// prevent the others from registering or executing.
	pi.on("session_start", async (_event, ctx) => {
		try {
			reconstructTodos(ctx);
		} catch (e) {
			console.error("[oqto-todos] session_start handler error:", e);
		}
	});
	pi.on("session_tree", async (_event, ctx) => {
		try {
			reconstructTodos(ctx);
		} catch (e) {
			console.error("[oqto-todos] session_tree handler error:", e);
		}
	});

	// ==========================================================================
	// Compaction - after pi compacts the session, inject the current todos into
	// the LLM context (as a custom_message entry) so the model keeps using the
	// todo tools. Uses the after-compaction hook so we never re-run or replace
	// pi's own summarizer - no extra LLM call, no API key, no touching the
	// compaction summary itself.
	// ==========================================================================
	pi.on("session_compact", (_event, ctx) => {
		try {
			const config = loadConfig(ctx.cwd);
			if (!config.enabled || !config.preserveInCompaction) return;

			const sessionId = getSessionId(ctx);
			const store = loadTodos(ctx.cwd, config, sessionId);
			if (store.todos.length === 0) return;

			const todosText = formatTodosForSummary(store.todos);
			const content = `## Active To-Do List\n${todosText}\n\nKeep using the Todo tool to track and update this list as you work.`;

			// triggerTurn: false appends the message to the session and the LLM
			// context without starting a new turn.
			pi.sendMessage(
				{
					customType: "oqto-todos",
					content,
					display: true,
				},
				{ triggerTurn: false }
			);
		} catch (e) {
			console.error("[oqto-todos] session_compact handler error:", e);
		}
	});

	// ==========================================================================
	// Todo - Unified tool for all todo operations
	// ==========================================================================
	//
	// Per-action helpers are extracted to keep the execute switch small and under
	// the repo's cognitive-complexity limit.
	// ==========================================================================

	function todoError(action: string, message: string) {
		return {
			content: [{ type: "text" as const, text: `Error: ${message}` }],
			details: { action, error: message },
		};
	}

	function todoSaveAndReturn(
		todos: TodoItem[],
		action: string,
		extra: { added?: TodoItem; updated?: TodoItem; removed?: TodoItem },
		config: OqtoTodosConfig,
		sessionId: string | undefined,
		ctx: ExtensionContext
	) {
		saveTodos(ctx.cwd, config, todos, sessionId);
		_currentTodos = todos;
		updateWidget(ctx);
		return {
			content: [{ type: "text" as const, text: JSON.stringify({ todos }, null, 2) }],
			details: { action, todos, ...extra },
		};
	}

	function todoActionWrite(
		params: Array<{ id?: string; content: string; status?: TodoStatus; priority?: TodoPriority }> | undefined,
		config: OqtoTodosConfig,
		sessionId: string | undefined,
		ctx: ExtensionContext
	) {
		const next = (params || []).map((t) => normalizeTodo(t));
		return todoSaveAndReturn(next, "write", {}, config, sessionId, ctx);
	}

	function todoActionAdd(
		todos: TodoItem[],
		params: { content?: string; status?: TodoStatus; priority?: TodoPriority },
		config: OqtoTodosConfig,
		sessionId: string | undefined,
		ctx: ExtensionContext
	) {
		if (!params.content) return todoError("add", "content required");
		const newTodo = normalizeTodo({ content: params.content, status: params.status, priority: params.priority });
		return todoSaveAndReturn([...todos, newTodo], "add", { added: newTodo }, config, sessionId, ctx);
	}

	function todoActionUpdate(
		todos: TodoItem[],
		params: { id?: string; content?: string; status?: TodoStatus; priority?: TodoPriority },
		config: OqtoTodosConfig,
		sessionId: string | undefined,
		ctx: ExtensionContext
	) {
		if (!params.id) return todoError("update", "id required");
		const index = todos.findIndex((t) => t.id === params.id);
		if (index === -1) return todoError("update", `todo ${params.id} not found`);
		const updated: TodoItem = {
			...todos[index],
			...(params.content !== undefined && { content: params.content }),
			...(params.status !== undefined && { status: params.status }),
			...(params.priority !== undefined && { priority: params.priority }),
		};
		const next = [...todos];
		next[index] = updated;
		return todoSaveAndReturn(next, "update", { updated }, config, sessionId, ctx);
	}

	function todoActionRemove(
		todos: TodoItem[],
		params: { id?: string },
		config: OqtoTodosConfig,
		sessionId: string | undefined,
		ctx: ExtensionContext
	) {
		if (!params.id) return todoError("remove", "id required");
		const index = todos.findIndex((t) => t.id === params.id);
		if (index === -1) return todoError("remove", `todo ${params.id} not found`);
		const next = [...todos];
		const removed = next.splice(index, 1)[0];
		return todoSaveAndReturn(next, "remove", { removed }, config, sessionId, ctx);
	}

	function todoActionClear(config: OqtoTodosConfig, sessionId: string | undefined, ctx: ExtensionContext) {
		return todoSaveAndReturn([], "clear", {}, config, sessionId, ctx);
	}

	function todoActionRead(
		todos: TodoItem[],
		params: { filter?: { status?: TodoStatus; priority?: TodoPriority } },
		config: OqtoTodosConfig,
		sessionId: string | undefined,
		ctx: ExtensionContext
	) {
		let next = todos;
		if (params.filter) {
			if (params.filter.status) next = next.filter((t) => t.status === params.filter?.status);
			if (params.filter.priority) next = next.filter((t) => t.priority === params.filter?.priority);
		}
		return todoSaveAndReturn(next, "read", {}, config, sessionId, ctx);
	}

	pi.registerTool({
		name: "Todo",
		label: "Todo",
		description:
			"Unified todo management: write, read, add, update, remove, or clear todos. " +
			"Actions: write (replace the entire list), read (list, optionally filtered), " +
			"add (new todo), update (modify an existing todo by id), remove (delete by id), " +
			"clear (empty the list). Todos are displayed in the Oqto frontend panel.\n\n" +
			"IMPORTANT: Always update todo status as you work. Set tasks to 'in_progress' when starting " +
			"and 'completed' when done. The user relies on this panel to see your progress.",
		parameters: TodoParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const config = loadConfig(ctx.cwd);
			if (!config.enabled) {
				return {
					content: [{ type: "text", text: "Todos extension is disabled" }],
					details: { action: params.action, error: "disabled" },
				};
			}

			const sessionId = getSessionId(ctx);
			const store = loadTodos(ctx.cwd, config, sessionId);
			const todos = [...store.todos];

			switch (params.action) {
				case "write":
					return todoActionWrite(params.todos, config, sessionId, ctx);
				case "add":
					return todoActionAdd(todos, params, config, sessionId, ctx);
				case "update":
					return todoActionUpdate(todos, params, config, sessionId, ctx);
				case "remove":
					return todoActionRemove(todos, params, config, sessionId, ctx);
				case "clear":
					return todoActionClear(config, sessionId, ctx);
				default:
					return todoActionRead(todos, params, config, sessionId, ctx);
			}
		},

		renderCall(args, theme) {
			try {
				const action = (args.action as string) || "read";
				const id = args.id as string | undefined;
				const content = args.content as string | undefined;

				let text = theme.fg("toolTitle", theme.bold("Todo ")) + theme.fg("accent", action);
				if (id) text += ` ${theme.fg("dim", id)}`;
				if (content) text += ` ${theme.fg("muted", `"${content.slice(0, 30)}${content.length > 30 ? "..." : ""}"`)}`;

				return new Text(text, 0, 0);
			} catch {
				return new Text("Todo", 0, 0);
			}
		},

		renderResult(result, { expanded }, theme) {
			try {
				const details = result.details as
					| {
							action?: string;
							todos?: TodoItem[];
							added?: TodoItem;
							updated?: TodoItem;
							removed?: TodoItem;
							error?: string;
					  }
					| undefined;

				if (details?.error) {
					return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
				}

				const todos = details?.todos || [];
				let prefix = "";

				if (details?.action === "add" && details.added) {
					prefix = `${theme.fg("success", "OK Added: ")}${theme.fg("text", details.added.content)}\n\n`;
				} else if (details?.action === "update" && details.updated) {
					prefix = `${theme.fg("success", "OK Updated: ")}${theme.fg("text", details.updated.content)}\n\n`;
				} else if (details?.action === "remove" && details.removed) {
					prefix = `${theme.fg("success", "OK Removed: ")}${theme.fg("dim", details.removed.content)}\n\n`;
				} else if (details?.action === "clear") {
					prefix = `${theme.fg("success", "OK Cleared todo list")}\n\n`;
				} else if (details?.action === "write") {
					prefix = `${theme.fg("success", `OK Wrote ${todos.length} todos`)}\n\n`;
				}

				return new Text(prefix + renderTodoList(todos, theme, expanded), 0, 0);
			} catch {
				return new Text("(render error)", 0, 0);
			}
		},
	});
	// ==========================================================================
	// /todos command - Show todos in UI
	// ==========================================================================
	pi.registerCommand("todos", {
		description: "Show current todos",
		handler: async (_args, ctx) => {
			try {
				const config = loadConfig(ctx.cwd);
				const sessionId = getSessionId(ctx);
				const store = loadTodos(ctx.cwd, config, sessionId);

				if (!ctx.hasUI) {
					console.log(JSON.stringify(store.todos, null, 2));
					return;
				}

				if (store.todos.length === 0) {
					ctx.ui.notify("No todos", "info");
					return;
				}

				const summary = {
					pending: store.todos.filter((t) => t.status === "pending").length,
					in_progress: store.todos.filter((t) => t.status === "in_progress").length,
					completed: store.todos.filter((t) => t.status === "completed").length,
					cancelled: store.todos.filter((t) => t.status === "cancelled").length,
				};

				ctx.ui.notify(
					`${store.todos.length} todos: ${summary.in_progress} in progress, ${summary.pending} pending, ${summary.completed} done`,
					"info"
				);
			} catch (e) {
				console.error("[oqto-todos] /todos command error:", e);
			}
		},
	});

	// ==========================================================================
	// /todo command - Interactive todo manipulation
	// ==========================================================================
	pi.registerCommand("todo", {
		description: "Interactively list, add, start, complete, cancel, edit, delete, or clear todos",
		handler: async (_args, ctx) => {
			try {
				const config = loadConfig(ctx.cwd);
				const sessionId = getSessionId(ctx);
				const ui = ctx.ui;

				if (!ctx.hasUI) {
					const store = loadTodos(ctx.cwd, config, sessionId);
					console.log(JSON.stringify(store.todos, null, 2));
					return;
				}

				const refresh = (): TodoItem[] => loadTodos(ctx.cwd, config, sessionId).todos;

				const commit = (next: TodoItem[]): void => {
					saveTodos(ctx.cwd, config, next, sessionId);
					_currentTodos = next;
					updateWidget(ctx);
				};

				const pickTodo = async (list: TodoItem[], title: string): Promise<number> => {
					if (list.length === 0) {
						ui.notify("No todos yet", "warning");
						return -1;
					}
					const options = list.map(
						(t, i) =>
							`${i + 1}. ${getStatusIcon(t.status)} ${t.content}${getPriorityLabel(t.priority) ? `[${getPriorityLabel(t.priority)}]` : ""}`
					);
					const choice = await ui.select(title, options);
					if (!choice) return -1;
					const n = Number.parseInt(choice.split(".")[0], 10);
					return Number.isNaN(n) ? -1 : n - 1;
				};

				const actionAdd = async (): Promise<void> => {
					const content = await ui.input("New todo", "e.g. Write the README");
					if (!content) return;
					const priority = (await ui.select("Priority", ["medium", "high", "low"])) as TodoPriority | undefined;
					const t = normalizeTodo({ content, status: "pending", priority: priority || "medium" });
					commit([...refresh(), t]);
					ui.notify(`Added: ${t.content}`, "info");
				};

				const actionStart = async (): Promise<void> => {
					const list = refresh();
					const i = await pickTodo(list, "Start which todo?");
					if (i < 0) return;
					commit(list.map((t, idx) => (idx === i ? { ...t, status: "in_progress" } : t)));
					ui.notify(`Started: ${list[i].content}`, "info");
				};

				const actionComplete = async (): Promise<void> => {
					const list = refresh();
					const i = await pickTodo(list, "Complete which todo?");
					if (i < 0) return;
					commit(list.map((t, idx) => (idx === i ? { ...t, status: "completed" } : t)));
					ui.notify(`Completed: ${list[i].content}`, "info");
				};

				const actionCancel = async (): Promise<void> => {
					const list = refresh();
					const i = await pickTodo(list, "Cancel which todo?");
					if (i < 0) return;
					commit(list.map((t, idx) => (idx === i ? { ...t, status: "cancelled" } : t)));
					ui.notify(`Cancelled: ${list[i].content}`, "info");
				};

				const actionEdit = async (): Promise<void> => {
					const list = refresh();
					const i = await pickTodo(list, "Edit which todo?");
					if (i < 0) return;
					const content = await ui.input("New content", list[i].content);
					if (content === undefined) return;
					commit(list.map((t, idx) => (idx === i ? { ...t, content } : t)));
					ui.notify(`Updated: ${content}`, "info");
				};

				const actionDelete = async (): Promise<void> => {
					const list = refresh();
					const i = await pickTodo(list, "Delete which todo?");
					if (i < 0) return;
					const ok = await ui.confirm("Delete todo", `Delete \"${list[i].content}\"?`);
					if (!ok) return;
					commit(list.filter((_, idx) => idx !== i));
					ui.notify(`Deleted: ${list[i].content}`, "info");
				};

				const actionClear = async (): Promise<void> => {
					const count = refresh().length;
					if (count === 0) {
						ui.notify("No todos to clear", "warning");
						return;
					}
					const ok = await ui.confirm("Clear all", `Delete all ${count} todos?`);
					if (!ok) return;
					commit([]);
					ui.notify("Cleared all todos", "info");
				};

				const dispatch = async (action: string): Promise<void> => {
					switch (action) {
						case "Add":
							return actionAdd();
						case "Start":
							return actionStart();
						case "Complete":
							return actionComplete();
						case "Cancel":
							return actionCancel();
						case "Edit":
							return actionEdit();
						case "Delete":
							return actionDelete();
						case "Clear":
							return actionClear();
						default:
							return;
					}
				};

				while (true) {
					const choice = await ui.select("Todo", ["Add", "Start", "Complete", "Cancel", "Edit", "Delete", "Clear", "Done"]);
					if (!choice || choice === "Done") return;
					await dispatch(choice);
				}
			} catch (e) {
				console.error("[oqto-todos] /todo command error:", e);
			}
		},
	});
}
