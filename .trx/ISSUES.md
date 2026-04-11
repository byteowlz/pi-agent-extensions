# Issues

## Open

### [piext-e8tf] privileged command extension: preserve caller PATH and improve TTY/auth diagnostics (P1, bug)
Observed behavior
- Running privileged workflows via the extension can fail with misleading downstream errors because PATH differs from the normal shell.
- Example from oqto_refactor deploy flow: privileged execution failed with `remote-build: command not found` until PATH was manually injected.
- Related friction: when command requires interactive auth/TTY semantics, failure messages are not explicit enough for quick remediation.

...


### [piext-pe71] oqto-bridge: remove unsupported model_change hook (P1, bug)
oqto-bridge extension registered pi.on("model_change"), but current Pi extension API doesn't define this hook. This can break typing and risks runtime incompatibility.\n\nFix: remove unsupported hook and rely on session_start + turn_end exportSessionEnv updates for AGENT_MODEL.

### [piext-3yd5] memory.json configuration file - define LLM models (observer/reflector), token thresholds, observation format, store path. Global (~/.pi/agent/memory.json) and project-local (.pi/memory.json) (P1, feature)

### [piext-fcdt] Define Pi-TUI parity contract for retry/error events and provide reusable test fixtures (P2, feature)
Problem
- Downstream UIs (e.g. Oqto) are seeing regressions where retry/terminal errors are duplicated, rendered as normal assistant text, or disappear/reappear after reload.
- Root cause is ambiguity between transient retry errors vs terminal durable errors across streamed events.

Goal
...


### [piext-ggnc] Post-session hook to export transcript to hstry/mmry for learning extraction - fires on session_shutdown (P2, feature)

### [piext-8e8q] Register mmry search tool - let agents search learnings from mmry stores during sessions via pi tool registration (P2, feature)

### [piext-75t8] observational-memory extension: hook into session_before_compact, replace default compaction with observation-based compression using configurable LLM (P2, feature)

### [piext-kcfe] Observational memory pi extension - Mastra-style context compression for long-running agent sessions (P2, epic)

## Closed

- [piext-v5t2] TmuxDelegate: ctx.sessionManager.getSessionFile() returns null in normal pi session (closed 2026-02-10)
- [piext-6fpa] Load MEMORY.md at session start via custom-context-files integration - ensure memory.json can specify additional memory files to load (closed 2026-02-10)
