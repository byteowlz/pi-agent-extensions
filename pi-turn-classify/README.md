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
| `artifact` | choice | `code` `test` `doc` `config` `issue` `data` `none` |
| `scope` | choice | `single` `multi` `noncode` |

The **action** (`needs: unblock` / `needs: fix settings`) is *derived*, not asked —
see below.
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

## The action is derived, not asked

A list row should answer "what do I do about this?", so the card ends with an
action:

```
ops · blocked · error auth · needs: fix settings
implement · error provider overloaded (retryable) · needs: unblock
```

It is **not** a model question. Asking "what does the user need to do?" as a
seven-way choice produced the worst result in the schema — 62.5% (d3) and 25% (jev)
against a **75% always-`none` baseline**, because most turns need nothing and a
skewed choice invites confident nonsense.

The same information is already implied by answers that do work
(`blocked` 75–81%, `error_kind` 83–100%, `error_transient`, `work_done` 88–94%), so
`deriveNeeds()` maps them deterministically:

| evidence | action |
|---|---|
| `error_kind: auth` or `invalid_request` | `fix settings` |
| `error_kind: context_overflow`, not transient | `fix settings` |
| any other error (rate limit, overload, network, bad response) | `unblock` |
| `blocked: yes` with no error | `answer` |
| `blocked: no`, `work_done: yes` | `review` |
| `blocked: no`, `work_done: no` | nothing |

Removing the question raised accuracy for both models (jev 76.4% → 83.9%, d3 80.0%
→ 82.3%) and took the schema to **7 questions** (9 on a failed turn). The labeler
still records a human `needs` label, which is exactly how this mapping gets
validated and corrected — it is ground truth, not a model input.

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

## kNN prior: retrieval as evidence (measured, not yet worth it)

A decision model reads labels, never vectors — so a vector cannot be handed to it.
What *can* be handed over is the label set of the **most similar labelled turns**:

```
similar labelled turns: [eavs · debug · blocked] 0.82  [eavs · implement] 0.71
```

Retrieval doing the job a bigger model would otherwise need. `embeddings.ts` builds
one vector per turn (EmbeddingGemma 2 via vqtrs, MRL-truncated to 128 dims), `knn.ts`
stores them as int8 (~176 B/turn, whole history in one JSONL, brute-force cosine —
no vector database), and `bench-knn.ts` measures the effect with **leave-one-out**
neighbours so a turn can never retrieve itself.

```bash
bun run pi-turn-classify/bench-knn.ts --samples pi-turn-classify/samples/seed.jsonl \
  --endpoint http://localhost:3033/jev --model jev-latest \
  --embed-endpoint http://127.0.0.1:3010 --k 5 --dim 128
```

**Result on the 16-turn seed (2026-10-29, Mac Studio):**

| | jev | d3-lite |
| --- | --- | --- |
| accuracy with prior | 74.1% → 74.1% (+0.0) | 78.6% → 76.8% (−1.8) |
| answers changed | 2 | 5 |
| latency added | ~180 ms | ~855 ms |

…and the diagnostic that explains it — **how often the closest neighbour already
had the right label** (the ceiling on what retrieval could ever contribute):

| question | ceiling |
| --- | --- |
| `error_kind` | 0% |
| `work_done` | 31% |
| `activity` | 38% |
| `attention`, `blocked`, `artifact`, `project` | 44–50% |
| `scope` | 81% |
| `project_mismatch` | 88% |

So: **not wired into the runtime.** With 16 turns from 16 different tasks, the
nearest neighbour shares the *topic* but not the *label* — every turn is "coding in
a repo", so cosine is dominated by jargon (`bun test`, `cargo check`) rather than by
what kind of work it was. Retrieval only predicts the questions that are genuinely
about surface similarity: `scope` and `project_mismatch`.

Revisit when (a) there are ≥50 labelled turns **per class** (the labeler builds
this), and (b) neighbour selection uses a **reranker** (`/v1/rerank` on the same
server) instead of raw bi-encoder cosine, injecting only for questions whose
measured ceiling exceeds ~70%.

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

## Where a card lives

Two places, on purpose.

**1. The session file (source of truth).** Every card is appended as a
`pi-turn-classify:card/v1` custom entry on the session branch. It travels with the
session through `/cwd` moves, forks and renames, it can never drift from the
transcript, and anything that already parses sessions — including Oqto's importer —
gets it for free.

**2. A per-session sidecar (the index).** Because reading a transcript to render a
row is not viable: this machine has 2,865 session files and the largest is 94 MB,
so a 50-row list would mean reading gigabytes to show 50 one-liners.

```
<agentDir>/turn-classify/cards/<sessionId>.json      # ~/.pi/agent/... by default
```

```json
{
  "version": 1,
  "sessionId": "01a0cd67-b5e9-72ce-9616-54f4dc5fa2d4",
  "sessionFile": "/home/wismut/.pi/agent/sessions/--home-wismut-byteowlz-eavs--/...jsonl",
  "cwd": "/home/wismut/byteowlz/eavs",
  "latest": { "turn": 7, "line": "eavs · implement · unfinished · code", "answers": { "...": {} } },
  "turns": [ "…full cards that fit the size budget, oldest first…" ],
  "history": [ { "turn": 1, "at": "…", "line": "…" }, "…one line per turn, up to 5000…" ],
  "updatedAt": "2026-10-29T10:00:00.000Z"
}
```

Keeping every turn is the point: a consumer that wants a row reads `latest` and
stops, and one that wants the story reads the timeline. Full parses are rare, so
disk is not the constraint — measured on the 200 largest sessions here, the median
session is 30 turns (~54 kB) and the largest 661 (~700 kB). `maxBytes` (8 MB) is a
safety valve against a runaway session, not an everyday budget.

Measured on the 200 largest sessions here: **median 30 turns, mean 79, max 661**;
a full card is ~1 kB (probabilities included) and a line-only entry ~75 B. So:

`history` is the timeline: one entry per turn with the fields that move
(`project`, `activity`, `work_done`, `blocked`, `attention`, `error_kind`) plus the
rendered `line` — roughly 120 B, so change over time is visible without touching
the full cards. Nothing is lost either way: the session file holds every full card
too, and `dataset.path` is where digests with probabilities belong when the purpose
is calibration rather than a list row.

### Forks, resumes and branch navigation

`turn` is **not** an identity. Two cases break that assumption, and both are
handled:

- **Resume.** pi starts a new process, so a counter would restart at 1 and the
  first classification after a resume would overwrite the earlier turn 1 card. Turn
  numbers therefore come from the **branch** (`cards on the branch + 1`), and the
  identity of a timeline entry is its timestamp, so nothing is ever overwritten.
- **Fork.** A fork inherits its parent's entries — including cards — but has a new
  session id and therefore no sidecar. On session start the inherited cards are
  **seeded** into the new sidecar (only when it has no history, so a resume never
  duplicates), and numbering continues from the inherited branch.
- **Branch navigation.** Going back in the tree and taking another route can
  legitimately produce the same turn number twice. Both are kept, ordered by time,
  and each entry records the session-tree `branch` (leaf id) it happened on, so a
  consumer can separate the two paths instead of seeing a corrupted timeline.

Each card also carries that `branch` field in the session file, so the two places
agree.

Why this shape:

- **one file per session** → live pi sessions never contend (each writes only its
  own file, atomically via temp + rename), unlike a shared append-only log that
  grows forever or SQLite that needs locking and migrations;
- **keyed by session id** → a consumer that lists sessions reads exactly one small
  file per row, and can join it to the transcript by `sessionFile`;
- **beside `sessions/`** → respects `PI_CODING_AGENT_DIR`, so any tool that finds pi
  sessions finds the cards too. Override with `cardsDir` if a consumer needs it
  elsewhere;
- **derived and disposable** → delete the directory and it rebuilds on the next
  turn; nothing here is the only copy of anything;
- **private** → `0700` dir, `0600` files; a card carries the cwd and a one-line
  summary, never prompt text. `dataset` is the only place a digest is stored.

Consumers should prefer `latest` for a list row, `turns` for a small detail view,
and the session file for anything deeper. `/classify show` prints the path and how
many sessions have a card.

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

Through the EAVS gateway, 7 candidate projects, one request per turn. 8 questions
on a clean turn, 10 on a failed one:

| | `vllm-sr/d3-lite` | `jev-1.14.0` |
| --- | --- | --- |
| accuracy | 82.3% | **83.9%** |
| ECE (lower better) | 0.112 | **0.040** |
| latency mean | 850 ms (3.5 s under load) | **176 ms** |

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
| `scope` | **81.3%** | 37.5% |

Readings:

- **`risk` was removed**, not tuned. As a five-level score it measured 25% (d3) and
  37.5% (jev) — worse than a constant guess for both. Consequence is a property of
  what an action does to the world, not of a turn summary: the model cannot know
  whether that `git push` went to a scratch branch or to main. Dropping it lifted
  overall accuracy for both models (d3 75.6 → 81.4%). If triage needs a signal,
  ask a binary the evidence supports — "did this take an irreversible action?" —
  not a severity scale.
- **Error classification works** on both (83-100%) at a level a regex fleet would
  struggle to maintain, and it is the raw message that makes it work.
- **`project` and `project_mismatch` are the reliable core** (81-100%), which is
  what this extension exists for.
- **`scope` is the last weak question** (37.5% jev / 81.3% d3) and the obvious next
  cut: it is arguably already implied by `project` + `project_mismatch`.

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
