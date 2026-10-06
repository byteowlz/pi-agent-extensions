import { homedir } from "node:os";
import { join } from "node:path";
import type { JsonValue } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { Answers } from "./model.js";
import { type SelectionRequest, type SelectionResult, SelectionRuntime } from "./runtime.js";
import { selectionSpecSchema } from "./schema.js";

const actions = ["ask", "create", "get", "open", "close"] as const;
const modes = ["auto", "tui", "browser", "host", "none"] as const;

function summary(result: SelectionResult): string {
	const { record, presentation } = result;
	return JSON.stringify({
		id: record.id,
		state: record.state,
		revision: record.revision,
		presentation,
		answers: record.answers,
		notice: "Selections collect user input; they never grant permission to execute actions.",
	});
}

function parseControl(args: string): Record<string, unknown> {
	if (Buffer.byteLength(args, "utf8") > 1_048_576) throw new Error("Selection control payload is too large");
	const value: unknown = JSON.parse(args);
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object");
	const body = value as Record<string, unknown>;
	if (body.version !== 1) throw new Error("Unsupported selection protocol version");
	if (body.requestId !== undefined && (typeof body.requestId !== "string" || body.requestId.length > 128))
		throw new Error("Invalid request id");
	return body;
}

function requestFromControl(body: Record<string, unknown>, action: SelectionRequest["action"]): SelectionRequest {
	if (body.presentation !== undefined && !modes.includes(body.presentation as (typeof modes)[number]))
		throw new Error("Unknown presentation mode");
	if (body.id !== undefined && typeof body.id !== "string") throw new Error("Invalid review id");
	if (body.bindingId !== undefined && typeof body.bindingId !== "string") throw new Error("Invalid binding id");
	if (body.revision !== undefined && (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0))
		throw new Error("Invalid revision");
	return {
		action,
		id: body.id as string | undefined,
		revision: body.revision as number | undefined,
		spec: body.spec,
		presentation: body.presentation as SelectionRequest["presentation"],
		bindingId: body.bindingId as string | undefined,
	};
}

function reply(ctx: ExtensionContext, command: string, requestId: unknown, result: unknown, ok = true): void {
	const payload = { version: 1, command, requestId, ok, ...(ok ? { result } : { error: result }) };
	if (ctx.mode === "rpc") ctx.ui.setStatus("pi-selection:reply/v1", JSON.stringify(payload));
	else ctx.ui.notify(JSON.stringify(payload), ok ? "info" : "error");
}

/** Recover correlation from valid JSON even when protocol validation fails. */
function correlation(args: string): string | undefined {
	if (Buffer.byteLength(args, "utf8") > 1_048_576) return undefined;
	try {
		const body = JSON.parse(args);
		return typeof body?.requestId === "string" && body.requestId.length <= 128 ? body.requestId : undefined;
	} catch {
		return undefined;
	}
}

export default function selection(pi: ExtensionAPI): void {
	pi.registerFlag("selection-state-dir", {
		type: "string",
		description: "Private selection state root (new files only)",
		default: "",
	});
	pi.registerFlag("selection-lan-address", {
		type: "string",
		description: "Explicit private local bind address for token-protected LAN fallback; empty disables LAN",
		default: "",
	});
	pi.registerFlag("selection-browser-ttl-ms", {
		type: "string",
		description: "Browser access lifetime in milliseconds (maximum one hour)",
		default: "1800000",
	});
	let runtime: SelectionRuntime | undefined;
	const getRuntime = (): SelectionRuntime => {
		if (!runtime) {
			const configured = pi.getFlag("selection-state-dir");
			const lan = pi.getFlag("selection-lan-address");
			const ttl = Number(pi.getFlag("selection-browser-ttl-ms"));
			if (!Number.isSafeInteger(ttl) || ttl < 1000 || ttl > 3_600_000) throw new Error("Invalid browser lifetime");
			const root =
				typeof configured === "string" && configured
					? configured
					: join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "pi-selection", "reviews");
			runtime = new SelectionRuntime(pi, {
				root,
				lanAddress: typeof lan === "string" && lan ? lan : undefined,
				browserTtlMs: ttl,
			});
		}
		return runtime;
	};
	let generation = 0;
	const reset = async (_event: unknown, ctx: ExtensionContext) => {
		generation++;
		try {
			ctx.ui.setStatus("pi-selection:present/v1", undefined);
			ctx.ui.setStatus("pi-selection:reply/v1", undefined);
		} finally {
			await runtime?.reset();
		}
	};
	pi.on("session_start", reset);
	pi.on("session_tree", reset);
	pi.on("session_shutdown", reset);

	pi.registerTool({
		name: "Selection",
		label: "Selection",
		exposure: "model-only",
		description:
			"Ask structured questions or review inventories with single/multiple choices, Other text, standalone text and notes. Supply version:1 spec with mode questions/review and a root title. Questions use {id,title,kind}, NOT text/question as the prompt field; kind is single/multiple/text. single/multiple require options:[{id,label}]; text omits options. See the spec schema for a complete example. Native TUI, negotiated host or protected browser fallback. ask waits for submission; create returns a draft/presentation; get retrieves it; open resumes; close cancels. Never interprets answers as permission grants. No pairwise labeling or secret entry.",
		annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
		parameters: Type.Object(
			{
				action: Type.Optional(Type.String({ enum: [...actions] })),
				spec: Type.Optional(selectionSpecSchema),
				id: Type.Optional(Type.String()),
				presentation: Type.Optional(Type.String({ enum: [...modes] })),
				bindingId: Type.Optional(Type.String()),
				revision: Type.Optional(Type.Integer({ minimum: 0 })),
			},
			{ additionalProperties: false }
		),
		outputSchema: Type.Unknown(),
		async execute(_id, params, signal, onUpdate, ctx) {
			const result = await getRuntime().execute(
				ctx,
				{
					...params,
					action: (params.action ?? "ask") as SelectionRequest["action"],
					presentation: params.presentation as SelectionRequest["presentation"],
				},
				signal,
				(progress) => {
					onUpdate?.({ content: [{ type: "text", text: summary(progress) }], details: progress });
				}
			);
			return {
				content: [{ type: "text", text: summary(result) }],
				details: result,
				structuredContent: JSON.parse(JSON.stringify(result)) as JsonValue,
			};
		},
	});

	const registerControl = (
		command: string,
		description: string,
		handler: (body: Record<string, unknown>, ctx: ExtensionCommandContext) => Promise<unknown>
	) => {
		pi.registerCommand(command, {
			description,
			handler: async (args, ctx) => {
				const current = generation;
				const scope = ctx.sessionManager.getSessionId();
				const isCurrent = () => current === generation && scope === ctx.sessionManager.getSessionId() && !ctx.signal?.aborted;
				try {
					const body = parseControl(args);
					const result = await handler(body, ctx);
					if (isCurrent()) reply(ctx, command, body.requestId, result);
				} catch (error) {
					if (isCurrent())
						reply(ctx, command, correlation(args), error instanceof Error ? error.message : "Selection control failed", false);
				}
			},
		});
	};

	for (const action of ["create", "get", "open", "close"] as const) {
		const command = `selection-${action}`;
		registerControl(command, `Selection v1 control command: ${action}; JSON args, no chat/model message`, async (body, ctx) =>
			getRuntime().execute(ctx, requestFromControl(body, action))
		);
	}
	registerControl("selection-ack", "Acknowledge a rendered review through the owning host transport", async (body, ctx) => {
		if (typeof body.id !== "string" || typeof body.bindingId !== "string") throw new Error("Review and binding ids required");
		await getRuntime().acknowledge(ctx, body.id, body.bindingId);
		return { ok: true };
	});
	for (const submit of [false, true]) {
		const command = submit ? "selection-submit" : "selection-save";
		registerControl(
			command,
			"Host-controlled review answer submission; transport owner must authorize user/session; never a permission grant",
			async (body, ctx) => {
				if (typeof body.id !== "string" || !Number.isSafeInteger(body.revision) || !body.answers)
					throw new Error("Review id, revision and answers required");
				const record = await getRuntime().saveFromHost(ctx, body.id, body.revision as number, body.answers as Answers, submit);
				return record;
			}
		);
	}
}
