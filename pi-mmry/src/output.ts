import { Type } from "typebox";
import { Value } from "typebox/value";

const nullableText = Type.Union([Type.String(), Type.Null()]);
const entrySchema = Type.Object({
	memory_id: Type.String({ maxLength: 1000 }),
	content: Type.String(),
	revision: Type.Integer({ minimum: 1 }),
	scope: Type.String({ maxLength: 1000 }),
	repo: Type.Optional(nullableText),
	contested: Type.Optional(Type.Boolean()),
	removed: Type.Optional(Type.Boolean()),
	why: Type.Optional(nullableText),
	source: Type.Optional(nullableText),
	machine: Type.Optional(nullableText),
	created_at: Type.Optional(Type.String()),
	updated_at: Type.Optional(Type.String()),
	expires_at: Type.Optional(nullableText),
});
export const memoryOutputSchema = Type.Union([
	Type.Object({
		ok: Type.Literal(true),
		action: Type.Literal("search"),
		entries: Type.Array(entrySchema, { maxItems: 50 }),
		total: Type.Integer(),
		truncated: Type.Boolean(),
	}),
	Type.Object({
		ok: Type.Literal(true),
		action: Type.String({ enum: ["create", "supersede", "deprecate"] }),
		entry: entrySchema,
		truncated: Type.Boolean(),
	}),
	Type.Object({
		ok: Type.Literal(false),
		action: Type.String(),
		effects: Type.String({ enum: ["none", "possible"] }),
		error: Type.Object({ code: Type.String(), message: Type.String({ maxLength: 1600 }) }),
	}),
]);
type Entry = { memory_id: string; content: string; revision: number; scope: string; [key: string]: unknown };
function project(entry: Entry) {
	// Opaque metadata/agent_ctx/debug fields are intentionally not part of this contract.
	const output: Record<string, string | number | boolean | null> = {
		memory_id: entry.memory_id,
		content: entry.content.slice(0, 4000),
		revision: entry.revision,
		scope: entry.scope,
	};
	for (const key of ["repo", "why", "source", "machine", "created_at", "updated_at", "expires_at"]) {
		const value = entry[key];
		if (value === null || typeof value === "string") output[key] = typeof value === "string" ? value.slice(0, 1000) : null;
	}
	for (const key of ["contested", "removed"]) if (typeof entry[key] === "boolean") output[key] = entry[key];
	return output;
}
type Json = null | string | boolean | number | Json[] | { [key: string]: Json };
export function parseMemoryOutput(action: string, stdout: string): { [key: string]: Json } {
	const value: unknown = JSON.parse(stdout);
	if (action === "search") {
		if (!Value.Check(Type.Array(entrySchema), value)) throw new Error("Invalid mmry search JSON contract");
		const entries = (value as Entry[]).slice(0, 50).map(project);
		let truncated =
			value.length > 50 ||
			(value as Entry[]).some((e) =>
				Object.entries(e).some(([key, field]) => typeof field === "string" && field.length > (key === "content" ? 4000 : 1000))
			);
		while (JSON.stringify(entries).length > 16000 && entries.length) {
			entries.pop();
			truncated = true;
		}
		return { ok: true, action, entries, total: value.length, truncated };
	}
	if (!Value.Check(entrySchema, value)) throw new Error("Invalid mmry mutation JSON contract");
	const entry = project(value as Entry);
	return {
		ok: true,
		action,
		entry,
		truncated: Object.entries(value as Entry).some(
			([key, field]) => typeof field === "string" && field.length > (key === "content" ? 4000 : 1000)
		),
	};
}
