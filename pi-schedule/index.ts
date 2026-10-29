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

import { MAX_QUEUE_AGE_MS, type QueuedDelivery, drainQueue, ensureDeliverer, startInbox } from "./inbox.js";
import {
	type ScheduleScope,
	type ScheduledAction,
	addAction,
	agentDirectory,
	findAction,
	formatActions,
	formatInterval,
	markActionRun,
	parseInterval,
	projectOwnership,
	readActions,
	removeAction,
	setActionEnabled,
	setActionSkdlr,
	skdlrExportCommand,
	splitArgs,
	statusSummary,
} from "./schedule.js";
import { buildLink, parseOwnedSchedules, removeSchedule, runSkdlr } from "./skdlr.js";

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

		const localOnly = (action: ScheduledAction): boolean => action.enabled && action.delivery !== "skdlr";
		const sessionActions = readActions("session", key).filter(localOnly);
		for (const action of sessionActions) armOne(ctx, action, "session", key);

		const ownership = projectOwnership(ctx.cwd, key);
		if (ownership.armed) {
			const projectActions = readActions("project", ctx.cwd).filter(localOnly);
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
			const tokens = splitArgs(args);
			const scope: ScheduleScope = tokens.includes("--project") ? "project" : "session";
			const rest = tokens.filter((token) => token !== "--project");
			const [sub = "list", ...tail] = rest;
			const key = scope === "session" ? sessionKey(ctx) : ctx.cwd;

			// "list" is both a subcommand and a no-argument default.
			const isSubcommand = ["list", "pause", "resume", "run", "remove", "rm", "export", "link", "unlink", "skdlr"].includes(sub);

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

			if (sub === "link" || sub === "unlink" || sub === "skdlr") {
				const sessionId = sessionKey(ctx);
				// Resolve a selector across both scopes: linking is about an action,
				// and requiring --project to find an action you just listed is a trap.
				const resolvedScope = (selector: string): { scope: ScheduleScope; key: string; action?: ScheduledAction } => {
					const inScope = findAction(readActions(scope, key), selector);
					if (inScope) return { scope, key, action: inScope };
					const other: ScheduleScope = scope === "session" ? "project" : "session";
					const otherKey = other === "session" ? sessionId : ctx.cwd;
					const elsewhere = findAction(readActions(other, otherKey), selector);
					return elsewhere ? { scope: other, key: otherKey, action: elsewhere } : { scope, key };
				};
				const actions = readActions(scope, key);

				if (sub === "skdlr") {
					const result = await runSkdlr(["list"]);
					const owned = result.ok ? parseOwnedSchedules(result.stdout ?? "") : [];
					const linked = actions.filter((action) => action.skdlr);
					const lines = [
						`backend: ${result.ok ? "reachable" : `unavailable (${result.stderr ?? "skdlr failed"})`}`,
						`linked actions (${scope} scope): ${linked.length === 0 ? "none" : ""}`,
						...linked.map(
							(action) => `  ${action.skdlr?.name}  ${action.skdlr?.schedule}  →  ${action.label ?? action.text.slice(0, 50)}`
						),
					];
					if (owned.length > 0) {
						lines.push("", "skdlr schedules owned by this extension:");
						for (const entry of owned) lines.push(`  ${entry.name}${entry.status ? ` [${entry.status}]` : ""}`);
					}
					lines.push("", 'link: /schedule link <n|id> --schedule "<cron|natural>" [--queue]');
					ctx.ui.notify(lines.join("\n"), result.ok ? "info" : "warning");
					return;
				}

				if (sub === "unlink") {
					const selector = rest.slice(1).join(" ").trim() || rest[0] || "";
					const found = resolvedScope(selector);
					const action = found.action;
					if (!action) {
						ctx.ui.notify(`schedule: no action matches "${selector}" in either scope`, "error");
						return;
					}
					if (!action.skdlr) {
						ctx.ui.notify(`schedule: "${action.id}" is not linked to skdlr (using the in-session timer)`, "info");
						return;
					}
					const removal = await removeSchedule(action.skdlr.name);
					setActionSkdlr(found.scope, found.key, action.id, undefined);
					arm(ctx);
					ctx.ui.notify(
						removal.removed
							? `Unlinked ${action.skdlr.name}; the in-session timer is back (${formatInterval(action.intervalMs)}).`
							: `Cleared the link locally, but skdlr still lists ${action.skdlr.name}: ${removal.stderr ?? "remove it manually with skdlr remove <name> --yes"}`,
						removal.removed ? "info" : "warning"
					);
					return;
				}

				// link:  /schedule link <n|id> --schedule "0 9 * * 1-5" [--queue]
				const whenIndex = rest.indexOf("--schedule");
				const scheduleExpr = whenIndex === -1 ? "" : (rest[whenIndex + 1] ?? "").trim();
				const queueWanted = rest.includes("--queue");
				const selectorTokens = rest
					.slice(1)
					.filter((token) => token !== "--queue")
					.slice(0, whenIndex === -1 ? undefined : Math.max(0, whenIndex - 1));
				const selector = selectorTokens.join(" ").trim();
				const found = selector ? resolvedScope(selector) : { scope, key };
				const action = found.action;
				if (!action || !scheduleExpr) {
					ctx.ui.notify(
						'Usage: /schedule link <n|id> --schedule "<cron|natural>" [--queue]\n  e.g. /schedule link 1 --schedule "0 9 * * 1-5"',
						"warning"
					);
					return;
				}
				if (action.skdlr) {
					ctx.ui.notify(`schedule: "${action.id}" is already linked as ${action.skdlr.name}; unlink first`, "warning");
					return;
				}

				const link = buildLink({
					scope: found.scope,
					project: ctx.cwd,
					action,
					sessionId,
					schedule: scheduleExpr,
					nodePath: process.execPath,
					deliverer: ensureDeliverer(),
					agentDir: agentDirectory(),
					queue: queueWanted,
				});
				const created = await runSkdlr(link.args);
				if (!created.ok) {
					ctx.ui.notify(`schedule: skdlr refused the link: ${created.stderr ?? "unknown error"}\n  ${link.preview}`, "error");
					return;
				}
				setActionSkdlr(found.scope, found.key, action.id, { name: link.name, schedule: scheduleExpr });
				arm(ctx);
				ctx.ui.notify(
					[
						`Linked "${action.label ?? action.text}" to skdlr (${found.scope} scope).`,
						`  skdlr:    ${link.name}  (${scheduleExpr})`,
						`  delivers: this session (${sessionId.slice(0, 8)}) via the inbox socket`,
						"  the in-session timer for this action is off, so it cannot fire twice",
						queueWanted
							? "  --queue: a missed run is parked and delivered on the next start"
							: "  no --queue: a run with no live session fails visibly",
						"",
						`  skdlr show ${link.name}`,
					].join("\n"),
					"info"
				);
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
	/** Inbox socket for external schedulers (skdlr) + deliverer script. */
	let inbox: { close: () => void; path: string } | undefined;

	const closeInbox = (): void => {
		inbox?.close();
		inbox = undefined;
	};

	const openInbox = (ctx: ExtensionContext): void => {
		closeInbox();
		const sessionId = ctx.sessionManager.getSessionId();
		try {
			ensureDeliverer();
		} catch (error) {
			ctx.ui.notify(`schedule: could not write the deliverer script: ${(error as Error)?.message ?? error}`, "warning");
		}
		inbox = startInbox({
			sessionId,
			onDelivery: (delivery) => {
				deliver(delivery.text);
				ctx.ui.notify(`schedule: delivered via ${delivery.source ?? "inbox"}`, "info");
				publishStatus(ctx);
			},
			onError: (message) => ctx.ui.notify(`schedule: inbox unavailable: ${message}`, "warning"),
		});
	};

	/** Deliver whatever a scheduler parked while this session was closed. */
	const drainMissed = (ctx: ExtensionContext): void => {
		const { deliveries, dropped } = drainQueue(ctx.sessionManager.getSessionId());
		if (deliveries.length === 0 && dropped === 0) return;
		for (const item of deliveries) deliverMissedOne(item);
		if (dropped > 0)
			ctx.ui.notify(
				`schedule: dropped ${dropped} stale queued check(s) (older than ${Math.round(MAX_QUEUE_AGE_MS / 3_600_000)}h)`,
				"warning"
			);
	};

	const deliverMissedOne = (item: QueuedDelivery): void => {
		const age = item.ageMs > 60_000 ? `[scheduled ${Math.round(item.ageMs / 60_000)}m ago] ` : "";
		deliver(`${age}${item.text}`);
	};

	pi.on("session_start", async (_event, ctx) => {
		ctxRef = ctx;
		if (!ctx.hasUI && ctx.mode !== "rpc" && ctx.mode !== "tui") {
			// Single-shot print/json: never keep timers or sockets alive.
			disarm();
			closeInbox();
			publishStatus(ctx);
			return;
		}
		openInbox(ctx);
		drainMissed(ctx);
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
		closeInbox();
		ctxRef = undefined;
		parked = [];
		compacting = false;
	});
}
