/**
 * Reflector agent for observational memory.
 *
 * Consolidates observations when they exceed the configured token threshold.
 * Compresses older observations more aggressively while retaining recent detail.
 * Includes a compression retry if the first pass doesn't reduce size.
 *
 * Adapted from Mastra's reflector agent.
 */

import type { Api, Model } from "@mariozechner/pi-ai";
import { complete } from "@mariozechner/pi-ai";
import { estimateTokens } from "./config.js";
import type { ReflectorConfig } from "./types.js";

/** Build the reflector prompt for consolidating observations. */
function buildReflectorPrompt(observations: string, currentDate: string, aggressive: boolean): string {
	const aggressiveInstructions = aggressive
		? `

AGGRESSIVE COMPRESSION MODE: Your previous consolidation did not reduce the size enough.
You MUST be much more aggressive this time:
- Merge all related observations into single lines
- Drop all [i] informational observations older than 2 days
- Drop all [?] maybe-important observations older than 3 days
- Collapse sub-details into parent observations
- Remove any redundant state transitions (keep only the final state)
- Target at least 50% reduction from the input size`
		: "";

	return `You are an observation consolidation agent. Your task is to compress a set of timestamped, prioritized observations into a shorter set while preserving the most important context.

Current date: ${currentDate}
${aggressiveInstructions}

## Consolidation Rules

1. **Recency bias.** Recent observations (last 1-2 days) should retain full detail. Older observations should be compressed more aggressively.
2. **Merge duplicates.** If the same topic appears multiple times, keep only the most recent version with the final state.
3. **Preserve state changes.** When something changed, note the final state. Drop intermediate states unless they explain the current state.
4. **Maintain priority levels.** [!] important items should almost never be dropped. [?] items can be dropped if resolved or superseded. [i] items can be dropped aggressively for older dates.
5. **Keep temporal structure.** Maintain the Date/timestamp grouping. Merge days that have few remaining observations.
6. **Preserve code paths and decisions.** File paths, architecture decisions, and user preferences are high-value and should be retained.
7. **Drop routine operations.** File reads, directory listings, and other routine operations that don't carry lasting context can be dropped.
8. **Output format must match input format.** Same Date/priority/timestamp structure.

<observations>
${observations}
</observations>

Output ONLY the consolidated observations, nothing else.`;
}

/**
 * Run the reflector to consolidate observations.
 *
 * Includes a compression retry: if the first pass doesn't reduce token count,
 * runs again with more aggressive instructions.
 */
export async function runReflector(
	observations: string,
	reflectorConfig: ReflectorConfig,
	model: Model<Api>,
	apiKey: string | undefined,
	signal: AbortSignal,
	notify: (message: string, level: "info" | "warning" | "error") => void
): Promise<string> {
	const currentDate = new Date().toISOString().split("T")[0];
	const inputTokens = estimateTokens(observations);

	notify(`Reflector: consolidating ${inputTokens} tokens of observations...`, "info");

	// First pass: normal consolidation
	const firstPassResult = await callReflector(observations, currentDate, false, reflectorConfig, model, apiKey, signal);

	const firstPassTokens = estimateTokens(firstPassResult);

	// Check if first pass actually reduced size
	if (firstPassTokens < inputTokens * 0.9) {
		notify(`Reflector: compressed ${inputTokens} -> ${firstPassTokens} tokens`, "info");
		return firstPassResult;
	}

	// First pass didn't compress enough -- retry with aggressive mode
	notify(`Reflector: first pass insufficient (${inputTokens} -> ${firstPassTokens}), retrying aggressively...`, "warning");

	const secondPassResult = await callReflector(observations, currentDate, true, reflectorConfig, model, apiKey, signal);

	const secondPassTokens = estimateTokens(secondPassResult);
	notify(`Reflector: aggressive pass: ${inputTokens} -> ${secondPassTokens} tokens`, "info");

	// Use whichever result is smaller
	if (secondPassTokens < firstPassTokens) {
		return secondPassResult;
	}

	return firstPassResult;
}

/** Call the reflector LLM. */
async function callReflector(
	observations: string,
	currentDate: string,
	aggressive: boolean,
	config: ReflectorConfig,
	model: Model<Api>,
	apiKey: string | undefined,
	signal: AbortSignal
): Promise<string> {
	const prompt = buildReflectorPrompt(observations, currentDate, aggressive);

	const response = await complete(
		model,
		{
			messages: [
				{
					role: "user",
					content: [{ type: "text", text: prompt }],
					timestamp: Date.now(),
				},
			],
		},
		{
			apiKey,
			maxTokens: config.maxOutputTokens,
			temperature: config.temperature,
			signal,
		}
	);

	return response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n")
		.trim();
}
