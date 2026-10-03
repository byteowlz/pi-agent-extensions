import type { AgentToolResult, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { HistorySearchConfig } from "./config.js";
import { computeBudget } from "./context-guard.js";

const text = Type.String();
const nullableText = Type.Union([text, Type.Null()]);
const branch = Type.Object({
	branchId: text,
	parentBranchId: nullableText,
	rootSessionId: text,
	forkMsgIndex: Type.Union([Type.Integer(), Type.Null()]),
	createdAt: text,
	updatedAt: text,
	cwd: text,
	lastCwd: text,
	messageCount: Type.Integer(),
	lastUserPreview: nullableText,
	lastAssistantPreview: nullableText,
	recentFiles: Type.Array(text),
	recentCommands: Type.Array(text),
	alias: Type.Optional(text),
});
const match = Type.Object({ msgIndex: Type.Integer(), role: text, snippet: text, matchPosition: Type.Optional(Type.Integer()) });
const message = Type.Object({ msgIndex: Type.Integer(), role: text, text });
const error = Type.Object({ ok: Type.Literal(false), action: text, error: Type.Object({ code: text, message: text }) });
const common = {
	ok: Type.Literal(true),
	completeness: Type.Literal("unknown"),
	absence_is_global: Type.Literal(false),
	truncated: Type.Boolean(),
	omittedItems: Type.Integer({ minimum: 0 }),
	budgetChars: Type.Integer(),
};
export const historyOutputSchemas = {
	search: Type.Union([
		error,
		Type.Object({
			...common,
			action: Type.Literal("search"),
			scope: text,
			hits: Type.Array(
				Type.Object({
					sessionId: text,
					project: text,
					timestamp: text,
					title: nullableText,
					sessionName: nullableText,
					completeness: Type.Literal("unknown"),
					matches: Type.Array(match),
					branch: Type.Optional(branch),
				})
			),
			attempts: Type.Array(text),
			warnings: Type.Array(text),
			filters: Type.Object({ project: Type.Optional(text), roleFilter: text, evidenceRoles: text }),
			limits: Type.Object({ candidateSessionsPerProject: Type.Integer(), passagesPerMessage: Type.Integer() }),
		}),
	]),
	branches: Type.Union([
		error,
		Type.Object({ ...common, action: Type.Literal("branches"), scope: text, branches: Type.Array(branch) }),
	]),
	read: Type.Union([
		error,
		Type.Object({
			...common,
			action: Type.Literal("read"),
			sessionId: text,
			project: text,
			timestamp: text,
			totalMessages: Type.Integer(),
			mode: text,
			messages: Type.Array(message),
			omittedMessages: Type.Optional(Type.Integer()),
			roleFilter: text,
		}),
	]),
	grep: Type.Union([
		error,
		Type.Object({
			...common,
			action: Type.Literal("grep"),
			sessionId: text,
			timestamp: text,
			attempts: Type.Array(text),
			warnings: Type.Array(text),
			roleFilter: text,
			ignoreCase: Type.Boolean(),
			matchedMessages: Type.Integer(),
			matches: Type.Array(match),
			messages: Type.Array(message),
		}),
	]),
};

type Json = null | string | number | boolean | Json[] | { [key: string]: Json };
export function historyFailure(action: string, code: string, message: string): AgentToolResult<unknown> {
	const safe = message.slice(0, 1600);
	return {
		content: [{ type: "text", text: safe }],
		details: { action, error: safe },
		isError: true,
		structuredContent: { ok: false, action, error: { code, message: safe } },
	};
}

/** Fit at evidence boundaries, not mid-JSON. No rich unguarded details bypass. */
export function historyResult<T extends object>(
	action: string,
	data: T,
	ctx: ExtensionContext,
	config: HistorySearchConfig,
	requested = 60000,
	format?: (data: T) => string
): AgentToolResult<unknown> {
	const budgetChars = Math.max(
		256,
		Math.min(60000, requested, config.contextGuard.enabled ? computeBudget(ctx, config.contextGuard).budgetChars : 60000)
	);
	const result = JSON.parse(
		JSON.stringify({ ...data, ok: true, action, completeness: "unknown", absence_is_global: false, omittedItems: 0, budgetChars })
	) as Record<string, Json>;
	result.truncated ??= false;
	let serialized = JSON.stringify(result);
	const render = () => (format ? format(result as unknown as T) : serialized);
	while (serialized.length > budgetChars || render().length > budgetChars) {
		const arrays = ["messages", "matches", "hits", "branches"]
			.map((key) => result[key])
			.filter((v): v is Json[] => Array.isArray(v) && v.length > 0);
		if (!arrays.length)
			return historyFailure(action, "budget_exceeded", "History metadata exceeds the output budget; narrow the call.");
		arrays[0].pop();
		result.omittedItems = Number(result.omittedItems) + 1;
		result.truncated = true;
		serialized = JSON.stringify(result);
	}
	const details = {
		...result,
		count: Array.isArray(result.hits) ? result.hits.length : Array.isArray(result.branches) ? result.branches.length : 0,
		returned: Array.isArray(result.messages) ? result.messages.length : 0,
	};
	return { content: [{ type: "text", text: render() }], details, structuredContent: result };
}
