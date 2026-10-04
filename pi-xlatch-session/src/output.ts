import { Type } from "typebox";
import { Value } from "typebox/value";
import { type ParkedContent, type ParkedItem, formatParkedContent } from "./later.js";
import { OUTPUT_BYTES, fitEntries, fitText, jsonBytes } from "./output-budget.js";

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
		id: item.id,
		label: fitText(item.label, 1000),
		mime_type: item.mime_type,
		created_at: item.created_at,
		...(item.preparation
			? {
					preparation: {
						capability_id: item.preparation.capability_id,
						revision: item.preparation.revision,
						status: item.preparation.status,
						...(item.preparation.job_id ? { job_id: item.preparation.job_id } : {}),
						...(item.preparation.error ? { error: fitText(item.preparation.error, 1000) } : {}),
					},
				}
			: {}),
	};
}
function itemShortened(item: ParkedItem, output: ReturnType<typeof itemOutput>): boolean {
	return item.label !== output.label || item.preparation?.error !== output.preparation?.error;
}
export function listOutput(all: ParkedItem[]) {
	const projected = all.slice(0, 100).map(itemOutput);
	const items = fitEntries(projected, { ok: true, action: "list", items: [], total: all.length, truncated: false });
	const truncated = items.length !== all.length || items.some((item, i) => itemShortened(all[i], item));
	return { ok: true, action: "list", items, total: all.length, truncated };
}
export function readOutput(content: ParkedContent) {
	const item = itemOutput(content.item);
	const envelope = { ok: true, action: "read", item, text: "", truncated: false, destructive: false };
	const available = OUTPUT_BYTES - jsonBytes(envelope);
	if (available < 0) throw new Error("xlatch identity metadata exceeds public output budget");
	const original = formatParkedContent(content);
	const text = fitText(original, Math.min(16000, available));
	return { ...envelope, text, truncated: text !== original || itemShortened(content.item, item) };
}
