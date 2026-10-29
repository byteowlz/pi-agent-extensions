/**
 * Project discovery and fuzzy matching for `/move`.
 *
 * The move itself lives in move.ts. This module only answers "which directory
 * did the user mean?": it reads the configured project roots, lists candidate
 * projects, and scores them against a query so `/move foxline` works without
 * typing a full path.
 *
 * Config (first match wins):
 *   ./.pi/session-cwd.json
 *   <agentDir>/session-cwd.json          (default ~/.pi/agent/session-cwd.json)
 *
 *   {
 *     "roots": ["~/work", "~/byteowlz"],
 *     "depth": 1,
 *     "includeSessionDirs": true
 *   }
 *
 * `depth` is how many directory levels below each root count as a project
 * (1 = direct children, 2 = children and grandchildren).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

export interface MoveConfig {
	roots: string[];
	depth: number;
	/** Merge in directories that already contain pi sessions. */
	includeSessionDirs: boolean;
}

/** Directories that are never projects themselves. */
const SKIP_NAMES = new Set([
	"node_modules",
	".git",
	".hg",
	".svn",
	"target",
	"dist",
	"build",
	".next",
	".venv",
	"venv",
	"__pycache__",
	".cache",
	".idea",
	".vscode",
]);

export const DEFAULT_CONFIG: MoveConfig = {
	roots: ["~/work", "~/byteowlz"],
	depth: 1,
	includeSessionDirs: true,
};

export function expandHome(path: string): string {
	if (path === "~") return homedir();
	if (path.startsWith("~/")) return join(homedir(), path.slice(2));
	return path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Normalize a parsed config file, ignoring anything malformed. */
export function normalizeConfig(raw: unknown, base: MoveConfig = DEFAULT_CONFIG): MoveConfig {
	if (!isRecord(raw)) return { ...base };
	const roots = Array.isArray(raw.roots)
		? raw.roots.filter((value): value is string => typeof value === "string" && value.trim() !== "")
		: base.roots;
	const depth =
		typeof raw.depth === "number" && Number.isFinite(raw.depth) && raw.depth >= 1
			? Math.min(4, Math.floor(raw.depth))
			: base.depth;
	const includeSessionDirs = typeof raw.includeSessionDirs === "boolean" ? raw.includeSessionDirs : base.includeSessionDirs;
	return { roots: roots.length > 0 ? roots : base.roots, depth, includeSessionDirs };
}

/** Load the config; missing or broken files fall back to the defaults. */
export function loadConfig(options: { cwd?: string; agentDir?: string } = {}): MoveConfig {
	const candidates = [
		...(options.cwd ? [join(options.cwd, ".pi", "session-cwd.json")] : []),
		join(options.agentDir ?? join(homedir(), ".pi", "agent"), "session-cwd.json"),
	];
	for (const file of candidates) {
		if (!existsSync(file)) continue;
		try {
			return normalizeConfig(JSON.parse(readFileSync(file, "utf-8")));
		} catch {
			// malformed config must not block the command
		}
	}
	return { ...DEFAULT_CONFIG };
}

export interface Project {
	/** Directory name, used for fuzzy matching. */
	name: string;
	/** Absolute path. */
	path: string;
	/** Root it was found under, for display. */
	root: string;
}

function safeDirectories(dir: string): string[] {
	try {
		return readdirSync(dir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !SKIP_NAMES.has(entry.name))
			.map((entry) => join(dir, entry.name));
	} catch {
		return [];
	}
}

/** Directories under the configured roots that look like projects. */
export function discoverProjects(config: MoveConfig): Project[] {
	const seen = new Set<string>();
	const out: Project[] = [];

	const walk = (root: string, dir: string, level: number): void => {
		for (const child of safeDirectories(dir)) {
			let real: string;
			try {
				real = statSync(child).isDirectory() ? resolve(child) : "";
			} catch {
				continue;
			}
			if (!real || seen.has(real)) continue;
			seen.add(real);
			out.push({ name: basename(real), path: real, root });
			if (level < config.depth) walk(root, real, level + 1);
		}
	};

	for (const root of config.roots) {
		const expanded = expandHome(root);
		if (!existsSync(expanded)) continue;
		try {
			if (!statSync(expanded).isDirectory()) continue;
		} catch {
			continue;
		}
		walk(resolve(expanded), resolve(expanded), 1);
	}
	return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Score how well a query matches a project, 0 = no match. Exported for tests. */
export function scoreProject(query: string, project: Project): number {
	const q = query.trim().toLowerCase();
	if (!q) return 1;
	const name = project.name.toLowerCase();
	const full = project.path.toLowerCase();

	if (name === q) return 1000;
	if (name.startsWith(q)) return 900 - Math.min(50, name.length - q.length);
	const index = name.indexOf(q);
	if (index !== -1) return 800 - Math.min(50, index);

	// Subsequence on the name: "fox" matches "foxline", "fxln" too.
	const sub = subsequenceScore(q, name);
	if (sub > 0) return 500 + sub;
	if (full.includes(`/${q}`)) return 400;
	return 0;
}

/** Fraction-ish score for a subsequence match, 0 when the query is not a subsequence. */
function subsequenceScore(query: string, target: string): number {
	let qi = 0;
	let gaps = 0;
	let lastHit = -1;
	for (let ti = 0; ti < target.length && qi < query.length; ti++) {
		if (target[ti] === query[qi]) {
			if (lastHit !== -1) gaps += ti - lastHit - 1;
			lastHit = ti;
			qi++;
		}
	}
	if (qi < query.length) return 0;
	// Denser matches score higher; keep the result below the substring tier.
	return Math.max(1, 100 - gaps * 2);
}

export interface ScoredProject extends Project {
	score: number;
}

export type MoveResolution =
	| { kind: "unique"; match: ScoredProject }
	| { kind: "ambiguous"; candidates: ScoredProject[] }
	| { kind: "none"; suggestions: ScoredProject[] };

/** A score this high (exact or prefix) is trusted without asking. */
const CONFIDENT = 700;
/** The runner-up must be this much worse before we trust the top match. */
const CONFIDENT_MARGIN = 120;

/**
 * Resolve a query against candidates.
 *
 * - `unique`: one clear winner (exact, prefix, or a clear margin) — move without
 *   a second question.
 * - `ambiguous`: several plausible projects — ask with a picker.
 * - `none`: nothing matched; `suggestions` holds the closest names for the error.
 */
export function resolveMoveQuery(query: string, projects: Project[]): MoveResolution {
	const scored = projects
		.map((project) => ({ ...project, score: scoreProject(query, project) }))
		.filter((project) => project.score > 0)
		.sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path));

	if (scored.length === 0) {
		return { kind: "none", suggestions: nearest(query, projects) };
	}
	const best = scored[0] as ScoredProject;
	const runnerUp = scored[1];
	if (best.score >= CONFIDENT && (!runnerUp || best.score - runnerUp.score >= CONFIDENT_MARGIN)) {
		return { kind: "unique", match: best };
	}
	return { kind: "ambiguous", candidates: scored.slice(0, 30) };
}

/** Cheap "did you mean" list: shared leading characters, then name length. */
export function nearest(query: string, projects: Project[], limit = 3): ScoredProject[] {
	const q = query.trim().toLowerCase();
	const shared = (value: string): number => {
		const target = value.toLowerCase();
		let count = 0;
		while (count < q.length && count < target.length && target[count] === q[count]) count++;
		return count;
	};
	return projects
		.map((project) => ({ ...project, score: shared(project.name) * 10 - Math.abs(project.name.length - q.length) }))
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
}
