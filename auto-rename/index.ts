/**
 * Auto-rename extension for pi sessions.
 *
 * Automatically generates a session name based on the first user query
 * using a configurable LLM model and prompt.
 *
 * Configuration (auto-rename.json in cwd or ~/.pi/agent/):
 * {
 *   "model": { "provider": "anthropic", "id": "claude-3-5-haiku-20241022" },
 *   "fallbackModel": { "provider": "openai", "id": "gpt-4o-mini" },
 *   "fallbackDeterministic": "readable-id",
 *   "prompt": "Generate a short, descriptive title...",
 *   "prefix": "[auto] ",
 *   "prefixCommand": "basename $(git rev-parse --show-toplevel 2>/dev/null || pwd)",
 *   "prefixOnly": false,
 *   "readableIdSuffix": false,
 *   "enabled": true,
 *   "debug": false,
 *   "wordlistPath": "./word_lists.toml",
 *   "wordlist": { "adjectives": [], "nouns": [] }
 * }
 *
 * Prefix options:
 * - "prefix": Static string prefix
 * - "prefixCommand": Shell command whose stdout becomes the prefix (trimmed)
 * - "prefixOnly": If true, skip LLM and use only the prefix as the full name
 *
 * Suffix options:
 * - "readableIdSuffix": If true, append "[readable-id]" to the generated name
 *
 * Fallback options:
 * - "fallbackModel": Alternative model if primary fails
 * - "fallbackDeterministic": Function to use if all models fail
 *   - "readable-id": Deterministic adjective-noun-noun from session ID
 *   - "truncate": First 50 chars of query
 *   - "words": First 6 words of query
 *   - "none": Don't set a name if LLM fails
 *
 * The prefixCommand runs in the session's cwd. If it fails, falls back to static prefix.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Api, type Model, complete, getModel, getProviders } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";

// ============================================================================
// Types
// ============================================================================

interface ModelConfig {
	provider: string;
	id: string;
}

interface WordlistConfig {
	adjectives: string[];
	nouns: string[];
}

interface AutoRenameConfig {
	model?: ModelConfig;
	fallbackModel?: ModelConfig | null;
	fallbackDeterministic?: "truncate" | "words" | "none" | "readable-id";
	prompt?: string;
	prefix?: string;
	prefixCommand?: string;
	prefixOnly?: boolean;
	readableIdSuffix?: boolean;
	enabled?: boolean;
	debug?: boolean;
	wordlistPath?: string;
	wordlist?: WordlistConfig;
}

type ResolvedConfig = {
	model: ModelConfig;
	fallbackModel: ModelConfig | null | undefined;
	fallbackDeterministic: "truncate" | "words" | "none" | "readable-id";
	prompt: string;
	prefix: string;
	prefixCommand: string | undefined;
	prefixOnly: boolean;
	readableIdSuffix: boolean;
	enabled: boolean;
	debug: boolean;
	wordlistPath: string | undefined;
	wordlist: WordlistConfig | undefined;
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

const DEFAULT_CONFIG: ResolvedConfig = {
	model: { provider: "anthropic", id: "claude-3-5-haiku-20241022" },
	fallbackModel: { provider: "openai", id: "gpt-4o-mini" },
	fallbackDeterministic: "readable-id",
	prompt: DEFAULT_PROMPT,
	prefix: "",
	prefixCommand: undefined,
	prefixOnly: false,
	readableIdSuffix: false,
	enabled: true,
	debug: false,
	wordlistPath: undefined,
	wordlist: undefined,
};

const CONFIG_FILENAME = "auto-rename.json";
const SUBAGENT_PREFIX_ENV = "PI_SUBAGENT_PREFIX";
const DEFAULT_WORDLIST_PATH = join(dirname(fileURLToPath(import.meta.url)), "wordlist", "word_lists.toml");

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
				return { ...DEFAULT_CONFIG, ...userConfig } as ResolvedConfig;
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

		return extractTextFromContent(msg.content);
	}

	return null;
}

function getSessionId(ctx: ExtensionContext): string | null {
	const manager = ctx.sessionManager as { getSessionId?: () => string };
	const id = manager.getSessionId?.();
	return id || null;
}

function extractTextFromContent(content: unknown): string | null {
	if (typeof content === "string") {
		return content.trim() || null;
	}

	if (Array.isArray(content)) {
		for (const block of content) {
			if (block && typeof block === "object" && "type" in block && block.type === "text" && "text" in block) {
				const text = (block.text as string).trim();
				if (text) return text;
			}
		}
	}

	return null;
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

async function resolveModel(
	modelConfig: ModelConfig,
	ctx: ExtensionContext
): Promise<{ model: Model<Api> | null; apiKey: string | null; error: string | null }> {
	const providers = getProviders();

	if (!providers.includes(modelConfig.provider as (typeof providers)[number])) {
		const availableProviders = providers.slice(0, 5).join(", ");
		const suffix = providers.length > 5 ? "..." : "";
		return {
			model: null,
			apiKey: null,
			error: `Provider "${modelConfig.provider}" not found. Available: ${availableProviders}${suffix}`,
		};
	}

	const model = getModel(modelConfig.provider as "anthropic", modelConfig.id as "claude-3-5-haiku-20241022") as
		| Model<Api>
		| undefined;

	if (!model) {
		return {
			model: null,
			apiKey: null,
			error: `Model "${modelConfig.id}" not found for provider "${modelConfig.provider}"`,
		};
	}

	const apiKey = await ctx.modelRegistry.getApiKey(model);

	if (!apiKey) {
		return {
			model,
			apiKey: null,
			error: `No API key for ${modelConfig.provider}. Set the appropriate environment variable.`,
		};
	}

	return { model, apiKey, error: null };
}

async function resolveModelWithFallback(config: ResolvedConfig, ctx: ExtensionContext): Promise<ModelResolutionResult> {
	const primary = await resolveModel(config.model, ctx);

	if (primary.model && primary.apiKey) {
		return { ...primary, source: "primary" };
	}

	if (config.debug && ctx.hasUI && primary.error) {
		ctx.ui.notify(`[auto-rename] Primary model failed: ${primary.error}`, "warning");
	}

	if (config.fallbackModel) {
		const fallback = await resolveModel(config.fallbackModel, ctx);

		if (fallback.model && fallback.apiKey) {
			if (config.debug && ctx.hasUI) {
				ctx.ui.notify(`[auto-rename] Using fallback model: ${config.fallbackModel.provider}/${config.fallbackModel.id}`, "info");
			}
			return { ...fallback, source: "fallback" };
		}

		if (config.debug && ctx.hasUI && fallback.error) {
			ctx.ui.notify(`[auto-rename] Fallback model failed: ${fallback.error}`, "warning");
		}
	}

	return {
		model: null,
		apiKey: null,
		error: primary.error || "No model available",
		source: null,
	};
}

// ============================================================================
// LLM Name Generation
// ============================================================================

function parseNameFromResponse(response: { content: Array<{ type: string; text?: string }> }): string | null {
	const name = response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("")
		.trim()
		.replace(/^["']|["']$/g, "")
		.replace(/\.+$/, "");

	return name || null;
}

function handleLlmError(errorMsg: string, config: ResolvedConfig, ctx: ExtensionContext): void {
	if (config.debug && ctx.hasUI) {
		ctx.ui.notify(`[auto-rename] LLM call failed: ${errorMsg}`, "warning");
	}

	if (!ctx.hasUI) return;

	if (errorMsg.includes("401") || errorMsg.includes("403") || errorMsg.includes("authentication")) {
		ctx.ui.notify(`[auto-rename] Authentication failed for ${config.model.provider}. Check your API key.`, "error");
	} else if (errorMsg.includes("429") || errorMsg.includes("rate limit")) {
		ctx.ui.notify(`[auto-rename] Rate limited by ${config.model.provider}. Using fallback.`, "warning");
	} else if (errorMsg.includes("timeout") || errorMsg.includes("ETIMEDOUT")) {
		ctx.ui.notify("[auto-rename] Request timed out. Using fallback.", "warning");
	}
}

async function tryLlmGeneration(
	query: string,
	config: ResolvedConfig,
	ctx: ExtensionContext,
	resolution: ModelResolutionResult
): Promise<NameGenerationResult | null> {
	if (!resolution.model || !resolution.apiKey) {
		return null;
	}

	const prompt = config.prompt.replace("{{query}}", query);

	try {
		const response = await complete(
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
			{ apiKey: resolution.apiKey }
		);

		const name = parseNameFromResponse(response);

		if (name) {
			return {
				name,
				source: resolution.source === "primary" ? "llm-primary" : "llm-fallback",
				error: null,
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
	const resolution = await resolveModelWithFallback(config, ctx);

	const llmResult = await tryLlmGeneration(query, config, ctx, resolution);
	if (llmResult) {
		return llmResult;
	}

	const deterministicName = generateDeterministicName(query, config.fallbackDeterministic, sessionId, wordlist);

	if (deterministicName) {
		if (config.debug && ctx.hasUI) {
			ctx.ui.notify(`[auto-rename] Using deterministic fallback (${config.fallbackDeterministic})`, "info");
		}
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

function debugNotify(ctx: ExtensionContext, debug: boolean, message: string, level: "info" | "warning" | "error"): void {
	if (debug && ctx.hasUI) {
		ctx.ui.notify(message, level);
	}
}

function resolveReadableIdSuffix(
	config: ResolvedConfig,
	sessionId: string | null,
	wordlist: WordlistConfig | null,
	name: string,
	ctx: ExtensionContext
): string | null {
	if (!config.readableIdSuffix) return null;
	if (!sessionId || !wordlist) {
		debugNotify(ctx, config.debug, "[auto-rename] readableIdSuffix enabled but wordlist or sessionId missing", "warning");
		return null;
	}
	const readableId = readableIdFromSessionId(sessionId, wordlist);
	return readableId === name ? null : readableId;
}

// ============================================================================
// Command Handlers
// ============================================================================

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
		pi.setSessionName(fullName);
		setRenamed();
		ctx.ui.notify(`Session renamed (${result.source}): ${fullName}`, "info");
	} else {
		ctx.ui.notify(`Failed to generate name: ${result.error || "unknown error"}`, "error");
	}
}

function handleConfig(ctx: ExtensionCommandContext, config: ResolvedConfig): void {
	const parts = [
		`model=${config.model.provider}/${config.model.id}`,
		config.fallbackModel ? `fallback=${config.fallbackModel.provider}/${config.fallbackModel.id}` : null,
		`deterministic=${config.fallbackDeterministic}`,
		config.wordlistPath ? `wordlistPath=${config.wordlistPath}` : null,
		config.wordlist ? "wordlist=inline" : null,
		config.prefix ? `prefix="${config.prefix}"` : null,
		config.prefixCommand
			? `prefixCmd="${config.prefixCommand.slice(0, 30)}${config.prefixCommand.length > 30 ? "..." : ""}"`
			: null,
		config.prefixOnly ? "prefixOnly=true" : null,
		config.readableIdSuffix ? "readableIdSuffix=true" : null,
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
	ctx.ui.notify("Testing model connectivity...", "info");

	const resolution = await resolveModelWithFallback(config, ctx);

	if (resolution.model && resolution.apiKey) {
		const provider = resolution.source === "primary" ? config.model.provider : config.fallbackModel?.provider;
		const modelId = resolution.source === "primary" ? config.model.id : config.fallbackModel?.id;
		ctx.ui.notify(`Model OK: ${provider}/${modelId}`, "info");
	} else {
		ctx.ui.notify(`Model error: ${resolution.error}`, "error");
	}
}

// ============================================================================
// Extension Entry Point
// ============================================================================

export default function (pi: ExtensionAPI) {
	let sessionRenamed = false;

	const setRenamed = () => {
		sessionRenamed = true;
	};

	const checkExistingName = () => {
		const existingName = pi.getSessionName();
		if (existingName) {
			sessionRenamed = true;
		}
	};

	pi.on("session_start", async () => {
		sessionRenamed = false;
		checkExistingName();
	});

	pi.on("session_switch", async () => {
		sessionRenamed = false;
		checkExistingName();
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (sessionRenamed) return;

		const config = loadConfig(ctx.cwd);
		if (!config.enabled) return;

		if (pi.getSessionName()) {
			sessionRenamed = true;
			return;
		}

		const prefix = resolvePrefix(config, ctx.cwd, ctx);

		if (config.prefixOnly) {
			if (!prefix) {
				debugNotify(ctx, config.debug, "[auto-rename] prefixOnly set but no prefix available", "warning");
				return;
			}
			pi.setSessionName(prefix);
			sessionRenamed = true;
			debugNotify(ctx, config.debug, `[auto-rename] Named (prefix only): ${prefix}`, "info");
			return;
		}

		const query = extractFirstUserQuery(ctx);
		if (!query) {
			debugNotify(ctx, config.debug, "[auto-rename] No user query found", "warning");
			return;
		}

		const sessionId = getSessionId(ctx);
		const wordlist = loadWordlist(config, ctx.cwd);
		const result = await generateSessionName(query, config, ctx, sessionId, wordlist);

		if (!result.name) {
			debugNotify(ctx, config.debug, `[auto-rename] Failed to generate name: ${result.error || "unknown error"}`, "warning");
			return;
		}

		const suffix = resolveReadableIdSuffix(config, sessionId, wordlist, result.name, ctx);
		const fullName = formatFullName(prefix, result.name, suffix);
		pi.setSessionName(fullName);
		sessionRenamed = true;
		debugNotify(ctx, config.debug, `[auto-rename] Named (${result.source}): ${fullName}`, "info");
	});

	pi.registerCommand("auto-rename", {
		description: "Auto-rename: show name, force regenerate, or set manually",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const trimmed = args.trim();
			const config = loadConfig(ctx.cwd);

			if (trimmed === "regen" || trimmed === "regenerate") {
				const prefix = resolvePrefix(config, ctx.cwd, ctx);
				await handleRegen(ctx, config, prefix, pi, setRenamed);
			} else if (trimmed === "config") {
				handleConfig(ctx, config);
			} else if (trimmed === "init") {
				handleInit(ctx, ctx.cwd);
			} else if (trimmed === "test") {
				await handleTest(ctx, config);
			} else if (trimmed) {
				pi.setSessionName(trimmed);
				sessionRenamed = true;
				ctx.ui.notify(`Session renamed: ${trimmed}`, "info");
			} else {
				const name = pi.getSessionName();
				ctx.ui.notify(name ? `Current name: ${name}` : "No session name set", "info");
			}
		},
	});
}
