/**
 * Azure Empty Response Guard
 *
 * Detects and retries empty responses from Azure Foundry models.
 *
 * Azure Foundry (especially Kimi K2.5) can silently return empty streaming
 * responses under concurrent load. Instead of a proper error (429/503), Azure
 * returns HTTP 200 with a valid-looking SSE stream that contains only
 * `prompt_filter_results` and `[DONE]` -- zero content, zero tokens,
 * stopReason "stop". Pi's built-in retry only triggers on stopReason "error",
 * so these empty responses slip through undetected.
 *
 * This extension intercepts `agent_end` events, detects the empty response
 * pattern, and automatically sends a retry message after a brief delay to
 * give Azure's rate limiter time to recover.
 *
 * Retry strategy (configurable via `retryMode`):
 * - "continue": Always sends the `continueMessage` (default). Best for
 *   mid-task recovery where the model already has context.
 * - "resend": Always re-sends the last user message verbatim. Risks
 *   duplicate tool calls if the model was mid-task.
 * - "auto": Uses "resend" for the first turn (no tool calls yet) and
 *   "continue" for subsequent turns.
 *
 * The continuation message is configurable via `continueMessage`. Set it
 * to "" (empty string) for a minimal nudge -- the model picks up from
 * context without any explicit instruction.
 *
 * Configuration (azure-empty-response-guard.json in cwd or ~/.pi/agent/):
 * {
 *   "enabled": true,
 *   "maxRetries": 5,
 *   "baseDelayMs": 0,
 *   "retryMode": "continue",
 *   "continueMessage": "",
 *   "debug": false,
 *   "providers": ["Foundry_WG"]
 * }
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// ============================================================================
// Types
// ============================================================================

type RetryMode = "continue" | "resend" | "auto";

interface GuardConfig {
	enabled: boolean;
	maxRetries: number;
	baseDelayMs: number;
	retryMode: RetryMode;
	continueMessage: string;
	debug: boolean;
	providers: string[];
}

interface AssistantMessage {
	role: string;
	content: Array<{ type: string; text?: string }>;
	usage?: { input: number; output: number };
	stopReason?: string;
}

interface SessionEntry {
	type: string;
	message?: { role: string; content: unknown };
}

// ============================================================================
// Constants
// ============================================================================

const CONFIG_FILENAME = "azure-empty-response-guard.json";

const DEFAULT_CONFIG: GuardConfig = {
	enabled: true,
	maxRetries: 5,
	baseDelayMs: 0,
	retryMode: "continue",
	continueMessage: "",
	debug: false,
	providers: [],
};

// ============================================================================
// Config
// ============================================================================

function loadConfig(cwd: string): GuardConfig {
	const paths = [join(cwd, CONFIG_FILENAME), join(cwd, ".pi", CONFIG_FILENAME), join(homedir(), ".pi", "agent", CONFIG_FILENAME)];

	for (const path of paths) {
		if (existsSync(path)) {
			try {
				const content = readFileSync(path, "utf-8");
				const userConfig = JSON.parse(content) as Partial<GuardConfig>;
				return { ...DEFAULT_CONFIG, ...userConfig };
			} catch {
				// Invalid JSON, continue
			}
		}
	}

	return DEFAULT_CONFIG;
}

// ============================================================================
// Detection
// ============================================================================

function isEmptyAzureResponse(msg: AssistantMessage): boolean {
	if (msg.role !== "assistant") return false;
	if (msg.stopReason !== "stop") return false;

	// Zero content blocks
	if (msg.content && msg.content.length > 0) return false;

	// Zero usage tokens confirms the request never reached the model
	const usage = msg.usage;
	if (usage && (usage.input > 0 || usage.output > 0)) return false;

	return true;
}

function findLastAssistant(messages: AssistantMessage[]): AssistantMessage | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "assistant") return messages[i];
	}
	return null;
}

// ============================================================================
// Session Analysis
// ============================================================================

/**
 * Check if the session has any tool results, indicating the model has
 * already started working (mid-task). If so, a "continue" message is
 * safer than re-sending the original prompt.
 */
function sessionHasToolResults(ctx: ExtensionContext): boolean {
	const branch = ctx.sessionManager.getBranch() as SessionEntry[];
	for (const entry of branch) {
		if (entry.type !== "message") continue;
		if (entry.message?.role === "toolResult") return true;
	}
	return false;
}

function extractLastUserText(ctx: ExtensionContext): string | null {
	const branch = ctx.sessionManager.getBranch() as SessionEntry[];

	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (entry.type !== "message") continue;
		const msg = entry.message;
		if (!msg || msg.role !== "user") continue;

		if (typeof msg.content === "string") return msg.content;
		if (Array.isArray(msg.content)) {
			for (const block of msg.content) {
				if (block && typeof block === "object" && "type" in block && block.type === "text" && "text" in block) {
					return (block as { text: string }).text;
				}
			}
		}
	}

	return null;
}

/**
 * Determine the retry message based on mode and session state.
 *
 * - "continue": sends the continueMessage (can be empty string)
 * - "resend": re-sends the last user message
 * - "auto": resend for first turn, continue for mid-task
 *
 * Returns null only if "resend" mode and no user message found.
 */
function resolveRetryMessage(config: GuardConfig, ctx: ExtensionContext): string | null {
	if (config.retryMode === "continue") {
		return config.continueMessage;
	}

	if (config.retryMode === "resend") {
		return extractLastUserText(ctx);
	}

	// "auto" mode: resend on first turn, continue mid-task
	if (sessionHasToolResults(ctx)) {
		return config.continueMessage;
	}
	return extractLastUserText(ctx) ?? config.continueMessage;
}

// ============================================================================
// Retry Logic
// ============================================================================

function isProviderMatch(config: GuardConfig, ctx: ExtensionContext): boolean {
	if (config.providers.length === 0) return true;
	const currentModel = ctx.model;
	return currentModel !== undefined && config.providers.includes(currentModel.provider);
}

function notifyRetryAttempt(ctx: ExtensionContext, config: GuardConfig, retryCount: number, delayMs: number, mode: string): void {
	if (!ctx.hasUI) return;
	const delayInfo = delayMs > 0 ? ` in ${(delayMs / 1000).toFixed(1)}s` : "";
	ctx.ui.notify(
		`[azure-guard] Empty response (attempt ${retryCount}/${config.maxRetries}). Retrying${delayInfo} [${mode}]...`,
		"warning"
	);
}

function notifyDebugInfo(ctx: ExtensionContext, config: GuardConfig, msg: AssistantMessage): void {
	if (!config.debug || !ctx.hasUI) return;
	const hasTool = sessionHasToolResults(ctx) ? "yes" : "no";
	ctx.ui.notify(
		`[azure-guard] stop=${msg.stopReason} content=${msg.content?.length ?? 0} in=${msg.usage?.input ?? "?"} out=${msg.usage?.output ?? "?"} midTask=${hasTool}`,
		"info"
	);
}

function notifyGiveUp(ctx: ExtensionContext, maxRetries: number): void {
	if (!ctx.hasUI) return;
	ctx.ui.notify(`[azure-guard] Gave up after ${maxRetries} retries. Azure may be throttling this deployment.`, "error");
}

async function attemptRetry(pi: ExtensionAPI, ctx: ExtensionContext, config: GuardConfig, retryCount: number): Promise<number> {
	const delayMs = config.baseDelayMs > 0 ? config.baseDelayMs * 2 ** (retryCount - 1) : 0;
	const retryMessage = resolveRetryMessage(config, ctx);

	if (retryMessage === null) {
		if (ctx.hasUI) {
			ctx.ui.notify("[azure-guard] Could not determine retry message.", "error");
		}
		return 0;
	}

	const modeLabel = config.retryMode === "resend" && retryMessage !== config.continueMessage ? "resend" : "continue";
	notifyRetryAttempt(ctx, config, retryCount, delayMs, modeLabel);

	if (delayMs > 0) {
		await new Promise((resolve) => setTimeout(resolve, delayMs));
	}

	pi.sendUserMessage(retryMessage, { deliverAs: "followUp" });
	return Date.now();
}

// ============================================================================
// Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
	let retryCount = 0;
	let lastRetryTimestamp = 0;

	const resetState = () => {
		retryCount = 0;
		lastRetryTimestamp = 0;
	};

	pi.on("session_start", async () => {
		resetState();
	});

	pi.on("session_switch", async () => {
		resetState();
	});

	// Reset retry counter when user sends a genuine new message (not our retry)
	pi.on("input", async () => {
		const now = Date.now();
		if (now - lastRetryTimestamp < 2000) return;
		retryCount = 0;
	});

	pi.on("agent_end", async (event, ctx) => {
		const config = loadConfig(ctx.cwd);
		if (!config.enabled) return;
		if (!isProviderMatch(config, ctx)) return;

		const messages = event.messages as AssistantMessage[];
		if (!messages || messages.length === 0) return;

		const lastAssistant = findLastAssistant(messages);
		if (!lastAssistant) return;

		if (!isEmptyAzureResponse(lastAssistant)) {
			retryCount = 0;
			return;
		}

		// Empty response detected
		notifyDebugInfo(ctx, config, lastAssistant);

		if (retryCount >= config.maxRetries) {
			notifyGiveUp(ctx, config.maxRetries);
			retryCount = 0;
			return;
		}

		retryCount++;
		lastRetryTimestamp = await attemptRetry(pi, ctx, config, retryCount);
	});

	// Status on session start
	pi.on("session_start", async (_event, ctx) => {
		const config = loadConfig(ctx.cwd);
		if (config.enabled && ctx.hasUI) {
			ctx.ui.setStatus("azure-guard", "azure-guard: active");
		}
	});

	// Manual control command
	pi.registerCommand("azure-guard", {
		description: "Azure empty response guard: status or reset",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			const config = loadConfig(ctx.cwd);

			if (trimmed === "status" || !trimmed) {
				const providers = config.providers.length > 0 ? config.providers.join(", ") : "all";
				const msg = config.continueMessage || '""';
				ctx.ui.notify(
					`[azure-guard] enabled=${config.enabled} mode=${config.retryMode} maxRetries=${config.maxRetries} delay=${config.baseDelayMs}ms msg=${msg} providers=${providers} retries=${retryCount}`,
					"info"
				);
			} else if (trimmed === "reset") {
				retryCount = 0;
				ctx.ui.notify("[azure-guard] Retry counter reset.", "info");
			} else {
				ctx.ui.notify("[azure-guard] Usage: /azure-guard [status|reset]", "info");
			}
		},
	});
}
