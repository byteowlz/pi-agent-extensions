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

## skdlr (optional, first-class)

skdlr owns the **timing** (cron, "weekdays at 09:00"); this extension owns the
**delivery** (into the running session, with its context).

```
/schedule link 1 --schedule "0 9 * * 1-5"          link an action to skdlr
/schedule link 1 --schedule "0 9 * * 1-5" --queue  park a missed run instead of failing
/schedule unlink 1                                 remove it, timer comes back
/schedule skdlr                                    backend status + linked actions
```

Linking is **exclusive**: a linked action stops using its in-session timer, so it
can never fire twice. Unlinking restores the timer.

### Why the command is a deliverer, not `pi -p`

A skdlr schedule runs its own process. `pi -p "…"` there would open a *different*
session: no context, no compaction state, no queue — "check the board" would mean
something else. Instead, linking registers this command:

```
node <agent-dir>/schedule/bin/deliver.mjs --session <id> --text "<prompt>" [--queue]
```

`deliver.mjs` is written by the extension at session start: self-contained Node,
no imports, absolute paths, so a systemd user unit with a minimal environment can
run it. It hands the text to the session's **inbox socket**
(`<agent-dir>/schedule/inbox/<sessionId>.sock`, dir 0700, socket 0600, one JSON
line each way) and exits 0/1.

| situation | behaviour |
|---|---|
| session running | delivered into the session (parks across compaction) |
| session gone, no `--queue` | exit 1, skdlr records the failure — visible, not silent |
| session gone, `--queue` | parked in `schedule/queue/<sessionId>.jsonl` (max 20, 24 h) |
| queued and session returns | delivered on start, prefixed `[scheduled 5m ago]` |

So a link is a real integration rather than an exported snippet: cron timing, live
delivery, explicit failure, and bounded catch-up.

Everything else stays standalone — with no skdlr installed, `/schedule` is a
plain in-session timer and `/schedule skdlr` says the backend is unavailable.

### Export (still available)

`/schedule export` prints the *headless* `skdlr add … 'pi -p "<prompt>"'` command
per action, for checks that genuinely belong in their own session. Different
semantics on purpose: use `link` for a nudge to this session, `export` for a
standalone run.

## Limits

- Intervals are wall-clock from arming, not calendar-aligned (no "at 09:00") —
  that is exactly what `link` delegates to skdlr.
- A crashed session does not catch up on missed ticks of in-session timers;
  `next` reflects the last recorded run. `--queue` links are the catch-up path.
- The inbox is one-user-only by file permissions; it is not a network service.
