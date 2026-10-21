/**
 * pi-session-surgeon — agentic, sandboxed rewrite of a session's history.
 *
 * Parent mode: `/surgeon [--model provider/id] [--timeout secs] <prompt>` stages a
 * copy of the current session, proves a restriction-only oqto-sandbox policy
 * (ADR 0070), runs a dedicated Pi agent inside it, verifies the result, and
 * publishes a new branch. The original session is never modified.
 *
 * Child mode: when PI_SURGEON_TARGET is set this extension only registers the
 * `session_surgery` tool, locked to that one file. That is what the sandboxed
 * agent calls; it never hand-edits JSONL.
 */

import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	SandboxError,
	assertEffective,
	effectiveReportArgs,
	launchArgs,
	parseReport,
	piCommand,
	resolveSandboxCli,
	run,
} from "./sandbox.js";
import { type Staging, createStaging } from "./staging.js";
import {
	SurgeryError,
	diffMessages,
	listMessages,
	parseSession,
	readSessionFile,
	replaceMessageText,
	verifySession,
	writeSessionAtomic,
} from "./surgery.js";

const DEFAULT_TIMEOUT_MS = 600_000;
const MAX_TIMEOUT_MS = 3_600_000;

// ── child mode ───────────────────────────────────────────────────────

function targetFromEnv(ctx: ExtensionContext): string {
	const target = process.env.PI_SURGEON_TARGET;
	if (!target || !isAbsolute(target)) throw new SurgeryError("PI_SURGEON_TARGET must be an absolute path");
	const resolved = resolve(target);
	const cwd = resolve(ctx.cwd);
	if (!(resolved === cwd || resolved.startsWith(`${cwd}${sep}`)))
		throw new SurgeryError(`target must stay inside the sandbox workspace (${resolved})`);
	return resolved;
}

function registerSurgeryTool(pi: ExtensionAPI, ctx: ExtensionContext): void {
	pi.registerTool({
		name: "session_surgery",
		label: "Session Surgery",
		outputSchema: Type.Union([
			Type.Object({
				action: Type.Literal("list"),
				total: Type.Number(),
				rows: Type.Array(
					Type.Object({
						id: Type.String(),
						role: Type.String(),
						editable: Type.Boolean(),
						preview: Type.String(),
					})
				),
			}),
			Type.Object({
				action: Type.Literal("show"),
				id: Type.String(),
				role: Type.String(),
				editable: Type.Boolean(),
			}),
			Type.Object({ action: Type.Literal("replace"), id: Type.String() }),
			Type.Object({
				action: Type.Literal("verify"),
				ok: Type.Boolean(),
				errors: Type.Array(Type.String()),
				messages: Type.Number(),
			}),
		]),
		description:
			"Edit the copied session history for this rewrite job. Actions: list (messages with ids and previews), " +
			"show (one full message text), replace (rewrite one message's text), verify (structural check). " +
			"Only text is changed; tool calls, results and thinking are preserved and never rewritten. " +
			"Use replace for redaction/rewording; keep ids and order intact.",
		parameters: Type.Object({
			action: Type.String({ enum: ["list", "show", "replace", "verify"] }),
			id: Type.Optional(Type.String({ description: "Message id for show/replace" })),
			text: Type.Optional(Type.String({ description: "Replacement text for replace" })),
			offset: Type.Optional(Type.Integer({ minimum: 0 })),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
		}),
		async execute(_toolCallId, params, signal): Promise<import("@earendil-works/pi-coding-agent").AgentToolResult<unknown>> {
			signal?.throwIfAborted();
			const file = targetFromEnv(ctx);
			const entries = readSessionFile(file);
			const messages = listMessages(entries);
			if (params.action === "list") {
				const offset = params.offset ?? 0;
				const limit = params.limit ?? 50;
				const rows = messages.slice(offset, offset + limit).map((message) => ({
					id: message.id,
					role: message.role,
					editable: message.editable,
					preview: message.text.replace(/\s+/g, " ").slice(0, 160),
				}));
				return {
					content: [
						{
							type: "text" as const,
							text: `${messages.length} messages (showing ${offset + 1}-${Math.min(offset + limit, messages.length)}):\n${JSON.stringify(rows, null, 1)}`,
						},
					],
					details: { action: "list", total: messages.length, rows },
				};
			}
			if (params.action === "show") {
				const message = messages.find((entry) => entry.id === params.id);
				if (!message) throw new SurgeryError(`no message ${String(params.id)}`);
				return {
					content: [
						{ type: "text" as const, text: `${message.role} ${message.id} (editable=${message.editable}):\n${message.text}` },
					],
					details: { action: "show", id: message.id, role: message.role, editable: message.editable },
				};
			}
			if (params.action === "replace") {
				if (!params.id || typeof params.text !== "string") throw new SurgeryError("replace needs id and text");
				const next = replaceMessageText(entries, params.id, params.text);
				writeSessionAtomic(file, next);
				const check = verifySession(next);
				if (!check.ok) throw new SurgeryError(`rewrite broke the session: ${check.errors.join("; ")}`);
				return {
					content: [{ type: "text" as const, text: `Replaced text of ${params.id}.` }],
					details: { action: "replace", id: params.id },
				};
			}
			const check = verifySession(entries);
			return {
				content: [
					{ type: "text" as const, text: check.ok ? `ok: ${check.messages} messages` : `invalid: ${check.errors.join("; ")}` },
				],
				details: { action: "verify", ok: check.ok, errors: check.errors, messages: check.messages },
			};
		},
	});
}

// ── parent mode ──────────────────────────────────────────────────────

interface Args {
	prompt: string;
	model?: string;
	timeoutMs: number;
}

export function parseArgs(args: string): Args {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	let model: string | undefined;
	let timeoutMs = DEFAULT_TIMEOUT_MS;
	const rest: string[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i] as string;
		if (token === "--model") {
			model = tokens[++i];
			continue;
		}
		if (token === "--timeout") {
			const seconds = Number.parseInt(tokens[++i] ?? "", 10);
			if (!Number.isFinite(seconds) || seconds < 10 || seconds * 1000 > MAX_TIMEOUT_MS)
				throw new SandboxError("--timeout must be 10..3600 seconds");
			timeoutMs = seconds * 1000;
			continue;
		}
		rest.push(token);
	}
	const prompt = rest.join(" ").trim();
	if (!prompt) throw new SandboxError("usage: /surgeon [--model provider/id] [--timeout secs] <what to rewrite>");
	return { prompt, model, timeoutMs };
}

function childEnv(staging: Staging): NodeJS.ProcessEnv {
	return {
		...process.env,
		HOME: staging.homeDir,
		PI_CODING_AGENT_DIR: staging.agentDir,
		PI_SURGEON_TARGET: staging.targetFile,
	};
}

function childArgs(staging: Staging, model: string, prompt: string): string[] {
	const [provider, ...rest] = model.split("/");
	const modelId = rest.join("/") || provider;
	return [
		...piCommand(),
		"--provider",
		provider as string,
		"--model",
		modelId as string,
		"-ne",
		"-ns",
		"-np",
		"-nc",
		"-na",
		"-e",
		staging.extEntry,
		"--tools",
		"session_surgery,read,grep",
		"--session-dir",
		staging.sessionsDir,
		"-p",
		prompt,
	];
}

function changedSummary(before: string, after: string): { lines: string[]; count: number } {
	const rows = diffMessages(parseSession(before), parseSession(after));
	const lines = rows.slice(0, 12).map((row) => {
		const from = row.before.replace(/\s+/g, " ").slice(0, 70);
		const to = row.after.replace(/\s+/g, " ").slice(0, 70);
		return `  ${row.id} (${row.role})\n    - ${from}\n    + ${to}`;
	});
	if (rows.length > lines.length) lines.push(`  … ${rows.length - lines.length} more`);
	return { lines, count: rows.length };
}

async function publish(ctx: ExtensionCommandContext, staging: Staging): Promise<void> {
	const manager = SessionManager.open(staging.targetFile, dirname(staging.originalFile));
	const leaf = manager.getLeafId();
	if (!leaf) throw new SurgeryError("rewritten session has no leaf");
	const file = manager.createBranchedSession(leaf);
	if (!file) throw new SurgeryError("could not create the rewritten branch file");
	await ctx.switchSession(file, {
		withSession: async (fresh) => {
			fresh.ui.notify(
				"Rewritten history is now active as a new branch. The original session is unchanged on disk. Past filesystem actions were not undone.",
				"info"
			);
		},
	});
}

async function surgeon(ctx: ExtensionCommandContext, args: string): Promise<void> {
	const parsed = parseArgs(args);
	const source = ctx.sessionManager.getSessionFile();
	if (!source) throw new SurgeryError("the current session is not persisted; nothing to rewrite");
	const model = parsed.model ?? (ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined);
	if (!model) throw new SurgeryError("pick a model with --model provider/id (no active model)");

	const cli = resolveSandboxCli();
	if (!cli)
		throw new SandboxError(
			"oqto-sandbox is not on PATH; refusing to run the surgeon unsandboxed. Install/point at it, then retry."
		);

	const staging = createStaging({
		sourceFile: source,
		agentDir: process.env.PI_CODING_AGENT_DIR ?? dirname(dirname(source)),
		extensionDir: dirname(fileURLToPath(import.meta.url)),
	});
	let published = false;
	try {
		const report = await run(cli, effectiveReportArgs(staging), {
			timeoutMs: 30_000,
			signal: ctx.signal,
			env: process.env,
		});
		if (process.platform === "linux") {
			assertEffective(parseReport(report), staging);
		} else {
			// No effective report on this backend yet: prove the policy compiles instead.
			const dry = await run(cli, [...effectiveReportArgs(staging)], { timeoutMs: 10_000, signal: ctx.signal });
			if (dry.code !== 0)
				throw new SandboxError(`no effective-policy report on ${process.platform} and the dry run failed; refusing to launch`);
			ctx.ui.notify(
				`Sandbox policy verified by dry run only: ${process.platform} has no --print-effective report yet.`,
				"warning"
			);
		}

		ctx.ui.notify(`Surgeon running for up to ${Math.round(parsed.timeoutMs / 1000)}s (sandbox: ${staging.work}).`, "info");
		const result = await run(cli, launchArgs(staging, childArgs(staging, model, parsed.prompt)), {
			timeoutMs: parsed.timeoutMs,
			signal: ctx.signal,
			env: childEnv(staging),
		});
		if (result.timedOut) throw new SandboxError(`surgeon timed out after ${Math.round(parsed.timeoutMs / 1000)}s`);
		if (result.code !== 0)
			throw new SandboxError(
				`surgeon failed (exit ${String(result.code)}): ${result.stderr.trim().slice(0, 600) || "no stderr"}`
			);

		const rewritten = verifySession(readSessionFile(staging.targetFile));
		if (!rewritten.ok) throw new SurgeryError(`surgeon produced an invalid session: ${rewritten.errors.join("; ")}`);
		const diff = changedSummary(readFileSync(staging.originalFile, "utf8"), readFileSync(staging.targetFile, "utf8"));
		if (diff.count === 0) {
			ctx.ui.notify("The surgeon changed nothing; no new branch was created.", "warning");
			return;
		}
		if (!ctx.hasUI) {
			ctx.ui.notify(
				`Rewritten copy is at ${staging.targetFile} (${diff.count} message(s) changed); review it and apply manually.`,
				"warning"
			);
			return;
		}
		const ok = await ctx.ui.confirm(
			"Apply rewritten history?",
			`${diff.count} message(s) changed:\n${diff.lines.join("\n")}\n\nThe original session stays untouched; a new branch will be created.`
		);
		if (!ok) {
			ctx.ui.notify(`Kept the rewritten copy at ${staging.targetFile}`, "info");
			return;
		}
		await publish(ctx, staging);
		published = true;
	} finally {
		if (published) staging.cleanup();
	}
}

export default function (pi: ExtensionAPI): void {
	// Child mode: the sandboxed agent gets exactly one tool.
	if (process.env.PI_SURGEON_TARGET) {
		pi.on("session_start", async (_event, ctx) => {
			registerSurgeryTool(pi, ctx);
		});
		return;
	}

	pi.registerCommand("surgeon", {
		description:
			"Agentically rewrite this session's history in a sandboxed copy: /surgeon [--model provider/id] [--timeout secs] <prompt>",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			try {
				await surgeon(ctx, args);
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : "surgeon failed", "error");
			}
		},
	});
}
