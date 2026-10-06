import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	type WorkflowDefinition,
	type WorkflowProposal,
	createProposal,
	definitionDigest,
	parseInterval,
	reviewProposal,
	reviseProposal,
	revokeProposal,
	validateDefinition,
	validateReviewedProposal,
} from "../packages/pi-durable-workflow-core/index.js";
import { fitText } from "../pi-session-tools/output-budget.js";
import { capturePriming } from "./context.js";

const ENTRY = "pi-durable-workflow:proposal:v1";
const choices = ["Y — Approve reviewed version", "N — Reject", "Edit"];
const summarySchema = Type.Object({
	id: Type.String({ maxLength: 200 }),
	revision: Type.Integer(),
	name: Type.String({ maxLength: 200 }),
	state: Type.String({ enum: ["draft", "approved", "rejected", "revoked"] }),
	digest: Type.String({ maxLength: 64 }),
	intervalMs: Type.Integer(),
	allowSubagents: Type.Boolean(),
	model: Type.String({ maxLength: 1000 }),
	contextBytes: Type.Integer(),
	contextComplete: Type.Boolean(),
	droppedEntries: Type.Integer(),
});
const outputSchema = Type.Object({
	ok: Type.Boolean(),
	action: Type.String(),
	recurrenceActive: Type.Literal(false),
	proposals: Type.Array(summarySchema, { maxItems: 8 }),
	message: Type.String({ maxLength: 2000 }),
	truncated: Type.Boolean(),
	code: Type.Optional(Type.String({ maxLength: 100 })),
});
const parameters = Type.Object({
	action: Type.Union([
		Type.Literal("propose"),
		Type.Literal("list"),
		Type.Literal("inspect"),
		Type.Literal("review"),
		Type.Literal("revoke"),
		Type.Literal("activate"),
	]),
	id: Type.Optional(Type.String({ maxLength: 200 })),
	name: Type.Optional(Type.String({ maxLength: 120 })),
	prompt: Type.Optional(Type.String({ maxLength: 8000 })),
	interval: Type.Optional(Type.String({ maxLength: 100 })),
	tools: Type.Optional(Type.Array(Type.String({ maxLength: 200 }), { maxItems: 64 })),
	allowSubagents: Type.Optional(Type.Boolean()),
});
type Params = {
	action: "propose" | "list" | "inspect" | "review" | "revoke" | "activate";
	id?: string;
	name?: string;
	prompt?: string;
	interval?: string;
	tools?: string[];
	allowSubagents?: boolean;
};

function summary(p: WorkflowProposal) {
	return {
		id: p.id,
		revision: p.revision,
		name: p.definition.name,
		state: p.state,
		digest: p.digest,
		intervalMs: p.definition.intervalMs,
		allowSubagents: p.definition.allowSubagents,
		model: `${p.definition.model.provider}/${p.definition.model.id}`,
		contextBytes: Buffer.byteLength(p.definition.source.context),
		contextComplete: p.definition.source.contextComplete,
		droppedEntries: p.definition.source.droppedEntries,
	};
}
function result(action: string, proposals: WorkflowProposal[], message: string, code?: string) {
	const clipped = fitText(message, 2000);
	const data = {
		ok: !code,
		action,
		recurrenceActive: false as const,
		proposals: proposals.slice(0, 8).map(summary),
		message: clipped,
		truncated: clipped !== message,
		...(code ? { code } : {}),
	};
	return {
		content: [{ type: "text" as const, text: clipped }],
		details: data,
		structuredContent: data,
		...(code ? { isError: true } : {}),
	};
}
function preview(p: WorkflowProposal) {
	return JSON.stringify(
		{
			name: p.definition.name,
			prompt: p.definition.prompt,
			everyMinutes: p.definition.intervalMs / 60000,
			requestedTools: p.definition.tools,
			allowSubagents: p.definition.allowSubagents,
			model: p.definition.model,
			limits: p.definition.limits,
			sourceSession: p.definition.source.sessionId,
			priming: `${Buffer.byteLength(p.definition.source.context)} bytes; TEXT PROJECTION ONLY; system sections/execution checkpoints are not imported`,
			revision: p.revision,
			digest: p.digest,
			activation:
				"Review only. No schedule or execution authority is granted. An authorized confined executor/scheduler adapter is required.",
		},
		null,
		2
	);
}

export default function workflowExtension(pi: ExtensionAPI) {
	let generation = 0;
	let sessionId = "";
	const proposals = new Map<string, WorkflowProposal>();
	let queue = Promise.resolve();
	const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
		const task = queue.then(fn);
		queue = task.then(
			() => undefined,
			() => undefined
		);
		return task;
	};
	const persist = (p: WorkflowProposal) => {
		proposals.set(p.id, p);
		pi.appendEntry(ENTRY, p);
	};
	const assertCurrent = (epoch: number, id: string, ctx: ExtensionContext) => {
		if (generation !== epoch || sessionId !== id) throw new Error("Session changed; retry in the current session.");
		if (ctx.sessionManager.getSessionId() !== id) throw new Error("Session identity changed.");
	};
	async function restore(ctx: ExtensionContext) {
		const epoch = ++generation;
		sessionId = ctx.sessionManager.getSessionId();
		const id = sessionId;
		proposals.clear();
		const entries = ctx.sessionManager
			.getBranch()
			.filter((e) => e.type === "custom" && e.customType === ENTRY)
			.slice(-64);
		for (const entry of entries) {
			if (entry.type !== "custom" || !entry.data || typeof entry.data !== "object") continue;
			const p = entry.data as WorkflowProposal;
			const valid = validateDefinition(p.definition);
			if (
				!valid.ok ||
				valid.value.source.sessionId !== id ||
				p.schemaVersion !== 1 ||
				typeof p.id !== "string" ||
				p.id.length > 200 ||
				!Number.isSafeInteger(p.revision) ||
				p.revision < 1 ||
				!["draft", "approved", "rejected", "revoked"].includes(p.state)
			)
				continue;
			if ((await definitionDigest(valid.value)) !== p.digest) continue;
			assertCurrent(epoch, id, ctx);
			if (p.state === "approved" && !(await validateReviewedProposal(p)).ok) continue;
			assertCurrent(epoch, id, ctx);
			if (proposals.has(p.id) || proposals.size < 8) proposals.set(p.id, p);
		}
	}
	pi.on("session_start", async (_event, ctx) => {
		await restore(ctx);
	});
	pi.on("session_tree", async (_event, ctx) => {
		await restore(ctx);
	});
	pi.on("session_shutdown", () => {
		generation++;
		sessionId = "";
		proposals.clear();
	});

	async function review(id: string, ctx: ExtensionContext, epoch: number, owner: string) {
		if (!ctx.hasUI)
			return result("review", [], "Approval requires a human UI; no review or recurrence was activated.", "approval_required");
		for (let attempt = 0; attempt < 8; attempt++) {
			assertCurrent(epoch, owner, ctx);
			const p = proposals.get(id);
			if (!p) throw new Error("Unknown workflow proposal.");
			ctx.signal?.throwIfAborted();
			const choice = await ctx.ui.select(`Review workflow\n${preview(p)}`, choices, { signal: ctx.signal });
			assertCurrent(epoch, owner, ctx);
			ctx.signal?.throwIfAborted();
			if (!choice) return result("review", [p], "Review cancelled; proposal unchanged.");
			if (choice === choices[0] || choice === choices[1]) {
				const updated = reviewProposal(p, choice === choices[0] ? "approved" : "rejected", new Date().toISOString());
				persist(updated);
				return result(
					"review",
					[updated],
					updated.state === "approved"
						? "Version reviewed and approved. Recurrence remains inactive: execution authority and scheduling adapters are not bound."
						: "Proposal rejected. No recurrence enabled."
				);
			}
			if (choice !== "Edit") throw new Error("Invalid approval response; no approval recorded.");
			const edited = await ctx.ui.editor(
				"Edit workflow intent; finish to review final values",
				JSON.stringify(
					{
						name: p.definition.name,
						prompt: p.definition.prompt,
						interval: `${p.definition.intervalMs / 60000}m`,
						tools: p.definition.tools,
						allowSubagents: p.definition.allowSubagents,
						limits: p.definition.limits,
					},
					null,
					2
				)
			);
			assertCurrent(epoch, owner, ctx);
			ctx.signal?.throwIfAborted();
			if (edited === undefined) return result("review", [p], "Edit cancelled; no new approval recorded.");
			const value = JSON.parse(edited) as Record<string, unknown>;
			if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.interval !== "string")
				throw new Error("Edit must be a JSON object with an interval.");
			const definition = {
				...p.definition,
				name: value.name,
				prompt: value.prompt,
				intervalMs: parseInterval(value.interval),
				tools: value.tools,
				allowSubagents: value.allowSubagents,
				limits: value.limits,
			};
			const updated = await reviseProposal(p, definition, new Date().toISOString());
			assertCurrent(epoch, owner, ctx);
			persist(updated);
		}
		return result("review", [], "Too many edits; review again when ready.", "review_limit");
	}
	async function dispatch(params: Params, ctx: ExtensionContext) {
		const epoch = generation;
		const owner = sessionId;
		assertCurrent(epoch, owner, ctx);
		ctx.signal?.throwIfAborted();
		if (params.action === "list")
			return result(
				"list",
				[...proposals.values()],
				"Workflow proposals are review records, not active schedules or authority grants."
			);
		if (params.action === "propose") {
			if (!params.name || !params.prompt || !params.interval) throw new Error("name, prompt and interval are required.");
			if (!ctx.model) throw new Error("Choose a model before proposing a workflow.");
			if (proposals.size >= 8) throw new Error("This session already has eight workflow proposals.");
			const definition: WorkflowDefinition = {
				name: params.name,
				prompt: params.prompt,
				intervalMs: parseInterval(params.interval),
				source: capturePriming(ctx),
				model: { provider: ctx.model.provider, id: ctx.model.id },
				tools: params.tools ?? [],
				artifacts: [],
				allowSubagents: params.allowSubagents ?? false,
				limits: { maxRuns: 10, maxDurationMs: 300000, maxOutputBytes: 16000 },
			};
			const p = await createProposal(definition, randomUUID(), new Date().toISOString());
			assertCurrent(epoch, owner, ctx);
			persist(p);
			if (ctx.hasUI) return review(p.id, ctx, epoch, owner);
			return result("propose", [p], "Draft prepared. Human Y/N/Edit review is required; no schedule activated.");
		}
		const p = params.id ? proposals.get(params.id) : undefined;
		if (!p) throw new Error("An existing proposal id in this session is required.");
		if (params.action === "inspect") return result("inspect", [p], preview(p));
		if (params.action === "review") return review(p.id, ctx, epoch, owner);
		if (params.action === "revoke") {
			const updated = revokeProposal(p);
			persist(updated);
			return result("revoke", [updated], "Review revoked. No active schedule exists to cancel.");
		}
		return result(
			"activate",
			[p],
			"Activation is unsupported until an authorized confined executor and scheduler adapter are bound. A review record alone grants no authority.",
			"adapter_unavailable"
		);
	}
	async function run(params: Params, ctx: ExtensionContext) {
		const epoch = generation;
		const owner = ctx.sessionManager.getSessionId();
		return exclusive(async () => {
			try {
				assertCurrent(epoch, owner, ctx);
				return await dispatch(params, ctx);
			} catch (error) {
				return result(
					params.action,
					[],
					error instanceof Error ? error.message.slice(0, 1800) : "Workflow failed.",
					"workflow_error"
				);
			}
		});
	}
	pi.registerTool({
		name: "workflow",
		label: "Workflow",
		description:
			"Prepare, inspect and review versioned durable-workflow intent. Proposals ask human Y/N/Edit approval. Review does not activate recurrence; unavailable authority/executor adapters fail closed.",
		parameters,
		outputSchema: outputSchema,
		annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		async execute(_id, params, signal, _update, ctx) {
			return run(params, { ...ctx, signal: signal ?? ctx.signal });
		},
	});
	pi.registerCommand("workflow", {
		description:
			"Prepare/review workflow intent: /workflow propose <30m|2h|1d> <prompt>, list, inspect/review/revoke/activate <id>.",
		async handler(args, ctx) {
			const match = args.trim().match(/^propose\s+(\S+)\s+([\s\S]+)$/);
			let params: Params;
			if (match) params = { action: "propose", name: "Recurring Workflow", interval: match[1], prompt: match[2] };
			else {
				const [action = "list", id] = args.trim().split(/\s+/).filter(Boolean);
				if (!["list", "inspect", "review", "revoke", "activate"].includes(action)) {
					ctx.ui.notify("Usage: /workflow propose <interval> <prompt> | list | inspect/review/revoke/activate <id>", "error");
					return;
				}
				params = { action: action as Params["action"], id };
			}
			const response = await run(params, ctx);
			ctx.ui.notify(JSON.stringify(response.structuredContent, null, 2), response.isError ? "error" : "info");
		},
	});
}
