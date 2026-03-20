/**
 * Observer agent for observational memory.
 *
 * Compresses conversation messages into timestamped, prioritized observations.
 * Adapted from Mastra's observational memory observer (condensed variant),
 * customized for pi's compaction model.
 */

import type { ObserverConfig } from "./types.js";

/**
 * Build the observer prompt.
 *
 * @param conversationText - Serialized conversation messages to observe.
 * @param existingObservations - Previous observations to use as context (may be empty).
 * @param currentDate - ISO date string for temporal anchoring.
 */
export function buildObserverPrompt(conversationText: string, existingObservations: string, currentDate: string): string {
	const existingContext = existingObservations.trim()
		? `
<existing-observations>
${existingObservations.trim()}
</existing-observations>

Integrate new observations with these existing ones. Do NOT repeat existing observations.
Newer information supersedes older information on the same topic.`
		: "";

	return `You are an observation extraction agent. Your task is to compress a conversation between a user and an AI coding assistant into timestamped, prioritized observations.

Current date: ${currentDate}

## Observation Format

Output observations as plain text, grouped by date, with priority markers and timestamps:

\`\`\`
Date: YYYY-MM-DD
- [!] HH:MM Brief observation text (important)
  - [!] HH:MM Sub-detail (important)
  - [i] HH:MM Sub-detail (informational)
- [?] HH:MM Observation that may matter later
- [i] HH:MM Background context
\`\`\`

## Priority Levels

- [!] important -- key decisions, architecture choices, blocking issues, user preferences, requirements, code changes
- [?] maybe important -- questions asked, alternatives considered, things that might matter later
- [i] informational -- background context, minor details, routine operations

## Extraction Rules

1. **User assertions are authoritative.** When the user states something as fact, record it as fact. Distinguish from questions.
2. **Temporal anchoring.** Use message timestamps. For relative references ("yesterday", "last week"), estimate the actual date.
3. **Preserve unusual phrasing verbatim.** If the user uses specific terminology or phrasing, keep it exactly.
4. **Precise action verbs.** Use "refactored", "deleted", "created", "renamed" not "worked on" or "updated".
5. **Track state changes.** When something changes (renamed file, changed approach, reversed decision), note both old and new state. Newer supersedes older.
6. **Capture who/what/where/when.** Include file paths, function names, error messages, specific values.
7. **Note code operations.** Track files read, created, modified, deleted. Include paths.
8. **Compress aggressively.** One observation per distinct fact. No filler words. No meta-commentary.
9. **Nest related details.** Use indentation for sub-details that belong to a parent observation.
10. **Chronological order within each date.** Earlier observations first.
${existingContext}

<conversation>
${conversationText}
</conversation>

Extract observations from the conversation above. Output ONLY the observations, nothing else.`;
}

/** Extract text content from an LLM response. */
export function extractTextFromResponse(response: { content: Array<{ type: string; text?: string }> }): string {
	return response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n")
		.trim();
}

/** Build completion options for the observer call. */
export function getObserverCompletionOptions(config: ObserverConfig, apiKey: string | undefined, signal: AbortSignal) {
	return {
		apiKey,
		maxTokens: config.maxOutputTokens,
		temperature: config.temperature,
		signal,
	};
}
