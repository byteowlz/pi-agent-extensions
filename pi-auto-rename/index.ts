/**
 * Auto-rename extension for pi sessions.
 *
 * Automatically generates a session name based on the first user query
 * using a configurable LLM model and prompt.
 *
 * By default, uses the current session model. Falls back to the cheapest
 * available model with an API key. Override via config
 * (auto-rename.json in cwd, .pi/, or ~/.pi/agent/):
 * {
 *   "model": { "provider": "anthropic", "id": "claude-3-5-haiku-20241022" },
 *   "fallbackModel": { "provider": "openai", "id": "gpt-4o-mini" },
 *   "fallbackDeterministic": "readable-id",
 *   "modelSelection": "current",
 *   "prompt": "Generate a short, descriptive title...",
 *   "prefix": "[auto] ",
 *   "prefixCommand": "basename $(git rev-parse --show-toplevel 2>/dev/null || pwd)",
 *   "prefixOnly": false,
 *   "readableIdSuffix": false,
 *   "readableIdEnv": "PI_SESSION_READABLE_ID",
 *   "enabled": true,
 *   "debug": false,
 *   "wordlistPath": "./word_lists.toml",
 *   "wordlist": { "adjectives": [], "nouns": [] },
 *   "maxQueryLength": 2000,
 *   "maxNameLength": 80
 * }
 *
 * Prefix options:
 * - "prefix": Static string prefix
 * - "prefixCommand": Shell command whose stdout becomes the prefix (trimmed)
 * - "prefixOnly": If true, skip LLM and use only the prefix as the full name
 *
 * Suffix options:
 * - "readableIdSuffix": If true, append "[readable-id]" to the generated name
 * - "readableIdEnv": Environment variable that can provide a readable-id suffix override
 *
 * Fallback options:
 * - "fallbackModel": Alternative model if primary fails
 * - "fallbackDeterministic": Function to use if all models fail
 *   - "readable-id": Deterministic adjective-noun-noun from session ID
 *   - "truncate": First 50 chars of query
 *   - "words": First 6 words of query
 *   - "none": Don't set a name if LLM fails
 *
 * Input/output guards:
 * - "maxQueryLength": Maximum characters of user query sent to the LLM (default 2000).
 *   Longer queries have their middle section cut out, preserving the beginning and end.
 * - "maxNameLength": Maximum characters for the generated name (default 80).
 *   LLM responses exceeding this are truncated at a word boundary with an ellipsis.
 *
 * The prefixCommand runs in the session's cwd. If it fails, falls back to static prefix.
 */

import { execFile, execSync } from "node:child_process";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from "node:fs";
import net from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Api, JsonValue, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, fuzzyFilter, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
	DESCRIPTION_ENTRY_TYPE,
	DESCRIPTION_EVENT,
	type SessionDescription,
	describePayload,
	normalizeDescription,
	normalizeTopics,
	readSessionDescription,
} from "./description.js";
import {
	NAME_HISTORY_ENTRY_TYPE,
	type NameRecord,
	formatNameHistoryRow,
	mergeNameHistory,
	readNameHistory,
} from "./name-history.js";
import { type InboundTarget, createInboundTarget } from "./tab-title-inbound.js";
import { TabTitleSync, tabTitle } from "./tab-title.js";

// ============================================================================
// Types
// ============================================================================

interface ModelConfig {
	provider: string;
	id: string;
}

interface EndpointConfig {
	/** Direct HTTP endpoint URL (OpenAI-compatible chat completions format). */
	url: string;
	/** Model identifier to send in the request body. */
	model: string;
	/** Optional API key (Bearer token). */
	apiKey?: string;
	/** Request timeout in milliseconds (default 15000). */
	timeout?: number;
}

interface WordlistConfig {
	adjectives: string[];
	nouns: string[];
}

interface AutoRenameConfig {
	model?: ModelConfig;
	/** Direct endpoint that bypasses the Pi model registry entirely. */
	endpoint?: EndpointConfig | null;
	fallbackModel?: ModelConfig | null;
	fallbackDeterministic?: "truncate" | "words" | "none" | "readable-id";
	modelSelection?: "current" | "cheapest";
	prompt?: string;
	prefix?: string;
	prefixCommand?: string;
	prefixOnly?: boolean;
	readableIdSuffix?: boolean;
	readableIdEnv?: string;
	syncTabTitle?: boolean;
	syncTabTitleInbound?: boolean;
	enabled?: boolean;
	debug?: boolean;
	wordlistPath?: string;
	wordlist?: WordlistConfig;
	maxQueryLength?: number;
	maxNameLength?: number;
}

type ResolvedConfig = {
	model: ModelConfig | null;
	endpoint: EndpointConfig | null | undefined;
	fallbackModel: ModelConfig | null | undefined;
	fallbackDeterministic: "truncate" | "words" | "none" | "readable-id";
	modelSelection: "current" | "cheapest";
	prompt: string;
	prefix: string;
	prefixCommand: string | undefined;
	prefixOnly: boolean;
	readableIdSuffix: boolean;
	readableIdEnv: string | undefined;
	syncTabTitle: boolean;
	syncTabTitleInbound: boolean;
	enabled: boolean;
	debug: boolean;
	wordlistPath: string | undefined;
	wordlist: WordlistConfig | undefined;
	maxQueryLength: number;
	maxNameLength: number;
};

interface ModelResolutionResult {
	model: Model<Api> | null;
	apiKey: string | null;
	error: string | null;
	source: "primary" | "fallback" | null;
}

interface NameGenerationResult {
	name: string | null;
	source: "llm-primary" | "llm-fallback" | "deterministic" | null;
	error: string | null;
	/** Model that produced the name, "provider/modelId" (LLM paths only). */
	model?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PROMPT = `Generate a short, descriptive title (max 6 words) for a chat session based on this first message:

<message>
{{query}}
</message>

Rules:
- Be concise and specific
- Use title case
- No quotes or punctuation at the end
- Focus on the main topic or intent
- If unclear, use a generic but relevant title

Reply with ONLY the title, nothing else.`;

/** Names that should be treated as "not yet renamed" so the extension still runs. */
const DEFAULT_NAMES = new Set(["chat", "new session", "untitled", "session", ""]);
const MIN_QUERY_LENGTH = 100;
const MIN_NAME_LENGTH = 8;

const DEFAULT_CONFIG: ResolvedConfig = {
	model: null,
	endpoint: null,
	fallbackModel: null,
	fallbackDeterministic: "readable-id",
	modelSelection: "current",
	prompt: DEFAULT_PROMPT,
	prefix: "",
	prefixCommand: undefined,
	prefixOnly: false,
	readableIdSuffix: false,
	readableIdEnv: "PI_SESSION_READABLE_ID",
	syncTabTitle: true,
	syncTabTitleInbound: false,
	enabled: true,
	debug: false,
	wordlistPath: undefined,
	wordlist: undefined,
	maxQueryLength: 2000,
	maxNameLength: 80,
};

const CONFIG_FILENAME = "auto-rename.json";

/** First existing config path (loadConfig precedence), else the global default. */
function effectiveConfigPath(cwd: string): string {
	const candidates = [
		join(cwd, CONFIG_FILENAME),
		join(cwd, ".pi", CONFIG_FILENAME),
		join(homedir(), ".pi", "agent", CONFIG_FILENAME),
	];
	for (const path of candidates) {
		if (existsSync(path)) return path;
	}
	return candidates[2] as string;
}

/**
 * Persist any JSON-serializable setting key to the effective config file,
 * preserving existing keys. Fails closed (returns error) on unreadable/invalid
 * JSON so a write never clobbers an operator's file.
 */
function persistSetting(cwd: string, key: string, value: unknown): { ok: true; path: string } | { ok: false; error: string } {
	const path = effectiveConfigPath(cwd);
	let current: Record<string, unknown> = {};
	if (existsSync(path)) {
		try {
			const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
				return { ok: false, error: "config is not a JSON object" };
			current = parsed as Record<string, unknown>;
		} catch {
			return { ok: false, error: "config is not valid JSON" };
		}
	}
	const next = { ...current, [key]: value };
	try {
		writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
	return { ok: true, path };
}

/**
 * Persist a boolean config key to the effective config file, preserving any
 * existing keys. Fails closed (returns false) on unreadable/invalid JSON so a
 * toggle never clobbers an operator's file.
 */
function persistBooleanSetting(
	cwd: string,
	key: string,
	value: boolean
): { ok: true; path: string } | { ok: false; error: string } {
	const path = effectiveConfigPath(cwd);
	let current: Record<string, unknown> = {};
	if (existsSync(path)) {
		try {
			const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
				return { ok: false, error: "config is not a JSON object" };
			current = parsed as Record<string, unknown>;
		} catch {
			return { ok: false, error: "config is not valid JSON" };
		}
	}
	const next = { ...current, [key]: value };
	try {
		writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
	return { ok: true, path };
}
const SUBAGENT_PREFIX_ENV = "PI_SUBAGENT_PREFIX";
const DEFAULT_WORDLIST_PATH = resolveDefaultWordlistPath();

function resolveDefaultWordlistPath(): string {
	// Try import.meta.url (works in native ESM)
	try {
		const dir = dirname(fileURLToPath(import.meta.url));
		const candidate = join(dir, "wordlist", "word_lists.toml");
		if (existsSync(candidate)) return candidate;
	} catch {
		// import.meta.url may not work under jiti
	}

	// Try __dirname (available in CJS and some jiti contexts)
	try {
		// @ts-ignore - __dirname may be defined by jiti at runtime
		if (typeof __dirname === "string") {
			// @ts-ignore
			const candidate = join(__dirname, "wordlist", "word_lists.toml");
			if (existsSync(candidate)) return candidate;
		}
	} catch {
		// not available
	}

	// Fallback: look in the npm global install location
	try {
		const npmRoot = execSync("npm root -g", { encoding: "utf-8", timeout: 3000 }).trim();
		const candidate = join(npmRoot, "@byteowlz", "pi-auto-rename", "wordlist", "word_lists.toml");
		if (existsSync(candidate)) return candidate;
	} catch {
		// npm not available or timed out
	}

	// Last resort: return a path that won't exist but won't crash
	return join("wordlist", "word_lists.toml");
}

/**
 * Status key used to notify the Oqto runner of title changes.
 * The runner watches for this key on extension_ui_request events
 * and broadcasts a canonical session.title_changed event.
 */
const TITLE_CHANGED_STATUS_KEY = "oqto_title_changed";

// ============================================================================
// Config Loading
// ============================================================================

function loadConfig(cwd: string): ResolvedConfig {
	const paths = [join(cwd, CONFIG_FILENAME), join(cwd, ".pi", CONFIG_FILENAME), join(homedir(), ".pi", "agent", CONFIG_FILENAME)];
	for (const path of paths) {
		if (existsSync(path)) {
			try {
				const content = readFileSync(path, "utf-8");
				const userConfig: AutoRenameConfig = JSON.parse(content);
				const merged = { ...DEFAULT_CONFIG, ...userConfig } as Partial<ResolvedConfig>;
				// Guard rails for config-provided limits.
				merged.maxQueryLength =
					typeof merged.maxQueryLength === "number" && Number.isFinite(merged.maxQueryLength)
						? Math.max(MIN_QUERY_LENGTH, Math.floor(merged.maxQueryLength))
						: DEFAULT_CONFIG.maxQueryLength;
				merged.maxNameLength =
					typeof merged.maxNameLength === "number" && Number.isFinite(merged.maxNameLength)
						? Math.max(MIN_NAME_LENGTH, Math.floor(merged.maxNameLength))
						: DEFAULT_CONFIG.maxNameLength;
				return merged as ResolvedConfig;
			} catch {
				// Invalid JSON, continue to next path
			}
		}
	}

	return DEFAULT_CONFIG;
}

// ============================================================================
// Wordlist Loading
// ============================================================================

function resolveWordlistPath(config: ResolvedConfig, cwd: string): string | null {
	if (!config.wordlistPath) return null;
	const rawPath = config.wordlistPath.trim();
	if (!rawPath) return null;

	if (rawPath.startsWith("~")) {
		return join(homedir(), rawPath.slice(1));
	}

	if (rawPath.startsWith("/") || rawPath.includes(":")) {
		return rawPath;
	}

	return resolve(cwd, rawPath);
}

function parseWordlistToml(content: string): WordlistConfig | null {
	const adjectives = extractTomlList(content, "adjectives");
	const nouns = extractTomlList(content, "nouns");
	if (adjectives.length === 0 || nouns.length === 0) {
		return null;
	}
	return { adjectives, nouns };
}

function extractTomlList(content: string, key: string): string[] {
	const regex = new RegExp(`${key}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "m");
	const match = content.match(regex);
	if (!match) return [];
	const listBody = match[1];
	return Array.from(listBody.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
}

function loadWordlist(config: ResolvedConfig, cwd: string): WordlistConfig | null {
	if (config.wordlist?.adjectives?.length && config.wordlist.nouns?.length) {
		return {
			adjectives: config.wordlist.adjectives,
			nouns: config.wordlist.nouns,
		};
	}

	const overridePath = resolveWordlistPath(config, cwd);
	const paths = overridePath ? [overridePath, DEFAULT_WORDLIST_PATH] : [DEFAULT_WORDLIST_PATH];

	for (const path of paths) {
		if (!path || !existsSync(path)) continue;
		try {
			const content = readFileSync(path, "utf-8");
			const parsed = parseWordlistToml(content);
			if (parsed) return parsed;
		} catch {
			// Ignore invalid or unreadable wordlist files
		}
	}

	return null;
}

// ============================================================================
// Shell Command Execution
// ============================================================================

function executeCommand(command: string, cwd: string): string | null {
	try {
		const result = execSync(command, {
			cwd,
			encoding: "utf-8",
			timeout: 5000,
			stdio: ["pipe", "pipe", "pipe"],
		});
		return result.trim() || null;
	} catch {
		return null;
	}
}

function resolvePrefix(config: ResolvedConfig, cwd: string, ctx: ExtensionContext): string {
	let basePrefix = config.prefix;
	if (config.prefixCommand) {
		const dynamicPrefix = executeCommand(config.prefixCommand, cwd);
		if (dynamicPrefix) {
			basePrefix = dynamicPrefix;
		} else if (config.debug && ctx.hasUI) {
			ctx.ui.notify("[auto-rename] prefixCommand failed, using static prefix", "warning");
		}
	}
	const subagentPrefix = process.env[SUBAGENT_PREFIX_ENV];
	if (subagentPrefix?.trim()) {
		return basePrefix ? `${subagentPrefix.trim()} ${basePrefix}` : subagentPrefix.trim();
	}
	return basePrefix;
}

// ============================================================================
// Query Extraction
// ============================================================================

function extractFirstUserQuery(ctx: ExtensionContext): string | null {
	const branch = ctx.sessionManager.getBranch();

	for (const entry of branch) {
		if (entry.type !== "message") continue;

		const msg = (entry as { message?: { role?: string; content?: unknown } }).message;
		if (!msg || msg.role !== "user") continue;

		if (!Array.isArray(msg.content)) {
			return typeof msg.content === "string" ? msg.content.trim() || null : null;
		}
		return extractTextFromContent(msg.content as Array<{ type: string; text?: string; thinking?: string }>);
	}

	return null;
}

function getSessionId(ctx: ExtensionContext): string | null {
	const manager = ctx.sessionManager as { getSessionId?: () => string };
	const id = manager.getSessionId?.();
	return id || null;
}

// ============================================================================
// Input / Output Guards
// ============================================================================

/**
 * Truncate the user query to maxQueryLength characters by cutting the middle.
 * Preserves the beginning (intent/context) and end (specific details/question)
 * of the query, joining them with a marker so the LLM understands content was
 * omitted. Both halves are trimmed at word boundaries.
 */
function truncateQuery(query: string, maxLength: number): string {
	if (query.length <= maxLength) return query;
	const marker = "\n[...truncated...]\n";
	const budget = maxLength - marker.length;
	if (budget <= 0) return query.slice(0, maxLength);
	const headBudget = Math.ceil(budget * 0.6);
	const tailBudget = budget - headBudget;

	let head = query.slice(0, headBudget);
	const headSpace = head.lastIndexOf(" ");
	if (headSpace > headBudget * 0.6) {
		head = head.slice(0, headSpace);
	}

	let tail = query.slice(query.length - tailBudget);
	const tailSpace = tail.indexOf(" ");
	if (tailSpace >= 0 && tailSpace < tailBudget * 0.4) {
		tail = tail.slice(tailSpace + 1);
	}

	return `${head}${marker}${tail}`;
}

/**
 * Enforce maxNameLength on an LLM-generated name. Strips trailing
 * punctuation, truncates at a word boundary, and appends an ellipsis when
 * trimming was needed.
 */
function enforceNameLength(name: string, maxLength: number): string {
	if (name.length <= maxLength) return name;
	// Leave room for the ellipsis
	const limit = maxLength - 3;
	if (limit <= 0) return name.slice(0, maxLength);
	const truncated = name.slice(0, limit);
	const lastSpace = truncated.lastIndexOf(" ");
	if (lastSpace > limit * 0.4) {
		return `${truncated.slice(0, lastSpace).replace(/[,;:\s]+$/, "")}...`;
	}
	return `${truncated.replace(/[,;:\s]+$/, "")}...`;
}

// ============================================================================
// Deterministic Name Generation
// ============================================================================

function generateDeterministicName(
	query: string,
	method: "truncate" | "words" | "none" | "readable-id",
	sessionId: string | null,
	wordlist: WordlistConfig | null
): string | null {
	if (method === "none") {
		return null;
	}

	if (method === "readable-id") {
		if (!sessionId || !wordlist) return null;
		return readableIdFromSessionId(sessionId, wordlist);
	}

	const cleaned = query
		.replace(/\s+/g, " ")
		.replace(/[^\w\s-]/g, "")
		.trim();

	if (!cleaned) {
		return null;
	}

	if (method === "words") {
		return generateWordsName(cleaned);
	}

	return generateTruncatedName(cleaned);
}

function hashString(value: string): number {
	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		hash = (hash << 5) - hash + value.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash) >>> 0;
}

function readableIdFromSessionId(sessionId: string, wordlist: WordlistConfig): string {
	const hash = hashString(sessionId);
	const adjectives = wordlist.adjectives;
	const nouns = wordlist.nouns;
	const adjIndex = hash % adjectives.length;
	const noun1Index = Math.floor(hash / adjectives.length) % nouns.length;
	const noun2Index = Math.floor(hash / (adjectives.length * nouns.length)) % nouns.length;
	return `${adjectives[adjIndex]}-${nouns[noun1Index]}-${nouns[noun2Index]}`;
}

function generateWordsName(cleaned: string): string | null {
	const words = cleaned.split(" ").slice(0, 6);
	const titleCase = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
	return titleCase || null;
}

function generateTruncatedName(cleaned: string): string {
	if (cleaned.length <= 50) {
		return cleaned;
	}

	const truncated = cleaned.slice(0, 50);
	const lastSpace = truncated.lastIndexOf(" ");

	if (lastSpace > 30) {
		return `${truncated.slice(0, lastSpace)}...`;
	}

	return `${truncated}...`;
}

// ============================================================================
// Model Resolution
// ============================================================================

/**
 * Find the cheapest available model that has an API key configured.
 * Prefers small/fast models suitable for short title generation.
 */
async function findCheapestAvailableModel(ctx: ExtensionContext): Promise<{ model: Model<Api>; apiKey: string | null } | null> {
	const allModels = ctx.modelRegistry.getAll() as Model<Api>[];
	// Sort by total cost (input + output), cheapest first
	const sorted = [...allModels].sort((a, b) => {
		const costA = (a.cost?.input ?? 0) + (a.cost?.output ?? 0);
		const costB = (b.cost?.input ?? 0) + (b.cost?.output ?? 0);
		return costA - costB;
	});

	for (const model of sorted) {
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (auth.ok) return { model, apiKey: auth.apiKey ?? null };
	}
	return null;
}

async function resolveModel(
	modelConfig: ModelConfig,
	ctx: ExtensionContext
): Promise<{ model: Model<Api> | null; apiKey: string | null; error: string | null }> {
	const model = ctx.modelRegistry.find(modelConfig.provider, modelConfig.id) as Model<Api> | undefined;

	if (!model) {
		const providers = Array.from(new Set(ctx.modelRegistry.getAll().map((m) => m.provider)));
		const availableProviders = providers.slice(0, 5).join(", ");
		const suffix = providers.length > 5 ? "..." : "";
		return {
			model: null,
			apiKey: null,
			error: `Model "${modelConfig.id}" not found for provider "${modelConfig.provider}". Available providers: ${availableProviders}${suffix}`,
		};
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) {
		return {
			model: null,
			apiKey: null,
			error: `Failed to get API key: ${auth.error}`,
		};
	}
	return { model, apiKey: auth.apiKey ?? null, error: null };
}

function isDefaultName(name: string | null | undefined): boolean {
	if (!name) return true;
	return DEFAULT_NAMES.has(name.trim().toLowerCase());
}

function isStaleContextError(error: unknown): boolean {
	return error instanceof Error && error.message.includes("ctx is stale");
}

function debugNotify(
	ctx: ExtensionContext,
	config: ResolvedConfig,
	message: string,
	level: "info" | "warning" | "error" = "info"
): void {
	if (!config.debug) return;
	if (ctx.hasUI) {
		try {
			ctx.ui.notify(message, level);
		} catch {
			// UI may not support notify in this mode
		}
	}
	// Always mirror to console so RPC / headless modes are observable.
	const method = level === "error" ? console.error : level === "warning" ? console.warn : console.log;
	method(`[auto-rename] ${message}`);
}

async function resolveCurrentModel(ctx: ExtensionContext): Promise<{ model: Model<Api>; apiKey: string | null } | null> {
	const currentModel = ctx.model as Model<Api> | undefined;
	if (!currentModel) return null;
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(currentModel);
	if (!auth.ok) return null;
	return { model: currentModel, apiKey: auth.apiKey ?? null };
}

async function resolveModelWithFallback(config: ResolvedConfig, ctx: ExtensionContext): Promise<ModelResolutionResult> {
	// 1. Try explicitly configured primary model
	if (config.model) {
		const primary = await resolveModel(config.model, ctx);
		if (primary.model) return { ...primary, source: "primary" };
		if (primary.error) debugNotify(ctx, config, `[auto-rename] Primary model failed: ${primary.error}`, "warning");
	}

	// 2. Try explicitly configured fallback model
	if (config.fallbackModel) {
		const fallback = await resolveModel(config.fallbackModel, ctx);
		if (fallback.model) {
			debugNotify(ctx, config, `[auto-rename] Using fallback model: ${config.fallbackModel.provider}/${config.fallbackModel.id}`);
			return { ...fallback, source: "fallback" };
		}
		if (fallback.error) debugNotify(ctx, config, `[auto-rename] Fallback model failed: ${fallback.error}`, "warning");
	}

	// 3. Strategy-based auto selection
	if (config.modelSelection === "cheapest") {
		const cheapest = await findCheapestAvailableModel(ctx);
		if (cheapest) {
			debugNotify(ctx, config, `[auto-rename] Auto-selected cheapest model: ${cheapest.model.provider}/${cheapest.model.id}`);
			return { model: cheapest.model, apiKey: cheapest.apiKey, error: null, source: "primary" };
		}

		const current = await resolveCurrentModel(ctx);
		if (current) {
			debugNotify(ctx, config, `[auto-rename] Using current model: ${current.model.provider}/${current.model.id}`);
			return { model: current.model, apiKey: current.apiKey, error: null, source: "primary" };
		}
	} else {
		const current = await resolveCurrentModel(ctx);
		if (current) {
			debugNotify(ctx, config, `[auto-rename] Using current model: ${current.model.provider}/${current.model.id}`);
			return { model: current.model, apiKey: current.apiKey, error: null, source: "primary" };
		}

		const cheapest = await findCheapestAvailableModel(ctx);
		if (cheapest) {
			debugNotify(ctx, config, `[auto-rename] Auto-selected cheapest model: ${cheapest.model.provider}/${cheapest.model.id}`);
			return { model: cheapest.model, apiKey: cheapest.apiKey, error: null, source: "primary" };
		}
	}

	return {
		model: null,
		apiKey: null,
		error: "No model available. Configure an API key or set model in auto-rename.json",
		source: null,
	};
}

// ============================================================================
// LLM Name Generation
// ============================================================================

function stripThinkTags(text: string): string {
	return (
		text
			// Strip closed think/thinking blocks
			.replace(/<think>[\s\S]*?<\/think>/gi, "")
			.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
			// Strip unclosed think/thinking tags (model didn't close them)
			.replace(/<think>[\s\S]*/gi, "")
			.replace(/<thinking>[\s\S]*/gi, "")
			.trim()
	);
}

function extractTextFromContent(content: Array<{ type: string; text?: string; thinking?: string }>): string {
	// First try text blocks
	const textContent = content
		.filter((c): c is { type: "text"; text: string } => c.type === "text" && typeof c.text === "string")
		.map((c) => c.text)
		.join("")
		.trim();

	if (textContent) return textContent;

	// If no text content, try to extract from thinking blocks
	// (some models put the answer in the thinking block when the response is short)
	const thinkingContent = content
		.filter((c): c is { type: "thinking"; thinking: string } => c.type === "thinking" && typeof c.thinking === "string")
		.map((c) => c.thinking)
		.join("")
		.trim();

	if (!thinkingContent) return "";

	// The thinking block may contain reasoning + the actual title
	// Take the last non-empty line as the most likely title
	const lines = thinkingContent
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0 && !l.startsWith("*") && !l.startsWith("-") && !l.startsWith("#"));

	return lines.length > 0 ? lines[lines.length - 1] : "";
}

function normalizeCandidateLine(line: string): string {
	return line
		.replace(/<[^>]+>/g, " ")
		.replace(/^[\s\-*>#]+/, "")
		.replace(/^\d+[.)]\s*/, "")
		.replace(/\*\*/g, "")
		.replace(/`/g, "")
		.replace(/^["']+|["']+$/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function looksLikeReasoning(line: string): boolean {
	if (!line) return true;
	if (line.includes("|")) return true;
	if (/^(step|analysis|reasoning|thinking|selecting|here'?s|let'?s)\b/i.test(line)) return true;
	if (/\b(best title|final title|option \d|candidate \d)\b/i.test(line)) return true;
	if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(line)) return true;
	if (/[{}<>]/.test(line)) return true;
	const words = line.split(/\s+/).filter(Boolean);
	if (words.length < 2 || words.length > 10) return true;
	return false;
}

function parseNameFromText(raw: string, maxNameLength: number): string | null {
	if (!raw) return null;

	const lines = raw
		.split("\n")
		.map(normalizeCandidateLine)
		.filter((l) => l.length > 0);

	// Prefer last clean short line (models often reason first, answer last)
	let name = "";
	for (let i = lines.length - 1; i >= 0; i--) {
		if (!looksLikeReasoning(lines[i])) {
			name = lines[i];
			break;
		}
	}
	if (!name && lines.length > 0) {
		// As a last resort, use the shortest line
		name = [...lines].sort((a, b) => a.length - b.length)[0];
	}

	name = name.replace(/\.+$/, "").trim();
	if (!name || looksLikeReasoning(name)) return null;

	return enforceNameLength(name, maxNameLength) || null;
}

function parseNameFromResponse(
	response: { content: Array<{ type: string; text?: string; thinking?: string }> },
	maxNameLength: number
): string | null {
	const raw = stripThinkTags(extractTextFromContent(response.content));
	return parseNameFromText(raw, maxNameLength);
}

async function tryEndpointGeneration(
	query: string,
	config: ResolvedConfig,
	ctx: ExtensionContext
): Promise<NameGenerationResult | null> {
	const endpoint = config.endpoint;
	if (!endpoint?.url) return null;

	const trimmedQuery = truncateQuery(query, config.maxQueryLength);
	const prompt = config.prompt.replace("{{query}}", trimmedQuery);

	const controller = new AbortController();
	const timeoutMs = endpoint.timeout ?? 15000;
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(endpoint.url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(endpoint.apiKey ? { Authorization: `Bearer ${endpoint.apiKey}` } : {}),
			},
			body: JSON.stringify({
				model: endpoint.model,
				messages: [{ role: "user", content: prompt }],
				max_tokens: 64,
				temperature: 0.3,
			}),
			signal: controller.signal,
		});
		clearTimeout(timeout);

		if (!response.ok) {
			debugNotify(ctx, config, `[auto-rename] Endpoint ${response.status}: ${response.statusText}`, "warning");
			return null;
		}

		const data = (await response.json()) as {
			choices?: Array<{ message?: { content?: string }; text?: string }>;
		};
		const text = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? "";
		const name = parseNameFromText(text, config.maxNameLength);
		if (!name) {
			debugNotify(ctx, config, "[auto-rename] Endpoint returned unparseable text, falling back", "warning");
			return null;
		}
		return { name, source: "llm-primary", error: null, model: `endpoint/${endpoint.model}` };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		debugNotify(ctx, config, `[auto-rename] Endpoint request failed: ${msg}`, "warning");
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

function handleLlmError(errorMsg: string, config: ResolvedConfig, ctx: ExtensionContext): void {
	debugNotify(ctx, config, `[auto-rename] LLM call failed: ${errorMsg}`, "warning");

	const providerName = config.model?.provider ?? "unknown";
	if (errorMsg.includes("401") || errorMsg.includes("403") || errorMsg.includes("authentication")) {
		debugNotify(ctx, config, `[auto-rename] Authentication failed for ${providerName}. Check your API key.`, "error");
	} else if (errorMsg.includes("429") || errorMsg.includes("rate limit")) {
		debugNotify(ctx, config, `[auto-rename] Rate limited by ${providerName}. Using fallback.`, "warning");
	} else if (errorMsg.includes("timeout") || errorMsg.includes("ETIMEDOUT")) {
		debugNotify(ctx, config, "[auto-rename] Request timed out. Using fallback.", "warning");
	}
}

async function tryLlmGeneration(
	query: string,
	config: ResolvedConfig,
	ctx: ExtensionContext,
	resolution: ModelResolutionResult
): Promise<NameGenerationResult | null> {
	if (!resolution.model) {
		return null;
	}

	const trimmedQuery = truncateQuery(query, config.maxQueryLength);
	if (trimmedQuery.length < query.length && config.debug && ctx.hasUI) {
		ctx.ui.notify(`[auto-rename] Query truncated from ${query.length} to ${trimmedQuery.length} chars`, "info");
	}
	const prompt = config.prompt.replace("{{query}}", trimmedQuery);

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 15000);

		const response = await ctx.modelRegistry.complete(
			resolution.model,
			{
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: prompt }],
						timestamp: Date.now(),
					},
				],
			},
			{ signal: controller.signal }
		);
		clearTimeout(timeout);

		const name = parseNameFromResponse(response, config.maxNameLength);

		if (name) {
			// Check if the raw response was longer (name was truncated by enforceNameLength)
			const rawName = response.content
				.filter((c): c is { type: "text"; text: string } => c.type === "text")
				.map((c) => c.text)
				.join("")
				.trim();
			if (rawName.length > config.maxNameLength && config.debug && ctx.hasUI) {
				ctx.ui.notify(
					`[auto-rename] LLM name truncated from ${rawName.length} to ${name.length} chars (max ${config.maxNameLength})`,
					"info"
				);
			}
			return {
				name,
				source: resolution.source === "primary" ? "llm-primary" : "llm-fallback",
				error: null,
				model: `${resolution.model!.provider}/${resolution.model!.id}`,
			};
		}

		if (config.debug && ctx.hasUI) {
			ctx.ui.notify("[auto-rename] LLM returned empty response, using deterministic fallback", "warning");
		}
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		handleLlmError(errorMsg, config, ctx);
	}

	return null;
}

async function generateSessionName(
	query: string,
	config: ResolvedConfig,
	ctx: ExtensionContext,
	sessionId: string | null,
	wordlist: WordlistConfig | null
): Promise<NameGenerationResult> {
	// 0. Prefer direct endpoint (bypasses Pi model registry entirely)
	const endpointResult = await tryEndpointGeneration(query, config, ctx);
	if (endpointResult?.name) {
		return endpointResult;
	}

	// 1. Fall back to Pi model registry
	const resolution = await resolveModelWithFallback(config, ctx);

	const llmResult = await tryLlmGeneration(query, config, ctx, resolution);
	if (llmResult) {
		return llmResult;
	}

	// 2. Deterministic fallback
	const deterministicName = generateDeterministicName(query, config.fallbackDeterministic, sessionId, wordlist);

	if (deterministicName) {
		debugNotify(ctx, config, `[auto-rename] Using deterministic fallback (${config.fallbackDeterministic})`, "info");
		return {
			name: deterministicName,
			source: "deterministic",
			error: resolution.error,
		};
	}

	return {
		name: null,
		source: null,
		error: resolution.error || "All name generation methods failed",
	};
}

// ============================================================================
// Session Naming Helpers
// ============================================================================

function formatFullName(prefix: string, name: string, suffix: string | null): string {
	const baseName = prefix ? `${prefix}: ${name}` : name;
	return suffix ? `${baseName} [${suffix}]` : baseName;
}

/**
 * Strip a trailing readable-id suffix (e.g. " [brisk-sunflower-river]") from a name.
 * The readable id is owned and generated by this extension, so any agent-supplied
 * suffix is removed and replaced with the canonical one for the current session.
 */
function stripReadableIdSuffix(name: string): string {
	return name.replace(/\s\[[a-z][a-z0-9-]*-[a-z][a-z0-9-]*-[a-z][a-z0-9-]*\]$/i, "").trim();
}

/**
 * Normalize an agent-supplied title: collapse whitespace, strip any readable-id
 * suffix the model may have included, and remove wrapping quotes.
 */
function sanitizeAgentTitle(input: string): string {
	return input
		.replace(/\s+/g, " ")
		.replace(/\s\[[a-z][a-z0-9-]*-[a-z][a-z0-9-]*-[a-z][a-z0-9-]*\]$/i, "")
		.replace(/^["'`]+|["'`]+$/g, "")
		.trim();
}

/**
 * Build the full session name for an agent-supplied title.
 *
 * The agent provides only the title (sans readable id); this extension owns and
 * generates the readable-id suffix. If `readableIdSuffix` is enabled, the canonical
 * suffix for the current session is appended (never duplicated).
 */
/** Spawn-time naming: use the CHILD id, never an inherited parent's readable-id override. */
export function buildSubagentSessionName(title: string, sessionId: string, cwd: string): string {
	const config = loadConfig(cwd);
	const wordlist = loadWordlist(config, cwd);
	if (!wordlist) throw new Error("Cannot name subagent: readable-id wordlist unavailable");
	const cleaned = sanitizeAgentTitle(title)
		.replace(/^(?:\[sub\]\s*)+/i, "")
		.replace(/\p{Cc}/gu, "")
		.trim();
	const base = enforceNameLength(cleaned || "Subagent", 80);
	return `[sub] ${base} [${readableIdFromSessionId(sessionId, wordlist)}]`;
}

function buildAgentSessionName(title: string, config: ResolvedConfig, ctx: ExtensionContext): string {
	const cleaned = sanitizeAgentTitle(title);
	if (!cleaned) return "";
	const capped = enforceNameLength(cleaned, config.maxNameLength) || cleaned;
	if (!config.readableIdSuffix) return capped;

	const sessionId = getSessionId(ctx);
	const wordlist = loadWordlist(config, ctx.cwd);
	const suffix = resolveReadableIdSuffix(config, sessionId, wordlist, capped, ctx);
	return formatFullName("", capped, suffix);
}

function resolveReadableIdOverride(config: ResolvedConfig): string | null {
	const envKey = config.readableIdEnv?.trim();
	if (!envKey) return null;
	const value = process.env[envKey];
	if (!value) return null;
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

function resolveReadableIdSuffix(
	config: ResolvedConfig,
	sessionId: string | null,
	wordlist: WordlistConfig | null,
	name: string,
	ctx: ExtensionContext
): string | null {
	if (!config.readableIdSuffix) return null;
	const override = resolveReadableIdOverride(config);
	if (override) {
		return name.includes(override) ? null : override;
	}
	if (!sessionId || !wordlist) {
		debugNotify(ctx, config, "[auto-rename] readableIdSuffix enabled but wordlist or sessionId missing", "warning");
		return null;
	}
	const readableId = readableIdFromSessionId(sessionId, wordlist);
	return name.includes(readableId) ? null : readableId;
}

function extractReadableIdSuffix(name: string | null | undefined): string | null {
	const match = name?.trim().match(/\s\[([a-z][a-z0-9-]*-[a-z][a-z0-9-]*-[a-z][a-z0-9-]*)\]$/i);
	return match?.[1] ?? null;
}

function formatManualNamePreservingReadableId(
	name: string,
	currentName: string | null | undefined,
	config: ResolvedConfig,
	ctx: ExtensionCommandContext
): string {
	if (!config.readableIdSuffix) return name;

	// Strip any readable-id suffix the user may have typed, then attach a canonical
	// one for the current session. Regenerating (rather than only reading it back
	// from the stored name) keeps the id present even when it came from an external
	// or frontend source and isn't in the stored session name.
	const base = stripReadableIdSuffix(name);
	if (!base) return name;

	const sessionId = getSessionId(ctx);
	const wordlist = loadWordlist(config, ctx.cwd);
	let suffix = resolveReadableIdSuffix(config, sessionId, wordlist, base, ctx);

	// If the canonical suffix cannot be derived (e.g. wordlist/session id missing),
	// preserve whatever readable id is already present in the current name so it is
	// never silently dropped.
	if (!suffix) {
		suffix = extractReadableIdSuffix(currentName);
	}

	return formatFullName("", base, suffix);
}

// ============================================================================
// Command Handlers
// ============================================================================

/** Append-only provenance entry (internal; prefers recordName inside the extension closure). */
function appendNameRecord(pi: ExtensionAPI, ctx: ExtensionContext, record: Omit<NameRecord, "version" | "timestamp">): void {
	const entry: NameRecord = { version: 1, timestamp: new Date().toISOString(), ...record };
	const sessionId = getSessionId(ctx);
	if (sessionId) entry.sessionId = sessionId;
	try {
		pi.appendEntry(NAME_HISTORY_ENTRY_TYPE, entry);
	} catch {
		// best-effort
	}
}
async function handleRegen(
	ctx: ExtensionCommandContext,
	config: ResolvedConfig,
	prefix: string,
	pi: ExtensionAPI,
	setRenamed: () => void
): Promise<void> {
	if (config.prefixOnly) {
		if (!prefix) {
			ctx.ui.notify("prefixOnly set but no prefix available", "warning");
			return;
		}
		pi.setSessionName(prefix);
		appendNameRecord(pi, ctx, { name: prefix, by: "extension", via: "prefix" });
		setRenamed();
		ctx.ui.notify(`Session renamed (prefix only): ${prefix}`, "info");
		return;
	}

	const query = extractFirstUserQuery(ctx);

	if (!query) {
		ctx.ui.notify("No user query found to generate name from", "warning");
		return;
	}

	ctx.ui.notify("Regenerating session name...", "info");
	const sessionId = getSessionId(ctx);
	const wordlist = loadWordlist(config, ctx.cwd);
	const result = await generateSessionName(query, config, ctx, sessionId, wordlist);

	if (result.name) {
		const suffix = resolveReadableIdSuffix(config, sessionId, wordlist, result.name, ctx);
		const fullName = formatFullName(prefix, result.name, suffix);
		try {
			pi.setSessionName(fullName);
			appendNameRecord(pi, ctx, {
				name: fullName,
				by: "extension",
				via: result.source === "deterministic" ? "deterministic" : "regen-llm",
				model: result.model,
			});
			setRenamed();
			ctx.ui.notify(`Session renamed (${result.source}): ${fullName}`, "info");
		} catch (err) {
			if (!isStaleContextError(err)) throw err;
		}
	} else {
		try {
			ctx.ui.notify(`Failed to generate name: ${result.error || "unknown error"}`, "error");
		} catch (err) {
			if (!isStaleContextError(err)) throw err;
		}
	}
}

// ============================================================================
// Model picker (/auto-rename model)
// ============================================================================

interface RegistryModel {
	provider: string;
	id: string;
	name: string;
	/** Context window in tokens, when the registry reports it. */
	contextWindow?: number;
}

/** Compact human-readable context window, e.g. 128k, 1M, —. */
export function formatContextWindow(contextWindow: number | undefined): string {
	if (typeof contextWindow !== "number" || !Number.isFinite(contextWindow) || contextWindow <= 0) return "ctx —";
	if (contextWindow >= 1_000_000) {
		const millions = contextWindow / 1_000_000;
		return `ctx ${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
	}
	const thousands = contextWindow / 1000;
	return `ctx ${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`;
}

/** Models the session's registry can serve, sorted by provider then name. */
function collectRegistryModels(ctx: ExtensionContext): RegistryModel[] {
	const available = ctx.modelRegistry.getAvailable?.() ?? [];
	const out: RegistryModel[] = [];
	for (const m of available) {
		const provider = String(m?.provider ?? "");
		const id = String(m?.id ?? "");
		if (!provider || !id) continue;
		const rawWindow = (m as { contextWindow?: unknown }).contextWindow;
		const contextWindow = typeof rawWindow === "number" && Number.isFinite(rawWindow) && rawWindow > 0 ? rawWindow : undefined;
		out.push({ provider, id, name: String(m?.name ?? id), contextWindow });
	}
	out.sort((a, b) => (a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : a.name < b.name ? -1 : 1));
	return out;
}

/**
 * Fuzzy single-select palette over the shared model registry, mirroring the
 * /subagent models palette. Returns the chosen "provider/id" or undefined.
 */
async function pickModel(
	ctx: ExtensionContext,
	models: RegistryModel[],
	current: string | null
): Promise<RegistryModel | undefined> {
	return await ctx.ui.custom<RegistryModel | undefined>((tui, theme, _kb, done) => {
		let query = "";
		let selected = 0;
		const maxVisible = 10;
		let cachedLines: string[] | undefined;

		const rows = models.map((m) => {
			const ctxText = formatContextWindow(m.contextWindow);
			return {
				model: m,
				pattern: `${m.provider}/${m.id}`,
				match: `${m.name} ${m.provider}/${m.id} ${ctxText}`,
			};
		});

		const refresh = (): void => {
			cachedLines = undefined;
			tui.requestRender();
		};

		function recompute(): { visible: typeof rows; selected: number } {
			const q = query.trim();
			const visible = q ? fuzzyFilter(rows, q, (r: (typeof rows)[number]) => r.match) : rows;
			if (selected >= visible.length) selected = Math.max(0, visible.length - 1);
			return { visible, selected };
		}

		function handleInput(data: string): void {
			if (matchesKey(data, Key.escape)) {
				done(undefined);
				return;
			}
			if (matchesKey(data, Key.enter)) {
				const { visible, selected: idx } = recompute();
				const row = visible[idx];
				done(row ? row.model : undefined);
				return;
			}
			if (matchesKey(data, Key.up)) {
				const count = recompute().visible.length;
				if (count > 0) selected = (selected - 1 + count) % count;
				refresh();
				return;
			}
			if (matchesKey(data, Key.down)) {
				const count = recompute().visible.length;
				if (count > 0) selected = (selected + 1) % count;
				refresh();
				return;
			}
			if (matchesKey(data, Key.backspace)) {
				query = query.slice(0, -1);
				recompute();
				refresh();
				return;
			}
			for (const ch of data) {
				const code = ch.charCodeAt(0);
				if (code >= 0x20 && code !== 0x7f) query += ch;
			}
			recompute();
			refresh();
		}

		function render(width: number): string[] {
			if (cachedLines) return cachedLines;
			const rw = Math.max(1, width);
			const { visible, selected: idx } = recompute();
			const lines: string[] = [];
			lines.push(theme.fg("accent", "─".repeat(rw)));
			lines.push(` ${theme.fg("accent", "Auto-rename model")}${current ? theme.fg("muted", ` — current: ${current}`) : ""}`);
			lines.push("");
			lines.push(` ${theme.fg("muted", "filter:")} ${theme.fg("text", query)}${theme.fg("dim", "▏")}`);
			lines.push("");
			if (visible.length === 0) {
				lines.push(theme.fg("warning", "  No matching models"));
			} else {
				const start = Math.max(0, Math.min(idx - Math.floor(maxVisible / 2), visible.length - maxVisible));
				const end = Math.min(start + maxVisible, visible.length);
				for (let i = start; i < end; i++) {
					const row = visible[i];
					const prefix = i === idx ? theme.fg("accent", "→ ") : "  ";
					const tag = current === row.pattern ? theme.fg("success", "[current] ") : "";
					const ctxBadge = theme.fg("muted", `  ${formatContextWindow(row.model.contextWindow)}`);
					lines.push(truncateToWidth(`${prefix}${tag}${row.model.name}  ${theme.fg("dim", `(${row.pattern})`)}${ctxBadge}`, rw));
				}
				if (start > 0 || end < visible.length) lines.push(theme.fg("dim", `  (${idx + 1}/${visible.length})`));
			}
			lines.push("");
			lines.push(theme.fg("dim", "Type to filter • ↑/↓ select • Enter confirm • Esc cancel"));
			lines.push(theme.fg("accent", "─".repeat(rw)));
			cachedLines = lines;
			return lines;
		}

		return {
			render,
			invalidate: (): void => {
				cachedLines = undefined;
			},
			handleInput,
		};
	});
}

/**
 * `/auto-rename history`: every name this session had, with provenance.
 * Merges this extension's provenance sidecar (who/via/model) with raw
 * `session_info` entries; renames with no sidecar record show as plain
 * user renames (unknown provenance, possibly predating this feature).
 */
function handleHistory(ctx: ExtensionCommandContext): void {
	const branch = ctx.sessionManager.getBranch();
	const records = readNameHistory(branch);
	const sessionInfos: { timestamp: string; name: string | null }[] = [];
	for (const entry of branch) {
		if (typeof entry !== "object" || entry === null) continue;
		const e = entry as { type?: string; name?: string; timestamp?: string };
		if (e.type === "session_info" && typeof e.timestamp === "string") {
			sessionInfos.push({ timestamp: e.timestamp, name: typeof e.name === "string" ? e.name : null });
		}
	}
	const rows = mergeNameHistory(records, sessionInfos);
	if (rows.length === 0) {
		ctx.ui.notify("No session names recorded yet.", "info");
		return;
	}
	const lines = rows.map((row) =>
		formatNameHistoryRow({
			timestamp: row.timestamp,
			by: row.raw ? "user (?)" : row.by,
			via: row.raw ? undefined : row.via,
			model: row.raw ? undefined : row.model,
			name: row.name,
		})
	);
	const current = ctx.sessionManager.getSessionName?.() ?? "";
	if (current) lines.push(`current: ${current}`);
	ctx.ui.notify(lines.join("\n"), "info");
}

/** `/auto-rename model`: pick the renaming model from the registry and persist it. */
async function handleModelPicker(ctx: ExtensionCommandContext, _config: ResolvedConfig): Promise<void> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify('The model picker requires Pi TUI; set "model" in auto-rename.json here', "warning");
		return;
	}
	const models = collectRegistryModels(ctx);
	if (models.length === 0) {
		ctx.ui.notify("No models found in the registry (ctx.modelRegistry.getAvailable()).", "warning");
		return;
	}
	const config = loadConfig(ctx.cwd);
	const current = config.model ? `${config.model.provider}/${config.model.id}` : null;
	const chosen = await pickModel(ctx, models, current);
	if (!chosen) {
		ctx.ui.notify("Model selection cancelled", "info");
		return;
	}
	const saved = persistSetting(ctx.cwd, "model", { provider: chosen.provider, id: chosen.id });
	if (!saved.ok) {
		ctx.ui.notify(`Could not update model: ${saved.error}. Edit the config file directly.`, "error");
		return;
	}
	const fallbackSaved = persistSetting(ctx.cwd, "modelSelection", "current");
	const fallbackNote = fallbackSaved.ok ? "" : ` (modelSelection not updated: ${fallbackSaved.error})`;
	ctx.ui.notify(`Auto-rename model set to ${chosen.provider}/${chosen.id} (saved to ${saved.path})${fallbackNote}`, "info");
}

function handleConfig(ctx: ExtensionCommandContext, config: ResolvedConfig): void {
	const parts = [
		config.endpoint ? `endpoint=${config.endpoint.url} (model=${config.endpoint.model})` : null,
		config.model
			? `model=${config.model.provider}/${config.model.id}`
			: config.endpoint
				? null
				: "model=auto (current session model, then cheapest)",
		config.fallbackModel ? `fallback=${config.fallbackModel.provider}/${config.fallbackModel.id}` : null,
		`deterministic=${config.fallbackDeterministic}`,
		`modelSelection=${config.modelSelection}`,
		config.wordlistPath ? `wordlistPath=${config.wordlistPath}` : null,
		config.wordlist ? "wordlist=inline" : null,
		config.readableIdEnv ? `readableIdEnv=${config.readableIdEnv}` : null,
		config.prefix ? `prefix="${config.prefix}"` : null,
		config.prefixCommand
			? `prefixCmd="${config.prefixCommand.slice(0, 30)}${config.prefixCommand.length > 30 ? "..." : ""}"`
			: null,
		config.prefixOnly ? "prefixOnly=true" : null,
		config.readableIdSuffix ? "readableIdSuffix=true" : null,
		`syncTabTitle=${config.syncTabTitle}`,
		`syncTabTitleInbound=${config.syncTabTitleInbound}`,
		`maxQuery=${config.maxQueryLength}`,
		`maxName=${config.maxNameLength}`,

		`enabled=${config.enabled}`,
	].filter(Boolean);

	ctx.ui.notify(`Config: ${parts.join(", ")}`, "info");
}

function handleInit(ctx: ExtensionCommandContext, cwd: string): void {
	const configPath = join(cwd, CONFIG_FILENAME);

	if (existsSync(configPath)) {
		ctx.ui.notify(`Config already exists: ${configPath}`, "warning");
		return;
	}

	writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
	ctx.ui.notify(`Created config: ${configPath}`, "info");
}

async function handleTest(ctx: ExtensionCommandContext, config: ResolvedConfig): Promise<void> {
	if (config.endpoint?.url) {
		ctx.ui.notify(`Testing endpoint ${config.endpoint.url}...`, "info");
		const result = await tryEndpointGeneration("Test connectivity check.", config, ctx);
		if (result?.name) {
			ctx.ui.notify(`Endpoint OK: generated "${result.name}"`, "info");
			return;
		}
		ctx.ui.notify("Endpoint failed, falling back to model registry test", "warning");
	}

	ctx.ui.notify("Testing model connectivity...", "info");
	const resolution = await resolveModelWithFallback(config, ctx);

	if (resolution.model) {
		ctx.ui.notify(`Model OK: ${resolution.model.provider}/${resolution.model.id}`, "info");
	} else {
		ctx.ui.notify(`Model error: ${resolution.error}`, "error");
	}
}

// ============================================================================
// Extension Entry Point
// ============================================================================

export default function (pi: ExtensionAPI) {
	let sessionRenamed = false;
	let firstPromptHandled = false;
	let inbound: InboundTarget | undefined;
	let inboundDir: string | undefined;
	let inboundSessionFile: string | undefined;
	const tabSync = new TabTitleSync();

	// ---- routing description (append-only custom entry; never model context) ----
	const readDescription = (ctx: ExtensionContext): SessionDescription | undefined =>
		readSessionDescription(ctx.sessionManager.getBranch());

	const writeDescription = (
		ctx: ExtensionContext,
		input: { description: string; topics: string[]; by: "agent" | "human" }
	): SessionDescription => {
		const current = readDescription(ctx);
		const record: SessionDescription = {
			version: 1,
			description: input.description,
			topics: input.topics,
			by: input.by,
			revision: (current?.revision ?? 0) + 1,
			updatedAt: new Date().toISOString(),
		};
		const sessionId = getSessionId(ctx);
		if (sessionId) record.sessionId = sessionId;
		pi.appendEntry(DESCRIPTION_ENTRY_TYPE, record);
		pi.events.emit(DESCRIPTION_EVENT, describePayload(record));
		return record;
	};

	/** Human-owned routing description: show, set or clear. */
	const handleDescribe = (ctx: ExtensionCommandContext, config: ResolvedConfig, text: string): void => {
		if (!config.enabled) {
			ctx.ui.notify("Auto-rename extension is disabled.", "warning");
			return;
		}
		const current = readDescription(ctx);
		if (!text) {
			ctx.ui.notify(
				current
					? `Description (${current.by}): ${current.description}${current.topics.length ? ` [${current.topics.join(", ")}]` : ""}`
					: "No routing description set. Use /auto-rename describe <text>.",
				"info"
			);
			return;
		}
		if (text === "--clear" || text === "clear") {
			const cleared: SessionDescription = {
				version: 1,
				description: "",
				topics: [],
				by: "human",
				revision: (current?.revision ?? 0) + 1,
				updatedAt: new Date().toISOString(),
				cleared: true,
			};
			const sessionId = getSessionId(ctx);
			if (sessionId) cleared.sessionId = sessionId;
			pi.appendEntry(DESCRIPTION_ENTRY_TYPE, cleared);
			pi.events.emit(DESCRIPTION_EVENT, describePayload(cleared));
			ctx.ui.notify("Routing description cleared.", "info");
			return;
		}
		const normalized = normalizeDescription(text);
		if (!normalized.ok) {
			ctx.ui.notify(normalized.error, "error");
			return;
		}
		const topics = normalizeTopics(current?.by === "human" ? current.topics : undefined);
		const record = writeDescription(ctx, {
			description: normalized.value,
			topics: topics.ok ? topics.value : [],
			by: "human",
		});
		ctx.ui.notify(`Description set: ${record.description}`, "info");
	};

	/** A fork keeps the intent but marks where it came from. */
	const inheritDescriptionOnFork = (ctx: ExtensionContext): void => {
		const current = readDescription(ctx);
		const sessionId = getSessionId(ctx);
		if (!current || !sessionId || current.sessionId === sessionId) return;
		const inherited: SessionDescription = {
			...current,
			revision: current.revision + 1,
			updatedAt: new Date().toISOString(),
			sessionId,
			...(current.sessionId ? { inheritedFrom: current.sessionId } : {}),
		};
		pi.appendEntry(DESCRIPTION_ENTRY_TYPE, inherited);
		pi.events.emit(DESCRIPTION_EVENT, describePayload(inherited));
	};

	const stopInbound = () => {
		inbound?.stop();
		inbound = undefined;
		if (inboundDir) {
			const dir = inboundDir;
			inboundDir = undefined;
			try {
				rmSync(dir, { recursive: true, force: true });
			} catch {
				/* Best effort temp cleanup. */
			}
		}
	};

	/** One-shot Herdr socket request; bounded and never fatal. */
	const herdrRequest = (method: string, params: unknown): Promise<unknown> =>
		new Promise((resolve, reject) => {
			const socketPath = process.env.HERDR_SOCKET_PATH;
			if (!socketPath) {
				reject(new Error("no herdr socket"));
				return;
			}
			const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\${socketPath}` : socketPath;
			const socket = net.createConnection(endpoint);
			let buffer = "";
			const finish = (error?: Error, value?: unknown) => {
				socket.destroy();
				if (error) reject(error);
				else resolve(value);
			};
			const timeout = setTimeout(() => finish(new Error("herdr socket timeout")), 1000);
			timeout.unref?.();
			socket.setEncoding("utf8");
			socket.on("error", (error) => {
				clearTimeout(timeout);
				finish(error);
			});
			socket.on("connect", () => socket.write(`${JSON.stringify({ id: `pi-auto-rename:${method}`, method, params })}\n`));
			socket.on("data", (chunk: string) => {
				buffer += chunk;
				const index = buffer.indexOf("\n");
				if (index < 0) return;
				clearTimeout(timeout);
				try {
					finish(undefined, JSON.parse(buffer.slice(0, index)));
				} catch (error) {
					finish(error as Error);
				}
			});
		});

	const tmuxRun = (args: string[]): Promise<string> =>
		new Promise((resolve, reject) => {
			execFile("tmux", args, { timeout: 1000, maxBuffer: 64 * 1024 }, (error, stdout) => {
				if (error) reject(error);
				else resolve(stdout);
			});
		});

	/** Read a bounded chunk of the tmux inbox starting at a byte offset. */
	const readInbox = (path: string, from: number): { text: string; offset: number } => {
		const size = statSync(path).size;
		if (size <= from) return { text: "", offset: size };
		const length = Math.min(size - from, 32 * 1024);
		const fd = openSync(path, "r");
		try {
			const buffer = Buffer.alloc(length);
			const read = readSync(fd, buffer, 0, length, from);
			return { text: buffer.subarray(0, read).toString("utf8"), offset: from + read };
		} finally {
			closeSync(fd);
		}
	};

	const startInbound = (ctx: ExtensionContext) => {
		const config = loadConfig(ctx.cwd);
		stopInbound();
		if (!config.enabled || !config.syncTabTitleInbound) return;
		if (process.env.HERDR_ENV !== "1" && !process.env.TMUX) return;
		const sessionFile = ctx.sessionManager.getSessionFile?.();
		const sessionId = getSessionId(ctx);
		const words = loadWordlist(config, ctx.cwd);
		const canonicalId = sessionId && words ? readableIdFromSessionId(sessionId, words) : undefined;
		inboundSessionFile = sessionFile;
		let inboxPath = "";
		if (process.env.HERDR_ENV !== "1") {
			try {
				inboundDir = mkdtempSync(join(tmpdir(), "pi-inbound-title-"));
				inboxPath = join(inboundDir, "inbox");
				writeFileSync(inboxPath, "", { mode: 0o600 });
			} catch {
				inboundDir = undefined;
			}
		}
		inbound = createInboundTarget(
			{
				readableId: resolveReadableIdOverride(config) ?? canonicalId,
				sessionFile,
				env: process.env,
				apply: async (base) => {
					// Reject stale applications after session replacement.
					if (inboundSessionFile !== sessionFile) return;
					// The host label replaces the whole name; only the canonical readable
					// id is re-appended. The configured prefix is intentionally not re-added.
					const suffix = resolveReadableIdSuffix(config, sessionId, words, base, ctx);
					const full = formatFullName("", base, suffix);
					if (full === pi.getSessionName()) return;
					setNameAndNotify(full, ctx, { name: full, by: "extension", via: "prefix" });
					sessionRenamed = true;
					// Suppress the outbound echo this rename will trigger.
					inbound?.notePushed(tabTitle(full, resolveReadableIdOverride(config) ?? canonicalId));
				},
			},
			{ run: tmuxRun, inboxPath, readInbox, request: herdrRequest }
		);
		inbound?.start();
	};
	const syncTitle = (ctx: ExtensionContext, name = pi.getSessionName() ?? "New Session"): Promise<void> => {
		const config = loadConfig(ctx.cwd);
		if (!config.syncTabTitle) {
			tabSync.reset();
			return Promise.resolve();
		}
		if (process.env.HERDR_ENV !== "1" && !process.env.TMUX) return Promise.resolve();
		const sessionId = getSessionId(ctx);
		const words = loadWordlist(config, ctx.cwd);
		const canonicalId = sessionId && words ? readableIdFromSessionId(sessionId, words) : undefined;
		// Spawned children deliberately ignore inherited readable-ID overrides.
		const readableId =
			canonicalId && name.endsWith(` [${canonicalId}]`) ? canonicalId : (resolveReadableIdOverride(config) ?? undefined);
		// Record the pushed title so a host echo is not mistaken for user intent.
		inbound?.notePushed(tabTitle(name, readableId));
		return tabSync.update({ name, readableId, sessionFile: ctx.sessionManager.getSessionFile?.(), env: process.env });
	};
	pi.on("session_info_changed", (event, ctx) => {
		// Renames that did not funnel through setNameAndNotify (user /name, other
		// extensions) still get a history record. Defer 50ms so our own renames
		// (recorded via the sidecar first) commit and can be deduplicated.
		const changedName = event.name;
		if (changedName !== undefined) {
			setTimeout(() => {
				// The ctx can go stale before the timer fires (fast print-mode runs,
				// session replacement). The getter throws in that case; a deferred
				// history sidecar write is never worth crashing the process.
				try {
					const records = readNameHistory(ctx.sessionManager.getBranch());
					const last = records.at(-1);
					const alreadyRecorded =
						last !== undefined && last.name === changedName && Date.now() - Date.parse(last.timestamp) < 10_000;
					if (!alreadyRecorded) recordName(ctx, { name: changedName, by: "user" });
				} catch {
					// Stale ctx or a failed appendix: history stays as last committed.
				}
			}, 50);
		}
		void syncTitle(ctx, event.name ?? "New Session");
	});
	pi.on("session_shutdown", () => {
		tabSync.reset();
		stopInbound();
	});

	const setRenamed = () => {
		sessionRenamed = true;
	};

	/**
	 * Set the session name and notify the Oqto runner via a status event.
	 * The runner picks up the TITLE_CHANGED_STATUS_KEY and broadcasts
	 * a canonical session.title_changed event to the frontend.
	 *
	 * Swallows stale-context errors so async rename work that completes
	 * after a fast session does not crash the process.
	 */
	const recordName = (ctx: ExtensionContext, record: Omit<NameRecord, "version" | "timestamp">): void => {
		const entry: NameRecord = { version: 1, timestamp: new Date().toISOString(), ...record };
		const sessionId = getSessionId(ctx);
		if (sessionId) entry.sessionId = sessionId;
		try {
			pi.appendEntry(NAME_HISTORY_ENTRY_TYPE, entry);
		} catch {
			// History is best-effort; a failed sidecar write must not break the rename.
		}
	};

	const setNameAndNotify = (
		name: string,
		ctx: ExtensionContext,
		provenance?: Omit<NameRecord, "version" | "timestamp">
	): boolean => {
		try {
			pi.setSessionName(name);
		} catch (err) {
			if (isStaleContextError(err)) {
				return false;
			}
			throw err;
		}
		if (provenance) recordName(ctx, provenance);
		// Keep interactive TUI status line clean; emit status only for non-TUI/rpc consumers.
		if (!ctx.hasUI) {
			try {
				ctx.ui.setStatus(TITLE_CHANGED_STATUS_KEY, name);
			} catch (err) {
				if (!isStaleContextError(err)) throw err;
			}
		}
		return true;
	};

	const checkExistingName = () => {
		if (isDefaultName(pi.getSessionName())) return;
		sessionRenamed = true;
	};

	/**
	 * Regenerate the readable-id suffix after a session fork.
	 *
	 * A forked session copies the parent's session_info entry, so the inherited
	 * name still carries the readable id derived from the *parent* session id.
	 * The readable id is deterministic from the session id, so it must be
	 * recomputed from the new (forked) session id. An env override is session-
	 * independent and is preserved as-is.
	 */
	const regenerateReadableIdOnFork = (ctx: ExtensionContext): void => {
		const config = loadConfig(ctx.cwd);
		if (!config.enabled || !config.readableIdSuffix) return;

		const currentName = pi.getSessionName();
		const existingSuffix = extractReadableIdSuffix(currentName);
		if (!existingSuffix || !currentName) return;

		const base = stripReadableIdSuffix(currentName);
		if (!base) return;

		const sessionId = getSessionId(ctx);
		const wordlist = loadWordlist(config, ctx.cwd);
		const override = resolveReadableIdOverride(config);

		let newSuffix: string;
		if (override) {
			newSuffix = override;
		} else if (sessionId && wordlist) {
			newSuffix = readableIdFromSessionId(sessionId, wordlist);
		} else {
			return;
		}

		const newName = `${base} [${newSuffix}]`;
		if (newName === currentName) return;

		setNameAndNotify(newName, ctx, { name: newName, by: "extension", via: "fork" });
		debugNotify(ctx, config, `[auto-rename] Fork: regenerated readable id "${existingSuffix}" -> "${newSuffix}"`, "info");
	};

	pi.on("session_start", async (event, ctx) => {
		tabSync.reset();
		sessionRenamed = false;
		firstPromptHandled = false;
		checkExistingName();

		if (event && event.reason === "fork") {
			regenerateReadableIdOnFork(ctx);
			inheritDescriptionOnFork(ctx);
		}
		void syncTitle(ctx);
		startInbound(ctx);
	});

	pi.on("session_tree", async () => {
		sessionRenamed = false;
		firstPromptHandled = false;
		checkExistingName();
	});

	const renameFromQuery = async (query: string, ctx: ExtensionContext): Promise<void> => {
		const config = loadConfig(ctx.cwd);
		if (!config.enabled) return;

		if (!isDefaultName(pi.getSessionName())) {
			sessionRenamed = true;
			return;
		}

		const prefix = resolvePrefix(config, ctx.cwd, ctx);
		if (config.prefixOnly) {
			if (!prefix) {
				debugNotify(ctx, config, "[auto-rename] prefixOnly set but no prefix available", "warning");
				return;
			}
			setNameAndNotify(prefix, ctx, { name: prefix, by: "extension", via: "prefix" });
			sessionRenamed = true;
			debugNotify(ctx, config, `[auto-rename] Named (prefix only): ${prefix}`, "info");
			return;
		}

		const sessionId = getSessionId(ctx);
		const wordlist = loadWordlist(config, ctx.cwd);
		const result = await generateSessionName(query, config, ctx, sessionId, wordlist);

		if (!result.name) {
			debugNotify(ctx, config, `[auto-rename] Failed to generate name: ${result.error || "unknown error"}`, "warning");
			return;
		}

		const suffix = resolveReadableIdSuffix(config, sessionId, wordlist, result.name, ctx);
		const fullName = formatFullName(prefix, result.name, suffix);
		setNameAndNotify(fullName, ctx, {
			name: fullName,
			by: "extension",
			via: result.source === "deterministic" ? "deterministic" : "auto-llm",
			model: result.model,
		});
		sessionRenamed = true;
		debugNotify(ctx, config, `[auto-rename] Named (${result.source}): ${fullName}`, "info");
	};

	pi.on("before_agent_start", async (event, ctx) => {
		const config = loadConfig(ctx.cwd);
		debugNotify(ctx, config, `[auto-rename] before_agent_start: renamed=${sessionRenamed} handled=${firstPromptHandled}`);
		if (sessionRenamed || firstPromptHandled) return;
		firstPromptHandled = true;

		const prompt = event.prompt?.trim();
		if (!prompt) {
			debugNotify(ctx, config, "[auto-rename] before_agent_start: no prompt", "warning");
			return;
		}
		debugNotify(ctx, config, `[auto-rename] before_agent_start: triggering rename for "${prompt.slice(0, 30)}..."`);
		void renameFromQuery(prompt, ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (sessionRenamed) return;

		const config = loadConfig(ctx.cwd);
		if (!config.enabled) return;

		if (!isDefaultName(pi.getSessionName())) {
			sessionRenamed = true;
			return;
		}

		const query = extractFirstUserQuery(ctx);
		if (!query) {
			debugNotify(ctx, config, "[auto-rename] No user query found", "warning");
			return;
		}
		void renameFromQuery(query, ctx);
	});

	pi.registerCommand("auto-rename", {
		description:
			"Auto-rename: show name, force regenerate, or set manually. Subcommands: config, regen, init, test, history (past names + who set them), model [picker|list|off] (model selection), describe [text|--clear] (routing hint), sync|inbound|outbound [on|off] (tab sync),",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const trimmed = args.trim();
			const config = loadConfig(ctx.cwd);

			if (trimmed === "regen" || trimmed === "regenerate") {
				const prefix = resolvePrefix(config, ctx.cwd, ctx);
				await handleRegen(ctx, config, prefix, pi, setRenamed);
			} else if (
				trimmed === "describe" ||
				trimmed === "description" ||
				trimmed.startsWith("describe ") ||
				trimmed.startsWith("description ")
			) {
				handleDescribe(ctx, config, trimmed.replace(/^(?:describe|description)\s*/, "").trim());
			} else if (trimmed === "config") {
				handleConfig(ctx, config);
			} else if (trimmed === "model" || trimmed.startsWith("model ")) {
				const rest = trimmed.slice("model".length).trim();
				if (rest === "off" || rest === "clear") {
					const saved = persistSetting(ctx.cwd, "model", null);
					if (!saved.ok) {
						ctx.ui.notify(`Could not clear model: ${saved.error}. Edit the config file directly.`, "error");
						return;
					}
					ctx.ui.notify(
						`Auto-rename model cleared (saved to ${saved.path}); modelSelection=${config.modelSelection} applies`,
						"info"
					);
					return;
				}
				if (rest === "list") {
					const models = collectRegistryModels(ctx);
					if (models.length === 0) {
						ctx.ui.notify("No models found in the registry (ctx.modelRegistry.getAvailable()).", "warning");
						return;
					}
					const current = config.model ? `${config.model.provider}/${config.model.id}` : null;
					ctx.ui.notify(
						models
							.map(
								(m) =>
									`${m.provider}/${m.id}${current === `${m.provider}/${m.id}` ? " [current]" : ""} — ${m.name} (${formatContextWindow(m.contextWindow)})`
							)
							.join("\n"),
						"info"
					);
					return;
				}
				if (rest) {
					ctx.ui.notify("Usage: /auto-rename model [picker|list|off] — no arguments opens the picker", "error");
					return;
				}
				await handleModelPicker(ctx, config);
			} else if (
				trimmed === "sync" ||
				trimmed === "inbound" ||
				trimmed === "outbound" ||
				trimmed.startsWith("sync ") ||
				trimmed.startsWith("inbound ") ||
				trimmed.startsWith("outbound ")
			) {
				const kind = trimmed.split(/\s+/)[0] as "sync" | "inbound" | "outbound";
				const explicit = trimmed.split(/\s+/)[1];
				const key = kind === "outbound" ? "syncTabTitle" : "syncTabTitleInbound";
				const current = kind === "outbound" ? config.syncTabTitle : config.syncTabTitleInbound;
				let next: boolean;
				if (explicit === "on") next = true;
				else if (explicit === "off") next = false;
				else next = !current; // bare toggle preserves the old behavior
				const saved = persistBooleanSetting(ctx.cwd, key, next);
				if (!saved.ok) {
					ctx.ui.notify(`Could not update ${key}: ${saved.error}. Edit the config file directly.`, "error");
					return;
				}
				if (key === "syncTabTitleInbound") {
					// Start/stop the listener immediately; no reload needed.
					if (next) startInbound(ctx);
					else stopInbound();
				}
				ctx.ui.notify(`${key} = ${next} (saved to ${saved.path})`, "info");
			} else if (trimmed === "history" || trimmed === "names") {
				handleHistory(ctx);
			} else if (trimmed === "init") {
				handleInit(ctx, ctx.cwd);
			} else if (trimmed === "test") {
				await handleTest(ctx, config);
			} else if (trimmed) {
				const fullName = formatManualNamePreservingReadableId(trimmed, pi.getSessionName(), config, ctx);
				setNameAndNotify(fullName, ctx, { name: fullName, by: "user", via: "manual" });
				sessionRenamed = true;
				ctx.ui.notify(`Session renamed: ${fullName}`, "info");
			} else {
				const name = pi.getSessionName();
				ctx.ui.notify(name ? `Current name: ${name}` : "No session name set", "info");
			}
		},
	});

	// -----------------------------------------------------------------------
	// Expose a rename tool to the agent
	// -----------------------------------------------------------------------
	// The agent supplies a title sans readable id; this extension owns and
	// generates the readable-id suffix (appended automatically when enabled).
	// -----------------------------------------------------------------------
	// Routing description: metadata, never authority
	// -----------------------------------------------------------------------
	pi.registerTool({
		name: "describe_session",
		label: "Describe Session",
		outputSchema: Type.Union([
			Type.Object({
				ok: Type.Literal(true),
				action: Type.Literal("describe"),
				description: Type.String(),
				topics: Type.Array(Type.String()),
				revision: Type.Number(),
			}),
			Type.Object({
				ok: Type.Literal(false),
				action: Type.Literal("describe"),
				error: Type.Object({ code: Type.String(), message: Type.String() }),
			}),
		]),
		description:
			"Set a one-line routing hint for this session, used by routing tools to decide what incoming work fits here. " +
			"Describe the current work and any constraints (what you are changing, what you need). " +
			"Never include credentials, tokens or secrets. This is metadata for routing, NOT permission or authority. " +
			"Keep it under 280 characters; the user can override it and their text wins.",
		promptSnippet:
			"describe_session: record a one-line routing hint (<=280 chars) for this session; no secrets, not a permission.",
		parameters: Type.Object({
			description: Type.String({
				description: "One short line describing the current work and constraints. Used for routing only.",
			}),
			topics: Type.Optional(
				Type.Array(Type.String(), {
					description: 'Optional lower-case routing slugs, e.g. ["herdr","pi-agent-extensions"] (max 8).',
				})
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			signal?.throwIfAborted();
			const config = loadConfig(ctx.cwd);
			if (!config.enabled)
				return {
					content: [{ type: "text", text: "Auto-rename extension is disabled; cannot describe the session." }],
					details: { action: "describe", error: "disabled" },
					isError: true,
					structuredContent: { ok: false, action: "describe", error: "disabled" } as JsonValue,
				};
			const normalized = normalizeDescription(params.description);
			if (!normalized.ok)
				return {
					content: [{ type: "text", text: `Could not describe: ${normalized.error}` }],
					details: { action: "describe", error: normalized.error },
					isError: true,
					structuredContent: { ok: false, action: "describe", error: normalized.error } as JsonValue,
				};
			const topics = normalizeTopics(params.topics);
			if (!topics.ok)
				return {
					content: [{ type: "text", text: `Could not describe: ${topics.error}` }],
					details: { action: "describe", error: topics.error },
					isError: true,
					structuredContent: { ok: false, action: "describe", error: topics.error } as JsonValue,
				};
			const current = readDescription(ctx);
			if (current?.by === "human")
				return {
					content: [
						{
							type: "text",
							text: "Could not describe: the user set this session's description; ask them to change it.",
						},
					],
					details: { action: "describe", error: "human-owned" },
					isError: true,
					structuredContent: { ok: false, action: "describe", error: "human-owned" } as JsonValue,
				};
			const record = writeDescription(ctx, { description: normalized.value, topics: topics.value, by: "agent" });
			return {
				content: [{ type: "text", text: `Session described: ${record.description}` }],
				details: { action: "describe", description: record.description, topics: record.topics, revision: record.revision },
				structuredContent: {
					ok: true,
					action: "describe",
					description: record.description,
					topics: record.topics,
					revision: record.revision,
				},
			};
		},
	});

	// The character limit for session names is the configured `maxNameLength`:
	// it caps the model-supplied title here (readable-id suffix excluded), is
	// enforced in buildAgentSessionName and enforced again on the LLM path via
	// parseNameFromResponse. Tool text shows the configured value at load time;
	// execute() re-reads config, so mid-session config edits stay accurate.
	const toolConfig = loadConfig(process.cwd());
	pi.registerTool({
		name: "rename_session",
		label: "Rename Session",
		outputSchema: Type.Union([
			Type.Object({ ok: Type.Literal(true), action: Type.Literal("rename"), previous: Type.String(), name: Type.String() }),
			Type.Object({
				ok: Type.Literal(false),
				action: Type.Literal("rename"),
				error: Type.Object({ code: Type.String(), message: Type.String() }),
			}),
		]),
		description: `Set the current session's display name to a concise, descriptive title. Use this when you accomplish something meaningful or the session's focus shifts, so the session is easy to find and resume later. Provide a short title; the readable-id suffix is generated automatically and must NOT be included. Keep the title within ${toolConfig.maxNameLength} characters.`,
		promptSnippet: `rename_session: give the current session a short, descriptive title (<= ${toolConfig.maxNameLength} chars, without the readable-id suffix).`,
		parameters: Type.Object({
			name: Type.String({
				description: `New session title. One to a few words in title case, no trailing punctuation, no quotes. Keep it within ${toolConfig.maxNameLength} characters. The readable-id suffix is appended automatically and should not be provided.`,
			}),
		}),
		async execute(
			_toolCallId,
			params,
			_signal,
			_onUpdate,
			ctx
		): Promise<import("@earendil-works/pi-coding-agent").AgentToolResult<unknown>> {
			_signal?.throwIfAborted();
			const config = loadConfig(ctx.cwd);
			if (!config.enabled) {
				return {
					content: [{ type: "text", text: "Auto-rename extension is disabled; cannot rename the session." }],
					details: { action: "rename", error: "disabled" },
					isError: true,
					structuredContent: {
						ok: false,
						action: "rename",
						error: { code: "disabled", message: "Auto-rename extension is disabled" },
					},
				};
			}

			const name = buildAgentSessionName(params.name, config, ctx);
			if (!name) {
				return {
					content: [{ type: "text", text: "Could not rename: empty session name." }],
					details: { action: "rename", error: "empty-name" },
					isError: true,
					structuredContent: { ok: false, action: "rename", error: { code: "empty_name", message: "Empty session name" } },
				};
			}

			const previous = pi.getSessionName() ?? "";
			setNameAndNotify(name, ctx, { name, by: "agent", via: "agent-tool" });
			sessionRenamed = true;
			return {
				content: [{ type: "text", text: `Session renamed to "${name}".` }],
				details: { action: "rename", previous, name },
				structuredContent: { ok: true, action: "rename", previous, name },
			};
		},
	});
}
