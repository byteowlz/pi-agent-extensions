import { basename } from "node:path";
import { type HistorySearchConfig, resolveSessionsBase } from "./config.js";
import { branchScopeSessionIds, listBranchesInProject, listProjectDirs, prettyProject, projectDir } from "./indexer.js";
import { type RecallParams, type RecallReport, searchRecall } from "./recall.js";

export interface SearchContext {
	cwd: string;
	sessionId: string | null;
}
/** Runs only in the history process in production. No Pi context crosses IPC. */
export async function searchReport(ctx: SearchContext, config: HistorySearchConfig, params: RecallParams): Promise<RecallReport> {
	const base = resolveSessionsBase(config);
	const currentDir = projectDir(base, ctx.cwd);
	const scope = params.scope ?? "project";
	const currentId = ctx.sessionId;
	const exclude = config.excludeCurrentSession && scope !== "current-branch" ? currentId : null;
	let allowed: Set<string> | undefined;
	if (scope !== "all" && scope !== "project") {
		const listing = listBranchesInProject(currentDir, currentId, config.branchAliases);
		allowed = branchScopeSessionIds(
			listing.branches,
			listing.currentBranchId,
			scope as "current-tree" | "current-branch" | "siblings" | "ancestors" | "descendants"
		);
	}
	const dirs =
		scope === "all"
			? listProjectDirs(base).filter(
					(dir) => !params.project || prettyProject(basename(dir)).toLowerCase().includes(params.project.toLowerCase())
				)
			: [currentDir];
	const report = await searchRecall(
		dirs.map((dir) => ({ dir, current: dir === currentDir, allowed })),
		config,
		params,
		exclude
	);
	if (params.verbose) {
		for (const dir of dirs) {
			const branches = listBranchesInProject(dir, currentId, config.branchAliases).branches;
			for (const hit of report.hits) hit.branch ??= branches.find((b) => b.branchId === hit.sessionId);
		}
	}
	return report;
}
