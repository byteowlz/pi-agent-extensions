# Issues

## Open

### [piext-3yd5] memory.json configuration file - define LLM models (observer/reflector), token thresholds, observation format, store path. Global (~/.pi/agent/memory.json) and project-local (.pi/memory.json) (P1, feature)

### [piext-v5t2] TmuxDelegate: improve error message when PI_SESSION_FILE is not set - currently says 'no active session file. Cannot create child sessions.' which doesn't explain the cause. Should suggest checking if pi was started with --no-session, or if env vars are not propagated to the shell (P2, bug)

### [piext-ggnc] Post-session hook to export transcript to hstry/mmry for learning extraction - fires on session_shutdown (P2, feature)

### [piext-8e8q] Register mmry search tool - let agents search learnings from mmry stores during sessions via pi tool registration (P2, feature)

### [piext-75t8] observational-memory extension: hook into session_before_compact, replace default compaction with observation-based compression using configurable LLM (P2, feature)

### [piext-kcfe] Observational memory pi extension - Mastra-style context compression for long-running agent sessions (P2, epic)

## Closed

- [piext-6fpa] Load MEMORY.md at session start via custom-context-files integration - ensure memory.json can specify additional memory files to load (closed 2026-02-10)
