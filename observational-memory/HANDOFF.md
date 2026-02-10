# Observational Memory Extension - Handoff

## Overview

Build a pi extension that replaces default compaction with Mastra-style observation-based compression for long-running agent sessions. Instead of the default structured summary (Goal / Progress / Decisions), it compresses conversation history into timestamped, prioritized observations that preserve more context and are better suited for LLM recall.

The extension is **opt-in**: it only activates when enabled via `--memory` CLI flag, `PI_MEMORY=1` env var, or `memory.json` config file. Without activation, the extension is a complete no-op.

## Architecture

```
observational-memory/
  index.ts          # Extension entry point, flag registration, activation, compaction hook
  config.ts         # Load/merge memory.json configs
  observer.ts       # Observer agent (compress messages -> observations)
  reflector.ts      # Reflector agent (consolidate observations when too large)
  types.ts          # TypeScript types
  package.json      # Dependencies (if needed)
  README.md         # Usage docs
```

## Configuration: memory.json

The extension reads config from two locations, merged (project overrides global):

- Global: `~/.pi/agent/memory.json`
- Project: `.pi/memory.json`

Schema:

```json
{
  "$schema": "...",
  "enabled": true,
  "observer": {
    "model": "gemini-2.5-flash",
    "provider": "google",
    "messageTokenThreshold": 30000,
    "temperature": 0.3,
    "maxOutputTokens": 100000
  },
  "reflector": {
    "model": "gemini-2.5-flash",
    "provider": "google",
    "observationTokenThreshold": 40000,
    "temperature": 0,
    "maxOutputTokens": 100000
  }
}
```

Key points:
- `enabled` controls the extension (default: true if memory.json exists)
- Observer and reflector can use different models (e.g. cheaper model for observation, smarter for reflection)
- Models can be local (Ollama: `"provider": "ollama"`, `"model": "qwen2.5:7b"`) or API-based
- The extension should use `ctx.modelRegistry.find(provider, model)` and `ctx.modelRegistry.getApiKey(model)` to resolve models, falling back to the session's current model if the configured one isn't available

## Activation Mechanism

The extension registers a `--memory` boolean flag. It activates if ANY of:

1. `--memory` CLI flag is passed
2. `PI_MEMORY=1` environment variable is set
3. A `memory.json` config file exists (global or project-local)

```typescript
export default function (pi: ExtensionAPI) {
  pi.registerFlag("memory", {
    description: "Enable observational memory compaction",
    type: "boolean",
    default: false,
  });

  let config: MemoryConfig | null = null;
  let active = false;

  pi.on("session_start", async (_event, ctx) => {
    const flagEnabled = pi.getFlag("memory") as boolean;
    const envEnabled = process.env.PI_MEMORY === "1";
    config = loadMemoryConfig(); // reads and merges memory.json files

    active = flagEnabled || envEnabled || (config !== null && config.enabled !== false);
    if (!active) return;

    // Use defaults if no config file
    if (!config) config = getDefaultConfig();

    ctx.ui.setStatus("memory", ctx.ui.theme.fg("accent", "OM"));
    ctx.ui.notify("Observational memory compaction enabled", "info");
  });
}
```

This works in normal CLI mode, RPC mode, and print mode. The flag is available everywhere since `registerFlag` is universal.

## How It Works

### Observation format

Instead of summarizing messages into structured markdown, compress them into timestamped, prioritized observations:

```
Date: 2026-02-10
- [!] 14:30 User is refactoring mmry to focus on learnings extraction, removing HMLR
  - [!] 14:32 Core search (keyword, fuzzy, BM25, semantic) stays
  - [i] 14:35 MEMORY.md bidirectional sync is P1 feature
- [?] 14:40 User asked about Mastra observational memory approach
- [!] 15:00 Decision: observational memory becomes a pi extension, not part of mmry core
```

Priority levels (using text markers, not emoji, per AGENTS.md rules):
- `[!]` -- important
- `[?]` -- maybe important
- `[i]` -- informational

### Observer

The observer takes serialized conversation messages and produces observations. Key instructions (adapted from Mastra):

- Distinguish user assertions from questions (assertions are authoritative)
- Temporal anchoring: include message timestamps, add estimated dates for relative references
- Preserve unusual phrasing verbatim
- Use precise action verbs
- Preserve distinguishing details in lists/recommendations
- Track state changes explicitly (newer supersedes older)
- Capture who/what/where/when
- Note code files read/modified

### Reflector

When observations exceed the configured threshold, the reflector consolidates:

- Condense older observations more aggressively, retain recent detail
- Merge duplicate/related observations
- Preserve temporal context
- Track state changes (newer supersedes older)
- Has a compression retry if first pass doesn't actually reduce size

### Compaction hook

```typescript
pi.on("session_before_compact", async (event, ctx) => {
  if (!active || !config) return;

  const { preparation, signal } = event;
  const { messagesToSummarize, turnPrefixMessages, tokensBefore, firstKeptEntryId, previousSummary } = preparation;

  // Resolve observer model
  const observerCfg = config.observer;
  const model = ctx.modelRegistry.find(observerCfg.provider, observerCfg.model);
  if (!model) {
    ctx.ui.notify("Observer model not available, falling back to default compaction", "warning");
    return;
  }

  const apiKey = await ctx.modelRegistry.getApiKey(model);
  if (!apiKey) {
    ctx.ui.notify(`No API key for ${model.provider}, falling back to default compaction`, "warning");
    return;
  }

  const allMessages = [...messagesToSummarize, ...turnPrefixMessages];
  const conversationText = serializeConversation(convertToLlm(allMessages));

  // Build observer prompt with existing observations as context
  const existingObservations = previousSummary || "";
  const observerPrompt = buildObserverPrompt(conversationText, existingObservations);

  // Call observer
  const response = await complete(model, {
    messages: [{ role: "user", content: [{ type: "text", text: observerPrompt }], timestamp: Date.now() }]
  }, { apiKey, maxTokens: observerCfg.maxOutputTokens, temperature: observerCfg.temperature, signal });

  const newObservations = extractTextFromResponse(response);

  // Merge: existing observations + new observations
  let observations = existingObservations
    ? existingObservations + "\n\n" + newObservations
    : newObservations;

  // Check if reflection needed (observations too large)
  const observationTokens = estimateTokens(observations);
  if (observationTokens > config.reflector.observationTokenThreshold) {
    observations = await runReflector(observations, config, ctx, signal);
  }

  return {
    compaction: {
      summary: observations,
      firstKeptEntryId,
      tokensBefore,
      details: { type: "observational-memory", observationTokens: estimateTokens(observations) },
    },
  };
});
```

### Token estimation

Use a simple heuristic (chars / 4) or a lightweight tokenizer. Mastra uses a custom token counter. A simple approach is fine for threshold checks.

## Reference: Mastra Source Code

The Mastra observational memory implementation is open source at:
https://github.com/mastra-ai/mastra/tree/main/packages/memory/src/processors/observational-memory/

Key files to study:

| File | What to take from it |
|------|---------------------|
| `observational-memory.ts` (3289 lines) | Overall flow, threshold logic. **Do NOT copy the complexity** -- pi's compaction hook is much simpler than Mastra's processor middleware. We only need the compaction hook, not message list manipulation. |
| `observer-agent.ts` | **The observer prompt is the most valuable part.** Three variants exist: legacy (~200 lines), condensed (~45 lines), current (~300 lines). Start with the condensed variant and iterate. Study all three. |
| `reflector-agent.ts` | Reflector system prompt, compression retry logic, XML output parsing (`<observations>`, `<current-task>`, `<suggested-response>` tags). |
| `types.ts` | Config types for thresholds, model settings. Reference for our memory.json schema. |
| `token-counter.ts` | Simple token counting utility. |

Blog post explaining the design: https://mastra.ai/blog/observational-memory
Research page with benchmarks: https://mastra.ai/research/observational-memory

### Mastra design decisions to adopt

1. **Text-based, not structured** -- observations are plain text, no vector DB or knowledge graphs
2. **Three-date model** -- observation date, referenced date, relative date for temporal reasoning
3. **Priority levels** -- important / maybe-important / informational
4. **Append-only observations** -- new observations append to existing, only reflector rewrites the whole block
5. **Separate observer and reflector** -- different models/temperatures (observer 0.3, reflector 0.0)
6. **Compression retry** -- if reflector output isn't smaller, retry with more aggressive instructions

### Mastra design decisions to NOT adopt

1. **Mid-conversation processing** -- Mastra runs at every agent tool-use step within a turn. We only run at compaction time (when context window is full).
2. **Message list manipulation** -- Mastra injects/removes messages from the active context. We just return a summary string via the compaction hook.
3. **Async background buffering** -- Not needed, compaction is synchronous.
4. **Resource-scoped multi-thread** -- Pi has one session = one context. No cross-thread observation.
5. **Emoji priority markers** -- Per AGENTS.md, no emoji. Use `[!]` `[?]` `[i]` text markers.
6. **Data stream markers** -- Mastra emits `data-om-observation-start/end/failed/progress` parts for UI. We use `ctx.ui.notify()` and `ctx.ui.setStatus()`.

## pi APIs Used

| API | Purpose |
|-----|---------|
| `pi.registerFlag("memory", ...)` | `--memory` CLI flag |
| `pi.getFlag("memory")` | Check flag value at runtime |
| `pi.on("session_start")` | Initialize config, check activation |
| `pi.on("session_before_compact")` | Replace compaction with observation-based compression |
| `ctx.modelRegistry.find(provider, id)` | Resolve configured model |
| `ctx.modelRegistry.getApiKey(model)` | Get API key for model |
| `ctx.ui.notify()` / `ctx.ui.setStatus()` | User feedback |
| `convertToLlm()` | Convert AgentMessage[] to LLM Message[] |
| `serializeConversation()` | Serialize messages to readable text |
| `complete()` from `@mariozechner/pi-ai` | Call observer/reflector LLMs |

See `examples/extensions/custom-compaction.ts` in pi for a complete working example of custom compaction that this builds on.

## Implementation Order

1. **Types and config** (`types.ts`, `config.ts`) -- memory.json schema, parsing, merging, defaults
2. **Extension skeleton** (`index.ts`) -- flag registration, activation check, session_start hook
3. **Observer** (`observer.ts`) -- prompt construction (start with Mastra's condensed variant), output parsing
4. **Compaction hook** -- wire observer into `session_before_compact`, test with `/compact`
5. **Reflector** (`reflector.ts`) -- consolidation prompt, compression retry
6. **Wire reflector** -- add threshold check and reflector call after observation
7. **README.md** -- usage, configuration, examples

## Testing

- Start pi with `--memory`, have a long conversation, trigger `/compact`, verify observations make sense
- Test with `PI_MEMORY=1` env var (no flag needed)
- Test with `.pi/memory.json` config file (no flag or env var needed)
- Verify extension is a complete no-op without any activation method
- Test fallback to default compaction when configured model isn't available
- Test with local models (Ollama) and API models (Google, Anthropic)
- Test reflector triggers when observations exceed threshold
- Test compression retry when reflector doesn't reduce size
- Resume a session after compaction and verify the agent can use observations effectively

## Related trx Issues

- `piext-3yd5` -- memory.json configuration file (P1)
- `piext-75t8` -- observational-memory compaction hook (P2)
- `piext-kcfe` -- epic: observational memory extension (P2)
