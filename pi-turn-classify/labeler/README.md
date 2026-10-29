# turn labeler

A small web UI for hand-labelling **real** agent turns, so the classification
schema and the model calibration can be judged against human labels on real
traffic instead of turns written to fit the schema.

Live (tailnet only): **http://100.64.0.6:8842** — registered in owlznest as
`turn labeler` (`registry/apps/turn-labeler--100-64-0-6-8842.json`).

## Why it exists

The bundled bench is 14 turns I wrote myself. That cannot answer "is
`attention` learnable?" or "what is d3's real calibration?". This tool does:

1. `extract.ts` splits your actual pi sessions into turns and writes digests.
2. The UI shows one turn at a time and records your answers.
3. `labels.jsonl` is **already** the bench sample format, so it feeds
   `bench.ts` and a calibration fit with no conversion.

## Run

```bash
# 1. rebuild the queue from your sessions (newest first)
bun run pi-turn-classify/labeler/extract.ts --limit 60 --per-session 5

# 2. serve it (tailnet address only; never 0.0.0.0)
./pi-turn-classify/labeler/run.sh 8842 100.64.0.6

# or label the background dataset the extension already collected
bun run pi-turn-classify/labeler/extract.ts --from-dataset ~/.local/share/pi-turn-classify/dataset.jsonl

# 3. label, then use the corpus
bun run pi-turn-classify/bench.ts \
  --samples ~/.local/share/pi-turn-classify-labeler/labels.jsonl \
  --endpoint https://eavs.has.skillissues.net/jev --model jev-latest \
  --projects pi-agent-extensions,eavs,oqto,wiki
```

## Keys

| key | action |
| --- | --- |
| `1`–`9` | answer the focused question with that option |
| `↓` / `Tab` | next question |
| `↑` | previous question |
| `Enter` | save and go to the next turn (enabled once all seven are answered) |
| `←` / `Backspace` | undo: step back, then clear the last answer |
| `s` | skip this turn (not labelable) |

Seven keystrokes per turn once you have the rhythm.

## What is asked

The labelling schema is the **v2** one (the line the UI is meant to feed):

| field | answers |
| --- | --- |
| `project` | candidates from the cwd name + git remotes, plus `other` / `unclear` |
| `activity` | implement, debug, test, review, research, plan, refactor, ops, docs, setup, chat |
| `work_done` | yes / no |
| `blocked` | yes / no |
| `attention` | none, decision, approval, missing_info, review |
| `risk` | none, low, medium, high, critical |
| `artifact` | code, test, doc, config, issue, data, none |
| `error_kind` | **only on failed turns**: provider_overloaded, rate_limited, auth, context_overflow, network, content_filter, invalid_request, bad_response, tool_failed, cancelled, unclear |
| `error_transient` | **only on failed turns**: yes / no |

`work_done` + `blocked` + `attention` replace the old five-way `status`, because
the display line needs `<working|idle|blocked> <reason>`, and "how far along" was
the least reliable question measured (50% on d3).

A failed turn shows its **verbatim error message** in a red block above the
answer, because that is the only thing that makes `error_kind` labelable.

`project` is `dir_name` in the UI unless you pick another: that is exactly the
`[in <target>]` rule — the target is only interesting when it differs from the
directory.

## Data

Never in git. Default root `~/.local/share/pi-turn-classify-labeler`
(`TURN_LABELER_DATA` overrides):

| file | meaning |
| --- | --- |
| `candidates.jsonl` | turn digests, written by `extract.ts` |
| `labels.jsonl` | your labels, appended by the server (bench-compatible) |
| `skipped.jsonl` | turns you judged not labelable |

Each label keeps the full digest it was made against, so a later schema change
can be re-scored against old labels instead of demanding re-labelling.

**Privacy**: the digests contain real session content (prompts, file paths,
command lines). The server binds the tailnet address only, the data lives outside
the repository, and nothing is uploaded anywhere.

## Notes and limits

- One labeller, no accounts: it is a personal tool on a private network.
- The bun process is detached with a pidfile (`/tmp/pi-turn-labeler.pid`); it does
  not survive a reboot of `arch-dev-01`. Move it to an always-on host (e.g. the
  owlznest/gateway machine) when it becomes part of a habit, and update the
  owlznest manifest then.
- Design Studio has **no line** for this tool (it is not an Oqto/ctx surface), so
  the UI consumes canonical tokens (`generated/oqto-web/oqto.css`: palette,
  `radius: 0`, system fonts) instead of inventing a look. Recorded gap: there is
  no approved mock for it.
- The extension's schema is now v2 as well, so `work_done`, `blocked` and the
  error questions are scored, not just collected.
