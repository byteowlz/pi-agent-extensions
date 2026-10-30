# Changelog

## 0.3.0

- **Agent wake-ups**: the `sleep` tool ends the agent's turn (`terminate: true`)
  and delivers a `[wake-up]` message into the same session after a delay — the
  replacement for long `sleep <n>` bash commands that only burn the tool-timeout
  budget. Durations reuse the schedule vocabulary (`20m`, `90s`, `1h`); an
  optional note is carried into the wake-up message.
- Permission modes via new `pi-schedule.json` (`sleep.mode`): `allow` (default,
  free use), `ask` (UI confirmation per call, fail-closed without a UI), `off`
  (tool deactivated). Caps: `minDurationMs` (10s), `maxDurationMs` (24h),
  `maxPending` (3). Schema and example files included.
- Wakes persist per session (`schedule/wakes/<sessionId>.json`, pending-only):
  resume re-arms them, a wake that passed while closed is delivered late and
  labelled, forks do not inherit, and firing removes the entry.
- `/sleep` lists pending wake-ups, `/sleep cancel <n|id>` / `clear` cancel them;
  a `zzz <soonest>` footer segment shows while one is pending.

## 0.2.0

- **skdlr integration**: `/schedule link <n|id> --schedule "<cron|natural>"`
  registers a real skdlr schedule whose command is this extension's self-contained
  deliverer (`node <agent-dir>/schedule/bin/deliver.mjs --session <id> --text …`),
  which hands the prompt to the running session over a private inbox socket
  (`schedule/inbox/<sessionId>.sock`, dir 0700, socket 0600). skdlr owns timing,
  the extension owns delivery into the live session.
- Linking is exclusive: a linked action stops using its in-session timer, so it
  cannot fire twice. `/schedule unlink <n|id>` removes the skdlr schedule and
  restores the timer; `/schedule skdlr` shows backend status and linked actions.
- `--queue` on link parks a run that finds no session in
  `schedule/queue/<sessionId>.jsonl` (max 20 entries, 24 h); the next start
  delivers them prefixed `[scheduled <age> ago]` and reports dropped stale ones.
  Without `--queue` a missed run fails visibly (deliverer exit 1).
- Quoted-argument parsing (`splitArgs`): cron expressions like
  `--schedule "0 9 * * 1-5"` and prompts with spaces now survive intact.
- Inbox socket lifecycle: created for long-lived sessions only, removed on
  shutdown, stale sockets cleared on start; oversized payloads and silent
  connections are rejected instead of buffered.

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
