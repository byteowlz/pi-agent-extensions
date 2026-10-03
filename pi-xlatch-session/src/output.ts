import { Type } from "typebox";
import { Value } from "typebox/value";
import { type ParkedContent, type ParkedItem, formatParkedContent } from "./later.js";

export const parkedItemSchema = Type.Object({
	id: Type.String(),
	label: Type.String(),
	mime_type: Type.String(),
	created_at: Type.Number(),
	preparation: Type.Optional(
		Type.Object({
			capability_id: Type.String(),
			revision: Type.String(),
			status: Type.String(),
			job_id: Type.Optional(Type.String()),
			error: Type.Optional(Type.String()),
		})
	),
});
export const parkedContentSchema = Type.Object({
	item: parkedItemSchema,
	input: Type.Object({
		text: Type.Optional(Type.String()),
		mime_type: Type.Optional(Type.String()),
		file: Type.Optional(
			Type.Object({
				name: Type.Optional(Type.String()),
				mime_type: Type.Optional(Type.String()),
				size: Type.Optional(Type.Number()),
				path: Type.Optional(Type.String()),
			})
		),
	}),
});
export const laterOutputSchema = Type.Union([
	Type.Object({
		ok: Type.Literal(true),
		action: Type.Literal("list"),
		items: Type.Array(parkedItemSchema, { maxItems: 100 }),
		total: Type.Integer(),
		truncated: Type.Boolean(),
	}),
	Type.Object({
		ok: Type.Literal(true),
		action: Type.Literal("read"),
		item: parkedItemSchema,
		text: Type.String({ maxLength: 16000 }),
		truncated: Type.Boolean(),
		destructive: Type.Literal(false),
	}),
	Type.Object({ ok: Type.Literal(true), action: Type.Literal("remove"), id: Type.String(), removed: Type.Literal(true) }),
	Type.Object({
		ok: Type.Literal(false),
		action: Type.String(),
		error: Type.Object({ code: Type.String(), message: Type.String() }),
	}),
]);
export function checkedItems(value: unknown): ParkedItem[] {
	if (!Value.Check(Type.Array(parkedItemSchema), value)) throw new Error("Invalid xlatch list JSON");
	return value as ParkedItem[];
}
export function checkedContent(value: unknown): ParkedContent {
	if (!Value.Check(parkedContentSchema, value)) throw new Error("Invalid xlatch read JSON");
	return value as ParkedContent;
}
export function itemOutput(item: ParkedItem) {
	return {
		id: item.id.slice(0, 1000),
		label: item.label.slice(0, 1000),
		mime_type: item.mime_type.slice(0, 1000),
		created_at: item.created_at,
		...(item.preparation
			? {
					preparation: {
						capability_id: item.preparation.capability_id.slice(0, 1000),
						revision: item.preparation.revision.slice(0, 1000),
						status: item.preparation.status.slice(0, 1000),
						...(item.preparation.job_id ? { job_id: item.preparation.job_id.slice(0, 1000) } : {}),
						...(item.preparation.error ? { error: item.preparation.error.slice(0, 1000) } : {}),
					},
				}
			: {}),
	};
}
export function readOutput(content: ParkedContent) {
	const text = formatParkedContent(content);
	return {
		ok: true,
		action: "read",
		item: itemOutput(content.item),
		text: text.slice(0, 16000),
		truncated: text.length > 16000,
		destructive: false,
	};
}
