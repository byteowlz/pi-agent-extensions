/**
 * Observational Memory Extension
 *
 * Replaces default compaction with Mastra-style observation-based compression.
 * Instead of structured summaries (Goal / Progress / Decisions), conversation
 * history is compressed into timestamped, prioritized observations that preserve
 * more context and are better suited for LLM recall.
 *
 * Activation (opt-in, requires explicit enablement):
 *   --memory CLI flag
 *   PI_MEMORY=1 environment variable
 *
 * Configuration (optional, provides model/threshold settings when active):
 *   ~/.pi/agent/memory.json (global)
 *   .pi/memory.json (project-local, overrides global)
 *
 * Without activation, the extension is a complete no-op.
 */

import type { Api, Model } from "@mariozechner/pi-ai";
import { complete } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@mariozechner/pi-coding-agent";
import { estimateTokens, getDefaultConfig, loadMemoryConfig } from "./config.js";
import { buildObserverPrompt, extractTextFromResponse, getObserverCompletionOptions } from "./observer.js";
import { runReflector } from "./reflector.js";
import type { MemoryConfig, ObservationalMemoryDetails } from "./types.js";

// ============================================================================
// Types
// ============================================================================

interface ResolvedModel {
	model: Model<Api>;
	apiKey: string;
}

interface Notifier {
	notify: (message: string, level: "info" | "warning" | "error") => void;
}

// ============================================================================
// Helpers
// ============================================================================

/** Resolve a model and its API key. Returns null with a warning if unavailable. */
async function resolveModelWithKey(
	provider: string,
	modelId: string,
	label: string,
	ctx: ExtensionContext,
	ui: Notifier
): Promise<ResolvedModel | null> {
	const model = ctx.modelRegistry.find(provider, modelId) as Model<Api> | undefined;
	if (!model) {
		ui.notify(`OM: ${label} model ${provider}/${modelId} not found, falling back to default compaction`, "warning");
		return null;
	}

	const apiKey = await ctx.modelRegistry.getApiKey(model);
	if (!apiKey) {
		ui.notify(`OM: no API key for ${label} model (${model.provider}), falling back to default compaction`, "warning");
		return null;
	}

	return { model, apiKey };
}

/** Build a notifier that respects ctx.hasUI. */
function makeNotifier(ctx: ExtensionContext): Notifier {
	return {
		notify: (message: string, level: "info" | "warning" | "error") => {
			if (ctx.hasUI) ctx.ui.notify(message, level);
		},
	};
}

/** Call the observer LLM to produce observations from conversation text. */
async function callObserver(
	conversationText: string,
	existingObservations: string,
	config: MemoryConfig,
	resolved: ResolvedModel,
	signal: AbortSignal
): Promise<string> {
	const currentDate = new Date().toISOString().split("T")[0];
	const prompt = buildObserverPrompt(conversationText, existingObservations, currentDate);

	const response = await complete(
		resolved.model,
		{ messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }] },
		getObserverCompletionOptions(config.observer, resolved.apiKey, signal)
	);

	return extractTextFromResponse(response);
}

/** Merge existing observations with new ones. */
function mergeObservations(existing: string, fresh: string): string {
	return existing.trim() ? `${existing.trim()}\n\n${fresh}` : fresh;
}

/** Build the compaction result object. */
function buildCompactionResult(observations: string, firstKeptEntryId: string, tokensBefore: number, reflected: boolean) {
	const details: ObservationalMemoryDetails = {
		type: "observational-memory",
		observationTokens: estimateTokens(observations),
		reflected,
	};

	return {
		compaction: {
			summary: observations,
			firstKeptEntryId,
			tokensBefore,
			details,
		},
	};
}

/**
 * Call the observer and return new observations, or null to fall back to default compaction.
 * Handles errors and empty responses gracefully.
 */
async function observeOrFallback(
	conversationText: string,
	existingObservations: string,
	config: MemoryConfig,
	resolved: ResolvedModel,
	signal: AbortSignal,
	ui: Notifier
): Promise<string | null> {
	let newObservations: string;
	try {
		newObservations = await callObserver(conversationText, existingObservations, config, resolved, signal);
	} catch (error) {
		if (signal.aborted) return null;
		const message = error instanceof Error ? error.message : String(error);
		ui.notify(`OM: observer failed: ${message}, falling back to default compaction`, "warning");
		return null;
	}

	if (!newObservations.trim()) {
		if (!signal.aborted) ui.notify("OM: observer returned empty response, using default compaction", "warning");
		return null;
	}

	return newObservations;
}

/** Run reflection if observations exceed the threshold. Returns the (possibly consolidated) observations. */
async function maybeReflect(
	observations: string,
	config: MemoryConfig,
	ctx: ExtensionContext,
	signal: AbortSignal,
	ui: Notifier
): Promise<{ observations: string; reflected: boolean }> {
	const observationTokens = estimateTokens(observations);
	if (observationTokens <= config.reflector.observationTokenThreshold) {
		return { observations, reflected: false };
	}

	const resolved = await resolveModelWithKey(config.reflector.provider, config.reflector.model, "reflector", ctx, ui);
	if (!resolved) {
		return { observations, reflected: false };
	}

	try {
		const consolidated = await runReflector(observations, config.reflector, resolved.model, resolved.apiKey, signal, ui.notify);
		return { observations: consolidated, reflected: true };
	} catch (error) {
		if (signal.aborted) throw error;
		const message = error instanceof Error ? error.message : String(error);
		ui.notify(`OM: reflector failed (${message}), using uncompressed observations`, "warning");
		return { observations, reflected: false };
	}
}

// ============================================================================
// Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
	pi.registerFlag("memory", {
		description: "Enable observational memory compaction",
		type: "boolean",
		default: false,
	});

	let config: MemoryConfig = getDefaultConfig();
	let active = false;

	pi.on("session_start", async (_event, ctx) => {
		const flagEnabled = pi.getFlag("memory") as boolean;
		const envEnabled = process.env.PI_MEMORY === "1";

		active = flagEnabled || envEnabled;
		if (!active) return;

		// Load config from memory.json files (or use defaults)
		const fileConfig = loadMemoryConfig(ctx.cwd);
		config = fileConfig ?? getDefaultConfig();

		if (ctx.hasUI) {
			ctx.ui.setStatus("memory", ctx.ui.theme.fg("accent", "OM"));
			ctx.ui.notify("Observational memory compaction enabled", "info");
		}
	});

	pi.on("session_before_compact", async (event, ctx) => {
		if (!active) return;

		const { preparation, signal } = event;
		const { messagesToSummarize, turnPrefixMessages, tokensBefore, firstKeptEntryId, previousSummary } = preparation;
		const ui = makeNotifier(ctx);

		// Resolve observer model
		const resolved = await resolveModelWithKey(config.observer.provider, config.observer.model, "observer", ctx, ui);
		if (!resolved) return;

		const allMessages = [...messagesToSummarize, ...turnPrefixMessages];
		ui.notify(
			`OM: observing ${allMessages.length} messages (${tokensBefore.toLocaleString()} tokens) with ${resolved.model.id}...`,
			"info"
		);

		const conversationText = serializeConversation(convertToLlm(allMessages));
		const existingObservations = previousSummary ?? "";

		// Call observer
		const newObservations = await observeOrFallback(conversationText, existingObservations, config, resolved, signal, ui);
		if (!newObservations) return;

		// Merge and optionally reflect
		let observations = mergeObservations(existingObservations, newObservations);
		let reflected = false;
		try {
			const result = await maybeReflect(observations, config, ctx, signal, ui);
			observations = result.observations;
			reflected = result.reflected;
		} catch {
			if (signal.aborted) return;
		}

		const finalTokens = estimateTokens(observations);
		ui.notify(`OM: compaction complete (${finalTokens} tokens${reflected ? ", reflected" : ""})`, "info");

		return buildCompactionResult(observations, firstKeptEntryId, tokensBefore, reflected);
	});
}
