/**
 * pi-turn-classify — classify every finished turn with a decision model.
 *
 * Why: a session list showing only title + recency does not answer "what has been
 * happening here, which project is this really, does it need me?". This extension
 * asks a small decision model (Jeff / D3 / Clef via `/v1/systemone`, or any
 * OpenAI Decisions API via `/v1/decisions`) seven closed questions about each
 * finished turn and stores the answer as a card.
 *
 * Properties that matter:
 *   - **Never blocks the turn.** Classification runs after `agent_end`, off the
 *     agent path, and a failure is a status note, never a broken turn.
 *   - **Never pollutes context.** Cards are `CustomEntry` records; they are not
 *     messages and never reach the LLM.
 *   - **Honest about uncertainty.** Low-confidence choices are demoted to
 *     `unclear` rather than presented as facts.
 *   - **Kill switch.** `/classify off` disables it without a reload.
 *
 * Cards are one line for a list:
 *   pi-agent-extensions · implement · implementing · code · needs review
 */

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { pruneCards, readSessionCards, storeStats, writeSessionCard } from "./card-store.js";
import { appendRecord, buildRecord, shouldRecord } from "./dataset.js";
import { type DecisionClientConfig, DecisionError, classify, demoteLowConfidence } from "./decision-client.js";
import { type ToolUse, type TurnDigest, extractText, localProjectHints, renderState, toolDetail } from "./digest.js";
import {
	type AnswerMap,
	type ProjectCandidate,
	type QuestionSpec,
	type TurnCard,
	UNCLEAR,
	buildQuestions,
	isUnclassified,
	renderLine,
} from "./schema.js";

const execFileAsync = promisify(execFile);

/** Custom entry carrying one turn card. */
export const CARD_ENTRY_TYPE = "pi-turn-classify:card/v1";
/** Status-line key. */
export const STATUS_KEY = "turn";

export interface TurnClassifyConfig {
	enabled: boolean;
	endpoint: string;
	model: string;
	api: "systemone" | "decisions";
	apiKey?: string;
	timeoutMs: number;
	instructions: "auto" | "always" | "never";
	/** Confidence below which a choice is demoted to `unclear` on the card. */
	confidenceFloor: number;
	/** Injectable project candidates, for projects the cwd cannot reveal. */
	projects: ProjectCandidate[];
	/** Show the card in the status line. */
	statusLine: boolean;
	/**
	 * Where the classified cards live. Defaults to
	 * `<agentDir>/turn-classify/cards/<sessionId>.json`; override only if the
	 * consumer of the cards expects another location.
	 */
	cardsDir?: string;
	/**
	 * Optional background corpus. When set, every finished turn is appended to this
	 * JSONL with the model's answers and confidences, so a calibration set builds
	 * itself from real traffic instead of being reconstructed later.
	 */
	dataset?: DatasetConfig;
}

export interface DatasetConfig {
	/** Path to the JSONL file. `~` is expanded. */
	path: string;
	/** Rotate to `<path>.1` once the file exceeds this size. Default 20 MiB. */
	maxBytes?: number;
	/** Only record turns that produced an error. */
	errorsOnly?: boolean;
}

export const DEFAULT_DATASET_MAX_BYTES = 20 * 1024 * 1024;

export const DEFAULTS: TurnClassifyConfig = {
	enabled: false,
	endpoint: "http://100.64.0.9:8010",
	model: "vllm-sr/d3-lite",
	api: "systemone",
	timeoutMs: 20_000,
	instructions: "auto",
	confidenceFloor: 0.4,
	projects: [],
	statusLine: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Read config from cwd, then .pi/, then the agent dir; first file wins per key. */
export function loadConfig(
	cwd: string,
	agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent")
): TurnClassifyConfig {
	let config: TurnClassifyConfig = { ...DEFAULTS };
	for (const path of [
		join(cwd, "turn-classify.json"),
		join(cwd, ".pi", "turn-classify.json"),
		join(agentDir, "turn-classify.json"),
	]) {
		if (!existsSync(path)) continue;
		try {
			const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
			if (!isRecord(parsed)) continue;
			config = mergeConfig(config, parsed);
		} catch {
			// A malformed config must not break the session; defaults stay.
		}
	}
	return config;
}

export function mergeConfig(base: TurnClassifyConfig, raw: Record<string, unknown>): TurnClassifyConfig {
	const next: TurnClassifyConfig = { ...base };
	if (typeof raw.enabled === "boolean") next.enabled = raw.enabled;
	if (typeof raw.endpoint === "string" && raw.endpoint.trim()) next.endpoint = raw.endpoint.trim();
	if (typeof raw.model === "string" && raw.model.trim()) next.model = raw.model.trim();
	if (raw.api === "systemone" || raw.api === "decisions") next.api = raw.api;
	if (typeof raw.apiKey === "string") next.apiKey = raw.apiKey;
	if (typeof raw.timeoutMs === "number" && raw.timeoutMs > 0) next.timeoutMs = raw.timeoutMs;
	if (raw.instructions === "auto" || raw.instructions === "always" || raw.instructions === "never") {
		next.instructions = raw.instructions;
	}
	if (typeof raw.confidenceFloor === "number" && raw.confidenceFloor >= 0 && raw.confidenceFloor <= 1) {
		next.confidenceFloor = raw.confidenceFloor;
	}
	if (typeof raw.statusLine === "boolean") next.statusLine = raw.statusLine;
	if (typeof raw.cardsDir === "string" && raw.cardsDir.trim()) next.cardsDir = raw.cardsDir.trim();
	if (isRecord(raw.dataset)) {
		const path = raw.dataset.path;
		if (typeof path === "string" && path.trim()) {
			next.dataset = {
				path: path.trim(),
				...(typeof raw.dataset.maxBytes === "number" && raw.dataset.maxBytes > 0 ? { maxBytes: raw.dataset.maxBytes } : {}),
				...(raw.dataset.errorsOnly === true ? { errorsOnly: true } : {}),
			};
		}
	}
	if (Array.isArray(raw.projects)) {
		const projects: ProjectCandidate[] = [];
		for (const entry of raw.projects) {
			if (typeof entry === "string" && entry.trim()) projects.push({ id: entry.trim() });
			else if (isRecord(entry) && typeof entry.id === "string" && entry.id.trim()) {
				projects.push({
					id: entry.id.trim(),
					...(typeof entry.hint === "string" ? { hint: entry.hint } : {}),
				});
			}
		}
		next.projects = projects;
	}
	return next;
}

/** Project candidates: configured first, then what the workspace itself reveals. */
export function candidatesFor(config: TurnClassifyConfig, digest: TurnDigest): ProjectCandidate[] {
	const seen = new Map<string, ProjectCandidate>();
	for (const project of config.projects) {
		if (project.id !== UNCLEAR) seen.set(project.id, project);
	}
	for (const hint of localProjectHints(digest)) {
		if (!seen.has(hint) && hint !== UNCLEAR) seen.set(hint, { id: hint, hint: "detected from the workspace" });
	}
	return [...seen.values()];
}

/** Read git remotes for a directory; empty when not a repo or git is missing. */
export async function readGitRemotes(cwd: string): Promise<string[]> {
	try {
		const { stdout } = await execFileAsync("git", ["-C", cwd, "remote", "-v"], { timeout: 3000 });
		const remotes = new Set<string>();
		for (const line of stdout.split("\n")) {
			const parts = line.trim().split(/\s+/);
			if (parts.length >= 2 && parts[1]) remotes.add(parts[1]);
		}
		return [...remotes];
	} catch {
		return [];
	}
}

/** Cards on the current branch, oldest first. */
export function readCards(branchEntries: readonly unknown[]): TurnCard[] {
	const cards: TurnCard[] = [];
	for (const entry of branchEntries) {
		if (!isRecord(entry) || entry.type !== "custom" || entry.customType !== CARD_ENTRY_TYPE) continue;
		const data = entry.data;
		if (!isRecord(data) || data.version !== 1 || !isRecord(data.answers)) continue;
		cards.push(data as unknown as TurnCard);
	}
	return cards;
}

interface TurnBuffer {
	userText: string;
	tools: ToolUse[];
	files: Set<string>;
	commands: string[];
	startedAt?: number;
	errored: boolean;
	/** Last tool error text seen in this turn. */
	toolError?: string;
}

function emptyBuffer(): TurnBuffer {
	return { userText: "", tools: [], files: new Set(), commands: [], errored: false };
}

/** Pull the human-readable message out of a tool result of unknown shape. */
function toolErrorMessage(result: unknown): string | undefined {
	if (typeof result === "string") return result.trim() || undefined;
	if (!result || typeof result !== "object") return undefined;
	const record = result as Record<string, unknown>;
	for (const key of ["error", "message", "stderr", "output", "text"]) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	// toolResult-style content blocks
	const content = record.content;
	if (Array.isArray(content)) {
		const text = extractText(content).trim();
		if (text) return text;
	}
	return undefined;
}

export default function piTurnClassify(pi: ExtensionAPI): void {
	let config: TurnClassifyConfig = { ...DEFAULTS };
	let buffer = emptyBuffer();
	let turnCount = 0;
	let lastCard: TurnCard | undefined;
	let inFlight = false;

	const ctxOf = (_ctx: ExtensionContext): TurnClassifyConfig => config;

	const notify = (ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info"): void => {
		try {
			ctx.ui.notify(message, level);
		} catch {
			// notifications are best effort
		}
	};

	const applyStatus = (ctx: ExtensionContext): void => {
		if (!config.statusLine) return;
		try {
			ctx.ui.setStatus(STATUS_KEY, lastCard && !isUnclassified(lastCard) ? lastCard.line : undefined);
		} catch {
			// status is best effort
		}
	};

	const storeOptions = (): { cardsDir?: string } => (config.cardsDir ? { cardsDir: config.cardsDir } : {});

	const clientConfig = (): DecisionClientConfig => ({
		endpoint: config.endpoint,
		model: config.model,
		api: config.api,
		...(config.apiKey ? { apiKey: config.apiKey } : {}),
		timeoutMs: config.timeoutMs,
		instructions: config.instructions,
	});

	/** Classify one turn. Never throws: failures are reported, not propagated. */
	async function classifyTurn(ctx: ExtensionContext, digest: TurnDigest): Promise<TurnCard | undefined> {
		// Error questions only exist when there is an error to explain.
		const questions: QuestionSpec[] = buildQuestions(candidatesFor(config, digest), { hasError: Boolean(digest.error) });
		const state = renderState(digest);
		const startedTurn = ++turnCount;

		let result: Awaited<ReturnType<typeof classify>>;
		try {
			result = await classify({ client: clientConfig(), questions, state });
		} catch (error) {
			const message = error instanceof DecisionError ? error.message : String(error);
			notify(ctx, `turn-classify: ${message}`, "warning");
			// Still keep the turn in the corpus: a digest plus "the classifier was
			// down" is worth more later than nothing at all.
			recordDataset(ctx, digest, startedTurn, undefined, undefined, message);
			return undefined;
		}

		const answers: AnswerMap = demoteLowConfidence(result.answers, questions, config.confidenceFloor);
		const card: TurnCard = {
			version: 1,
			at: new Date().toISOString(),
			sessionId: safe(() => ctx.sessionManager.getSessionId(), ""),
			...(safe<string | undefined>(() => ctx.sessionManager.getSessionFile(), undefined)
				? { sessionFile: safe<string | undefined>(() => ctx.sessionManager.getSessionFile(), undefined) }
				: {}),
			cwd: digest.cwd,
			turn: startedTurn,
			source: { api: result.api, model: result.model, endpoint: result.endpoint, ms: result.ms },
			answers,
			line: renderLine(answers, questions),
		};

		const confidences = Object.values(answers)
			.map((answer) => answer.confidence)
			.filter((value): value is number => typeof value === "number");
		if (confidences.length > 0 && confidences.every((value) => value < config.confidenceFloor)) {
			card.lowConfidence = true;
		}

		lastCard = card;
		try {
			pi.appendEntry(CARD_ENTRY_TYPE, card);
		} catch {
			// Persistence is best effort; the in-memory card still shows.
		}
		// The sidecar is what a list view reads: one small file per session, so
		// nobody has to open a 90 MB transcript to render a row.
		writeSessionCard(storeOptions(), card);
		applyStatus(ctx);
		recordDataset(ctx, digest, startedTurn, card, result.answers);
		return card;
	}

	/**
	 * Append the turn to the background corpus, when one is configured.
	 *
	 * This is the only place the raw digest leaves the process, so it is opt-in
	 * (no dataset path = no writes) and failure is silent-by-design: a corpus is
	 * never worth a warning on every turn.
	 */
	function recordDataset(
		ctx: ExtensionContext,
		digest: TurnDigest,
		turn: number,
		card: TurnCard | undefined,
		answers: AnswerMap | undefined,
		classificationError?: string
	): void {
		const dataset = config.dataset;
		if (!dataset) return;
		if (
			!shouldRecord(
				{
					path: dataset.path,
					...(dataset.maxBytes ? { maxBytes: dataset.maxBytes } : {}),
					...(dataset.errorsOnly ? { errorsOnly: true } : {}),
				},
				digest
			)
		) {
			return;
		}
		const sessionId = safe(() => ctx.sessionManager.getSessionId(), "");
		const sessionFile = safe<string | undefined>(() => ctx.sessionManager.getSessionFile(), undefined);
		const sessionName = safe<string | undefined>(() => ctx.sessionManager.getSessionName(), undefined);
		appendRecord(
			{ path: dataset.path, ...(dataset.maxBytes ? { maxBytes: dataset.maxBytes } : {}) },
			buildRecord({
				digest,
				turn,
				session: { id: sessionId, ...(sessionFile ? { file: sessionFile } : {}), ...(sessionName ? { name: sessionName } : {}) },
				...(card ? { card } : {}),
				...(answers ? { answers } : {}),
				...(classificationError ? { classificationError } : {}),
			})
		);
	}

	// --- event wiring -------------------------------------------------------

	pi.on("session_start", async (_event, ctx) => {
		config = loadConfig(ctx.cwd);
		buffer = emptyBuffer();
		turnCount = 0;
		lastCard = readCards(ctx.sessionManager.getBranch()).at(-1);
		applyStatus(ctx);
		// Cheap housekeeping: sidecars whose transcript is gone and that are old.
		try {
			pruneCards({ ...storeOptions(), maxAgeDays: 30 });
		} catch {
			// never let housekeeping break a session
		}
		// If this session already has a sidecar, its last card is the freshest one.
		if (!lastCard) {
			const stored = readSessionCards(
				storeOptions(),
				safe(() => ctx.sessionManager.getSessionId(), "")
			);
			if (stored?.latest) lastCard = stored.latest;
		}
	});

	// Track the turn: the user's ask, the tools and the files they touched.
	pi.on("input", async (event, ctx) => {
		if (event.source !== "interactive" && event.source !== "rpc") return undefined;
		// A new user request starts a new turn.
		if (buffer.userText) buffer = emptyBuffer();
		buffer.userText = event.text;
		buffer.startedAt = Date.now();
		applyStatus(ctx);
		return undefined;
	});

	pi.on("tool_execution_start", async (event, _ctx) => {
		const tool = event as unknown as { toolName?: string; args?: unknown };
		const name = tool.toolName ?? "tool";
		const detail = toolDetail(name, tool.args);
		buffer.tools.push({ name, ...(detail ? { detail } : {}) });
		if (detail) {
			if (name === "bash") buffer.commands.push(detail);
			else if (name === "read" || name === "write" || name === "edit") buffer.files.add(detail);
		}
		return undefined;
	});

	pi.on("tool_execution_end", async (event, _ctx) => {
		const result = event as unknown as { isError?: boolean; toolName?: string; result?: unknown };
		if (result.isError) {
			const message = toolErrorMessage(result.result);
			if (message) buffer.toolError = `${result.toolName ?? "tool"}: ${message}`;
			const last = buffer.tools.at(-1);
			if (last) last.failed = true;
		}
		return undefined;
	});

	// The main hook: classify every finished turn, off the agent path.
	pi.on("agent_end", async (event, ctx) => {
		if (!config.enabled) return;
		if (inFlight) return; // one classification at a time; skip rather than queue

		// pi hands the whole turn here: `messages`, not a single message. The last
		// assistant message is the turn's closing answer and carries the error text.
		const messages = (event as unknown as { messages?: unknown[] }).messages ?? [];
		const assistantMessages = messages.filter(
			(message): message is { content?: unknown; stopReason?: string; errorMessage?: string } =>
				Boolean(message) && typeof message === "object" && (message as { role?: string }).role === "assistant"
		);
		const assistantText =
			[...assistantMessages]
				.reverse()
				.map((message) => extractText(message.content))
				.find((text) => text.trim()) ?? "";
		if (!buffer.userText && !assistantText) return;

		// The error is the interesting part of a failed turn: keep its verbatim text.
		const failed = assistantMessages.find((message) => message.stopReason === "error" && message.errorMessage);
		const aborted = assistantMessages.some((message) => message.stopReason === "aborted");
		// A tool error only fails the turn when the turn never produced an answer.
		// A recovered `ls: no such file` in the middle of a successful turn is not
		// a failed turn, and labelling it as one poisons the corpus.
		const error: TurnError | undefined = failed?.errorMessage
			? { source: "provider", message: failed.errorMessage }
			: aborted
				? { source: "aborted", message: "the turn was interrupted (user abort or session switch)" }
				: buffer.toolError && !assistantText.trim()
					? { source: "tool", message: buffer.toolError }
					: undefined;

		const digest: TurnDigest = {
			userText: buffer.userText,
			assistantText,
			tools: buffer.tools,
			filesTouched: [...buffer.files],
			commands: buffer.commands,
			cwd: ctx.cwd,
			gitRemotes: await readGitRemotes(ctx.cwd),
			...(safe<string | undefined>(() => ctx.sessionManager.getSessionName(), undefined)
				? { sessionName: safe<string | undefined>(() => ctx.sessionManager.getSessionName(), undefined) }
				: {}),
			...(error ? { errored: true } : {}),
			...(error ? { error } : {}),
			...(buffer.startedAt ? { durationMs: Date.now() - buffer.startedAt } : {}),
		};
		buffer = emptyBuffer();

		inFlight = true;
		try {
			await classifyTurn(ctx, digest);
		} finally {
			inFlight = false;
		}
	});

	// --- commands -----------------------------------------------------------

	pi.registerCommand("classify", {
		description:
			"Classify turns with a decision model: /classify (show latest card), /classify now (re-run last turn), /classify on|off, /classify model <endpoint> <model> [systemone|decisions], /classify schema",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			config = loadConfig(ctx.cwd);
			const tokens = args.trim().split(/\s+/).filter(Boolean);
			const first = (tokens[0] ?? "").toLowerCase();

			if (!first || first === "show" || first === "last") {
				const cards = readCards(ctx.sessionManager.getBranch());
				const card = lastCard ?? cards.at(-1);
				if (!card) {
					notify(ctx, "turn-classify: no cards yet (needs /classify on and a finished turn)", "info");
					return;
				}
				const detail = Object.entries(card.answers)
					.map(([id, answer]) => {
						const confidence = answer.confidence !== undefined ? ` (${answer.confidence.toFixed(2)})` : "";
						return `  ${id}: ${answer.value}${confidence}`;
					})
					.join("\n");
				const stats = storeStats(storeOptions());
				notify(
					ctx,
					[
						`${card.line || "(no signal)"}`,
						`  turn ${card.turn} · ${card.source.api}/${card.source.model} · ${card.source.ms} ms`,
						detail,
						`  cards: ${stats.dir} (${stats.files} sessions)`,
					].join("\n"),
					"info"
				);
				return;
			}

			if (first === "on" || first === "off") {
				config.enabled = first === "on";
				if (!config.enabled) {
					lastCard = undefined;
					applyStatus(ctx);
				}
				notify(
					ctx,
					`turn-classify ${config.enabled ? "enabled" : "disabled"} (${config.api}: ${config.model} @ ${config.endpoint})`,
					"info"
				);
				return;
			}

			if (first === "model") {
				const [, endpoint, model, api] = tokens;
				if (!endpoint || !model) {
					notify(ctx, "usage: /classify model <endpoint> <model> [systemone|decisions]", "warning");
					return;
				}
				config.endpoint = endpoint;
				config.model = model;
				if (api === "systemone" || api === "decisions") config.api = api;
				notify(ctx, `turn-classify target: ${config.api} ${config.model} @ ${config.endpoint}`, "info");
				return;
			}

			if (first === "schema") {
				const questions = buildQuestions(
					candidatesFor(config, {
						userText: "",
						assistantText: "",
						tools: [],
						filesTouched: [],
						commands: [],
						cwd: ctx.cwd,
						gitRemotes: [],
					})
				);
				const lines = questions.map((question) => {
					const options =
						question.kind === "boolean"
							? "yes|no"
							: (question.options ?? question.levels ?? []).map((option) => option.id).join("|");
					return `  ${question.id} (${question.kind}): ${options}`;
				});
				notify(ctx, [`turn-classify schema — ${questions.length} questions`, ...lines].join("\n"), "info");
				return;
			}

			if (first === "now") {
				if (!config.enabled) {
					notify(ctx, "turn-classify is off; run /classify on first", "warning");
					return;
				}
				const cards = readCards(ctx.sessionManager.getBranch());
				const previous = cards.at(-1);
				if (!previous) {
					notify(ctx, "turn-classify: nothing to re-classify yet", "info");
					return;
				}
				notify(ctx, "turn-classify: re-classifying the last turn", "info");
				// Re-run from stored facts only: the card carries no digest, so this
				// re-asks with what the session still exposes.
				await classifyTurn(ctx, {
					userText: "",
					assistantText: previous.line,
					tools: [],
					filesTouched: [],
					commands: [],
					cwd: previous.cwd,
					gitRemotes: [],
				});
				return;
			}

			notify(ctx, "usage: /classify [show|now|on|off|model|schema]", "warning");
		},
	});

	// `/turn` is a short alias for the common case.
	pi.registerCommand("turn", {
		description: "Alias of /classify: show the latest turn card",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			config = loadConfig(ctx.cwd);
			const card = lastCard ?? readCards(ctx.sessionManager.getBranch()).at(-1);
			notify(ctx, card ? card.line || "(no signal)" : "turn-classify: no cards yet", "info");
		},
	});

	// Keep the reference so lint sees the helper is intentional.
	void ctxOf;
}

/** Run a getter that may throw on a stale context. */
function safe<T>(read: () => T, fallback: T): T {
	try {
		return read() ?? fallback;
	} catch {
		return fallback;
	}
}
