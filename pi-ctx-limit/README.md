# pi-ctx-limit

Per-session context compaction threshold (`/ctx`, `/context`).

Pi's built-in auto-compaction triggers at `contextWindow - reserveTokens`
(configured per model in settings.json `compaction.modelOverrides`). This
extension adds a **session-scoped soft limit** on top:

- `/ctx 262k` — set the limit (also `262144`, `1m`, `64k`, …)
- `/ctx` — TUI: fuzzy size picker (model window, 25%, 50%, and common
  presets); non-TUI: show usage + current limit
- `/ctx off` — clear the limit, back to pi's model-based trigger
- `/context` — full alias

## Behavior

- **Soft cap:** the effective trigger is `min(sessionLimit, contextWindow -
  reserveTokens)`. A model whose native trigger is lower keeps pi's
  behavior — the session limit never *raises* the true threshold.
- **Immediate compaction:** setting (or resuming with) a limit below the
  current projected context triggers `ctx.compact()` right away.
- **Turn-granular enforcement:** pi checks compaction natively between
  tool calls; this extension re-checks after `agent_end` and on
  `session_start` (new/resume/fork) and `session_tree` navigation.
- **Durable & branch-relative:** the limit is stored as an append-only
  `pi-ctx-limit:limit/v1` custom entry on the session branch (never LLM
  context), so it survives resume and follows the branch.
- **Compaction content:** uses your normal compaction path (the session
  model, or whatever intercepts `session_before_compact`, e.g.
  pi-kompressor); this extension only decides *when*.

## Config

Optional `.pi/ctx-limit.json` (project) or `~/.pi/agent/ctx-limit.json`:

```json
{ "enabled": true }
```

## Install

Copy or symlink this directory into `~/.pi/agent/extensions/` (or a
project's `.pi/extensions/`), then restart pi.
