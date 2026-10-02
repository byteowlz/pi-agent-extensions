# Observational Memory

A pi extension that replaces the default compaction with observation-based compression for long-running agent sessions. Instead of structured summaries (Goal / Progress / Decisions), it compresses conversation history into timestamped, prioritized observations that preserve more context and are better suited for LLM recall.

Adapted from [Mastra's observational memory](https://mastra.ai/blog/observational-memory) approach.

## Activation

The extension is opt-in and requires explicit enablement. Without activation it is a complete no-op.

Enable with either:

```bash
# CLI flag
pi --memory

# Environment variable
PI_MEMORY=1 pi
```

## Configuration

Configuration is optional. When active, the extension reads settings from:

1. `~/.pi/agent/memory.json` (global)
2. `.pi/memory.json` (project-local, overrides global)

If no config file exists, defaults are used.

### Example memory.json

Add a `$schema` key for editor validation and completions (e.g. VS Code with the Even Better TOML / JSON extensions):

```json
{
  "$schema": "https://raw.githubusercontent.com/byteowlz/schemas/refs/heads/main/observational-memory/memory.schema.json",
  "observer": {
    "provider": "openai",
    "model": "gpt-5-nano",
    "messageTokenThreshold": 30000,
    "temperature": 0.3,
    "maxOutputTokens": 100000
  },
  "reflector": {
    "provider": "openai",
    "model": "gpt-5-nano",
    "observationTokenThreshold": 40000,
    "temperature": 0,
    "maxOutputTokens": 100000
  }
}
```

### Settings

**Observer** (compresses messages into observations):

| Setting | Default | Description |
|---------|---------|-------------|
| `provider` | `openai` | LLM provider |
| `model` | `gpt-5-nano` | Model ID |
| `messageTokenThreshold` | `30000` | Token threshold for triggering observation |
| `temperature` | `0.3` | Sampling temperature |
| `maxOutputTokens` | `100000` | Max output tokens |

**Reflector** (consolidates observations when too large):

| Setting | Default | Description |
|---------|---------|-------------|
| `provider` | `openai` | LLM provider |
| `model` | `gpt-5-nano` | Model ID |
| `observationTokenThreshold` | `40000` | Token count above which reflector runs |
| `temperature` | `0` | Sampling temperature (deterministic) |
| `maxOutputTokens` | `100000` | Max output tokens |

Models can be local (Ollama: `"provider": "ollama"`, `"model": "qwen2.5:7b"`) or any API provider configured in pi.

## How It Works

### Observation Format

Conversations are compressed into timestamped, prioritized observations:

```
Date: 2026-02-10
- [!] 14:30 User is refactoring mmry to focus on learnings extraction
  - [!] 14:32 Core search (keyword, fuzzy, BM25, semantic) stays
  - [i] 14:35 MEMORY.md bidirectional sync is P1 feature
- [?] 14:40 User asked about Mastra observational memory approach
- [!] 15:00 Decision: observational memory becomes a pi extension
```

Priority levels:

- `[!]` -- important (decisions, requirements, architecture, code changes)
- `[?]` -- maybe important (questions, alternatives, things that might matter)
- `[i]` -- informational (background context, routine operations)

### Observer

Runs at compaction time. Takes serialized conversation messages and produces observations following these rules:

- User assertions are authoritative (distinguished from questions)
- Temporal anchoring with message timestamps and estimated dates
- Unusual phrasing preserved verbatim
- Precise action verbs (refactored, deleted, created -- not "worked on")
- State changes tracked explicitly (newer supersedes older)
- Code files read/modified are noted with paths

### Reflector

When accumulated observations exceed the configured threshold, the reflector consolidates:

- Older observations compressed more aggressively, recent detail retained
- Duplicate/related observations merged
- Temporal context preserved
- Includes a compression retry with aggressive mode if the first pass does not reduce size enough

### Compaction Flow

```
Context window full -> session_before_compact fires
  |
  +-> Resolve observer model + API key
  +-> Serialize conversation messages to text
  +-> Call observer LLM -> produce new observations
  +-> Merge with existing observations (append)
  |
  +-> If observations exceed reflector threshold:
  |     +-> Call reflector LLM -> consolidate
  |     +-> If insufficient reduction -> retry aggressively
  |
  +-> Return observations as compaction summary
```

### Fallback

If the configured model is unavailable or the observer/reflector fails, the extension falls back to pi's default compaction. Warnings are shown in the UI.

## Architecture

```
observational-memory/
  index.ts              # Extension entry point, flag, activation, compaction hook
  config.ts             # memory.json loading, merging, defaults
  observer.ts           # Observer prompt and LLM call helpers
  reflector.ts          # Reflector prompt, compression retry
  types.ts              # TypeScript types
  memory.schema.json    # JSON Schema for memory.json
  memory.example.json   # Example config with schema reference
  README.md             # This file
```
