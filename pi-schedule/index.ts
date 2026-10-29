/**
 * pi-schedule — `/schedule` recurring prompts delivered into this session.
 *
 *   /schedule hourly "check the board"          session-scoped (this session)
 *   /schedule hourly "check the board" --project project-scoped (captain runs it)
 *   /schedule                                   list armed actions + next run
 *   /schedule pause|resume [n|id]               pause/resume one (or all)
 *   /schedule run [n|id]                        fire one now
 *   /schedule remove <n|id>                     delete
 *   /schedule export                            print headless skdlr equivalents
 *
 * Scope semantics (see schedule.ts): session schedules always arm in their own
 * session; project schedules arm only in the session that holds the project's
 * captain claim, so a project check never fires twice. With no captain claimed
 * they stay dormant and say so.
 */

import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
	type ScheduleScope,
	type ScheduledAction,
	addAction,
	findAction,
	formatActions,
	formatInterval,
	markActionRun,
	parseInterval,
	projectOwnership,
	readActions,
	removeAction,
	setActionEnabled,
	skdlrExportCommand,
	statusSummary,
} from "./schedule.js";

interface ArmedAction {
	action: ScheduledAction;
	scope: ScheduleScope;
	timer: ReturnType<typeof setInterval>;
}

export default function piSchedule(pi: ExtensionAPI): void {
	let armed: ArmedAction[] = [];
	let ctxRef: ExtensionContext | undefined;
	/** Prompts parked because pi was compacting when the timer fired. */
	let parked: string[] = [];
	let compacting = false;

	const sessionKey = (ctx: ExtensionContext): string => ctx.sessionManager.getSessionId();

	const disarm = (): void => {
		for (const entry of armed) clearInterval(entry.timer);
		armed = [];
	};

	const publishStatus = (ctx: ExtensionContext | undefined): void => {
		if (!ctx) return;
		try {
			const actions = armed.map((entry) => entry.action);
			ctx.ui.setStatus("schedule", statusSummary(actions));
		} catch {
			// status is cosmetic
		}
	};

	const deliver = (text: string): void => {
		const ctx = ctxRef;
		if (!ctx) return;
		if (compacting) {
			parked.push(text);
			return;
		}
		try {
			if (ctx.isIdle()) pi.sendUserMessage(text);
			else pi.sendUserMessage(text, { deliverAs: "followUp" });
		} catch (error) {
			if (/compaction is in progress/i.test((error as Error)?.message ?? "")) {
				compacting = true;
				parked.push(text);
				return;
			}
			ctx.ui.notify(`schedule: delivery failed: ${(error as Error)?.message ?? error}`, "error");
		}
	};

	/** Re-read stores and re-arm. Cheap enough to call on every change. */
	const arm = (ctx: ExtensionContext): void => {
		disarm();
		ctxRef = ctx;
		const key = sessionKey(ctx);

		const sessionActions = readActions("session", key).filter((action) => action.enabled);
		for (const action of sessionActions) armOne(ctx, action, "session", key);

		const ownership = projectOwnership(ctx.cwd, key);
		if (ownership.armed) {
			const projectActions = readActions("project", ctx.cwd).filter((action) => action.enabled);
			for (const action of projectActions) armOne(ctx, action, "project", ctx.cwd);
		}

		publishStatus(ctx);
	};

	const armOne = (ctx: ExtensionContext, action: ScheduledAction, scope: ScheduleScope, key: string): void => {
		const timer = setInterval(() => {
			// Re-check before every tick: edits, pauses and captain handover must
			// apply without a restart, and a former captain must stop firing.
			const live = readActions(scope, key).find((candidate) => candidate.id === action.id);
			if (!live || !live.enabled) return;
			if (scope === "project" && !projectOwnership(ctx.cwd, sessionKey(ctx)).armed) {
				ctx.ui.notify("schedule: project checks stopped (this session is no longer the captain).", "info");
				arm(ctx);
				return;
			}
			markActionRun(scope, key, live.id);
			deliver(live.text);
			publishStatus(ctx);
		}, action.intervalMs);
		timer.unref?.();
		armed.push({ action, scope, timer });
	};

	pi.registerCommand("schedule", {
		description:
			'Recurring in-session prompts: /schedule hourly "check the board" (session) or add --project so the project captain runs it; no argument lists actions.',
		handler: async (args, ctx) => {
			const tokens = args.trim().split(/\s+/).filter(Boolean);
			const scope: ScheduleScope = tokens.includes("--project") ? "project" : "session";
			const rest = tokens.filter((token) => token !== "--project");
			const [sub = "list", ...tail] = rest;
			const key = scope === "session" ? sessionKey(ctx) : ctx.cwd;

			// "list" is both a subcommand and a no-argument default.
			const isSubcommand = ["list", "pause", "resume", "run", "remove", "rm", "export"].includes(sub);

			if (!isSubcommand) {
				// /schedule <interval> "<prompt>"
				const parsed = parseInterval(sub);
				const text = tail
					.join(" ")
					.replace(/^"(.*)"$/s, "$1")
					.trim();
				if ("error" in parsed) {
					ctx.ui.notify(`schedule: ${parsed.error}`, "error");
					return;
				}
				if (!text) {
					ctx.ui.notify('Usage: /schedule <interval> "<prompt>" [--project]', "warning");
					return;
				}
				if (scope === "project") {
					const ownership = projectOwnership(ctx.cwd, sessionKey(ctx));
					if (!ownership.armed) {
						// Still store it: it arms the moment this session claims the project.
						const { actions, action } = addAction("project", key, { text, intervalMs: parsed.intervalMs });
						ctx.ui.notify(
							`Stored project check every ${formatInterval(action.intervalMs)}: ${text}\n  id: ${action.id}\n  dormant — ${ownership.reason}\n  it arms when this session holds the claim (/captain claim)`,
							"info"
						);
						void actions;
						return;
					}
				}
				const { action } = addAction(scope, key, { text, intervalMs: parsed.intervalMs });
				arm(ctx);
				ctx.ui.notify(
					`Scheduled every ${formatInterval(action.intervalMs)} (${scope} scope): ${text}\n  id: ${action.id}\n  next check in ${formatInterval(action.intervalMs)}`,
					"info"
				);
				return;
			}

			if (sub === "list") {
				const sessionActions = readActions("session", key);
				const projectActions = readActions("project", ctx.cwd);
				const ownership = projectOwnership(ctx.cwd, sessionKey(ctx));
				const blocks = [`session scope (${key.slice(0, 8)}):\n${formatActions(sessionActions)}`];
				blocks.push(
					`project scope (${path.basename(ctx.cwd) || ctx.cwd})${ownership.armed ? "" : ` — dormant: ${ownership.reason}`}:\n${formatActions(projectActions)}`
				);
				ctx.ui.notify(blocks.join("\n\n"), "info");
				return;
			}

			if (sub === "export") {
				const actions = [...readActions("session", key), ...readActions("project", ctx.cwd)];
				if (actions.length === 0) {
					ctx.ui.notify("schedule: nothing to export", "info");
					return;
				}
				ctx.ui.notify(
					[
						"Headless equivalents (skdlr). Each runs a separate `pi -p` in this project,",
						"so it cannot share this session's state; keep the in-session timer unless",
						"the work belongs headless:",
						"",
						...actions.map((action) => skdlrExportCommand(ctx.cwd, action)),
					].join("\n"),
					"info"
				);
				return;
			}

			const selector = tail.join(" ").trim();
			if (sub === "pause" || sub === "resume") {
				const enabled = sub === "resume";
				if (selector) {
					const { action } = setActionEnabled(scope, key, selector, enabled);
					if (!action) {
						ctx.ui.notify(`schedule: no action matches "${selector}" in ${scope} scope`, "error");
						return;
					}
					arm(ctx);
					ctx.ui.notify(`${enabled ? "Resumed" : "Paused"}: ${action.label ?? action.text}`, "info");
					return;
				}
				for (const action of readActions(scope, key)) setActionEnabled(scope, key, action.id, enabled);
				arm(ctx);
				ctx.ui.notify(`All ${scope} actions ${enabled ? "resumed" : "paused"}.`, "info");
				return;
			}

			if (sub === "run") {
				const actions = readActions(scope, key);
				const action = selector ? findAction(actions, selector) : actions[0];
				if (!action) {
					ctx.ui.notify("Usage: /schedule run [n|id]", "warning");
					return;
				}
				markActionRun(scope, key, action.id);
				deliver(action.text);
				ctx.ui.notify(`Ran now: ${action.label ?? action.text}`, "info");
				return;
			}

			// remove / rm
			const { removed } = removeAction(scope, key, selector);
			if (!removed) {
				ctx.ui.notify(`schedule: no action matches "${selector}" in ${scope} scope`, "error");
				return;
			}
			arm(ctx);
			ctx.ui.notify(`Removed: ${removed.label ?? removed.text}`, "info");
		},
	});

	pi.registerCommand("schedules", {
		description: "Alias of /schedule (list) — recurring in-session prompts.",
		handler: async (_args, ctx) => {
			const sessionActions = readActions("session", sessionKey(ctx));
			const projectActions = readActions("project", ctx.cwd);
			const ownership = projectOwnership(ctx.cwd, sessionKey(ctx));
			ctx.ui.notify(
				[
					`session scope:\n${formatActions(sessionActions)}`,
					`project scope${ownership.armed ? "" : ` (dormant: ${ownership.reason})`}:\n${formatActions(projectActions)}`,
				].join("\n\n"),
				"info"
			);
		},
	});

	// One handler per event: keep arm/disarm in the existing lifecycle hooks so
	// Map-based test fakes and real pi behave identically.
	pi.on("session_start", async (_event, ctx) => {
		ctxRef = ctx;
		if (!ctx.hasUI && ctx.mode !== "rpc" && ctx.mode !== "tui") {
			// Single-shot print/json: never keep timers alive.
			disarm();
			publishStatus(ctx);
			return;
		}
		arm(ctx);
	});

	pi.on("session_before_compact", async () => {
		compacting = true;
		return undefined;
	});

	const settle = (): void => {
		if (!compacting) return;
		compacting = false;
		const queued = parked;
		parked = [];
		const ctx = ctxRef;
		if (!ctx) return;
		for (const text of queued) {
			try {
				if (ctx.isIdle()) pi.sendUserMessage(text);
				else pi.sendUserMessage(text, { deliverAs: "followUp" });
			} catch {
				// The next tick will run it again; do not spin on a broken delivery.
			}
		}
	};

	pi.on("session_compact", async () => {
		settle();
		return undefined;
	});

	pi.on("session_compact_failed", async () => {
		settle();
		return undefined;
	});

	pi.on("session_shutdown", async () => {
		disarm();
		ctxRef = undefined;
		parked = [];
		compacting = false;
	});
}
