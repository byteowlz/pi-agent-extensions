# Changelog

## 0.1.0

- Initial release: `/schedule <interval> "<prompt>"` delivers recurring prompts
  into the live session (normal user message, `followUp` while streaming), so a
  periodic check keeps the session's own context.
- Two scopes: session (`~/.pi/agent/schedule/sessions/<sessionId>.json`, follows
  resume/reload, not inherited by forks) and project
  (`.../projects/<encoded-cwd>.json`). Project actions arm in exactly one session
  — the one holding the project's captain claim — and stay dormant and explicit
  when no captain is claimed, so a project check never fires twice.
- Every tick re-reads the store and re-checks ownership: pause/resume/edit/remove
  and captain handover all take effect without a restart.
- Prompts refused during compaction are parked and flushed on
  `session_compact`/`_failed`; print/json sessions never arm timers.
- `/schedule list|pause|resume|run|remove|export`, plus the `/schedules` alias.
- `/schedule export` prints the equivalent headless `skdlr add …` command per
  action; skdlr is intentionally not a runtime dependency (a skdlr run is a
  separate `pi -p` with its own session and no access to live state).
- Publishes a `schedule` status segment (`<count>·<soonest>`, e.g. `2·14m`).
