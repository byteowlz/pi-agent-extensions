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

import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
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
import { type PickRow, pickProject } from "./picker.js";
import { type Project, discoverProjects, expandHome, loadConfig, resolveMoveQuery } from "./projects.js";

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
	pi.registerCommand("move", {
		description:
			"Move this session to a project by fuzzy name: /move foxline, or /move (no argument) to pick from your configured project roots",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const tokens = args.trim().split(/\s+/).filter(Boolean);
			const force = tokens.includes("--force");
			const query = tokens
				.filter((token) => token !== "--force")
				.join(" ")
				.trim();

			// An explicit path is a path, not a project name.
			if (isPathArgument(query)) {
				await moveToPath(ctx, query, force);
				return;
			}
			await moveToProject(ctx, query, force);
		},
	});

	/** Move to a literal directory (the `/cwd` behavior, reachable from `/move`). */
	async function moveToPath(ctx: ExtensionCommandContext, query: string, force: boolean): Promise<void> {
		let target: string;
		try {
			target = resolveTargetCwd(query, ctx.cwd);
		} catch (error) {
			notify(ctx, `move: ${error instanceof Error ? error.message : String(error)}`, "error");
			return;
		}
		if (!isDirectory(target)) {
			notify(ctx, `move: target directory does not exist: ${shortenPath(target, 60)}`, "error");
			return;
		}
		try {
			await performMove(ctx, target, force);
		} catch (error) {
			notify(ctx, `move: ${error instanceof Error ? error.message : String(error)}`, "error");
		}
	}

	/** Resolve a project name against the configured roots, asking when unsure. */
	async function moveToProject(ctx: ExtensionCommandContext, query: string, force: boolean): Promise<void> {
		const config = loadConfig({ cwd: ctx.cwd, agentDir: agentDirOf(ctx) });
		const rows = withSessionDirs(ctx, config, discoverProjects(config));

		if (rows.length === 0) {
			const roots = config.roots.map((root) => shortenPath(expandHome(root), 40)).join(", ");
			const file = shortenPath(join(agentDirOf(ctx), "session-cwd.json"), 50);
			notify(ctx, `move: no projects found under ${roots}. Configure roots in ${file} or use /cwd <path>.`, "warning");
			return;
		}

		if (!query) {
			if (ctx.mode !== "tui") {
				const names = rows
					.slice(0, 8)
					.map((row) => row.name)
					.join(", ");
				notify(ctx, `move: the picker needs an interactive terminal; use /move <name> [--force]. Projects: ${names}`, "info");
				return;
			}
			const chosen = await pickProject(ctx.ui as never, { title: "Move this session to…", rows });
			if (!chosen) {
				notify(ctx, "move cancelled", "info");
				return;
			}
			await applyChosen(ctx, chosen.path, force);
			return;
		}

		const resolution = resolveMoveQuery(query, rows);
		if (resolution.kind === "unique") {
			await applyChosen(ctx, resolution.match.path, force);
			return;
		}
		if (resolution.kind === "ambiguous") {
			await handleAmbiguous(ctx, query, resolution.candidates, force);
			return;
		}
		const suggestions = resolution.suggestions.map((candidate) => candidate.name).filter(Boolean);
		const hint = suggestions.length > 0 ? ` — did you mean ${suggestions.join(", ")}?` : "";
		notify(ctx, `move: no project matches "${query}"${hint}`, "error");
	}

	/** Several plausible projects: ask, with the typed query pre-filled. */
	async function handleAmbiguous(
		ctx: ExtensionCommandContext,
		query: string,
		candidates: PickRow[],
		force: boolean
	): Promise<void> {
		if (ctx.mode !== "tui") {
			const names = candidates
				.slice(0, 8)
				.map((candidate) => candidate.name)
				.join(", ");
			notify(ctx, `move: "${query}" matches several projects: ${names}. Be more specific.`, "warning");
			return;
		}
		const chosen = await pickProject(ctx.ui as never, {
			title: `Which project did you mean by "${query}"?`,
			rows: candidates,
			initialQuery: query,
		});
		if (!chosen) {
			notify(ctx, "move cancelled", "info");
			return;
		}
		await applyChosen(ctx, chosen.path, force);
	}

	async function applyChosen(ctx: ExtensionCommandContext, path: string, force: boolean): Promise<void> {
		try {
			await performMove(ctx, path, force);
		} catch (error) {
			notify(ctx, `move: ${error instanceof Error ? error.message : String(error)}`, "error");
		}
	}

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

/** A query that names a directory instead of a project. */
function isPathArgument(query: string): boolean {
	return query.startsWith("/") || query.startsWith("~/") || query === ".." || query.startsWith("../") || query.startsWith("./");
}

/** Agent dir pi resolves extensions/config from. */
function agentDirOf(_ctx: ExtensionCommandContext): string {
	return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

/** Project rows plus (optionally) directories that already hold pi sessions. */
function withSessionDirs(ctx: ExtensionCommandContext, config: { includeSessionDirs: boolean }, projects: Project[]): PickRow[] {
	const rows: PickRow[] = projects.map((project) => ({
		...project,
		...(project.path === ctx.cwd ? { note: "current" } : {}),
	}));
	const known = new Set(rows.map((row) => row.path));
	const current = ctx.cwd;
	if (config.includeSessionDirs) {
		for (const dir of sessionCwdsSync(ctx.sessionManager)) {
			if (known.has(dir) || dir === current) continue;
			known.add(dir);
			rows.push({ name: basename(dir), path: dir, root: dirname(dir), note: "has sessions" });
		}
	}
	return rows.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}

/**
 * cwds that already hold pi sessions, read from the session directory tree.
 *
 * Directory names are lossy (`-` for `/`), so the authoritative cwd is taken
 * from the `cwd` field of a session header instead of being decoded back.
 * Bounded so a huge history cannot stall the picker.
 */
/** Sessions root to scan: the custom session dir when one is configured. */
function sessionsRootOf(manager: unknown): string | undefined {
	const typed = manager as { usesDefaultSessionDir?: () => boolean; getSessionDir?: () => string };
	try {
		const custom = typeof typed.usesDefaultSessionDir === "function" && !typed.usesDefaultSessionDir();
		const dir = typeof typed.getSessionDir === "function" ? typed.getSessionDir() : undefined;
		return custom && dir ? dir : join(agentDirOf(undefined as never), "sessions");
	} catch {
		return undefined;
	}
}

/** The cwd recorded in a session file's header, if readable. */
function headerCwd(file: string): string | undefined {
	try {
		const line = readFileSync(file, "utf-8").split("\n", 1)[0] ?? "";
		const header = JSON.parse(line) as { type?: string; cwd?: string };
		if (header.type === "session" && typeof header.cwd === "string") return header.cwd;
	} catch {
		// unreadable session: nothing to learn from it
	}
	return undefined;
}

/**
 * cwds that already hold pi sessions, read from the session directory tree.
 *
 * Directory names are lossy (`-` for `/`), so the authoritative cwd comes from
 * the header of a session file rather than from decoding the directory name.
 * Bounded so a huge history cannot stall the picker.
 */
function sessionCwdsSync(manager: unknown): string[] {
	const root = sessionsRootOf(manager);
	if (!root) return [];
	let entries: string[];
	try {
		entries = readdirSync(root);
	} catch {
		return [];
	}
	const out: string[] = [];
	const seen = new Set<string>();
	for (const entry of entries.slice(0, 300)) {
		const dir = join(root, entry);
		let files: string[];
		try {
			files = readdirSync(dir).filter((name) => name.endsWith(".jsonl"));
		} catch {
			continue;
		}
		for (const file of files.slice(0, 3)) {
			const cwd = headerCwd(join(dir, file));
			if (!cwd) continue;
			if (!seen.has(cwd) && isDirectory(cwd)) {
				seen.add(cwd);
				out.push(cwd);
			}
			break;
		}
	}
	return out.sort();
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
