# pi-turn-classify

Classify every finished agent turn with a **decision model** — the fast
"one forward pass, a probability per option" family (Jeff / D3 / Clef) rather
than a chat model. For each turn it answers seven closed questions and stores
the result as a **turn card**, so a session list can say more than its title and
its recency.

```
pi-agent-extensions · implement · implementing · code · needs review
eavs (cwd differs) · debug · done
ops · blocked · needs missing info
```

## Why a decision model

Decision models return calibrated probabilities for a fixed option set instead
of generating text (see vLLM's `Structured Decisions Models`). That means:

- **no parsing**, no free-text drift, no hallucinated labels
- **milliseconds**, so it can run after every single turn
- **probabilities**, so the card can say "unclear" instead of guessing
- **cheap enough to run everywhere**, including later inside Octo

The consequence is a hard design rule: **every question must have a closed
answer set**. Free-text summaries are deliberately not requested — the one-line
card is composed deterministically from answer ids, so it cannot invent content.

## The schema (v1)

Seven questions, asked in one request. Ids are persisted, so they are stable.

| question | kind | answers |
| --- | --- | --- |
| `project` | choice | the candidate projects + `other` + `unclear` (dropped when no candidates are known) |
| `project_mismatch` | yes/no | `yes` / `no` — the work belongs to a different project than the cwd suggests |
| `activity` | choice | `implement` `debug` `test` `review` `research` `plan` `refactor` `ops` `docs` `setup` `chat` |
| `status` | choice | `exploring` `implementing` `verifying` `blocked` `done` |
| `attention` | choice | `none` `decision` `approval` `missing_info` `review` |
| `risk` | score (0-4) | `none` `low` `medium` `high` `critical` |
| `artifact` | choice | `code` `test` `doc` `config` `issue` `data` `none` |
| `scope` | choice | `single` `multi` `noncode` |

`project` is the one dynamic question: candidates come from `projects` in the
config, the cwd basename and the git remotes. `project_mismatch` is what makes
"working in one directory but for another project" visible — the cwd is given to
the model as *evidence*, never as the answer.

### Card shape (for Octo and other consumers)

```json
{
  "version": 1,
  "at": "2026-10-28T12:00:00.000Z",
  "sessionId": "...",
  "sessionFile": "...",
  "cwd": "/home/wismut/byteowlz/pi-agent-extensions",
  "turn": 3,
  "source": { "api": "systemone", "model": "vllm-sr/d3-lite", "endpoint": "http://100.64.0.9:8010", "ms": 812 },
  "answers": {
    "project": { "value": "eavs", "confidence": 0.87, "probabilities": { "eavs": 0.87, "...": 0.13 } },
    "project_mismatch": { "value": "yes", "confidence": 0.85 },
    "activity": { "value": "implement", "confidence": 0.92 },
    "status": { "value": "implementing", "confidence": 0.71 },
    "attention": { "value": "review", "confidence": 0.63 },
    "risk": { "value": "low", "confidence": 0.7 },
    "artifact": { "value": "code", "confidence": 0.8 },
    "scope": { "value": "single", "confidence": 0.75 }
  },
  "line": "eavs (cwd differs) · implement · implementing · code · needs review"
}
```

Cards are stored as `pi-turn-classify:card/v1` custom entries on the session
branch. They are **not messages**: they never enter LLM context, they follow the
branch (like other sidecars), and they cost nothing per turn in tokens.

`confidence` and `probabilities` are always kept, even when the rendered value
was demoted to `unclear`. That is intentional: recalibration needs the raw
scores, never the rounded ones.

## Confidence handling

A small decision model is often **confidently wrong** (ECE is the known
weakness of the family, not speed). So:

- a `choice` answer below `confidenceFloor` (default 0.4) renders as `unclear`
- a yes/no answer at exactly 0.5 is treated as no answer
- the raw probability is still stored, so a later calibration pass can re-read it

## Commands

| Command | Purpose |
| --- | --- |
| `/classify` | show the latest card with per-question confidence |
| `/turn` | short alias: print the card line |
| `/classify on` / `off` | enable/disable (kill switch, no reload needed) |
| `/classify model <endpoint> <model> [systemone\|decisions]` | repoint at another decision server |
| `/classify schema` | print the active question set |
| `/classify now` | re-classify the last turn |

## Configuration

`turn-classify.json`, searched in this order (first file wins per key):

1. `./turn-classify.json`
2. `./.pi/turn-classify.json`
3. `~/.pi/agent/turn-classify.json`

See `turn-classify.example.json` and `turn-classify.schema.json`.

```json
{
  "enabled": true,
  "endpoint": "http://100.64.0.9:8010",
  "model": "vllm-sr/d3-lite",
  "api": "systemone",
  "projects": [{ "id": "pi-agent-extensions", "hint": "~/byteowlz/pi-agent-extensions" }]
}
```

**Disabled by default** — classification is network traffic, so it is opt-in.

## Supported APIs

Both are plain HTTP POSTs; the extension speaks either:

**TypeSafe System One / Jeff** (`"api": "systemone"`, `POST /v1/systemone`)

```json
{
  "model": "vllm-sr/d3-lite",
  "state": { "cwd": "...", "user": "...", "assistant": "...", "files": [], "tools": [] },
  "questions": {
    "activity": { "type": "choice", "criteria": { "implement": "writing or changing code/features" } },
    "project_mismatch": { "type": "noul", "criteria": null },
    "risk": { "type": "score", "criteria": ["none", "low", "medium", "high", "critical"] }
  }
}
```

**OpenAI Decisions API** (`"api": "decisions"`, `POST /v1/decisions`)

```json
{
  "model": "Qwen/Qwen3-0.6B",
  "input": "{\"cwd\":\"...\"}",
  "questions": [
    { "type": "choice", "name": "activity", "choices": [{ "value": "implement" }] },
    { "type": "predicate", "name": "project_mismatch" },
    { "type": "score", "name": "risk", "levels": [{ "label": "none" }] }
  ]
}
```

### Model quirks handled

- **D3 checkpoints reject `instructions` with 400** (their prompt is fixed by the
  checkpoint). `"instructions": "auto"` omits them for `vllm-sr/d3*`, and a 400
  mentioning instructions triggers exactly one retry without them.
- System One caps `choice` at 26 options; the schema caps at 24 + 2.
- `score` answers come back as an expected level index; they are rounded to the
  nearest level id and clamped.

## Benchmark

The point of a decision model is cheap decisions, so the harness reports what
lets you trust one: accuracy, **ECE**, high-confidence accuracy, and latency.

```bash
bun run pi-turn-classify/bench.ts \
  --samples pi-turn-classify/samples/seed.jsonl \
  --endpoint http://100.64.0.9:8010 \
  --model vllm-sr/d3-lite \
  --api systemone
```

`--json` for machine output, `--api decisions` for the OpenAI shape,
`--key <token>` for an EAVS virtual key.

Sample format (one JSON object per line):

```json
{ "id": "turn-1", "state": { "userText": "...", "assistantText": "...", "cwd": "...", "tools": ["bash×3"], "filesTouched": ["a.ts"] }, "expect": { "activity": "debug", "status": "done" } }
```

`expect` may name any subset of questions; unscored questions are simply skipped.
Read `bias` per question: positive means the model is under-confident, negative
means it is over-confident — the latter is what to fix with a calibrated cutoff.

The bundled `samples/seed.jsonl` is 14 hand-labelled turns including the cases
that matter most: work for another project than the cwd, a blocked turn, a
planning-only turn, a destructive ops turn, and a plain chat question.

## What it does not do

- **No text generation.** There is no summary field; the line is composed from
  answers. If you want a prose summary, ask the main model.
- **No transcript replay.** The digest is capped (6 kB) so it fits an 8k-context
  decision model; a huge turn is classified from its facts, not its full log.
- **No blocking.** Classification runs after `agent_end`; a failure is a warning
  in the UI, never a broken turn, and a second turn never queues behind one.
- **No silent network calls.** Off by default, and `/classify off` is a
  no-reload kill switch.
