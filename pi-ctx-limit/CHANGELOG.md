# Changelog

## 0.1.0

- `/ctx` (`/context`) sets a per-session context compaction threshold:
  `/ctx 262k`, `/ctx 262144`, `/ctx 1m`, `/ctx off`, or no argument to open
  a preset size picker (model window and its 25%, 50% fractions included).
- The limit is a soft cap: the effective trigger is
  min(sessionLimit, modelWindow - reserveTokens), so a small model keeps
  pi's native threshold. Setting a limit below current usage immediately
  triggers compaction.
- Limits are branch-relative custom entries (`pi-ctx-limit:limit/v1`);
  they survive resume and `/tree` navigation, and never enter LLM context.
- Re-checked at turn end and session start (incl. resume/fork); consumers
  can also read the branch entry directly.
