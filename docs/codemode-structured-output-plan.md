# Structured extension outputs for native Pi 1 codemode

Status: proposed rollout; no tool implementations or live configuration changed.
Base: `a9a87c3d2ba0d97573941b2834fcc8497d8d83b5` (Pi selection integration), isolated branch `plan/codemode-structured-outputs`.

## Outcome

Every maintained registered tool has an explicit, bounded machine-readable contract where appropriate. Native Pi 1 codemode receives usable objects without parsing presentation text. Ordinary calls retain readable content and custom TUI rendering. UI/event-only extensions need no artificial tool surface. Archived extensions are out of scope.

Pi already exposes registered tools to codemode: this is an output-contract improvement, not a second tool registry. The official `docs/codemode.md` specifies that tools declaring an output schema resolve to structured values; tools without one resolve to text. Exact Pi 1 extension types require `structuredContent` for successful results with `outputSchema`. `details` is rendering metadata, not that contract. Result-transform hooks that replace content must preserve or safely replace structured data as well.

## Audit inventory at the base

| Extension | Registered surface | Planned contract / concern |
|---|---|---|
| pi-history-search | HistorySearch, HistoryBranches, HistoryRead, HistoryGrep | Typed reports, passage anchors, attempt/limitation metadata, branch lists and bounded excerpts. Preserve scope, role filters and completeness=unknown. |
| pi-mmry | memory | Action-discriminated search hits and mutation receipts including id/revision/scope; validate CLI JSON, never expose raw debug stdout as the public object. |
| pi-todolist | Todo | Action-discriminated todos/list/mutation summaries; represent disabled/validation failures consistently. |
| pi-introspection | self_reflection | info-discriminated model/session/context objects; exclude credentials and unnecessary internal state. |
| pi-auto-rename | rename_session | Rename receipt with previous/name; no opaque prose-only success. |
| pi-xlatch-session | xlatch_later | Action-discriminated parked-item lists, bounded read content, removal receipt. Existing details=null cannot supply the contract. Preserve non-destructive read semantics. |
| pi-herdr-tools | subagent | Action-discriminated spawn/list/info receipts, stable child identifiers, bounded summaries; do not pretend spawning means completion. |
| pi-sudo | sudo_exec, remote_sudo_exec | Execution receipt with exit status, bounded stdout/stderr, timeout/termination/truncation indicators; preserve authentication UI and remote authorization. Alias must return the same contract. |
| pi-kyz | wrapped bash plus result-redaction hook | Preserve host bash schema and structured values; scrub BOTH text and object values. No secrets in structured fields, nested metadata, error messages or persisted results. |
| pi-selection | Selection | Already declares outputSchema=Type.Unknown and structuredContent. Replace permissive success schema with operation-specific contracts in coordination with selection owner, preserving revision/CAS checks. |
| pi-read-file-guard / pi-read-image-guard | tool_result transforms | No new tool needed. Test transformations for compatible bounded structured data or intentional removal when the original no longer matches. |
| Other maintained extensions | commands/events/UI only at this base | No output schema to retrofit; re-audit if tools are added. |

Inventory evidence: registrations in each `pi-*/index.ts`; archived registrations deliberately excluded. This audit is not proof of runtime codemode compatibility.

## Shared conventions

- Define explicit TypeBox output schemas next to each tool's domain contract. Avoid Type.Unknown as the completed schema and avoid serializing arbitrary details.
- Use action/operation discriminants where a tool has multiple shapes. Preserve domain vocabulary rather than imposing one large generic envelope.
- Share failure vocabulary: stable code, safe message, optional retryable indication. Decide exact error schema with host tests: verify native Pi behavior for isError and codemode rejection before freezing an envelope. Never advertise an error object as a successful result.
- Successful results always supply JSON-safe structuredContent conforming to outputSchema. No undefined, Dates, Maps, BigInts or circular objects; timestamps are strings, absent optional fields omitted.
- Human content and objects derive from the same domain result. Renderers may use details but scripts never need details or JSON.parse(content).
- Bound arrays and text by documented limits. Include explicit truncated/omitted indicators and continuation/evidence anchors when supported. A structured result must not bypass existing context or privacy limits.
- No automatic change to tool exposure, codemode settings, credentials or model selection. No new network access merely from adding schemas.
- Preserve cancellation, scope and session generation guards. Parallel scripts are not permission to run unbounded concurrent mutations.

## Rollout and ownership

1. Establish shared contract fixtures and exact official Pi 1 runtime probe for success/error/abort and result-hook behavior. Publish schema conventions for Oqto review.
2. History first: reconcile newer product-main shortcut/SQLite/fallback changes; implement separately cherry-pickable structured outputs. Keep responsiveness worker/process work independently testable. Codemode itself does not isolate synchronous host execution.
3. Low-risk surfaces: rename, introspection, Todo, memory, xlatch. Add per-action schema tests and ordinary rendering regression tests.
4. Privileged/stateful surfaces: subagent and sudo with identity, cancellation, authentication and truthful partial-effect receipts.
5. Security/interception surfaces: kyz bash wrapper and read guards. Verify no secret leaks through structured results and no stale object survives transformed/redacted text.
6. Selection schema refinement with its owner; final maintained-set manifest audit and integration proof. Collection version/lockfiles/pin changes are coordinated, not independently merged or published.

## Verification gates

- Every success action validates against its output schema, including empty results and optional/null cases. Malformed CLI JSON fails safely.
- Ordinary text/TUI rendering remains readable and agrees with structured evidence, status and identifiers.
- A genuine exact Pi 1 codemode script calls tools and receives objects, not formatted text. History script runs parallel searches, deduplicates by session/message anchors, reads selected context and emits only bounded evidence.
- Test failure, denied authorization, timeout, abort, worker exit, and result-hook transformations. Requests settle once; no stale/cross-session results or uncaught promises.
- Security fixtures put fake secret markers in stdout, stderr, nested JSON and error fields and assert absence from content, structuredContent and persisted results.
- Run schema coverage against the canonical maintained-tool manifest: every registration is classified as implemented, host-schema-preserving wrapper, or explicitly reviewed exception.
- Run exact Pi 1 typecheck, extension tests and host integration probes. Unit mocks alone cannot establish codemode behavior. Live TUI and Oqto Web acceptance remain separate gates.

## Separate history quality/responsiveness work

Measure representative cold/warm workloads, p95/p99 event-loop delay and physical fullscreen input-to-render latency with an agreed budget. Diagnose before claiming the freeze fixed. Isolate SQLite/parsing/scans, bound queues, cancel startup timers and safely handle shutdown/reload/dispose. Evaluate private local retrieval fixtures for exact identifiers, paraphrases, decisions and branch/compaction evidence: rank/recall, latency and calls-to-usable-evidence. Publish aggregate metrics only.

Optional semantic retrieval and native models.classify Jev reranking require measured gains versus exact/FTS baseline. Hosted private-history inference requires explicit opt-in. Classifier failure falls back locally. These are not prerequisites for structured outputs or the freeze fix.

## Stop conditions

If exact Pi 1 output/error/redaction behavior differs from assumptions, retain existing tools and record the failing host probe before changing the contract. If branch ownership or shared collection pins conflict, stop at independently reviewable patches and ask Oqto's integration owner. Do not mutate live installs, user configuration or native history files. Planning completion is not implementation completion.
