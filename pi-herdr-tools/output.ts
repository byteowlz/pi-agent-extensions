import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
const catalogModel = Type.Object({
	id: Type.String(),
	provider: Type.String(),
	label: Type.Optional(Type.String()),
	dataResidency: Type.Optional(Type.String()),
	costType: Type.Optional(Type.String()),
	spawnKind: Type.Optional(Type.String()),
	zdr: Type.Optional(Type.Boolean()),
	tags: Type.Array(Type.String(), { maxItems: 100 }),
});
const child = Type.Object({
	name: Type.String(),
	paneId: Type.String(),
	tabId: Type.Optional(Type.String()),
	model: Type.String(),
	kind: Type.Optional(Type.String()),
	label: Type.Optional(Type.String()),
	cwd: Type.Optional(Type.String()),
	status: Type.Optional(Type.String()),
	spawnedAt: Type.Optional(Type.String()),
});
export const subagentOutputSchema = Type.Union([
	Type.Object({
		ok: Type.Literal(true),
		action: Type.Literal("info"),
		summary: Type.String({ maxLength: 16000 }),
		models: Type.Array(catalogModel, { maxItems: 100 }),
		loadouts: Type.Array(Type.String(), { maxItems: 100 }),
		truncated: Type.Boolean(),
	}),
	Type.Object({
		ok: Type.Literal(true),
		action: Type.Literal("list"),
		subagents: Type.Array(child, { maxItems: 100 }),
		total: Type.Integer(),
		truncated: Type.Boolean(),
	}),
	Type.Object({
		ok: Type.Boolean(),
		action: Type.Literal("spawn"),
		spawned: Type.Boolean(),
		promptSubmitted: Type.Boolean(),
		completed: Type.Literal(false),
		child: Type.Optional(child),
		error: Type.Optional(Type.Object({ code: Type.String(), message: Type.String({ maxLength: 1600 }) })),
		effects: Type.String({ enum: ["none", "possible", "started"] }),
	}),
]);
function record(input: unknown): Record<string, unknown> {
	return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}
function childOutput(input: unknown) {
	const value = record(input);
	if (typeof value.name !== "string" || typeof value.paneId !== "string" || typeof value.model !== "string")
		throw new Error("Invalid subagent identity");
	const result: Record<string, string> = { name: value.name, paneId: value.paneId, model: value.model };
	for (const key of ["tabId", "kind", "label", "cwd", "status"])
		if (typeof value[key] === "string") result[key] = value[key].slice(0, 1000);
	if (typeof value.spawnedAt === "number") result.spawnedAt = new Date(value.spawnedAt).toISOString();
	return result;
}
/** Project only public identity/status fields, never task/config/debug responses. */
export function subagentResult(action: string, result: AgentToolResult<unknown>): AgentToolResult<unknown> {
	const text = result.content
		.filter((c) => c.type === "text")
		.map((c) => c.text)
		.join("\n");
	const details = record(result.details);
	if (action === "info") {
		const catalog = record(details.catalog);
		const all = Array.isArray(catalog.models) ? catalog.models : [];
		const models = all.slice(0, 100).map((input) => {
			const model = record(input);
			const output: Record<string, string | boolean | string[]> = {
				id: String(model.id ?? "").slice(0, 1000),
				provider: String(model.provider ?? "").slice(0, 1000),
				tags: Array.isArray(model.tags)
					? model.tags
							.slice(0, 100)
							.filter((t): t is string => typeof t === "string")
							.map((t) => t.slice(0, 1000))
					: [],
			};
			for (const key of ["label", "dataResidency", "costType", "spawnKind"])
				if (typeof model[key] === "string") output[key] = model[key].slice(0, 1000);
			if (typeof model.zdr === "boolean") output.zdr = model.zdr;
			return output;
		});
		const loadouts = Object.keys(record(catalog.loadouts))
			.slice(0, 100)
			.map((name) => name.slice(0, 1000));
		const truncated = text.length > 16000 || all.length > 100 || Object.keys(record(catalog.loadouts)).length > 100;
		return {
			...result,
			content: [{ type: "text", text: text.slice(0, 16000) + (truncated ? "\n[Truncated catalog.]" : "") }],
			details: { action },
			structuredContent: { ok: true, action, summary: text.slice(0, 16000), models, loadouts, truncated },
		};
	}
	if (action === "list") {
		const all = Array.isArray(details.subagents) ? details.subagents : [];
		const subagents = all.slice(0, 100).map(childOutput);
		const truncated = all.length > 100;
		return {
			...result,
			content: [
				{
					type: "text",
					text: subagents.length
						? `Subagents (${all.length}):\n${subagents.map((c) => `  ${c.name} — ${c.status ?? "unknown"} (${c.model})`).join("\n")}${truncated ? "\n[Truncated list.]" : ""}`
						: "No subagents spawned by this session.",
				},
			],
			details: { action, subagents },
			structuredContent: { ok: true, action, subagents, total: all.length, truncated },
		};
	}
	const spawned = details.spawned === true;
	const promptSubmitted = details.promptSubmitted === true;
	const ok = spawned && promptSubmitted;
	const errorText = text.slice(0, 1600);
	return {
		...result,
		isError: !ok,
		structuredContent: {
			ok,
			action: "spawn",
			spawned,
			promptSubmitted,
			completed: false,
			...(spawned || details.partialChild ? { child: childOutput(spawned ? details : details.partialChild) } : {}),
			...(!ok ? { error: { code: spawned ? "prompt_failed" : "spawn_failed", message: errorText } } : {}),
			effects: spawned ? "started" : details.partialEffects === true ? "possible" : "none",
		},
	};
}
