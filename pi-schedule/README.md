# pi-schedule

Recurring prompts delivered **into a live pi session** — `/schedule`.

```
/schedule hourly "check the board"            session scope (this session)
/schedule 30m "review intake" --project       project scope (project captain runs it)
/schedule                                     list both scopes + next run
/schedule pause|resume [n|id] [--project]     pause/resume one (or all)
/schedule run [n|id] [--project]              fire one now
/schedule remove <n|id> [--project]           delete
/schedule export                              print headless skdlr equivalents
```

Intervals: `30m`, `2h`, `1d`, `every 15 minutes`, `hourly`, `daily`, `weekly`.
Minimum 10s (a CLI guard; the store stays authoritative for hand edits).

## Why this is not part of the captain

A schedule is a *general* capability: any session may want a periodic nudge
("re-check the failing test", "summarize new issues"). The captain is a
*designation* about intake ownership. They meet at exactly one point — **who
runs the project-scoped checks** — so this extension reads the captain's claim
file and nothing else. There is no import, no dependency, and no captain
requirement: without a captain, project schedules are simply dormant.

## Scopes

| scope | store | arms in |
|---|---|---|
| `session` (default) | `~/.pi/agent/schedule/sessions/<sessionId>.json` | that session, on resume/reload |
| `project` (`--project`) | `~/.pi/agent/schedule/projects/<encoded-cwd>.json` | the session holding the project's captain claim |

`<encoded-cwd>` uses pi's own `--<path>--` session-directory encoding, and the
claim file read is `~/.pi/agent/captain/<encoded-cwd>.json` — the format
pi-session-tools' `/captain` writes.

Rules that prevent double-firing:

- A project action is **dormant** until a captain is claimed, and then runs in
  **exactly one** session — never in every session that happens to sit in the
  directory.
- Every tick re-checks: pausing, editing, removing, or a captain handover takes
  effect without a restart. A former captain stops on the next tick and says so.
- Forks get a new session id, so session-scoped schedules are **not** inherited
  (a fork must not double-fire the parent's checks).

## Delivery

A scheduled action becomes a normal user message (`deliverAs: "followUp"` while
streaming), so the session keeps its own context — that is the entire point
versus a headless run. A prompt refused during compaction is **parked** and
flushed when compaction ends instead of being dropped. Print/json sessions never
arm timers.

## skdlr

Deliberately not wired in. A skdlr schedule runs a **separate `pi -p` process**:
different session file, no access to this session's context, compaction state or
message queue. Delegating would silently change what the check means.

`/schedule export` prints the exact `skdlr add …` command per action for work
that genuinely belongs headless. A real integration would need a delivery bridge
into the running session (an inbox socket like xlatch/crosstalk, or a
`pi --resume` invocation per tick with the double-writer risk that implies).

## Status line

Publishes `ctx.ui.setStatus("schedule", "<count>·<soonest>")`, e.g. `2·14m`,
and clears when nothing is armed. Add the segment with a clock glyph:

```json
{ "id": "schedule", "statusKey": "schedule", "label": "\uf017",
  "color": "muted", "colorValue": true, "position": "right", "order": 16 }
```

## Limits

- Intervals are wall-clock from arming, not calendar-aligned (no "at 09:00");
  that belongs to skdlr/systemd, not to an in-session timer.
- Ticks are skipped while pi is mid-turn if the queue is saturated — the message
  still queues as a follow-up rather than interrupting a tool run.
- A crashed session does not catch up on missed ticks; `next` reflects the last
  recorded run.
