import { Type } from "typebox";

const id = Type.String({
	minLength: 1,
	maxLength: 128,
	pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$",
	description: "Stable identifier; never constructor, prototype or __proto__.",
});
const title = Type.String({ minLength: 1, maxLength: 240, pattern: "\\S" });
const description = Type.Optional(Type.String({ maxLength: 10000 }));
const bound = () => Type.Optional(Type.Integer({ minimum: 0, maximum: 100000 }));
const note = Type.Optional(
	Type.Object(
		{ label: Type.Optional(Type.String({ maxLength: 240 })), maxLength: bound(), multiline: Type.Optional(Type.Boolean()) },
		{ additionalProperties: false }
	)
);
const choice = Type.Object(
	{ id, label: title, description, recommended: Type.Optional(Type.Boolean()) },
	{ additionalProperties: false }
);
const options = Type.Array(choice, { minItems: 1, maxItems: 1000 });
const questionCommon = {
	id,
	title: Type.String({
		minLength: 1,
		maxLength: 240,
		pattern: "\\S",
		description: "Question/prompt displayed to the user. Use title, NOT text or question.",
	}),
	header: Type.Optional(Type.String({ maxLength: 40 })),
	description,
	groupId: Type.Optional(id),
	required: Type.Optional(Type.Boolean()),
	note,
};
const question = Type.Union([
	Type.Object(
		{
			...questionCommon,
			kind: Type.String({
				enum: ["single", "multiple"],
				description: "Choice question: options is required; option captions use label.",
			}),
			options,
			allowOther: Type.Optional(Type.Boolean()),
			minSelections: bound(),
			maxSelections: bound(),
			maxLength: bound(),
			multiline: Type.Optional(Type.Boolean()),
		},
		{ additionalProperties: false }
	),
	Type.Object(
		{
			...questionCommon,
			kind: Type.Literal("text", { description: "Free-text question: no options or selection bounds." }),
			allowOther: Type.Optional(Type.Literal(false)),
			maxLength: bound(),
			multiline: Type.Optional(Type.Boolean()),
		},
		{ additionalProperties: false }
	),
]);
const common = {
	version: Type.Literal(1),
	title,
	description,
	groups: Type.Optional(Type.Array(Type.Object({ id, title }, { additionalProperties: false }), { maxItems: 1000 })),
};
/** Public tool discovery shape; semantic/dynamic constraints remain in normalizeSpec. */
export const selectionSpecSchema = Type.Union(
	[
		Type.Object(
			{ ...common, mode: Type.Literal("questions"), questions: Type.Array(question, { minItems: 1, maxItems: 1000 }) },
			{ additionalProperties: false }
		),
		Type.Object(
			{
				...common,
				mode: Type.Literal("review"),
				items: Type.Array(
					Type.Object(
						{ id, label: title, description, groupId: Type.Optional(id), required: Type.Optional(Type.Boolean()) },
						{ additionalProperties: false }
					),
					{ minItems: 1, maxItems: 1000 }
				),
				choices: options,
				multiple: Type.Optional(Type.Boolean()),
				allowOther: Type.Optional(Type.Boolean()),
				note,
			},
			{ additionalProperties: false }
		),
	],
	{
		description:
			'Required for ask/create. Example: {"version":1,"mode":"questions","title":"Choose topology","questions":[{"id":"topology","title":"Which host?","kind":"single","options":[{"id":"local","label":"Local"},{"id":"remote","label":"Remote"}]}]}. For free text use kind:"text" and omit options.',
	}
);
