/**
 * pi-session-cwd — `/cwd` moves the running session to another working directory.
 *
 *   /cwd                    show the current working directory and the last move
 *   /cwd ~/Code/other       move this session (and its file) to that directory
 *   /cwd <path> --force     skip the confirmation dialog
 *
 * The session file is actually relocated: its header `cwd` is rewritten and the
 * JSONL moves to the target directory's session folder, then the runtime is
 * switched to it so tools, project AGENTS.md/settings and extension cwd follow.
 * Nothing on the filesystem is moved, and pi's own process cwd is untouched.
 *
 * See move.ts for the mechanics and the documented limits.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

import {
	MOVE_ENTRY_TYPE,
	MoveError,
	type MovePlan,
	type MoveRecord,
	applyMove,
	isDirectory,
	planMove,
	readLastMove,
	resolveTargetCwd,
	shortenPath,
} from "./move.js";

/** Directories pi itself reports as existing session roots (for the picker). */
const RECENT_TOOLTIP = "path may be relative to the current cwd; ~ expands to your home";

function describePlan(plan: MovePlan): string[] {
	return [
		"  working directory",
		`    ${shortenPath(plan.fromCwd, 60)}`,
		`    → ${shortenPath(plan.toCwd, 60)}`,
		"  session file",
		`    ${shortenPath(plan.from, 60)}`,
		`    → ${shortenPath(plan.to, 60)}`,
	];
}

function summarizeMove(record: MoveRecord | undefined): string | undefined {
	if (!record) return undefined;
	const when = record.at ? record.at.slice(0, 16).replace("T", " ") : "unknown time";
	return `last move: ${shortenPath(record.fromCwd, 40)} → ${shortenPath(record.toCwd, 40)} (${when})`;
}

export default function piSessionCwd(pi: ExtensionAPI): void {
	const notify = (ctx: ExtensionCommandContext, message: string, level: "info" | "warning" | "error" = "info"): void => {
		try {
			ctx.ui.notify(message, level);
		} catch {
			// best effort: notifications are not worth failing a move over
		}
	};

	/** Custom session dir configured for this session, if any. */
	const sessionDirOf = (ctx: ExtensionCommandContext): string | undefined => {
		try {
			const manager = ctx.sessionManager as unknown as { usesDefaultSessionDir?: () => boolean; getSessionDir?: () => string };
			if (typeof manager.usesDefaultSessionDir === "function" && manager.usesDefaultSessionDir()) return undefined;
			const dir = typeof manager.getSessionDir === "function" ? manager.getSessionDir() : undefined;
			return typeof dir === "string" && dir ? dir : undefined;
		} catch {
			return undefined;
		}
	};

	async function confirmMove(ctx: ExtensionCommandContext, plan: MovePlan, force: boolean): Promise<boolean> {
		if (force) return true;
		if (ctx.mode !== "tui" || typeof ctx.ui.select !== "function") {
			// Non-interactive surfaces (RPC, print) must pass --force explicitly;
			// silently moving someone's session on a one-line command is worse.
			return false;
		}
		const choice = await ctx.ui.select(
			[
				`Move this session to ${shortenPath(plan.toCwd, 60)}?`,
				"",
				...describePlan(plan),
				"",
				"Files on disk are not moved. The session keeps its history and name.",
			].join("\n"),
			["Move session", "Cancel"]
		);
		return choice === "Move session";
	}

	async function performMove(ctx: ExtensionCommandContext, target: string, force: boolean): Promise<void> {
		const plan = planMove({
			sessionFile: ctx.sessionManager.getSessionFile(),
			currentCwd: ctx.cwd,
			targetCwd: target,
			sessionDir: sessionDirOf(ctx),
		});

		if (!(await confirmMove(ctx, plan, force))) {
			notify(ctx, "session move cancelled", "info");
			return;
		}

		// Be explicit when the runtime is mid-flight: switchSession aborts the
		// current turn, and a silent abort in the middle of a tool run is rude.
		let wasStreaming = false;
		try {
			wasStreaming = !ctx.isIdle();
		} catch {
			wasStreaming = false;
		}

		const record: MoveRecord = {
			version: 1,
			fromCwd: plan.fromCwd,
			toCwd: plan.toCwd,
			fromFile: plan.from,
			toFile: plan.to,
			at: new Date().toISOString(),
		};
		try {
			pi.appendEntry(MOVE_ENTRY_TYPE, record);
		} catch {
			// The move itself must not depend on the audit entry landing.
		}

		let newFile: string;
		try {
			newFile = applyMove(plan);
		} catch (error) {
			throw error instanceof MoveError ? error : new MoveError(String(error));
		}

		const result = await ctx.switchSession(newFile, {
			withSession: async (fresh) => {
				try {
					const lines = [
						`session moved to ${shortenPath(plan.toCwd, 60)}`,
						`  session file: ${shortenPath(newFile, 60)}`,
						...(wasStreaming ? ["  the interrupted turn was aborted by the switch"] : []),
						"  project files, AGENTS.md, settings and tool cwd now resolve from the new directory",
						"  files on disk were not moved; pi's process cwd is unchanged",
					];
					fresh.ui.notify(lines.join("\n"), "info");
				} catch {
					// best effort
				}
			},
		});
		if (result.cancelled) notify(ctx, "session move cancelled by pi", "warning");
	}

	const command = {
		description:
			"Move this session (and its session file) to another working directory: /cwd ~/Code/project. No argument shows the current directory. --force skips the confirmation for scripts/RPC.",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const tokens = args.trim().split(/\s+/).filter(Boolean);
			const force = tokens.includes("--force");
			const rest = tokens.filter((token) => token !== "--force");
			const raw = rest.join(" ").trim();

			if (!raw) {
				const last = readLastMove(ctx.sessionManager.getBranch());
				const lines = [
					`working directory: ${ctx.cwd}`,
					`session file: ${ctx.sessionManager.getSessionFile() ?? "(not persisted yet)"}`,
					...(summarizeMove(last) ? [summarizeMove(last) as string] : []),
					"",
					`move: /cwd <path>  (${RECENT_TOOLTIP})`,
				];
				notify(ctx, lines.join("\n"), "info");
				return;
			}

			let target: string;
			try {
				target = resolveTargetCwd(raw, ctx.cwd);
			} catch (error) {
				notify(ctx, `cwd: ${error instanceof Error ? error.message : String(error)}`, "error");
				return;
			}
			if (!isDirectory(target)) {
				notify(ctx, `cwd: target directory does not exist: ${shortenPath(target, 60)}`, "error");
				return;
			}

			try {
				await performMove(ctx, target, force);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				notify(ctx, `cwd: ${message}`, "error");
			}
		},
	};
	pi.registerCommand("cwd", command);

	// A readable picker for the common case: choose among directories pi already
	// knows about (session roots) instead of typing a path.
	pi.registerCommand("mvcwd", {
		description: "Pick a working directory to move this session to from directories with existing sessions",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			if (ctx.mode !== "tui" || typeof ctx.ui.select !== "function") {
				notify(ctx, "cwd: the directory picker needs an interactive terminal; use /cwd <path> [--force]", "warning");
				return;
			}
			const candidates = await knownSessionCwds(ctx);
			if (candidates.length === 0) {
				notify(ctx, "cwd: no other directories with sessions found; use /cwd <path>", "info");
				return;
			}
			const labels = candidates.map((cwd) => shortenPath(cwd, 70));
			const choice = await ctx.ui.select("Move this session to which working directory?", labels);
			if (!choice) return;
			const target = candidates[labels.indexOf(choice)];
			if (!target) return;
			try {
				await performMove(ctx, target, false);
			} catch (error) {
				notify(ctx, `cwd: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
		},
	});

	// Show the move history interactively (it is routing metadata, never context).
	pi.registerCommand("cwd-history", {
		description: "Show where this session has been moved",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const rows = moveHistory(ctx.sessionManager.getBranch());
			if (rows.length === 0) {
				notify(ctx, "cwd: this session has not been moved", "info");
				return;
			}
			const lines = rows.map((row) => {
				const when = row.at ? row.at.slice(0, 16).replace("T", " ") : "unknown";
				return `${when}  ${shortenPath(row.fromCwd, 40)} → ${shortenPath(row.toCwd, 40)}`;
			});
			if (ctx.mode !== "tui") {
				notify(ctx, lines.join("\n"), "info");
				return;
			}
			await ctx.ui.custom((tui, theme, _kb, done) => {
				let cached: string[] | undefined;
				const close = (): void => {
					done(undefined);
				};
				return {
					render: (width: number) => {
						if (cached) return cached;
						const rw = Math.max(1, width);
						const out = [theme.fg("accent", "─".repeat(rw)), ` ${theme.fg("accent", "Session moves")}`, ""];
						for (const line of lines) out.push(` ${line}`);
						out.push("", theme.fg("muted", " enter/escape to close"), theme.fg("accent", "─".repeat(rw)));
						cached = out.map((line) => truncateToWidth(line, rw));
						return cached;
					},
					invalidate: () => {
						cached = undefined;
					},
					handleInput: (data: string) => {
						if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape) || matchesKey(data, Key.q)) close();
						tui.requestRender();
					},
				};
			});
		},
	});
}

/** Every distinct cwd that has a session directory under the default sessions root. */
async function knownSessionCwds(ctx: ExtensionCommandContext): Promise<string[]> {
	try {
		const manager = ctx.sessionManager as unknown as {
			usesDefaultSessionDir?: () => boolean;
			getSessionDir?: () => string;
			listAll?: (dir?: string) => Promise<Array<{ cwd?: string }>>;
		};
		if (typeof manager.listAll !== "function") return [];
		const dir =
			typeof manager.usesDefaultSessionDir === "function" && manager.usesDefaultSessionDir()
				? undefined
				: manager.getSessionDir?.();
		const sessions = await manager.listAll(dir);
		const seen = new Set<string>();
		const out: string[] = [];
		for (const session of sessions) {
			const cwd = typeof session.cwd === "string" ? session.cwd : "";
			if (!cwd || seen.has(cwd) || cwd === ctx.cwd) continue;
			if (!isDirectory(cwd)) continue;
			seen.add(cwd);
			out.push(cwd);
		}
		return out.sort();
	} catch {
		return [];
	}
}

/** All move records on a branch, oldest first. */
function moveHistory(branchEntries: readonly unknown[]): MoveRecord[] {
	const rows: MoveRecord[] = [];
	for (const entry of branchEntries) {
		if (!entry || typeof entry !== "object") continue;
		const record = entry as { type?: unknown; customType?: unknown; data?: unknown };
		if (record.type !== "custom" || record.customType !== MOVE_ENTRY_TYPE) continue;
		const single = readLastMove([entry]);
		if (single) rows.push(single);
	}
	return rows;
}
