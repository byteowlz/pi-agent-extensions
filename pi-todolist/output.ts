import { Type } from "typebox";

export const TODO_OUTPUT_LIMIT = 200;
const item = Type.Object({
	id: Type.String(),
	content: Type.String({ maxLength: 4000 }),
	status: Type.String({ enum: ["pending", "in_progress", "completed", "cancelled"] }),
	priority: Type.String({ enum: ["high", "medium", "low"] }),
	created_at: Type.Optional(Type.String()),
	updated_at: Type.Optional(Type.String()),
});
export const todoOutputSchema = Type.Union([
	Type.Object({
		ok: Type.Literal(true),
		action: Type.String({ enum: ["write", "read", "add", "update", "remove", "clear"] }),
		todos: Type.Array(item, { maxItems: TODO_OUTPUT_LIMIT }),
		total: Type.Integer({ minimum: 0 }),
		truncated: Type.Boolean(),
		added: Type.Optional(item),
		updated: Type.Optional(item),
		removed: Type.Optional(item),
	}),
	Type.Object({
		ok: Type.Literal(false),
		action: Type.String(),
		error: Type.Object({ code: Type.String(), message: Type.String() }),
	}),
]);

export function todoSnapshot(todos: { id: string; content: string; status: string; priority: string }[]) {
	const snapshot = {
		todos: todos
			.slice(0, TODO_OUTPUT_LIMIT)
			.map((todo) => ({ id: todo.id, content: todo.content.slice(0, 4000), status: todo.status, priority: todo.priority })),
		total: todos.length,
		truncated: todos.length > TODO_OUTPUT_LIMIT || todos.some((todo) => todo.content.length > 4000),
	};
	while (JSON.stringify(snapshot).length > 16000 && snapshot.todos.length) {
		snapshot.todos.pop();
		snapshot.truncated = true;
	}
	return snapshot;
}
