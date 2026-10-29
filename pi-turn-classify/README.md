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
| `project_mismatch` | yes/no | work belongs to a different project than the cwd suggests |
| `activity` | choice | `implement` `debug` `test` `review` `research` `plan` `refactor` `ops` `docs` `setup` `chat` |
| `work_done` | yes/no | is the requested work complete? |
| `blocked` | yes/no | is it blocked on something external? |
| `attention` | choice | `none` `decision` `approval` `missing_info` `review` |
| `risk` | score (0-4) | `none` `low` `medium` `high` `critical` |
| `artifact` | choice | `code` `test` `doc` `config` `issue` `data` `none` |
| `scope` | choice | `single` `multi` `noncode` |
| `error_kind` | choice | **only on failed turns**: `provider_overloaded` `rate_limited` `auth` `context_overflow` `network` `content_filter` `invalid_request` `bad_response` `tool_failed` `cancelled` `unclear` |
| `error_transient` | yes/no | **only on failed turns**: would a plain retry plausibly work? |

`work_done` + `blocked` replaced the old five-way `status`: the display line needs
`<working|idle|blocked> <reason>`, `working` is a runtime fact rather than a model
judgement, and "how far along" measured worst (50% on d3).

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

## Errors are classified, not just flagged

Provider error strings are the most churn-prone text in the whole system ("529
overloaded", "stream ended without finish_reason", "invalid_api_key",
"context_length_exceeded", "ECONNRESET"), and hand-written regexes rot. Mapping
that moving surface onto a small stable taxonomy is exactly what a decision model
is good at.

So a failed turn keeps the **verbatim error message** in the digest (`error:
{source, message, tool?}`, up to 1200 chars, never truncated away by the budget),
and two questions are added *only* for such turns:

- `error_kind` — what kind of failure was it
- `error_transient` — would a plain retry plausibly work

The card renders it: `ops · blocked · error rate limited (retryable)`.

Where the error comes from: the assistant message's `errorMessage` when
`stopReason` is `error`, an abort, or a tool result that failed **and after which
the turn produced no answer**. A recovered `ls: no such file` mid-turn is not a
failed turn — measuring that distinction took the false-positive rate from 40% to
7% of real turns.

## Background dataset (the corpus that builds itself)

Calibration needs labelled real traffic, and reconstructing it later mostly does
not happen. If configured, every finished turn is appended to a JSONL corpus:

```json
{
  "dataset": {
    "path": "~/.local/share/pi-turn-classify/dataset.jsonl",
    "maxBytes": 20971520,
    "errorsOnly": false
  }
}
```

Each record holds the digest exactly as it was classified, the model's answers
**with raw probabilities**, the error text, and session/turn provenance. Failed
classifications are recorded too (with `classification: null` and the reason), so
a model outage still leaves a usable corpus.

The file is directly usable two ways:

```bash
# score the model against human labels already joined into the dataset
bun run pi-turn-classify/bench.ts --samples <dataset.jsonl> ...

# or label the very traffic the model saw (including error text) in the UI
bun run pi-turn-classify/labeler/extract.ts --from-dataset ~/.local/share/pi-turn-classify/dataset.jsonl
```

Model predictions are never treated as ground truth: only records with human
`labels` become scoring samples.

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

### Model quirks handled (both directions, learned live)

Deployments of the *same* model family disagree about `instructions`:

- a **vLLM D3 checkpoint** rejects them with 400 — its prompt is fixed
- the **vllm-sr System One deployment** serving `vllm-sr/d3-lite` **requires** them
  (`400 missing wire field instructions`)

So `instructions: "auto"` is not a model-name guess; it starts from a name hint and
then **flips once in whichever direction the server asks for** (rejection →
retry without, required → retry with). An explicit `always`/`never` is never
flipped: if you pin a mode, the error surfaces.

`noul` criteria are always sent as `{ "true": ..., "false": ... }`, never `null`:
one of the live servers rejects a null criteria with `expected JSON object`.

A yes/no answer that reports `noul` but no `confidence` (both live servers do
this) gets `confidence = max(p, 1-p)`, so a yes/no is not reported as a
0-confidence guess.

## Labelling real turns

The seed bench is 14 turns — enough to catch contract bugs, not enough to choose a
model or calibrate one. `labeler/` is a web UI that labels **your** turns and
writes the same format the bench reads, so labels feed straight into scoring and a
calibration fit:

```bash
bun run pi-turn-classify/labeler/extract.ts --limit 60   # build the queue
./pi-turn-classify/labeler/run.sh 8842 100.64.0.6        # tailnet-only server
```

See [labeler/README.md](./labeler/README.md). It asks the v2 questions
(`work_done`/`blocked` instead of the five-way `status`).

## Benchmark

The point of a decision model is cheap decisions, so the harness reports what
lets you trust one: accuracy, **ECE**, high-confidence accuracy, and latency.

### Measured (2026-10-29, 16 hand-labelled turns incl. 6 failed)

Through the EAVS gateway, 7 candidate projects, one request per turn:

| | `vllm-sr/d3-lite` | `jev-1.14.0` |
| --- | --- | --- |
| accuracy | 75.6 – 81.0% | 74.4 – 78.2% |
| ECE (lower better) | 0.107 – 0.129 | **0.055 – 0.070** |
| latency mean | ~900 ms | **~230 ms** |

Per question (accuracy):

| question | d3-lite | jev |
| --- | --- | --- |
| `project` | 93.8% | **100%** |
| `project_mismatch` | 81.3% | **100%** |
| `error_kind` (n=6) | 83.3% | **100%** |
| `error_transient` (n=6) | **100%** | 83.3% |
| `activity` | **87.5%** | 87.5% |
| `work_done` | 87.5% | **93.8%** |
| `blocked` | 75.0% | **81.3%** |
| `artifact` | 62.5% | **75.0%** |
| `attention` | **75.0%** | 37.5% |
| `scope` | **81.3%** | 43.8% |
| `risk` | 25.0% | 37.5% |

Readings:

- **Error classification works** on both, at a level a regex fleet would struggle
  to keep up with — and the raw message is what makes it work.
- **`risk` is broken as a five-level score** (25% / 37.5%, i.e. worse than a
  constant guess). It should become a yes/no "did this take an irreversible or
  destructive action?".
- `attention` and `scope` disagree wildly between models with overlapping
  intervals: at n=16 those numbers are noise, not a ranking.
- Accuracy on v2 + errors is *up* versus the v1 schema at equal sample count,
  while d3's ECE improved from 0.194 to ~0.11: asking fewer, sharper questions
  helped more than a better model would have.

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
