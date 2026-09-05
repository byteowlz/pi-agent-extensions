import { readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { HistorySearchConfig } from "./config.js";
import {
	type ExtractedMessage,
	type HistoryHit,
	type RoleFilter,
	extractMessages,
	listSessionFiles,
	prettyProject,
	regexShaped,
	roleAllowed,
	searchProject,
	sessionIdFromFilename,
	timestampFromFilename,
} from "./indexer.js";

export type SearchMode = "auto" | "grep" | "exact" | "regex" | "fts";
export interface RecallParams {
	query?: string;
	scope?: string;
	project?: string;
	limit?: number;
	roleFilter?: RoleFilter;
	mode?: SearchMode;
	maxTotalChars?: number;
	verbose?: boolean;
}
export interface RecallHit extends HistoryHit {
	completeness: "unknown";
	matches: { role: string; msgIndex: number; snippet: string; matchPosition: number }[];
}
export interface RecallReport {
	hits: RecallHit[];
	attempts: string[];
	warnings: string[];
	scope: string;
	completeness: "unknown";
	absence_is_global: false;
	truncated: boolean;
	filters: { project?: string; roleFilter: RoleFilter; evidenceRoles: string };
	limits: { candidateSessionsPerProject: number; passagesPerMessage: number };
}
export interface RecallProject {
	dir: string;
	current: boolean;
	allowed?: Set<string>;
}
const CANDIDATES = 20;
const STOP = new Set(
	"what which where when how did do does we i a an the for about in on of to is was it set session sessions discuss discussed decide decided setup".split(
		" "
	)
);
export function recallTerms(query: string): string[] {
	return [
		...new Set(
			query
				.toLowerCase()
				.split(/[^\p{L}\p{N}_]+/u)
				.filter((t) => t && !STOP.has(t))
		),
	];
}
export function isNeedle(query: string): boolean {
	return (
		/[@/\\_=.:\-]/.test(query) ||
		regexShaped(query) ||
		/^"/.test(query) ||
		/[a-z][A-Z]/.test(query) ||
		/^[A-Z][A-Z0-9 ]+$/.test(query)
	);
}
function escapePattern(pattern: string): string {
	return pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function evidenceWindow(text: string, position: number, max = 300): string {
	const start = Math.max(0, position - 60);
	return text.slice(start, start + max);
}

function passagePositions(text: string, mentions: RegExp, fields: RegExp | null, literal: boolean): number[] {
	mentions.lastIndex = 0;
	let first = mentions.exec(text);
	while (first && !first[0]) {
		mentions.lastIndex = first.index + 1;
		first = mentions.exec(text);
	}
	if (!first) return [];
	const positions = [first.index];
	if (literal) return positions;
	for (const match of text.matchAll(new RegExp(mentions.source, "gi"))) {
		positions.push(match.index);
		if (positions.length >= 64) break;
	}
	if (fields) fields.lastIndex = 0;
	if (fields)
		for (const match of text.matchAll(fields)) {
			positions.push(match.index);
			if (positions.length >= 192) break;
		}
	return positions;
}

function passageScore(snippet: string, terms: string[], fields: RegExp | null, role: string): number {
	const lower = snippet.toLowerCase();
	const coverage = terms.filter((t) => lower.includes(t)).length;
	if (fields) fields.lastIndex = 0;
	const assignment = fields?.exec(snippet)?.[0];
	const field = assignment ? (/[=]|["']\s*:/.test(assignment) ? 3 : 2) : 0;
	const preference = field && role === "toolResult" ? 0.2 : role === "assistant" ? 0.1 : 0;
	return coverage + field + preference;
}

/** Query-keyed field assignments and dense passages beat incidental mentions.
 * Caps limit CPU, not the length of text searched for field values. */
export function bestEvidence(messages: ExtractedMessage[], query: string, filter: RoleFilter, literal?: RegExp) {
	const terms = recallTerms(query);
	const alternatives = terms.map(escapePattern).join("|");
	const mentions = literal ?? (alternatives ? new RegExp(alternatives, "gi") : null);
	const fields = alternatives
		? new RegExp(`[a-z0-9_.-]*(?:${alternatives})[a-z0-9_.-]*["']?\\s*[:=]\\s*["']?[^\\s"']+`, "gi")
		: null;
	let best: { role: string; msgIndex: number; snippet: string; matchPosition: number; score: number } | undefined;
	for (const [msgIndex, m] of messages.entries()) {
		if (!roleAllowed(m.role, filter) || !mentions) continue;
		for (const position of passagePositions(m.text, mentions, fields, !!literal)) {
			const snippet = evidenceWindow(m.text, position);
			const score = passageScore(snippet, terms, literal ? null : fields, m.role);
			if (!best || score > best.score || (score === best.score && msgIndex > best.msgIndex)) {
				best = { role: m.role, msgIndex, snippet, matchPosition: position, score };
			}
		}
	}
	return best;
}
function readHit(file: string, query: string, filter: RoleFilter, literal?: RegExp): { hit: RecallHit; score: number } | null {
	const { messages, firstUserMessage, sessionName } = extractMessages(readFileSync(file, "utf8"));
	const best = bestEvidence(messages, query, filter, literal);
	if (!best) return null;
	const { score, ...match } = best;
	// Topic context can live elsewhere in the conversation, away from its field value.
	const terms = recallTerms(query);
	const coverage = terms.filter((t) => messages.some((m) => m.text.toLowerCase().includes(t))).length;
	return {
		score: score + coverage,
		hit: {
			sessionId: sessionIdFromFilename(basename(file)),
			project: prettyProject(basename(join(file, ".."))),
			timestamp: timestampFromFilename(basename(file)),
			title: firstUserMessage,
			sessionName,
			completeness: "unknown",
			matches: [match],
		},
	};
}
function eligibleFiles(project: RecallProject, exclude: string | null): string[] {
	return listSessionFiles(project.dir)
		.filter((f) => {
			const id = sessionIdFromFilename(f);
			return id !== exclude && (!project.allowed || project.allowed.has(id));
		})
		.map((f) => join(project.dir, f));
}

type ProjectFiles = { project: RecallProject; files: string[] }[];

async function indexedCandidates(
	files: ProjectFiles,
	queries: string[],
	config: HistorySearchConfig,
	roles: RoleFilter,
	refresh: boolean
) {
	const selected: { paths: string[]; candidates: HistoryHit[] }[] = [];
	for (const { project, files: paths } of files) {
		if (!paths.length) continue;
		const allowed = new Set(paths.map((f) => sessionIdFromFilename(basename(f))));
		const candidates: HistoryHit[] = [];
		for (const query of queries) {
			if (query)
				candidates.push(
					...(await searchProject(
						project.dir,
						query,
						{ ...config, includeToolResults: true },
						CANDIDATES,
						refresh && project.current,
						roles,
						allowed
					))
				);
		}
		// Deduplicate before the cap, otherwise repeated per-term hits consume slots.
		selected.push({ paths, candidates: [...new Map(candidates.map((h) => [h.sessionId, h])).values()] });
	}
	return selected;
}

async function ftsPaths(
	files: ProjectFiles,
	query: string,
	config: HistorySearchConfig,
	roles: RoleFilter,
	report: RecallReport
): Promise<string[]> {
	report.attempts.push("fts");
	const terms = recallTerms(query);
	let selected = await indexedCandidates(files, [terms.join(" ")], config, roles, true);
	if (!selected.some((p) => p.candidates.length) && terms.length) {
		report.attempts.push("fts_terms");
		selected = await indexedCandidates(files, terms, config, roles, false);
	}
	return selected.flatMap(({ paths, candidates }) => {
		if (candidates.length >= CANDIDATES)
			report.warnings.push("FTS candidate cap reached; narrow the query or use exact/grep for literal recall.");
		const ids = new Set(candidates.slice(0, CANDIDATES).map((h) => h.sessionId));
		return paths.filter((f) => ids.has(sessionIdFromFilename(basename(f))));
	});
}

function recentHit(file: string, roles: RoleFilter): { hit: RecallHit; score: number } | null {
	const { messages, firstUserMessage, sessionName } = extractMessages(readFileSync(file, "utf8"));
	const msgIndex = messages.findIndex((m) => !!m.text && roleAllowed(m.role, roles));
	if (msgIndex < 0) return null;
	const m = messages[msgIndex];
	return {
		score: statSync(file).mtimeMs,
		hit: {
			sessionId: sessionIdFromFilename(basename(file)),
			project: prettyProject(basename(join(file, ".."))),
			timestamp: timestampFromFilename(basename(file)),
			title: firstUserMessage,
			sessionName,
			completeness: "unknown",
			matches: [{ role: m.role, msgIndex, snippet: m.text.slice(0, 300), matchPosition: 0 }],
		},
	};
}

function scanNeedle(
	query: string,
	mode: SearchMode,
	paths: string[],
	scan: (paths: string[], matcher?: RegExp) => void,
	hasHits: () => boolean,
	report: RecallReport
): void {
	const regex = mode === "regex";
	const pattern = mode === "exact" ? query : query.replace(/^"([\s\S]*)"$/, "$1");
	report.attempts.push(regex ? "regex" : "literal");
	scan(paths, new RegExp(regex ? pattern : escapePattern(pattern), "g"));
	if (hasHits() || !["auto", "grep"].includes(mode) || !regexShaped(query)) return;
	report.attempts.push("regex");
	try {
		scan(paths, new RegExp(query, "g"));
	} catch {
		report.warnings.push("Invalid regex fallback; continuing with FTS.");
	}
}

function recentPaths(paths: string[], report: RecallReport): string[] {
	let unreadable = 0;
	const sorted = paths
		.flatMap((file) => {
			try {
				return [{ file, mtime: statSync(file).mtimeMs }];
			} catch {
				unreadable++;
				return [];
			}
		})
		.sort((a, b) => b.mtime - a.mtime);
	if (unreadable) report.warnings.push(`${unreadable} files could not be stat'ed; results are incomplete.`);
	return sorted.map((r) => r.file);
}

export async function searchRecall(
	projects: RecallProject[],
	config: HistorySearchConfig,
	params: RecallParams,
	exclude: string | null
): Promise<RecallReport> {
	const query = params.query ?? "";
	const mode = params.mode ?? "auto";
	const filter = params.roleFilter ?? "conversation";
	// Conversation is a ranking preference, not an evidence restriction. Other explicit roles are hard filters.
	const evidenceRoles = filter === "conversation" ? "all" : filter;
	const report: RecallReport = {
		hits: [],
		attempts: [],
		warnings: [],
		scope: params.scope ?? "project",
		completeness: "unknown",
		absence_is_global: false,
		truncated: false,
		filters: { project: params.project, roleFilter: filter, evidenceRoles },
		limits: { candidateSessionsPerProject: CANDIDATES, passagesPerMessage: 192 },
	};
	const limit = params.limit ?? config.maxResults;
	if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("limit must be an integer from 1 to 100");
	const scored: { hit: RecallHit; score: number }[] = [];
	const files = projects.map((p) => ({ project: p, files: eligibleFiles(p, exclude) }));
	let unreadable = 0;
	const scan = (paths: string[], matcher?: RegExp) => {
		for (const file of paths) {
			try {
				const result = query.trim() ? readHit(file, query, evidenceRoles, matcher) : recentHit(file, evidenceRoles);
				if (result) scored.push(result);
			} catch {
				unreadable++;
			}
		}
	};
	if (!query.trim()) {
		report.attempts.push("recent");
		for (const file of recentPaths(
			files.flatMap((p) => p.files),
			report
		)) {
			scan([file]);
			if (scored.length > limit) break;
		}
	} else if (mode !== "fts" && (mode !== "auto" || isNeedle(query))) {
		scanNeedle(
			query,
			mode,
			files.flatMap((p) => p.files),
			scan,
			() => scored.length > 0,
			report
		);
	}
	if (query.trim() && !scored.length && mode !== "exact" && mode !== "regex") {
		scan(await ftsPaths(files, query, config, evidenceRoles, report));
	}
	if (unreadable) report.warnings.push(`${unreadable} file reads failed; results are incomplete.`);
	if (report.attempts.includes("fts"))
		report.warnings.push("FTS candidates may use stale read-only indexes; use grep/exact to scan accessible message text.");
	scored.sort((a, b) => b.score - a.score || b.hit.timestamp.localeCompare(a.hit.timestamp));
	report.truncated = scored.length > limit;
	report.hits = scored.slice(0, limit).map((r) => r.hit);
	return report;
}

/** Budget the serialized envelope itself, never slice through JSON or an anchor. */
export function formatRecall(report: RecallReport, maxTotalChars = 3000): string {
	if (!Number.isInteger(maxTotalChars) || maxTotalChars < 1000 || maxTotalChars > 60000)
		throw new Error("maxTotalChars must be an integer from 1000 to 60000");
	const result = {
		...report,
		warnings: [...new Set(report.warnings)],
		hits: report.hits.map((h) => ({
			...h,
			title: h.title?.slice(0, 120) ?? null,
			sessionName: h.sessionName?.slice(0, 120) ?? null,
		})),
	};
	while (JSON.stringify(result).length > maxTotalChars && result.hits.length) {
		result.hits.pop();
		result.truncated = true;
	}
	if (JSON.stringify(result).length > maxTotalChars) {
		result.warnings = ["Metadata exceeded budget; narrow filters."];
		result.filters = { ...result.filters, project: result.filters.project?.slice(0, 120) };
	}
	return JSON.stringify(result);
}
