# Changelog

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
