/**
 * The classification schema — the durable part of this extension.
 *
 * A "turn card" answers, for one finished agent turn, the questions a human (or
 * another agent) needs to triage it quickly: which project is this really about,
 * what kind of work happened, how far it got, whether it needs me, how
 * consequential it was, and what it produced.
 *
 * Design rules (they matter more than the individual questions):
 *
 * 1. **Every question has a closed answer set.** Decision models (Jeff / D3 /
 *    Clef) read a fixed label per option — they cannot answer free text. A closed
 *    set also makes the card comparable across sessions and cheap to render as a
 *    row in a list.
 * 2. **One question = one read.** Cost and latency scale per question, so the
 *    schema stays small (7) and each question earns its place.
 * 3. **Answers are rendered, never generated.** The human-readable one-liner is
 *    composed deterministically from the answers, so it cannot hallucinate.
 * 4. **Option ids are stable and short.** They are persisted; renaming one is a
 *    breaking change to stored cards.
 * 5. **Uncertainty is an option, not a failure.** `unclear` exists where a
 *    honest "I don't know" is better than a forced pick.
 *
 * The same schema renders to both supported APIs:
 *   - TypeSafe System One (`/v1/systemone`): `choice` | `noul` | `score`
 *   - OpenAI Decisions (`/v1/decisions`): `choice` | `predicate` | `score`
 */

export type QuestionKind = "choice" | "boolean" | "score";

export interface ChoiceOption {
	/** Stable id (persisted). */
	id: string;
	/** Human label shown in lists. */
	label: string;
	/** Optional description handed to the model (improves separation). */
	hint?: string;
}

export interface QuestionSpec {
	/** Stable question id (persisted, keyed in answers). */
	id: string;
	kind: QuestionKind;
	/** What the model is asked. Kept short: it is prompt, not documentation. */
	instructions: string;
	/** For `choice`. */
	options?: ChoiceOption[];
	/** For `score`: ordered levels, lowest first. */
	levels?: ChoiceOption[];
	/**
	 * For `boolean`: the meaning of each side. Servers differ here — some accept
	 * `criteria: null`, others reject it and want descriptions — so both sides
	 * always carry text and `null` is never sent.
	 */
	yesHint?: string;
	noHint?: string;
}

/** The kind of work the turn mostly did. */
export const ACTIVITY: ChoiceOption[] = [
	{ id: "implement", label: "implement", hint: "writing or changing code/features" },
	{ id: "debug", label: "debug", hint: "diagnosing a failure, crash or wrong behaviour" },
	{ id: "test", label: "test", hint: "writing, fixing or running tests" },
	{ id: "review", label: "review", hint: "reading or verifying existing work" },
	{ id: "research", label: "research", hint: "searching, reading docs or exploring a codebase" },
	{ id: "plan", label: "plan", hint: "designing, discussing approach, architecture decisions" },
	{ id: "refactor", label: "refactor", hint: "restructuring without new behaviour" },
	{ id: "ops", label: "ops", hint: "deploying, infra, servers, system administration" },
	{ id: "docs", label: "docs", hint: "writing documentation, notes or changelogs" },
	{ id: "setup", label: "setup", hint: "installing, configuring or migrating tooling" },
	{ id: "chat", label: "chat", hint: "answering a question, no artifact produced" },
];

/** How far the work got by the end of the turn. */
export const STATUS: ChoiceOption[] = [
	{ id: "exploring", label: "exploring", hint: "looking around, nothing changed yet" },
	{ id: "implementing", label: "implementing", hint: "mid-change, still in progress" },
	{ id: "verifying", label: "verifying", hint: "checking that work done actually holds" },
	{ id: "blocked", label: "blocked", hint: "cannot proceed without something" },
	{ id: "done", label: "done", hint: "the requested work is complete" },
];

/** Whether the turn needs the user, and what kind. */
export const ATTENTION: ChoiceOption[] = [
	{ id: "none", label: "none", hint: "no input needed, safe to ignore" },
	{ id: "decision", label: "decision", hint: "a choice between approaches is needed" },
	{ id: "approval", label: "approval", hint: "a risky or irreversible action needs a go-ahead" },
	{ id: "missing_info", label: "missing info", hint: "a credential, path, requirement or answer is missing" },
	{ id: "review", label: "review", hint: "work is complete and awaiting a human look" },
];

/** How consequential the turn's actions were. */
export const RISK: ChoiceOption[] = [
	{ id: "none", label: "none", hint: "only reads, discussion or local edits" },
	{ id: "low", label: "low", hint: "reversible local changes" },
	{ id: "medium", label: "medium", hint: "commits, config changes, installs" },
	{ id: "high", label: "high", hint: "deploys, deletions, migrations, remote servers" },
	{ id: "critical", label: "critical", hint: "production, secrets, credentials, destructive commands" },
];

/** What the turn produced. */
export const ARTIFACT: ChoiceOption[] = [
	{ id: "code", label: "code" },
	{ id: "test", label: "test" },
	{ id: "doc", label: "doc" },
	{ id: "config", label: "config" },
	{ id: "issue", label: "issue", hint: "an issue, ticket or note in a tracker" },
	{ id: "data", label: "data", hint: "generated data, media or artifacts" },
	{ id: "none", label: "none", hint: "no artifact" },
];

/** How much of the workspace the turn spanned. */
export const SCOPE: ChoiceOption[] = [
	{ id: "single", label: "single repo" },
	{ id: "multi", label: "several repos" },
	{ id: "noncode", label: "no repo", hint: "not a code workspace: notes, infra, chat, ops" },
];

/** Answer id used when the model cannot tell; also the fallback for bad answers. */
export const UNCLEAR = "unclear";

/**
 * Error categories.
 *
 * This is the strongest case for a decision model in the whole schema: provider
 * error strings are diverse and churn constantly ("529 overloaded",
 * "stream ended without finish_reason", "invalid_api_key", "context_length_exceeded",
 * "ECONNRESET"), and hand-written regexes rot. A small model maps the raw message
 * onto a stable little taxonomy, which is what downstream automation needs:
 * retry, re-auth, trim context, or ask the user.
 */
export const ERROR_KIND: ChoiceOption[] = [
	{ id: "provider_overloaded", label: "provider overloaded", hint: "capacity, 529/503, overloaded or busy" },
	{ id: "rate_limited", label: "rate limited", hint: "429, quota, too many requests, spend limit" },
	{ id: "auth", label: "auth", hint: "401/403, invalid or expired key, permission denied, OAuth" },
	{ id: "context_overflow", label: "context overflow", hint: "context length or token limit exceeded" },
	{ id: "network", label: "network", hint: "DNS, connect, TLS, timeout, socket reset" },
	{ id: "content_filter", label: "content filtered", hint: "refusal, safety or policy block" },
	{ id: "invalid_request", label: "invalid request", hint: "400: malformed tool call, unsupported parameter or input" },
	{ id: "bad_response", label: "bad response", hint: "empty, unparseable, stream ended without finish_reason" },
	{ id: "tool_failed", label: "tool failed", hint: "a command, test or file operation failed" },
	{ id: "cancelled", label: "cancelled", hint: "aborted by the user" },
	{ id: UNCLEAR, label: "unclear", hint: "the message does not identify the cause" },
];

export interface ProjectCandidate {
	/** Stable id, e.g. "pi-agent-extensions". */
	id: string;
	/** Optional extra steer for the model (path, remote, what the project is). */
	hint?: string;
}

/**
 * Build the full question set.
 *
 * `projects` is dynamic: the candidate list is derived per session (cwd name, git
 * remotes, configured projects), because "which project" is only answerable
 * against the projects that actually exist. When candidates are unknown the
 * question is dropped and only `project_mismatch` remains meaningful.
 */
export interface BuildOptions {
	/** Include the error questions. They are meaningless on a clean turn. */
	hasError?: boolean;
}

export function buildQuestions(projects: ProjectCandidate[], options: BuildOptions = {}): QuestionSpec[] {
	const questions: QuestionSpec[] = [];

	if (projects.length > 0) {
		// System One allows at most 26 options per choice, and the model needs a
		// token-friendly label per option: cap hard and keep `unclear` last.
		const capped = projects.slice(0, 24);
		questions.push({
			id: "project",
			kind: "choice",
			instructions: "Which project does this work belong to?",
			options: [
				...capped.map((project) => ({ id: project.id, label: project.id, hint: project.hint })),
				{ id: "other", label: "other", hint: "a project not in this list" },
				{ id: UNCLEAR, label: "unclear", hint: "cannot tell from the turn" },
			],
		});
	}

	questions.push(
		{
			id: "project_mismatch",
			kind: "boolean",
			instructions:
				"Is the work actually about a different project than the working directory suggests (for example editing a shared tool while working in another repo)?",
			yesHint: "the work belongs to a different project than the cwd",
			noHint: "the work belongs to the project of the cwd",
		},
		{
			id: "activity",
			kind: "choice",
			instructions: "What kind of work did this turn mostly do?",
			options: ACTIVITY,
		},
		{
			id: "status",
			kind: "choice",
			instructions: "How far did the work get by the end of this turn?",
			options: STATUS,
		},
		{
			id: "attention",
			kind: "choice",
			instructions: "Does this turn need the user, and what kind of input?",
			options: ATTENTION,
		},
		{
			id: "risk",
			kind: "score",
			instructions: "How consequential were the actions taken in this turn?",
			levels: RISK,
		},
		{
			id: "artifact",
			kind: "choice",
			instructions: "What did this turn produce?",
			options: ARTIFACT,
		},
		{
			id: "scope",
			kind: "choice",
			instructions: "How much of the workspace did this turn touch?",
			options: SCOPE,
		}
	);

	// Only asked when the turn actually failed: the error text is in the state.
	if (options.hasError) {
		questions.push(
			{
				id: "error_kind",
				kind: "choice",
				instructions: "What kind of failure was this turn's error?",
				options: ERROR_KIND,
			},
			{
				id: "error_transient",
				kind: "boolean",
				instructions: "Would a plain retry plausibly succeed without any change?",
				yesHint: "transient: overload, rate limit, network blip",
				noHint: "needs a change: credentials, context size, input, a bug",
			}
		);
	}

	return questions;
}

// ---------------------------------------------------------------------------
// Rendering to each API
// ---------------------------------------------------------------------------

export interface SystemOneQuestion {
	type: "choice" | "noul" | "score";
	instructions: string;
	criteria: Record<string, string | null> | string[] | { true?: string; false?: string } | null;
}

export interface DecisionsQuestion {
	type: "choice" | "predicate" | "score";
	name: string;
	instructions?: string;
	choices?: Array<{ value: string }>;
	levels?: Array<{ label: string }>;
}

function choiceCriteria(options: ChoiceOption[]): Record<string, string | null> {
	const criteria: Record<string, string | null> = {};
	for (const option of options) criteria[option.id] = option.hint ?? null;
	return criteria;
}

/**
 * Render to TypeSafe System One.
 *
 * `instructions` is optional because the D3 family returns 400 for it (their
 * prompt is fixed by the checkpoint) — the caller decides via `includeInstructions`.
 */
export function toSystemOneQuestions(
	questions: QuestionSpec[],
	options: { includeInstructions?: boolean } = {}
): Record<string, SystemOneQuestion> {
	const includeInstructions = options.includeInstructions ?? true;
	const rendered: Record<string, SystemOneQuestion> = {};
	for (const question of questions) {
		const base = includeInstructions ? { instructions: question.instructions } : {};
		if (question.kind === "choice") {
			rendered[question.id] = { type: "choice", ...base, criteria: choiceCriteria(question.options ?? []) };
		} else if (question.kind === "boolean") {
			// noul is a yes/no read. Always send both descriptions: a null criteria
			// is rejected by some System One servers ("expected JSON object").
			rendered[question.id] = {
				type: "noul",
				...base,
				criteria: { true: question.yesHint ?? "yes", false: question.noHint ?? "no" },
			};
		} else {
			rendered[question.id] = {
				type: "score",
				...base,
				criteria: (question.levels ?? []).map((level) => level.id),
			};
		}
	}
	return rendered;
}

/** Render to the OpenAI Decisions API shape (`questions` is an array). */
export function toDecisionsQuestions(
	questions: QuestionSpec[],
	options: { includeInstructions?: boolean } = {}
): DecisionsQuestion[] {
	const includeInstructions = options.includeInstructions ?? true;
	return questions.map((question) => {
		const instructions = includeInstructions ? { instructions: question.instructions } : {};
		if (question.kind === "choice") {
			return {
				type: "choice" as const,
				name: question.id,
				...instructions,
				choices: (question.options ?? []).map((option) => ({ value: option.id })),
			};
		}
		if (question.kind === "boolean") {
			return { type: "predicate" as const, name: question.id, ...instructions };
		}
		return {
			type: "score" as const,
			name: question.id,
			...instructions,
			levels: (question.levels ?? []).map((level) => ({ label: level.id })),
		};
	});
}

// ---------------------------------------------------------------------------
// Interpreting answers
// ---------------------------------------------------------------------------

export interface AnswerValue {
	/** Answer id (choice option id, score level id, "yes"/"no" for boolean). */
	value: string;
	/** Model's probability for that answer, when reported. */
	confidence?: number;
	/** All option probabilities, when reported. */
	probabilities?: Record<string, number>;
}

export type AnswerMap = Record<string, AnswerValue>;

/** Look up a question spec by id across the schema. */
export function findQuestion(questions: QuestionSpec[], id: string): QuestionSpec | undefined {
	return questions.find((question) => question.id === id);
}

/**
 * Convert a score answer (expected level index) into the nearest level id.
 * Score backs a continuous value, so 0.6 between "none"/"low" rounds up to "low".
 */
export function scoreLevelId(question: QuestionSpec, score: number): string {
	const levels = question.levels ?? [];
	if (levels.length === 0) return UNCLEAR;
	const index = Math.min(levels.length - 1, Math.max(0, Math.round(score)));
	return levels[index]?.id ?? UNCLEAR;
}

// ---------------------------------------------------------------------------
// The rendered card
// ---------------------------------------------------------------------------

export interface TurnCardAnswers extends AnswerMap {
	project?: AnswerValue;
	project_mismatch?: AnswerValue;
	activity?: AnswerValue;
	status?: AnswerValue;
	attention?: AnswerValue;
	risk?: AnswerValue;
	artifact?: AnswerValue;
	scope?: AnswerValue;
}

export interface TurnCard {
	version: 1;
	/** ISO timestamp of when the card was produced. */
	at: string;
	/** Session the card belongs to. */
	sessionId: string;
	/** Session file at classification time. */
	sessionFile?: string;
	/** Working directory of the session. */
	cwd: string;
	/** Turn index within this session (1-based). */
	turn: number;
	/** Which API/model produced it. */
	source: { api: "systemone" | "decisions"; model: string; endpoint: string; ms: number };
	answers: TurnCardAnswers;
	/** Human one-liner composed from the answers (never generated). */
	line: string;
	/** True when every low-confidence answer was left as `unclear`. */
	lowConfidence?: boolean;
}

const _CONFIDENCE_FLOOR = 0.4;

/** Answer ids that mean "no signal"; they are dropped from the rendered line. */
const SILENT = new Set(["unclear", "none", "noncode", "other"]);

/**
 * Compose the human-readable line. Deliberately dumb: it only joins answer
 * labels, so it cannot invent content, and unknown answers simply disappear.
 */
export function renderLine(answers: TurnCardAnswers, questions?: QuestionSpec[]): string {
	const parts: string[] = [];
	const label = (_id: string, questionId: string): string | undefined => {
		const answer = answers[questionId];
		if (!answer || SILENT.has(answer.value) || answer.value === UNCLEAR) return undefined;
		const question = questions ? findQuestion(questions, questionId) : undefined;
		const pool = question?.options ?? question?.levels;
		const option = pool?.find((candidate) => candidate.id === answer.value);
		return option?.label ?? answer.value;
	};

	// Project first: it is the identity of the card.
	const project = label("project", "project");
	const mismatch = answers.project_mismatch?.value === "yes";
	if (project) parts.push(mismatch ? `${project} (cwd differs)` : project);

	const activity = label("activity", "activity");
	if (activity) parts.push(activity);

	const status = label("status", "status");
	if (status) parts.push(status);

	const artifact = label("artifact", "artifact");
	if (artifact) parts.push(artifact);

	const risk = label("risk", "risk");
	if (risk && risk !== "none" && risk !== "low") parts.push(`risk ${risk}`);

	const attention = label("attention", "attention");
	if (attention) parts.push(`needs ${attention}`);

	const errorKind = label("error_kind", "error_kind");
	if (errorKind) {
		const transient = answers.error_transient?.value === "yes";
		parts.push(`error ${errorKind}${transient ? " (retryable)" : ""}`);
	}

	return parts.join(" · ");
}

/** True when the card carries no usable signal at all. */
export function isUnclassified(card: TurnCard): boolean {
	return card.line.trim() === "";
}
