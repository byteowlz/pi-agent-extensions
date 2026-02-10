# Issues

## Open

### [piext-v5t2] TmuxDelegate: ctx.sessionManager.getSessionFile() returns null in normal pi session (P1, bug)
In a normal pi session (not --no-session, not ephemeral), TmuxDelegate fails with 'no active session file. Cannot create child sessions.' because ctx.sessionManager.getSessionFile() returns null. The session definitely exists (visible at ~/.pi/agent/sessions/--home-wismut-byteowlz-mmry--/). This is the correct pi API to use -- it should return the session file path. Needs investigation: is sessionManager not being passed to the tool execute context properly, or is there a timing issue?

### [piext-3yd5] memory.json configuration file - define LLM models (observer/reflector), token thresholds, observation format, store path. Global (~/.pi/agent/memory.json) and project-local (.pi/memory.json) (P1, feature)

### [piext-ggnc] Post-session hook to export transcript to hstry/mmry for learning extraction - fires on session_shutdown (P2, feature)

### [piext-8e8q] Register mmry search tool - let agents search learnings from mmry stores during sessions via pi tool registration (P2, feature)

### [piext-75t8] observational-memory extension: hook into session_before_compact, replace default compaction with observation-based compression using configurable LLM (P2, feature)

### [piext-kcfe] Observational memory pi extension - Mastra-style context compression for long-running agent sessions (P2, epic)

## Closed

- [piext-6fpa] Load MEMORY.md at session start via custom-context-files integration - ensure memory.json can specify additional memory files to load (closed 2026-02-10)
