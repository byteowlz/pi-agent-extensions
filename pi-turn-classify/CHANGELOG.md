# Changelog

## 0.3.0

- **Errors are classified, not just flagged.** A failed turn keeps the verbatim
  error message in the digest (`error: {source, message, tool?}`, 1200 chars, never
  trimmed away) and two questions are added only for such turns: `error_kind`
  (provider_overloaded, rate_limited, auth, context_overflow, network,
  content_filter, invalid_request, bad_response, tool_failed, cancelled, unclear)
  and `error_transient` (would a plain retry work). Provider error text is the
  most churn-prone surface in the system and is exactly what a decision model is
  good at; measured 83–100% on the seed set.
- A tool failure only marks the turn as failed when the turn produced no answer:
  a recovered `ls: no such file` mid-turn is a hiccup, not a failure. False
  positives on real sessions dropped from 40% to 7% of turns.
- Fixed `agent_end` handling: pi passes `messages`, not a single message, so the
  turn's closing answer and its `errorMessage` are now read from the turn itself.
- **Background dataset**: configurable `dataset.path` appends every finished turn
  (digest, model answers with raw probabilities, error text, provenance) to JSONL
  with size rotation; failed classifications are recorded too, with the reason.
  `labeler/extract.ts --from-dataset` labels exactly the traffic the model saw,
  and only human labels ever become scoring samples.
- **Schema v2**: `work_done` + `blocked` replace the five-way `status`, matching
  the display line; the card renders `done` / `unfinished` / `blocked`.
- `bench.ts` asks the error questions only on failed turns and refreshes the seed
  set (16 turns, 6 with real provider errors, risk labelled).
- Measured after the change: d3-lite 75.6–81.0% / ECE 0.107–0.129, jev
  74.4–78.2% / ECE 0.055–0.070. `risk` scores 25% / 37.5% and should become a
  binary "irreversible action?" question.

## 0.2.0

- **labeler/**: a web UI for hand-labelling real agent turns, because 14
  self-written seed turns cannot decide a model or a calibration. `extract.ts`
  splits the session store into turns (closing answer, tool trail, files,
  commands, cwd, remotes; deduplicated across forks; pleasantries dropped) and
  `server.ts` serves them on the tailnet with seven keyboard-driven questions.
  `labels.jsonl` is already bench-sample format, so labels feed `bench.ts` and a
  calibration fit with no conversion. Registered in owlznest.
- Labelling asks the **v2** questions (`work_done` + `blocked` + `attention`
  instead of the five-way `status`), matching the display line
  `<dir> working on <topic>[ in <target>] · <working|idle|blocked> <reason>`.
- Extractor fixes found by its tests: the turn keeps its **closing** assistant
  answer (not the narration), and short-but-real turns are no longer dropped.

## 0.1.1

- Verified against the live decision servers and fixed the contract on both:
  `instructions` is **required** by the vllm-sr System One deployment that serves
  `vllm-sr/d3-lite` while a vLLM D3 checkpoint rejects it, so `"auto"` now flips
  once in whichever direction the server asks (explicit `always`/`never` stays
  pinned); `noul` criteria are always sent as `{true,false}` (a null criteria is
  rejected with "expected JSON object"); a yes/no answer without `confidence`
  derives it from `noul` instead of reporting a 0-confidence guess.
- Benchmark: `--projects a,b,c` exposes the `project` question, samples are
  normalised (hand-written rows may omit collections), failed requests report
  their reasons, and per-question confidence is marked unknown instead of 0.
- Measured on the 14-turn seed set: d3-lite 78.6% accuracy / ECE 0.194 / 768 ms;
  jev 76% / ECE 0.06 / 230 ms. `project` and `project_mismatch` are the
  strongest questions (86-100%), `status` and `scope` the weakest.
- Seed set now labels the project for every turn.

## 0.1.0

- Initial release: classify every finished turn with a decision model and store
  a **turn card** (`pi-turn-classify:card/v1` custom entry, never LLM context).
- Seven-question schema with closed answer sets: `project` (dynamic candidates
  from config, cwd and git remotes), `project_mismatch`, `activity`, `status`,
  `attention`, `risk` (score), `artifact`, `scope`. The one-line card is composed
  deterministically from answer ids, so it cannot invent content.
- Speaks both decision APIs: TypeSafe System One / Jeff (`POST /v1/systemone`)
  and the OpenAI Decisions API (`POST /v1/decisions`).
- Handles D3 checkpoints, which reject `instructions` with 400: `"instructions":
  "auto"` omits them for `vllm-sr/d3*` and a 400 mentioning instructions retries
  once without them.
- Honest uncertainty: choices below `confidenceFloor` render as `unclear`, a
  0.5 yes/no is treated as no answer, and raw probabilities are always kept for
  later recalibration.
- Non-blocking: classification runs after `agent_end`, times out, reports
  failures as warnings, and never queues a turn behind another.
- Commands: `/classify` (card), `/turn` (line alias), `on`/`off` kill switch,
  `model`, `schema`, `now`.
- Benchmark harness (`bench.ts`) reporting accuracy, ECE, high-confidence
  accuracy and latency, with a 14-turn hand-labelled seed set covering
  cwd-mismatch, blocked, planning, destructive-ops and chat turns.
- Disabled by default: classification is opt-in network traffic.
