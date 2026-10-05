import { Type } from "typebox";
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const string = Type.String({ maxLength: 4000 });
const nullableString = Type.Union([string, Type.Null()]);
const nullableNumber = Type.Union([Type.Number(), Type.Null()]);
const model = Type.Object({
	current: Type.Union([
		Type.Null(),
		Type.Object({
			id: string,
			name: string,
			provider: string,
			contextWindow: Type.Number(),
			maxTokens: Type.Number(),
			reasoning: Type.Boolean(),
			supportsThinking: Type.Optional(Type.Boolean()),
			inputTypes: Type.Array(string, { maxItems: 200 }),
			cost: Type.Object({ input: Type.Number(), output: Type.Number(), cacheRead: Type.Number(), cacheWrite: Type.Number() }),
		}),
	]),
	thinkingLevel: Type.Optional(string),
	allAvailable: Type.Array(Type.Object({ id: string, name: string, provider: string }), { maxItems: 200 }),
});
const session = Type.Object({
	title: nullableString,
	file: Type.Optional(string),
	workingDirectory: string,
	totalEntries: Type.Integer(),
	branchEntries: Type.Integer(),
	currentLeafId: nullableString,
	firstMessageDate: nullableString,
	lastMessageDate: nullableString,
	labels: Type.Array(Type.Object({ entryId: string, label: Type.Optional(string) }), { maxItems: 200 }),
});
const context = Type.Union([
	Type.Null(),
	Type.Object({ tokens: nullableNumber, contextWindow: Type.Number(), percent: nullableNumber }),
]);
const extensions = Type.Object({
	contributions: Type.Optional(
		Type.Array(
			Type.Object({
				id: Type.String({ maxLength: 64 }),
				version: Type.Literal(1),
				status: Type.Union([Type.Literal("ok"), Type.Literal("unavailable")]),
				details: Type.Record(
					Type.String({ maxLength: 64 }),
					Type.Union([
						Type.String({ maxLength: 1000 }),
						Type.Number(),
						Type.Boolean(),
						Type.Null(),
						Type.Array(Type.String({ maxLength: 1000 }), { maxItems: 64 }),
					])
				),
			}),
			{ maxItems: 16 }
		)
	),
	installed: Type.Array(Type.Object({ name: string, description: Type.Optional(string) }), { maxItems: 200 }),
	activeTools: Type.Array(string, { maxItems: 200 }),
	allTools: Type.Array(Type.Object({ name: string, description: string }), { maxItems: 200 }),
	commands: Type.Array(Type.Object({ name: string, description: Type.Optional(string) }), { maxItems: 200 }),
});
export const reflectionOutputSchema = Type.Union([
	Type.Object({ info: Type.Literal("model"), model, truncated: Type.Boolean() }),
	Type.Object({ info: Type.Literal("session"), session, truncated: Type.Boolean() }),
	Type.Object({ info: Type.Literal("context"), context, truncated: Type.Boolean() }),
	Type.Object({ info: Type.Literal("all"), model, session, context, extensions, truncated: Type.Boolean() }),
]);

/** Bounded allowlisted collector output. Omit undefined; never serialize registry credentials. */
export function boundReflection(value: Record<string, unknown>) {
	let truncated = false;
	const arrays: JsonValue[][] = [];
	function visit(input: unknown): JsonValue | undefined {
		if (input === undefined) return undefined;
		if (input === null || typeof input === "boolean") return input;
		if (typeof input === "number") return Number.isFinite(input) ? input : null;
		if (typeof input === "string") {
			if (input.length > 4000) truncated = true;
			return input.slice(0, 4000);
		}
		if (Array.isArray(input)) {
			if (input.length > 200) truncated = true;
			const array = input.slice(0, 200).map((item) => visit(item) ?? null);
			arrays.push(array);
			return array;
		}
		const result: Record<string, JsonValue> = {};
		if (typeof input === "object")
			for (const [key, item] of Object.entries(input)) {
				const safe = visit(item);
				if (safe !== undefined) result[key] = safe;
			}
		return result;
	}
	const result = visit(value) as Record<string, JsonValue>;
	while (JSON.stringify(result).length > 32000) {
		const largest = arrays.filter((array) => array.length).sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0];
		if (!largest) break;
		largest.pop();
		truncated = true;
	}
	return { ...result, truncated };
}
